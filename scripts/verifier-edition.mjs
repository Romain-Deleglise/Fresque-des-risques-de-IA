/* CORRIGER UNE CARTE DEPUIS LE PANNEAU : le parcours, dans un navigateur.

   CE QUE CE BANC PROTEGE. Le bloc d'edition ecrit dans un texte PUBLIE. Trois
   facons de mal faire, qu'aucun test unitaire ne verrait :
   - le montrer sans jeton de moderation ;
   - le pre-remplir avec le texte publie alors qu'un brouillon attend, ce qui
     ferait reecrire la meme correction ou l'annuler sans le vouloir ;
   - ne pas dire qu'une carte porte deja une correction en attente.

   Le service de fond est bouchonne : ses regles sont verifiees a part, dans
   scripts/verifier-brouillons.cjs et serveur/tests/brouillons.test.mjs.

   Usage : node scripts/verifier-edition.mjs */
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

let ko = 0;
const t = (nom, cond, det) => {
  console.log((cond ? "  ✅ " : "  ❌ ") + nom + (det ? "  → " + det : ""));
  if (!cond) ko++;
};

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erreursJS = [];
pg.on("pageerror", (e) => erreursJS.push(e.message));

let brouillons = [];
await pg.route("**/.netlify/functions/commentaires**", (r) => r.fulfill({ status: 200,
  contentType: "application/json", body: JSON.stringify({ ok: true, compte: {}, retours: [] }) }));
await pg.route("**/.netlify/functions/brouillons**", async (r) => {
  const req = r.request();
  const rep = (c) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
  if (req.method() === "GET") return rep({ ok: true, brouillons, resume: [] });
  const c = JSON.parse(req.postData() || "{}");
  if (c.action === "enregistrer") {
    brouillons = brouillons.filter((b) => b.n !== c.n).concat([{ n: c.n, titre: c.titre }]);
    return rep({ ok: true, nombre: brouillons.length });
  }
  if (c.action === "oublier") {
    brouillons = brouillons.filter((b) => b.n !== c.n);
    return rep({ ok: true });
  }
  return rep({ ok: true, fichier: { cartes: [] }, resume: [] });
});

await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1300);
const vu = (id) => pg.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.hidden; }, id);

/* Le panneau est en position fixe et recouvre le formulaire de jeton : on passe
   par le DOM, ce n'est pas le placement qu'on verifie ici. */
const ouvrirCarte = () => pg.evaluate(() => {
  const p = document.getElementById("panneau");
  if (p && !p.hidden) document.getElementById("panneau-fermer").click();
  document.querySelector('.c-carte[data-n="3"]').click();
});

console.log("\n--- Sans jeton de moderation ---");
await ouvrirCarte();
await pg.waitForTimeout(350);
t("aucun bloc d'edition", !(await vu("panneau-edition")));
t("aucun bouton de publication", !(await vu("publier-modifs")));

console.log("\n--- Avec le jeton ---");
await pg.evaluate(() => {
  document.getElementById("panneau-fermer").click();
  document.getElementById("jeton").value = "jeton-de-banc-123456";
  document.getElementById("form-jeton").requestSubmit();
});
await pg.waitForTimeout(500);
await ouvrirCarte();
await pg.waitForTimeout(400);
t("le bloc d'edition apparait", await vu("panneau-edition"));
const preRempli = await pg.inputValue("#e-titre");
t("les champs portent le texte publie", preRempli === "Amélioration des capacités", preRempli);

console.log("\n--- Enregistrer, puis annuler ---");
await pg.evaluate(() => {
  document.getElementById("e-titre").value = "Amélioration des capacités (corrigé)";
  document.getElementById("e-enregistrer").click();
});
await pg.waitForTimeout(600);
const apres = await pg.evaluate(() => ({
  etat: document.getElementById("e-etat").textContent,
  publier: document.getElementById("publier-modifs").textContent,
  publierVisible: !document.getElementById("publier-modifs").hidden,
  signale: document.getElementById("panneau-edition").classList.contains("a-un-brouillon")
}));
t("le brouillon est enregistre et annonce comme tel", /brouillon/i.test(apres.etat), apres.etat);
t("la carte signale qu'une correction attend", apres.signale);
t("le bouton de publication compte les brouillons", apres.publierVisible && /\(1\)/.test(apres.publier), apres.publier);

await pg.evaluate(() => document.getElementById("e-annuler").click());
await pg.waitForTimeout(600);
const ann = await pg.evaluate(() => ({
  etat: document.getElementById("e-etat").textContent,
  publierVisible: !document.getElementById("publier-modifs").hidden
}));
t("annuler retire le brouillon", /abandonn/i.test(ann.etat), ann.etat);
t("et cache la publication quand il n'en reste aucun", !ann.publierVisible);

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Edition des cartes : " + (9 - ko) + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
