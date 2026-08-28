/* Barre de navigation : bouton menu (hamburger) sur mobile.
   Amélioration progressive : sans JS, la navigation reste visible.
   Le repli mobile ne s'active que lorsque ce script a ajouté la classe js-nav. */
(function () {
  "use strict";
  var head = document.querySelector(".entete");
  if (!head) return;
  var wrap = head.querySelector(".wrap");
  var nav = head.querySelector(".nav");
  if (!wrap || !nav) return;

  head.classList.add("js-nav");
  if (!nav.id) nav.id = "nav-principal";

  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-label", en ? "Open the menu" : "Ouvrir le menu");
  btn.setAttribute("aria-controls", nav.id);
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = "<span></span><span></span><span></span>";
  wrap.insertBefore(btn, nav);

  function set(open) {
    head.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? (en ? "Close the menu" : "Fermer le menu") : (en ? "Open the menu" : "Ouvrir le menu"));
  }
  btn.addEventListener("click", function (e) { e.stopPropagation(); set(!head.classList.contains("open")); });
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("click", function (e) { if (head.classList.contains("open") && !head.contains(e.target)) set(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
})();
