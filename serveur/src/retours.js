/* Retours d'atelier et temoignages : logique PURE (aucune I/O).
   La persistance (Netlify Blobs) est branchee par-dessus dans
   netlify/functions/retour.js, et la lecture dans admin.js.

   DEUX FORMULAIRES, DEUX FINALITES. Le retour d'atelier est interne : il sert
   a corriger le jeu, personne ne le publie. Le temoignage est destine a etre
   affiche, donc il exige un consentement explicite et ne se publie qu'apres
   relecture. Melanger les deux ferait publier par megarde une critique
   ecrite pour nous. */
"use strict";

var MAX = { texte: 2000, court: 120, nom: 60, mail: 120 };
var DUREES = ["trop_courte", "juste", "trop_longue"];
var ROLES = ["participant", "animateur"];
var FORMATS = ["enligne", "physique"];

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }
function dans(v, liste) { v = tronque(v, 40); return liste.indexOf(v) === -1 ? "" : v; }

/* Un formulaire public finit toujours par etre visite par des robots. Le champ
   piege est invisible a l'ecran et vide pour un humain : rempli, on jette
   sans le dire, ce qui evite d'apprendre au robot comment passer. */
function estUnRobot(corps) {
  return !!tronque(corps && corps.site, 200);
}

/* --- Retour d'atelier ---------------------------------------------------- */
function validerRetour(corps, now) {
  corps = corps || {};
  var champs = {
    marquant: tronque(corps.marquant, MAX.texte),
    pasClair: tronque(corps.pasClair, MAX.texte),
    creuser: tronque(corps.creuser, MAX.texte),
    carte: tronque(corps.carte, MAX.texte),
    technique: tronque(corps.technique, MAX.texte),
    autre: tronque(corps.autre, MAX.texte)
  };
  // Un formulaire entierement vide n'apprend rien : on le refuse plutot que
  // de remplir le magasin de coquilles.
  var remplis = Object.keys(champs).filter(function (k) { return champs[k].length >= 3; });
  if (!remplis.length) {
    return { erreur: "Dites-nous au moins une chose avant d’envoyer." };
  }
  return {
    retour: {
      genre: "atelier",
      role: dans(corps.role, ROLES) || "participant",
      format: dans(corps.format, FORMATS),
      dateAtelier: tronque(corps.dateAtelier, 20),
      duree: dans(corps.duree, DUREES),
      marquant: champs.marquant,
      pasClair: champs.pasClair,
      creuser: champs.creuser,
      carte: champs.carte,
      technique: champs.technique,
      autre: champs.autre,
      mail: valideMail(corps.mail),
      date: now,
      traite: false
    }
  };
}

function valideMail(v) {
  var m = tronque(v, MAX.mail);
  return m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) ? m : "";
}

/* --- Temoignage ---------------------------------------------------------- */
function validerTemoignage(corps, now) {
  corps = corps || {};
  var texte = tronque(corps.texte, MAX.texte);
  if (texte.length < 20) {
    return { erreur: "Votre témoignage est un peu court : quelques phrases suffisent." };
  }
  var prenom = tronque(corps.prenom, MAX.nom);
  if (!prenom) return { erreur: "Indiquez le prénom ou le pseudo à afficher." };
  // Le consentement n'est pas une case parmi d'autres : sans lui, on n'a pas
  // le droit de publier, donc on ne stocke pas non plus.
  if (corps.accord !== true) {
    return { erreur: "Nous avons besoin de votre accord pour publier ce témoignage." };
  }
  return {
    temoignage: {
      genre: "temoignage",
      texte: texte,
      prenom: prenom,
      precision: tronque(corps.precision, MAX.court),
      mail: valideMail(corps.mail),
      accord: true,
      date: now,
      publie: false
    }
  };
}

/* Cle de rangement : le genre en tete, pour lister l'un sans relire l'autre. */
function cle(entree, id) { return entree.genre + ":" + id; }

/* Ce qu'on montre dans l'espace admin. L'adresse est conservee (on peut avoir
   a repondre) mais jamais renvoyee ailleurs que la. */
function pourAdmin(entree, cle_) {
  var o = {};
  Object.keys(entree).forEach(function (k) { o[k] = entree[k]; });
  o.cle = cle_;
  return o;
}

module.exports = {
  MAX: MAX, DUREES: DUREES, ROLES: ROLES, FORMATS: FORMATS,
  estUnRobot: estUnRobot, validerRetour: validerRetour,
  validerTemoignage: validerTemoignage, cle: cle, pourAdmin: pourAdmin
};
