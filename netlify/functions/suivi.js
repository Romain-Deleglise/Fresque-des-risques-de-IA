/* Suivi post-atelier (Netlify Scheduled Function).
   Programmee via netlify.toml (une fois par jour). Pour chaque atelier termine
   (depuis ~3 h et moins de 3 jours) pas encore suivi, envoie UN e-mail de
   remerciement a l'animateur + participants (en Cci), qui invite a aller plus
   loin (cartes, Discord) et, surtout, a devenir animateur a son tour. Marque
   ensuite l'atelier comme suivi. Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const FIN_MS = 3 * 60 * 60 * 1000;          // atelier considere termine 3 h apres le debut
const LIMITE_MS = 3 * 24 * 60 * 60 * 1000;  // fenetre d'envoi : jusqu'a 3 j apres
const DISCORD = "https://discord.gg/vyXGd7AeGc";

function store() { return getStore({ name: "fresque-ateliers" }); }
function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

function mailHtml(contenu) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1a17;">'
    + '<div style="max-width:560px;margin:0 auto;padding:24px 14px;">'
    + '<div style="background:#ffffff;border:1px solid #eadfce;border-radius:14px;overflow:hidden;">'
    + '<div style="background:#E8811C;padding:16px 24px;"><span style="color:#ffffff;font-weight:700;font-size:16px;">La Fresque des risques de l\'IA</span></div>'
    + '<div style="padding:24px;font-size:15px;line-height:1.55;">' + contenu + '</div></div>'
    + '<p style="text-align:center;color:#8a8577;font-size:12px;margin:16px 0 0;">Portée par Pause IA · <a href="https://pauseia.fr/" style="color:#8a8577;">pauseia.fr</a></p>'
    + '</div></body></html>';
}
function bouton(url, texte) {
  return '<a href="' + h(url) + '" style="display:inline-block;background:#B3610F;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">' + h(texte) + '</a>';
}

function contenuSuivi() {
  const cartes = LIEN + "/#telecharger";
  const guide = LIEN + "/telechargements/guide-animateur-fresque-des-risques-de-l-ia.pdf";
  const programmer = LIEN + "/demander-un-atelier/#vue-animer";

  const l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Merci d'avoir pris part à la Fresque des risques de l'IA. Nous espérons que l'atelier vous a plu et donné des repères sur les enjeux de l'IA.");
  l.push("");
  l.push("Pour prolonger :");
  l.push("- Reprenez les cartes quand vous voulez : " + cartes);
  l.push("- Échangez et posez vos questions sur notre Discord : " + DISCORD);
  l.push("");
  l.push("Et si vous animiez à votre tour ? La fresque grandit surtout par ses animateurs. Pas besoin d'être expert : le guide vous prépare, et vous pouvez programmer votre atelier en quelques minutes.");
  l.push("- Guide d'animation : " + guide);
  l.push("- Programmer un atelier : " + programmer);
  l.push("");
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Merci d\'avoir pris part à la Fresque des risques de l\'IA. Nous espérons qu\'elle vous a plu et donné des repères sur les enjeux de l\'IA.</p>';
  c += '<p style="margin:0 0 8px;font-weight:600;">Pour prolonger</p>';
  c += '<p style="margin:0 0 16px;">Reprenez les <a href="' + h(cartes) + '" style="color:#B3610F;">cartes</a> quand vous voulez, et venez échanger sur notre <a href="' + h(DISCORD) + '" style="color:#B3610F;">Discord</a>.</p>';
  c += '<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:16px 18px;margin:0 0 8px;">';
  c += '<p style="margin:0 0 8px;font-weight:700;color:#9a4d0f;">Et si vous animiez à votre tour ?</p>';
  c += '<p style="margin:0 0 14px;color:#4a473f;">La fresque grandit surtout par ses animateurs. Pas besoin d\'être expert : le guide vous prépare, et vous programmez votre atelier en quelques minutes.</p>';
  c += '<p style="margin:0;">' + bouton(programmer, "Programmer un atelier") + '</p>';
  c += '</div>';
  c += '<p style="margin:12px 0 0;font-size:13px;color:#8a8577;">Ou d\'abord <a href="' + h(guide) + '" style="color:#8a8577;">télécharger le guide d\'animation</a>.</p>';

  return { text: l.join("\n"), html: mailHtml(c) };
}

exports.handler = async () => {
  if (!mail.configuree()) return { statusCode: 200, body: "email non configuré, aucun suivi" };
  const st = store();
  let envoyes = 0;
  try {
    const { blobs } = await st.list({ prefix: "atelier:" });
    const now = Date.now();
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        const a = res && res.data;
        if (!a || a.suiviEnvoye) continue;
        if (!isFinite(a.quandMs)) continue;
        if (now < a.quandMs + FIN_MS || now > a.quandMs + LIMITE_MS) continue;
        const dest = [a.animateur && a.animateur.mail].filter(Boolean);
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        if (!dest.length && !parts.length) { a.suiviEnvoye = true; await st.setJSON(b.key, a, { onlyIfMatch: res.etag }); continue; }
        const m = contenuSuivi();
        const env = await mail.envoi({ to: dest.length ? dest : parts, bcc: dest.length ? parts : [], subject: "Merci ! Et si vous animiez la Fresque des risques de l'IA ?", text: m.text, html: m.html });
        if (env.envoye) {
          a.suiviEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { statusCode: 200, body: "suivis envoyés: " + envoyes };
};
