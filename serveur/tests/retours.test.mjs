/* Règles pures des retours d'atelier et des témoignages. `node --test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../src/retours.js");

const T = 1700000000000;

test("un retour entièrement vide est refusé", () => {
  assert.ok(R.validerRetour({}, T).erreur);
  assert.ok(R.validerRetour({ marquant: "  ", autre: "ok" }, T).erreur);
});

test("un seul champ rempli suffit", () => {
  const r = R.validerRetour({ creuser: "Les solutions du lot 5." }, T).retour;
  assert.equal(r.genre, "atelier");
  assert.equal(r.creuser, "Les solutions du lot 5.");
  assert.equal(r.traite, false);
  assert.equal(r.date, T);
});

test("les listes fermées n'acceptent que leurs valeurs", () => {
  const r = R.validerRetour({ autre: "un retour", role: "pirate", format: "fax", duree: "infinie" }, T).retour;
  assert.equal(r.role, "participant");   // valeur de repli
  assert.equal(r.format, "");
  assert.equal(r.duree, "");
  const ok = R.validerRetour({ autre: "un retour", role: "animateur", format: "enligne", duree: "juste" }, T).retour;
  assert.equal(ok.role, "animateur");
  assert.equal(ok.duree, "juste");
});

test("un témoignage exige un texte, un prénom et l'accord", () => {
  assert.ok(R.validerTemoignage({ texte: "court", prenom: "Léa", accord: true }, T).erreur);
  assert.ok(R.validerTemoignage({ texte: "Un atelier vraiment marquant, à conseiller.", accord: true }, T).erreur);
  // Sans accord on ne publie pas, donc on ne stocke pas non plus.
  assert.ok(R.validerTemoignage({ texte: "Un atelier vraiment marquant, à conseiller.", prenom: "Léa" }, T).erreur);
  const t = R.validerTemoignage({
    texte: "Un atelier vraiment marquant, à conseiller à tout le monde.",
    prenom: "Léa", precision: "Lyon", accord: true
  }, T).temoignage;
  assert.equal(t.genre, "temoignage");
  assert.equal(t.publie, false, "un témoignage ne se publie jamais tout seul");
});

test("une adresse invalide est effacée, l'envoi est gardé", () => {
  assert.equal(R.validerRetour({ autre: "un retour", mail: "pas une adresse" }, T).retour.mail, "");
  assert.equal(R.validerRetour({ autre: "un retour", mail: "lea@ex.org" }, T).retour.mail, "lea@ex.org");
});

test("les champs trop longs sont tronqués, jamais refusés", () => {
  const r = R.validerRetour({ marquant: "a".repeat(5000) }, T).retour;
  assert.equal(r.marquant.length, R.MAX.texte);
});

test("le champ piège repère un robot", () => {
  assert.equal(R.estUnRobot({ site: "http://spam" }), true);
  assert.equal(R.estUnRobot({ site: "" }), false);
  assert.equal(R.estUnRobot({}), false);
});

test("la clé porte le genre, ce qui permet de lister l'un sans l'autre", () => {
  const r = R.validerRetour({ autre: "un retour" }, T).retour;
  assert.match(R.cle(r, "ab12"), /^atelier:ab12$/);
  const t = R.validerTemoignage({ texte: "Un atelier vraiment marquant, à conseiller.", prenom: "L", accord: true }, T).temoignage;
  assert.match(R.cle(t, "ab12"), /^temoignage:ab12$/);
});
