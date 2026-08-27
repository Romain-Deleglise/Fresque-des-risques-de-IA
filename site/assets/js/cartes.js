/* Accueil : remplit le verso des cartes du héros et une courte galerie,
   à partir de data/cartes.json. Amélioration progressive : sans JS, le héros
   montre déjà le recto et les téléchargements fonctionnent. */
(function () {
  "use strict";

  var pile = document.getElementById("pile");
  var galerie = document.getElementById("galerie");
  var GALERIE = [6, 13, 17, 22, 31, 35]; // six images nettes et variees

  fetch("data/cartes.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var parN = {};
      data.cartes.forEach(function (c) { parN[c.n] = c; });

      // Héros : remplir les versos (éléments déjà dimensionnés → aucun saut)
      if (pile) {
        pile.querySelectorAll(".carte").forEach(function (btn) {
          var c = parN[+btn.dataset.n];
          if (!c) return;
          var p = btn.querySelector(".back p");
          if (p) p.textContent = versoTexte(c);
          btn.addEventListener("click", function () {
            var ouvert = btn.getAttribute("aria-pressed") === "true";
            pile.querySelectorAll('.carte[aria-pressed="true"]').forEach(function (a) {
              if (a !== btn) a.setAttribute("aria-pressed", "false");
            });
            btn.setAttribute("aria-pressed", ouvert ? "false" : "true");
          });
        });
      }

      // Galerie
      if (galerie) {
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
      }
    })
    .catch(function () { /* le recto statique suffit */ });

  function versoTexte(c) {
    var v = (c.verso || []).join(" ");
    return /\[A COMPLETER\]/i.test(v) ? "Texte à venir." : v;
  }
  function echap(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();
