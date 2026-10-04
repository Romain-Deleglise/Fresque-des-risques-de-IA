/* Banc du parcours « etre prevenu des prochains ateliers ».

   CE QUE CE BANC PROTEGE. Un participant a signale que le systeme semblait
   casse. Reproduit ici : on tapait sa ville, on la choisissait dans la liste,
   elle restait AFFICHEE dans le champ, on envoyait, et elle etait jetee parce
   qu'on n'avait pas presse « Ajouter ». Avec une seule ville, le message
   d'erreur demandait de choisir une commune alors qu'elle etait sous les yeux.
   Avec une deuxieme, pire : « c'est note », et jamais d'alerte pour cette
   ville-la. Rien a l'ecran ne permettait de s'en rendre compte.

   Le service de fond est bouchonne : ce banc verifie CE QUE LE FORMULAIRE
   ENVOIE, qui est exactement ce que le defaut corrompait. Les regles de
   selection (qui recoit quoi) sont testees a part, dans
   serveur/tests/alertes.test.mjs.

   Usage : node scripts/verifier-alertes.mjs */
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
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  fs.readFile(path.join(RACINE, "site", p), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
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
const pg = await nav.newPage({ viewport: { width: 1280, height: 1000 } });
const erreursJS = [];
pg.on("pageerror", (e) => erreursJS.push(e.message));

let envoye = null, desabonne = false;
await pg.route("**/.netlify/functions/alertes**", async (route) => {
  const r = route.request();
  if (r.method() === "POST") {
    envoye = JSON.parse(r.postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json",
      /* La vraie fonction repond desormais `aConfirmer` sur une inscription
         neuve : tant que le lien recu par e-mail n'est pas ouvert, rien ne
         part. Le banc doit donc voir la meme chose que le visiteur. */
      body: JSON.stringify({ ok: true, miseAJour: false, aConfirmer: true, mailEnvoye: true }) });
  } else if (new URL(r.url()).searchParams.get("d")) {
    desabonne = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, desabonne: true }) });
  } else {
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, format: "les_deux", communes: ["69123"], rayonKm: 50, actif: true }) });
  }
});
await pg.route("**/.netlify/functions/ateliers**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: '{"ateliers":[]}' }));

const aller = async () => {
  envoye = null;
  await pg.goto(B + "/participer/", { waitUntil: "networkidle" });
  await pg.waitForFunction(() => !!window.Commune, null, { timeout: 15000 });
  await pg.fill('#form-alertes [name="mail"]', "essai@exemple.fr");
};
/* Choisit une commune dans la liste SANS presser « Ajouter » : c'est le geste
   exact du defaut signale. */
const choisirSansAjouter = async (texte) => {
  await pg.fill("#commune-champ", "");
  await pg.click("#commune-champ");
  await pg.type("#commune-champ", texte, { delay: 40 });
  await pg.waitForFunction(() => document.querySelectorAll(".commune-liste li").length > 0,
    null, { timeout: 8000 }).catch(() => {});
  const n = await pg.evaluate(() => document.querySelectorAll(".commune-liste li").length);
  if (!n) return false;
  await pg.evaluate(() => document.querySelector(".commune-liste li")
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await pg.waitForTimeout(120);
  return true;
};
const envoyer = async () => {
  await pg.click('#form-alertes button[type="submit"]');
  await pg.waitForTimeout(400);
  return pg.evaluate(() => {
    const m = document.getElementById("alertes-msg");
    return { classe: m.className, texte: m.textContent };
  });
};

console.log("\n--- Une commune choisie, « Ajouter » oublie ---");
await aller();
t("la commune se trouve bien dans la liste des propositions", await choisirSansAjouter("Villeurb"));
let m = await envoyer();
t("l'abonnement part quand meme", !!envoye && m.classe.indexOf("ok") >= 0, JSON.stringify(m));
t("et il porte la commune restee affichee dans le champ",
  !!envoye && (envoye.communes || []).length === 1, JSON.stringify(envoye));

console.log("\n--- Une deuxieme commune choisie, « Ajouter » oublie ---");
await aller();
await choisirSansAjouter("Villeurb");
await pg.click("#commune-ajout");
await pg.waitForTimeout(120);
await choisirSansAjouter("Grenoble");
m = await envoyer();
/* C'est le cas le plus grave : il ne disait RIEN. La personne partait avec une
   ville sur deux, et un message qui lui assurait que c'etait note. */
t("les DEUX communes partent, pas seulement celle qui a ete ajoutee",
  !!envoye && (envoye.communes || []).length === 2, JSON.stringify(envoye && envoye.communes));

console.log("\n--- Du texte qui ne designe aucune commune ---");
await aller();
await pg.fill("#commune-champ", "Zzzzville");
await pg.waitForTimeout(400);
m = await envoyer();
t("l'envoi est refuse", !envoye, JSON.stringify(envoye));
t("et le message dit que la saisie n'a pas ete choisie dans la liste",
  m.classe.indexOf("err") >= 0 && m.texte.indexOf("Zzzzville") >= 0, JSON.stringify(m));

console.log("\n--- « Uniquement les ateliers en ligne » ---");
await aller();
await pg.check('input[name="format"][value="enligne"]');
t("le bloc des communes disparait",
  await pg.evaluate(() => document.getElementById("bloc-zones").hidden));
m = await envoyer();
t("l'abonnement part sans commune", !!envoye && envoye.format === "enligne"
  && (envoye.communes || []).length === 0, JSON.stringify(envoye));

/* Ce que la page dit apres l'envoi. « C'est note » laissait croire que tout
   etait fini, alors qu'il reste le clic de confirmation : c'est precisement
   l'attente sans fin qu'un participant avait prise pour une panne. */
t("la page dit qu'il reste a confirmer par e-mail",
  /confirmation|Presque fini/i.test(await pg.evaluate(() => document.getElementById("alertes-msg").textContent || "")),
  await pg.evaluate(() => document.getElementById("alertes-msg").textContent || ""));

console.log("\n--- Le desabonnement ---");
await pg.goto(B + "/alertes/?d=jeton-de-banc-0123456", { waitUntil: "networkidle" });
await pg.waitForTimeout(600);
const texte = await pg.evaluate(() => (document.body.textContent || "").replace(/\s+/g, " "));
t("le lien du mail desabonne en une seule fois, sans rien demander",
  desabonne && /plus ces annonces/.test(texte), texte.slice(0, 120));
await pg.goto(B + "/alertes/", { waitUntil: "networkidle" });
await pg.waitForTimeout(400);
t("sans jeton, la page l'explique au lieu de rester vide",
  /Lien incomplet/.test(await pg.evaluate(() => document.body.textContent || "")));

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 3).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Alertes : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
