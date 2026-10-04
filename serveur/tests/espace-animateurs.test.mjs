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

// Toutes les pages de l'espace : chacune doit porter les mêmes garde-fous.
const PAGES_ESPACE = [
  "site/animateurs/index.html",
  "site/animateurs/retours/index.html",
  "site/animateurs/antiseche/index.html",
  "site/animateurs/minuteur/index.html",
  "site/animateurs/kit/index.html",
  "site/en/facilitators/index.html",
  "site/en/facilitators/reference/index.html"
];
const PAGE = lire("site/animateurs/retours/index.html");

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
  assert.deepEqual(renvoient, [],
    "aucune page publique ne doit renvoyer vers l'espace animateur·ices");
});

/* LE GUIDE NE RENVOIE PLUS VERS L'ESPACE. L'encart de fin a ete retire : le
   guide est un document public, telechargeable en PDF, et il y nommait la
   fresque de reference. L'espace se transmet par courriel. */
test("le guide ne nomme ni l'espace ni la fresque de référence", () => {
  for (const chemin of ["site/guide/index.html", "site/en/guide/index.html"]) {
    const guide = lire(chemin);
    assert.ok(!/href="\.\.\/(animateurs|facilitators)\//.test(guide),
      `${chemin} renvoie encore vers l'espace`);
    assert.ok(!/fresque de r[ée]f[ée]rence|reference fresk/i.test(guide),
      `${chemin} nomme encore la fresque de référence`);
  }
});

test("la navigation du site ne mentionne pas l'espace", () => {
  // La navigation de l'espace renvoie vers l'espace lui-même, c'est normal.
  // Ce qu'on vérifie, c'est la navigation des pages PUBLIQUES.
  const accueil = lire("site/index.html");
  const nav = accueil.slice(accueil.indexOf("<nav"), accueil.indexOf("</nav>"));
  assert.ok(!nav.includes("animateurs") && !nav.includes("facilitators"));
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

test("aucun attribut style= : la CSP du site les ignore", () => {
  // netlify.toml sert `style-src 'self'` sans 'unsafe-inline'. Un
  // style="left:…" écrit dans du HTML y est purement ignoré par le
  // navigateur. C'est exactement ce qui a mis la première version en ligne à
  // terre : 38 cartes empilées en haut à gauche, étiquettes superposées,
  // flèches à l'échelle 1, et invisible en local, où le serveur de test
  // n'envoie aucune CSP. Toutes les positions passent donc par le CSSOM.
  const csp = lire("netlify.toml");
  assert.match(csp, /style-src 'self'/, "la CSP a changé : ce test doit être revu");
  assert.ok(!/unsafe-inline/.test(csp), "la CSP autorise désormais l'inline");

  const scripts = ["site/animateurs/animateurs.js", "site/animateurs/minuteur/minuteur.js",
                   "site/animateurs/kit/kit.js", "site/animateurs/antiseche/antiseche.js"];
  for (const f of [...PAGES_ESPACE, ...scripts]) {
    const src = lire(f).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\sstyle\s*=\s*["']/.test(src), `${f} contient un attribut style=`);
  }
});

test("les cartes portent leur titre, pas seulement une image", () => {
  const js = lire("site/animateurs/animateurs.js");
  // Sans titre sur la carte, la fresque vue de loin n'est qu'une mosaïque
  // d'images : il faut cliquer chaque carte pour savoir ce qu'elle dit.
  assert.match(js, /tit\.textContent = c\.titre/);
  assert.match(js, /LOT_COULEUR/, "la couleur de lot doit distinguer les familles");
});

test("le sommaire mène à chaque ressource, et chaque ressource revient au sommaire", () => {
  const sommaire = lire("site/animateurs/index.html");
  for (const cible of ["../guide/?espace=1", "outils/", "retours/", "kit/"]) {
    assert.ok(sommaire.includes('href="' + cible + '"'), `le sommaire ne mène pas à ${cible}`);
  }
  const outils = lire("site/animateurs/outils/index.html");
  for (const cible of ["../minuteur/", "../antiseche/"]) {
    assert.ok(outils.includes('href="' + cible + '"'), `l'onglet Outils ne mène pas à ${cible}`);
  }
  /* LA FRESQUE DE REFERENCE NE FIGURE PLUS DANS LES OUTILS : elle se deplie
     depuis l'accueil de l'espace, en lecture seule, et vit dans l'onglet
     Retours quand il s'agit de commenter. Une tuile de plus vers la meme page
     n'ajoutait qu'un detour. */
  assert.ok(!/class="ressource"[^>]*href="\.\.\/retours\//.test(outils),
    "l'onglet Outils ne doit plus porter de tuile vers la fresque de référence");
  assert.match(sommaire, /id="btn-apercu"/, "l'accueil doit porter le bouton de dépliage");
  assert.match(sommaire, /id="apercu"/, "l'accueil doit porter le bloc de la fresque");
  /* En lecture seule : rien de ce qui sert a commenter. */
  for (const interdit of ["mode-commentaires", "form-general", "form-jeton", "retours-section"]) {
    assert.ok(!sommaire.includes('id="' + interdit + '"'),
      `l'aperçu de l'accueil ne doit pas porter ${interdit}`);
  }
  /* LES MEMES ONGLETS PARTOUT. Naviguer dans l'espace renvoyait aux onglets du
     site public, d'ou l'on ne revenait qu'avec le bouton « precedent ». Chaque
     page de l'espace porte donc la meme barre, et le guide la reconstruit quand
     on y arrive avec ?espace=1. */
  for (const p of ["site/animateurs/index.html", "site/animateurs/outils/index.html",
                   "site/animateurs/retours/index.html", "site/animateurs/antiseche/index.html",
                   "site/animateurs/minuteur/index.html", "site/animateurs/kit/index.html"]) {
    const page = lire(p);
    assert.match(page, /aria-label="Espace animateur·ices"/, `${p} n'a pas la barre de l'espace`);
    for (const onglet of ["Accueil", "Guide", "Outils", "Retours"]) {
      assert.ok(page.includes(">" + onglet + "</a>"), `${p} : onglet ${onglet} manquant`);
    }
    assert.match(page, /class="btn-nav" href="[^"]*animateurs\/retours\/#fresque"/,
      `${p} : le bouton « Fresque de référence » doit mener à l'onglet Retours`);
  }
});

test("le PDF de l'antisèche est engendré depuis sa page, pas rédigé à part", () => {
  // Deux supports du même contenu finissent toujours par diverger, et c'est le
  // PDF qui gagne : une fois téléchargé il circule, et personne ne sait qu'il
  // est périmé. Le script d'empreintes garantit qu'il suit la page.
  const script = lire("scripts/generer-guide-pdf.mjs");
  assert.match(script, /site\/animateurs\/antiseche\/index\.html/);
  assert.match(script, /antiseche-fresque-des-risques-de-l-ia\.pdf/);
  const { empreintes } = JSON.parse(lire("site/telechargements/empreintes.json"));
  assert.ok(Object.keys(empreintes).some((k) => k.includes("antiseche")),
    "l'antisèche n'a pas d'empreinte enregistrée");
});

test("l'antisèche donne des phrases à dire, pas seulement un minutage", () => {
  const as = lire("site/animateurs/antiseche/index.html");
  // C'est ce qu'on cherche debout, au milieu d'une table qui ne repart pas.
  assert.match(as, /Les phrases qui débloquent/);
  const phrases = as.match(/<li>«/g) || [];
  assert.ok(phrases.length >= 15, `seulement ${phrases.length} phrases de relance`);
  assert.match(as, /transitions entre les lots/);
});

test("le minuteur couvre les huit temps du guide", () => {
  const js = lire("site/animateurs/minuteur/minuteur.js");
  const durees = [...js.matchAll(/min: (\d+)/g)].map((m) => +m[1]);
  assert.equal(durees.length, 8, "il faut les huit temps du déroulé");
  // Le déroulé totalise les 2 h 30 annoncées sur le site : si l'un bouge,
  // l'autre doit suivre.
  assert.equal(durees.reduce((a, b) => a + b, 0), 150);
});

test("une réponse du lot 5 n'est pas présentée comme une cause", () => {
  const js = lire("site/animateurs/animateurs.js");
  // Les flèches partant du lot 5 disent « répond à ». Les ranger sous « ce que
  // ça entraîne », ou les dessiner comme les autres, inverse le sens de
  // lecture : on croit que la solution provoque le risque.
  assert.match(js, /lot === 5/);
  assert.match(js, /repondA/);
  assert.match(js, /setAttribute\('class', 'reponse'\)/);
  const css = lire("site/animateurs/animateurs.css");
  assert.match(css, /g\.reponse path \{[^}]*stroke-dasharray/);
  // Et la clé de lecture doit exister, sinon le trait discontinu ne dit rien.
  // Elle est désormais construite par le script : le HTML de l'outil n'existe
  // plus qu'à un seul endroit, les deux pages ne portent qu'un conteneur vide.
  assert.match(js, /cle-fleches/);
});

test("cliquer une carte allume bien sa chaîne", () => {
  const js = lire("site/animateurs/animateurs.js");
  const bloc = js.slice(js.indexOf("function ouvrirPanneau"), js.indexOf("function fermerPanneau"));
  // Ce fil a déjà sauté une fois en réécrivant le bloc d'ouverture : sans lui,
  // la carte choisie n'est pas mise en avant et le plateau reste inerte.
  assert.match(bloc, /surligner\(n\)/, "ouvrirPanneau doit appeler surligner");
  assert.match(bloc, /amenerEnVue\(n\)/);
  // Rouvrir le panneau ne doit pas réajuster le zoom, sinon la fresque
  // rapetisse à chaque clic.
  assert.ok(!/ajuster\(\)/.test(bloc), "ouvrirPanneau ne doit pas réajuster le zoom");
});

test("survoler une carte montre où elle mène, sans engager de sélection", () => {
  const js = lire("site/animateurs/animateurs.js");
  // Sans aperçu, il faut ouvrir le panneau, lire, fermer, recommencer, pour
  // trente-huit cartes, c'est un parcours interminable.
  assert.match(js, /function survoler/);
  assert.match(js, /mouseover/);
  // Le clavier doit montrer la même chose que la souris.
  assert.match(js, /focusin/);
  // L'aperçu se tait dès qu'une carte est choisie, sinon deux mises en avant
  // concurrentes se superposent.
  assert.match(js, /if \(cibleN != null\) g\.classList\.remove\('survol'\)/);
});

/* --- Le HTML de l'outil n'existe qu'a un seul endroit ---------------------
   Il etait copie dans les deux pages : toute evolution devait etre ecrite deux
   fois, et il suffisait d'en oublier une pour que les pages divergent sans que
   rien ne le signale. Ce test est la pour que la copie ne revienne pas. */
test("l'outil n'est ecrit que dans animateurs.js", () => {
  const js = lire("site/animateurs/animateurs.js");
  assert.match(js, /function construireOutil/);
  for (const page of ["site/animateurs/index.html", "site/animateurs/retours/index.html"]) {
    const html = lire(page);
    assert.match(html, /id="fresque-outil"/, page + " doit porter le conteneur");
    for (const marqueur of ["plateau-sizer", "panneau-corps", 'id="lots"', 'id="panneau"']) {
      assert.ok(!html.includes(marqueur),
        page + " ne doit plus contenir « " + marqueur + " » : l'outil est bati par le script");
    }
  }
});

test("les retours sont commandes par data-commentaires, pas par la page", () => {
  const js = lire("site/animateurs/animateurs.js");
  assert.match(js, /data-commentaires/);
  assert.match(lire("site/animateurs/retours/index.html"), /data-commentaires="oui"/);
  assert.match(lire("site/animateurs/index.html"), /data-commentaires="non"/);
});

/* Une seule valeur commande la largeur du panneau ET le retrait du plateau.
   Ecrites deux fois et differemment, elles laissaient une bande vide entre le
   bord du tableau et le panneau, qui grandissait avec l'ecran. */
test("la largeur du panneau et le retrait du plateau sortent de la meme valeur", () => {
  const css = lire("site/animateurs/animateurs.css");
  assert.match(css, /--panneau-l:/);
  assert.match(css, /\.panneau \{[^}]*width: var\(--panneau-l\)/);
  assert.match(css, /margin-right: var\(--panneau-l\)/);
  // Hors commentaires : l'ancienne valeur y est citee pour expliquer le defaut.
  const regles = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/min\(420px, 40vw\)/.test(regles),
    "l'ancienne valeur en double ne doit plus etre appliquee");
});

/* Le champ `explication` est facultatif : les 38 textes restent a ecrire. */
test("le champ explication est declare et facultatif", () => {
  const schema = JSON.parse(lire("site/data/cartes.schema.json"));
  const props = schema.properties.cartes.items.properties;
  assert.ok(props.explication, "le schema doit declarer explication");
  assert.ok(!schema.properties.cartes.items.required.includes("explication"),
    "explication ne doit pas etre obligatoire");
  assert.match(lire("scripts/valider-cartes.mjs"), /c\.explication !== undefined/);
  assert.match(lire("site/animateurs/animateurs.js"), /panneau-explication/);
});
