/* Rappel imminent (Netlify Scheduled Function, toutes les 15 min).
   Pour chaque atelier qui commence dans ~1 h (fenetre 45-75 min) et pas encore
   rappele "a l'heure", envoie UN e-mail court a l'animateur + participants (Cci)
   avec le lien visio et le bouton pour rejoindre (aucun code affiche : il est
   porte par les liens). Sans RESEND_API_KEY, ne fait rien. Complete le rappel de
   la veille (rappels.js). */
"use strict";
const { getStore } = require("@netlify/blobs");
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

function mailImminent(a) {
  const sessionUrl = lienRejoindre(a);
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA commence bientôt (dans environ 1 heure).");
  l.push("");
  l.push("Heure : " + dateLisible(a.date, a.heure));
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") { l.push("Rejoindre le tableau en ligne (un clic, rien à saisir) : " + sessionUrl); }
  l.push("Vous animez cet atelier ? Ouvrez votre session : " + lienOuvrir(a));
  l.push("");
  l.push("À tout de suite,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Votre atelier de la Fresque des risques de l\'IA <strong>commence dans environ 1 heure</strong> (' + h(dateLisible(a.date, a.heure)) + ').</p>';
  if (a.visio) c += '<p style="margin:0 0 16px;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  if (a.mode === "enligne") c += '<p style="margin:0;text-align:center;">' + bouton(sessionUrl, "Rejoindre le tableau en ligne") + '</p>';
  c += '<p style="margin:14px 0 0;color:#8a8577;font-size:13px;text-align:center;">Vous animez cet atelier ? '
    + '<a href="' + h(lienOuvrir(a)) + '" style="color:#B3610F;">Ouvrez votre session</a>.</p>';
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
        if (!isFinite(a.quandMs)) continue;
        const delta = a.quandMs - now;
        if (delta < T_MIN || delta > T_MAX) continue;
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        const m = mailImminent(a);
        const env = await mail.envoi({ to: a.animateur.mail, bcc: parts, subject: "Ça commence bientôt : Fresque des risques de l'IA", text: m.text, html: m.html });
        if (env.envoye) {
          a.rappelHeureEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { statusCode: 200, body: "rappels imminents envoyés: " + envoyes };
};
