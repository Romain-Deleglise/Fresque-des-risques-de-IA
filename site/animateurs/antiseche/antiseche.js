/* Un seul bouton : declencher l'impression. La CSP interdit l'inline, donc
   meme ce onclick vit dans un fichier. */
(function () {
  'use strict';
  var b = document.getElementById('imprimer');
  if (b) b.addEventListener('click', function () { window.print(); });
})();
