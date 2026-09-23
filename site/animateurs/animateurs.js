/* ESPACE ANIMATEUR·ICES.

   AUCUN ATTRIBUT `style=` DANS CE FICHIER. Le site sert une CSP stricte
   (`style-src 'self'`, netlify.toml) : un `style="left:…"` ecrit dans du HTML
   y est purement ignore par le navigateur. Premiere version en ligne : les 38
   cartes empilees en haut a gauche, les etiquettes les unes sur les autres et
   les fleches a l'echelle 1. Invisible en local, ou le serveur de test
   n'envoie aucune CSP. On pose donc TOUTES les positions par le CSSOM
   (`el.style.left = …`), que la CSP n'atteint pas, comme le fait deja le
   tableau de la Fresque en ligne.

   Affiche la fresque de reference (site/data/fresque-reference.json) avec le
   meme modele de donnees que la Fresque en ligne : cartes 160x150, fleches {de, vers, libelle}. Rien n'est duplique : les titres et les
   versos viennent de cartes.json, la source unique.

   Le plateau n'est charge qu'apres un clic explicite. Un animateur qui ouvre
   cette page devant sa table ne doit pas divulgacher la fresque par accident.
*/
(function () {
  'use strict';

  var CARTE_W = 160, CARTE_H = 150;   // remplaces par ref.plan.carte au chargement
  var PLAN_W = 2840, PLAN_H = 1750;   // idem : le fichier fait foi
  var cartes = {};      // n -> carte de cartes.json
  var ref = null;       // fresque de reference
  var zoom = 1, cibleN = null, modeCom = false;
  var retours = [];   // tous les retours, tels que la fonction les renvoie
  var jeton = '';     // jeton de moderation, garde en memoire seulement

  var $ = function (id) { return document.getElementById(id); };

  /* Les chaines produites par le script (celles qui ne sont pas dans le HTML).
     La page anglaise sert le meme fichier : sans cette table, elle afficherait
     des messages francais au milieu d'une interface anglaise. */
  var EN = document.documentElement.lang === 'en';
  var T = EN ? {
    aideLecture: 'Click a card to read its back. Drag to move around the fresk.',
    aideCommentaire: 'Click a card to read its back and leave feedback on it.',
    envoi: 'Sending…',
    merci: 'Thank you. Your feedback shows up right away; we review it afterwards.',
    echecEnvoi: 'Could not send. Please try again later.',
    echecAction: 'Action failed.',
    ecrivez: 'Write your feedback before sending.',
    vide: 'No feedback yet. Be the first.',
    anonyme: 'Anonymous',
    attente: 'awaiting review',
    valider: 'Approve', supprimer: 'Delete',
    confirmer: 'Permanently delete this feedback?',
    moderation: 'Moderation enabled',
    lotNom: { 1: 'AI', 2: 'Capabilities', 3: 'Present risks', 4: 'Existential risks', 5: 'Solutions' },
    tousLots: 'All', pleinEcran: 'Full screen', quitterPlein: 'Exit full screen',
    aucunResultat: 'No card matches',
    chargement: 'Loading…',
    echecChargement: 'Could not load. Please reload the page.',
    mene: 'What leads to it', entraine: 'What it leads to',
    repondA: 'What it answers', reponses: 'The answers to it',
    langue: 'en-GB',
    sujets: { carte: 'on a card', jeu: 'the card deck', deroule: 'the run-through',
              reference: 'the reference fresk', autre: 'other' }
  } : {
    aideLecture: 'Cliquez une carte pour lire son verso. Glissez pour vous déplacer dans la fresque.',
    aideCommentaire: 'Cliquez une carte pour lire son verso et laisser un retour dessus.',
    envoi: 'Envoi…',
    merci: 'Merci, c’est noté. Votre retour est visible tout de suite ; nous le relisons ensuite.',
    echecEnvoi: 'Envoi impossible. Réessayez plus tard.',
    echecAction: 'Action impossible.',
    ecrivez: 'Écrivez votre retour avant d’envoyer.',
    vide: 'Aucun retour pour le moment. Soyez le premier.',
    anonyme: 'Anonyme',
    attente: 'en attente de relecture',
    valider: 'Valider', supprimer: 'Supprimer',
    confirmer: 'Supprimer définitivement ce retour ?',
    moderation: 'Modération activée',
    lotNom: { 1: 'L’IA', 2: 'Capacités', 3: 'Risques actuels', 4: 'Risques existentiels', 5: 'Solutions' },
    tousLots: 'Tous', pleinEcran: 'Plein écran', quitterPlein: 'Quitter le plein écran',
    aucunResultat: 'Aucune carte ne correspond',
    chargement: 'Chargement…',
    echecChargement: 'Chargement impossible. Rechargez la page.',
    mene: 'Ce qui y mène', entraine: 'Ce que ça entraîne',
    repondA: 'Ce à quoi ça répond', reponses: 'Les réponses proposées',
    langue: 'fr-FR',
    sujets: { carte: 'sur une carte', jeu: 'le jeu de cartes',
              deroule: 'le déroulé', reference: 'la fresque de référence', autre: 'autre' }
  };

  /* ── Chargement ─────────────────────────────────────────── */
  function charger() {
    return Promise.all([
      fetch(RACINE + 'data/cartes.json').then(function (r) { return r.json(); }),
      fetch(RACINE + 'data/fresque-reference.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      res[0].cartes.forEach(function (c) { cartes[c.n] = c; });
      ref = res[1];
      // Les dimensions viennent du fichier : ajouter une carte en bas de plan
      // ne doit pas obliger a retoucher ce script.
      if (ref.plan) {
        PLAN_W = ref.plan.largeur || PLAN_W;
        PLAN_H = ref.plan.hauteur || PLAN_H;
        if (ref.plan.carte) {
          CARTE_W = ref.plan.carte.largeur || CARTE_W;
          CARTE_H = ref.plan.carte.hauteur || CARTE_H;
        }
      }
      $('plateau').style.width = PLAN_W + 'px';
      $('plateau').style.height = PLAN_H + 'px';
    });
  }

  /* ── Rendu du plateau ───────────────────────────────────── */
  function centre(n) {
    var p = ref.tableau.cartes.find(function (c) { return c.n === n; });
    return p ? { x: p.x + CARTE_W / 2, y: p.y + CARTE_H / 2 } : null;
  }

  /* Ramene le trait au bord de la carte plutot qu'a son centre : sans cela les
     fleches disparaissent sous les vignettes et les tetes ne se voient plus. */
  function bord(depuis, vers) {
    var dx = vers.x - depuis.x, dy = vers.y - depuis.y;
    if (!dx && !dy) return depuis;
    var mx = CARTE_W / 2 + 6, my = CARTE_H / 2 + 6;
    var t = Math.min(Math.abs(dx) ? mx / Math.abs(dx) : Infinity,
                     Math.abs(dy) ? my / Math.abs(dy) : Infinity);
    return { x: depuis.x + dx * t, y: depuis.y + dy * t };
  }

  function dessinerLiens() {
    var svg = $('liens');
    svg.setAttribute('viewBox', '0 0 ' + PLAN_W + ' ' + PLAN_H);
    svg.setAttribute('width', PLAN_W);
    svg.setAttribute('height', PLAN_H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var NS = 'http://www.w3.org/2000/svg';
    ref.tableau.fleches.forEach(function (f) {
      var a = centre(f.de), b = centre(f.vers);
      if (!a || !b) return;
      var p1 = bord(a, b), p2 = bord(b, a);

      /* TRAITS COURBES. Soixante-cinq droites qui se croisent donnent un
         entrelacs ou l'oeil ne peut plus suivre un seul fil. Une courbe legere,
         toujours du meme cote, separe les traits qui partagent un trajet et
         rend chaque lien suivable du depart a l'arrivee. La fleche est de
         longueur constante : la courbure croit avec la distance, sans jamais
         devenir un detour. */
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var lg = Math.hypot(dx, dy) || 1;
      var creux = Math.min(70, lg * 0.09);
      var cx = (p1.x + p2.x) / 2 - (dy / lg) * creux;
      var cy = (p1.y + p2.y) / 2 + (dx / lg) * creux;

      // Tangente a l'arrivee d'une quadratique : la direction (p2 - c).
      var ang = Math.atan2(p2.y - cy, p2.x - cx);
      var t = 13;
      var tx = p2.x - Math.cos(ang) * 4, ty = p2.y - Math.sin(ang) * 4;
      // Point median de la courbe, la ou se pose le libelle.
      var mx = (p1.x + 2 * cx + p2.x) / 4, my = (p1.y + 2 * cy + p2.y) / 4;

      var g = document.createElementNS(NS, 'g');
      g.dataset.de = f.de;
      g.dataset.vers = f.vers;
      /* UNE REPONSE N'EST PAS UNE CAUSE. Les fleches du lot 5 disent « repond
         a », pas « provoque ». Dessinees comme les autres, elles se lisent a
         l'envers : on croit que la solution cause le risque. Trait discontinu
         et couleur du lot : deux semantiques, deux traitements. */
      if (cartes[f.de] && cartes[f.de].lot === 5) g.setAttribute('class', 'reponse');

      var trait = document.createElementNS(NS, 'path');
      trait.setAttribute('d', 'M' + p1.x + ',' + p1.y + ' Q' + cx + ',' + cy + ' ' + tx + ',' + ty);
      trait.setAttribute('fill', 'none');

      var tete = document.createElementNS(NS, 'polygon');
      tete.setAttribute('class', 'tete');
      tete.setAttribute('points', [
        tx + ',' + ty,
        (tx - Math.cos(ang - 0.42) * t) + ',' + (ty - Math.sin(ang - 0.42) * t),
        (tx - Math.cos(ang + 0.42) * t) + ',' + (ty - Math.sin(ang + 0.42) * t)
      ].join(' '));

      var txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'halo');
      txt.setAttribute('x', mx);
      txt.setAttribute('y', my - 5);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = f.libelle;

      g.appendChild(trait);
      g.appendChild(tete);
      g.appendChild(txt);
      svg.appendChild(g);
    });
  }

  // Couleurs des lots, reprises telles quelles du tableau en ligne : un
  // animateur qui connait l'un reconnait l'autre.
  var LOT_COULEUR = { 1: '#E8811C', 2: '#2f7d4f', 3: '#3b6ea5', 4: '#8a4fb3', 5: '#c1444e' };

  function dessinerCartes() {
    var hote = $('cartes');
    hote.textContent = '';
    ref.tableau.cartes.forEach(function (p) {
      var c = cartes[p.n];
      if (!c) return;
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'c-carte';
      el.dataset.n = p.n;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      if (c.lot) el.style.setProperty('--lot', LOT_COULEUR[c.lot] || 'var(--accent)');
      el.setAttribute('aria-label', c.titre);

      var vis = document.createElement('span');
      vis.className = 'vis';
      var img = document.createElement('img');
      img.src = RACINE + c.image.vignette;
      img.alt = '';
      img.loading = 'lazy';
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = p.n;
      vis.appendChild(img);
      vis.appendChild(num);

      // LE TITRE EST SUR LA CARTE, pas seulement dans une bulle. Sans lui, la
      // fresque vue de loin n'est qu'une mosaique d'images : on ne peut ni la
      // lire ni s'y reperer, il faut cliquer chaque carte pour savoir ce
      // qu'elle dit. C'est ce qui rendait la premiere version illisible.
      var tit = document.createElement('span');
      tit.className = 'tit';
      tit.textContent = c.titre;

      var pastille = document.createElement('span');
      pastille.className = 'pastille';
      pastille.hidden = true;

      el.appendChild(vis);
      el.appendChild(tit);
      el.appendChild(pastille);
      hote.appendChild(el);
    });

    var eti = $('etiquettes');
    eti.textContent = '';
    (ref.tableau.textes || []).forEach(function (t, i) {
      var d = document.createElement('div');
      d.className = 'etiquette';
      d.style.left = t.x + 'px';
      d.style.top = t.y + 'px';
      d.style.setProperty('--lot', LOT_COULEUR[i + 1] || 'var(--accent)');
      d.textContent = t.contenu;
      eti.appendChild(d);
    });
  }

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── Mise en avant d'une carte et de ses liens ───────────── */
  function surligner(n) {
    cibleN = n;
    appliquerMiseEnAvant();
  }

  /* ── Filtrer par lot ────────────────────────────────────── */
  var lotActif = null;

  function construireLots() {
    var hote = $('lots');
    if (!hote) return;
    hote.textContent = '';
    var faire = function (n, texte) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lot-puce' + (lotActif === n ? ' actif' : '');
      b.dataset.lot = n === null ? '' : n;
      b.setAttribute('aria-pressed', String(lotActif === n));
      if (n !== null) b.style.setProperty('--lot', LOT_COULEUR[n]);
      b.textContent = texte;
      hote.appendChild(b);
    };
    faire(null, T.tousLots);
    [1, 2, 3, 4, 5].forEach(function (n) { faire(n, T.lotNom[n]); });
  }

  /* Un seul endroit décide de ce qui est mis en avant : la carte choisie, le
     lot filtré, ou la recherche. Sans cela les trois se marchent dessus et
     l'on voit apparaître des cartes que l'on vient d'écarter. */
  function appliquerMiseEnAvant() {
    var q = ($('recherche') && $('recherche').value || '').trim().toLowerCase();
    var voisins = null;
    if (cibleN != null) {
      voisins = {};
      voisins[cibleN] = true;
      ref.tableau.fleches.forEach(function (f) {
        if (f.de === cibleN) voisins[f.vers] = true;
        if (f.vers === cibleN) voisins[f.de] = true;
      });
    }
    var trouves = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.c-carte'), function (el) {
      var n = +el.dataset.n;
      var c = cartes[n];
      var gardee = true;
      if (lotActif != null && c && c.lot !== lotActif) gardee = false;
      if (q && c && c.titre.toLowerCase().indexOf(q) === -1) gardee = false;
      if (voisins && !voisins[n]) gardee = false;
      if (gardee) trouves++;
      el.classList.toggle('pale', !gardee);
      el.classList.toggle('actif', cibleN != null && n === cibleN);
      el.classList.toggle('trouve', !!q && gardee);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#liens g'), function (g) {
      var lie = cibleN != null && (+g.dataset.de === cibleN || +g.dataset.vers === cibleN);
      var dedans = lotActif == null
        || (cartes[+g.dataset.de] && cartes[+g.dataset.de].lot === lotActif)
        || (cartes[+g.dataset.vers] && cartes[+g.dataset.vers].lot === lotActif);
      g.classList.toggle('vif', lie);
      g.classList.toggle('pale', (cibleN != null && !lie) || (lotActif != null && !dedans));
      // L'aperçu de survol s'efface : sinon il reste allumé sous la sélection,
      // et deux mises en avant concurrentes se superposent.
      if (cibleN != null) g.classList.remove('survol');
    });
    var vide = $('recherche-vide');
    if (vide) vide.hidden = !(q && trouves === 0);
    majLibelles();
  }

  /* APERCU AU SURVOL. Avant de cliquer, on veut savoir ou mene une carte.
     Sans cela il faut ouvrir le panneau, lire, fermer, recommencer ; pour
     trente-huit cartes, c'est un parcours interminable. Le survol n'engage
     rien : il s'efface des qu'on part, et se tait des qu'une carte est
     choisie, pour ne pas concurrencer la selection. */
  function survoler(n) {
    if (cibleN != null) return;
    Array.prototype.forEach.call(document.querySelectorAll('#liens g'), function (g) {
      g.classList.toggle('survol', n != null && (+g.dataset.de === n || +g.dataset.vers === n));
    });
  }

  /* ── Panneau de lecture ─────────────────────────────────── */
  function ouvrirPanneau(n) {
    var c = cartes[n];
    if (!c) return;
    $('panneau-img').src = RACINE + c.image.vignette;
    $('panneau-img').alt = c.titre;
    $('panneau-titre').textContent = c.titre;
    $('panneau-verso').innerHTML = (c.verso || []).map(function (p) {
      return '<p>' + echapper(p) + '</p>';
    }).join('');

    /* UNE REPONSE N'ENTRAINE PAS SON RISQUE. Les fleches partant du lot 5
       disent « repond a » : les ranger sous « ce que ca entraine » inverse le
       sens de lecture. On separe donc les causes des reponses, des deux
       cotes du lien. */
    var estReponse = function (f) { return cartes[f.de] && cartes[f.de].lot === 5; };
    var sort = [], entre = [], reponses = [];
    ref.tableau.fleches.forEach(function (f) {
      if (f.de === n && cartes[f.vers]) sort.push(f);
      if (f.vers === n && cartes[f.de]) (estReponse(f) ? reponses : entre).push(f);
    });
    var cSol = cartes[n] && cartes[n].lot === 5;
    /* Les cartes liées sont CLIQUABLES : c'est ainsi qu'on suit une chaîne de
       cause à effet, qui est exactement ce qu'on vient préparer. Une liste de
       titres inertes obligerait à les retrouver à l'œil sur le plateau. */
    var bloc = '';
    var lien = function (n, libelle, avant) {
      var t = '<button type="button" class="vers-carte" data-vers="' + n + '">'
        + echapper(cartes[n].titre) + '</button>';
      var q = '<span class="quoi">' + echapper(libelle) + '</span>';
      return '<li>' + (avant ? t + ' ' + q : q + ' ' + t) + '</li>';
    };
    if (entre.length) {
      bloc += '<h4>' + T.mene + '</h4><ul>'
        + entre.map(function (f) { return lien(f.de, f.libelle + ' →', true); }).join('')
        + '</ul>';
    }
    if (sort.length) {
      bloc += '<h4>' + (cSol ? T.repondA : T.entraine) + '</h4><ul>'
        + sort.map(function (f) { return lien(f.vers, f.libelle + ' →', false); }).join('')
        + '</ul>';
    }
    if (reponses.length) {
      bloc += '<h4 class="h-reponse">' + T.reponses + '</h4><ul class="l-reponse">'
        + reponses.map(function (f) { return lien(f.de, f.libelle + ' →', true); }).join('')
        + '</ul>';
    }
    $('panneau-liens').innerHTML = bloc;

    rendreRetoursCarte(n);
    $('panneau-commentaire').hidden = !modeCom;
    $('c-texte').value = '';
    $('c-etat').textContent = '';
    $('panneau').hidden = false;
    surligner(n);
    // Le plateau se retire sous le panneau : à l'échelle d'ajustement il n'y a
    // aucun défilement horizontal possible, donc une carte de la colonne de
    // droite resterait cachée par le panneau qu'on vient d'ouvrir pour elle.
    document.body.classList.add('panneau-ouvert');
    // On ne réajuste PAS le zoom : le recalculer sur un cadre rétréci ferait
    // rapetisser la fresque à chaque clic, et on finirait par ne plus rien
    // lire. Le cadre perd de la largeur, le défilement compense.
    setTimeout(function () { hauteurCadre(); amenerEnVue(n); }, 30);
  }

  /* Le panneau s'ouvre par-dessus la droite du plateau : sans cela, cliquer une
     carte de la colonne « Solutions » la fait disparaitre derriere le panneau
     au moment meme ou on la selectionne. On fait donc defiler le plateau pour
     garder la carte dans la partie restee visible. */
  function amenerEnVue(n) {
    var p = ref.tableau.cartes.find(function (c) { return c.n === n; });
    var cadre = $('plateau-cadre');
    if (!p || !cadre) return;
    var largeurPanneau = $('panneau').hidden ? 0 : $('panneau').getBoundingClientRect().width;
    var cadreRect = cadre.getBoundingClientRect();
    var visible = Math.max(120, Math.min(cadreRect.right, window.innerWidth - largeurPanneau) - cadreRect.left);
    var x = (p.x + CARTE_W / 2) * zoom;
    var y = (p.y + CARTE_H / 2) * zoom;
    var cibleX = x - visible / 2;
    var cibleY = y - cadre.clientHeight / 2;
    if (cadre.scrollTo) cadre.scrollTo({ left: cibleX, top: cibleY, behavior: 'smooth' });
    else { cadre.scrollLeft = cibleX; cadre.scrollTop = cibleY; }
  }

  function fermerPanneau() {
    $('panneau').hidden = true;
    document.body.classList.remove('panneau-ouvert');
    surligner(null);
    hauteurCadre();
  }

  /* ── Zoom et deplacement ────────────────────────────────── */
  /* LISIBILITE DES LIBELLES. Soixante-cinq libelles affiches en meme temps a
     l'echelle d'ajustement donnent un plat de spaghettis ou rien ne se lit.
     On ne les montre donc que lorsqu'ils sont lisibles (zoom suffisant) ou
     lorsqu'ils repondent a une question posee (une carte selectionnee, dont on
     n'eclaire que les liens). */
  function majLibelles() {
    $('liens').classList.toggle('tous-libelles', cibleN == null && zoom >= 0.55);
  }

  function appliquerZoom() {
    $('plateau').style.transform = 'scale(' + zoom + ')';
    $('plateau-sizer').style.width = (PLAN_W * zoom) + 'px';
    $('plateau-sizer').style.height = (PLAN_H * zoom) + 'px';
    $('zoom-val').textContent = Math.round(zoom * 100) + ' %';
  }
  function ajuster() {
    var cadre = $('plateau-cadre');
    var dispo = cadre.clientWidth - 8;
    zoom = Math.max(0.12, Math.min(1, dispo / PLAN_W));
    appliquerZoom();
    hauteurCadre();
  }

  /* Le cadre epouse la hauteur de la fresque une fois mise a l'echelle, sans
     depasser ce que l'ecran peut montrer : autrement il reste une large bande
     vide sous la derniere carte. Appele aussi quand le panneau retrecit le
     cadre, car la fresque y tient alors sur plus de hauteur. */
  function hauteurCadre() {
    var cadre = $('plateau-cadre');
    if (!cadre) return;
    var vue = Math.min(window.innerHeight * 0.72, 760);
    cadre.style.height = Math.min(PLAN_H * zoom + 8, vue) + 'px';
  }

  /* ZOOM D'OUVERTURE. Sur un telephone, ajuster la fresque entiere donne 12 % :
     on voit la forme d'ensemble et pas un seul titre, ce qui ne sert a rien.
     On ouvre donc a une echelle ou les titres se lisent, quitte a faire
     defiler. Le bouton « Ajuster » reste la pour prendre du recul. */
  function zoomInitial() {
    ajuster();
    if (zoom < 0.32) {
      zoom = 0.5;
      appliquerZoom();
      var cadre = $('plateau-cadre');
      cadre.style.height = Math.min(PLAN_H * zoom + 8, Math.min(window.innerHeight * 0.72, 760)) + 'px';
    }
  }

  function glisser(cadre) {
    var actif = false, x0 = 0, y0 = 0, sx = 0, sy = 0;
    cadre.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.c-carte')) return;
      actif = true; x0 = e.clientX; y0 = e.clientY;
      sx = cadre.scrollLeft; sy = cadre.scrollTop;
      cadre.classList.add('attrape');
      cadre.setPointerCapture(e.pointerId);
    });
    cadre.addEventListener('pointermove', function (e) {
      if (!actif) return;
      cadre.scrollLeft = sx - (e.clientX - x0);
      cadre.scrollTop = sy - (e.clientY - y0);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      cadre.addEventListener(ev, function () { actif = false; cadre.classList.remove('attrape'); });
    });
  }

  /* ── Commentaires ───────────────────────────────────────── */
  var API = '/.netlify/functions/commentaires';
  /* Chemin vers la racine du site : /animateurs/ est a un niveau,
     /en/facilitators/ a deux. Le HTML le declare, le script s'y fie. */
  var RACINE = document.body.dataset.racine || '../';

  function envoyer(charge, etatEl) {
    etatEl.className = 'etat';
    etatEl.textContent = T.envoi;
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.erreur || T.echecEnvoi);
        etatEl.className = 'etat ok';
        etatEl.textContent = T.merci;
        return d;
      });
    }).catch(function (e) {
      etatEl.className = 'etat err';
      etatEl.textContent = e.message || T.echecEnvoi;
      throw e;
    });
  }

  function chargerRetours() {
    return fetch(API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        retours = d.retours || [];
        majPastilles(d.compte || {});
        rendreRetours();
        if (cibleN != null) rendreRetoursCarte(cibleN);
      })
      .catch(function () { /* la liste est un agrément, pas une dépendance */ });
  }

  function majPastilles(compte) {
    Array.prototype.forEach.call(document.querySelectorAll('.c-carte'), function (el) {
      var p = el.querySelector('.pastille');
      var k = compte[el.dataset.n] || 0;
      p.hidden = !k;
      p.textContent = k;
    });
  }

  function ligneRetour(r) {
    var quand = new Date(r.date).toLocaleDateString(T.langue,
      { day: 'numeric', month: 'long', year: 'numeric' });
    var quoi = r.carte != null && cartes[r.carte]
      ? cartes[r.carte].titre
      : (T.sujets[r.sujet] || r.sujet);
    var html = '<li class="' + (r.valide ? '' : 'attente') + '" data-cle="' + echapper(r.cle) + '">'
      + '<div class="meta">'
      + '<strong>' + echapper(r.nom || T.anonyme) + '</strong>'
      + '<span>·</span><span>' + echapper(quoi) + '</span>'
      + '<span>·</span><span>' + echapper(quand) + '</span>'
      + (r.valide ? '' : '<span class="badge-attente">' + T.attente + '</span>')
      + '</div>'
      + '<p class="texte">' + echapper(r.texte) + '</p>';
    if (jeton) {
      html += '<div class="actions">'
        + (r.valide ? '' : '<button type="button" class="valider">' + T.valider + '</button>')
        + '<button type="button" class="supprimer">' + T.supprimer + '</button></div>';
    }
    return html + '</li>';
  }

  function rendreRetours() {
    var hote = $('retours');
    if (!retours.length) {
      hote.innerHTML = '<li class="retours-vide">' + echapper(T.vide) + '</li>';
      return;
    }
    hote.innerHTML = retours.map(ligneRetour).join('');
  }

  function rendreRetoursCarte(n) {
    var hote = $('retours-carte');
    var liste = retours.filter(function (r) { return r.carte === n; });
    hote.innerHTML = liste.length ? liste.map(ligneRetour).join('') : '';
  }

  function moderer(cle, action) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, cle: cle, jeton: jeton })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.erreur || T.echecAction);
      });
    }).then(chargerRetours);
  }

  /* ── Mise en route ──────────────────────────────────────── */
  var libelleReveal = $('btn-reveal').textContent;
  $('btn-reveal').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = T.chargement;
    charger().then(function () {
      $('reveal').hidden = true;
      $('plateau-section').hidden = false;
      $('retours-section').hidden = false;
      dessinerCartes();
      dessinerLiens();
      construireLots();
      zoomInitial();
      glisser($('plateau-cadre'));
      chargerRetours();
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = libelleReveal;
      console.error('espace animateurs :', e);
      alert(T.echecChargement);
    });
  });

  document.addEventListener('click', function (e) {
    var c = e.target.closest('.c-carte');
    if (c) { ouvrirPanneau(+c.dataset.n); return; }
    if (e.target.closest('.panneau')) return;
    if (!$('panneau').hidden && !e.target.closest('.plateau')) fermerPanneau();
  });
  $('cartes').addEventListener('mouseover', function (e) {
    var c = e.target.closest('.c-carte');
    if (c) survoler(+c.dataset.n);
  });
  $('cartes').addEventListener('mouseout', function (e) {
    if (e.target.closest('.c-carte')) survoler(null);
  });
  // Au clavier, le focus joue le role du survol : parcourir les cartes a la
  // tabulation doit montrer la meme chose que les parcourir a la souris.
  $('cartes').addEventListener('focusin', function (e) {
    var c = e.target.closest('.c-carte');
    if (c) survoler(+c.dataset.n);
  });
  $('cartes').addEventListener('focusout', function () { survoler(null); });

  $('panneau-fermer').addEventListener('click', fermerPanneau);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('panneau').hidden) fermerPanneau();
  });

  $('plateau-cadre').addEventListener('wheel', function (e) {
    // Sans Ctrl, la molette fait ce qu'elle fait partout : elle defile.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = Math.max(0.12, Math.min(1.6, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    appliquerZoom();
  }, { passive: false });

  $('zoom-plus').addEventListener('click', function () { zoom = Math.min(1.6, zoom * 1.25); appliquerZoom(); });
  $('zoom-moins').addEventListener('click', function () { zoom = Math.max(0.12, zoom / 1.25); appliquerZoom(); });
  $('zoom-ajuste').addEventListener('click', ajuster);

  $('mode-commentaires').addEventListener('change', function () {
    modeCom = this.checked;
    $('barre-aide').textContent = modeCom ? T.aideCommentaire : T.aideLecture;
    $('panneau-commentaire').hidden = !modeCom || $('panneau').hidden;
  });

  $('lots').addEventListener('click', function (e) {
    var b = e.target.closest('.lot-puce');
    if (!b) return;
    var n = b.dataset.lot === '' ? null : +b.dataset.lot;
    lotActif = (lotActif === n) ? null : n;
    construireLots();
    appliquerMiseEnAvant();
  });

  var minuteurRecherche = null;
  $('recherche').addEventListener('input', function () {
    // On attend une courte pause : filtrer à chaque frappe sur 38 cartes est
    // sans douleur, mais le panneau ouvert se rafraîchirait sous les doigts.
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(appliquerMiseEnAvant, 120);
  });

  $('plein-ecran').addEventListener('click', function () {
    var cible = $('plateau-section');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (cible.requestFullscreen) cible.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', function () {
    $('plein-ecran').textContent = document.fullscreenElement ? T.quitterPlein : T.pleinEcran;
    // La hauteur du cadre est calculée d'après la fenêtre : elle vient de
    // changer du tout au tout.
    setTimeout(ajuster, 60);
  });

  $('panneau-liens').addEventListener('click', function (e) {
    var b = e.target.closest('.vers-carte');
    if (b) ouvrirPanneau(+b.dataset.vers);
  });

  $('form-jeton').addEventListener('submit', function (e) {
    e.preventDefault();
    jeton = $('jeton').value.trim();
    var etat = $('jeton-etat');
    etat.className = 'jeton-etat';
    etat.textContent = jeton ? T.moderation : '';
    // Le jeton n'est pas verifie ici : la fonction le refusera a la premiere
    // action. L'afficher comme « activé » sans l'avoir eprouve serait mentir,
    // mais le verifier a vide couterait un appel pour rien.
    rendreRetours();
    if (cibleN != null) rendreRetoursCarte(cibleN);
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.retours .actions button');
    if (!b) return;
    var li = b.closest('li');
    var action = b.classList.contains('valider') ? 'valider' : 'supprimer';
    if (action === 'supprimer' && !confirm(T.confirmer)) return;
    b.disabled = true;
    moderer(li.dataset.cle, action).catch(function (err) {
      b.disabled = false;
      var etat = $('jeton-etat');
      etat.className = 'jeton-etat err';
      etat.textContent = err.message || T.echecAction;
    });
  });

  $('c-envoi').addEventListener('click', function () {
    var texte = $('c-texte').value.trim();
    if (texte.length < 3) {
      $('c-etat').className = 'etat err';
      $('c-etat').textContent = 'Écrivez votre retour avant d’envoyer.';
      return;
    }
    envoyer({ sujet: 'carte', carte: cibleN, texte: texte, nom: $('c-nom').value.trim() }, $('c-etat'))
      .then(function () { $('c-texte').value = ''; return chargerRetours(); })
      .catch(function () { /* l'état est déjà affiché */ });
  });

  $('form-general').addEventListener('submit', function (e) {
    e.preventDefault();
    envoyer({
      sujet: $('g-sujet').value,
      texte: $('g-texte').value.trim(),
      nom: $('g-nom').value.trim(),
      email: $('g-email').value.trim()
    }, $('g-etat'))
      .then(function () { $('g-texte').value = ''; return chargerRetours(); })
      .catch(function () { /* l'état est déjà affiché */ });
  });
})();
