/* UN BILLET COURT POUR OUVRIR UN APERCU (logique pure, aucune I/O).

   POURQUOI PAS LA CLE D'ADMINISTRATION. L'apercu d'un courriel s'affiche dans
   un cadre (`iframe`), et un cadre s'authentifie par son adresse : il n'a pas
   d'en-tete a nous. Mettre la cle d'administration dans cette adresse la
   ferait vivre dans l'historique du navigateur, dans les journaux du serveur
   et dans tout ce qui recopie une URL ; le tableau de bord la garde depuis
   toujours dans un en-tete, et c'est une protection qu'on ne defait pas pour
   une commodite.

   Le billet est donc un laissez-passer separe : il ne vaut que dix minutes,
   il n'ouvre QUE les apercus (du contenu fabrique, aucune donnee reelle), et
   il ne permet pas de remonter a la cle. Signe avec elle, en HMAC : rien a
   stocker, donc rien a purger ni a perdre.
*/
"use strict";

var crypto = require("crypto");
var DUREE_MS = 10 * 60 * 1000;

function signer(exp, secret) {
  return crypto.createHmac("sha256", String(secret)).update("apercu:" + exp).digest("base64url");
}

function emettre(secret, maintenant) {
  var exp = (maintenant || Date.now()) + DUREE_MS;
  return exp + "." + signer(exp, secret);
}

function valide(billet, secret, maintenant) {
  if (!billet || !secret) return false;
  var bout = String(billet).split(".");
  if (bout.length !== 2) return false;
  var exp = Number(bout[0]);
  if (!isFinite(exp) || exp < (maintenant || Date.now())) return false;
  var attendu = signer(exp, secret);
  /* Comparaison a duree constante : la signature se devinerait autrement
     caractere par caractere, au chronometre. */
  if (attendu.length !== bout[1].length) return false;
  var d = 0;
  for (var i = 0; i < attendu.length; i++) d |= attendu.charCodeAt(i) ^ bout[1].charCodeAt(i);
  return d === 0;
}

module.exports = { emettre: emettre, valide: valide, DUREE_MS: DUREE_MS };
