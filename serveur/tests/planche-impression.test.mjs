/* LES TEXTES DES CARTES NE DOIVENT EXISTER QU'EN UN SEUL EXEMPLAIRE.

   Ils vivent aujourd'hui a deux endroits : site/data/cartes.json, que lisent le
   site et l'outil en ligne, et la liste CARDS ecrite en dur dans la planche
   d'impression, dont sort le PDF. Les deux sont pour l'instant rigoureusement
   identiques, et c'est precisement le moment d'y veiller : le jour ou ils
   divergeront, personne ne le verra. Le PDF circule, il s'imprime, il devient
   la reference, et il aura tort sans que rien ne le signale.

   Ce test ne supprime pas la duplication -- il la rend visible. Le jour ou la
   planche lira cartes.json (cahier des charges de l'outil de mise a jour), il
   deviendra inutile et pourra partir.

   `node --test`.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

const JSON_CARTES = JSON.parse(lire("site/data/cartes.json")).cartes;
const PLANCHE = lire("contenus/Planche d'impression (20pages).html");

/* La planche declare ses cartes dans un litteral JavaScript. On l'analyse au
   plus simple : chaque entree commence par `{n:<numero>` et porte un `t:` et
   un `v:`. Assez robuste pour detecter une divergence, sans embarquer un
   analyseur JavaScript pour un test. */
function cartesDeLaPlanche() {
  const deb = PLANCHE.indexOf("const CARDS = [");
  assert.ok(deb > 0, "la liste CARDS est introuvable dans la planche");
  const bloc = PLANCHE.slice(deb, PLANCHE.indexOf("\n];", deb));
  const out = new Map();
  for (const p of bloc.split(/\n\s*\{n:/).slice(1)) {
    const n = Number(/^(\d+)/.exec(p)[1]);
    const t = /\bt:"((?:[^"\\]|\\.)*)"/.exec(p);
    const v = /\bv:"((?:[^"\\]|\\.)*)"/.exec(p);
    if (t && v) {
      out.set(n, {
        titre: t[1].replace(/\\"/g, '"'),
        verso: v[1].replace(/\\n/g, " ").replace(/\\"/g, '"')
      });
    }
  }
  return out;
}

const normal = (s) => s.replace(/\s+/g, " ").trim();
const PLANCHE_CARTES = cartesDeLaPlanche();

test("la planche et cartes.json décrivent le même nombre de cartes", () => {
  assert.equal(PLANCHE_CARTES.size, JSON_CARTES.length);
});

test("chaque carte porte le même titre des deux côtés", () => {
  for (const c of JSON_CARTES) {
    const p = PLANCHE_CARTES.get(c.n);
    assert.ok(p, `la carte ${c.n} manque dans la planche d'impression`);
    assert.equal(p.titre, c.titre,
      `carte ${c.n} : le titre diverge entre cartes.json et la planche`);
  }
});

test("chaque carte porte le même verso des deux côtés", () => {
  for (const c of JSON_CARTES) {
    const p = PLANCHE_CARTES.get(c.n);
    assert.equal(normal(p.verso), normal(c.verso.join(" ")),
      `carte ${c.n} (${c.titre}) : le verso diverge entre cartes.json et la planche`);
  }
});

test("chaque carte appartient au même lot des deux côtés", () => {
  const bloc = PLANCHE.slice(PLANCHE.indexOf("const CARDS = ["));
  for (const p of bloc.split(/\n\s*\{n:/).slice(1)) {
    const n = Number(/^(\d+)/.exec(p)[1]);
    const lot = /\blot:(\d+|null)/.exec(p);
    if (!lot) continue;
    const ref = JSON_CARTES.find((c) => c.n === n);
    if (!ref) continue;
    const attendu = lot[1] === "null" ? null : Number(lot[1]);
    assert.equal(attendu, ref.lot ?? null, `carte ${n} : le lot diverge`);
  }
});
