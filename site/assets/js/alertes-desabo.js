/* Désabonnement en un clic, depuis le lien en bas de chaque annonce.
   Un clic : la page appelle la fonction toute seule, sans bouton de
   confirmation. Quelqu'un qui arrive ici a déjà décidé. */
(function () {
  "use strict";
  var etat = document.getElementById("alertes-etat");
  if (!etat) return;
  var suite = document.getElementById("alertes-suite");
  var jeton = new URLSearchParams(location.search).get("d") || "";

  if (!jeton) {
    etat.className = "msg err";
    etat.textContent = "Lien incomplet. Utilisez celui qui figure en bas de l’e-mail.";
    return;
  }

  fetch("/.netlify/functions/alertes?d=" + encodeURIComponent(jeton))
    // Une réponse illisible (service indisponible, page d'erreur HTML) ne doit
    // pas afficher « Unexpected end of JSON input » à quelqu'un qui veut juste
    // ne plus recevoir d'e-mails.
    .then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) { /* laissé à null */ }
        if (!d) throw new Error("Le service ne répond pas pour le moment.");
        return { ok: r.ok, d: d };
      });
    })
    .then(function (r) {
      if (!r.ok || !r.d.ok) throw new Error((r.d && r.d.erreur) || "Désabonnement impossible.");
      etat.className = "msg ok";
      etat.textContent = "C’est fait : vous ne recevrez plus ces annonces, et votre adresse a été effacée.";
      if (suite) suite.hidden = false;
    })
    .catch(function (e) {
      etat.className = "msg err";
      etat.textContent = e.message + " Écrivez à contact@pauseia.fr, nous le ferons à la main.";
    });
})();
