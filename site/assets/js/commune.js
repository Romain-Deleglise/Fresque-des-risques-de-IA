/* Sélecteur de commune : on tape, on choisit dans la liste, on ne peut rien
   saisir d'autre.

   Pourquoi pas un <select> : il y a 34 875 communes. Pourquoi pas du texte
   libre : « Lyon », « lyon » et « Lyon 7e » ne se rencontrent jamais, et
   personne ne comprend pourquoi il ne reçoit rien.

   La liste (environ 850 Ko) n'est chargée qu'au premier clic dans le champ :
   quelqu'un qui ne s'abonne pas ne la télécharge jamais.

   RAPPEL CSP : style-src 'self' sans 'unsafe-inline'. Aucun attribut style= ;
   tout passe par des classes ou par element.style. */
(function () {
  "use strict";

  var LISTE = null, enCours = null;
  var MAX_AFFICHE = 8;

  function sansAccents(v) {
    return String(v || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function charger(base) {
    if (LISTE) return Promise.resolve(LISTE);
    if (enCours) return enCours;
    enCours = fetch(base + "data/communes.txt").then(function (r) {
      if (!r.ok) throw new Error("liste indisponible");
      return r.text();
    }).then(function (t) {
      // Le fichier est déjà trié par population : les grandes villes sortent
      // en premier sans qu'on ait à classer quoi que ce soit.
      LISTE = t.split("\n").filter(Boolean).map(function (l) {
        var p = l.split(";");
        return { code: p[0], nom: p[1], cp: p[2] || "", rayon: Number(p[3]) || 50, cle: sansAccents(p[1]) };
      });
      return LISTE;
    });
    return enCours;
  }

  function chercher(q) {
    var k = sansAccents(q);
    if (k.length < 2 && !/^\d{2,}$/.test(q)) return [];
    var debuts = [], dedans = [];
    for (var i = 0; i < LISTE.length; i++) {
      var c = LISTE[i];
      if (c.cle.indexOf(k) === 0 || c.cp.indexOf(q.trim()) === 0) {
        debuts.push(c);
        if (debuts.length >= MAX_AFFICHE) break;
      } else if (dedans.length < MAX_AFFICHE && c.cle.indexOf(k) > 0) {
        dedans.push(c);
      }
    }
    return debuts.concat(dedans).slice(0, MAX_AFFICHE);
  }

  function etiquette(c) {
    var dep = c.code.slice(0, 2) === "97" ? c.code.slice(0, 3) : c.code.slice(0, 2);
    return c.nom + " (" + dep + (c.cp ? " · " + c.cp : "") + ")";
  }

  /* Attache le comportement à un <input>. `onChoix(commune|null)` est appelé à
     chaque sélection, et avec null dès que le texte ne correspond plus à rien :
     c'est ce qui garantit qu'on ne part jamais avec une saisie approximative. */
  function attacher(input, base, onChoix) {
    var boite = document.createElement("ul");
    boite.className = "commune-liste";
    boite.setAttribute("role", "listbox");
    boite.hidden = true;
    input.parentNode.insertBefore(boite, input.nextSibling);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    input.autocomplete = "off";

    var resultats = [], actif = -1, choisie = null, fermetureDifferee = null;

    /* La fermeture au blur est différée (sinon le clic sur une proposition
       n'aurait jamais lieu). Toute frappe ou tout retour dans le champ doit
       l'annuler, sans quoi une liste fraîchement affichée se referme toute
       seule. */
    function annulerFermeture() {
      if (fermetureDifferee) { clearTimeout(fermetureDifferee); fermetureDifferee = null; }
    }

    function fermer() {
      annulerFermeture();
      boite.hidden = true;
      boite.textContent = "";
      input.setAttribute("aria-expanded", "false");
      actif = -1;
    }

    function poser(c) {
      choisie = c;
      input.value = c ? etiquette(c) : input.value;
      fermer();
      onChoix(c);
    }

    function rendre() {
      boite.textContent = "";
      resultats.forEach(function (c, i) {
        var li = document.createElement("li");
        li.className = "commune-item" + (i === actif ? " actif" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === actif ? "true" : "false");
        li.textContent = etiquette(c);
        li.addEventListener("mousedown", function (e) { e.preventDefault(); poser(c); });
        boite.appendChild(li);
      });
      boite.hidden = !resultats.length;
      input.setAttribute("aria-expanded", resultats.length ? "true" : "false");
    }

    function relancer() {
      // Toute frappe annule la sélection précédente : on ne garde jamais un
      // code qui ne correspond plus à ce qui est affiché.
      if (choisie) { choisie = null; onChoix(null); }
      charger(base).then(function () {
        resultats = chercher(input.value);
        actif = -1;
        rendre();
      }).catch(function () { fermer(); });
    }

    input.addEventListener("focus", function () { annulerFermeture(); charger(base); });
    input.addEventListener("input", function () { annulerFermeture(); relancer(); });
    input.addEventListener("blur", function () {
      annulerFermeture();
      fermetureDifferee = setTimeout(fermer, 150);
    });
    input.addEventListener("keydown", function (e) {
      if (boite.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        actif = (actif + (e.key === "ArrowDown" ? 1 : -1) + resultats.length) % resultats.length;
        rendre();
      } else if (e.key === "Enter") {
        // Entrée choisit la commune surlignée, ou la seule proposition : elle
        // ne doit jamais envoyer le formulaire avec une saisie non validée.
        e.preventDefault();
        if (actif >= 0) poser(resultats[actif]);
        else if (resultats.length === 1) poser(resultats[0]);
      } else if (e.key === "Escape") {
        fermer();
      }
    });

    return { valeur: function () { return choisie; }, vider: function () { input.value = ""; choisie = null; fermer(); } };
  }

  window.Commune = { attacher: attacher, etiquette: etiquette, charger: charger };
})();
