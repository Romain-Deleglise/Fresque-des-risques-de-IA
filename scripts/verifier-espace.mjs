/* Banc de l'espace animateur·ices.

   L'espace a ete ramene a QUATRE ONGLETS : Fresque, Guide, Antiseche, Retours.
   Il en avait cinq et un sommaire, la fresque etait rangee dans l'onglet
   Retours (c'est-a-dire la ou l'on vient ecrire, pas regarder), et commenter
   demandait d'activer un mode, de trouver la carte, d'ouvrir son panneau et de
   choisir un onglet. Ce banc protege la forme simplifiee :

   - QUATRE ONGLETS, LES MEMES PARTOUT. Naviguer renvoyait aux onglets du site
     public, d'ou l'on ne revenait qu'avec le bouton « precedent ».
   - LA FRESQUE EST LE SUJET DE SA PAGE. Elle s'affichait apres un clic, dans un
     bloc depliable, sur une page qui n'etait qu'une table des matieres.
   - UN LOT ECARTE DISPARAIT. Grise, il restait a l'ecran avec toutes les
     fleches par-dessus : on ne regardait jamais un lot seul.
   - LE PLEIN ECRAN REND L'ECRAN A LA FRESQUE. La barre d'outils, la legende et
     l'aide en prenaient un quart.
   - LA PAGE RETOURS EST UN FORMULAIRE. Rien d'autre : la relecture est dans
     /admin/, avec les autres retours.

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

const ONGLETS = ["Fresque", "Guide", "Antisèche", "Retours"];
const PAGES = ["/animateurs/", "/animateurs/retours/", "/animateurs/antiseche/",
               "/animateurs/minuteur/", "/animateurs/kit/"];

console.log("\n--- Quatre onglets, les memes partout ---");
for (const u of PAGES) {
  await pg.goto(B + u, { waitUntil: "networkidle" });
  const onglets = await pg.evaluate(() => {
    const n = document.querySelector('nav[aria-label^="Espace"]');
    return n ? [...n.querySelectorAll("a")].map((a) => a.textContent.trim()) : null;
  });
  t("les quatre onglets sur " + u, JSON.stringify(onglets) === JSON.stringify(ONGLETS),
    JSON.stringify(onglets));
}

/* LE GUIDE EST UNE PAGE PUBLIQUE : il ne reprend les onglets de l'espace que
   lorsqu'on y arrive avec ?espace=1, et les rend a un visiteur ordinaire. */
await pg.goto(B + "/guide/?espace=1", { waitUntil: "networkidle" });
await pg.waitForTimeout(400);
/* ON VERIFIE LE CONTENU, pas la seule presence : le guide reconstruit sa barre
   en JavaScript, et il affichait a lui seul l'ancienne, cinq entrees dont deux
   menaient a des pages supprimees. Une barre « presente » ne dit rien. */
const barreGuide = await pg.evaluate(() => {
  const n = document.querySelector('nav[aria-label^="Espace"]');
  return n ? [...n.querySelectorAll("a")].map((a) => a.textContent.trim()) : null;
});
t("le guide reprend LES MEMES onglets quand on y arrive depuis l'espace",
  JSON.stringify(barreGuide) === JSON.stringify(ONGLETS), JSON.stringify(barreGuide));
t("et aucun de ses liens ne mene a une page supprimee",
  await pg.evaluate(() => {
    const n = document.querySelector('nav[aria-label^="Espace"]');
    return !n || ![...n.querySelectorAll("a")].some((a) => /outils|#fresque/.test(a.getAttribute("href")));
  }));
await pg.goto(B + "/guide/", { waitUntil: "networkidle" });
await pg.waitForTimeout(400);
t("et les rend a un visiteur ordinaire",
  await pg.evaluate(() => !document.querySelector('nav[aria-label^="Espace"]')));

console.log("\n--- La fresque est le sujet de sa page ---");
await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1500);
const f = await pg.evaluate(() => ({
  cartes: document.querySelectorAll(".c-carte").length,
  liens: document.querySelectorAll("#liens g[data-id]").length,
  lots: document.querySelectorAll(".lot-puce").length,
  jeton: !!document.getElementById("form-jeton"),
  modeCom: !!document.getElementById("mode-commentaires"),
  onglets: document.querySelectorAll("#panneau-onglets .onglet").length,
  deplier: !!document.getElementById("btn-apercu"),
  vues: document.querySelectorAll(".btn-vue").length
}));
t("les 38 cartes sont posees sans clic prealable", f.cartes === 38, String(f.cartes));
t("et leurs 65 liens", f.liens === 65, String(f.liens));
t("plus de bouton de depliage", !f.deplier);
t("le jeton de moderation est sur cette page : c'est ici qu'il sert", f.jeton);
t("plus de mode commentaires", !f.modeCom);
t("plus d'onglets dans le panneau : il n'a qu'un contenu", f.onglets === 0, String(f.onglets));
t("le selecteur de vue a ses deux positions", f.vues === 2, String(f.vues));

console.log("\n--- Un lot ecarte disparait, il ne palit pas ---");
await pg.evaluate(() => {
  document.querySelector('.lot-puce[data-lot="1"]').click();
  document.querySelector('.lot-puce[data-lot="2"]').click();
});
await pg.waitForTimeout(600);
const lots = await pg.evaluate(() => {
  const vis = (e) => getComputedStyle(e).display !== "none";
  const cartes = [...document.querySelectorAll(".c-carte")];
  return {
    visibles: cartes.filter(vis).length,
    pales: cartes.filter((e) => e.classList.contains("pale")).length,
    liens: [...document.querySelectorAll("#liens g[data-id]")].filter(vis).length,
    actives: document.querySelectorAll(".lot-puce.actif").length,
    zoom: (new DOMMatrixReadOnly(getComputedStyle(document.getElementById("plateau")).transform)).a
  };
});
t("deux lots se choisissent ensemble", lots.actives === 2, String(lots.actives));
t("seules leurs cartes restent a l'ecran", lots.visibles > 0 && lots.visibles < 38, String(lots.visibles));
t("aucune carte n'est simplement grisee", lots.pales === 0, String(lots.pales));
/* UNE FLECHE DONT UNE EXTREMITE A DISPARU partirait du vide. */
t("les fleches a cheval sur un lot ecarte s'en vont aussi", lots.liens < 65, String(lots.liens));
t("la vue se recadre sur ce qui reste", lots.zoom > 0.12, Math.round(lots.zoom * 100) + " %");

await pg.evaluate(() => document.querySelector('.lot-puce[data-lot=""]').click());
await pg.waitForTimeout(500);
t("« Tous » ramene les 38 cartes",
  await pg.evaluate(() => [...document.querySelectorAll(".c-carte")]
    .filter((e) => getComputedStyle(e).display !== "none").length) === 38);

console.log("\n--- Le panneau d'une carte ---");
await pg.evaluate(() => document.querySelector('.c-carte[data-n="3"]').click());
await pg.waitForTimeout(500);
const p = await pg.evaluate(() => ({
  ouvert: !document.getElementById("panneau").hidden,
  titre: (document.getElementById("panneau-titre") || {}).textContent,
  verso: (document.getElementById("panneau-verso") || {}).textContent.length,
  liens: document.querySelectorAll("#panneau-liens .vers-carte").length,
  commentaire: !!document.getElementById("panneau-commentaire")
}));
t("il s'ouvre au clic", p.ouvert);
t("il porte le titre et le verso", !!p.titre && p.verso > 40, p.titre);
t("et les cartes liees, cliquables", p.liens > 0, String(p.liens));
t("il ne porte plus de formulaire de commentaire", !p.commentaire);

/* LA ZONE RESTE DANS LA PAGE. Elle sortait sur toute la largeur de la fenetre :
   une bande de bord a bord au milieu d'une page qui a partout ailleurs une
   colonne de lecture. La pleine largeur est reservee au plein ecran. */
console.log("\n--- La fresque reste dans la page ---");
const large = await pg.evaluate(() => ({
  zone: document.getElementById("fresque-zone").getBoundingClientRect().width,
  fenetre: window.innerWidth,
  colonne: document.querySelector("#plateau-section .wrap").getBoundingClientRect().width
}));
t("la zone ne va pas bord a bord", large.zone < large.fenetre - 100,
  Math.round(large.zone) + " px pour une fenetre de " + large.fenetre);
t("et tient dans la colonne de la page", large.zone <= large.colonne + 1,
  Math.round(large.zone) + " pour " + Math.round(large.colonne));

/* ON DOIT VOIR QU'ON A CHANGE DE MAISON : meme logo, meme titre que le site
   public, seuls les onglets changeaient. */
t("l'en-tete annonce l'espace animateur·ices",
  await pg.evaluate(() => {
    const m = document.querySelector(".entete .marque-espace");
    return !!m && /animateur/i.test(m.textContent);
  }));

console.log("\n--- Le plein ecran rend l'ecran a la fresque ---");
await pg.evaluate(() => { document.getElementById("panneau-fermer").click();
  document.getElementById("plein-ecran").click(); });
await pg.waitForTimeout(900);
const pe = await pg.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; };
  return { plein: !!document.fullscreenElement,
    cadre: document.getElementById("plateau-cadre").getBoundingClientRect().height,
    fenetre: window.innerHeight, aide: vis("#barre-aide"), legende: vis(".cle-fleches"), lots: vis("#lots"),
    largeur: Math.round(document.getElementById("fresque-zone").getBoundingClientRect().width),
    largeurFenetre: window.innerWidth };
});
t("la zone passe en plein ecran", pe.plein);
t("l'aide et la legende se replient", !pe.aide && !pe.legende);
/* Les filtres restent : choisir ce qu'on montre est justement ce qu'on fait en
   plein ecran, devant un groupe. */
t("les filtres de lot restent accessibles", pe.lots);
t("le plateau prend au moins 80 % de l'ecran", pe.cadre / pe.fenetre >= 0.8,
  Math.round(100 * pe.cadre / pe.fenetre) + " %");
t("la zone prend alors toute la largeur", pe.largeur >= pe.largeurFenetre - 1,
  pe.largeur + " / " + pe.largeurFenetre);

/* ── ET LE VRAI PLEIN ECRAN ──────────────────────────────────
   Masquer la legende et l'aide ne suffisait pas : la barre d'outils et les
   filtres restaient, et c'est ce bandeau-la qu'on demandait a faire
   disparaitre. Il faut aussi pouvoir le rappeler, sinon on s'enferme devant un
   groupe. */
await pg.evaluate(() => document.getElementById("masquer-bandeau").click());
await pg.waitForTimeout(600);
const nu = await pg.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; };
  return { barre: vis(".barre"), lots: vis("#lots"), rappel: vis("#rappel-bandeau"),
    cadre: document.getElementById("plateau-cadre").getBoundingClientRect().height,
    fenetre: window.innerHeight };
});
t("la barre d'outils se replie entierement", !nu.barre);
t("les filtres aussi", !nu.lots);
t("une pastille permet de la rappeler", nu.rappel);
t("le plateau prend alors presque tout l'ecran", nu.cadre / nu.fenetre >= 0.93,
  Math.round(100 * nu.cadre / nu.fenetre) + " %");
await pg.keyboard.press("b");
await pg.waitForTimeout(400);
t("la touche B la ramene",
  await pg.evaluate(() => getComputedStyle(document.querySelector(".barre")).display !== "none"));
await pg.evaluate(() => document.exitFullscreen && document.exitFullscreen());
await pg.waitForTimeout(400);

console.log("\n--- La page Retours est un formulaire ---");
await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1200);
const r = await pg.evaluate(() => ({
  champs: ["g-sujet", "g-carte", "g-texte", "g-nom", "g-email"].filter((i) => !!document.getElementById(i)),
  cartes: document.querySelectorAll("#g-carte option").length,
  jeton: !!document.getElementById("form-jeton"),
  outil: !!document.getElementById("fresque-outil"),
  liste: !!document.getElementById("retours")
}));
t("les cinq champs demandes sont la", r.champs.length === 5, r.champs.join(","));
t("les 38 cartes sont proposees, plus « aucune »", r.cartes === 39, String(r.cartes));
t("plus de fresque sur cette page", !r.outil);
t("plus de liste de retours : la relecture est dans /admin/", !r.liste);
t("et donc plus de jeton : il n'y a plus rien a moderer ici", !r.jeton);

console.log("\n--- Pas de bande d'une autre teinte autour de l'outil ---");
await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1200);
t("aucun ancetre ne peint un fond plus etroit que l'outil",
  (await pg.evaluate(() => {
    const z = document.getElementById("fresque-zone");
    if (!z) return ["zone absente"];
    const l = z.getBoundingClientRect().width, out = [];
    let q = z.parentElement;
    while (q && q !== document.documentElement) {
      const c = getComputedStyle(q).backgroundColor;
      if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)
          && q.getBoundingClientRect().width < l - 1) out.push(q.id || q.tagName);
      q = q.parentElement;
    }
    return out;
  })).length === 0);

console.log("\n--- Les selecteurs ressemblent aux autres champs ---");
await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(900);
const sel = await pg.evaluate(() => {
  const s = document.getElementById("g-carte"), t2 = document.getElementById("g-texte");
  const cs = getComputedStyle(s), ct = getComputedStyle(t2);
  const env = s.closest(".select-joli");
  return { police: cs.fontFamily === ct.fontFamily, rayon: cs.borderRadius === ct.borderRadius,
    bord: cs.borderColor === ct.borderColor, apparence: cs.appearance,
    fleche: env ? getComputedStyle(env, "::after").content : "" };
});
t("meme police, meme arrondi, meme bord que le champ de texte",
  sel.police && sel.rayon && sel.bord, JSON.stringify(sel));
t("et la fleche maison a la place de celle du systeme",
  sel.apparence === "none" && /▾/.test(sel.fleche), sel.apparence + " " + sel.fleche);

/* ── CE QUI S'IMPRIME EXISTE-T-IL ? ──────────────────────────
   Une regle `@media print` ecrite pour la page du kit, mais posee dans la
   feuille que toutes les pages partagent, a rendu l'antiseche entierement
   blanche a l'impression, et le PDF engendre depuis elle avec. L'empreinte qui
   garde le PDF aligne sur sa page compare le HTML : la panne venait du CSS. */
console.log("\n--- Les pages imprimables impriment quelque chose ---");
for (const [nom, u, mini] of [["l'antiseche", "/animateurs/antiseche/", 1200],
                              ["le guide", "/guide/", 3000],
                              ["le kit (affiche seule)", "/animateurs/kit/", 200]]) {
  await pg.goto(B + u, { waitUntil: "networkidle" });
  await pg.emulateMedia({ media: "print" });
  await pg.waitForTimeout(350);
  const m = await pg.evaluate(() => {
    const z = document.querySelector("main") || document.body;
    const vus = [...z.querySelectorAll("*")].filter((e) => {
      const c = getComputedStyle(e), b = e.getBoundingClientRect();
      return c.display !== "none" && c.visibility !== "hidden" && b.width > 0 && b.height > 0;
    }).length;
    return { vus: vus, texte: z.innerText.replace(/\s+/g, " ").trim().length };
  });
  await pg.emulateMedia({ media: "screen" });
  t(nom + " imprime son contenu", m.texte >= mini && m.vus >= 10,
    m.vus + " element(s), " + m.texte + " caractere(s), minimum " + mini);
}
await pg.goto(B + "/animateurs/kit/", { waitUntil: "networkidle" });
await pg.emulateMedia({ media: "print" });
await pg.waitForTimeout(350);
t("le kit n'imprime que l'affiche, pas toute sa page",
  await pg.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; };
    return vis(".section-doux") && !vis("main > .section.no-print");
  }));
await pg.emulateMedia({ media: "screen" });

/* ── UN SEUL OUTIL, ECRIT UNE SEULE FOIS ─────────────────────
   Son HTML etait copie dans deux pages : toute evolution devait etre ecrite
   deux fois, et il suffisait d'en oublier une pour qu'elles divergent. */
console.log("\n--- Un seul outil, ecrit une seule fois ---");
for (const fichier of ["site/animateurs/index.html", "site/animateurs/retours/index.html"]) {
  const html = fs.readFileSync(path.join(RACINE, fichier), "utf8");
  t(fichier.replace("site/", "") + " ne contient pas le HTML de l'outil",
    !/plateau-sizer|panneau-corps|id="lots"/.test(html));
}

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Espace animateur·ices : " + ok + " verifications reussies, " + ko + " echouees.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
