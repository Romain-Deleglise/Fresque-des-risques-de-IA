/* Accueil : interactivité des cartes du héros + courte galerie.
   Le texte des versos du héros est écrit en dur dans le HTML : le retournement
   ne dépend donc d'aucun réseau (correctif : versos parfois vides). Le fetch de
   data/cartes.json ne sert plus qu'à construire la galerie. */
(function () {
  "use strict";

  // Héros : brancher le retournement tout de suite, sans attendre le réseau.
  var pile = document.getElementById("pile");
  if (pile) {
    pile.querySelectorAll(".carte").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ouvert = btn.getAttribute("aria-pressed") === "true";
        pile.querySelectorAll('.carte[aria-pressed="true"]').forEach(function (a) {
          if (a !== btn) a.setAttribute("aria-pressed", "false");
        });
        btn.setAttribute("aria-pressed", ouvert ? "false" : "true");
      });
    });
  }

  // Galerie : chargée depuis data/cartes.json (amélioration progressive).
  var galerie = document.getElementById("galerie");
  if (!galerie) return;
  var GALERIE = [6, 13, 17, 22, 31, 35]; // six images nettes et variees

  fetch(window.CARTES_JSON || "data/cartes.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var parN = {};
      data.cartes.forEach(function (c) { parN[c.n] = c; });
      GALERIE.forEach(function (n) {
        var c = parN[n]; if (!c) return;
        var fig = document.createElement("figure");
        fig.className = "gc"; fig.style.margin = "0";
        if (c.image) {
          var img = document.createElement("img");
          img.src = c.image.vignette; img.alt = "Illustration : " + c.titre; img.loading = "lazy";
          fig.appendChild(img);
        }
        fig.insertAdjacentHTML("beforeend", '<span class="no">' + c.n + '</span>');
        fig.insertAdjacentHTML("beforeend", '<figcaption class="lbl">' + echap(c.titre) + '</figcaption>');
        galerie.appendChild(fig);
      });
    })
    .catch(function () { /* la galerie est un bonus : on l'ignore si indisponible */ });

  function echap(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();
