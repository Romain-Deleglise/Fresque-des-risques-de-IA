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
    replyTo: process.env.MAIL_REPONSE || ""
  };
}

// envoi({ to, cc?, subject, text }) -> { envoye:bool, raison? }
async function envoi(m) {
  var c = config();
  if (!c.cle) return { envoye: false, raison: "pas_de_cle" };
  var to = [].concat(m.to || []).filter(Boolean);
  if (!to.length) return { envoye: false, raison: "sans_destinataire" };
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
    if (!r.ok) return { envoye: false, raison: "http_" + r.status };
    return { envoye: true };
  } catch (e) {
    return { envoye: false, raison: "exception" };
  }
}

module.exports = { envoi: envoi, configuree: function () { return !!config().cle; } };
