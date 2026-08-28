/* Mesure d'audience sans cookie (première partie, même origine).
   Envoie une vue de page anonyme à /.netlify/functions/collect.
   - Aucun cookie, aucun localStorage : un simple drapeau de session (par onglet)
     sert à distinguer une visite d'une navigation interne.
   - Respecte « Do Not Track » et « Global Privacy Control » : si l'un est actif,
     rien n'est envoyé.
   - Ne bloque jamais la page ; échoue en silence. */
(function () {
  "use strict";
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  // Signaux de refus de suivi.
  var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (dnt === "1" || dnt === "yes" || navigator.globalPrivacyControl === true) return;

  // Vue unique par onglet (sessionStorage, effacé à la fermeture ; pas un cookie).
  var unique = 0;
  try {
    if (!sessionStorage.getItem("m")) { sessionStorage.setItem("m", "1"); unique = 1; }
  } catch (e) { /* mode privé : on compte comme vue simple */ }

  // Référent réduit à son hôte, et seulement s'il est externe.
  var ref = "";
  try {
    if (document.referrer) {
      var h = new URL(document.referrer).hostname;
      if (h && h !== location.hostname) ref = h;
    }
  } catch (e) {}

  var charge = {
    p: location.pathname,
    r: ref,
    u: unique,
    l: (document.documentElement.lang || "fr").indexOf("en") === 0 ? "en" : "fr"
  };

  var url = "/.netlify/functions/collect";
  try {
    var corps = JSON.stringify(charge);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([corps], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corps, keepalive: true }).catch(function () {});
    }
  } catch (e) {}
})();
