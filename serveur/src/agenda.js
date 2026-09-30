/* AGENDA PUBLIC DES ATELIERS : logique PURE (aucune I/O).
   Branche par-dessus dans netlify/functions/agenda.js.

   Deux formats a partir des memes ateliers :
     - JSON, pour qui veut traiter les donnees ;
     - iCalendar, pour qui veut simplement s'abonner depuis son agenda.

   L'INSTANT EST TOUJOURS RECALCULE a partir de la date et de l'heure de Paris
   (ateliers.instantDe), jamais lu dans le `quandMs` enregistre : celui-ci a pu
   etre pose avant un changement d'heure, et publier une heure fausse dans un
   agenda tiers est pire que ne rien publier. */
"use strict";
var A = require("./ateliers.js");

/* Duree d'un atelier dans l'agenda : DEUX HEURES ET DEMIE. Il n'y a pas de
   champ de duree par atelier, et c'est la duree reelle constatee. Le site
   annonce « 2 heures », ce qui est le format vise ; mais un agenda sert a
   reserver du temps, et reserver une demi-heure de trop vaut mieux que de
   voir arriver le rendez-vous suivant au milieu de la restitution. */
var DUREE_MS = 150 * 60 * 1000;

/* Ce qu'on publie : les ateliers PUBLICS a venir. Un atelier prive ne doit
   jamais sortir d'ici, meme par megarde : le filtre est explicite et teste. */
function publiables(ateliers, now) {
  return (ateliers || [])
    .filter(function (a) {
      if (!a || a.visibilite !== "public") return false;
      var t = A.instantDe(a);
      return isFinite(t) && t + DUREE_MS > now;
    })
    .sort(function (x, y) { return A.instantDe(x) - A.instantDe(y); });
}

function deuxChiffres(n) { return (n < 10 ? "0" : "") + n; }

/* Horodatage iCalendar en UTC (forme « 20260924T150000Z »). On part de
   l'instant, donc le changement d'heure est deja pris en compte. */
function horodatage(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + deuxChiffres(d.getUTCMonth() + 1) + deuxChiffres(d.getUTCDate())
    + "T" + deuxChiffres(d.getUTCHours()) + deuxChiffres(d.getUTCMinutes())
    + deuxChiffres(d.getUTCSeconds()) + "Z";
}

/* Date-heure ISO 8601 AVEC le decalage de Paris. Un agenda tiers qui lit du
   JSON a besoin de savoir a quelle heure locale l'atelier commence, pas
   seulement a quel instant. */
function isoParis(ms) {
  var dec = A.decalageParis(ms);
  var l = new Date(ms + dec);
  var signe = dec < 0 ? "-" : "+";
  var abs = Math.abs(dec) / 60000;
  return l.getUTCFullYear() + "-" + deuxChiffres(l.getUTCMonth() + 1) + "-" + deuxChiffres(l.getUTCDate())
    + "T" + deuxChiffres(l.getUTCHours()) + ":" + deuxChiffres(l.getUTCMinutes()) + ":00"
    + signe + deuxChiffres(Math.floor(abs / 60)) + ":" + deuxChiffres(abs % 60);
}

function vueAgenda(a, base) {
  var t = A.instantDe(a);
  return {
    code: a.code,
    titre: a.titre || "La Fresque des risques de l'IA",
    description: a.description || "",
    mode: a.mode,                                   // "enligne" | "physique"
    debut: isoParis(t),
    fin: isoParis(t + DUREE_MS),
    debutMs: t,
    lieu: a.mode === "physique" ? (a.lieu || "") : "En ligne",
    commune: a.mode === "physique" ? (a.commune || null) : null,
    animateur: a.animateur ? a.animateur.prenom : "",
    places: Math.max(0, (Number(a.maxParticipants) || 0) - ((a.participants || []).length)),
    maxParticipants: Number(a.maxParticipants) || 0,
    complet: ((a.participants || []).length) >= (Number(a.maxParticipants) || 0),
    url: base + "/participer/#atelier-" + a.code
  };
}

function agendaJson(ateliers, now, base) {
  return {
    genere: new Date(now).toISOString(),
    source: base + "/participer/",
    ateliers: publiables(ateliers, now).map(function (a) { return vueAgenda(a, base); })
  };
}

/* Echappement iCalendar (RFC 5545 §3.3.11) : la barre oblique inverse en
   premier, sinon on echapperait les barres qu'on vient d'ajouter. */
function echapper(v) {
  return String(v == null ? "" : v)
    .replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/* Pliage des lignes a 75 OCTETS (RFC 5545 §3.1), pas 75 caracteres : une
   adresse accentuee compte double en UTF-8, et une ligne trop longue fait
   rejeter le fichier par certains agendas. On ne coupe jamais au milieu d'un
   caractere. */
function plier(ligne) {
  var out = [], courant = "", octets = 0, limite = 73;
  for (var i = 0; i < ligne.length; i++) {
    var c = ligne[i];
    var n = Buffer.byteLength(c, "utf8");
    if (octets + n > limite) { out.push(courant); courant = " "; octets = 1; limite = 74; }
    courant += c; octets += n;
  }
  out.push(courant);
  return out.join("\r\n");
}

function agendaIcal(ateliers, now, base) {
  var l = ["BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Pause IA//Fresque des risques de l'IA//FR",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Ateliers de la Fresque des risques de l'IA",
    "X-WR-TIMEZONE:Europe/Paris"];
  publiables(ateliers, now).forEach(function (a) {
    var v = vueAgenda(a, base);
    var desc = [v.description, v.animateur ? "Animé par " + v.animateur : "",
      v.complet ? "Complet." : v.places + " place(s) restante(s).", v.url]
      .filter(Boolean).join("\n");
    l.push("BEGIN:VEVENT");
    // L'identifiant doit etre STABLE : sans cela, chaque relecture creerait un
    // doublon dans l'agenda au lieu de mettre a jour l'evenement.
    l.push("UID:atelier-" + a.code + "@fresquedesrisquesdelia.org");
    l.push("DTSTAMP:" + horodatage(now));
    l.push("DTSTART:" + horodatage(v.debutMs));
    l.push("DTEND:" + horodatage(v.debutMs + DUREE_MS));
    l.push(plier("SUMMARY:" + echapper(v.titre)));
    l.push(plier("DESCRIPTION:" + echapper(desc)));
    l.push(plier("LOCATION:" + echapper(v.lieu)));
    l.push(plier("URL:" + echapper(v.url)));
    l.push("END:VEVENT");
  });
  l.push("END:VCALENDAR");
  return l.join("\r\n") + "\r\n";
}

module.exports = {
  DUREE_MS: DUREE_MS,
  publiables: publiables, vueAgenda: vueAgenda,
  agendaJson: agendaJson, agendaIcal: agendaIcal,
  horodatage: horodatage, isoParis: isoParis, echapper: echapper, plier: plier
};
