/* Rappels d'ateliers (Netlify Scheduled Function).
   Programmee via netlify.toml (executee une fois par jour). Pour chaque atelier
   dont la date approche (dans les ~26 h) et pas encore rappele, envoie UN e-mail
   a l'animateur + tous les participants en copie (CC), avec le code de session,
   puis marque l'atelier comme rappele. Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");

const LIEN = "https://fresque-risques-ia.pauseia.fr";
const FENETRE_MS = 26 * 60 * 60 * 1000;

function store() { return getStore({ name: "fresque-ateliers", consistency: "strong" }); }

function texteRappel(a) {
  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Rappel : votre atelier de la Fresque des risques de l'IA a lieu bientôt.");
  l.push("");
  l.push("• Date : " + a.date + " à " + a.heure);
  l.push("• Format : " + (a.mode === "enligne" ? "en ligne" : "présentiel"));
  if (a.mode === "physique") { l.push("• Lieu : " + a.lieu); if (a.adresse) l.push("• Adresse : " + a.adresse); }
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.mode === "enligne") l.push("Rejoignez le tableau en ligne avec ce code : " + LIEN + "/en-ligne/session/");
  l.push("");
  l.push("À tout bientôt,");
  l.push("La Fresque des risques de l'IA — Pause IA");
  return l.join("\n");
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
        const env = await mail.envoi({ to: a.animateur.mail, cc: parts, subject: "Rappel — votre atelier Fresque des risques de l'IA", text: texteRappel(a) });
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
