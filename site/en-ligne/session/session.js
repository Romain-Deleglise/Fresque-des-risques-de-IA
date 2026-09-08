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
    ouvrirAtelier: function (c) { return "Opening workshop " + c + ": enter your first name, then click “Open the session”."; },
    indispoMoment: "Service unavailable for now.", code6: "The code is 6 characters.",
    connexion: "Connecting…", codeInconnu: "Unknown code.", indispo: "Service unavailable.",
    rechargerErreur: "Could not load the board. Check your connection and reload the page.",
    partagezCode: function (c) { return "Share the code " + c + " with the participants."; },
    attenteCarte: "Waiting for a card…", sessionTerminee: "Session ended.",
    sessionClose: "The session was closed by the facilitator.",
    cliquezArrivee: "Click the target card.",
    flecheDepart: "Click the source card, then the target card.",
    flecheDouble: "Double link: source then target.", sensDouble: "Two-way link", texteClic: "Click the board to write.",
    animateur: "facilitator", carteN: function (n) { return "card " + n; },
    recues: function (k) { return k + " received"; },
    poser: "Place", glisserPoser: "Drag onto the board", agrandir: "Enlarge", agrandirCarte: "Enlarge the card", libelle: "label…", texteAVenir: "Text coming soon.",
    copie: "copied ✓", lienCopie: "Link copied ✓", copieEchec: "Copy failed. Select the code and copy it manually.",
    plein: "Fullscreen", quitterPlein: "Exit fullscreen", vous: "(you)", fondNoir: "Dark board", fondBlanc: "Light board",
    coachFermer: "Got it",
    coachPartager: function (c) { return "Share the code " + c + " so participants can join."; },
    coachPool: "Add cards to the shared pool (deck at the bottom) so the group can place them.",
    coachAttente: "Waiting for the facilitator to add cards…",
    coachPrendre: "Take a card from the pool and place it on the board.",
    prendre: "Place on board", retirerPool: "Remove from pool", poolTitre: "Pool",
    poolReduire: "Smaller cards", poolAgrandir: "Larger cards",
    occupee: "Someone is already taking that card.", occupeePar: function (q) { return q + " is taking this card"; },
    horsLigne: "offline", exclure: "Remove from the session", confirmExclure: function (p) { return "Remove " + p + " from the session?"; },
    titreRejoindre: "Join the workshop", sousRejoindre: "Enter your first name to join the shared board.",
    poolVide: "Waiting for the facilitator to add cards to the pool.",
    poolVideAnim: "Add cards to the pool from the deck below.",
    coachRelier: "To connect two cards: pick the “Link →” tool, then click one card and another."
  } : {
    prenomManquant: "Indiquez votre prénom.", creation: "Création…", echec: "Échec.",
    ouvrirAtelier: function (c) { return "Ouverture de l'atelier " + c + " : entrez votre prénom, puis cliquez sur « Ouvrir la session »."; },
    indispoMoment: "Service indisponible pour le moment.", code6: "Le code fait 6 caractères.",
    connexion: "Connexion…", codeInconnu: "Code inconnu.", indispo: "Service indisponible.",
    rechargerErreur: "Impossible de charger le tableau. Vérifiez votre connexion et rechargez la page.",
    partagezCode: function (c) { return "Partagez le code " + c + " avec les participants."; },
    attenteCarte: "En attente d'une carte…", sessionTerminee: "Session terminée.",
    sessionClose: "La session a été close par l'animateur.",
    cliquezArrivee: "Cliquez la carte d'arrivée.",
    flecheDepart: "Cliquez la carte de départ, puis la carte d'arrivée.",
    flecheDouble: "Lien double : départ puis arrivée.", sensDouble: "Lien à double sens", texteClic: "Cliquez le tableau pour écrire.",
    animateur: "animateur", carteN: function (n) { return "carte " + n; },
    recues: function (k) { return k + " reçue" + (k > 1 ? "s" : ""); },
    poser: "Poser", glisserPoser: "Glissez sur le tableau", agrandir: "Agrandir", agrandirCarte: "Agrandir la carte", libelle: "libellé…", texteAVenir: "Texte à venir.",
    copie: "copié ✓", lienCopie: "Lien copié ✓", copieEchec: "Copie impossible. Sélectionnez le code et copiez-le à la main.",
    plein: "Plein écran", quitterPlein: "Quitter le plein écran", vous: "(vous)", fondNoir: "Fond noir", fondBlanc: "Fond blanc",
    coachFermer: "Compris",
    coachPartager: function (c) { return "Partagez le code " + c + " pour que des participant·es rejoignent."; },
    coachPool: "Ajoutez des cartes au pool commun (le jeu, en bas) pour que le groupe les pose.",
    coachAttente: "En attente que l'animateur mette des cartes à disposition…",
    coachPrendre: "Prenez une carte du pool et posez-la sur le tableau.",
    prendre: "Poser sur le tableau", retirerPool: "Retirer du pool", poolTitre: "Pool",
    poolReduire: "Cartes plus petites", poolAgrandir: "Cartes plus grandes",
    occupee: "Quelqu'un est déjà en train de prendre cette carte.", occupeePar: function (q) { return q + " prend cette carte"; },
    horsLigne: "hors ligne", exclure: "Exclure de la session", confirmExclure: function (p) { return "Exclure " + p + " de la session ?"; },
    titreRejoindre: "Rejoindre l'atelier", sousRejoindre: "Entrez votre prénom pour rejoindre le tableau partagé.",
    poolVide: "En attente que l'animateur mette des cartes dans le pool.",
    poolVideAnim: "Ajoutez des cartes au pool depuis le jeu, en bas.",
    coachRelier: "Pour relier deux cartes : outil « Lien → », puis cliquez une carte et une autre."
  };

  function traduireStatique() {
    if (!EN) return;
    document.title = "Session · The AI Risks Collage";
    var txt = {
      "#lobby h1": "Facilitate remotely",
      ".lobby-sous": "Run the collage remotely, on a board shared live in your browser. Nothing to install, no account.",
      "#lobby section:nth-of-type(1) h2": "Open a session",
      'label[for="anim-prenom"]': "Your first name",
      'label[for="anim-code"]': "Workshop code (optional)",
      "#aide-ouvrir": "Scheduled a workshop? Enter the code from your e-mail to open that session: your registrants can join with the same code. Otherwise leave it blank.",
      "#btn-creer": "Open the session",
      ".lobby-sep span": "or",
      "#lobby section:nth-of-type(2) h2": "Join",
      'label[for="join-code"]': "Session code",
      'label[for="join-prenom"]': "Your first name",
      "#btn-rejoindre": "Join",
      "#btn-partager": "Copy the link",
      "#deck-titre": "Card deck", "#deck-toggle": "Deck",
      "#z-tout": "Fit all", "#btn-plein": "Fullscreen",
      "#btn-barres": "Hide the bars", "#btn-barres-show": "Show the bars",
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
      ["#z-moins", "aria-label", "Zoom out"], ["#z-plus", "aria-label", "Zoom in"],
      ["#fermer-panneau", "aria-label", "Close"], ["#modal-close", "aria-label", "Close"],
      ["#anim-prenom", "placeholder", "First name"], ["#join-prenom", "placeholder", "First name"],
      ["#anim-code", "placeholder", "Leave blank for an auto code"],
      ['.tool[data-outil="deplacer"]', "title", "Hand: move and pan the board"], ['.tool[data-outil="deplacer"]', "aria-label", "Hand: move and pan the board"],
      ['.tool[data-outil="fleche"]', "title", "Link: click the source card, then the target"], ['.tool[data-outil="fleche"]', "aria-label", "Link two cards"],
      ['.tool[data-outil="fleche2"]', "title", "Two-way link: click one card, then the other"], ['.tool[data-outil="fleche2"]', "aria-label", "Two-way link"],
      ['.tool[data-outil="texte"]', "title", "Note: click the board to write"], ['.tool[data-outil="texte"]', "aria-label", "Add a note"]
    ];
    attr.forEach(function (a) { var el = document.querySelector(a[0]); if (el) el.setAttribute(a[1], a[2]); });
    document.querySelectorAll(".marque").forEach(function (m) {
      m.childNodes[m.childNodes.length - 1].nodeValue = " The AI Risks Collage";
    });
    var setFirst = function (sel, v) { var el = document.querySelector(sel); if (el && el.firstChild) el.firstChild.nodeValue = v; };
    setFirst("#code-chip", "Code ");            // « Code <b> »
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
  // Polling adaptatif : rapide pendant l'activite (collaboration fluide),
  // econome au repos. On garde un mode rapide quelques secondes apres chaque
  // action locale ou changement recu.
  // Le serveur maintient la requete d'etat ouverte jusqu'a un changement
  // ("hold-poll"), donc l'ecart entre deux requetes peut etre tres court : la
  // requete elle-meme dure. On garde deux cadences de repli au cas ou la
  // plateforme rende la main tout de suite (requete non tenue).
  var POLL_RAPIDE = 100, POLL_LENT = 350, FENETRE_RAPIDE_MS = 4000;
  var rapideJusqu = 0;
  function activite() { rapideJusqu = Date.now() + FENETRE_RAPIDE_MS; }

  var E = {}; // éléments DOM
  ["lobby","app","anim-prenom","anim-code","btn-creer","join-code","join-prenom","btn-rejoindre","lobby-msg",
   "code-val","code-chip","btn-partager","nb-part","etat-conn","carte0-txt",
   "scene","monde","fleches","pool","deck","deck-cartes","deck-compte","deck-toggle","aide","z-niv","z-moins","z-plus","z-tout","btn-plein",
   "btn-participants","panneau","fermer-panneau",
   "btn-barres","btn-barres-show",
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
  // Identite persistante par NAVIGATEUR (localStorage) : si on quitte puis on
  // revient (rechargement, coupure reseau, fermeture d'onglet), on reprend la
  // MEME place au lieu de creer un nouveau participant. Deux cles distinctes :
  //  - participant : "fresque:CODE"
  //  - animateur   : "fresque:anim:CODE"
  // Ainsi, dans un meme navigateur, l'animateur et un participant restent deux
  // identites separees (utile pour tester les deux roles sur un seul PC). Pour
  // simuler DEUX participants sur la meme machine, utiliser une fenetre privee.
  function jetonTab(code) { try { return localStorage.getItem("fresque:" + code); } catch (e) { return null; } }
  function stockerJetonTab(code, j) { try { localStorage.setItem("fresque:" + code, j); } catch (e) {} }
  function jetonAnim(code) { try { return localStorage.getItem("fresque:anim:" + code); } catch (e) { return null; } }
  function stockerJetonAnim(code, j) { try { localStorage.setItem("fresque:anim:" + code, j); } catch (e) {} }
  // Enregistre le jeton dans la cle correspondant au role (sans croiser les deux).
  function memoriser(code, jeton, role) { if (role === "animateur") stockerJetonAnim(code, jeton); else stockerJetonTab(code, jeton); }

  /* ---------- Lobby ---------- */
  function lobbyMsg(t, type) { E["lobby-msg"].textContent = t || ""; E["lobby-msg"].className = "lobby-msg " + (type || ""); }

  var codeSouhaite = null; // code reserve (atelier) a ouvrir, transmis par ?ouvrir=
  E["btn-creer"].addEventListener("click", function () {
    var prenom = (E["anim-prenom"].value || "").trim();
    if (!prenom) { lobbyMsg(S.prenomManquant, "err"); return; }
    // Code de l'atelier saisi (ou pre-rempli par ?ouvrir=) : la session s'ouvre
    // AVEC ce code, pour que les inscrit·es la rejoignent. Vide = code auto.
    var code = ((E["anim-code"] && E["anim-code"].value) || codeSouhaite || "").trim().toUpperCase();
    if (code && !/^[A-Z0-9]{6}$/.test(code)) { lobbyMsg(S.code6, "err"); return; }
    E["btn-creer"].disabled = true; lobbyMsg(S.creation);
    api("creer", { prenom: prenom, code: code || undefined }).then(function (res) {
      E["btn-creer"].disabled = false;
      if (res.d && res.d.existe) { // la session existe deja : on rejoint (reprise animateur si jeton connu)
        var jr = jetonTab(res.d.code) || jetonAnim(res.d.code);
        api("rejoindre", { code: res.d.code, prenom: prenom, jeton: jr }).then(function (r2) {
          if (r2.d && r2.d.jeton) { memoriser(res.d.code, r2.d.jeton, r2.d.role); demarrer(res.d.code, r2.d.jeton, r2.d.role, r2.d.etat, r2.d.moi); }
          else lobbyMsg((r2.d && r2.d.refus && r2.d.refus.message) || S.echec, "err");
        }).catch(function () { lobbyMsg(S.indispoMoment, "err"); });
        return;
      }
      if (res.d && res.d.code) { memoriser(res.d.code, res.d.jeton, res.d.role); demarrer(res.d.code, res.d.jeton, res.d.role, res.d.etat); }
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
    // On ne reutilise QUE le jeton de cet onglet (sessionStorage) : un 2e onglet
    // du meme navigateur rejoint donc comme une personne distincte.
    api("rejoindre", { code: code, prenom: prenom, jeton: jetonTab(code) }).then(function (res) {
      E["btn-rejoindre"].disabled = false;
      if (res.d && res.d.jeton) { memoriser(code, res.d.jeton, res.d.role); demarrer(code, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      else lobbyMsg((res.d && res.d.refus && res.d.refus.message) || S.codeInconnu, "err");
    }).catch(function () { E["btn-rejoindre"].disabled = false; lobbyMsg(S.indispo, "err"); });
  }

  // reprise auto si ?s=CODE et jeton stocké
  (function () {
    var m = new URLSearchParams(location.search).get("s");
    if (m) { m = m.toUpperCase(); E["join-code"].value = m;
      var j = jetonTab(m) || jetonAnim(m); // reprise (participant ou animateur)
      if (j) api("rejoindre", { code: m, jeton: j }).then(function (res) {
        if (res.d && res.d.jeton) { memoriser(m, res.d.jeton, res.d.role); demarrer(m, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      }).catch(function(){});
    }
  })();

  // Liens des e-mails : ?ouvrir=CODE (animateur, ouvre/reprend l'atelier reserve),
  // ?code=CODE (participant, pre-remplit le code a rejoindre).
  // Lobby mono-role : depuis un lien d'e-mail, on n'affiche que la colonne utile
  // (le role est deja decide dans le mail), pour ne pas hesiter animer/participer.
  function lobbyRole(role) {
    document.body.classList.add("lobby-solo", role === "animateur" ? "lobby-animateur" : "lobby-participant");
    var h1 = document.querySelector("#lobby h1");
    var sous = document.querySelector(".lobby-sous");
    if (role === "participant") {
      if (h1) h1.textContent = S.titreRejoindre;
      if (sous) sous.textContent = S.sousRejoindre;
    }
  }
  (function () {
    var params = new URLSearchParams(location.search);
    var pre = (params.get("code") || "").toUpperCase();
    if (pre) { E["join-code"].value = pre; lobbyRole("participant"); try { E["join-prenom"].focus(); } catch (e) {} }
    var o = (params.get("ouvrir") || "").toUpperCase();
    if (!o) return;
    lobbyRole("animateur");
    codeSouhaite = o;
    if (E["anim-code"]) E["anim-code"].value = o; // rendre le code visible côté « Ouvrir »
    var j = jetonAnim(o) || jetonTab(o); // reprise : jeton animateur en priorite
    if (j) { // l'animateur a deja ouvert la session : on reprend
      api("rejoindre", { code: o, jeton: j }).then(function (res) {
        if (res.d && res.d.jeton) { memoriser(o, res.d.jeton, res.d.role); demarrer(o, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
        else { lobbyMsg(S.ouvrirAtelier(o)); try { E["anim-prenom"].focus(); } catch (e) {} }
      }).catch(function () { lobbyMsg(S.ouvrirAtelier(o)); });
      return;
    }
    lobbyMsg(S.ouvrirAtelier(o));
    try { E["anim-prenom"].focus(); } catch (e) {}
  })();

  /* ---------- Démarrage session ---------- */
  function demarrer(code, jeton, role, vue, moi) {
    _idMoi = moi || null;
    etat.code = code; etat.jeton = jeton; etat.role = role;
    document.body.classList.add("role-" + role);
    E.lobby.hidden = true; E.app.hidden = false;
    E["code-val"].textContent = code;
    // URL de reprise pour cet onglet : un rechargement rejoint la meme place.
    try { history.replaceState(null, "", location.pathname + "?s=" + code); } catch (e) {}
    demarrerQuandCartes(vue, 0);
  }
  // Les cartes (data/cartes.json) sont indispensables au rendu du tableau.
  // Si le chargement echoue (reseau capricieux), on reessaie avec un delai
  // croissant plutot que de rester sur un tableau nu et sans instructions.
  function demarrerQuandCartes(vue, essai) {
    chargerCartes().then(function () {
      centrer(); appliquerEtat(vue); setOutil("deplacer");
      flash(etat.role === "animateur" ? S.partagezCode(etat.code) : S.attenteCarte);
      boucle();
    }).catch(function () {
      if (essai < 5) {
        flash(S.connexion);
        setTimeout(function () { demarrerQuandCartes(vue, essai + 1); }, 900 * (essai + 1));
      } else {
        flash(S.rechargerErreur);
      }
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
      pollTimer = setTimeout(boucle, Date.now() < rapideJusqu ? POLL_RAPIDE : POLL_LENT);
    });
  }
  function pollerVite() { activite(); clearTimeout(pollTimer); pollTimer = setTimeout(boucle, 60); }
  function marquerConnexion(ok) { if (ok === hs) { hs = !ok; E["etat-conn"].classList.toggle("hs", !ok); } }

  /* ---------- Application de l'état serveur (déclaratif) ---------- */
  function appliquerEtat(vue) {
    if (!vue) return;
    if (vue.version < etat.version) return; // vieil état
    if (vue.version !== etat.version) activite(); // changement reçu : on reste réactif
    etat.vue = vue; etat.version = vue.version;
    E["nb-part"].textContent = vue.participants.length + 1; // + l'animateur (présent)
    rendreParticipants(vue);
    rendrePool(vue);
    rendreDeck(vue);
    rendreVocal(vue);
    rendreTableau(vue.tableau);
    rendrePing(vue.ping);
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
    var pool = v.pool || [];
    if (etat.role === "animateur") {
      if ((v.participants || []).length === 0) return S.coachPartager(etat.code);
      if (pool.length === 0 && cartes.length === 0) return S.coachPool;
      if (cartes.length >= 2) return S.coachRelier;
      return null;
    }
    if (pool.length > 0 && cartes.length === 0) return S.coachPrendre;
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
    // Distinguer les homonymes : si un prénom apparaît plusieurs fois, on
    // numérote les occurrences (Antoine ·1, Antoine ·2) pour que tout le monde
    // s'y retrouve.
    var tous = [vue.animateur].concat(vue.participants || []);
    var compte = {}; tous.forEach(function (x) { var k = (x.prenom || "").toLowerCase(); compte[k] = (compte[k] || 0) + 1; });
    var vus = {};
    function nomAffiche(prenom) {
      var k = (prenom || "").toLowerCase();
      if (compte[k] > 1) { vus[k] = (vus[k] || 0) + 1; return prenom + " ·" + vus[k]; }
      return prenom;
    }
    var jeSuisAnim = etat.role === "animateur";
    function ligne(x, role, estMoi) {
      var li = document.createElement("li");
      li.className = (estMoi ? "moi" : "") + (x.connecte ? "" : " hors");
      var suff = role === "anim"
        ? '<span class="anim">' + S.animateur + '</span>'
        : (x.connecte ? '' : '<span class="info hors-txt">' + esc(S.horsLigne) + '</span>');
      // Bouton exclure (animateur, pour un participant).
      var excl = (jeSuisAnim && role === "part")
        ? '<button class="part-x" data-excl="' + esc(x.id) + '" title="' + esc(S.exclure) + '" aria-label="' + esc(S.exclure) + '">✕</button>' : '';
      li.innerHTML = '<span class="pastille' + (x.connecte ? '' : ' hs') + '"></span>'
        + '<span class="nom">' + esc(nomAffiche(x.prenom)) + '</span>'
        + (estMoi ? '<span class="moi-tag">' + S.vous + '</span>' : '')
        + suff + excl;
      var bx = li.querySelector('[data-excl]');
      if (bx) bx.addEventListener("click", function () {
        if (window.confirm(S.confirmExclure(x.prenom))) agir({ op: "exclure", id: x.id });
      });
      return li;
    }
    ul.appendChild(ligne(vue.animateur, "anim", jeSuisAnim));
    (vue.participants || []).forEach(function (p) {
      ul.appendChild(ligne(p, "part", p.id === _idMoi));
    });
  }
  function rendreVocal(vue) {
    if (vue.lienVocal) { E["vocal-lien"].hidden = false; E["vocal-lien"].href = vue.lienVocal; if (E["vocal-url"]) E["vocal-url"].value = vue.lienVocal; }
    else E["vocal-lien"].hidden = true;
  }
  // Couleur par lot (aide l'animateur a voir ou il en est dans la partie).
  var LOT_COULEUR = { 1: "#E8811C", 2: "#2f7d4f", 3: "#3b6ea5", 4: "#8a4fb3", 5: "#c1444e" };

  // Pool commun : cartes mises a disposition par l'animateur, visibles de tou·tes.
  // Un clic « Poser » place la carte sur la table (tout le monde). L'animateur
  // peut aussi la retirer du pool (x). Chacun peut replier / deplier le pool et
  // regler la taille des cartes (retreci / agrandi), memorisee par navigateur.
  var poolReduit = false;
  var POOL_TAILLES = [116, 150, 190, 240]; // largeurs possibles des cartes du pool
  var poolTaille = 1;
  try { var pt = parseInt(localStorage.getItem("fresque:pooltaille"), 10); if (pt >= 0 && pt < POOL_TAILLES.length) poolTaille = pt; } catch (e) {}
  function appliquerTaillePool() {
    var z = E["pool"]; if (z) z.style.setProperty("--pw", POOL_TAILLES[poolTaille] + "px");
  }
  function changerTaillePool(delta) {
    poolTaille = Math.max(0, Math.min(POOL_TAILLES.length - 1, poolTaille + delta));
    try { localStorage.setItem("fresque:pooltaille", String(poolTaille)); } catch (e) {}
    appliquerTaillePool();
    var z = E["pool"]; if (z) { var b = z.querySelector(".pool-moins"), p = z.querySelector(".pool-plus");
      if (b) b.disabled = poolTaille === 0; if (p) p.disabled = poolTaille === POOL_TAILLES.length - 1; }
  }
  function rendrePool(vue) {
    var z = E["pool"]; if (!z) return;
    var pool = vue.pool || [];
    z.innerHTML = "";
    appliquerTaillePool();
    z.classList.toggle("vide", pool.length === 0 && !poolReduit);
    // En-tete avec bascule replier / deplier et reglage de taille.
    var tete = document.createElement("div"); tete.className = "pool-tete";
    var tog = document.createElement("button"); tog.type = "button"; tog.className = "pool-toggle";
    tog.setAttribute("aria-expanded", poolReduit ? "false" : "true");
    tog.textContent = (poolReduit ? "▸ " : "▾ ") + S.poolTitre + " (" + pool.length + ")";
    tog.addEventListener("click", function () { poolReduit = !poolReduit; rendrePool(etat.vue || vue); });
    tete.appendChild(tog);
    if (!poolReduit && pool.length) {
      var moins = document.createElement("button"); moins.type = "button"; moins.className = "pool-taille pool-moins";
      moins.textContent = "−"; moins.setAttribute("aria-label", S.poolReduire); moins.title = S.poolReduire;
      moins.disabled = poolTaille === 0;
      moins.addEventListener("click", function () { changerTaillePool(-1); });
      var plus = document.createElement("button"); plus.type = "button"; plus.className = "pool-taille pool-plus";
      plus.textContent = "+"; plus.setAttribute("aria-label", S.poolAgrandir); plus.title = S.poolAgrandir;
      plus.disabled = poolTaille === POOL_TAILLES.length - 1;
      plus.addEventListener("click", function () { changerTaillePool(1); });
      tete.appendChild(moins); tete.appendChild(plus);
    }
    z.appendChild(tete);
    if (poolReduit) return;
    if (!pool.length) {
      var v = document.createElement("p"); v.className = "pool-vide";
      v.textContent = etat.role === "animateur" ? S.poolVideAnim : S.poolVide;
      z.appendChild(v); return;
    }
    var wrap = document.createElement("div"); wrap.className = "pool-cartes";
    var reserv = vue.reservations || {};
    var moiNom = nomMoi();
    pool.forEach(function (n) {
      var c = etat.cartes[n];
      var d = document.createElement("div"); d.className = "pool-carte"; d.dataset.n = n;
      if (c && c.lot) d.style.setProperty("--lot", LOT_COULEUR[c.lot] || "#8a857b");
      // Verrou : carte en cours de prise par quelqu'un d'autre.
      var par = reserv[n];
      var verrou = par && par !== moiNom;
      if (verrou) d.classList.add("occupee");
      d.innerHTML = '<div class="vis"><img alt="" src="' + BASE + (c && c.image ? c.image.vignette : "") + '"><span class="num">' + n + '</span>'
        + (verrou ? '<span class="pool-verrou">🔒 ' + esc(par) + '</span>' : '') + '</div>'
        + '<div class="tit">' + esc(c ? c.titre : "") + '</div>'
        + '<div class="pool-actions"><button class="btn primaire" data-a="poser"' + (verrou ? ' disabled' : '') + '>' + esc(S.prendre) + '</button>'
        + (etat.role === "animateur" ? '<button class="pool-x" data-a="retirer" title="' + esc(S.retirerPool) + '" aria-label="' + esc(S.retirerPool) + '">✕</button>' : '')
        + '</div>';
      d.title = verrou ? (S.occupeePar ? S.occupeePar(par) : par) : (c && c.titre ? n + " · " + c.titre : "");
      var poser = d.querySelector('[data-a="poser"]');
      poser.addEventListener("click", function (e) { e.stopPropagation(); if (!verrou) agir({ op: "poserCarte", n: n, rect: rectVisible() }); });
      var bx = d.querySelector('[data-a="retirer"]'); if (bx) bx.addEventListener("click", function (e) { e.stopPropagation(); agir({ op: "poolRetirer", n: n }); });
      // Glisser-deposer : depuis la carte du pool vers le tableau.
      if (!verrou) d.addEventListener("pointerdown", function (e) { demarrerGlissePool(e, n, d); });
      wrap.appendChild(d);
    });
    z.appendChild(wrap);
  }
  function nomMoi() { return etat.role === "animateur" ? (etat.vue && etat.vue.animateur && etat.vue.animateur.prenom) || "" : (function () { var m = (etat.vue && etat.vue.participants || []).find(function (p) { return p.id === _idMoi; }); return m ? m.prenom : ""; })(); }

  /* ---------- Glisser-deposer une carte du pool vers le tableau ----------
     Fiabilite : au premier vrai mouvement on RESERVE la carte cote serveur (les
     autres la voient verrouillee). Un fantome suit le curseur. Au relacher sur
     le tableau, on POSE au point de depot (le serveur tranche : une seule prise
     possible). Ailleurs, on LIBERE la reservation. Un clic simple (sans bouger)
     ne declenche rien : c'est le bouton « Poser » qui agit. */
  var glissePool = null;
  function demarrerGlissePool(e, n, elCarte) {
    if (e.button && e.button !== 0) return;
    if (e.target.closest(".pool-actions") || e.target.closest(".pool-x")) return; // clics boutons
    e.preventDefault();
    glissePool = { n: n, x0: e.clientX, y0: e.clientY, bouge: false, reserve: false, fantome: null, refuse: false };
    document.addEventListener("pointermove", glisserPoolMove, true);
    document.addEventListener("pointerup", glisserPoolUp, true);
    document.addEventListener("pointercancel", glisserPoolUp, true);
  }
  function glisserPoolMove(e) {
    var g = glissePool; if (!g) return;
    if (!g.bouge && Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 5) return;
    if (!g.bouge) {
      g.bouge = true;
      // Reserver au serveur ; si refuse (deja pris), on annule le glissement.
      api("agir", { code: etat.code, jeton: etat.jeton, intention: { op: "reserverPool", n: g.n } }).then(function (res) {
        if (res.d && res.d.refus) { g.refuse = true; flash(res.d.refus.message || (S.occupee || "")); finGlissePool(true); }
        else { g.reserve = true; if (res.d && res.d.etat) appliquerEtat(res.d.etat); }
      }).catch(function () {});
      g.fantome = document.createElement("div"); g.fantome.className = "pool-fantome";
      var c = etat.cartes[g.n];
      g.fantome.innerHTML = '<img alt="" src="' + BASE + (c && c.image ? c.image.vignette : "") + '"><span>' + g.n + "</span>";
      document.body.appendChild(g.fantome);
    }
    if (g.fantome) { g.fantome.style.left = e.clientX + "px"; g.fantome.style.top = e.clientY + "px"; }
    // Retour visuel : la scene s'illumine quand on survole une zone deposable.
    E.scene.classList.toggle("depot-actif", zoneDepot(e.clientX, e.clientY));
  }
  function glisserPoolUp(e) {
    var g = glissePool; if (!g) return;
    if (g.refuse) { finGlissePool(true); return; }
    if (g.bouge && zoneDepot(e.clientX, e.clientY)) {
      var w = versMonde(e.clientX, e.clientY);
      agir({ op: "poserCarte", n: g.n, pos: { x: Math.round(w.x), y: Math.round(w.y) }, rect: rectVisible() });
      finGlissePool(false); // la carte quitte le pool : pas besoin de liberer
    } else {
      // Depose hors du tableau (ou simple clic) : on relache la reservation.
      if (g.bouge && g.reserve) agir({ op: "libererPool", n: g.n });
      finGlissePool(false);
    }
  }
  function finGlissePool(silence) {
    var g = glissePool; glissePool = null;
    document.removeEventListener("pointermove", glisserPoolMove, true);
    document.removeEventListener("pointerup", glisserPoolUp, true);
    document.removeEventListener("pointercancel", glisserPoolUp, true);
    E.scene.classList.remove("depot-actif");
    if (g && g.fantome) g.fantome.remove();
  }
  function surScene(cx, cy) { var r = rectScene(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; }
  // Zone de depot valide : sur la scene, mais PAS au-dessus du pool ni des barres
  // (sinon lacher la carte sur le pool la poserait par erreur). Deposer ailleurs
  // que sur cette zone annule la prise et libere la reservation.
  function zoneDepot(cx, cy) {
    if (!surScene(cx, cy)) return false;
    var el = document.elementFromPoint(cx, cy);
    if (el && el.closest && (el.closest("#pool") || el.closest(".deck") || el.closest(".toolbar") || el.closest(".topbar") || el.closest(".pool-fantome"))) return false;
    return true;
  }

  // Jeu complet (animateur) : clic pour mettre une carte dans le pool. Grisee si
  // deja dans le pool ou posee. Construit une seule fois, etat mis a jour ensuite.
  var deckFait = false;
  function construireDeck() {
    var z = E["deck-cartes"]; if (!z || deckFait) return; deckFait = true;
    for (var n = 1; n <= 38; n++) {
      var c = etat.cartes[n]; if (!c) continue;
      var b = document.createElement("button"); b.type = "button"; b.className = "deck-carte"; b.dataset.n = n;
      b.style.setProperty("--lot", LOT_COULEUR[c.lot] || "#8a857b");
      b.title = n + " · " + c.titre;
      b.innerHTML = '<span class="dn">' + n + '</span><span class="dt">' + esc(c.titre) + '</span>';
      b.addEventListener("click", function () { agir({ op: "poolAjouter", n: +this.dataset.n }); });
      z.appendChild(b);
    }
  }
  function rendreDeck(vue) {
    if (etat.role !== "animateur") return;
    construireDeck();
    var z = E["deck-cartes"]; if (!z) return;
    var etatCarte = {};
    (vue.pool || []).forEach(function (n) { etatCarte[n] = "pool"; });
    ((vue.tableau && vue.tableau.cartes) || []).forEach(function (c) { etatCarte[c.n] = "table"; });
    Array.prototype.forEach.call(z.children, function (b) {
      var st = etatCarte[+b.dataset.n];
      b.classList.toggle("en-pool", st === "pool");
      b.classList.toggle("en-table", st === "table");
      b.disabled = !!st;
    });
    if (E["deck-compte"]) E["deck-compte"].textContent = (vue.pool || []).length + " / 8";
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
    // Encadre fixe au survol (utile quand on est dezoome).
    el.addEventListener("mouseenter", function () { montrerSurvol(n); });
    el.addEventListener("mouseleave", masquerSurvol);
    el.addEventListener("click", function (e) {
      // Un vrai glissement se termine par un « click » parasite : on l'ignore
      // pour ne pas selectionner / tracer une fleche par accident.
      if (el._justDrag && Date.now() - el._justDrag < 320) { el._justDrag = 0; return; }
      if (estFleche(etat.outil)) { e.stopPropagation(); clicFleche(n, el); }
      else if (etat.role === "animateur") { selCarte(n, el); }
    });
    glisserCarte(el, n);
    return el;
  }
  function flashPose(el) { el.classList.add("pose-anim"); setTimeout(function () { el.classList.remove("pose-anim"); }, 700); }
  // Encadre fixe (haut de la scene) qui affiche le titre de la carte survolee.
  var _survol = null;
  function montrerSurvol(n) {
    var c = etat.cartes[n]; if (!c) return;
    if (!_survol) { _survol = document.getElementById("survol-carte"); }
    if (!_survol) return;
    _survol.textContent = n + " · " + c.titre;
    _survol.hidden = false;
  }
  function masquerSurvol() { if (_survol) _survol.hidden = true; }

  function glisserCarte(el, n) {
    var st = null, bouge = false;
    el.addEventListener("pointerdown", function (e) {
      if (etat.outil !== "deplacer" || e.target.closest(".agr") || (e.button && e.button !== 0)) return;
      e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (x) {} el.style.cursor = "grabbing";
      etat.dragN = n; bouge = false; st = { mx: e.clientX, my: e.clientY, x: el._x || 0, y: el._y || 0 };
    });
    el.addEventListener("pointermove", function (e) {
      if (!st) return;
      if (!bouge && Math.abs(e.clientX - st.mx) + Math.abs(e.clientY - st.my) > 3) bouge = true;
      var x = Math.max(0, Math.min(PLAN_W - el.offsetWidth, st.x + (e.clientX - st.mx) / etat.zoom));
      var y = Math.max(0, Math.min(PLAN_H - el.offsetHeight, st.y + (e.clientY - st.my) / etat.zoom));
      el._x = x; el._y = y; el.style.left = x + "px"; el.style.top = y + "px"; dessinerFleches();
    });
    function fin(e, annule) {
      if (!st) return; st = null; el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch (x) {}
      etat.dragN = null;
      if (bouge && !annule) { el._justDrag = Date.now(); agir({ op: "deplacerCarte", n: n, x: el._x, y: el._y }); }
      // Annulation (pointercancel) : on ne touche pas au serveur, la carte
      // reprend sa derniere position connue au prochain rendu.
    }
    el.addEventListener("pointerup", function (e) { fin(e, false); });
    el.addEventListener("pointercancel", function (e) { fin(e, true); });
  }

  /* ---------- Flèches ---------- */
  function estFleche(o) { return o === "fleche" || o === "fleche2"; }
  function clicFleche(n, el) {
    if (!etat.flecheDepart) { etat.flecheDepart = { n: n, el: el }; el.classList.add("depart"); flash(S.cliquezArrivee); }
    else if (etat.flecheDepart.n === n) { annulerFleche(); }
    else { agir({ op: "creerFleche", de: etat.flecheDepart.n, vers: n, bidir: etat.outil === "fleche2" }); annulerFleche(); setOutil("deplacer"); }
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
    // Fond blanc + texte foncé fixe (sinon, en thème sombre, --ink est clair et
    // le texte devient illisible sur le fond blanc).
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-ui);font-size:.85rem;border:1px solid var(--accent);border-radius:6px;padding:.25rem .45rem;background:#ffffff;color:#1b1a17;width:9rem;box-shadow:0 4px 12px rgba(27,26,23,.14)";
    var envoi = null;
    function commitLib() { clearTimeout(envoi); agir({ op: "libellerFleche", id: id, libelle: editLib.value }); }
    editLib._commit = commitLib;
    editLib.addEventListener("input", function () { clearTimeout(envoi); envoi = setTimeout(commitLib, 350); });
    editLib.addEventListener("change", commitLib);
    editLib.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commitLib(); deselect(); } });
    E.scene.appendChild(editLib);
    setTimeout(function () { try { editLib.focus(); editLib.select(); } catch (e) {} }, 0);
    croix = boutonCroix("fleche-croix", function () { agir({ op: "supprimerFleche", id: id }); deselect(); });
    // Le sens de la fleche se choisit a la creation (outils « lien » / « lien ↔ »).
    positionnerEditeurs();
  }
  function selCarte(n, el) { deselect(); etat.sel = { type: "carte", n: n }; el.classList.add("sel"); }
  function boutonCroix(cls, onClick) { var b = document.createElement("button"); b.className = cls; b.textContent = "✕"; b.addEventListener("click", onClick); E.scene.appendChild(b); return b; }
  function deselect() {
    if (etat.sel && etat.sel.type === "carte") { var el = etat.elCartes[etat.sel.n]; if (el) el.classList.remove("sel"); }
    if (editLib && editLib._commit) { try { editLib._commit(); } catch (e) {} } // valider le libellé en cours
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
    el.addEventListener("click", function (e) {
      if (el._justDrag && Date.now() - el._justDrag < 320) { el._justDrag = 0; return; }
      e.stopPropagation(); editerTexte(el);
    });
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
    if (el.getAttribute("contenteditable") === "true" || etat.outil !== "deplacer" || (e.button && e.button !== 0)) return;
    e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (x) {} el._drag = true;
    var bouge = false, st = { mx: e.clientX, my: e.clientY, x: el._x || 0, y: el._y || 0 };
    function mv(ev) { if (!bouge && Math.abs(ev.clientX - st.mx) + Math.abs(ev.clientY - st.my) > 3) bouge = true;
      var x = st.x + (ev.clientX - st.mx) / etat.zoom, y = st.y + (ev.clientY - st.my) / etat.zoom; el._x = x; el._y = y; el.style.left = x + "px"; el.style.top = y + "px"; }
    function fin(ev, annule) {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancel);
      el._drag = false; try { el.releasePointerCapture(ev.pointerId); } catch (x) {}
      if (bouge && !annule) { el._justDrag = Date.now(); agir({ op: "deplacerTexte", id: el._id, x: el._x, y: el._y }); }
    }
    function up(ev) { fin(ev, false); }
    function cancel(ev) { fin(ev, true); }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", cancel);
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
    activite(); // action locale : on passe en mode reactif
    api("agir", { code: etat.code, jeton: etat.jeton, intention: intention }).then(function (res) {
      if (res.d && res.d.refus && res.d.refus.message) flash(res.d.refus.message);
      if (res.d && res.d.etat) appliquerEtat(res.d.etat);
      pollerVite(); // reprendre l'ecoute tout de suite (voir les autres vite)
    }).catch(function () { marquerConnexion(false); });
  }

  /* ---------- Ping (cercle qui s'agrandit) ---------- */
  // Un seul ping courant cote serveur ; on n'anime que s'il est recent et pas
  // deja vu (par id), et jamais le sien (deja anime au clic).
  var dernierPing = 0;
  function rendrePing(p) {
    if (!p || !p.id || p.id === dernierPing) return;
    dernierPing = p.id;
    if (Date.now() - (p.ts || 0) > 4000) return; // trop vieux (on vient d'arriver)
    montrerPing(p.x, p.y, p.par || "");
  }
  function montrerPing(x, y, nom) {
    var el = document.createElement("div");
    el.className = "ping";
    el.style.left = x + "px"; el.style.top = y + "px";
    var c = document.createElement("span"); c.className = "ping-cercle"; el.appendChild(c);
    if (nom) { var t = document.createElement("span"); t.className = "ping-nom"; t.textContent = nom; el.appendChild(t); }
    E.monde.appendChild(el);
    setTimeout(function () { el.remove(); }, 1300);
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

  // Ping : clic droit sur le tableau -> cercle qui s'agrandit chez tout le monde,
  // pour attirer l'attention (emprunte a Excalidraw / Foundry). On evite le menu
  // contextuel du navigateur et on borne au plan.
  E.scene.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var w = versMonde(e.clientX, e.clientY);
    agir({ op: "ping", x: Math.round(w.x), y: Math.round(w.y) });
    montrerPing(w.x, w.y, S.vous || "");
  });

  /* ---------- Barres / boutons ---------- */
  function setOutil(o) { etat.outil = o; document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.outil === o ? "true" : "false"); });
    E.scene.classList.toggle("outil-fleche", estFleche(o)); E.scene.classList.toggle("outil-texte", o === "texte"); annulerFleche();
    flash(estFleche(o) ? S.flecheDepart : (o === "texte" ? S.texteClic : "")); }
  document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.addEventListener("click", function () { setOutil(etat.outil === b.dataset.outil ? "deplacer" : b.dataset.outil); }); });
  E["z-plus"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  E["z-moins"].addEventListener("click", function () { var r = rectScene(); zoomVers(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  E["z-tout"].addEventListener("click", toutVoir);
  // Plein écran : vraie API Fullscreen (masque la barre du navigateur), avec
  // repli sur une classe CSS si l'API n'est pas disponible.
  function reflowPlein() { setTimeout(function () { clampPan(); applyView(); dessinerFleches(); }, 60); }
  function syncPlein() {
    var actif = !!(document.fullscreenElement || document.webkitFullscreenElement) || document.body.classList.contains("plein-css");
    document.body.classList.toggle("plein", actif);
    if (E["btn-plein"]) { E["btn-plein"].setAttribute("aria-pressed", actif ? "true" : "false"); E["btn-plein"].textContent = actif ? S.quitterPlein : S.plein; }
    reflowPlein();
  }
  document.addEventListener("fullscreenchange", syncPlein);
  document.addEventListener("webkitfullscreenchange", syncPlein);
  E["btn-plein"].addEventListener("click", function () {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var sortie = document.exitFullscreen || document.webkitExitFullscreen;
      if (sortie) { try { sortie.call(document); } catch (e) {} }
      return;
    }
    if (document.body.classList.contains("plein-css")) { document.body.classList.remove("plein-css"); syncPlein(); return; }
    var el = document.documentElement;
    var demande = el.requestFullscreen || el.webkitRequestFullscreen;
    if (demande) {
      var p; try { p = demande.call(el); } catch (e) { p = null; }
      if (p && p.catch) p.catch(function () { document.body.classList.add("plein-css"); syncPlein(); });
    } else { document.body.classList.add("plein-css"); syncPlein(); } // navigateur sans API Fullscreen
  });

  // Masquer / afficher les barres (topbar + toolbar) pour agrandir le tableau.
  function majBarres(cachees) {
    document.body.classList.toggle("barres-cachees", cachees);
    if (E["btn-barres-show"]) E["btn-barres-show"].hidden = !cachees;
    reflowPlein();
  }
  if (E["btn-barres"]) E["btn-barres"].addEventListener("click", function () { majBarres(true); });
  if (E["btn-barres-show"]) E["btn-barres-show"].addEventListener("click", function () { majBarres(false); });
  (function () {
    var s = document.getElementById("btn-sombre");
    if (s) {
      // Etat initial selon le theme (le CSS reagit a canvas-noir / canvas-blanc).
      var noirDepart = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var attr = document.documentElement.getAttribute("data-theme");
      if (attr === "dark") noirDepart = true; else if (attr === "light") noirDepart = false;
      function appliquerCanvas(noir) {
        document.body.classList.toggle("canvas-noir", noir);
        document.body.classList.toggle("canvas-blanc", !noir);
        s.setAttribute("aria-pressed", noir ? "true" : "false");
        s.textContent = noir ? S.fondBlanc : S.fondNoir; // le bouton propose l'action inverse
        try { dessinerFleches(); } catch (e) {}
      }
      appliquerCanvas(noirDepart);
      s.addEventListener("click", function () { appliquerCanvas(!document.body.classList.contains("canvas-noir")); });
    }
    var e = document.getElementById("btn-export");
    if (e) e.addEventListener("click", exporterImage);
  })();
  // Deck (animateur) : replier / deplier le jeu complet en bas de l'ecran.
  if (E["deck-toggle"] && E["deck"]) E["deck-toggle"].addEventListener("click", function () {
    var replie = E["deck"].classList.toggle("replie");
    this.setAttribute("aria-expanded", replie ? "false" : "true");
    reflowPlein();
  });
  E["btn-participants"].addEventListener("click", function () { E.panneau.hidden = !E.panneau.hidden; });
  E["fermer-panneau"].addEventListener("click", function () { E.panneau.hidden = true; });
  if (E["btn-vocal"]) E["btn-vocal"].addEventListener("click", function () { agir({ op: "definirLienVocal", url: (E["vocal-url"].value || "").trim() }); });
  E["code-chip"].addEventListener("click", function () { copier(etat.code, E["code-chip"].querySelector(".copier")); });
  E["btn-partager"].addEventListener("click", function () { copier(location.origin + location.pathname + "?s=" + etat.code, null, E["btn-partager"]); });
  function copier(txt, badge, btn) {
    copieRobuste(txt).then(function (ok) {
      if (!ok) { flash(S.copieEchec); return; } // on ne pretend pas avoir copie si ca a echoue
      if (badge) { var t = badge.textContent; badge.textContent = S.copie; badge.classList.add("copie-ok"); setTimeout(function () { badge.textContent = t; badge.classList.remove("copie-ok"); }, 1500); }
      if (btn) { var b = btn.textContent; btn.textContent = S.lienCopie; setTimeout(function () { btn.textContent = b; }, 1500); }
    });
  }
  // Copie robuste : API moderne (contexte securise HTTPS) avec repli sur
  // execCommand (contexte non securise, ex. test via l'IP du serveur). Renvoie
  // une promesse resolue a true seulement si la copie a reellement eu lieu.
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

  document.addEventListener("keydown", function (e) {
    // Raccourcis d'outils (facon Excalidraw) : 1/2/3/4 (ou H/A/N). Ignores si on
    // saisit du texte (champ, note editable).
    var cible = e.target, saisie = cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.getAttribute && cible.getAttribute("contenteditable") === "true");
    if (!saisie && !e.ctrlKey && !e.metaKey && !e.altKey && !E.modal.classList.contains("on")) {
      var raccourcis = { "1": "deplacer", "h": "deplacer", "2": "fleche", "a": "fleche", "3": "fleche2", "b": "fleche2", "4": "texte", "n": "texte" };
      var o = raccourcis[e.key.toLowerCase()];
      if (o) { e.preventDefault(); setOutil(o); return; }
    }
    if (e.key === "Escape") { if (E.modal.classList.contains("on")) return fermerModal();
      if (document.body.classList.contains("barres-cachees")) { majBarres(false); return; }
      if (document.fullscreenElement || document.webkitFullscreenElement) { var so = document.exitFullscreen || document.webkitExitFullscreen; if (so) { try { so.call(document); } catch (e2) {} } return; }
      if (document.body.classList.contains("plein-css")) { document.body.classList.remove("plein-css"); syncPlein(); return; }
      deselect(); annulerFleche(); if (estFleche(etat.outil)) setOutil("deplacer"); }
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
    var mpo = document.getElementById("modal-poser"); if (mpo) mpo.hidden = true; // plus de main individuelle
    E["carte-grande"].classList.remove("flip"); E.modal.classList.add("on"); }
  function fermerModal() { E.modal.classList.remove("on"); }
  E["modal-flip"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); });
  E["carte-grande"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); }); // clic = retourner
  E["modal-close"].addEventListener("click", fermerModal);
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
    ctx.fillStyle = document.body.classList.contains("canvas-noir") ? "#14110d" : "#f4f2ec"; ctx.fillRect(minx, miny, W, H);

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
