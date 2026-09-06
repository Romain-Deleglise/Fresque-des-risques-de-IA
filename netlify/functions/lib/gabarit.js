/* Gabarit commun des e-mails transactionnels (HTML + utilitaires).
   Partage par ateliers.js, rappels.js, suivi.js pour une mise en forme
   coherente : carte centree, en-tete orange, pied Pause IA. */
"use strict";

function h(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// Date lisible en francais : "Vendredi 11 décembre 2026 à 18:30".
function dateLisible(iso, heure) {
  try {
    var d = new Date(iso + "T" + (heure || "00:00") + ":00");
    var s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1) + " à " + (heure || "");
  } catch (e) { return iso + " à " + (heure || ""); }
}

// Enveloppe HTML : carte blanche, en-tete orange, pied de page.
function mailHtml(contenu) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1a17;">'
    + '<div style="max-width:560px;margin:0 auto;padding:24px 14px;">'
    + '<div style="background:#ffffff;border:1px solid #eadfce;border-radius:14px;overflow:hidden;">'
    + '<div style="background:#E8811C;padding:16px 24px;"><span style="color:#ffffff;font-weight:700;font-size:16px;">La Fresque des risques de l\'IA</span></div>'
    + '<div style="padding:24px;font-size:15px;line-height:1.55;">' + contenu + '</div>'
    + '</div>'
    + '<p style="text-align:center;color:#8a8577;font-size:12px;margin:16px 0 0;">Portée par Pause IA · <a href="https://pauseia.fr/" style="color:#8a8577;">pauseia.fr</a></p>'
    + '</div></body></html>';
}

// Bouton d'action (lien stylise).
function bouton(url, texte) {
  return '<a href="' + h(url) + '" style="display:inline-block;background:#B3610F;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">' + h(texte) + '</a>';
}

module.exports = { h: h, dateLisible: dateLisible, mailHtml: mailHtml, bouton: bouton };
