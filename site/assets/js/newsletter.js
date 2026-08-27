/* Inscription newsletter -> fonction serverless Netlify -> CiviCRM.
   Meme origine (pas de requete tierce). Degradation propre si le service est indisponible. */
(function () {
  "use strict";
  var form = document.getElementById("newsletter-form");
  if (!form) return;
  var input = document.getElementById("newsletter-email");
  var btn = document.getElementById("newsletter-btn");
  var msg = document.getElementById("newsletter-msg");

  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var T = en ? {
    invalide: "Please enter a valid e-mail address.",
    cours: "Signing you up…",
    ok: "You're subscribed, thank you!",
    echec: "Sign-up could not complete. Please try again later.",
    indispo: "Service temporarily unavailable. Please try again later."
  } : {
    invalide: "Merci d'indiquer une adresse e-mail valide.",
    cours: "Inscription en cours…",
    ok: "Inscription confirmée, merci !",
    echec: "L'inscription n'a pas pu aboutir. Réessayez plus tard.",
    indispo: "Service momentanément indisponible. Réessayez plus tard."
  };

  function afficher(texte, type) {
    msg.textContent = texte;
    msg.className = "msg " + (type || "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = (input.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      afficher(T.invalide, "err");
      input.focus();
      return;
    }
    btn.disabled = true;
    afficher(T.cours, "");

    fetch("/.netlify/functions/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: "fresque-risques-ia" })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.success) {
          afficher(en ? T.ok : (res.d.message || T.ok), "ok");
          form.reset();
        } else {
          afficher(en ? T.echec : (res.d.error || T.echec), "err");
        }
      })
      .catch(function () {
        afficher(T.indispo, "err");
      })
      .finally(function () { btn.disabled = false; });
  });
})();
