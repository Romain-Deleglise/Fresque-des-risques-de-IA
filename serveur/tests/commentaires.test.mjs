/* Tests des regles pures de recueil des retours d'animateur·ices. `node --test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../src/commentaires.js");

const T = 1700000000000;

test("un retour vide ou trop court est refuse", () => {
  assert.ok(C.valider({ texte: "" }, T).erreur);
  assert.ok(C.valider({ texte: "  " }, T).erreur);
  assert.ok(C.valider({ texte: "ok" }, T).erreur);
  assert.ok(C.valider({}, T).erreur);
  assert.ok(C.valider(null, T).erreur);
});

test("un retour general est accepte et date", () => {
  const r = C.valider({ sujet: "jeu", texte: "La carte 5 passe mal." }, T).retour;
  assert.equal(r.sujet, "jeu");
  assert.equal(r.carte, null);
  assert.equal(r.date, T);
});

test("un sujet inconnu retombe sur « autre »", () => {
  assert.equal(C.valider({ sujet: "n_importe_quoi", texte: "coucou" }, T).retour.sujet, "autre");
});

test("un numero de carte valide impose le sujet « carte »", () => {
  const r = C.valider({ sujet: "jeu", carte: 22, texte: "mal comprise" }, T).retour;
  assert.equal(r.carte, 22);
  assert.equal(r.sujet, "carte");
});

test("une carte hors jeu est ignoree plutot que de perdre le retour", () => {
  // 0 = carte d'introduction, 39 = inexistante, 5.5 = pas un entier.
  for (const n of [0, 39, 5.5, -1, "22", null]) {
    const r = C.valider({ sujet: "carte", carte: n, texte: "un retour" }, T).retour;
    assert.equal(r.carte, null, `carte ${n} aurait du etre ignoree`);
    assert.equal(r.sujet, "autre");
  }
});

test("les bornes du jeu sont acceptees", () => {
  assert.equal(C.valider({ carte: 1, texte: "x y z" }, T).retour.carte, 1);
  assert.equal(C.valider({ carte: 38, texte: "x y z" }, T).retour.carte, 38);
});

test("les champs trop longs sont tronques, jamais refuses", () => {
  const r = C.valider({
    texte: "a".repeat(5000), nom: "b".repeat(200), email: "c".repeat(300) + "@ex.org"
  }, T).retour;
  assert.equal(r.texte.length, C.MAX_TEXTE);
  assert.ok(r.nom.length <= 40);
});

test("une adresse invalide est effacee, le retour est garde", () => {
  const r = C.valider({ texte: "un retour", email: "pas une adresse" }, T).retour;
  assert.equal(r.email, "");
  assert.equal(r.texte, "un retour");
  assert.equal(C.valider({ texte: "un retour", email: "lea@ex.org" }, T).retour.email, "lea@ex.org");
});

test("la cle porte le numero de carte, ce qui permet le comptage", () => {
  const r = C.valider({ carte: 14, texte: "un retour" }, T).retour;
  assert.match(C.cle(r, "abc"), /^carte:14:abc$/);
  const g = C.valider({ sujet: "deroule", texte: "un retour" }, T).retour;
  assert.match(C.cle(g, "abc"), /^general:deroule:abc$/);
});

test("le comptage n'additionne que les retours par carte", () => {
  const compte = C.compter([
    "carte:14:a", "carte:14:b", "carte:3:c", "general:jeu:d", "general:autre:e"
  ]);
  assert.deepEqual(compte, { 14: 2, 3: 1 });
  assert.deepEqual(C.compter([]), {});
  assert.deepEqual(C.compter(null), {});
});

test("un retour naît en attente de relecture", () => {
  assert.equal(C.valider({ texte: "un retour" }, T).retour.valide, false);
});

test("la vue publique ne laisse jamais fuiter l'adresse e-mail", () => {
  const r = C.valider({ texte: "un retour", email: "lea@ex.org", nom: "Léa" }, T).retour;
  const p = C.public(r, "general:jeu:abc");
  assert.equal(p.email, undefined);
  assert.ok(!JSON.stringify(p).includes("lea@ex.org"));
  // Le reste est bien transmis : sans cela la liste serait vide de sens.
  assert.equal(p.nom, "Léa");
  assert.equal(p.texte, "un retour");
  assert.equal(p.cle, "general:jeu:abc");
  assert.equal(p.valide, false);
});

test("seules les clés de la forme attendue sont modérables", () => {
  for (const k of ["carte:14:ab12", "carte:3:z", "general:jeu:ab12", "general:reference:x1"]) {
    assert.ok(C.cleValide(k), `${k} aurait dû être acceptée`);
  }
  // Une clé forgée ne doit pas pouvoir désigner autre chose dans le magasin.
  for (const k of ["../secret", "session:ABC123", "carte:14", "carte:999:ab",
                   "carte:14:" + "a".repeat(30), "", null, 42, "carte:14:AB!"]) {
    assert.ok(!C.cleValide(k), `${JSON.stringify(k)} aurait dû être refusée`);
  }
});

test("une clé fabriquée par cle() est toujours modérable", () => {
  for (const n of [1, 9, 38, null]) {
    const r = C.valider({ carte: n, texte: "un retour", sujet: "jeu" }, T).retour;
    assert.ok(C.cleValide(C.cle(r, "ab12cd")), `clé invalide pour la carte ${n}`);
  }
});
