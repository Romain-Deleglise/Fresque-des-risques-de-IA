/* L'APERCU DES COURRIELS DANS /admin/, dans un navigateur.

   CE QUE CE BANC PROTEGE. Relire un courriel demandait de provoquer ce qui
   l'envoie. L'apercu le montre en un clic, mais il n'a de valeur que s'il
   montre VRAIMENT le courriel : un e-mail est tout en attributs `style`, et
   la politique de securite du site (`style-src 'self'`) les ignore. Affiche
   dans un cadre qui herite de cette politique, il s'afficherait en noir et
   blanc sans mise en page, et l'on conclurait a tort que le courriel est
   casse. Le banc sert donc la MEME politique que la production, avec son
   exception pour ce seul chemin, et verifie que la couleur arrive.

   Il verifie aussi ce qui garde la porte : sans billet, rien ; avec un billet
   d'une autre cle, rien ; avec un sujet inconnu, rien.

   Usage : node scripts/verifier-apercu-courriels.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const CLE = "cle-de-banc-0123456789";
process.env.ADMIN_TOKEN = CLE;
const APERCU = require(path.join(RACINE, "netlify/functions/apercu-courriel.js"));
const BILLET = require(path.join(RACINE, "netlify/functions/lib/billet.js"));
const CATALOGUE = require(path.join(RACINE, "netlify/functions/lib/apercus.js"));

/* La politique du site, mot pour mot celle de netlify.toml : un banc qui
   n'envoie aucune CSP ne voit pas la panne qu'on cherche ici. */
const toml = fs.readFileSync(path.join(RACINE, "netlify.toml"), "utf8");
const lireCsp = (apres) => {
  const i = toml.indexOf(apres);
  const m = toml.slice(i).match(/Content-Security-Policy = "([^"]+)"/);
  return m ? m[1] : "";
};
const CSP_SITE = lireCsp('for = "/*"');
const CSP_APERCU = process.env.CSP_TEST === "site" ? CSP_SITE : lireCsp(`for = "/.netlify/functions/apercu-courriel"`);

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const site = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname === "/.netlify/functions/apercu-courriel") {
    const params = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    const rep = await APERCU.handler({ httpMethod: "GET", queryStringParameters: params, headers: {} });
    r.writeHead(rep.statusCode, Object.assign({}, rep.headers,
      { "Content-Security-Policy": CSP_APERCU }));
    return r.end(rep.body);
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream",
    "Content-Security-Policy": CSP_SITE });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => site.listen(0, r));
const B = "http://127.0.0.1:" + site.address().port;

let ko = 0, total = 0;
const t = (nom, cond, det) => {
  total++;
  console.log((cond ? "  ✅ " : "  ❌ ") + nom + (det ? "  → " + det : ""));
  if (!cond) ko++;
};

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await nav.newPage({ viewport: { width: 1200, height: 900 } });
const erreursJS = [];
pg.on("pageerror", (e) => erreursJS.push(e.message));

console.log("\n--- La porte est gardee ---");
const billet = BILLET.emettre(CLE);
const etat = async (url) => (await pg.request.get(B + url)).status();
t("sans billet ni cle, rien", (await etat("/.netlify/functions/apercu-courriel?sujet=Votre+atelier+est+programmé")) === 401);
t("avec un billet d'une autre cle, rien",
  (await etat("/.netlify/functions/apercu-courriel?sujet=Votre+atelier+est+programmé&b="
    + encodeURIComponent(BILLET.emettre("une-autre-cle-00000")))) === 401);
t("un sujet inconnu ne renvoie pas une page vide",
  (await etat("/.netlify/functions/apercu-courriel?sujet=n-importe-quoi&b=" + encodeURIComponent(billet))) === 404);

console.log("\n--- Chaque courriel s'affiche, avec sa mise en forme ---");
for (const sujet of CATALOGUE.sujets()) {
  const url = B + "/.netlify/functions/apercu-courriel?sujet=" + encodeURIComponent(sujet)
    + "&b=" + encodeURIComponent(billet);
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  /* LA COULEUR EST LA PREUVE. Si la politique de securite ignorait les
     attributs `style`, l'en-tete orange du gabarit serait transparent et le
     courriel s'afficherait en texte brut : c'est exactement la panne que ce
     banc existe pour attraper. */
  const vu = await pg.evaluate(() => {
    const fonds = [...document.querySelectorAll("div")]
      .map((e) => getComputedStyle(e).backgroundColor);
    return { orange: fonds.some((c) => c === "rgb(232, 129, 28)"),
      texte: (document.body.textContent || "").trim().length };
  });
  t("« " + sujet.slice(0, 44) + " »", vu.orange && vu.texte > 120,
    vu.orange ? vu.texte + " signes" : "en-tete sans couleur : les styles en ligne sont ignores");
}

/* ── ET DANS LE TABLEAU DE BORD ─────────────────────────────
   Montrer le courriel ne suffit pas : il faut qu'on puisse l'ouvrir d'un clic
   depuis la carte des parcours, sans jamais faire passer la cle
   d'administration par une adresse. */
console.log("\n--- Depuis la carte des parcours de /admin/ ---");
const PARCOURS = require(path.join(RACINE, "serveur/src/parcours.js"));
let adressesVues = [];
pg.on("request", (q) => adressesVues.push(q.url()));
await pg.route("**/.netlify/functions/admin**", (r) => {
  const u = new URL(r.request().url());
  const action = u.searchParams.get("action");
  const rep = (c) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
  if (action === "journal") return rep({ journal: [], bilan: null, parcours: PARCOURS.tous() });
  if (action === "billet-apercu") return rep({ billet: billet, sujets: CATALOGUE.sujets() });
  return rep({ stats: {}, contacts: [], retours: [], ateliers: [], inactifs: [] });
});
await pg.goto(B + "/admin/", { waitUntil: "networkidle" });
await pg.fill("#champ-cle", CLE);
await pg.press("#champ-cle", "Enter");
await pg.waitForTimeout(900);
const sujets = await pg.locator("button.p-sujet").count();
t("chaque courriel de la carte est cliquable", sujets >= 19, sujets + " sujets");
await pg.locator("button.p-sujet").first().click();
await pg.waitForTimeout(900);
t("le cadre d'apercu s'ouvre", await pg.isVisible("#apercu-courriel"));
const dedans = await pg.evaluate(() => {
  const f = document.getElementById("apercu-cadre");
  if (!f || !f.src) return null;
  return { src: f.src, sandbox: f.getAttribute("sandbox") };
});
t("il charge l'apercu", !!(dedans && /apercu-courriel\?sujet=/.test(dedans.src)), dedans && dedans.src.slice(0, 80));
t("le cadre n'a aucune permission", dedans && dedans.sandbox === "", JSON.stringify(dedans && dedans.sandbox));
/* LA CLE NE DOIT JAMAIS PARTIR DANS UNE ADRESSE : c'est tout l'objet du
   billet. Le tableau de bord la presente en en-tete, et elle y reste. */
t("la cle d'administration n'apparait dans aucune adresse",
  !adressesVues.some((u) => u.indexOf(CLE) !== -1),
  adressesVues.filter((u) => u.indexOf(CLE) !== -1).slice(0, 1).join(""));
const cadre = pg.frameLocator("#apercu-cadre");
t("et le courriel s'y affiche en couleur",
  await cadre.locator("div").first().evaluate((e) => {
    const fonds = [...document.querySelectorAll("div")].map((x) => getComputedStyle(x).backgroundColor);
    return fonds.some((c) => c === "rgb(232, 129, 28)");
  }).catch(() => false));
/* ON DOIT LE VOIR : le cadre est sous une carte qui tient trois colonnes. */
t("le cadre vient sous les yeux", await pg.evaluate(() => {
  const r = document.getElementById("apercu-courriel").getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}));
if (process.env.OUT) await pg.screenshot({ path: process.env.OUT + "/apercu-admin.png" });
await pg.click("#apercu-fermer");
await pg.waitForTimeout(250);
t("et il se referme", await pg.evaluate(() => document.getElementById("apercu-courriel").hidden));

console.log("\n--- La version texte aussi ---");
const txt = await pg.request.get(B + "/.netlify/functions/apercu-courriel?format=texte&sujet="
  + encodeURIComponent("Votre atelier est programmé") + "&b=" + encodeURIComponent(billet));
t("elle se sert en texte brut", (txt.headers()["content-type"] || "").startsWith("text/plain"),
  txt.headers()["content-type"]);
t("et elle n'est pas vide", (await txt.text()).length > 200);

console.log("\n--- Rien de reel ne sort par cette porte ---");
let fuite = [];
for (const sujet of CATALOGUE.sujets()) {
  const m = CATALOGUE.rendre(sujet);
  const adr = ((m.text + m.html).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [])
    .filter((a) => !/@example\.(org|com|net)$/i.test(a) && !/@pauseia\.fr$/i.test(a));
  if (adr.length) fuite = fuite.concat(adr);
}
t("aucune adresse reelle dans les exemples", fuite.length === 0, fuite.join(", "));

t("aucune erreur JavaScript", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Apercu des courriels : " + (total - ko)
  + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
