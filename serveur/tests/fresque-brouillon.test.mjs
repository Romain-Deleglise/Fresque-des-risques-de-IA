/* BROUILLON DE LA FRESQUE DE REFERENCE : ce qu'on refuse, et pourquoi.

   Un tableau mal forme ne casse pas bruyamment. Il produit une fresque ou deux
   cartes se superposent, ou une fleche part d'une carte absente et ne se
   dessine simplement pas : on cherche longtemps pourquoi le lien qu'on vient de
   tracer n'apparait nulle part. On refuse donc en amont ce qui ne se verrait
   qu'a l'oeil, trop tard. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../src/fresque-brouillon.js");

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const REF = JSON.parse(fs.readFileSync(path.join(RACINE, "site/data/fresque-reference.json"), "utf8"));
const PLAN = REF.plan;
const base = () => ({ cartes: [{ n: 1, x: 100, y: 100 }, { n: 2, x: 400, y: 100 }],
  fleches: [{ id: "f1", de: 1, vers: 2, libelle: "mène à" }], textes: [] });

test("la fresque publiee aujourd'hui est valide", () => {
  const v = F.valider(REF.tableau, PLAN);
  assert.equal(v.erreur, undefined, v.erreur);
  assert.equal(v.tableau.cartes.length, REF.tableau.cartes.length);
});

test("une carte posee deux fois est refusee", () => {
  const t = base(); t.cartes.push({ n: 1, x: 700, y: 100 });
  assert.match(F.valider(t, PLAN).erreur, /deux fois/);
});

test("une carte qui sort du plan est refusee, bord compris", () => {
  const t = base();
  t.cartes[0].x = PLAN.largeur - PLAN.carte.largeur + 1;
  assert.match(F.valider(t, PLAN).erreur, /sort du plan/);
  t.cartes[0].x = PLAN.largeur - PLAN.carte.largeur;
  assert.equal(F.valider(t, PLAN).erreur, undefined, "le bord exact doit passer");
});

test("un lien vers une carte absente est refuse, au lieu de disparaitre", () => {
  const t = base(); t.fleches.push({ id: "f2", de: 1, vers: 38 });
  assert.match(F.valider(t, PLAN).erreur, /absente/);
});

test("un lien d'une carte vers elle-meme est refuse", () => {
  const t = base(); t.fleches.push({ id: "f2", de: 1, vers: 1 });
  assert.match(F.valider(t, PLAN).erreur, /elle-même/);
});

test("deux liens ne peuvent pas porter la meme reference", () => {
  const t = base(); t.fleches.push({ id: "f1", de: 2, vers: 1 });
  assert.match(F.valider(t, PLAN).erreur, /même référence/);
});

test("une fresque sans carte est refusee", () => {
  assert.match(F.valider({ cartes: [], fleches: [] }, PLAN).erreur, /sans carte/);
});

test("un libelle trop long est coupe, pas refuse", () => {
  const t = base(); t.fleches[0].libelle = "x".repeat(F.MAX_LIBELLE + 40);
  assert.equal(F.valider(t, PLAN).tableau.fleches[0].libelle.length, F.MAX_LIBELLE);
});

test("une etiquette vide est jetee sans faire echouer le reste", () => {
  const t = base(); t.textes = [{ id: "t1", x: 10, y: 10, contenu: "  " }, { id: "t2", x: 20, y: 20, contenu: "Lot 1" }];
  const v = F.valider(t, PLAN);
  assert.equal(v.tableau.textes.length, 1);
  assert.equal(v.tableau.textes[0].contenu, "Lot 1");
});

test("publier ne touche qu'au tableau", () => {
  const f = F.appliquer(REF, base());
  assert.equal(f.version, REF.version);
  assert.deepEqual(f.plan, REF.plan);
  assert.equal(f._commentaire, REF._commentaire);
  assert.equal(f.tableau.cartes.length, 2);
});

test("le resume dit ce qui a bouge, pour relire avant de deposer", () => {
  const avant = base();
  const apres = JSON.parse(JSON.stringify(avant));
  apres.cartes[0].x += 40;
  apres.fleches.push({ id: "f9", de: 2, vers: 1 });
  const r = F.resume(avant, apres);
  assert.equal(r.cartesDeplacees, 1);
  assert.equal(r.liensAjoutes, 1);
  assert.equal(r.liensRetires, 0);
});
