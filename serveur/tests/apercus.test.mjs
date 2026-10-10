/* L'APERCU DES COURRIELS : il doit montrer ce qui part, et tout ce qui part.

   CE QUE CES TESTS PROTEGENT. L'apercu de /admin/ sert a verifier les
   courriels sans provoquer l'evenement qui les envoie. Il ne vaut que s'il
   est complet et fidele :
   - un courriel ajoute au site sans apercu redevient invisible, et l'outil
     donne la fausse impression d'avoir tout montre ;
   - un apercu qui designe un courriel disparu affiche un contenu mort ;
   - un apercu qui recopierait le contenu au lieu d'appeler le constructeur
     reel derive au premier changement de mise en forme.

   `node --test`.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const A = require("../../netlify/functions/lib/apercus.js");
const P = require("../src/parcours.js");
const BILLET = require("../../netlify/functions/lib/billet.js");

const sujetsCarte = [];
for (const p of P.tous()) for (const e of p.etapes) sujetsCarte.push(e.sujet);

test("chaque courriel de la carte des parcours a son apercu", () => {
  const sans = sujetsCarte.filter((s) => !A.existe(s));
  assert.deepEqual(sans, [], "sans apercu : " + sans.join(" | "));
});

test("et aucun apercu ne designe un courriel qui n'existe plus", () => {
  const orphelins = A.sujets().filter((s) => sujetsCarte.indexOf(s) === -1);
  assert.deepEqual(orphelins, [], "apercu orphelin : " + orphelins.join(" | "));
});

test("tous se construisent, en HTML et en texte", () => {
  for (const s of A.sujets()) {
    const m = A.rendre(s);
    assert.ok(m.html.length > 200, s + " : HTML vide ou trop court");
    assert.ok(m.text.length > 80, s + " : texte vide ou trop court");
    assert.match(m.html, /<!doctype html>/i, s + " : hors du gabarit commun");
  }
});

/* UN APERCU NE DOIT RIEN DIRE DE REEL. Les donnees d'exemple pointent toutes
   vers le domaine reserve a cet usage : si un jour quelqu'un y branche un vrai
   atelier pour « voir pour de vrai », ce test le dit. */
test("aucune adresse reelle dans les apercus", () => {
  for (const s of A.sujets()) {
    const m = A.rendre(s);
    const adresses = (m.text + " " + m.html).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
    const hors = adresses.filter((a) => !/@example\.(org|com|net)$/i.test(a)
      && !/@pauseia\.fr$/i.test(a));
    assert.deepEqual(hors, [], s + " : adresse inattendue " + hors.join(", "));
  }
});

/* LE CONTENU N'EST PAS RECOPIE : l'apercu appelle le constructeur de la
   fonction qui envoie. On le verifie sur une marque que seul le vrai
   constructeur produit, le compteur de places de l'e-mail d'inscription. */
test("l'apercu passe par le vrai constructeur, pas par une copie", () => {
  const m = A.rendre("Nouvelle inscription à votre atelier");
  assert.match(m.text, /Inscrits : 3 \/ 12/);
  assert.match(m.html, /Sofia/);
});

/* ── LE BILLET ──────────────────────────────────────────────
   Il remplace la cle d'administration dans l'adresse d'un cadre. Il ne doit
   donc ni se deviner, ni survivre, ni valoir pour une autre cle. */
test("un billet signe par la cle ouvre l'apercu", () => {
  assert.equal(BILLET.valide(BILLET.emettre("cle-secrete"), "cle-secrete"), true);
});

test("un billet ne vaut pas pour une autre cle", () => {
  assert.equal(BILLET.valide(BILLET.emettre("cle-secrete"), "cle-voisine"), false);
});

test("un billet expire ne vaut plus rien", () => {
  const b = BILLET.emettre("cle-secrete");
  assert.equal(BILLET.valide(b, "cle-secrete", Date.now() + BILLET.DUREE_MS + 1000), false);
});

test("on ne forge pas un billet en repoussant sa date", () => {
  const b = BILLET.emettre("cle-secrete");
  const forge = (Date.now() + 10 * 365 * 24 * 3600 * 1000) + "." + b.split(".")[1];
  assert.equal(BILLET.valide(forge, "cle-secrete"), false);
  assert.equal(BILLET.valide("", "cle-secrete"), false);
  assert.equal(BILLET.valide(b, ""), false);
});
