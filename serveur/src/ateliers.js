/* Regles PURES de la programmation d'ateliers (aucune I/O).
   Utilise par la fonction Netlify (netlify/functions/ateliers.js) et par les
   tests. CommonJS. Aucune donnee personnelle n'est loggee ici. */
"use strict";

var MAX_ENLIGNE = 8;        // 8 participants max par session en ligne
var MAX_PHYSIQUE = 16;      // 2 tables x 8, conseil d'animation
var LEN_PRENOM = 24, LEN_TITRE = 80, LEN_LIEU = 120, LEN_ADRESSE = 200, LEN_MAIL = 160;
var RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tronque(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
function mailValide(m) { return typeof m === "string" && m.length <= LEN_MAIL && RE_MAIL.test(m.trim()); }

// Valide une demande de programmation d'atelier. Retourne { atelier } (sans code
// ni participants, ajoutes par la fonction) ou { erreur: { code, message } }.
function valider(d) {
  d = d || {};
  var mode = d.mode === "enligne" ? "enligne" : (d.mode === "physique" ? "physique" : null);
  if (!mode) return err("mode_invalide", "Choisissez un atelier physique ou en ligne.");

  var mail = tronque(d.animateurMail, LEN_MAIL);
  if (!mailValide(mail)) return err("mail_invalide", "Adresse e-mail de l'animateur invalide.");
  var prenom = tronque(d.animateurPrenom, LEN_PRENOM);
  if (!prenom) return err("prenom_manquant", "Indiquez votre prénom (animateur).");

  var date = tronque(d.date, 10), heure = tronque(d.heure, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("date_invalide", "Date invalide.");
  if (!/^\d{2}:\d{2}$/.test(heure)) return err("heure_invalide", "Heure invalide.");
  var quand = Date.parse(date + "T" + heure + ":00");
  if (!isFinite(quand)) return err("date_invalide", "Date ou heure invalide.");
  if (quand < Date.now() - 60 * 1000) return err("date_passee", "La date doit être dans le futur.");

  var visibilite = d.visibilite === "prive" ? "prive" : "public";
  var plafond = mode === "enligne" ? MAX_ENLIGNE : MAX_PHYSIQUE;
  var max = parseInt(d.maxParticipants, 10);
  if (!isFinite(max) || max < 1) max = mode === "enligne" ? MAX_ENLIGNE : 8;
  max = Math.min(max, plafond);

  var a = {
    mode: mode,
    titre: tronque(d.titre, LEN_TITRE),
    animateur: { prenom: prenom, mail: mail },
    date: date, heure: heure, quandMs: quand,
    visibilite: visibilite,
    maxParticipants: max
  };
  if (mode === "physique") {
    a.lieu = tronque(d.lieu, LEN_LIEU);
    a.adresse = tronque(d.adresse, LEN_ADRESSE);
    if (!a.lieu) return err("lieu_manquant", "Indiquez le lieu de l'atelier.");
  }
  return { atelier: a };
}

// Valide une inscription participant a un atelier existant.
function validerInscription(atelier, d) {
  d = d || {};
  if (!atelier) return err("atelier_inconnu", "Cet atelier n'existe pas ou plus.");
  if (atelier.visibilite === "prive") return err("atelier_prive", "Cet atelier est privé : demandez le code à l'animateur.");
  if (estPasse(atelier)) return err("atelier_passe", "Cet atelier est déjà passé.");
  var prenom = tronque(d.prenom, LEN_PRENOM);
  if (!prenom) return err("prenom_manquant", "Indiquez votre prénom.");
  var mail = tronque(d.mail, LEN_MAIL);
  if (!mailValide(mail)) return err("mail_invalide", "Adresse e-mail invalide.");
  var parts = atelier.participants || [];
  if (parts.length >= atelier.maxParticipants) return err("complet", "Cet atelier est complet.");
  if (parts.some(function (p) { return (p.mail || "").toLowerCase() === mail.toLowerCase(); })) {
    return err("deja_inscrit", "Cette adresse est déjà inscrite à cet atelier.");
  }
  return { participant: { prenom: prenom, mail: mail, le: Date.now() } };
}

function estPasse(a) {
  // On garde l'atelier visible jusqu'a 3h apres l'heure de debut.
  return a && isFinite(a.quandMs) && (Date.now() > a.quandMs + 3 * 60 * 60 * 1000);
}

// Vue publique pour l'onglet Participer : AUCUN e-mail expose.
function vuePublique(a) {
  return {
    code: a.code,
    mode: a.mode,
    titre: a.titre || "",
    animateur: a.animateur ? a.animateur.prenom : "",
    date: a.date, heure: a.heure, quandMs: a.quandMs,
    lieu: a.mode === "physique" ? (a.lieu || "") : "",
    maxParticipants: a.maxParticipants,
    inscrits: (a.participants || []).length,
    complet: (a.participants || []).length >= a.maxParticipants
  };
}

// Confirmation renvoyee au participant apres inscription (avec le code + lieu).
function vueConfirmation(a) {
  return {
    code: a.code, mode: a.mode, titre: a.titre || "",
    date: a.date, heure: a.heure,
    lieu: a.mode === "physique" ? (a.lieu || "") : "",
    adresse: a.mode === "physique" ? (a.adresse || "") : ""
  };
}

function err(code, message) { return { erreur: { code: code, message: message } }; }

module.exports = {
  MAX_ENLIGNE: MAX_ENLIGNE, MAX_PHYSIQUE: MAX_PHYSIQUE,
  mailValide: mailValide, valider: valider, validerInscription: validerInscription,
  estPasse: estPasse, vuePublique: vuePublique, vueConfirmation: vueConfirmation
};
