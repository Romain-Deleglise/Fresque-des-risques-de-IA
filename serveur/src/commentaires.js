/* Retours des animateur·ices : logique PURE (aucune I/O).
   La persistance (Netlify Blobs) est branchee par-dessus dans
   netlify/functions/commentaires.js, comme regles.js pour les sessions.
   On teste ici la decision, pas le stockage. */
"use strict";

var MAX_TEXTE = 2000, MAX_NOM = 40, MAX_EMAIL = 120, MAX_SUJET = 20;
var MIN_TEXTE = 3;
var CARTE_MIN = 1, CARTE_MAX = 38;   // la carte 0 est l'intro, hors jeu
var SUJETS = ["carte", "jeu", "deroule", "reference", "autre"];

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Valide un retour et renvoie soit { erreur }, soit { retour } pret a stocker.
   `now` est injecte pour que les tests soient deterministes. */
function valider(corps, now) {
  corps = corps || {};
  var texte = tronque(corps.texte, MAX_TEXTE);
  if (texte.length < MIN_TEXTE) {
    return { erreur: "Écrivez votre retour avant d’envoyer." };
  }

  var sujet = tronque(corps.sujet, MAX_SUJET);
  if (SUJETS.indexOf(sujet) === -1) sujet = "autre";

  // Un numero de carte n'est retenu que s'il designe une carte jouable. Un
  // retour sur une carte inexistante serait rangé sous une cle qu'aucune
  // pastille ne pourrait afficher : il vaut mieux le traiter comme general.
  var carte = null;
  if (typeof corps.carte === "number" && isFinite(corps.carte)
      && Math.floor(corps.carte) === corps.carte
      && corps.carte >= CARTE_MIN && corps.carte <= CARTE_MAX) {
    carte = corps.carte;
  }
  if (carte !== null) sujet = "carte";
  else if (sujet === "carte") sujet = "autre";

  var email = tronque(corps.email, MAX_EMAIL);
  // Une adresse manifestement fausse est effacee plutot que refusee : le
  // retour compte davantage que la possibilite de repondre.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = "";

  return {
    retour: {
      sujet: sujet,
      carte: carte,
      texte: texte,
      nom: tronque(corps.nom, MAX_NOM),
      email: email,
      date: now,
      // Visible tout de suite, mais grise tant qu'il n'est pas relu : un
      // retour retenu dans une file d'attente que personne n'ouvre est un
      // retour perdu, et les autres animateurs profitent du signalement des
      // l'instant ou il est fait.
      valide: false
    }
  };
}

/* Ce qu'on expose a tout le monde. L'adresse e-mail n'en fait jamais partie :
   elle sert a repondre, pas a etre publiee. */
function public_(retour, cle_) {
  return {
    cle: cle_,
    sujet: retour.sujet,
    carte: retour.carte,
    texte: retour.texte,
    nom: retour.nom,
    date: retour.date,
    valide: !!retour.valide
  };
}

/* Cle de rangement. Elle porte le numero de carte pour que le comptage par
   carte se fasse sur la liste des cles, sans relire chaque retour. */
function cle(retour, id) {
  return retour.carte === null
    ? "general:" + retour.sujet + ":" + id
    : "carte:" + retour.carte + ":" + id;
}

/* Compte les retours par carte a partir des seules cles. */
function compter(cles) {
  var compte = {};
  (cles || []).forEach(function (k) {
    var m = /^carte:(\d+):/.exec(k);
    if (m) compte[m[1]] = (compte[m[1]] || 0) + 1;
  });
  return compte;
}

/* Une cle de retour, telle que `cle()` la fabrique. On la verifie avant toute
   action de moderation : sans cela, une cle forgee pourrait designer n'importe
   quel objet du magasin. */
function cleValide(k) {
  return typeof k === "string"
    && (/^carte:\d{1,2}:[a-z0-9]{1,24}$/.test(k)
      || /^general:[a-z]{1,20}:[a-z0-9]{1,24}$/.test(k));
}

module.exports = {
  SUJETS, MAX_TEXTE, CARTE_MIN, CARTE_MAX,
  valider, cle, cleValide, compter, public: public_
};
