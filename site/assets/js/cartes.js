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
      var enAnglais = (document.documentElement.lang || "fr").indexOf("en") === 0;
      GALERIE.forEach(function (n) {
        var c = parN[n]; if (!c) return;
        // Bouton : au clic, la carte se retourne pour montrer le verso (explication).
        var fig = document.createElement("button");
        fig.type = "button";
        fig.className = "gc"; fig.style.margin = "0";
        fig.setAttribute("aria-pressed", "false");
        fig.setAttribute("aria-label", (enAnglais ? "Card " : "Carte ") + c.n + " : " + c.titre + (enAnglais ? " — flip to read" : " — retourner pour lire"));
        if (c.image) {
          var img = document.createElement("img");
          // Vraie carte (format paysage) : elle porte deja son numero et son titre.
          img.src = c.image.carte || c.image.grand || c.image.vignette;
          img.alt = ""; img.loading = "lazy";
          fig.appendChild(img);
        }
        if (c.image && c.image.verso) {
          // Verso : la vraie carte de dos (page 2 du PDF), pas seulement le texte.
          var vimg = document.createElement("img");
          vimg.className = "gc-verso-img";
          vimg.src = c.image.verso.grand || c.image.verso.carte || c.image.verso.vignette;
          vimg.alt = ""; vimg.loading = "lazy";
          fig.appendChild(vimg);
        } else {
          var dos = document.createElement("span");
          dos.className = "gc-verso";
          dos.innerHTML = "<b>" + echap(c.titre) + "</b>" +
            (c.verso || []).map(function (p) { return "<span>" + echap(/\[A COMPLETER\]/i.test(p) ? "" : p) + "</span>"; }).join("");
          fig.appendChild(dos);
        }
        fig.addEventListener("click", function () {
          var ouvert = fig.getAttribute("aria-pressed") === "true";
          fig.setAttribute("aria-pressed", ouvert ? "false" : "true");
        });
        galerie.appendChild(fig);
      });
    })
    .catch(function () { /* la galerie est un bonus : on l'ignore si indisponible */ });

  function echap(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();
