/* MINUTEUR DE DEROULE.

   Les huit temps du guide, avec leur duree. Ce qu'un animateur doit lire a deux
   metres, debout : le temps en cours et ce qu'il en reste. Le reste est
   secondaire.

   L'ETAT SURVIT AU RECHARGEMENT. Un telephone qui se met en veille, un onglet
   ferme par megarde au milieu du lot 3 : sans memoire, on perd le fil au pire
   moment. On enregistre donc l'avancement dans localStorage, et on recalcule
   le temps ecoule d'apres l'horloge plutot que de compter les battements : un
   onglet en arriere-plan est ralenti par le navigateur, et un compteur naif
   prend du retard sans que personne ne s'en apercoive.
*/
(function () {
  'use strict';

  var ETAPES = [
    { nom: 'Accueil et mise en route', min: 15, lot: null,
      quoi: 'Prénoms, cadre, consignes. Poser la carte d’introduction.' },
    { nom: 'Lot 1 · L’IA', min: 15, lot: 1,
      quoi: 'Cartes 1 à 6. Ce qu’est un modèle, comment il est entraîné.' },
    { nom: 'Lot 2 · Capacités', min: 15, lot: 2,
      quoi: 'Cartes 7 à 13. Ce que l’IA sait faire aujourd’hui.' },
    { nom: 'Lot 3 · Risques actuels', min: 30, lot: 3,
      quoi: 'Cartes 14 à 27 et 30. Le cœur de l’atelier : distribuer en deux vagues.' },
    { nom: 'Lot 4 · Risques existentiels', min: 20, lot: 4,
      quoi: 'Cartes 28, 29, 31, 32, 33. Comprendre les mécanismes, sans trancher le débat.' },
    { nom: 'Lot 5 · Solutions', min: 20, lot: 5,
      quoi: 'Cartes 34 à 38. Relier chaque réponse au risque qu’elle traite.' },
    { nom: 'Transition', min: 10, lot: null,
      quoi: 'Réorganiser, titrer, dessiner. Repérer deux ou trois liens clés.' },
    { nom: 'Discussion', min: 15, lot: null,
      quoi: 'Débat, puis résumé et un premier pas concret pour chacun·e.' }
  ];
  var LOT_COULEUR = { 1: '#E8811C', 2: '#2f7d4f', 3: '#3b6ea5', 4: '#8a4fb3', 5: '#c1444e' };
  var CLE = 'fresque-minuteur';

  var $ = function (id) { return document.getElementById(id); };

  // etape : index courant. ecoule : secondes deja consommees sur cette etape,
  // hors periode en cours. depuis : horodatage du dernier demarrage, ou null.
  var etat = { etape: 0, ecoule: 0, depuis: null };

  function lire() {
    try {
      var v = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (v && typeof v.etape === 'number' && ETAPES[v.etape]) etat = v;
    } catch (e) { /* stockage indisponible : on démarre à zéro, sans bruit */ }
  }
  function ecrire() {
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* idem */ }
  }

  function secondesEcoulees() {
    return etat.ecoule + (etat.depuis ? (Date.now() - etat.depuis) / 1000 : 0);
  }
  function duree() { return ETAPES[etat.etape].min * 60; }

  function mmss(s) {
    var neg = s < 0;
    s = Math.abs(Math.round(s));
    var m = Math.floor(s / 60);
    return (neg ? '−' : '') + m + ':' + String(s % 60).padStart(2, '0');
  }

  function totalRestant() {
    var s = Math.max(0, duree() - secondesEcoulees());
    for (var i = etat.etape + 1; i < ETAPES.length; i++) s += ETAPES[i].min * 60;
    return s;
  }

  function afficher() {
    var e = ETAPES[etat.etape];
    var reste = duree() - secondesEcoulees();

    $('mi-nom').textContent = e.nom;
    $('mi-quoi').textContent = e.quoi;
    $('mi-reste').textContent = mmss(reste);
    document.body.classList.toggle('mi-depasse', reste < 0);
    document.body.classList.toggle('mi-bientot', reste >= 0 && reste <= 120);
    document.documentElement.style.setProperty('--lot-courant', e.lot ? LOT_COULEUR[e.lot] : 'var(--gris)');

    var part = Math.max(0, Math.min(1, secondesEcoulees() / duree()));
    $('mi-jauge-barre').style.width = (part * 100) + '%';

    $('mi-demarrer').textContent = etat.depuis ? 'Pause' : (secondesEcoulees() > 0 ? 'Reprendre' : 'Démarrer');
    $('mi-total').textContent = 'Il reste ' + Math.round(totalRestant() / 60) + ' min d’atelier.';

    Array.prototype.forEach.call(document.querySelectorAll('.mi-etape'), function (li, i) {
      li.classList.toggle('courante', i === etat.etape);
      li.classList.toggle('faite', i < etat.etape);
    });
  }

  function construireListe() {
    var ol = $('mi-liste');
    ol.textContent = '';
    ETAPES.forEach(function (e, i) {
      var li = document.createElement('li');
      li.className = 'mi-etape';
      li.dataset.i = i;
      if (e.lot) li.style.setProperty('--lot', LOT_COULEUR[e.lot]);

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mi-aller';
      var nom = document.createElement('span');
      nom.className = 'mi-e-nom';
      nom.textContent = e.nom;
      var dur = document.createElement('span');
      dur.className = 'mi-e-duree';
      dur.textContent = e.min + ' min';
      b.appendChild(nom);
      b.appendChild(dur);
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function basculer() {
    if (etat.depuis) { etat.ecoule = secondesEcoulees(); etat.depuis = null; }
    else { etat.depuis = Date.now(); }
    ecrire(); afficher();
  }
  function aller(i) {
    if (i < 0 || i >= ETAPES.length) return;
    // On garde le minuteur en marche d'une étape à l'autre : en atelier on
    // enchaîne, on ne se remet pas en pause à chaque transition.
    var enMarche = !!etat.depuis;
    etat = { etape: i, ecoule: 0, depuis: enMarche ? Date.now() : null };
    ecrire(); afficher();
  }

  lire();
  construireListe();
  afficher();
  setInterval(afficher, 250);

  $('mi-demarrer').addEventListener('click', basculer);
  $('mi-suivant').addEventListener('click', function () { aller(etat.etape + 1); });
  $('mi-precedent').addEventListener('click', function () { aller(etat.etape - 1); });
  $('mi-plus').addEventListener('click', function () {
    // Rallonger, c'est reculer le compteur : on ne touche pas à la durée de
    // référence, qui reste celle du guide.
    etat.ecoule = Math.max(0, secondesEcoulees() - 300);
    if (etat.depuis) etat.depuis = Date.now();
    ecrire(); afficher();
  });
  $('mi-remise').addEventListener('click', function () {
    if (!confirm('Revenir au début de l’atelier ?')) return;
    etat = { etape: 0, ecoule: 0, depuis: null };
    ecrire(); afficher();
  });
  $('mi-liste').addEventListener('click', function (e) {
    var b = e.target.closest('.mi-aller');
    if (b) aller(+b.parentNode.dataset.i);
  });

  document.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); basculer(); }
    else if (e.key === 'ArrowRight') aller(etat.etape + 1);
    else if (e.key === 'ArrowLeft') aller(etat.etape - 1);
  });
})();
