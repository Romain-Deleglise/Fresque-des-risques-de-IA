/* Les deux bouts du cycle, sur la même page :
   - « ?c= » : confirmation de l'inscription, le lien du premier e-mail. Sans
     lui, l'abonnement reste inactif et aucune annonce ne part.
   - « ?d= » : désabonnement en un clic, depuis le lien en bas de chaque
     annonce. Pas de bouton « confirmez-vous » : qui arrive ici a déjà décidé. */
(function () {
  "use strict";
  var etat = document.getElementById("alertes-etat");
  if (!etat) return;
  var suite = document.getElementById("alertes-suite");
  var p = new URLSearchParams(location.search);
  var confirmation = p.get("c") || "";
  var jeton = confirmation || p.get("d") || "";

  if (!jeton) {
    etat.className = "msg err";
    etat.textContent = "Lien incomplet. Utilisez celui qui figure dans l’e-mail.";
    return;
  }

  var titre = document.querySelector(".page-tete h1");
  if (confirmation && titre) titre.textContent = "Votre inscription";

  fetch("/.netlify/functions/alertes?" + (confirmation ? "c=" : "d=") + encodeURIComponent(jeton))
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
      if (!r.ok || !r.d.ok) throw new Error((r.d && r.d.erreur)
        || (confirmation ? "Confirmation impossible." : "Désabonnement impossible."));
      etat.className = "msg ok";
      etat.textContent = confirmation
        ? "C’est confirmé : vous serez prévenu·e dès qu’un atelier vous concerne. Au plus un e-mail par semaine."
        : "C’est fait : vous ne recevrez plus ces annonces, et votre adresse a été effacée.";
      if (suite) {
        if (confirmation) {
          suite.innerHTML = 'Vous pouvez modifier vos préférences ou vous désabonner à tout moment, '
            + 'depuis les liens en bas de chaque e-mail.';
        }
        suite.hidden = false;
      }
    })
    .catch(function (e) {
      etat.className = "msg err";
      etat.textContent = e.message + " Écrivez à contact@pauseia.fr, nous le ferons à la main.";
    });
})();
