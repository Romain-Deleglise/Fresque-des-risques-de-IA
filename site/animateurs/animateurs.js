/* ESPACE ANIMATEUR·ICES.

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
    chargement: 'Loading…',
    echecChargement: 'Could not load. Please reload the page.',
    mene: 'What leads to it', entraine: 'What it leads to',
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
    chargement: 'Chargement…',
    echecChargement: 'Chargement impossible. Rechargez la page.',
    mene: 'Ce qui y mène', entraine: 'Ce que ça entraîne',
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
    var html = '';
    ref.tableau.fleches.forEach(function (f) {
      var a = centre(f.de), b = centre(f.vers);
      if (!a || !b) return;
      var p1 = bord(a, b), p2 = bord(b, a);
      var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      var t = 13; // demi-longueur de la tete
      var tx = p2.x - Math.cos(ang) * 4, ty = p2.y - Math.sin(ang) * 4;
      var pts = [
        (tx) + ',' + (ty),
        (tx - Math.cos(ang - 0.42) * t) + ',' + (ty - Math.sin(ang - 0.42) * t),
        (tx - Math.cos(ang + 0.42) * t) + ',' + (ty - Math.sin(ang + 0.42) * t)
      ].join(' ');
      html += '<g data-de="' + f.de + '" data-vers="' + f.vers + '">'
        + '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + tx + '" y2="' + ty + '"/>'
        + '<polygon class="tete" points="' + pts + '"/>'
        + '<text class="halo" x="' + mx + '" y="' + (my - 5) + '" text-anchor="middle">'
        + echapper(f.libelle) + '</text></g>';
    });
    svg.innerHTML = html;
  }

  function dessinerCartes() {
    var hote = $('cartes'), html = '';
    ref.tableau.cartes.forEach(function (p) {
      var c = cartes[p.n];
      if (!c) return;
      html += '<button type="button" class="carte" data-n="' + p.n + '"'
        + ' style="left:' + p.x + 'px;top:' + p.y + 'px"'
        + ' aria-label="' + echapper(c.titre) + '" title="' + echapper(c.titre) + '">'
        + '<img src="' + RACINE + c.image.vignette + '" alt="" loading="lazy">'
        + '<span class="pastille" hidden></span></button>';
    });
    hote.innerHTML = html;

    var eti = '';
    (ref.tableau.textes || []).forEach(function (t) {
      eti += '<div class="etiquette" style="left:' + t.x + 'px;top:' + t.y + 'px">'
        + echapper(t.contenu) + '</div>';
    });
    $('etiquettes').innerHTML = eti;
  }

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── Mise en avant d'une carte et de ses liens ───────────── */
  function surligner(n) {
    cibleN = n;
    var voisins = {};
    if (n != null) {
      voisins[n] = true;
      ref.tableau.fleches.forEach(function (f) {
        if (f.de === n) voisins[f.vers] = true;
        if (f.vers === n) voisins[f.de] = true;
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.carte'), function (el) {
      var m = +el.dataset.n;
      el.classList.toggle('actif', n != null && m === n);
      el.classList.toggle('pale', n != null && !voisins[m]);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#liens g'), function (g) {
      var lie = n != null && (+g.dataset.de === n || +g.dataset.vers === n);
      g.classList.toggle('vif', lie);
      g.classList.toggle('pale', n != null && !lie);
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

    var sort = [], entre = [];
    ref.tableau.fleches.forEach(function (f) {
      if (f.de === n && cartes[f.vers]) sort.push(f);
      if (f.vers === n && cartes[f.de]) entre.push(f);
    });
    var bloc = '';
    if (entre.length) {
      bloc += '<h4>' + T.mene + '</h4><ul>' + entre.map(function (f) {
        return '<li><span class="fleche">' + echapper(cartes[f.de].titre) + '</span> '
          + '<span class="quoi">— ' + echapper(f.libelle) + ' →</span></li>';
      }).join('') + '</ul>';
    }
    if (sort.length) {
      bloc += '<h4>' + T.entraine + '</h4><ul>' + sort.map(function (f) {
        return '<li><span class="quoi">— ' + echapper(f.libelle) + ' →</span> '
          + '<span class="fleche">' + echapper(cartes[f.vers].titre) + '</span></li>';
      }).join('') + '</ul>';
    }
    $('panneau-liens').innerHTML = bloc;

    rendreRetoursCarte(n);
    $('panneau-commentaire').hidden = !modeCom;
    $('c-texte').value = '';
    $('c-etat').textContent = '';
    $('panneau').hidden = false;
    surligner(n);
  }

  function fermerPanneau() {
    $('panneau').hidden = true;
    surligner(null);
  }

  /* ── Zoom et deplacement ────────────────────────────────── */
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
    // Le cadre epouse la hauteur de la fresque une fois mise a l'echelle,
    // sans depasser ce que l'ecran peut montrer : autrement il reste une
    // large bande vide sous la derniere carte.
    var vue = Math.min(window.innerHeight * 0.72, 760);
    cadre.style.height = Math.min(PLAN_H * zoom + 8, vue) + 'px';
  }

  function glisser(cadre) {
    var actif = false, x0 = 0, y0 = 0, sx = 0, sy = 0;
    cadre.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.carte')) return;
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
    Array.prototype.forEach.call(document.querySelectorAll('.carte'), function (el) {
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
      ajuster();
      glisser($('plateau-cadre'));
      chargerRetours();
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = libelleReveal;
      alert(T.echecChargement);
    });
  });

  document.addEventListener('click', function (e) {
    var c = e.target.closest('.carte');
    if (c) { ouvrirPanneau(+c.dataset.n); return; }
    if (e.target.closest('.panneau')) return;
    if (!$('panneau').hidden && !e.target.closest('.plateau')) fermerPanneau();
  });
  $('panneau-fermer').addEventListener('click', fermerPanneau);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('panneau').hidden) fermerPanneau();
  });

  $('zoom-plus').addEventListener('click', function () { zoom = Math.min(1.6, zoom * 1.25); appliquerZoom(); });
  $('zoom-moins').addEventListener('click', function () { zoom = Math.max(0.12, zoom / 1.25); appliquerZoom(); });
  $('zoom-ajuste').addEventListener('click', ajuster);

  $('mode-commentaires').addEventListener('change', function () {
    modeCom = this.checked;
    $('barre-aide').textContent = modeCom ? T.aideCommentaire : T.aideLecture;
    $('panneau-commentaire').hidden = !modeCom || $('panneau').hidden;
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
