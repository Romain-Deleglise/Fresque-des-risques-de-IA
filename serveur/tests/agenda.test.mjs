/* L'agenda public : ce qui en sort, et surtout ce qui n'en sort pas. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../src/agenda.js");

const BASE = "https://fresquedesrisquesdelia.org";
// 24 septembre 2026, 17 h a Paris (ete, donc UTC+2) -> 15 h UTC.
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);

const atelier = (o) => Object.assign({
  code: "ABC123", visibilite: "public", mode: "physique",
  date: "2026-09-24", heure: "17:00", lieu: "Lyon", commune: "69123",
  maxParticipants: 8, participants: [], animateur: { prenom: "Léa", mail: "lea@ex.org" }
}, o);

test("un atelier privé ne sort jamais de l'agenda public", () => {
  const l = G.publiables([atelier({ visibilite: "prive" })], NOW);
  assert.equal(l.length, 0);
});

test("un atelier déjà terminé ne sort pas non plus", () => {
  const passe = atelier({ date: "2026-09-01" });
  assert.equal(G.publiables([passe], NOW).length, 0);
  // Pendant l'atelier, en revanche, il reste publié : quelqu'un peut encore
  // le voir dans son agenda le jour même. 17 h 15 à Paris, soit un quart
  // d'heure après le début.
  const pendant = Date.UTC(2026, 8, 24, 15, 15, 0);
  assert.equal(G.publiables([atelier()], pendant).length, 1);
});

test("aucune adresse e-mail ne peut fuir", () => {
  const j = G.agendaJson([atelier()], NOW, BASE);
  assert.ok(!JSON.stringify(j).includes("lea@ex.org"));
  const ics = G.agendaIcal([atelier()], NOW, BASE);
  assert.ok(!ics.includes("lea@ex.org"));
  // Le prénom, lui, est déjà public sur la page Participer.
  assert.equal(j.ateliers[0].animateur, "Léa");
});

/* L'HEURE EST RECALCULEE, jamais lue dans le `quandMs` enregistré : celui-ci a
   pu être posé avant un changement d'heure. Publier une heure fausse dans
   l'agenda de quelqu'un d'autre est pire que ne rien publier. */
test("l'heure est recalculée depuis la date et l'heure de Paris", () => {
  const faux = atelier({ quandMs: Date.UTC(2026, 8, 24, 17, 0, 0) });  // 2 h de trop
  const j = G.agendaJson([faux], NOW, BASE);
  assert.equal(j.ateliers[0].debut, "2026-09-24T17:00:00+02:00");
  assert.equal(j.ateliers[0].debutMs, Date.UTC(2026, 8, 24, 15, 0, 0));
  assert.match(G.agendaIcal([faux], NOW, BASE), /DTSTART:20260924T150000Z/);
});

test("un atelier d'hiver porte le bon décalage", () => {
  const hiver = atelier({ date: "2026-12-10", heure: "18:30" });
  const j = G.agendaJson([hiver], NOW, BASE);
  assert.equal(j.ateliers[0].debut, "2026-12-10T18:30:00+01:00");
});

test("les ateliers sortent dans l'ordre chronologique", () => {
  const l = G.publiables([
    atelier({ code: "TARD00", date: "2026-11-02" }),
    atelier({ code: "TOT000", date: "2026-09-24" }),
    atelier({ code: "MILIEU", date: "2026-10-05" })
  ], NOW);
  assert.deepEqual(l.map((a) => a.code), ["TOT000", "MILIEU", "TARD00"]);
});

/* DEUX HEURES ET DEMIE, pas deux : c'est la duree reelle constatee en atelier.
   Un agenda sert a reserver du temps, et une demi-heure de trop vaut mieux
   qu'un rendez-vous suivant au milieu de la restitution. */
test("l'atelier dure deux heures et demie dans l'agenda", () => {
  assert.equal(G.DUREE_MS, 150 * 60 * 1000);
  const j = G.agendaJson([atelier()], NOW, BASE);      // 17 h 00 a Paris
  assert.equal(j.ateliers[0].fin, "2026-09-24T19:30:00+02:00");
  assert.match(G.agendaIcal([atelier()], NOW, BASE), /DTEND:20260924T173000Z/);
});

/* L'identifiant doit être STABLE : sans cela, chaque relecture du calendrier
   créerait un doublon au lieu de mettre à jour l'événement. */
test("l'identifiant d'un événement ne dépend que du code de l'atelier", () => {
  const a = G.agendaIcal([atelier()], NOW, BASE);
  const b = G.agendaIcal([atelier({ participants: [{ prenom: "X" }] })], NOW + 99999, BASE);
  const uid = (s) => s.match(/UID:(.*)/)[1];
  assert.equal(uid(a), uid(b));
  assert.equal(uid(a).trim(), "atelier-ABC123@fresquedesrisquesdelia.org");
});

test("les caractères spéciaux sont échappés selon la RFC 5545", () => {
  assert.equal(G.echapper("a;b,c\\d\ne"), "a\;b\\,c\\\\d\\ne");
  const ics = G.agendaIcal([atelier({ titre: "Fresque, à Lyon; 2e édition" })], NOW, BASE);
  assert.match(ics, /SUMMARY:Fresque\\, à Lyon\; 2e édition/);
});

/* Le pliage se compte en OCTETS, pas en caractères : une ligne d'accents
   compte double en UTF-8, et une ligne trop longue fait rejeter le fichier
   par certains agendas. */
test("les lignes longues sont pliées sans couper un caractère", () => {
  const long = "DESCRIPTION:" + "é".repeat(120);
  const plie = G.plier(long);
  for (const ligne of plie.split("\r\n")) {
    assert.ok(Buffer.byteLength(ligne, "utf8") <= 75,
      `ligne de ${Buffer.byteLength(ligne, "utf8")} octets`);
  }
  // Rien n'est perdu : déplié, on retrouve le texte d'origine.
  assert.equal(plie.split("\r\n ").join(""), long);
});

test("le calendrier est bien formé même sans aucun atelier", () => {
  const ics = G.agendaIcal([], NOW, BASE);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("un atelier en ligne n'annonce pas de commune", () => {
  const j = G.agendaJson([atelier({ mode: "enligne", lieu: "", commune: null })], NOW, BASE);
  assert.equal(j.ateliers[0].lieu, "En ligne");
  assert.equal(j.ateliers[0].commune, null);
});
