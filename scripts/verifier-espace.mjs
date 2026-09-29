/* Banc de l'espace animateur·ices.

   Ce que ce banc protege, et pourquoi chaque controle existe :

   - LA FRESQUE S'AFFICHE SANS CLIC. Il fallait cliquer « Afficher la fresque de
     reference » a chaque venue, sur une page deja reservee et deja precedee de
     son avertissement. Le clic ne protegeait rien.
   - LES MEMES ONGLETS PARTOUT. Naviguer dans l'espace renvoyait aux onglets du
     site public, d'ou l'on ne revenait qu'avec le bouton « precedent ». Le
     guide, lui, est une page publique : il ne reprend les onglets de l'espace
     que lorsqu'on y arrive avec ?espace=1, et les rend a un visiteur ordinaire.
   - LE CHAMP « LIEN AVEC LA CARTE X ». « Cette carte devrait pointer vers
     l'autre » est le retour le plus frequent et le plus inexploitable tant
     qu'on ne sait pas laquelle. Les cartes deja liees sont proposees d'abord.

   Usage : node scripts/verifier-espace.mjs
   Le site est servi par le banc lui-meme : rien a lancer a cote. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
/* Un serveur de fichiers qui ne trouve pas le site ne tombe pas : il repond 404
   a tout, la page se charge vide, et l'on cherche la panne dans le navigateur. */
if (!fs.existsSync(path.join(RACINE, "site", "index.html"))) {
  console.error("Site introuvable sous " + RACINE + "/site : ce banc doit etre lance depuis le depot.");
  process.exit(2);
}
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon" };
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
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

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await nav.newPage({ viewport: { width: 1280, height: 900 } });
const erreursJS = [];
pg.on("pageerror", (e) => erreursJS.push(e.message));

console.log("\n--- La fresque de reference ---");
await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForSelector("#plateau-section:not([hidden])", { timeout: 20000 }).catch(() => {});
const vue = await pg.evaluate(() => ({
  plateau: !document.getElementById("plateau-section").hidden,
  cartes: document.querySelectorAll("#cartes .c-carte").length,
  bouton: !!document.getElementById("btn-reveal"),
  retours: !document.getElementById("retours-section").hidden
}));
t("la fresque s'affiche sans qu'on clique quoi que ce soit", vue.plateau && vue.cartes > 30, JSON.stringify(vue));
t("le bouton « Afficher la fresque de référence » a disparu", !vue.bouton);
t("la section des retours est visible du même coup", vue.retours);

console.log("\n--- Le lien avec une autre carte ---");
await pg.evaluate(() => document.getElementById("mode-commentaires").click());
await pg.click("#cartes .c-carte[data-n='14']");
await pg.waitForSelector("#panneau:not([hidden])", { timeout: 10000 });
const champ = await pg.evaluate(() => {
  const s = document.getElementById("c-lien");
  if (!s) return null;
  return {
    visible: !document.getElementById("panneau-commentaire").hidden,
    groupes: [...s.querySelectorAll("optgroup")].map((g) => g.label),
    options: s.options.length,
    soi: [...s.options].some((o) => o.value === "14")
  };
});
t("le champ « lien avec la carte X » est offert dans le panneau",
  !!champ && champ.visible && champ.options > 30, JSON.stringify(champ));
t("les cartes déjà liées sont proposées d'abord",
  !!champ && champ.groupes[0] === "Cartes déjà liées à celle-ci", JSON.stringify(champ && champ.groupes));
t("une carte ne se propose pas elle-même", !!champ && !champ.soi);

console.log("\n--- Les onglets de l'espace ---");
const ATTENDU = ["Accueil", "Guide", "Outils", "Retours", "Fresque de référence"];
const lireOnglets = async (url) => {
  await pg.goto(B + url, { waitUntil: "networkidle" });
  return pg.evaluate(() => {
    const nav = document.querySelector(".entete .nav");
    const b = nav && nav.querySelector(".btn-nav");
    return { liens: nav ? [...nav.querySelectorAll("a")].map((a) => a.textContent.trim()) : [],
      bouton: b ? b.getAttribute("href") : null };
  });
};
for (const u of ["/animateurs/", "/animateurs/outils/", "/animateurs/retours/",
                 "/animateurs/antiseche/", "/animateurs/minuteur/", "/animateurs/kit/",
                 "/guide/?espace=1"]) {
  const o = await lireOnglets(u);
  t("les mêmes onglets sur " + u,
    JSON.stringify(o.liens) === JSON.stringify(ATTENDU), JSON.stringify(o.liens));
  t("le bouton orange mène à l'onglet Retours depuis " + u,
    !!o.bouton && o.bouton.includes("animateurs/retours/#fresque"), String(o.bouton));
}
/* L'ESPACE NE DEBORDE PAS SUR LE SITE PUBLIC. Le guide est telechargeable et
   indexe : un visiteur ordinaire ne doit y voir aucun onglet reserve. */
const pub = await lireOnglets("/guide/");
t("sans ?espace=1, le guide garde la navigation publique",
  pub.liens.indexOf("Retours") === -1 && pub.liens.indexOf("Outils") === -1,
  JSON.stringify(pub.liens));

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 3).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Espace animateur·ices : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
