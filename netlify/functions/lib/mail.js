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
    maxJour: Number(process.env.RESEND_MAX_JOUR || 95),
    maxMois: Number(process.env.RESEND_MAX_MOIS || 2500),
    // Alerte : des qu'on atteint ce nombre d'envois dans la journee, un mail
    // previent l'equipe (une seule fois par jour) qu'on approche la limite.
    seuilAlerte: Number(process.env.RESEND_SEUIL_ALERTE || 80),
    alerteA: process.env.MAIL_ALERTE || "contact@pauseia.fr"
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
// Incremente jour + mois, renvoie le nouveau total du jour (ou null si inconnu).
async function incrementerCompteurs() {
  var st = magasin();
  if (!st) return null;
  var k = cadran(Date.now());
  var totalJour = null;
  for (var i = 0; i < 2; i++) {
    var cle = i === 0 ? k.jour : k.mois;
    try {
      var n = await lireCompteur(st, cle);
      var nv = (n || 0) + 1;
      if (i === 0) totalJour = nv;
      await st.setJSON(cle, { n: nv, maj: Date.now() });
    } catch (e) {}
  }
  return totalJour;
}
// Alerte l'equipe une seule fois par jour quand le seuil est franchi. Le mail
// d'alerte contourne le plafond et n'est pas compte (option _interne), pour
// eviter toute recursion.
async function peutAlerter(c, totalJour) {
  if (!c.alerteA || totalJour == null || totalJour < c.seuilAlerte) return;
  var st = magasin();
  if (!st) return;
  var cle = "mail:alerte:" + cadran(Date.now()).jour.split(":").pop();
  try {
    var deja = await st.getWithMetadata(cle, { type: "json" });
    if (deja && deja.data) return; // deja alerte aujourd'hui
    await st.setJSON(cle, { le: Date.now(), n: totalJour });
  } catch (e) { return; } // sans marqueur fiable, on n'insiste pas (pas de spam)
  journal({ evt: "alerte_seuil", jour: totalJour });
  await envoi({
    _interne: true,
    to: c.alerteA,
    subject: "Fresque : " + totalJour + " e-mails envoyes aujourd'hui (limite proche)",
    text: "Bonjour,\n\nLe service d'e-mail de la Fresque des risques de l'IA a atteint "
      + totalJour + " envois aujourd'hui (seuil d'alerte : " + c.seuilAlerte
      + ", plafond du jour : " + c.maxJour + ").\n\nAu-dela du plafond, les envois "
      + "sont refuses proprement jusqu'a demain. Si c'est un usage normal qui monte, "
      + "pensez a verifier le quota du compte Resend et a relever RESEND_MAX_JOUR.\n\n"
      + "Ce message est automatique et n'est envoye qu'une fois par jour."
  });
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
  // Le mail d'alerte interne contourne le plafond et n'est ni compte ni re-alerte.
  if (!m._interne) {
    var garde = await plafondAtteint(c);
    if (garde.bloque) { journal({ evt: "bloque", raison: garde.raison, dest: nbDest }); return { envoye: false, raison: garde.raison }; }
  }
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
    if (!m._interne) {
      var totalJour = await incrementerCompteurs();
      journal({ evt: "envoye", dest: nbDest, jour: totalJour });
      try { await peutAlerter(c, totalJour); } catch (e) {}
    }
    return { envoye: true };
  } catch (e) {
    journal({ evt: "echec", raison: "exception", dest: nbDest });
    return { envoye: false, raison: "exception" };
  }
}

module.exports = { envoi: envoi, configuree: function () { return !!config().cle; } };
