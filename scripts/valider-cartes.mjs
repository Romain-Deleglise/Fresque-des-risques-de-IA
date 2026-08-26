#!/usr/bin/env node
// Validation de site/data/cartes.json (B2.2 / B4.1) — sans dependance.
// Verifie : 39 entrees, numeros uniques 0..38, une seule carte intro,
// champs obligatoires presents. Sort en code 1 si invalide.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const chemin = join(racine, "site", "data", "cartes.json");

const erreurs = [];
let data;
try {
  data = JSON.parse(readFileSync(chemin, "utf8"));
} catch (e) {
  console.error("❌ JSON illisible :", e.message);
  process.exit(1);
}

const cartes = Array.isArray(data.cartes) ? data.cartes : [];
if (cartes.length !== 39) {
  erreurs.push(`Il faut exactement 39 entrees (0 a 38), trouve ${cartes.length}.`);
}

const vus = new Set();
let intros = 0;
for (const c of cartes) {
  if (typeof c.n !== "number" || c.n < 0 || c.n > 38) erreurs.push(`n invalide : ${JSON.stringify(c.n)}`);
  if (vus.has(c.n)) erreurs.push(`Numero de carte en double : ${c.n}`);
  vus.add(c.n);
  if (c.intro === true) intros++;
  if (!c.titre || typeof c.titre !== "string") erreurs.push(`Carte ${c.n} : titre manquant.`);
  if (!Array.isArray(c.verso) || c.verso.length === 0) erreurs.push(`Carte ${c.n} : verso manquant.`);
  if (c.n !== 0 && !(c.image && c.image.vignette && c.image.grand)) {
    erreurs.push(`Carte ${c.n} : variantes d'image (vignette/grand) manquantes.`);
  }
  if (c.n !== 0 && (c.lot < 1 || c.lot > 5)) erreurs.push(`Carte ${c.n} : lot hors de 1..5.`);
}
for (let i = 0; i <= 38; i++) if (!vus.has(i)) erreurs.push(`Numero de carte manquant : ${i}`);
if (intros !== 1) erreurs.push(`Il faut exactement une carte intro (intro:true), trouve ${intros}.`);

if (erreurs.length) {
  console.error("❌ cartes.json invalide :");
  for (const e of erreurs) console.error("  - " + e);
  process.exit(1);
}
console.log("✅ cartes.json valide : 39 entrees, numeros 0..38 uniques, une carte intro.");
