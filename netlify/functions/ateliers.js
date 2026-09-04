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

// Echappe le texte insere dans le HTML de l'e-mail.
function h(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function dateLisible(iso, heure) {
  try {
    const d = new Date(iso + "T" + (heure || "00:00") + ":00");
    const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1) + " à " + (heure || "");
  } catch (e) { return iso + " à " + (heure || ""); }
}

// Gabarit HTML commun : carte centree, en-tete oranges, pied Pause IA.
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
// Tableau d'informations de l'atelier (HTML).
function ligneInfo(cle, val) {
  return '<tr><td style="padding:5px 10px 5px 0;color:#6b6b6b;white-space:nowrap;vertical-align:top;">' + h(cle) + '</td>'
    + '<td style="padding:5px 0;font-weight:600;">' + h(val) + '</td></tr>';
}
function tableauInfos(a) {
  var r = "";
  r += ligneInfo("Date", dateLisible(a.date, a.heure));
  r += ligneInfo("Format", a.mode === "enligne" ? "En ligne" : "En présentiel");
  if (a.mode === "physique") { r += ligneInfo("Lieu", a.lieu || ""); if (a.adresse) r += ligneInfo("Adresse", a.adresse); }
  r += ligneInfo("Participants max", String(a.maxParticipants));
  return '<table style="border-collapse:collapse;margin:0 0 18px;font-size:14px;">' + r + '</table>';
}
function boiteCode(code) {
  return '<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:14px 18px;margin:0 0 18px;text-align:center;">'
    + '<div style="color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Code de session</div>'
    + '<div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#9a4d0f;margin-top:4px;">' + h(code) + '</div></div>';
}
function bouton(url, texte) {
  return '<a href="' + h(url) + '" style="display:inline-block;background:#B3610F;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">' + h(texte) + '</a>';
}

function mailAnimateur(a) {
  const sessionUrl = LIEN + "/en-ligne/session/";
  const annulUrl = LIEN + "/demander-un-atelier/?annuler=" + a.code + "&t=" + (a.annulToken || "");
  const visibilite = a.visibilite === "prive"
    ? "Votre atelier est privé : il n'apparaît pas dans la liste publique, à vous de communiquer le code aux personnes que vous invitez."
    : "Votre atelier est public : il apparaît dans l'onglet Participer, où chacun peut s'inscrire.";

  // Version texte (repli sans tirets longs)
  const l = [];
  l.push("Bonjour " + a.animateur.prenom + ",");
  l.push("");
  l.push("Votre atelier de la Fresque des risques de l'IA est bien programmé. Voici le récapitulatif.");
  l.push("");
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
  l.push("Participants max : " + a.maxParticipants);
  l.push("");
  l.push("Code de session : " + a.code);
  l.push(visibilite);
  l.push("");
  if (a.mode === "enligne") {
    l.push("Le jour J, ouvrez le tableau en ligne et créez la session avec ce code :");
    l.push(sessionUrl);
    l.push("Prévoyez un salon vocal (Discord, Google Meet) pour parler avec le groupe.");
    l.push("");
  }
  l.push("Une erreur de saisie ? Vous pouvez annuler cet atelier ici (ne transmettez pas ce lien) :");
  l.push(annulUrl);
  l.push("");
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  // Version HTML
  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(a.animateur.prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;">Votre atelier de la Fresque des risques de l\'IA est bien programmé. Voici le récapitulatif.</p>';
  c += tableauInfos(a);
  c += boiteCode(a.code);
  c += '<p style="margin:0 0 18px;color:#4a473f;">' + h(visibilite) + '</p>';
  if (a.mode === "enligne") {
    c += '<p style="margin:0 0 12px;">Le jour J, ouvrez le tableau en ligne et créez la session avec ce code. Prévoyez un salon vocal (Discord, Google Meet) pour échanger avec le groupe.</p>';
    c += '<p style="margin:0 0 20px;">' + bouton(sessionUrl, "Ouvrir le tableau en ligne") + '</p>';
  }
  c += '<hr style="border:0;border-top:1px solid #eee;margin:20px 0;">';
  c += '<p style="margin:0;color:#8a8577;font-size:13px;">Une erreur de saisie ? <a href="' + h(annulUrl) + '" style="color:#B3610F;">Annuler cet atelier</a>. Gardez ce lien pour vous : il permet d\'annuler l\'atelier.</p>';

  return { text: l.join("\n"), html: mailHtml(c) };
}

function mailParticipant(a, prenom) {
  const sessionUrl = LIEN + "/en-ligne/session/";

  const l = [];
  l.push("Bonjour " + prenom + ",");
  l.push("");
  l.push("Votre inscription à un atelier de la Fresque des risques de l'IA est confirmée. Voici les informations utiles.");
  l.push("");
  l.push("Date : " + dateLisible(a.date, a.heure));
  l.push("Format : " + (a.mode === "enligne" ? "en ligne" : "en présentiel"));
  if (a.mode === "physique") { l.push("Lieu : " + a.lieu); if (a.adresse) l.push("Adresse : " + a.adresse); }
  l.push("");
  l.push("Code de session : " + a.code);
  if (a.mode === "enligne") { l.push("Le jour J, rejoignez le tableau en ligne avec ce code :"); l.push(sessionUrl); }
  l.push("");
  l.push("Aucun prérequis technique : les cartes expliquent tout au fur et à mesure. À très vite !");
  l.push("");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");

  let c = "";
  c += '<p style="margin:0 0 14px;">Bonjour ' + h(prenom) + ',</p>';
  c += '<p style="margin:0 0 18px;">Votre inscription est confirmée. Voici les informations utiles pour vous préparer.</p>';
  c += tableauInfos(a);
  c += boiteCode(a.code);
  if (a.mode === "enligne") {
    c += '<p style="margin:0 0 12px;">Le jour J, rejoignez le tableau en ligne avec ce code, depuis un ordinateur.</p>';
    c += '<p style="margin:0 0 20px;">' + bouton(sessionUrl, "Rejoindre le tableau en ligne") + '</p>';
  }
  c += '<p style="margin:0;color:#4a473f;">Aucun prérequis technique : les cartes expliquent tout au fur et à mesure. À très vite !</p>';

  return { text: l.join("\n"), html: mailHtml(c) };
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
      const ma = mailAnimateur(a);
      const env = await mail.envoi({ to: a.animateur.mail, subject: "Votre atelier est programmé (code " + code + ")", text: ma.text, html: ma.html });
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
        const mp = mailParticipant(a, vi.participant.prenom);
        const env = await mail.envoi({ to: vi.participant.mail, subject: "Inscription confirmée à la Fresque des risques de l'IA", text: mp.text, html: mp.html });
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
