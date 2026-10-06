/* L'ADRESSE MISE DANS LES COURRIELS.

   CE QUE CES TESTS PROTEGENT. Un courriel part avec des liens. Si ces liens
   visent la production alors que c'est une deploy preview qui les a envoyes,
   le destinataire atterrit sur un site qui ne connait ni son jeton ni son
   inscription : le parcours devient intestable ailleurs qu'en production,
   c'est-a-dire intestable avant livraison. C'est exactement ce qui s'est passe
   avec « Confirmer mon inscription ».
*/
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../../netlify/functions/lib/lien.js");

test("en production, l'adresse configuree l'emporte", () => {
  assert.equal(L.calculer({ CONTEXT: "production", SITE_URL: "https://choisi.org", URL: "https://auto.org" }),
    "https://choisi.org");
});

test("en production sans SITE_URL, Netlify donne toujours URL", () => {
  assert.equal(L.calculer({ CONTEXT: "production", URL: "https://auto.org" }), "https://auto.org");
});

/* LE COEUR DU CORRECTIF. SITE_URL est posee au niveau du site : elle vaut donc
   aussi pour les previews, et c'est elle qui y ramenait vers la production. */
test("sur une deploy preview, c'est la preview qui gagne, meme si SITE_URL existe", () => {
  assert.equal(L.calculer({
    CONTEXT: "deploy-preview",
    SITE_URL: "https://production.org",
    URL: "https://production.org",
    DEPLOY_PRIME_URL: "https://deploy-preview-30--site.netlify.app"
  }), "https://deploy-preview-30--site.netlify.app");
});

test("sur une branche deployee aussi", () => {
  assert.equal(L.calculer({ CONTEXT: "branch-deploy", SITE_URL: "https://production.org",
    DEPLOY_PRIME_URL: "https://ma-branche--site.netlify.app" }), "https://ma-branche--site.netlify.app");
});

test("la barre oblique finale est retiree, sinon les liens en portent deux", () => {
  assert.equal(L.calculer({ CONTEXT: "production", SITE_URL: "https://choisi.org///" }), "https://choisi.org");
});

/* Sans rien du tout (tests locaux, execution hors Netlify), on vise le domaine
   public : c'est le seul choix qui ne fabrique pas de lien casse. */
test("sans aucune variable, le domaine public", () => {
  assert.equal(L.calculer({}), "https://fresquedesrisquesdelia.org");
});

/* NEUF FONCTIONS REPETAIENT CETTE LIGNE, et elle avait deja diverge : admin.js
   se repliait sur un autre domaine que les huit autres. */
test("plus aucune fonction ne recalcule l'adresse dans son coin", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(process.cwd(), "netlify", "functions");
  const fautifs = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (/process\.env\.SITE_URL/.test(src)) fautifs.push(f);
  }
  assert.deepEqual(fautifs, [], "ces fonctions lisent encore SITE_URL directement");
});
