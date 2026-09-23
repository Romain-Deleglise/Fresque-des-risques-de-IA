/* Table de verite des alertes : QUI recoit QUOI.
   Ecrite exhaustivement (3 formats x 3 natures d'atelier) pour qu'aucun cas ne
   depende d'une relecture. Un mail inutile est aussi grave qu'un mail manquant. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../src/alertes.js");
const Z = require("../src/departements.js");

const NOW = Date.UTC(2026, 0, 12);
const JOUR = 24 * 60 * 60 * 1000;

const enLigne = (o = {}) => ({ mode: "enligne", visibilite: "public", quandMs: NOW + 10 * JOUR, participants: [], maxParticipants: 30, ...o });
const surPlace = (dep, o = {}) => ({ mode: "physique", visibilite: "public", quandMs: NOW + 10 * JOUR, participants: [], maxParticipants: 20, departement: dep, lieu: Z.nom(dep), ...o });

const abo = (format, zones = []) => A.validerAbonnement({ mail: "a@b.fr", format, zones }, NOW).abonne;

test("table de verite : format x nature d'atelier", () => {
  const cas = [
    // [format, zones, atelier, recoit ?]
    ["enligne", [], enLigne(), true],
    ["enligne", [], surPlace("69"), false],
    ["physique", ["69"], enLigne(), false],
    ["physique", ["69"], surPlace("69"), true],
    ["physique", ["69"], surPlace("75"), false],
    ["les_deux", ["69"], enLigne(), true],
    ["les_deux", ["69"], surPlace("69"), true],
    ["les_deux", ["69"], surPlace("75"), false]
  ];
  for (const [format, zones, atelier, attendu] of cas) {
    assert.equal(A.concerne(abo(format, zones), atelier), attendu,
      `${format} ${JSON.stringify(zones)} vs ${atelier.mode} ${atelier.departement || ""}`);
  }
});

test("plusieurs departements choisis : chacun compte", () => {
  const ab = abo("les_deux", ["69", "75", "BE"]);
  assert.equal(A.concerne(ab, surPlace("75")), true);
  assert.equal(A.concerne(ab, surPlace("BE")), true);
  assert.equal(A.concerne(ab, surPlace("33")), false);
});

test("un abonne au presentiel SANS departement est refuse", () => {
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "physique", zones: [] }, NOW).erreur);
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "les_deux", zones: ["zzz"] }, NOW).erreur);
  // En ligne uniquement : pas de departement demande.
  assert.ok(A.validerAbonnement({ mail: "a@b.fr", format: "enligne" }, NOW).abonne);
});

test("rien a annoncer = aucun mail", () => {
  assert.equal(A.envoisDeLaSemaine([abo("les_deux", ["69"])], [], NOW).length, 0);
  assert.equal(A.envoisDeLaSemaine([abo("enligne")], [surPlace("69")], NOW).length, 0);
});

test("ateliers ecartes : prive, passe, trop loin, complet", () => {
  const ab = abo("les_deux", ["69"]);
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
  const ab = abo("les_deux", ["69", "75"]);
  const ateliers = [
    surPlace("69", { quandMs: NOW + 5 * JOUR, code: "c" }),
    enLigne({ quandMs: NOW + 2 * JOUR, code: "a" }),
    surPlace("75", { quandMs: NOW + 3 * JOUR, code: "b" }),
    surPlace("33", { code: "hors" })
  ];
  const envois = A.envoisDeLaSemaine([ab], ateliers, NOW);
  assert.equal(envois.length, 1);
  assert.deepEqual(envois[0].ateliers.map((a) => a.code), ["a", "b", "c"]); // tries par date

  const g = A.grouper(envois[0].ateliers);
  assert.equal(g.enligne.length, 1);
  assert.deepEqual(g.villes.map((v) => v.ville), [Z.libelle("75"), Z.libelle("69")]);

  // Deja servi il y a deux jours : silence, meme s'il y a du neuf.
  const servi = { ...ab, dernierEnvoi: NOW - 2 * JOUR };
  assert.equal(A.envoisDeLaSemaine([servi], ateliers, NOW).length, 0);
  // Huit jours : de nouveau eligible.
  const vieux = { ...ab, dernierEnvoi: NOW - 8 * JOUR };
  assert.equal(A.envoisDeLaSemaine([vieux], ateliers, NOW).length, 1);
});

test("desabonne : plus rien, jamais", () => {
  const ab = { ...abo("les_deux", ["69"]), actif: false };
  assert.equal(A.envoisDeLaSemaine([ab], [enLigne()], NOW).length, 0);
});

test("departements : liste fermee", () => {
  assert.ok(Z.valide("69") && Z.valide("2A") && Z.valide("BE"));
  assert.ok(!Z.valide("00") && !Z.valide("Lyon") && !Z.valide(""));
  assert.equal(Z.libelle("69"), "69 - Rhône");
});

/* Garde-fou : le formulaire des animateurs et la validation serveur lisent la
   MEME liste. Une divergence rangerait des ateliers dans une zone a laquelle
   personne ne peut s'abonner -- silencieusement. */
test("les formulaires proposent exactement les zones acceptees", async () => {
  const fs = await import("node:fs");
  const codes = Object.keys(Z.ZONES);
  for (const f of ["site/devenir-animateur/index.html", "site/en/facilitate/index.html"]) {
    const html = fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const bloc = html.match(/<select name="departement"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(bloc, "select départment absent de " + f);
    const vus = [...bloc[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    assert.deepEqual(vus, codes, f);
    // Masqué en ligne : il ne doit pas bloquer un atelier distanciel.
    assert.match(html, /champs-physique[\s\S]*name="departement"/);
  }
});
