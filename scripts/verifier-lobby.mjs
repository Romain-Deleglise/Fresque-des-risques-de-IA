/* UN LIEN, UNE SEULE ENTREE (page d'accueil de la Fresque en ligne).

   CE QUE CE BANC PROTEGE. La page d'entree porte deux formulaires : « Ouvrir
   une session » et « Rejoindre ». Un lien d'invitation (?s=CODE) designe une
   session qui EXISTE ; la page offrait quand meme les deux. Cliquer « Ouvrir »
   creait une AUTRE session, vide, avec un autre code, pendant que le groupe
   attendait dans la bonne. Cela a ete signale plusieurs fois, et c'est ce que
   fait n'importe qui devant deux boutons dont un dit « Ouvrir ».

   La regle, verifiee ici pour chaque forme de lien : au plus UNE entree
   utilisable, celle que le lien designe.

   Usage : node scripts/verifier-lobby.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".jpg": "image/jpeg" };
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

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const erreursJS = [];

async function entrees(url, avant) {
  const ctx = await nav.newContext({ viewport: { width: 900, height: 760 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erreursJS.push(e.message));
  /* Le service repond « session inconnue » : on regarde la page d'entree, pas
     la session. Sans ce bouchon, la reprise automatique ouvrirait le tableau
     et il n'y aurait plus rien a mesurer. */
  await pg.route("**/.netlify/functions/fresque", (r) => r.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ refus: { code: "session_inconnue", message: "x" } }) }));
  if (avant) await pg.addInitScript(avant);
  await pg.goto(B + url, { waitUntil: "networkidle" });
  await pg.waitForTimeout(450);
  const v = await pg.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false;
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return { ouvrir: vis("#btn-creer"), rejoindre: vis("#btn-rejoindre"),
      colonnes: [...document.querySelectorAll("#lobby .lobby-cols > section")]
        .filter((s) => s.getBoundingClientRect().height > 0).length,
      note: vis("#note-sans-lien"), titre: (document.querySelector("#lobby h1") || {}).textContent };
  });
  await ctx.close();
  return v;
}

console.log("\n--- Chaque lien ne propose qu'une entree ---");

let v = await entrees("/en-ligne/session/");
t("sans code : on ouvre, on ne « rejoint » rien", v.ouvrir && !v.rejoindre, JSON.stringify(v));
t("et l'explication pour rejoindre reste lisible", v.note);
t("une seule colonne", v.colonnes === 1, String(v.colonnes));

v = await entrees("/en-ligne/session/?s=ABC123");
t("lien d'invitation : on rejoint, on n'ouvre pas", v.rejoindre && !v.ouvrir, JSON.stringify(v));
t("et le titre le dit", /rejoindre|join/i.test(v.titre || ""), v.titre);

v = await entrees("/en-ligne/session/?code=ABC123&prenom=Ana");
t("lien participant : on rejoint seulement", v.rejoindre && !v.ouvrir, JSON.stringify(v));

v = await entrees("/en-ligne/session/?ouvrir=ABC123&prenom=Lea");
t("lien animateur·ice : on ouvre seulement", v.ouvrir && !v.rejoindre, JSON.stringify(v));

/* L'ANIMATEUR·ICE QUI REVIENT PAR LE LIEN D'INVITATION doit ROUVRIR SA
   session, pas en creer une autre : son entree est « Ouvrir », avec le meme
   code, et surtout pas les deux colonnes. */
v = await entrees("/en-ligne/session/?s=ABC123", () => {
  localStorage.setItem("fresque:anim:ABC123", "jeton-de-banc");
});
t("l'animateur·ice revenue par le lien rouvre sa session", v.ouvrir && !v.rejoindre, JSON.stringify(v));
const code = await (async () => {
  const ctx = await nav.newContext();
  const pg = await ctx.newPage();
  await pg.route("**/.netlify/functions/fresque", (r) => r.fulfill({ status: 200,
    contentType: "application/json", body: JSON.stringify({ refus: { code: "session_inconnue", message: "x" } }) }));
  await pg.addInitScript(() => localStorage.setItem("fresque:anim:ABC123", "jeton-de-banc"));
  await pg.goto(B + "/en-ligne/session/?s=ABC123", { waitUntil: "networkidle" });
  await pg.waitForTimeout(400);
  const c = await pg.evaluate(() => (document.getElementById("anim-code") || {}).value);
  await ctx.close();
  return c;
})();
t("et c'est bien le MEME code qui se rouvre", code === "ABC123", String(code));

t("aucune erreur JavaScript", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Entree de la Fresque en ligne : " + (total - ko)
  + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
