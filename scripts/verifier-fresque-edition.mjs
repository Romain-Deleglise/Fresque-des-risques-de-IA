/* MODE EDITION DE LA FRESQUE DE REFERENCE : le parcours, dans un navigateur.

   CE QUE CE BANC PROTEGE. Le mode edition deplace des cartes et trace des
   liens dans un plan qui sera publie. Rien de tout cela ne se verifie sans
   navigateur : ce sont des gestes, une mise a l'echelle et une couche SVG.
   Les facons de mal faire, qu'aucun test unitaire ne verrait :
   - ouvrir le mode a qui n'a pas le jeton de moderation ;
   - deplacer la carte sans que les fleches suivent, ou en ignorant le zoom
     (la carte part alors deux fois plus loin que le pointeur) ;
   - ouvrir le panneau de lecture au relacher, qui masque ce qu'on vient de
     poser (un glisser emet un `click` en fin de course) ;
   - laisser sortir une carte du plan, ce que le serveur refuserait ensuite
     sans qu'on sache laquelle ;
   - rendre les liens inclicables : un trait de deux pixels ne se designe pas,
     d'ou le doublon transparent large de seize ;
   - oublier le clavier, seul chemin pour qui ne peut pas glisser.

   Le service de fond est bouchonne : ses regles sont verifiees a part, dans
   serveur/tests/fresque-brouillon.test.mjs et scripts/verifier-brouillons.cjs.

   Usage : node scripts/verifier-fresque-edition.mjs */
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

let ko = 0, total = 0;
const t = (nom, cond, det) => {
  total++;
  console.log((cond ? "  ✅ " : "  ❌ ") + nom + (det ? "  → " + det : ""));
  if (!cond) ko++;
};

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erreursJS = [];
pg.on("pageerror", (e) => erreursJS.push(e.message));

/* Le service bouchonne. Il garde le brouillon comme le vrai : un seul, entier. */
let brouillonFresque = null;
let fresquePubliee = null;      // le plan DEJA en ligne
let versions = [];              // les plans publies avant lui
const recus = [];
await pg.route("**/.netlify/functions/commentaires**", (r) => r.fulfill({ status: 200,
  contentType: "application/json", body: JSON.stringify({ ok: true, compte: {}, retours: [] }) }));
/* Le calque public : c'est par lui que le plan publie revient a l'outil. */
await pg.route("**/.netlify/functions/cartes-publiees**", (r) => r.fulfill({ status: 200,
  contentType: "application/json", body: JSON.stringify({ ok: true, cartes: [], fresque: fresquePubliee }) }));
await pg.route("**/.netlify/functions/brouillons**", async (r) => {
  const req = r.request();
  const rep = (c) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
  if (req.method() === "GET") return rep({ ok: true, brouillons: [], resume: [], publie: [],
    fresque: brouillonFresque, fresquePubliee: fresquePubliee });
  const c = JSON.parse(req.postData() || "{}");
  recus.push(c.action);
  if (c.action === "fresque-enregistrer") {
    brouillonFresque = c.tableau;
    return rep({ ok: true, resume: { cartesDeplacees: 1, cartesAjoutees: 0, liensAjoutes: 0, liensRetires: 0 } });
  }
  if (c.action === "fresque-oublier") { brouillonFresque = null; return rep({ ok: true }); }
  if (c.action === "fresque-publier") {
    if (!brouillonFresque) return r.fulfill({ status: 400, contentType: "application/json",
      body: JSON.stringify({ erreur: "Aucune modification à publier." }) });
    /* Comme le vrai service : on archive ce qu'on remplace, pas ce qu'on pose. */
    const avant = fresquePubliee;
    if (avant) versions.unshift({ quand: Date.now(), cartes: avant.cartes.length,
      fleches: avant.fleches.length, tableau: avant });
    fresquePubliee = brouillonFresque;
    brouillonFresque = null;
    return rep({ ok: true, enLigne: true,
      resume: { cartesDeplacees: 1, cartesAjoutees: 0, liensAjoutes: 1, liensRetires: 0 },
      versions: versions.map((v) => ({ quand: v.quand, cartes: v.cartes, fleches: v.fleches })) });
  }
  if (c.action === "fresque-versions") {
    return rep({ ok: true, versions: versions.map((v) => ({ quand: v.quand, cartes: v.cartes, fleches: v.fleches })) });
  }
  if (c.action === "fresque-version") {
    const v = versions.find((x) => x.quand === c.quand);
    if (!v) return r.fulfill({ status: 404, contentType: "application/json",
      body: JSON.stringify({ erreur: "Cette version n'existe plus." }) });
    return rep({ ok: true, tableau: v.tableau, quand: v.quand });
  }
  if (c.action === "fresque-telecharger") {
    const t2 = brouillonFresque || fresquePubliee;
    if (!t2) return r.fulfill({ status: 400, contentType: "application/json",
      body: JSON.stringify({ erreur: "Aucune modification à déposer." }) });
    return rep({ ok: true, fichier: { version: 1, tableau: t2 },
      resume: { cartesDeplacees: 1, cartesAjoutees: 0, liensAjoutes: 0, liensRetires: 0 } });
  }
  return rep({ ok: true, fichier: { cartes: [] }, resume: [] });
});

await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1300);
const vu = (id) => pg.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.hidden; }, id);
const pos = (n) => pg.evaluate((k) => {
  const e = document.querySelector('.c-carte[data-n="' + k + '"]');
  return { x: parseFloat(e.style.left), y: parseFloat(e.style.top) };
}, n);
const nbLiens = () => pg.evaluate(() => document.querySelectorAll("#liens g[data-id]").length);
const boite = (sel) => pg.locator(sel).first().boundingBox();
/* LES GESTES A LA SOURIS DEMANDENT QUE LA CIBLE SOIT DANS LA FENETRE.
   `pg.mouse` travaille en coordonnees de fenetre et ne fait defiler personne :
   la zone de la fresque est loin sous le pli, et sans cet amenage le pointeur
   se posait dans le vide (premiere version de ce banc : la carte ne bougeait
   pas, et rien ne disait pourquoi). */
const amener = async () => {
  await pg.locator("#plateau-cadre").scrollIntoViewIfNeeded();
  await pg.waitForTimeout(150);
};
/* Un element du plateau VISIBLE dans le cadre : celui-ci fait defiler son
   contenu, et une carte hors de sa partie montree n'est pas cliquable. */
const dansLeCadre = async (sel) => {
  const c = await boite("#plateau-cadre");
  const n = await pg.locator(sel).count();
  for (let i = 0; i < n; i++) {
    const b = await pg.locator(sel).nth(i).boundingBox();
    if (!b) continue;
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (x > c.x + 4 && x < c.x + c.width - 4 && y > c.y + 4 && y < c.y + c.height - 4
        && y > 0 && y < 900) return { i: i, x: x, y: y };
  }
  return null;
};
const tirer = async (de, vers, pas = 12) => {
  const a = await boite(de), b = await boite(vers);
  await pg.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await pg.mouse.down();
  for (let i = 1; i <= pas; i++) {
    await pg.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2) - (a.x + a.width / 2)) * i / pas,
                        a.y + a.height / 2 + ((b.y + b.height / 2) - (a.y + a.height / 2)) * i / pas);
  }
  await pg.mouse.up();
};

console.log("\n--- Sans jeton de moderation ---");
t("aucune bascule « mode édition »", !(await vu("bascule-edition")));
t("aucune barre d'édition", !(await vu("barre-edition")));
t("aucune poignée de lien sur les cartes",
  (await pg.locator(".poignee-lien").count()) === 0);

console.log("\n--- Le jeton révèle la bascule, sans ouvrir le mode ---");
await pg.evaluate(() => {
  document.getElementById("jeton").value = "jeton-de-banc-123456";
  document.getElementById("form-jeton").requestSubmit();
});
await pg.waitForTimeout(600);
t("la bascule apparaît", await vu("bascule-edition"));
t("la barre d'édition reste fermée tant qu'on ne bascule pas", !(await vu("barre-edition")));

console.log("\n--- Entrée en mode édition ---");
await pg.evaluate(() => { const c = document.getElementById("mode-edition"); c.checked = true;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(500);
t("la barre d'édition s'ouvre", await vu("barre-edition"));
t("chaque carte du plan porte une poignée",
  (await pg.locator(".poignee-lien").count()) === (await pg.locator(".c-carte").count()));
t("le plateau est marqué en édition",
  await pg.evaluate(() => document.getElementById("plateau").classList.contains("en-edition")));
/* LA POIGNEE RESTE ATTRAPABLE AU ZOOM D'OUVERTURE. Le plateau s'ouvre vers
   35 % : une poignee de taille fixe n'y ferait que sept pixels a l'ecran. */
const tp = await pg.evaluate(() => {
  const b = document.querySelector(".poignee-lien").getBoundingClientRect();
  return Math.min(b.width, b.height);
});
t("la poignée garde une taille attrapable au zoom d'ouverture", tp >= 12,
  Math.round(tp) + " px à l'écran");
t("le sélecteur de vue est verrouillé (rien à déplacer dans une grille)",
  await pg.evaluate(() => document.getElementById("vue-cartes").disabled
    && document.getElementById("vue-fresque").disabled));
/* Le mode commentaires a ete retire de l'outil : donner un retour se fait en
   un formulaire, sur la page Retours. Il n'y a donc plus qu'un mode a activer. */
t("le panneau de lecture ne s'ouvre pas en édition",
  await pg.evaluate(() => document.getElementById("panneau").hidden));
t("l'aide dit quoi faire", /[Gg]lissez/.test(await pg.textContent("#barre-aide")));

console.log("\n--- Déplacer une carte : les flèches suivent ---");
await amener();
const vis = await dansLeCadre(".c-carte");
t("une carte est visible dans le cadre (sinon le geste ne veut rien dire)", !!vis);
const nVis = await pg.evaluate((i) => +document.querySelectorAll(".c-carte")[i].dataset.n, vis.i);
const avant = await pos(nVis);
const trace = (n) => pg.evaluate((k) => {
  const g = document.querySelector('#liens g[data-de="' + k + '"]')
    || document.querySelector('#liens g[data-vers="' + k + '"]');
  return g ? g.querySelector("path:not(.touche)").getAttribute("d") : null;
}, n);
const dAvant = await trace(nVis);
t("la carte déplacée porte au moins une flèche (sinon on ne vérifie rien)", !!dAvant);
const bo = await boite('.c-carte[data-n="' + nVis + '"]');
const zoomLu = await pg.evaluate(() => {
  const m = new DOMMatrixReadOnly(getComputedStyle(document.getElementById("plateau")).transform);
  return m.a;
});
await pg.mouse.move(bo.x + bo.width / 2, bo.y + bo.height / 2);
await pg.mouse.down();
for (let i = 1; i <= 10; i++) await pg.mouse.move(bo.x + bo.width / 2 + i * 8, bo.y + bo.height / 2 + i * 4);
await pg.mouse.up();
await pg.waitForTimeout(300);
const apres = await pos(nVis);
t("la carte a bougé", apres.x !== avant.x && apres.y !== avant.y,
  JSON.stringify(avant) + " → " + JSON.stringify(apres));
/* LE ZOOM EST PRIS EN COMPTE. Le plateau est mis a l'echelle : un deplacement
   de 80 pixels a l'ecran vaut 80/zoom pixels de plan. Sans la division, la
   carte part deux fois plus loin que le pointeur et file hors du plan. */
const attendu = 80 / zoomLu;
t("le déplacement respecte le zoom", Math.abs((apres.x - avant.x) - attendu) <= 3,
  "attendu ~" + Math.round(attendu) + ", obtenu " + Math.round(apres.x - avant.x) + " (zoom " + zoomLu.toFixed(2) + ")");
const dApres = await trace(nVis);
t("les flèches de cette carte ont suivi", dApres !== dAvant);
t("le panneau de lecture ne s'est pas ouvert au relâcher", !(await vu("panneau")));
t("l'état signale des modifications non enregistrées",
  /non enregistr/i.test(await pg.textContent("#f-etat")));

console.log("\n--- « Annuler » revient sur la dernière action ---");
await pg.evaluate(() => document.getElementById("f-annuler").click());
await pg.waitForTimeout(300);
const rendu = await pos(nVis);
t("la carte a retrouvé sa place", rendu.x === avant.x && rendu.y === avant.y,
  JSON.stringify(rendu));
t("le bouton se désactive quand il n'y a plus rien à annuler",
  await pg.evaluate(() => document.getElementById("f-annuler").disabled));

console.log("\n--- Tracer un lien en tirant la poignée ---");
await amener();
/* DEUX CARTES VISIBLES DANS LE CADRE, et non deux numeros choisis d'avance :
   le cadre fait defiler son contenu, et une carte hors de sa partie montree
   n'est pas une cible de pointeur. */
const paire = await pg.evaluate(() => {
  const cadre = document.getElementById("plateau-cadre").getBoundingClientRect();
  const dedans = [];
  document.querySelectorAll(".c-carte").forEach((el) => {
    const b = el.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (x > cadre.x + 10 && x < cadre.right - 10 && y > cadre.y + 10 && y < cadre.bottom - 10
        && y > 0 && y < window.innerHeight) dedans.push(+el.dataset.n);
  });
  return dedans.length >= 2 ? [dedans[0], dedans[dedans.length - 1]] : null;
});
t("deux cartes sont visibles dans le cadre (sinon le geste ne veut rien dire)", !!paire,
  JSON.stringify(paire));
const liensAvant = await nbLiens();
const dejaLie = paire && await pg.evaluate(([a, b]) => !!document.querySelector(
  '#liens g[data-de="' + a + '"][data-vers="' + b + '"]'), paire);
await tirer('.c-carte[data-n="' + paire[0] + '"] .poignee-lien', '.c-carte[data-n="' + paire[1] + '"]');
await pg.waitForTimeout(400);
t("un lien de plus", (await nbLiens()) === liensAvant + (dejaLie ? 0 : 1),
  liensAvant + " → " + (await nbLiens()) + (dejaLie ? " (déjà lié)" : ""));
t("le nouveau lien est celui qu'on vient de tracer",
  await pg.evaluate(([a, b]) => {
    const v = document.getElementById("f-choix").value;
    const f = v && document.querySelector('#liens g[data-id="' + v + '"]');
    return !!f && f.dataset.de === String(a) && f.dataset.vers === String(b);
  }, paire));
t("le champ libellé attend la saisie",
  await pg.evaluate(() => document.activeElement && document.activeElement.id === "f-libelle"));

console.log("\n--- Donner un libellé, puis supprimer le lien ---");
await pg.evaluate(() => {
  document.getElementById("f-libelle").value = "rend possible";
  document.getElementById("f-renommer").click();
});
await pg.waitForTimeout(300);
t("le libellé s'affiche sur la fresque",
  await pg.evaluate(() => {
    const v = document.getElementById("f-choix").value;
    const g = document.querySelector('#liens g[data-id="' + v + '"]');
    return !!g && g.querySelector("text").textContent === "rend possible";
  }));
t("et dans la liste des liens",
  /rend possible/.test(await pg.evaluate(() => document.getElementById("f-choix").selectedOptions[0].textContent)));

console.log("\n--- Un lien se désigne en le cliquant sur le plateau ---");
/* La couche des liens ne recoit le pointeur qu'en edition, et seulement par le
   doublon transparent : si cette verification tombe, les liens redeviennent
   inclicables et la barre est le seul chemin. */
await pg.evaluate(() => { document.getElementById("f-choix").value = "";
  document.getElementById("f-choix").dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(200);
await amener();
/* On vise le MILIEU DU TRAIT, pas le milieu de la boite du chemin : une courbe
   qui part en diagonale a une boite dont le centre est loin du trait. */
const cible = await pg.evaluate(() => {
  const cadre = document.getElementById("plateau-cadre").getBoundingClientRect();
  const gs = document.querySelectorAll("#liens g[data-id]");
  for (const g of gs) {
    const p = g.querySelector("path.touche");
    const l = p.getTotalLength();
    const m = p.getScreenCTM();
    const q = p.getPointAtLength(l / 2).matrixTransform(m);
    if (q.x > cadre.x + 10 && q.x < cadre.right - 10 && q.y > cadre.y + 10
        && q.y < cadre.bottom - 10 && q.y > 0 && q.y < window.innerHeight) {
      return { id: g.dataset.id, x: q.x, y: q.y };
    }
  }
  return null;
});
t("un lien est visible dans le cadre (sinon le reste ne veut rien dire)", !!cible);
if (cible) {
  const dessus = await pg.evaluate(({ x, y }) => {
    const e = document.elementFromPoint(x, y);
    const g = e && e.closest ? e.closest("g[data-id]") : null;
    return { classe: e ? (e.getAttribute("class") || e.tagName) : "rien",
             id: g ? g.dataset.id : null };
  }, cible);
  t("le doublon transparent reçoit bien le pointeur", /touche/.test(dessus.classe), dessus.classe);
  await pg.mouse.click(cible.x, cible.y);
  await pg.waitForTimeout(250);
  /* C'est le lien QUE LE NAVIGATEUR DESIGNE qu'on attend, pas celui qu'on
     avait repere : les zones de clic, larges de seize pixels, se chevauchent
     par dizaines et la plus haute l'emporte. */
  const choisi = await pg.evaluate(() => document.getElementById("f-choix").value);
  t("cliquer un lien le sélectionne", !!choisi && choisi === dessus.id,
    choisi + " vs " + dessus.id);
  t("et le plateau le met en avant",
    await pg.evaluate((id) => {
      const g = document.querySelector('#liens g[data-id="' + id + '"]');
      return !!g && g.classList.contains("choisi");
    }, choisi));
}

console.log("\n--- Supprimer un lien ---");
const avantSupp = await nbLiens();
await pg.evaluate(() => document.getElementById("f-supprimer").click());
await pg.waitForTimeout(300);
t("un lien de moins", (await nbLiens()) === avantSupp - 1);
t("l'état le dit", /supprim/i.test(await pg.textContent("#f-etat")));

console.log("\n--- Deux refus utiles ---");
await pg.evaluate(() => {
  const n = document.querySelector(".c-carte").dataset.n;
  document.getElementById("f-de").value = n;
  document.getElementById("f-vers").value = n;
  document.getElementById("f-ajouter").click();
});
await pg.waitForTimeout(250);
t("une carte ne se relie pas à elle-même", /elle-même/i.test(await pg.textContent("#f-etat")));
const n1 = await nbLiens();
await pg.evaluate(() => {
  const g = document.querySelector("#liens g[data-id]");
  document.getElementById("f-de").value = g.dataset.de;
  document.getElementById("f-vers").value = g.dataset.vers;
  document.getElementById("f-ajouter").click();
});
await pg.waitForTimeout(250);
t("un lien déjà tracé n'est pas dupliqué", (await nbLiens()) === n1);
t("et c'est celui qui existe qui s'ouvre", /existe/i.test(await pg.textContent("#f-etat")));

console.log("\n--- Au clavier ---");
const avantCl = await pos(12);
await pg.evaluate(() => document.querySelector('.c-carte[data-n="12"]').focus());
await pg.keyboard.press("ArrowRight");
await pg.keyboard.press("ArrowDown");
await pg.waitForTimeout(200);
const apresCl = await pos(12);
t("les flèches déplacent la carte au focus de dix pixels",
  apresCl.x === avantCl.x + 10 && apresCl.y === avantCl.y + 10,
  JSON.stringify(avantCl) + " → " + JSON.stringify(apresCl));
await pg.keyboard.press("Shift+ArrowLeft");
await pg.waitForTimeout(150);
t("avec Maj, d'un seul (le placement exact)",
  (await pos(12)).x === apresCl.x - 1);

console.log("\n--- Une carte ne sort pas du plan ---");
await pg.evaluate(() => {
  const p = document.querySelector('.c-carte[data-n="12"]');
  p.focus();
  for (let i = 0; i < 400; i++) p.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowLeft", bubbles: true }));
});
await pg.waitForTimeout(250);
t("bornée à zéro à gauche", (await pos(12)).x === 0, String((await pos(12)).x));

console.log("\n--- Enregistrer, puis reprendre le brouillon ---");
await pg.evaluate(() => document.getElementById("f-enregistrer").click());
await pg.waitForTimeout(500);
t("le brouillon part au service", recus.includes("fresque-enregistrer"));
t("l'état dit qu'il n'est pas publié", /pas encore publi/i.test(await pg.textContent("#f-etat")));
t("le tableau envoyé porte le déplacement",
  brouillonFresque && brouillonFresque.cartes.find((c) => c.n === 12).x === 0);
t("« abandonner le brouillon » devient possible", await vu("f-oublier"));

/* SORTIR PUIS RENTRER DOIT REPRENDRE LE BROUILLON, pas repartir de la version
   publiee : on perdrait tout le placement a la premiere sortie du mode. */
await pg.evaluate(() => { window.confirm = () => true;
  const c = document.getElementById("mode-edition"); c.checked = false;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(300);
t("sortir referme la barre", !(await vu("barre-edition")));
t("et rend le clic de lecture aux cartes",
  await pg.evaluate(() => !document.getElementById("plateau").classList.contains("en-edition")));
await pg.evaluate(() => { const c = document.getElementById("mode-edition"); c.checked = true;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(400);
t("rentrer reprend le brouillon", (await pos(12)).x === 0, String((await pos(12)).x));
t("et le signale", /brouillon/i.test(await pg.textContent("#f-etat")));

/* PUBLIER LE PLAN LE MET EN LIGNE, IL NE TELECHARGE PLUS. Rien d'imprime n'en
   depend : c'est une mise en page, lue par le seul outil. */
console.log("\n--- Publier met le plan en ligne ---");
const tele = pg.waitForEvent("download", { timeout: 2500 }).catch(() => null);
await pg.evaluate(() => { window.alert = () => {}; document.getElementById("f-publier").click(); });
await pg.waitForTimeout(900);
t("publier ne télécharge plus rien", (await tele) === null);
t("le service a bien reçu la publication", recus.includes("fresque-publier"));
t("le plan est en ligne pour tout le monde",
  !!fresquePubliee && fresquePubliee.cartes.find((c) => c.n === 12).x === 0);
t("l'état dit que c'est en ligne", /en ligne/i.test(await pg.textContent("#f-etat")),
  await pg.textContent("#f-etat"));
t("le dépôt reste proposé, à part et sans urgence", await vu("f-deposer"));

console.log("\n--- Le fichier reste disponible pour le dépôt ---");
const tele2 = pg.waitForEvent("download", { timeout: 6000 }).catch(() => null);
await pg.evaluate(() => { window.alert = () => {}; document.getElementById("f-deposer").click(); });
const dl = await tele2;
t("un fresque-reference.json est proposé", !!dl && dl.suggestedFilename() === "fresque-reference.json",
  dl ? dl.suggestedFilename() : "aucun téléchargement");

/* SORTIR PUIS RENTRER DOIT REPRENDRE LE PLAN PUBLIE, et non repartir du fichier
   du dépôt : on déferait sans prévenir une publication de la veille. */
console.log("\n--- Le plan publié est repris ---");
await pg.evaluate(() => { window.confirm = () => true;
  const c = document.getElementById("mode-edition"); c.checked = false;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(300);
await pg.evaluate(() => { const c = document.getElementById("mode-edition"); c.checked = true;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(500);
t("rentrer en édition reprend le plan publié", (await pos(12)).x === 0, String((await pos(12)).x));

/* L'EDITION NE S'OFFRE PAS A QUI PASSE. L'outil ne vit plus que sur une page,
   celle de la fresque : ce qui la garde n'est donc plus « quelle page ? » mais
   le jeton. Sans lui, la bascule reste invisible, meme si le balisage existe.
   Et la page Retours, elle, ne porte plus l'outil du tout. */
/* ── REVENIR SUR UNE VERSION PRECEDENTE ──────────────────────
   Publier ecrasait le plan precedent : une fausse manoeuvre sur trente-huit
   cartes ne se defaisait qu'en les replacant une a une. Charger ne met rien en
   ligne : la version revient dans l'editeur, on la regarde, et c'est
   « Publier » qui decide. */
console.log("\n--- Revenir sur une version precedente ---");
const posAvant = (await pos(12)).x;
await pg.evaluate(() => { const c = document.getElementById("mode-edition");
  if (!c.checked) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); } });
await pg.waitForTimeout(600);
// Un deuxieme deplacement, puis une deuxieme publication : deux versions.
await pg.evaluate(() => {
  const el = document.querySelector('.c-carte[data-n="12"]');
  el.focus();
  for (let i = 0; i < 5; i++) el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
});
await pg.waitForTimeout(300);
await pg.evaluate(() => document.getElementById("f-enregistrer").click());
await pg.waitForTimeout(500);
await pg.evaluate(() => { window.alert = () => {}; document.getElementById("f-publier").click(); });
await pg.waitForTimeout(800);
const listees = await pg.evaluate(() => [...document.querySelectorAll("#f-versions option")]
  .map((o) => o.value).filter(Boolean).length);
t("les versions precedentes sont proposees", listees >= 1, String(listees));
t("et chacune se lit a la date, pas a un horodatage",
  /\d/.test(await pg.evaluate(() => (document.querySelector("#f-versions option") || {}).textContent || "")),
  await pg.evaluate(() => (document.querySelector("#f-versions option") || {}).textContent || ""));

const avantCharge = (await pos(12)).x;
await pg.evaluate(() => document.getElementById("f-charger").click());
await pg.waitForTimeout(700);
t("charger ramene le plan d'avant dans l'editeur", (await pos(12)).x !== avantCharge,
  avantCharge + " → " + (await pos(12)).x);
t("et l'etat dit qu'il faut encore publier pour le remettre en ligne",
  /publi/i.test(await pg.textContent("#f-etat")), await pg.textContent("#f-etat"));
t("charger ne met rien en ligne tout seul",
  fresquePubliee !== null && JSON.stringify(fresquePubliee) !== JSON.stringify(versions[0] && versions[0].tableau));
await pg.evaluate(() => { window.confirm = () => true;
  const c = document.getElementById("mode-edition"); c.checked = false;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.waitForTimeout(300);

console.log("\n--- L'edition ne s'offre pas a qui passe ---");
await pg.goto(B + "/animateurs/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1300);
t("sans jeton, la bascule d'édition reste cachée", !(await vu("bascule-edition")));
t("et la barre d'édition avec elle", !(await vu("barre-edition")));
await pg.goto(B + "/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(800);
t("la page Retours ne porte aucun outil de fresque",
  (await pg.locator("#fresque-outil, #bascule-edition, #barre-edition").count()) === 0);

t("aucune erreur JavaScript sur tout le parcours", erreursJS.length === 0, erreursJS.slice(0, 2).join(" | "));

console.log("\n" + (ko ? "❌" : "✅") + " Édition de la fresque : " + (total - ko)
  + " vérifications réussies, " + ko + " échouées.\n");
await nav.close();
site.close();
process.exit(ko ? 1 : 0);
