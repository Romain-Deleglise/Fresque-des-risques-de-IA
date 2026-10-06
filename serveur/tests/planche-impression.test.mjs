/* LA PLANCHE D'IMPRESSION ET cartes.json

   AVANT : les titres et les versos etaient ecrits DEUX FOIS, dans
   site/data/cartes.json et dans le gabarit d'impression. Ce fichier comparait
   les deux copies... et laissait passer la divergence qu'il y avait vraiment :
   la carte 3 avait deux paragraphes a l'impression et un seul sur le site,
   parce que la comparaison remplacait les sauts de paragraphe par des espaces.

   MAINTENANT : il n'y a plus qu'une source. Le gabarit ne garde que la MISE EN
   PAGE (cadrage des images, anciens noms de fichiers) et lit cartes.json pour
   le reste. Ce banc verifie donc ce qui peut encore casser : qu'aucun texte ne
   revienne dans le gabarit, et qu'aucune carte ne se retrouve sans reglage de
   mise en page -- auquel cas elle manquerait purement et simplement de la
   planche. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

const JSON_CARTES = JSON.parse(lire("site/data/cartes.json")).cartes;
const PLANCHE = lire("contenus/Planche d'impression (20pages).html");

/* La mise en page est un litteral JavaScript ; on n'en lit que les numeros. */
function numerosDeLaPlanche() {
  const deb = PLANCHE.indexOf("const MISE_EN_PAGE = [");
  assert.ok(deb > 0, "la liste MISE_EN_PAGE est introuvable dans la planche");
  const bloc = PLANCHE.slice(deb, PLANCHE.indexOf("\n];", deb));
  return bloc.split(/\n\s*\{n:/).slice(1).map((p) => Number(/^(\d+)/.exec(p)[1]));
}

test("chaque carte de cartes.json a son reglage de mise en page", () => {
  const nums = numerosDeLaPlanche();
  for (const c of JSON_CARTES) {
    assert.ok(nums.includes(c.n), "la carte " + c.n + " manque dans la planche d'impression");
  }
  assert.equal(nums.length, JSON_CARTES.length,
    "la planche decrit " + nums.length + " cartes pour " + JSON_CARTES.length + " dans cartes.json");
});

test("la planche ne recopie plus aucun titre", () => {
  for (const c of JSON_CARTES) {
    assert.ok(!PLANCHE.includes('t:"' + c.titre + '"'),
      "le titre de la carte " + c.n + " est encore ecrit dans le gabarit");
  }
});

test("la planche ne recopie plus aucun verso", () => {
  for (const c of JSON_CARTES) {
    // Un extrait suffit, et evite de dependre de l'echappement des guillemets.
    const extrait = c.verso[0].slice(0, 50);
    assert.ok(!PLANCHE.includes(extrait),
      "le verso de la carte " + c.n + " est encore ecrit dans le gabarit");
  }
});

test("la planche lit bien la source unique", () => {
  assert.match(PLANCHE, /SOURCE_TEXTES = "\.\.\/site\/data\/cartes\.json"/);
  assert.match(PLANCHE, /async function chargerContenus\(\)/);
});
