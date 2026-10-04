/* LE PARCOURS COMPLET DES ALERTES, de l'inscription au desabonnement.

   CE QUE CE BANC PROTEGE. L'ancien banc (scripts/verifier-alertes.mjs) pilote
   le FORMULAIRE avec un service de fond bouchonne : il ne voit donc rien de ce
   qui se passe apres l'envoi. Celui-ci fait l'inverse : il appelle les VRAIES
   fonctions, et ne bouchonne que le magasin et l'expedition. C'est la seule
   facon de verifier ce qu'un abonne vit reellement :
   - qu'un e-mail part a l'inscription (il n'en partait aucun) ;
   - qu'aucune annonce ne part tant que le lien n'a pas ete ouvert ;
   - qu'un atelier n'est annonce qu'une fois (il repartait chaque semaine) ;
   - que le bouton « Se desabonner » de la boite de reception fonctionne,
     c'est-a-dire que l'en-tete existe ET que l'adresse accepte un POST.

   Usage : node scripts/verifier-parcours-alertes.cjs */
const path = require("node:path");
const RACINE = path.resolve(__dirname, "..");
const magasins = {};
const faux = (nom) => {
  const m = magasins[nom] || (magasins[nom] = new Map());
  return { get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: JSON.parse(JSON.stringify(m.get(k))) } : null),
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    setJSON: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); },
    delete: async (k) => { m.delete(k); } };
};
const cb = require.resolve("@netlify/blobs", { paths: [RACINE] });
require.cache[cb] = { id: cb, filename: cb, loaded: true,
  exports: { getStore: ({ name }) => faux(name), connectLambda: () => {} } };

const boite = [];
const cm = require.resolve(path.join(RACINE, "netlify/functions/lib/mail.js"));
require.cache[cm] = { id: cm, filename: cm, loaded: true, exports: {
  configuree: () => true, envoi: async (m) => { boite.push(m); return { envoye: true }; } } };

const alertes = require(path.join(RACINE, "netlify/functions/alertes.js"));
const envoi = require(path.join(RACINE, "netlify/functions/alertes-envoi.js"));

const JOUR = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
let ok = 0, ko = 0;
const t = (nom, cond, det) => { if (cond) { ok++; console.log("  ✅ " + nom); }
  else { ko++; console.log("  ❌ " + nom + (det ? "  → " + det : "")); } };
const post = (corps, q) => alertes.handler({ httpMethod: "POST", body: JSON.stringify(corps),
  queryStringParameters: q || {}, headers: { "x-nf-client-connection-ip": "203.0.113.9" } });
const get = (q) => alertes.handler({ httpMethod: "GET", queryStringParameters: q,
  headers: { "x-nf-client-connection-ip": "203.0.113.9" } });
const lire = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };

(async () => {
  console.log("\n--- 1. L'inscription ---");
  let r = lire(await post({ mail: "ana@exemple.fr", format: "les_deux", communes: ["69123"], rayonKm: "50", site: "" }));
  t("l'inscription est acceptee", r && r.ok, JSON.stringify(r));
  t("elle demande une confirmation", r && r.aConfirmer === true);
  t("un e-mail part aussitot", boite.length === 1, boite.length + " message(s)");
  const conf = boite[0];
  t("son objet annonce la confirmation", /[Cc]onfirmez/.test(conf.subject || ""), conf.subject);
  t("il porte l'en-tete de desabonnement en un clic",
    !!(conf.headers && conf.headers["List-Unsubscribe"] && conf.headers["List-Unsubscribe-Post"]),
    JSON.stringify(conf.headers));
  t("il recapitule le format choisi", /en ligne et en présentiel/.test(conf.text), "");
  t("il nomme la commune, pas son code", /Lyon/.test(conf.text) && !/69123/.test(conf.text));
  const jeton = (conf.text.match(/\?c=([A-Za-z0-9_-]+)/) || [])[1];
  t("il contient un lien de confirmation", !!jeton);
  t("il contient un lien de modification", /\?m=/.test(conf.text));
  t("il contient un lien de desabonnement", /\?d=/.test(conf.text));

  console.log("\n--- 2. Tant que ce n'est pas confirme, rien ne part ---");
  const atelier = { code: "AAA111", mode: "enligne", visibilite: "public", date: iso(Date.now() + 10*JOUR),
    heure: "18:30", participants: [], maxParticipants: 8 };
  magasins["fresque-ateliers"] = new Map([["atelier:AAA111", atelier]]);
  boite.length = 0;
  await envoi.handler();
  t("aucune annonce a un abonne non confirme", boite.length === 0, boite.length + " message(s)");

  console.log("\n--- 3. La confirmation ---");
  let c = lire(await get({ c: jeton }));
  t("le lien confirme l'abonnement", c && c.confirme === true, JSON.stringify(c));
  c = lire(await get({ c: jeton }));
  t("recliquer ne provoque pas d'erreur", c && c.ok === true);

  console.log("\n--- 4. L'annonce hebdomadaire ---");
  await envoi.handler();
  t("l'annonce part une fois confirme", boite.length === 1, boite.length + " message(s)");
  const ann = boite[0];
  t("elle porte l'en-tete de desabonnement en un clic",
    !!(ann.headers && ann.headers["List-Unsubscribe-Post"]), JSON.stringify(ann.headers));
  t("elle dit le format de l'atelier", /En ligne/.test(ann.text), ann.text.slice(0, 160));
  t("elle pointe l'ancre de l'atelier", /#atelier-AAA111/.test(ann.text));

  console.log("\n--- 5. Le meme atelier n'est pas reannonce ---");
  boite.length = 0;
  const cle = [...magasins["fresque-alertes"].keys()].find((k) => k.startsWith("abonne:"));
  const ab = magasins["fresque-alertes"].get(cle);
  ab.dernierEnvoi = Date.now() - 8 * JOUR;          // une semaine a passe
  magasins["fresque-alertes"].set(cle, ab);
  await envoi.handler();
  t("rien la semaine suivante pour le meme atelier", boite.length === 0, boite.length + " message(s)");

  console.log("\n--- 6. Un atelier reprogramme repart ---");
  atelier.heure = "20:00";
  magasins["fresque-ateliers"].set("atelier:AAA111", atelier);
  await envoi.handler();
  t("l'atelier deplace est reannonce", boite.length === 1, boite.length + " message(s)");

  console.log("\n--- 7. Modifier ses preferences ---");
  const etat = lire(await get({ etat: jeton }));
  t("l'etat enregistre est relisible", etat && etat.ok && etat.format === "les_deux", JSON.stringify(etat));
  t("il rend l'adresse, pour reposer le formulaire", etat && etat.mail === "ana@exemple.fr");
  boite.length = 0;
  r = lire(await post({ mail: "ana@exemple.fr", format: "enligne", communes: [], rayonKm: "50", site: "" }));
  t("une modification ne redemande pas de confirmation", r && r.ok && r.aConfirmer === false, JSON.stringify(r));
  t("elle est accusee par un e-mail", boite.length === 1 && /modifiées/.test(boite[0].subject || ""), boite.length + " / " + (boite[0] && boite[0].subject));

  console.log("\n--- 8. Le desabonnement en un clic (RFC 8058) ---");
  const p = lire(await alertes.handler({ httpMethod: "POST", body: "", queryStringParameters: { d: jeton },
    headers: { "x-nf-client-connection-ip": "203.0.113.9" } }));
  t("un POST sans corps desabonne", p && p.desabonne === true, JSON.stringify(p));
  const apres = lire(await get({ etat: jeton }));
  t("l'adresse a bien ete effacee", apres && !apres.ok, JSON.stringify(apres));

  console.log("\n" + (ko ? "❌" : "✅") + " Parcours alertes : " + ok + " verifications, " + ko + " echouees.\n");
  process.exit(ko ? 1 : 0);
})();
