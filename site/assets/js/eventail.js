/* Eventail de cartes d'exemple sur l'accueil (A4.3 / B3.2).
   Progressive enhancement : sans JS, les liens de telechargement fonctionnent
   deja (A4.2). Ce script ne fait qu'enrichir l'affichage des 3 cartes. */
(function () {
  "use strict";

  var CARTES_EXEMPLE = [1, 4, 12]; // A4.3
  var conteneur = document.getElementById("eventail");
  if (!conteneur) return;

  fetch("data/cartes.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var parN = {};
      data.cartes.forEach(function (c) { parN[c.n] = c; });

      CARTES_EXEMPLE.forEach(function (n) {
        var c = parN[n];
        if (!c) return;
        conteneur.appendChild(construireCarte(c));
      });
    })
    .catch(function () {
      conteneur.innerHTML =
        '<p class="eventail-legende">Apercu des cartes indisponible. ' +
        'Telechargez le PDF ci-dessus pour les voir toutes.</p>';
    });

  function construireCarte(c) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "carte-ex";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Carte " + c.n + " : " + c.titre + ". Activer pour lire le verso.");

    var faces = document.createElement("span");
    faces.className = "faces";

    // Recto
    var recto = document.createElement("span");
    recto.className = "face recto";
    if (c.image && c.image.vignette) {
      var img = document.createElement("img");
      img.src = c.image.vignette;
      img.alt = "Illustration de la carte " + c.titre;
      img.loading = "lazy";
      recto.appendChild(img);
    }
    var bandeau = document.createElement("span");
    bandeau.className = "bandeau";
    bandeau.innerHTML = '<span class="num">' + c.n + "</span><span>" + echapper(c.titre) + "</span>";
    recto.appendChild(bandeau);

    // Verso — texte reellement present dans le DOM (accessibilite, B3.2)
    var verso = document.createElement("span");
    verso.className = "face verso";
    var h = document.createElement("h3");
    h.textContent = c.titre;
    verso.appendChild(h);
    (c.verso || []).forEach(function (p) {
      var el = document.createElement("p");
      el.textContent = p;
      verso.appendChild(el);
    });

    faces.appendChild(recto);
    faces.appendChild(verso);
    btn.appendChild(faces);

    btn.addEventListener("click", function () {
      var ouvert = btn.getAttribute("aria-pressed") === "true";
      // Une seule carte retournee a la fois (A4.3)
      conteneur.querySelectorAll(".carte-ex[aria-pressed='true']").forEach(function (autre) {
        if (autre !== btn) autre.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", ouvert ? "false" : "true");
    });

    return btn;
  }

  function echapper(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();
