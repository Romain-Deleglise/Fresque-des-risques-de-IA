/* RETOURS DES ANIMATEUR·ICES SUR LES CARTES (Netlify Function).

   Un animateur qui vient d'animer sait ce qui a coince : une carte mal
   comprise, un texte qui a vieilli, un lien qui manque. C'est la seule source
   fiable pour faire evoluer le jeu, et elle se perd si on ne la recueille pas
   au moment ou elle existe.

   MODERATION A POSTERIORI, SUR LA PAGE. Un retour s'affiche immediatement,
   grise et marque « en attente de relecture ». Qui saisit le jeton
   d'administration (ADMIN_TOKEN) en haut de la page voit apparaitre, sur chaque
   retour, de quoi le valider ou le supprimer. Rien a ouvrir ailleurs : une
   file d'attente que personne ne consulte ne modere rien, et l'espace n'est
   pas public, ce qui borne deja l'exposition.

   Operations :
     GET                                  -> { retours: [...], compte: {...} }
     POST {sujet, carte?, texte, nom?, email?}   -> depose un retour
     POST {action:"valider"|"supprimer", cle, jeton} -> modere

   L'adresse e-mail laissee par un animateur n'est JAMAIS renvoyee : elle sert
   a lui repondre, pas a etre publiee.
*/
const { getStore, connectLambda } = require("@netlify/blobs");
const L = require("../../serveur/src/limites.js");
const C = require("../../serveur/src/commentaires.js");

// Genereux pour un usage normal (un animateur commente plusieurs cartes
// d'affilee apres son atelier), assez bas pour couper un robot.
const SEUIL = { limite: 30, fenetreMs: 60 * 60 * 1000 };

function store() { return getStore({ name: "fresque-commentaires" }); }
function limites() { return getStore({ name: "fresque-limites" }); }

const json = (statut, corps) => ({
  statusCode: statut,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(corps)
});

function ip(event) {
  const h = event.headers || {};
  return (h["x-nf-client-connection-ip"] || h["client-ip"]
    || (h["x-forwarded-for"] || "").split(",")[0] || "inconnue").trim();
}

async function debitDepasse(cle) {
  const s = limites();
  const k = "com:" + cle;
  const now = Date.now();
  const actuel = await s.get(k, { type: "json" }).catch(() => null);
  if (L.atteinte(actuel, now, SEUIL.limite, SEUIL.fenetreMs)) return true;
  await s.setJSON(k, L.incrementer(actuel, now, SEUIL.fenetreMs)).catch(() => {});
  return false;
}

/* Comparaison a duree constante : sans elle, le temps de reponse laisse
   deviner le jeton caractere par caractere. */
function memeJeton(fourni, attendu) {
  if (!attendu || typeof fourni !== "string" || fourni.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= fourni.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

async function lireTout() {
  const s = store();
  const liste = await s.list().catch(() => ({ blobs: [] }));
  const cles = (liste.blobs || []).map((b) => b.key);
  const retours = [];
  for (const k of cles) {
    const v = await s.get(k, { type: "json" }).catch(() => null);
    if (v) retours.push(C.public(v, k));
  }
  retours.sort((a, b) => (b.date || 0) - (a.date || 0));
  return { retours, compte: C.compter(cles) };
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "GET") {
    return json(200, Object.assign({ ok: true }, await lireTout()));
  }

  if (event.httpMethod !== "POST") {
    return json(405, { erreur: "Méthode non autorisée." });
  }

  let corps;
  try { corps = JSON.parse(event.body || "{}"); }
  catch { return json(400, { erreur: "Requête illisible." }); }

  // ── Modération ───────────────────────────────────────────────
  if (corps.action === "valider" || corps.action === "supprimer") {
    if (!memeJeton(corps.jeton, process.env.ADMIN_TOKEN || "")) {
      return json(403, { erreur: "Jeton incorrect." });
    }
    if (!C.cleValide(corps.cle)) return json(400, { erreur: "Référence inconnue." });

    const s = store();
    if (corps.action === "supprimer") {
      await s.delete(corps.cle);
      return json(200, { ok: true });
    }
    const v = await s.get(corps.cle, { type: "json" }).catch(() => null);
    if (!v) return json(404, { erreur: "Ce retour n’existe plus." });
    v.valide = true;
    await s.setJSON(corps.cle, v);
    return json(200, { ok: true });
  }

  // ── Dépôt d'un retour ────────────────────────────────────────
  const v = C.valider(corps, Date.now());
  if (v.erreur) return json(400, { erreur: v.erreur });

  if (await debitDepasse(ip(event))) {
    return json(429, { erreur: "Trop de retours envoyés. Réessayez dans une heure." });
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const cle = C.cle(v.retour, id);
  await store().setJSON(cle, v.retour);

  return json(200, { ok: true, retour: C.public(v.retour, cle) });
};
