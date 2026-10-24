/* L'IMAGE DE PARTAGE (Open Graph), refaite depuis les propres elements du site.

   POURQUOI UN SCRIPT ET PAS UN FICHIER DEPOSE A LA MAIN. L'image precedente
   montrait d'anciennes cartes, un ancien logo et une adresse qui n'est plus la
   notre : elle a vieilli sans que personne ne s'en apercoive, parce qu'un
   binaire depose une fois ne se relit jamais. Celle-ci se refabrique a la
   demande a partir du logo, des polices, des couleurs et d'une photo du depot.
   Quand l'un de ces elements change, on relance une commande.

   Usage : node scripts/generer-partage.mjs
           node scripts/generer-partage.mjs --verifier   (ne garde rien)

   La CI l'appelle avec --verifier : une image de partage qui ne se genere plus
   se verrait, autrement, le jour ou l'on en a besoin.
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const verifier = process.argv.includes("--verifier");
/* DEUX VERSIONS, parce que le site en a deux. Les pages anglaises servaient
   une vignette en francais : le premier contact avec le projet se faisait
   dans une langue que la personne n'a pas choisie. */
const LANGUES = {
  fr: { fichier: "partage-2.jpg", lang: "fr",
    marque: "La Fresque des risques de l'IA",
    titre: "Comprendre ensemble les risques de l'IA",
    sous: "Atelier collaboratif · 38 cartes · 2 h 30 · sans prérequis",
    libre: "Gratuit et open source · cartes et guide en CC BY-SA 4.0",
    pied: "fresquedesrisquesdelia.org" },
  en: { fichier: "partage-2-en.jpg", lang: "en",
    marque: "The AI Risks Collage",
    titre: "Understand AI risks, together",
    sous: "Collaborative workshop · 38 cards · 2 h 30 · no tech skills",
    libre: "Free and open source · cards and guide under CC BY-SA 4.0",
    pied: "fresquedesrisquesdelia.org/en" }
};

/* LA PHOTO : des mains, des cartes d'aujourd'hui, un vrai atelier. On evite
   celles ou des visages sont reconnaissables : une photo de galerie n'est pas
   une photo poussee dans toutes les messageries du monde. */
const PHOTO = "/assets/img/photos/atelier-table-et-cartes-1024.webp";

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
  ".svg": "image/svg+xml", ".json": "application/json" };

const page = (L) => `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/fonts.css">
<style>
  :root{ --accent:#E8811C; --encre:#1b1a17; }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{position:relative;background:var(--encre);font-family:"Montserrat",system-ui,sans-serif}
  .photo{position:absolute;inset:0;background:url("${PHOTO}") center 38% / cover no-repeat}
  /* LE TEXTE DOIT SE LIRE SUR LA PHOTO, et une vignette de partage se regarde
     une demi-seconde : voile sombre a gauche, ou tout le texte vit, et degrade
     vers la droite pour laisser voir les cartes. */
  .voile{position:absolute;inset:0;
    background:linear-gradient(100deg, rgba(20,18,14,.93) 0%, rgba(20,18,14,.90) 42%, rgba(20,18,14,.45) 70%, rgba(20,18,14,.20) 100%)}
  .bande{position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--accent)}
  .contenu{position:absolute;inset:0;padding:58px 64px 52px 78px;display:flex;flex-direction:column;justify-content:space-between}
  .marque{display:flex;align-items:center;gap:16px}
  .marque svg{width:54px;height:54px;flex:0 0 auto}
  .marque span{font-family:"Saira Condensed",sans-serif;font-size:30px;color:#fff;letter-spacing:.01em}
  h1{font-family:"Saira Condensed",sans-serif;font-weight:700;font-size:82px;line-height:.98;
     color:#fff;max-width:760px;text-wrap:balance}
  .sous{margin-top:20px;font-size:25px;font-weight:600;color:#f3efe7;max-width:720px}
  /* GRATUIT ET LIBRE : c'est ce qui decide quelqu'un a cliquer, et c'est vrai
     (cartes et guide en CC BY-SA 4.0, code ouvert). Une vignette de partage
     se lit en une demi-seconde : cette ligne-la doit y etre. */
  .libre{margin-top:12px;display:inline-flex;align-items:center;gap:10px;
    font-size:20px;font-weight:700;color:#1b1a17;background:#E8811C;
    padding:7px 16px;border-radius:999px}
  .pied{display:flex;align-items:center;gap:14px;font-size:23px;font-weight:700;color:var(--accent)}
</style></head><body>
  <div class="photo"></div><div class="voile"></div><div class="bande"></div>
  <div class="contenu">
    <div class="marque">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="10" width="52" height="44" rx="11" fill="#E8811C"/><g fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="26" y1="24" x2="37" y2="21"/><line x1="20" y1="29" x2="31" y2="37"/><line x1="43" y1="26" x2="33" y2="37"/></g><g fill="#ffffff"><rect x="13" y="19" width="13" height="10" rx="2"/><rect x="37" y="16" width="13" height="10" rx="2"/><rect x="25" y="37" width="14" height="10" rx="2"/></g></svg>
      <span>${L.marque}</span>
    </div>
    <div>
      <h1>${L.titre}</h1>
      <p class="sous">${L.sous}</p>
      <p class="libre">${L.libre}</p>
    </div>
    <p class="pied">${L.pied}</p>
  </div>
</body></html>`;

let courante = LANGUES.fr;
const site = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/" || p === "/index.html") {
    r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return r.end(page(courante));
  }
  const f = path.join(RACINE, "site", p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => site.listen(0, r));
const B = "http://127.0.0.1:" + site.address().port;

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await nav.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const cle of Object.keys(LANGUES)) {
  courante = LANGUES[cle];
  const cible = path.join(RACINE, "site/assets/img/social/",
    verifier ? ".partage-tmp.jpg" : courante.fichier);
  await pg.goto(B + "/?l=" + cle, { waitUntil: "networkidle" });
  /* Les polices du site sont chargees par @font-face : sans cette attente, la
     capture prend la police de secours et l'image part avec. */
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(250);

  const manque = await pg.evaluate(() => getComputedStyle(document.querySelector(".photo")).backgroundImage === "none");
  if (manque) { console.error("La photo de fond ne s'est pas chargee : " + PHOTO); process.exit(2); }
  /* LE TEXTE DEBORDE-T-IL ? Une vignette coupee en bas ne se voit qu'une fois
     partagee, c'est-a-dire trop tard. */
  const deborde = await pg.evaluate(() => {
    const c = document.querySelector(".contenu");
    return c.scrollHeight > 630 || c.scrollWidth > 1200;
  });
  if (deborde) { console.error("Le texte deborde du cadre (" + cle + ")"); process.exit(2); }

  await pg.screenshot({ path: cible, type: "jpeg", quality: 86 });
  const poids = fs.statSync(cible).size;
  /* Une vignette de partage voyage dans des messageries : au-dela de 300 Ko,
     certaines la reduisent elles-memes, mal. */
  if (poids > 300 * 1024) { console.error("Image trop lourde : " + Math.round(poids / 1024) + " Ko"); process.exit(2); }
  if (verifier) { fs.unlinkSync(cible); console.log("✅ " + cle + " : l'image se genere (" + Math.round(poids / 1024) + " Ko)."); }
  else console.log("✅ assets/img/social/" + courante.fichier + " (" + Math.round(poids / 1024) + " Ko)");
}
await nav.close();
site.close();
