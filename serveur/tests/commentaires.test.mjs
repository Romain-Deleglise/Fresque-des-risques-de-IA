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

/* « CA CONCERNE LE LIEN AVEC LA CARTE X ». Le champ est facultatif et n'a de
   sens que sur un retour qui vise deja une carte. */
test("le lien avec une autre carte est retenu quand il est valide", () => {
  const r = C.valider({ carte: 14, lien: 22, texte: "il manque ce lien" }, T).retour;
  assert.equal(r.carte, 14);
  assert.equal(r.lien, 22);
});

test("le lien est effacé quand il ne désigne pas une carte jouable", () => {
  for (const mauvais of [0, 39, -3, 4.5, "22", null, undefined, NaN, {}]) {
    const r = C.valider({ carte: 14, lien: mauvais, texte: "un retour" }, T).retour;
    assert.equal(r.lien, null, `lien ${JSON.stringify(mauvais)} aurait dû être effacé`);
  }
});

/* Une carte liée à elle-même ne dit rien, et un lien sans carte de départ ne
   désigne aucun lien : dans les deux cas on efface plutôt que refuser, le
   texte du retour valant mieux qu'un envoi rejeté. */
test("une carte ne peut pas être liée à elle-même", () => {
  const r = C.valider({ carte: 14, lien: 14, texte: "un retour" }, T).retour;
  assert.equal(r.lien, null);
});

test("un lien sans carte de départ est effacé, mais le retour passe", () => {
  const r = C.valider({ sujet: "jeu", lien: 22, texte: "un retour" }, T).retour;
  assert.equal(r.carte, null);
  assert.equal(r.lien, null);
  assert.equal(r.texte, "un retour");
});

/* « L'ATELIER EN GÉNÉRAL » est un sujet à part entière. Sans lui dans la liste
   fermée, la page l'aurait proposé, le serveur l'aurait rangé sous « autre »,
   et la distinction se serait perdue sans que personne le voie. */
test("le sujet « atelier » est accepté tel quel", () => {
  const r = C.valider({ sujet: "atelier", texte: "ça s'est bien passé" }, T).retour;
  assert.equal(r.sujet, "atelier");
  assert.ok(C.cleValide(C.cle(r, "ab12cd")), "la clé doit rester modérable");
});

/* --- « Qu'est-ce qui pose probleme dans ce lien ? » ------------------------
   Un retour « cette fleche ne va pas » n'apprend rien tant qu'on ne sait pas
   en quoi. Le champ n'a donc de sens qu'avec un lien, et le lien lui-meme doit
   enfin ressortir : il etait enregistre depuis le debut, et jamais rendu. */
test("le texte du lien est garde quand un lien est designe", () => {
  const v = C.valider({ sujet: "carte", carte: 3, lien: 12, lienTexte: "la cause est inversee", texte: "un retour assez long pour passer" }, T);
  assert.equal(v.retour.lien, 12);
  assert.equal(v.retour.lienTexte, "la cause est inversee");
});

test("sans lien, le texte du lien est efface plutot que garde orphelin", () => {
  const v = C.valider({ sujet: "carte", carte: 3, lienTexte: "texte sans lien", texte: "un retour assez long pour passer" }, T);
  assert.equal(v.retour.lien, null);
  assert.equal(v.retour.lienTexte, "");
});

test("un lien vers la carte elle-meme emporte son texte", () => {
  const v = C.valider({ sujet: "carte", carte: 7, lien: 7, lienTexte: "boucle", texte: "un retour assez long pour passer" }, T);
  assert.equal(v.retour.lien, null);
  assert.equal(v.retour.lienTexte, "");
});

test("le texte du lien est tronque comme le retour principal", () => {
  const long = "x".repeat(C.MAX_TEXTE + 500);
  const v = C.valider({ sujet: "carte", carte: 3, lien: 12, lienTexte: long, texte: "un retour assez long pour passer" }, T);
  assert.equal(v.retour.lienTexte.length, C.MAX_TEXTE);
});

test("le lien et son texte sont visibles par ceux qui lisent les retours", () => {
  const v = C.valider({ sujet: "carte", carte: 3, lien: 12, lienTexte: "la cause est inversee", texte: "un retour assez long pour passer" }, T);
  const pub = C.public(v.retour, "cle-x");
  assert.equal(pub.lien, 12);
  assert.equal(pub.lienTexte, "la cause est inversee");
  assert.equal(pub.email, undefined, "l'adresse ne doit jamais sortir");
});

/* « PRIS EN COMPTE ». La correction est faite, mais le retour reste lisible :
   le supprimer effacerait la trace de ce qui l'a motivee, et quelqu'un
   signalerait la meme chose six mois plus tard. */
test("un retour expose s'il a ete pris en compte", () => {
  const v = C.valider({ sujet: "carte", carte: 3, texte: "un retour assez long pour passer" }, T);
  assert.equal(C.public(v.retour, "k").traite, false, "faux par defaut");
  v.retour.traite = true;
  assert.equal(C.public(v.retour, "k").traite, true);
});
