/* Espace d'administration : connexion par clé, tableau de bord, gestion des
   contacts. La clé est conservée le temps de l'onglet (sessionStorage) et
   envoyée dans l'en-tête "x-cle". Aucune requête externe (CSP stricte). */
(function () {
  "use strict";
  var API = "/.netlify/functions/admin";
  var CLE_STOCK = "fr_admin_cle";
  var etat = { cle: "", contacts: [], stats: null, recherche: "", role: "tous" };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function dateFr(ms) {
    if (!ms) return "·";
    try { return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return "·"; }
  }
  var minuteur;
  function toast(txt) {
    var t = $("toast"); t.textContent = txt; t.hidden = false;
    clearTimeout(minuteur); minuteur = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function api(opts) {
    opts = opts || {};
    var h = { "x-cle": etat.cle };
    var init = { method: opts.method || "GET", headers: h };
    if (opts.body) { h["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(API + (opts.query || ""), init);
  }

  /* --- Connexion --- */
  function montrerBord(oui) {
    $("ecran-cle").hidden = oui;
    $("ecran-bord").hidden = !oui;
    $("btn-rafraichir").hidden = !oui;
    $("btn-quitter").hidden = !oui;
  }

  function connecter(cle) {
    etat.cle = cle;
    return api({ query: "?action=tableau" }).then(function (r) {
      if (r.status === 401) throw new Error("Clé invalide.");
      if (r.status === 503) throw new Error("Espace admin non configuré côté serveur (ADMIN_TOKEN).");
      if (!r.ok) throw new Error("Erreur " + r.status + ".");
      return r.json();
    }).then(function (d) {
      etat.stats = d.stats; etat.contacts = d.contacts || [];
      try { sessionStorage.setItem(CLE_STOCK, cle); } catch (e) {}
      montrerBord(true);
      rendre();
      // Les retours vivent dans leur propre module, en bas de ce fichier : il
      // a besoin d'emprunter l'appel authentifie plutot que de refaire sa
      // propre gestion de cle.
      if (window.__retoursAdmin) window.__retoursAdmin.charger(api);
    });
  }

  $("form-cle").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("cle-msg"); msg.textContent = "Connexion…"; msg.className = "msg";
    connecter($("champ-cle").value.trim()).catch(function (err) {
      msg.textContent = err.message; msg.className = "msg err";
    });
  });

  $("btn-quitter").addEventListener("click", function () {
    try { sessionStorage.removeItem(CLE_STOCK); } catch (e) {}
    etat.cle = ""; etat.contacts = []; montrerBord(false);
    $("champ-cle").value = ""; $("cle-msg").textContent = "";
  });
  $("btn-rafraichir").addEventListener("click", function () {
    connecter(etat.cle).then(function () { toast("À jour."); }).catch(function (e) { toast(e.message); });
  });

  /* --- Rendu du tableau de bord --- */
  function rendre() { rendreStats(); rendreGraphes(); rendreTable(); }

  function tuile(chiffre, libelle, accent) {
    return '<div class="stat' + (accent ? " accent" : "") + '">' +
      '<div class="chiffre">' + chiffre + '</div><div class="libelle">' + esc(libelle) + '</div></div>';
  }
  function rendreStats() {
    var s = etat.stats || {};
    $("stats").innerHTML =
      tuile(s.ateliers || 0, "Ateliers", true) +
      tuile(s.animateurs || 0, "Animateur·ices") +
      tuile(s.participants || 0, "Participant·es") +
      tuile(s.contacts || 0, "Contacts au total") +
      tuile(s.desinscrits || 0, "Désinscrit·es");
  }

  function rendreGraphes() {
    var s = etat.stats || {}; var mois = s.parMois || [];
    // Barres : ateliers par mois (SVG).
    var W = 620, H = 180, pad = 26, n = mois.length || 1;
    var max = Math.max.apply(null, mois.map(function (m) { return m.ateliers; }).concat([1]));
    var bw = (W - pad * 2) / n * 0.62, gap = (W - pad * 2) / n;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ateliers par mois">';
    for (var i = 0; i < mois.length; i++) {
      var m = mois[i];
      var hb = max ? (H - pad * 2) * (m.ateliers / max) : 0;
      var x = pad + i * gap + (gap - bw) / 2;
      var y = H - pad - hb;
      svg += '<rect class="barre" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hb.toFixed(1) + '" rx="3"/>';
      if (m.ateliers) svg += '<text class="valeur" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + m.ateliers + '</text>';
      var lab = m.mois.slice(5) + "/" + m.mois.slice(2, 4);
      svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - pad + 14) + '" text-anchor="middle">' + lab + '</text>';
    }
    svg += "</svg>";
    $("graph-mois").innerHTML = svg;

    // Répartition en ligne / présentiel. On construit les nœuds et on fixe les
    // largeurs/couleurs via el.style (scripté = autorisé par la CSP, contrairement
    // aux attributs style= littéraux qui peuvent être bloqués en production).
    var el = s.ateliersEnligne || 0, ph = s.ateliersPhysique || 0, tot = el + ph;
    var cible = $("graph-repartition"); cible.textContent = "";
    var lignes = document.createElement("div"); lignes.className = "repartition-lignes";
    function ligne(lab, val, couleur) {
      var pct = tot ? Math.round(val / tot * 100) : 0;
      var item = document.createElement("div"); item.className = "rep-item";
      var l = document.createElement("span"); l.className = "rep-lab"; l.textContent = lab;
      var puce = document.createElement("span"); puce.className = "rep-puce"; puce.style.background = couleur;
      var jauge = document.createElement("span"); jauge.className = "rep-jauge";
      var rempli = document.createElement("span"); rempli.style.width = pct + "%"; rempli.style.background = couleur; jauge.appendChild(rempli);
      var v = document.createElement("span"); v.className = "rep-val"; v.textContent = val;
      item.appendChild(l); item.appendChild(puce); item.appendChild(jauge); item.appendChild(v);
      lignes.appendChild(item);
    }
    ligne("En ligne", el, "var(--accent)");
    ligne("En présentiel", ph, "var(--ok)");
    cible.appendChild(lignes);
    if (!tot) { var vide = document.createElement("p"); vide.className = "muted"; vide.style.marginTop = "12px"; vide.textContent = "Aucun atelier enregistré pour l'instant."; cible.appendChild(vide); }
  }

  function filtres(c) {
    if (etat.role === "animateur" && !c.animateur) return false;
    if (etat.role === "participant" && !c.participant) return false;
    if (etat.role === "actifs" && c.desinscrit) return false;
    var q = etat.recherche.trim().toLowerCase();
    if (q && (c.prenom + " " + c.mail).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function rendreTable() {
    var liste = etat.contacts.filter(filtres);
    var corps = $("corps-contacts"); corps.innerHTML = "";
    $("compte-contacts").textContent = liste.length;
    $("vide-contacts").hidden = etat.contacts.length !== 0;

    liste.forEach(function (c) {
      var roles = "";
      if (c.animateur) roles += '<span class="tag anim">Animateur·ice</span> ';
      if (c.participant) roles += '<span class="tag part">Participant·e</span> ';
      var statut = c.desinscrit ? '<span class="tag stop">Désinscrit·e</span>' : '<span class="muted">Actif·ve</span>';
      var nbAt = (c.nbAnimations || 0) + (c.nbParticipations || 0);
      var tr = document.createElement("tr");
      if (c.desinscrit) tr.className = "off";
      tr.innerHTML =
        '<td>' + esc(c.prenom || "·") + '</td>' +
        '<td class="mail">' + esc(c.mail) + '</td>' +
        '<td>' + (roles || "·") + '</td>' +
        '<td class="num">' + nbAt + '</td>' +
        '<td>' + dateFr(c.dernierMs) + '</td>' +
        '<td>' + statut + '</td>' +
        '<td><div class="actions-ligne">' +
          (c.desinscrit ? "" : '<button type="button" class="lien-action" data-op="desinscrire" data-mail="' + esc(c.mail) + '">Désinscrire</button>') +
          '<button type="button" class="lien-action danger" data-op="supprimer" data-mail="' + esc(c.mail) + '">Supprimer</button>' +
        '</div></td>';
      corps.appendChild(tr);
    });
  }

  /* --- Actions sur la table --- */
  $("corps-contacts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-op]"); if (!b) return;
    var op = b.getAttribute("data-op"), mail = b.getAttribute("data-mail");
    var q = op === "supprimer"
      ? "Effacer définitivement " + mail + " du registre ?"
      : "Désinscrire " + mail + " du suivi ? (conservé mais marqué désinscrit)";
    if (!window.confirm(q)) return;
    api({ method: "POST", body: { op: op, mail: mail } }).then(function (r) {
      if (!r.ok) throw new Error("Échec (" + r.status + ").");
      return connecter(etat.cle);
    }).then(function () {
      toast(op === "supprimer" ? "Contact supprimé." : "Contact désinscrit.");
    }).catch(function (err) { toast(err.message); });
  });

  $("recherche").addEventListener("input", function (e) { etat.recherche = e.target.value; rendreTable(); });
  $("filtre-role").addEventListener("change", function (e) { etat.role = e.target.value; rendreTable(); });

  $("btn-copier").addEventListener("click", function () {
    var mails = etat.contacts.filter(filtres).filter(function (c) { return !c.desinscrit && c.mail; })
      .map(function (c) { return c.mail; });
    if (!mails.length) { toast("Aucune adresse à copier."); return; }
    var txt = mails.join(", ");
    var okMsg = function () { toast(mails.length + " adresse(s) copiée(s)."); };
    var repli = function () {
      try {
        var ta = document.createElement("textarea"); ta.value = txt;
        ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-9999px"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta); ok ? okMsg() : toast("Copie impossible.");
      } catch (e) { toast("Copie impossible."); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(okMsg, repli);
    } else { repli(); }
  });

  $("btn-csv").addEventListener("click", function () {
    api({ query: "?action=export" }).then(function (r) {
      if (!r.ok) throw new Error("Export impossible (" + r.status + ").");
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "contacts-fresque.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (err) { toast(err.message); });
  });

  /* --- Reprise de session --- */
  var cle0 = "";
  try { cle0 = sessionStorage.getItem(CLE_STOCK) || ""; } catch (e) {}
  if (cle0) { connecter(cle0).catch(function () { try { sessionStorage.removeItem(CLE_STOCK); } catch (e) {} }); }
})();

/* ============================================================
   RETOURS D'ATELIER ET TEMOIGNAGES

   Deposes depuis /retour/ et /temoignage/, lus ici. Rien n'est publie
   automatiquement : un temoignage n'apparait sur le site qu'apres relecture,
   et un retour d'atelier ne quitte jamais cet ecran.
   ============================================================ */
(function () {
  "use strict";
  var hote = document.getElementById("liste-retours");
  if (!hote) return;

  var tous = [];
  var CHAMPS = [
    ["marquant", "Ce qui l’a marqué"],
    ["pasClair", "Pas clair, ou trop rapide"],
    ["creuser", "Aurait voulu creuser"],
    ["carte", "Une carte à revoir"],
    ["technique", "Problèmes techniques"],
    ["autre", "Autre chose"]
  ];
  var DUREE = { trop_courte: "durée trop courte", juste: "durée juste", trop_longue: "durée trop longue" };
  var FORMAT = { enligne: "en ligne", physique: "en présentiel" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function quand(ms) {
    try { return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function carteRetour(r) {
    var h = '<article class="r-item' + (r.genre === "temoignage" ? " r-temoignage" : "") + '" data-cle="' + esc(r.cle) + '">';
    h += '<header class="r-tete"><span class="r-genre">'
      + (r.genre === "temoignage" ? "Témoignage" : "Retour d’atelier") + "</span>";
    if (r.genre === "atelier") {
      var ctx = [r.role === "animateur" ? "animateur·ice" : "participant·e",
                 FORMAT[r.format], r.dateAtelier, DUREE[r.duree]].filter(Boolean);
      h += '<span class="r-ctx">' + esc(ctx.join(" · ")) + "</span>";
    } else {
      h += '<span class="r-ctx">' + esc([r.prenom, r.precision].filter(Boolean).join(" · ")) + "</span>";
    }
    h += '<span class="r-date">' + esc(quand(r.date)) + "</span>";
    if (r.genre === "temoignage" && r.publie) h += '<span class="r-badge r-publie">publié</span>';
    if (r.genre === "atelier" && r.traite) h += '<span class="r-badge">traité</span>';
    h += "</header>";

    if (r.genre === "temoignage") {
      h += '<p class="r-texte">' + esc(r.texte) + "</p>";
    } else {
      CHAMPS.forEach(function (c) {
        if (r[c[0]]) h += '<p class="r-champ"><strong>' + c[1] + "</strong> " + esc(r[c[0]]) + "</p>";
      });
    }
    if (r.mail) h += '<p class="r-mail"><a href="mailto:' + esc(r.mail) + '">' + esc(r.mail) + "</a></p>";

    h += '<div class="r-actions">';
    if (r.genre === "temoignage") {
      h += '<button type="button" class="btn-mini" data-op="' + (r.publie ? "masquer" : "publier") + '">'
        + (r.publie ? "Masquer" : "Publier") + "</button>";
    } else {
      h += '<button type="button" class="btn-mini" data-op="traiter">'
        + (r.traite ? "Rouvrir" : "Marquer traité") + "</button>";
    }
    h += '<button type="button" class="btn-mini danger" data-op="effacer">Effacer</button>';
    h += "</div></article>";
    return h;
  }

  function rendre() {
    var f = (document.getElementById("filtre-retours") || {}).value || "tous";
    var vus = tous.filter(function (r) {
      if (f === "atelier" || f === "temoignage") return r.genre === f;
      if (f === "attente") return r.genre === "temoignage" ? !r.publie : !r.traite;
      return true;
    });
    var compte = document.getElementById("compte-retours");
    if (compte) compte.textContent = vus.length;
    hote.innerHTML = vus.length
      ? vus.map(carteRetour).join("")
      : '<p class="muted">Aucun retour pour le moment.</p>';
  }

  var appelApi = null;   // prete par le module principal une fois connecte

  function charger(api) {
    appelApi = api;
    return api({ query: "?action=retours" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { tous = (d && d.retours) || []; rendre(); })
      .catch(function () { /* le tableau de bord reste utilisable sans */ });
  }
  window.__retoursAdmin = { charger: charger };

  var filtre = document.getElementById("filtre-retours");
  if (filtre) filtre.addEventListener("change", rendre);

  hote.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-op]");
    if (!b) return;
    var cle = b.closest(".r-item").dataset.cle;
    var op = b.dataset.op;
    if (op === "effacer" && !confirm("Effacer définitivement ce retour ?")) return;
    if (!appelApi) return;
    b.disabled = true;
    appelApi({ method: "POST", body: { op: "retour", sousOp: op, cle: cle } })
      .then(function (r) {
        if (!r.ok) throw new Error("refus");
        return charger(appelApi);
      })
      .catch(function () { b.disabled = false; });
  });
})();
