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

test("visio : aucune / auto / perso", () => {
  const base = { mode: "enligne", animateurPrenom: "Léa", animateurMail: "lea@ex.org", date: dateFutur, heure: "18:30" };
  assert.equal(A.valider(base).atelier.visio, undefined, "aucune par défaut");
  const auto = A.valider(Object.assign({}, base, { visioMode: "auto" })).atelier;
  assert.equal(auto.visioAuto, true, "auto : drapeau posé (l'URL est générée côté fonction)");
  assert.equal(auto.visio, undefined);
  assert.ok(A.valider(Object.assign({}, base, { visioMode: "perso", visioUrl: "pas une url" })).erreur, "perso + url invalide");
  assert.ok(A.valider(Object.assign({}, base, { visioMode: "perso" })).erreur, "perso sans lien");
  const perso = A.valider(Object.assign({}, base, { visioMode: "perso", visioUrl: "https://meet.google.com/abc-defg-hij" })).atelier;
  assert.equal(perso.visio, "https://meet.google.com/abc-defg-hij");
  const retro = A.valider(Object.assign({}, base, { visioUrl: "https://meet.jit.si/x" })).atelier;
  assert.equal(retro.visio, "https://meet.jit.si/x", "rétro-compat : lien sans mode = perso");
});

test("inscription refusée passé 30 min après le début", () => {
  const futurProche = { code: "ABCDEF", mode: "enligne", visibilite: "public", quandMs: Date.now() + 3600e3, maxParticipants: 8, participants: [] };
  assert.ok(A.validerInscription(futurProche, { prenom: "Jo", mail: "jo@ex.org" }).participant, "avant le début : ok");
  const commence20 = Object.assign({}, futurProche, { quandMs: Date.now() - 20 * 60e3 });
  assert.ok(A.validerInscription(commence20, { prenom: "Jo", mail: "jo@ex.org" }).participant, "20 min après : encore ouvert");
  const commence40 = Object.assign({}, futurProche, { quandMs: Date.now() - 40 * 60e3 });
  assert.ok(A.validerInscription(commence40, { prenom: "Jo", mail: "jo@ex.org" }).erreur, "40 min après : fermé");
  assert.equal(A.inscriptionOuverte(commence40), false);
});

test("calendrier : visible 7 j après, mais inscription fermée (flag ouvert)", () => {
  const base = { code: "ABCDEF", mode: "enligne", visibilite: "public", maxParticipants: 8, participants: [] };
  const commence40 = Object.assign({}, base, { quandMs: Date.now() - 40 * 60e3 });
  assert.equal(A.visibleCalendrier(commence40), true, "40 min après : encore au calendrier");
  assert.equal(A.vuePublique(commence40).ouvert, false, "mais inscription fermée");
  const vieux = Object.assign({}, base, { quandMs: Date.now() - 8 * 864e5 });
  assert.equal(A.visibleCalendrier(vieux), false, "8 jours après : retiré du calendrier");
  const futur = Object.assign({}, base, { quandMs: Date.now() + 864e5 });
  assert.equal(A.vuePublique(futur).ouvert, true, "à venir : ouvert");
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

test("reprogrammation : auth requise, nouvelle date future", () => {
  const a = { code: "ABCDEF", date: dateFutur, heure: "18:30", quandMs: Date.now() + 7 * 864e5, animateur: { prenom: "Léa", mail: "lea@ex.org" }, annulToken: "TOK" };
  const demain = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  assert.ok(A.validerReprogrammation(a, { token: "mauvais", date: demain, heure: "10:00" }).erreur, "sans auth : refusé");
  assert.ok(A.validerReprogrammation(a, { token: "TOK", date: "2000-01-01", heure: "10:00" }).erreur, "date passée : refusée");
  assert.ok(A.validerReprogrammation(a, { mail: "lea@ex.org", date: dateFutur, heure: "18:30" }).erreur, "date inchangée : refusée");
  const ok = A.validerReprogrammation(a, { token: "TOK", date: demain, heure: "10:00" });
  assert.equal(ok.date, demain); assert.equal(ok.heure, "10:00"); assert.ok(isFinite(ok.quandMs));
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
