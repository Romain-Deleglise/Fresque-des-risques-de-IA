/* Garde-fou le plus bête et le plus utile : chaque fonction Netlify se charge.

   Une erreur de syntaxe ou un identifiant déclaré deux fois ne se voit ni à la
   relecture ni dans les tests de logique pure -- mais elle met la fonction à
   terre en production. C'est arrivé : `admin.js` a eu deux `const C`, et tout
   l'espace d'administration répondait 500. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const DOSSIER = new URL("../../netlify/functions/", import.meta.url);
const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".js"));

test("chaque fonction Netlify se charge et expose un handler", () => {
  assert.ok(fichiers.length >= 10, "les fonctions sont bien là");
  for (const f of fichiers) {
    const m = require(new URL(f, DOSSIER).pathname);
    assert.equal(typeof m.handler, "function", f + " n'expose pas de handler");
  }
});
