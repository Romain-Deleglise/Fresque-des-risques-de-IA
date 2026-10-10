/* GARDER LES ONGLETS DE L'ESPACE SUR LE GUIDE.
   Le guide est une page PUBLIQUE, avec la navigation du site. Un animateur qui
   y arrive depuis son espace se retrouvait donc rendu au site public, sans
   moyen de revenir a ses outils autrement qu'avec le bouton « precedent ».
   L'espace lie donc le guide avec ?espace=1, et ce script remet les onglets de
   l'espace a la place de la navigation publique. Le parametre voyage avec les
   liens internes, pour qu'on ne retombe pas dans le site public au clic
   suivant.
   Pourquoi un parametre d'adresse et pas un drapeau en memoire : un drapeau
   colle a l'onglet du navigateur et finirait par afficher les onglets reserves
   a un visiteur ordinaire qui revient sur le guide plus tard. Ici, rien n'est
   retenu : on sort de l'espace en suivant n'importe quel lien sans le
   parametre. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  if (params.get("espace") !== "1") return;

  var nav = document.querySelector(".entete .nav");
  if (!nav) return;
  var racine = document.body.dataset.racine || "../";
  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;

  /* LES MEMES QUATRE ONGLETS QUE LES AUTRES PAGES DE L'ESPACE. Ce script
     reconstruisait l'ancienne barre : cinq entrees, dont « Outils » vers une
     page supprimee et un bouton « Fresque de reference » vers une ancre qui
     n'existe plus. Le guide affichait donc, a lui seul, une navigation d'une
     autre epoque, avec deux liens qui ne menaient nulle part. */
  var onglets = en ? [
    ["Fresk", racine + "facilitators/"],
    ["Guide", racine + "en/guide/?espace=1"],
    ["Cheat sheet", racine + "facilitators/antiseche/"],
    ["Feedback", racine + "facilitators/retours/"]
  ] : [
    ["Fresque", racine + "animateurs/"],
    ["Guide", racine + "guide/?espace=1"],
    ["Antisèche", racine + "animateurs/antiseche/"],
    ["Retours", racine + "animateurs/retours/"]
  ];

  /* LA MARQUE DE L'ESPACE AUSSI. Les quatre autres pages la portent dans leur
     balisage ; le guide, lui, est une page publique qu'on rhabille ici. Sans
     elle, on passait de l'espace au guide et le bandeau redevenait celui du
     site public : rien ne disait plus ou l'on etait. */
  var entete = nav.parentElement;
  if (entete && !entete.querySelector(".marque-espace")) {
    var marque = document.createElement("span");
    marque.className = "marque-espace";
    marque.textContent = en ? "Facilitators' space" : "Espace animateur·ices";
    entete.insertBefore(marque, nav);
  }

  nav.setAttribute("aria-label", en ? "Facilitators' space" : "Espace animateur·ices");
  /* ON NE VIDE PAS LA BARRE : ON EN REMPLACE LES LIENS. `nav.textContent = ""`
     emportait aussi la bascule clair/sombre, que nav.js venait d'y poser (les
     deux scripts sont `defer`, donc nav.js passe en premier). Sur le guide, et
     la seule, le bouton de theme disparaissait. On ne retire donc que les
     liens, et les boutons poses par nav.js restent a leur place. */
  [].slice.call(nav.querySelectorAll("a")).forEach(function (a) { nav.removeChild(a); });
  var premier = nav.firstChild;
  onglets.forEach(function (o) {
    var a = document.createElement("a");
    a.href = o[1];
    a.textContent = o[0];
    // L'onglet courant est le guide : on le marque, comme sur les autres pages.
    if (o[0] === "Guide") a.setAttribute("aria-current", "page");
    nav.insertBefore(a, premier);
  });
})();
