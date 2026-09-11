/* Tests de la fonction de session (netlify/functions/fresque.js) avec un
   magasin Blobs en memoire. `node --test`.

   Ce que ces tests protegent : une entree dans la session ne doit JAMAIS creer
   deux places. Une version precedente de `muter()` relisait l'etat pour verifier
   que sa version avait ete retenue et rejouait la mutation sinon ; comme la
   version avance aussi quand quelqu'un ecrit APRES nous (un battement de
   presence suffit), elle rejouait des mutations deja appliquees et fabriquait
   un participant fantome. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../src/regles.js");

// --- Magasin Blobs en memoire, parametrable -------------------------------
// Ce magasin imite une contrainte REELLE de la plateforme : dans une fonction au
// format « lambda » (exports.handler + connectLambda), @netlify/blobs ne recoit
// que `edgeURL`, jamais `uncachedEdgeURL`. Toute requete demandant
// `consistency: "strong"` y leve donc BlobsConsistencyError, LECTURES COMME
// ECRITURES (l'option posee sur le magasin vaut pour chaque appel). Une version
// livree a demande la coherence forte sur le magasin : chaque operation partait
// en erreur et le site repondait « Erreur du service de sessions » des la
// creation. La garde ci-dessous fait echouer tous les tests si on recommence.
class ErreurCoherence extends Error {
  constructor() { super("Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property"); this.name = "BlobsConsistencyError"; }
}
let magasin = { session: null, etag: 0, verdict: true, ecritApres: 0 };
const stub = {
  connectLambda() {},
  getStore(entree) {
    const opt = typeof entree === "string" ? { name: entree } : entree;
    const name = opt.name;
    const sessions = name === "fresque-sessions";
    const garde = (o) => {
      const c = (o && o.consistency) || opt.consistency;
      if (c === "strong") throw new ErreurCoherence();
    };
    return {
      async get(k, o) { garde(o); return null; },
      async getWithMetadata(k, o) {
        garde(o);
        if (!sessions || !magasin.session) return null;
        // Lecture EVENTUELLEMENT COHERENTE : tant que `perimeFois` n'est pas
        // epuise, on rend la vieille valeur, comme le fait le magasin reel.
        if (magasin.perime && magasin.perimeFois !== 0) {
          if (magasin.perimeFois > 0) magasin.perimeFois--;
          return { data: JSON.parse(JSON.stringify(magasin.perime.session)), etag: String(magasin.perime.etag) };
        }
        return { data: JSON.parse(JSON.stringify(magasin.session)), etag: String(magasin.etag) };
      },
      async setJSON(k, v, opts) {
        garde(opts);
        if (!sessions) return { modified: true };
        if (opts && opts.onlyIfMatch !== undefined && opts.onlyIfMatch !== String(magasin.etag)) {
          return magasin.verdict ? { modified: false } : undefined;
        }
        magasin.session = JSON.parse(JSON.stringify(v));
        magasin.etag++;
        // Ecriture concurrente juste apres la notre (autre onglet, presence) :
        // la version avance alors que notre ecriture est bien en place.
        if (magasin.ecritApres > 0) { magasin.ecritApres--; magasin.session.version += 1; magasin.etag++; }
        return magasin.verdict ? { modified: true } : undefined;
      },
      async delete(k, o) { garde(o); magasin.session = null; },
      async list(o) { garde(o); return { blobs: [] }; }
    };
  }
};
const vrai = Module._load;
Module._load = function (r) { return r === "@netlify/blobs" ? stub : vrai.apply(this, arguments); };
const fresque = require("../../netlify/functions/fresque.js");
const post = async (corps) => JSON.parse((await fresque.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(corps) })).body);

function sessionNeuve() {
  const c = R.creer("Romain", "ABCDEF");
  c.session.jetons["jAnim"] = { role: "animateur", id: c.idAnim };
  magasin = { session: c.session, etag: 1, verdict: true, ecritApres: 0, perime: null, perimeFois: -1 };
}
const participants = () => (magasin.session.participants || []).map((p) => p.prenom);
const jetonsPart = () => Object.values(magasin.session.jetons).filter((j) => j.role === "participant").length;

test("une entree = une seule place", async () => {
  sessionNeuve();
  const r = await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2" });
  assert.ok(r.jeton, "un jeton est renvoye");
  assert.deepEqual(participants(), ["Rom2"]);
  assert.equal(jetonsPart(), 1);
});

test("une entree reste unique meme si quelqu'un ecrit juste apres", async () => {
  sessionNeuve();
  magasin.ecritApres = 1;                 // battement de presence concurrent
  await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2" });
  assert.deepEqual(participants(), ["Rom2"], "pas de participant fantome");
  assert.equal(jetonsPart(), 1);
});

test("une entree reste unique meme sans verdict du magasin", async () => {
  sessionNeuve();
  magasin.verdict = false;                // setJSON ne renvoie rien
  magasin.ecritApres = 1;
  await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2" });
  assert.deepEqual(participants(), ["Rom2"], "pas de participant fantome");
  assert.equal(jetonsPart(), 1);
});

test("revenir avec son jeton reprend la meme place", async () => {
  sessionNeuve();
  const r1 = await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2" });
  const r2 = await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2", jeton: r1.jeton });
  assert.equal(r2.jeton, r1.jeton, "meme jeton");
  assert.deepEqual(participants(), ["Rom2"], "toujours une seule place");
});

test("une action refusee par l'etag est rejouee, pas dupliquee", async () => {
  sessionNeuve();
  const r1 = await post({ op: "rejoindre", code: "ABCDEF", prenom: "Rom2" });
  // On force un conflit d'etag sur la premiere tentative d'une pose de carte.
  await post({ op: "agir", code: "ABCDEF", jeton: "jAnim", intention: { op: "poolAjouter", n: 5 } });
  const av = magasin.session.tableau.cartes.length;
  await post({ op: "agir", code: "ABCDEF", jeton: r1.jeton, intention: { op: "poserCarte", n: 5, pos: { x: 500, y: 500 } } });
  assert.equal(magasin.session.tableau.cartes.length, av + 1, "une seule carte posee");
  assert.equal(magasin.session.pool.indexOf(5), -1, "la carte a quitte la reserve");
});

test("ouvrir un atelier reserve repond bien (pas de coherence forte demandee)", async () => {
  magasin = { session: null, etag: 0, verdict: true, ecritApres: 0 };
  const r = await post({ op: "creer", prenom: "Romain", code: "X6C38E" });
  assert.equal(r.error, undefined, "aucune erreur de service");
  assert.equal(r.code, "X6C38E", "la session s'ouvre avec le code de l'atelier");
  assert.equal(r.role, "animateur");
  // Et la suite du parcours : un participant entre, puis l'animateur agit.
  const p = await post({ op: "rejoindre", code: "X6C38E", prenom: "Ana" });
  assert.ok(p.jeton, "le participant entre");
  const a = await post({ op: "agir", code: "X6C38E", jeton: r.jeton, intention: { op: "poolAjouter", n: 5 } });
  assert.equal(a.error, undefined, "aucune erreur de service sur une action");
  assert.deepEqual(magasin.session.pool, [5]);
});

/* --- Le sondage ne doit JAMAIS reecrire le document de session --------------
   C'etait la cause des pires symptomes du tableau : le battement de presence
   lisait le document (lecture eventuellement coherente, donc potentiellement
   perimee de plusieurs secondes), y posait son horodatage et le reecrivait
   ENTIER, sans changer la version. Il remettait donc le tableau dans son etat
   d'avant, en silence : la carte qu'on venait de poser repartait dans la
   reserve, une fleche disparaissait, une carte « bougeait toute seule ».
   Le magasin ci-dessous imite cette lecture perimee. */
test("un sondage ne fait jamais reculer le tableau", async () => {
  sessionNeuve();
  // Quelqu'un pose une carte : le document courant la contient.
  magasin.session.pool = [5];
  magasin.session.version = 7;
  const frais = JSON.parse(JSON.stringify(magasin.session));
  frais.tableau.cartes.push({ n: 5, x: 500, y: 500 });
  frais.pool = [];
  frais.version = 8;
  magasin.session = frais; magasin.etag = 9;
  // ... mais la lecture, elle, rend encore l'etat d'avant.
  magasin.perime = { session: JSON.parse(JSON.stringify(magasin.session)), etag: magasin.etag };
  magasin.perime.session.tableau.cartes = [];
  magasin.perime.session.pool = [5];
  magasin.perime.session.version = 7;

  const r = await post({ op: "etat", code: "ABCDEF", jeton: "jAnim", version: 8 });
  assert.equal(magasin.session.version, 8, "le document n'a pas ete reecrit");
  assert.equal(magasin.session.tableau.cartes.length, 1, "la carte posee est toujours la");
  assert.deepEqual(magasin.session.pool, [], "elle n'est pas revenue dans la reserve");
  // Et on ne sert pas non plus la valeur perimee au client, qui reculerait.
  assert.ok(!r.etat || r.etat.version >= 8, "aucun etat plus vieux que celui du client n'est servi");
});

test("une action n'est jamais appliquee sur une lecture prouvee perimee", async () => {
  sessionNeuve();
  magasin.session.version = 12;
  magasin.session.pool = [5];
  // Lecture perimee : version 11, sans la carte 5 dans la reserve.
  magasin.perime = { session: JSON.parse(JSON.stringify(magasin.session)), etag: magasin.etag };
  magasin.perime.session.version = 11;
  magasin.perime.session.pool = [];
  magasin.perimeFois = 2;   // les deux premieres lectures sont perimees
  const r = await post({ op: "agir", code: "ABCDEF", jeton: "jAnim", version: 12,
    intention: { op: "poserCarte", n: 5, pos: { x: 400, y: 400 } } });
  assert.equal(r.refus, undefined, "l'action finit par passer");
  assert.equal(magasin.session.tableau.cartes.length, 1, "la carte est bien posee");
  assert.ok(magasin.session.version > 12, "la version a avance");
});
