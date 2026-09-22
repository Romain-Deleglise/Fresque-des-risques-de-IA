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

const PAGE = lire("site/animateurs/index.html");

test("la page se declare noindex", () => {
  assert.match(PAGE, /<meta\s+name="robots"\s+content="noindex[^"]*"/i);
});

test("robots.txt exclut l'espace", () => {
  assert.match(lire("site/robots.txt"), /^Disallow: \/animateurs\/$/m);
});

test("l'espace n'est pas dans le plan du site", () => {
  assert.ok(!lire("site/sitemap.xml").includes("/animateurs"));
});

test("aucune page publique n'y renvoie, sauf la fin du guide", () => {
  const pages = [];
  (function parcourir(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "animateurs") parcourir(rel); }
      else if (e.name.endsWith(".html")) pages.push(rel);
    }
  })("site");

  const renvoient = pages.filter((p) => /href="[^"]*animateurs\//.test(lire(p)));
  assert.deepEqual(renvoient, ["site/guide/index.html"],
    "seul le guide doit renvoyer vers l'espace animateur·ices");
});

test("le lien du guide reste hors du PDF public et tout en bas de page", () => {
  const guide = lire("site/guide/index.html");
  const i = guide.indexOf('href="../animateurs/"');
  assert.ok(i > 0);

  // `no-print` : le PDF du guide est telechargeable par n'importe qui.
  const encart = guide.slice(guide.lastIndexOf("<div", i), i);
  assert.match(encart, /no-print/, "l'encart doit etre exclu de l'impression");

  // Tout en bas : un animateur pressé ne doit pas tomber dessus avant d'avoir
  // lu le deroulé.
  assert.ok(i / guide.length > 0.8,
    "le lien doit rester en fin de guide, pas au milieu du deroulé");
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
