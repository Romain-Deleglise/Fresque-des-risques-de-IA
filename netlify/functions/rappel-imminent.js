/* Rappel imminent (Netlify Scheduled Function, toutes les 15 min).
   Pour chaque atelier qui commence dans ~1 h (fenetre 45-75 min) et pas encore
   rappele "a l'heure", envoie UN e-mail court a l'animateur + participants (Cci)
   avec le code, le lien visio et le bouton pour rejoindre. Sans RESEND_API_KEY,
   ne fait rien. Complete le rappel de la veille (rappels.js). */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, dateLisible = G.dateLisible, mailHtml = G.mailHtml, bouton = G.bouton;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const T_MIN = 40 * 60 * 1000;   // pas avant 40 min
const T_MAX = 80 * 60 * 1000;   // pas apres 80 min

function store() { return getStore({ name: "fresque-ateliers" }); }

function mailImminent(a) {
  const lienRejoindre = LIEN + "/en-ligne/session/?code=" + a.code;  // participant·es
  const lienOuvrir = LIEN + "/en-ligne/session/?ouvrir=" + a.code;   // animateur·ice
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA commence bientôt (dans environ 1 heure).");
  l.push("");
  l.push("Heure : " + dateLisible(a.date, a.heure));
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") {
    l.push("Participant·es, rejoignez le tableau : " + lienRejoindre);
    l.push("Animateur·ice, ouvrez votre session : " + lienOuvrir);
  }
  l.push("");
  l.push("À tout de suite,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Votre atelier de la Fresque des risques de l\'IA <strong>commence dans environ 1 heure</strong> (' + h(dateLisible(a.date, a.heure)) + ').</p>';
  if (a.visio) c += '<p style="margin:0 0 16px;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  if (a.mode === "enligne") {
    c += '<p style="margin:0 0 8px;text-align:center;">' + bouton(lienRejoindre, "Rejoindre le tableau en ligne") + '</p>';
    c += '<p style="margin:0;text-align:center;font-size:13px;color:#8a8577;">Vous animez ? <a href="' + h(lienOuvrir) + '" style="color:#B3610F;">Ouvrez votre session ici</a>.</p>';
  }
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
