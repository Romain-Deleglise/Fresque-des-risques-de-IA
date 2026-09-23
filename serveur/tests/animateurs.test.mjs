/* Qui mérite une relance, et surtout qui n'en mérite pas. Une relance de trop
   sur une association bénévole, c'est quelqu'un qui part. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const An = require("../src/animateurs.js");

const NOW = Date.UTC(2026, 5, 1);
const J = 24 * 60 * 60 * 1000;

const anime = (jours, extra = {}) => ({
  mail: "a@b.fr", prenom: "Alex", animateur: true, nbAnimations: 1, desinscrit: false,
  ateliers: [{ code: "AAA", role: "animateur", quandMs: NOW - jours * J }], ...extra
});

test("relance qui a animé il y a longtemps et n'a rien de prévu", () => {
  const r = An.inactifs([anime(200)], [], NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].joursDepuis, 200);
});

test("ne relance pas quelqu'un qui a animé récemment", () => {
  assert.equal(An.inactifs([anime(30)], [], NOW).length, 0);
});

test("ne relance pas quelqu'un qui a déjà un atelier à venir", () => {
  const ateliers = [{ quandMs: NOW + 10 * J, animateur: { mail: "A@B.fr" } }];
  assert.equal(An.inactifs([anime(200)], ateliers, NOW).length, 0);
  // Un atelier passé ne protège pas : c'est justement le cas à relancer.
  const passes = [{ quandMs: NOW - 10 * J, animateur: { mail: "a@b.fr" } }];
  assert.equal(An.inactifs([anime(200)], passes, NOW).length, 1);
});

test("au plus une relance par semestre", () => {
  assert.equal(An.inactifs([anime(200, { relanceMs: NOW - 10 * J })], [], NOW).length, 0);
  assert.equal(An.inactifs([anime(200, { relanceMs: NOW - 200 * J })], [], NOW).length, 1);
});

test("jamais un désinscrit, jamais un simple participant", () => {
  assert.equal(An.inactifs([anime(200, { desinscrit: true })], [], NOW).length, 0);
  const participant = {
    mail: "p@b.fr", animateur: false, participant: true, desinscrit: false,
    ateliers: [{ code: "BBB", role: "participant", quandMs: NOW - 300 * J }]
  };
  assert.equal(An.inactifs([participant], [], NOW).length, 0);
});

test("les plus anciens d'abord : c'est par eux qu'il faut commencer", () => {
  const r = An.inactifs([anime(150, { mail: "b@b.fr" }), anime(400, { mail: "c@b.fr" })], [], NOW);
  assert.deepEqual(r.map((x) => x.mail), ["c@b.fr", "b@b.fr"]);
});

test("un contact animateur sans atelier animé daté n'est pas relancé au hasard", () => {
  const bizarre = { mail: "x@b.fr", animateur: true, ateliers: [], desinscrit: false };
  assert.equal(An.inactifs([bizarre], [], NOW).length, 0);
});
