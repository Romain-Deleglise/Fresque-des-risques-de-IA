/* Fresque en ligne — client de session (multi-participants).
   Le serveur (fonction Netlify) est l'autorité. Le client applique ses actions
   de façon optimiste puis envoie une intention ; il interroge l'état toutes les
   ~2,5 s (tolérance 5-10 s du cahier des charges). Vue (zoom/pan) locale. */
(function () {
  "use strict";

  var API = "/.netlify/functions/fresque";
  var BASE = "../../";
  var PLAN_W = 3200, PLAN_H = 2200, ZMIN = 0.20, ZMAX = 1.60, ZSTEP = 1.25, ZWHEEL = 1.06;
  var POLL_MS = 2500;

  var E = {}; // éléments DOM
  ["lobby","app","anim-prenom","btn-creer","join-code","join-prenom","btn-rejoindre","lobby-msg",
   "code-val","code-chip","btn-partager","pioche-n","nb-part","etat-conn","carte0-txt",
   "scene","monde","fleches","main-zone","aide","z-niv","z-moins","z-plus","z-tout","btn-plein",
   "btn-distribuer","btn-passer","btn-distribuer-tous","btn-participants","panneau","fermer-panneau",
   "liste-part","vocal-url","btn-vocal","vocal-lien","legende","modal","carte-grande","modal-flip",
   "modal-close","mg-img","mg-num","mg-tit","mg-vtit","mg-verso"].forEach(function (id) {
    E[id] = document.getElementById(id);
  });

  var etat = {
    code: null, jeton: null, role: null,
    cartes: {},            // données des cartes (cartes.json)
    vue: null,             // dernier état serveur
    version: 0,
    zoom: 1, panX: 0, panY: 0, outil: "deplacer",
    sel: null, flecheDepart: null,
    dragN: null,           // carte en cours de glissement (on ignore le serveur)
    elCartes: {}, elTextes: {},
  };

  /* ---------- Réseau ---------- */
  function api(op, extra) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ op: op }, extra)) })
      .then(function (r) { return r.json().then(function (d) { return { http: r.ok, d: d }; }); });
  }
  function jetonStocke(code) { try { return localStorage.getItem("fresque:" + code); } catch (e) { return null; } }
  function stockerJeton(code, j) { try { localStorage.setItem("fresque:" + code, j); } catch (e) {} }

  /* ---------- Lobby ---------- */
  function lobbyMsg(t, type) { E["lobby-msg"].textContent = t || ""; E["lobby-msg"].className = "lobby-msg " + (type || ""); }

  E["btn-creer"].addEventListener("click", function () {
    var prenom = (E["anim-prenom"].value || "").trim();
    if (!prenom) { lobbyMsg("Indiquez votre prénom.", "err"); return; }
    E["btn-creer"].disabled = true; lobbyMsg("Création…");
    api("creer", { prenom: prenom }).then(function (res) {
      E["btn-creer"].disabled = false;
      if (res.d && res.d.code) { stockerJeton(res.d.code, res.d.jeton); demarrer(res.d.code, res.d.jeton, res.d.role, res.d.etat); }
      else lobbyMsg((res.d && (res.d.error || (res.d.refus && res.d.refus.message))) || "Échec.", "err");
    }).catch(function () { E["btn-creer"].disabled = false; lobbyMsg("Service indisponible pour le moment.", "err"); });
  });

  E["btn-rejoindre"].addEventListener("click", rejoindre);
  E["join-code"].addEventListener("keydown", function (e) { if (e.key === "Enter") rejoindre(); });
  function rejoindre() {
    var code = (E["join-code"].value || "").trim().toUpperCase();
    var prenom = (E["join-prenom"].value || "").trim();
    if (code.length !== 6) { lobbyMsg("Le code fait 6 caractères.", "err"); return; }
    if (!prenom) { lobbyMsg("Indiquez votre prénom.", "err"); return; }
    E["btn-rejoindre"].disabled = true; lobbyMsg("Connexion…");
    api("rejoindre", { code: code, prenom: prenom, jeton: jetonStocke(code) }).then(function (res) {
      E["btn-rejoindre"].disabled = false;
      if (res.d && res.d.jeton) { stockerJeton(code, res.d.jeton); demarrer(code, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      else lobbyMsg((res.d && res.d.refus && res.d.refus.message) || "Code inconnu.", "err");
    }).catch(function () { E["btn-rejoindre"].disabled = false; lobbyMsg("Service indisponible.", "err"); });
  }

  // reprise auto si ?s=CODE et jeton stocké
  (function () {
    var m = new URLSearchParams(location.search).get("s");
    if (m) { E["join-code"].value = m.toUpperCase();
      var j = jetonStocke(m.toUpperCase());
      if (j) api("rejoindre", { code: m.toUpperCase(), jeton: j }).then(function (res) {
        if (res.d && res.d.jeton) { stockerJeton(m.toUpperCase(), res.d.jeton); demarrer(m.toUpperCase(), res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      }).catch(function(){});
    }
  })();

  /* ---------- Démarrage session ---------- */
  function demarrer(code, jeton, role, vue, moi) {
    _idMoi = moi || null;
    etat.code = code; etat.jeton = jeton; etat.role = role;
    document.body.classList.add("role-" + role);
    E.lobby.hidden = true; E.app.hidden = false;
    E["code-val"].textContent = code;
    chargerCartes().then(function () {
      centrer(); appliquerEtat(vue); setOutil("deplacer");
      flash(role === "animateur" ? "Partagez le code " + code + " avec les participants." : "En attente d'une carte…");
      boucle();
    });
  }
  function chargerCartes() {
    return fetch(BASE + "data/cartes.json").then(function (r) { return r.json(); }).then(function (data) {
      data.cartes.forEach(function (c) { etat.cartes[c.n] = c; });
      var c0 = etat.cartes[0]; if (c0) E["carte0-txt"].textContent = (c0.verso || []).join("  ");
    });
  }

  var pollTimer = null, hs = false;
  function boucle() {
    clearTimeout(pollTimer);
    api("etat", { code: etat.code, jeton: etat.jeton, version: etat.version }).then(function (res) {
      marquerConnexion(true);
      if (res.d && res.d.etat) appliquerEtat(res.d.etat);
      else if (res.d && res.d.refus) { flash(res.d.refus.message || "Session terminée."); }
    }).catch(function () { marquerConnexion(false); }).finally(function () {
      pollTimer = setTimeout(boucle, POLL_MS);
    });
  }
  function marquerConnexion(ok) { if (ok === hs) { hs = !ok; E["etat-conn"].classList.toggle("hs", !ok); } }

  /* ---------- Application de l'état serveur (déclaratif) ---------- */
  function appliquerEtat(vue) {
    if (!vue) return;
    if (vue.version < etat.version) return; // vieil état
    etat.vue = vue; etat.version = vue.version;
    E["pioche-n"].textContent = vue.piocheRestante;
    E["nb-part"].textContent = vue.participants.length;
    rendreParticipants(vue);
    rendreMain(vue);
    rendreVocal(vue);
    rendreTableau(vue.tableau);
    if (vue.clos) { flash("La session a été close par l'animateur."); }
  }

  /* ---------- Participants / vocal / main ---------- */
  function moi() { if (etat.role !== "participant") return null; return (etat.vue.participants || []).find(function (p) { return p.id === idMoi(); }); }
  var _idMoi = null;
  function idMoi() {
    // notre id = le participant dont on ne connaît pas l'id ; on le déduit une fois via le jeton n'est pas exposé.
    return _idMoi;
  }
  function rendreParticipants(vue) {
    var ul = E["liste-part"]; ul.innerHTML = "";
    var liA = document.createElement("li");
    liA.innerHTML = '<span class="pastille' + (vue.animateur.connecte ? '' : ' hs') + '"></span><span class="nom">' + esc(vue.animateur.prenom) + '</span><span class="anim">animateur</span>';
    ul.appendChild(liA);
    vue.participants.forEach(function (p) {
      var li = document.createElement("li");
      var info = p.carteEnMain != null ? ("carte " + p.carteEnMain) : (p.recues ? (p.recues + " reçue" + (p.recues > 1 ? "s" : "")) : "");
      li.innerHTML = '<span class="pastille' + (p.connecte ? '' : ' hs') + '"></span><span class="nom">' + esc(p.prenom) + '</span><span class="info">' + info + '</span>';
      ul.appendChild(li);
    });
  }
  function rendreVocal(vue) {
    if (vue.lienVocal) { E["vocal-lien"].hidden = false; E["vocal-lien"].href = vue.lienVocal; if (E["vocal-url"]) E["vocal-url"].value = vue.lienVocal; }
    else E["vocal-lien"].hidden = true;
  }
  function rendreMain(vue) {
    var mz = E["main-zone"]; mz.innerHTML = "";
    var p = etat.role === "participant" ? (vue.participants.find(function (x) { return x.id === _idMoi; })) : null;
    if (!p || p.carteEnMain == null) return;
    var c = etat.cartes[p.carteEnMain]; if (!c) return;
    var d = document.createElement("div"); d.className = "main-carte";
    d.innerHTML = '<div class="vis"><img alt="" src="' + BASE + (c.image ? c.image.vignette : "") + '"><span class="num">' + c.n + '</span></div>'
      + '<div class="tit">' + esc(c.titre) + '</div>'
      + '<div class="actions"><button class="btn primaire" data-a="poser">Poser</button><button class="btn" data-a="voir">⤢</button></div>';
    d.querySelector('[data-a="poser"]').addEventListener("click", function () {
      var r = rectVisible();
      agir({ op: "poser", n: p.carteEnMain, rect: r });
    });
    d.querySelector('[data-a="voir"]').addEventListener("click", function () { ouvrirModal(p.carteEnMain); });
    mz.appendChild(d);
  }

  /* ---------- Tableau (rendu déclaratif) ---------- */
  function rendreTableau(tab) {
    if (!tab) return;
    var vus = {};
    tab.cartes.forEach(function (c) {
      vus[c.n] = 1;
      var el = etat.elCartes[c.n];
      if (!el) { el = creerElCarte(c.n); etat.elCartes[c.n] = el; E.monde.appendChild(el); flashPose(el); }
      if (etat.dragN !== c.n) { el.style.left = c.x + "px"; el.style.top = c.y + "px"; el._x = c.x; el._y = c.y; }
    });
    Object.keys(etat.elCartes).forEach(function (n) { if (!vus[n]) { etat.elCartes[n].remove(); delete etat.elCartes[n]; } });

    // textes
    var vusT = {};
    tab.textes.forEach(function (t) {
      vusT[t.id] = 1;
      var el = etat.elTextes[t.id];
      if (!el) { el = creerElTexte(t); etat.elTextes[t.id] = el; E.monde.appendChild(el); }
      if (el._drag !== true && el.getAttribute("contenteditable") !== "true") {
        el.style.left = t.x + "px"; el.style.top = t.y + "px"; el.textContent = t.contenu; el._x = t.x; el._y = t.y;
      }
      el._id = t.id;
    });
    Object.keys(etat.elTextes).forEach(function (id) { if (!vusT[id]) { etat.elTextes[id].remove(); delete etat.elTextes[id]; } });

    dessinerFleches();
  }

  function creerElCarte(n) {
    var c = etat.cartes[n]; var el = document.createElement("div"); el.className = "c-carte"; el.dataset.n = n;
    el.innerHTML = '<div class="vis"><img alt="" loading="lazy" src="' + BASE + (c && c.image ? c.image.vignette : "") + '"><span class="num">' + n + '</span>'
      + '<button class="agr" aria-label="Agrandir">⤢</button></div><div class="tit">' + esc(c ? c.titre : "") + '</div>';
    el.querySelector(".agr").addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(n); });
    el.addEventListener("click", function (e) {
      if (etat.outil === "fleche" || etat.outil === "fleche2") { e.stopPropagation(); clicFleche(n, el); }
      else if (etat.role === "animateur") { selCarte(n, el); }
    });
    glisserCarte(el, n);
    return el;
  }
  function flashPose(el) { el.classList.add("pose-anim"); setTimeout(function () { el.classList.remove("pose-anim"); }, 700); }

  function glisserCarte(el, n) {
    var st = null;
    el.addEventListener("pointerdown", function (e) {
      if (etat.outil !== "deplacer" || e.target.closest(".agr")) return;
      e.stopPropagation(); el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing";
      etat.dragN = n; st = { mx: e.clientX, my: e.clientY, x: el._x || 0, y: el._y || 0 };
    });
    el.addEventListener("pointermove", function (e) {
      if (!st) return;
      var x = Math.max(0, Math.min(PLAN_W - el.offsetWidth, st.x + (e.clientX - st.mx) / etat.zoom));
      var y = Math.max(0, Math.min(PLAN_H - el.offsetHeight, st.y + (e.clientY - st.my) / etat.zoom));
      el._x = x; el._y = y; el.style.left = x + "px"; el.style.top = y + "px"; dessinerFleches();
    });
    el.addEventListener("pointerup", function (e) {
      if (!st) return; st = null; el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch (x) {}
      etat.dragN = null;
      agir({ op: "deplacerCarte", n: n, x: el._x, y: el._y });
    });
  }

  /* ---------- Flèches ---------- */
  function clicFleche(n, el) {
    if (!etat.flecheDepart) { etat.flecheDepart = { n: n, el: el }; el.classList.add("depart"); flash("Cliquez la carte d'arrivée."); }
    else if (etat.flecheDepart.n === n) { annulerFleche(); }
    else { agir({ op: "creerFleche", de: etat.flecheDepart.n, vers: n, bidir: etat.outil === "fleche2" }); annulerFleche(); }
  }
  function annulerFleche() { if (etat.flecheDepart) etat.flecheDepart.el.classList.remove("depart"); etat.flecheDepart = null; }

  function centreCarte(n) {
    var el = etat.elCartes[n]; if (!el) return null;
    return { x: (el._x || 0) + el.offsetWidth / 2, y: (el._y || 0) + el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
  }
  function bord(c, tx, ty) { var dx = tx - c.x, dy = ty - c.y; if (!dx && !dy) return { x: c.x, y: c.y };
    var hw = c.w / 2 + 4, hh = c.h / 2 + 4; var s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: c.x + dx * s, y: c.y + dy * s }; }
  function dessinerFleches() {
    if (!etat.vue) return;
    var defs = '<defs><marker id="ah" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#8a857b"/></marker>'
      + '<marker id="aho" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#E8811C"/></marker>'
      + '<marker id="ahs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M11,0 L0,4.5 L11,9 z" fill="#8a857b"/></marker></defs>';
    var html = defs, idx = {};
    (etat.vue.tableau.fleches || []).forEach(function (f) {
      var A = centreCarte(f.de), B = centreCarte(f.vers); if (!A || !B) return;
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers); idx[cle] = (idx[cle] || 0); var k = idx[cle]++;
      var pa = bord(A, B.x, B.y), pb = bord(B, A.x, A.y);
      var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      var amp = Math.min(20, len * 0.09) * (k % 2 === 0 ? 1 : -1) * (1 + Math.floor(k / 2));
      var nx = -dy / len, ny = dx / len, cxp = mx + nx * amp, cyp = my + ny * amp;
      var d = "M" + pa.x + "," + pa.y + " Q" + cxp + "," + cyp + " " + pb.x + "," + pb.y;
      var sel = etat.sel && etat.sel.type === "fleche" && etat.sel.id === f.id;
      html += '<path class="hit" data-id="' + f.id + '" d="' + d + '"/>';
      html += '<path class="trait' + (sel ? ' sel' : '') + '" d="' + d + '" marker-end="url(#' + (sel ? 'aho' : 'ah') + ')"' + (f.bidir ? ' marker-start="url(#ahs)"' : '') + '/>';
      if (f.libelle) html += '<text class="lib" x="' + (mx + nx * amp * 0.6) + '" y="' + (my + ny * amp * 0.6) + '" text-anchor="middle">' + esc(f.libelle) + '</text>';
      f._mid = { x: cxp, y: cyp };
    });
    E.fleches.innerHTML = html;
    E.fleches.querySelectorAll(".hit").forEach(function (h) {
      h.addEventListener("click", function (e) { e.stopPropagation(); selFleche(h.dataset.id); });
    });
    positionnerEditeurs();
  }

  /* ---------- Sélection flèche : libellé + suppression ---------- */
  var croix = null, editLib = null;
  function selFleche(id) {
    deselect(); etat.sel = { type: "fleche", id: id }; dessinerFleches();
    var f = etat.vue.tableau.fleches.find(function (x) { return x.id === id; }); if (!f) return;
    editLib = document.createElement("input"); editLib.type = "text"; editLib.maxLength = 40; editLib.value = f.libelle || "";
    editLib.placeholder = "libellé…";
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-ui);font-size:.85rem;border:1px solid var(--accent);border-radius:6px;padding:.25rem .45rem;background:#fff;color:var(--ink);width:9rem;box-shadow:0 4px 12px rgba(27,26,23,.14)";
    var envoi = null;
    editLib.addEventListener("input", function () { clearTimeout(envoi); var v = editLib.value; envoi = setTimeout(function () { agir({ op: "libellerFleche", id: id, libelle: v }); }, 400); });
    E.scene.appendChild(editLib);
    croix = boutonCroix("fleche-croix", function () { agir({ op: "supprimerFleche", id: id }); deselect(); });
    positionnerEditeurs();
  }
  function selCarte(n, el) { deselect(); etat.sel = { type: "carte", n: n }; el.classList.add("sel"); }
  function boutonCroix(cls, onClick) { var b = document.createElement("button"); b.className = cls; b.textContent = "✕"; b.addEventListener("click", onClick); E.scene.appendChild(b); return b; }
  function deselect() {
    if (etat.sel && etat.sel.type === "carte") { var el = etat.elCartes[etat.sel.n]; if (el) el.classList.remove("sel"); }
    etat.sel = null; [croix, editLib].forEach(function (x) { if (x) x.remove(); }); croix = editLib = null; dessinerFleches();
  }
  function positionnerEditeurs() {
    if (etat.sel && etat.sel.type === "fleche") {
      var f = etat.vue.tableau.fleches.find(function (x) { return x.id === etat.sel.id; });
      if (f && f._mid) { var px = etat.panX + f._mid.x * etat.zoom, py = etat.panY + f._mid.y * etat.zoom;
        if (croix) { croix.style.left = px + "px"; croix.style.top = (py - 16) + "px"; }
        if (editLib) { editLib.style.left = (px + 14) + "px"; editLib.style.top = (py - 14) + "px"; } }
    }
  }

  /* ---------- Notes texte ---------- */
  function creerElTexte(t) {
    var el = document.createElement("div"); el.className = "c-texte"; el.dataset.id = t.id; el.textContent = t.contenu;
    el.addEventListener("pointerdown", function (e) { glisserTexte(e, el); });
    el.addEventListener("click", function (e) { e.stopPropagation(); editerTexte(el); });
    return el;
  }
  function editerTexte(el) {
    el.setAttribute("contenteditable", "true"); el.focus();
    var sel = window.getSelection(), rng = document.createRange(); rng.selectNodeContents(el); rng.collapse(false); sel.removeAllRanges(); sel.addRange(rng);
    el.onblur = function () { el.removeAttribute("contenteditable");
      var v = el.textContent.trim();
      agir({ op: "modifierTexte", id: el._id, contenu: v });
    };
  }
  function glisserTexte(e, el) {
    if (el.getAttribute("contenteditable") === "true" || etat.outil !== "deplacer") return;
    e.stopPropagation(); el.setPointerCapture(e.pointerId); el._drag = true;
    var st = { mx: e.clientX, my: e.clientY, x: el._x || 0, y: el._y || 0 };
    function mv(ev) { var x = st.x + (ev.clientX - st.mx) / etat.zoom, y = st.y + (ev.clientY - st.my) / etat.zoom; el._x = x; el._y = y; el.style.left = x + "px"; el.style.top = y + "px"; }
    function up(ev) { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el._drag = false; try { el.releasePointerCapture(ev.pointerId); } catch (x) {} agir({ op: "deplacerTexte", id: el._id, x: el._x, y: el._y }); }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  }
  function creerNoteLocale(x, y) {
    // note temporaire éditable ; créée côté serveur au blur si non vide
    var el = document.createElement("div"); el.className = "c-texte"; el.style.left = x + "px"; el.style.top = y + "px";
    el.setAttribute("contenteditable", "true"); E.monde.appendChild(el); el.focus();
    el.onblur = function () { var v = el.textContent.trim(); el.remove(); if (v) agir({ op: "creerTexte", x: x, y: y, contenu: v }); };
  }

  /* ---------- Agir (optimiste + envoi) ---------- */
  var envoiEnCours = false, file = [];
  function agir(intention) {
    api("agir", { code: etat.code, jeton: etat.jeton, intention: intention }).then(function (res) {
      if (res.d && res.d.refus && res.d.refus.message) flash(res.d.refus.message);
      if (res.d && res.d.etat) appliquerEtat(res.d.etat);
    }).catch(function () { marquerConnexion(false); });
  }

  /* ---------- Vue locale : zoom / pan / plein écran ---------- */
  function rectScene() { return E.scene.getBoundingClientRect(); }
  function applyView() { E.monde.style.transform = "translate(" + etat.panX + "px," + etat.panY + "px) scale(" + etat.zoom + ")";
    E["z-niv"].textContent = Math.round(etat.zoom * 100) + " %"; E["z-moins"].disabled = etat.zoom <= ZMIN + 1e-4; E["z-plus"].disabled = etat.zoom >= ZMAX - 1e-4; positionnerEditeurs(); }
  function clampPan() { var r = rectScene(), pw = PLAN_W * etat.zoom, ph = PLAN_H * etat.zoom;
    etat.panX = pw <= r.width ? (r.width - pw) / 2 : Math.min(0, Math.max(r.width - pw, etat.panX));
    etat.panY = ph <= r.height ? (r.height - ph) / 2 : Math.min(0, Math.max(r.height - ph, etat.panY)); }
  function centrer() { var r = rectScene(); etat.zoom = 1; etat.panX = (r.width - PLAN_W) / 2; etat.panY = (r.height - PLAN_H) / 2; clampPan(); applyView(); }
  function zoomVers(nz, cx, cy) { var wx = (cx - etat.panX) / etat.zoom, wy = (cy - etat.panY) / etat.zoom; etat.zoom = Math.max(ZMIN, Math.min(ZMAX, nz)); etat.panX = cx - wx * etat.zoom; etat.panY = cy - wy * etat.zoom; clampPan(); applyView(); dessinerFleches(); }
  function toutVoir() { var r = rectScene(); etat.zoom = Math.max(ZMIN, Math.min(r.width / PLAN_W, r.height / PLAN_H)); etat.panX = (r.width - PLAN_W * etat.zoom) / 2; etat.panY = (r.height - PLAN_H * etat.zoom) / 2; clampPan(); applyView(); dessinerFleches(); }
  function rectVisible() { var r = rectScene(); return { x: -etat.panX / etat.zoom, y: -etat.panY / etat.zoom, largeur: r.width / etat.zoom, hauteur: r.height / etat.zoom }; }
  function versMonde(cx, cy) { var r = rectScene(); return { x: (cx - r.left - etat.panX) / etat.zoom, y: (cy - r.top - etat.panY) / etat.zoom }; }

  var pan = null;
  E.scene.addEventListener("pointerdown", function (e) {
    if (e.target !== E.scene && e.target !== E.monde && !e.target.classList.contains("plan-bord") && e.target.id !== "fleches") return;
    if (etat.outil === "texte") { var w = versMonde(e.clientX, e.clientY); creerNoteLocale(w.x, w.y); return; }
    annulerFleche(); deselect();
    pan = { mx: e.clientX, my: e.clientY, px: etat.panX, py: etat.panY }; E.scene.classList.add("grabbing"); E.scene.setPointerCapture(e.pointerId);
  });
  E.scene.addEventListener("pointermove", function (e) { if (!pan) return; etat.panX = pan.px + (e.clientX - pan.mx); etat.panY = pan.py + (e.clientY - pan.my); clampPan(); applyView(); dessinerFleches(); });
  E.scene.addEventListener("pointerup", function (e) { pan = null; E.scene.classList.remove("grabbing"); try { E.scene.releasePointerCapture(e.pointerId); } catch (x) {} });
  E.scene.addEventListener("wheel", function (e) { var plein = document.body.classList.contains("plein"); if (e.ctrlKey || e.metaKey || plein) { e.preventDefault(); var r = rectScene(); zoomVers(etat.zoom * (e.deltaY < 0 ? ZWHEEL : 1 / ZWHEEL), e.clientX - r.left, e.clientY - r.top); } }, { passive: false });

  /* ---------- Barres / boutons ---------- */
  function setOutil(o) { etat.outil = o; document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.outil === o ? "true" : "false"); });
    E.scene.classList.toggle("outil-fleche", o === "fleche" || o === "fleche2"); E.scene.classList.toggle("outil-texte", o === "texte"); annulerFleche();
    flash({ fleche: "Cliquez la carte de départ, puis la carte d'arrivée.", fleche2: "Lien double : départ puis arrivée.", texte: "Cliquez le tableau pour écrire." }[o] || ""); }
  document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.addEventListener("click", function () { setOutil(b.dataset.outil); }); });
  E["z-plus"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  E["z-moins"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  E["z-tout"].addEventListener("click", toutVoir);
  E["btn-plein"].addEventListener("click", function () { document.body.classList.toggle("plein"); setTimeout(function () { clampPan(); applyView(); dessinerFleches(); }, 50); });
  E["btn-distribuer"].addEventListener("click", function () { agir({ op: "distribuer" }); });
  E["btn-passer"].addEventListener("click", function () { agir({ op: "passerAuSuivant" }); });
  E["btn-distribuer-tous"].addEventListener("click", function () { agir({ op: "distribuerATous" }); });
  E["btn-participants"].addEventListener("click", function () { E.panneau.hidden = !E.panneau.hidden; });
  E["fermer-panneau"].addEventListener("click", function () { E.panneau.hidden = true; });
  if (E["btn-vocal"]) E["btn-vocal"].addEventListener("click", function () { agir({ op: "definirLienVocal", url: (E["vocal-url"].value || "").trim() }); });
  E["code-chip"].addEventListener("click", function () { copier(etat.code, E["code-chip"].querySelector(".copier")); });
  E["btn-partager"].addEventListener("click", function () { copier(location.origin + location.pathname + "?s=" + etat.code, null, E["btn-partager"]); });
  function copier(txt, badge, btn) { try { navigator.clipboard.writeText(txt); } catch (e) {}
    if (badge) { var t = badge.textContent; badge.textContent = "copié ✓"; badge.classList.add("copie-ok"); setTimeout(function () { badge.textContent = t; badge.classList.remove("copie-ok"); }, 1500); }
    if (btn) { var b = btn.textContent; btn.textContent = "Lien copié ✓"; setTimeout(function () { btn.textContent = b; }, 1500); } }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (E.modal.classList.contains("on")) return fermerModal(); if (document.body.classList.contains("plein")) { document.body.classList.remove("plein"); setTimeout(function(){clampPan();applyView();dessinerFleches();},50); return; } deselect(); annulerFleche(); }
    if ((e.key === "Delete" || e.key === "Backspace") && etat.sel) {
      if (document.activeElement && (document.activeElement.getAttribute("contenteditable") === "true" || document.activeElement.tagName === "INPUT")) return;
      e.preventDefault();
      if (etat.sel.type === "fleche") agir({ op: "supprimerFleche", id: etat.sel.id });
      else if (etat.sel.type === "carte" && etat.role === "animateur") agir({ op: "retirerCarte", n: etat.sel.n });
      deselect();
    }
  });
  window.addEventListener("resize", function () { clampPan(); applyView(); dessinerFleches(); });

  /* ---------- Modal ---------- */
  function ouvrirModal(n) { var c = etat.cartes[n]; if (!c) return;
    E["mg-img"].src = BASE + (c.image ? c.image.grand : ""); E["mg-num"].textContent = n; E["mg-tit"].textContent = c.titre; E["mg-vtit"].textContent = c.titre;
    E["mg-verso"].innerHTML = ""; (c.verso || []).forEach(function (p) { var el = document.createElement("p"); el.textContent = /\[A COMPLETER\]/i.test(p) ? "Texte à venir." : p; E["mg-verso"].appendChild(el); });
    E["carte-grande"].classList.remove("flip"); E.modal.classList.add("on"); }
  function fermerModal() { E.modal.classList.remove("on"); }
  E["modal-flip"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); });
  E["modal-close"].addEventListener("click", fermerModal);
  E.modal.addEventListener("click", function (e) { if (e.target === E.modal) fermerModal(); });

  /* ---------- utilitaires ---------- */
  function flash(m) { E.aide.textContent = m || ""; if (m) setTimeout(function () { if (E.aide.textContent === m) E.aide.textContent = ""; }, 3000); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
})();
