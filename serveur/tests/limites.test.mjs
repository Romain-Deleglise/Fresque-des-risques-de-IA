/* Tests des garde-fous (logique pure de limitation de débit). node --test. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../src/limites.js");

const T0 = 1_000_000; // instant de référence (ms)

test("seuils cohérents avec le cahier des charges (B9)", () => {
  assert.equal(L.SEUILS.creation.limite, 10);
  assert.equal(L.SEUILS.entree.limite, 60);
  assert.equal(L.SEUILS.codes.limite, 20);
});

test("un compteur neuf n'est jamais atteint", () => {
  assert.equal(L.atteinte(null, T0, 10, 1000), false);
  assert.equal(L.atteinte(undefined, T0, 10, 1000), false);
});

test("atteinte devient vraie une fois la limite comptée", () => {
  const { limite, fenetreMs } = L.SEUILS.creation;
  let c = null;
  for (let i = 0; i < limite; i++) {
    assert.equal(L.atteinte(c, T0, limite, fenetreMs), false, `tentative ${i} refusée à tort`);
    c = L.incrementer(c, T0, fenetreMs);
  }
  // la limite est maintenant atteinte
  assert.equal(L.atteinte(c, T0, limite, fenetreMs), true);
});

test("la fenêtre se réinitialise une fois écoulée", () => {
  const fenetreMs = 60 * 1000;
  let c = { debut: T0, n: 60 };
  assert.equal(L.atteinte(c, T0 + 1000, 60, fenetreMs), true, "toujours bloqué dans la fenêtre");
  // après la fenêtre : compteur remis à zéro
  assert.equal(L.atteinte(c, T0 + fenetreMs + 1, 60, fenetreMs), false);
  const c2 = L.incrementer(c, T0 + fenetreMs + 1, fenetreMs);
  assert.equal(c2.n, 1, "le nouvel incrément repart de 1");
  assert.equal(c2.debut, T0 + fenetreMs + 1);
});

test("incrementer ne mute pas le compteur reçu", () => {
  const c = { debut: T0, n: 3 };
  const c2 = L.incrementer(c, T0 + 10, 1000);
  assert.equal(c.n, 3, "l'objet d'origine reste intact");
  assert.equal(c2.n, 4);
});

test("scénario codes inconnus : blocage au 21e code", () => {
  const { limite, fenetreMs } = L.SEUILS.codes; // 20 / min
  let c = null, bloques = 0;
  for (let i = 0; i < 25; i++) {
    if (L.atteinte(c, T0, limite, fenetreMs)) { bloques++; continue; }
    c = L.incrementer(c, T0, fenetreMs); // code inconnu -> on compte
  }
  assert.equal(bloques, 5, "les 5 tentatives au-delà de 20 sont bloquées");
});

console.log("(les assertions ci-dessus s'exécutent via node --test)");
