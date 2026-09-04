/* Programmation d'ateliers et inscriptions (Netlify Function).
   Etat persistant via Netlify Blobs (store "fresque-ateliers"). Envoi d'e-mails
   de validation via lib/mail.js (Resend) ; sans cle API, l'action reussit quand
   meme et le code est renvoye pour affichage a l'ecran.

   Operations (POST JSON { op, ... }) :
     programmer { mode, animateurPrenom, animateurMail, date, heure, ... } -> { code, atelier }
     liste {}                                   -> { ateliers: [vuePublique...] }
     inscrire { code, prenom, mail }            -> { atelier: vueConfirmation }
*/
const { getStore, connectLambda } = require("@netlify/blobs");
const A = require("../../serveur/src/ateliers.js");
const R = require("../../serveur/src/regles.js");
const L = require("../../serveur/src/limites.js");
const mail = require("./lib/mail.js");

// URL publique du site (variable d'environnement SITE_URL dans Netlify).
const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const TTL_PURGE_MS = 7 * 24 * 60 * 60 * 1000; // on garde les ateliers 7 j apres leur date

function store() { return getStore({ name: "fresque-ateliers" }); }
function sessions() { return getStore({ name: "fresque-sessions" }); }
function limites() { return getStore({ name: "fresque-limites" }); }
function cle(code) { return "atelier:" + code; }
const json = (s, c) => ({ statusCode: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(c) });

function ipClient(event) {
  const h = event.headers || {};
  const brut = h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "inconnue";
  return String(brut).split(",")[0].trim() || "inconnue";
}
async function depasse(seau, k) {
  const s = L.SEUILS[seau]; if (!s) return false;
  const lim = limites();
  try {
    const res = await lim.getWithMetadata(seau + ":" + k, { type: "json" });
    if (L.atteinte(res && res.data, Date.now(), s.limite, s.fenetreMs)) return true;
    await lim.setJSON(seau + ":" + k, L.incrementer(res && res.data, Date.now(), s.fenetreMs));
  } catch (e) {}
  return false;
}

async function codeLibre(code) {
  try { if (await store().get(cle(code))) return false; } catch (e) {}
  try { if (await sessions().get("session:" + code)) return false; } catch (e) {}
  return true;
}

async function purger(st) {
  try {
    const { blobs } = await st.list({ prefix: "atelier:" });
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        if (res && res.data && isFinite(res.data.quandMs) && Date.now() > res.data.quandMs + TTL_PURGE_MS) await st.delete(b.key);
      } catch (e) {}
    }
  } catch (e) {}
}

function mailAnimateur(a) {
  const l = [];
  l.push("Bonjour " + a.animateur.prenom + ",");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA est programmé.");
  l.push("");
  l.push("• Date : " + a.date + " à " + a.heure);
  l.push("• Format : " + (a.mode === "enligne" ? "en ligne" : "présentiel"));
  if (a.mode === "physique") { l.push("• Lieu : " + a.lieu); if (a.adresse) l.push("• Adresse : " + a.adresse); }
  l.push("• Visibilité : " + (a.visibilite === "prive" ? "privé (le code ne circule que si vous le donnez)" : "public (visible dans l'onglet Participer)"));
  l.push("• Participants max : " + a.maxParticipants);
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.mode === "enligne") l.push("Le jour J, ouvrez le tableau en ligne et créez la session avec ce code : " + LIEN + "/en-ligne/session/");
  l.push("");
  l.push("Une erreur de saisie ? Vous pouvez annuler cet atelier ici :");
  l.push(LIEN + "/demander-un-atelier/?annuler=" + a.code + "&t=" + (a.annulToken || ""));
  l.push("(Ne transmettez pas ce lien : il permet d'annuler l'atelier.)");
  l.push("");
  l.push("À bientôt,");
  l.push("La Fresque des risques de l'IA — Pause IA");
  return l.join("\n");
}
function mailParticipant(a, prenom) {
  const l = [];
  l.push("Bonjour " + prenom + ",");
  l.push("");
  l.push("Votre inscription à un atelier de la Fresque des risques de l'IA est confirmée.");
  l.push("");
  l.push("• Date : " + a.date + " à " + a.heure);
  l.push("• Format : " + (a.mode === "enligne" ? "en ligne" : "présentiel"));
  if (a.mode === "physique") { l.push("• Lieu : " + a.lieu); if (a.adresse) l.push("• Adresse : " + a.adresse); }
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.mode === "enligne") l.push("Le jour J, rejoignez le tableau en ligne avec ce code : " + LIEN + "/en-ligne/session/");
  l.push("");
  l.push("À bientôt,");
  l.push("La Fresque des risques de l'IA — Pause IA");
  return l.join("\n");
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) {}
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });
  let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
  const st = store();
  const ip = ipClient(event);

  try {
    if (d.op === "programmer") {
      if (await depasse("creation", ip)) return json(429, { erreur: { code: "trop", message: "Trop de créations récentes, réessayez dans un moment." } });
      const v = A.valider(d);
      if (v.erreur) return json(400, { erreur: v.erreur });
      let code = null;
      for (let i = 0; i < 10 && !code; i++) { const c = R.nouveauCode({}); if (await codeLibre(c)) code = c; }
      if (!code) return json(500, { erreur: { code: "code", message: "Impossible de générer un code." } });
      const a = v.atelier; a.code = code; a.participants = []; a.creeLe = Date.now();
      a.annulToken = R.jetonAleatoire();
      await st.setJSON(cle(code), a);
      purger(st);
      const env = await mail.envoi({ to: a.animateur.mail, subject: "Votre atelier Fresque des risques de l'IA — code " + code, text: mailAnimateur(a) });
      return json(200, { code: code, atelier: A.vueConfirmation(a), emailEnvoye: env.envoye });
    }

    if (d.op === "liste") {
      const out = [];
      const { blobs } = await st.list({ prefix: "atelier:" });
      for (const b of blobs) {
        try {
          const res = await st.getWithMetadata(b.key, { type: "json" });
          const a = res && res.data;
          if (a && a.visibilite === "public" && !A.estPasse(a)) out.push(A.vuePublique(a));
        } catch (e) {}
      }
      out.sort((x, y) => x.quandMs - y.quandMs);
      return json(200, { ateliers: out });
    }

    if (d.op === "inscrire") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      for (let essai = 0; essai < 6; essai++) {
        const res = await st.getWithMetadata(cle(code), { type: "json" });
        if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
        const a = res.data;
        const vi = A.validerInscription(a, d);
        if (vi.erreur) return json(400, { erreur: vi.erreur });
        a.participants = a.participants || []; a.participants.push(vi.participant);
        const w = await st.setJSON(cle(code), a, { onlyIfMatch: res.etag });
        if (w && w.modified === false) continue; // concurrence : on rejoue
        const env = await mail.envoi({ to: vi.participant.mail, subject: "Inscription confirmée — Fresque des risques de l'IA", text: mailParticipant(a, vi.participant.prenom) });
        return json(200, { atelier: A.vueConfirmation(a), emailEnvoye: env.envoye });
      }
      return json(409, { erreur: { code: "conflit", message: "Trop de monde s'inscrit en même temps, réessayez." } });
    }

    if (d.op === "annuler") {
      if (await depasse("entree", ip)) return json(429, { erreur: { code: "trop", message: "Trop de tentatives, patientez une minute." } });
      const code = String(d.code || "").toUpperCase();
      const res = await st.getWithMetadata(cle(code), { type: "json" });
      if (!res || !res.data) return json(404, { erreur: { code: "atelier_inconnu", message: "Cet atelier n'existe pas ou plus." } });
      const auth = A.annulationAutorisee(res.data, d);
      if (auth.erreur) return json(403, { erreur: auth.erreur });
      await st.delete(cle(code));
      return json(200, { annule: true });
    }

    return json(400, { error: "Opération inconnue." });
  } catch (e) {
    return json(500, { error: "Erreur du service d'ateliers.", details: String(e && e.message || e) });
  }
};
