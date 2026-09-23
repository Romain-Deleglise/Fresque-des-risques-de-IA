/* DEPOT DES RETOURS D'ATELIER ET DES TEMOIGNAGES (Netlify Function).

   En attendant les formulaires Notion, le site les recueille lui-meme. Les
   deux e-mails de suivi pointent vers /retour/ et /temoignage/ ; l'equipe les
   relit dans /admin/.

   Regles pures : serveur/src/retours.js. Stockage : Netlify Blobs, magasin
   "fresque-retours". Rien n'est publie automatiquement -- un temoignage
   n'apparait sur le site qu'apres relecture.

   POST { genre:"atelier"|"temoignage", ... } -> { ok:true }
*/
"use strict";
const { getStore, connectLambda } = require("@netlify/blobs");
const R = require("../../serveur/src/retours.js");
const L = require("../../serveur/src/limites.js");

// Genereux pour un atelier entier qui repond d'affilee, assez bas pour couper
// un robot qui aurait franchi le champ piege.
const SEUIL = { limite: 20, fenetreMs: 60 * 60 * 1000 };

function store() { return getStore({ name: "fresque-retours" }); }
function limites() { return getStore({ name: "fresque-limites" }); }

const json = (s, c) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(c)
});

function ip(event) {
  const h = event.headers || {};
  return (h["x-nf-client-connection-ip"] || h["client-ip"]
    || (h["x-forwarded-for"] || "").split(",")[0] || "inconnue").trim();
}

async function debitDepasse(cle) {
  const s = limites();
  const k = "ret:" + cle;
  const now = Date.now();
  const actuel = await s.get(k, { type: "json" }).catch(() => null);
  if (L.atteinte(actuel, now, SEUIL.limite, SEUIL.fenetreMs)) return true;
  await s.setJSON(k, L.incrementer(actuel, now, SEUIL.fenetreMs)).catch(() => {});
  return false;
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod !== "POST") return json(405, { erreur: "Méthode non autorisée." });

  let corps;
  try { corps = JSON.parse(event.body || "{}"); }
  catch { return json(400, { erreur: "Requête illisible." }); }

  /* Champ piege rempli : on repond comme si tout allait bien. Dire au robot
     qu'il a ete repere lui apprend a passer la prochaine fois. */
  if (R.estUnRobot(corps)) return json(200, { ok: true });

  const v = corps.genre === "temoignage"
    ? R.validerTemoignage(corps, Date.now())
    : R.validerRetour(corps, Date.now());
  if (v.erreur) return json(400, { erreur: v.erreur });

  if (await debitDepasse(ip(event))) {
    return json(429, { erreur: "Trop d’envois. Réessayez dans une heure." });
  }

  const entree = v.retour || v.temoignage;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await store().setJSON(R.cle(entree, id), entree);

  return json(200, { ok: true });
};
