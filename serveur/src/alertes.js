/* Alertes « prochains ateliers » : logique PURE (aucune I/O).
   La persistance (Netlify Blobs) et l'envoi sont branches par-dessus dans
   netlify/functions/alertes.js et alertes-envoi.js.

   LE PIEGE A EVITER, c'est de transformer ce service en liste de diffusion.
   Trois regles le tiennent a distance :
     1. un seul message par personne et par semaine, quoi qu'il arrive ;
     2. aucun message s'il n'y a rien qui la concerne -- pas de « rien cette
        semaine », qui est precisement ce qui fait se desabonner ;
     3. tous les ateliers qui la concernent dans le MEME message : plusieurs en
        ligne et plusieurs dans sa ville tiennent dans un seul envoi ;
     4. un atelier n'est annonce QU'UNE FOIS a la meme personne. Sans cette
        regle, le plafond hebdomadaire ne protege de rien : un seul atelier
        programme deux mois a l'avance repartait a chaque tour, et l'abonne
        recevait huit fois le meme message (mesure : huit mardis, huit envois).
        On garde donc, par abonne, ce qui lui a deja ete annonce.
*/
"use strict";
var C = require("./communes.js");

var SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;
var FORMATS = ["enligne", "physique", "les_deux"];
var MAX_MAIL = 120, MAX_ZONE = 80, MAX_COMMUNES = 5;
// Rayons proposes. Un rayon FIXE ne peut pas marcher : 50 km autour de Paris,
// c'est toute l'Ile-de-France ; 50 km en Lozere, c'est deux bourgs. Faute de
// choix explicite, on reprend celui que la commune suggere (C.rayonPropose).
var RAYONS = [15, 30, 50, 100];
var RAYON_DEFAUT = 50;
// Au-dela, annoncer un atelier n'a plus de sens : personne ne s'inscrit six
// mois a l'avance, et la liste deviendrait illisible.
var HORIZON_MS = 60 * 24 * 60 * 60 * 1000;
/* Memoire des annonces deja faites. On la purge au-dela de l'horizon : un
   atelier passe depuis longtemps n'a plus a occuper de place, et la fiche d'un
   abonne ne doit pas grossir indefiniment. */
var MEMOIRE_MS = HORIZON_MS + 7 * 24 * 60 * 60 * 1000;

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Normalisation des zones geographiques. On compare des villes et des
   departements saisis a la main : « Lyon », « lyon », « LYON  » et « Lyon 7e »
   doivent se rencontrer. On retire les accents, la casse et la ponctuation. */
function normaliser(v) {
  return tronque(v, MAX_ZONE)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mailValide(v) {
  var m = tronque(v, MAX_MAIL).toLowerCase();
  return m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) ? m : "";
}

/* --- Abonnement ---------------------------------------------------------- */
function validerAbonnement(corps, now) {
  corps = corps || {};
  var mail = mailValide(corps.mail);
  if (!mail) return { erreur: "Indiquez une adresse e-mail valide." };

  var format = FORMATS.indexOf(tronque(corps.format, 20)) === -1 ? "les_deux" : tronque(corps.format, 20);

  /* COMMUNES : des codes INSEE d'une liste fermee, jamais du texte libre.
     « Lyon », « lyon » et « Lyon 7e » ne se rencontreraient jamais, et
     l'abonne ne recevrait rien sans que personne ne comprenne pourquoi. */
  var communes = [];
  var rayonKm = RAYON_DEFAUT;
  if (format !== "enligne") {
    var brutes = Array.isArray(corps.communes) ? corps.communes : String(corps.communes || "").split(",");
    brutes.forEach(function (z) {
      var code = tronque(z, 6).toUpperCase();
      if (C.valide(code) && communes.indexOf(code) === -1 && communes.length < MAX_COMMUNES) communes.push(code);
    });
    /* Sans commune, un abonne au presentiel recevrait les ateliers de toute la
       France. C'est le plus sur chemin vers le desabonnement, donc on refuse
       plutot que d'accepter un abonnement qui ne tiendra pas. */
    if (!communes.length) {
      return { erreur: "Choisissez au moins une commune dans la liste, pour ne recevoir que ce qui est près de chez vous." };
    }
    var r = parseInt(corps.rayonKm, 10);
    rayonKm = RAYONS.indexOf(r) === -1 ? C.rayonPropose(communes[0]) : r;
  }

  return {
    abonne: {
      mail: mail,
      format: format,
      communes: communes,
      rayonKm: rayonKm,
      // Le jeton sert au desabonnement en un clic : il doit etre dans l'URL du
      // mail, donc long et imprevisible.
      jeton: tronque(corps.jeton, 40) || null,
      depuis: now,
      dernierEnvoi: 0,
      actif: true
    }
  };
}

/* --- Selection : qui recoit quoi ----------------------------------------- */

/* Un atelier est annoncable s'il est public, a venir, dans l'horizon, et pas
   deja complet. Annoncer un atelier complet n'apporte qu'une deception. */
function annoncable(a, now) {
  if (!a || a.visibilite === "prive") return false;
  var t = Number(a.quandMs);
  if (!isFinite(t) || t <= now || t > now + HORIZON_MS) return false;
  var inscrits = (a.participants || []).length;
  var max = Number(a.maxParticipants) || 0;
  if (max && inscrits >= max) return false;
  return true;
}

/* L'atelier `a` concerne-t-il l'abonne ?

   Pour le presentiel, on compare des DISTANCES, pas des noms. Exiger la commune
   exacte ferait rater a quelqu'un de Villeurbanne l'atelier de Lyon, a quatre
   kilometres : ce serait la pire version de ce service. */
function concerne(abonne, a) {
  if (a.mode === "enligne") return abonne.format !== "physique";
  if (abonne.format === "enligne") return false;
  var miennes = abonne.communes || [];
  if (!miennes.length) return false;
  // Un atelier sans commune n'est rattachable a personne : on ne devine pas.
  if (!a.commune || !C.valide(a.commune)) return false;
  var rayon = Number(abonne.rayonKm) || RAYON_DEFAUT;
  return miennes.some(function (code) { return C.entre(code, a.commune) <= rayon; });
}

/* DEJA ANNONCE ? La memoire est un objet { CODE: quandMs annonce }. On garde
   l'instant de l'atelier au moment de l'annonce, et pas un simple « oui » :
   un atelier REPROGRAMME est une information neuve, qui doit repartir. */
function dejaAnnonce(abonne, a) {
  var m = (abonne && abonne.annonces) || {};
  var vu = m[String(a.code || "")];
  if (vu == null) return false;
  return Number(vu) === Number(a.quandMs);
}

/* La memoire apres un envoi, purgee de ce qui est trop vieux pour servir. */
function memoireApres(abonne, ateliers, now) {
  var m = {}, ancien = (abonne && abonne.annonces) || {};
  Object.keys(ancien).forEach(function (code) {
    if (now - Number(ancien[code]) < MEMOIRE_MS) m[code] = Number(ancien[code]);
  });
  (ateliers || []).forEach(function (a) { if (a && a.code) m[String(a.code)] = Number(a.quandMs); });
  return m;
}

/* Ce qu'on envoie cette semaine. Rend un tableau { abonne, ateliers }, sans
   aucune entree vide : un abonne sans atelier ne recoit rien du tout. */
function envoisDeLaSemaine(abonnes, ateliers, now) {
  var ouverts = (ateliers || []).filter(function (a) { return annoncable(a, now); });
  var envois = [];
  (abonnes || []).forEach(function (ab) {
    if (!ab || !ab.actif) return;
    // Le plafond d'un message par semaine est absolu : il ne depend ni du
    // nombre d'ateliers ni de l'enthousiasme du moment.
    if (now - (ab.dernierEnvoi || 0) < SEMAINE_MS) return;
    var pour = ouverts.filter(function (a) { return concerne(ab, a) && !dejaAnnonce(ab, a); });
    if (!pour.length) return;
    // Par date : la personne lit d'abord ce qui arrive le plus tot.
    pour.sort(function (x, y) { return Number(x.quandMs) - Number(y.quandMs); });
    envois.push({ abonne: ab, ateliers: pour });
  });
  return envois;
}

/* Regroupement pour la mise en forme du message : les ateliers en ligne d'un
   cote, puis chaque commune de l'autre. Tout tient dans un seul envoi. */
function grouper(ateliers) {
  var enligne = [], villes = [], index = {};
  (ateliers || []).forEach(function (a) {
    if (a.mode === "enligne") { enligne.push(a); return; }
    var cle = a.commune ? String(a.commune).toUpperCase() : (normaliser(a.lieu) || "ailleurs");
    if (!index[cle]) {
      index[cle] = { ville: a.commune ? C.libelle(a.commune) : (a.lieu || ""), ateliers: [] };
      villes.push(index[cle]);
    }
    index[cle].ateliers.push(a);
  });
  /* LA CHRONOLOGIE PRIME SUR LE GROUPEMENT. Grouper par ville sans retrier
     mettait l'atelier de lundi prochain sous celui du mois suivant, parce que
     sa ville venait plus loin dans la liste. Chaque groupe est donc classe par
     date, et les groupes entre eux par leur atelier le plus proche. */
  var tot = function (l) { return Math.min.apply(null, l.map(function (a) { return Number(a.quandMs); })); };
  enligne.sort(function (x, y) { return Number(x.quandMs) - Number(y.quandMs); });
  villes.forEach(function (v) { v.ateliers.sort(function (x, y) { return Number(x.quandMs) - Number(y.quandMs); }); });
  villes.sort(function (x, y) { return tot(x.ateliers) - tot(y.ateliers); });
  return { enligne: enligne, villes: villes };
}

/* Objet du message. « PRES DE CHEZ VOUS » NE VAUT PAS POUR UN ATELIER EN
   LIGNE : l'objet l'annoncait quand meme, y compris a quelqu'un abonne
   uniquement aux ateliers en ligne, et dementait alors son contenu des la
   premiere ligne. Ici plutot que dans la fonction d'envoi, pour etre teste. */
function sujet(ateliers) {
  var n = (ateliers || []).length;
  if (n !== 1) return n + " ateliers de la Fresque des risques de l'IA";
  return ateliers[0] && ateliers[0].mode === "enligne"
    ? "Un atelier de la Fresque des risques de l'IA en ligne"
    : "Un atelier de la Fresque des risques de l'IA près de chez vous";
}

module.exports = {
  SEMAINE_MS: SEMAINE_MS, FORMATS: FORMATS, HORIZON_MS: HORIZON_MS,
  RAYONS: RAYONS, RAYON_DEFAUT: RAYON_DEFAUT, MAX_COMMUNES: MAX_COMMUNES,
  normaliser: normaliser, mailValide: mailValide,
  validerAbonnement: validerAbonnement, annoncable: annoncable, concerne: concerne,
  envoisDeLaSemaine: envoisDeLaSemaine, grouper: grouper, sujet: sujet,
  dejaAnnonce: dejaAnnonce, memoireApres: memoireApres, MEMOIRE_MS: MEMOIRE_MS
};
