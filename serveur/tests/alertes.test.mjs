/* Table de verite des alertes : QUI recoit QUOI.
   Ecrite exhaustivement (3 formats x 3 natures d'atelier) pour qu'aucun cas ne
   depende d'une relecture. Un mail inutile est aussi grave qu'un mail manquant. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../src/alertes.js");
const C = require("../src/communes.js");

const NOW = Date.UTC(2026, 0, 12);
const JOUR = 24 * 60 * 60 * 1000;

const enLigne = (o = {}) => ({ mode: "enligne", visibilite: "public", quandMs: NOW + 10 * JOUR, participants: [], maxParticipants: 30, ...o });
const surPlace = (com, o = {}) => ({ mode: "physique", visibilite: "public", quandMs: NOW + 10 * JOUR, participants: [], maxParticipants: 20, commune: com, lieu: C.nom(com), ...o });

// Codes INSEE utilisés : Lyon, Villeurbanne (4 km de Lyon), Saint-Étienne
// (51 km), Paris, Melun (41 km de Paris), Bordeaux.
const LYON = "69123", VILLEURBANNE = "69266", ST_ETIENNE = "42218";
const PARIS = "75056", MELUN = "77288", BORDEAUX = "33063";

const abo = (format, communes = [], rayonKm) =>
  A.validerAbonnement({ mail: "a@b.fr", format, communes, rayonKm }, NOW).abonne;

test("table de verite : format x nature d'atelier", () => {
  const cas = [
    // [format, communes, atelier, recoit ?]
    ["enligne", [], enLigne(), true],
    ["enligne", [], surPlace(LYON), false],
    ["physique", [LYON], enLigne(), false],
    ["physique", [LYON], surPlace(LYON), true],
    ["physique", [LYON], surPlace(PARIS), false],
    ["les_deux", [LYON], enLigne(), true],
    ["les_deux", [LYON], surPlace(LYON), true],
    ["les_deux", [LYON], surPlace(PARIS), false]
  ];
  for (const [format, communes, atelier, attendu] of cas) {
    assert.equal(A.concerne(abo(format, communes, 50), atelier), attendu,
      `${format} ${JSON.stringify(communes)} vs ${atelier.mode} ${atelier.commune || ""}`);
  }
});

test("plusieurs communes choisies : chacune compte", () => {
  const ab = abo("les_deux", [LYON, PARIS], 30);
  assert.equal(A.concerne(ab, surPlace(PARIS)), true);
  assert.equal(A.concerne(ab, surPlace(LYON)), true);
  assert.equal(A.concerne(ab, surPlace(BORDEAUX)), false);
});

/* LE POINT QUI JUSTIFIE TOUT LE DISPOSITIF : quelqu'un de Villeurbanne doit
   recevoir l'atelier de Lyon, à quatre kilomètres. Une comparaison de noms
   l'aurait raté, et personne n'aurait compris pourquoi. */
test("le voisinage compte, pas le nom de la commune", () => {
  const villeurbannais = abo("physique", [VILLEURBANNE], 15);
  assert.equal(A.concerne(villeurbannais, surPlace(LYON)), true);
  // Saint-Étienne est à 51 km : hors de son rayon de 15 km.
  assert.equal(A.concerne(villeurbannais, surPlace(ST_ETIENNE)), false);
  // Le même, prêt à prendre le train, le reçoit.
  assert.equal(A.concerne(abo("physique", [VILLEURBANNE], 100), surPlace(ST_ETIENNE)), true);
});

/* « Si on prend Paris c'est très large » : 50 km autour de Paris, c'est Melun.
   Le rayon par défaut s'adapte donc à la densité de la commune. */
test("le rayon par defaut s'adapte a la commune", () => {
  assert.equal(abo("physique", [PARIS]).rayonKm, 15);
  assert.equal(C.rayonPropose("48095") >= 50, true, "une commune rurale propose un grand rayon");
  // Un Parisien par défaut ne reçoit pas Melun ; à 50 km choisis, si.
  assert.equal(A.concerne(abo("physique", [PARIS]), surPlace(MELUN)), false);
  assert.equal(A.concerne(abo("physique", [PARIS], 50), surPlace(MELUN)), true);
  // Un choix explicite l'emporte toujours sur la proposition.
  assert.equal(abo("physique", [PARIS], 100).rayonKm, 100);
});

test("un atelier sans commune ne concerne personne : on ne devine pas", () => {
  const ab = abo("les_deux", [LYON], 100);
  assert.equal(A.concerne(ab, { mode: "physique", lieu: "Lyon" }), false);
  assert.equal(A.concerne(ab, { mode: "physique", commune: "99999" }), false);
});

test("un abonne au presentiel SANS commune valide est refuse", () => {
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "physique", communes: [] }, NOW).erreur);
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "les_deux", communes: ["Lyon"] }, NOW).erreur);
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "les_deux", communes: ["99999"] }, NOW).erreur);
  // En ligne uniquement : pas de departement demande.
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "enligne" }, NOW).abonne);
});

test("rien a annoncer = aucun mail", () => {
  assert.equal(A.envoisDeLaSemaine([abo("les_deux", [LYON])], [], NOW).length, 0);
  assert.equal(A.envoisDeLaSemaine([abo("enligne")], [surPlace(LYON)], NOW).length, 0);
});

test("ateliers ecartes : prive, passe, trop loin, complet", () => {
  const ab = abo("les_deux", [LYON]);
  const ecartes = [
    enLigne({ visibilite: "prive" }),
    enLigne({ quandMs: NOW - JOUR }),
    enLigne({ quandMs: NOW + 90 * JOUR }),
    enLigne({ maxParticipants: 2, participants: [1, 2] })
  ];
  for (const a of ecartes) assert.equal(A.annoncable(a, NOW), false);
  assert.equal(A.envoisDeLaSemaine([ab], ecartes, NOW).length, 0);
});

test("un seul mail par semaine, contenant TOUT ce qui concerne la personne", () => {
  const ab = abo("les_deux", [LYON, PARIS], 30);
  const ateliers = [
    surPlace(LYON, { quandMs: NOW + 5 * JOUR, code: "c" }),
    enLigne({ quandMs: NOW + 2 * JOUR, code: "a" }),
    surPlace(PARIS, { quandMs: NOW + 3 * JOUR, code: "b" }),
    surPlace(BORDEAUX, { code: "hors" })
  ];
  const envois = A.envoisDeLaSemaine([ab], ateliers, NOW);
  assert.equal(envois.length, 1);
  assert.deepEqual(envois[0].ateliers.map((a) => a.code), ["a", "b", "c"]); // tries par date

  const g = A.grouper(envois[0].ateliers);
  assert.equal(g.enligne.length, 1);
  assert.deepEqual(g.villes.map((v) => v.ville), [C.libelle(PARIS), C.libelle(LYON)]);

  // Deja servi il y a deux jours : silence, meme s'il y a du neuf.
  const servi = { ...ab, dernierEnvoi: NOW - 2 * JOUR };
  assert.equal(A.envoisDeLaSemaine([servi], ateliers, NOW).length, 0);
  // Huit jours : de nouveau eligible.
  const vieux = { ...ab, dernierEnvoi: NOW - 8 * JOUR };
  assert.equal(A.envoisDeLaSemaine([vieux], ateliers, NOW).length, 1);
});

test("desabonne : plus rien, jamais", () => {
  const ab = { ...abo("les_deux", [LYON]), actif: false };
  assert.equal(A.envoisDeLaSemaine([ab], [enLigne()], NOW).length, 0);
});

test("communes : liste fermee et officielle", () => {
  assert.ok(C.nombre() > 34000, "toutes les communes de France");
  assert.ok(C.valide(LYON) && C.valide("2A004") && C.valide("97105"));
  assert.ok(!C.valide("99999") && !C.valide("Lyon") && !C.valide(""));
  assert.equal(C.libelle(LYON), "Lyon (69)");
  assert.equal(C.departement("97105"), "971");
});

test("distances : les trois grandes villes ont bien une position", () => {
  // Paris, Lyon et Marseille sont absentes de la base postale (qui ne connaît
  // que leurs arrondissements). Sans rattachement, elles n'auraient aucune
  // position et personne ne recevrait jamais un atelier parisien.
  for (const c of [PARIS, LYON, "13055"]) assert.ok(C.position(c), c);
  assert.ok(Math.abs(C.entre(LYON, VILLEURBANNE) - 4) < 3);
  assert.ok(Math.abs(C.entre(LYON, PARIS) - 392) < 15);
  assert.equal(C.entre(LYON, "99999"), Infinity);
});

/* Garde-fou : le formulaire et le serveur lisent le MEME fichier de communes. */
test("le formulaire charge la liste servie par le site", async () => {
  const fs = await import("node:fs");
  const data = fs.readFileSync(new URL("../../site/data/communes.txt", import.meta.url), "utf8");
  const lignes = data.split("\n").filter(Boolean);
  assert.equal(lignes.length, C.nombre());
  for (const l of lignes.slice(0, 50)) assert.match(l, /^[0-9AB]{5};[^;]+;[0-9]*;(15|30|50|100)$/);
  for (const f of ["site/devenir-animateur/index.html", "site/en/facilitate/index.html"]) {
    const html = fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    // Le champ visible ne sert qu'a chercher : c'est le champ cache qui part.
    assert.match(html, /<input type="hidden" name="commune">/);
    assert.match(html, /champs-physique[\s\S]*name="commune"/);
    assert.match(html, /assets\/js\/commune\.js/);
  }
  const part = fs.readFileSync(new URL("../../site/participer/index.html", import.meta.url), "utf8");
  assert.match(part, /id="commune-champ"/);
  assert.match(part, /name="rayonKm"/);
});
