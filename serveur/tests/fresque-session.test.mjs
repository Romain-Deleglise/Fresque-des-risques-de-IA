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
  magasin = { session: c.session, etag: 1, verdict: true, ecritApres: 0 };
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
