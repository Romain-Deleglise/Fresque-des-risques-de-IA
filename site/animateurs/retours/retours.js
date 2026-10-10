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
    retirer: 'Remove card',
    attente: 'awaiting review',
    anonyme: 'Anonymous',
    aucunRetour: 'Nothing has been reported yet. Yours would be the first.',
    combien: function (k) { return k + (k > 1 ? ' pieces of feedback' : ' piece of feedback') + ', most recent first.'; },
    sujets: { carte: 'A card', atelier: 'The workshop', jeu: 'The card set',
      deroule: 'Timing', reference: 'Reference collage', autre: 'Other' }
  } : {
    envoi: 'Envoi…',
    merci: 'Merci, c’est noté. Votre retour nous est bien parvenu ; nous les lisons tous.',
    echecEnvoi: 'Envoi impossible. Réessayez plus tard.',
    ecrivez: 'Écrivez votre retour avant d’envoyer.',
    retirer: 'Retirer la carte',
    attente: 'en attente de relecture',
    anonyme: 'Anonyme',
    aucunRetour: 'Rien n’a encore été signalé. Le vôtre serait le premier.',
    combien: function (k) { return k + ' retour' + (k > 1 ? 's' : '') + ', du plus récent au plus ancien.'; },
    sujets: { carte: 'Une carte', atelier: 'L’atelier', jeu: 'Le jeu de cartes',
      deroule: 'Le déroulé', reference: 'La fresque de référence', autre: 'Autre' }
  };

  /* ── Le choix de la carte ─────────────────────────────────
     Rempli depuis cartes.json, donc toujours a jour, avec le calque des
     corrections publiees par-dessus : un titre corrige se lit ici aussi. La
     carte 0 est l'introduction, elle n'est pas en jeu. */
  /* LES CARTES CHOISIES. Un retour porte souvent sur deux ou trois cartes a la
     fois ; il fallait alors envoyer trois fois le meme texte. On garde donc une
     liste, et on la montre : sans les puces, on ne sait plus ce qu'on a pris.

     TOUJOURS LE NUMERO ET LE TITRE. Le titre n'etait affiche que s'il tenait en
     vingt-huit signes : une puce sur deux montrait le numero seul, et on ne
     savait plus laquelle on avait prise sans retourner compter dans la liste.
     Elles portent donc toutes les deux, et c'est la puce qui s'adapte : elle
     ne depasse pas la largeur du formulaire, le texte trop long se termine en
     points de suspension, et l'infobulle garde le titre entier. */
  var choisies = [];
  var titres = {};

  function majPuces() {
    var hote = $('cartes-choisies');
    if (!hote) return;
    hote.innerHTML = choisies.map(function (n) {
      var t = titres[n] || '';
      var entier = t ? n + ' · ' + t : String(n);
      return '<li class="puce-carte"><span title="' + echapper(entier) + '">'
        + echapper(entier) + '</span>'
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

  /* ── CE QUI A DEJA ETE DIT ────────────────────────────────
     Sans cette liste, deux personnes signalent la meme carte a deux semaines
     d'intervalle sans jamais le savoir, et qui depose un retour ne voit nulle
     part qu'il est arrive. Lecture seule : valider et supprimer restent dans
     /admin/, avec le reste de la moderation. Le service ne renvoie jamais
     l'adresse e-mail (serveur/src/commentaires.js, `public`). */
  function dateCourte(ms) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleDateString(EN ? 'en-GB' : 'fr-FR',
        { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function ligneRetour(r) {
    var sujet = T.sujets[r.sujet] || T.sujets.autre;
    var carte = r.carte ? ' · ' + (EN ? 'card ' : 'carte ') + r.carte
      + (titres[r.carte] ? ' · ' + echapper(titres[r.carte]) : '') : '';
    return '<li class="retour-public' + (r.valide ? '' : ' en-attente') + '">'
      + '<p class="retour-tete"><span class="retour-sujet">' + echapper(sujet) + carte + '</span>'
      + '<span class="retour-date">' + echapper(dateCourte(r.date)) + '</span></p>'
      + '<p class="retour-texte">' + echapper(r.texte).replace(/\n/g, '<br>') + '</p>'
      + '<p class="retour-pied">' + echapper(r.nom || T.anonyme)
      + (r.valide ? '' : ' · <span class="retour-attente">' + T.attente + '</span>')
      + '</p></li>';
  }

  function rendreRetours(liste) {
    var hote = $('retours-liste');
    var bloc = $('retours-publics');
    if (!hote || !bloc) return;
    bloc.hidden = false;
    var compte = $('retours-compte');
    if (compte) compte.textContent = liste.length ? T.combien(liste.length) : T.aucunRetour;
    hote.innerHTML = liste.map(ligneRetour).join('');
  }

  function chargerRetours() {
    return fetch(API).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      rendreRetours(d.retours || []);
    }).catch(function () { /* la page reste un formulaire : c'est l'essentiel */ });
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

  /* Les titres d'abord : la liste nomme la carte, pas seulement son numero. */
  chargerCartes().then(chargerRetours);

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
      chargerRetours();
    }).catch(function () { /* l'état est déjà affiché */ });
  });
})();
