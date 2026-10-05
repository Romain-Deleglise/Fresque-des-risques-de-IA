/* BROUILLONS DE CARTES : corriger une carte la ou on lit les retours.

   Regles pures : serveur/src/brouillons.js. Stockage : Netlify Blobs, magasin
   "fresque-brouillons".

   GET  ?jeton=<...>                      -> { brouillons, resume }
   POST { action:"enregistrer", n, titre?, verso?, explication?, jeton }
   POST { action:"oublier", n, jeton }
   POST { action:"publier", jeton }       -> { fichier } : cartes.json complet
   POST { action:"fresque-enregistrer", tableau, jeton }
   POST { action:"fresque-publier", jeton } -> { fichier } : fresque-reference.json

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
const FB = require("../../serveur/src/fresque-brouillon.js");
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
function lireSource(nom) {
  const candidats = [
    path.join(__dirname, "..", "..", "site", "data", nom),
    path.join(process.cwd(), "site", "data", nom)
  ];
  for (const f of candidats) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* suivant */ }
  }
  const e = new Error(nom + " introuvable. Cherche a : " + candidats.join(", ")
    + ". Si ce message apparait en production, c'est que `included_files` ne le couvre plus.");
  e.code = "SOURCE_ABSENTE";
  throw e;
}
const lireCartes = () => lireSource("cartes.json");
const lireFresque = () => lireSource("fresque-reference.json");
const CLE_FRESQUE = "fresque";
const CLE_PUBLIE = "publie";

/* LE CALQUE PUBLIE, lu par le site et nettoye a chaque lecture. Un champ egal a
   la source n'y a plus rien a faire : voir B.residu(). */
async function lirePublie(s, source) {
  const v = await s.get(CLE_PUBLIE, { type: "json" }).catch(() => null);
  return B.residu((v && v.cartes) || [], source.cartes);
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
    const fresque = await s.get(CLE_FRESQUE, { type: "json" }).catch(() => null);
    const publie = await lirePublie(s, source);
    return json(200, { ok: true, brouillons: brouillons, resume: B.resume(brouillons, source.cartes),
      fresque: fresque ? fresque.tableau : null,
      publie: B.resume(publie, source.cartes) });
  }
  if (event.httpMethod !== "POST") return json(405, { erreur: "Méthode non autorisée." });
  if (!corps) return json(400, { erreur: "Requête illisible." });

  if (corps.action === "oublier") {
    const n = B.numeroDeCarte(corps.n);
    if (n === null) return json(400, { erreur: "Carte inconnue." });
    await s.delete(cle(n)).catch(() => {});
    return json(200, { ok: true });
  }

  /* LA FRESQUE DE REFERENCE. Un seul brouillon, et non un par carte : on
     deplace des cartes les unes par rapport aux autres, l'etat n'a de sens
     qu'entier. */
  if (corps.action === "fresque-enregistrer") {
    let publiee;
    try { publiee = lireFresque(); }
    catch (e) { console.error("[brouillons] " + e.message); return json(503, { erreur: "Le service est momentanément indisponible." }); }
    const v = FB.valider(corps.tableau, publiee.plan);
    if (v.erreur) return json(400, { erreur: v.erreur });
    await s.setJSON(CLE_FRESQUE, { quand: Date.now(), tableau: v.tableau });
    return json(200, { ok: true, resume: FB.resume(publiee.tableau, v.tableau) });
  }

  if (corps.action === "fresque-oublier") {
    await s.delete(CLE_FRESQUE).catch(() => {});
    return json(200, { ok: true });
  }

  if (corps.action === "fresque-publier") {
    let publiee;
    try { publiee = lireFresque(); }
    catch (e) { console.error("[brouillons] " + e.message); return json(503, { erreur: "Le service est momentanément indisponible." }); }
    const b = await s.get(CLE_FRESQUE, { type: "json" }).catch(() => null);
    if (!b || !b.tableau) return json(400, { erreur: "Aucune modification à publier." });
    /* ON REVALIDE AVANT DE PUBLIER. Le brouillon a pu etre enregistre par une
       version plus ancienne du code, ou la fresque publiee avoir change depuis. */
    const v = FB.valider(b.tableau, publiee.plan);
    if (v.erreur) return json(400, { erreur: v.erreur });
    return json(200, { ok: true, fichier: FB.appliquer(publiee, v.tableau),
      resume: FB.resume(publiee.tableau, v.tableau) });
  }

  /* PUBLIER MET EN LIGNE, TOUT DE SUITE. Les corrections vont dans un calque
     que le site lit par-dessus cartes.json : elles sont visibles a la seconde,
     sans depot, sans CI, sans attendre que quelqu'un fusionne. Corriger une
     explication ne demande plus d'ecrire une ligne de code.

     CE QUI PASSE QUAND MEME PAR LE DEPOT. Le fichier cartes.json fabrique aussi
     la planche imprimee : un titre ou un verso corrige en ligne doit finir par
     y retourner, sinon le jeu de cartes et le site divergent en silence. D'ou
     l'action « telecharger », proposee tant que le calque n'est pas vide, et le
     nettoyage automatique le jour ou le depot rattrape (B.residu). */
  if (corps.action === "publier") {
    const brouillons = await lireBrouillons(s);
    if (!brouillons.length) return json(400, { erreur: "Aucune modification à publier." });

    const avant = await lirePublie(s, source);
    const parN = {};
    avant.forEach((b) => { parN[b.n] = b; });
    /* Le brouillon ECRASE le calque champ par champ, il ne le remplace pas :
       une carte dont on ne corrige aujourd'hui que le titre doit garder
       l'explication publiee la semaine derniere. */
    brouillons.forEach((b) => {
      const sortie = Object.assign({}, parN[b.n] || { n: b.n }, b);
      parN[b.n] = sortie;
    });
    const apres = B.residu(Object.keys(parN).map((k) => parN[k]), source.cartes);
    await s.setJSON(CLE_PUBLIE, { quand: Date.now(), cartes: apres });

    // Les brouillons ont trouve leur place : les garder ferait publier deux fois.
    for (const b of brouillons) await s.delete(cle(b.n)).catch(() => {});

    return json(200, { ok: true, enLigne: true,
      resume: B.resume(brouillons, source.cartes),
      publie: B.resume(apres, source.cartes) });
  }

  /* LE FICHIER COMPLET, POUR LE DEPOT. Separe de la publication : on met en
     ligne souvent, on replie dans le depot de temps en temps. */
  if (corps.action === "telecharger") {
    const publie = await lirePublie(s, source);
    const brouillons = await lireBrouillons(s);
    const tout = publie.concat(brouillons);
    if (!tout.length) return json(400, { erreur: "Aucune modification à déposer." });
    return json(200, { ok: true, fichier: B.appliquer(source, tout),
      resume: B.resume(tout, source.cartes) });
  }

  /* RETIRER UNE CORRECTION DEJA EN LIGNE. Sans cela, une publication malheureuse
     ne se defait qu'en republiant le texte d'origine a la main. */
  if (corps.action === "depublier") {
    const n = B.numeroDeCarte(corps.n);
    if (n === null) return json(400, { erreur: "Carte inconnue." });
    const publie = await lirePublie(s, source);
    const reste = publie.filter((b) => b.n !== n);
    await s.setJSON(CLE_PUBLIE, { quand: Date.now(), cartes: reste });
    return json(200, { ok: true, publie: B.resume(reste, source.cartes) });
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
