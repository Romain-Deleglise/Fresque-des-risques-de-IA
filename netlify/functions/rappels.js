/* Rappels d'ateliers (Netlify Scheduled Function).
   Programmee via netlify.toml (executee une fois par jour). Pour chaque atelier
   dont la date approche (dans les ~26 h) et pas encore rappele, envoie UN e-mail
   a l'animateur + tous les participants (en Cci), avec le code de session, puis
   marque l'atelier comme rappele. Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, dateLisible = G.dateLisible, mailHtml = G.mailHtml, bouton = G.bouton;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const FENETRE_MS = 26 * 60 * 60 * 1000;

function store() { return getStore({ name: "fresque-ateliers" }); }

function mailRappel(a) {
  const lienRejoindre = LIEN + "/en-ligne/session/?code=" + a.code;  // participant·es
  const lienOuvrir = LIEN + "/en-ligne/session/?ouvrir=" + a.code;   // animateur·ice
  const noms = (a.participants || []).map((p) => p.prenom).filter(Boolean);

  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Rappel : votre atelier de la Fresque des risques de l'IA a lieu bientôt.");
  l.push("");
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
  if (a.visio) l.push("Visioconférence : " + a.visio);
  if (noms.length) l.push("Participants : " + noms.join(", ") + ".");
  l.push("");
  if (a.mode === "enligne") {
    l.push("Participant·es, rejoignez le tableau en ligne d'un clic : " + lienRejoindre);
    l.push("Animateur·ice, ouvrez votre session : " + lienOuvrir);
  }
  l.push("");
  l.push("À tout bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var info = '<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">';
  const row = (k, v) => '<tr><td style="padding:5px 10px 5px 0;color:#6b6b6b;white-space:nowrap;vertical-align:top;">' + h(k) + '</td><td style="padding:5px 0;font-weight:600;">' + h(v) + '</td></tr>';
  info += row("Date", dateLisible(a.date, a.heure));
  info += row("Format", a.mode === "enligne" ? "En ligne" : "En présentiel");
  if (a.mode === "physique") { info += row("Lieu", a.lieu || ""); if (a.adresse) info += row("Adresse", a.adresse); }
  info += "</table>";

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Rappel : votre atelier de la Fresque des risques de l\'IA a lieu <strong>bientôt</strong>.</p>';
  c += info;
  if (noms.length) c += '<p style="margin:0 0 16px;color:#4a473f;"><strong>Participants :</strong> ' + h(noms.join(", ")) + '</p>';
  if (a.visio) c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
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
        if (!a || a.rappelEnvoye) continue;
        if (!isFinite(a.quandMs) || a.quandMs < now || a.quandMs > now + FENETRE_MS) continue;
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        const m = mailRappel(a);
        const env = await mail.envoi({ to: a.animateur.mail, bcc: parts, subject: "Rappel : votre atelier Fresque des risques de l'IA", text: m.text, html: m.html });
        if (env.envoye) {
          a.rappelEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { statusCode: 200, body: "rappels envoyés: " + envoyes };
};
