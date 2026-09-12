/* Tests de la surveillance (netlify/functions/surveillance.js). `node --test`.

   Ce que ces tests protegent : une alerte qui ne part pas, et une alerte qui
   part toutes les quinze minutes. La premiere laisse la panne invisible, la
   seconde finit dans un filtre, ce qui revient au meme. Les deux se verifient
   ici sans reseau ni e-mail reel : `fetch`, le magasin et l'envoi sont
   remplaces. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// --- Magasin en memoire, envoi d'e-mail capture ---------------------------
let memoire = {};
let envoyes = [];
const stubBlobs = {
  getStore() {
    return {
      async get(k) { return memoire[k] !== undefined ? memoire[k] : null; },
      async setJSON(k, v) { memoire[k] = v; return { modified: true }; }
    };
  }
};
const stubMail = {
  async envoi(m) { envoyes.push(m); return { envoye: true }; },
  configuree() { return true; }
};

const vraiCharger = Module._load;
Module._load = function (demande, parent, isMain) {
  if (demande === "@netlify/blobs") return stubBlobs;
  if (demande.endsWith("lib/mail.js") || demande.endsWith("lib/mail")) return stubMail;
  return vraiCharger.apply(this, arguments);
};

// --- Reponses HTTP simulees ------------------------------------------------
let reponses = {};
const vraiFetch = globalThis.fetch;
globalThis.fetch = async function (url) {
  const u = String(url);
  const cle = u.includes("/sante") ? "relais" : "sessions";
  const r = reponses[cle];
  if (!r) throw new Error("injoignable");
  if (r.throw) throw new Error(r.throw);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, async json() { return r.corps; } };
};

process.env.MAIL_ALERTE = "alerte@example.org";
const S = require("../../netlify/functions/surveillance.js");

function partirDeZero() { memoire = {}; envoyes = []; }
function toutVaBien() {
  reponses = {
    sessions: { status: 200, corps: { ecritureConditionnelle: "oui", relectureImmediate: "oui", details: [], ok: true } },
    relais: { status: 200, corps: { ok: true, v: 4, caps: [], salons: 0, clients: 0 } }
  };
}

test("tout va bien : aucun e-mail", async () => {
  partirDeZero(); toutVaBien();
  await S.handler();
  assert.equal(envoyes.length, 0);
  assert.equal(memoire["surveillance:etat"].panne, false);
});

test("le relais est tombe : une alerte, qui dit quoi faire", async () => {
  partirDeZero(); toutVaBien();
  delete reponses.relais;
  await S.handler();
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0].text, /relais est injoignable/i);
  assert.equal(memoire["surveillance:etat"].panne, true);
});

test("relais en retard : dit explicitement de le redeployer", async () => {
  partirDeZero(); toutVaBien();
  reponses.relais = { status: 404 };
  await S.handler();
  assert.match(envoyes[0].text, /version anterieure a celle du depot/i);
  assert.match(envoyes[0].text, /Redeployer/i);

  partirDeZero(); toutVaBien();
  reponses.relais = { status: 200, corps: { ok: true, v: 2 } };
  await S.handler();
  assert.match(envoyes[0].text, /version 2, le site en attend au moins 4/);
});

test("ecriture conditionnelle perdue : c'est une alerte, meme si tout repond 200", async () => {
  partirDeZero(); toutVaBien();
  reponses.sessions = { status: 200, corps: { ecritureConditionnelle: "non", details: ["etag ignore"], ok: false } };
  await S.handler();
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0].text, /ecriture conditionnelle/i);
});

test("la meme panne ne realerte pas toutes les quinze minutes", async () => {
  partirDeZero(); toutVaBien();
  delete reponses.relais;
  await S.handler();
  await S.handler();
  await S.handler();
  assert.equal(envoyes.length, 1, "une alerte qui se repete finit filtree : elle ne doit partir qu'une fois");
});

test("une panne DIFFERENTE realerte, elle", async () => {
  partirDeZero(); toutVaBien();
  delete reponses.relais;
  await S.handler();
  reponses.relais = { status: 200, corps: { ok: true, v: 4 } };
  reponses.sessions = { status: 500 };
  await S.handler();
  assert.equal(envoyes.length, 2);
  assert.match(envoyes[1].text, /repond 500/);
});

test("retablissement : un e-mail, puis le silence", async () => {
  partirDeZero(); toutVaBien();
  delete reponses.relais;
  await S.handler();
  toutVaBien();
  await S.handler();
  await S.handler();
  assert.equal(envoyes.length, 2);
  assert.match(envoyes[1].subject, /revenu a la normale/i);
  assert.equal(memoire["surveillance:etat"].panne, false);
});

test("l'alerte contourne le plafond d'envoi (elle doit passer meme un jour charge)", async () => {
  partirDeZero(); toutVaBien();
  delete reponses.relais;
  await S.handler();
  assert.equal(envoyes[0]._interne, true);
});

test("la version de relais exigee reste alignee sur celle du client", async () => {
  const fs = require("node:fs");
  const js = fs.readFileSync(new URL("../../site/en-ligne/session/session.js", import.meta.url), "utf8");
  const m = js.match(/RELAIS_MINI\s*=\s*(\d+)/);
  assert.ok(m, "RELAIS_MINI introuvable dans session.js");
  const sv = fs.readFileSync(new URL("../../netlify/functions/surveillance.js", import.meta.url), "utf8");
  const m2 = sv.match(/RELAIS_MINI\s*\|\|\s*(\d+)/);
  assert.ok(m2, "RELAIS_MINI introuvable dans surveillance.js");
  assert.equal(m2[1], m[1], "la surveillance doit exiger la meme version que le client, sinon elle se tait sur un relais deja trop vieux");
});

test("le relais annonce bien un point de sante", async () => {
  const fs = require("node:fs");
  const r = fs.readFileSync(new URL("../../infra/curseurs/server.js", import.meta.url), "utf8");
  assert.match(r, /\/sante/, "sans point de sante HTTP, la surveillance ne peut rien verifier");
});

// Remise en place APRES les tests : la faire a la fin du module la ferait
// s'executer avant eux (node:test collecte d'abord, execute ensuite), et les
// controles partiraient alors vraiment sur le reseau.
import { after } from "node:test";
after(() => { globalThis.fetch = vraiFetch; });
