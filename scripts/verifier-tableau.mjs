/* VERIFICATION DU TABLEAU EN LIGNE, DANS UN VRAI NAVIGATEUR.
   Lance deux navigateurs sur la page de session, avec :
     - un service de session simule EN NODE, volontairement LENT et
       EVENTUELLEMENT COHERENT, comme la plateforme reelle ;
     - le VRAI relais (infra/curseurs/server.js), pas une imitation.
   Puis il verifie ce qui casse en silence : le direct, le glissement relaye,
   la regularite des curseurs, le zoom semantique, les fleches, les animations
   et le respect du mouvement reduit.

   Pourquoi ce fichier existe : chacune des pannes qu'il surveille est passee en
   production sans faire tomber quoi que ce soit. Une action perdue de temps en
   temps, un curseur qui donne mal au coeur, des liens invisibles au dezoom : ca
   ne leve aucune erreur, ca ne casse aucun test unitaire, et ca ne se voit qu'en
   atelier, devant des participants.

   Usage : node scripts/verifier-tableau.mjs
   Dependances (dev, non versionnees) : playwright, ws.
*/
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const R = require("../serveur/src/regles.js");

// `playwright` en CI (il gere le registre des navigateurs qu'il a installes),
// `playwright-core` en local (ou l'on pointe un Chromium deja present).
const { chromium } = await (async () => {
  try { return await import("playwright"); } catch (e) { return await import("playwright-core"); }
})();

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT_SITE = Number(process.env.PORT_SITE || 8107);
const PORT_RELAIS = Number(process.env.PORT_RELAIS || 8108);
const LATENCE = Number(process.env.LATENCE || 250);   // aller-retour du service
const RETARD = Number(process.env.RETARD || 2000);    // coherence eventuelle
const CHROME = process.env.PW_CHROMIUM || undefined;

let ok = 0, ko = 0;
const bilan = [];
function t(nom, cond, detail) {
  if (cond) { ok++; bilan.push("  ✅ " + nom); }
  else { ko++; bilan.push("  ❌ " + nom + (detail ? "  → " + detail : "")); }
}
/* Un harnais ne doit JAMAIS s'arreter sur une exception : une etape qui echoue
   masquerait toutes les suivantes, et on ne saurait pas ce qui va encore. */
async function bloc(nom, fn) {
  try { await fn(); }
  catch (e) { ko++; bilan.push("  ❌ " + nom + " a leve une erreur  → " + (e && e.message || e)); }
}
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- Petit serveur de fichiers (pas de dependance) ------------------------ */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon" };
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
await new Promise((r) => site.listen(PORT_SITE, r));

/* --- Le vrai relais -------------------------------------------------------- */
process.env.PORT = String(PORT_RELAIS);
await import("../infra/curseurs/server.js");

/* --- Service de session simule, lent et eventuellement coherent ------------ */
const c0 = R.creer("Anim", "VERIF1"); const S = c0.session;
S.jetons["jAnim"] = { role: "animateur", id: c0.idAnim };
const jP = R.rejoindre(S, "Bleu");
// Une fresque BIEN REMPLIE : c'est la seule situation ou les questions de zoom
// se posent vraiment, et c'est celle des ateliers reels.
{
  let x = 300, y = 300;
  for (let n = 1; n <= 24; n++) {
    R.appliquer(S, "jAnim", { op: "poolAjouter", n });
    R.appliquer(S, "jAnim", { op: "poserCarte", n, pos: { x, y } });
    x += 300; if (x > 2400) { x = 300; y += 280; }
  }
  for (let n = 25; n <= 30; n++) R.appliquer(S, "jAnim", { op: "poolAjouter", n });
}

const journal = [{ t: 0, s: JSON.parse(JSON.stringify(S)) }];
const noter = () => journal.push({ t: Date.now(), s: JSON.parse(JSON.stringify(S)) });
function lirePerime() {
  const lim = Date.now() - RETARD;
  let out = journal[0].s;
  for (const e of journal) if (e.t <= lim) out = e.s;
  return out;
}
noter();
async function servir(route) {
  let d = {}; try { d = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
  await dodo(LATENCE / 2);
  let corps = { error: "non gere" };
  if (d.op === "rejoindre") {
    const o = R.rejoindre(S, d.prenom, d.jeton);
    corps = o && o.refus ? { refus: o.refus } : { jeton: o.jeton, role: o.role, moi: o.id || null, etat: R.vue(S) };
  } else if (d.op === "etat") {
    corps = { etat: R.vue(lirePerime()) };
  } else if (d.op === "agir") {
    const o = R.appliquer(S, d.jeton, d.intention || {});
    noter();
    corps = o && o.refus ? { refus: o.refus, etat: R.vue(S) } : { etat: R.vue(S), resultat: o && o.resultat };
  }
  await dodo(LATENCE / 2);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(corps) });
}

/* --- Navigateurs ----------------------------------------------------------- */
const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const erreursJS = [];
async function ouvrir(nom, jeton, role, opts) {
  opts = opts || {};
  const ctx = await nav.newContext({ viewport: { width: 1360, height: 860 },
    reducedMotion: opts.reduit ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erreursJS.push("[" + nom + "] " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) erreursJS.push("[" + nom + "] console: " + m.text()); });
  await p.addInitScript(([j, r]) => {
    localStorage.setItem("coach-multi-off", "1");
    localStorage.setItem("fresque:tuto:animateur", "1");
    localStorage.setItem("fresque:tuto:participant", "1");
    localStorage.setItem(r === "animateur" ? "fresque:anim:VERIF1" : "fresque:VERIF1", j);
  }, [jeton, role]);
  await p.route("**/session.js", async (route) => {
    const rr = await route.fetch();
    const txt = (await rr.text()).replace("wss://curseurs.pauseia.fr", "ws://127.0.0.1:" + PORT_RELAIS);
    await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: txt });
  });
  await p.route("**/.netlify/functions/fresque", servir);
  await p.goto("http://127.0.0.1:" + PORT_SITE + "/en-ligne/session/?s=VERIF1", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll(".c-carte").length > 0, null, { timeout: 30000 });
  await p.evaluate(() => { const b = document.getElementById("z-tout"); if (b) b.click(); });
  await dodo(500);
  return p;
}

const A = await ouvrir("animateur", "jAnim", "animateur");
const B = await ouvrir("participant", jP.jeton, "participant");
await dodo(RETARD + 700);

/* ========================================================================== */
console.log("\n--- Temps reel ---");
await bloc("Temps reel", async () => {

/* 1. Une carte posee doit arriver chez l'autre TOUT DE SUITE, malgre un magasin
      en retard de plusieurs secondes. C'est la couche provisoire qui le permet. */
await B.evaluate(() => {
  window.__p = { t0: performance.now(), vu: -1 };
  window.__i = setInterval(() => {
    if (window.__p.vu < 0 && document.querySelector(".c-carte[data-n='25']")) window.__p.vu = performance.now() - window.__p.t0;
  }, 5);
});
await A.evaluate(() => {
  const b = [...document.querySelectorAll("#pool button")].find((x) => /poser|place/i.test(x.textContent || ""));
  if (b) b.click();
});
await dodo(1800);
const vuPose = await B.evaluate(() => { clearInterval(window.__i); return window.__p.vu; });
t("une carte posee arrive chez l'autre en moins de 800 ms malgre un magasin en retard de " + RETARD + " ms",
  vuPose >= 0 && vuPose < 800, "mesure : " + Math.round(vuPose) + " ms");

/* 2. Le geste lui-meme (carte tiree) doit se voir PENDANT le deplacement. */
await B.evaluate(() => {
  const el = document.querySelector('.c-carte[data-n="1"]');
  window.__d = { t0: performance.now(), vu: -1, dep: el.style.left };
  window.__i2 = setInterval(() => {
    if (window.__d.vu < 0 && el.style.left !== window.__d.dep) window.__d.vu = performance.now() - window.__d.t0;
  }, 5);
});
const bo = await A.evaluate(() => {
  const r = document.querySelector('.c-carte[data-n="1"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await A.mouse.move(bo.x, bo.y);
await A.mouse.down();
for (let i = 1; i <= 16; i++) { await A.mouse.move(bo.x + i * 11, bo.y + i * 5); await dodo(16); }
const vuGeste = await B.evaluate(() => window.__d.vu);
await A.mouse.up();
await dodo(900);
t("le deplacement d'une carte se voit chez l'autre PENDANT le geste",
  vuGeste >= 0 && vuGeste < 600, vuGeste < 0 ? "jamais vu (relais a jour ?)" : "mesure : " + Math.round(vuGeste) + " ms");
const memeFin = await B.evaluate(() => document.querySelector('.c-carte[data-n="1"]').style.left)
  === await A.evaluate(() => document.querySelector('.c-carte[data-n="1"]').style.left);
t("les deux tableaux finissent a la meme position", memeFin);

/* ========================================================================== */
});
console.log("\n--- Curseurs (confort visuel) ---");
await bloc("Curseurs", async () => {

/* 3. La vitesse d'un curseur distant doit etre REGULIERE. Une vitesse en dents
      de scie (le curseur ralentit puis repart, dix fois par seconde) est ce qui
      donne la sensation de malaise. */
await B.evaluate(() => {
  window.__s = [];
  const f = (ts) => { const el = document.querySelector(".curseur-live");
    if (el) { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); window.__s.push({ t: ts, x: m.m41, y: m.m42 }); }
    window.__r = requestAnimationFrame(f); };
  window.__r = requestAnimationFrame(f);
});
const sc = await A.evaluate(() => { const r = document.getElementById("scene").getBoundingClientRect(); return { x: r.x + 140, y: r.y + r.height / 2 }; });
await A.mouse.move(sc.x, sc.y);
await dodo(400);
for (let i = 1; i <= 100; i++) { await A.mouse.move(sc.x + i * 7, sc.y); await dodo(16); }
await dodo(400);
const cur = await B.evaluate(() => {
  cancelAnimationFrame(window.__r);
  const s = window.__s, v = [];
  for (let i = 1; i < s.length; i++) { const dt = s[i].t - s[i - 1].t; if (dt > 0) v.push(Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y) / dt); }
  const idx = v.map((x, i) => [x, i]).filter(([x]) => x > 0.02).map(([, i]) => i);
  if (idx.length < 25) return null;
  const a = v.slice(idx[Math.floor(idx.length * 0.2)], idx[Math.floor(idx.length * 0.9)]);
  const moy = a.reduce((x, y) => x + y, 0) / a.length;
  const ec = Math.sqrt(a.reduce((x, y) => x + (y - moy) ** 2, 0) / a.length);
  let cycles = 0, dedans = false;
  for (const x of a) { if (x <= moy * 0.15) dedans = true; else if (dedans) { cycles++; dedans = false; } }
  return { irregularite: (ec / moy) * 100, cycles: cycles, images: a.length };
});
t("le curseur d'une autre personne se deplace a vitesse reguliere",
  cur && cur.irregularite < 45, cur ? "irregularite " + cur.irregularite.toFixed(0) + " %" : "pas assez d'echantillons");
t("aucun cycle arret / reprise (la cause du malaise)",
  cur && cur.cycles === 0, cur ? cur.cycles + " cycles sur " + cur.images + " images" : "non mesure");

/* ========================================================================== */
});
console.log("\n--- Zoom ---");
await bloc("Zoom", async () => {

let semantique = null;
const zoomDe = (p) => p.evaluate(() => parseFloat(document.getElementById("z-niv").textContent) / 100);
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(600);
const zAjuste = await zoomDe(A);
const scA = await A.evaluate(() => { const r = document.getElementById("scene").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await A.mouse.move(scA.x, scA.y);
for (let i = 0; i < 70; i++) { await A.mouse.wheel(0, 120); await dodo(12); }
await dodo(500);
const zBas = await zoomDe(A);
// Le plancher est LIE AU CONTENU : on ne descend jamais beaucoup en dessous du
// cadrage qui montre tout. Sur un grand tableau, la borne absolue (20 %) joue
// deja ce role ; c'est sur un tableau PEU REMPLI que l'ancien comportement
// laissait descendre jusqu'a 20 %, soit un timbre-poste au milieu du vide.
t("sur un grand tableau, le dezoom reste raisonnable",
  zBas >= Math.min(0.45, zAjuste * 0.62) - 0.02,
  "cadrage complet " + Math.round(zAjuste * 100) + " %, plancher atteint " + Math.round(zBas * 100) + " %");

semantique = await A.evaluate(() => {
  const m = document.getElementById("monde");
  const st = getComputedStyle(m);
  const num = document.querySelector(".c-carte .num");
  const tit = document.querySelector(".c-carte .tit");
  return {
    loin: m.classList.contains("zoom-loin"),
    moyen: m.classList.contains("zoom-moyen"),
    fw: parseFloat(st.getPropertyValue("--fw")) || 0,
    numEchelle: getComputedStyle(num).transform,
    titreCache: getComputedStyle(tit).visibility === "hidden",
    hauteurCarte: document.querySelector(".c-carte").offsetHeight
  };
});
t("a bas zoom, la lecture passe en mode « de loin »", semantique.loin && semantique.moyen);
t("les traits de fleche restent epais a l'ecran quand on dezoome",
  semantique.fw > 4, "--fw = " + semantique.fw);
t("le numero de carte est contre-mis a l'echelle (lisible de loin)",
  /matrix/.test(semantique.numEchelle) && semantique.numEchelle !== "none");
t("le titre, illisible a cette distance, est retire de la vue", semantique.titreCache);

/* Tableau PEU REMPLI : c'est la que le plancher se voit. On retire la plupart
   des cartes, on laisse le client se mettre a jour, puis on redemande le
   dezoom maximal. */
for (let n = 3; n <= 30; n++) R.appliquer(S, "jAnim", { op: "retirerCarte", n: n, dest: "jeu" });
noter();
await A.waitForFunction(() => document.querySelectorAll(".c-carte").length <= 2, null, { timeout: 15000 }).catch(() => {});
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(700);
const zAjuste2 = await zoomDe(A);
await A.mouse.move(scA.x, scA.y);
for (let i = 0; i < 70; i++) { await A.mouse.wheel(0, 120); await dodo(10); }
await dodo(400);
const zBas2 = await zoomDe(A);
t("sur un tableau peu rempli, le dezoom s'arrete avant le timbre-poste",
  zBas2 > 0.3, "cadrage complet " + Math.round(zAjuste2 * 100) + " %, plancher atteint " + Math.round(zBas2 * 100) + " %");

/* La BOITE de la carte ne doit JAMAIS changer de taille avec le zoom : l'image
   exportee est construite a partir de la hauteur reelle des elements. */
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(600);
const hPres = await A.evaluate(() => document.querySelector(".c-carte").offsetHeight);
t("la taille de la boite des cartes ne change pas avec le zoom (sinon l'image exportee se casse)",
  hPres === semantique.hauteurCarte, "de loin " + semantique.hauteurCarte + " px, de pres " + hPres + " px");

/* ========================================================================== */
});
console.log("\n--- Fleches ---");
await bloc("Fleches", async () => {
await A.evaluate(() => document.querySelector('[data-outil="fleche"]').click());
// Deux cartes dont le centre est reellement atteignable a la souris : sinon le
// clic tombe sur la reserve ou une barre, et le test echoue pour rien.
const degagees = await A.evaluate(() => {
  const gene = ["#pool", "#deck", "#panneau", ".toolbar", ".topbar"].map((s) => document.querySelector(s)).filter(Boolean);
  const libre = (r) => {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (document.elementFromPoint(cx, cy) === null) return false;
    if (!document.querySelector(".c-carte").closest("#monde")) return false;
    return !gene.some((g) => { const b = g.getBoundingClientRect();
      return g.offsetParent !== null && cx > b.x - 10 && cx < b.x + b.width + 10 && cy > b.y - 10 && cy < b.y + b.height + 10; });
  };
  return [...document.querySelectorAll(".c-carte")]
    .filter((e) => libre(e.getBoundingClientRect()))
    .slice(0, 2).map((e) => +e.dataset.n);
});
const centre = (n) => A.evaluate((n) => { const r = document.querySelector(".c-carte[data-n='" + n + "']").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, n);
t("deux cartes atteignables a la souris pour tracer une fleche", degagees.length === 2, "trouvees : " + degagees.join(", "));
let p1 = await centre(degagees[0]); const p2 = await centre(degagees[1]);
await A.mouse.click(p1.x, p1.y);
// On attend que la premiere carte soit bien prise comme depart, plutot que de
// parier sur un delai : un harnais qui depend de la vitesse de la machine finit
// par echouer au hasard, et on cesse de le croire.
await A.waitForFunction(() => !!document.querySelector(".c-carte.depart"), null, { timeout: 5000 }).catch(() => {});
await A.mouse.click(p2.x, p2.y);
await A.waitForFunction(() => document.querySelectorAll("#fleches path.trait").length >= 1, null, { timeout: 8000 }).catch(() => {});
await dodo(300);
t("une fleche se cree entre deux cartes", (await A.evaluate(() => document.querySelectorAll("#fleches path.trait").length)) >= 1);
const pt = await A.evaluate(() => {
  const h = document.querySelector("#fleches path.hit"); if (!h) return null;
  const q = h.getPointAtLength(h.getTotalLength() / 2), m = h.getScreenCTM();
  if (!m) return null; const P = new DOMPoint(q.x, q.y).matrixTransform(m); return { x: P.x, y: P.y };
});
if (pt) { await A.mouse.click(pt.x, pt.y); await dodo(400); }
t("on peut la selectionner en cliquant dessus (un seul ecouteur, par delegation)",
  await A.evaluate(() => !!document.querySelector("#fleches path.trait.sel")));
const champ = await A.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => x.maxLength === 40); if (i) { i.focus(); return true; } return false; });
if (champ) {
  await A.keyboard.type("provoque");
  await A.waitForFunction(() => { const l = document.querySelector(".fleche-lib"); return !!l && l.textContent === "provoque"; }, null, { timeout: 8000 }).catch(() => {});
}
t("on peut lui donner un libelle", (await A.evaluate(() => { const l = document.querySelector(".fleche-lib"); return l ? l.textContent : ""; })) === "provoque");
// On sort de l'edition avant de deplacer la carte, sinon le clic de depart du
// glissement sert d'abord a quitter le champ.
await A.keyboard.press("Escape"); await dodo(300);
await A.waitForFunction(() => document.querySelectorAll("#fleches path.trait").length >= 1, null, { timeout: 6000 }).catch(() => {});
const dAvant = await A.evaluate(() => { const e = document.querySelector("#fleches path.trait"); return e ? e.getAttribute("d") : null; });
p1 = await centre(degagees[0]);
await A.mouse.move(p1.x, p1.y); await A.mouse.down();
for (let i = 1; i <= 8; i++) { await A.mouse.move(p1.x - i * 10, p1.y + i * 8); await dodo(16); }
await A.mouse.up();
await A.waitForFunction((d) => { const e = document.querySelector("#fleches path.trait"); return !!e && e.getAttribute("d") !== d; }, dAvant, { timeout: 6000 }).catch(() => {});
const dApres = await A.evaluate(() => { const e = document.querySelector("#fleches path.trait"); return e ? e.getAttribute("d") : null; });
t("elle suit la carte qu'on deplace", !!dAvant && dApres !== dAvant, dAvant ? "" : "aucune fleche a suivre");

/* ========================================================================== */
});
console.log("\n--- Animations et mouvement reduit ---");
let C = null;
await bloc("Animations", async () => {
const animsDe = async (p) => {
  await p.evaluate(() => {
    window.__a = [];
    const o = new MutationObserver(() => {
      const el = document.querySelector(".c-carte.pose-anim");
      if (el && !window.__a.length) window.__a = el.getAnimations().map((x) => x.animationName);
    });
    o.observe(document.getElementById("monde"), { childList: true, subtree: true, attributes: true });
  });
  await p.evaluate(() => { const b = [...document.querySelectorAll("#pool button")].find((x) => /poser|place/i.test(x.textContent || "")); if (b) b.click(); });
  await dodo(200);
  return p.evaluate(() => window.__a);
};
t("une carte qui arrive s'annonce par une animation", (await animsDe(A)).length > 0);
await dodo(1200);

C = await ouvrir("mouvement reduit", "jAnim", "animateur", { reduit: true });
await dodo(600);
t("avec « mouvement reduit », plus aucune animation", (await animsDe(C)).length === 0);
await C.evaluate(() => { window.__z = new Set(); window.__zi = setInterval(() => window.__z.add(getComputedStyle(document.getElementById("monde")).transform), 16); });
await C.evaluate(() => { const b = document.getElementById("z-moins"); if (!b.disabled) b.click(); });
await dodo(330);
const etapes = await C.evaluate(() => { clearInterval(window.__zi); return window.__z.size; });
t("avec « mouvement reduit », le recadrage est instantane", etapes <= 2, etapes + " etapes");

});
/* ========================================================================== */
t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 4).join(" | "));

console.log("\n" + bilan.join("\n"));
console.log("\n" + (ko ? "❌" : "✅") + " Tableau en ligne : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
