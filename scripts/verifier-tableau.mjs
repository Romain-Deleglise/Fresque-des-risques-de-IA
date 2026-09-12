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
    // Le faux service doit respecter le MEME contrat que le vrai : ne jamais
    // servir un etat plus ancien que celui que le client dit deja avoir. Sans
    // cela on fabrique ici une situation qui n'existe pas en production (un
    // serveur qui fait reculer ses clients en boucle), et le harnais echoue au
    // hasard sur des mesures parfaitement justes.
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

/* A cette distance une carte fait une quarantaine de pixels : son illustration
   n'est plus qu'une tache, et cette tache recouvrait la seule chose encore
   lisible, la famille de la carte. La tuile prend donc la couleur du lot, et
   l'image se retire. Sans quoi le dezoom ne sert a rien : on voit que le tableau
   est rempli, pas ce qu'il raconte. */
const loin = await A.evaluate(() => {
  const el = document.querySelector(".c-carte");
  const img = el.querySelector(".vis img");
  const st = getComputedStyle(el);
  return {
    imageCachee: getComputedStyle(img).visibility === "hidden",
    fondLot: st.backgroundColor,
    boite: Math.round(el.offsetWidth) + "x" + Math.round(el.offsetHeight),
    legende: getComputedStyle(document.getElementById("legende")).display,
    nbLots: document.querySelectorAll("#legende b").length
  };
});
t("tout au fond, l'image de la carte s'efface au profit de la couleur du lot",
  loin.imageCachee && !/rgba\(0, 0, 0, 0\)|transparent/.test(loin.fondLot), JSON.stringify(loin));
t("et la boite de la carte n'a pas bouge pour autant (l'export en depend)",
  loin.boite === "150x150" || /^150x/.test(loin.boite), "boite " + loin.boite);
t("une legende dit ce que les couleurs veulent dire",
  loin.legende !== "none" && loin.nbLots === 5, "affichage " + loin.legende + ", " + loin.nbLots + " lots");

// Un cran a la fois : six clics dans la meme image ne font qu'un seul pas,
// puisqu'ils partent tous du meme zoom courant.
for (let i = 0; i < 5; i++) { await A.evaluate(() => document.getElementById("z-plus").click()); await dodo(260); }
await dodo(400);
const apresZoom = await A.evaluate(() => ({
  z: document.getElementById("z-niv").textContent,
  d: getComputedStyle(document.getElementById("legende")).display
}));
t("et elle disparait des qu'on se rapproche, ou elle n'aurait plus d'objet",
  apresZoom.d === "none", JSON.stringify(apresZoom));
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
t("et il garde une taille d'ecran constante, au lieu de retrecir avec le tableau",
  libEtapes.every((e) => e.haut >= 14)
  && (Math.max.apply(null, libEtapes.map((e) => e.haut)) - Math.min.apply(null, libEtapes.map((e) => e.haut))) <= 6,
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
  const ctxT = await nav.newContext({ viewport: { width: 1100, height: 800 }, hasTouch: true, isMobile: false });
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
  await ctxT.close();
});

/* ========================================================================== */
t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 4).join(" | "));

console.log("\n" + bilan.join("\n"));
console.log("\n" + (ko ? "❌" : "✅") + " Tableau en ligne : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
