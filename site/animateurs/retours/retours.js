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
    ecrivez: 'Write your feedback before sending.'
  } : {
    envoi: 'Envoi…',
    merci: 'Merci, c’est noté. Votre retour nous est bien parvenu ; nous les lisons tous.',
    echecEnvoi: 'Envoi impossible. Réessayez plus tard.',
    ecrivez: 'Écrivez votre retour avant d’envoyer.'
  };

  /* ── Le choix de la carte ─────────────────────────────────
     Rempli depuis cartes.json, donc toujours a jour, avec le calque des
     corrections publiees par-dessus : un titre corrige se lit ici aussi. La
     carte 0 est l'introduction, elle n'est pas en jeu. */
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
            var o = document.createElement('option');
            o.value = String(c.n);
            o.textContent = c.n + ' · ' + c.titre;
            sel.appendChild(o);
          });
      })
      .catch(function () { /* sans la liste, le reste du formulaire marche */ });
  }

  function envoyer(charge, etatEl) {
    etatEl.className = 'etat';
    etatEl.textContent = T.envoi;
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
    var n = parseInt($('g-carte').value, 10);
    envoyer({
      sujet: $('g-sujet').value,
      // Le service bascule le sujet sur « carte » des qu'un numero est donne.
      carte: isFinite(n) ? n : null,
      texte: texte,
      nom: $('g-nom').value.trim(),
      email: $('g-email').value.trim()
    }, etat).then(function () {
      $('g-texte').value = '';
      $('g-carte').value = '';
    }).catch(function () { /* l'état est déjà affiché */ });
  });
})();
