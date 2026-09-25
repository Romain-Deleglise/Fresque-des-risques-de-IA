/* ALERTES « PROCHAINS ATELIERS » : abonnement et desabonnement.

   Regles pures : serveur/src/alertes.js. L'envoi hebdomadaire vit dans
   alertes-envoi.js. Stockage : Netlify Blobs, magasin "fresque-alertes".

   POST { op:"abonner", mail, format, communes, rayonKm } -> { ok, jeton }
   GET  ?d=<jeton>                            -> desabonnement en un clic
   GET  ?etat=<jeton>                         -> { format, communes, rayonKm } pour la page

   LE DESABONNEMENT EST UN SIMPLE LIEN. Pas de connexion, pas de formulaire,
   pas de « confirmez-vous ». Rendre la sortie penible ne retient personne :
   cela transforme un desabonnement en signalement de courrier indesirable,
   ce qui abime la reputation de notre domaine d'envoi pour tout le monde.
*/
"use strict";
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const A = require("../../serveur/src/alertes.js");
const L = require("../../serveur/src/limites.js");

const SEUIL = { limite: 10, fenetreMs: 60 * 60 * 1000 };

function store() { return getStore({ name: "fresque-alertes" }); }
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
  const k = "alr:" + cle;
  const now = Date.now();
  const actuel = await s.get(k, { type: "json" }).catch(() => null);
  if (L.atteinte(actuel, now, SEUIL.limite, SEUIL.fenetreMs)) return true;
  await s.setJSON(k, L.incrementer(actuel, now, SEUIL.fenetreMs)).catch(() => {});
  return false;
}

/* L'adresse sert de cle : un reabonnement met a jour les preferences au lieu
   de creer un doublon, qui vaudrait deux messages par semaine. On la hache,
   pour ne pas semer des adresses en clair dans les noms de cles. */
const cleAbonne = (mail) => "abonne:" + crypto.createHash("sha256").update(mail).digest("hex").slice(0, 32);
const cleJeton = (jeton) => "jeton:" + jeton;

exports.handler = async (event) => {
  connectLambda(event);
  const s = store();

  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const jeton = String(q.d || q.etat || "");
    if (!/^[A-Za-z0-9_-]{16,48}$/.test(jeton)) return json(400, { erreur: "Lien invalide." });

    const ref = await s.get(cleJeton(jeton), { type: "json" }).catch(() => null);
    if (!ref || !ref.cle) return json(404, { erreur: "Ce lien n’est plus valable." });
    const ab = await s.get(ref.cle, { type: "json" }).catch(() => null);
    if (!ab) return json(404, { erreur: "Ce lien n’est plus valable." });

    if (q.etat) return json(200, { ok: true, format: ab.format, communes: ab.communes || [], rayonKm: ab.rayonKm, actif: !!ab.actif });

    /* On efface plutot que de marquer inactif : garder l'adresse de quelqu'un
       qui vient de demander a ne plus rien recevoir serait le contraire de ce
       qu'il demande. */
    await s.delete(ref.cle).catch(() => {});
    await s.delete(cleJeton(jeton)).catch(() => {});
    return json(200, { ok: true, desabonne: true });
  }

  if (event.httpMethod !== "POST") return json(405, { erreur: "Méthode non autorisée." });

  let corps;
  try { corps = JSON.parse(event.body || "{}"); }
  catch { return json(400, { erreur: "Requête illisible." }); }

  // Champ piege, comme sur les formulaires de retour.
  if (String(corps.site || "").trim()) return json(200, { ok: true });

  const v = A.validerAbonnement(corps, Date.now());
  if (v.erreur) return json(400, { erreur: v.erreur });

  if (await debitDepasse(ip(event))) {
    return json(429, { erreur: "Trop de tentatives. Réessayez dans une heure." });
  }

  const cle = cleAbonne(v.abonne.mail);
  const existant = await s.get(cle, { type: "json" }).catch(() => null);
  // Un reabonnement garde le jeton existant : les liens de desabonnement deja
  // envoyes doivent continuer de fonctionner.
  const jeton = (existant && existant.jeton) || crypto.randomBytes(18).toString("base64url");

  const abonne = Object.assign({}, v.abonne, {
    jeton: jeton,
    depuis: (existant && existant.depuis) || v.abonne.depuis,
    dernierEnvoi: (existant && existant.dernierEnvoi) || 0
  });

  await s.setJSON(cle, abonne);
  await s.setJSON(cleJeton(jeton), { cle: cle });

  return json(200, { ok: true, jeton: jeton, miseAJour: !!existant });
};
