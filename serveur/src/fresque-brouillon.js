/* BROUILLON DE LA FRESQUE DE REFERENCE : logique PURE (aucune I/O).

   La fresque de reference est le rendu final qu'on montre aux animateur·ices :
   quelles cartes, ou, et reliees comment. La construire se faisait jusqu'ici en
   editant site/data/fresque-reference.json a la main, coordonnee par
   coordonnee. Ces regles permettent de la poser dans l'outil, puis de publier
   le fichier d'un coup.

   CE QU'ON VALIDE, ET POURQUOI. Un tableau mal forme ne casse pas bruyamment :
   il produit une fresque ou deux cartes se superposent, ou une fleche part
   d'une carte absente et ne se dessine pas. On refuse donc en amont ce qui ne
   se verrait qu'a l'oeil, trop tard.
*/
"use strict";

var MAX_LIBELLE = 60, MAX_FLECHES = 300, MAX_TEXTES = 20, MAX_CONTENU = 80;
// Ecart maximal du point de controle d'une fleche, en pixels du plan : la
// meme borne que l'outil (site/animateurs/animateurs.js).
var COURBE_MAX = 600;
var CARTE_MIN = 1, CARTE_MAX = 38;

function nombre(v) { var n = Number(v); return isFinite(n) ? Math.round(n) : null; }
function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Une position tient DANS le plan, et la carte entiere avec elle : une carte
   posee a cheval sur le bord serait rognee a l'affichage, sans message. */
function dansLePlan(x, y, plan) {
  var w = plan.carte.largeur, h = plan.carte.hauteur;
  return x >= 0 && y >= 0 && x + w <= plan.largeur && y + h <= plan.hauteur;
}

function valider(tableau, plan) {
  tableau = tableau || {};
  var plan2 = plan || { largeur: 2840, hauteur: 1750, carte: { largeur: 160, hauteur: 150 } };

  var cartes = [], vues = {};
  var brutes = Array.isArray(tableau.cartes) ? tableau.cartes : [];
  for (var i = 0; i < brutes.length; i++) {
    var c = brutes[i] || {};
    var n = nombre(c.n), x = nombre(c.x), y = nombre(c.y);
    if (n === null || n < CARTE_MIN || n > CARTE_MAX) return { erreur: "Carte inconnue : " + c.n + "." };
    if (vues[n]) return { erreur: "La carte " + n + " est posée deux fois." };
    if (x === null || y === null) return { erreur: "La carte " + n + " n'a pas de position." };
    if (!dansLePlan(x, y, plan2)) return { erreur: "La carte " + n + " sort du plan." };
    vues[n] = true;
    cartes.push({ n: n, x: x, y: y });
  }
  if (!cartes.length) return { erreur: "Une fresque sans carte ne sert à rien." };

  var fleches = [], idsVus = {};
  var bf = Array.isArray(tableau.fleches) ? tableau.fleches : [];
  if (bf.length > MAX_FLECHES) return { erreur: "Trop de liens." };
  for (var j = 0; j < bf.length; j++) {
    var f = bf[j] || {};
    var de = nombre(f.de), vers = nombre(f.vers);
    /* UNE FLECHE QUI PART D'UNE CARTE ABSENTE NE SE DESSINE PAS. Elle ne
       provoque pas d'erreur non plus : elle disparait, et on cherche longtemps
       pourquoi le lien qu'on vient de tracer n'apparait pas. */
    if (!vues[de] || !vues[vers]) return { erreur: "Un lien part ou arrive sur une carte absente du plan." };
    if (de === vers) return { erreur: "Un lien ne peut pas relier une carte à elle-même." };
    var id = tronque(f.id, 24) || ("f" + (j + 1));
    if (idsVus[id]) return { erreur: "Deux liens portent la même référence." };
    idsVus[id] = true;
    /* LE TRAJET CHOISI A LA MAIN. `courbe` est l'ecart, en pixels du plan,
       entre le point de controle calcule et celui qu'on a pose. Borne : plus
       loin, la fleche part a l'autre bout du plan et on ne la retrouve plus.
       Absent ou nul, on ne l'ecrit pas : un plan sans courbure voulue reste
       octet pour octet celui d'avant. */
    var lien = { id: id, de: de, vers: vers, bidir: !!f.bidir, libelle: tronque(f.libelle, MAX_LIBELLE) };
    var cb = f.courbe || {};
    var cbx = nombre(cb.x), cby = nombre(cb.y);
    if (cbx !== null || cby !== null) {
      cbx = Math.max(-COURBE_MAX, Math.min(COURBE_MAX, cbx || 0));
      cby = Math.max(-COURBE_MAX, Math.min(COURBE_MAX, cby || 0));
      if (cbx || cby) lien.courbe = { x: cbx, y: cby };
    }
    fleches.push(lien);
  }

  var textes = [];
  var bt = Array.isArray(tableau.textes) ? tableau.textes : [];
  if (bt.length > MAX_TEXTES) return { erreur: "Trop d'étiquettes." };
  for (var k = 0; k < bt.length; k++) {
    var t = bt[k] || {};
    var tx = nombre(t.x), ty = nombre(t.y), contenu = tronque(t.contenu, MAX_CONTENU);
    if (tx === null || ty === null || !contenu) continue;   // une etiquette vide se jette
    textes.push({ id: tronque(t.id, 24) || ("t" + (k + 1)), x: tx, y: ty, contenu: contenu });
  }

  return { tableau: { cartes: cartes, fleches: fleches, textes: textes } };
}

/* Le fichier complet, pret a etre depose. On conserve `version`, le commentaire
   d'en-tete et le plan : seul le tableau change. */
function appliquer(fichier, tableau) {
  return Object.assign({}, fichier, { tableau: tableau });
}

/* DEUX TABLEAUX DISENT-ILS LA MEME CHOSE ? Sert au menage du calque : le jour
   ou le depot porte le plan publie en ligne, le calque n'a plus rien a ajouter
   et doit disparaitre tout seul, comme celui des cartes (brouillons.residu).
   On compare apres normalisation, pour qu'un ordre de cles different ou une
   coordonnee ecrite 100 contre 100.0 ne fasse pas croire a une difference. */
function normaliser(t) {
  t = t || {};
  return JSON.stringify({
    cartes: (t.cartes || []).map(function (c) { return [c.n, c.x, c.y]; })
      .sort(function (a, b) { return a[0] - b[0]; }),
    fleches: (t.fleches || []).map(function (f) {
      var c = f.courbe || {};
      return [f.id, f.de, f.vers, !!f.bidir, f.libelle || "", c.x || 0, c.y || 0];
    })
      .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }),
    textes: (t.textes || []).map(function (x) { return [x.id, x.x, x.y, x.contenu]; })
      .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })
  });
}
function identique(a, b) { return normaliser(a) === normaliser(b); }

/* Ce qui a bouge par rapport au fichier publie, pour relire avant de deposer. */
function resume(avant, apres) {
  var a = {}, deplacees = 0;
  ((avant && avant.cartes) || []).forEach(function (c) { a[c.n] = c; });
  ((apres && apres.cartes) || []).forEach(function (c) {
    var v = a[c.n];
    if (!v || v.x !== c.x || v.y !== c.y) deplacees++;
  });
  var idsAvant = ((avant && avant.fleches) || []).map(function (f) { return f.id; });
  var idsApres = ((apres && apres.fleches) || []).map(function (f) { return f.id; });
  return {
    cartesDeplacees: deplacees,
    cartesAjoutees: ((apres && apres.cartes) || []).length - ((avant && avant.cartes) || []).length,
    liensAjoutes: idsApres.filter(function (id) { return idsAvant.indexOf(id) === -1; }).length,
    liensRetires: idsAvant.filter(function (id) { return idsApres.indexOf(id) === -1; }).length
  };
}

module.exports = {
  MAX_LIBELLE: MAX_LIBELLE, CARTE_MIN: CARTE_MIN, CARTE_MAX: CARTE_MAX,
  dansLePlan: dansLePlan, valider: valider, appliquer: appliquer, resume: resume,
  identique: identique
};
