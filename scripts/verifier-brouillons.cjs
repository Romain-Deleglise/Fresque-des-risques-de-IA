/* BROUILLONS DE CARTES : la vraie fonction, magasin bouchonne.

   CE QUE CE BANC PROTEGE. Un brouillon est une correction NON RELUE, et
   publier applique d'un coup toutes celles qui attendent. Deux facons de tout
   perdre, qu'aucun test unitaire ne verrait :
   - un enregistrement qui ecrase le brouillon precedent (corriger le titre
     puis le verso en deux fois) ;
   - une publication qui recopie mal le fichier et emporte les images, l'ordre
     des cartes ou les cartes sans brouillon.
   Et tout est reserve a la moderation, LECTURE COMPRISE : un texte non relu ne
   doit pas se lire comme un texte publie.

   Usage : node scripts/verifier-brouillons.cjs */
const path = require("node:path");
const fsNode = require("node:fs");
const RACINE = path.resolve(__dirname, "..");
const m = new Map();
const faux = () => ({
  get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null),
  list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  setJSON: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); },
  delete: async (k) => { m.delete(k); } });
const cb = require.resolve("@netlify/blobs", { paths: [RACINE] });
require.cache[cb] = { id: cb, filename: cb, loaded: true, exports: { getStore: faux, connectLambda: () => {} } };
process.env.ADMIN_TOKEN = "jeton-de-banc-123456";
const fn = require(path.join(RACINE, "netlify/functions/brouillons.js"));

const post = (c) => fn.handler({ httpMethod: "POST", body: JSON.stringify(c), queryStringParameters: {} });
const get = (q) => fn.handler({ httpMethod: "GET", queryStringParameters: q });
const lire = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };
let ok = 0, ko = 0;
const t = (n, c, d) => { if (c) { ok++; console.log("  ✅ " + n); } else { ko++; console.log("  ❌ " + n + (d ? "  → " + d : "")); } };
const J = "jeton-de-banc-123456";

(async () => {
  console.log("\n--- L'acces ---");
  t("sans jeton, tout est refuse", lire(await get({})).erreur === "Jeton incorrect.");
  t("un mauvais jeton est refuse", (await post({ action: "publier", jeton: "x" })).statusCode === 403);
  t("meme la lecture est reservee", (await get({ jeton: "presque-le-bon" })).statusCode === 403);

  console.log("\n--- Enregistrer ---");
  let r = lire(await post({ action: "enregistrer", n: 3, titre: "Amélioration des capacités (corrigé)", jeton: J }));
  t("une correction de titre est acceptee", r && r.ok && r.brouillon.titre.endsWith("(corrigé)"), JSON.stringify(r));
  r = lire(await post({ action: "enregistrer", n: 3, titre: "Amélioration des capacités (corrigé)", jeton: J }));
  t("renvoyer la meme correction est sans effet, pas une erreur", r.ok && r.nombre === 1, JSON.stringify(r));
  r = lire(await post({ action: "enregistrer", n: 3, titre: "Amélioration des capacités", jeton: J }));
  t("reecrire le titre d'origine ANNULE la correction", r.ok && r.nombre === 0, JSON.stringify(r));
  await post({ action: "enregistrer", n: 3, titre: "Amélioration des capacités (corrigé)", jeton: J });
  r = lire(await post({ action: "enregistrer", n: 3, verso: "Un.\n\nDeux.", jeton: J }));
  t("corriger le verso ENSUITE garde le titre deja corrige",
    r.ok && r.brouillon.titre && r.brouillon.verso.length === 2, JSON.stringify(r.brouillon));

  console.log("\n--- Publier ---");
  const p = lire(await post({ action: "publier", jeton: J }));
  const c3 = p.fichier.cartes.find((c) => c.n === 3);
  t("le fichier rendu est complet", p.fichier.cartes.length === 39, String(p.fichier.cartes && p.fichier.cartes.length));
  t("la carte corrigee porte les deux changements", /corrigé/.test(c3.titre) && c3.verso.length === 2);
  t("son image et son lot survivent", !!c3.image && c3.lot === 1, JSON.stringify({ img: !!c3.image, lot: c3.lot }));
  const c4 = p.fichier.cartes.find((c) => c.n === 4);
  t("une carte sans brouillon est intacte", c4.titre === "Automatisation du travail", c4.titre);
  t("le resume dit quoi relire", p.resume.length === 1 && p.resume[0].champs.join() === "titre,verso", JSON.stringify(p.resume));

  console.log("\n--- La fresque de reference ---");
  const fs2 = require("fs");
  const ref = JSON.parse(fs2.readFileSync(path.join(RACINE, "site/data/fresque-reference.json"), "utf8"));
  const bouge = JSON.parse(JSON.stringify(ref.tableau));
  bouge.cartes[0].x += 40;
  r = lire(await post({ action: "fresque-enregistrer", tableau: bouge, jeton: J }));
  t("un deplacement de carte est enregistre", r.ok && r.resume.cartesDeplacees === 1, JSON.stringify(r));

  const horsPlan = JSON.parse(JSON.stringify(ref.tableau));
  horsPlan.cartes[0].x = ref.plan.largeur;
  r = lire(await post({ action: "fresque-enregistrer", tableau: horsPlan, jeton: J }));
  t("une carte hors du plan est refusee", /sort du plan/.test(r.erreur || ""), JSON.stringify(r));

  const lienFantome = JSON.parse(JSON.stringify(ref.tableau));
  lienFantome.cartes = lienFantome.cartes.filter((c) => c.n !== lienFantome.fleches[0].vers);
  r = lire(await post({ action: "fresque-enregistrer", tableau: lienFantome, jeton: J }));
  t("un lien vers une carte retiree est refuse", /absente/.test(r.erreur || ""), JSON.stringify(r));

  const pub = lire(await post({ action: "fresque-publier", jeton: J }));
  t("publier rend le fichier complet",
    pub.ok && pub.fichier.tableau.cartes.length === ref.tableau.cartes.length, JSON.stringify(pub.erreur || ""));
  t("le plan et la version survivent",
    pub.fichier.version === ref.version && pub.fichier.plan.largeur === ref.plan.largeur);
  t("le deplacement enregistre est bien celui publie",
    pub.fichier.tableau.cartes[0].x === ref.tableau.cartes[0].x + 40,
    String(pub.fichier.tableau.cartes[0].x));
  await post({ action: "fresque-oublier", jeton: J });
  t("sans brouillon de fresque, publier est refuse",
    !!lire(await post({ action: "fresque-publier", jeton: J })).erreur);

  console.log("\n--- Oublier ---");
  await post({ action: "oublier", n: 3, jeton: J });
  t("le brouillon oublie disparait", lire(await get({ jeton: J })).brouillons.length === 0);
  t("publier sans rien a publier est refuse", !!lire(await post({ action: "publier", jeton: J })).erreur);

  console.log("\n" + (ko ? "❌" : "✅") + " Brouillons : " + ok + " verifications, " + ko + " echouees.\n");
  process.exit(ko ? 1 : 0);
})();
