/* Programmation d'ateliers et inscriptions (Netlify Function).
   Etat persistant via Netlify Blobs (store "fresque-ateliers"). Envoi d'e-mails
   de validation via lib/mail.js (Resend) ; sans cle API, l'action reussit quand
   meme et le code est renvoye pour affichage a l'ecran.

   Operations (POST JSON { op, ... }) :
     programmer { mode, animateurPrenom, animateurMail, date, heure, ... } -> { code, atelier }
     liste {}                                   -> { ateliers: [vuePublique...] }
     inscrire { code, prenom, mail }            -> { atelier: vueConfirmation }
*/
const { getStore, connectLambda } = require("@netlify/blobs");
const A = require("../../serveur/src/ateliers.js");
const R = require("../../serveur/src/regles.js");
const L = require("../../serveur/src/limites.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, dateLisible = G.dateLisible, mailHtml = G.mailHtml, bouton = G.bouton;

// URL publique du site (variable d'environnement SITE_URL dans Netlify).
const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const TTL_PURGE_MS = 7 * 24 * 60 * 60 * 1000; // on garde les ateliers 7 j apres leur date

function store() { return getStore({ name: "fresque-ateliers" }); }
function sessions() { return getStore({ name: "fresque-sessions" }); }
function limites() { return getStore({ name: "fresque-limites" }); }
function cle(code) { return "atelier:" + code; }
const json = (s, c) => ({ statusCode: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(c) });

function ipClient(event) {
  const h = event.headers || {};
  const brut = h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "inconnue";
  return String(brut).split(",")[0].trim() || "inconnue";
}
async function depasse(seau, k) {
  const s = L.SEUILS[seau]; if (!s) return false;
  const lim = limites();
  try {
    const res = await lim.getWithMetadata(seau + ":" + k, { type: "json" });
    if (L.atteinte(res && res.data, Date.now(), s.limite, s.fenetreMs)) return true;
    await lim.setJSON(seau + ":" + k, L.incrementer(res && res.data, Date.now(), s.fenetreMs));
  } catch (e) {}
  return false;
}

async function codeLibre(code) {
  try { if (await store().get(cle(code))) return false; } catch (e) {}
  try { if (await sessions().get("session:" + code)) return false; } catch (e) {}
  return true;
}

async function purger(st) {
  try {
    const { blobs } = await st.list({ prefix: "atelier:" });
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        if (res && res.data && isFinite(res.data.quandMs) && Date.now() > res.data.quandMs + TTL_PURGE_MS) await st.delete(b.key);
      } catch (e) {}
    }
  } catch (e) {}
}

// Tableau d'informations de l'atelier (HTML).
function ligneInfo(cle, val) {
  return '<tr><td style="padding:5px 10px 5px 0;color:#6b6b6b;white-space:nowrap;vertical-align:top;">' + h(cle) + '</td>'
    + '<td style="padding:5px 0;font-weight:600;">' + h(val) + '</td></tr>';
}
function tableauInfos(a) {
  var r = "";
  r += ligneInfo("Date", dateLisible(a.date, a.heure));
  r += ligneInfo("Format", a.mode === "enligne" ? "En ligne" : "En présentiel");
  if (a.mode === "physique") { r += ligneInfo("Lieu", a.lieu || ""); if (a.adresse) r += ligneInfo("Adresse", a.adresse); }
  r += ligneInfo("Participants max", String(a.maxParticipants));
  return '<table style="border-collapse:collapse;margin:0 0 18px;font-size:14px;">' + r + '</table>';
}
function boiteCode(code) {
  return '<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:14px 18px;margin:0 0 18px;text-align:center;">'
    + '<div style="color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Code de session</div>'
    + '<div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#9a4d0f;margin-top:4px;">' + h(code) + '</div></div>';
}
// Encadre "compteur d'inscrits" avec petite barre de progression (email-safe).
function boiteCompteur(n, max) {
  var m = parseInt(max, 10) || 0;
  var pct = m ? Math.max(4, Math.min(100, Math.round((n / m) * 100))) : 0;
  var reste = 100 - pct;
  return '<div style="background:#f4faf4;border:1px solid #cfe6d3;border-radius:10px;padding:14px 18px;margin:0 0 18px;text-align:center;">'
    + '<div style="color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Inscrits</div>'
    + '<div style="font-size:26px;font-weight:700;color:#2f7d4f;margin-top:2px;">' + n + ' <span style="color:#8a8577;font-size:17px;font-weight:600;">/ ' + h(String(max)) + '</span></div>'
    + '<table role="presentation" width="100%" style="border-collapse:collapse;margin-top:10px;"><tr>'
    + '<td style="background:#2f7d4f;height:8px;border-radius:6px;font-size:0;line-height:0;width:' + pct + '%;">&nbsp;</td>'
    + (reste > 0 ? '<td style="background:#dce7dd;height:8px;border-radius:6px;font-size:0;line-height:0;width:' + reste + '%;">&nbsp;</td>' : '')
    + '</tr></table></div>';
}
// Prenoms des inscrits sous forme de pastilles.
const GUIDE_URL = LIEN + "/telechargements/guide-animateur-fresque-des-risques-de-l-ia.pdf";
// Bouton "Rejoindre la visio" (Google Meet, Discord...) si l'animateur a fourni un lien.
function boutonVisio(a) { return a && a.visio ? '<p style="margin:0 0 16px;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>' : ''; }
function texteVisio(a) { return a && a.visio ? "Visioconférence : " + a.visio : ""; }

// Bouton pour qu'un participant écrive à l'animateur·ice (mailto pré-rempli).
function boutonContactAnimateur(a) {
  if (!a || !a.animateur || !a.animateur.mail) return "";
  var sujet = encodeURIComponent("Question sur l'atelier du " + dateLisible(a.date, a.heure) + " (code " + a.code + ")");
  return '<p style="margin:0 0 16px;">' + bouton("mailto:" + a.animateur.mail + "?subject=" + sujet, "Contacter l'animateur·ice") + "</p>";
}
// Bouton pour que l'animateur écrive à tou·tes les inscrit·es (adresses en Cci).
function boutonEcrireInscrits(a) {
  var mails = (a.participants || []).map(function (p) { return p.mail; }).filter(Boolean);
  if (!mails.length) return "";
  var sujet = encodeURIComponent("Atelier Fresque des risques de l'IA du " + dateLisible(a.date, a.heure));
  return '<p style="margin:0 0 4px;">' + bouton("mailto:?bcc=" + mails.join(",") + "&subject=" + sujet, "Écrire à tou·tes les inscrit·es") + "</p>"
    + '<p style="margin:0 0 12px;font-size:12px;color:#8a8577;">Adresses en copie cachée : les participant·es ne se voient pas entre eux.</p>';
}
// Prénoms des inscrit·es en pastilles cliquables (mailto), pour l'animateur.
function pucesContacts(parts) {
  parts = (parts || []).filter(function (p) { return p && p.prenom; });
  if (!parts.length) return "";
  return '<div style="margin:0;">' + parts.map(function (p) {
    var href = p.mail ? "mailto:" + p.mail : "#";
    return '<a href="' + h(href) + '" style="display:inline-block;background:#f3ece1;border:1px solid #eadfce;border-radius:999px;padding:4px 12px;margin:0 6px 6px 0;font-size:13px;color:#4a473f;text-decoration:none;">' + h(p.prenom) + ' ✉</a>';
  }).join("") + "</div>";
}

// Invitation calendrier (.ics) : ajoutee en piece jointe, rappel la veille.
function icsAtelier(a) {
  const url = a.mode === "enligne" ? (LIEN + "/en-ligne/session/") : "";
  const lieu = a.mode === "enligne" ? "En ligne" : ([a.lieu, a.adresse].filter(Boolean).join(", ") || "En présentiel");
  const jour = String(a.date || "").replace(/-/g, "");
  const hm = String(a.heure || "18:00");
  const start = jour + "T" + hm.replace(":", "") + "00";
  const finH = String((parseInt(hm.slice(0, 2), 10) + 2) % 24).padStart(2, "0");
  const end = jour + "T" + finH + hm.slice(3, 5) + "00";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const echap = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lienPrincipal = a.visio || url;   // visio si fournie, sinon le tableau en ligne
  const desc = "Code de session : " + a.code + (a.visio ? "\nVisio : " + a.visio : "") + (url ? "\nTableau : " + url : "");
  const lignes = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pause IA//Fresque des risques de l'IA//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", "UID:" + a.code + "@fresquedesrisquesdelia.org", "DTSTAMP:" + stamp,
    "DTSTART;TZID=Europe/Paris:" + start, "DTEND;TZID=Europe/Paris:" + end,
    "SUMMARY:" + echap("Fresque des risques de l'IA" + (a.titre ? " : " + a.titre : "")),
    "LOCATION:" + echap(a.visio || lieu), "DESCRIPTION:" + echap(desc)
  ];
  if (lienPrincipal) lignes.push("URL:" + echap(lienPrincipal));
  lignes.push(
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + echap("Rappel : Fresque des risques de l'IA demain"), "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:" + echap("Rappel : Fresque des risques de l'IA dans 1 heure"), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  );
  return lignes.join("\r\n");
}
function pieceIcs(a) { return { filename: "atelier-fresque.ics", content: Buffer.from(icsAtelier(a), "utf8").toString("base64") }; }

// E-mail a l'animateur quand un participant s'inscrit.
function prenomsInscrits(a) { return (a.participants || []).map((p) => p.prenom).filter(Boolean); }

function mailNouvelInscrit(a, prenom) {
  const n = (a.participants || []).length, max = a.maxParticipants;
  const noms = prenomsInscrits(a);
  const l = [];
  l.push("Bonjour " + a.animateur.prenom + ",");
  l.push("");
  l.push(prenom + " vient de s'inscrire à votre atelier du " + dateLisible(a.date, a.heure) + ".");
  l.push("Inscrits : " + n + " / " + max + ".");
  if (noms.length) l.push("Participants : " + noms.join(", ") + ".");
  var contactsInscrits = (a.participants || []).map(function (p) { return p.mail; }).filter(Boolean);
  if (contactsInscrits.length) l.push("Pour les contacter : " + contactsInscrits.join(", "));
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(a.animateur.prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;"><strong>' + h(prenom) + '</strong> vient de s\'inscrire à votre atelier du <strong>' + h(dateLisible(a.date, a.heure)) + '</strong>.</p>';
  c += boiteCompteur(n, max);
  if (n) {
    c += '<p style="margin:0 0 8px;color:#4a473f;font-weight:600;">Participants inscrits <span style="font-weight:400;color:#8a8577;font-size:12px;">(cliquez un prénom pour écrire)</span></p>' + pucesContacts(a.participants);
    c += '<div style="margin-top:14px;">' + boutonEcrireInscrits(a) + '</div>';
  }
  return { text: l.join("\n"), html: mailHtml(c) };
}

// Desinscription : confirmation au participant, notification a l'animateur.
function mailDesistParticipant(a, prenom) {
  const l = [];
  l.push("Bonjour " + prenom + ",");
  l.push("");
  l.push("Votre désinscription de l'atelier du " + dateLisible(a.date, a.heure) + " est bien prise en compte. Votre place est de nouveau libre.");
  l.push("");
  l.push("Au plaisir de vous accueillir à un prochain atelier : " + LIEN + "/demander-un-atelier/");
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(prenom) + ',</p>';
  c += '<p style="margin:0 0 16px;">Votre désinscription de l\'atelier du <strong>' + h(dateLisible(a.date, a.heure)) + '</strong> est bien prise en compte. Votre place est de nouveau libre.</p>';
  c += '<p style="margin:0;">' + bouton(LIEN + "/demander-un-atelier/", "Voir les autres ateliers") + '</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}
function mailDesistAnimateur(a, prenom) {
  const n = (a.participants || []).length, noms = prenomsInscrits(a);
  const l = [];
  l.push("Bonjour " + a.animateur.prenom + ",");
  l.push("");
  l.push(prenom + " s'est désinscrit·e de votre atelier du " + dateLisible(a.date, a.heure) + ".");
  l.push("Inscrits : " + n + " / " + a.maxParticipants + ".");
  if (noms.length) l.push("Participants : " + noms.join(", ") + ".");
  else l.push("Plus aucun inscrit pour le moment.");
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(a.animateur.prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;"><strong>' + h(prenom) + '</strong> s\'est désinscrit·e de votre atelier du <strong>' + h(dateLisible(a.date, a.heure)) + '</strong>.</p>';
  c += boiteCompteur(n, a.maxParticipants);
  c += noms.length ? '<p style="margin:0 0 8px;color:#4a473f;font-weight:600;">Participants inscrits</p>' + pucesContacts(a.participants) : '<p style="margin:0;color:#8a8577;">Plus aucun inscrit pour le moment.</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}

// E-mail envoye aux inscrits quand l'animateur annule l'atelier.
function mailAnnulation(a) {
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("L'atelier de la Fresque des risques de l'IA prévu le " + dateLisible(a.date, a.heure) + " a été annulé par l'organisateur·ice. Il n'aura pas lieu.");
  l.push("");
  l.push("Désolé pour le désagrément. D'autres ateliers sont proposés sur " + LIEN + "/demander-un-atelier/");
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">L\'atelier de la Fresque des risques de l\'IA prévu le <strong>' + h(dateLisible(a.date, a.heure)) + '</strong> a été <strong>annulé</strong> par l\'organisateur·ice. Il n\'aura pas lieu.</p>';
  c += '<p style="margin:0 0 18px;color:#4a473f;">Désolé pour le désagrément. D\'autres ateliers sont proposés sur le site.</p>';
  c += '<p style="margin:0;">' + bouton(LIEN + "/demander-un-atelier/", "Voir les ateliers programmés") + '</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}

// E-mail envoye aux inscrits (et a l'animateur) quand l'atelier est deplace.
function mailDeplacement(a, ancien) {
  const sessionUrl = LIEN + "/en-ligne/session/";
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("L'atelier de la Fresque des risques de l'IA a été déplacé.");
  l.push("Ancienne date : " + ancien);
  l.push("Nouvelle date : " + dateLisible(a.date, a.heure));
  l.push("Code de session : " + a.code);
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") l.push("Tableau en ligne : " + sessionUrl);
  l.push("");
  l.push("Une nouvelle invitation calendrier est jointe. À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">L\'atelier de la Fresque des risques de l\'IA a été <strong>déplacé</strong>.</p>';
  c += '<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">'
    + '<tr><td style="padding:5px 14px 5px 0;color:#6b6b6b;">Ancienne date</td><td style="padding:5px 0;color:#8a8577;text-decoration:line-through;">' + h(ancien) + '</td></tr>'
    + '<tr><td style="padding:5px 14px 5px 0;color:#6b6b6b;">Nouvelle date</td><td style="padding:5px 0;font-weight:700;">' + h(dateLisible(a.date, a.heure)) + '</td></tr></table>';
  c += boiteCode(a.code);
  c += boutonVisio(a);
  c += '<p style="margin:0;color:#4a473f;">Une nouvelle invitation calendrier est jointe à cet e-mail. Si cette nouvelle date ne vous convient pas, vous pouvez vous désinscrire depuis votre e-mail de confirmation.</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}

function mailAnimateur(a) {
  const sessionUrl = LIEN + "/en-ligne/session/?ouvrir=" + a.code;
  const annulUrl = LIEN + "/demander-un-atelier/?annuler=" + a.code + "&t=" + (a.annulToken || "");
  const visibilite = a.visibilite === "prive"
    ? "Votre atelier est privé : il n'apparaît pas dans la liste publique, à vous de communiquer le code aux personnes que vous invitez."
    : "Votre atelier est public : il apparaît dans l'onglet Participer, où chacun peut s'inscrire.";

  // Version texte (repli sans tirets longs)
  const l = [];
  l.push("Bonjour " + a.animateur.prenom + ",");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA est bien programmé. Voici le récapitulatif.");
  l.push("");
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
  l.push("Participants max : " + a.maxParticipants);
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.visio) l.push("Lien de visioconférence (partagé avec les inscrit·es) : " + a.visio);
  l.push(visibilite);
  l.push("");
  l.push("Pour préparer votre animation, téléchargez le guide d'animation :");
  l.push(GUIDE_URL);
  l.push("Une invitation calendrier est jointe à cet e-mail (avec un rappel la veille).");
  l.push("");
  if (a.mode === "enligne") {
    l.push("Le jour J, ouvrez le tableau en ligne et créez la session avec ce code :");
    l.push(sessionUrl);
    l.push("Prévoyez un salon vocal (Discord, Google Meet) pour parler avec le groupe.");
    l.push("");
  }
  l.push("Une erreur de saisie ? Vous pouvez annuler cet atelier ici (ne transmettez pas ce lien) :");
  l.push(annulUrl);
  l.push("Besoin de changer la date ? Déplacez l'atelier depuis la page (code + votre e-mail), les inscrit·es seront prévenu·es : " + LIEN + "/demander-un-atelier/#vue-animer");
  l.push("");
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  // Version HTML
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(a.animateur.prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;">Votre atelier de la Fresque des risques de l\'IA est bien programmé. Voici le récapitulatif.</p>';
  c += tableauInfos(a);
  c += boiteCode(a.code);
  c += boutonVisio(a);
  c += '<p style="margin:0 0 18px;color:#4a473f;">' + h(visibilite) + '</p>';
  c += '<p style="margin:0 0 12px;">Pour préparer votre animation, appuyez-vous sur le guide. Une invitation calendrier (avec rappel la veille) est jointe à cet e-mail.</p>';
  c += '<p style="margin:0 0 20px;">' + bouton(GUIDE_URL, "Télécharger le guide d'animation") + '</p>';
  if (a.mode === "enligne") {
    c += '<p style="margin:0 0 12px;">Le jour J, ouvrez le tableau en ligne et créez la session avec ce code. Prévoyez un salon vocal (Discord, Google Meet) pour échanger avec le groupe.</p>';
    c += '<p style="margin:0 0 20px;">' + bouton(sessionUrl, "Ouvrir le tableau en ligne") + '</p>';
  }
  c += '<hr style="border:0;border-top:1px solid #eee;margin:20px 0;">';
  c += '<p style="margin:0 0 6px;color:#8a8577;font-size:13px;">Une erreur de saisie ? <a href="' + h(annulUrl) + '" style="color:#B3610F;">Annuler cet atelier</a>. Gardez ce lien pour vous : il permet d\'annuler l\'atelier.</p>';
  c += '<p style="margin:0;color:#8a8577;font-size:13px;">Besoin de changer la date ? Vous pouvez <a href="' + h(LIEN + "/demander-un-atelier/#vue-animer") + '" style="color:#B3610F;">déplacer l\'atelier</a> (code + votre e-mail) : les inscrit·es sont prévenu·es automatiquement.</p>';

  return { text: l.join("\n"), html: mailHtml(c) };
}

function mailParticipant(a, participant) {
  const prenom = participant.prenom;
  const sessionUrl = LIEN + "/en-ligne/session/?code=" + a.code;
  const desistUrl = LIEN + "/demander-un-atelier/?desister=" + a.code + "&p=" + (participant.token || "");

  const l = [];
  l.push("Bonjour " + prenom + ",");
  l.push("");
  l.push("Votre inscription à un atelier de la Fresque des risques de l'IA est confirmée. Voici les informations utiles.");
  l.push("");
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.mode === "enligne") { l.push("Le jour J, rejoignez le tableau en ligne avec ce code (depuis un ordinateur) :"); l.push(sessionUrl); }
  if (a.visio) { l.push("Visioconférence : " + a.visio); }
  l.push("Une invitation calendrier est jointe à cet e-mail (avec un rappel la veille).");
  l.push("");
  l.push("Aucun prérequis technique : les cartes expliquent tout au fur et à mesure. À très vite !");
  l.push("");
  l.push("Une question avant l'atelier ? Écrivez à l'animateur·ice : " + a.animateur.mail);
  l.push("");
  l.push("Un empêchement ? Vous pouvez vous désinscrire ici pour libérer votre place :");
  l.push(desistUrl);
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;">Votre inscription est confirmée. Voici les informations utiles pour vous préparer.</p>';
  c += tableauInfos(a);
  c += boiteCode(a.code);
  if (a.mode === "enligne") {
    c += '<p style="margin:0 0 12px;">Le jour J, rejoignez le tableau en ligne avec ce code, depuis un ordinateur.</p>';
    c += '<p style="margin:0 0 16px;">' + bouton(sessionUrl, "Rejoindre le tableau en ligne") + '</p>';
  }
  c += boutonVisio(a);
  c += boutonContactAnimateur(a);
  c += '<p style="margin:0 0 16px;color:#4a473f;">Aucun prérequis technique : les cartes expliquent tout au fur et à mesure. Une invitation calendrier (avec rappel la veille) est jointe à cet e-mail. À très vite !</p>';
  c += '<hr style="border:0;border-top:1px solid #eee;margin:20px 0;">';
  c += '<p style="margin:0;color:#8a8577;font-size:13px;">Un empêchement ? <a href="' + h(desistUrl) + '" style="color:#B3610F;">Se désinscrire</a> pour libérer votre place.</p>';

  return { text: l.join("\n"), html: mailHtml(c) };
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) {}
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });
  let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
  const st = store();
  const ip = ipClient(event);

  try {
    if (d.op === "programmer") {
      if (await depasse("creation", ip)) return json(429, { erreur: { code: "trop", message: "Trop de créations récentes, réessayez dans un moment." } });
      const v = A.valider(d);
      if (v.erreur) return json(400, { erreur: v.erreur });
      let code = null;
      for (let i = 0; i < 10 && !code; i++) { const c = R.nouveauCode({}); if (await codeLibre(c)) code = c; }
      if (!code) return json(500, { erreur: { code: "code", message: "Impossible de générer un code." } });
      const a = v.atelier; a.code = code; a.participants = []; a.creeLe = Date.now();
      a.annulToken = R.jetonAleatoire();
      await st.setJSON(cle(code), a);
      purger(st);
      const ma = mailAnimateur(a);
      const env = await mail.envoi({ to: a.animateur.mail, subject: "Votre atelier est programmé (code " + code + ")", text: ma.text, html: ma.html, attachments: [pieceIcs(a)] });
      return json(200, { code: code, atelier: A.vueConfirmation(a), emailEnvoye: env.envoye });
    }

    if (d.op === "liste") {
      const out = [];
      const { blobs } = await st.list({ prefix: "atelier:" });
      for (const b of blobs) {
        try {
          const res = await st.getWithMetadata(b.key, { type: "json" });
          const a = res && res.data;
          if (a && a.visibilite === "public" && A.visibleCalendrier(a)) out.push(A.vuePublique(a));
        } catch (e) {}
      }
      out.sort((x, y) => x.quandMs - y.quandMs);
      return json(200, { ateliers: out });
    }

    if (d.op === "inscrire") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      for (let essai = 0; essai < 6; essai++) {
        const res = await st.getWithMetadata(cle(code), { type: "json" });
        if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
        const a = res.data;
        const vi = A.validerInscription(a, d);
        if (vi.erreur) return json(400, { erreur: vi.erreur });
        vi.participant.token = R.jetonAleatoire();
        a.participants = a.participants || []; a.participants.push(vi.participant);
        const w = await st.setJSON(cle(code), a, { onlyIfMatch: res.etag });
        if (w && w.modified === false) continue; // concurrence : on rejoue
        const mp = mailParticipant(a, vi.participant);
        const env = await mail.envoi({ to: vi.participant.mail, subject: "Inscription confirmée à la Fresque des risques de l'IA", text: mp.text, html: mp.html, attachments: [pieceIcs(a)] });
        // Notifier l'animateur (sans bloquer l'inscription en cas d'echec).
        try { const mn = mailNouvelInscrit(a, vi.participant.prenom); await mail.envoi({ to: a.animateur.mail, subject: "Nouvelle inscription à votre atelier (" + a.participants.length + "/" + a.maxParticipants + ")", text: mn.text, html: mn.html }); } catch (e) {}
        return json(200, { atelier: A.vueConfirmation(a), emailEnvoye: env.envoye });
      }
      return json(409, { erreur: { code: "conflit", message: "Trop de monde s'inscrit en même temps, réessayez." } });
    }

    if (d.op === "annuler") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      const res = await st.getWithMetadata(cle(code), { type: "json" });
      if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
      const av = res.data;
      const auth = A.annulationAutorisee(av, d);
      if (auth.erreur) return json(403, { erreur: auth.erreur });
      await st.delete(cle(code));
      // Prévenir les inscrits (en Cci pour ne pas exposer les adresses).
      const inscrits = (av.participants || []).map((p) => p.mail).filter(Boolean);
      if (inscrits.length) {
        const mc = mailAnnulation(av);
        try { await mail.envoi({ to: av.animateur.mail, bcc: inscrits, subject: "Atelier annulé : Fresque des risques de l'IA", text: mc.text, html: mc.html }); } catch (e) {}
      }
      return json(200, { annule: true, prevenus: inscrits.length });
    }

    if (d.op === "reprogrammer") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      for (let essai = 0; essai < 6; essai++) {
        const res = await st.getWithMetadata(cle(code), { type: "json" });
        if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
        const a = res.data;
        const rp = A.validerReprogrammation(a, d);
        if (rp.erreur) return json(rp.erreur.code === "non_autorise" ? 403 : 400, { erreur: rp.erreur });
        const ancien = dateLisible(a.date, a.heure);
        a.date = rp.date; a.heure = rp.heure; a.quandMs = rp.quandMs;
        a.rappelEnvoye = false; a.rappelHeureEnvoye = false; a.suiviEnvoye = false;
        const w = await st.setJSON(cle(code), a, { onlyIfMatch: res.etag });
        if (w && w.modified === false) continue; // concurrence : on rejoue
        const inscrits = (a.participants || []).map((p) => p.mail).filter(Boolean);
        const md = mailDeplacement(a, ancien);
        try { await mail.envoi({ to: a.animateur.mail, bcc: inscrits, subject: "Atelier déplacé : Fresque des risques de l'IA", text: md.text, html: md.html, attachments: [pieceIcs(a)] }); } catch (e) {}
        return json(200, { deplace: true, prevenus: inscrits.length, atelier: A.vueConfirmation(a) });
      }
      return json(409, { erreur: { code: "conflit", message: "Réessayez dans un instant." } });
    }

    if (d.op === "desister") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      for (let essai = 0; essai < 6; essai++) {
        const res = await st.getWithMetadata(cle(code), { type: "json" });
        if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
        const a = res.data;
        const rt = A.retraitParticipant(a, d);
        if (rt.erreur) return json(rt.erreur.code === "participant_inconnu" ? 404 : 400, { erreur: rt.erreur });
        a.participants = rt.participants;
        const w = await st.setJSON(cle(code), a, { onlyIfMatch: res.etag });
        if (w && w.modified === false) continue; // concurrence : on rejoue
        // Confirmer au participant et prevenir l'animateur.
        try {
          const prenom = rt.participant && rt.participant.prenom;
          if (rt.participant && rt.participant.mail) { const mdp = mailDesistParticipant(a, prenom); await mail.envoi({ to: rt.participant.mail, subject: "Désinscription confirmée", text: mdp.text, html: mdp.html }); }
          if (a.animateur && a.animateur.mail) { const mda = mailDesistAnimateur(a, prenom); await mail.envoi({ to: a.animateur.mail, subject: "Une désinscription à votre atelier", text: mda.text, html: mda.html }); }
        } catch (e) {}
        return json(200, { desiste: true });
      }
      return json(409, { erreur: { code: "conflit", message: "Réessayez dans un instant." } });
    }

    return json(400, { error: "Opération inconnue." });
  } catch (e) {
    return json(500, { error: "Erreur du service d'ateliers.", details: String(e && e.message || e) });
  }
};
