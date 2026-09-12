/* PDF DU GUIDE, ENGENDRE DEPUIS LA PAGE EN LIGNE.

   Deux supports couvrant le meme contenu finissent toujours par diverger, et
   c'est le PDF qui gagne : une fois telecharge, il circule, il est imprime, il
   devient la reference, et personne ne sait qu'il est perime. On ne redige donc
   plus le PDF : on l'IMPRIME depuis la page, avec la feuille de style `print`
   du site. Il ne peut plus etre en retard d'une version, et le pied de chaque
   page rappelle que la page en ligne fait foi, avec son adresse.

   Rendre le PDF reproductible ne suffit pas : rien n'empeche de modifier la page
   et d'oublier de relancer le script. On enregistre donc, a cote des PDF, une
   empreinte du contenu dont chacun a ete tire. `--verifier` recalcule ces
   empreintes et sort en erreur si elles ont bouge : la CI refuse alors la
   modification, et la garantie cesse d'etre une question de discipline.

   Usage : node scripts/generer-guide-pdf.mjs            (engendre les PDF)
           node scripts/generer-guide-pdf.mjs --verifier (controle, sans ecrire)
   Dependances (dev, non versionnees) : playwright (ou playwright-core +
   PW_CHROMIUM vers un Chromium deja present).
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.PORT_PDF || 8131);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon" };

const PAGES = [
  { url: "/guide/", source: "site/guide/index.html", sortie: "guide-animateur-fresque-des-risques-de-l-ia.pdf",
    pied: "Version en ligne, qui fait foi : fresquedesrisquesdelia.org/guide/" },
  { url: "/en/guide/", source: "site/en/guide/index.html", sortie: "facilitator-guide-the-ai-risks-collage.pdf",
    pied: "Authoritative online version: fresquedesrisquesdelia.org/en/guide/" }
];
const EMPREINTES = path.join(RACINE, "site", "telechargements", "empreintes.json");
const VERIFIER = process.argv.includes("--verifier");

/* Empreinte du CONTENU, pas du fichier : on ne retient que le corps du guide,
   debarrasse des espaces. Un PDF n'a pas a etre regenere parce qu'on a corrige
   une balise meta ou reindente le pied de page du site. */
function empreinte(fichier) {
  const html = fs.readFileSync(path.join(RACINE, fichier), "utf8");
  const m = html.match(/<main id="contenu">([\s\S]*?)<\/main>/);
  const corps = (m ? m[1] : html).replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(corps).digest("hex").slice(0, 16);
}
function empreintesLues() {
  try { return JSON.parse(fs.readFileSync(EMPREINTES, "utf8")).empreintes || {}; } catch (e) { return {}; }
}

if (VERIFIER) {
  const connues = empreintesLues();
  const ecarts = [];
  for (const p of PAGES) {
    const e = empreinte(p.source);
    if (!fs.existsSync(path.join(RACINE, "site", "telechargements", p.sortie))) {
      ecarts.push(p.sortie + " est absent.");
    } else if (connues[p.sortie] !== e) {
      ecarts.push(p.source + " a change depuis que " + p.sortie + " a ete engendre"
        + " (empreinte " + e + ", enregistree " + (connues[p.sortie] || "aucune") + ").");
    }
  }
  if (ecarts.length) {
    console.error("\n❌ Le PDF ne correspond plus a la page :\n  " + ecarts.join("\n  ")
      + "\n\nRelancer : node scripts/generer-guide-pdf.mjs\n");
    process.exit(1);
  }
  console.log("✅ Les PDF correspondent aux pages dont ils sont tires.");
  process.exit(0);
}

/* Le navigateur n'est charge qu'ici, et pas en tete de fichier : `--verifier`
   ne fait que lire des fichiers et comparer des empreintes, et il tourne dans un
   job d'integration continue qui n'installe pas Playwright. L'y exiger faisait
   echouer le controle pour une dependance dont il n'a aucun usage. */
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  if (!f.startsWith(path.join(RACINE, "site"))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, data) => {
    if (e) { res.writeHead(404).end("introuvable"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => site.listen(PORT, r));

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await nav.newContext();
for (const p of PAGES) {
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + PORT + p.url, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  const dest = path.join(RACINE, "site", "telechargements", p.sortie);
  await page.pdf({
    path: dest,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font:8pt -apple-system,Segoe UI,Roboto,sans-serif;color:#6b6459;'
      + 'padding:0 15mm;display:flex;justify-content:space-between">'
      + "<span>" + p.pied + "</span><span class=\"pageNumber\"></span></div>"
  });
  console.log("PDF ecrit : " + path.relative(RACINE, dest) + " (" + Math.round(fs.statSync(dest).size / 1024) + " Ko)");
  await page.close();
}
const empreintes = {};
for (const p of PAGES) empreintes[p.sortie] = empreinte(p.source);
fs.writeFileSync(EMPREINTES, JSON.stringify({
  _commentaire: "Empreinte du contenu de la page dont chaque PDF a ete tire. Verifiee en CI par scripts/generer-guide-pdf.mjs --verifier : si une page change sans que son PDF soit regenere, la CI refuse. Ne pas modifier a la main.",
  empreintes: empreintes
}, null, 2) + "\n");
console.log("Empreintes enregistrees : " + path.relative(RACINE, EMPREINTES));
await nav.close();
site.close();
