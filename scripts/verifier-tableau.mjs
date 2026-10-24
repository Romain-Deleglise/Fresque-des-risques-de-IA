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
/* Un serveur de fichiers qui ne trouve pas le site ne tombe pas : il repond 404
   a tout, la page se charge vide, et l'on cherche la panne dans le navigateur.
   C'est exactement ce qui est arrive avec un chemin de machine laisse en dur.
   On verifie donc, tout de suite, qu'on sait ou est le site. */
if (!fs.existsSync(path.join(RACINE, "site", "index.html"))) {
  console.error("Site introuvable sous " + RACINE + "/site : ce banc doit etre lance depuis le depot.");
  process.exit(2);
}

const PORT_SITE = Number(process.env.PORT_SITE || 8107);
const PORT_RELAIS = Number(process.env.PORT_RELAIS || 8108);
const LATENCE = Number(process.env.LATENCE || 250);   // aller-retour du service
// UNE ECRITURE COUTE BIEN PLUS CHER QU'UNE LECTURE, et c'est ce qui rend les
// pannes visibles : c'est pendant ce temps-la que le tableau des autres n'est
// tenu que par la couche provisoire. Avec une ecriture aussi rapide qu'une
// lecture, le harnais passait a cote de trois bugs bien reels.
const LATENCE_ECRIT = Number(process.env.LATENCE_ECRIT || 900);
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
/* Le registre des battements, et son report sur une copie : exactement ce que
   fait le service reel avant de projeter la vue. */
const presence = {};
function avecPresence(s) {
  const marquer = (x) => {
    const t = presence[x.id] || 0;
    if (t > (x.vuLe || 0)) { x.vuLe = t; x.connecte = true; }
  };
  marquer(s.animateur);
  s.participants.forEach(marquer);
  return s;
}
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
    /* LA PRESENCE VIT A COTE, COMME EN PRODUCTION. Le vrai service tient les
       battements dans leur propre magasin et les reporte sur la copie juste
       avant de projeter la vue (voir presenceToucher dans
       netlify/functions/fresque.js) : ecrire le document de session pour un
       simple horodatage faisait reculer le tableau. Sans ce report ici, tout
       le monde paraissait parti au bout de quinze secondes, et le harnais
       accusait a tort le code qu'il teste. */
    const info = S.jetons[d.jeton];
    if (info) presence[info.role === "animateur" ? S.animateur.id : info.id] = Date.now();
    // Le faux service doit respecter le MEME contrat que le vrai : ne jamais
    // servir un etat plus ancien que celui que le client dit deja avoir. Sans
    // cela on fabrique ici une situation qui n'existe pas en production (un
    // serveur qui fait reculer ses clients en boucle), et le harnais echoue au
    // hasard sur des mesures parfaitement justes.
    const vu = R.vue(avecPresence(lirePerime()));
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

/* --- Navigateurs ----------------------------------------------------------- */
const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const erreursJS = [];
async function ouvrir(nom, jeton, role, opts) {
  opts = opts || {};
  const ctx = await nav.newContext({ viewport: { width: 1360, height: 860 },
    reducedMotion: opts.reduit ? "reduce" : "no-preference",
    // L'export (PNG et SVG) passe par un telechargement : sans cela
    // l'evenement n'arrive jamais et le banc attend dans le vide.
    acceptDownloads: true });
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

/* ========================================================================== */
console.log("\n--- Aller-retours et frappe ---");
await bloc("Aller-retours et frappe", async () => {

/* 4. LA CARTE NE DOIT PAS REPARTIR DANS LA RESERVE. Constate en atelier : une
      carte posee apparaissait chez les autres, disparaissait une fraction de
      seconde, puis revenait a la bonne place. Cause : le rendu provisoire
      montrait deja la carte, et le sondage suivant rapportait un etat du magasin
      portant le MEME numero de version (donc sans la carte), qui etait applique
      par-dessus. Un etat est une photo complete : tout le tableau reculait d'un
      cran, pas seulement la carte posee. */
await B.evaluate(() => {
  window.__ar = { vu: false, present: false, allersRetours: 0 };
  window.__iar = setInterval(() => {
    const la = !!document.querySelector(".c-carte[data-n='26']");
    if (la) { window.__ar.vu = true; window.__ar.present = true; }
    else if (window.__ar.present) { window.__ar.present = false; window.__ar.allersRetours++;
      }
  }, 5);
});
await A.evaluate(() => {
  const b = [...document.querySelectorAll("#pool button")].find((x) => /poser|place/i.test(x.textContent || ""));
  if (b) b.click();
});
await dodo(RETARD + 1500);
const ar = await B.evaluate(() => { clearInterval(window.__iar); return window.__ar; });
t("une carte posee ne repart jamais dans la reserve chez les autres",
  ar.vu && ar.allersRetours === 0, ar.vu ? ar.allersRetours + " aller(s)-retour(s)" : "carte jamais vue");

/* 5. PAS DE RETOUR EN ARRIERE A LA FIN D'UN DEPLACEMENT. Deux causes, cumulees :
      la fin du geste partait AVANT l'etat qui porte la nouvelle position (les
      autres reposaient donc la carte a son ancienne place le temps d'un
      battement), et le tampon de lecture differee etait jete au lieu d'etre joue
      jusqu'au bout. */
await B.evaluate(() => {
  const el = document.querySelector('.c-carte[data-n="2"]');
  window.__rt = { pts: [] };
  window.__irt = setInterval(() => { window.__rt.pts.push(+el._x || parseFloat(el.style.left) || 0); }, 8);
});
const b2 = await A.evaluate(() => {
  const r = document.querySelector('.c-carte[data-n="2"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await A.mouse.move(b2.x, b2.y);
await A.mouse.down();
for (let i = 1; i <= 26; i++) { await A.mouse.move(b2.x + i * 6, b2.y); await dodo(24); }
await A.mouse.up();
await dodo(2600);
const rt = await B.evaluate(() => { clearInterval(window.__irt); return window.__rt.pts; });
let sommet = -1e9, recul = 0;
const sauts = [];
for (let i = 0; i < rt.length; i++) {
  if (rt[i] > sommet) sommet = rt[i]; else recul = Math.max(recul, sommet - rt[i]);
  if (i) sauts.push(Math.abs(rt[i] - rt[i - 1]));
}
const enMvt = sauts.filter((v) => v > 0.5).sort((a, b) => a - b);
const median = enMvt.length ? enMvt[Math.floor(enMvt.length / 2)] : 0;
const saut = sauts.length ? Math.max.apply(null, sauts) : 0;
t("la carte ne revient jamais en arriere a la fin du deplacement",
  rt.length > 10 && recul < 14, "recul maximal observe : " + Math.round(recul) + " px");
/* Le tampon de lecture differee contient une centaine de millisecondes de
   trajet. Le jeter a la fin du geste faisait bondir la carte d'autant, d'un
   seul coup : le saut le plus visible du jeu, et il ne se mesure pas comme un
   retour en arriere puisqu'il va dans le bon sens. */
t("et elle ne bondit pas non plus quand le geste se termine",
  rt.length > 10 && saut < Math.max(14, median * 4),
  "plus grand saut " + Math.round(saut) + " px, pas courant " + Math.round(median) + " px");

/* 6. LA FRAPPE D'UNE NOTE DOIT SE VOIR EN DIRECT, DES LA PREMIERE LETTRE. Une
      note neuve n'avait pas encore d'identifiant serveur : il n'y avait rien a
      relayer tant que sa creation n'etait pas revenue, soit un aller-retour
      complet. Et une fois creee, l'etat autoritaire (en retard d'un cran sur la
      frappe, qui est volontairement etalee) effacait regulierement les lettres
      relayees : le texte semblait s'ecrire avec une ou deux secondes de retard. */
await B.evaluate(() => {
  window.__nt = { t0: performance.now(), vu: -1 };
  window.__int = setInterval(() => {
    if (window.__nt.vu >= 0) return;
    const n = [...document.querySelectorAll(".c-texte")].find((e) => /risque majeur/.test(e.textContent || ""));
    if (n) window.__nt.vu = performance.now() - window.__nt.t0;
  }, 5);
});
await A.evaluate(() => {
  const s = document.getElementById("scene"), r = s.getBoundingClientRect();
  document.querySelector('[data-outil="texte"]').click();
  s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.x + 50, clientY: r.y + r.height - 60, pointerId: 1, pointerType: "mouse", isPrimary: true }));
});
await A.waitForFunction(() => !!document.querySelector('.c-texte[contenteditable="true"]'), null, { timeout: 6000 }).catch(() => {});
await A.keyboard.type("risque majeur", { delay: 25 });
await dodo(900);
const nt = await B.evaluate(() => { clearInterval(window.__int); return window.__nt.vu; });
t("une note s'ecrit en direct chez les autres (moins de 600 ms)",
  nt >= 0 && nt < 600, nt < 0 ? "jamais vue" : "mesure : " + Math.round(nt) + " ms");

/* 7. Et elle ne doit pas RECULER pendant que le serveur rattrape la frappe. */
await B.evaluate(() => {
  window.__nr = { court: 0 };
  window.__inr = setInterval(() => {
    const n = [...document.querySelectorAll(".c-texte")].find((e) => /risque/.test(e.textContent || ""));
    if (n && (n.textContent || "").trim().length < "risque majeur".length) window.__nr.court++;
  }, 10);
});
await dodo(RETARD + 900);
const nr = await B.evaluate(() => { clearInterval(window.__inr); return window.__nr.court; });
t("le texte de la note ne recule pas apres avoir ete ecrit", nr === 0, nr + " retours en arriere");
await A.evaluate(() => { const e = document.querySelector('.c-texte[contenteditable="true"]'); if (e) e.blur(); });
await dodo(600);
// Menage : la note compte dans l'encombrement du tableau, donc dans le calcul
// du plancher de zoom mesure plus bas. On la retire pour ne pas fausser une
// mesure qui n'a rien a voir.
for (const tx of [...(S.tableau.textes || [])]) R.appliquer(S, "jAnim", { op: "supprimerTexte", id: tx.id });
noter();
await A.waitForFunction(() => document.querySelectorAll(".c-texte").length === 0, null, { timeout: 15000 }).catch(() => {});

/* ========================================================================== */
});

/* ========================================================================== */
console.log("\n--- Clavier et annulation ---");
await bloc("Clavier et annulation", async () => {
  /* Sans clavier, on pouvait remplir la reserve et poser une carte, mais ni la
     deplacer ni la relier : on ne pouvait donc pas faire la fresque. */
  await A.evaluate(() => { const c = document.querySelector(".c-carte"); c.focus(); });
  const premier = await A.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.n : null);
  t("une carte du tableau peut recevoir le focus clavier", !!premier);

  await A.keyboard.press("ArrowRight");
  await dodo(200);
  const apresFleche = await A.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.n : null);
  t("les fleches passent d'une carte a l'autre", !!apresFleche && apresFleche !== premier,
    "de " + premier + " vers " + apresFleche);

  if (!apresFleche) {
    // Sans focus clavier, rien de ce qui suit n'a de sens : on le dit, une fois,
    // plutot que de laisser une exception masquer toutes les autres mesures.
    t("Maj + fleches deplacent la carte", false, "pas de carte focalisee");
    t("la touche L relie deux cartes sans souris", false, "pas de carte focalisee");
    return;
  }
  const avantX = await A.evaluate((n) => { const e = document.querySelector(".c-carte[data-n='" + n + "']"); return e ? +e._x : 0; }, apresFleche);
  await A.keyboard.down("Shift");
  for (let i = 0; i < 3; i++) { await A.keyboard.press("ArrowRight"); await dodo(40); }
  await A.keyboard.up("Shift");
  await dodo(1400 + LATENCE_ECRIT);
  const apresX = await A.evaluate((n) => +document.querySelector(".c-carte[data-n='" + n + "']")._x, apresFleche);
  const cote = S.tableau.cartes.filter((c) => c.n === +apresFleche)[0];
  t("Maj + fleches deplacent la carte, et le serveur l'enregistre",
    apresX > avantX && cote && Math.abs(cote.x - apresX) < 2,
    "ecran " + avantX + " -> " + apresX + ", serveur " + (cote ? cote.x : "?"));

  const flAvant = S.tableau.fleches.length;
  await A.keyboard.press("l");
  await dodo(250);
  await A.keyboard.press("ArrowRight");
  await dodo(200);
  await A.keyboard.press("l");
  await dodo(1200);
  t("la touche L relie deux cartes sans souris", S.tableau.fleches.length === flAvant + 1,
    flAvant + " -> " + S.tableau.fleches.length);

  /* ANNULATION. On annule SON geste, comme une action ordinaire : memes regles,
     meme diffusion aux autres. */
  const boutonAvant = await A.evaluate(() => { const b = document.getElementById("btn-annuler"); return b ? b.disabled : null; });
  t("le bouton « Annuler » existe et s'active quand il y a quelque chose a annuler", boutonAvant === false);
  const flAvantAnnul = S.tableau.fleches.length;
  await A.keyboard.press("Control+z");
  await dodo(1500);
  t("Ctrl+Z defait le dernier lien cree", S.tableau.fleches.length === flAvantAnnul - 1,
    flAvantAnnul + " -> " + S.tableau.fleches.length);

  const xAvantAnnul = S.tableau.cartes.filter((c) => c.n === +apresFleche)[0];
  await A.keyboard.press("Control+z");
  await dodo(1500);
  const xApresAnnul = S.tableau.cartes.filter((c) => c.n === +apresFleche)[0];
  t("un second Ctrl+Z remet la carte a sa place d'avant",
    xApresAnnul && xAvantAnnul && Math.abs(xApresAnnul.x - avantX) < 2,
    "revenue a " + (xApresAnnul ? xApresAnnul.x : "?") + ", attendu " + avantX);

  /* L'annulation doit se voir chez les autres comme n'importe quelle action. */
  await B.waitForFunction((d) => {
    const el = document.querySelector(".c-carte[data-n='" + d.n + "']");
    return !!el && Math.abs((el._x || 0) - d.x) < 2;
  }, { n: apresFleche, x: avantX }, { timeout: 8000 }).catch(() => {});
  t("l'annulation arrive chez les autres comme une action ordinaire",
    await B.evaluate((d) => { const el = document.querySelector(".c-carte[data-n='" + d.n + "']"); return !!el && Math.abs((el._x || 0) - d.x) < 2; }, { n: apresFleche, x: avantX }));
});

console.log("\n--- Rassembler (proposer sa vue) ---");
await bloc("Rassembler", async () => {
  /* Le ping designe un point ; il ne sert a rien si la personne regarde ailleurs
     ou n'est pas au meme zoom. L'animateur·ice peut donc proposer sa vue.
     PROPOSER : rien ne doit bouger chez les autres tant qu'ils n'ont pas
     accepte. Deplacer la vue de quelqu'un sans prevenir, alors qu'il pose une
     carte, fait perdre le fil, et le cadrage est personnel dans cet outil. */
  await A.evaluate(() => document.getElementById("z-tout").click());
  await dodo(600);
  await B.evaluate(() => { for (let i = 0; i < 3; i++) document.getElementById("z-plus").click(); });
  await dodo(700);
  const avant = await B.evaluate(() => ({ z: parseFloat(document.getElementById("z-niv").textContent) }));

  t("le bouton n'existe que pour l'animateur·ice",
    (await A.evaluate(() => getComputedStyle(document.getElementById("btn-rassembler")).display)) !== "none"
    && (await B.evaluate(() => getComputedStyle(document.getElementById("btn-rassembler")).display)) === "none");

  await A.evaluate(() => document.getElementById("btn-rassembler").click());
  await dodo(500);
  const invit = await B.evaluate(() => {
    const el = document.querySelector(".appel-vue");
    return { la: !!el && !el.hidden, txt: el ? el.textContent : "",
      z: parseFloat(document.getElementById("z-niv").textContent) };
  });
  t("les autres recoivent une invitation, nommee", invit.la && /montrer/i.test(invit.txt), invit.txt);
  t("ET RIEN N'A BOUGE CHEZ EUX tant qu'ils n'ont pas accepte",
    Math.abs(invit.z - avant.z) < 0.5, "zoom " + avant.z + " % -> " + invit.z + " %");

  await B.evaluate(() => document.querySelector(".appel-vue .appel-ok").click());
  await dodo(900);
  const apres = await B.evaluate(() => ({
    z: parseFloat(document.getElementById("z-niv").textContent),
    fermee: document.querySelector(".appel-vue").hidden
  }));
  const zA = await A.evaluate(() => parseFloat(document.getElementById("z-niv").textContent));
  t("en acceptant, on arrive bien sur la vue de l'animateur·ice",
    Math.abs(apres.z - zA) <= 6, "sa vue " + zA + " %, la mienne " + apres.z + " %");
  t("et l'invitation se referme", apres.fermee);

  /* Elle ne doit pas rester a l'ecran indefiniment : personne ne ferme les
     bandeaux, et une invitation perimee est un mensonge. */
  await A.evaluate(() => document.getElementById("btn-rassembler").click());
  await dodo(400);
  t("une invitation ignoree s'efface d'elle-meme",
    await B.evaluate(() => new Promise((r) => {
      const el = document.querySelector(".appel-vue");
      if (el.hidden) return r(false);
      setTimeout(() => r(el.hidden), 12600);
    })), "au bout de douze secondes");
});

console.log("\n--- Barre et palette flottante ---");
await bloc("Barre", async () => {
  /* La barre tenait sur trois rangees des qu'une fenetre n'etait pas large :
     de la hauteur prise au tableau, a chaque atelier, sur tous les ecrans. */
  const hauteur = async (l) => {
    await A.setViewportSize({ width: l, height: 860 });
    await dodo(280);
    return A.evaluate(() => document.querySelector(".topbar").getBoundingClientRect().height);
  };
  const h1360 = await hauteur(1360), h1100 = await hauteur(1100);
  t("la barre tient sur une seule rangee, du grand ecran au portable",
    h1360 < 64 && h1100 < 64, "1360 px : " + Math.round(h1360) + " px de haut ; 1100 px : " + Math.round(h1100));
  await A.setViewportSize({ width: 1360, height: 860 });
  await dodo(280);

  /* Masquer la barre, c'est ce qu'on fait pour voir grand. Cela ne doit pas
     retirer la main, les liens et les notes : sans eux il ne reste qu'a
     regarder le tableau. */
  await A.evaluate(() => { document.getElementById("btn-affichage").click(); });
  await dodo(140);
  t("le menu « Affichage » s'ouvre", await A.evaluate(() => !document.getElementById("menu-affichage").hidden));
  await A.evaluate(() => { document.getElementById("btn-barres").click(); });
  await dodo(340);
  const palette = await A.evaluate(() => {
    const d = document.getElementById("dock");
    return {
      visible: !!d && !d.hidden && d.getBoundingClientRect().height > 10,
      outils: d ? d.querySelectorAll(".seg-outils .tool").length : 0,
      zoom: !!(d && d.querySelector("#grp-zoom")),
      annuler: !!(d && d.querySelector("#btn-annuler")),
      barreCachee: document.querySelector(".topbar").getBoundingClientRect().height < 1,
      copies: document.querySelectorAll(".seg-outils").length
    };
  });
  t("barre masquee : les outils restent accessibles dans une palette flottante",
    palette.visible && palette.outils === 4 && palette.zoom && palette.annuler && palette.barreCachee,
    JSON.stringify(palette));
  t("et il n'existe jamais deux jeux d'outils qui pourraient se contredire",
    palette.copies === 1, palette.copies + " groupes d'outils");

  await A.evaluate(() => { document.querySelector('#dock .tool[data-outil="fleche"]').click(); });
  await dodo(160);
  t("un outil choisi depuis la palette s'active vraiment",
    (await A.evaluate(() => document.querySelector('.tool[data-outil="fleche"]').getAttribute("aria-pressed"))) === "true");
  await A.evaluate(() => { document.querySelector('.tool[data-outil="deplacer"]').click(); });

  await A.evaluate(() => { document.getElementById("btn-barres-show").click(); });
  await dodo(340);
  const revenu = await A.evaluate(() => ({
    barre: document.querySelector(".topbar").getBoundingClientRect().height > 20,
    outilsEnPlace: !!document.querySelector(".bz-c .seg-outils"),
    zoomEnPlace: !!document.querySelector(".bz-d #grp-zoom"),
    dockCache: document.getElementById("dock").hidden
  }));
  t("et tout revient exactement a sa place quand on reaffiche la barre",
    revenu.barre && revenu.outilsEnPlace && revenu.zoomEnPlace && revenu.dockCache, JSON.stringify(revenu));
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
// Seuils volontairement larges. Ce qu'on veut distinguer, c'est 7 % contre
// 146 % et 0 cycle contre 19 : une marge enorme. Serrer davantage ferait virer
// la CI au rouge au hasard sur une machine chargee, et un harnais qui echoue
// sans raison est un harnais qu'on finit par ignorer.
t("le curseur d'une autre personne se deplace a vitesse reguliere",
  cur && cur.irregularite < 60, cur ? "irregularite " + cur.irregularite.toFixed(0) + " %" : "pas assez d'echantillons");
t("aucun cycle arret / reprise (la cause du malaise)",
  cur && cur.cycles <= 2, cur ? cur.cycles + " cycles sur " + cur.images + " images" : "non mesure");

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

/* PAR DEFAUT, PAS DE TITRE SOUS LES CARTES. Deux relectures ont prefere le
   tableau nu, et surtout : au dezoom maximal les etiquettes se chevauchent, et
   on deplace alors de vraies cartes pour corriger un defaut d'affichage. Le
   titre reste disponible, mais sur demande. */
const defautTitres = await A.evaluate(() => ({
  corps: document.body.classList.contains("titres-loin"),
  bouton: document.getElementById("btn-titres").getAttribute("aria-pressed"),
  opacite: getComputedStyle(document.querySelector(".c-carte .etiq")).opacity
}));
t("par defaut, aucun titre ne s'affiche sous les cartes au dezoom",
  !defautTitres.corps && defautTitres.bouton === "false" && defautTitres.opacite === "0",
  JSON.stringify(defautTitres));

// La suite mesure l'etiquette : on l'allume.
await A.evaluate(() => document.getElementById("btn-titres").click());
await dodo(300);

semantique = await A.evaluate(() => {
  const m = document.getElementById("monde");
  const st = getComputedStyle(m);
  const el = document.querySelector(".c-carte");
  const op = (s) => parseFloat(getComputedStyle(el.querySelector(s)).opacity);
  const img = el.querySelector(".vis img");
  const si = getComputedStyle(img);
  return {
    loin: m.classList.contains("zoom-loin"),
    fw: parseFloat(st.getPropertyValue("--fw")) || 0,
    opTitre: op(".tit"),
    opNum: op(".num"),
    opAgr: op(".agr"),
    imageVisible: si.visibility !== "hidden" && parseFloat(si.opacity) > 0.9,
    largeurImage: Math.round(img.getBoundingClientRect().width),
    filet: { hauteurEcran: el.querySelector(".tit").getBoundingClientRect().height,
      fond: getComputedStyle(el.querySelector(".tit")).backgroundColor },
    partImage: img.getBoundingClientRect().height / el.getBoundingClientRect().height,
    etiquette: (function () {
      const e = el.querySelector(".etiq"), r = e.getBoundingClientRect();
      return { opacite: parseFloat(getComputedStyle(e).opacity), hauteurLigne: r.height,
        largeur: r.width, texte: e.textContent.slice(0, 40),
        clics: getComputedStyle(e).pointerEvents, halo: getComputedStyle(e).getPropertyValue("--halo").trim() };
    })(),
    hauteurCarte: el.offsetHeight
  };
});
t("a bas zoom, la lecture passe en mode « de loin »", semantique.loin);
t("les traits de fleche restent epais a l'ecran quand on dezoome",
  semantique.fw > 4, "--fw = " + semantique.fw);
t("le titre, illisible a cette distance, s'efface", semantique.opTitre === 0);
/* LE NUMERO S'EFFACE AVEC LE TITRE. Il restait, contre-mis a l'echelle : trente-
   neuf pastilles de taille fixe posees sur des cartes qui retrecissent finissent
   par recouvrir l'illustration, et lire trente-neuf numeros un a un n'aide pas a
   balayer un tableau. Deux relectures l'ont signale (« les cartes deviennent des
   numeros »). Survol, toucher et clavier donnent toujours numero et titre. */
t("le numero et le bouton d'agrandissement s'effacent avec lui",
  semantique.opNum === 0 && semantique.opAgr === 0,
  "numero " + semantique.opNum + ", agrandir " + semantique.opAgr);
/* L'ILLUSTRATION NE DISPARAIT JAMAIS. Une version precedente l'effacait sous
   34 %, en supposant qu'a trente pixels elle n'apprenait plus rien. Mesure faite
   sur les trente-neuf illustrations reduites a la taille affichee : l'ecart
   median a la plus proche voisine ne perd que 12 % entre 150 px et 30 px. Elle
   reste le repere le plus rapide, et deux relecteurs la voulaient. */
t("l'illustration de la carte reste visible, meme au dezoom maximal",
  semantique.imageVisible && semantique.largeurImage > 0,
  "image " + semantique.largeurImage + " px de large");
/* LE BLOC DU TITRE SE REPLIE EN FILET. Premiere version : il gardait sa place
   et prenait la couleur du lot, ce qui donnait un aplat sur pres de la moitie
   de la carte, pour ne rien dire. Aucun texte ne peut le remplacer a cette
   taille (6,3 px a 48 %). Le filet garde une epaisseur d'ECRAN constante. */
t("le bloc du titre se replie en un simple filet de couleur",
  semantique.filet.hauteurEcran > 2.5 && semantique.filet.hauteurEcran < 6
  && !/rgba\(0, 0, 0, 0\)|transparent/.test(semantique.filet.fond),
  semantique.filet.hauteurEcran.toFixed(1) + " px a l'ecran, fond " + semantique.filet.fond);
t("l'illustration occupe desormais presque toute la carte",
  semantique.partImage > 0.8,
  Math.round(semantique.partImage * 100) + " % de la hauteur de la carte");

/* LE TITRE NE DISPARAIT PAS, IL PASSE SOUS LA CARTE. Imprime sur la carte il
   suit le zoom : 6,3 px a 48 %, 3,3 px au plancher. Sorti de la carte et
   contre-mis a l'echelle, il garde onze pixels a toutes les distances. */
t("le titre passe sous la carte, et il y est lisible",
  semantique.etiquette.opacite === 1 && semantique.etiquette.hauteurLigne > 8
  && semantique.etiquette.texte.length > 3,
  "« " + semantique.etiquette.texte + " », "
  + semantique.etiquette.hauteurLigne.toFixed(0) + " px de haut a l'ecran");
t("et l'etiquette ne gene jamais la prise d'une carte",
  semantique.etiquette.clics === "none", "pointer-events : " + semantique.etiquette.clics);

/* LE CANEVAS PEUT ETRE FORCE EN SOMBRE DANS UN THEME CLAIR, ET L'INVERSE. La
   couleur du texte doit donc suivre le HALO, pas le theme : autrement on ecrit
   de l'encre sombre sur un halo sombre, et l'etiquette disparait. */
const contrastes = await A.evaluate(async () => {
  // On fait RESOUDRE la couleur par le navigateur (var() et hexa -> rgb) au
  // lieu de lire le jeton brut de la propriete personnalisee.
  const lum = (c) => { const m = c.match(/[\d.]+/g) || [0, 0, 0]; return +m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114; };
  const sonde = document.createElement("span");
  sonde.style.color = "var(--halo)";
  document.querySelector(".c-carte .etiq").appendChild(sonde);
  const out = {};
  for (const mode of ["canvas-noir", "canvas-blanc"]) {
    document.body.classList.remove("canvas-noir", "canvas-blanc");
    document.body.classList.add(mode);
    await new Promise((r) => requestAnimationFrame(r));
    out[mode] = Math.abs(lum(getComputedStyle(document.querySelector(".c-carte .etiq")).color)
      - lum(getComputedStyle(sonde).color));
  }
  sonde.remove();
  document.body.classList.remove("canvas-noir", "canvas-blanc");
  return out;
});
t("l'etiquette reste lisible sur un canevas force en sombre comme en clair",
  contrastes["canvas-noir"] > 90 && contrastes["canvas-blanc"] > 90,
  "ecart de luminance : canevas sombre " + Math.round(contrastes["canvas-noir"])
  + ", canevas clair " + Math.round(contrastes["canvas-blanc"]));

/* UN SEUL PALIER, ET C'EST LE POINT DE CE CONTROLE.
   Il y en avait trois (62 %, 42 %, 34 %), tous tasses dans la plage de travail :
   un seul geste de molette faisait changer le tableau d'aspect trois fois. On
   balaye donc toute la plage de zoom et on compte les apparences DISTINCTES
   d'une carte. Il doit y en avoir exactement deux. */
const apparences = await A.evaluate(async () => {
  const z = document.getElementById("z-plus"), zm = document.getElementById("z-moins");
  const vues = [];
  const lire = () => {
    const el = document.querySelector(".c-carte");
    const op = (s) => getComputedStyle(el.querySelector(s)).opacity;
    const img = el.querySelector(".vis img");
    return [op(".tit"), op(".num"), op(".agr"), op(".etiq"),
      getComputedStyle(img).visibility, getComputedStyle(el).backgroundColor].join("|");
  };
  const pause = () => new Promise((r) => setTimeout(r, 120));
  // On attend que le recadrage ET le fondu soient FINIS avant de lire : sinon on
  // echantillonne une opacite a mi-chemin et on compte une apparence qui
  // n'existe pas.
  const calme = async () => {
    let a = null;
    for (let i = 0; i < 25; i++) {
      await pause();
      const b = document.getElementById("z-niv").textContent + "/" + lire();
      if (b === a) return;
      a = b;
    }
  };
  for (let i = 0; i < 24 && !z.disabled; i++) { z.click(); await calme(); }
  for (let i = 0; i < 40; i++) {
    vues.push({ z: parseFloat(document.getElementById("z-niv").textContent), v: lire() });
    if (zm.disabled) break;
    zm.click(); await calme();
  }
  const distinctes = [];
  vues.forEach((o) => { if (distinctes.indexOf(o.v) < 0) distinctes.push(o.v); });
  return { pas: vues.length, distinctes: distinctes.length,
    plage: vues.length ? vues[0].z + " % -> " + vues[vues.length - 1].z + " %" : "" };
});
t("et le choix est retenu pour la prochaine session",
  await A.evaluate(() => { try { return localStorage.getItem("titres-loin"); } catch (e) { return null; } }) === "1",
  "cle titres-loin");

/* TAILLE D'ECRAN CONSTANTE : c'est tout l'interet de la contre-mise a
   l'echelle. On releve la largeur de l'etiquette a chaque palier de zoom : si
   elle suivait le zoom comme avant, elle fondrait de moitie sur la plage. */
const etiqTailles = await A.evaluate(async () => {
  const z = document.getElementById("z-plus"), zm = document.getElementById("z-moins");
  const pause = () => new Promise((r) => setTimeout(r, 260));
  const mesures = [];
  for (let i = 0; i < 24 && !z.disabled; i++) { z.click(); await pause(); }
  for (let i = 0; i < 40; i++) {
    const zoom = parseFloat(document.getElementById("z-niv").textContent);
    const e = document.querySelector(".c-carte .etiq");
    if (zoom < 55) mesures.push(Math.round(e.getBoundingClientRect().width));
    if (zm.disabled) break;
    zm.click(); await pause();
  }
  return mesures;
});
t("l'etiquette garde la meme taille a l'ecran quel que soit le zoom",
  etiqTailles.length > 3 && Math.max(...etiqTailles) - Math.min(...etiqTailles) <= 2,
  etiqTailles.length + " paliers, de " + Math.min(...etiqTailles) + " a " + Math.max(...etiqTailles) + " px");

t("sur toute la plage de zoom, une carte n'a que deux apparences",
  apparences.distinctes === 2,
  apparences.distinctes + " apparences sur " + apparences.pas + " paliers (" + apparences.plage + ")");

// Un cran a la fois : six clics dans la meme image ne font qu'un seul pas,
// puisqu'ils partent tous du meme zoom courant.
for (let i = 0; i < 5; i++) { await A.evaluate(() => document.getElementById("z-plus").click()); await dodo(260); }
await dodo(400);
const apresZoom = await A.evaluate(() => {
  const el = document.querySelector(".c-carte");
  return { z: document.getElementById("z-niv").textContent,
    titre: getComputedStyle(el.querySelector(".tit")).opacity,
    num: getComputedStyle(el.querySelector(".num")).opacity };
});
t("des qu'on se rapproche, titre et numero reviennent",
  apresZoom.titre === "1" && apresZoom.num === "1", JSON.stringify(apresZoom));
/* LE LIBELLE D'UNE FLECHE NE DOIT JAMAIS DISPARAITRE AU DEZOOM. C'est une
   annotation ecrite par le groupe : la masquer fait croire qu'elle est perdue.
   Je l'avais pourtant retiree, en la jugeant illisible ; c'est une relecture
   humaine qui l'a vu, pas ce banc. D'ou ce controle. */
{
  let fl = R.vue(S).tableau.fleches;
  if (!fl.length) { R.appliquer(S, "jAnim", { op: "creerFleche", de: 1, vers: 2 }); fl = R.vue(S).tableau.fleches; }
  if (fl.length) { R.appliquer(S, "jAnim", { op: "libellerFleche", id: fl[0].id, libelle: "renforce" }); noter(); }
  await A.waitForFunction(() => !!document.querySelector(".fleche-lib"), null, { timeout: 20000 }).catch(() => {});
}
const mesureLib = () => A.evaluate(() => {
  const el = document.querySelector(".fleche-lib");
  const r = el ? el.getBoundingClientRect() : null;
  return { z: document.getElementById("z-niv").textContent,
    visible: !!(el && getComputedStyle(el).visibility !== "hidden" && r.height > 0),
    haut: r ? Math.round(r.height) : 0 };
});
const libEtapes = [];
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(600);
libEtapes.push(await mesureLib());                                   // cadrage d'ensemble
for (let i = 0; i < 4; i++) { await A.evaluate(() => document.getElementById("z-plus").click()); await dodo(280); }
libEtapes.push(await mesureLib());                                   // de pres
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(500);
await A.mouse.move(scA.x, scA.y);
for (let i = 0; i < 40; i++) { await A.mouse.wheel(0, 120); await dodo(10); }
await dodo(400);
libEtapes.push(await mesureLib());                                   // dezoom maximal
t("le libelle d'une fleche reste visible a toutes les distances",
  libEtapes.every((e) => e.visible), JSON.stringify(libEtapes));
// CHANGEMENT DE COMPORTEMENT (retour d'atelier) : le libelle NE grossit plus au
// dezoom. Avant, une contre-mise a l'echelle le gardait a taille d'ecran
// constante, ce qui le faisait exploser en coordonnees monde et recouvrir les
// cartes voisines quand on prenait du recul. Il suit maintenant l'echelle du
// tableau, comme une carte ou une note : plus grand de pres, plus petit de loin,
// et jamais plus grand au dezoom qu'a la distance de travail.
// libEtapes = [ cadrage d'ensemble, de pres, dezoom maximal ].
t("il suit l'echelle du tableau au lieu de grossir au dezoom (plus de chevauchement)",
  libEtapes[1].haut >= libEtapes[0].haut
  && libEtapes[0].haut >= libEtapes[2].haut
  && libEtapes[1].haut > libEtapes[2].haut,
  libEtapes.map((e) => e.z + " : " + e.haut + " px").join(", "));

await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(600);
await A.mouse.move(scA.x, scA.y);
for (let i = 0; i < 40; i++) { await A.mouse.wheel(0, 120); await dodo(10); }
await dodo(400);

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

/* LA HAUTEUR DE LA CARTE CHANGE DESORMAIS AVEC LE ZOOM (le bloc du titre se
   replie). Ce qui ne doit pas changer, c'est l'IMAGE EXPORTEE : elle est
   construite sur la hauteur reelle des elements, donc exporter en etant dezoome
   aurait donne des cartes sans place pour leur titre. C'est ce que verifie le
   controle de l'export, plus bas ; ici on note simplement que le repli a bien
   lieu, sinon le filet n'aurait servi a rien. */
await A.evaluate(() => document.getElementById("z-tout").click());
await dodo(600);
const hPres = await A.evaluate(() => document.querySelector(".c-carte").offsetHeight);
t("de pres, la carte retrouve la place de son titre",
  hPres > semantique.hauteurCarte + 10,
  "de loin " + semantique.hauteurCarte + " px, de pres " + hPres + " px");

/* ========================================================================== */
});
console.log("\n--- Fleches ---");
await bloc("Fleches", async () => {
await A.evaluate(() => document.querySelector('[data-outil="fleche"]').click());
// Deux cartes dont le centre est reellement atteignable a la souris : sinon le
// clic tombe sur la reserve ou une barre, et le test echoue pour rien.
const degagees = await A.evaluate(() => {
  const gene = ["#pool", "#deck", "#panneau", "#dock", ".topbar"].map((s) => document.querySelector(s)).filter(Boolean);
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

/* RETOURS D'ATELIER : taille reglable et libelle qui ne disparait plus. */
// Le controle + / - apparait pendant l'edition du libelle.
t("un controle de taille (+ / -) apparait quand on edite un libelle",
  await A.evaluate(() => { const c = document.querySelector(".ctrl-taille"); return !!c && c.querySelectorAll("button").length === 2; }));
// Le « + » grossit reellement le libelle (font-size applique via --tl).
const libAvant = await A.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".fleche-lib")).fontSize));
await A.evaluate(() => { const b = document.querySelector(".ctrl-taille button:last-child"); if (b) b.click(); });
await A.waitForFunction((av) => { const l = document.querySelector(".fleche-lib"); return l && parseFloat(getComputedStyle(l).fontSize) > av + 0.5; }, libAvant, { timeout: 8000 }).catch(() => {});
const libApres = await A.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".fleche-lib")).fontSize));
t("le bouton + grossit le libelle", libApres > libAvant + 0.5, libAvant + " -> " + libApres + " px");
// Validation par Entree, puis on laisse le service (LENT et eventuellement
// coherent, comme la vraie plateforme) faire plusieurs sondages : le libelle ET
// sa taille doivent RESTER, sans avoir a les retaper. C'est le bug signale.
await A.keyboard.press("Enter"); await dodo(2600);
const persiste = await A.evaluate(() => { const l = document.querySelector(".fleche-lib"); return l ? { t: l.textContent, f: parseFloat(getComputedStyle(l).fontSize) } : null; });
t("le libelle ne disparait pas apres Entree (magasin eventuellement coherent)",
  !!persiste && persiste.t === "provoque", JSON.stringify(persiste));
t("et sa taille tient aussi apres validation", !!persiste && persiste.f > libAvant + 0.5, JSON.stringify(persiste));
t("un seul libelle, pas de doublon apres validation",
  (await A.evaluate(() => document.querySelectorAll(".fleche-lib").length)) === 1);

// Reserve : chaque carte propose « Agrandir » (recto/verso, sans la poser).
{
  const agr = await A.evaluate(() => {
    const b = document.querySelector('#pool .pool-carte [data-a="agrandir"]');
    if (!b) return "aucune-carte"; b.click(); return "clic";
  });
  if (agr === "clic") {
    await A.waitForFunction(() => document.querySelector(".modal.on"), null, { timeout: 5000 }).catch(() => {});
    t("« Agrandir » ouvre la carte de la reserve en grand", await A.evaluate(() => !!document.querySelector(".modal.on")));
    await A.keyboard.press("Escape"); await dodo(200);
    await A.evaluate(() => { const m = document.querySelector(".modal.on .modal-close, .modal.on [data-x]"); if (m) m.click(); const md = document.querySelector(".modal"); if (md) md.classList.remove("on"); });
  }
}
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
console.log("\n--- Tactile et export ---");
await bloc("Tactile et export", async () => {
  /* PINCEMENT A DEUX DOIGTS. La scene est en `touch-action:none` (sans quoi le
     navigateur confisquerait le glissement des cartes), ce qui supprime aussi
     le pincement natif : sur tablette il ne restait que les boutons + et -. */
  const ctxT = await nav.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true, isMobile: false, acceptDownloads: true });
  const T = await ctxT.newPage();
  T.on("pageerror", (e) => erreursJS.push("[tactile] " + e.message));
  await T.addInitScript(() => {
    localStorage.setItem("coach-multi-off", "1");
    localStorage.setItem("fresque:tuto:animateur", "1");
    localStorage.setItem("fresque:anim:VERIF1", "jAnim");
  });
  await T.route("**/session.js", async (route) => {
    const rr = await route.fetch();
    const txt = (await rr.text()).replace("wss://curseurs.pauseia.fr", "ws://127.0.0.1:" + PORT_RELAIS);
    await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: txt });
  });
  await T.route("**/.netlify/functions/fresque", servir);
  await T.goto("http://127.0.0.1:" + PORT_SITE + "/en-ligne/session/?s=VERIF1", { waitUntil: "domcontentloaded" });
  await T.waitForSelector("#app:not([hidden])", { timeout: 30000 });
  await T.waitForFunction(() => document.querySelectorAll(".c-carte").length > 0, null, { timeout: 30000 });
  await T.evaluate(() => document.getElementById("z-tout").click());
  await dodo(700);
  const zAvant = await T.evaluate(() => parseFloat(document.getElementById("z-niv").textContent));
  const cdp = await ctxT.newCDPSession(T);
  const sc = await T.evaluate(() => { const r = document.getElementById("scene").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const doigts = (e1, e2) => [{ x: sc.x - e1, y: sc.y }, { x: sc.x + e2, y: sc.y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: doigts(40, 40).map((p, i) => ({ ...p, id: i })) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: doigts(40 + i * 12, 40 + i * 12).map((p, j) => ({ ...p, id: j })) });
    await dodo(20);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await dodo(400);
  const zApres = await T.evaluate(() => parseFloat(document.getElementById("z-niv").textContent));
  t("on peut zoomer au pincement sur un ecran tactile", zApres > zAvant + 3,
    "avant " + zAvant + " %, apres " + zApres + " %");

  /* IDENTIFIER UNE CARTE AU DOIGT. De loin, le titre et le numero s'effacent :
     a la souris on survole, au clavier on tabule, mais une tablette n'a ni l'un
     ni l'autre. Sans ce rattrapage, une carte n'aurait plus aucun moyen de dire
     qui elle est sur un ecran tactile. */
  {
    // Le pincement a zoome : on recadre, sinon la carte visee peut etre hors
    // de l'ecran et le doigt tomberait dans le vide.
    await T.evaluate(() => document.getElementById("z-tout").click());
    await dodo(800);
    const c = await T.evaluate(() => {
      const dedans = [].slice.call(document.querySelectorAll(".c-carte")).find((el) => {
        const r = el.getBoundingClientRect();
        return r.top > 4 && r.left > 4 && r.bottom < innerHeight - 4 && r.right < innerWidth - 4;
      });
      if (!dedans) return null;
      const r = dedans.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: dedans.dataset.n };
    });
    if (!c) t("toucher une carte donne son numero et son titre (pas de survol au doigt)",
      false, "aucune carte entierement visible apres recadrage");
    else {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id: 0 }] });
      await dodo(160);
      /* TROIS INFORMATIONS, TROIS FORMES : le numero (ce par quoi on se designe
         les cartes a voix haute) dans un jeton a la couleur de son lot, le
         titre dans sa bulle, la famille dans une autre. Une seule ligne de
         texte les melangeait. */
      const vu = await T.evaluate(() => {
        const s = document.getElementById("survol-carte");
        const q = (c) => { const e = s.querySelector(c); return e ? e.textContent.trim() : null; };
        const jeton = s.querySelector(".sv-num");
        return { cache: s.hidden, num: q(".sv-num"), titre: q(".sv-titre"), lot: q(".sv-lot"),
          fond: jeton ? getComputedStyle(jeton).backgroundColor : "",
          taille: jeton ? parseFloat(getComputedStyle(jeton).fontSize) : 0 };
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      t("toucher une carte donne son numero et son titre (pas de survol au doigt)",
        !vu.cache && vu.num === String(c.n) && !!vu.titre,
        "encadre " + (vu.cache ? "cache" : JSON.stringify(vu)) + " pour la carte " + c.n);
      t("le numero est gros et porte la couleur de son lot",
        vu.taille >= 16 && /^rgb\(/.test(vu.fond || "") && vu.fond !== "rgba(0, 0, 0, 0)",
        vu.taille + "px " + vu.fond);
      t("et la famille de la carte est dite a part",
        !!vu.lot && /lot|set/i.test(vu.lot), String(vu.lot));
    }
  }

  /* EXPORT : la plume doit etre posee avant de dessiner, sinon une note encore
     en cours de frappe manque sur l'image (deja constate apres un atelier). */
  await T.evaluate(() => {
    const s = document.getElementById("scene");
    const r = s.getBoundingClientRect();
    document.querySelector('[data-outil="texte"]').click();
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: r.x + 60, clientY: r.y + 60, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  });
  await T.waitForFunction(() => !!document.querySelector('.c-texte[contenteditable="true"]'), null, { timeout: 6000 }).catch(() => {});
  const enEdition = await T.evaluate(() => !!document.querySelector('.c-texte[contenteditable="true"]'));
  if (enEdition) {
    await T.keyboard.type("note en cours");
    await T.evaluate(() => { const b = document.getElementById("btn-export"); if (b) b.click(); });
    await dodo(300);
  }
  t("cliquer « Telecharger l'image » pose d'abord la plume (la note en cours est enregistree)",
    enEdition && !(await T.evaluate(() => !!document.querySelector('.c-texte[contenteditable="true"]'))),
    enEdition ? "" : "aucune note en edition : cas non couvert");

  /* L'IMAGE TELECHARGEE, EXAMINEE PIXEL PAR PIXEL.
     C'est le seul livrable que le groupe emporte, et elle etait fausse sans que
     rien ne le signale : les cartes restees hors de l'ecran sortaient NOIRES
     (chargement paresseux), et celles qui sortaient montraient le quart
     superieur gauche de leur illustration, agrandi deux fois (la taille
     naturelle d'une image a `srcset` est corrigee par la densite, alors que le
     decoupage de `drawImage` s'exprime en pixels du bitmap). Deux defauts qu'un
     test de presence n'aurait jamais vus : il faut regarder l'image produite. */
  // Le bouton n'apparait qu'a la fresque complete : on la complete.
  for (let n = 1; n <= 38; n++) {
    if (!S.tableau.cartes.some((c) => c.n === n)) {
      R.appliquer(S, "jAnim", { op: "poolAjouter", n });
      R.appliquer(S, "jAnim", { op: "poserCarte", n, pos: { x: 300 + ((n - 1) % 10) * 330, y: 300 + Math.floor((n - 1) / 10) * 320 } });
    }
  }
  noter();
  await T.waitForFunction(() => document.querySelectorAll(".c-carte").length >= 38, null, { timeout: 25000 }).catch(() => {});
  /* ON ZOOME DELIBEREMENT, pour que la plupart des cartes soient HORS DE
     L'ECRAN au moment de l'export. C'est la condition exacte du defaut : une
     illustration en chargement paresseux qu'on n'a jamais vue n'existe pas, et
     sortait noire. Sans ce zoom, toutes les images sont chargees et le controle
     ne prouve rien : verifie dans les deux sens. */
  for (let i = 0; i < 5; i++) { await T.evaluate(() => document.getElementById("z-plus").click()); await dodo(240); }
  await dodo(1500);
  const nbCartes = await T.evaluate(() => document.querySelectorAll(".c-carte").length);
  if (nbCartes < 38) {
    t("l'image telechargee montre chaque illustration, cadree comme a l'ecran", false, "fresque incomplete : " + nbCartes + " cartes");
  } else {
    /* ON RETIRE LEURS IMAGES AUX CARTES DE LA PAGE, juste avant d'exporter.
       C'est l'invariant qui compte : l'image telechargee ne doit pas dependre de
       ce que la page a eu le temps de charger. En atelier, le chargement
       paresseux laissait dix cartes sur trente-huit sans illustration, et elles
       sortaient noires. Ce navigateur sans fenetre charge tout, lui, et ne
       reproduirait donc jamais le defaut : on le provoque. */
    await T.evaluate(() => {
      document.querySelectorAll(".c-carte .vis img").forEach((i) => {
        i.removeAttribute("srcset"); i.removeAttribute("src");
      });
    });
    await dodo(400);
    const tele = T.waitForEvent("download", { timeout: 30000 });
    await T.evaluate(() => document.getElementById("btn-export").click());
    let fichier = null;
    try { const d = await tele; fichier = await d.path(); } catch (e) {}
    if (!fichier) {
      t("l'image telechargee montre chaque illustration, cadree comme a l'ecran", false, "aucun telechargement");
    } else {
      const donnees = "data:image/png;base64," + fs.readFileSync(fichier).toString("base64");
      /* On refait, dans la page, le meme calcul de cadrage que l'export, on
         releve la zone illustration de chaque carte, et on la compare a ce
         qu'elle DEVRAIT etre : la meme decoupe de la meme source. */
      const verdict = await T.evaluate(async (png) => {
        const tab = window.__etatExport || null;
        const cartes = [...document.querySelectorAll(".c-carte")].map((el) => ({
          n: +el.dataset.n, x: +el._x || 0, y: +el._y || 0, w: el.offsetWidth, h: el.offsetHeight
        }));
        const textes = [...document.querySelectorAll(".c-texte")].map((el) => ({
          x: +el._x || 0, y: +el._y || 0, w: el.offsetWidth, h: el.offsetHeight
        }));
        const pad = 70;
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        const eng = (x, y, w, h) => { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x + w); maxy = Math.max(maxy, y + h); };
        cartes.forEach((c) => eng(c.x, c.y, c.w, c.h));
        textes.forEach((c) => eng(c.x, c.y, c.w, c.h));
        minx -= pad; miny -= pad; maxx += pad; maxy += pad;
        const W = maxx - minx, ech = Math.max(0.5, Math.min(2, 2400 / W));
        const im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = png; });
        const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
        const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
        // 1. Aucune illustration ne doit etre un aplat (carte restee noire).
        const plates = [];
        for (const c of cartes) {
          const vx = Math.round((c.x - minx) * ech), vy = Math.round((c.y - miny) * ech);
          const vw = Math.round(c.w * ech), vh = Math.round((c.w / 1.6) * ech);
          if (vw < 8 || vh < 8) continue;
          const d = cx.getImageData(vx + 3, vy + 3, vw - 6, vh - 6).data;
          let s = 0, s2 = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) { const g = (d[i] + d[i + 1] + d[i + 2]) / 3; s += g; s2 += g * g; n++; }
          const moy = s / n, ec = Math.sqrt(Math.max(0, s2 / n - moy * moy));
          if (ec < 6) plates.push(c.n);
        }
        /* 2. LE CADRAGE. On redessine, a cote, la decoupe que l'illustration
           DEVRAIT avoir (meme source, meme « cover »), et on compare. Un
           decoupage fait en pixels d'ecran au lieu de pixels du bitmap donne la
           meme zone « non plate » : seule la comparaison le voit. */
        function grille(ctxSrc, x, y, w, h) {
          const d = ctxSrc.getImageData(x, y, w, h).data, g = [];
          for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) {
            let s = 0, n = 0;
            for (let dy = 0; dy < h / 8; dy += 3) for (let dx = 0; dx < w / 12; dx += 3) {
              const px = Math.floor(i * w / 12 + dx), py = Math.floor(j * h / 8 + dy);
              const k = (py * w + px) * 4; s += (d[k] + d[k + 1] + d[k + 2]) / 3; n++;
            }
            g.push(s / Math.max(1, n));
          }
          return g;
        }
        const c1 = cartes.filter((c) => c.n === 1)[0];
        let ecartCadrage = -1;
        if (c1) {
          const vx = Math.round((c1.x - minx) * ech), vy = Math.round((c1.y - miny) * ech);
          const vw = Math.round(c1.w * ech), vh = Math.round((c1.w / 1.6) * ech);
          const obtenu = grille(cx, vx + 2, vy + 2, vw - 4, vh - 4);
          const src = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = "../../assets/img/cartes/01-900.webp"; });
          const cv2 = document.createElement("canvas"); cv2.width = vw; cv2.height = vh;
          const cx2 = cv2.getContext("2d");
          const ir = src.naturalWidth / src.naturalHeight, dr = vw / vh;
          let sx = 0, sy = 0, sw = src.naturalWidth, sh = src.naturalHeight;
          if (ir > dr) { sw = sh * dr; sx = (src.naturalWidth - sw) / 2; } else { sh = sw / dr; sy = (src.naturalHeight - sh) / 2; }
          cx2.drawImage(src, sx, sy, sw, sh, 0, 0, vw, vh);
          const attendu = grille(cx2, 2, 2, vw - 4, vh - 4);
          let somme = 0;
          for (let i = 0; i < obtenu.length; i++) somme += Math.abs(obtenu[i] - attendu[i]);
          ecartCadrage = Math.round(somme / obtenu.length);
        }
        return { cartes: cartes.length, plates: plates, largeur: im.width, ecartCadrage: ecartCadrage };
      }, donnees);
      /* UN SEUL VERDICT POUR LES DEUX DEFAUTS. Les images de la page ont ete
         retirees juste avant : si l'export s'en servait, la zone serait un aplat
         sombre, tres loin de la decoupe attendue. Et s'il decoupait en pixels
         d'ecran au lieu de pixels du bitmap, il montrerait le coin superieur
         gauche agrandi, egalement tres loin. */
      t("l'image telechargee montre chaque illustration, cadree comme a l'ecran",
        verdict.ecartCadrage >= 0 && verdict.ecartCadrage < 18,
        "ecart moyen a la decoupe attendue : " + verdict.ecartCadrage + " / 255"
        + (verdict.plates.length ? " ; " + verdict.plates.length + " carte(s) sans illustration" : ""));

      /* L'IMAGE EXPORTEE NE DOIT PAS DEPENDRE DU ZOOM DE QUI LA TELECHARGE.
         Depuis que le palier replie le bloc du titre, la hauteur d'une carte
         change avec le zoom, et l'export se construit sur cette hauteur : sans
         precaution, telecharger en etant dezoome donnerait des cartes sans
         place pour leur titre. On refait donc exactement le meme export, une
         fois dezoome a fond, et on compare les deux images. */
      await T.evaluate(() => document.getElementById("z-tout").click());
      await dodo(900);
      const loin = await T.evaluate(() => document.getElementById("monde").classList.contains("zoom-loin"));
      const tele2 = T.waitForEvent("download", { timeout: 30000 });
      await T.evaluate(() => document.getElementById("btn-export").click());
      let fichier2 = null;
      try { const d = await tele2; fichier2 = await d.path(); } catch (e) {}
      if (!loin || !fichier2) {
        t("l'image telechargee est la meme, qu'on soit zoome ou non",
          false, !loin ? "le dezoom n'a pas atteint le palier" : "aucun second telechargement");
      } else {
        const ecart = await T.evaluate(async ([a, b]) => {
          const lire = (d) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = d; });
          const ia = await lire(a), ib = await lire(b);
          if (ia.width !== ib.width || ia.height !== ib.height) return { taille: ia.width + "x" + ia.height + " vs " + ib.width + "x" + ib.height, diff: -1 };
          const g = (im) => {
            const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
            const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
            const d = cx.getImageData(0, 0, im.width, im.height).data, out = [];
            for (let j = 0; j < 24; j++) for (let i = 0; i < 32; i++) {
              let sm = 0, n = 0;
              for (let dy = 0; dy < im.height / 24; dy += 4) for (let dx = 0; dx < im.width / 32; dx += 4) {
                const px = Math.floor(i * im.width / 32 + dx), py = Math.floor(j * im.height / 24 + dy);
                const k = (py * im.width + px) * 4; sm += (d[k] + d[k + 1] + d[k + 2]) / 3; n++;
              }
              out.push(sm / Math.max(1, n));
            }
            return out;
          };
          const ga = g(ia), gb = g(ib);
          let sm = 0;
          for (let i = 0; i < ga.length; i++) sm += Math.abs(ga[i] - gb[i]);
          return { taille: ia.width + "x" + ia.height, diff: sm / ga.length };
        }, [donnees, "data:image/png;base64," + fs.readFileSync(fichier2).toString("base64")]);
        t("l'image telechargee est la meme, qu'on soit zoome ou non",
          ecart.diff >= 0 && ecart.diff < 2,
          ecart.diff < 0 ? "dimensions differentes : " + ecart.taille
            : "ecart moyen " + ecart.diff.toFixed(2) + " / 255 (" + ecart.taille + ")");
      }
    }
  }
  await ctxT.close();
});

/* ========================================================================== */
/* FILE DE PAROLE ET CONVERSATION.
   Deux fonctions ajoutees parce que basculer vers la visioconference pour
   demander la parole fait perdre ce qu'on est en train de faire. Ce qui peut
   casser en silence, et que seul un vrai navigateur montre :
   - l'ordre de la file differe selon qui regarde (chacun trie sur SON horloge)
     alors que c'est exactement ce qu'on vient chercher ;
   - lever la main deux fois, ou un renvoi apres coupure, renvoie en fin de
     file : on perd sa place sans comprendre pourquoi ;
   - le message met l'aller-retour du serveur a s'afficher (ici 1,9 s) et l'on
     croit l'avoir rate, donc on le retape ;
   - un message arrive barre fermee sans que rien ne le signale. */
console.log("\n--- File de parole et conversation ---");
await bloc("Mains levees et conversation", async () => {
  const C = await ouvrir("participant 2", R.rejoindre(S, "Vert").jeton, "participant");
  await dodo(RETARD + 700);

  const ouvrirRail = (p) => p.evaluate(() => {
    const b = document.getElementById("btn-rail");
    if (b && document.getElementById("causerie").hidden) b.click();
  });
  const file = (p) => p.evaluate(() => [...document.querySelectorAll("#mains-liste li")]
    .map((li) => li.querySelector(".main-nom").textContent.trim()));

  await ouvrirRail(A); await ouvrirRail(B); await ouvrirRail(C);

  /* L'ORDRE EST CELUI DES DEMANDES, et il doit etre le meme partout. On leve
     la main sur deux postes a 150 ms d'intervalle : des horloges de clients
     suffiraient a les inverser quelque part. */
  await C.evaluate(() => document.getElementById("btn-main").click());
  await dodo(150);
  await B.evaluate(() => document.getElementById("btn-main").click());
  await dodo(LATENCE_ECRIT + 1200);
  const fA = await file(A), fB = await file(B), fC = await file(C);
  t("la file est dans l'ordre des demandes", fC.join(",") === "Vert,Bleu", fC.join(","));
  t("et tout le monde voit le meme ordre",
    fA.join(",") === fC.join(",") && fB.join(",") === fC.join(","),
    "anim=" + fA.join(",") + " | bleu=" + fB.join(",") + " | vert=" + fC.join(","));

  /* LA MAIN SE VOIT TOUT DE SUITE chez soi : sinon on la releve. */
  const vuMain = await B.evaluate(async () => {
    const t0 = performance.now();
    document.getElementById("btn-main").click();         // baisse
    document.getElementById("btn-main").click();         // releve
    for (let i = 0; i < 200; i++) {
      if (document.getElementById("btn-main").getAttribute("aria-pressed") === "true") return performance.now() - t0;
      await new Promise((r) => setTimeout(r, 5));
    }
    return -1;
  });
  t("sa propre main se leve sans attendre le serveur", vuMain >= 0 && vuMain < 300,
    Math.round(vuMain) + " ms");
  await dodo(LATENCE_ECRIT + 1400);

  /* UN DOUBLE-CLIC REVIENT A L'ETAT DE DEPART. Le bouton est une bascule :
     deux clics, c'est lever puis baisser (ou l'inverse), et il faut que le
     second geste soit vraiment pris en compte, chez soi comme chez les autres.

     ON PART D'UN ETAT QU'ON A VU. Ce tableau est eventuellement coherent :
     agir sur ce qu'on croit savoir, c'est tester la latence plutot que le
     code. On attend donc de VOIR sa propre main baissee avant de commencer.
     L'autre cas, le renvoi reseau (deux fois « lever » sans « baisser » entre
     les deux), ne passe pas par le bouton : il est verifie dans
     serveur/tests/regles.test.mjs, ou l'on peut emettre l'action deux fois. */
  const mainVue = (p, valeur) => p.waitForFunction(
    (v) => document.getElementById("btn-main").getAttribute("aria-pressed") === v,
    valeur, { timeout: 20000 }).then(() => true, () => false);

  await C.evaluate(() => {
    if (document.getElementById("btn-main").getAttribute("aria-pressed") === "true") {
      document.getElementById("btn-main").click();
    }
  });
  t("on voit sa propre main redescendre", await mainVue(C, "false"));
  await dodo(LATENCE_ECRIT + 1400);
  const avantDbl = await file(B);
  await C.evaluate(() => { const b = document.getElementById("btn-main"); b.click(); b.click(); });
  t("un double-clic rend la main a son etat de depart", await mainVue(C, "false"));
  await dodo(LATENCE_ECRIT + 1800);
  t("et la file des autres n'a pas bouge",
    (await file(B)).join(",") === avantDbl.join(","),
    "avant " + avantDbl.join(",") + " apres " + (await file(B)).join(","));

  /* L'ANIMATEUR·ICE DONNE LA PAROLE : la file avance pour tout le monde. */
  const premier = (await file(A))[0];
  await A.evaluate(() => {
    const li = document.querySelector("#mains-liste li");
    const b = li && li.querySelector(".main-x");
    if (b) b.click();
  });
  await dodo(LATENCE_ECRIT + 1400);
  const apres = await file(B);
  t("l'animateur·ice fait avancer la file", apres.indexOf(premier) === -1,
    "premier=" + premier + " reste=" + apres.join(","));

  /* LE MESSAGE S'AFFICHE TOUT DE SUITE chez soi, et vite chez les autres. */
  const vuMoi = await B.evaluate(async () => {
    const t0 = performance.now();
    const c = document.getElementById("chat-texte");
    c.value = "on peut couper le lot 3 ?";
    document.getElementById("chat-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    for (let i = 0; i < 200; i++) {
      if (/lot 3/.test(document.getElementById("chat-fil").textContent || "")) return performance.now() - t0;
      await new Promise((r) => setTimeout(r, 5));
    }
    return -1;
  });
  t("son propre message s'affiche sans attendre le serveur", vuMoi >= 0 && vuMoi < 300,
    Math.round(vuMoi) + " ms");
  await dodo(LATENCE_ECRIT + 1600);
  t("et il arrive chez les autres",
    await A.evaluate(() => /lot 3/.test(document.getElementById("chat-fil").textContent || "")));
  t("une seule fois, pas deux",
    (await A.evaluate(() => document.querySelectorAll("#chat-fil .msg").length)) === 1,
    String(await A.evaluate(() => document.querySelectorAll("#chat-fil .msg").length)));
  t("avec le nom de qui l'a ecrit",
    await A.evaluate(() => /Bleu/.test(document.querySelector("#chat-fil .msg-qui").textContent || "")));

  /* UN MESSAGE RECU BARRE FERMEE DOIT SE SIGNALER, sinon la conversation ne
     sert a rien : on ne regarde pas une barre fermee. */
  await C.evaluate(() => document.getElementById("causerie-fermer").click());
  await dodo(300);
  await B.evaluate(() => {
    document.getElementById("chat-texte").value = "je dois partir a 17 h";
    document.getElementById("chat-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  await dodo(LATENCE_ECRIT + 1800);
  const pastille = await C.evaluate(() => {
    const b = document.getElementById("rail-pastille");
    return { vu: !b.hidden, n: b.textContent };
  });
  t("un message recu barre fermee allume une pastille", pastille.vu, JSON.stringify(pastille));
  await C.evaluate(() => document.getElementById("btn-rail").click());
  await dodo(400);
  t("et la pastille s'eteint quand on ouvre",
    await C.evaluate(() => document.getElementById("rail-pastille").hidden));

  /* ON NE TAPE PAS « m » DANS LA CONVERSATION POUR LEVER LA MAIN. */
  const avantM = await C.evaluate(() => document.getElementById("btn-main").getAttribute("aria-pressed"));
  await C.evaluate(() => document.getElementById("chat-texte").focus());
  await C.keyboard.type("comment");
  await dodo(400);
  t("ecrire « comment » ne leve pas la main",
    (await C.evaluate(() => document.getElementById("btn-main").getAttribute("aria-pressed"))) === avantM
    && (await C.evaluate(() => document.getElementById("chat-texte").value)) === "comment");

  /* PARLER SANS ECRIRE. Pendant qu'on anime, taper « oui je suis d'accord »
     coute plus cher que ce que ca rapporte : on ne le fait pas, et le fil
     reste vide alors que le groupe a des choses a dire. */
  const nbMsg = (p) => p.evaluate(() => document.querySelectorAll("#chat-fil .msg").length);
  const avantEmo = await nbMsg(B);
  await C.evaluate(() => document.querySelector('#chat-vite button[data-emo="👍"]').click());
  await dodo(LATENCE_ECRIT + 1600);
  t("un signe part en un seul geste", (await nbMsg(B)) === avantEmo + 1,
    avantEmo + " -> " + (await nbMsg(B)));
  t("et il se lit en grand, pas noye dans la colonne",
    await B.evaluate(() => {
      const m = [...document.querySelectorAll("#chat-fil .msg-corps")].pop();
      return !!m && m.classList.contains("signes") && parseFloat(getComputedStyle(m).fontSize) >= 18;
    }));

  /* LA PALETTE INSERE AU CURSEUR, pas en bout de ligne : on ajoute un signe au
     milieu d'une phrase deja ecrite, et la renvoyer a la fin oblige a tout
     recommencer. */
  const insere = await C.evaluate(async () => {
    const c = document.getElementById("chat-texte");
    c.value = "deux cartes"; c.focus(); c.setSelectionRange(4, 4);
    document.getElementById("chat-emo").click();
    await new Promise((f) => setTimeout(f, 150));
    const b = document.querySelector("#chat-palette button");
    const signe = b.textContent;
    b.click();
    return { valeur: c.value, attendu: "deux" + signe + " cartes", ouverte: !document.getElementById("chat-palette").hidden };
  });
  t("la palette d'emoji s'ouvre", insere.ouverte);
  t("et le signe s'insere la ou est le curseur", insere.valeur === insere.attendu,
    insere.valeur + " / " + insere.attendu);
  await C.evaluate(() => { document.getElementById("chat-texte").value = ""; document.getElementById("chat-emo").click(); });

  /* LA MAIN LEVEE SE RECONNAIT SANS LIRE. */
  t("chaque main levee porte son signe",
    await A.evaluate(() => [...document.querySelectorAll("#mains-liste li")]
      .every((li) => (li.querySelector(".main-signe") || {}).textContent === "✋")));

  /* LE PANNEAU SE REPLIE ET SE DEPLACE, comme la reserve : pose en colonne
     fixe, il mangeait une bande de l'ecran en permanence et se trouvait
     toujours devant quelque chose. */
  const boite = (p) => p.evaluate(() => {
    const r = document.getElementById("causerie").getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) };
  });
  const avantRepli = await boite(C);
  await C.evaluate(() => document.getElementById("causerie-toggle").click());
  await dodo(300);
  t("le panneau se replie", (await boite(C)).h < avantRepli.h / 2,
    avantRepli.h + " -> " + (await boite(C)).h);
  await C.evaluate(() => document.getElementById("causerie-toggle").click());
  await dodo(300);
  t("et se redeploie", (await boite(C)).h > avantRepli.h / 2);
  const dep = await C.evaluate(async () => {
    const po = document.getElementById("causerie-poignee");
    const r = po.getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 11, button: 0 });
    po.dispatchEvent(new PointerEvent("pointerdown", o(r.x + 5, r.y + 5)));
    po.dispatchEvent(new PointerEvent("pointermove", o(r.x + 125, r.y - 85)));
    po.dispatchEvent(new PointerEvent("pointerup", o(r.x + 125, r.y - 85)));
    await new Promise((f) => setTimeout(f, 120));
    const z = document.getElementById("causerie").getBoundingClientRect();
    return { x: Math.round(z.x), y: Math.round(z.y) };
  });
  t("et se deplace a la poignee", Math.abs(dep.x - avantRepli.x) > 60,
    JSON.stringify(avantRepli) + " -> " + JSON.stringify(dep));
  /* La place choisie est retenue : un panneau qui revient a sa place par
     defaut a chaque rechargement, on cesse de le deplacer. */
  t("et la place choisie est retenue",
    await C.evaluate(() => { try { return !!JSON.parse(localStorage.getItem("fresque:causpos")); } catch (e) { return false; } }));

  /* LE PANNEAU NE COUVRE PAS LE TABLEAU AU POINT DE LE RENDRE INUTILISABLE :
     il est en surcouche, le tableau garde sa taille. */
  const place = await C.evaluate(() => {
    const r = document.getElementById("causerie").getBoundingClientRect();
    const s = document.getElementById("scene").getBoundingClientRect();
    return { large: r.width, scene: s.width, dedans: r.right <= s.right + 1 && r.top >= s.top - 1 };
  });
  t("le panneau tient dans la scene sans la retailler", place.dedans && place.large > 200,
    JSON.stringify(place));

  await C.context().close();
});

/* ========================================================================== */
/* DEUX FORMATS D'EXPORT, ET SANS ATTENDRE.
   Le bouton n'apparaissait qu'une fois les 38 cartes posees : on ne pouvait
   emporter ni la trace d'un lot termine, ni un travail en cours. Et le PNG
   seul ne suffit pas : il ne s'agrandit pas sans bavouiller et ne se retouche
   pas. Ce qui peut casser en silence : un SVG qui sort mais ne s'ouvre pas,
   ou qui perd les illustrations, les fleches ou les pointilles. */
console.log("\n--- Export PNG et SVG ---");
await bloc("Export", async () => {
  t("les deux formats sont dans le menu Affichage, sans condition",
    await A.evaluate(() => {
      const m = document.getElementById("menu-affichage");
      return !!m && !!m.querySelector("#btn-export") && !!m.querySelector("#btn-export-svg");
    }));

  // Un lien en pointille, pour verifier qu'il voyage jusqu'a l'export.
  await A.evaluate(() => {
    const h = document.querySelector("#fleches .hit");
    if (h) h.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await dodo(400);
  await A.evaluate(() => { const b = document.querySelector(".fleche-pointille"); if (b) b.click(); });
  await dodo(LATENCE_ECRIT + 1200);
  t("un lien peut passer en pointille",
    await A.evaluate(() => !!document.querySelector("#fleches .trait.pointille")));

  await A.evaluate(() => document.getElementById("btn-affichage").click());
  const attente = A.waitForEvent("download", { timeout: 40000 });
  await A.evaluate(() => document.getElementById("btn-export-svg").click());
  const d = await attente.catch(() => null);
  t("le SVG se telecharge", !!d && /\.svg$/.test(d.suggestedFilename()), d ? d.suggestedFilename() : "aucun");
  if (d) {
    const dest = path.join(RACINE, "scripts", ".export-banc.svg");
    await d.saveAs(dest);
    const svg = fs.readFileSync(dest, "utf8");
    fs.unlinkSync(dest);
    t("il contient les illustrations des cartes", (svg.match(/<image /g) || []).length > 0,
      (svg.match(/<image /g) || []).length + " images");
    t("les fleches y sont des traits, pas des pixels", /<path /.test(svg));
    t("et le pointille a suivi", /stroke-dasharray/.test(svg));
    /* UN SVG QUI NE S'OUVRE PAS EST UN FICHIER MORT : on le rend vraiment. */
    const ctxS = await nav.newContext({ viewport: { width: 900, height: 600 } });
    const pgS = await ctxS.newPage();
    const erreurs = [];
    pgS.on("pageerror", (e) => erreurs.push(e.message));
    await pgS.setContent('<img src="data:image/svg+xml;base64,' + Buffer.from(svg).toString("base64") + '" id="i">');
    const bon = await pgS.evaluate(() => new Promise((ok) => {
      const i = document.getElementById("i");
      if (i.complete) return ok(i.naturalWidth > 0);
      i.onload = () => ok(i.naturalWidth > 0);
      i.onerror = () => ok(false);
      setTimeout(() => ok(i.naturalWidth > 0), 3000);
    }));
    t("et il s'ouvre vraiment comme une image", bon && !erreurs.length, erreurs.join(" | "));
    await ctxS.close();
  }
});

/* ========================================================================== */
t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 4).join(" | "));

console.log("\n" + bilan.join("\n"));
console.log("\n" + (ko ? "❌" : "✅") + " Tableau en ligne : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
