/* SOMMAIRE D'UNE PAGE LONGUE (guide de l'animateur·ice).
   CONSTRUIT A PARTIR DES TITRES DE LA PAGE, jamais ecrit a la main : un sommaire
   recopie finit toujours par mentir (un titre ajoute, un titre renomme, et plus
   personne ne pense a le mettre a jour). Ici il ne peut pas diverger.

   Quinze titres, et aucun point d'entree autre que le defilement : pendant un
   atelier on cherche « ou en est-on du minutage ? » en une seconde. D'ou aussi
   le suivi de la section courante, qui evite de se demander ou l'on est.

   Sans JavaScript, la page reste exactement ce qu'elle etait : le sommaire est
   masque tant qu'il n'a pas ete construit. */
(function () {
  "use strict";
  var nav = document.getElementById("sommaire");
  var corps = document.getElementById("guide-corps");
  if (!nav || !corps) return;

  var titres = corps.querySelectorAll("h2");
  if (titres.length < 3) return;   // pas assez long pour meriter un sommaire

  function slug(t) {
    return (t || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "section";
  }
  var pris = {};
  var liste = document.createElement("ol");
  Array.prototype.forEach.call(titres, function (h) {
    if (!h.id) {
      var base = slug(h.textContent), id = base, i = 2;
      while (pris[id] || document.getElementById(id)) { id = base + "-" + (i++); }
      h.id = id;
    }
    pris[h.id] = 1;
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.href = "#" + h.id;
    // On coupe au separateur de minutage : « Lot 3 · Risques actuels · 30 min »
    // tient sur une ligne dans une colonne etroite, la duree en petit a cote.
    var txt = (h.textContent || "").trim();
    var m = txt.match(/^(.*?)\s*·\s*(\d+\s*min)$/);
    a.textContent = m ? m[1] : txt;
    if (m) { var d = document.createElement("span"); d.className = "som-min"; d.textContent = m[2]; a.appendChild(d); }
    li.appendChild(a); liste.appendChild(li);
  });
  nav.appendChild(liste);
  nav.hidden = false;

  /* Repli sur petit ecran : le sommaire est un bloc depliable. Sur grand ecran
     il est toujours ouvert, en colonne collante. On pilote l'etat en JS parce
     qu'un <details> ferme ne peut pas etre rouvert de force par du CSS. */
  var titre = nav.querySelector("h2");
  if (titre) {
    titre.setAttribute("role", "button");
    titre.setAttribute("tabindex", "0");
    titre.addEventListener("click", basculer);
    titre.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(); }
    });
  }
  function basculer() { poser(nav.classList.contains("ferme")); }
  function poser(ouvert) {
    nav.classList.toggle("ferme", !ouvert);
    if (titre) titre.setAttribute("aria-expanded", ouvert ? "true" : "false");
  }
  var large = window.matchMedia("(min-width: 62rem)");
  function suivreLargeur() { poser(large.matches); }
  suivreLargeur();
  if (large.addEventListener) large.addEventListener("change", suivreLargeur);
  else if (large.addListener) large.addListener(suivreLargeur);

  // Section courante. `rootMargin` haut : on considere qu'on est « dans » une
  // section des que son titre passe sous l'en-tete collante.
  if (!window.IntersectionObserver) return;
  var liens = {};
  Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) { liens[a.getAttribute("href").slice(1)] = a; });
  var vues = {};
  var obs = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (e) { vues[e.target.id] = e.isIntersecting ? e.boundingClientRect.top : null; });
    var courant = null;
    Array.prototype.forEach.call(titres, function (h) { if (vues[h.id] != null) { if (!courant) courant = h.id; } });
    if (!courant) return;
    for (var id in liens) liens[id].classList.toggle("ici", id === courant);
  }, { rootMargin: "-78px 0px -70% 0px" });
  Array.prototype.forEach.call(titres, function (h) { obs.observe(h); });
})();
