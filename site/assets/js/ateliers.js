/* Programmation d'ateliers (animateur) et inscriptions (participant).
   Meme origine, fonction Netlify /.netlify/functions/ateliers. Amelioration
   progressive : sans JS ou sans service, rien ne casse. Bilingue via lang. */
(function () {
  "use strict";
  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var T = en ? {
    envoi: "Sending…", erreur: "Something went wrong. Please try again.", indispo: "Service unavailable. Please try again later.",
    codeOk: "Workshop scheduled. Session code: ", mailOk: " A confirmation e-mail has been sent.", mailNon: " (Note it down: e-mail sending is not set up yet.)",
    inscritOk: "You're registered! Session code: ", places: function (n, m) { return n + " / " + m + " registered"; },
    complet: "Full", prive: "Private", enligne: "Online", presentiel: "In person", aucun: "No scheduled workshop for now.",
    participer: "Register", annuler: "Cancel"
  } : {
    envoi: "Envoi…", erreur: "Une erreur est survenue. Réessayez.", indispo: "Service indisponible. Réessayez plus tard.",
    codeOk: "Atelier programmé. Code de session : ", mailOk: " Un e-mail de confirmation a été envoyé.", mailNon: " (Notez-le : l'envoi d'e-mail n'est pas encore configuré.)",
    inscritOk: "Inscription confirmée ! Code de session : ", places: function (n, m) { return n + " / " + m + " inscrits"; },
    complet: "Complet", prive: "Privé", enligne: "En ligne", presentiel: "Présentiel", aucun: "Aucun atelier programmé pour l'instant.",
    participer: "Participer", annuler: "Annuler"
  };
  function poster(op, data) {
    return fetch("/.netlify/functions/ateliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ op: op }, data))
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); });
  }
  function esc(s) { var e = document.createElement("div"); e.textContent = s == null ? "" : s; return e.innerHTML; }
  function fmtDate(iso, heure) {
    try {
      var d = new Date(iso + "T" + (heure || "00:00") + ":00");
      return d.toLocaleDateString(en ? "en-GB" : "fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " · " + heure;
    } catch (e) { return iso + " " + (heure || ""); }
  }

  /* ---------- Bascule Participer / Animer (onglet Participer) ---------- */
  var bP = document.getElementById("btn-vue-participer"), bA = document.getElementById("btn-vue-animer");
  var vP = document.getElementById("vue-participer"), vA = document.getElementById("vue-animer");
  if (bP && bA && vP && vA) {
    function voir(animer) {
      vA.hidden = !animer; vP.hidden = animer;
      bA.setAttribute("aria-pressed", animer ? "true" : "false");
      bP.setAttribute("aria-pressed", animer ? "false" : "true");
    }
    bP.addEventListener("click", function () { voir(false); });
    bA.addEventListener("click", function () { voir(true); });
    if (location.hash === "#vue-animer") voir(true);
  }

  /* ---------- Formulaire animateur : programmer un atelier ---------- */
  var form = document.getElementById("form-programmer");
  if (form) {
    var msg = document.getElementById("prog-msg");
    var champsPhysique = form.querySelector(".champs-physique");
    function majMode() {
      var m = form.querySelector('input[name="mode"]:checked');
      var physique = m && m.value === "physique";
      if (champsPhysique) champsPhysique.hidden = !physique;
      var lieu = form.querySelector('[name="lieu"]');
      if (lieu) lieu.required = physique;
      var maxi = form.querySelector('[name="maxParticipants"]');
      if (maxi) { maxi.max = physique ? 16 : 8; if (+maxi.value > +maxi.max) maxi.value = maxi.max; }
    }
    form.querySelectorAll('input[name="mode"]').forEach(function (r) { r.addEventListener("change", majMode); });
    majMode();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form), data = {};
      fd.forEach(function (v, k) { data[k] = v; });
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      msg.textContent = T.envoi; msg.className = "msg";
      poster("programmer", data).then(function (res) {
        if (res.ok && res.d.code) {
          msg.className = "msg ok";
          msg.textContent = T.codeOk + res.d.code + (res.d.emailEnvoye ? T.mailOk : T.mailNon);
          form.reset(); majMode();
        } else {
          msg.className = "msg err";
          msg.textContent = (res.d && res.d.erreur && res.d.erreur.message)
            || (res.d && res.d.details ? T.erreur + " (" + res.d.details + ")" : T.erreur);
        }
      }).catch(function () { msg.className = "msg err"; msg.textContent = T.indispo; })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  }

  /* ---------- Liste + inscription (onglet Participer) ---------- */
  var liste = document.getElementById("liste-ateliers");
  if (liste) {
    poster("liste", {}).then(function (res) {
      var arr = (res.d && res.d.ateliers) || [];
      if (!arr.length) { liste.innerHTML = '<p class="muted ateliers-vide">' + esc(T.aucun) + "</p>"; return; }
      liste.innerHTML = "";
      arr.forEach(function (a) { liste.appendChild(carte(a)); });
    }).catch(function () { liste.innerHTML = '<p class="muted ateliers-vide">' + esc(T.aucun) + "</p>"; });
  }
  function carte(a) {
    var el = document.createElement("article");
    el.className = "atelier-carte";
    var lieu = a.mode === "enligne" ? T.enligne : (T.presentiel + (a.lieu ? " · " + esc(a.lieu) : ""));
    var titre = a.titre ? esc(a.titre) : (a.mode === "enligne" ? T.enligne : T.presentiel);
    el.innerHTML =
      '<div class="atelier-tete"><span class="atelier-mode">' + (a.mode === "enligne" ? T.enligne : T.presentiel) + '</span>' +
      '<span class="atelier-places' + (a.complet ? " complet" : "") + '">' + (a.complet ? T.complet : T.places(a.inscrits, a.maxParticipants)) + "</span></div>" +
      "<h3>" + titre + "</h3>" +
      '<p class="atelier-quand">' + esc(fmtDate(a.date, a.heure)) + "</p>" +
      '<p class="atelier-lieu muted">' + lieu + (a.animateur ? " · " + esc(a.animateur) : "") + "</p>";
    if (!a.complet) {
      var btn = document.createElement("button");
      btn.className = "btn btn-1"; btn.type = "button"; btn.textContent = T.participer;
      btn.addEventListener("click", function () { ouvrirInscription(el, a, btn); });
      el.appendChild(btn);
    }
    return el;
  }
  function ouvrirInscription(el, a, btn) {
    if (el.querySelector(".atelier-form")) return;
    btn.hidden = true;
    var f = document.createElement("form");
    f.className = "atelier-form";
    f.innerHTML =
      '<label>' + (en ? "First name" : "Prénom") + '<input name="prenom" maxlength="24" required autocomplete="given-name"></label>' +
      '<label>' + (en ? "E-mail" : "E-mail") + '<input name="mail" type="email" maxlength="160" required autocomplete="email"></label>' +
      '<div class="atelier-form-actions"><button class="btn btn-1" type="submit">' + T.participer + '</button>' +
      '<button class="btn btn-2" type="button" data-annuler>' + T.annuler + '</button></div>' +
      '<p class="msg" role="status" aria-live="polite"></p>';
    el.appendChild(f);
    f.querySelector("[data-annuler]").addEventListener("click", function () { f.remove(); btn.hidden = false; });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = f.querySelector(".msg"), sb = f.querySelector('button[type="submit"]');
      m.textContent = T.envoi; m.className = "msg"; if (sb) sb.disabled = true;
      poster("inscrire", { code: a.code, prenom: f.prenom.value, mail: f.mail.value }).then(function (res) {
        if (res.ok && res.d.atelier) {
          f.innerHTML = '<p class="msg ok">' + esc(T.inscritOk + res.d.atelier.code + (res.d.emailEnvoye ? T.mailOk : T.mailNon)) + "</p>";
          var pl = el.querySelector(".atelier-places");
          if (pl) pl.textContent = T.places(a.inscrits + 1, a.maxParticipants);
        } else {
          m.className = "msg err"; m.textContent = (res.d && res.d.erreur && res.d.erreur.message) || T.erreur;
          if (sb) sb.disabled = false;
        }
      }).catch(function () { m.className = "msg err"; m.textContent = T.indispo; if (sb) sb.disabled = false; });
    });
  }
})();
