/* Inscription newsletter -> fonction serverless Netlify -> CiviCRM.
   Meme origine (pas de requete tierce). Degradation propre si le service est indisponible. */
(function () {
  "use strict";
  var form = document.getElementById("newsletter-form");
  if (!form) return;
  var input = document.getElementById("newsletter-email");
  var btn = document.getElementById("newsletter-btn");
  var msg = document.getElementById("newsletter-msg");

  function afficher(texte, type) {
    msg.textContent = texte;
    msg.className = "newsletter-msg " + (type || "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = (input.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      afficher("Merci d'indiquer une adresse e-mail valide.", "err");
      input.focus();
      return;
    }
    btn.disabled = true;
    afficher("Inscription en cours…", "");

    fetch("/.netlify/functions/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: "fresque-risques-ia" })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.success) {
          afficher(res.d.message || "Inscription confirmée, merci !", "ok");
          form.reset();
        } else {
          afficher(res.d.error || "L'inscription n'a pas pu aboutir. Réessayez plus tard.", "err");
        }
      })
      .catch(function () {
        afficher("Service momentanément indisponible. Réessayez plus tard.", "err");
      })
      .finally(function () { btn.disabled = false; });
  });
})();
