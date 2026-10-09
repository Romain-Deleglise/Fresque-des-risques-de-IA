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
let publie = [];              // le calque des corrections deja en ligne
const resume = (l) => l.map((b) => ({ n: b.n, titre: b.titre || "", champs: Object.keys(b).filter((k) => k !== "n") }));
await pg.route("**/.netlify/functions/commentaires**", (r) => r.fulfill({ status: 200,
  contentType: "application/json", body: JSON.stringify({ ok: true, compte: {}, retours: [] }) }));
/* LE CALQUE PUBLIC, celui que TOUTES les pages lisent par-dessus cartes.json. */
await pg.route("**/.netlify/functions/cartes-publiees**", (r) => r.fulfill({ status: 200,
  contentType: "application/json", body: JSON.stringify({ ok: true, cartes: publie }) }));
await pg.route("**/.netlify/functions/brouillons**", async (r) => {
  const req = r.request();
  const rep = (c) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
  if (req.method() === "GET") return rep({ ok: true, brouillons, resume: [], publie: resume(publie) });
  const c = JSON.parse(req.postData() || "{}");
  if (c.action === "enregistrer") {
    /* Le bouchon imite le vrai service : il ne garde QUE les champs proposes, et
       decoupe les textes en paragraphes comme serveur/src/brouillons.js. Un
       bouchon qui rendrait une chaine la ou le service rend un tableau ferait
       passer un banc sur un comportement que la production n'a pas. */
    const paras = (v) => String(v || "").split(/\n{2,}|\r?\n/).map((x) => x.trim()).filter(Boolean);
    const b = Object.assign({}, brouillons.find((x) => x.n === c.n) || { n: c.n });
    if (c.titre !== undefined) b.titre = c.titre;
    if (c.verso !== undefined) b.verso = paras(c.verso);
    if (c.explication !== undefined) b.explication = paras(c.explication);
    brouillons = brouillons.filter((x) => x.n !== c.n).concat([b]);
    return rep({ ok: true, nombre: brouillons.length });
  }
  if (c.action === "oublier") {
    brouillons = brouillons.filter((b) => b.n !== c.n);
    return rep({ ok: true });
  }
  if (c.action === "publier") {
    publie = publie.filter((b) => !brouillons.some((x) => x.n === b.n)).concat(brouillons);
    brouillons = [];
    return rep({ ok: true, enLigne: true, resume: [], publie: resume(publie) });
  }
  return rep({ ok: true, fichier: { cartes: [] }, resume: [] });
});

await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
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

/* PUBLIER MET EN LIGNE, IL NE TELECHARGE PLUS. C'etait le reproche : corriger
   une explication obligeait a telecharger cartes.json, le deposer dans le
   depot, attendre la CI et une relecture. Pour une virgule. */
console.log("\n--- Publier applique tout de suite ---");
await pg.evaluate(() => {
  document.getElementById("e-titre").value = "Amélioration des capacités (en ligne)";
  document.getElementById("e-enregistrer").click();
});
await pg.waitForTimeout(600);
const tele = pg.waitForEvent("download", { timeout: 2500 }).catch(() => null);
await pg.evaluate(() => { window.alert = () => {}; document.getElementById("publier-modifs").click(); });
await pg.waitForTimeout(1200);
t("publier ne telecharge plus rien", (await tele) === null);
const vivant = await pg.evaluate(() => ({
  etat: document.getElementById("e-etat").textContent,
  surLaFresque: (document.querySelector('.c-carte[data-n="3"] .tit') || {}).textContent,
  dansLaGrille: (document.querySelector('.g-carte[data-n="3"] .g-tit') || {}).textContent,
  publier: !document.getElementById("publier-modifs").hidden,
  deposer: document.getElementById("deposer-modifs")
    ? !document.getElementById("deposer-modifs").hidden : false,
  texteDeposer: document.getElementById("deposer-modifs")
    ? document.getElementById("deposer-modifs").textContent : ""
}));
t("l'etat dit que c'est en ligne", /en ligne/i.test(vivant.etat), vivant.etat);
/* LE TEXTE CHANGE SOUS LES YEUX. Sans vider le cache du calque deja lu,
   l'outil reafficherait l'ancien titre et on croirait que publier n'a rien
   fait : c'est exactement ce qui se passait avant. */
t("le titre corrige apparait sur la fresque", /en ligne/.test(vivant.surLaFresque || ""), vivant.surLaFresque);
t("et dans la vue Cartes", /en ligne/.test(vivant.dansLaGrille || ""), vivant.dansLaGrille);
t("le bouton de publication disparait : il n'y a plus de brouillon", !vivant.publier);
t("un bouton propose de replier la correction dans le depot",
  vivant.deposer && /1/.test(vivant.texteDeposer), vivant.texteDeposer);

/* LE CALQUE N'EST PAS QUE POUR L'OUTIL. Un titre corrige doit se lire partout,
   sinon le site se contredit d'une page a l'autre. Et une correction qui
   n'arrive pas se diagnostique mal : un chemin de script faux ne produit
   aucune erreur, juste l'ancien texte. */
/* LE CAS QUI A MOTIVE TOUT CECI : ajouter une explication a une carte qui n'en
   a pas. Le bloc « Explications » du panneau est masque tant que la carte n'en
   porte aucune : publier doit non seulement changer le texte, mais faire
   apparaitre un bloc qui n'existait pas. */
console.log("\n--- Ajouter une explication a une carte qui n'en avait pas ---");
const sansExpl = await pg.evaluate(() => {
  const el = document.getElementById("panneau-explication");
  return !!el && el.hidden;
});
await ouvrirCarte();
await pg.waitForTimeout(400);
await pg.evaluate(() => {
  document.getElementById("e-expl").value = "Une explication ajoutée depuis l'outil.";
  document.getElementById("e-enregistrer").click();
});
await pg.waitForTimeout(600);
await pg.evaluate(() => { window.alert = () => {}; document.getElementById("publier-modifs").click(); });
await pg.waitForTimeout(1300);
const expl = await pg.evaluate(() => {
  const el = document.getElementById("panneau-explication");
  return { cache: !el || el.hidden, texte: el ? el.textContent : "",
    panneauOuvert: !document.getElementById("panneau").hidden };
});
t("la carte reste ouverte : publier ne doit pas la refermer", expl.panneauOuvert);
t("le bloc Explications etait bien masque au depart", sansExpl);
t("l'explication publiee apparait dans le panneau, sans rechargement",
  !expl.cache && /ajoutée depuis l'outil/.test(expl.texte), expl.texte.slice(0, 60));

/* LE DEPOT N'EST CONCERNE QUE PAR CE QUI EST IMPRIME. Une explication ne figure
   sur aucune carte du jeu : reclamer un depot pour elle n'est qu'un faux devoir,
   et c'est ce qu'on reprochait au premier jet. Seuls un titre ou un verso
   corriges rendent la planche imprimee fausse. */
console.log("\n--- Le depot n'est reclame que pour ce qui est imprime ---");
publie = [{ n: 3, explication: ["Seulement une explication."] }];
await pg.evaluate(() => {
  document.getElementById("jeton").value = "jeton-de-banc-123456";
  document.getElementById("form-jeton").requestSubmit();
});
await pg.waitForTimeout(600);
t("une explication seule ne reclame pas le depot", !(await vu("deposer-modifs")));
publie = [{ n: 3, titre: "Un titre corrigé" }];
await pg.evaluate(() => document.getElementById("form-jeton").requestSubmit());
await pg.waitForTimeout(600);
t("un titre corrige, lui, le reclame : il est imprime sur la carte", await vu("deposer-modifs"));
publie = [{ n: 3, titre: "Un titre corrigé", explication: ["Et une explication."] }];
await pg.evaluate(() => document.getElementById("form-jeton").requestSubmit());
await pg.waitForTimeout(600);
t("et le compte ne porte que les cartes imprimees concernees",
  /\(1\)/.test(await pg.textContent("#deposer-modifs")), await pg.textContent("#deposer-modifs"));

console.log("\n--- Le calque atteint tout le site ---");
/* La galerie de l'accueil ne montre que six cartes choisies (voir GALERIE dans
   assets/js/cartes.js) : on corrige l'une d'elles, sinon on verifierait qu'un
   texte absent de la page n'y apparait pas. */
publie = publie.concat([{ n: 6, titre: "Boîte noire (en ligne)" }]);
await pg.goto(B + "/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1000);
/* Le titre y est porte par le nom accessible du bouton : la galerie montre les
   VRAIES cartes, images sur lesquelles le titre est deja imprime. Le calque
   corrige le texte, pas les images, qui se refabriquent depuis le depot. */
t("l'accueil public lit le calque",
  await pg.evaluate(() => [].slice.call(document.querySelectorAll(".gc"))
    .some((b) => (b.getAttribute("aria-label") || "").indexOf("Boîte noire (en ligne)") !== -1)));

/* CHAQUE PAGE QUI LIT LES CARTES CHARGE LE CALQUE, et par un chemin qui existe.
   Un `src` faux ne leve rien : la page affiche simplement l'ancien texte, et on
   cherche longtemps pourquoi la correction « n'a pas marche ». */
console.log("\n--- Le calque est charge, par un chemin qui existe ---");
for (const f2 of ["site/index.html", "site/en/index.html", "site/en-ligne/session/index.html",
                  "site/animateurs/index.html", "site/animateurs/retours/index.html",
                  "site/en/facilitators/reference/index.html"]) {
  const src = fs.readFileSync(path.join(RACINE, f2), "utf8");
  const m2 = src.match(/<script src="([^"]*calque-cartes\.js)"/);
  const vise = m2 ? path.resolve(path.dirname(path.join(RACINE, f2)), m2[1]) : null;
  t(f2.replace("site/", "") + " charge le calque", !!m2 && fs.existsSync(vise),
    m2 ? m2[1] : "aucun script");
}

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Edition des cartes : " + (28 - ko) + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
