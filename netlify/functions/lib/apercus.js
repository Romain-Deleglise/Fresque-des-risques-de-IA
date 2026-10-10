/* LE CATALOGUE DES APERCUS : un sujet de courriel -> le courriel, construit.

   CE QUE CE FICHIER EVITE. Relire un courriel demandait de provoquer ce qui
   l'envoie : creer un atelier, s'y inscrire, attendre le mardi matin. On
   relisait donc rarement ce qui part, et une mise en forme cassee pouvait
   vivre des semaines sans que personne la voie.

   IL N'Y A PAS DE COPIE DU CONTENU ICI. Chaque entree appelle le constructeur
   reel de la fonction qui envoie (`_courriels`), avec les donnees d'exemple de
   lib/exemples.js : ce qui s'affiche dans /admin/ est ce qui part. Une carte
   des parcours ecrite a la main derive ; un apercu qui rejoue le vrai code ne
   peut pas mentir sur la mise en forme.

   serveur/tests/apercus.test.mjs verifie que CHAQUE courriel de la carte des
   parcours a son apercu, et qu'aucun apercu ne designe un courriel disparu.
*/
"use strict";

var X = require("./exemples.js");

/* Les fonctions qui envoient. Les requerir ici les charge dans le paquet de
   l'apercu, pas dans le leur : aucune d'elles n'ouvre de connexion au
   chargement, seulement dans ses propres fonctions. */
var ATELIERS = require("../ateliers.js")._courriels;
var RAPPELS = require("../rappels.js")._courriels;
var SUIVI = require("../suivi.js")._courriels;
var ALERTES = require("../alertes.js")._courriels;
var ANNONCE = require("../alertes-envoi.js")._courriels;
var IMMINENT = require("../rappel-imminent.js")._courriels;
var RELANCE = require("./courriel-relance.js");

/* La cle est le SUJET, parce que c'est ce qu'on lit dans la carte des parcours
   et dans le journal des envois : on clique ce qu'on voit. Le sujet de
   l'annonce hebdomadaire varie avec le nombre d'ateliers ; la carte en donne
   la forme generique, on la rattache donc par un sujet stable. */
var CATALOGUE = {
  "Votre atelier est programmé": function () { return ATELIERS.animateurProgramme(X.atelier()); },
  "Inscription confirmée à la Fresque des risques de l'IA": function () {
    return ATELIERS.participantInscrit(X.atelier(), X.atelier().participants[0]);
  },
  "Nouvelle inscription à votre atelier": function () {
    return ATELIERS.nouvelInscrit(X.atelier(), "Sofia");
  },
  "Désinscription confirmée": function () { return ATELIERS.desistParticipant(X.atelier(), "Sofia"); },
  "Une désinscription à votre atelier": function () { return ATELIERS.desistAnimateur(X.atelier(), "Sofia"); },
  "Votre atelier est annulé": function () { return ATELIERS.annulationAnimateur(X.atelier(), 3); },
  "Atelier annulé : Fresque des risques de l'IA": function () { return ATELIERS.annulationParticipants(X.atelier()); },
  "Votre atelier a été déplacé": function () {
    return ATELIERS.deplacementAnimateur(X.atelier(), X.ancienAtelier());
  },
  "Atelier déplacé : Fresque des risques de l'IA": function () {
    return ATELIERS.deplacementParticipants(X.atelier(), X.ancienAtelier());
  },
  "Rappel : vous animez bientôt un atelier": function () { return RAPPELS.rappelAnimateur(X.atelier()); },
  "Rappel : votre atelier Fresque des risques de l'IA": function () { return RAPPELS.rappelParticipants(X.atelier()); },
  "Vous animez dans 1 heure": function () { return IMMINENT.imminentAnimateur(X.atelierEnLigne()); },
  "Ça commence bientôt : Fresque des risques de l'IA": function () {
    return IMMINENT.imminentParticipants(X.atelierEnLigne());
  },
  "Merci d'avoir animé la Fresque des risques de l'IA": function () { return SUIVI.suiviAnimateur(true); },
  "Merci d'avoir participé à la Fresque des risques de l'IA": function () { return SUIVI.suiviParticipants(true); },
  "Confirmez votre inscription aux annonces d'ateliers": function () { return ALERTES.confirmation(X.abonne()); },
  "Vos préférences d'annonces ont été modifiées": function () { return ALERTES.miseAJour(X.abonne()); },
  "On reprogramme une fresque ?": function () { return RELANCE.relance(); },
  "Un atelier de la Fresque des risques de l'IA près de chez vous": function () {
    return ANNONCE.annonce(X.abonne(), X.ateliersAnnonces());
  }
};

function sujets() { return Object.keys(CATALOGUE); }
function existe(sujet) { return Object.prototype.hasOwnProperty.call(CATALOGUE, sujet); }

/* Construit le courriel demande. Les constructeurs sont purs : ils assemblent
   des chaines, ils n'ecrivent nulle part et n'envoient rien. */
function rendre(sujet) {
  if (!existe(sujet)) return null;
  var m = CATALOGUE[sujet]();
  return { sujet: sujet, html: (m && m.html) || "", text: (m && m.text) || "" };
}

module.exports = { sujets: sujets, existe: existe, rendre: rendre };
