/* L'ADRESSE DU SITE, CELLE DU DEPLOIEMENT QUI ENVOIE L'E-MAIL.

   CE QUE CE MODULE CORRIGE. Neuf fonctions repetaient la meme ligne :

     process.env.SITE_URL || "https://fresquedesrisquesdelia.org"

   Sans SITE_URL, tout e-mail partait donc avec des liens vers la PRODUCTION,
   quel que soit le deploiement qui l'avait envoye. Consequence mesuree : on
   s'inscrit aux alertes depuis une deploy preview, le jeton est range dans le
   magasin de CETTE preview, et le lien « Confirmer mon inscription » renvoie
   vers la production, qui ne connait pas ce jeton. Impossible de tester un
   parcours par courriel ailleurs qu'en production, c'est-a-dire impossible de
   le tester avant de le livrer.

   Et comme la ligne etait recopiee, elle avait deja diverge : admin.js se
   repliait sur « fresquedesrisquedelia.netlify.app » quand les huit autres
   visaient « fresquedesrisquesdelia.org ».

   CE QU'ON CHOISIT, DANS CET ORDRE :
   - en production : SITE_URL si l'equipe l'a posee, sinon URL (que Netlify
     donne toujours) ;
   - partout ailleurs (deploy preview, branch deploy) : DEPLOY_PRIME_URL,
     l'adresse du deploiement en cours. On ignore volontairement SITE_URL dans
     ce cas : posee au niveau du site, elle vaut aussi pour les previews et
     ramenerait le probleme.
   - en dernier recours seulement, le domaine en dur.

   CONTEXT vaut « production », « deploy-preview », « branch-deploy » ou
   « dev ». Absent (tests locaux), on suppose la production : c'est le reglage
   le plus sur, et les bancs posent ce qu'il leur faut.
*/
"use strict";

function calculer(env) {
  env = env || process.env;
  var contexte = env.CONTEXT || "production";
  var choisi = contexte === "production"
    ? (env.SITE_URL || env.URL)
    : (env.DEPLOY_PRIME_URL || env.URL || env.SITE_URL);
  return String(choisi || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
}

module.exports = { calculer: calculer, SITE: calculer() };
