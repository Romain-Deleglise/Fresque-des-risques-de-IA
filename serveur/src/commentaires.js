/* Retours des animateur·ices : logique PURE (aucune I/O).
   La persistance (Netlify Blobs) est branchee par-dessus dans
   netlify/functions/commentaires.js, comme regles.js pour les sessions.
   On teste ici la decision, pas le stockage. */
"use strict";

var MAX_TEXTE = 2000, MAX_NOM = 40, MAX_EMAIL = 120, MAX_SUJET = 20;
var MIN_TEXTE = 3;
var CARTE_MIN = 1, CARTE_MAX = 38;   // la carte 0 est l'intro, hors jeu
/* « atelier » a ete ajoute a la demande des animateur·ices : le formulaire
   recueillait des retours sur le JEU, alors que le plus utile apres une seance
   est le deroulement de l'ATELIER lui-meme. Sans cette valeur, le choix serait
   accepte par la page puis range sous « autre » par le serveur, et la
   distinction se perdrait en silence. */
var SUJETS = ["carte", "atelier", "jeu", "deroule", "reference", "autre"];

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Un numero n'est retenu que s'il designe une carte JOUABLE. Un retour range
   sous une carte inexistante se retrouverait sous une cle qu'aucune pastille
   ne peut afficher : autant le traiter comme s'il n'y avait pas de numero. */
function numeroDeCarte(v) {
  if (typeof v !== "number" || !isFinite(v) || Math.floor(v) !== v) return null;
  return (v >= CARTE_MIN && v <= CARTE_MAX) ? v : null;
}

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
  var carte = numeroDeCarte(corps.carte);
  if (carte !== null) sujet = "carte";
  else if (sujet === "carte") sujet = "autre";

  /* « CA CONCERNE LE LIEN AVEC LA CARTE X ». Facultatif. Un retour du genre
     « cette carte devrait pointer vers l'autre » est inexploitable tant qu'on
     ne sait pas de quelle autre il s'agit. Deux garde-fous : le champ n'a de
     sens que sur un retour qui vise DEJA une carte, et une carte ne peut pas
     etre liee a elle-meme. Dans les deux cas on efface plutot que refuser :
     le texte du retour vaut mieux qu'un envoi rejete. */
  var lien = numeroDeCarte(corps.lien);
  if (carte === null || lien === carte) lien = null;

  /* « QU'EST-CE QUI POSE PROBLEME DANS CE LIEN ? » Facultatif, et sans valeur
     hors d'un lien : savoir qu'une fleche gene n'apprend rien tant qu'on ne
     sait pas en quoi. On l'efface donc avec le lien plutot que de garder un
     texte orphelin, impossible a rattacher a quoi que ce soit. */
  var lienTexte = lien === null ? "" : tronque(corps.lienTexte, MAX_TEXTE);

  var email = tronque(corps.email, MAX_EMAIL);
  // Une adresse manifestement fausse est effacee plutot que refusee : le
  // retour compte davantage que la possibilite de repondre.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = "";

  return {
    retour: {
      sujet: sujet,
      carte: carte,
      lien: lien,
      lienTexte: lienTexte,
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
    /* Le lien etait ENREGISTRE mais jamais rendu : le moderateur ne pouvait pas
       savoir de quelle fleche on lui parlait, alors que la personne avait pris
       la peine de la designer. */
    lien: retour.lien === undefined ? null : retour.lien,
    lienTexte: retour.lienTexte || "",
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
