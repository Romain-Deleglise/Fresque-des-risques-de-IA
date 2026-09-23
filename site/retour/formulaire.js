/* Envoi du formulaire vers /.netlify/functions/retour.
   Un seul script pour les deux pages : il lit les champs presents, ce qui evite
   d'en maintenir deux qui divergeront. */
(function () {
  'use strict';
  var API = '/.netlify/functions/retour';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  if (!form) return;

  var estTemoignage = !!$('texte');

  function valeurs() {
    var v = { site: ($('site') || {}).value || '' };
    if (estTemoignage) {
      v.genre = 'temoignage';
      ['texte', 'prenom', 'precision', 'mail'].forEach(function (k) {
        if ($(k)) v[k] = $(k).value;
      });
      v.accord = !!($('accord') && $('accord').checked);
    } else {
      v.genre = 'atelier';
      ['role', 'format', 'dateAtelier', 'marquant', 'pasClair', 'creuser',
       'carte', 'technique', 'autre', 'mail'].forEach(function (k) {
        if ($(k)) v[k] = $(k).value;
      });
      var d = form.querySelector('input[name="duree"]:checked');
      v.duree = d ? d.value : '';
    }
    return v;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var etat = $('etat');
    var bouton = form.querySelector('button[type="submit"]');
    etat.className = 'etat';
    etat.textContent = 'Envoi…';
    bouton.disabled = true;

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valeurs())
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.erreur || 'Envoi impossible.');
        etat.className = 'etat ok';
        etat.textContent = estTemoignage
          ? 'Merci ! Nous le relisons avant de le publier.'
          : 'Merci, c’est noté. Vos remarques servent à la prochaine version.';
        form.reset();
        // Le formulaire est fini : on ne propose pas de le renvoyer en boucle.
        bouton.hidden = true;
      });
    }).catch(function (err) {
      etat.className = 'etat err';
      etat.textContent = err.message || 'Envoi impossible. Réessayez plus tard.';
      bouton.disabled = false;
    });
  });
})();
