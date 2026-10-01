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

  var onglets = en ? [
    ["Home", racine + "facilitators/"],
    ["Guide", racine + "en/guide/?espace=1"],
    ["Tools", racine + "facilitators/outils/"],
    ["Feedback", racine + "facilitators/retours/"]
  ] : [
    ["Accueil", racine + "animateurs/"],
    ["Guide", racine + "guide/?espace=1"],
    ["Outils", racine + "animateurs/outils/"],
    ["Retours", racine + "animateurs/retours/"]
  ];
  var bouton = en
    ? ["Reference fresk", racine + "facilitators/retours/#fresque"]
    : ["Fresque de référence", racine + "animateurs/retours/#fresque"];

  nav.setAttribute("aria-label", en ? "Facilitators' space" : "Espace animateur·ices");
  nav.textContent = "";
  onglets.forEach(function (o) {
    var a = document.createElement("a");
    a.href = o[1];
    a.textContent = o[0];
    // L'onglet courant est le guide : on le marque, comme sur les autres pages.
    if (o[0] === "Guide") a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  });
  var b = document.createElement("a");
  b.href = bouton[1];
  b.className = "btn-nav";
  b.textContent = bouton[0];
  nav.appendChild(b);
})();
