/* Tests de la fresque de reference (site/data/fresque-reference.json).

   Ce fichier est le coeur de l'espace animateur·ices, et c'est un fichier de
   donnees ecrit a la main : rien dans le navigateur ne signale une carte
   oubliee, une fleche qui pointe dans le vide ou deux cartes empilees. Ces
   tests tiennent ce role, et empechent la reference de deriver de cartes.json.

   `node --test`.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (p) => JSON.parse(fs.readFileSync(path.join(RACINE, p), "utf8"));

const CARTES = lire("site/data/cartes.json").cartes;
const REF = lire("site/data/fresque-reference.json");
const { cartes, fleches, textes } = REF.tableau;
const parN = new Map(CARTES.map((c) => [c.n, c]));
const placees = new Set(cartes.map((c) => c.n));

test("toutes les cartes jouables sont placees, et elles seules", () => {
  const jouables = CARTES.filter((c) => !c.intro).map((c) => c.n).sort((a, b) => a - b);
  assert.deepEqual([...placees].sort((a, b) => a - b), jouables);
  // La carte d'introduction (0) se pose en debut d'atelier, hors jeu : elle
  // n'a pas sa place dans la fresque de reference.
  assert.ok(!placees.has(0));
});

test("aucune carte placee deux fois", () => {
  assert.equal(placees.size, cartes.length);
});

test("chaque carte placee existe dans cartes.json", () => {
  for (const p of cartes) assert.ok(parN.has(p.n), `carte inconnue : ${p.n}`);
});

test("toutes les cartes tiennent dans le plan", () => {
  const { largeur, hauteur, carte } = REF.plan;
  for (const p of cartes) {
    assert.ok(p.x >= 0 && p.x + carte.largeur <= largeur, `carte ${p.n} hors plan en x`);
    assert.ok(p.y >= 0 && p.y + carte.hauteur <= hauteur, `carte ${p.n} hors plan en y`);
  }
});

test("le plan epouse le contenu : pas de bande vide", () => {
  const { largeur, hauteur, carte } = REF.plan;
  const maxX = Math.max(...cartes.map((c) => c.x + carte.largeur));
  const maxY = Math.max(...cartes.map((c) => c.y + carte.hauteur));
  // Une marge, oui ; une moitie de plan vide, non.
  assert.ok(largeur - maxX <= 200, `${largeur - maxX} px perdus a droite`);
  assert.ok(hauteur - maxY <= 200, `${hauteur - maxY} px perdus en bas`);
});

test("deux cartes ne se chevauchent jamais", () => {
  const { largeur: w, hauteur: h } = REF.plan.carte;
  for (let i = 0; i < cartes.length; i++) {
    for (let j = i + 1; j < cartes.length; j++) {
      const a = cartes[i], b = cartes[j];
      const croise = Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h;
      assert.ok(!croise, `cartes ${a.n} et ${b.n} se chevauchent`);
    }
  }
});

test("chaque fleche relie deux cartes placees et distinctes", () => {
  for (const f of fleches) {
    assert.ok(placees.has(f.de), `fleche ${f.id} : depart ${f.de} non place`);
    assert.ok(placees.has(f.vers), `fleche ${f.id} : arrivee ${f.vers} non placee`);
    assert.notEqual(f.de, f.vers, `fleche ${f.id} : carte reliee a elle-meme`);
  }
});

test("les identifiants de fleche sont uniques", () => {
  const ids = fleches.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("aucun couple de cartes relie deux fois", () => {
  const vus = new Set();
  for (const f of fleches) {
    const k = f.de + ">" + f.vers;
    assert.ok(!vus.has(k), `lien ${k} en double`);
    vus.add(k);
  }
});

test("chaque fleche porte un libelle explicite", () => {
  for (const f of fleches) {
    assert.ok(typeof f.libelle === "string" && f.libelle.trim().length >= 3,
      `fleche ${f.id} sans libelle`);
    // Le libelle s'affiche au milieu du trait : trop long, il chevauche les
    // cartes voisines et devient illisible.
    assert.ok(f.libelle.length <= 42, `libelle trop long sur ${f.id} : « ${f.libelle} »`);
  }
});

test("aucune carte n'est isolee", () => {
  const relie = new Set();
  for (const f of fleches) { relie.add(f.de); relie.add(f.vers); }
  for (const n of placees) {
    assert.ok(relie.has(n), `carte ${n} (${parN.get(n).titre}) n'est reliee a rien`);
  }
});

test("le graphe relie bien les cinq lots entre eux", () => {
  // Une fresque en morceaux ne raconte rien. On verifie que l'ensemble tient
  // d'un seul tenant, en ignorant le sens des fleches.
  const voisins = new Map([...placees].map((n) => [n, []]));
  for (const f of fleches) { voisins.get(f.de).push(f.vers); voisins.get(f.vers).push(f.de); }
  const vus = new Set();
  const pile = [[...placees][0]];
  while (pile.length) {
    const n = pile.pop();
    if (vus.has(n)) continue;
    vus.add(n);
    for (const m of voisins.get(n)) pile.push(m);
  }
  assert.equal(vus.size, placees.size, "la fresque se scinde en plusieurs blocs");
});

test("chaque solution du lot 5 repond a au moins un risque", () => {
  const solutions = CARTES.filter((c) => c.lot === 5).map((c) => c.n);
  assert.ok(solutions.length >= 5);
  for (const n of solutions) {
    const sortantes = fleches.filter((f) => f.de === n);
    assert.ok(sortantes.length >= 1,
      `la solution ${n} (${parN.get(n).titre}) ne pointe aucun risque`);
  }
});

test("les etiquettes de lot sont presentes et tiennent dans le plan", () => {
  assert.equal(textes.length, 5, "il faut une etiquette par lot");
  for (const t of textes) {
    assert.ok(t.contenu.trim().length > 0);
    assert.ok(t.x >= 0 && t.x <= REF.plan.largeur);
    assert.ok(t.y >= 0 && t.y <= REF.plan.hauteur);
  }
});
