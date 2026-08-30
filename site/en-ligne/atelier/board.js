/* Tableau de la Fresque des risques de l'IA - prototype JOUABLE EN SOLO.
   Client uniquement, aucun serveur : c'est la base sur laquelle brancher plus
   tard le service de sessions temps reel. Parametres repris du cahier des
   charges (B7) : plan 3200x2200, zoom 0,20-1,60. */
(function () {
  "use strict";

  /* ---------- Theme clair / sombre ----------
     Par defaut on suit la preference systeme (gere par la CSS). Si l'internaute
     a choisi un theme sur le site (meme cle localStorage "theme"), on l'applique. */
  try {
    var pref = localStorage.getItem("theme");
    if (pref === "dark" || pref === "light") document.documentElement.setAttribute("data-theme", pref);
  } catch (e) {}

  /* ---------- Langue (via ?lang=en) ---------- */
  var LANG = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "fr";
  document.documentElement.lang = LANG;
  var S = LANG === "en" ? {
    flecheDepart: "Click the source card, then the target card.",
    flecheDouble: "Double arrow: click source then target.",
    texteClic: "Click the board to write.",
    posezDabord: "Place the card you're holding first.",
    cliquezArrivee: "Now click the target card.",
    poser: "Place", glisserPoser: "Drag onto the board",
    libelle: "label…",
    suppFleche: "Delete the arrow", sensDouble: "Two-way link",
    suppTexte: "Delete the note",
    agrandir: "Enlarge", agrandirCarte: "Enlarge the card",
    texteAVenir: "Text coming soon.",
    initFlash: "Draw a card, then connect the cards together.",
    erreurCartes: "Unable to load the cards.",
    coachTitre: "How to play", coachFermer: "Got it",
    coachPiocher: "To start: click “Draw a card” to draw a card.",
    coachPoser: "Click “Place” (or drag the card) to put it on the board.",
    coachRelier: "To connect two cards: pick the “Link →” tool, then click one card and another.",
    coachContinuer: "Keep going: draw more cards and connect them to build the fresco."
  } : {
    flecheDepart: "Cliquez la carte de départ, puis la carte d'arrivée.",
    flecheDouble: "Flèche double : cliquez départ puis arrivée.",
    texteClic: "Cliquez le tableau pour écrire.",
    posezDabord: "Posez d'abord la carte que vous tenez.",
    cliquezArrivee: "Cliquez maintenant la carte d'arrivée.",
    poser: "Poser", glisserPoser: "Glissez sur le tableau",
    libelle: "libellé…",
    suppFleche: "Supprimer la flèche", sensDouble: "Lien à double sens",
    suppTexte: "Supprimer le texte",
    agrandir: "Agrandir", agrandirCarte: "Agrandir la carte",
    texteAVenir: "Texte à venir.",
    initFlash: "Piochez une carte, puis reliez les cartes entre elles.",
    erreurCartes: "Impossible de charger les cartes.",
    coachTitre: "Comment jouer", coachFermer: "Compris",
    coachPiocher: "Pour commencer : cliquez « Piocher une carte » pour tirer une carte.",
    coachPoser: "Cliquez « Poser » (ou glissez la carte) pour la placer sur le tableau.",
    coachRelier: "Pour relier deux cartes : outil « Lien → », puis cliquez une carte et une autre.",
    coachContinuer: "Continuez : piochez d'autres cartes et reliez-les pour construire la fresque."
  };

  // Traduction du texte statique de la page (seulement en anglais).
  function traduireStatique() {
    if (LANG !== "en") return;
    document.title = "Workshop board (demo) · The AI Risks Collage";
    var t = [
      [".marque", null, null], // logo texte géré à part
      ["#btn-piocher", "Draw a card"], ["#btn-recommencer", "Restart"],
      ['.tool[data-outil="fleche"]', "Link"],
      ["#z-tout", "Fit all"],
      ["#btn-plein", "Fullscreen"], ["#aide-titre", "How to play"],
      ["#modal-flip", "Flip"], ["#modal-close", "Close ✕"]
    ];
    t.forEach(function (r) { if (!r[1]) return; var el = document.querySelector(r[0]); if (el) el.textContent = r[1]; });
    var set = function (sel, attr, val) { var el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set("#z-moins", "aria-label", "Zoom out"); set("#z-plus", "aria-label", "Zoom in");
    set("#modal-close", "aria-label", "Close");
    // logo : garder le pictogramme, changer le libellé
    var marque = document.querySelector(".marque");
    if (marque) { marque.childNodes[marque.childNodes.length - 1].nodeValue = " The AI Risks Collage"; }
    // compteur « Pioche : »
    var compte = document.querySelector(".compte");
    if (compte && compte.firstChild) compte.firstChild.nodeValue = "Deck: ";
    // ecran d'accueil (objectif)
    var iT = document.getElementById("intro-titre"); if (iT) iT.textContent = "Rebuild the map of AI risks";
    var iB = document.querySelector(".intro-but"); if (iB) iB.textContent = "The goal: connect the 38 cards to build, step by step, a big-picture view — how AI works, what it can do, its risks, and the possible responses.";
    var iE = document.querySelector(".intro-etapes"); if (iE) iE.innerHTML =
      '<li><b>Draw</b> a card: they come in order, in lots (1 · how it works → 2 · capabilities → 3 · risks → 4 · major risks → 5 · responses).</li>'
      + '<li><b>Place</b> it on the board (the "Place" button or drag), then draw the next one.</li>'
      + '<li><b>Link</b> the cards: the "Link" tool, then click a source card and a target card. An arrow means "this leads to that".</li>';
    var iN = document.querySelector(".intro-note"); if (iN) iN.textContent = 'There is no single "correct" collage: the point is to build links that make sense to you. Stuck? Enlarge a card (⤢) to read its explanation. This workshop is usually run with a facilitator; the "?" at the top recalls everything anytime.';
    var iOk = document.getElementById("intro-ok"); if (iOk) iOk.textContent = "Start";
    var iRe = document.getElementById("revoir-objectif"); if (iRe) iRe.textContent = "Review the goal";
    // panneau d'aide (liste)
    var aideBtn = document.querySelector("#btn-aide"); if (aideBtn) aideBtn.setAttribute("aria-label", "Help");
    var liste = document.querySelector("#aide-liste");
    if (liste) liste.innerHTML =
      '<li><b>Move:</b> drag a card to move it; drag an empty area to pan the board.</li>'
      + '<li><b>Cards:</b> "Draw a card" then "Place". The ⤢ button opens it large and lets you flip it.</li>'
      + '<li><b>Links:</b> click "Link", then the source card and the target. Select an arrow to label it, delete it, or make it two-way (↔).</li>'
      + '<li><b>Notes:</b> double-click an empty area of the board. Drag to move, click to edit; empty, it disappears.</li>'
      + '<li><b>Zoom:</b> mouse wheel, + / − buttons, or "Fit all" to reframe.</li>';
    // avis mobile
    var mh = document.querySelector("#mobile-avis h1"); if (mh) mh.textContent = "The board is designed for a computer";
    var mp = document.querySelector("#mobile-avis p");
    if (mp) mp.innerHTML = 'This interactive workshop is meant for a computer screen. Open it on a computer, or <a href="../">download the cards</a> to run it in person.';
  }

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

  /* ---------- Lots (paliers) ---------- */
  var LOTS = {
    1: { fr: "Comment fonctionne l'IA", en: "How AI works" },
    2: { fr: "Ce que l'IA sait faire", en: "What AI can do" },
    3: { fr: "Les risques", en: "Risks" },
    4: { fr: "Risques majeurs et perte de contrôle", en: "Major risks & loss of control" },
    5: { fr: "Les réponses possibles", en: "Possible responses" }
  };
  function nomLot(l) { var e = LOTS[l]; return e ? (LANG === "en" ? e.en : e.fr) : ""; }
  function lotCourant() {
    if (etat.pioche.length) return etat.cartesData[etat.pioche[0]].lot;
    if (etat.main != null) return etat.cartesData[etat.main].lot;
    return 5;
  }

  /* ---------- Sauvegarde locale (reprise apres refresh) ---------- */
  var CLE_SAUV = "fresque-solo";
  function sauver() {
    try {
      localStorage.setItem(CLE_SAUV, JSON.stringify({
        pioche: etat.pioche.slice(), main: etat.main, seq: etat.seq,
        posees: etat.posees.map(function (p) { return { n: p.n, x: p.x, y: p.y }; }),
        fleches: etat.fleches.map(function (f) { return { id: f.id, de: f.de, vers: f.vers, bidir: !!f.bidir, libelle: f.libelle || "" }; }),
        textes: etat.textes.map(function (t) { return { id: t.id, x: t.x, y: t.y, contenu: t.contenu }; })
      }));
    } catch (e) {}
  }
  function chargerSauv() { try { return JSON.parse(localStorage.getItem(CLE_SAUV) || "null"); } catch (e) { return null; } }
  function effacerSauv() { try { localStorage.removeItem(CLE_SAUV); } catch (e) {} }

  /* ---------- Vue / zoom / pan ---------- */
  function rectScene() { return scene.getBoundingClientRect(); }
  function applyView() {
    monde.style.transform = "translate(" + etat.panX + "px," + etat.panY + "px) scale(" + etat.zoom + ")";
    // Niveau de detail : quand on dezoome, les titres deviennent illisibles.
    // On expose l'inverse du zoom (--iz) pour garder le numero a taille lisible
    // a l'ecran, et on bascule en vue simplifiee (numero + couleur de lot).
    monde.style.setProperty("--iz", (1 / etat.zoom).toFixed(3));
    monde.classList.toggle("loin", etat.zoom < 0.5);
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
    scene.classList.toggle("outil-fleche", o === "fleche");
    annulerFlecheEnCours();
    aide.textContent = o === "fleche" ? S.flecheDepart : "";
  }

  /* ---------- Pioche / main (solo) ---------- */
  function piocher() {
    if (!etat.pioche.length) return;
    if (etat.main != null) { flash(S.posezDabord); return; }
    etat.main = etat.pioche.shift();
    majPiocheInfo(); rendreMain(); majCoach(); sauver();
  }
  function semer(k) {
    var r = rectScene();
    for (var i = 0; i < k && etat.pioche.length; i++) {
      var n = etat.pioche.shift();
      var wx = (r.width * (0.25 + Math.random() * 0.5) - etat.panX) / etat.zoom;
      var wy = (r.height * (0.25 + Math.random() * 0.5) - etat.panY) / etat.zoom;
      poser(n, wx, wy);
    }
    majPiocheInfo(); majCoach();
  }
  function majPiocheInfo() {
    var pio = document.getElementById("btn-piocher"); if (pio) pio.disabled = etat.pioche.length === 0;
    var li = document.getElementById("lot-info");
    if (li) {
      if (etat.pioche.length === 0 && etat.main == null) li.textContent = LANG === "en" ? "All cards drawn" : "Toutes les cartes piochées";
      else { var l = lotCourant(); li.textContent = (LANG === "en" ? "Lot " : "Lot ") + l + "/5 · " + nomLot(l); }
    }
    var exp = document.getElementById("btn-export");
    if (exp) exp.hidden = !(etat.pioche.length === 0 && etat.main == null && etat.posees.length > 0);
  }
  function rendreMain() {
    mainZone.innerHTML = "";
    if (etat.main == null) return;
    var c = etat.cartesData[etat.main];
    var d = document.createElement("div");
    d.className = "main-carte a-poser";
    d.innerHTML = '<div class="vis"><img alt="" src="' + (c.image ? BASE + c.image.vignette : "") + '"><span class="num">' + c.n + '</span>'
      + '<button class="agr" data-a="voir" aria-label="' + S.agrandirCarte + '" title="' + S.agrandir + '">⤢</button></div>'
      + '<div class="tit">' + echap(c.titre) + '</div>'
      + '<div class="actions"><button class="btn primaire" data-a="poser">' + S.poser + '</button></div>';
    d.querySelector('[data-a="poser"]').addEventListener("click", function (e) { e.stopPropagation(); poserMain(); });
    d.querySelector('[data-a="voir"]').addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(etat.main); });
    activerGlisserMain(d);
    mainZone.appendChild(d);
  }
  // La carte tenue est glissable directement sur le tableau (en plus du bouton Poser).
  // Ecoute au niveau document : le relachement est capte ou que soit le curseur.
  function activerGlisserMain(d) {
    d.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || etat.main == null || e.target.closest("button")) return;
      var x0 = e.clientX, y0 = e.clientY, bougé = false;
      function mv(ev) {
        if (!bougé && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 6) {
          bougé = true; d.classList.add("glisse"); d.classList.remove("a-poser");
        }
        if (bougé) { d.style.left = (ev.clientX - d.offsetWidth / 2) + "px"; d.style.top = (ev.clientY - 24) + "px"; }
      }
      function up(ev) {
        document.removeEventListener("pointermove", mv, true);
        document.removeEventListener("pointerup", up, true);
        if (!bougé) return;                                 // simple clic : géré par les boutons
        var r = rectScene();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          var w = versMonde(ev.clientX, ev.clientY);
          poser(etat.main, w.x, w.y); etat.main = null; rendreMain(); majCoach();
        } else { rendreMain(); }                            // relâché hors du tableau : reste en main
      }
      document.addEventListener("pointermove", mv, true);
      document.addEventListener("pointerup", up, true);
    });
  }
  // Pose la carte tenue au centre visible (repli depuis la fenêtre agrandie).
  function poserMain() {
    if (etat.main == null) return;
    var r = rectScene();
    poser(etat.main, (r.width / 2 - etat.panX) / etat.zoom, (r.height / 2 - etat.panY) / etat.zoom);
    etat.main = null; rendreMain(); majCoach();
  }
  function recommencer() {
    etat.posees.forEach(function (p) { p.el.remove(); });
    etat.textes.forEach(function (t) { t.el.remove(); });
    etat.posees = []; etat.fleches = []; etat.textes = []; etat.main = null; etat.sel = null; etat.seq = 1;
    etat.pioche = Object.keys(etat.cartesData).map(Number).filter(function (n) { return !etat.cartesData[n].intro; }).sort(function (a, b) { return a - b; });
    effacerSauv();
    dessinerFleches(); rendreMain(); majPiocheInfo(); majCoach();
  }

  /* ---------- Coach pas a pas : montre toujours l'action suivante --------- */
  var coachOff = false;
  try { coachOff = localStorage.getItem("coach-off") === "1"; } catch (e) {}
  var coach = document.createElement("div");
  coach.className = "coach"; coach.hidden = true;
  coach.innerHTML = '<span class="coach-txt"></span>' +
    '<button type="button" class="coach-x">' + echap(S.coachFermer) + '</button>';
  scene.appendChild(coach);
  coach.querySelector(".coach-x").addEventListener("click", function () {
    coachOff = true; try { localStorage.setItem("coach-off", "1"); } catch (e) {}
    majCoach();
  });
  function etapeCoach() {
    if (etat.main != null) return "poser";
    if (etat.posees.length === 0) return "piocher";
    if (etat.fleches.length === 0 && etat.posees.length >= 2) return "relier";
    if (etat.fleches.length === 0) return "continuer";
    return null; // au moins un lien cree : l'utilisateur a saisi le principe
  }
  function majCoach() {
    var e = coachOff ? null : etapeCoach();
    if (!e) { coach.hidden = true; return; }
    var txt = e === "poser" ? S.coachPoser : e === "piocher" ? S.coachPiocher
            : e === "relier" ? S.coachRelier : S.coachContinuer;
    coach.querySelector(".coach-txt").textContent = txt;
    coach.setAttribute("data-etape", e);
    coach.hidden = false;
  }

  /* ---------- Cartes posees ---------- */
  function poser(n, x, y, exact) {
    if (etat.posees.some(function (p) { return p.n === n; })) return;
    var pos = exact ? { x: x, y: y } : placeLibre(x, y);
    var c = etat.cartesData[n];
    var el = document.createElement("div");
    el.className = "c-carte pose-anim";
    if (c.lot != null) el.setAttribute("data-lot", c.lot);
    el.style.left = pos.x + "px"; el.style.top = pos.y + "px";
    el.innerHTML = '<div class="vis"><img alt="" loading="lazy" src="' + (c.image ? BASE + c.image.vignette : "") + '"><span class="num">' + c.n + '</span>'
      + '<button class="agr" title="'+S.agrandir+'" aria-label="'+S.agrandirCarte+'">⤢</button></div>'
      + '<div class="tit">' + echap(c.titre) + '</div>';
    var rec = { n: n, x: pos.x, y: pos.y, el: el };
    el.querySelector(".agr").addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(n); });
    rendreGlissable(el, rec);
    el.addEventListener("click", function (e) {
      if (etat.outil === "fleche") { e.stopPropagation(); clicFleche(rec); }
    });
    monde.appendChild(el);
    etat.posees.push(rec);
    setTimeout(function () { el.classList.remove("pose-anim"); }, 750);
    dessinerFleches(); majPiocheInfo(); majCoach(); sauver();
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
    dessinerFleches(); majPiocheInfo();
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
      if (start) { el.style.cursor = "grab"; try { el.releasePointerCapture(e.pointerId); } catch (x) {} if (start.moved) sauver(); }
      start = null;
    });
  }

  /* ---------- Fleches ---------- */
  function clicFleche(rec) {
    if (!etat.flecheDepart) {
      etat.flecheDepart = rec; rec.el.classList.add("depart");
      aide.textContent = S.cliquezArrivee;
    } else if (etat.flecheDepart === rec) {
      annulerFlecheEnCours();
    } else {
      etat.fleches.push({ id: etat.seq++, de: etat.flecheDepart.n, vers: rec.n, bidir: false, libelle: "" });
      annulerFlecheEnCours(); dessinerFleches(); majCoach(); sauver();
      setOutil("deplacer"); // on repasse en deplacement apres chaque lien
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
      + '<marker id="ahb" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#F0A860"/></marker>'
      + '<marker id="ahbs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M11,0 L0,4.5 L11,9 z" fill="#F0A860"/></marker>'
      + '</defs>';
    var html = defs, libs = [];
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
      html += '<path class="trait' + (f.bidir ? ' bidir' : '') + (sel ? ' sel' : '') + '" d="' + d + '" marker-end="url(#' + (sel ? 'aho' : (f.bidir ? 'ahb' : 'ah')) + ')"'
        + (f.bidir ? ' marker-start="url(#ahbs)"' : '') + '/>';
      f._mid = { x: cxp, y: cyp };
      if (f.libelle) libs.push({ x: cxp, y: cyp, t: f.libelle });
    });
    svg.innerHTML = html;
    // Étiquettes en HTML (encadré arrondi, au-dessus des flèches), dans le monde (suivent le zoom)
    Array.prototype.forEach.call(monde.querySelectorAll(".fleche-lib"), function (n) { n.remove(); });
    libs.forEach(function (l) {
      var el = document.createElement("div");
      el.className = "fleche-lib";
      el.textContent = l.t;
      el.style.left = l.x + "px"; el.style.top = l.y + "px";
      monde.appendChild(el);
    });
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
      if (!rec.contenu) supprimerTexte(rec); else sauver();
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
    function up(ev) { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); try { el.releasePointerCapture(ev.pointerId); } catch (x) {} sauver(); }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  }
  function supprimerTexte(rec) {
    rec.el.remove();
    etat.textes = etat.textes.filter(function (t) { return t !== rec; });
    // deselect() retire aussi la croix flottante (sinon elle reste a l'ecran).
    if (etat.sel && etat.sel.ref === rec) deselect(); else positionnerEditeurs();
    sauver();
  }

  /* ---------- Selection + editeurs flottants (croix / libelle) ---------- */
  var croixFleche = null, editLib = null, croixTexte = null, bidirFleche = null;
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
    [croixFleche, editLib, croixTexte, bidirFleche].forEach(function (n) { if (n) n.remove(); });
    croixFleche = editLib = croixTexte = bidirFleche = null;
    dessinerFleches();
  }
  function construireEditeurFleche(f) {
    editLib = document.createElement("input");
    editLib.type = "text"; editLib.maxLength = 40; editLib.value = f.libelle;
    editLib.placeholder = S.libelle;
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-ui);font-size:.85rem;border:1px solid var(--accent);border-radius:6px;padding:.25rem .45rem;background:#fff;color:var(--ink);width:9rem;box-shadow:0 4px 12px rgba(27,26,23,.14)";
    editLib.addEventListener("input", function () { f.libelle = editLib.value; dessinerFleches(); sauver(); });
    scene.appendChild(editLib);
    croixFleche = document.createElement("button");
    croixFleche.className = "fleche-croix"; croixFleche.textContent = "✕"; croixFleche.title = S.suppFleche;
    croixFleche.addEventListener("click", function () {
      etat.fleches = etat.fleches.filter(function (x) { return x !== f; }); deselect(); dessinerFleches(); sauver();
    });
    scene.appendChild(croixFleche);
    // Bascule sens unique <-> double sens.
    bidirFleche = document.createElement("button");
    bidirFleche.className = "fleche-bidir"; bidirFleche.textContent = "↔";
    bidirFleche.title = S.sensDouble; bidirFleche.setAttribute("aria-pressed", f.bidir ? "true" : "false");
    bidirFleche.addEventListener("click", function () {
      f.bidir = !f.bidir; bidirFleche.setAttribute("aria-pressed", f.bidir ? "true" : "false"); dessinerFleches(); sauver();
    });
    scene.appendChild(bidirFleche);
    positionnerEditeurs();
  }
  function construireCroixTexte(rec) {
    croixTexte = document.createElement("button");
    croixTexte.className = "texte-croix"; croixTexte.textContent = "✕"; croixTexte.title = S.suppTexte;
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
      if (bidirFleche) { bidirFleche.style.left = (p.x - 30) + "px"; bidirFleche.style.top = (p.y - 16) + "px"; }
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
  function fondScene(t) { return t === scene || t === monde || t.classList.contains("plan-bord") || t.id === "fleches"; }
  scene.addEventListener("pointerdown", function (e) {
    if (!fondScene(e.target)) return;
    if (etat.outil === "fleche") { annulerFlecheEnCours(); }
    deselect();
    panning = { mx: e.clientX, my: e.clientY, px: etat.panX, py: etat.panY };
    scene.classList.add("grabbing"); scene.setPointerCapture(e.pointerId);
  });
  // Note : double-clic sur une zone vide du tableau.
  scene.addEventListener("dblclick", function (e) {
    if (!fondScene(e.target)) return;
    var w = versMonde(e.clientX, e.clientY); creerTexte(w.x, w.y, true);
  });
  scene.addEventListener("pointermove", function (e) {
    if (!panning) return;
    etat.panX = panning.px + (e.clientX - panning.mx);
    etat.panY = panning.py + (e.clientY - panning.my);
    clampPan(); applyView(); dessinerFleches();
  });
  scene.addEventListener("pointerup", function (e) { panning = null; scene.classList.remove("grabbing"); try { scene.releasePointerCapture(e.pointerId); } catch (x) {} });
  // Le tableau occupe tout l'ecran (pas de defilement de page) : la molette
  // zoome toujours, directement, sans bouton a activer.
  scene.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = rectScene();
    zoomVers(etat.zoom * (e.deltaY < 0 ? ZWHEEL : 1 / ZWHEEL), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  /* ---------- Modal ---------- */
  var modal = document.getElementById("modal"), grande = document.getElementById("carte-grande");
  function ouvrirModal(n) {
    var c = etat.cartesData[n];
    document.getElementById("mg-img").src = c.image ? BASE + (c.image.carte || c.image.grand) : "";
    document.getElementById("mg-num").textContent = c.n;
    document.getElementById("mg-tit").textContent = c.titre;
    document.getElementById("mg-vtit").textContent = c.titre;
    var v = document.getElementById("mg-verso"); v.innerHTML = "";
    (c.verso || []).forEach(function (p) { var el = document.createElement("p"); el.textContent = /\[A COMPLETER\]/i.test(p) ? S.texteAVenir : p; v.appendChild(el); });
    var poserBtn = document.getElementById("modal-poser");
    if (poserBtn) poserBtn.hidden = (etat.main !== n);
    grande.classList.remove("flip"); modal.classList.add("on");
  }
  document.getElementById("modal-flip").addEventListener("click", function () { grande.classList.toggle("flip"); });
  var mp = document.getElementById("modal-poser");
  if (mp) mp.addEventListener("click", function () { poserMain(); fermerModal(); });
  document.getElementById("modal-close").addEventListener("click", fermerModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) fermerModal(); });
  function fermerModal() { modal.classList.remove("on"); }

  /* ---------- Plein ecran (API Fullscreen, toutes les commandes gardees) ---- */
  var btnPlein = document.getElementById("btn-plein");
  function reflowPlein() { setTimeout(function () { clampPan(); applyView(); dessinerFleches(); }, 60); }
  btnPlein.addEventListener("click", function () {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fs) {
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { var pr = req.call(el); if (pr && pr.catch) pr.catch(basculeClasse); }
      else basculeClasse();
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document); else basculeClasse();
    }
  });
  function basculeClasse() { document.body.classList.toggle("plein"); reflowPlein(); }
  function syncPlein() {
    var actif = !!(document.fullscreenElement || document.webkitFullscreenElement);
    // Si l'API est utilisee, la classe suit l'etat reel ; sinon basculeClasse la gere.
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      document.body.classList.toggle("plein", actif);
    }
    btnPlein.setAttribute("aria-pressed", document.body.classList.contains("plein") ? "true" : "false");
    reflowPlein();
  }
  document.addEventListener("fullscreenchange", syncPlein);
  document.addEventListener("webkitfullscreenchange", syncPlein);

  /* ---------- Panneau d'aide (bouton ?) ---------- */
  var aidePop = document.getElementById("aide-pop");
  var aideBtn = document.getElementById("btn-aide");
  function aideMaj(ouvert) {
    aidePop.hidden = !ouvert;
    aideBtn.setAttribute("aria-expanded", ouvert ? "true" : "false");
  }
  aideBtn.addEventListener("click", function (e) { e.stopPropagation(); aideMaj(aidePop.hidden); });
  document.getElementById("aide-fermer").addEventListener("click", function () { aideMaj(false); });
  document.addEventListener("click", function (e) {
    if (!aidePop.hidden && !aidePop.contains(e.target) && e.target !== aideBtn) aideMaj(false);
  });

  /* ---------- Ecran d'accueil : objectif du jeu ---------- */
  var introOverlay = document.getElementById("intro-overlay");
  function fermerIntro() { introOverlay.hidden = true; try { localStorage.setItem("fresque-intro-vu", "1"); } catch (e) {} }
  function ouvrirIntro() { introOverlay.hidden = false; }
  document.getElementById("intro-ok").addEventListener("click", fermerIntro);
  var revoir = document.getElementById("revoir-objectif");
  if (revoir) revoir.addEventListener("click", function () { aideMaj(false); ouvrirIntro(); });
  var introVu = false;
  try { introVu = localStorage.getItem("fresque-intro-vu") === "1"; } catch (e) {}
  if (!introVu) ouvrirIntro();

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (modal.classList.contains("on")) { fermerModal(); return; }
      if (document.body.classList.contains("plein")) { document.body.classList.remove("plein"); setTimeout(function(){clampPan();applyView();dessinerFleches();},50); return; }
      deselect(); annulerFlecheEnCours();
      if (etat.outil === "fleche") setOutil("deplacer");
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
    // Un seul bouton d'outil (Lien) : il bascule entre deplacer et fleche.
    b.addEventListener("click", function () { setOutil(etat.outil === b.dataset.outil ? "deplacer" : b.dataset.outil); });
  });
  zPlus.addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  zMoins.addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  document.getElementById("z-tout").addEventListener("click", toutVoir);
  document.getElementById("btn-piocher").addEventListener("click", piocher);
  document.getElementById("btn-recommencer").addEventListener("click", function () {
    if (etat.posees.length === 0 && etat.main == null) { recommencer(); return; }
    if (window.confirm(LANG === "en" ? "Clear the board and start over?" : "Vider le tableau et tout recommencer ?")) recommencer();
  });
  /* Couleur du tableau : bascule blanc <-> noir, quel que soit le theme. */
  var btnSombre = document.getElementById("btn-sombre");
  function themeSombre() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function canvasSombre() {
    if (document.body.classList.contains("canvas-noir")) return true;
    if (document.body.classList.contains("canvas-blanc")) return false;
    return themeSombre();
  }
  function majBtnSombre() {
    var d = canvasSombre();
    btnSombre.setAttribute("aria-pressed", d ? "true" : "false");
    btnSombre.textContent = d ? (LANG === "en" ? "Light board" : "Fond blanc")
                              : (LANG === "en" ? "Dark board" : "Fond noir");
  }
  btnSombre.addEventListener("click", function () {
    var d = canvasSombre();
    document.body.classList.remove("canvas-noir", "canvas-blanc");
    document.body.classList.add(d ? "canvas-blanc" : "canvas-noir");
    majBtnSombre();
  });
  majBtnSombre();
  document.getElementById("btn-export").addEventListener("click", exporterImage);
  window.addEventListener("resize", function () { clampPan(); applyView(); dessinerFleches(); });

  function flash(msg) { aide.textContent = msg; setTimeout(function () { if (aide.textContent === msg) aide.textContent = ""; }, 2500); }
  function echap(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  /* ---------- Export image du tableau (PNG) ---------- */
  function coinRond(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function dessinerCover(ctx, img, x, y, w, h) {
    var ir = img.naturalWidth / img.naturalHeight, dr = w / h, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (ir > dr) { sw = sh * dr; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / dr; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function texteMulti(ctx, txt, x, y, maxw, lh, maxLignes) {
    var mots = String(txt).split(" "), ligne = "", n = 0;
    for (var i = 0; i < mots.length; i++) {
      var essai = ligne ? ligne + " " + mots[i] : mots[i];
      if (ctx.measureText(essai).width > maxw && ligne) {
        ctx.fillText(ligne, x, y); ligne = mots[i]; y += lh; if (++n >= maxLignes - 1) { ctx.fillText(mots.slice(i).join(" "), x, y); return; }
      } else ligne = essai;
    }
    ctx.fillText(ligne, x, y);
  }
  function exporterImage() {
    if (!etat.posees.length) return;
    var pad = 70, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    function eng(x, y, w, h) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x + w); maxy = Math.max(maxy, y + h); }
    etat.posees.forEach(function (p) { eng(p.x, p.y, p.el.offsetWidth || 150, p.el.offsetHeight || 150); });
    etat.textes.forEach(function (t) { eng(t.x, t.y, t.el.offsetWidth || 80, t.el.offsetHeight || 30); });
    minx -= pad; miny -= pad; maxx += pad; maxy += pad;
    var W = maxx - minx, H = maxy - miny, scale = Math.max(0.5, Math.min(2, 2400 / W));
    var cv = document.createElement("canvas"); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    var ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.translate(-minx, -miny);
    var dark = canvasSombre();
    ctx.fillStyle = dark ? "#14110d" : "#f4f2ec"; ctx.fillRect(minx, miny, W, H);

    // Flèches (même géométrie que dessinerFleches)
    var idx = {};
    etat.fleches.forEach(function (f) {
      var A = centre(f.de), B = centre(f.vers); if (!A || !B) return;
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers); idx[cle] = (idx[cle] || 0); var k = idx[cle]++;
      var pa = bord(A, B.x, B.y), pb = bord(B, A.x, A.y);
      var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      var amp = Math.min(20, len * 0.09) * (k % 2 === 0 ? 1 : -1) * (1 + Math.floor(k / 2));
      var nx = -dy / len, ny = dx / len, cxp = mx + nx * amp, cyp = my + ny * amp;
      ctx.strokeStyle = f.bidir ? "#F0A860" : "#8a857b"; ctx.lineWidth = 2.2; ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(cxp, cyp, pb.x, pb.y); ctx.stroke();
      teteFleche(ctx, cxp, cyp, pb.x, pb.y);
      if (f.bidir) teteFleche(ctx, cxp, cyp, pa.x, pa.y);
      if (f.libelle) {
        ctx.font = "600 13px 'Montserrat',sans-serif"; var tw = ctx.measureText(f.libelle).width;
        ctx.fillStyle = "#efece6"; coinRond(ctx, cxp - tw / 2 - 7, cyp - 11, tw + 14, 22, 7); ctx.fill();
        ctx.strokeStyle = "#e6e2da"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#B0560A"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.libelle, cxp, cyp + 1);
      }
    });

    // Cartes
    etat.posees.forEach(function (p) {
      var c = etat.cartesData[p.n], x = p.x, y = p.y, w = p.el.offsetWidth || 150, h = p.el.offsetHeight || 150, visH = Math.round(w / 1.6);
      ctx.save(); coinRond(ctx, x, y, w, h, 10); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.save(); coinRond(ctx, x, y, w, visH, 10); ctx.clip(); ctx.fillStyle = "#14110d"; ctx.fillRect(x, y, w, visH);
      var img = p.el.querySelector("img");
      if (img && img.complete && img.naturalWidth) dessinerCover(ctx, img, x, y, w, visH);
      ctx.restore();
      ctx.fillStyle = "#E8811C"; coinRond(ctx, x + 5, y + 5, 21, 21, 5); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 13px 'Saira Condensed',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.n, x + 15.5, y + 16.5);
      ctx.fillStyle = "#1b1a17"; ctx.font = "700 13px 'Saira Condensed',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      texteMulti(ctx, c.titre, x + 8, y + visH + 6, w - 16, 15, 3);
      ctx.restore();
      ctx.strokeStyle = "#e6e2da"; ctx.lineWidth = 1; coinRond(ctx, x, y, w, h, 10); ctx.stroke();
    });

    // Notes
    etat.textes.forEach(function (t) {
      if (!t.contenu) return;
      var x = t.x, y = t.y, w = t.el.offsetWidth || 80, h = t.el.offsetHeight || 30;
      ctx.fillStyle = "#fff7e6"; coinRond(ctx, x, y, w, h, 6); ctx.fill();
      ctx.strokeStyle = "#f0dfbc"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#1b1a17"; ctx.font = "500 14px 'Montserrat',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      texteMulti(ctx, t.contenu, x + 9, y + 7, w - 18, 17, 6);
    });

    cv.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "fresque-des-risques-de-l-ia.png"; document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
    flash("Image téléchargée.");
  }
  function teteFleche(ctx, fromx, fromy, tox, toy) {
    var a = Math.atan2(toy - fromy, tox - fromx), s = 9;
    ctx.beginPath(); ctx.moveTo(tox, toy);
    ctx.lineTo(tox - s * Math.cos(a - 0.42), toy - s * Math.sin(a - 0.42));
    ctx.lineTo(tox - s * Math.cos(a + 0.42), toy - s * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
  }

  /* ---------- Init ---------- */
  traduireStatique();
  fetch("../../data/cartes.json").then(function (r) { return r.json(); }).then(function (data) {
    data.cartes.forEach(function (c) { etat.cartesData[c.n] = c; });
    var c0 = etat.cartesData[0];
    if (c0) document.getElementById("carte0-txt").textContent = (c0.verso || []).join("  ");
    etat.pioche = data.cartes.filter(function (c) { return !c.intro; }).map(function (c) { return c.n; }).sort(function (a, b) { return a - b; });
    // Reprise d'une fresque en cours (localStorage) si elle existe.
    var sauv = chargerSauv();
    if (sauv && ((sauv.posees && sauv.posees.length) || (sauv.textes && sauv.textes.length))) restaurer(sauv);
    majPiocheInfo(); majCoach();
    // cadrer sur le centre du plan de travail
    var r = rectScene();
    etat.zoom = 1;
    etat.panX = (r.width - PLAN_W) / 2;
    etat.panY = (r.height - PLAN_H) / 2;
    clampPan(); applyView();
    setOutil("deplacer");
    majCoach();
  }).catch(function () { aide.textContent = S.erreurCartes; });

  function restaurer(d) {
    if (Array.isArray(d.pioche)) etat.pioche = d.pioche.slice();
    etat.seq = d.seq || etat.seq;
    (d.posees || []).forEach(function (p) { poser(p.n, p.x, p.y, true); });
    etat.fleches = (d.fleches || []).map(function (f) { return { id: f.id, de: f.de, vers: f.vers, bidir: !!f.bidir, libelle: f.libelle || "" }; });
    dessinerFleches();
    (d.textes || []).forEach(function (t) { var r = creerTexte(t.x, t.y, false); r.id = t.id; r.contenu = t.contenu; r.el.textContent = t.contenu; });
    etat.main = (d.main != null) ? d.main : null; rendreMain();
  }
})();
