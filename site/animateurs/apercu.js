/* APERCU DEPLIABLE DE LA FRESQUE DE REFERENCE, sur l'accueil de l'espace.

   Ce script ne fait que deplier et replier. LE PLEIN ECRAN N'EST PAS ICI :
   animateurs.js le gere deja, avec l'API native du navigateur, sur la section
   du plateau. Une premiere version le refaisait en CSS, avec un bloc pose
   par-dessus la page ; les deux mecanismes se marchaient dessus et le cadre
   restait a la largeur du plein ecran apres en etre sorti. L'API native fait
   mieux et gratuitement : elle couvre aussi la barre du navigateur, et c'est
   elle qui rend Echap, sans que personne ait a l'ecouter.

   Reste le recadrage apres depliage : le plateau se met a l'echelle a partir
   de la largeur de son cadre, et un bloc `hidden` n'a pas de largeur. Sans ce
   rappel, la fresque s'ouvrirait a une echelle calculee sur zero pixel. On
   passe par le bouton « Ajuster » : le module n'expose rien, et lui inventer
   une interface pour un seul appel couterait plus cher que ce clic. */
(function () {
  "use strict";
  var btn = document.getElementById("btn-apercu");
  var bloc = document.getElementById("apercu");
  if (!btn || !bloc) return;

  var fermer = document.getElementById("apercu-fermer");
  var chevron = btn.querySelector(".chevron");
  var LIBELLE = { ouvrir: "Afficher la fresque de référence", fermer: "Masquer la fresque de référence" };
  var ouvert = false;

  function poser(v) {
    ouvert = v;
    bloc.hidden = !v;
    btn.setAttribute("aria-expanded", String(v));
    btn.childNodes[0].nodeValue = (v ? LIBELLE.fermer : LIBELLE.ouvrir) + " ";
    if (chevron) chevron.textContent = v ? "▴" : "▾";
    if (!v) return;
    // Deux images d'attente : le navigateur pose la largeur du cadre, puis la
    // mise en page se stabilise. Ensuite seulement l'echelle a un sens.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (window.FresqueRef && window.FresqueRef.ajuster) window.FresqueRef.ajuster();
      });
    });
  }

  /* LE BOUTON NE FAIT PAS DEFILER LA PAGE. Il la faisait descendre jusqu'a la
     fresque : on perdait de vue le texte qu'on etait en train de lire, et le
     clic changeait de vue au lieu d'ajouter quelque chose sous les yeux. */
  btn.addEventListener("click", function () { poser(!ouvert); });

  /* « Fermer ✕ » quitte le plein ecran s'il est en cours, et replie sinon :
     c'est le meme geste, revenir a ce qu'on lisait. */
  if (fermer) fermer.addEventListener("click", function () {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    poser(false);
    btn.focus();
  });

  /* Echap replie. En plein ecran, le navigateur intercepte Echap avant nous
     pour en sortir : les deux gestes ne se chevauchent donc pas. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ouvert && !document.fullscreenElement) {
      poser(false);
      btn.focus();
    }
  });
})();
