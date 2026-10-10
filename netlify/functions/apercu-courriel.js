/* APERCU D'UN COURRIEL (Netlify Function, reservee a /admin/).

   Verifier un courriel demandait de provoquer ce qui l'envoie : creer un
   atelier, s'y inscrire, attendre le mardi matin. Cette porte rend chaque
   courriel du site visible en un clic, tel qu'il part : elle appelle les
   constructeurs reels (lib/apercus.js), avec des donnees d'exemple.

   ELLE N'ENVOIE RIEN et ne lit aucune donnee reelle : aucun atelier, aucun
   abonne, aucune adresse. Elle assemble des chaines et les rend.

   GET ?sujet=...&b=BILLET                   -> le courriel, en HTML
   GET ?sujet=...&format=texte&b=BILLET      -> sa version texte
   GET ?action=sujets                        -> la liste des sujets connus

   Le billet (lib/billet.js) est un laissez-passer de dix minutes, demande par
   le tableau de bord avec sa cle : un cadre s'authentifie par son adresse, et
   la cle d'administration n'a rien a faire dans une adresse. L'en-tete
   `x-cle` reste accepte pour les appels directs.

   La reponse HTML porte sa propre CSP : les courriels sont tout en styles
   en ligne (c'est la seule chose que lisent les clients de messagerie), ce que
   la CSP du site interdit a juste titre partout ailleurs. Cette politique-ci
   n'autorise QUE cela : aucun script, aucune requete sortante.
*/
"use strict";

const APERCUS = require("./lib/apercus.js");
const BILLET = require("./lib/billet.js");

/* Comparaison a duree constante : sans elle, le temps de reponse laisse
   deviner la cle caractere par caractere. */
function egales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; "
  + "base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function page(titre, corps) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store"
    },
    body: corps
  };
}

function erreur(code, msg) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify({ erreur: msg })
  };
}

exports.handler = async (event) => {
  const attendu = process.env.ADMIN_TOKEN || "";
  if (!attendu) return erreur(503, "Espace admin non configuré (ADMIN_TOKEN manquant côté serveur).");
  const q = event.queryStringParameters || {};
  const hd = event.headers || {};
  const fourni = hd["x-cle"] || q.cle || "";
  if (!egales(fourni, attendu) && !BILLET.valide(q.b, attendu)) {
    return erreur(401, "Clé ou billet invalide. Rouvrez l'aperçu depuis le tableau de bord.");
  }

  if (q.action === "sujets") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify({ sujets: APERCUS.sujets() })
    };
  }

  const sujet = q.sujet || "";
  if (!APERCUS.existe(sujet)) return erreur(404, "Aucun aperçu pour ce courriel.");

  let m;
  /* UN APERCU QUI PLANTE NE DOIT PAS RESSEMBLER A UNE PANNE DU SITE : on dit
     lequel, et pourquoi. C'est d'ailleurs exactement le genre de chose que cet
     outil sert a decouvrir. */
  try { m = APERCUS.rendre(sujet); }
  catch (e) { return erreur(500, "Ce courriel ne se construit pas : " + (e && e.message)); }

  if (q.format === "texte") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      body: m.text
    };
  }
  return page(sujet, m.html);
};
