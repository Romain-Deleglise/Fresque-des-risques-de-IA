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

  /* --- Mode sombre : bascule + memorisation (localStorage) ---------------
     Par defaut on suit la preference systeme (gere par la CSS). Un choix
     explicite est stocke et applique via data-theme sur <html>. */
  var root = document.documentElement;
  function lireChoix() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
  function ecrireChoix(v) { try { localStorage.setItem("theme", v); } catch (e) {} }
  function systemeSombre() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function estSombre() {
    var c = root.getAttribute("data-theme");
    if (c === "dark") return true;
    if (c === "light") return false;
    return systemeSombre();
  }
  var choix = lireChoix();
  if (choix === "dark" || choix === "light") root.setAttribute("data-theme", choix);

  var themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "theme-toggle";
  themeBtn.innerHTML =
    '<svg class="ic-soleil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
    '<svg class="ic-lune" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function majBouton() {
    var sombre = estSombre();
    themeBtn.setAttribute("data-sombre", sombre ? "1" : "0");
    var l = sombre ? (en ? "Switch to light mode" : "Passer en mode clair")
                   : (en ? "Switch to dark mode" : "Passer en mode sombre");
    themeBtn.setAttribute("aria-label", l);
    themeBtn.setAttribute("title", l);
  }
  majBouton();
  themeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var sombre = !estSombre();
    root.setAttribute("data-theme", sombre ? "dark" : "light");
    ecrireChoix(sombre ? "dark" : "light");
    majBouton();
  });
  // Si aucun choix explicite, suivre les changements de preference systeme.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(function () {
      if (!root.getAttribute("data-theme")) majBouton();
    });
  }
  // Placer la bascule juste avant le selecteur de langue (ou en fin de nav).
  var lang = nav.querySelector(".lang");
  if (lang) nav.insertBefore(themeBtn, lang); else nav.appendChild(themeBtn);
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
