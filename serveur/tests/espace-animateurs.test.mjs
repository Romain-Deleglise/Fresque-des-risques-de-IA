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
  "site/en/facilitators/index.html"
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

/* UNE SEULE PAGE PUBLIQUE RENVOIE VERS L'ESPACE : LE GUIDE. Il s'adresse aux
   animateur·ices et non aux participant·es ; y proposer l'onglet Retours a donc
   un sens, et un animateur qui lit « donnez votre avis » doit pouvoir cliquer.
   L'exception s'arrete la : partout ailleurs, l'espace se transmet par courriel,
   et le guide ne doit toujours pas nommer la fresque de reference (test
   suivant), qui gacherait l'atelier a qui la verrait avant de le vivre. */
const EXCEPTIONS = { "site/guide/index.html": ["animateurs/retours/"] };

test("aucune page publique n'y renvoie, sauf le guide vers l'onglet Retours", () => {
  const pages = [];
  (function parcourir(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "animateurs" && e.name !== "facilitators") parcourir(rel); }
      else if (e.name.endsWith(".html")) pages.push(rel);
    }
  })("site");

  const fautifs = [];
  for (const p of pages) {
    const permis = EXCEPTIONS[p] || [];
    for (const m of lire(p).matchAll(/href="([^"]*(?:animateurs|facilitators)\/[^"]*)"/g)) {
      const cible = m[1].replace(/^(\.\.\/)+/, "");
      if (!permis.includes(cible)) fautifs.push(p + " -> " + m[1]);
    }
  }
  assert.deepEqual(fautifs, [],
    "une page publique renvoie vers l'espace animateur·ices hors de l'exception prévue");
});

/* LE GUIDE NE NOMME PAS LA FRESQUE DE REFERENCE, et c'est ce qui compte le
   plus ici. Le guide est telechargeable en PDF, donc il circule : montrer la
   fresque terminee a quelqu'un qui n'a pas encore fait l'atelier le lui gache.
   Le lien vers l'onglet Retours, lui, est assume (voir EXCEPTIONS ci-dessus) :
   c'est un document d'animateur·ices, et le retour se depose la. */
test("le guide ne nomme pas la fresque de référence", () => {
  for (const chemin of ["site/guide/index.html", "site/en/guide/index.html"]) {
    const guide = lire(chemin);
    assert.ok(!/fresque de r[ée]f[ée]rence|reference fresk/i.test(guide),
      `${chemin} nomme encore la fresque de référence`);
  }
});

/* La version anglaise, elle, n'a pas recu ce lien : son contenu suit son propre
   calendrier. Ce test l'enregistre, pour qu'on le voie si quelqu'un l'ajoute
   sans toucher a la liste des exceptions. */
test("seul le guide français porte le lien, et vers le seul onglet Retours", () => {
  assert.match(lire("site/guide/index.html"), /href="\.\.\/animateurs\/retours\/"/);
  assert.ok(!/href="[^"]*(animateurs|facilitators)\//.test(lire("site/en/guide/index.html")),
    "le guide anglais renvoie vers l'espace sans que la liste des exceptions le prevoie");
});

test("la navigation du site ne mentionne pas l'espace", () => {
  // La navigation de l'espace renvoie vers l'espace lui-même, c'est normal.
  // Ce qu'on vérifie, c'est la navigation des pages PUBLIQUES.
  const accueil = lire("site/index.html");
  const nav = accueil.slice(accueil.indexOf("<nav"), accueil.indexOf("</nav>"));
  assert.ok(!nav.includes("animateurs") && !nav.includes("facilitators"));
});

/* LE JETON A SUIVI CE QU'IL OUVRE. Il vivait sur la page Retours, du temps ou
   l'on y moderait les commentaires carte par carte. Cette page n'est plus qu'un
   formulaire : la relecture se fait dans /admin/, avec les autres retours, et le
   jeton ouvre ici ce qu'il garde vraiment, corriger une carte et deplacer le
   plan. */
test("le jeton ouvre l'édition de la fresque, et ne survit pas à l'onglet", () => {
  assert.match(lire("site/animateurs/index.html"), /id="form-jeton"/,
    "la page de la fresque doit porter le champ du jeton");
  assert.ok(!/id="form-jeton"/.test(PAGE),
    "la page Retours n'a plus rien a moderer : plus de champ de jeton");
  const js = lire("site/animateurs/animateurs.js");
  // Le jeton ne doit pas survivre à l'onglet : ni cookie, ni stockage local.
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(js),
    "le jeton de modération ne doit pas être conservé");
});

/* LES COMMENTAIRES SE RELISENT DANS /admin/, au meme endroit que les retours
   d'atelier et les temoignages. Sans cet ecran, ils tomberaient dans un magasin
   qu'aucune interface ne montre. */
test("les commentaires sur les cartes se relisent dans /admin/", () => {
  assert.match(lire("site/admin/index.html"), /id="liste-commentaires"/);
  const js = lire("site/assets/js/admin.js");
  assert.match(js, /__commentairesAdmin/);
  assert.match(js, /functions\/commentaires/);
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

/* QUATRE ONGLETS, PAS DAVANTAGE. L'espace en avait cinq et un sommaire :
   Accueil, Guide, Outils, Retours, plus un bouton « Fresque de reference ».
   « Outils » ne portait que l'antiseche et le minuteur, et l'accueil n'etait
   qu'une table des matieres. La fresque, elle, etait rangee dans l'onglet
   Retours, c'est-a-dire la ou l'on vient ecrire, pas regarder. */
test("l'espace tient en quatre onglets", () => {
  const ONGLETS = ["Fresque", "Guide", "Antisèche", "Retours"];
  for (const p of ["site/animateurs/index.html", "site/animateurs/retours/index.html",
                   "site/animateurs/antiseche/index.html", "site/animateurs/minuteur/index.html",
                   "site/animateurs/kit/index.html"]) {
    const html = lire(p);
    const nav = html.slice(html.indexOf('aria-label="Espace'), html.indexOf("</nav>"));
    const liens = [...nav.matchAll(/>([^<>]+)<\/a>/g)].map((m) => m[1].trim());
    assert.deepEqual(liens, ONGLETS, p + " : la navigation de l'espace doit tenir en quatre onglets");
  }
});

/* LA PAGE DE LA FRESQUE N'A QU'UN SUJET. Elle portait en bas des raccourcis
   vers l'antiseche, le minuteur, le guide et le kit : les onglets y menent
   deja, et ces blocs faisaient de la page de la fresque une table des matieres
   de plus. */
test("la page de la fresque ne porte que la fresque", () => {
  const sommaire = lire("site/animateurs/index.html");
  for (const bloc of ["Pendant l'atelier", "Avant l'atelier", "ressource vous manque"]) {
    assert.ok(!sommaire.includes(bloc), `la page porte encore « ${bloc} »`);
  }
  assert.match(sommaire, /id="fresque-outil"/, "la fresque s'affiche directement");
  assert.ok(!/id="btn-apercu"/.test(sommaire),
    "plus de bouton de dépliage : la fresque est le sujet de la page");
  /* Plus rien de ce qui servait a commenter carte par carte. */
  for (const interdit of ["mode-commentaires", "form-general", "retours-section"]) {
    assert.ok(!sommaire.includes('id="' + interdit + '"'),
      `la page de la fresque ne doit pas porter ${interdit}`);
  }
  /* LES MEMES ONGLETS PARTOUT. Naviguer dans l'espace renvoyait aux onglets du
     site public, d'ou l'on ne revenait qu'avec le bouton « precedent ». Chaque
     page de l'espace porte donc la meme barre, et le guide la reconstruit quand
     on y arrive avec ?espace=1. */
  for (const p of ["site/animateurs/index.html", "site/animateurs/retours/index.html",
                   "site/animateurs/antiseche/index.html", "site/animateurs/minuteur/index.html",
                   "site/animateurs/kit/index.html"]) {
    assert.match(lire(p), /aria-label="Espace animateur·ices"/, `${p} n'a pas la barre de l'espace`);
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
  /* L'outil ne vit plus que sur une page : la fresque. La page Retours n'est
     plus qu'un formulaire, elle n'en porte plus rien. */
  const fresque = lire("site/animateurs/index.html");
  assert.match(fresque, /id="fresque-outil"/, "la page de la fresque doit porter le conteneur");
  for (const page of ["site/animateurs/index.html", "site/animateurs/retours/index.html"]) {
    const html = lire(page);
    for (const marqueur of ["plateau-sizer", "panneau-corps", 'id="lots"', 'id="panneau"']) {
      assert.ok(!html.includes(marqueur),
        page + " ne doit pas contenir « " + marqueur + " » : l'outil est bati par le script");
    }
  }
});

/* LE MODE COMMENTAIRES A ETE RETIRE. Commenter se faisait carte par carte :
   activer un mode, trouver la carte, ouvrir son panneau, choisir un onglet,
   parfois designer un lien. Beaucoup d'etapes pour une phrase. On demande
   desormais la meme chose en un formulaire, sur la page Retours. L'outil ne
   garde que la lecture et, derriere le jeton, l'edition. */
test("l'outil n'a plus de mode commentaires", () => {
  const js = lire("site/animateurs/animateurs.js");
  for (const disparu of ["mode-commentaires", "panneau-commentaire", "retours-carte",
                         "onglet-retours", "chargerRetours", "majPastilles"]) {
    assert.ok(!js.includes(disparu), "l'outil contient encore « " + disparu + " »");
  }
  assert.match(js, /data-edition/);
  assert.match(lire("site/animateurs/index.html"), /data-edition="oui"/);
});

/* UN LOT ECARTE DISPARAIT, il ne palit pas. Grise, il restait a l'ecran avec
   toutes les fleches par-dessus : on ne regardait jamais un lot seul. */
test("les lots se choisissent à plusieurs et masquent le reste", () => {
  const js = lire("site/animateurs/animateurs.js");
  assert.match(js, /lotsActifs/);
  assert.ok(!/lotActif/.test(js), "le filtre a un seul lot ne doit plus exister");
  assert.match(js, /classList\.toggle\('masque'/);
  assert.match(js, /function cadrerSurLaSelection/);
  assert.match(lire("site/animateurs/animateurs.css"), /\.c-carte\.masque[^{]*\{[^}]*display: none/);
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

/* --- La planche d'impression n'a plus sa propre copie des textes ----------
   Les titres et versos etaient recopies dans le gabarit, a cote de
   cartes.json. Les deux copies avaient DEJA diverge : la carte 3 avait deux
   paragraphes a l'impression et un seul sur le site, pour le meme texte. */
test("le gabarit d'impression lit cartes.json au lieu de recopier les textes", () => {
  const g = lire("contenus/Planche d'impression (20pages).html");
  assert.match(g, /const MISE_EN_PAGE = \[/);
  assert.match(g, /SOURCE_TEXTES = "\.\.\/site\/data\/cartes\.json"/);
  assert.ok(!/const CARDS = \[/.test(g), "le tableau de textes ne doit plus exister");
  // Aucun verso recopie : on verifie sur un texte long, propre a une carte.
  const ref = JSON.parse(lire("site/data/cartes.json")).cartes;
  const extrait = ref.find((c) => c.n === 1).verso[0].slice(0, 60);
  assert.ok(!g.includes(extrait), "un verso est encore ecrit dans le gabarit : " + extrait);
});

test("une planche incomplete s'arrete au lieu de s'imprimer vide", () => {
  const g = lire("contenus/Planche d'impression (20pages).html");
  // Un PDF aux cartes vides passerait inapercu jusqu'a l'imprimeur.
  assert.match(g, /function echec\(/);
  assert.match(g, /n'a ni titre ni verso/);
});

/* AUCUN LIEN DE L'ESPACE NE DOIT MENER DANS LE VIDE.

   La version anglaise de la fresque de reference a ete retiree : deux cartes
   de /en/facilitators/ pointaient encore dessus, et rien ne l'aurait dit. Une
   page supprimee laisse toujours des liens derriere elle, et un 404 dans un
   espace reserve ne remonte par aucun canal : personne n'ecrit pour signaler
   un lien casse sur une page qu'on lui a dit de ne pas partager.

   On accepte un lien qui mene a un fichier, a un dossier portant un
   index.html, ou a une adresse que netlify.toml redirige. */
test("aucun lien interne de l'espace ne mene a une page qui n'existe pas", () => {
  const toml = lire("netlify.toml");
  const redirections = [...toml.matchAll(/from\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1].replace(/\*$/, ""));
  const morts = [];
  for (const p of PAGES_ESPACE) {
    const dossier = path.dirname(path.join(RACINE, p));
    for (const m of lire(p).matchAll(/\shref="([^"]+)"/g)) {
      const brut = m[1];
      if (/^(https?:|mailto:|tel:|#|data:)/.test(brut)) continue;
      const chemin = brut.split("#")[0].split("?")[0];
      if (!chemin) continue;
      const vise = path.resolve(chemin.startsWith("/")
        ? path.join(RACINE, "site", chemin) : path.join(dossier, chemin));
      if (fs.existsSync(vise)
        && (!fs.statSync(vise).isDirectory() || fs.existsSync(path.join(vise, "index.html")))) continue;
      // Une adresse absolue peut etre servie par une redirection.
      const absolu = "/" + path.relative(path.join(RACINE, "site"), vise).replace(/\\/g, "/");
      if (redirections.some((r) => (absolu + "/").startsWith(r))) continue;
      morts.push(p + " -> " + brut);
    }
  }
  assert.deepEqual(morts, [], "liens morts : " + morts.join(", "));
});
