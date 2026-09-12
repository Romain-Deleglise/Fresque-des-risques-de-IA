/* Rappels d'ateliers (Netlify Scheduled Function).
   Programmee via netlify.toml (executee une fois par jour). Pour chaque atelier
   dont la date approche (dans les ~26 h) et pas encore rappele, envoie UN e-mail
   a l'animateur + tous les participants (en Cci), puis marque l'atelier comme
   rappele. Aucun code affiche : le bouton « Rejoindre » porte le code dans son
   lien, et un lien discret permet a l'animateur d'ouvrir SA session.
   Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, dateLisible = G.dateLisible, mailHtml = G.mailHtml, bouton = G.bouton;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const FENETRE_MS = 26 * 60 * 60 * 1000;

function store() { return getStore({ name: "fresque-ateliers" }); }

// Liens porteurs du code : le code reste technique, il n'apparait nulle part.
function lienRejoindre(a) { return LIEN + "/en-ligne/session/?code=" + a.code; }
function lienOuvrir(a) {
  return LIEN + "/en-ligne/session/?ouvrir=" + a.code
    + (a.animateur && a.animateur.prenom ? "&prenom=" + encodeURIComponent(a.animateur.prenom) : "");
}
function lienGerer(a) { return LIEN + "/devenir-animateur/?gerer=" + a.code + "#gerer"; }

// Deux e-mails DISTINCTS : l'animateur·ice et les inscrit·es n'ont ni le meme
// role, ni les memes liens, ni les memes informations. L'animateur voit la liste
// de son groupe et ouvre SA session ; les inscrit·es rejoignent la session et ne
// voient jamais l'adresse des autres (envoi en Cci seul).
function infosHtml(a) {
  var r = '<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">';
  var row = function (k, v) { return '<tr><td style="padding:5px 10px 5px 0;color:#6b6b6b;white-space:nowrap;vertical-align:top;">' + h(k) + '</td><td style="padding:5px 0;font-weight:600;">' + h(v) + '</td></tr>'; };
  r += row("Date", dateLisible(a.date, a.heure));
  r += row("Format", a.mode === "enligne" ? "En ligne" : "En présentiel");
  if (a.mode === "physique") { r += row("Lieu", a.lieu || ""); if (a.adresse) r += row("Adresse", a.adresse); }
  return r + "</table>";
}
function infosTexte(a, l) {
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
}

// --- Rappel de l'animateur·ice : son groupe, sa session, ses commandes --------
function mailRappelAnimateur(a) {
  var ouvrir = lienOuvrir(a);
  var noms = (a.participants || []).map(function (p) { return p.prenom; }).filter(Boolean);
  var l = [];
  l.push("Bonjour " + ((a.animateur && a.animateur.prenom) || "") + ",");
  l.push("");
  l.push("Rappel : vous animez bientôt un atelier de la Fresque des risques de l'IA.");
  l.push("");
  infosTexte(a, l);
  l.push("Inscrits : " + noms.length + " / " + a.maxParticipants + (noms.length ? " (" + noms.join(", ") + ")" : ""));
  if (a.visio) l.push("Visioconférence : " + a.visio);
  l.push("");
  if (a.mode === "enligne") { l.push("Le jour J, ouvrez votre session en un clic :"); l.push(ouvrir); }
  l.push("Besoin de déplacer ou d'annuler ? " + lienGerer(a));
  l.push("");
  l.push("Bon atelier,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h((a.animateur && a.animateur.prenom) || "") + ',</p>';
  c += '<p style="margin:0 0 16px;">Rappel : <strong>vous animez bientôt</strong> un atelier de la Fresque des risques de l\'IA.</p>';
  c += infosHtml(a);
  c += '<p style="margin:0 0 16px;color:#4a473f;"><strong>Inscrits :</strong> ' + noms.length + ' / ' + h(String(a.maxParticipants))
    + (noms.length ? ' <span style="color:#6b665e;">(' + h(noms.join(", ")) + ')</span>' : '') + '</p>';
  if (a.mode === "enligne") c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(ouvrir, "Ouvrir ma session") + '</p>';
  if (a.visio) c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  c += '<hr style="border:0;border-top:1px solid #eee;margin:20px 0;">';
  c += '<p style="margin:0;color:#6b665e;font-size:13px;">Un empêchement ? Vous pouvez <a href="' + h(lienGerer(a)) + '" style="color:#B0560A;">déplacer ou annuler l\'atelier</a> : les inscrit·es sont prévenu·es automatiquement.</p>';
  return { text: l.join("\n"), html: mailHtml(c) };
}

// --- Rappel des inscrit·es : la date, le lien pour rejoindre, rien d'autre ----
function mailRappelParticipants(a) {
  var rejoindre = lienRejoindre(a);
  var l = [];
  l.push("Bonjour,");
  l.push("");
  l.push("Rappel : votre atelier de la Fresque des risques de l'IA a lieu bientôt.");
  l.push("");
  infosTexte(a, l);
  if (a.animateur && a.animateur.prenom) l.push("Animé par : " + a.animateur.prenom);
  if (a.visio) l.push("Visioconférence : " + a.visio);
  l.push("");
  if (a.mode === "enligne") { l.push("Rejoindre le tableau en ligne (un clic, rien à saisir) :"); l.push(rejoindre); }
  l.push("");
  l.push("À tout bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  var c = "";
  c += '<p style="margin:0 0 14px;">Bonjour,</p>';
  c += '<p style="margin:0 0 16px;">Rappel : votre atelier de la Fresque des risques de l\'IA a lieu <strong>bientôt</strong>.</p>';
  c += infosHtml(a);
  if (a.animateur && a.animateur.prenom) c += '<p style="margin:0 0 16px;color:#4a473f;">Animé par <strong>' + h(a.animateur.prenom) + '</strong>.</p>';
  if (a.mode === "enligne") c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(rejoindre, "Rejoindre le tableau en ligne") + '</p>';
  if (a.visio) c += '<p style="margin:0 0 12px;text-align:center;">' + bouton(a.visio, "Rejoindre la visioconférence") + '</p>';
  c += '<p style="margin:0;color:#4a473f;">Aucun prérequis technique : les cartes expliquent tout au fur et à mesure.</p>';
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
        // Un e-mail pour l'animateur·ice, un autre pour les inscrit·es (en Cci
        // seul : personne n'y voit l'adresse de personne).
        const ma = mailRappelAnimateur(a);
        const envA = await mail.envoi({ to: a.animateur.mail, subject: "Rappel : vous animez bientôt un atelier", text: ma.text, html: ma.html });
        let envP = { envoye: false };
        if (parts.length) {
          const mp = mailRappelParticipants(a);
          envP = await mail.envoi({ bcc: parts, subject: "Rappel : votre atelier Fresque des risques de l'IA", text: mp.text, html: mp.html });
        }
        if (envA.envoye || envP.envoye) {
          a.rappelEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { statusCode: 200, body: "rappels envoyés: " + envoyes };
};
