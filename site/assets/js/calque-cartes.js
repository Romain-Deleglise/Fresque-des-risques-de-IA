/* LE CALQUE DES CORRECTIONS PUBLIEES, côté navigateur.

   Les textes des cartes vivent dans data/cartes.json, servi par le CDN. Les
   corrections publiées depuis l'espace animateur·ices vivent, elles, dans un
   calque rendu par /.netlify/functions/cartes-publiees. Ce fichier applique le
   second par-dessus le premier, pour que toutes les pages lisent le même texte
   sans que chacune réécrive la même fusion.

   DEUX REQUÊTES PLUTÔT QU'UNE. Intercaler la fonction devant data/cartes.json
   serait plus simple à écrire et bien plus fragile : une fonction en panne
   emporterait alors les cartes avec elle, au milieu d'un atelier. Ici le
   fichier statique arrive toujours, et le calque n'ajoute que des corrections.
   S'il tombe, on affiche le texte publié : une correction en retard, jamais une
   page vide. Aucune des fonctions de ce module ne rejette.

   Le calque se vide tout seul quand le dépôt rattrape les corrections : voir
   `residu` dans serveur/src/brouillons.js. */
(function () {
  'use strict';

  var API = '/.netlify/functions/cartes-publiees';
  // Les mêmes champs que les brouillons : le reste de la carte (numéro, lot,
  // image, cadrage) ne se corrige pas en lisant un retour.
  var CHAMPS = ['titre', 'verso', 'explication'];
  var promesse = null;

  // Une seule requête par page, même si deux scripts demandent le calque.
  function charger() {
    if (!promesse) {
      promesse = fetch(API)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return promesse;
  }

  function fusionner(fichier, liste) {
    var parN = {};
    liste.forEach(function (b) { if (b && b.n != null) parN[b.n] = b; });
    fichier.cartes = fichier.cartes.map(function (c) {
      var b = parN[c.n];
      if (!b) return c;
      var out = Object.assign({}, c);
      CHAMPS.forEach(function (champ) {
        if (b[champ] === undefined) return;
        // Une explication vidée disparaît de la carte, elle ne devient pas [].
        if (champ === 'explication' && (!b[champ] || !b[champ].length)) delete out[champ];
        else out[champ] = b[champ];
      });
      return out;
    });
    return fichier;
  }

  /* Rend une promesse du fichier corrigé. Jamais de rejet : sans calque, c'est
     le fichier tel quel. */
  function appliquer(fichier) {
    if (!fichier || !Array.isArray(fichier.cartes)) return Promise.resolve(fichier);
    return charger().then(function (d) {
      var liste = (d && d.ok && Array.isArray(d.cartes)) ? d.cartes : [];
      return liste.length ? fusionner(fichier, liste) : fichier;
    }).catch(function () { return fichier; });
  }

  /* OUBLIER CE QU'ON A LU. L'espace animateur·ices publie une correction puis
     redessine : sans cela il relirait la réponse mise en cache ici et
     afficherait l'ancien texte, en laissant croire que publier n'a rien fait. */
  function oublier() { promesse = null; }

  /* LE PLAN DE LA FRESQUE DE REFERENCE, servi par le meme appel. Il arrive par
     la meme route et suit la meme regle : sans lui, c'est le plan publie qui
     s'affiche. */
  function appliquerFresque(fichier) {
    if (!fichier || !fichier.tableau) return Promise.resolve(fichier);
    return charger().then(function (d) {
      if (d && d.ok && d.fresque && d.fresque.cartes) fichier.tableau = d.fresque;
      return fichier;
    }).catch(function () { return fichier; });
  }

  window.CalqueCartes = { appliquer: appliquer, appliquerFresque: appliquerFresque, oublier: oublier };
})();
