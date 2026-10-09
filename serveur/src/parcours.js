/* LA CARTE DES PARCOURS PAR COURRIEL : logique PURE (aucune I/O).

   POURQUOI UNE CARTE. Vingt-trois courriels partent de ce site, depuis neuf
   fonctions, les uns a l'instant d'une action, les autres trois jours plus
   tard, le mardi matin, ou toutes les quinze minutes si l'heure est venue.
   Personne ne tient cet ensemble dans sa tete. La question « qu'est-ce que
   recoit quelqu'un qui s'inscrit, et quand ? » n'avait pour reponse que la
   lecture de neuf fichiers.

   CETTE CARTE EST VERIFIEE CONTRE LE CODE. Un inventaire ecrit a la main
   derive : on ajoute un courriel, on oublie la carte, et elle devient un
   document qui ment avec autorite. serveur/tests/parcours.test.mjs compare
   donc, dans les deux sens, les sujets decrits ici et les sujets reellement
   envoyes par netlify/functions : un courriel non decrit fait echouer la
   suite, un courriel decrit mais disparu aussi.

   `quand` se lit en francais, pas en millisecondes : c'est une carte pour
   relire un parcours, pas une table de configuration.
*/
"use strict";

var PARCOURS = [
  {
    cle: "programmer",
    titre: "Programmer un atelier",
    depart: "Un·e animateur·ice remplit le formulaire « Programmer un atelier ».",
    etapes: [
      { sujet: "Votre atelier est programmé", pour: "animateur·ice", quand: "tout de suite",
        source: "ateliers.js", porte: ["le code de gestion", "la page publique de l'atelier", "un fichier .ics"] },
      { sujet: "Nouvelle inscription à votre atelier", pour: "animateur·ice", quand: "a chaque inscription",
        source: "ateliers.js", porte: ["le nombre de places prises", "la page de gestion"] }
    ]
  },
  {
    cle: "inscription",
    titre: "S'inscrire à un atelier",
    depart: "Quelqu'un s'inscrit depuis la page d'un atelier.",
    etapes: [
      { sujet: "Inscription confirmée à la Fresque des risques de l'IA", pour: "participant·e", quand: "tout de suite",
        source: "ateliers.js", porte: ["le lieu ou le lien de visio", "un fichier .ics", "le lien de desinscription"] },
      { sujet: "Désinscription confirmée", pour: "participant·e", quand: "a la desinscription",
        source: "ateliers.js", porte: ["le lien pour se reinscrire"] },
      { sujet: "Une désinscription à votre atelier", pour: "animateur·ice", quand: "a la desinscription",
        source: "ateliers.js", porte: ["le nombre de places restantes"] }
    ]
  },
  {
    cle: "avant",
    titre: "Avant l'atelier",
    depart: "Les deux rappels partent tout seuls, selon l'heure de l'atelier.",
    etapes: [
      { sujet: "Rappel : vous animez bientôt un atelier", pour: "animateur·ice", quand: "la veille (vers 8 h)",
        source: "rappels.js", porte: ["le guide", "l'antiseche", "la liste des inscrit·es"] },
      { sujet: "Rappel : votre atelier Fresque des risques de l'IA", pour: "participant·es, en copie cachee",
        quand: "la veille (vers 8 h)", source: "rappels.js", porte: ["le lieu ou le lien", "le lien de desinscription"] },
      { sujet: "Vous animez dans 1 heure", pour: "animateur·ice", quand: "entre 40 et 80 min avant",
        source: "rappel-imminent.js", porte: ["le lien de la salle", "l'antiseche"] },
      { sujet: "Ça commence bientôt : Fresque des risques de l'IA", pour: "participant·es, en copie cachee",
        quand: "entre 40 et 80 min avant", source: "rappel-imminent.js", porte: ["le lieu ou le lien"] }
    ]
  },
  {
    cle: "apres",
    titre: "Après l'atelier",
    depart: "Trois heures apres le debut, et jusqu'a trois jours apres.",
    etapes: [
      { sujet: "Merci d'avoir animé la Fresque des risques de l'IA", pour: "animateur·ice",
        quand: "le lendemain (vers 10 h)", source: "suivi.js",
        porte: ["l'onglet Retours", "l'espace animateur·ices", "programmer le suivant", "le Discord"] },
      { sujet: "Merci d'avoir participé à la Fresque des risques de l'IA", pour: "participant·es, en copie cachee",
        quand: "le lendemain (vers 10 h)", source: "suivi.js",
        porte: ["l'onglet Retours", "le formulaire de temoignage", "devenir animateur·ice",
                "les cartes a telecharger", "les alertes"] }
    ]
  },
  {
    cle: "changements",
    titre: "Si l'atelier change",
    depart: "L'animateur·ice annule ou deplace son atelier depuis sa page de gestion.",
    etapes: [
      { sujet: "Votre atelier est annulé", pour: "animateur·ice", quand: "tout de suite", source: "ateliers.js", porte: [] },
      { sujet: "Atelier annulé : Fresque des risques de l'IA", pour: "participant·es, en copie cachee",
        quand: "tout de suite", source: "ateliers.js", porte: ["les autres ateliers"] },
      { sujet: "Votre atelier a été déplacé", pour: "animateur·ice", quand: "tout de suite",
        source: "ateliers.js", porte: ["un .ics qui remplace le precedent"] },
      { sujet: "Atelier déplacé : Fresque des risques de l'IA", pour: "participant·es, en copie cachee",
        quand: "tout de suite", source: "ateliers.js", porte: ["la nouvelle date", "un .ics qui remplace le precedent"] }
    ]
  },
  {
    cle: "alertes",
    titre: "Annonces des prochains ateliers",
    depart: "Quelqu'un s'inscrit aux annonces depuis la page Participer.",
    etapes: [
      { sujet: "Confirmez votre inscription aux annonces d'ateliers", pour: "l'abonne·e", quand: "tout de suite",
        source: "alertes.js", porte: ["le lien de confirmation", "modifier ses preferences", "se desabonner"] },
      { sujet: "Vos préférences d'annonces ont été modifiées", pour: "l'abonne·e", quand: "a chaque modification",
        source: "alertes.js", porte: ["modifier ses preferences", "se desabonner"] },
      /* LE SUJET DIT DEJA CE QU'IL Y A DEDANS : « Un atelier ... pres de chez
         vous », « ... en ligne », ou « 3 ateliers ... ». Un sujet identique
         chaque semaine finit en « lu plus tard », puis jamais. */
      { sujet: "Un atelier de la Fresque des risques de l'IA près de chez vous",
        variantes: ["Un atelier de la Fresque des risques de l'IA en ligne",
                    "N ateliers de la Fresque des risques de l'IA"],
        pour: "l'abonne·e", quand: "le mardi matin, et seulement s'il y a quelque chose",
        source: "alertes-envoi.js", porte: ["les ateliers qui la concernent", "se desabonner en un clic"] }
    ]
  },
  {
    cle: "relance",
    titre: "Relancer un·e animateur·ice",
    depart: "Depuis /admin/, a la main : personne n'est relance tout seul.",
    etapes: [
      { sujet: "On reprogramme une fresque ?", pour: "animateur·ice", quand: "a la demande, depuis /admin/",
        source: "admin.js", porte: ["programmer un atelier"] }
    ]
  }
];

/* Ce qui ne fait partie d'aucun parcours : le site s'ecrit a lui-meme quand le
   service en ligne va mal. Ces sujets sont assembles a l'envoi (le nombre de
   problemes y figure), d'ou les debuts seuls. Decrits ici pour que l'inventaire
   soit complet, ecartes de la carte pour qu'elle reste celle des gens. */
var INTERNES = ["[Fresque] ", "On reprogramme une fresque ?"];

function tous() { return PARCOURS; }

/* Tous les sujets decrits, parcours et internes confondus : c'est sur cette
   liste que le test compare le code. */
function sujets() {
  var out = [];
  PARCOURS.forEach(function (p) { p.etapes.forEach(function (e) { out.push(e.sujet); }); });
  return out.concat(INTERNES);
}

module.exports = { tous: tous, sujets: sujets, PARCOURS: PARCOURS, INTERNES: INTERNES };
