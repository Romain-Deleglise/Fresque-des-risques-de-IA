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

/* Couleurs des e-mails, alignees sur le site (voir site.css) :
   - APLAT : l'orange de marque #E8811C avec l'ENCRE #1b1a17 par-dessus (6,3:1).
     Du blanc sur cet orange ne donnait que 2,8:1, illisible.
   - ORANGE TEXTE #B0560A pour ecrire sur un fond clair (5:1).
   - Petits textes en #6b665e : l'ancien #8a8577 ne faisait que 3,5:1. */
var ORANGE = "#E8811C", ENCRE = "#1b1a17", ORANGE_TXT = "#B0560A", GRIS = "#6b665e";

// Enveloppe HTML : carte blanche, en-tete orange, pied de page.
function mailHtml(contenu) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1a17;">'
    + '<div style="max-width:560px;margin:0 auto;padding:24px 14px;">'
    + '<div style="background:#ffffff;border:1px solid #eadfce;border-radius:14px;overflow:hidden;">'
    + '<div style="background:' + ORANGE + ';padding:16px 24px;"><span style="color:' + ENCRE + ';font-weight:700;font-size:16px;">La Fresque des risques de l\'IA</span></div>'
    + '<div style="padding:24px;font-size:15px;line-height:1.55;">' + contenu + '</div>'
    + '</div>'
    + '<p style="text-align:center;color:' + GRIS + ';font-size:12px;margin:16px 0 0;">Portée par Pause IA · <a href="https://pauseia.fr/" style="color:' + GRIS + ';">pauseia.fr</a></p>'
    + '</div></body></html>';
}

// Bouton d'action PRINCIPAL (plein, orange). Centre par le conteneur.
function bouton(url, texte) {
  return '<a href="' + h(url) + '" style="display:inline-block;background:' + ORANGE + ';color:' + ENCRE + ';text-decoration:none;font-weight:700;font-size:15px;line-height:1.2;padding:13px 26px;border-radius:9px;">' + h(texte) + '</a>';
}

// Bouton SECONDAIRE (contour, plus discret) pour les actions moins prioritaires
// (visio, guide...). Meme forme mais moins d'emphase, pour une hierarchie claire.
function boutonSecondaire(url, texte) {
  return '<a href="' + h(url) + '" style="display:inline-block;background:#ffffff;color:' + ORANGE_TXT + ';text-decoration:none;font-weight:600;font-size:14px;line-height:1.2;padding:10px 22px;border-radius:9px;border:1.5px solid #e6c9a4;">' + h(texte) + '</a>';
}

module.exports = { ORANGE: ORANGE, ENCRE: ENCRE, ORANGE_TXT: ORANGE_TXT, GRIS: GRIS, h: h, dateLisible: dateLisible, mailHtml: mailHtml, bouton: bouton, boutonSecondaire: boutonSecondaire };
