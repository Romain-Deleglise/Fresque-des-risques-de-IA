/* Envoi d'e-mail transactionnel via Resend (https://resend.com).
   Degradation propre : sans RESEND_API_KEY, on ne bloque jamais l'action,
   on renvoie { envoye:false } et l'appelant affiche le code a l'ecran.
   Variables d'environnement (Netlify) :
     RESEND_API_KEY  : cle API du compte Resend
     MAIL_FROM       : expediteur verifie, ex "Fresque des risques de l'IA <atelier@pauseia.fr>"
     MAIL_REPONSE    : (optionnel) adresse Reply-To, ex contact@pauseia.fr */
"use strict";

function config() {
  return {
    cle: process.env.RESEND_API_KEY || "",
    from: process.env.MAIL_FROM || "Fresque des risques de l'IA <onboarding@resend.dev>",
    replyTo: process.env.MAIL_REPONSE || "",
    // Garde-fou d'envoi ("cadre fou") : plafonds quotidien et mensuel, sous les
    // limites du compte Resend, pour ne jamais se faire couper le service par un
    // pic ou une boucle. Ajustables via variables d'environnement Netlify.
    maxJour: Number(process.env.RESEND_MAX_JOUR || 80),
    maxMois: Number(process.env.RESEND_MAX_MOIS || 2500)
  };
}

// Compteurs d'envoi dans le magasin Blobs partage (best effort). En cas
// d'indisponibilite du magasin on n'entrave jamais l'envoi (fail open sur
// l'infra) ; le plafond ne bloque que lorsqu'on peut le lire de facon fiable.
function magasin() {
  try {
    var b = require("@netlify/blobs");
    return b.getStore({ name: "fresque-limites" });
  } catch (e) { return null; }
}
function cadran(now) {
  var d = new Date(now);
  var j = d.toISOString().slice(0, 10);          // YYYY-MM-DD (UTC)
  return { jour: "mail:jour:" + j, mois: "mail:mois:" + j.slice(0, 7) };
}
async function lireCompteur(st, k) {
  try {
    var res = await st.getWithMetadata(k, { type: "json" });
    return (res && res.data && Number(res.data.n)) || 0;
  } catch (e) { return null; }
}
// Renvoie { bloque:bool, raison? } sans incrementer.
async function plafondAtteint(c) {
  var st = magasin();
  if (!st) return { bloque: false };
  var k = cadran(Date.now());
  var j = await lireCompteur(st, k.jour);
  var m = await lireCompteur(st, k.mois);
  if (j === null && m === null) return { bloque: false }; // lecture impossible : on laisse passer
  if (j !== null && j >= c.maxJour) return { bloque: true, raison: "quota_jour" };
  if (m !== null && m >= c.maxMois) return { bloque: true, raison: "quota_mois" };
  return { bloque: false };
}
async function incrementerCompteurs() {
  var st = magasin();
  if (!st) return;
  var k = cadran(Date.now());
  for (var i = 0; i < 2; i++) {
    var cle = i === 0 ? k.jour : k.mois;
    try {
      var n = await lireCompteur(st, cle);
      await st.setJSON(cle, { n: (n || 0) + 1, maj: Date.now() });
    } catch (e) {}
  }
}
// Journal structure (visible dans les logs de fonction Netlify). Aucune donnee
// personnelle : on ne loggue pas les adresses, seulement le nombre et le motif.
function journal(champ) {
  try { console.log("[mail] " + JSON.stringify(champ)); } catch (e) {}
}

// envoi({ to, cc?, subject, text }) -> { envoye:bool, raison? }
async function envoi(m) {
  var c = config();
  if (!c.cle) return { envoye: false, raison: "pas_de_cle" };
  var to = [].concat(m.to || []).filter(Boolean);
  if (!to.length) return { envoye: false, raison: "sans_destinataire" };
  var nbDest = to.length + [].concat(m.cc || []).filter(Boolean).length + [].concat(m.bcc || []).filter(Boolean).length;
  var garde = await plafondAtteint(c);
  if (garde.bloque) { journal({ evt: "bloque", raison: garde.raison, dest: nbDest }); return { envoye: false, raison: garde.raison }; }
  var corps = { from: c.from, to: to, subject: m.subject, text: m.text };
  if (m.html) corps.html = m.html;
  if (m.attachments && m.attachments.length) corps.attachments = m.attachments;
  if (m.cc && [].concat(m.cc).filter(Boolean).length) corps.cc = [].concat(m.cc).filter(Boolean);
  if (m.bcc && [].concat(m.bcc).filter(Boolean).length) corps.bcc = [].concat(m.bcc).filter(Boolean);
  if (c.replyTo) corps.reply_to = c.replyTo;
  try {
    var r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + c.cle, "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    });
    if (!r.ok) { journal({ evt: "echec", raison: "http_" + r.status, dest: nbDest }); return { envoye: false, raison: "http_" + r.status }; }
    await incrementerCompteurs();
    journal({ evt: "envoye", dest: nbDest });
    return { envoye: true };
  } catch (e) {
    journal({ evt: "echec", raison: "exception", dest: nbDest });
    return { envoye: false, raison: "exception" };
  }
}

module.exports = { envoi: envoi, configuree: function () { return !!config().cle; } };
