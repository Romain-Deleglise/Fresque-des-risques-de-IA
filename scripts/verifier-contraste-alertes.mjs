/* LE CONTRASTE DE CE QUI N'EXISTE QU'APRES UNE INTERACTION.

   CE QUE CE BANC PROTEGE. L'audit axe-core regarde les pages AU REPOS. Les
   communes suggerees et les communes choisies, elles, n'apparaissent qu'une
   fois qu'on a tape dans le champ : aucun audit ne les voyait. Leurs couleurs
   etaient ecrites en dur (fond clair fixe) alors que le texte suit le theme :
   en theme sombre, de l'encre presque blanche sur un fond presque blanc.
   Mesure avant correction : contraste de 1,00 pour une commune choisie et de
   1,15 pour une suggestion. Illisible, et invisible pour la CI.

   On mesure donc ici le contraste reel, dans les deux themes.

   Usage : node scripts/verifier-contraste-alertes.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain" };
const site = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
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

/* Le rapport de contraste de WCAG : (L1 + 0,05) / (L2 + 0,05). Le seuil AA
   pour du texte courant est 4,5. */
const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const erreursJS = [];

for (const theme of ["dark", "light"]) {
  const pg = await nav.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
  pg.on("pageerror", (e) => erreursJS.push(e.message));
  await pg.goto(B + "/participer/", { waitUntil: "networkidle" });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    const r = document.querySelector('input[name="format"][value="physique"]');
    if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await pg.fill("#commune-champ", "Villeurb");
  await pg.waitForTimeout(700);

  console.log("\n--- Thème " + theme + " ---");
  const mesures = await pg.evaluate(() => {
    const out = {};
    const li = document.querySelector(".commune-item");
    if (li) {
      const c = getComputedStyle(li);
      const liste = li.closest(".commune-liste");
      out["une commune suggérée"] = [c.color, getComputedStyle(liste || li).backgroundColor];
      out["la suggestion survolée"] = null;   // rempli ci-dessous
    }
    /* Une commune choisie : on la pose nous-mêmes plutôt que de cliquer, pour
       mesurer le style et non le parcours (vérifié ailleurs). */
    const ul = document.getElementById("zones-choisies");
    if (ul) {
      ul.innerHTML = '<li class="puce-zone">Villeurbanne <button type="button" class="puce-x">×</button></li>';
      const p = ul.querySelector(".puce-zone"), b = ul.querySelector(".puce-x");
      out["une commune choisie"] = [getComputedStyle(p).color, getComputedStyle(p).backgroundColor];
      out["sa croix de retrait"] = [getComputedStyle(b).color, getComputedStyle(b).backgroundColor];
    }
    const s = document.getElementById("rayon");
    if (s) out["la distance"] = [getComputedStyle(s).color, getComputedStyle(s).backgroundColor];
    delete out["la suggestion survolée"];
    return out;
  });

  for (const [quoi, v] of Object.entries(mesures)) {
    const r = contraste(v[0], v[1]);
    t(quoi + " se lit", r >= 4.5, "contraste " + r.toFixed(2) + " (" + v[0] + " sur " + v[1] + ")");
  }
  await pg.close();
}

/* LES DISTANCES NE DISENT QUE LES DISTANCES. « 100 km · je peux prendre le
   train » melait la mesure et son interpretation : on choisit un rayon, pas un
   moyen de transport, et la phrase allongeait chaque ligne pour rien. */
console.log("\n--- Les distances ---");
const html = fs.readFileSync(path.join(RACINE, "site/participer/index.html"), "utf8");
const options = [...html.matchAll(/<option value="(15|30|50|100)"[^>]*>([^<]*)<\/option>/g)].map((m) => m[2]);
t("les quatre distances sont proposées", options.length === 4, options.join(" | "));
t("et ne portent que la distance",
  options.every((o) => /^\d+\s*km$/.test(o.trim())), options.join(" | "));

t("aucune erreur JavaScript", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Contraste des alertes : " + (total - ko)
  + " vérifications réussies, " + ko + " échouées.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
