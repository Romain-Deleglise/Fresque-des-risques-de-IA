/* EPREUVE DE CHARGE : UN ATELIER COMPLET, NEUF NAVIGATEURS.

   Tout ce qui a ete mesure jusqu'ici l'a ete a DEUX. Or ce qui coute, sur ce
   tableau, croit avec le carre du nombre de personnes : chaque curseur est
   diffuse a tous les autres, chaque action envoie une photo complete du tableau
   a tous les autres. A deux, c'est deux flux ; a neuf, c'est soixante-douze. Ce
   script ouvre donc un atelier entier (un animateur et huit participants) sur le
   VRAI relais, avec un service de sessions volontairement lent et
   eventuellement coherent, et mesure ce qui se degrade.

   Il ne remplace pas une repetition avec de vraies personnes : il ne sait rien
   dire des reseaux domestiques, des machines lentes ni des navigateurs varies.
   Il dit en revanche si l'architecture tient, et a partir de quand elle ne tient
   plus.

   Usage : node scripts/verifier-charge.mjs
   Reglages : PARTICIPANTS (defaut 8), SECONDES (defaut 12).
   Dependances (dev, non versionnees) : playwright (ou playwright-core +
   PW_CHROMIUM), ws.
*/
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const R = require("../serveur/src/regles.js");

const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
/* Un serveur de fichiers qui ne trouve pas le site ne tombe pas : il repond 404
   a tout, la page se charge vide, et l'on cherche la panne dans le navigateur.
   C'est exactement ce qui est arrive avec un chemin de machine laisse en dur.
   On verifie donc, tout de suite, qu'on sait ou est le site. */
if (!fs.existsSync(path.join(RACINE, "site", "index.html"))) {
  console.error("Site introuvable sous " + RACINE + "/site : ce banc doit etre lance depuis le depot.");
  process.exit(2);
}

const PORT_SITE = Number(process.env.PORT_SITE || 8117);
const PORT_RELAIS = Number(process.env.PORT_RELAIS || 8118);
const LATENCE = Number(process.env.LATENCE || 250);
const LATENCE_ECRIT = Number(process.env.LATENCE_ECRIT || 900);
const RETARD = Number(process.env.RETARD || 2000);
const NB = Number(process.env.PARTICIPANTS || 8);
const SECONDES = Number(process.env.SECONDES || 12);
const CHROME = process.env.PW_CHROMIUM || undefined;

let ok = 0, ko = 0;
const bilan = [];
function t(nom, cond, detail) {
  if (cond) { ok++; bilan.push("  ✅ " + nom + (detail ? "  (" + detail + ")" : "")); }
  else { ko++; bilan.push("  ❌ " + nom + (detail ? "  → " + detail : "")); }
}
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
const centile = (a, p) => { if (!a.length) return -1; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };

/* --- Site --------------------------------------------------------------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(RACINE, "site", p);
  if (!f.startsWith(path.join(RACINE, "site"))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, data) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => site.listen(PORT_SITE, r));

/* --- Le vrai relais ------------------------------------------------------ */
process.env.PORT = String(PORT_RELAIS);
await import("../infra/curseurs/server.js");

/* --- Service de sessions simule, lent et eventuellement coherent --------- */
const c0 = R.creer("Anim", "CHARGE");
const S = c0.session;
S.jetons["jAnim"] = { role: "animateur", id: c0.idAnim };
const PRENOMS = ["Bleu", "Vert", "Rouge", "Jaune", "Violet", "Orange", "Rose", "Cyan", "Gris", "Noir"];
const jetons = [];
for (let i = 0; i < NB; i++) {
  const r = R.rejoindre(S, PRENOMS[i]);
  if (r && r.refus) { jetons.push({ refus: r.refus }); } else { jetons.push(r); }
}
const refusEnTrop = R.rejoindre(S, PRENOMS[NB] || "Extra");

const journal = [{ t: 0, s: JSON.parse(JSON.stringify(S)) }];
const noter = () => { journal.push({ t: Date.now(), s: JSON.parse(JSON.stringify(S)) }); if (journal.length > 400) journal.shift(); };
function lirePerime() {
  const lim = Date.now() - RETARD;
  let out = journal[0].s;
  for (const e of journal) if (e.t <= lim) out = e.s;
  return out;
}
noter();
let requetes = 0;
async function servir(route) {
  requetes++;
  let d = {}; try { d = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
  await dodo(LATENCE / 2);
  let corps = { error: "non gere" };
  if (d.op === "rejoindre") {
    const o = R.rejoindre(S, d.prenom, d.jeton);
    corps = o && o.refus ? { refus: o.refus } : { jeton: o.jeton, role: o.role, moi: o.id || null, etat: R.vue(S) };
  } else if (d.op === "etat") {
    const vu = R.vue(lirePerime());
    const connue = Math.max(0, +d.version || 0);
    corps = (connue && vu.version < connue) ? { inchange: true, version: connue } : { etat: vu };
  } else if (d.op === "agir") {
    await dodo(LATENCE_ECRIT);
    const o = R.appliquer(S, d.jeton, d.intention || {});
    noter();
    corps = o && o.refus ? { refus: o.refus, etat: R.vue(S) } : { etat: R.vue(S), resultat: o && o.resultat };
  }
  await dodo(LATENCE / 2);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(corps) });
}

/* --- Navigateurs --------------------------------------------------------- */
const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const erreursJS = [];
const pages = [];
async function ouvrir(nom, jeton, role) {
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 720 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erreursJS.push("[" + nom + "] " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) erreursJS.push("[" + nom + "] " + m.text()); });
  await p.addInitScript(([j, r]) => {
    localStorage.setItem("coach-multi-off", "1");
    localStorage.setItem("fresque:tuto:animateur", "1");
    localStorage.setItem("fresque:tuto:participant", "1");
    localStorage.setItem(r === "animateur" ? "fresque:anim:CHARGE" : "fresque:CHARGE", j);
    // Compteurs : messages relayes recus, et images longues. Les deux disent
    // ce que coute la salle : le premier au reseau, le second a la machine.
    window.__m = { recus: 0, envoyes: 0, octets: 0, longues: 0, images: 0, coupures: 0 };
    const Vrai = window.WebSocket;
    window.WebSocket = function (u, p) {
      const s = p ? new Vrai(u, p) : new Vrai(u);
      const env = s.send.bind(s);
      s.send = function (d) { window.__m.envoyes++; return env(d); };
      s.addEventListener("message", (e) => { window.__m.recus++; window.__m.octets += (e.data && e.data.length) || 0; });
      s.addEventListener("close", () => { window.__m.coupures++; });
      return s;
    };
    window.WebSocket.prototype = Vrai.prototype;
    let t0 = 0;
    const boucle = (t) => { if (t0) { const d = t - t0; window.__m.images++; if (d > 50) window.__m.longues++; } t0 = t; requestAnimationFrame(boucle); };
    requestAnimationFrame(boucle);
  }, [jeton, role]);
  await p.route("**/session.js", async (route) => {
    const rr = await route.fetch();
    const txt = (await rr.text()).replace("wss://curseurs.pauseia.fr", "ws://127.0.0.1:" + PORT_RELAIS);
    await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: txt });
  });
  await p.route("**/.netlify/functions/fresque", servir);
  await p.goto("http://127.0.0.1:" + PORT_SITE + "/en-ligne/session/?s=CHARGE", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#app:not([hidden])", { timeout: 40000 });
  pages.push({ nom, page: p, ctx });
  return p;
}

console.log("Ouverture de " + (NB + 1) + " navigateurs (1 animateur, " + NB + " participants)…");
const A = await ouvrir("animateur", "jAnim", "animateur");
for (let i = 0; i < NB; i++) {
  if (jetons[i].refus) continue;
  await ouvrir(PRENOMS[i], jetons[i].jeton, "participant");
}
await dodo(1500);

/* ========================================================================== */
console.log("\n--- La salle ---");
t("les " + NB + " participants ont pu entrer",
  jetons.every((j) => !j.refus), jetons.filter((j) => j.refus).length + " refus");
t("le " + (NB + 1) + "e est refuse proprement, avec un message lisible",
  !!(refusEnTrop && refusEnTrop.refus && /complète|complete/i.test(refusEnTrop.refus.message || "")),
  refusEnTrop && refusEnTrop.refus ? refusEnTrop.refus.message : "aucun refus !");
t("tout le monde voit le meme nombre de personnes",
  (await Promise.all(pages.map((p) => p.page.evaluate(() => +document.getElementById("nb-part").textContent))))
    .every((n) => n === NB + 1),
  "attendu " + (NB + 1));

/* ========================================================================== */
console.log("\n--- Tempete : tout le monde bouge en meme temps ---");
// L'animateur remplit la reserve, puis chacun pose et deplace, pendant que les
// neuf curseurs circulent. C'est le pire moment d'un atelier reel : le debut du
// lot 3, quand quinze cartes arrivent d'un coup.
await A.evaluate(() => {
  const b = [...document.querySelectorAll("#pool button, .toolbar button, .topbar button")]
    .find((x) => /remplir|fill/i.test(x.textContent || ""));
  if (b) b.click();
});
await dodo(1200);

for (const { page } of pages) {
  await page.evaluate((ms) => {
    const s = document.getElementById("scene").getBoundingClientRect();
    let a = Math.random() * 6.28;
    const fin = performance.now() + ms;
    window.__stop = false;
    (function pas() {
      if (performance.now() > fin || window.__stop) return;
      a += 0.12;
      const x = s.x + s.width / 2 + Math.cos(a) * (s.width * 0.33);
      const y = s.y + s.height / 2 + Math.sin(a * 1.3) * (s.height * 0.33);
      document.getElementById("scene").dispatchEvent(new PointerEvent("pointermove",
        { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      setTimeout(pas, 30);
    })();
  }, SECONDES * 1000);
}

// Pendant la tempete, chacun pose une carte a son tour et on mesure le temps
// qu'elle met a apparaitre chez TOUS les autres.
const delais = [];
const debut = Date.now();
let tour = 0;
while (Date.now() - debut < SECONDES * 1000) {
  const acteur = pages[tour % pages.length];
  tour++;
  const n = await acteur.page.evaluate(() => {
    const b = [...document.querySelectorAll("#pool .pool-carte")].find((c) => !c.classList.contains("occupee"));
    if (!b) return 0;
    const num = +b.dataset.n;
    const bt = b.querySelector('[data-a="poser"]');
    if (bt) bt.click();
    return num;
  });
  if (!n) { await dodo(400); continue; }
  const t0 = Date.now();
  const autres = pages.filter((p) => p !== acteur);
  const vus = await Promise.all(autres.map((p) =>
    p.page.waitForFunction((num) => !!document.querySelector(".c-carte[data-n='" + num + "']"), n, { timeout: 6000 })
      .then(() => Date.now() - t0).catch(() => -1)));
  const pire = Math.max(...vus);
  if (vus.every((v) => v >= 0)) delais.push(pire);
  else t("carte " + n + " vue par tout le monde", false, vus.filter((v) => v < 0).length + " ecran(s) ne l'ont jamais vue");
  await dodo(250);
}
for (const { page } of pages) await page.evaluate(() => { window.__stop = true; });
await dodo(300);

t("une carte posee arrive chez les huit autres en moins de 1,5 s (mediane)",
  delais.length > 3 && centile(delais, 0.5) < 1500,
  delais.length + " poses, mediane " + centile(delais, 0.5) + " ms, 90e centile " + centile(delais, 0.9) + " ms");

const mesures = await Promise.all(pages.map(async (p) => ({ nom: p.nom, ...(await p.page.evaluate(() => window.__m)) })));
const envSec = mesures.map((m) => Math.round(m.envoyes / SECONDES));
const recSec = mesures.map((m) => Math.round(m.recus / SECONDES));
const pireLongues = Math.max(...mesures.map((m) => m.images ? m.longues / m.images : 0));
const octets = Math.round(mesures.reduce((s, m) => s + m.octets, 0) / 1024);
const MSG_PAR_SEC = 150;   // garde-fou du relais, par connexion, en EMISSION
t("aucune connexion au relais n'a saute sous la charge",
  mesures.every((m) => m.coupures === 0), mesures.filter((m) => m.coupures).map((m) => m.nom).join(", "));
/* Le garde-fou du relais compte ce qu'une connexion ENVOIE. Le confondre avec ce
   qu'elle recoit donnerait une marge rassurante et fausse : a neuf, chacun
   envoie une fois et recoit huit fois. */
t("personne n'approche le garde-fou d'emission du relais (" + MSG_PAR_SEC + " msg/s)",
  Math.max(...envSec) < MSG_PAR_SEC * 0.6,
  "pointe " + Math.max(...envSec) + " msg/s emis, soit " + Math.round(100 * Math.max(...envSec) / MSG_PAR_SEC) + " % du plafond");
/* En RECEPTION, la charge croit avec le carre du nombre de personnes : chacun
   recoit le flux de tous les autres. C'est la limite d'architecture de ce
   relais, qui repete sans regrouper. A neuf, elle est confortable ; le seuil
   ci-dessous dit a partir de quand il faudrait grouper les curseurs par image
   plutot que les repeter un par un. */
t("le flux recu par personne reste raisonnable (moins de 250 msg/s)",
  Math.max(...recSec) < 250,
  "pointe " + Math.max(...recSec) + " msg/s recus, soit " + Math.round(Math.max(...recSec) / Math.max(1, NB)) + " par personne presente");
t("l'affichage reste fluide (moins de 12 % d'images longues)",
  pireLongues < 0.12, "pire ecran : " + Math.round(pireLongues * 100) + " % d'images > 50 ms");
console.log("  (volume relaye pendant la tempete : " + octets + " Ko, tous ecrans confondus, soit "
  + Math.round(octets / SECONDES / (NB + 1) * 10) / 10 + " Ko/s par personne)");

/* ========================================================================== */
console.log("\n--- Retour au calme : tout le monde voit-il la meme chose ? ---");
await dodo(RETARD + 4000);
const vues = await Promise.all(pages.map((p) => p.page.evaluate(() => {
  const c = [...document.querySelectorAll(".c-carte")]
    .map((e) => e.dataset.n + ":" + Math.round(+e._x || 0) + "," + Math.round(+e._y || 0)).sort();
  return c.join("|");
})));
const attendu = R.vue(S).tableau.cartes.map((c) => c.n + ":" + c.x + "," + c.y).sort().join("|");
const identiques = vues.every((v) => v === vues[0]);
t("les neuf tableaux sont identiques apres la tempete", identiques,
  identiques ? "" : "jusqu'a " + new Set(vues).size + " versions differentes a l'ecran");
t("et ils sont conformes a ce que le serveur a enregistre", vues[0] === attendu,
  vues[0] === attendu ? R.vue(S).tableau.cartes.length + " cartes" : "ecran ≠ serveur");
t("aucune erreur JavaScript sur les neuf ecrans", erreursJS.length === 0, erreursJS.slice(0, 3).join(" | "));
console.log("  (" + requetes + " requetes au service de sessions pendant toute l'epreuve)");

console.log("\n" + bilan.join("\n"));
console.log("\n" + (ko ? "❌" : "✅") + " Charge a " + (NB + 1) + " : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
