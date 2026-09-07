/* Regles PURES de la programmation d'ateliers (aucune I/O).
   Utilise par la fonction Netlify (netlify/functions/ateliers.js) et par les
   tests. CommonJS. Aucune donnee personnelle n'est loggee ici. */
"use strict";

var MAX_ENLIGNE = 8;        // 8 participants max par session en ligne
var MAX_PHYSIQUE = 16;      // 2 tables x 8, conseil d'animation
var LEN_PRENOM = 24, LEN_TITRE = 80, LEN_LIEU = 120, LEN_ADRESSE = 200, LEN_MAIL = 160, LEN_VISIO = 300;
var RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var LIMITE_INSCRIPTION_MS = 30 * 60 * 1000;   // inscriptions closes 30 min apres le debut

function tronque(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
function mailValide(m) { return typeof m === "string" && m.length <= LEN_MAIL && RE_MAIL.test(m.trim()); }
function urlValide(u) { u = String(u == null ? "" : u).trim(); return u.length <= LEN_VISIO && /^https?:\/\/[^\s.]+\.[^\s]+$/.test(u); }

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
  // Visioconférence : générée automatiquement (auto), fournie par l'animateur
  // (perso), ou aucune. Rétro-compatible : un lien sans mode = "perso".
  var visioMode = ["auto", "perso", "aucune"].indexOf(d.visioMode) >= 0 ? d.visioMode : (d.visioUrl ? "perso" : "aucune");
  if (visioMode === "perso") {
    var visio = tronque(d.visioUrl, LEN_VISIO);
    if (!visio) return err("visio_manquant", "Indiquez votre lien de visioconférence, ou choisissez le lien automatique.");
    if (!urlValide(visio)) return err("visio_invalide", "Le lien de visioconférence doit être une adresse http(s) valide.");
    a.visio = visio;
  } else if (visioMode === "auto") {
    a.visioAuto = true;   // la fonction remplit a.visio avec un salon Jitsi une fois le code connu
  }
  return { atelier: a };
}

// Valide une inscription participant a un atelier existant.
function validerInscription(atelier, d) {
  d = d || {};
  if (!atelier) return err("atelier_inconnu", "Cet atelier n'existe pas ou plus.");
  if (atelier.visibilite === "prive") return err("atelier_prive", "Cet atelier est privé : demandez le code à l'animateur.");
  if (!inscriptionOuverte(atelier)) return err("trop_tard", "Les inscriptions sont closes : l'atelier a déjà commencé.");
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

// Autorise l'annulation d'un atelier. Le code de session n'est PAS secret
// (les participants le recoivent aussi), donc on exige soit le jeton secret
// envoye a l'animateur par e-mail, soit l'e-mail exact de l'animateur.
function annulationAutorisee(atelier, d) {
  d = d || {};
  if (!atelier) return err("atelier_inconnu", "Cet atelier n'existe pas ou plus.");
  var jeton = tronque(d.token, 64);
  if (atelier.annulToken && jeton && jeton === atelier.annulToken) return { ok: true };
  var mail = tronque(d.mail, LEN_MAIL).toLowerCase();
  if (mail && atelier.animateur && (atelier.animateur.mail || "").toLowerCase() === mail) return { ok: true };
  return err("non_autorise", "Code ou e-mail incorrect : seul l'animateur·ice peut annuler cet atelier.");
}

// Déplacement (reprogrammation) d'un atelier : même autorisation que l'annulation
// (jeton secret ou e-mail de l'animateur), plus une nouvelle date/heure future.
function validerReprogrammation(atelier, d) {
  d = d || {};
  var auth = annulationAutorisee(atelier, d);
  if (auth.erreur) return auth;
  var date = tronque(d.date, 10), heure = tronque(d.heure, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("date_invalide", "Nouvelle date invalide.");
  if (!/^\d{2}:\d{2}$/.test(heure)) return err("heure_invalide", "Nouvelle heure invalide.");
  var quand = Date.parse(date + "T" + heure + ":00");
  if (!isFinite(quand)) return err("date_invalide", "Nouvelle date ou heure invalide.");
  if (quand < Date.now() - 60 * 1000) return err("date_passee", "La nouvelle date doit être dans le futur.");
  if (date === atelier.date && heure === atelier.heure) return err("inchange", "La date et l'heure sont identiques.");
  return { date: date, heure: heure, quandMs: quand };
}

// Retire un participant identifié par son jeton personnel (lien de l'e-mail).
function retraitParticipant(atelier, d) {
  d = d || {};
  if (!atelier) return err("atelier_inconnu", "Cet atelier n'existe pas ou plus.");
  var token = tronque(d.token, 64);
  if (!token) return err("token_manquant", "Lien de désinscription invalide.");
  var parts = atelier.participants || [];
  var i = -1;
  for (var k = 0; k < parts.length; k++) { if (parts[k] && parts[k].token && parts[k].token === token) { i = k; break; } }
  if (i < 0) return err("participant_inconnu", "Vous n'êtes pas (ou plus) inscrit·e à cet atelier.");
  return { participants: parts.slice(0, i).concat(parts.slice(i + 1)), participant: parts[i] };
}

function estPasse(a) {
  // On garde l'atelier visible jusqu'a 3h apres l'heure de debut.
  return a && isFinite(a.quandMs) && (Date.now() > a.quandMs + 3 * 60 * 60 * 1000);
}

// Les inscriptions restent ouvertes jusqu'a 30 min apres le debut ; au-dela,
// on ne peut plus se rajouter (mais l'atelier reste affiche, voir ci-dessous).
function inscriptionOuverte(a) {
  return !!(a && isFinite(a.quandMs) && (Date.now() <= a.quandMs + LIMITE_INSCRIPTION_MS));
}

// L'atelier reste visible dans le calendrier public jusqu'a 7 jours apres le
// debut (historique, calendrier mieux rempli), meme si l'inscription est close.
function visibleCalendrier(a) {
  return !!(a && isFinite(a.quandMs) && (Date.now() <= a.quandMs + 7 * 24 * 60 * 60 * 1000));
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
    complet: (a.participants || []).length >= a.maxParticipants,
    ouvert: inscriptionOuverte(a)   // false = déjà commencé, on n'affiche plus le bouton Participer
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
  mailValide: mailValide, urlValide: urlValide, valider: valider, validerInscription: validerInscription,
  annulationAutorisee: annulationAutorisee, validerReprogrammation: validerReprogrammation, retraitParticipant: retraitParticipant,
  estPasse: estPasse, inscriptionOuverte: inscriptionOuverte, visibleCalendrier: visibleCalendrier,
  vuePublique: vuePublique, vueConfirmation: vueConfirmation
};
