/* Registre durable des contacts (animateur·ices et participant·es).

   Les ateliers (store "fresque-ateliers") sont purges 7 j apres leur date et
   supprimes s'ils sont annules : ils ne peuvent donc pas servir de fichier de
   suivi. Ce module tient un registre separe (store "fresque-contacts"), non
   purge, alimente a la programmation et a l'inscription, pour :
     - recontacter les participant·es (suivi, invitations),
     - produire des statistiques (nombre d'ateliers, de participant·es...).

   Base legale RGPD : interet legitime de l'association (developper la fresque),
   avec information claire au moment de la collecte et desinscription/effacement
   a tout moment (voir la page admin et les mentions legales).

   Une entree par adresse e-mail (cle = empreinte SHA-256 de l'e-mail normalise).
   Ecritures best-effort : une panne du registre ne doit jamais bloquer une
   inscription. */
"use strict";
const crypto = require("crypto");

const PREFIXE = "contact:";
const MAX_PART = 60; // on borne l'historique par contact

function normaliserMail(m) {
  return String(m == null ? "" : m).trim().toLowerCase();
}
function cle(mail) {
  return PREFIXE + crypto.createHash("sha256").update(normaliserMail(mail)).digest("hex");
}

/* Enregistre (ou met a jour) un contact pour une participation donnee.
   role : "animateur" | "participant". Idempotent : une meme paire
   (code, role) n'est comptee qu'une fois (rejeux, re-inscriptions). */
async function enregistrer(store, { mail, prenom, role, code, quandMs, mode, titre }) {
  const m = normaliserMail(mail);
  if (!m || m.indexOf("@") < 1) return false;
  const k = cle(m);
  const now = Date.now();
  for (let essai = 0; essai < 5; essai++) {
    let res = null;
    try { res = await store.getWithMetadata(k, { type: "json" }); } catch (e) { res = null; }
    const c = (res && res.data) || {
      mail: m, prenom: "", animateur: false, participant: false,
      nbAnimations: 0, nbParticipations: 0, premierMs: now, dernierMs: now,
      ateliers: [], desinscrit: false
    };
    c.mail = m;
    if (prenom && String(prenom).trim()) c.prenom = String(prenom).trim();
    c.ateliers = Array.isArray(c.ateliers) ? c.ateliers : [];
    const deja = code && c.ateliers.some(function (p) { return p.code === code && p.role === role; });
    if (!deja) {
      if (role === "animateur") { c.animateur = true; c.nbAnimations = (c.nbAnimations || 0) + 1; }
      else { c.participant = true; c.nbParticipations = (c.nbParticipations || 0) + 1; }
      c.ateliers.push({ code: code || "", quandMs: isFinite(quandMs) ? quandMs : now, mode: mode || "", role: role, titre: titre || "" });
      if (c.ateliers.length > MAX_PART) c.ateliers = c.ateliers.slice(-MAX_PART);
    }
    c.premierMs = Math.min(c.premierMs || now, now);
    c.dernierMs = now;
    // Un nouveau contact volontaire annule une desinscription passee ? Non :
    // on respecte le choix de la personne, elle reste desinscrite du suivi.
    try {
      const opt = res && res.etag ? { onlyIfMatch: res.etag } : { onlyIfNew: true };
      const w = await store.setJSON(k, c, opt);
      if (w && w.modified === false) continue; // concurrence : on rejoue
      return true;
    } catch (e) {
      // onlyIfNew a echoue car la cle existe deja : on rejoue en lecture-fusion.
      continue;
    }
  }
  return false;
}

/* Liste tous les contacts (tableau d'objets), tri par dernier contact desc. */
async function lister(store) {
  const out = [];
  try {
    const { blobs } = await store.list({ prefix: PREFIXE });
    for (const b of blobs) {
      try {
        const res = await store.getWithMetadata(b.key, { type: "json" });
        if (res && res.data) out.push(res.data);
      } catch (e) {}
    }
  } catch (e) {}
  out.sort(function (a, b) { return (b.dernierMs || 0) - (a.dernierMs || 0); });
  return out;
}

/* Marque un contact comme desinscrit (droit d'opposition) sans le supprimer. */
async function desinscrire(store, mail) {
  const k = cle(mail);
  try {
    const res = await store.getWithMetadata(k, { type: "json" });
    if (!res || !res.data) return false;
    const c = res.data; c.desinscrit = true; c.desinscritMs = Date.now();
    await store.setJSON(k, c, { onlyIfMatch: res.etag });
    return true;
  } catch (e) { return false; }
}

/* Efface definitivement un contact (droit a l'effacement). */
async function supprimer(store, mail) {
  try { await store.delete(cle(mail)); return true; } catch (e) { return false; }
}

module.exports = { enregistrer, lister, desinscrire, supprimer, cle, normaliserMail };
