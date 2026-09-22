/* L'espace animateur·ices ne doit pas etre trouvable.

   Ce n'est pas un detail de confort : la fresque de reference divulgache
   l'atelier a qui la lit avant d'y participer. Ces garde-fous tiennent a trois
   lignes disseminees dans trois fichiers, faciles a defaire par megarde lors
   d'une refonte. On les verrouille ici.

   `node --test`.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

const PAGES_ESPACE = ["site/animateurs/index.html", "site/en/facilitators/index.html"];
const PAGE = lire(PAGES_ESPACE[0]);

test("les deux versions de la page se declarent noindex", () => {
  for (const p of PAGES_ESPACE) {
    assert.match(lire(p), /<meta\s+name="robots"\s+content="noindex[^"]*"/i, p);
  }
});

test("robots.txt exclut les deux versions de l'espace", () => {
  const r = lire("site/robots.txt");
  assert.match(r, /^Disallow: \/animateurs\/$/m);
  assert.match(r, /^Disallow: \/en\/facilitators\/$/m);
});

test("l'espace n'est pas dans le plan du site", () => {
  const sm = lire("site/sitemap.xml");
  assert.ok(!sm.includes("/animateurs"));
  assert.ok(!sm.includes("/facilitators"));
});

test("aucune page publique n'y renvoie, sauf la fin du guide", () => {
  const pages = [];
  (function parcourir(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "animateurs" && e.name !== "facilitators") parcourir(rel); }
      else if (e.name.endsWith(".html")) pages.push(rel);
    }
  })("site");

  const renvoient = pages
    .filter((p) => /href="[^"]*(animateurs|facilitators)\//.test(lire(p)))
    .sort();
  assert.deepEqual(renvoient, ["site/en/guide/index.html", "site/guide/index.html"],
    "seuls les deux guides doivent renvoyer vers l'espace animateur·ices");
});

test("le lien du guide reste hors du PDF public et tout en bas de page", () => {
 for (const [chemin, cible] of [["site/guide/index.html", '../animateurs/'],
                                ["site/en/guide/index.html", '../facilitators/']]) {
  const guide = lire(chemin);
  const i = guide.indexOf('href="' + cible + '"');
  assert.ok(i > 0);

  // `no-print` : le PDF du guide est telechargeable par n'importe qui.
  const encart = guide.slice(guide.lastIndexOf("<div", i), i);
  assert.match(encart, /no-print/, "l'encart doit etre exclu de l'impression");

  // Tout en bas : un animateur pressé ne doit pas tomber dessus avant d'avoir
  // lu le deroulé.
  assert.ok(i / guide.length > 0.8,
    "le lien doit rester en fin de guide, pas au milieu du deroulé");
 }
});

test("la navigation du site ne mentionne pas l'espace", () => {
  const nav = PAGE.slice(PAGE.indexOf("<nav"), PAGE.indexOf("</nav>"));
  assert.ok(!nav.includes("animateurs"));
});

test("la modération se fait sur la page, sans détour par /admin/", () => {
  assert.match(PAGE, /id="form-jeton"/);
  assert.match(PAGE, /id="retours"/);
  const js = lire("site/animateurs/animateurs.js");
  assert.match(js, /action: action/);
  // Le jeton ne doit pas survivre à l'onglet : ni cookie, ni stockage local.
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(js),
    "le jeton de modération ne doit pas être conservé");
});

test("la fonction refuse toute modération sans jeton configuré", () => {
  const fn = lire("netlify/functions/commentaires.js");
  assert.match(fn, /process\.env\.ADMIN_TOKEN/);
  // Comparaison à durée constante : sans elle, le temps de réponse laisse
  // deviner le jeton caractère par caractère.
  assert.match(fn, /memeJeton/);
  assert.match(fn, /diff \|=/);
});

test("la validation des retours reste dans le module pur", () => {
  const fn = lire("netlify/functions/commentaires.js");
  assert.match(fn, /serveur\/src\/commentaires\.js/);
  // Aucune règle ne doit être réécrite dans la fonction : elle serait alors
  // hors de portée des tests.
  assert.ok(!/slice\(0, *2000\)/.test(fn), "la troncature appartient au module pur");
});

test("le mail d'un atelier programmé donne le lien de l'espace, et dit de le garder", () => {
  const src = lire("netlify/functions/ateliers.js");
  assert.match(src, /const ESPACE_URL = LIEN \+ "\/animateurs\/"/,
    "le mail animateur·ice doit pointer l'espace");
  // Il apparaît dans les deux versions du mail : le repli texte compte autant
  // que le HTML, certains clients n'affichent que lui.
  const mail = src.slice(src.indexOf("function mailAnimateur"), src.indexOf("function mailParticipant"));
  assert.ok(mail.includes("l.push(ESPACE_URL)"), "absent de la version texte");
  assert.ok(/boutonSecondaire\(ESPACE_URL/.test(mail), "absent de la version HTML");
  assert.match(mail, /Gardez ce lien pour vous/,
    "le mail doit dire de ne pas diffuser le lien");
});

test("aucun mail à un participant ne mentionne l'espace", () => {
  const src = lire("netlify/functions/ateliers.js");
  // Le participant reçoit plusieurs mails ; aucun ne doit laisser filer le
  // lien, sinon tout le dispositif de discrétion ne sert à rien.
  const part = src.slice(src.indexOf("function mailParticipant"));
  assert.ok(!part.includes("ESPACE_URL"), "un mail participant mentionne l'espace");
});
