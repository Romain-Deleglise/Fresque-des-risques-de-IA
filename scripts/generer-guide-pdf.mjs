/* PDF DU GUIDE, ENGENDRE DEPUIS LA PAGE EN LIGNE.

   Deux supports couvrant le meme contenu finissent toujours par diverger, et
   c'est le PDF qui gagne : une fois telecharge, il circule, il est imprime, il
   devient la reference, et personne ne sait qu'il est perime. On ne redige donc
   plus le PDF : on l'IMPRIME depuis la page, avec la feuille de style `print`
   du site. Il ne peut plus etre en retard d'une version, et le pied de chaque
   page rappelle que la page en ligne fait foi, avec son adresse.

   Usage : node scripts/generer-guide-pdf.mjs
   Dependances (dev, non versionnees) : playwright (ou playwright-core +
   PW_CHROMIUM vers un Chromium deja present).
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.PORT_PDF || 8131);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon" };

const PAGES = [
  { url: "/guide/", sortie: "guide-animateur-fresque-des-risques-de-l-ia.pdf",
    pied: "Version en ligne, qui fait foi : fresquedesrisquesdelia.org/guide/" },
  { url: "/en/guide/", sortie: "facilitator-guide-the-ai-risks-collage.pdf",
    pied: "Authoritative online version: fresquedesrisquesdelia.org/en/guide/" }
];

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
await nav.close();
site.close();
