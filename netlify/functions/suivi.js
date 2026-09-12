/* Suivi post-atelier (Netlify Scheduled Function).
   Programmee via netlify.toml (une fois par jour). Pour chaque atelier termine
   (depuis ~3 h et moins de 3 jours) pas encore suivi, envoie UN e-mail de
   remerciement a l'animateur + participants (en Cci), qui invite a aller plus
   loin (cartes, Discord) et, surtout, a devenir animateur a son tour. Marque
   ensuite l'atelier comme suivi. Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const A = require("../../serveur/src/ateliers.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, mailHtml = G.mailHtml, bouton = G.bouton;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const FIN_MS = 3 * 60 * 60 * 1000;          // atelier considere termine 3 h apres le debut
const LIMITE_MS = 3 * 24 * 60 * 60 * 1000;  // fenetre d'envoi : jusqu'a 3 j apres
const DISCORD = "https://discord.gg/vyXGd7AeGc";

function store() { return getStore({ name: "fresque-ateliers" }); }
function storeImages() { return getStore({ name: "fresque-images" }); }
// Au-dela, l'image ne sert plus a rien et n'a pas a etre conservee.
const IMG_LIMITE_MS = 7 * 24 * 60 * 60 * 1000;

/* L'IMAGE DE LA FRESQUE. C'est la seule chose que le groupe a envie de garder,
   et elle restait sur la machine de l'animateur·ice. Elle est deposee en fin
   d'atelier (op "image" de fresque.js) et jointe ici, puis effacee : on ne
   conserve pas le travail d'un groupe plus longtemps que le temps de le lui
   envoyer. */
async function imageDe(code) {
  if (!code) return null;
  try {
    const r = await storeImages().get("image:" + code, { type: "json" });
    if (!r || !r.png) return null;
    if (Date.now() - (r.ts || 0) > IMG_LIMITE_MS) { await effacerImage(code); return null; }
    return r.png;
  } catch (e) { return null; }
}
async function effacerImage(code) {
  if (!code) return;
  try { await storeImages().delete("image:" + code); } catch (e) {}
}

function contenuSuivi(avecImage) {
  const cartes = LIEN + "/#telecharger";
  const guide = LIEN + "/telechargements/guide-animateur-fresque-des-risques-de-l-ia.pdf";
  const programmer = LIEN + "/devenir-animateur/#programmer";

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
  if (avecImage) { l.push("Votre fresque est jointe à ce message, telle que le groupe l'a laissée."); l.push(""); }
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Merci d\'avoir pris part à la Fresque des risques de l\'IA. Nous espérons qu\'elle vous a plu et donné des repères sur les enjeux de l\'IA.</p>';
  c += '<p style="margin:0 0 8px;font-weight:600;">Pour prolonger</p>';
  c += '<p style="margin:0 0 16px;">Reprenez les <a href="' + h(cartes) + '" style="color:#B0560A;">cartes</a> quand vous voulez, et venez échanger sur notre <a href="' + h(DISCORD) + '" style="color:#B0560A;">Discord</a>.</p>';
  c += '<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:16px 18px;margin:0 0 8px;">';
  c += '<p style="margin:0 0 8px;font-weight:700;color:#9a4d0f;">Et si vous animiez à votre tour ?</p>';
  c += '<p style="margin:0 0 14px;color:#4a473f;">La fresque grandit surtout par ses animateurs. Pas besoin d\'être expert : le guide vous prépare, et vous programmez votre atelier en quelques minutes.</p>';
  c += '<p style="margin:0;text-align:center;">' + bouton(programmer, "Programmer un atelier") + '</p>';
  c += '</div>';
  c += '<p style="margin:12px 0 0;font-size:13px;color:#6b665e;">Ou d\'abord <a href="' + h(guide) + '" style="color:#6b665e;">télécharger le guide d\'animation</a>.</p>';
  if (avecImage) {
    c += '<p style="margin:18px 0 0;font-size:13px;color:#6b665e;">Votre fresque est jointe à ce message, telle que le groupe l\'a laissée.</p>';
  }

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
        const quand = A.instantDe(a);   // heure de Paris, recalculee
        if (!isFinite(quand)) continue;
        if (now < quand + FIN_MS || now > quand + LIMITE_MS) continue;
        const dest = [a.animateur && a.animateur.mail].filter(Boolean);
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        if (!dest.length && !parts.length) { a.suiviEnvoye = true; await st.setJSON(b.key, a, { onlyIfMatch: res.etag }); continue; }
        const png = await imageDe(a.code);
        const m = contenuSuivi(!!png);
        const envoiM = { to: dest.length ? dest : parts, bcc: dest.length ? parts : [], subject: "Merci ! Et si vous animiez la Fresque des risques de l'IA ?", text: m.text, html: m.html };
        if (png) envoiM.attachments = [{ filename: "fresque-des-risques-de-l-ia.jpg", content: png }];
        const env = await mail.envoi(envoiM);
        if (env.envoye) {
          a.suiviEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          await effacerImage(a.code);
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  // Menage : une image dont l'atelier n'a jamais donne lieu a un envoi ne doit
  // pas rester. Le travail d'un groupe n'a pas a trainer sur nos serveurs.
  try {
    const { blobs } = await storeImages().list({ prefix: "image:" });
    for (const b of blobs) {
      const r = await storeImages().get(b.key, { type: "json" });
      if (!r || Date.now() - (r.ts || 0) > IMG_LIMITE_MS) { try { await storeImages().delete(b.key); } catch (e) {} }
    }
  } catch (e) {}
  return { statusCode: 200, body: "suivis envoyés: " + envoyes };
};
