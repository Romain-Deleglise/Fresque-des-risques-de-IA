/* Communes françaises : liste fermée, avec positions.

   POURQUOI UNE LISTE FERMÉE. Une saisie libre paraît plus simple, et elle ne
   marche pas : « Lyon », « lyon », « Lyon 7e » et « LYON » ne se rencontrent
   jamais, et l'abonné ne reçoit rien sans que personne ne comprenne pourquoi.
   Ici les deux côtés -- la personne qui s'abonne et l'atelier programmé --
   portent un code INSEE de la même liste.

   POURQUOI UN RAYON, ET PAS LA COMMUNE EXACTE. Quelqu'un à Villeurbanne qui
   raterait l'atelier de Lyon, à trois kilomètres, serait la pire version de ce
   service. On compare donc des distances, pas des noms.

   Données produites par scripts/generer-communes.mjs (source : Code officiel
   géographique de l'INSEE). Les coordonnées restent côté serveur. */
"use strict";
var fs = require("fs");
var path = require("path");

var NOMS = null, POS = null;

/* OU SONT LES FICHIERS. Deux dispositions, et le code doit tenir les deux :
   dans le depot, ce module est a serveur/src/ et les tables sont au-dessus ;
   une fois deploye, esbuild a replie tout le code en un seul fichier et
   `included_files` (voir netlify.toml) a recopie les tables en gardant leur
   chemin depuis la racine du depot, a cote de ce fichier plie. `__dirname` ne
   designe donc plus la meme chose des deux cotes. Plutot que de deviner, on
   essaie les emplacements possibles et on prend le premier qui existe. */
function trouver(candidats) {
  for (var i = 0; i < candidats.length; i++) {
    try { if (fs.existsSync(candidats[i])) return candidats[i]; } catch (e) { /* on continue */ }
  }
  var e2 = new Error("Table des communes introuvable. Cherchee a : " + candidats.join(", ")
    + ". Si ce message apparait en production, c'est que `included_files` ne couvre plus ces"
    + " fichiers dans netlify.toml.");
  e2.code = "COMMUNES_ABSENTES";
  throw e2;
}

/* CHARGEMENT TOUT OU RIEN. La version precedente posait `NOMS = {}` AVANT de
   lire les fichiers : des que la lecture echouait, le `if (NOMS) return` du
   dessus voyait une table non nulle et la croyait chargee. Le module restait
   alors empoisonne avec une table VIDE pour toute la duree du conteneur, et
   `valide()` repondait « non » a toutes les communes de France. Cote visiteur
   cela donnait « Choisissez au moins une commune dans la liste » alors qu'une
   commune etait bien choisie : un defaut qui accuse l'utilisateur d'une panne
   du serveur. On construit donc a cote, et on ne publie qu'une fois les deux
   tables completes ; un echec laisse NOMS a null, donc reessaye au coup
   suivant au lieu de mentir indefiniment. */
function charger() {
  if (NOMS) return;
  var noms = Object.create(null);
  var pos = Object.create(null);

  var fNoms = trouver([
    path.join(__dirname, "..", "..", "site", "data", "communes.txt"),
    path.join(process.cwd(), "site", "data", "communes.txt"),
    path.join(__dirname, "site", "data", "communes.txt")
  ]);
  fs.readFileSync(fNoms, "utf8").split("\n").forEach(function (ligne) {
    if (!ligne) return;
    var p = ligne.split(";");
    noms[p[0]] = { nom: p[1], cp: p[2] || "", rayon: Number(p[3]) || 50 };
  });

  var fPos = trouver([
    path.join(__dirname, "communes-coords.txt"),
    path.join(process.cwd(), "serveur", "src", "communes-coords.txt"),
    path.join(__dirname, "serveur", "src", "communes-coords.txt")
  ]);
  fs.readFileSync(fPos, "utf8").split("\n").forEach(function (ligne) {
    if (!ligne) return;
    var p = ligne.split(";");
    pos[p[0]] = [Number(p[1]), Number(p[2])];
  });

  NOMS = noms;
  POS = pos;
}

function normaliserCode(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

function valide(code) {
  charger();
  return !!NOMS[normaliserCode(code)];
}

function nom(code) {
  charger();
  var c = NOMS[normaliserCode(code)];
  return c ? c.nom : "";
}

/* Ce qu'on affiche dans un e-mail ou dans l'espace d'administration :
   « Lyon (69) ». Le département lève l'ambiguïté des nombreux homonymes. */
function libelle(code) {
  charger();
  var k = normaliserCode(code);
  var c = NOMS[k];
  if (!c) return k;
  return c.nom + " (" + departement(k) + ")";
}

/* Le département se lit dans le code INSEE : deux caractères, trois pour
   l'outre-mer (971…). La Corse est « 2A » / « 2B ». */
function departement(code) {
  var k = normaliserCode(code);
  return k.slice(0, 2) === "97" ? k.slice(0, 3) : k.slice(0, 2);
}

function position(code) {
  charger();
  return POS[normaliserCode(code)] || null;
}

/* Distance à vol d'oiseau, en kilomètres (formule de haversine). La précision
   au mètre n'a aucun intérêt ici : on compare à des rayons de 25 à 100 km. */
function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  var R = 6371;
  var rad = Math.PI / 180;
  var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* Distance entre deux communes. Infinity si l'une des deux est inconnue :
   mieux vaut ne pas envoyer que d'envoyer au hasard. */
function entre(codeA, codeB) {
  return distanceKm(position(codeA), position(codeB));
}

/* Rayon proposé par défaut pour cette commune. Calculé à la génération : le
   plus petit rayon qui met ~250 000 personnes à portée. 15 km à Paris, 100 km
   en Lozère. Ce n'est qu'une valeur pré-remplie, la personne peut la changer. */
function rayonPropose(code) {
  charger();
  var c = NOMS[normaliserCode(code)];
  return c ? c.rayon : 50;
}

function nombre() { charger(); return Object.keys(NOMS).length; }

module.exports = {
  valide: valide, nom: nom, libelle: libelle, departement: departement,
  position: position, distanceKm: distanceKm, entre: entre,
  rayonPropose: rayonPropose, nombre: nombre
};
