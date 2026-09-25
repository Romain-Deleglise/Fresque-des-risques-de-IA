/* KIT D'ANNONCE.

   On saisit son atelier une fois, l'affiche et les trois textes se remplissent.
   Sans cela chacun recopie les memes informations a quatre endroits, et c'est
   la date qui finit par differer d'un support a l'autre.

   La saisie est gardee dans le navigateur : on prepare une annonce en plusieurs
   fois, et retaper la date parce qu'on a ferme l'onglet est exactement le genre
   de friction qui fait renoncer.
*/
(function () {
  'use strict';
  var CLE = 'fresque-kit';
  var CHAMPS = ['k-date', 'k-heure', 'k-lieu', 'k-lien', 'k-contact'];
  var $ = function (id) { return document.getElementById(id); };

  function valeurs() {
    var v = {};
    CHAMPS.forEach(function (id) { v[id] = ($(id).value || '').trim(); });
    return v;
  }

  function quand(v) {
    if (v['k-date'] && v['k-heure']) return v['k-date'] + ' à ' + v['k-heure'];
    return v['k-date'] || v['k-heure'] || 'à préciser';
  }
  function lien(v) { return v['k-lien'] || 'https://fresquedesrisquesdelia.org/participer/'; }

  function textes(v) {
    var ou = v['k-lieu'] || 'à préciser';
    var contact = v['k-contact'] ? '\n\nUne question ? Écrivez-moi : ' + v['k-contact'] : '';

    return {
      't-mail':
        'Objet : Un atelier pour comprendre les enjeux de l’IA, ' + (v['k-date'] || '[date]') + '\n\n' +
        'Bonjour,\n\n' +
        'J’organise un atelier de La Fresque des risques de l’IA, et je serais ravi·e de vous y voir.\n\n' +
        'C’est un atelier collaboratif de 2 h 30, à partir d’un jeu de 38 cartes. En petit groupe, on ' +
        'relie les cartes entre elles pour construire une vue d’ensemble : comment l’IA fonctionne, ce ' +
        'qu’elle sait faire, ce qu’elle met en jeu, et les réponses possibles. Aucun prérequis technique : ' +
        'tout est sur les cartes, et les discussions sont le cœur de l’atelier.\n\n' +
        'Quand : ' + quand(v) + '\n' +
        'Où : ' + ou + '\n' +
        'Inscription : ' + lien(v) + '\n\n' +
        'L’atelier est gratuit et sans engagement. Venez comme vous êtes, curieux·se suffit.' +
        contact + '\n\n' +
        'À bientôt,',

      't-court':
        'Salut ! J’anime un atelier de La Fresque des risques de l’IA ' + quand(v) + ' (' + ou + '). ' +
        '2 h 30, en petit groupe, sans aucun prérequis : on relie 38 cartes pour comprendre ensemble ' +
        'ce que l’IA met en jeu et ce qu’on peut y répondre. C’est gratuit. ' +
        'Inscription ici : ' + lien(v) + '. Ça te dit ?',

      't-reseau':
        'On parle beaucoup d’intelligence artificielle. Rarement en prenant le temps de comprendre.\n\n' +
        'J’anime La Fresque des risques de l’IA : 2 h 30, 38 cartes, un petit groupe, et aucun prérequis. ' +
        'On construit ensemble une vue d’ensemble, des capacités actuelles aux risques, jusqu’aux ' +
        'réponses possibles.\n\n' +
        '📅 ' + quand(v) + '\n' +
        '📍 ' + ou + '\n' +
        '🎟️ Gratuit, inscription : ' + lien(v) + '\n\n' +
        '#IA #FresqueDesRisquesDeLIA #PauseIA'
    };
  }

  function majAffiche(v) {
    $('af-date').textContent = quand(v);
    $('af-lieu').textContent = v['k-lieu'] || 'à préciser';
    $('af-inscription').textContent = 'Inscription : ' + lien(v).replace(/^https?:\/\//, '');
  }

  function maj() {
    var v = valeurs();
    majAffiche(v);
    var t = textes(v);
    Object.keys(t).forEach(function (id) { $(id).textContent = t[id]; });
    try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ }
  }

  try {
    var sauve = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (sauve) CHAMPS.forEach(function (id) { if (sauve[id]) $(id).value = sauve[id]; });
  } catch (e) { /* on repart d'un formulaire vide */ }

  CHAMPS.forEach(function (id) { $(id).addEventListener('input', maj); });
  $('kit-form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('k-imprimer').addEventListener('click', function () { window.print(); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copier');
    if (!b) return;
    var texte = $(b.dataset.cible).textContent;
    var dit = function (m, err) {
      var etat = $('k-etat');
      etat.className = 'etat' + (err ? ' err' : ' ok');
      etat.textContent = m;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte)
        .then(function () { dit('Texte copié.'); })
        .catch(function () { dit('Copie impossible : sélectionnez le texte à la main.', true); });
    } else {
      dit('Copie impossible : sélectionnez le texte à la main.', true);
    }
  });

  maj();
})();
