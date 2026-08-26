/* Tableau de la Fresque des risques de l'IA — prototype JOUABLE EN SOLO.
   Client uniquement, aucun serveur : c'est la base sur laquelle brancher plus
   tard le service de sessions temps reel. Parametres repris du cahier des
   charges (B7) : plan 3200x2200, zoom 0,20-1,60. */
(function () {
  "use strict";

  var BASE = "../../";
  var PLAN_W = 3200, PLAN_H = 2200;
  var ZMIN = 0.20, ZMAX = 1.60, ZSTEP = 1.25, ZWHEEL = 1.06;

  var scene = document.getElementById("scene");
  var monde = document.getElementById("monde");
  var svg = document.getElementById("fleches");
  var mainZone = document.getElementById("main-zone");
  var aide = document.getElementById("aide");
  var zNiv = document.getElementById("z-niv");
  var zMoins = document.getElementById("z-moins");
  var zPlus = document.getElementById("z-plus");

  var etat = {
    cartesData: {},
    pioche: [],
    main: null,               // carte tenue (numero) ou null
    posees: [],               // { n, x, y, el }
    fleches: [],              // { id, de, vers, bidir, libelle }
    textes: [],               // { id, x, y, contenu, el }
    zoom: 1, panX: 0, panY: 0,
    outil: "deplacer",
    molette: false,
    sel: null,                // {type:'carte'|'fleche'|'texte', ref}
    flecheDepart: null,
    seq: 1
  };

  /* ---------- Vue / zoom / pan ---------- */
  function rectScene() { return scene.getBoundingClientRect(); }
  function applyView() {
    monde.style.transform = "translate(" + etat.panX + "px," + etat.panY + "px) scale(" + etat.zoom + ")";
    zNiv.textContent = Math.round(etat.zoom * 100) + " %";
    zMoins.disabled = etat.zoom <= ZMIN + 0.0001;
    zPlus.disabled = etat.zoom >= ZMAX - 0.0001;
    positionnerEditeurs();
  }
  function clampPan() {
    var r = rectScene(), pw = PLAN_W * etat.zoom, ph = PLAN_H * etat.zoom;
    etat.panX = pw <= r.width ? (r.width - pw) / 2 : Math.min(0, Math.max(r.width - pw, etat.panX));
    etat.panY = ph <= r.height ? (r.height - ph) / 2 : Math.min(0, Math.max(r.height - ph, etat.panY));
  }
  function zoomVers(nz, cx, cy) {
    var wx = (cx - etat.panX) / etat.zoom, wy = (cy - etat.panY) / etat.zoom;
    etat.zoom = Math.max(ZMIN, Math.min(ZMAX, nz));
    etat.panX = cx - wx * etat.zoom; etat.panY = cy - wy * etat.zoom;
    clampPan(); applyView(); dessinerFleches();
  }
  function toutVoir() {
    var r = rectScene();
    var nz = Math.max(ZMIN, Math.min(r.width / PLAN_W, r.height / PLAN_H));
    etat.zoom = nz;
    etat.panX = (r.width - PLAN_W * nz) / 2;
    etat.panY = (r.height - PLAN_H * nz) / 2;
    clampPan(); applyView(); dessinerFleches();
  }
  function versMonde(clientX, clientY) {
    var r = rectScene();
    return { x: (clientX - r.left - etat.panX) / etat.zoom, y: (clientY - r.top - etat.panY) / etat.zoom };
  }

  /* ---------- Outils ---------- */
  function setOutil(o) {
    etat.outil = o;
    document.querySelectorAll(".tool[data-outil]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.outil === o ? "true" : "false");
    });
    scene.classList.toggle("outil-fleche", o === "fleche" || o === "fleche2");
    scene.classList.toggle("outil-texte", o === "texte");
    annulerFlecheEnCours();
    var msg = { deplacer: "", fleche: "Cliquez la carte de départ, puis la carte d'arrivée.",
      fleche2: "Flèche double : cliquez départ puis arrivée.", texte: "Cliquez le tableau pour écrire." };
    aide.textContent = msg[o] || "";
  }

  /* ---------- Pioche / main (solo) ---------- */
  function piocher() {
    if (!etat.pioche.length) return;
    if (etat.main != null) { flash("Posez d'abord la carte que vous tenez."); return; }
    etat.main = etat.pioche.shift();
    majPiocheInfo(); rendreMain();
  }
  function semer(k) {
    var r = rectScene();
    for (var i = 0; i < k && etat.pioche.length; i++) {
      var n = etat.pioche.shift();
      var wx = (r.width * (0.25 + Math.random() * 0.5) - etat.panX) / etat.zoom;
      var wy = (r.height * (0.25 + Math.random() * 0.5) - etat.panY) / etat.zoom;
      poser(n, wx, wy);
    }
    majPiocheInfo();
  }
  function majPiocheInfo() {
    document.getElementById("pioche-n").textContent = etat.pioche.length;
    document.getElementById("btn-piocher").disabled = etat.pioche.length === 0;
    document.getElementById("btn-distribuer-tout").disabled = etat.pioche.length === 0;
  }
  function rendreMain() {
    mainZone.innerHTML = "";
    if (etat.main == null) return;
    var c = etat.cartesData[etat.main];
    var d = document.createElement("div");
    d.className = "main-carte";
    d.innerHTML = '<div class="vis"><img alt="" src="' + (c.image ? BASE + c.image.vignette : "") + '"><span class="num">' + c.n + '</span></div>'
      + '<div class="tit">' + echap(c.titre) + '</div>'
      + '<div class="actions"><button class="btn orange" data-a="poser">Poser</button><button class="btn" data-a="voir">⤢</button></div>';
    d.querySelector('[data-a="poser"]').addEventListener("click", function () {
      var r = rectScene();
      poser(etat.main, (r.width / 2 - etat.panX) / etat.zoom, (r.height / 2 - etat.panY) / etat.zoom);
      etat.main = null; rendreMain();
    });
    d.querySelector('[data-a="voir"]').addEventListener("click", function () { ouvrirModal(etat.main); });
    mainZone.appendChild(d);
  }

  /* ---------- Cartes posees ---------- */
  function poser(n, x, y) {
    if (etat.posees.some(function (p) { return p.n === n; })) return;
    var pos = placeLibre(x, y);
    var c = etat.cartesData[n];
    var el = document.createElement("div");
    el.className = "c-carte pose-anim";
    el.style.left = pos.x + "px"; el.style.top = pos.y + "px";
    el.innerHTML = '<div class="vis"><img alt="" loading="lazy" src="' + (c.image ? BASE + c.image.vignette : "") + '"><span class="num">' + c.n + '</span>'
      + '<button class="agr" title="Agrandir" aria-label="Agrandir la carte">⤢</button></div>'
      + '<div class="tit">' + echap(c.titre) + '</div>';
    var rec = { n: n, x: pos.x, y: pos.y, el: el };
    el.querySelector(".agr").addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(n); });
    rendreGlissable(el, rec);
    el.addEventListener("click", function (e) {
      if (etat.outil === "fleche" || etat.outil === "fleche2") { e.stopPropagation(); clicFleche(rec); }
    });
    monde.appendChild(el);
    etat.posees.push(rec);
    setTimeout(function () { el.classList.remove("pose-anim"); }, 750);
    dessinerFleches();
  }
  function placeLibre(x, y) {
    var w = 160, h = 150, pas = 186;
    function libre(px, py) {
      return !etat.posees.some(function (p) {
        return Math.abs(p.x - px) < w && Math.abs(p.y - py) < h;
      });
    }
    x = Math.max(0, Math.min(PLAN_W - w, x - w / 2));
    y = Math.max(0, Math.min(PLAN_H - h, y - h / 2));
    if (libre(x, y)) return { x: x, y: y };
    for (var ring = 1; ring < 12; ring++)
      for (var dx = -ring; dx <= ring; dx++)
        for (var dy = -ring; dy <= ring; dy++) {
          var px = x + dx * pas, py = y + dy * pas;
          if (px >= 0 && py >= 0 && px < PLAN_W - w && py < PLAN_H - h && libre(px, py)) return { x: px, y: py };
        }
    return { x: x, y: y };
  }
  function retirerCarte(rec) {
    rec.el.remove();
    etat.posees = etat.posees.filter(function (p) { return p !== rec; });
    etat.fleches = etat.fleches.filter(function (f) { return f.de !== rec.n && f.vers !== rec.n; });
    dessinerFleches();
  }

  /* ---------- Glisser (cartes) ---------- */
  function rendreGlissable(el, rec) {
    var start = null;
    el.addEventListener("pointerdown", function (e) {
      if (etat.outil !== "deplacer") return;
      if (e.target.closest(".agr")) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      start = { mx: e.clientX, my: e.clientY, x: rec.x, y: rec.y, moved: false };
    });
    el.addEventListener("pointermove", function (e) {
      if (!start) return;
      var dx = (e.clientX - start.mx) / etat.zoom, dy = (e.clientY - start.my) / etat.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) start.moved = true;
      rec.x = Math.max(0, Math.min(PLAN_W - el.offsetWidth, start.x + dx));
      rec.y = Math.max(0, Math.min(PLAN_H - el.offsetHeight, start.y + dy));
      el.style.left = rec.x + "px"; el.style.top = rec.y + "px";
      dessinerFleches();
    });
    el.addEventListener("pointerup", function (e) {
      if (start) { el.style.cursor = "grab"; try { el.releasePointerCapture(e.pointerId); } catch (x) {} }
      start = null;
    });
  }

  /* ---------- Fleches ---------- */
  function clicFleche(rec) {
    if (!etat.flecheDepart) {
      etat.flecheDepart = rec; rec.el.classList.add("depart");
      aide.textContent = "Cliquez maintenant la carte d'arrivée.";
    } else if (etat.flecheDepart === rec) {
      annulerFlecheEnCours();
    } else {
      etat.fleches.push({ id: etat.seq++, de: etat.flecheDepart.n, vers: rec.n, bidir: etat.outil === "fleche2", libelle: "" });
      annulerFlecheEnCours(); dessinerFleches();
    }
  }
  function annulerFlecheEnCours() {
    if (etat.flecheDepart) etat.flecheDepart.el.classList.remove("depart");
    etat.flecheDepart = null;
  }
  function centre(n) {
    var p = etat.posees.find(function (q) { return q.n === n; });
    if (!p) return null;
    return { x: p.x + p.el.offsetWidth / 2, y: p.y + p.el.offsetHeight / 2, w: p.el.offsetWidth, h: p.el.offsetHeight };
  }
  function bord(c, tx, ty) {
    var dx = tx - c.x, dy = ty - c.y; if (!dx && !dy) return { x: c.x, y: c.y };
    var hw = c.w / 2 + 4, hh = c.h / 2 + 4;
    var s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  function dessinerFleches() {
    var defs = '<defs>'
      + '<marker id="ah" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#EDE8DC"/></marker>'
      + '<marker id="aho" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#F7931D"/></marker>'
      + '<marker id="ahs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M11,0 L0,4.5 L11,9 z" fill="#EDE8DC"/></marker>'
      + '</defs>';
    var html = defs;
    var paires = {};
    etat.fleches.forEach(function (f) {
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers);
      paires[cle] = (paires[cle] || 0);
    });
    var idx = {};
    etat.fleches.forEach(function (f) {
      var A = centre(f.de), B = centre(f.vers); if (!A || !B) return;
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers);
      idx[cle] = (idx[cle] || 0); var k = idx[cle]++;
      var pa = bord(A, B.x, B.y), pb = bord(B, A.x, A.y);
      var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      var dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      var amp = Math.min(20, len * 0.09) * (k % 2 === 0 ? 1 : -1) * (1 + Math.floor(k / 2));
      var nx = -dy / len, ny = dx / len;
      var cxp = mx + nx * amp, cyp = my + ny * amp;
      var d = "M" + pa.x + "," + pa.y + " Q" + cxp + "," + cyp + " " + pb.x + "," + pb.y;
      var sel = etat.sel && etat.sel.type === "fleche" && etat.sel.ref === f;
      html += '<path class="hit" data-id="' + f.id + '" d="' + d + '"/>';
      html += '<path class="trait' + (sel ? ' sel' : '') + '" d="' + d + '" marker-end="url(#' + (sel ? 'aho' : 'ah') + ')"'
        + (f.bidir ? ' marker-start="url(#ahs)"' : '') + '/>';
      if (f.libelle) {
        var lx = mx + nx * amp * 0.6, ly = my + ny * amp * 0.6;
        html += '<text class="lib" x="' + lx + '" y="' + ly + '" text-anchor="middle">' + echap(f.libelle) + '</text>';
      }
      f._mid = { x: cxp, y: cyp };
    });
    svg.innerHTML = html;
    svg.querySelectorAll(".hit").forEach(function (h) {
      h.addEventListener("click", function (e) {
        e.stopPropagation();
        var f = etat.fleches.find(function (x) { return x.id == h.dataset.id; });
        selectionner("fleche", f);
      });
    });
    positionnerEditeurs();
  }

  /* ---------- Textes ---------- */
  function creerTexte(x, y, focus) {
    var el = document.createElement("div");
    el.className = "c-texte";
    el.style.left = x + "px"; el.style.top = y + "px";
    var rec = { id: etat.seq++, x: x, y: y, contenu: "", el: el };
    el.addEventListener("pointerdown", function (e) { dragTexte(e, el, rec); });
    el.addEventListener("click", function (e) { e.stopPropagation(); editerTexte(rec); });
    el.addEventListener("blur", function () {
      rec.contenu = el.textContent.trim();
      el.removeAttribute("contenteditable");
      if (!rec.contenu) supprimerTexte(rec);
    });
    monde.appendChild(el);
    etat.textes.push(rec);
    if (focus) setTimeout(function () { editerTexte(rec); }, 0);
    return rec;
  }
  function editerTexte(rec) {
    selectionner("texte", rec);
    rec.el.setAttribute("contenteditable", "true");
    rec.el.focus();
    var sel = window.getSelection(), rng = document.createRange();
    rng.selectNodeContents(rec.el); rng.collapse(false); sel.removeAllRanges(); sel.addRange(rng);
  }
  function dragTexte(e, el, rec) {
    if (el.getAttribute("contenteditable") === "true") return;
    if (etat.outil !== "deplacer") return;
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    var start = { mx: e.clientX, my: e.clientY, x: rec.x, y: rec.y };
    function mv(ev) {
      var dx = (ev.clientX - start.mx) / etat.zoom, dy = (ev.clientY - start.my) / etat.zoom;
      rec.x = start.x + dx; rec.y = start.y + dy;
      el.style.left = rec.x + "px"; el.style.top = rec.y + "px"; positionnerEditeurs();
    }
    function up(ev) { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); try { el.releasePointerCapture(ev.pointerId); } catch (x) {} }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  }
  function supprimerTexte(rec) {
    rec.el.remove();
    etat.textes = etat.textes.filter(function (t) { return t !== rec; });
    if (etat.sel && etat.sel.ref === rec) etat.sel = null;
    positionnerEditeurs();
  }

  /* ---------- Selection + editeurs flottants (croix / libelle) ---------- */
  var croixFleche = null, editLib = null, croixTexte = null;
  function selectionner(type, ref) {
    deselect();
    etat.sel = { type: type, ref: ref };
    if (type === "fleche") { dessinerFleches(); construireEditeurFleche(ref); }
    if (type === "texte") { ref.el.classList.add("sel"); construireCroixTexte(ref); }
    if (type === "carte") { ref.el.classList.add("sel"); }
  }
  function deselect() {
    if (etat.sel) {
      if (etat.sel.type === "carte" || etat.sel.type === "texte") etat.sel.ref.el.classList.remove("sel");
    }
    etat.sel = null;
    [croixFleche, editLib, croixTexte].forEach(function (n) { if (n) n.remove(); });
    croixFleche = editLib = croixTexte = null;
    dessinerFleches();
  }
  function construireEditeurFleche(f) {
    editLib = document.createElement("input");
    editLib.type = "text"; editLib.maxLength = 40; editLib.value = f.libelle;
    editLib.placeholder = "libellé…";
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-craie);font-size:1rem;border:1px solid #000;border-radius:6px;padding:.2rem .4rem;background:#1B2420;color:#EDE8DC;width:9rem";
    editLib.addEventListener("input", function () { f.libelle = editLib.value; dessinerFleches(); });
    scene.appendChild(editLib);
    croixFleche = document.createElement("button");
    croixFleche.className = "fleche-croix"; croixFleche.textContent = "✕"; croixFleche.title = "Supprimer la flèche";
    croixFleche.addEventListener("click", function () {
      etat.fleches = etat.fleches.filter(function (x) { return x !== f; }); deselect(); dessinerFleches();
    });
    scene.appendChild(croixFleche);
    positionnerEditeurs();
  }
  function construireCroixTexte(rec) {
    croixTexte = document.createElement("button");
    croixTexte.className = "texte-croix"; croixTexte.textContent = "✕"; croixTexte.title = "Supprimer le texte";
    croixTexte.addEventListener("click", function () { supprimerTexte(rec); });
    scene.appendChild(croixTexte);
    positionnerEditeurs();
  }
  function ecranDepuisMonde(x, y) {
    var r = rectScene();
    return { x: r.left + etat.panX + x * etat.zoom - r.left, y: etat.panY + y * etat.zoom };
  }
  function positionnerEditeurs() {
    if (etat.sel && etat.sel.type === "fleche" && etat.sel.ref._mid) {
      var m = etat.sel.ref._mid;
      var p = { x: etat.panX + m.x * etat.zoom, y: etat.panY + m.y * etat.zoom };
      if (croixFleche) { croixFleche.style.left = p.x + "px"; croixFleche.style.top = (p.y - 16) + "px"; }
      if (editLib) { editLib.style.left = (p.x + 14) + "px"; editLib.style.top = (p.y - 14) + "px"; }
    }
    if (etat.sel && etat.sel.type === "texte" && croixTexte) {
      var rec = etat.sel.ref;
      var px = etat.panX + rec.x * etat.zoom, py = etat.panY + (rec.y + rec.el.offsetHeight) * etat.zoom;
      croixTexte.style.left = (px + 8) + "px"; croixTexte.style.top = (py + 8) + "px";
    }
  }

  /* ---------- Scene : clic + pan + molette ---------- */
  var panning = null;
  scene.addEventListener("pointerdown", function (e) {
    if (e.target !== scene && e.target !== monde && !e.target.classList.contains("plan-bord") && e.target.id !== "fleches") return;
    if (etat.outil === "texte") {
      e.preventDefault();
      var w = versMonde(e.clientX, e.clientY); creerTexte(w.x, w.y, true); return;
    }
    if (etat.outil === "fleche" || etat.outil === "fleche2") { annulerFlecheEnCours(); }
    deselect();
    panning = { mx: e.clientX, my: e.clientY, px: etat.panX, py: etat.panY };
    scene.classList.add("grabbing"); scene.setPointerCapture(e.pointerId);
  });
  scene.addEventListener("pointermove", function (e) {
    if (!panning) return;
    etat.panX = panning.px + (e.clientX - panning.mx);
    etat.panY = panning.py + (e.clientY - panning.my);
    clampPan(); applyView(); dessinerFleches();
  });
  scene.addEventListener("pointerup", function (e) { panning = null; scene.classList.remove("grabbing"); try { scene.releasePointerCapture(e.pointerId); } catch (x) {} });
  scene.addEventListener("wheel", function (e) {
    var plein = document.body.classList.contains("plein");
    if (etat.molette || e.ctrlKey || e.metaKey || plein) {
      e.preventDefault();
      var r = rectScene();
      zoomVers(etat.zoom * (e.deltaY < 0 ? ZWHEEL : 1 / ZWHEEL), e.clientX - r.left, e.clientY - r.top);
    }
  }, { passive: false });

  /* ---------- Modal ---------- */
  var modal = document.getElementById("modal"), grande = document.getElementById("carte-grande");
  function ouvrirModal(n) {
    var c = etat.cartesData[n];
    document.getElementById("mg-img").src = c.image ? BASE + c.image.grand : "";
    document.getElementById("mg-num").textContent = c.n;
    document.getElementById("mg-tit").textContent = c.titre;
    document.getElementById("mg-vtit").textContent = c.titre;
    var v = document.getElementById("mg-verso"); v.innerHTML = "";
    (c.verso || []).forEach(function (p) { var el = document.createElement("p"); el.textContent = /\[A COMPLETER\]/i.test(p) ? "Texte à venir." : p; v.appendChild(el); });
    grande.classList.remove("flip"); modal.classList.add("on");
  }
  document.getElementById("modal-flip").addEventListener("click", function () { grande.classList.toggle("flip"); });
  document.getElementById("modal-close").addEventListener("click", fermerModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) fermerModal(); });
  function fermerModal() { modal.classList.remove("on"); }

  /* ---------- Plein ecran (classe CSS, B7.4) ---------- */
  document.getElementById("btn-plein").addEventListener("click", function () {
    document.body.classList.toggle("plein");
    setTimeout(function () { clampPan(); applyView(); dessinerFleches(); }, 50);
  });

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (modal.classList.contains("on")) { fermerModal(); return; }
      if (document.body.classList.contains("plein")) { document.body.classList.remove("plein"); setTimeout(function(){clampPan();applyView();dessinerFleches();},50); return; }
      deselect(); annulerFlecheEnCours();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && etat.sel) {
      var edit = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("contenteditable") === "true";
      if (edit || document.activeElement.tagName === "INPUT") return;
      e.preventDefault();
      if (etat.sel.type === "fleche") { etat.fleches = etat.fleches.filter(function (x) { return x !== etat.sel.ref; }); deselect(); }
      else if (etat.sel.type === "texte") supprimerTexte(etat.sel.ref);
      else if (etat.sel.type === "carte") retirerCarte(etat.sel.ref);
      dessinerFleches();
    }
  });

  /* ---------- Barres ---------- */
  document.querySelectorAll(".tool[data-outil]").forEach(function (b) {
    b.addEventListener("click", function () { setOutil(b.dataset.outil); });
  });
  zPlus.addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  zMoins.addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  document.getElementById("z-tout").addEventListener("click", toutVoir);
  document.getElementById("z-molette").addEventListener("click", function () {
    etat.molette = !etat.molette; this.setAttribute("aria-pressed", etat.molette ? "true" : "false");
  });
  document.getElementById("btn-piocher").addEventListener("click", piocher);
  document.getElementById("btn-distribuer-tout").addEventListener("click", function () { semer(6); });
  window.addEventListener("resize", function () { clampPan(); applyView(); dessinerFleches(); });

  function flash(msg) { aide.textContent = msg; setTimeout(function () { if (aide.textContent === msg) aide.textContent = ""; }, 2500); }
  function echap(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  /* ---------- Init ---------- */
  fetch("../../data/cartes.json").then(function (r) { return r.json(); }).then(function (data) {
    data.cartes.forEach(function (c) { etat.cartesData[c.n] = c; });
    var c0 = etat.cartesData[0];
    if (c0) document.getElementById("carte0-txt").textContent = (c0.verso || []).join("  ");
    etat.pioche = data.cartes.filter(function (c) { return !c.intro; }).map(function (c) { return c.n; }).sort(function (a, b) { return a - b; });
    majPiocheInfo();
    applyView();
    // quelques cartes de depart pour la demo
    semer(5);
    setOutil("deplacer");
  }).catch(function () { aide.textContent = "Impossible de charger les cartes."; });
})();
