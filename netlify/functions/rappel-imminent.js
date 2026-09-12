/* Rappel imminent (Netlify Scheduled Function, toutes les 15 min).
   Pour chaque atelier qui commence dans ~1 h (fenetre 45-75 min) et pas encore
   rappele "a l'heure", envoie UN e-mail court a l'animateur + participants (Cci)
   avec le lien visio et le bouton pour rejoindre (aucun code affiche : il est
   porte par les liens). Sans RESEND_API_KEY, ne fait rien. Complete le rappel de
   la veille (rappels.js). */
"use strict";
const { getStore } = require("@netlify/blobs");
const A = require("../../serveur/src/ateliers.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, dateLisible = G.dateLisible, mailHtml = G.mailHtml, bouton = G.bouton;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const T_MIN = 40 * 60 * 1000;   // pas avant 40 min
const T_MAX = 80 * 60 * 1000;   // pas apres 80 min

function store() { return getStore({ name: "fresque-ateliers" }); }

function lienRejoindre(a) { return LIEN + "/en-ligne/session/?code=" + a.code; }
function lienOuvrir(a) {
  return LIEN + "/en-ligne/session/?ouvrir=" + a.code
    + (a.animateur && a.animateur.prenom ? "&prenom=" + encodeURIComponent(a.animateur.prenom) : "");
}

// Deux e-mails DISTINCTS (voir rappels.js) : l'animateur·ice ouvre sa session,
// les inscrit·es la rejoignent. Envoi separe, en Cci seul cote inscrit·es.
function mailImminentAnimateur(a) {
  var ouvrir = lienOuvrir(a);
  var noms = (a.participants || []).map(function (p) { return p.prenom; }).filter(Boolean);
  var l = [];
  l.push("Bonjour " + ((a.animateur && a.animateur.prenom) || "") + ",");
  l.push("");
  l.push("Vous animez dans environ 1 heure (" + dateLisible(a.date, a.heure) + ").");
  if (noms.length) l.push("Inscrits : " + noms.join(", ") + ".");
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") l.push("Ouvrir votre session : " + ouvrir);
  l.push("");
  l.push("Bon atelier,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h((a.animateur && a.animateur.prenom) || "") + ',</p>';
  c += '<p style="margin:0 0 16px;">Vous animez <strong>dans environ 1 heure</strong> (' + h(dateLisible(a.date, a.heure)) + ').</p>';
  if (noms.length) c += '<p style="margin:0 0 16px;color:#4a473f;"><strong>Inscrits :</strong> ' + h(noms.join(", ")) + '</p>';
  if (a.mode === "enligne") c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(ouvrir, "Ouvrir ma session") + '</p>';
  if (a.visio) c += '<p style="margin:0;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}
function mailImminentParticipants(a) {
  var rejoindre = lienRejoindre(a);
  var l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA commence dans environ 1 heure (" + dateLisible(a.date, a.heure) + ").");
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") l.push("Rejoindre le tableau en ligne (un clic, rien à saisir) : " + rejoindre);
  l.push("");
  l.push("À tout de suite,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Votre atelier de la Fresque des risques de l\'IA <strong>commence dans environ 1 heure</strong> (' + h(dateLisible(a.date, a.heure)) + ').</p>';
  if (a.mode === "enligne") c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(rejoindre, "Rejoindre le tableau en ligne") + '</p>';
  if (a.visio) c += '<p style="margin:0;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}

exports.handler = async () => {
  if (!mail.configuree()) return { statusCode: 200, body: "email non configuré, aucun rappel" };
  const st = store();
  let envoyes = 0;
  try {
    const { blobs } = await st.list({ prefix: "atelier:" });
    const now = Date.now();
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        const a = res && res.data;
        if (!a || a.rappelHeureEnvoye) continue;
        const quand = A.instantDe(a);   // heure de Paris, recalculee
        if (!isFinite(quand)) continue;
        const delta = quand - now;
        if (delta < T_MIN || delta > T_MAX) continue;
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        const ma = mailImminentAnimateur(a);
        const envA = await mail.envoi({ to: a.animateur.mail, subject: "Vous animez dans 1 heure", text: ma.text, html: ma.html });
        let envP = { envoye: false };
        if (parts.length) {
          const mp = mailImminentParticipants(a);
          envP = await mail.envoi({ bcc: parts, subject: "Ça commence bientôt : Fresque des risques de l'IA", text: mp.text, html: mp.html });
        }
        if (envA.envoye || envP.envoye) {
          a.rappelHeureEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { statusCode: 200, body: "rappels imminents envoyés: " + envoyes };
};
