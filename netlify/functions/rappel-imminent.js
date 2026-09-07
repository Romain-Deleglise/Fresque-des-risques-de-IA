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
  const sessionUrl = LIEN + "/en-ligne/session/";
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA commence bientôt (dans environ 1 heure).");
  l.push("");
  l.push("Heure : " + dateLisible(a.date, a.heure));
  l.push("Code de session : " + a.code);
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (a.mode === "enligne") { l.push("Tableau en ligne : " + sessionUrl); }
  l.push("");
  l.push("À tout de suite,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var code = '<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:14px 18px;margin:0 0 16px;text-align:center;"><div style="color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Code de session</div><div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#9a4d0f;margin-top:4px;">' + h(a.code) + '</div></div>';
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Votre atelier de la Fresque des risques de l\'IA <strong>commence dans environ 1 heure</strong> (' + h(dateLisible(a.date, a.heure)) + ').</p>';
  c += code;
  if (a.visio) c += '<p style="margin:0 0 16px;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  if (a.mode === "enligne") c += '<p style="margin:0;">' + bouton(sessionUrl, "Rejoindre le tableau en ligne") + '</p>';
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
