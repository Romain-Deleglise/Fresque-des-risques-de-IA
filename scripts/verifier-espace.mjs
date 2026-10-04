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

console.log("\n--- L'apercu depliable, sur l'accueil de l'espace ---");
await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
await pg.waitForFunction(() => document.querySelectorAll("#cartes .c-carte").length > 30,
  null, { timeout: 20000 }).catch(() => {});
const lireApercu = () => pg.evaluate(() => ({
  replie: document.getElementById("apercu").hidden,
  libelle: document.getElementById("btn-apercu").textContent.replace(/\s+/g, " ").trim(),
  deplie: document.getElementById("btn-apercu").getAttribute("aria-expanded"),
  cadre: document.getElementById("plateau-cadre").clientWidth,
  plein: !!document.fullscreenElement,
  /* LECTURE SEULE : ni bascule « mode commentaires », ni formulaire, ni
     moderation. C'est la meme fresque que l'onglet Retours, sans ce qui sert a
     commenter. */
  modeCom: !!document.getElementById("mode-commentaires"),
  formulaire: !!document.getElementById("form-general"),
  jeton: !!document.getElementById("form-jeton")
}));
let a = await lireApercu();
t("la fresque est repliee a l'arrivee", a.replie && a.deplie === "false", JSON.stringify(a));
t("et l'accueil ne propose ni commentaires ni moderation",
  !a.modeCom && !a.formulaire && !a.jeton, JSON.stringify(a));

const avantDefil = await pg.evaluate(() => window.scrollY);
await pg.evaluate(() => document.getElementById("btn-apercu").click());
await pg.waitForTimeout(900);
a = await lireApercu();
/* LE BOUTON N'EMMENE PAS AILLEURS. Il faisait descendre la page jusqu'a la
   fresque : on perdait de vue le texte qu'on lisait. Le clic est declenche par
   programme, sinon c'est le banc qui amene le bouton a l'ecran et la mesure ne
   veut plus rien dire. */
t("le dépliage ne fait pas défiler la page",
  (await pg.evaluate(() => window.scrollY)) === avantDefil,
  "défilement de " + ((await pg.evaluate(() => window.scrollY)) - avantDefil) + " px");
const largeurDepliee = a.cadre;
t("le bouton la deplie sur la meme page", !a.replie && a.deplie === "true", JSON.stringify(a));
t("et devient « Masquer la fresque de référence »", /^Masquer/.test(a.libelle), a.libelle);
/* Le plateau se met a l'echelle d'apres la largeur de son cadre, et un bloc
   `hidden` n'a pas de largeur : sans recadrage apres depliage, la fresque
   s'ouvrait a une echelle calculee sur zero pixel. */
t("la fresque est recadree apres le depliage", a.cadre > 300, "cadre " + a.cadre + " px");

await pg.click("#plein-ecran");
await pg.waitForTimeout(800);
a = await lireApercu();
t("« Plein écran » passe par-dessus toute la page, sans changer de page",
  a.plein && !a.replie, JSON.stringify(a));
/* La sortie est declenchee ici par programme : en navigateur sans fenetre, la
   touche Echap ne rend pas la main sur le plein ecran natif. C'est une limite
   du banc, pas du site : le navigateur gere Echap lui-meme. */
/* LE PANNEAU DOIT RESTER ATTEIGNABLE EN PLEIN ECRAN. Il etait un FRERE du
   plateau, hors de l'element passe en plein ecran : le navigateur ne le
   dessinait pas du tout, et cliquer une carte ne montrait plus son verso. */
await pg.click("#cartes .c-carte[data-n='9']");
await pg.waitForTimeout(700);
const enPlein = await pg.evaluate(() => {
  const z = document.getElementById("fresque-zone");
  const pan = document.getElementById("panneau");
  const r = pan.getBoundingClientRect();
  return {
    panneau: !pan.hidden && r.width > 50 && r.right <= innerWidth + 2 && r.top >= -2,
    ascenseur: z.scrollHeight - z.clientHeight,
    fermer: !!document.getElementById("apercu-fermer"),
    modeCom: !!document.getElementById("mode-commentaires")
  };
});
t("cliquer une carte montre son verso, même en plein écran", enPlein.panneau, JSON.stringify(enPlein));
/* AUCUN ASCENSEUR. On se deplace dans le plateau, pas dans la page. */
t("le plein écran n'a aucun ascenseur", enPlein.ascenseur === 0, "débordement de " + enPlein.ascenseur + " px");
t("un bouton « Fermer ✕ » est disponible", enPlein.fermer);
t("et l'accueil reste sans mode commentaires", !enPlein.modeCom);

/* On referme le panneau avant de mesurer : ouvert, il retrecit legitimement le
   cadre (`.panneau-ouvert .plateau-cadre`), et la comparaison ne porterait plus
   sur la meme chose. */
await pg.evaluate(() => document.getElementById("panneau-fermer").click());
await pg.waitForTimeout(300);
await pg.evaluate(() => document.exitFullscreen());
await pg.waitForTimeout(800);
a = await lireApercu();
t("en sortir ramene la fresque a sa taille d'avant",
  !a.plein && Math.abs(a.cadre - largeurDepliee) < 8,
  "avant " + largeurDepliee + " px, apres " + a.cadre + " px");

await pg.evaluate(() => document.getElementById("apercu-fermer").click());
await pg.waitForTimeout(400);
t("« Fermer » replie", (await lireApercu()).replie);
await pg.evaluate(() => document.getElementById("btn-apercu").click());
await pg.waitForTimeout(600);
await pg.keyboard.press("Escape");
await pg.waitForTimeout(400);
t("Echap replie aussi", (await lireApercu()).replie);

await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForSelector("#plateau-section:not([hidden])", { timeout: 20000 }).catch(() => {});

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

/* LE BOUTON « AJUSTER » A ETE RETIRE : le recadrage se fait tout seul quand il
   le faut. Un bouton qu'il faut penser a presser pour que l'affichage soit
   correct n'est pas une option, c'est un defaut deguise. */
for (const u of ["/animateurs/", "/animateurs/retours/"]) {
  await pg.goto(B + u, { waitUntil: "networkidle" });
  t("plus de bouton « Ajuster » sur " + u,
    !(await pg.evaluate(() => !!document.getElementById("zoom-ajuste"))));
}

/* ── UN SEUL OUTIL POUR LES DEUX PAGES ───────────────────────
   Le HTML de l'outil etait COPIE dans les deux pages : toute evolution devait
   etre ecrite deux fois, et il suffisait d'en oublier une pour que les pages
   divergent sans que rien ne le signale. Il n'existe plus qu'une fois, dans
   animateurs.js, et chaque page ne porte qu'un conteneur vide. */
console.log("\n--- Un seul outil, deux pages ---");
for (const f of ["site/animateurs/index.html", "site/animateurs/retours/index.html"]) {
  const src = fs.readFileSync(path.join(RACINE, f), "utf8");
  t(f.replace("site/", "") + " ne contient plus le HTML de l'outil",
    !/plateau-sizer|panneau-corps|id="lots"/.test(src) && /id="fresque-outil"/.test(src));
}

console.log("\n--- Le selecteur de vue et la vue Cartes ---");
for (const [u, avecRetours] of [["/animateurs/retours/", true], ["/animateurs/", false]]) {
  await pg.goto(B + u, { waitUntil: "networkidle" });
  if (u === "/animateurs/") await pg.click("#btn-apercu").catch(() => {});
  await pg.waitForTimeout(1200);
  const d = await pg.evaluate(() => ({
    selecteur: !!document.getElementById("vue-cartes") && !!document.getElementById("vue-fresque"),
    parDefaut: document.getElementById("vue-fresque").getAttribute("aria-pressed"),
    grilleCachee: document.getElementById("grille-cartes").hidden,
    ongletExpl: !!document.getElementById("onglet-expl"),
    ongletRetours: !!document.getElementById("onglet-retours"),
    modeCom: !!document.getElementById("mode-commentaires"),
    pastillesFresque: document.querySelectorAll(".c-carte .pastille").length,
    zone: Math.round(document.querySelector(".fresque-zone").getBoundingClientRect().width),
    fenetre: window.innerWidth,
    deborde: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  }));
  t(u + " porte le selecteur de vue", d.selecteur);
  t(u + " ouvre sur la vue Fresque", d.parDefaut === "true" && d.grilleCachee);
  t(u + " a l'onglet Explications", d.ongletExpl);
  t(u + (avecRetours ? " a l'onglet Retours" : " n'a PAS d'onglet Retours"), d.ongletRetours === avecRetours);
  t(u + (avecRetours ? " a le mode commentaires" : " n'a PAS de mode commentaires"), d.modeCom === avecRetours);
  /* Le plan porte deja numeros, lots et fleches : un chiffre de plus s'y
     perdait. Le compte se lit sur la vue Cartes et sur l'onglet Retours. */
  t(u + " n'a aucune pastille sur les cartes de la fresque", d.pastillesFresque === 0, String(d.pastillesFresque));
  /* La zone prend toute la largeur de la fenetre, sans defilement lateral. */
  t(u + " : la fresque occupe toute la largeur", d.zone === d.fenetre, d.zone + " / " + d.fenetre);
  t(u + " : aucun debordement lateral", d.deborde === 0, String(d.deborde));

  // La vue Cartes : 38 cartes, la carte 0 exclue, le zoom sans objet.
  await pg.click("#vue-cartes");
  await pg.waitForTimeout(500);
  const g = await pg.evaluate(() => ({
    n: document.querySelectorAll(".g-carte").length,
    zero: !!document.querySelector('.g-carte[data-n="0"]'),
    ordre: [...document.querySelectorAll(".g-carte")].map((e) => +e.dataset.n),
    plateauCache: document.getElementById("plateau-cadre").hidden,
    zoomCache: document.getElementById("zoom-plus").hidden
  }));
  t(u + " : 38 cartes en vue Cartes, sans la carte 0", g.n === 38 && !g.zero, String(g.n));
  t(u + " : par numero croissant", String(g.ordre) === String([...g.ordre].sort((a2, b2) => a2 - b2)));
  t(u + " : le plateau et le zoom s'effacent", g.plateauCache && g.zoomCache);
}

/* LE VIDE ENTRE LE TABLEAU ET LE PANNEAU. La largeur du panneau et le retrait
   du plateau etaient ecrits deux fois, et differemment : au-dela de 1050 px de
   fenetre, une bande vide s'ouvrait entre les deux et grandissait avec l'ecran. */
console.log("\n--- Le panneau touche le tableau ---");
await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1200);
await pg.click('.c-carte[data-n="3"]');
await pg.waitForTimeout(400);
const vide = await pg.evaluate(() => {
  const p = document.getElementById("panneau").getBoundingClientRect();
  const c = document.getElementById("plateau-cadre").getBoundingClientRect();
  return Math.round(p.left - c.right);
});
t("aucun vide entre le bord du tableau et le panneau", vide === 0, vide + " px");

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 3).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Espace animateur·ices : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
