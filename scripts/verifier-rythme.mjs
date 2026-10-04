/* Banc du rythme vertical des pages.

   CE QUE CE BANC PROTEGE. Un lecteur a signale que « les espaces avant et
   apres sections ne sont pas uniformes » : avant « Prochains ateliers »
   l'espace etait grand, au-dessus de « En atelier » il n'y en avait
   pratiquement aucun. Mesure : 168 px, puis 96 px, puis 192 px entre les
   sections de la page d'accueil. La cause n'etait pas un reglage trop petit
   mais une regle absente : `.section-photo` n'avait AUCUN espace en haut,
   et le hero un espace du bas plus court que le pas des sections.

   LA REGLE. Une section porte le meme pas en haut et en bas (--pas-section),
   donc deux sections qui se suivent sont separees de deux pas. Deux
   exceptions, voulues, declarees ici pour qu'on ne puisse pas les confondre
   avec un oubli :
   - `.page-tete + .section` : le titre de page et sa premiere section forment
     un bloc unique ;
   - `.section-suite` : une section qui prolonge celle du dessus (une capture
     qui illustre le paragraphe juste avant) ne prend qu'un demi-pas.

   LE CSP EN PRODUCTION. Le serveur de ce banc envoie la meme politique de
   securite que Netlify (`style-src 'self'`), qui REFUSE les attributs
   `style=`. Sans cela le banc mesurerait une mise en page que personne ne
   voit : c'est exactement ce qui s'etait produit sur /en-ligne/, ou deux
   reglages d'espacement ecrits en ligne n'existaient qu'en local.

   Usage : node scripts/verifier-rythme.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
if (!fs.existsSync(path.join(RACINE, "site", "index.html"))) {
  console.error("Site introuvable sous " + RACINE + "/site : ce banc doit etre lance depuis le depot.");
  process.exit(2);
}
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };
/* La meme politique que netlify.toml, reduite a ce qui compte ici. */
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; "
  + "script-src 'self'; font-src 'self'; connect-src 'self'";
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  fs.readFile(path.join(RACINE, "site", p), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream",
      "content-security-policy": CSP });
    res.end(d);
  });
});
await new Promise((r) => site.listen(0, r));
const B = "http://127.0.0.1:" + site.address().port;

let ok = 0, ko = 0;
const t = (nom, cond, det) => {
  if (cond) { ok++; console.log("  ✅ " + nom); }
  else { ko++; console.log("  ❌ " + nom + (det ? "  → " + det : "")); }
};

const PAGES = ["/", "/en/", "/participer/", "/en/request-a-workshop/", "/en-ligne/",
  "/en/online/", "/devenir-animateur/", "/guide/", "/animateurs/", "/mentions-legales/"];
const LARGEURS = [1440, 390];

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/* Releve les blocs de premier niveau d'une page et l'espace qui les separe.
   L'espace entre deux blocs, c'est la somme de ce que le premier laisse en bas
   et de ce que le second laisse en haut : c'est ce que l'oeil voit, quel que
   soit le fond de chacun. */
async function releve(pg, url, largeur) {
  await pg.setViewportSize({ width: largeur, height: 900 });
  await pg.goto(B + url, { waitUntil: "networkidle" });
  await pg.waitForTimeout(250);
  return pg.evaluate(() => {
    const blocs = [...document.querySelectorAll("main > section, main > .page-tete")]
      .filter((x) => !x.hidden && x.getBoundingClientRect().height > 0);
    return blocs.map((b) => {
      const cs = getComputedStyle(b);
      const titre = b.querySelector("h1, h2");
      return { classes: b.className || "", id: b.id || "",
        tete: b.classList.contains("page-tete"), suite: b.classList.contains("section-suite"),
        haut: parseFloat(cs.paddingTop), bas: parseFloat(cs.paddingBottom),
        titre: titre ? titre.textContent.trim().replace(/\s+/g, " ").slice(0, 28) : "(sans titre)" };
    });
  });
}

const pg = await nav.newPage();

/* L'ecart entre deux blocs, c'est ce que le premier laisse en bas plus ce que
   le second laisse en haut : c'est ce que l'oeil voit, quel que soit leur
   fond. Les deux exceptions voulues sont ecartees du compte et verifiees a
   part. */
function ecarts(blocs) {
  const pas = [], anomalies = [];
  for (let i = 1; i < blocs.length; i++) {
    const a = blocs[i - 1], b = blocs[i];
    if (a.tete) continue;                  /* titre de page colle a sa section : voulu */
    if (b.suite) {                          /* section qui en prolonge une autre : demi-pas */
      if (a.bas !== 0) anomalies.push("« " + b.titre + " » prolonge la section du dessus, "
        + "mais celle-ci garde " + a.bas + " px en bas");
      continue;
    }
    pas.push({ ecart: a.bas + b.haut, titre: b.titre });
  }
  for (const x of pas) if (pas.length && x.ecart !== pas[0].ecart)
    anomalies.push("« " + x.titre + " » : " + x.ecart + " px au lieu de " + pas[0].ecart);
  return { pas, anomalies };
}

const parLargeur = new Map();
for (const largeur of LARGEURS) {
  console.log("\n--- Le rythme a " + largeur + " px ---");
  const communs = new Map();
  for (const url of PAGES) {
    const blocs = await releve(pg, url, largeur);
    if (blocs.length < 2) { t(url + " : au moins deux blocs a mesurer", false, blocs.length + " bloc(s)"); continue; }
    const { pas, anomalies } = ecarts(blocs);
    t(url.padEnd(26) + " ecarts identiques entre sections", anomalies.length === 0,
      anomalies.join(" ; "));
    if (pas.length) communs.set(pas[0].ecart, (communs.get(pas[0].ecart) || []).concat(url));
  }
  parLargeur.set(largeur, communs);
}

/* Le meme pas d'une page a l'autre : sans cela chaque page respirerait a son
   propre rythme, ce qui se voit en passant de l'une a l'autre. */
console.log("\n--- Le meme pas partout ---");
for (const [largeur, communs] of parLargeur) {
  t("a " + largeur + " px, toutes les pages separent leurs sections pareil", communs.size === 1,
    [...communs].map(([v, u]) => v + " px sur " + u.join(", ")).join(" ; "));
}

/* La regression de fond : un attribut `style=` est refuse en production, donc
   tout espacement ecrit ainsi est invisible pour les visiteurs. */
console.log("\n--- Aucun espacement ecrit en ligne ---");
const enLigne = [];
(function balaye(dir) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) { balaye(f); continue; }
    if (!n.endsWith(".html")) continue;
    const src = fs.readFileSync(f, "utf8");
    const m = src.match(/\sstyle="[^"]*"/g);
    if (m) enLigne.push(path.relative(RACINE, f) + " : " + m.length);
  }
})(path.join(RACINE, "site"));
t("aucun attribut style= dans le HTML du site (refuse par le CSP)",
  enLigne.length === 0, enLigne.join(" ; "));

console.log("\n" + (ko ? "❌" : "✅") + " Rythme : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
