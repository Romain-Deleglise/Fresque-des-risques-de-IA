/* LE CALQUE DES CORRECTIONS PUBLIEES, en lecture publique.

   POURQUOI UN CALQUE ET PAS UNE ECRITURE DANS LE DEPOT. Corriger l'explication
   d'une carte passait par : telecharger cartes.json, le deposer dans le depot,
   attendre la CI, attendre une relecture, attendre la fusion, attendre le
   deploiement. Pour une virgule. Donner a cette fonction un droit d'ecriture
   sur le depot reglerait la lenteur en ouvrant une surface d'attaque bien plus
   large que le gain : un jeton de moderation vole deviendrait un droit de
   pousser du code.

   Le calque est la troisieme voie. Les corrections sont rangees dans un magasin
   (Netlify Blobs), ce service les rend a qui les demande, et chaque page les
   applique par-dessus data/cartes.json. En ligne a la seconde, aucun droit sur
   le depot.

   CE SERVICE NE DOIT JAMAIS EMPECHER LE SITE DE FONCTIONNER. Les pages lisent
   d'abord le fichier statique, servi par le CDN, puis ce calque. S'il tombe,
   s'il est lent ou s'il rend n'importe quoi, elles affichent le texte publie :
   une correction en retard, jamais une page vide. C'est pour cela qu'il n'est
   pas intercale devant data/cartes.json.

   Lecture seule, sans jeton : ce qu'il rend est deja affiche sur le site.
   Ecrire, en revanche, demande ADMIN_TOKEN (voir brouillons.js).
*/
"use strict";
const { getStore, connectLambda } = require("@netlify/blobs");
const B = require("../../serveur/src/brouillons.js");
const FB = require("../../serveur/src/fresque-brouillon.js");
const fs = require("fs");
const path = require("path");

const CLE_PUBLIE = "publie";
const CLE_PUBLIE_FRESQUE = "publie-fresque";

function json(code, corps, cache) {
  return {
    statusCode: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      /* Une minute de cache : une correction apparait au pire une minute apres
         sa publication, et une page tres visitee ne reveille pas la fonction a
         chaque chargement. */
      "cache-control": cache || "public, max-age=60",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify(corps)
  };
}

function lireSource(nom) {
  const candidats = [
    path.join(__dirname, "..", "..", "site", "data", nom),
    path.join(process.cwd(), "site", "data", nom)
  ];
  for (const f of candidats) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* suivant */ }
  }
  return null;
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) { /* hors Lambda */ }
  if (event.httpMethod !== "GET") return json(405, { erreur: "Méthode non autorisée." }, "no-store");

  const source = lireSource("cartes.json");
  /* Sans la source, impossible de dire ce qui differe d'elle. On rend un calque
     vide plutot qu'une erreur : les pages afficheront le texte publie. */
  if (!source) {
    console.error("[cartes-publiees] cartes.json introuvable (included_files ?)");
    return json(200, { ok: true, cartes: [], fresque: null });
  }
  const fichierFresque = lireSource("fresque-reference.json");

  try {
    const s = getStore({ name: "fresque-brouillons" });
    const v = await s.get(CLE_PUBLIE, { type: "json" });
    /* LE PLAN DE LA FRESQUE VOYAGE AVEC LES TEXTES. Une seule requete pour les
       deux : l'outil les demande toujours ensemble, et les separer doublerait
       l'attente avant le premier dessin. */
    let fresque = null;
    if (fichierFresque) {
      const w = await s.get(CLE_PUBLIE_FRESQUE, { type: "json" }).catch(() => null);
      if (w && w.tableau && !FB.identique(w.tableau, fichierFresque.tableau)) fresque = w.tableau;
    }
    return json(200, { ok: true, quand: (v && v.quand) || 0,
      cartes: B.residu((v && v.cartes) || [], source.cartes), fresque: fresque });
  } catch (e) {
    console.error("[cartes-publiees] " + e.message);
    return json(200, { ok: true, cartes: [], fresque: null });
  }
};
