/* Relance des animateur·ices inactif·ves : logique PURE (aucune I/O).

   Quelqu'un qui a animé une fois et qu'on ne relance jamais s'éteint sans
   qu'on le remarque. Mais une relance mal calibrée est un spam de plus, et
   sur une association bénévole c'est le genre de message qui fait partir.

   Quatre conditions, toutes nécessaires :
     1. la personne a bien animé au moins un atelier ;
     2. son dernier atelier animé remonte à plus de SEUIL_JOURS ;
     3. elle n'a AUCUN atelier à venir -- relancer quelqu'un qui anime dans
        dix jours est le meilleur moyen de passer pour un robot ;
     4. elle n'a pas déjà été relancée dans les REPOS_JOURS derniers jours.

   Les désinscrit·es sont exclu·es sans discussion. */
"use strict";

var JOUR_MS = 24 * 60 * 60 * 1000;
var SEUIL_JOURS = 120;   // ~4 mois sans animer
var REPOS_JOURS = 180;   // au plus une relance par semestre

function normaliserMail(m) { return String(m == null ? "" : m).trim().toLowerCase(); }

/* Date du dernier atelier ANIMÉ (pas participé). 0 si aucun. */
function derniereAnimation(contact) {
  var max = 0;
  (contact.ateliers || []).forEach(function (p) {
    if (p.role !== "animateur") return;
    var t = Number(p.quandMs);
    if (isFinite(t) && t > max) max = t;
  });
  return max;
}

/* `ateliers` : les ateliers existants (à venir compris), tels que listés pour
   l'administration. On en tire les adresses qui ont quelque chose de prévu. */
function mailsAvecAtelierAVenir(ateliers, now) {
  var set = Object.create(null);
  (ateliers || []).forEach(function (a) {
    if (!a || !a.animateur) return;
    if (Number(a.quandMs) <= now) return;
    var m = normaliserMail(a.animateur.mail);
    if (m) set[m] = true;
  });
  return set;
}

function inactifs(contacts, ateliers, now, options) {
  options = options || {};
  var seuil = (options.seuilJours || SEUIL_JOURS) * JOUR_MS;
  var repos = (options.reposJours || REPOS_JOURS) * JOUR_MS;
  var occupes = mailsAvecAtelierAVenir(ateliers, now);

  return (contacts || []).filter(function (c) {
    if (!c || c.desinscrit) return false;
    if (!c.animateur) return false;
    var derniere = derniereAnimation(c);
    if (!derniere) return false;
    if (now - derniere < seuil) return false;
    if (occupes[normaliserMail(c.mail)]) return false;
    if (c.relanceMs && now - c.relanceMs < repos) return false;
    return true;
  }).map(function (c) {
    var derniere = derniereAnimation(c);
    return {
      mail: c.mail,
      prenom: c.prenom || "",
      nbAnimations: c.nbAnimations || 0,
      derniereMs: derniere,
      joursDepuis: Math.floor((now - derniere) / JOUR_MS),
      dejaRelanceMs: c.relanceMs || 0
    };
  }).sort(function (a, b) { return a.derniereMs - b.derniereMs; });
}

module.exports = {
  JOUR_MS: JOUR_MS, SEUIL_JOURS: SEUIL_JOURS, REPOS_JOURS: REPOS_JOURS,
  derniereAnimation: derniereAnimation, inactifs: inactifs
};
