/* Programmation d'ateliers (animateur) et inscriptions (participant).
   Meme origine, fonction Netlify /.netlify/functions/ateliers. Amelioration
   progressive : sans JS ou sans service, rien ne casse. Bilingue via lang. */
(function () {
  "use strict";
  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var T = en ? {
    envoi: "Sending…", erreur: "Something went wrong. Please try again.", indispo: "Service unavailable. Please try again later.",
    codeOk: "Workshop scheduled. Session code: ", mailOk: " All the details are in the confirmation e-mail we just sent you.", mailNon: " (Note it down: e-mail sending is not set up yet.)",
    inscritOk: "You're registered! Session code: ", places: function (n, m) { return n + " / " + m + " registered"; },
    complet: "Full", prive: "Private", enligne: "Online", presentiel: "In person", aucun: "No scheduled workshop for now.", passe: "Past",
    participer: "Register", annuler: "Cancel",
    annuleOk: "Workshop cancelled. It no longer appears in the list.",
    deplaceOk: "Workshop moved. Registrants have been notified.",
    confirmAnnul: function (c) { return "Cancel workshop " + c + "? This cannot be undone."; },
    ouiAnnuler: "Yes, cancel", nonGarder: "No, keep it",
    confirmDesist: function (c) { return "Unregister from workshop " + c + "?"; },
    desisteOk: "You have been unregistered. Your seat is freed up.",
    videCta: "Schedule a workshop",
    fTous: "All", fEnligne: "Online", fPresentiel: "In person", fFormat: "Format",
    afficherPasses: "Show past workshops", aucunResultat: "No workshop matches these filters."
  } : {
    envoi: "Envoi…", erreur: "Une erreur est survenue. Réessayez.", indispo: "Service indisponible. Réessayez plus tard.",
    codeOk: "Atelier programmé. Code de session : ", mailOk: " Tous les détails sont dans l'e-mail de confirmation qui vient de vous être envoyé.", mailNon: " (Notez-le : l'envoi d'e-mail n'est pas encore configuré.)",
    inscritOk: "Inscription confirmée ! Code de session : ", places: function (n, m) { return n + " / " + m + " inscrits"; },
    complet: "Complet", prive: "Privé", enligne: "En ligne", presentiel: "Présentiel", aucun: "Aucun atelier programmé pour l'instant.", passe: "Passé",
    participer: "Participer", annuler: "Annuler",
    annuleOk: "Atelier annulé. Il n'apparaît plus dans la liste.",
    deplaceOk: "Atelier déplacé. Les inscrit·es ont été prévenu·es.",
    confirmAnnul: function (c) { return "Annuler l'atelier " + c + " ? Cette action est définitive."; },
    ouiAnnuler: "Oui, annuler", nonGarder: "Non, garder",
    confirmDesist: function (c) { return "Vous désinscrire de l'atelier " + c + " ?"; },
    desisteOk: "Vous êtes désinscrit·e. Votre place est de nouveau libre.",
    videCta: "Programmer un atelier",
    fTous: "Tous", fEnligne: "En ligne", fPresentiel: "Présentiel", fFormat: "Format",
    afficherPasses: "Afficher les ateliers passés", aucunResultat: "Aucun atelier ne correspond à ces filtres."
  };
  var HREF_PROG = en ? "/en/request-a-workshop/#vue-animer" : "/participer/#vue-animer";
  function videHtml() {
    return '<div class="ateliers-vide"><p class="muted">' + esc(T.aucun) + "</p>"
      + '<a class="btn btn-2" href="' + HREF_PROG + '">' + esc(T.videCta) + "</a></div>";
  }
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
    function voir(animer, defiler) {
      vA.hidden = !animer; vP.hidden = animer;
      bA.setAttribute("aria-pressed", animer ? "true" : "false");
      bP.setAttribute("aria-pressed", animer ? "false" : "true");
      if (defiler) {
        var cible = animer ? vA : vP;
        try { cible.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { cible.scrollIntoView(); }
      }
    }
    bP.addEventListener("click", function () { voir(false, true); });
    bA.addEventListener("click", function () { voir(true, true); });
    if (location.hash === "#vue-animer") voir(true);
    // Lien de l'e-mail « gérer / déplacer » : on montre la vue animer, on ouvre
    // le bloc repliable et on le fait défiler à vue (parcours sans friction).
    if (location.hash === "#gerer") {
      voir(true);
      var g = document.getElementById("gerer");
      if (g) { g.open = true; try { g.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { g.scrollIntoView(); } }
    }
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
    // Visio : le champ "lien perso" n'apparaît que si l'animateur fournit le sien.
    var visioSel = form.querySelector('[name="visioMode"]');
    var champVisio = form.querySelector(".champ-visio-perso");
    if (visioSel && champVisio) {
      function majVisio() {
        var perso = visioSel.value === "perso";
        champVisio.hidden = !perso;
        var inp = champVisio.querySelector("input");
        if (inp) inp.required = perso;
      }
      visioSel.addEventListener("change", majVisio);
      majVisio();
    }
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
    // Le calendrier de « Participer » (data-passes) peut révéler les ateliers
    // récents (jusqu'à 7 j après), masqués par défaut ; l'aperçu d'accueil ne
    // montre que les à venir. Tri par défaut : du plus proche au plus lointain.
    var passesDispo = liste.hasAttribute("data-passes");
    poster("liste", {}).then(function (res) {
      var arr = (res.d && res.d.ateliers) || [];
      if (!arr.length) { liste.innerHTML = videHtml(); return; }
      initListe(liste, arr, passesDispo);
    }).catch(function () { liste.innerHTML = videHtml(); });
  }

  // Construit la barre de filtres (format + passés) et gère le rendu filtré.
  function initListe(liste, arr, passesDispo) {
    var etat = { format: "tous", passes: false };
    var avenirTous = arr.filter(function (a) { return a.ouvert; });
    var passesTous = arr.filter(function (a) { return !a.ouvert; });
    var modes = {}; arr.forEach(function (a) { modes[a.mode] = true; });
    var multiFormats = Object.keys(modes).length > 1;

    var barre = document.createElement("div");
    barre.className = "ateliers-filtres";

    // Segment de format (seulement s'il y a plusieurs formats).
    if (multiFormats) {
      var grp = document.createElement("div");
      grp.className = "seg"; grp.setAttribute("role", "group"); grp.setAttribute("aria-label", T.fFormat);
      [["tous", T.fTous], ["enligne", T.fEnligne], ["physique", T.fPresentiel]].forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "seg-btn"; b.dataset.format = o[0]; b.textContent = o[1];
        b.setAttribute("aria-pressed", o[0] === etat.format ? "true" : "false");
        b.addEventListener("click", function () {
          etat.format = o[0];
          grp.querySelectorAll(".seg-btn").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.format === o[0] ? "true" : "false"); });
          rendre();
        });
        grp.appendChild(b);
      });
      barre.appendChild(grp);
    }

    // Bascule « afficher les passés » (seulement s'il y en a).
    var lblPasses = null;
    if (passesDispo && passesTous.length) {
      lblPasses = document.createElement("label");
      lblPasses.className = "filtre-passes";
      var chk = document.createElement("input"); chk.type = "checkbox";
      var txt = document.createElement("span");
      lblPasses.appendChild(chk); lblPasses.appendChild(txt);
      chk.addEventListener("change", function () { etat.passes = chk.checked; rendre(); });
      barre.appendChild(lblPasses);
    }

    if (barre.childNodes.length) liste.parentNode.insertBefore(barre, liste);

    function rendre() {
      var okFmt = function (a) { return etat.format === "tous" || a.mode === etat.format; };
      var avenir = avenirTous.filter(okFmt).sort(function (x, y) { return x.quandMs - y.quandMs; });
      var passes = passesTous.filter(okFmt).sort(function (x, y) { return y.quandMs - x.quandMs; });
      if (lblPasses) lblPasses.querySelector("span").textContent = " " + T.afficherPasses + " (" + passes.length + ")";
      var show = etat.passes ? avenir.concat(passes) : avenir;
      liste.innerHTML = "";
      if (!show.length) {
        var p = document.createElement("p"); p.className = "muted ateliers-aucun"; p.textContent = T.aucunResultat;
        liste.appendChild(p); return;
      }
      show.forEach(function (a) { liste.appendChild(carte(a)); });
    }
    rendre();
  }
  function carte(a) {
    var el = document.createElement("article");
    el.className = "atelier-carte" + (a.ouvert ? "" : " passe");
    var lieu = a.mode === "enligne" ? T.enligne : (T.presentiel + (a.lieu ? " · " + esc(a.lieu) : ""));
    var titre = a.titre ? esc(a.titre) : (a.mode === "enligne" ? T.enligne : T.presentiel);
    var etat = !a.ouvert ? '<span class="atelier-places passe">' + T.passe + "</span>"
      : '<span class="atelier-places' + (a.complet ? " complet" : "") + '">' + (a.complet ? T.complet : T.places(a.inscrits, a.maxParticipants)) + "</span>";
    el.innerHTML =
      '<div class="atelier-tete"><span class="atelier-mode">' + (a.mode === "enligne" ? T.enligne : T.presentiel) + '</span>' + etat + "</div>" +
      "<h3>" + titre + "</h3>" +
      '<p class="atelier-quand">' + esc(fmtDate(a.date, a.heure)) + "</p>" +
      '<p class="atelier-lieu muted">' + lieu + (a.animateur ? " · " + esc(a.animateur) : "") + "</p>" +
      (a.description ? '<p class="atelier-desc">' + esc(a.description) + "</p>" : "");
    if (a.ouvert && !a.complet) {
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

  /* ---------- Annuler un atelier (animateur·ice) ---------- */
  function annulerAtelier(donnees, msgEl, apres) {
    if (msgEl) { msgEl.textContent = T.envoi; msgEl.className = "msg"; }
    return poster("annuler", donnees).then(function (res) {
      if (res.ok && res.d && res.d.annule) {
        if (msgEl) { msgEl.className = "msg ok"; msgEl.textContent = T.annuleOk; }
        if (apres) apres();
      } else if (msgEl) {
        msgEl.className = "msg err";
        msgEl.textContent = (res.d && res.d.erreur && res.d.erreur.message) || T.erreur;
      }
    }).catch(function () { if (msgEl) { msgEl.className = "msg err"; msgEl.textContent = T.indispo; } });
  }

  /* ---------- Déplacer un atelier (animateur·ice) ---------- */
  var fDep = document.getElementById("form-deplacer");
  if (fDep) {
    fDep.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = document.getElementById("deplacer-msg");
      var sb = fDep.querySelector('button[type="submit"]');
      var data = { code: (fDep.code.value || "").toUpperCase(), mail: fDep.mail.value, date: fDep.date.value, heure: fDep.heure.value };
      if (sb) sb.disabled = true;
      m.textContent = T.envoi; m.className = "msg";
      poster("reprogrammer", data).then(function (res) {
        if (res.ok && res.d && res.d.deplace) { m.className = "msg ok"; m.textContent = T.deplaceOk; fDep.reset(); }
        else { m.className = "msg err"; m.textContent = (res.d && res.d.erreur && res.d.erreur.message) || T.erreur; }
      }).catch(function () { m.className = "msg err"; m.textContent = T.indispo; })
        .finally(function () { if (sb) sb.disabled = false; });
    });
  }

  // Option 1 : formulaire code + e-mail, avec confirmation avant d'annuler.
  var fAnn = document.getElementById("form-annuler");
  if (fAnn) {
    fAnn.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = document.getElementById("annul-msg");
      var sb = fAnn.querySelector('button[type="submit"]');
      var code = (fAnn.code.value || "").toUpperCase(), mail = fAnn.mail.value;
      // Etape 1 : demander confirmation dans un encadré inline.
      var box = document.createElement("div");
      box.className = "annul-confirm";
      box.innerHTML = '<p>' + esc(T.confirmAnnul(code)) + '</p><div class="annul-confirm-actions">'
        + '<button type="button" class="btn btn-noir" data-oui>' + esc(T.ouiAnnuler) + '</button>'
        + '<button type="button" class="btn btn-2" data-non>' + esc(T.nonGarder) + '</button></div>';
      m.textContent = ""; m.className = "msg";
      var prev = fAnn.querySelector(".annul-confirm"); if (prev) prev.remove();
      fAnn.insertBefore(box, m);
      if (sb) sb.disabled = true;
      function nettoyer() { box.remove(); if (sb) sb.disabled = false; }
      box.querySelector("[data-non]").addEventListener("click", nettoyer);
      box.querySelector("[data-oui]").addEventListener("click", function () {
        box.remove();
        // Etape 2 : annulation effective + message de validation.
        annulerAtelier({ code: code, mail: mail }, m, function () { fAnn.reset(); })
          .then(function () { if (sb) sb.disabled = false; });
      });
    });
  }

  // Option 2 : lien direct depuis l'e-mail (?annuler=CODE&t=JETON).
  (function () {
    var params = new URLSearchParams(location.search);
    var code = params.get("annuler");
    if (!code) return;
    code = code.toUpperCase();
    var token = params.get("t") || "";
    var bAnim = document.getElementById("btn-vue-animer");
    if (bAnim) bAnim.click(); // révèle la vue « Programmer / annuler »
    var m = document.getElementById("annul-msg");
    if (m) { try { m.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }
    if (window.confirm(T.confirmAnnul(code))) {
      annulerAtelier({ code: code, token: token }, m);
    }
  })();

  // Désinscription participant via le lien de l'e-mail (?desister=CODE&p=JETON).
  (function () {
    var params = new URLSearchParams(location.search);
    var code = params.get("desister");
    if (!code) return;
    code = code.toUpperCase();
    var token = params.get("p") || "";
    var host = document.getElementById("liste-ateliers");
    var m = document.createElement("p");
    m.className = "msg"; m.setAttribute("role", "status"); m.style.maxWidth = "44rem"; m.style.margin = "0 0 1.2rem";
    if (host && host.parentNode) host.parentNode.insertBefore(m, host);
    try { m.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    if (window.confirm(T.confirmDesist(code))) {
      m.textContent = T.envoi;
      poster("desister", { code: code, token: token }).then(function (res) {
        if (res.ok && res.d && res.d.desiste) { m.className = "msg ok"; m.textContent = T.desisteOk; }
        else { m.className = "msg err"; m.textContent = (res.d && res.d.erreur && res.d.erreur.message) || T.erreur; }
      }).catch(function () { m.className = "msg err"; m.textContent = T.indispo; });
    } else { m.remove(); }
  })();
})();
