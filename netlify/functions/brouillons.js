/* BROUILLONS DE CARTES : corriger une carte la ou on lit les retours.

   Regles pures : serveur/src/brouillons.js. Stockage : Netlify Blobs, magasin
   "fresque-brouillons".

   GET  ?jeton=<...>                      -> { brouillons, resume }
   POST { action:"enregistrer", n, titre?, verso?, explication?, jeton }
   POST { action:"oublier", n, jeton }
   POST { action:"publier", jeton }       -> { fichier } : cartes.json complet

   PAS DE PUBLICATION AUTOMATIQUE. « Publier » rend le fichier, il ne l'ecrit
   nulle part : la fonction n'a pas de droit d'ecriture sur le depot, et lui en
   donner un signifierait poser un jeton GitHub dans une fonction publique,
   garde par le seul jeton de moderation. Le fichier se depose a la main, la CI
   le valide, quelqu'un relit. C'est une etape de plus et une surface d'attaque
   de moins.

   LES BROUILLONS SONT COTE SERVEUR, pas dans le navigateur : plusieurs
   personnes moderent, et on ne perd pas son travail en changeant d'appareil.
*/
"use strict";
const { getStore, connectLambda } = require("@netlify/blobs");
const B = require("../../serveur/src/brouillons.js");
const fs = require("fs");
const path = require("path");

function store() { return getStore({ name: "fresque-brouillons" }); }

const json = (s, c) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(c)
});

/* Comparaison a duree constante : sans elle, le temps de reponse laisse
   deviner le jeton caractere par caractere. */
function memeJeton(fourni, attendu) {
  if (!attendu || typeof fourni !== "string" || fourni.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= fourni.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

/* La source des cartes, lue sur le disque comme la table des communes. Elle
   voyage avec la fonction grace a `included_files` (voir netlify.toml). */
function lireCartes() {
  const candidats = [
    path.join(__dirname, "..", "..", "site", "data", "cartes.json"),
    path.join(process.cwd(), "site", "data", "cartes.json")
  ];
  for (const f of candidats) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* suivant */ }
  }
  const e = new Error("cartes.json introuvable. Cherche a : " + candidats.join(", ")
    + ". Si ce message apparait en production, c'est que `included_files` ne le couvre plus.");
  e.code = "CARTES_ABSENTES";
  throw e;
}

const cle = (n) => "brouillon:" + n;

async function lireBrouillons(s) {
  const liste = await s.list({ prefix: "brouillon:" }).catch(() => ({ blobs: [] }));
  const out = [];
  for (const b of liste.blobs || []) {
    const v = await s.get(b.key, { type: "json" }).catch(() => null);
    if (v) out.push(v);
  }
  return out.sort((a, b2) => a.n - b2.n);
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) { /* hors Lambda */ }

  const q = event.queryStringParameters || {};
  const corps = (() => {
    try { return JSON.parse(event.body || "{}"); } catch (e) { return null; }
  })();
  const jeton = (corps && corps.jeton) || q.jeton || "";

  /* TOUT EST RESERVE A LA MODERATION, lecture comprise : un brouillon est une
     correction non relue, qui ne doit pas se lire comme un texte publie. */
  if (!memeJeton(jeton, process.env.ADMIN_TOKEN || "")) {
    return json(403, { erreur: "Jeton incorrect." });
  }

  let source;
  try { source = lireCartes(); }
  catch (e) {
    console.error("[brouillons] " + e.message);
    return json(503, { erreur: "Le service est momentanément indisponible." });
  }

  const s = store();

  if (event.httpMethod === "GET") {
    const brouillons = await lireBrouillons(s);
    return json(200, { ok: true, brouillons: brouillons, resume: B.resume(brouillons, source.cartes) });
  }
  if (event.httpMethod !== "POST") return json(405, { erreur: "Méthode non autorisée." });
  if (!corps) return json(400, { erreur: "Requête illisible." });

  if (corps.action === "oublier") {
    const n = B.numeroDeCarte(corps.n);
    if (n === null) return json(400, { erreur: "Carte inconnue." });
    await s.delete(cle(n)).catch(() => {});
    return json(200, { ok: true });
  }

  if (corps.action === "publier") {
    const brouillons = await lireBrouillons(s);
    if (!brouillons.length) return json(400, { erreur: "Aucune modification à publier." });
    return json(200, { ok: true, fichier: B.appliquer(source, brouillons),
      resume: B.resume(brouillons, source.cartes) });
  }

  if (corps.action === "enregistrer") {
    const n = B.numeroDeCarte(corps.n);
    const origine = (source.cartes || []).find((c) => c.n === n) || null;
    const v = B.valider(corps, origine, Date.now());
    if (v.erreur) return json(400, { erreur: v.erreur });
    /* On FUSIONNE avec le brouillon deja en place : corriger le titre puis le
       verso, en deux fois, ne doit pas effacer la premiere correction. Et
       reecrire un champ comme l'original retire cette correction-la, sans
       toucher aux autres. */
    const avant = await s.get(cle(n), { type: "json" }).catch(() => null);
    const fusion = B.fusionner(avant, v);
    if (!fusion) await s.delete(cle(n)).catch(() => {});
    else await s.setJSON(cle(n), fusion);
    const brouillons = await lireBrouillons(s);
    return json(200, { ok: true, brouillon: fusion, nombre: brouillons.length });
  }

  return json(400, { erreur: "Action inconnue." });
};
