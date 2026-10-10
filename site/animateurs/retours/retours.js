/* LA PAGE RETOURS : UN FORMULAIRE, ET RIEN D'AUTRE.

   Donner un retour se faisait carte par carte, depuis le plateau : activer un
   « mode commentaires », trouver la carte, ouvrir son panneau, choisir un
   onglet, parfois designer un lien. Beaucoup d'etapes pour une phrase, et une
   page qui portait a la fois la fresque, les commentaires, la moderation et la
   correction des cartes. On demande desormais la meme chose en un formulaire :
   le sujet, la carte s'il y en a une, le texte.

   PAS DE JETON SUR CETTE PAGE. Elle n'affiche plus les retours deposes, donc
   elle n'a plus rien a moderer : la relecture se fait dans /admin/, avec les
   retours d'atelier et les temoignages, c'est-a-dire au meme endroit que le
   reste. Le jeton de moderation garde son usage ailleurs, sur la fresque de
   reference, pour corriger une carte ou deplacer le plan.

   LE SERVICE EST INCHANGE. Un numero de carte fait basculer le sujet sur
   « carte » (serveur/src/commentaires.js), exactement comme avant : rien de ce
   qui a deja ete depose n'est perdu, et la moderation reste la meme. */
(function () {
  'use strict';

  var API = '/.netlify/functions/commentaires';
  var RACINE = document.body.dataset.racine || '../../';
  var $ = function (id) { return document.getElementById(id); };
  var EN = document.documentElement.lang === 'en';

  var T = EN ? {
    envoi: 'Sending…',
    merci: 'Thank you. Your feedback has reached us; we read every one.',
    echecEnvoi: 'Could not send. Please try again later.',
    ecrivez: 'Write your feedback before sending.',
    retirer: 'Remove card'
  } : {
    envoi: 'Envoi…',
    merci: 'Merci, c’est noté. Votre retour nous est bien parvenu ; nous les lisons tous.',
    echecEnvoi: 'Envoi impossible. Réessayez plus tard.',
    ecrivez: 'Écrivez votre retour avant d’envoyer.',
    retirer: 'Retirer la carte'
  };

  /* ── Le choix de la carte ─────────────────────────────────
     Rempli depuis cartes.json, donc toujours a jour, avec le calque des
     corrections publiees par-dessus : un titre corrige se lit ici aussi. La
     carte 0 est l'introduction, elle n'est pas en jeu. */
  /* LES CARTES CHOISIES. Un retour porte souvent sur deux ou trois cartes a la
     fois ; il fallait alors envoyer trois fois le meme texte. On garde donc une
     liste, et on la montre : sans les puces, on ne sait plus ce qu'on a pris.

     LE TITRE N'EST AFFICHE QUE S'IL TIENT. « 27 · Enracinement des systemes de
     controle et d'oppression » ferait une puce plus large que le formulaire :
     au-dela, le numero seul, et le titre reste dans l'infobulle. */
  var MAX_TITRE_PUCE = 28;
  var choisies = [];
  var titres = {};

  function majPuces() {
    var hote = $('cartes-choisies');
    if (!hote) return;
    hote.innerHTML = choisies.map(function (n) {
      var t = titres[n] || '';
      var court = t.length > MAX_TITRE_PUCE ? '' : ' · ' + echapper(t);
      return '<li class="puce-carte"><span title="' + echapper(n + ' · ' + t) + '">'
        + n + court + '</span>'
        + '<button type="button" class="puce-x" data-n="' + n + '" aria-label="'
        + echapper(T.retirer + ' ' + n) + '">×</button></li>';
    }).join('');
    /* La carte deja prise sort de la liste : la reproposer invite a la choisir
       deux fois, et le service la compterait une fois de plus. */
    var sel = $('g-carte');
    if (sel) {
      [].forEach.call(sel.options, function (o) {
        if (o.value) o.hidden = choisies.indexOf(Number(o.value)) !== -1;
      });
      sel.value = '';
    }
  }

  function echapper(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function chargerCartes() {
    var sel = $('g-carte');
    if (!sel) return Promise.resolve();
    return fetch(RACINE + 'data/cartes.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { return window.CalqueCartes ? window.CalqueCartes.appliquer(d) : d; })
      .then(function (d) {
        d.cartes.filter(function (c) { return c.n >= 1; })
          .sort(function (a, b) { return a.n - b.n; })
          .forEach(function (c) {
            titres[c.n] = c.titre;
            var o = document.createElement('option');
            o.value = String(c.n);
            o.textContent = c.n + ' · ' + c.titre;
            sel.appendChild(o);
          });
      })
      .catch(function () { /* sans la liste, le reste du formulaire marche */ });
  }

  function envoyer(charge, etatEl, silencieux) {
    if (!silencieux) {
      etatEl.className = 'etat';
      etatEl.textContent = T.envoi;
    }
    return fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  chargerCartes();

  var sel = $('g-carte');
  if (sel) sel.addEventListener('change', function () {
    var n = parseInt(sel.value, 10);
    if (isFinite(n) && choisies.indexOf(n) === -1) choisies.push(n);
    choisies.sort(function (a, b) { return a - b; });
    majPuces();
  });
  var puces = $('cartes-choisies');
  if (puces) puces.addEventListener('click', function (e) {
    var b = e.target.closest('.puce-x');
    if (!b) return;
    choisies = choisies.filter(function (n) { return n !== Number(b.dataset.n); });
    majPuces();
  });

  var form = $('form-retour');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var texte = $('g-texte').value.trim();
    var etat = $('g-etat');
    if (texte.length < 3) {
      etat.className = 'etat err';
      etat.textContent = T.ecrivez;
      return;
    }
    /* UN RETOUR PAR CARTE CHOISIE, meme texte. Le service range chaque retour
       sous SA carte : c'est ce qui permet de les retrouver carte par carte dans
       /admin/. Un seul retour portant trois numeros se serait range sous une
       seule, ou sous aucune. Sans carte, un envoi, comme avant. */
    var cibles = choisies.length ? choisies.slice() : [null];
    var base = { sujet: $('g-sujet').value, texte: texte,
      nom: $('g-nom').value.trim(), email: $('g-email').value.trim() };
    var premier = true;
    cibles.reduce(function (chaine, n) {
      return chaine.then(function () {
        // Le service bascule le sujet sur « carte » des qu'un numero est donne.
        var p = envoyer(Object.assign({}, base, { carte: n }), etat, !premier);
        premier = false;
        return p;
      });
    }, Promise.resolve()).then(function () {
      $('g-texte').value = '';
      choisies = [];
      majPuces();
    }).catch(function () { /* l'état est déjà affiché */ });
  });
})();
