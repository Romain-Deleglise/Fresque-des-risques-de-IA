// Tests du registre durable des contacts (netlify/functions/lib/contacts.js).
// Pur : on simule le store Netlify Blobs en memoire (getWithMetadata / setJSON
// avec onlyIfMatch et onlyIfNew, delete, list), sans I/O reseau.
// Lancement : node --test serveur/tests/contacts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../../netlify/functions/lib/contacts.js");

// Faux store fidele au contrat @netlify/blobs utilise par contacts.js.
function storeMemoire(opts = {}) {
  const m = new Map();
  let ratesCle = opts.ratesCle || null; // simule un conflit de concurrence une fois
  return {
    _m: m,
    async getWithMetadata(k) {
      if (!m.has(k)) return null;
      const e = m.get(k);
      return { data: JSON.parse(e.v), etag: e.etag };
    },
    async setJSON(k, v, o = {}) {
      const cur = m.get(k);
      if (o.onlyIfNew && cur) return { modified: false };
      if (o.onlyIfMatch) {
        if (ratesCle === k) { ratesCle = null; return { modified: false }; } // 1 conflit puis OK
        if (!cur || cur.etag !== o.onlyIfMatch) return { modified: false };
      }
      m.set(k, { v: JSON.stringify(v), etag: "e" + Math.random().toString(36).slice(2) });
      return { modified: true };
    },
    async delete(k) { m.delete(k); },
    async list({ prefix }) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

test("enregistre animateur puis participant : deux contacts distincts", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "animateur", code: "AB12", quandMs: 1000, mode: "enligne" });
  await C.enregistrer(st, { mail: "bo@x.fr", prenom: "Bo", role: "participant", code: "AB12", quandMs: 1000, mode: "enligne" });
  const l = await C.lister(st);
  assert.equal(l.length, 2);
  const ana = l.find((c) => c.mail === "ana@x.fr");
  assert.equal(ana.animateur, true);
  assert.equal(ana.participant, false);
  assert.equal(ana.nbAnimations, 1);
});

test("idempotence : meme (code, role) n'est compte qu'une fois", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "animateur", code: "AB12", quandMs: 1, mode: "enligne" });
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "animateur", code: "AB12", quandMs: 2, mode: "enligne" });
  const ana = (await C.lister(st))[0];
  assert.equal(ana.nbAnimations, 1);
  assert.equal(ana.ateliers.length, 1);
});

test("double role : anime un atelier et participe a un autre", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "animateur", code: "AB12", quandMs: 1, mode: "enligne" });
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "CD34", quandMs: 2, mode: "physique" });
  const ana = (await C.lister(st))[0];
  assert.equal(ana.animateur, true);
  assert.equal(ana.participant, true);
  assert.equal(ana.nbAnimations, 1);
  assert.equal(ana.nbParticipations, 1);
  assert.equal(ana.ateliers.length, 2);
});

test("adresse invalide : rien n'est enregistre", async () => {
  const st = storeMemoire();
  assert.equal(await C.enregistrer(st, { mail: "pasunmail", prenom: "X", role: "participant", code: "AB12" }), false);
  assert.equal(await C.enregistrer(st, { mail: "", role: "participant", code: "AB12" }), false);
  assert.equal((await C.lister(st)).length, 0);
});

test("normalisation : casse et espaces donnent le meme contact", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "  Ana@X.FR ", prenom: "Ana", role: "participant", code: "AB12", quandMs: 1 });
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "CD34", quandMs: 2 });
  const l = await C.lister(st);
  assert.equal(l.length, 1);
  assert.equal(l[0].mail, "ana@x.fr");
  assert.equal(l[0].nbParticipations, 2);
});

test("desinscription : conserve mais marque desinscrit", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "AB12", quandMs: 1 });
  assert.equal(await C.desinscrire(st, "ana@x.fr"), true);
  const ana = (await C.lister(st))[0];
  assert.equal(ana.desinscrit, true);
  assert.equal(await C.desinscrire(st, "inconnu@x.fr"), false);
});

test("suppression : le contact disparait", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "AB12", quandMs: 1 });
  assert.equal(await C.supprimer(st, "ana@x.fr"), true);
  assert.equal((await C.lister(st)).length, 0);
});

test("liste triee par dernier contact decroissant", async () => {
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "vieux@x.fr", prenom: "V", role: "participant", code: "AB12", quandMs: 1 });
  await new Promise((r) => setTimeout(r, 5));
  await C.enregistrer(st, { mail: "recent@x.fr", prenom: "R", role: "participant", code: "CD34", quandMs: 2 });
  const l = await C.lister(st);
  assert.equal(l[0].mail, "recent@x.fr");
});

test("concurrence : un conflit onlyIfMatch est rejoue sans double comptage", async () => {
  // Premier enregistrement cree la cle. Le second (meme contact, autre atelier)
  // subit un conflit simule au 1er essai, puis reussit au rejeu.
  const st = storeMemoire();
  await C.enregistrer(st, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "AB12", quandMs: 1 });
  st._ratesProchain = true;
  // Reactive le conflit cible sur la cle du contact.
  const cle = C.cle("ana@x.fr");
  const st2 = storeMemoire({ ratesCle: cle });
  // Recopie l'etat courant dans st2 pour partir du meme point.
  st2._m.set(cle, st._m.get(cle));
  const ok = await C.enregistrer(st2, { mail: "ana@x.fr", prenom: "Ana", role: "participant", code: "CD34", quandMs: 2 });
  assert.equal(ok, true);
  const ana = (await C.lister(st2))[0];
  assert.equal(ana.nbParticipations, 2);
  assert.equal(ana.ateliers.length, 2);
});
