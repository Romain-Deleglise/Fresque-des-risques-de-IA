/* BROUILLONS DE CARTES : ce qu'ils gardent, et ce qu'ils publient.

   L'enjeu est la PERTE DE TEXTE. Un brouillon qui enregistrerait les trois
   champs a chaque passage ecraserait le verso d'une carte dont on n'a corrige
   que le titre, en silence. Et une publication qui recopierait mal le fichier
   emporterait les images ou l'ordre des cartes avec elle. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../src/brouillons.js");

const NOW = 1700000000000;
const carte = (o = {}) => ({ n: 3, lot: 1, intro: false, titre: "Amélioration des capacités",
  verso: ["Premier paragraphe.", "Second paragraphe."], image: { vignette: "a.webp", grand: "b.webp" }, ...o });

test("un brouillon ne garde que les champs qui changent vraiment", () => {
  const v = B.valider({ n: 3, titre: "Nouveau titre", verso: ["Premier paragraphe.", "Second paragraphe."] }, carte(), NOW);
  assert.equal(v.brouillon.titre, "Nouveau titre");
  assert.equal(v.brouillon.verso, undefined, "le verso identique ne doit pas etre enregistre");
});

test("une proposition identique a l'original ne cree pas de correction", () => {
  const v = B.valider({ n: 3, titre: "Amélioration des capacités" }, carte(), NOW);
  assert.equal(v.erreur, undefined, "ce n'est pas une erreur : c'est un retrait");
  assert.equal(v.brouillon.titre, undefined);
  assert.deepEqual(v.retires, ["titre"]);
});

test("un titre vide est refuse, un verso vide aussi", () => {
  assert.ok(B.valider({ n: 3, titre: "   " }, carte(), NOW).erreur);
  assert.ok(B.valider({ n: 3, verso: ["  ", ""] }, carte(), NOW).erreur);
});

test("les explications, elles, peuvent etre vidées : elles sont facultatives", () => {
  const avec = carte({ explication: ["un mot"] });
  const v = B.valider({ n: 3, explication: [] }, avec, NOW);
  assert.deepEqual(v.brouillon.explication, []);
});

test("une carte inconnue est refusee", () => {
  assert.ok(B.valider({ n: 99, titre: "x" }, carte(), NOW).erreur);
  assert.ok(B.valider({ n: 3, titre: "x" }, null, NOW).erreur);
});

test("le texte saisi en un bloc devient des paragraphes", () => {
  const v = B.valider({ n: 3, verso: "Un.\n\nDeux.\n\nTrois." }, carte(), NOW);
  assert.deepEqual(v.brouillon.verso, ["Un.", "Deux.", "Trois."]);
});

/* --- Publication --------------------------------------------------------- */

const fichier = () => ({ version: 1, _commentaire: "source unique",
  cartes: [carte({ n: 2, titre: "Données" }), carte(), carte({ n: 4, titre: "Automatisation" })] });

test("publier n'applique que les champs du brouillon", () => {
  const f = B.appliquer(fichier(), [{ n: 3, titre: "Corrigé" }]);
  const c = f.cartes.find((x) => x.n === 3);
  assert.equal(c.titre, "Corrigé");
  assert.deepEqual(c.verso, ["Premier paragraphe.", "Second paragraphe."], "le verso doit survivre");
  assert.deepEqual(c.image, { vignette: "a.webp", grand: "b.webp" }, "l'image doit survivre");
});

test("publier garde l'ordre des cartes et le reste du fichier", () => {
  const f = B.appliquer(fichier(), [{ n: 3, titre: "Corrigé" }]);
  assert.deepEqual(f.cartes.map((c) => c.n), [2, 3, 4]);
  assert.equal(f.version, 1);
  assert.equal(f._commentaire, "source unique");
});

test("les cartes sans brouillon ne sont pas recopiees de travers", () => {
  const avant = fichier();
  const f = B.appliquer(avant, [{ n: 3, titre: "Corrigé" }]);
  assert.deepEqual(f.cartes.find((c) => c.n === 2), avant.cartes.find((c) => c.n === 2));
});

test("une explication vidée disparait du fichier au lieu d'y rester vide", () => {
  const f0 = fichier();
  f0.cartes[1].explication = ["ancien"];
  const f = B.appliquer(f0, [{ n: 3, explication: [] }]);
  assert.ok(!("explication" in f.cartes.find((c) => c.n === 3)));
});

test("le resume dit quelle carte et quels champs, pour la relecture", () => {
  const r = B.resume([{ n: 4, titre: "x", quand: NOW }, { n: 2, verso: ["y"], explication: ["z"], quand: NOW }],
    fichier().cartes);
  assert.deepEqual(r.map((x) => x.n), [2, 4], "classe par numero de carte");
  assert.deepEqual(r[0].champs, ["verso", "explication"]);
  assert.equal(r[1].titre, "Automatisation");
});

/* --- Annuler une correction ---------------------------------------------- */

test("reecrire un champ comme l'original retire cette correction", () => {
  const v = B.valider({ n: 3, titre: "Amélioration des capacités" }, carte(), NOW);
  assert.deepEqual(v.retires, ["titre"]);
  assert.equal(v.brouillon.titre, undefined);
});

test("annuler la derniere correction fait disparaitre le brouillon", () => {
  const avant = { n: 3, titre: "Corrigé" };
  const v = B.valider({ n: 3, titre: "Amélioration des capacités" }, carte(), NOW);
  assert.equal(B.fusionner(avant, v), null, "un brouillon vide ne doit pas survivre");
});

test("annuler une correction n'emporte pas les autres", () => {
  const avant = { n: 3, titre: "Corrigé", verso: ["Un."] };
  const v = B.valider({ n: 3, titre: "Amélioration des capacités" }, carte(), NOW);
  const apres = B.fusionner(avant, v);
  assert.equal(apres.titre, undefined);
  assert.deepEqual(apres.verso, ["Un."]);
});

test("corriger en deux fois n'efface pas la premiere correction", () => {
  const v1 = B.valider({ n: 3, titre: "Corrigé" }, carte(), NOW);
  const etape1 = B.fusionner(null, v1);
  const v2 = B.valider({ n: 3, verso: "Un.\n\nDeux." }, carte(), NOW);
  const etape2 = B.fusionner(etape1, v2);
  assert.equal(etape2.titre, "Corrigé");
  assert.deepEqual(etape2.verso, ["Un.", "Deux."]);
});

test("ne rien proposer du tout est refuse", () => {
  assert.match(B.valider({ n: 3 }, carte(), NOW).erreur, /propos/);
});
