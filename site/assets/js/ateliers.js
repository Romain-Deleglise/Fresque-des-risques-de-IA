/* Programmation d'ateliers (animateur) et inscriptions (participant).
   Meme origine, fonction Netlify /.netlify/functions/ateliers. Amelioration
   progressive : sans JS ou sans service, rien ne casse. Bilingue via lang. */
(function () {
  "use strict";
  var en = (document.documentElement.lang || "fr").indexOf("en") === 0;
  var T = en ? {
    envoi: "Sending…", erreur: "Something went wrong. Please try again.", indispo: "Service unavailable. Please try again later.",
    codeOk: "Workshop scheduled.", mailOk: " All the details are in the confirmation e-mail we just sent you.", mailNon: " (E-mail sending is not set up yet: keep the link below.)",
    inscritOk: "You're registered!", places: function (n, m) { return n + " / " + m + " registered"; },
    complet: "Full", prive: "Private", enligne: "Online", presentiel: "In person", aucun: "No scheduled workshop for now.", passe: "Past",
    participer: "Register", annuler: "Cancel",
    annuleOk: "Workshop cancelled. It no longer appears in the list.",
    deplaceOk: "Workshop moved. Registrants have been notified.",
    confirmAnnul: function () { return "Cancel this workshop? This cannot be undone."; },
    ouiAnnuler: "Yes, cancel", nonGarder: "No, keep it",
    confirmDesist: function () { return "Unregister from this workshop?"; },
    desisteOk: "You have been unregistered. Your seat is freed up.",
    videCta: "Schedule a workshop",
    fTous: "All", fEnligne: "Online", fPresentiel: "In person", fFormat: "Format",
    afficherPasses: "Show past workshops", aucunResultat: "No workshop matches these filters.",
    recapOuvrir: "Open the online board", recapVisio: "Video-call link (shared with attendees)",
    recapCopier: "Copy", recapCopie: "Copied", recapCopieNon: "Copy failed",
    recapPartage: "Registration link to share",
    recapNote: "Everything is in your confirmation e-mail: the link to open your session on the day, the one to share, and the one to move or cancel the workshop.",
    gererIntro: "Open the \u00ab move the workshop \u00bb link from your confirmation e-mail: the workshop is recognised automatically, you only enter your e-mail.",
    lienInconnu: "This link does not match any workshop (it may have been cancelled)."
  } : {
    envoi: "Envoi…", erreur: "Une erreur est survenue. Réessayez.", indispo: "Service indisponible. Réessayez plus tard.",
    codeOk: "Atelier programmé.", mailOk: " Tous les détails sont dans l'e-mail de confirmation qui vient de vous être envoyé.", mailNon: " (L'envoi d'e-mail n'est pas encore configuré : gardez le lien ci-dessous.)",
    inscritOk: "Inscription confirmée !", places: function (n, m) { return n + " / " + m + " inscrits"; },
    complet: "Complet", prive: "Privé", enligne: "En ligne", presentiel: "Présentiel", aucun: "Aucun atelier programmé pour l'instant.", passe: "Passé",
    participer: "Participer", annuler: "Annuler",
    annuleOk: "Atelier annulé. Il n'apparaît plus dans la liste.",
    deplaceOk: "Atelier déplacé. Les inscrit·es ont été prévenu·es.",
    confirmAnnul: function () { return "Annuler cet atelier ? Cette action est définitive."; },
    ouiAnnuler: "Oui, annuler", nonGarder: "Non, garder",
    confirmDesist: function () { return "Vous désinscrire de cet atelier ?"; },
    desisteOk: "Vous êtes désinscrit·e. Votre place est de nouveau libre.",
    videCta: "Programmer un atelier",
    fTous: "Tous", fEnligne: "En ligne", fPresentiel: "Présentiel", fFormat: "Format",
    afficherPasses: "Afficher les ateliers passés", aucunResultat: "Aucun atelier ne correspond à ces filtres.",
    recapOuvrir: "Ouvrir le tableau en ligne", recapVisio: "Lien de visioconférence (partagé avec les inscrit·es)",
    recapCopier: "Copier", recapCopie: "Copié", recapCopieNon: "Copie impossible",
    recapPartage: "Lien de participation à partager",
    recapNote: "Tout est dans votre e-mail de confirmation : le lien pour ouvrir votre session le jour J, celui à partager, et celui pour déplacer ou annuler l'atelier.",
    gererIntro: "Ouvrez le lien \u00ab déplacer l'atelier \u00bb de votre e-mail de confirmation : l'atelier concerné est reconnu tout seul, il ne vous reste que votre e-mail à saisir.",
    lienInconnu: "Ce lien ne correspond à aucun atelier (il a peut-être été annulé)."
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
          msg.textContent = T.codeOk + (res.d.emailEnvoye ? T.mailOk : T.mailNon);
          recapAtelier(res.d.atelier || { code: res.d.code });
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

  // Apres la creation : AUCUN code a l'ecran. On renvoie a l'e-mail (qui porte
  // tous les liens) et on donne les deux liens dont on a besoin tout de suite :
  // le lien de participation a diffuser, et l'ouverture du tableau. Le code n'y
  // apparait que dans l'URL, jamais comme un identifiant a recopier.
  function recapAtelier(a) {
    if (!a || !a.code) return;
    var hote = document.getElementById("recap-atelier");
    if (!hote) {
      hote = document.createElement("div"); hote.id = "recap-atelier"; hote.className = "recap-atelier";
      var ancre = document.getElementById("prog-msg");
      if (ancre && ancre.parentNode) ancre.parentNode.insertBefore(hote, ancre.nextSibling);
      else (document.getElementById("vue-animer") || document.body).appendChild(hote);
    }
    hote.innerHTML = "";
    var base = location.origin;
    var ouvrir = "/en-ligne/session/?ouvrir=" + encodeURIComponent(a.code);
    var partage = base + (en ? "/en/request-a-workshop/" : "/participer/") + "?atelier=" + encodeURIComponent(a.code);
    hote.appendChild(ligneRecap(T.recapPartage, partage, partage, true));
    var pA = document.createElement("p"); pA.style.margin = "10px 0";
    var bA = document.createElement("a"); bA.className = "btn"; bA.href = ouvrir; bA.target = "_blank"; bA.rel = "noopener";
    bA.textContent = T.recapOuvrir; pA.appendChild(bA); hote.appendChild(pA);
    if (a.visio) hote.appendChild(ligneRecap(T.recapVisio, a.visio, a.visio, true));
    var note = document.createElement("p"); note.className = "muted"; note.style.fontSize = ".85rem"; note.style.margin = "6px 0 0";
    note.textContent = T.recapNote; hote.appendChild(note);
    try { hote.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }
  // Une ligne « libellé : valeur » avec bouton Copier (valeur copiee au presse-papier).
  function ligneRecap(libelle, affiche, aCopier, estLien) {
    var l = document.createElement("div"); l.className = "recap-ligne";
    var lab = document.createElement("span"); lab.className = "recap-lab"; lab.textContent = libelle + " : ";
    l.appendChild(lab);
    if (estLien) { var av = document.createElement("a"); av.href = affiche; av.target = "_blank"; av.rel = "noopener"; av.className = "recap-val"; av.textContent = affiche; l.appendChild(av); }
    else { var sp = document.createElement("span"); sp.className = "recap-val recap-code"; sp.textContent = affiche; l.appendChild(sp); }
    var b = document.createElement("button"); b.type = "button"; b.className = "recap-copier"; b.textContent = T.recapCopier;
    b.addEventListener("click", function () {
      copieRobuste(aCopier).then(function (ok) {
        b.textContent = ok ? T.recapCopie : T.recapCopieNon;
        setTimeout(function () { b.textContent = T.recapCopier; }, 1800);
      });
    });
    l.appendChild(b);
    return l;
  }
  // Copie robuste : API moderne (HTTPS) avec repli execCommand (contexte non
  // securise, ex. test via l'IP du serveur). true seulement si copie reelle.
  function copieRobuste(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return repliCopie(txt); });
    }
    return Promise.resolve(repliCopie(txt));
  }
  function repliCopie(txt) {
    try {
      var ta = document.createElement("textarea"); ta.value = txt;
      ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-9999px"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { ta.setSelectionRange(0, txt.length); } catch (e) {}
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); return ok;
    } catch (e) { return false; }
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
          f.innerHTML = '<p class="msg ok">' + esc(T.inscritOk + (res.d.emailEnvoye ? T.mailOk : T.mailNon)) + "</p>";
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

  /* ---------- Gérer un atelier existant (depuis le lien de l'e-mail) --------
     Le bloc est replié par défaut. Le code arrive par ?gerer=CODE, va dans un
     champ caché des deux formulaires, et n'est jamais montré ni demandé. Sans
     ce paramètre, on renvoie simplement au lien de l'e-mail. */
  (function () {
    var bloc = document.getElementById("gerer");
    if (!bloc) return;
    var code = (new URLSearchParams(location.search).get("gerer") || "").toUpperCase();
    var note = document.getElementById("gerer-note");
    var forms = document.getElementById("gerer-formulaires");
    if (note) note.textContent = T.gererIntro;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      if (location.hash === "#gerer") { revelerAnimer(); bloc.open = true; }
      return;
    }
    ["form-deplacer", "form-annuler"].forEach(function (id) {
      var f = document.getElementById(id);
      if (f && f.code) f.code.value = code;
    });
    if (forms) forms.hidden = false;
    if (note) note.hidden = true;
    revelerAnimer();
    bloc.open = true;
    try { bloc.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
  })();
  // Révèle la vue « Programmer / gérer » (les deux vues sont des onglets).
  function revelerAnimer() {
    var b = document.getElementById("btn-vue-animer");
    var v = document.getElementById("vue-animer");
    if (b && v && v.hidden) b.click();
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
      box.innerHTML = '<p>' + esc(T.confirmAnnul()) + '</p><div class="annul-confirm-actions">'
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
    if (window.confirm(T.confirmAnnul())) {
      annulerAtelier({ code: code, token: token }, m);
    }
  })();

  /* ---------- Lien de participation (?atelier=CODE) -------------------------
     Un atelier privé n'apparaît pas dans la liste publique : c'est le LIEN qui
     donne accès à l'inscription. On demande la fiche au serveur (op « voir »)
     et on l'affiche en tête de liste, formulaire déjà ouvert. */
  (function () {
    var code = (new URLSearchParams(location.search).get("atelier") || "").toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return;
    var hote = document.getElementById("liste-ateliers");
    if (!hote) return;
    var boite = document.createElement("div");
    boite.className = "atelier-invite";
    boite.innerHTML = '<p class="msg" role="status" aria-live="polite">' + esc(T.envoi) + "</p>";
    if (hote.parentNode) hote.parentNode.insertBefore(boite, hote);
    poster("voir", { code: code }).then(function (res) {
      var a = res.ok && res.d && res.d.atelier;
      if (!a) {
        boite.innerHTML = '<p class="msg err">' + esc((res.d && res.d.erreur && res.d.erreur.message) || T.lienInconnu) + "</p>";
        return;
      }
      boite.innerHTML = "";
      var el = carte(a);
      boite.appendChild(el);
      var btn = el.querySelector(".btn");
      if (btn) btn.click();     // formulaire d'inscription ouvert d'emblee
      try { boite.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    }).catch(function () { boite.innerHTML = '<p class="msg err">' + esc(T.indispo) + "</p>"; });
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
    if (window.confirm(T.confirmDesist())) {
      m.textContent = T.envoi;
      poster("desister", { code: code, token: token }).then(function (res) {
        if (res.ok && res.d && res.d.desiste) { m.className = "msg ok"; m.textContent = T.desisteOk; }
        else { m.className = "msg err"; m.textContent = (res.d && res.d.erreur && res.d.erreur.message) || T.erreur; }
      }).catch(function () { m.className = "msg err"; m.textContent = T.indispo; });
    } else { m.remove(); }
  })();
})();
