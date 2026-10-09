/* JOURNAL DES ENVOIS : logique PURE (aucune I/O).

   POURQUOI UN JOURNAL. Le site est jeune et une bonne partie de ce qu'il fait
   est invisible : un courriel part, ou ne part pas, trois jours apres un
   atelier, le mardi matin, ou a l'instant d'une inscription. Quand quelqu'un
   dit « je n'ai rien recu », il n'y avait aucun moyen de savoir si l'envoi
   avait eu lieu. Les traces existaient (console.log), mais dans les journaux de
   la plateforme : il fallait un acces technique et savoir ou regarder.

   CE QU'ON N'ECRIT PAS, ET C'EST LE POINT IMPORTANT : aucune adresse. Un
   journal des envois qui garde les destinataires devient, au bout de quelques
   mois, une seconde base d'adresses que personne n'a declaree, que personne ne
   purge, et qui fuit avec le reste le jour ou quelque chose fuit. On garde donc
   de quoi repondre a « est-ce que ca marche ? » -- quoi, quand, combien,
   reussi ou non -- et rien de quoi repondre a « qui ».

   Le journal se purge tout seul : il sert a voir si le systeme fonctionne
   maintenant, pas a tenir une comptabilite.
*/
"use strict";

var GARDE_MS = 30 * 24 * 60 * 60 * 1000;   // trente jours
var MAX = 500;                             // et jamais plus que cela
var MAX_SUJET = 120;

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Une entree, a partir de ce que l'envoi sait. On ne prend QUE des nombres et
   des libelles : si un appelant passait une adresse, elle ne serait pas
   retenue, parce qu'aucun champ ne l'accueille. */
function entree(champ, now) {
  champ = champ || {};
  /* « alerte_seuil » existe aussi (mail.js previent l'equipe quand on approche
     du plafond). Le ranger dans « echec » faisait apparaitre, chaque jour ou le
     seuil est franchi, un envoi en echec qui n'en etait pas un. Un evenement
     inconnu reste un echec : mieux vaut un faux signalement qu'un silence. */
  var evt = ["envoye", "echec", "bloque", "alerte_seuil"].indexOf(champ.evt) === -1
    ? "echec" : champ.evt;
  var n = Number(champ.dest);
  return {
    quand: Number(now) || 0,
    evt: evt,
    sujet: tronque(champ.sujet, MAX_SUJET),
    dest: isFinite(n) && n > 0 ? Math.round(n) : 0,
    raison: tronque(champ.raison, 40)
  };
}

/* Ce qui reste du journal apres l'ajout : on coupe par l'age ET par le nombre.
   L'age seul laisserait un pic d'envois le faire gonfler sans limite ; le
   nombre seul garderait des traces d'il y a six mois sur un site calme. */
function apres(liste, nouvelle, now) {
  var out = (liste || []).concat([nouvelle])
    .filter(function (e) { return e && (Number(now) - Number(e.quand)) < GARDE_MS; })
    .sort(function (a, b) { return b.quand - a.quand; });
  return out.slice(0, MAX);
}

/* De quoi lire l'etat du service d'un coup d'oeil, sans parcourir la liste. */
function bilan(liste, now) {
  var l = liste || [];
  var jour = l.filter(function (e) { return (Number(now) - Number(e.quand)) < 86400000; });
  var compte = function (t, e) { return t.filter(function (x) { return x.evt === e; }).length; };
  return {
    total: l.length,
    envoyes24h: compte(jour, "envoye"),
    echecs24h: compte(jour, "echec"),
    bloques24h: compte(jour, "bloque"),
    dernier: l.length ? l[0].quand : 0
  };
}

module.exports = { GARDE_MS: GARDE_MS, MAX: MAX, entree: entree, apres: apres, bilan: bilan };
