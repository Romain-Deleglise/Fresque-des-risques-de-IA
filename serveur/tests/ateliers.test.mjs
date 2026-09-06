/* Tests des regles pures de programmation d'ateliers. `node --test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../src/ateliers.js");

const futur = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const dateFutur = futur.toISOString().slice(0, 10);

test("programmation en ligne valide, plafonnee a 8", () => {
  const r = A.valider({ mode: "enligne", animateurPrenom: "Léa", animateurMail: "lea@ex.org", date: dateFutur, heure: "18:30", maxParticipants: 20 });
  assert.ok(r.atelier);
  assert.equal(r.atelier.mode, "enligne");
  assert.equal(r.atelier.maxParticipants, 8);
  assert.equal(r.atelier.visibilite, "public");
});

test("physique exige un lieu, plafond 16", () => {
  const sansLieu = A.valider({ mode: "physique", animateurPrenom: "Sam", animateurMail: "sam@ex.org", date: dateFutur, heure: "14:00" });
  assert.ok(sansLieu.erreur);
  const ok = A.valider({ mode: "physique", animateurPrenom: "Sam", animateurMail: "sam@ex.org", date: dateFutur, heure: "14:00", lieu: "MJC", maxParticipants: 30 });
  assert.equal(ok.atelier.maxParticipants, 16);
});

test("mail et date invalides refuses", () => {
  assert.ok(A.valider({ mode: "enligne", animateurPrenom: "X", animateurMail: "pasunmail", date: dateFutur, heure: "10:00" }).erreur);
  assert.ok(A.valider({ mode: "enligne", animateurPrenom: "X", animateurMail: "x@ex.org", date: "2000-01-01", heure: "10:00" }).erreur);
});

test("inscription : capacite, doublon, prive", () => {
  const a = { code: "ABCDEF", mode: "enligne", visibilite: "public", quandMs: Date.now() + 3600e3, maxParticipants: 2, participants: [] };
  let r = A.validerInscription(a, { prenom: "Jo", mail: "jo@ex.org" });
  assert.ok(r.participant); a.participants.push(r.participant);
  assert.ok(A.validerInscription(a, { prenom: "Jo", mail: "JO@ex.org" }).erreur, "doublon insensible a la casse");
  a.participants.push({ prenom: "K", mail: "k@ex.org", le: 0 });
  assert.ok(A.validerInscription(a, { prenom: "Z", mail: "z@ex.org" }).erreur, "complet");
  a.visibilite = "prive";
  assert.ok(A.validerInscription(a, { prenom: "P", mail: "p@ex.org" }).erreur, "prive");
});

test("vuePublique n'expose aucun e-mail", () => {
  const a = { code: "ABCDEF", mode: "physique", visibilite: "public", quandMs: Date.now() + 3600e3, maxParticipants: 8, lieu: "MJC", adresse: "1 rue X", animateur: { prenom: "Léa", mail: "lea@ex.org" }, participants: [{ prenom: "Jo", mail: "jo@ex.org", le: 0 }] };
  const v = A.vuePublique(a);
  const s = JSON.stringify(v);
  assert.ok(!s.includes("@"), "aucun e-mail dans la vue publique");
  assert.equal(v.inscrits, 1);
  assert.equal(v.lieu, "MJC");
});

test("annulation : jeton secret ou e-mail animateur exigé", () => {
  const a = { code: "ABCDEF", animateur: { prenom: "Léa", mail: "lea@ex.org" }, annulToken: "SECRET-TOKEN-123" };
  assert.ok(A.annulationAutorisee(a, { token: "SECRET-TOKEN-123" }).ok, "jeton correct");
  assert.ok(A.annulationAutorisee(a, { mail: "LEA@ex.org" }).ok, "e-mail animateur (insensible casse)");
  assert.ok(A.annulationAutorisee(a, { token: "mauvais" }).erreur, "jeton faux refusé");
  assert.ok(A.annulationAutorisee(a, { mail: "participant@ex.org" }).erreur, "e-mail tiers refusé");
  assert.ok(A.annulationAutorisee(a, {}).erreur, "sans preuve refusé");
  assert.ok(A.annulationAutorisee(null, { token: "x" }).erreur, "atelier inconnu");
});

test("désinscription participant : par jeton personnel", () => {
  const a = { code: "ABCDEF", participants: [
    { prenom: "Jo", mail: "jo@ex.org", token: "TOK-JO" },
    { prenom: "Ka", mail: "ka@ex.org", token: "TOK-KA" }
  ] };
  const r = A.retraitParticipant(a, { token: "TOK-JO" });
  assert.ok(!r.erreur, "jeton valide accepté");
  assert.equal(r.participants.length, 1);
  assert.equal(r.participants[0].token, "TOK-KA", "seul le bon participant est retiré");
  assert.equal(r.participant.prenom, "Jo");
  assert.ok(A.retraitParticipant(a, { token: "inconnu" }).erreur, "jeton inconnu refusé");
  assert.ok(A.retraitParticipant(a, {}).erreur, "sans jeton refusé");
  assert.ok(A.retraitParticipant(null, { token: "x" }).erreur, "atelier inconnu");
});
