/* Rendu des cartes sur l'accueil a partir de data/cartes.json.
   Amelioration progressive : sans JS, le contenu et les telechargements
   fonctionnent deja. Ce script enrichit l'apercu du jeu. */
(function () {
  "use strict";

  var eventail = document.getElementById("eventail");
  var galerie = document.getElementById("galerie");
  if (!eventail && !galerie) return;

  var CARTES_HERO = [1, 4, 12];
  var CARTES_GALERIE = [3, 8, 10, 13, 17, 22, 28, 31, 33, 35, 36, 38];

  fetch("data/cartes.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var parN = {};
      data.cartes.forEach(function (c) { parN[c.n] = c; });
      if (eventail) CARTES_HERO.forEach(function (n) { if (parN[n]) eventail.appendChild(carteFlip(parN[n])); });
      if (galerie) CARTES_GALERIE.forEach(function (n) { if (parN[n]) galerie.appendChild(mini(parN[n])); });
    })
    .catch(function () {
      if (eventail) eventail.innerHTML = '<p style="font-family:var(--f-ui);color:var(--encre-douce)">Aperçu indisponible. Téléchargez le PDF pour voir toutes les cartes.</p>';
    });

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function carteFlip(c) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "carte";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Carte " + c.n + " : " + c.titre + ". Activer pour lire le verso.");

    var faces = document.createElement("span");
    faces.className = "faces";

    var recto = document.createElement("span");
    recto.className = "face recto";
    if (c.image && c.image.vignette) {
      var img = document.createElement("img");
      img.className = "visuel"; img.src = c.image.vignette;
      img.alt = ""; img.loading = "lazy"; recto.appendChild(img);
    }
    recto.insertAdjacentHTML("beforeend", '<span class="num">' + c.n + '</span>');
    recto.insertAdjacentHTML("beforeend", '<span class="bandeau">' + esc(c.titre) + '</span>');

    var verso = document.createElement("span");
    verso.className = "face verso";
    verso.insertAdjacentHTML("beforeend", "<h3>" + esc(c.titre) + "</h3>");
    (c.verso || []).forEach(function (p) {
      verso.insertAdjacentHTML("beforeend", "<p>" + esc(/\[A COMPLETER\]/i.test(p) ? "Texte à venir." : p) + "</p>");
    });

    faces.appendChild(recto); faces.appendChild(verso); btn.appendChild(faces);

    btn.addEventListener("click", function () {
      var ouvert = btn.getAttribute("aria-pressed") === "true";
      eventail.querySelectorAll('.carte[aria-pressed="true"]').forEach(function (a) {
        if (a !== btn) a.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", ouvert ? "false" : "true");
    });
    return btn;
  }

  function mini(c) {
    var fig = document.createElement("figure");
    fig.className = "mini"; fig.style.margin = "0";
    if (c.image && c.image.vignette) {
      var img = document.createElement("img");
      img.src = c.image.vignette; img.alt = "Illustration : " + c.titre; img.loading = "lazy";
      fig.appendChild(img);
    }
    fig.insertAdjacentHTML("beforeend", '<span class="num">' + c.n + '</span>');
    fig.insertAdjacentHTML("beforeend", '<figcaption class="t">' + esc(c.titre) + '</figcaption>');
    return fig;
  }
})();
