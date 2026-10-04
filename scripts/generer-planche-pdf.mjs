/* PLANCHE D'IMPRESSION DES CARTES : du gabarit HTML au PDF.

   POURQUOI CE SCRIPT. Les textes des cartes etaient recopies dans le gabarit,
   a cote de site/data/cartes.json. Deux copies du meme contenu, qu'il fallait
   penser a corriger ensemble ; elles avaient deja diverge. Le gabarit lit
   desormais cartes.json, mais cela ne sert a rien si la planche se refait a la
   main une fois par an : ce script la refait a la demande, et la CI s'en sert
   pour verifier qu'elle est toujours generable.

   LES IMAGES. Le gabarit les cherche dans `img/`, avec les noms que leur
   auteur leur a donnes. Dans le depot elles sont dans contenus/cartes/, parfois
   avec un numero a deux chiffres, parfois avec l'ancien numero d'avant la
   renumerotation, et l'apostrophe y est ecrite « _ ». Le serveur de ce script
   fait la correspondance, plutot que de renommer 84 fichiers ou d'alourdir le
   gabarit : celui-ci reste utilisable a la main, avec un simple dossier img/.

   Usage : node scripts/generer-planche-pdf.mjs [--sortie <fichier.pdf>]
           node scripts/generer-planche-pdf.mjs --verifier   (ne garde rien) */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GABARIT = "/contenus/Planche d'impression (20pages).html";
const IMAGES = path.join(RACINE, "contenus", "cartes");
const args = process.argv.slice(2);
const VERIFIER = args.includes("--verifier");
/* ON NE REMPLACE PAS LE TELECHARGEMENT SANS LE DIRE. Le PDF publie pese 6 Mo,
   compresse a la main avec un outil que ce script n'a pas ; la meilleure sortie
   d'ici pese 12 Mo, et la page d'accueil annonce « PDF · 7 Mo ». Par defaut on
   ecrit donc A COTE, et `--publier` est le geste explicite qui ecrase le
   fichier telechargeable, une fois la question du poids reglee. */
const SORTIE = (() => {
  const i = args.indexOf("--sortie");
  if (i !== -1 && args[i + 1]) return path.resolve(args[i + 1]);
  return args.includes("--publier")
    ? path.join(RACINE, "site", "telechargements", "fresque-des-risques-de-l-ia-cartes.pdf")
    : path.join(RACINE, "contenus", "planche-generee.pdf");
})();

/* --- Reduire les images avant de les imprimer ----------------------------
   Les sources font jusqu'a 8736 x 4896 pixels pour une illustration qui occupe
   la moitie d'une carte A6. Chromium les embarque telles quelles : le PDF
   pesait 40 Mo, contre 6 Mo pour la version publiee, que quelqu'un avait
   compressee a la main. A 300 points par pouce, une A6 entiere fait 1240 px de
   large : 1600 px couvre donc largement le besoin, avec de la marge.
   On ne touche JAMAIS aux fichiers du depot : les reductions vivent dans un
   dossier temporaire, efface a la fin. */
const MAX_PX = (() => { const i = args.indexOf("--images-max"); return i !== -1 ? Number(args[i + 1]) : 1600; })();
const REDUIRE = !args.includes("--sans-reduction") && MAX_PX > 0;
let CACHE = null;
if (REDUIRE) {
  CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "planche-img-"));
  execFileSync("python3", ["-c", `
import os, sys
from PIL import Image, ImageOps
src, dst, maxpx = sys.argv[1], sys.argv[2], int(sys.argv[3])
for f in os.listdir(src):
    if not f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")): continue
    try:
        im = ImageOps.exif_transpose(Image.open(os.path.join(src, f)))
    except Exception:
        continue
    if max(im.size) > maxpx:
        im.thumbnail((maxpx, maxpx), Image.LANCZOS)
    # On garde la transparence quand il y en a : certaines cartes sont des
    # schemas sur fond transparent, qu'un aplat blanc abimerait.
    if im.mode in ("RGBA", "LA", "P") and ("transparency" in im.info or im.mode != "P"):
        im.convert("RGBA").save(os.path.join(dst, f + ".png"), "PNG", optimize=True)
    else:
        im.convert("RGB").save(os.path.join(dst, f + ".jpg"), "JPEG", quality=86, optimize=True, progressive=True)
`, IMAGES, CACHE, String(MAX_PX)], { stdio: "inherit" });
}
/* Le fichier reduit porte le nom d'origine SUIVI de sa nouvelle extension :
   on retrouve donc l'un a partir de l'autre sans table de correspondance. */
function reduite(nom) {
  if (!CACHE) return null;
  for (const ext of [".png", ".jpg"]) {
    const f = path.join(CACHE, nom + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

/* --- Retrouver l'image d'une carte ---------------------------------------
   On compare des noms ecrits par des humains : accents, apostrophes droites ou
   courbes, « _ » a la place de l'apostrophe, numero a un ou deux chiffres. On
   normalise les deux cotes avant de comparer, au lieu d'esperer qu'ils
   coincident. */
const normaliser = (s) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const fichiers = fs.existsSync(IMAGES)
  ? fs.readdirSync(IMAGES).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  : [];
const index = fichiers.map((f) => {
  const sansExt = f.replace(/\.[^.]+$/, "");
  const m = /^(\d+)\s+(.*)$/.exec(sansExt);
  return { f, num: m ? Number(m[1]) : null, titre: m ? normaliser(m[2]) : normaliser(sansExt) };
});

function imagePour(demande) {
  // demande : « 14 Deepfake.png » ou « 14.png »
  const sansExt = decodeURIComponent(demande).replace(/\.[^.]+$/, "");
  const m = /^(\d+)(?:\s+(.*))?$/.exec(sansExt);
  if (!m) return null;
  const num = Number(m[1]), titre = m[2] ? normaliser(m[2]) : "";
  // Titre d'abord : « 0 - 32 CesIA logo » et la carte 0 portent le meme numero.
  if (titre) {
    const exact = index.find((x) => x.num === num && x.titre === titre);
    if (exact) return exact.f;
  }
  /* Le nom du fichier porte parfois une precision que le gabarit ignore :
     « 00 Fresque des risques de l_IA (logo Pause IA).png » pour la carte
     « Fresque des risques de l'IA ». On accepte donc qu'il COMMENCE par le
     titre demande, ce qui suffit a lever l'ambiguite avec les deux autres
     fichiers numerotes 0 (les logos). */
  if (titre) {
    const prefixe = index.filter((x) => x.num === num && x.titre.startsWith(titre));
    if (prefixe.length === 1) return prefixe[0].f;
  }
  const parNum = index.filter((x) => x.num === num);
  return parNum.length === 1 ? parNum[0].f : null;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2" };

const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  const img = /^\/contenus\/img\/(.+)$/.exec(p);
  if (img) {
    const trouve = imagePour(img[1]);
    if (!trouve) { res.writeHead(404); return res.end(); }
    const petite = reduite(trouve);
    if (petite) {
      res.writeHead(200, { "content-type": petite.endsWith(".png") ? "image/png" : "image/jpeg" });
      return fs.createReadStream(petite).pipe(res);
    }
    p = "/contenus/cartes/" + trouve;
  }
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => serveur.listen(0, r));
const B = "http://127.0.0.1:" + serveur.address().port;

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await nav.newPage();
const manquantes = [];
page.on("response", (r) => { if (r.status() === 404 && /\/img\//.test(r.url())) manquantes.push(decodeURIComponent(r.url().split("/img/")[1])); });

await page.goto(B + encodeURI(GABARIT), { waitUntil: "networkidle" });
/* On attend que le gabarit ait LU la source et pose ses planches. Imprimer
   avant, c'est produire un PDF de pages vides que personne ne regarde. */
await page.waitForFunction(() => document.documentElement.dataset.planche === "prete", { timeout: 30000 })
  .catch(async () => {
    const texte = await page.evaluate(() => document.body.innerText.slice(0, 300));
    throw new Error("le gabarit n'a pas fini de se construire : " + texte);
  });
await page.waitForTimeout(400);

const info = await page.evaluate(() => ({
  /* Une carte vide bouche la derniere case de la derniere feuille : 39 cartes
     ne remplissent pas 10 feuilles de 4. Elle ne compte pas. */
  cartes: document.querySelectorAll(".card").length - document.querySelectorAll(".card.blank, .card:empty").length,
  feuilles: document.querySelectorAll(".sheet").length,
  sansImage: [...document.querySelectorAll(".card .img img")].filter((i) => !i.complete || !i.naturalWidth).length,
  vides: [...document.querySelectorAll(".card .vtext, .card .title")].filter((e) => !e.textContent.trim()).length
}));

const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true,
  margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" } });

console.log("cartes posees   : " + info.cartes);
console.log("feuilles        : " + info.feuilles);
console.log("images absentes : " + (manquantes.length ? [...new Set(manquantes)].slice(0, 6).join(", ") : "aucune"));
console.log("blocs vides     : " + info.vides);
console.log("poids du PDF    : " + (pdf.length / 1e6).toFixed(1) + " Mo");

let ko = 0;
const t = (nom, cond, det) => { console.log((cond ? "  ✅ " : "  ❌ ") + nom + (det ? "  → " + det : "")); if (!cond) ko++; };
console.log("");
t("les 39 cartes sont posees, recto et verso", info.cartes === 78, info.cartes + " faces");
t("aucune image ne manque", manquantes.length === 0, [...new Set(manquantes)].slice(0, 4).join(", "));
t("aucun titre ni verso vide", info.vides === 0, String(info.vides));

if (!VERIFIER && !ko) {
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, pdf);
  console.log("\n→ " + path.relative(RACINE, SORTIE));
}
console.log("\n" + (ko ? "❌" : "✅") + " Planche d'impression : " + ko + " controle(s) en echec.\n");
await nav.close();
serveur.close();
if (CACHE) fs.rmSync(CACHE, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
