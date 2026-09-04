/* Fresque en ligne - client de session (multi-participants).
   Le serveur (fonction Netlify) est l'autorité. Le client applique ses actions
   de façon optimiste puis envoie une intention ; il interroge l'état toutes les
   ~2,5 s (tolérance 5-10 s du cahier des charges). Vue (zoom/pan) locale. */
(function () {
  "use strict";

  /* ---------- Langue (via ?lang=en) ---------- */
  var LANG = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "fr";
  document.documentElement.lang = LANG;
  var EN = LANG === "en";
  var S = EN ? {
    prenomManquant: "Please enter your first name.", creation: "Creating…", echec: "Failed.",
    indispoMoment: "Service unavailable for now.", code6: "The code is 6 characters.",
    connexion: "Connecting…", codeInconnu: "Unknown code.", indispo: "Service unavailable.",
    partagezCode: function (c) { return "Share the code " + c + " with the participants."; },
    attenteCarte: "Waiting for a card…", sessionTerminee: "Session ended.",
    sessionClose: "The session was closed by the facilitator.",
    cliquezArrivee: "Click the target card.",
    flecheDepart: "Click the source card, then the target card.",
    flecheDouble: "Double link: source then target.", sensDouble: "Two-way link", texteClic: "Click the board to write.",
    animateur: "facilitator", carteN: function (n) { return "card " + n; },
    recues: function (k) { return k + " received"; },
    poser: "Place", glisserPoser: "Drag onto the board", agrandir: "Enlarge", agrandirCarte: "Enlarge the card", libelle: "label…", texteAVenir: "Text coming soon.",
    copie: "copied ✓", lienCopie: "Link copied ✓",
    coachFermer: "Got it",
    coachPartager: function (c) { return "Share the code " + c + " so participants can join."; },
    coachDistribuer: "Deal a card to participants: “Deal” (or “To everyone”).",
    coachAttente: "Waiting for a card from the facilitator…",
    coachPoser: "Drag your card onto the board to place it.",
    coachRelier: "To connect two cards: pick the “Link →” tool, then click one card and another."
  } : {
    prenomManquant: "Indiquez votre prénom.", creation: "Création…", echec: "Échec.",
    indispoMoment: "Service indisponible pour le moment.", code6: "Le code fait 6 caractères.",
    connexion: "Connexion…", codeInconnu: "Code inconnu.", indispo: "Service indisponible.",
    partagezCode: function (c) { return "Partagez le code " + c + " avec les participants."; },
    attenteCarte: "En attente d'une carte…", sessionTerminee: "Session terminée.",
    sessionClose: "La session a été close par l'animateur.",
    cliquezArrivee: "Cliquez la carte d'arrivée.",
    flecheDepart: "Cliquez la carte de départ, puis la carte d'arrivée.",
    flecheDouble: "Lien double : départ puis arrivée.", sensDouble: "Lien à double sens", texteClic: "Cliquez le tableau pour écrire.",
    animateur: "animateur", carteN: function (n) { return "carte " + n; },
    recues: function (k) { return k + " reçue" + (k > 1 ? "s" : ""); },
    poser: "Poser", glisserPoser: "Glissez sur le tableau", agrandir: "Agrandir", agrandirCarte: "Agrandir la carte", libelle: "libellé…", texteAVenir: "Texte à venir.",
    copie: "copié ✓", lienCopie: "Lien copié ✓",
    coachFermer: "Compris",
    coachPartager: function (c) { return "Partagez le code " + c + " pour que des participant·es rejoignent."; },
    coachDistribuer: "Distribuez une carte aux participant·es : « Distribuer » (ou « À tous »).",
    coachAttente: "En attente d'une carte de l'animateur…",
    coachPoser: "Glissez votre carte sur le tableau pour la placer.",
    coachRelier: "Pour relier deux cartes : outil « Lien → », puis cliquez une carte et une autre."
  };

  function traduireStatique() {
    if (!EN) return;
    document.title = "Session · The AI Risks Collage";
    var txt = {
      "#lobby h1": "Facilitate remotely",
      ".lobby-sous": "One facilitator, up to eight participants, a shared board. No account.",
      "#lobby section:nth-of-type(1) h2": "Open a session",
      'label[for="anim-prenom"]': "Your first name",
      "#btn-creer": "Open the session",
      ".lobby-sep span": "or",
      "#lobby section:nth-of-type(2) h2": "Join",
      'label[for="join-code"]': "Session code",
      'label[for="join-prenom"]': "Your first name",
      "#btn-rejoindre": "Join",
      "#btn-partager": "Copy the link",
      "#btn-distribuer": "Deal", "#btn-passer": "Skip", "#btn-distribuer-tous": "To everyone",
      '.tool[data-outil="fleche"]': "Link", '.tool[data-outil="texte"]': "Note",
      "#z-tout": "Fit all", "#btn-plein": "Fullscreen",
      "#panneau .panneau-tete h3": "Participants",
      'label[for="vocal-url"]': "Voice room link (Discord, Meet…)",
      "#vocal-lien": "🎧 Join the voice room",
      "#aide-titre": "How to play",
      "#modal-flip": "Flip", "#modal-close": "Close ✕",
      ".mobile-avis h1": "On a computer"
    };
    Object.keys(txt).forEach(function (sel) { var el = document.querySelector(sel); if (el) el.textContent = txt[sel]; });
    var attr = [
      ["#code-chip", "title", "Copy the code"], ["#etat-conn", "title", "Connection"],
      ["#btn-passer", "title", "Advance the turn without dealing"],
      ["#z-moins", "aria-label", "Zoom out"], ["#z-plus", "aria-label", "Zoom in"],
      ["#fermer-panneau", "aria-label", "Close"], ["#modal-close", "aria-label", "Close"],
      ["#anim-prenom", "placeholder", "First name"], ["#join-prenom", "placeholder", "First name"]
    ];
    attr.forEach(function (a) { var el = document.querySelector(a[0]); if (el) el.setAttribute(a[1], a[2]); });
    document.querySelectorAll(".marque").forEach(function (m) {
      m.childNodes[m.childNodes.length - 1].nodeValue = " The AI Risks Collage";
    });
    var setFirst = function (sel, v) { var el = document.querySelector(sel); if (el && el.firstChild) el.firstChild.nodeValue = v; };
    setFirst("#code-chip", "Code ");            // « Code <b> »
    setFirst("#pioche-info", "Deck: ");         // « Pioche : <b> »
    setFirst("#btn-participants", "Participants (");
    var cop = document.querySelector("#code-chip .copier"); if (cop) cop.textContent = "copy";
    var ret = document.querySelector(".lobby-retour");
    if (ret) ret.innerHTML = '<a href="../">← Back</a> · The service is in preparation: early trials.';
    var mp = document.querySelector(".mobile-avis p");
    if (mp) mp.innerHTML = 'The online collage runs on a computer screen. <a href="../">Back</a>.';
    var liste = document.querySelector("#aide-liste");
    if (liste) liste.innerHTML =
      '<li><b>Cards:</b> the facilitator deals; place your card, then drag it. The ⤢ button opens it large.</li>'
      + '<li><b>Links:</b> Link tool, click the source card then the target. Click the line to annotate or delete it.</li>'
      + '<li><b>Notes:</b> Note tool then click the board; drag to move, empty to delete.</li>'
      + '<li><b>View:</b> zoom and panning are personal to each of you. "Fit all" reframes everything.</li>';
  }

  var API = "/.netlify/functions/fresque";
  var BASE = "../../";
  var PLAN_W = 4400, PLAN_H = 2200, ZMIN = 0.20, ZMAX = 1.60, ZSTEP = 1.25, ZWHEEL = 1.06;
  var POLL_MS = 2500;

  var E = {}; // éléments DOM
  ["lobby","app","anim-prenom","btn-creer","join-code","join-prenom","btn-rejoindre","lobby-msg",
   "code-val","code-chip","btn-partager","pioche-n","nb-part","etat-conn","carte0-txt",
   "scene","monde","fleches","main-zone","aide","z-niv","z-moins","z-plus","z-tout","btn-plein",
   "btn-distribuer","btn-passer","btn-distribuer-tous","btn-participants","panneau","fermer-panneau",
   "liste-part","vocal-url","btn-vocal","vocal-lien","legende","modal","carte-grande","modal-flip",
   "modal-close","mg-img","mg-num","mg-tit","mg-vtit","mg-verso","mg-vimg"].forEach(function (id) {
    E[id] = document.getElementById(id);
  });
  traduireStatique();

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
    if (!prenom) { lobbyMsg(S.prenomManquant, "err"); return; }
    E["btn-creer"].disabled = true; lobbyMsg(S.creation);
    api("creer", { prenom: prenom }).then(function (res) {
      E["btn-creer"].disabled = false;
      if (res.d && res.d.code) { stockerJeton(res.d.code, res.d.jeton); demarrer(res.d.code, res.d.jeton, res.d.role, res.d.etat); }
      else lobbyMsg((res.d && (res.d.error || (res.d.refus && res.d.refus.message))) || S.echec, "err");
    }).catch(function () { E["btn-creer"].disabled = false; lobbyMsg(S.indispoMoment, "err"); });
  });

  E["btn-rejoindre"].addEventListener("click", rejoindre);
  E["join-code"].addEventListener("keydown", function (e) { if (e.key === "Enter") rejoindre(); });
  function rejoindre() {
    var code = (E["join-code"].value || "").trim().toUpperCase();
    var prenom = (E["join-prenom"].value || "").trim();
    if (code.length !== 6) { lobbyMsg(S.code6, "err"); return; }
    if (!prenom) { lobbyMsg(S.prenomManquant, "err"); return; }
    E["btn-rejoindre"].disabled = true; lobbyMsg(S.connexion);
    api("rejoindre", { code: code, prenom: prenom, jeton: jetonStocke(code) }).then(function (res) {
      E["btn-rejoindre"].disabled = false;
      if (res.d && res.d.jeton) { stockerJeton(code, res.d.jeton); demarrer(code, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      else lobbyMsg((res.d && res.d.refus && res.d.refus.message) || S.codeInconnu, "err");
    }).catch(function () { E["btn-rejoindre"].disabled = false; lobbyMsg(S.indispo, "err"); });
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
      flash(role === "animateur" ? S.partagezCode(code) : S.attenteCarte);
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
      else if (res.d && res.d.refus) { flash(res.d.refus.message || S.sessionTerminee); }
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
    majCoach();
    if (vue.clos) { flash(S.sessionClose); }
  }

  /* ---------- Coach pas a pas (clarte du parcours, adapte au role) -------- */
  var coachOff = false;
  try { coachOff = localStorage.getItem("coach-multi-off") === "1"; } catch (e) {}
  var coach = null;
  function assurerCoach() {
    if (coach) return;
    coach = document.createElement("div");
    coach.className = "coach"; coach.hidden = true;
    coach.innerHTML = '<span class="coach-txt"></span>' +
      '<button type="button" class="coach-x">' + esc(S.coachFermer) + '</button>';
    E.scene.appendChild(coach);
    coach.querySelector(".coach-x").addEventListener("click", function () {
      coachOff = true; try { localStorage.setItem("coach-multi-off", "1"); } catch (e) {}
      majCoach();
    });
  }
  function etapeCoach() {
    var v = etat.vue; if (!v) return null;
    var tab = v.tableau || {}, cartes = tab.cartes || [], fleches = tab.fleches || [];
    if (fleches.length >= 1) return null; // un lien cree : le principe est saisi
    if (etat.role === "animateur") {
      if ((v.participants || []).length === 0) return S.coachPartager(etat.code);
      if (cartes.length === 0) return S.coachDistribuer;
      if (cartes.length >= 2) return S.coachRelier;
      return null;
    }
    if (maCarte() != null) return S.coachPoser;
    if (cartes.length === 0) return S.coachAttente;
    if (cartes.length >= 2) return S.coachRelier;
    return null;
  }
  function majCoach() {
    assurerCoach();
    var txt = coachOff ? null : etapeCoach();
    if (!txt) { coach.hidden = true; return; }
    coach.querySelector(".coach-txt").textContent = txt;
    coach.hidden = false;
  }

  /* ---------- Panneau d'aide (bouton ?) ---------- */
  (function () {
    var pop = document.getElementById("aide-pop"), btn = document.getElementById("btn-aide");
    if (!pop || !btn) return;
    function maj(ouvert) { pop.hidden = !ouvert; btn.setAttribute("aria-expanded", ouvert ? "true" : "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); maj(pop.hidden); });
    document.getElementById("aide-fermer").addEventListener("click", function () { maj(false); });
    document.addEventListener("click", function (e) {
      if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) maj(false);
    });
  })();

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
    liA.innerHTML = '<span class="pastille' + (vue.animateur.connecte ? '' : ' hs') + '"></span><span class="nom">' + esc(vue.animateur.prenom) + '</span><span class="anim">'+S.animateur+'</span>';
    ul.appendChild(liA);
    vue.participants.forEach(function (p) {
      var li = document.createElement("li");
      var info = p.carteEnMain != null ? S.carteN(p.carteEnMain) : (p.recues ? S.recues(p.recues) : "");
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
    var d = document.createElement("div"); d.className = "main-carte a-poser";
    d.innerHTML = '<div class="vis"><img alt="" src="' + BASE + (c.image ? c.image.vignette : "") + '"><span class="num">' + c.n + '</span>'
      + '<button class="agr" data-a="voir" aria-label="' + S.agrandirCarte + '" title="' + S.agrandir + '">⤢</button></div>'
      + '<div class="tit">' + esc(c.titre) + '</div>'
      + '<div class="actions"><button class="btn primaire" data-a="poser">' + S.poser + '</button></div>';
    d.querySelector('[data-a="poser"]').addEventListener("click", function (e) { e.stopPropagation(); poserMain(); });
    d.querySelector('[data-a="voir"]').addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(p.carteEnMain); });
    activerGlisserMain(d, p.carteEnMain);
    mz.appendChild(d);
  }
  // Glisser la carte tenue vers le tableau ; clic simple = agrandir.
  // Ecoute au niveau document : le relachement est capte ou que soit le curseur.
  function activerGlisserMain(d, n) {
    d.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.target.closest("button")) return;
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
        if (!bougé) { ouvrirModal(n); return; }
        var r = rectScene();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          var w = versMonde(ev.clientX, ev.clientY);
          agir({ op: "poser", n: n, rect: { x: w.x - 90, y: w.y - 75, largeur: 200, hauteur: 200 } });
        }
        if (etat.vue) rendreMain(etat.vue);
      }
      document.addEventListener("pointermove", mv, true);
      document.addEventListener("pointerup", up, true);
    });
  }
  // Carte tenue par moi (participant), ou null.
  function maCarte() {
    if (etat.role !== "participant" || !etat.vue) return null;
    var p = (etat.vue.participants || []).find(function (x) { return x.id === _idMoi; });
    return p && p.carteEnMain != null ? p.carteEnMain : null;
  }
  function poserMain() {
    var n = maCarte(); if (n == null) return;
    agir({ op: "poser", n: n, rect: rectVisible() });
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
    var exp = document.getElementById("btn-export");
    if (exp) exp.hidden = !(tab.cartes && tab.cartes.length >= 38);
  }

  function creerElCarte(n) {
    var c = etat.cartes[n]; var el = document.createElement("div"); el.className = "c-carte"; el.dataset.n = n;
    el.innerHTML = '<div class="vis"><img alt="" loading="lazy" src="' + BASE + (c && c.image ? c.image.vignette : "") + '"><span class="num">' + n + '</span>'
      + '<button class="agr" aria-label="Agrandir">⤢</button></div><div class="tit">' + esc(c ? c.titre : "") + '</div>';
    el.querySelector(".agr").addEventListener("click", function (e) { e.stopPropagation(); ouvrirModal(n); });
    el.addEventListener("dblclick", function (e) { e.stopPropagation(); ouvrirModal(n); }); // double-clic = agrandir
    el.addEventListener("click", function (e) {
      if (etat.outil === "fleche") { e.stopPropagation(); clicFleche(n, el); }
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
    if (!etat.flecheDepart) { etat.flecheDepart = { n: n, el: el }; el.classList.add("depart"); flash(S.cliquezArrivee); }
    else if (etat.flecheDepart.n === n) { annulerFleche(); }
    else { agir({ op: "creerFleche", de: etat.flecheDepart.n, vers: n, bidir: false }); annulerFleche(); setOutil("deplacer"); }
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
      + '<marker id="ahb" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#F0A860"/></marker>'
      + '<marker id="ahbs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M11,0 L0,4.5 L11,9 z" fill="#F0A860"/></marker></defs>';
    var html = defs, idx = {}, libs = [];
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
      html += '<path class="trait' + (f.bidir ? ' bidir' : '') + (sel ? ' sel' : '') + '" d="' + d + '" marker-end="url(#' + (sel ? 'aho' : (f.bidir ? 'ahb' : 'ah')) + ')"' + (f.bidir ? ' marker-start="url(#ahbs)"' : '') + '/>';
      f._mid = { x: cxp, y: cyp };
      if (f.libelle) libs.push({ x: cxp, y: cyp, t: f.libelle });
    });
    E.fleches.innerHTML = html;
    Array.prototype.forEach.call(E.monde.querySelectorAll(".fleche-lib"), function (n) { n.remove(); });
    libs.forEach(function (l) {
      var el = document.createElement("div"); el.className = "fleche-lib"; el.textContent = l.t;
      el.style.left = l.x + "px"; el.style.top = l.y + "px"; E.monde.appendChild(el);
    });
    E.fleches.querySelectorAll(".hit").forEach(function (h) {
      h.addEventListener("click", function (e) { e.stopPropagation(); selFleche(h.dataset.id); });
    });
    positionnerEditeurs();
  }

  /* ---------- Sélection flèche : libellé + suppression ---------- */
  var croix = null, editLib = null, bidir = null;
  function selFleche(id) {
    deselect(); etat.sel = { type: "fleche", id: id }; dessinerFleches();
    var f = etat.vue.tableau.fleches.find(function (x) { return x.id === id; }); if (!f) return;
    editLib = document.createElement("input"); editLib.type = "text"; editLib.maxLength = 40; editLib.value = f.libelle || "";
    editLib.placeholder = S.libelle;
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-ui);font-size:.85rem;border:1px solid var(--accent);border-radius:6px;padding:.25rem .45rem;background:#fff;color:var(--ink);width:9rem;box-shadow:0 4px 12px rgba(27,26,23,.14)";
    var envoi = null;
    editLib.addEventListener("input", function () { clearTimeout(envoi); var v = editLib.value; envoi = setTimeout(function () { agir({ op: "libellerFleche", id: id, libelle: v }); }, 400); });
    E.scene.appendChild(editLib);
    croix = boutonCroix("fleche-croix", function () { agir({ op: "supprimerFleche", id: id }); deselect(); });
    bidir = document.createElement("button");
    bidir.className = "fleche-bidir"; bidir.textContent = "↔"; bidir.title = S.sensDouble;
    bidir.setAttribute("aria-pressed", f.bidir ? "true" : "false");
    bidir.addEventListener("click", function () { agir({ op: "bidirFleche", id: id }); });
    E.scene.appendChild(bidir);
    positionnerEditeurs();
  }
  function selCarte(n, el) { deselect(); etat.sel = { type: "carte", n: n }; el.classList.add("sel"); }
  function boutonCroix(cls, onClick) { var b = document.createElement("button"); b.className = cls; b.textContent = "✕"; b.addEventListener("click", onClick); E.scene.appendChild(b); return b; }
  function deselect() {
    if (etat.sel && etat.sel.type === "carte") { var el = etat.elCartes[etat.sel.n]; if (el) el.classList.remove("sel"); }
    etat.sel = null; [croix, editLib, bidir].forEach(function (x) { if (x) x.remove(); }); croix = editLib = bidir = null; dessinerFleches();
  }
  function positionnerEditeurs() {
    if (etat.sel && etat.sel.type === "fleche") {
      var f = etat.vue.tableau.fleches.find(function (x) { return x.id === etat.sel.id; });
      if (f && f._mid) { var px = etat.panX + f._mid.x * etat.zoom, py = etat.panY + f._mid.y * etat.zoom;
        if (croix) { croix.style.left = px + "px"; croix.style.top = (py - 16) + "px"; }
        if (bidir) { bidir.style.left = (px - 30) + "px"; bidir.style.top = (py - 16) + "px"; }
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
    E.monde.style.setProperty("--iz", (1 / etat.zoom).toFixed(3)); E.monde.classList.toggle("loin", etat.zoom < 0.5);
    E["z-niv"].textContent = Math.round(etat.zoom * 100) + " %"; E["z-moins"].disabled = etat.zoom <= ZMIN + 1e-4; E["z-plus"].disabled = etat.zoom >= ZMAX - 1e-4; positionnerEditeurs(); }
  function clampPan() { var r = rectScene(), pw = PLAN_W * etat.zoom, ph = PLAN_H * etat.zoom;
    etat.panX = pw <= r.width ? (r.width - pw) / 2 : Math.min(0, Math.max(r.width - pw, etat.panX));
    etat.panY = ph <= r.height ? (r.height - ph) / 2 : Math.min(0, Math.max(r.height - ph, etat.panY)); }
  function centrer() { var r = rectScene(); etat.zoom = 1; etat.panX = (r.width - PLAN_W) / 2; etat.panY = (r.height - PLAN_H) / 2; clampPan(); applyView(); }
  function zoomVers(nz, cx, cy) { var wx = (cx - etat.panX) / etat.zoom, wy = (cy - etat.panY) / etat.zoom; etat.zoom = Math.max(ZMIN, Math.min(ZMAX, nz)); etat.panX = cx - wx * etat.zoom; etat.panY = cy - wy * etat.zoom; clampPan(); applyView(); dessinerFleches(); }
  function toutVoir() { var r = rectScene(); etat.zoom = Math.max(0.38, Math.min(r.width / PLAN_W, r.height / PLAN_H)); etat.panX = (r.width - PLAN_W * etat.zoom) / 2; etat.panY = (r.height - PLAN_H * etat.zoom) / 2; clampPan(); applyView(); dessinerFleches(); }
  function rectVisible() { var r = rectScene(); return { x: -etat.panX / etat.zoom, y: -etat.panY / etat.zoom, largeur: r.width / etat.zoom, hauteur: r.height / etat.zoom }; }
  function versMonde(cx, cy) { var r = rectScene(); return { x: (cx - r.left - etat.panX) / etat.zoom, y: (cy - r.top - etat.panY) / etat.zoom }; }

  var pan = null;
  E.scene.addEventListener("pointerdown", function (e) {
    if (!fondScene(e.target)) return;
    if (etat.outil === "texte") { e.preventDefault(); var w = versMonde(e.clientX, e.clientY); creerNoteLocale(w.x, w.y); setOutil("deplacer"); return; }
    annulerFleche(); deselect();
    pan = { mx: e.clientX, my: e.clientY, px: etat.panX, py: etat.panY }; E.scene.classList.add("grabbing"); E.scene.setPointerCapture(e.pointerId);
  });
  function fondScene(t) { return t === E.scene || t === E.monde || t.classList.contains("plan-bord") || t.id === "fleches"; }
  // Note : double-clic sur une zone vide du tableau.
  E.scene.addEventListener("dblclick", function (e) {
    if (!fondScene(e.target)) return;
    var w = versMonde(e.clientX, e.clientY); creerNoteLocale(w.x, w.y);
  });
  E.scene.addEventListener("pointermove", function (e) { if (!pan) return; etat.panX = pan.px + (e.clientX - pan.mx); etat.panY = pan.py + (e.clientY - pan.my); clampPan(); applyView(); dessinerFleches(); });
  E.scene.addEventListener("pointerup", function (e) { pan = null; E.scene.classList.remove("grabbing"); try { E.scene.releasePointerCapture(e.pointerId); } catch (x) {} });
  E.scene.addEventListener("wheel", function (e) { e.preventDefault(); var r = rectScene(); zoomVers(etat.zoom * (e.deltaY < 0 ? ZWHEEL : 1 / ZWHEEL), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  /* ---------- Barres / boutons ---------- */
  function setOutil(o) { etat.outil = o; document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.outil === o ? "true" : "false"); });
    E.scene.classList.toggle("outil-fleche", o === "fleche"); E.scene.classList.toggle("outil-texte", o === "texte"); annulerFleche();
    flash(o === "fleche" ? S.flecheDepart : (o === "texte" ? S.texteClic : "")); }
  document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.addEventListener("click", function () { setOutil(etat.outil === b.dataset.outil ? "deplacer" : b.dataset.outil); }); });
  E["z-plus"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  E["z-moins"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  E["z-tout"].addEventListener("click", toutVoir);
  E["btn-plein"].addEventListener("click", function () { document.body.classList.toggle("plein"); setTimeout(function () { clampPan(); applyView(); dessinerFleches(); }, 50); });
  (function () {
    var s = document.getElementById("btn-sombre");
    if (s) s.addEventListener("click", function () { var on = document.body.classList.toggle("sombre"); this.setAttribute("aria-pressed", on ? "true" : "false"); });
    var e = document.getElementById("btn-export");
    if (e) e.addEventListener("click", exporterImage);
  })();
  E["btn-distribuer"].addEventListener("click", function () { agir({ op: "distribuer" }); });
  E["btn-passer"].addEventListener("click", function () { agir({ op: "passerAuSuivant" }); });
  E["btn-distribuer-tous"].addEventListener("click", function () { agir({ op: "distribuerATous" }); });
  E["btn-participants"].addEventListener("click", function () { E.panneau.hidden = !E.panneau.hidden; });
  E["fermer-panneau"].addEventListener("click", function () { E.panneau.hidden = true; });
  if (E["btn-vocal"]) E["btn-vocal"].addEventListener("click", function () { agir({ op: "definirLienVocal", url: (E["vocal-url"].value || "").trim() }); });
  E["code-chip"].addEventListener("click", function () { copier(etat.code, E["code-chip"].querySelector(".copier")); });
  E["btn-partager"].addEventListener("click", function () { copier(location.origin + location.pathname + "?s=" + etat.code, null, E["btn-partager"]); });
  function copier(txt, badge, btn) { try { navigator.clipboard.writeText(txt); } catch (e) {}
    if (badge) { var t = badge.textContent; badge.textContent = S.copie; badge.classList.add("copie-ok"); setTimeout(function () { badge.textContent = t; badge.classList.remove("copie-ok"); }, 1500); }
    if (btn) { var b = btn.textContent; btn.textContent = S.lienCopie; setTimeout(function () { btn.textContent = b; }, 1500); } }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (E.modal.classList.contains("on")) return fermerModal(); if (document.body.classList.contains("plein")) { document.body.classList.remove("plein"); setTimeout(function(){clampPan();applyView();dessinerFleches();},50); return; } deselect(); annulerFleche(); if (etat.outil === "fleche") setOutil("deplacer"); }
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
    E["mg-img"].src = BASE + (c.image ? (c.image.carte || c.image.grand) : ""); E["mg-num"].textContent = n; E["mg-tit"].textContent = c.titre; E["mg-vtit"].textContent = c.titre;
    E["mg-verso"].innerHTML = ""; (c.verso || []).forEach(function (p) { var el = document.createElement("p"); el.textContent = /\[A COMPLETER\]/i.test(p) ? S.texteAVenir : p; E["mg-verso"].appendChild(el); });
    var vface = E["carte-grande"].querySelector(".verso");
    if (c.image && c.image.verso) { E["mg-vimg"].src = BASE + (c.image.verso.carte || c.image.verso.grand); E["mg-vimg"].alt = c.titre + ". " + (c.verso || []).join(" "); vface.classList.add("a-image"); }
    else { E["mg-vimg"].removeAttribute("src"); vface.classList.remove("a-image"); }
    var mpo = document.getElementById("modal-poser"); if (mpo) mpo.hidden = (maCarte() !== n);
    E["carte-grande"].classList.remove("flip"); E.modal.classList.add("on"); }
  function fermerModal() { E.modal.classList.remove("on"); }
  E["modal-flip"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); });
  E["carte-grande"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); }); // clic = retourner
  E["modal-close"].addEventListener("click", fermerModal);
  (function () { var mpo = document.getElementById("modal-poser"); if (mpo) mpo.addEventListener("click", function () { poserMain(); fermerModal(); }); })();
  E.modal.addEventListener("click", function (e) { if (e.target === E.modal) fermerModal(); });

  /* ---------- utilitaires ---------- */
  function flash(m) { E.aide.textContent = m || ""; if (m) setTimeout(function () { if (E.aide.textContent === m) E.aide.textContent = ""; }, 3000); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  /* ---------- Export image du tableau (PNG) ---------- */
  function coinRond(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
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
      if (ctx.measureText(essai).width > maxw && ligne) { ctx.fillText(ligne, x, y); ligne = mots[i]; y += lh; if (++n >= maxLignes - 1) { ctx.fillText(mots.slice(i).join(" "), x, y); return; } }
      else ligne = essai;
    }
    ctx.fillText(ligne, x, y);
  }
  function teteFleche(ctx, fromx, fromy, tox, toy) {
    var a = Math.atan2(toy - fromy, tox - fromx), s = 9;
    ctx.beginPath(); ctx.moveTo(tox, toy);
    ctx.lineTo(tox - s * Math.cos(a - 0.42), toy - s * Math.sin(a - 0.42));
    ctx.lineTo(tox - s * Math.cos(a + 0.42), toy - s * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
  }
  function exporterImage() {
    if (!etat.vue || !etat.vue.tableau) return;
    var tab = etat.vue.tableau, cartes = tab.cartes || [], textes = tab.textes || [], fleches = tab.fleches || [];
    if (!cartes.length) return;
    var pad = 70, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    function eng(x, y, w, h) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x + w); maxy = Math.max(maxy, y + h); }
    cartes.forEach(function (c) { var el = etat.elCartes[c.n]; eng(c.x, c.y, el ? el.offsetWidth : 150, el ? el.offsetHeight : 150); });
    textes.forEach(function (t) { var el = etat.elTextes[t.id]; eng(t.x, t.y, el ? el.offsetWidth : 80, el ? el.offsetHeight : 30); });
    minx -= pad; miny -= pad; maxx += pad; maxy += pad;
    var W = maxx - minx, H = maxy - miny, scale = Math.max(0.5, Math.min(2, 2400 / W));
    var cv = document.createElement("canvas"); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    var ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.translate(-minx, -miny);
    ctx.fillStyle = document.body.classList.contains("sombre") ? "#14110d" : "#f4f2ec"; ctx.fillRect(minx, miny, W, H);

    var idx = {};
    fleches.forEach(function (f) {
      var A = centreCarte(f.de), B = centreCarte(f.vers); if (!A || !B) return;
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers); idx[cle] = (idx[cle] || 0); var k = idx[cle]++;
      var pa = bord(A, B.x, B.y), pb = bord(B, A.x, A.y);
      var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      var amp = Math.min(20, len * 0.09) * (k % 2 === 0 ? 1 : -1) * (1 + Math.floor(k / 2));
      var nx = -dy / len, ny = dx / len, cxp = mx + nx * amp, cyp = my + ny * amp;
      ctx.strokeStyle = f.bidir ? "#F0A860" : "#8a857b"; ctx.lineWidth = 2.2; ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(cxp, cyp, pb.x, pb.y); ctx.stroke();
      teteFleche(ctx, cxp, cyp, pb.x, pb.y); if (f.bidir) teteFleche(ctx, cxp, cyp, pa.x, pa.y);
      if (f.libelle) {
        ctx.font = "600 13px 'Montserrat',sans-serif"; var tw = ctx.measureText(f.libelle).width;
        ctx.fillStyle = "#efece6"; coinRond(ctx, cxp - tw / 2 - 7, cyp - 11, tw + 14, 22, 7); ctx.fill();
        ctx.strokeStyle = "#e6e2da"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#B0560A"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.libelle, cxp, cyp + 1);
      }
    });
    cartes.forEach(function (cc) {
      var c = etat.cartes[cc.n], el = etat.elCartes[cc.n], x = cc.x, y = cc.y, w = el ? el.offsetWidth : 150, h = el ? el.offsetHeight : 150, visH = Math.round(w / 1.6);
      ctx.save(); coinRond(ctx, x, y, w, h, 10); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.save(); coinRond(ctx, x, y, w, visH, 10); ctx.clip(); ctx.fillStyle = "#14110d"; ctx.fillRect(x, y, w, visH);
      var img = el && el.querySelector("img");
      if (img && img.complete && img.naturalWidth) dessinerCover(ctx, img, x, y, w, visH);
      ctx.restore();
      ctx.fillStyle = "#E8811C"; coinRond(ctx, x + 5, y + 5, 21, 21, 5); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 13px 'Saira Condensed',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(cc.n, x + 15.5, y + 16.5);
      ctx.fillStyle = "#1b1a17"; ctx.font = "700 13px 'Saira Condensed',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      texteMulti(ctx, c ? c.titre : "", x + 8, y + visH + 6, w - 16, 15, 3);
      ctx.restore();
      ctx.strokeStyle = "#e6e2da"; ctx.lineWidth = 1; coinRond(ctx, x, y, w, h, 10); ctx.stroke();
    });
    textes.forEach(function (t) {
      if (!t.contenu) return;
      var el = etat.elTextes[t.id], x = t.x, y = t.y, w = el ? el.offsetWidth : 80, h = el ? el.offsetHeight : 30;
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
    flash(EN ? "Image downloaded." : "Image téléchargée.");
  }
})();
