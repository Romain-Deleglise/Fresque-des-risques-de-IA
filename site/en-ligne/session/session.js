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
    actionPerdue: "That action could not be sent. The board has been refreshed; try again.",
    annuler: "Undo", annulerTitre: "Undo my last action (Ctrl+Z)",
    a11yCarte: "Arrow keys to move between cards, Shift plus arrows to move this one, L to link, Enter to select.",
    annulerImpossible: "Nothing left to undo here (someone may have changed it since).",
    prenomPris: function (p) { return "There is already a \u201C" + p + "\u201D in the room. Add the first letter of your surname, for example \u201C" + p + " D.\u201D, so everyone can tell you apart."; },
    rechargerErreur: "Could not load the board. Check your connection and reload the page.",
    partagezLien: "Copy the invitation link and send it to the group.",
    sansLien: "To join, open the link you received by e-mail.",
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
    lienCopie: "Link copied.", lienSujet: "My AI Risks Collage session",
    appelVoir: "Show me", appelEnvoye: "Invitation sent to the group.",
    appelImpossible: "The relay does not know how to do this yet: it needs redeploying.",
    appelTexte: function (n) { return (n || "The facilitator") + " would like to show you something."; },
    coachFermer: "Got it",
    coachPartager: "Copy the invitation link (top left) so participants can join.",
    coachPool: "Add cards to the shared reserve (your card deck, at the bottom) so the group can place them.",
    coachAttente: "Waiting for the facilitator to fill the reserve…",
    coachPrendre: "Take a card from the reserve and place it on the board.",
    prendre: "Place on board", retirerPool: "Remove from the reserve", poolTitre: "Reserve",
    poolReduire: "Smaller cards", poolAgrandir: "Larger cards",
    occupee: "Someone is already taking that card.", occupeePar: function (q) { return q + " is taking this card"; },
    versPool: "↩ To the reserve", versReserve: "✕ To the card deck",
    tutoSuivant: "Next", tutoTerminer: "Got it", tutoPasser: "Skip", tutoRevoir: "Replay the tutorial",
    tutoPart: [
      { titre: "Welcome!", texte: "You'll build the AI-risks fresco together, live on this shared board. Here's the gist in a few steps." },
      { cible: "#pool", place: "top", titre: "The reserve", texte: "The facilitator makes cards available in the reserve. Take one: drag it onto the board, or click « Place »." },
      { cible: ".seg-outils", place: "bottom", titre: "Move, link, note", texte: "The hand moves cards and pans the board. The arrow links two cards. The bubble adds a note (double-click the board)." },
      { cible: "#z-tout", place: "bottom", titre: "Find your way", texte: "Zoom with the wheel or + / −. « Fit all » recenters. Hover a card to read its title when zoomed out." },
      { cible: "#btn-participants", place: "bottom", titre: "The group", texte: "See who's connected here. Need a reminder? The ? button reopens this help anytime. Enjoy the workshop!" }
    ],
    tutoAnim: [
      { titre: "You're the facilitator", texte: "You run the session. Here's how to hand out cards and guide the group." },
      { cible: "#deck", place: "top", titre: "Your card deck", texte: "The whole deck is here, at the bottom. Click a card to make it available in the shared reserve." },
      { cible: "#pool", place: "top", titre: "The shared reserve", texte: "The reserve (8 cards max): players take cards from here to place them on the board. Remove one with ✕." },
      { titre: "Take a card back", texte: "Select a placed card to take it back: return it to the reserve, or to your card deck." },
      { cible: ".seg-outils", place: "bottom", titre: "Move, link, note", texte: "The hand moves cards and pans the board. The arrow links two cards. The bubble adds a note." },
      { cible: "#btn-partager", place: "bottom", titre: "Invite the group", texte: "Copy the invitation link and send it to your group: one click and they are in, nothing to type. Enjoy!" }
    ],
    horsLigne: "offline", exclure: "Remove from the session", confirmExclure: function (p) { return "Remove " + p + " from the session?"; },
    titreRejoindre: "Join the workshop", sousRejoindre: "Enter your first name to join the shared board.",
    poolVide: "Waiting for the facilitator to add cards to the reserve.",
    poolVideAnim: "Add cards to the reserve from the card deck below.",
    poolRemplirTxt: "Fill", poolViderTxt: "Empty",
    poolRemplirT: "Fill the reserve with the next available cards",
    poolViderT: "Take every card out of the reserve",
    confirmVider: "Take every card out of the reserve?",
    poolDeplacer: "Move the reserve panel",
    poolCaseVide: "free slot",
    reserveGlisser: "Drag a card onto the reserve, or click it",
    curseursOn: "Other people's cursors: shown", curseursOff: "Other people's cursors: hidden",
    relaisAncien: "Live sharing is running in reduced mode (the relay needs updating).",
    flecheEchap: "Click the target card (Esc cancels).",
    coachRelier: "To connect two cards: pick the “Link →” tool, then click one card and another."
  } : {
    prenomManquant: "Indiquez votre prénom.", creation: "Création…", echec: "Échec.",
    ouvrirAtelier: function (c) { return "Ouverture de l'atelier " + c + " : entrez votre prénom, puis cliquez sur « Ouvrir la session »."; },
    indispoMoment: "Service indisponible pour le moment.", code6: "Le code fait 6 caractères.",
    connexion: "Connexion…", codeInconnu: "Code inconnu.", indispo: "Service indisponible.",
    actionPerdue: "Cette action n'a pas pu être envoyée. Le tableau a été rafraîchi, réessayez.",
    annuler: "Annuler", annulerTitre: "Annuler ma dernière action (Ctrl+Z)",
    a11yCarte: "Flèches pour passer d'une carte à l'autre, Maj plus flèches pour déplacer celle-ci, L pour relier, Entrée pour sélectionner.",
    annulerImpossible: "Plus rien à annuler ici (quelqu'un l'a peut-être modifié depuis).",
    prenomPris: function (p) { return "Il y a déjà « " + p + " » dans la salle. Ajoutez la première lettre de votre nom de famille, par exemple « " + p + " D. », pour que tout le monde s'y retrouve."; },
    rechargerErreur: "Impossible de charger le tableau. Vérifiez votre connexion et rechargez la page.",
    partagezLien: "Copiez le lien d'invitation et envoyez-le au groupe.",
    sansLien: "Pour rejoindre, ouvrez le lien reçu par e-mail.",
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
    lienCopie: "Lien copié.", lienSujet: "Ma session de la Fresque des risques de l'IA",
    appelVoir: "Voir", appelEnvoye: "Invitation envoyée au groupe.",
    appelImpossible: "Le relais ne sait pas encore faire cela : il doit être redéployé.",
    appelTexte: function (n) { return (n || "L'animateur·ice") + " voudrait vous montrer quelque chose."; },
    coachFermer: "Compris",
    coachPartager: "Copiez le lien d'invitation (en haut à gauche) pour que des participant·es rejoignent.",
    coachPool: "Ajoutez des cartes à la réserve commune (votre jeu de cartes, en bas) pour que le groupe les pose.",
    coachAttente: "En attente que l'animateur remplisse la réserve…",
    coachPrendre: "Prenez une carte de la réserve et posez-la sur le tableau.",
    prendre: "Poser sur le tableau", retirerPool: "Retirer de la réserve", poolTitre: "Réserve",
    poolReduire: "Cartes plus petites", poolAgrandir: "Cartes plus grandes",
    occupee: "Quelqu'un est déjà en train de prendre cette carte.", occupeePar: function (q) { return q + " prend cette carte"; },
    versPool: "↩ Remettre à la réserve", versReserve: "✕ Dans le jeu de cartes",
    tutoSuivant: "Suivant", tutoTerminer: "C'est parti", tutoPasser: "Passer le tuto", tutoRevoir: "Revoir le tutoriel",
    tutoPart: [
      { titre: "Bienvenue !", texte: "Vous allez construire la Fresque des risques de l'IA avec le groupe, en direct sur ce tableau partagé. L'essentiel en quelques étapes." },
      { cible: "#pool", place: "top", titre: "La réserve", texte: "L'animateur·ice met des cartes à disposition dans la réserve. Prenez-en une : glissez-la sur le tableau, ou cliquez « Poser »." },
      { cible: ".seg-outils", place: "bottom", titre: "Déplacer, relier, annoter", texte: "La main déplace les cartes et le tableau. La flèche relie deux cartes. La bulle ajoute une note (double-clic sur le tableau)." },
      { cible: "#z-tout", place: "bottom", titre: "Se repérer", texte: "Zoomez à la molette ou avec + / −. « Tout voir » recadre. Survolez une carte pour lire son titre quand vous êtes loin." },
      { cible: "#btn-participants", place: "bottom", titre: "Le groupe", texte: "Voyez qui est connecté ici. Le bouton ? rouvre cette aide à tout moment. Bon atelier !" }
    ],
    tutoAnim: [
      { titre: "Vous animez", texte: "Vous animez la session. Voici comment distribuer les cartes et guider le groupe." },
      { cible: "#deck", place: "top", titre: "Votre jeu de cartes", texte: "Tout le jeu est ici, en bas. Cliquez une carte pour la mettre à disposition dans la réserve commune." },
      { cible: "#pool", place: "top", titre: "La réserve commune", texte: "La réserve (8 cartes max) : les participant·es y prennent les cartes pour les poser. Retirez-en une avec ✕." },
      { titre: "Reprendre une carte", texte: "Sélectionnez une carte posée pour la reprendre : la remettre à la réserve, ou dans votre jeu de cartes." },
      { cible: ".seg-outils", place: "bottom", titre: "Déplacer, relier, annoter", texte: "La main déplace les cartes et le tableau. La flèche relie deux cartes. La bulle ajoute une note." },
      { cible: "#btn-partager", place: "bottom", titre: "Inviter le groupe", texte: "Copiez le lien d'invitation et envoyez-le au groupe : un clic et ils y sont, rien à saisir. Bon atelier !" }
    ],
    horsLigne: "hors ligne", exclure: "Exclure de la session", confirmExclure: function (p) { return "Exclure " + p + " de la session ?"; },
    titreRejoindre: "Rejoindre l'atelier", sousRejoindre: "Entrez votre prénom pour rejoindre le tableau partagé.",
    poolVide: "En attente que l'animateur mette des cartes dans la réserve.",
    poolVideAnim: "Ajoutez des cartes à la réserve depuis le jeu de cartes, en bas.",
    poolRemplirTxt: "Remplir", poolViderTxt: "Vider",
    poolRemplirT: "Compléter la réserve avec les cartes suivantes",
    poolViderT: "Enlever toutes les cartes de la réserve",
    confirmVider: "Enlever toutes les cartes de la réserve ?",
    poolDeplacer: "Déplacer le panneau de la réserve",
    poolCaseVide: "emplacement libre",
    reserveGlisser: "Glissez une carte sur la réserve, ou cliquez-la",
    curseursOn: "Curseurs des autres : affichés", curseursOff: "Curseurs des autres : masqués",
    relaisAncien: "Partage en direct en mode réduit (le relais doit être mis à jour).",
    flecheEchap: "Cliquez la carte d'arrivée (Échap annule).",
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
      "#aide-ouvrir": "Scheduled a workshop? Open it from the link in your e-mail: the right session opens on its own, and your registrants join through their own link. Otherwise this page opens a trial session.",
      "#btn-creer": "Open the session",
      ".lobby-sep span": "or",
      "#lobby section:nth-of-type(2) h2": "Join",
      'label[for="join-prenom"]': "Your first name",
      "#btn-rejoindre": "Join",
      "#note-sans-lien": "To join a workshop, open the link you received by e-mail: it takes you straight to the right session, with nothing to type.",
      "#deck-titre": "Card deck",
      "#deck-aide": "Click (or drag) a card to add it to the shared reserve (8 max), which anyone can place.",
      "#z-tout": "Fit all", "#btn-plein": "Fullscreen", "#btn-affichage": "Display",
      "#btn-rassembler": "Gather",
      "#btn-barres": "Hide the bar", "#btn-barres-show": "Bar ▾", "#btn-partager": "Invite",
      "#btn-curseurs": "Other people's cursors",
      "#panneau .panneau-tete h3": "Participants",
      'label[for="vocal-url"]': "Voice room link (Discord, Meet…)",
      "#vocal-lien": "🎧 Join the voice room",
      "#aide-titre": "How to play",
      "#modal-flip": "Flip", "#modal-close": "Close ✕",
      ".mobile-avis h1": "Open this on a computer",
      ".mobile-avis > div > p:nth-of-type(1)": "You move cards and draw links with a mouse: on a phone, it is not playable.",
      "#ma-libelle": "Your session link:",
      "#ma-copier": "Copy the link", "#ma-mail": "E-mail it to myself",
      ".mobile-avis .ma-fine:nth-of-type(1)": "Then open it on your computer: the session opens on its own, with nothing to type.",
      "#ma-forcer": "Continue on this screen anyway"
    };
    Object.keys(txt).forEach(function (sel) { var el = document.querySelector(sel); if (el) el.textContent = txt[sel]; });
    var attr = [
      ["#btn-partager", "title", "Copy the invitation link to send to your group"], ["#etat-conn", "title", "Connection"],
      ["#btn-rassembler", "title", "Invite everyone to come and see what you see"],
      ["#z-moins", "aria-label", "Zoom out"], ["#z-plus", "aria-label", "Zoom in"],
      ["#fermer-panneau", "aria-label", "Close"], ["#modal-close", "aria-label", "Close"],
      ["#anim-prenom", "placeholder", "First name"], ["#join-prenom", "placeholder", "First name"],
      ['.tool[data-outil="deplacer"]', "title", "Hand: move and pan the board"], ['.tool[data-outil="deplacer"]', "aria-label", "Hand: move and pan the board"],
      ['.tool[data-outil="fleche"]', "title", "Link: click the source card, then the target"], ['.tool[data-outil="fleche"]', "aria-label", "Link two cards"],
      ['.tool[data-outil="fleche2"]', "title", "Two-way link: click one card, then the other"], ['.tool[data-outil="fleche2"]', "aria-label", "Two-way link"],
      ['.tool[data-outil="texte"]', "title", "Note: click the board to write"], ['.tool[data-outil="texte"]', "aria-label", "Add a note"]
    ];
    attr.forEach(function (a) { var el = document.querySelector(a[0]); if (el) el.setAttribute(a[1], a[2]); });
    document.querySelectorAll(".marque").forEach(function (m) {
      // Deux formes : le nom complet dans le hall, la forme courte dans la barre
      // (ou il est dans un `span`, pour pouvoir s'effacer quand la place manque).
      var court = m.querySelector(".mq-txt");
      if (court) { court.textContent = "Online collage"; return; }
      var dernier = m.childNodes[m.childNodes.length - 1];
      if (dernier) dernier.nodeValue = " The AI Risks Collage";
    });
    var pa = document.querySelector("#btn-participants .pa-txt");
    if (pa) pa.textContent = "Participants";
    var ret = document.querySelector(".lobby-retour");
    if (ret) ret.innerHTML = '<a href="../">← Back</a> · The service is in preparation: early trials.';
    var mr = document.querySelector(".mobile-avis .ma-fine:last-of-type a");
    if (mr) mr.textContent = "Back to the site";
    var leg = document.getElementById("legende");
    if (leg) {
      var noms = ["AI", "Capabilities", "Present-day risks", "Existential risks", "Solutions"];
      leg.querySelectorAll("b").forEach(function (b, i) {
        b.lastChild.nodeValue = (i + 1) + " · " + noms[i];
      });
    }
    var liste = document.querySelector("#aide-liste");
    if (liste) liste.innerHTML =
      '<li><b>Cards:</b> the facilitator fills the shared reserve; click « Place » (or drag the card) to bring it onto the board. The ⤢ button opens it large.</li>'
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

  /* MOUVEMENT REDUIT. Certaines personnes reglent leur systeme pour supprimer
     les animations (vertiges, migraines, troubles vestibulaires). Le CSS le
     respecte de son cote ; ici on coupe aussi ce que le CSS ne voit pas : le
     lissage des curseurs, celui des cartes tirees par quelqu'un d'autre, et
     l'animation du recadrage. On suit le reglage en direct, sans recharger. */
  var mvtReduit = false;
  try {
    var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mvtReduit = mq.matches;
    if (mq.addEventListener) mq.addEventListener("change", function (e) { mvtReduit = e.matches; });
    else if (mq.addListener) mq.addListener(function (e) { mvtReduit = e.matches; });
  } catch (e) {}

  var E = {}; // éléments DOM
  ["lobby","app","anim-prenom","anim-code","btn-creer","join-code","join-prenom","btn-rejoindre","lobby-msg",
   "code-val","code-chip","btn-partager","nb-part","etat-conn","carte0-txt",
   "scene","monde","fleches","fleches-live","pool","deck","deck-cartes","deck-compte","deck-toggle","aide","z-niv","z-moins","z-plus","z-tout","btn-plein",
   "btn-participants","panneau","fermer-panneau",
   "btn-barres","btn-barres-show","btn-affichage","menu-affichage","dock","zone-outils","grp-zoom","btn-annuler","btn-rassembler",
   "liste-part","vocal-url","btn-vocal","vocal-lien","visio-top","legende","modal","carte-grande","modal-flip",
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
    attente: 0,            // actions locales en vol (rendu optimiste en cours)
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
  // Message d'un refus du serveur. Les refus connus sont traduits ici (le
  // serveur ne parle que francais) ; les autres sont repris tels quels.
  function msgRefus(r, defaut) {
    if (!r) return defaut;
    if (r.code === "prenom_pris" && S.prenomPris) return S.prenomPris(r.prenom || "");
    return r.message || defaut;
  }
  // Prenom deja pris : on garde ce qui a ete tape et on replace le curseur a la
  // fin du champ, pour n'avoir qu'une lettre a ajouter.
  function reprendrePrenom(champ) {
    try { var n = champ.value.length; champ.focus(); champ.setSelectionRange(n, n); } catch (e) {}
  }

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
          else { lobbyMsg(msgRefus(r2.d && r2.d.refus, S.echec), "err"); reprendrePrenom(E["anim-prenom"]); }
        }).catch(function () { lobbyMsg(S.indispoMoment, "err"); });
        return;
      }
      if (res.d && res.d.code) { memoriser(res.d.code, res.d.jeton, res.d.role); demarrer(res.d.code, res.d.jeton, res.d.role, res.d.etat); }
      else { lobbyMsg((res.d && res.d.error) || msgRefus(res.d && res.d.refus, S.echec), "err"); reprendrePrenom(E["anim-prenom"]); }
    }).catch(function () { E["btn-creer"].disabled = false; lobbyMsg(S.indispoMoment, "err"); });
  });

  E["btn-rejoindre"].addEventListener("click", rejoindre);
  E["join-prenom"].addEventListener("keydown", function (e) { if (e.key === "Enter") rejoindre(); });
  // Le formulaire « Rejoindre » n'a de sens qu'avec un code venu du lien : sinon
  // on n'affiche que la note qui renvoie a l'e-mail. Appele apres la lecture des
  // parametres d'URL (voir plus bas).
  function majColonneRejoindre() {
    var aCode = ((E["join-code"] && E["join-code"].value) || "").length === 6;
    document.body.classList.toggle("sans-lien", !aCode);
  }
  function rejoindre() {
    var code = (E["join-code"].value || "").trim().toUpperCase();
    var prenom = (E["join-prenom"].value || "").trim();
    // Sans code dans l'URL, il n'y a rien a rejoindre : on renvoie au lien recu
    // par e-mail plutot que de demander un code que personne ne connait.
    if (code.length !== 6) { lobbyMsg(S.sansLien, "err"); return; }
    if (!prenom) { lobbyMsg(S.prenomManquant, "err"); return; }
    E["btn-rejoindre"].disabled = true; lobbyMsg(S.connexion);
    // On ne reutilise QUE le jeton de cet onglet (sessionStorage) : un 2e onglet
    // du meme navigateur rejoint donc comme une personne distincte.
    api("rejoindre", { code: code, prenom: prenom, jeton: jetonTab(code) }).then(function (res) {
      E["btn-rejoindre"].disabled = false;
      if (res.d && res.d.jeton) { memoriser(code, res.d.jeton, res.d.role); demarrer(code, res.d.jeton, res.d.role, res.d.etat, res.d.moi); }
      else { lobbyMsg(msgRefus(res.d && res.d.refus, S.codeInconnu), "err"); reprendrePrenom(E["join-prenom"]); }
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
    var preNom = params.get("prenom") || ""; // prenom pre-rempli via le lien de l'e-mail
    var pre = (params.get("code") || "").toUpperCase();
    if (pre) {
      E["join-code"].value = pre;
      if (preNom) E["join-prenom"].value = preNom;
      lobbyRole("participant");
      // Si tout est pre-rempli, on place le focus sur le bouton Rejoindre : il ne
      // reste qu'un clic (on arrive direct sur la bonne session).
      try { (preNom ? E["btn-rejoindre"] : E["join-prenom"]).focus(); } catch (e) {}
    }
    var o = (params.get("ouvrir") || "").toUpperCase();
    if (!o) return;
    lobbyRole("animateur");
    codeSouhaite = o;
    if (preNom && E["anim-prenom"]) E["anim-prenom"].value = preNom;
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
  majColonneRejoindre();

  /* ---------- Démarrage session ---------- */
  function demarrer(code, jeton, role, vue, moi) {
    _idMoi = moi || null;
    etat.code = code; etat.jeton = jeton; etat.role = role;
    document.body.classList.add("role-" + role);
    E.lobby.hidden = true; E.app.hidden = false;
    // Le code ne s'affiche plus nulle part (il reste dans l'URL et cote serveur).
    // Ces elements peuvent donc etre absents du HTML : on garde les references
    // pour ne rien casser si on les reintroduit un jour.
    if (E["code-val"]) E["code-val"].textContent = code;
    // URL de reprise pour cet onglet : un rechargement rejoint la meme place.
    try { history.replaceState(null, "", location.pathname + "?s=" + code); } catch (e) {}
    demarrerQuandCartes(vue, 0);
  }
  // Les cartes (data/cartes.json) sont indispensables au rendu du tableau.
  // Si le chargement echoue (reseau capricieux), on reessaie avec un delai
  // croissant plutot que de rester sur un tableau nu et sans instructions.
  function demarrerQuandCartes(vue, essai) {
    chargerCartes().then(function () {
      centrer(); appliquerEtat(vue, true); setOutil("deplacer");
      flash(etat.role === "animateur" ? S.partagezLien : S.attenteCarte);
      boucle();
      // Tutoriel guide a la premiere arrivee (une fois par role, rejouable via ?).
      setTimeout(function () { lancerTuto(false); }, 450);
      connecterCurseurs(); // curseurs en direct (optionnel, sans blocage)
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
    // `resyncDemande` : on redemande tout en pretendant ne rien savoir, pour que
    // le serveur renvoie la vue complete et qu'on la reprenne sans discuter.
    var resync = resyncDemande; resyncDemande = false;
    api("etat", { code: etat.code, jeton: etat.jeton, version: resync ? 0 : etat.version }).then(function (res) {
      marquerConnexion(true);
      if (res.d && res.d.etat) appliquerEtat(res.d.etat, resync ? "force" : undefined);
      else if (res.d && res.d.refus) { flash(res.d.refus.message || S.sessionTerminee); }
    }).catch(function () { marquerConnexion(false); }).finally(function () {
      pollTimer = setTimeout(boucle, Date.now() < rapideJusqu ? POLL_RAPIDE : POLL_LENT);
    });
  }
  function pollerVite() { activite(); clearTimeout(pollTimer); pollTimer = setTimeout(boucle, 60); }
  function marquerConnexion(ok) { if (ok === hs) { hs = !ok; E["etat-conn"].classList.toggle("hs", !ok); } }

  /* ---------- Application de l'état serveur (déclaratif) ---------- */
  /* TROIS COUCHES, comme tous les tableaux collaboratifs (Figma, Excalidraw,
     Liveblocks...) :
       - EPHEMERE   : curseurs, fleche en cours, carte en cours de glissement.
                      Relais uniquement, jamais enregistre.
       - PROVISOIRE : l'action qu'on vient de faire, poussee aux autres AVANT
                      meme la reponse du serveur. C'est ce qui rend le jeu
                      lisible : chacun voit le geste des autres en quelques
                      dizaines de millisecondes, au lieu d'attendre l'aller-
                      retour HTTP puis le sondage.
       - AUTORITAIRE: l'etat renvoye par le serveur, seule verite, seule memoire.
     La regle d'or : un rendu provisoire ne fait JAMAIS avancer notre numero de
     version. L'etat autoritaire qui porte le meme numero sera donc bien
     applique ensuite, et corrigera si le serveur a refuse l'action. */
  var retards = 0;          // etats serveur plus vieux que le notre, d'affilee
  var provisoire = 0;       // un rendu provisoire attend sa confirmation
  var provVersion = 0;      // version ANNONCEE du rendu provisoire affiche
  var versionServeur = 0;   // plus haute version que le serveur nous ait montree
  var provTimer = null;
  var resyncDemande = false; // redemander l'etat complet au prochain sondage
  function oublierProvisoire() { provisoire = 0; provVersion = 0; clearTimeout(provTimer); }
  function marquerProvisoire(v) {
    provisoire = 1;
    if (v > provVersion) provVersion = v;
    clearTimeout(provTimer);
    // Filet : un rendu provisoire qui n'est jamais confirme serait un tableau
    // qui ment. Passe ce delai, on redemande l'etat complet au serveur.
    provTimer = setTimeout(function () {
      provisoire = 0; provVersion = 0; resyncDemande = true; pollerVite();
    }, 2500);
  }
  function appliquerEtat(vue, mode) {
    if (!vue) return;
    var force = mode === true || mode === "force";
    var prov = mode === "prov";
    // « corr » : etat autoritaire diffuse APRES un refus du serveur. Il porte le
    // meme numero de version que le rendu provisoire qu'il doit effacer (un refus
    // ne fait pas avancer la version), et il doit donc echapper au plancher
    // ci-dessous, sans quoi le geste refuse resterait affiche chez les autres
    // jusqu'au filet de securite.
    var corr = mode === "corr";
    // `_pv` : la version que le tableau AURA quand toutes les actions en vol de
    // l'emetteur seront enregistrees. C'est la seule facon de savoir jusqu'ou un
    // rendu provisoire fait autorite : son propre numero de version, lui, est
    // celui d'AVANT les gestes qu'il montre. Quand quelqu'un enchaine deux
    // actions, l'etat serveur de la premiere est plus recent en numero et
    // pourtant en retard sur l'ecran : c'est exactement ce qui faisait repartir
    // une carte dans la reserve pendant une fraction de seconde.
    var annonce = Math.max(vue.version || 0, +vue._pv || 0);
    if (vue._prov) { try { delete vue._prov; } catch (e) {} }
    if (vue._corr) { try { delete vue._corr; } catch (e) {} }
    if (vue._pv) { try { delete vue._pv; } catch (e) {} }
    // RIEN D'AUTORITAIRE N'EST APPLIQUE QUI NE SOIT STRICTEMENT PLUS RECENT. Le
    // magasin sert des lectures eventuellement coherentes : un sondage peut
    // tres bien nous rendre l'etat d'il y a trois secondes. Le poser sur le
    // tableau, c'est faire reculer tout le monde : la carte que quelqu'un vient
    // de poser repart dans la reserve, une fleche disparait, une carte « bouge
    // toute seule ». A version EGALE aussi : deux actions parties de la meme
    // version portent le meme numero suivant, avec des contenus differents.
    if (prov) {
      // Deja plus loin que ce rendu provisoire : il n'apporte rien.
      if (annonce < provVersion || annonce < etat.version) return;
      marquerProvisoire(annonce);
    } else if (corr) {
      if (vue.version < etat.version) return;
      retards = 0;
    } else if (!force) {
      if (vue.version > etat.version) { retards = 0; }
      else if (vue.version === etat.version) { retards = 0; }
      // Plus vieux que nous. Presque toujours une lecture perimee, qu'on
      // ignore. Mais si le serveur insiste, c'est que notre version venait d'un
      // etat relaye que le magasin n'a pas conserve : il est l'autorite, on se
      // resynchronise plutot que de rester bloque sur un tableau fantome.
      else if (++retards < 4) { return; }
      else { retards = 0; }
      // PLANCHER PROVISOIRE. Un rendu provisoire montre deja tout le contenu
      // autoritaire de sa version de base, PLUS les gestes en cours, et il
      // annonce le numero qu'aura le tableau quand ceux-ci seront enregistres.
      // Tout etat serveur en deca de ce numero est donc, du point de vue de
      // l'ecran, deja connu : l'appliquer ne peut qu'effacer un geste pendant la
      // fraction de seconde qui precede la version suivante. C'est tout ce qu'on
      // voyait : la carte qui repart un instant dans la reserve, la carte qui
      // revient a son ancienne place, le texte d'une note qui recule pendant la
      // frappe. Et pas seulement pour l'element concerne : un etat est une photo
      // complete, donc TOUT le tableau reculait d'un cran.
      // ON LE PREND QUAND MEME EN COMPTE. Ne rien faire du tout laissait notre
      // numero de version bloque : on redemandait sans fin la meme chose, le
      // filet de securite finissait par se declencher, et il rendait justement
      // l'etat en retard qu'on venait d'ecarter. On enregistre donc l'avancee
      // sans redessiner.
      if (provisoire && vue.version < provVersion) {
        if (vue.version > etat.version) etat.version = vue.version;
        if (vue.version > versionServeur) versionServeur = vue.version;
        activite();
        return;
      }
      if (vue.version === etat.version && !provisoire) return;
    }
    if (!prov) oublierProvisoire();
    if (!prov && vue.version > versionServeur) versionServeur = vue.version;
    activite();                                  // ca bouge : on reste reactif
    etat.vue = vue;
    if (!prov) etat.version = vue.version;
    rejouerEnVol();   // nos actions pas encore confirmees restent a l'ecran
    rejouerFrappe(vue);  // et la frappe en direct des autres ne recule pas
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
      if ((v.participants || []).length === 0) return S.coachPartager;
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
    var revoir = document.getElementById("revoir-tuto");
    if (revoir) { revoir.textContent = S.tutoRevoir; revoir.addEventListener("click", function () { maj(false); lancerTuto(true); }); }
  })();

  /* ---------- Tutoriel guidé (coach-marks) -----------------------------------
     Une visite guidée au premier lancement, distincte selon le rôle (animateur
     ou participant). Chaque étape éclaire un élément (projecteur via box-shadow),
     avec une bulle numérotée, une flèche vers l'élément, « Suivant » et
     « Passer ». Rejouable depuis le panneau d'aide. Robustesse : on ne garde que
     les étapes dont la cible est visible ; repositionnement au redimensionnement ;
     aucune interaction avec le jeu pendant la visite (fond qui capte les clics). */
  var tuto = null; // { steps, i, fond, halo, bulle, role, onResize }
  function tutoVu(role) { try { return localStorage.getItem("fresque:tuto:" + role) === "1"; } catch (e) { return false; } }
  function marquerTutoVu(role) { try { localStorage.setItem("fresque:tuto:" + role, "1"); } catch (e) {} }
  function cibleVisible(sel) {
    if (!sel) return true; // étape sans cible (centrée)
    var el = document.querySelector(sel);
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function lancerTuto(force) {
    var role = etat.role === "animateur" ? "animateur" : "participant";
    if (!force && tutoVu(role)) return;
    var source = role === "animateur" ? (S.tutoAnim || []) : (S.tutoPart || []);
    var steps = source.filter(function (st) { return cibleVisible(st.cible); });
    if (!steps.length) return;
    fermerTuto();
    var fond = document.createElement("div"); fond.className = "tuto-fond"; fond.id = "tuto-fond";
    var halo = document.createElement("div"); halo.className = "tuto-halo"; fond.appendChild(halo);
    var bulle = document.createElement("div"); bulle.className = "tuto-bulle";
    bulle.innerHTML = '<span class="tuto-fleche"></span>'
      + '<div class="tuto-num"></div><h3 class="tuto-titre"></h3><p class="tuto-texte"></p>'
      + '<div class="tuto-actions"><button type="button" class="tuto-passer"></button>'
      + '<button type="button" class="tuto-suivant btn primaire"></button></div>';
    fond.appendChild(bulle);
    document.body.appendChild(fond);
    tuto = { steps: steps, i: 0, fond: fond, halo: halo, bulle: bulle, role: role };
    bulle.querySelector(".tuto-passer").addEventListener("click", function (e) { e.stopPropagation(); finirTuto(); });
    bulle.querySelector(".tuto-suivant").addEventListener("click", function (e) { e.stopPropagation(); etapeSuivante(); });
    fond.addEventListener("click", function (e) { if (e.target === fond || e.target === halo) etapeSuivante(); });
    tuto.onResize = function () { if (tuto) montrerEtape(tuto.i); };
    window.addEventListener("resize", tuto.onResize);
    montrerEtape(0);
  }
  function montrerEtape(i) {
    if (!tuto) return;
    var st = tuto.steps[i]; if (!st) return;
    tuto.i = i;
    var b = tuto.bulle, n = tuto.steps.length;
    b.querySelector(".tuto-num").textContent = (i + 1) + " / " + n;
    b.querySelector(".tuto-titre").textContent = st.titre || "";
    b.querySelector(".tuto-texte").textContent = st.texte || "";
    b.querySelector(".tuto-suivant").textContent = (i === n - 1) ? S.tutoTerminer : S.tutoSuivant;
    b.querySelector(".tuto-passer").textContent = S.tutoPasser;
    b.querySelector(".tuto-passer").style.visibility = (i === n - 1) ? "hidden" : "visible";
    positionnerTuto(st.cible ? document.querySelector(st.cible) : null, st.place || "bottom");
  }
  function positionnerTuto(cibleEl, place) {
    var b = tuto.bulle, halo = tuto.halo, fond = tuto.fond, fl = b.querySelector(".tuto-fleche");
    b.className = "tuto-bulle"; // reset des classes place-*
    var vw = window.innerWidth, vh = window.innerHeight;
    var bw = b.offsetWidth, bh = b.offsetHeight;
    if (!cibleEl) { // étape centrée, pas de cible
      halo.style.display = "none"; fond.classList.add("centre");
      b.classList.add("place-centre");
      b.style.left = Math.round((vw - bw) / 2) + "px";
      b.style.top = Math.round((vh - bh) / 2) + "px";
      return;
    }
    fond.classList.remove("centre");
    var r = cibleEl.getBoundingClientRect(), pad = 6;
    halo.style.display = "block";
    halo.style.left = (r.left - pad) + "px"; halo.style.top = (r.top - pad) + "px";
    halo.style.width = (r.width + pad * 2) + "px"; halo.style.height = (r.height + pad * 2) + "px";
    var gap = 16, pos = place;
    if (pos === "bottom" && r.bottom + gap + bh > vh) pos = "top";
    else if (pos === "top" && r.top - gap - bh < 0) pos = "bottom";
    else if (pos === "left" && r.left - gap - bw < 0) pos = "right";
    else if (pos === "right" && r.right + gap + bw > vw) pos = "left";
    var left, top;
    if (pos === "bottom") { top = r.bottom + gap; left = r.left + r.width / 2 - bw / 2; }
    else if (pos === "top") { top = r.top - gap - bh; left = r.left + r.width / 2 - bw / 2; }
    else if (pos === "left") { left = r.left - gap - bw; top = r.top + r.height / 2 - bh / 2; }
    else { left = r.right + gap; top = r.top + r.height / 2 - bh / 2; }
    left = Math.max(8, Math.min(vw - bw - 8, left));
    top = Math.max(8, Math.min(vh - bh - 8, top));
    b.style.left = Math.round(left) + "px"; b.style.top = Math.round(top) + "px";
    b.classList.add("place-" + pos);
    var tcx = r.left + r.width / 2, tcy = r.top + r.height / 2;
    if (pos === "bottom" || pos === "top") { fl.style.left = Math.max(14, Math.min(bw - 14, tcx - left)) + "px"; fl.style.top = ""; }
    else { fl.style.top = Math.max(14, Math.min(bh - 14, tcy - top)) + "px"; fl.style.left = ""; }
  }
  function etapeSuivante() { if (!tuto) return; if (tuto.i >= tuto.steps.length - 1) finirTuto(); else montrerEtape(tuto.i + 1); }
  function finirTuto() { if (tuto) marquerTutoVu(tuto.role); fermerTuto(); }
  function fermerTuto() {
    if (!tuto) return;
    if (tuto.onResize) window.removeEventListener("resize", tuto.onResize);
    if (tuto.fond && tuto.fond.parentNode) tuto.fond.parentNode.removeChild(tuto.fond);
    tuto = null;
  }

  /* ---------- Participants / vocal / main ---------- */
  function moi() { if (etat.role !== "participant") return null; return (etat.vue.participants || []).find(function (p) { return p.id === idMoi(); }); }
  var _idMoi = null;
  function idMoi() {
    // notre id = le participant dont on ne connaît pas l'id ; on le déduit une fois via le jeton n'est pas exposé.
    return _idMoi;
  }
  function rendreParticipants(vue) {
    // Garde : ne reconstruit la liste que si elle a reellement change (evite le
    // churn DOM a chaque changement de version, ex. quand un autre deplace une carte).
    var sig = (vue.animateur ? vue.animateur.prenom + ":" + (vue.animateur.connecte ? 1 : 0) : "")
      + "|" + (vue.participants || []).map(function (p) { return p.id + ":" + p.prenom + ":" + (p.connecte ? 1 : 0); }).join(",")
      + "|" + etat.role + "|" + _idMoi;
    if (sig === etat._sigPart) return; etat._sigPart = sig;
    var ul = E["liste-part"]; ul.innerHTML = "";
    // Filet de sécurité pour les homonymes. L'entrée les refuse maintenant en
    // amont (règle `prenom_pris` : on demande une lettre du nom de famille),
    // mais une session ouverte avant ce changement peut encore en contenir :
    // dans ce cas on numérote les occurrences (Antoine ·1, Antoine ·2).
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
    if (vue.lienVocal === etat._sigVocal) return; etat._sigVocal = vue.lienVocal;
    if (vue.lienVocal) { E["vocal-lien"].hidden = false; E["vocal-lien"].href = vue.lienVocal; if (E["vocal-url"]) E["vocal-url"].value = vue.lienVocal; }
    else E["vocal-lien"].hidden = true;
    // Le lien visio se voit AUSSI dans la barre du haut : c'est la premiere
    // chose qu'on cherche une fois dans le tableau, il ne doit pas etre cache
    // derriere le panneau des participants.
    if (E["visio-top"]) {
      E["visio-top"].hidden = !vue.lienVocal;
      if (vue.lienVocal) E["visio-top"].href = vue.lienVocal;
    }
  }
  // Couleur par lot (aide l'animateur a voir ou il en est dans la partie).
  var LOT_COULEUR = { 1: "#E8811C", 2: "#2f7d4f", 3: "#3b6ea5", 4: "#8a4fb3", 5: "#c1444e" };

  // Pool commun : cartes mises a disposition par l'animateur, visibles de tou·tes.
  // Un clic « Poser » place la carte sur la table (tout le monde). L'animateur
  // peut aussi la retirer du pool (x). Chacun peut replier / deplier le pool et
  // regler la taille des cartes (retreci / agrandi), memorisee par navigateur.
  var poolReduit = false;
  var POOL_TAILLES = [92, 116, 150, 190]; // largeurs possibles des cases du pool
  var poolTaille = 1;
  var MAX_POOL = 8;                        // doit rester aligne sur serveur/src/regles.js
  try { var pt = parseInt(localStorage.getItem("fresque:pooltaille"), 10); if (pt >= 0 && pt < POOL_TAILLES.length) poolTaille = pt; } catch (e) {}
  try { poolReduit = localStorage.getItem("fresque:poolreduit") === "1"; } catch (e) {}
  function appliquerTaillePool() {
    var z = E["pool"]; if (z) z.style.setProperty("--pw", POOL_TAILLES[poolTaille] + "px");
  }
  function changerTaillePool(delta) {
    poolTaille = Math.max(0, Math.min(POOL_TAILLES.length - 1, poolTaille + delta));
    try { localStorage.setItem("fresque:pooltaille", String(poolTaille)); } catch (e) {}
    appliquerTaillePool(); placerPool();
    var z = E["pool"]; if (z) { var b = z.querySelector(".pool-moins"), p = z.querySelector(".pool-plus");
      if (b) b.disabled = poolTaille === 0; if (p) p.disabled = poolTaille === POOL_TAILLES.length - 1; }
  }

  /* ---------- Panneau du pool : librement deplacable ------------------------
     Le pool n'est plus une rangee collee en bas : c'est un panneau que chacun
     place ou il veut sur son ecran (la position est personnelle, memorisee par
     navigateur), repliable, avec 8 emplacements fixes (2 de large, 4 de haut)
     pour que la disposition ne bouge pas quand les cartes vont et viennent. */
  var poolPos = null;
  try { poolPos = JSON.parse(localStorage.getItem("fresque:poolpos2") || "null"); } catch (e) { poolPos = null; }
  var poolPosChoisie = !!poolPos;   // true des que la personne l'a deplace elle-meme
  function placerPool() {
    var z = E["pool"], r = rectScene(); if (!z || !r.width) return;
    var g = z.querySelector(".pool-grille");
    var tete = z.querySelector(".pool-tete");
    var marge = 16;
    // 1. Borner la grille a la place disponible dans la scene (en-tete + marges
    //    deduits) : le panneau ne peut alors jamais depasser du cadre.
    if (g) {
      var chrome = (tete ? tete.offsetHeight : 30) + 26;
      g.style.maxHeight = Math.max(120, r.height - 2 * marge - chrome) + "px";
    }
    // 2. Positionner avec la hauteur definitive. Par defaut en bas a DROITE :
    //    c'est de ce cote qu'on lui reprend le plus facilement de la place, et
    //    « Tout voir » recadre la fresque a cote (voir zoneLibre).
    var w = z.offsetWidth || 260, h = z.offsetHeight || 200;
    // Tant que personne ne l'a deplace, on recalcule le coin bas-droit a chaque
    // fois : la taille du panneau change (cartes qui arrivent, repli, reglage).
    if (!poolPosChoisie) poolPos = { x: r.width - w - marge, y: r.height - h - marge };
    // Le panneau reste entierement dans la scene quand il y tient ; sinon on
    // garde au moins son en-tete atteignable.
    var xMax = Math.max(4, r.width - w - 4), yMax = Math.max(4, r.height - h - 4);
    var x = Math.max(4, Math.min(xMax, poolPos.x));
    var y = Math.max(4, Math.min(yMax, poolPos.y));
    z.style.left = Math.round(x) + "px"; z.style.top = Math.round(y) + "px";
  }
  function memoriserPoolPos() {
    poolPosChoisie = true;   // a partir d'ici, on respecte le choix de la personne
    try { localStorage.setItem("fresque:poolpos2", JSON.stringify(poolPos)); } catch (e) {}
  }
  function glisserPanneauPool(e, poignee) {
    if (e.button && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    var z = E["pool"], r = rectScene();
    // Des le premier mouvement la position devient celle de la personne : sinon
    // placerPool() la ramenerait a son coin par defaut a chaque image.
    poolPosChoisie = true;
    var d = { mx: e.clientX, my: e.clientY, x: z.offsetLeft, y: z.offsetTop };
    try { poignee.setPointerCapture(e.pointerId); } catch (x) {}
    function mv(ev) {
      poolPos = { x: d.x + (ev.clientX - d.mx), y: d.y + (ev.clientY - d.my) };
      placerPool();
    }
    function fin(ev) {
      poignee.removeEventListener("pointermove", mv);
      poignee.removeEventListener("pointerup", fin);
      poignee.removeEventListener("pointercancel", fin);
      try { poignee.releasePointerCapture(ev.pointerId); } catch (x) {}
      poolPos = { x: z.offsetLeft, y: z.offsetTop }; memoriserPoolPos();
    }
    poignee.addEventListener("pointermove", mv);
    poignee.addEventListener("pointerup", fin);
    poignee.addEventListener("pointercancel", fin);
  }

  var _poolVues = {};   // cartes deja presentes au rendu precedent
  function rendrePool(vue) {
    var z = E["pool"]; if (!z) return;
    var pool = vue.pool || [];
    // Garde : on ne reconstruit le pool que si son contenu, ses reservations, le
    // pli ou la taille ont change (sinon churn DOM inutile a chaque version).
    var res = vue.reservations || {};
    var sig = pool.join(",") + "|" + Object.keys(res).sort().map(function (k) { return k + ":" + res[k]; }).join(",")
      + "|" + (poolReduit ? 1 : 0) + "|" + poolTaille + "|" + etat.role + "|" + (nomMoi() || "");
    if (sig === etat._sigPool) { appliquerTaillePool(); return; }
    // Pendant un glisser depuis le pool, on NE RECONSTRUIT PAS le panneau :
    // reserver la carte change l'etat, donc le rendu detruisait l'element que la
    // main est en train de deplacer, et le depot se perdait (le fameux « parfois
    // le glisser-deposer ne marche pas »). On rejouera au relachement.
    if (glissePool && glissePool.bouge) { etat._sigPool = null; return; }
    etat._sigPool = sig;
    z.innerHTML = "";
    z.classList.toggle("replie", poolReduit);
    appliquerTaillePool();

    var anim = etat.role === "animateur";
    var tete = document.createElement("div"); tete.className = "pool-tete";
    var poignee = document.createElement("button");
    poignee.type = "button"; poignee.className = "pool-poignee";
    poignee.setAttribute("aria-label", S.poolDeplacer); poignee.title = S.poolDeplacer;
    poignee.innerHTML = "<span aria-hidden='true'>⠿</span>";
    poignee.addEventListener("pointerdown", function (e) { glisserPanneauPool(e, poignee); });
    tete.appendChild(poignee);

    var tog = document.createElement("button"); tog.type = "button"; tog.className = "pool-toggle";
    tog.setAttribute("aria-expanded", poolReduit ? "false" : "true");
    tog.textContent = (poolReduit ? "▸ " : "▾ ") + S.poolTitre + " " + pool.length + "/" + MAX_POOL;
    tog.addEventListener("click", function () {
      poolReduit = !poolReduit;
      try { localStorage.setItem("fresque:poolreduit", poolReduit ? "1" : "0"); } catch (e) {}
      etat._sigPool = null; rendrePool(etat.vue || vue); placerPool();
      clampPan(); applyView(); majFleches();   // la place liberee profite au tableau
    });
    tete.appendChild(tog);

    if (!poolReduit) {
      if (anim) {
        // Remplir / vider le pool d'un geste : l'animateur n'a plus a cliquer
        // les cartes une par une pour lancer ou nettoyer une manche.
        var rem = document.createElement("button"); rem.type = "button"; rem.className = "pool-act";
        rem.textContent = S.poolRemplirTxt; rem.title = S.poolRemplirT;
        rem.disabled = pool.length >= MAX_POOL;
        rem.addEventListener("click", function () { agir({ op: "poolRemplir" }); });
        var vid = document.createElement("button"); vid.type = "button"; vid.className = "pool-act";
        vid.textContent = S.poolViderTxt; vid.title = S.poolViderT;
        vid.disabled = pool.length === 0;
        vid.addEventListener("click", function () { if (window.confirm(S.confirmVider)) agir({ op: "poolVider" }); });
        tete.appendChild(rem); tete.appendChild(vid);
      }
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
    if (poolReduit) { placerPool(); return; }

    // Grille de 8 emplacements FIXES (2 x 4) : les cases vides restent visibles,
    // donc rien ne se decale quand une carte part ou arrive.
    var grille = document.createElement("div"); grille.className = "pool-grille";
    var reserv = vue.reservations || {};
    var moiNom = nomMoi();
    for (var i = 0; i < MAX_POOL; i++) {
      var case_ = document.createElement("div"); case_.className = "pool-case";
      var n = pool[i];
      if (n == null) {
        case_.classList.add("libre");
        case_.setAttribute("aria-label", S.poolCaseVide);
        grille.appendChild(case_);
        continue;
      }
      precharger(n);
      // Nouvelle venue dans la reserve : elle s'annonce. Quand l'animateur
      // remplit la reserve d'un coup, on voit les cartes arriver au lieu de les
      // decouvrir posees la.
      var carte = carteDePool(n, reserv[n], moiNom, anim);
      if (!_poolVues[n]) carte.classList.add("pool-neuve");
      case_.appendChild(carte);
      grille.appendChild(case_);
    }
    z.appendChild(grille);
    _poolVues = {}; pool.forEach(function (n) { if (n != null) _poolVues[n] = 1; });
    if (!pool.length) {
      var v = document.createElement("p"); v.className = "pool-vide";
      v.textContent = anim ? S.poolVideAnim : S.poolVide;
      z.appendChild(v);
    }
    placerPool();
  }
  function carteDePool(n, par, moiNom, anim) {
    var c = etat.cartes[n];
    var d = document.createElement("div"); d.className = "pool-carte"; d.dataset.n = n;
    if (c && c.lot) d.style.setProperty("--lot", LOT_COULEUR[c.lot] || "#8a857b");
    var verrou = par && par !== moiNom;   // carte en cours de prise par quelqu'un d'autre
    if (verrou) d.classList.add("occupee");
    d.innerHTML = '<div class="vis"><img alt="" src="' + srcCarte(c && c.image) + '"><span class="num">' + n + '</span>'
      + (verrou ? '<span class="pool-verrou">🔒 ' + esc(par) + '</span>' : '') + '</div>'
      + '<div class="tit">' + esc(c ? c.titre : "") + '</div>'
      + '<div class="pool-actions"><button class="btn primaire" data-a="poser" title="' + esc(S.prendre) + '"' + (verrou ? ' disabled' : '') + '>' + esc(S.poser) + '</button>'
      + (anim ? '<button class="pool-x" data-a="retirer" title="' + esc(S.retirerPool) + '" aria-label="' + esc(S.retirerPool) + '">✕</button>' : '')
      + '</div>';
    d.title = verrou ? (S.occupeePar ? S.occupeePar(par) : par) : (c && c.titre ? n + " · " + c.titre : "");
    d.querySelector('[data-a="poser"]').addEventListener("click", function (e) {
      e.stopPropagation(); if (!verrou) agir({ op: "poserCarte", n: n, pos: pointLibre(), rect: rectVisible() });
    });
    var bx = d.querySelector('[data-a="retirer"]');
    if (bx) bx.addEventListener("click", function (e) { e.stopPropagation(); agir({ op: "poolRetirer", n: n }); });
    if (!verrou) d.addEventListener("pointerdown", function (e) { demarrerGlissePool(e, n, d); });
    return d;
  }
  function nomMoi() { return etat.role === "animateur" ? (etat.vue && etat.vue.animateur && etat.vue.animateur.prenom) || "" : (function () { var m = (etat.vue && etat.vue.participants || []).find(function (p) { return p.id === _idMoi; }); return m ? m.prenom : ""; })(); }

  /* ---------- Glisser-deposer : pool <-> tableau, reserve <-> pool ----------
     Fiabilite : le pointeur est CAPTURE par l'element saisi, donc on recoit
     toujours le relachement, meme si le curseur passe au-dessus d'un autre
     panneau. La zone de depot est calculee geometriquement (rectangles), sans
     `elementFromPoint` : c'est ce qui faisait echouer un depot sur deux quand un
     element se trouvait sous le curseur (fantome, info-bulle, bord de panneau).
     Au premier vrai mouvement on RESERVE la carte cote serveur (les autres la
     voient verrouillee). Au relacher sur le tableau, on POSE au point de depot
     (le serveur tranche : une seule prise possible). Ailleurs, on LIBERE. */
  var glissePool = null;
  function dansRect(cx, cy, el) {
    if (!el || el.hidden || !el.offsetParent) return false;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  function surScene(cx, cy) { var r = rectScene(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; }
  // Zone de depot valide : sur la scene, mais PAS au-dessus du pool, de la
  // reserve, des barres ni des panneaux (sinon lacher la carte la-dessus la
  // poserait par erreur sous le panneau).
  function zoneDepot(cx, cy) {
    if (!surScene(cx, cy)) return false;
    var obstacles = [E["pool"], E["deck"], E["panneau"], document.querySelector(".topbar"),
      E["dock"] && !E["dock"].hidden ? E["dock"] : null, document.getElementById("aide-pop"),
      E["menu-affichage"] && !E["menu-affichage"].hidden ? E["menu-affichage"] : null];
    for (var i = 0; i < obstacles.length; i++) { if (dansRect(cx, cy, obstacles[i])) return false; }
    return true;
  }
  function surPool(cx, cy) { return dansRect(cx, cy, E["pool"]); }
  function surDeck(cx, cy) { return dansRect(cx, cy, E["deck"]); }
  function fantome(n) {
    var c = etat.cartes[n];
    var f = document.createElement("div"); f.className = "pool-fantome";
    f.innerHTML = '<img alt="" src="' + srcCarte(c && c.image) + '"><span>' + n + "</span>";
    document.body.appendChild(f);
    return f;
  }
  function demarrerGlissePool(e, n, elCarte) {
    if (e.button && e.button !== 0) return;
    if (e.target.closest(".pool-actions") || e.target.closest(".pool-x")) return; // clics boutons
    e.preventDefault();
    glissePool = { n: n, x0: e.clientX, y0: e.clientY, bouge: false, reserve: false, fantome: null, refuse: false, el: elCarte, pid: e.pointerId };
    // Ecouteurs sur le DOCUMENT (et non sur la carte) : ils survivent a une
    // reconstruction du panneau et au passage du curseur sur un autre element.
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
      api("agir", { code: etat.code, jeton: etat.jeton, version: etat.version, intention: { op: "reserverPool", n: g.n } }).then(function (res) {
        if (!glissePool || glissePool !== g) return;
        if (res.d && res.d.refus) { g.refuse = true; flash(res.d.refus.message || (S.occupee || "")); finGlissePool(true); }
        else { g.reserve = true; if (res.d && res.d.etat) { appliquerEtat(res.d.etat, true); envoyerEtat(res.d.etat); } }
      }).catch(function () {});
      g.fantome = fantome(g.n);
      if (g.el) g.el.classList.add("en-glisse");
    }
    if (g.fantome) { g.fantome.style.left = e.clientX + "px"; g.fantome.style.top = e.clientY + "px"; }
    var wg = versMonde(e.clientX, e.clientY);
    envoyerGliss(g.n, wg.x - 80, wg.y - 75, 1);   // meme centrage que la pose (regles.js)
    // Retour visuel : la scene s'illumine quand on survole une zone deposable ;
    // la reserve s'illumine quand on va y renvoyer la carte.
    E.scene.classList.toggle("depot-actif", zoneDepot(e.clientX, e.clientY));
    if (E["deck"]) E["deck"].classList.toggle("depot-actif", surDeck(e.clientX, e.clientY));
  }
  function glisserPoolUp(e) {
    var g = glissePool; if (!g) return;
    if (g.refuse) { finGlissePool(true); return; }
    if (g.bouge && surDeck(e.clientX, e.clientY) && etat.role === "animateur") {
      agir({ op: "poolRetirer", n: g.n });          // renvoyee dans la reserve
    } else if (g.bouge && zoneDepot(e.clientX, e.clientY)) {
      var w = versMonde(e.clientX, e.clientY);
      agir({ op: "poserCarte", n: g.n, pos: { x: Math.round(w.x), y: Math.round(w.y) }, rect: rectVisible() });
    } else if (g.bouge && g.reserve) {
      agir({ op: "libererPool", n: g.n });          // depose ailleurs : on relache la prise
    }
    finGlissePool(false);
  }
  function finGlissePool(silence) {
    var g = glissePool; glissePool = null;
    if (g && g.bouge) envoyerGlissFin(g.n);
    document.removeEventListener("pointermove", glisserPoolMove, true);
    document.removeEventListener("pointerup", glisserPoolUp, true);
    document.removeEventListener("pointercancel", glisserPoolUp, true);
    if (g && g.el) g.el.classList.remove("en-glisse");
    E.scene.classList.remove("depot-actif");
    if (E["deck"]) E["deck"].classList.remove("depot-actif");
    if (g && g.fantome) g.fantome.remove();
    // Le panneau a pu se perimer pendant le glissement : on le rejoue.
    if (etat.vue) { etat._sigPool = null; rendrePool(etat.vue); }
  }

  /* ---------- Reserve (animateur) : le jeu complet, illustre ----------------
     Clic OU glisser-deposer vers le pool. Les cartes sont montrees avec leur
     illustration, comme dans le pool : on reconnait une carte a son image bien
     avant de lire son titre. */
  var deckFait = false;
  function construireDeck() {
    var z = E["deck-cartes"]; if (!z || deckFait) return; deckFait = true;
    for (var n = 1; n <= 38; n++) {
      var c = etat.cartes[n]; if (!c) continue;
      var b = document.createElement("div"); b.className = "deck-carte"; b.dataset.n = n;
      b.setAttribute("role", "button"); b.tabIndex = 0;
      b.style.setProperty("--lot", LOT_COULEUR[c.lot] || "#8a857b");
      b.title = n + " · " + c.titre + " : " + S.reserveGlisser;
      b.innerHTML = '<span class="dvis"><img alt="" loading="lazy" src="' + srcCarte(c.image) + '"><span class="dn">' + n + '</span></span>'
        + '<span class="dt">' + esc(c.titre) + '</span>';
      b.addEventListener("click", function () { if (!this.classList.contains("indispo")) agir({ op: "poolAjouter", n: +this.dataset.n }); });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); if (!this.classList.contains("indispo")) agir({ op: "poolAjouter", n: +this.dataset.n });
      });
      b.addEventListener("pointerdown", function (e) { demarrerGlisseDeck(e, +this.dataset.n, this); });
      z.appendChild(b);
    }
  }
  // Glisser une carte de la reserve vers le pool (ou directement sur le tableau,
  // ce qui la met au pool puis la pose).
  var glisseDeck = null;
  function demarrerGlisseDeck(e, n, el) {
    if (e.button && e.button !== 0) return;
    if (el.classList.contains("indispo")) return;
    e.preventDefault();
    glisseDeck = { n: n, x0: e.clientX, y0: e.clientY, bouge: false, fantome: null, el: el, pid: e.pointerId };
    document.addEventListener("pointermove", glisserDeckMove, true);
    document.addEventListener("pointerup", glisserDeckUp, true);
    document.addEventListener("pointercancel", glisserDeckUp, true);
  }
  function glisserDeckMove(e) {
    var g = glisseDeck; if (!g) return;
    if (!g.bouge && Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 5) return;
    if (!g.bouge) { g.bouge = true; g.fantome = fantome(g.n); g.el.classList.add("en-glisse"); }
    g.fantome.style.left = e.clientX + "px"; g.fantome.style.top = e.clientY + "px";
    var wd = versMonde(e.clientX, e.clientY);
    envoyerGliss(g.n, wd.x - 80, wd.y - 75, 1);   // idem
    if (E["pool"]) E["pool"].classList.toggle("depot-actif", surPool(e.clientX, e.clientY));
  }
  function glisserDeckUp(e) {
    var g = glisseDeck; if (!g) return;
    var surLePool = g.bouge && surPool(e.clientX, e.clientY);
    // L'action d'abord (c'est elle qui diffuse l'etat), la fin du geste ensuite :
    // sinon le fantome disparait chez les autres avant que la carte n'existe,
    // et la pose clignote.
    if (surLePool) agir({ op: "poolAjouter", n: g.n });
    else if (g.bouge && !g.dejaClic && zoneDepot(e.clientX, e.clientY)) {
      // Lachee sur le tableau : elle passe par le pool (regle du jeu) puis se pose.
      var w = versMonde(e.clientX, e.clientY);
      var n = g.n, pos = { x: Math.round(w.x), y: Math.round(w.y) };
      agir({ op: "poolAjouter", n: n }, function (d) {
        if (d && d.refus) return;
        agir({ op: "poserCarte", n: n, pos: pos, rect: rectVisible() });
      });
    }
    finGlisseDeck();
  }
  function finGlisseDeck() {
    var g = glisseDeck; glisseDeck = null;
    if (g && g.bouge) envoyerGlissFin(g.n);
    document.removeEventListener("pointermove", glisserDeckMove, true);
    document.removeEventListener("pointerup", glisserDeckUp, true);
    document.removeEventListener("pointercancel", glisserDeckUp, true);
    if (!g) return;
    g.el.classList.remove("en-glisse");
    if (g.fantome) g.fantome.remove();
    if (E["pool"]) E["pool"].classList.remove("depot-actif");
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
      b.classList.toggle("indispo", !!st);
      b.setAttribute("aria-disabled", st ? "true" : "false");
    });
    if (E["deck-compte"]) E["deck-compte"].textContent = (vue.pool || []).length + " / " + MAX_POOL;
  }

  /* ---------- Netteté des cartes ---------------------------------------------
     Une carte fait 150 px sur le tableau, l'image fournie en faisait 560 : le
     navigateur la reduisait d'un facteur 3,7 a chaque affichage, et une
     reduction aussi forte faite a la volee rend l'image molle. On fournit donc
     une variante deja reduite a 300 px et legerement accentuee (hors ligne,
     avec un bon filtre) : il ne reste qu'un facteur 2 a faire sur un ecran
     ordinaire, et rien du tout sur un ecran a haute densite. Elle est aussi
     trois fois plus legere que celle qu'on servait.
     LE ZOOM, LUI, ECHAPPE AU NAVIGATEUR : le tableau est agrandi par une
     transformation CSS, dont `sizes` ne tient aucun compte. On le lui dit donc
     nous-memes, par paliers (recalculer a chaque cran de zoom ferait recharger
     les images sans arret). */
  var PALIERS_NET = [150, 240, 360, 560, 900];
  var _netPalier = 150;
  function srcCarte(im) { return im ? BASE + (im.petite || im.vignette || "") : ""; }
  function srcsetCarte(im) {
    if (!im) return "";
    var l = [];
    if (im.petite) l.push(BASE + im.petite + " 300w");
    if (im.vignette) l.push(BASE + im.vignette + " 560w");
    if (im.grand) l.push(BASE + im.grand + " 900w");
    return l.length > 1 ? l.join(", ") : "";
  }
  function attrsImgCarte(im) {
    var ss = srcsetCarte(im);
    return 'src="' + srcCarte(im) + '"' + (ss ? ' srcset="' + ss + '" sizes="' + _netPalier + 'px"' : "");
  }
  function palierNet() {
    var besoin = 150 * (etat.zoom || 1);
    for (var i = 0; i < PALIERS_NET.length; i++) { if (besoin <= PALIERS_NET[i]) return PALIERS_NET[i]; }
    return PALIERS_NET[PALIERS_NET.length - 1];
  }
  function majNettete() {
    var p = palierNet(); if (p === _netPalier) return;
    _netPalier = p;
    var imgs = E.monde.querySelectorAll(".c-carte .vis img");
    for (var i = 0; i < imgs.length; i++) { if (imgs[i].srcset) imgs[i].sizes = p + "px"; }
  }

  /* ---------- Tableau (rendu déclaratif) ---------- */
  var _premierRendu = true;
  function rendreTableau(tab) {
    if (!tab) return;
    var vus = {};
    tab.cartes.forEach(function (c) {
      vus[c.n] = 1;
      var el = etat.elCartes[c.n], neuf = false;
      if (!el) {
        annulerSortie(c.n);
        el = creerElCarte(c.n); etat.elCartes[c.n] = el; E.monde.appendChild(el); precharger(c.n); neuf = true;
        // On n'anime QUE les vraies arrivees. En rejoignant une session en
        // cours, les cartes deja posees ne « viennent » pas d'arriver : les
        // faire toutes surgir ensemble ferait un feu d'artifice sans aucun sens.
        if (!_premierRendu) flashPose(el);
      }
      // On ne repositionne pas une carte qu'on deplace soi-meme (etat.dragN), ni
      // une carte du tableau que quelqu'un d'autre est en train de deplacer
      // (glissParCarte) : elle sauterait entre deux positions. En revanche une
      // carte qui vient d'arriver, elle, doit toujours etre placee.
      var fige = neuf ? false : (etat.dragN === c.n || glissParCarte[c.n] === 1);
      // Carte tiree par quelqu'un d'autre et dont le serveur vient de donner la
      // position d'arrivee : on ne la pose pas d'autorite (elle sauterait), on
      // ajoute ce point au tampon du geste. Le trajet se termine tout seul, a la
      // vitesse de la personne, et s'arrete exactement au bon endroit.
      if (fige && glissParCarte[c.n] === 1) pointFinalGliss(c.n, c.x, c.y);
      if (!fige) { el.style.left = c.x + "px"; el.style.top = c.y + "px"; el._x = c.x; el._y = c.y; }
    });
    Object.keys(etat.elCartes).forEach(function (n) { if (!vus[n]) retirerElCarte(n); });

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
    majPlancher();
    assurerRoving();   // au moins une carte reste atteignable a la tabulation
    _premierRendu = false;
    var exp = document.getElementById("btn-export");
    if (exp) exp.hidden = !(tab.cartes && tab.cartes.length >= 38);
  }

  function creerElCarte(n) {
    var c = etat.cartes[n]; var el = document.createElement("div"); el.className = "c-carte"; el.dataset.n = n;
    // Couleur du lot : invisible de pres (un filet de 3 px en haut), mais c'est
    // elle qui fait lire les familles de cartes quand on prend du recul.
    if (c && c.lot) el.style.setProperty("--lot", LOT_COULEUR[c.lot] || "#8a857b");
    el.innerHTML = '<div class="vis"><img alt="" loading="lazy" ' + attrsImgCarte(c && c.image) + '><span class="num">' + n + '</span>'
      + '<button class="agr" aria-label="Agrandir">⤢</button></div><div class="tit">' + esc(c ? c.titre : "") + '</div>';
    // ACCESSIBILITE AU CLAVIER. Les cartes etaient de simples `div` : on pouvait
    // remplir la reserve et poser une carte au clavier, mais ni la deplacer ni
    // la relier, c'est-a-dire ni faire la fresque. Chaque carte devient un
    // element focalisable et annonce ce qu'elle est.
    el.setAttribute("tabindex", "-1");   // un seul point d'entree, voir `rovingCarte`
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", n + " " + (c ? c.titre : "") + ". " + S.a11yCarte);
    el.addEventListener("keydown", function (e) { clavierCarte(e, n, el); });
    el.addEventListener("focus", function () { rovingCarte(el); montrerSurvol(n); });
    el.addEventListener("blur", masquerSurvol);
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
  function flashPose(el) {
    el.classList.remove("pose-anim");
    void el.offsetWidth;                 // relance l'animation si la carte revient
    el.classList.add("pose-anim");
    setTimeout(function () { el.classList.remove("pose-anim"); }, 750);
  }
  /* DEPART D'UNE CARTE. Elle disparaissait d'un coup : on ne savait pas si
     quelqu'un venait de la retirer ou si on avait mal vu. Elle s'efface
     maintenant en se retractant. L'element est sorti du registre TOUT DE SUITE
     (il ne compte plus dans le tableau) et seulement retire du document a la fin
     du mouvement ; si la carte revient entre-temps, on annule proprement. */
  var _sorties = {};
  function retirerElCarte(n) {
    var el = etat.elCartes[n]; if (!el) return;
    delete etat.elCartes[n];
    if (mvtReduit) { el.remove(); return; }
    if (_sorties[n]) { clearTimeout(_sorties[n].t); _sorties[n].el.remove(); }
    el.classList.add("sort-anim");
    _sorties[n] = { el: el, t: setTimeout(function () { el.remove(); delete _sorties[n]; }, 240) };
  }
  function annulerSortie(n) {
    var o = _sorties[n]; if (!o) return;
    clearTimeout(o.t); o.el.remove(); delete _sorties[n];
  }
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

  /* NAVIGATION ET MANIPULATION AU CLAVIER.
     Modele choisi, et pourquoi. Avec trente-huit cartes, les rendre toutes
     tabulables obligerait a trente-huit tabulations pour traverser le tableau :
     personne ne le ferait. On applique donc le schema recommande pour les
     grilles d'elements (« roving tabindex ») : UN seul point d'entree au
     clavier, puis les fleches pour passer d'une carte a l'autre.
       Tab              entrer dans le tableau / en sortir
       Fleches          aller a la carte la plus proche dans cette direction
       Maj + fleches    DEPLACER la carte (Maj+Ctrl : pas de 100 px)
       Entree / Espace  selectionner (animateur) ou agrandir
       L                relier : une fois sur la carte de depart, une fois sur
                        celle d'arrivee
       Suppr            retirer la carte (animateur)
       Echap            annuler le lien en cours ou la selection
     Le deplacement n'envoie au serveur qu'a la fin de la rafale de touches : on
     n'ecrit pas une action par pression. */
  var _rovingN = null;
  function rovingCarte(el) {
    if (_rovingN === el) return;
    if (_rovingN) _rovingN.setAttribute("tabindex", "-1");
    _rovingN = el; el.setAttribute("tabindex", "0");
  }
  // Au moins une carte doit toujours etre atteignable a la tabulation.
  function assurerRoving() {
    if (_rovingN && _rovingN.isConnected) return;
    var prem = E.monde.querySelector(".c-carte");
    _rovingN = null; if (prem) rovingCarte(prem);
  }
  // Carte la plus proche dans une direction, mesuree dans le monde.
  function carteVoisine(depuis, dx, dy) {
    var a = centreCarte(+depuis.dataset.n); if (!a) return null;
    var meilleure = null, score = Infinity;
    Object.keys(etat.elCartes).forEach(function (k) {
      var el = etat.elCartes[k]; if (el === depuis) return;
      var b = centreCarte(+k); if (!b) return;
      var vx = b.x - a.x, vy = b.y - a.y;
      var avance = vx * dx + vy * dy;              // distance dans la direction visee
      if (avance <= 1) return;                     // pas dans cette direction
      var ecart = Math.abs(vx * dy - vy * dx);     // ecart lateral
      var c = avance + ecart * 2.2;                // on privilegie l'alignement
      if (c < score) { score = c; meilleure = el; }
    });
    return meilleure;
  }
  // Amene la carte dans la partie visible si elle n'y est pas : au clavier, on
  // ne peut pas faire defiler soi-meme avant d'y arriver.
  function assurerVisible(el) {
    var r = rectScene(), z = zoneLibre(r);
    var x = (el._x || 0) * etat.zoom + etat.panX, y = (el._y || 0) * etat.zoom + etat.panY;
    dimCarte(el);
    var w = el._w * etat.zoom, h = el._h * etat.zoom, m = 24;
    var dx = 0, dy = 0;
    if (x < z.x + m) dx = z.x + m - x;
    else if (x + w > z.x + z.largeur - m) dx = z.x + z.largeur - m - (x + w);
    if (y < z.y + m) dy = z.y + m - y;
    else if (y + h > z.y + z.hauteur - m) dy = z.y + z.hauteur - m - (y + h);
    if (!dx && !dy) return;
    etat.panX += dx; etat.panY += dy; clampPan(); applyView(); majFleches();
  }
  var _bougeClavier = null;
  function clavierCarte(e, n, el) {
    if (e.altKey || e.ctrlKey && !e.shiftKey || e.metaKey) return;
    var DIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    var d = DIR[e.key];
    if (d) {
      e.preventDefault();
      if (e.shiftKey) {
        // Deplacer la carte. On rend la main au serveur seulement a la fin de la
        // rafale, sinon on lui enverrait une action par pression de touche.
        var pas = e.ctrlKey ? 100 : 20;
        dimCarte(el);
        el._x = Math.max(0, Math.min(PLAN_W - el._w, (el._x || 0) + d[0] * pas));
        el._y = Math.max(0, Math.min(PLAN_H - el._h, (el._y || 0) + d[1] * pas));
        el.style.left = el._x + "px"; el.style.top = el._y + "px";
        majFleches(); assurerVisible(el);
        envoyerGliss(n, el._x, el._y, 0);
        clearTimeout(_bougeClavier);
        _bougeClavier = setTimeout(function () {
          agir({ op: "deplacerCarte", n: n, x: el._x, y: el._y });  // l'etat d'abord
          envoyerGlissFin(n);
        }, 400);
      } else {
        var v = carteVoisine(el, d[0], d[1]);
        if (v) { assurerVisible(v); try { v.focus(); } catch (x) {} }
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (estFleche(etat.outil)) { clicFleche(n, el); return; }
      if (etat.role === "animateur") selCarte(n, el); else ouvrirModal(n);
      return;
    }
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      if (!estFleche(etat.outil)) setOutil("fleche");
      clicFleche(n, el);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && etat.role === "animateur") {
      e.preventDefault();
      var suiv = carteVoisine(el, 1, 0) || carteVoisine(el, -1, 0);
      agir({ op: "retirerCarte", n: n });
      if (suiv) setTimeout(function () { try { suiv.focus(); } catch (x) {} }, 60);
      return;
    }
    if (e.key === "Escape") {
      if (etat.flecheDepart) { annulerFleche(); setOutil("deplacer"); } else deselect();
    }
  }

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
      dimCarte(el);   // taille en cache : pas de calcul de mise en page par image
      var x = Math.max(0, Math.min(PLAN_W - el._w, st.x + (e.clientX - st.mx) / etat.zoom));
      var y = Math.max(0, Math.min(PLAN_H - el._h, st.y + (e.clientY - st.my) / etat.zoom));
      el._x = x; el._y = y; el.style.left = x + "px"; el.style.top = y + "px"; majFleches();
      envoyerGliss(n, x, y, 0);   // les autres voient la carte bouger en direct
    });
    function fin(e, annule) {
      if (!st) return; st = null; el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch (x) {}
      etat.dragN = null;
      // L'ETAT D'ABORD, LA FIN DU GESTE ENSUITE. Les deux partent par le meme
      // relais, donc dans l'ordre d'envoi : si « gliss0 » passait devant, les
      // autres relacheraient la carte avant de connaitre sa nouvelle position,
      // et c'est exactement l'aller-retour qu'on voyait a chaque depose.
      if (bouge && !annule) { el._justDrag = Date.now(); agir({ op: "deplacerCarte", n: n, x: el._x, y: el._y }); }
      envoyerGlissFin(n);
      // Annulation (pointercancel) : on ne touche pas au serveur, la carte
      // reprend sa derniere position connue au prochain rendu.
    }
    el.addEventListener("pointerup", function (e) { fin(e, false); });
    el.addEventListener("pointercancel", function (e) { fin(e, true); });
  }

  /* ---------- Flèches ---------- */
  function estFleche(o) { return o === "fleche" || o === "fleche2"; }
  function clicFleche(n, el) {
    if (!etat.flecheDepart) {
      etat.flecheDepart = { n: n, el: el }; el.classList.add("depart");
      etat.flecheCurseur = centreCarte(n); dessinerFlechesLive();
      flash(S.flecheEchap);
    }
    else if (etat.flecheDepart.n === n) { annulerFleche(); }
    else { agir({ op: "creerFleche", de: etat.flecheDepart.n, vers: n, bidir: etat.outil === "fleche2" }); annulerFleche(); setOutil("deplacer"); }
  }
  function annulerFleche() {
    if (etat.flecheDepart) etat.flecheDepart.el.classList.remove("depart");
    etat.flecheDepart = null; etat.flecheCurseur = null;
    envoyerWS({ t: "fl0" }); dessinerFlechesLive();
  }
  // Trace elastique : entre le 1er et le 2e clic, une ligne suit le curseur. Elle
  // est rendue LOCALEMENT (aucune attente du serveur) et relayee aux autres en
  // ephemere, pour qu'ils voient le lien se construire en direct.
  function suivreFleche(cx, cy) {
    if (!etat.flecheDepart) return;
    var w = versMonde(cx, cy);
    etat.flecheCurseur = { x: w.x, y: w.y };
    dessinerFlechesLive();
    var now = Date.now();
    if (now - (etat._flTs || 0) < 55) return; etat._flTs = now;
    envoyerWS({ t: "fl", de: etat.flecheDepart.n, x: Math.round(w.x), y: Math.round(w.y) });
  }

  /* TAILLE DES CARTES, MESUREE UNE FOIS. `offsetWidth` force le navigateur a
     recalculer la mise en page : le lire pour chaque extremite de chaque fleche,
     a chaque image d'un glissement, revenait a demander des dizaines de calculs
     de mise en page par image (le « layout thrashing » classique, lecture et
     ecriture du DOM entrelacees). Une carte fait toujours la meme taille : le
     zoom passe par une transformation du monde, pas par la carte. On mesure donc
     une fois et on garde. Invalide au redimensionnement et a l'arrivee des
     polices, seuls moments ou la hauteur d'un titre peut changer. */
  function dimCarte(el) {
    if (!el._w) { el._w = el.offsetWidth || 150; el._h = el.offsetHeight || 150; }
    return el;
  }
  function oublierDims() { for (var n in etat.elCartes) { etat.elCartes[n]._w = 0; etat.elCartes[n]._h = 0; } }
  function centreCarte(n) {
    var el = etat.elCartes[n]; if (!el) return null;
    dimCarte(el);
    return { x: (el._x || 0) + el._w / 2, y: (el._y || 0) + el._h / 2, w: el._w, h: el._h };
  }
  function bord(c, tx, ty) { var dx = tx - c.x, dy = ty - c.y; if (!dx && !dy) return { x: c.x, y: c.y };
    var hw = c.w / 2 + 4, hh = c.h / 2 + 4; var s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: c.x + dx * s, y: c.y + dy * s }; }
  // Redessin des fleches coalesce sur une frame d'animation : pendant un
  // glissement, un zoom ou un deplacement, on peut appeler majFleches() a chaque
  // evenement pointeur sans reconstruire le SVG plusieurs fois par frame.
  var _flechesRAF = 0;
  function majFleches() {
    if (_flechesRAF) return;
    _flechesRAF = requestAnimationFrame(function () { _flechesRAF = 0; dessinerFleches(); dessinerFlechesLive(); });
  }
  /* DESSIN DES FLECHES SANS RECONSTRUIRE LE SVG.
     Avant : on refabriquait tout le contenu de `#fleches` par innerHTML, on
     detruisait puis recreait chaque libelle, et on rebranchait un ecouteur de
     clic par fleche... a chaque image d'un glissement. Sur une machine modeste
     cela suffisait a faire sauter le deplacement d'une carte.
     Maintenant : chaque fleche garde ses deux chemins et son libelle d'une fois
     sur l'autre ; on ne change que ce qui a change (l'attribut `d`, une classe,
     une pointe). Un seul ecouteur, pose une fois, sert toutes les fleches. */
  var FLE_DEFS = '<defs><marker id="ah" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#8a857b"/></marker>'
    + '<marker id="aho" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#E8811C"/></marker>'
    + '<marker id="ahb" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto"><path d="M0,0 L11,4.5 L0,9 z" fill="#F0A860"/></marker>'
    + '<marker id="ahbs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M11,0 L0,4.5 L11,9 z" fill="#F0A860"/></marker></defs>';
  var SVGNS = "http://www.w3.org/2000/svg";
  var _fleNoeuds = {};   // id de fleche -> { hit, trait, lib, d, cls, mk, txt }
  var _flePrete = false;
  function preparerFleches() {
    if (_flePrete) return; _flePrete = true;
    E.fleches.insertAdjacentHTML("afterbegin", FLE_DEFS);
    // Un seul ecouteur, par delegation : plus rien a rebrancher au redessin.
    E.fleches.addEventListener("click", function (e) {
      var h = e.target && e.target.classList && e.target.classList.contains("hit") ? e.target : null;
      if (!h) return;
      e.stopPropagation(); selFleche(h.getAttribute("data-id"));
    });
  }
  function dessinerFleches() {
    if (!etat.vue) return;
    preparerFleches();
    var idx = {}, vus = {};
    (etat.vue.tableau.fleches || []).forEach(function (f) {
      var A = centreCarte(f.de), B = centreCarte(f.vers); if (!A || !B) return;
      var cle = Math.min(f.de, f.vers) + "-" + Math.max(f.de, f.vers); idx[cle] = (idx[cle] || 0); var k = idx[cle]++;
      var pa = bord(A, B.x, B.y), pb = bord(B, A.x, A.y);
      var mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
      var amp = Math.min(20, len * 0.09) * (k % 2 === 0 ? 1 : -1) * (1 + Math.floor(k / 2));
      var nx = -dy / len, ny = dx / len, cxp = mx + nx * amp, cyp = my + ny * amp;
      var d = "M" + pa.x + "," + pa.y + " Q" + cxp + "," + cyp + " " + pb.x + "," + pb.y;
      var sel = etat.sel && etat.sel.type === "fleche" && etat.sel.id === f.id;
      var cls = "trait" + (f.bidir ? " bidir" : "") + (sel ? " sel" : "");
      var mk = "url(#" + (sel ? "aho" : (f.bidir ? "ahb" : "ah")) + ")";

      var g = _fleNoeuds[f.id];
      if (!g) {
        g = { hit: document.createElementNS(SVGNS, "path"), trait: document.createElementNS(SVGNS, "path"), lib: null };
        g.hit.setAttribute("class", "hit"); g.hit.setAttribute("data-id", f.id);
        E.fleches.appendChild(g.hit); E.fleches.appendChild(g.trait);
        _fleNoeuds[f.id] = g;
      }
      if (g.d !== d) { g.hit.setAttribute("d", d); g.trait.setAttribute("d", d); g.d = d; }
      if (g.cls !== cls) { g.trait.setAttribute("class", cls); g.cls = cls; }
      if (g.mk !== mk) {
        g.trait.setAttribute("marker-end", mk);
        if (f.bidir) g.trait.setAttribute("marker-start", "url(#ahbs)"); else g.trait.removeAttribute("marker-start");
        g.mk = mk;
      }
      f._mid = { x: cxp, y: cyp };
      // Libelle : cree seulement s'il y en a un, deplace ensuite.
      if (f.libelle) {
        if (!g.lib) { g.lib = document.createElement("div"); g.lib.className = "fleche-lib"; E.monde.appendChild(g.lib); }
        if (g.txt !== f.libelle) { g.lib.textContent = f.libelle; g.txt = f.libelle; }
        g.lib.style.left = cxp + "px"; g.lib.style.top = cyp + "px";
      } else if (g.lib) { g.lib.remove(); g.lib = null; g.txt = null; }
      vus[f.id] = 1;
    });
    // Fleches disparues : on retire leurs noeuds.
    for (var id in _fleNoeuds) {
      if (vus[id]) continue;
      var mort = _fleNoeuds[id];
      mort.hit.remove(); mort.trait.remove(); if (mort.lib) mort.lib.remove();
      delete _fleNoeuds[id];
    }
    positionnerEditeurs();
  }

  // Couche ephemere : les fleches en cours de trace (la mienne et celles des
  // autres). Separee de #fleches pour ne jamais reconstruire les vraies fleches.
  var _liveVide = true;
  function dessinerFlechesLive() {
    var L = E["fleches-live"]; if (!L) return;
    var html = "";
    if (etat.flecheDepart && etat.flecheCurseur) html += traitLive(etat.flecheDepart.n, etat.flecheCurseur.x, etat.flecheCurseur.y, "#E8811C");
    for (var id in flLive) { var f = flLive[id]; html += traitLive(f.de, f.x, f.y, couleurCurseur(id)); }
    // Rien a tracer et deja vide : on ne touche pas au document. Sans ce test on
    // reecrivait une couche vide a chaque image de chaque deplacement, pour rien.
    if (!html && _liveVide) return;
    L.innerHTML = html;
    _liveVide = !html;
  }
  function traitLive(de, x, y, coul) {
    var A = centreCarte(de); if (!A) return "";
    var p = bord(A, x, y);
    return '<path class="fl-live" d="M' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' L' + x.toFixed(1) + ',' + y.toFixed(1) + '" stroke="' + coul + '"/>'
      + '<circle class="fl-live-pt" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="' + coul + '"/>';
  }

  /* ---------- Sélection flèche : libellé + suppression ---------- */
  var croix = null, editLib = null, bidir = null, barreCarte = null;
  function selFleche(id) {
    deselect(); etat.sel = { type: "fleche", id: id }; dessinerFleches();
    var f = etat.vue.tableau.fleches.find(function (x) { return x.id === id; }); if (!f) return;
    editLib = document.createElement("input"); editLib.type = "text"; editLib.maxLength = 40; editLib.value = f.libelle || "";
    editLib.placeholder = S.libelle;
    // Fond blanc + texte foncé fixe (sinon, en thème sombre, --ink est clair et
    // le texte devient illisible sur le fond blanc).
    editLib.style.cssText = "position:absolute;z-index:30;font-family:var(--f-ui);font-size:.85rem;border:1px solid var(--accent);border-radius:6px;padding:.25rem .45rem;background:#ffffff;color:#1b1a17;width:9rem;box-shadow:0 4px 12px rgba(27,26,23,.14)";
    // On capture le champ dans la fermeture : `editLib` est remis a null par
    // deselect(), et un envoi etale encore en attente lisait alors `null.value`
    // (erreur JS silencieuse dans un minuteur).
    var champ = editLib;
    function commitLib() { if (champ) agir({ op: "libellerFleche", id: id, libelle: champ.value }); }
    editLib._commit = commitLib;
    editLib._cle = "lib:" + id;
    editLib.addEventListener("input", function () {
      // 1) tout de suite chez les autres (ephemere) ; 2) memoire serveur, etalee.
      envoyerWS({ t: "lib", cid: id, v: champ.value });
      libelleEnDirect(id, champ.value);
      frappe("lib:" + id, 220, commitLib);
    });
    editLib.addEventListener("change", commitLib);
    editLib.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commitLib(); deselect(); } });
    E.scene.appendChild(editLib);
    setTimeout(function () { try { editLib.focus(); editLib.select(); } catch (e) {} }, 0);
    croix = boutonCroix("fleche-croix", function () { agir({ op: "supprimerFleche", id: id }); deselect(); });
    // Le sens de la fleche se choisit a la creation (outils « lien » / « lien ↔ »).
    positionnerEditeurs();
  }
  function selCarte(n, el) {
    deselect(); etat.sel = { type: "carte", n: n }; el.classList.add("sel");
    // L'animateur peut reprendre une carte posee : la remettre au pool commun, ou
    // dans sa reserve (le jeu complet). Petite barre d'actions au-dessus de la carte.
    if (etat.role === "animateur") {
      barreCarte = document.createElement("div"); barreCarte.className = "carte-actions";
      var bPool = document.createElement("button"); bPool.type = "button"; bPool.className = "btn mini"; bPool.textContent = S.versPool;
      bPool.addEventListener("click", function (e) { e.stopPropagation(); agir({ op: "retirerCarte", n: n, dest: "pool" }); deselect(); });
      var bRes = document.createElement("button"); bRes.type = "button"; bRes.className = "btn mini"; bRes.textContent = S.versReserve;
      bRes.addEventListener("click", function (e) { e.stopPropagation(); agir({ op: "retirerCarte", n: n }); deselect(); });
      barreCarte.appendChild(bPool); barreCarte.appendChild(bRes);
      E.scene.appendChild(barreCarte);
      positionnerEditeurs();
    }
  }
  function boutonCroix(cls, onClick) { var b = document.createElement("button"); b.className = cls; b.textContent = "✕"; b.addEventListener("click", onClick); E.scene.appendChild(b); return b; }
  function deselect() {
    if (etat.sel && etat.sel.type === "carte") { var el = etat.elCartes[etat.sel.n]; if (el) el.classList.remove("sel"); }
    // Valider le libelle en cours, et annuler l'envoi etale qui restait en
    // attente : sans cela il partait apres coup, sur un champ deja retire.
    if (editLib) { if (editLib._cle) frappe.annuler(editLib._cle); if (editLib._commit) { try { editLib._commit(); } catch (e) {} } }
    etat.sel = null; [croix, editLib, bidir, barreCarte].forEach(function (x) { if (x) x.remove(); }); croix = editLib = bidir = barreCarte = null; dessinerFleches();
  }
  function positionnerEditeurs() {
    if (etat.sel && etat.sel.type === "fleche") {
      var f = etat.vue.tableau.fleches.find(function (x) { return x.id === etat.sel.id; });
      if (f && f._mid) { var px = etat.panX + f._mid.x * etat.zoom, py = etat.panY + f._mid.y * etat.zoom;
        if (croix) { croix.style.left = px + "px"; croix.style.top = (py - 16) + "px"; }
        if (bidir) { bidir.style.left = (px - 30) + "px"; bidir.style.top = (py - 16) + "px"; }
        if (editLib) { editLib.style.left = (px + 14) + "px"; editLib.style.top = (py - 14) + "px"; } }
    } else if (etat.sel && etat.sel.type === "carte" && barreCarte) {
      var c = etat.elCartes[etat.sel.n];
      if (c) {
        var cx = etat.panX + (c._x || 0) * etat.zoom;
        var cy = etat.panY + (c._y || 0) * etat.zoom;
        var haut = cy - 38;
        barreCarte.style.left = cx + "px";
        barreCarte.style.top = (haut < 4 ? cy + (c.offsetHeight * etat.zoom) + 6 : haut) + "px";
      }
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
    // Note toute neuve, pas encore enregistree cote serveur : c'est
    // creerNoteLocale qui pilote la frappe (et la creation). On ne remplace pas
    // ses gestionnaires, sinon la note n'est jamais creee.
    if (!el._id) { try { el.focus(); } catch (e) {} return; }
    el.setAttribute("contenteditable", "true"); el.focus();
    var sel = window.getSelection(), rng = document.createRange(); rng.selectNodeContents(el); rng.collapse(false); sel.removeAllRanges(); sel.addRange(rng);
    el.oninput = function () {
      if (!el._id) return;
      // Frappe en direct chez les autres, enregistrement serveur etale. On ne
      // pousse jamais un contenu vide en cours de frappe : cote serveur, une note
      // videe est supprimee (ce que l'on ne veut qu'au relachement, au blur).
      envoyerWS({ t: "note", cid: el._id, v: el.textContent, x: el._x || 0, y: el._y || 0 });
      frappe("note:" + el._id, 250, function () {
        var c = el.textContent.trim(); if (c) agir({ op: "modifierTexte", id: el._id, contenu: c });
      });
    };
    el.onblur = function () { el.removeAttribute("contenteditable"); el.oninput = null;
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
  // Nouvelle note : l'element est cree localement avec tous ses comportements,
  // puis enregistre cote serveur DES LA PREMIERE SAISIE (et non au blur). C'est
  // ce qui permet aux autres de voir la note s'ecrire au fur et a mesure : sans
  // identifiant, il n'y a rien a relayer.
  function creerNoteLocale(x, y) {
    var el = creerElTexte({ id: "", x: x, y: y, contenu: "" });
    el.style.left = x + "px"; el.style.top = y + "px"; el._x = x; el._y = y;
    el.setAttribute("contenteditable", "true"); E.monde.appendChild(el); el.focus();
    var enCours = false, aEnvoyer = null;
    // IDENTIFIANT PROVISOIRE. Une note toute neuve n'a pas encore d'identifiant
    // serveur, et il n'y avait donc rien a relayer : les autres ne voyaient
    // apparaitre la note qu'au retour de sa creation, soit un aller-retour
    // complet. C'etait la seconde ou deux de retard sur les commentaires. On lui
    // donne un identifiant local, le temps que le vrai arrive : la note s'ecrit
    // en direct chez les autres des la premiere lettre, et l'etat autoritaire la
    // remplace ensuite par la vraie, au meme endroit et avec le meme texte.
    var tmp = "~n" + (++seqProv);
    el.oninput = function () {
      var v = el.textContent;
      if (el._id) {
        envoyerWS({ t: "note", cid: el._id, v: v, x: el._x || 0, y: el._y || 0 });
        frappe("note:" + el._id, 250, function () {
          var c = el.textContent.trim(); if (c) agir({ op: "modifierTexte", id: el._id, contenu: c });
        });
        return;
      }
      envoyerWS({ t: "note", cid: tmp, v: v, x: x, y: y });
      if (enCours || !v.trim()) return;
      enCours = true;
      agir({ op: "creerTexte", x: x, y: y, contenu: v }, function (d) {
        var id = d && d.resultat && d.resultat.id;
        enCours = false;
        if (!id) { el.remove(); return; }
        el._id = id; el.dataset.id = id; etat.elTextes[id] = el;
        if (el.getAttribute("contenteditable") === "true") el.oninput();  // rattraper la frappe
        else if (aEnvoyer != null) { var v2 = aEnvoyer; aEnvoyer = null; agir({ op: "modifierTexte", id: id, contenu: v2 }); }
      });
    };
    el.onblur = function () {
      el.removeAttribute("contenteditable"); el.oninput = null;
      var v = el.textContent.trim();
      if (el._id) { agir({ op: "modifierTexte", id: el._id, contenu: v }); return; }
      // Quitter la note pendant que sa CREATION est encore en vol : il ne faut
      // surtout pas en creer une seconde. On garde le texte de cote, la reponse
      // de la creation l'enverra. Sans cela, une frappe rapide suivie d'un clic
      // ailleurs laissait une note fantome avec la premiere lettre (« n »), en
      // plus de la vraie : c'est elle qu'on retrouvait en trop dans l'image.
      if (enCours) { aEnvoyer = v; return; }
      el.remove();
      if (v) agir({ op: "creerTexte", x: x, y: y, contenu: v });
    };
  }

  /* ---------- Agir (optimiste + envoi) ----------------------------------
     Trois choses, dans cet ordre :
       1. rendu LOCAL immediat (appliquerOptimiste) : celui qui agit ne doit
          jamais attendre le serveur pour voir son geste ;
       2. envoi de l'intention (le serveur reste l'autorite et peut refuser) ;
       3. pousse « maj » aux autres via le relais WebSocket : ils relisent l'etat
          tout de suite au lieu d'attendre leur prochain sondage. */
  // FILE D'ATTENTE : une seule action en vol a la fois. Sans cela, enchainer les
  // clics envoyait des requetes concurrentes qui lisaient toutes le meme etat et
  // s'ecrasaient l'une l'autre cote serveur (cycle lire-modifier-ecrire) : une
  // carte posee disparaissait, ou revenait dans le jeu, et il fallait recliquer
  // « Poser » des dizaines de fois. Le rendu optimiste, lui, reste immediat :
  // l'utilisateur voit son geste tout de suite, c'est l'envoi qui fait la queue.
  var fileAgir = [], envoiEnCours = false;
  /* ANNULATION DE SES PROPRES ACTIONS.
     Pas d'historique partage, pas de transformation d'operations : ce serait
     hors de proportion ici. Le principe est plus simple et suffit a l'usage
     reel d'un atelier : au moment ou l'on agit, on sait fabriquer l'action
     INVERSE a partir de l'etat d'avant. On l'empile ; « Annuler » la rejoue
     comme une action ordinaire, avec les memes regles, les memes garde-fous et
     la meme diffusion aux autres.
     Consequence assumee : on annule SON geste, pas celui du voisin, et si
     quelqu'un a modifie la meme chose entre-temps, le serveur refuse ou le
     resultat n'est pas celui qu'on imaginait. C'est le comportement de tous les
     outils collaboratifs a ce niveau de complexite, et c'est previsible. */
  var pile = [];
  var PILE_MAX = 30;
  function inverseDe(d, v) {
    if (!d || !v) return null;
    var tab = v.tableau || {}, cartes = tab.cartes || [], textes = tab.textes || [], fleches = tab.fleches || [];
    var n = +d.n;
    function carte(k) { return cartes.filter(function (c) { return c.n === k; })[0]; }
    switch (d.op) {
      case "poolAjouter": return { op: "poolRetirer", n: n };
      case "poolRetirer": return { op: "poolAjouter", n: n };
      case "poserCarte": return { op: "retirerCarte", n: n, dest: "pool" };
      case "retirerCarte": {
        var c = carte(n); if (!c) return null;
        // Remise en place exacte : la carte repasse par la reserve (regle du
        // jeu) puis se repose la ou elle etait.
        return { op: "poolAjouter", n: n, _puis: { op: "poserCarte", n: n, pos: { x: c.x + 80, y: c.y + 75 } } };
      }
      case "deplacerCarte": {
        var c2 = carte(n); if (!c2) return null;
        return { op: "deplacerCarte", n: n, x: c2.x, y: c2.y };
      }
      case "deplacerTexte": {
        var t1 = textes.filter(function (t) { return t.id === d.id; })[0]; if (!t1) return null;
        return { op: "deplacerTexte", id: d.id, x: t1.x, y: t1.y };
      }
      case "modifierTexte": {
        var t2 = textes.filter(function (t) { return t.id === d.id; })[0]; if (!t2) return null;
        return { op: "modifierTexte", id: d.id, contenu: t2.contenu };
      }
      case "supprimerTexte": {
        var t3 = textes.filter(function (t) { return t.id === d.id; })[0]; if (!t3) return null;
        return { op: "creerTexte", x: t3.x, y: t3.y, contenu: t3.contenu };
      }
      case "libellerFleche": {
        var f1 = fleches.filter(function (f) { return f.id === d.id; })[0]; if (!f1) return null;
        return { op: "libellerFleche", id: d.id, libelle: f1.libelle || "" };
      }
      case "supprimerFleche": {
        var f2 = fleches.filter(function (f) { return f.id === d.id; })[0]; if (!f2) return null;
        var inv = { op: "creerFleche", de: f2.de, vers: f2.vers, bidir: !!f2.bidir };
        if (f2.libelle) inv._libelle = f2.libelle;
        return inv;
      }
      // `creerFleche` et `creerTexte` : l'identifiant n'existe pas encore, il
      // arrive avec la reponse du serveur. Complete dans `agir`.
      case "creerFleche": return { op: "supprimerFleche", id: null, _attendId: 1 };
      case "creerTexte": return { op: "supprimerTexte", id: null, _attendId: 1 };
      default: return null;   // ping, exclure, lien vocal... rien a defaire
    }
  }
  // Une action refusee ou perdue ne doit rien laisser dans la pile : « Annuler »
  // defairait alors quelque chose qui n'a jamais eu lieu.
  function depiler(inv) {
    if (!inv) return;
    var i = pile.indexOf(inv); if (i >= 0) pile.splice(i, 1);
    majBoutonAnnuler();
  }
  function empiler(inv) {
    if (!inv) return null;
    pile.push(inv); if (pile.length > PILE_MAX) pile.shift();
    majBoutonAnnuler();
    return inv;
  }
  function majBoutonAnnuler() {
    var b = document.getElementById("btn-annuler");
    if (b) b.disabled = !pile.length;
  }
  function annulerDerniere() {
    var inv = pile.pop(); majBoutonAnnuler();
    if (!inv) return;
    if (inv._attendId && !inv.id) { flash(S.annulerImpossible); return; }
    var suite = inv._puis, lib = inv._libelle;
    var envoi = {}; for (var k in inv) { if (k.charAt(0) !== "_") envoi[k] = inv[k]; }
    agir(envoi, function (d) {
      if (d && d.refus) { flash(S.annulerImpossible); return; }
      // Certaines annulations demandent deux temps (remettre une carte passe par
      // la reserve ; une fleche recreee doit retrouver son libelle).
      if (suite) agir(suite);
      if (lib && d && d.resultat && d.resultat.id) agir({ op: "libellerFleche", id: d.resultat.id, libelle: lib });
    }, true);
  }

  function agir(intention, apres, sansEmpiler) {
    activite(); // action locale : on passe en mode reactif
    var inv = sansEmpiler ? null : empiler(inverseDe(intention, etat.vue));
    var change = appliquerOptimiste(intention);
    etat.attente++;
    enVol.push(intention);
    fileAgir.push({ intention: intention, apres: apres, essais: 0, inv: inv });
    // LE POINT CLE POUR LE JEU. On pousse aux autres notre vue optimiste AVANT
    // d'avoir la reponse du serveur : ils voient le geste tout de suite. Sans
    // cela, ils attendaient l'aller-retour HTTP (fonction + magasin), soit
    // plusieurs secondes, ce qui rend la partie illisible. Le serveur tranche
    // ensuite, et son etat autoritaire corrige au besoin.
    // Apres le remplissage de la file : la diffusion annonce la version visee,
    // et celle-ci se compte en actions en attente.
    if (change) envoyerEtatProvisoire();
    defilerAgir();
  }
  function finEnVol(intention) {
    var i = enVol.indexOf(intention); if (i >= 0) enVol.splice(i, 1);
  }
  // Cle d'idempotence : si la reponse se perd en route, on renvoie la meme
  // action ; le serveur reconnait la cle et ne l'applique pas deux fois. Sans
  // elle, un simple renvoi creait DEUX fleches ou DEUX notes.
  var seqIdem = 0;
  function cleIdem() { return (etat.jeton || "x").slice(0, 6) + "-" + Date.now().toString(36) + "-" + (++seqIdem); }
  function defilerAgir() {
    if (envoiEnCours || !fileAgir.length) return;
    envoiEnCours = true;
    var t = fileAgir[0];
    if (!t.idem) t.idem = cleIdem();
    // `version` : ce que nous avons sous les yeux. Le serveur refuse d'agir sur
    // une lecture plus ancienne que cela, sans quoi notre action effacerait ce
    // que quelqu'un vient de faire.
    api("agir", { code: etat.code, jeton: etat.jeton, version: etat.version, idem: t.idem, intention: t.intention }).then(function (res) {
      fileAgir.shift(); finEnVol(t.intention);
      if (res.d && res.d.etat && res.d.etat.version > versionServeur) versionServeur = res.d.etat.version;
      if (res.d && res.d.refus) { depiler(t.inv); if (res.d.refus.message) flash(res.d.refus.message); }
      // Le callback d'abord : il peut avoir besoin d'enregistrer l'element cree
      // (une note) AVANT que le rendu declaratif ne le decouvre et n'en fasse un
      // doublon.
      // L'identifiant d'un element tout juste cree n'existe que maintenant :
      // c'est le moment de completer l'action inverse mise de cote.
      if (t.inv && t.inv._attendId && res.d && res.d.resultat && res.d.resultat.id) t.inv.id = res.d.resultat.id;
      if (t.apres) { try { t.apres(res.d || {}); } catch (e) {} }
      etat.attente = Math.max(0, etat.attente - 1);
      // On ne reconcilie qu'une fois la file vide : appliquer un etat intermediaire
      // annulerait a l'ecran les actions encore en attente (clignotement).
      var vue = res.d && res.d.etat;
      if (vue && !fileAgir.length && etat.attente === 0) appliquerEtat(vue, true);
      // On DIFFUSE L'ETAT, pas un simple signal. Dire « relisez » ne servait a
      // rien : les lectures du magasin sont eventuellement coherentes, les
      // autres relisaient la valeur perimee pendant plusieurs secondes. Ici ils
      // recoivent l'etat que le serveur vient de nous renvoyer, donc a jour.
      // On diffuse TOUJOURS l'etat recu du serveur, meme si d'autres actions a
      // nous sont encore en file : c'est un etat serveur reel, et les autres
      // n'ont, eux, rien en cours. Ne le diffuser qu'en fin de file laissait
      // fleches et notes attendre le sondage (donc des secondes).
      envoyerEtat(vue, !!(res.d && res.d.refus));
      pollerVite(); // reprendre l'ecoute tout de suite (voir les autres vite)
      envoiEnCours = false; defilerAgir();
    }).catch(function () {
      // RESEAU. Une action perdue ici ne l'etait nulle part ailleurs : elle
      // restait a l'ecran de son auteur, pour toujours, alors que personne
      // d'autre ne l'avait. On renvoie donc (la cle d'idempotence rend le
      // renvoi sans danger), et si vraiment ca ne passe pas, on ANNULE
      // l'affichage en redemandant l'etat au serveur : mieux vaut perdre le
      // geste que montrer un tableau qui ment.
      marquerConnexion(false);
      t.essais++;
      if (t.essais <= 2) { setTimeout(function () { envoiEnCours = false; defilerAgir(); }, 400 * t.essais); return; }
      fileAgir.shift(); finEnVol(t.intention); depiler(t.inv);
      etat.attente = Math.max(0, etat.attente - 1);
      flash(S.actionPerdue);
      resyncDemande = true; pollerVite();
      envoiEnCours = false; defilerAgir();
    });
  }

  // Applique localement, tout de suite, l'effet visible d'une intention. Le
  // serveur tranchera (il peut refuser : pool plein, carte deja prise...) et sa
  // reponse remet tout d'aplomb.
  // On couvre ici TOUTES les operations qui se voient, y compris celles deja
  // rendues sur place chez nous (deplacement d'une carte, creation d'une
  // fleche) : c'est cette vue-la qui part aux autres par le relais, et elle
  // doit contenir le geste, sinon ils ne voient rien avant la reponse serveur.
  var seqProv = 0;   // identifiants provisoires (fleches pas encore numerotees)
  // `muet` : appliquer sans redessiner (le rendu se fait une fois, apres le
  // rejeu de toutes les actions en vol).
  function appliquerOptimiste(d, muet) {
    var v = etat.vue; if (!v || !d) return false;
    var tab = v.tableau || (v.tableau = { cartes: [], fleches: [], textes: [] });
    if (!v.pool) v.pool = [];
    var n = +d.n;
    function horsPool(k) { var i = v.pool.indexOf(k); if (i >= 0) v.pool.splice(i, 1); }
    function surTable(k) { return tab.cartes.some(function (c) { return c.n === k; }); }
    function libre(k) { return v.pool.indexOf(k) < 0 && !surTable(k); }
    switch (d.op) {
      case "poolAjouter": if (libre(n) && v.pool.length < 8) v.pool.push(n); break;
      case "poolRetirer": horsPool(n); break;
      case "poolVider": v.pool = []; break;
      case "poolRemplir":
        for (var k = 1; k <= 38 && v.pool.length < 8; k++) { if (libre(k)) v.pool.push(k); }
        break;
      case "poserCarte":
        horsPool(n);
        // Point de depot connu (glisser-deposer) : on pose la carte a l'endroit
        // exact, avec le meme centrage que le serveur (pas de saut a la reponse).
        if (d.pos && !surTable(n)) tab.cartes.push({ n: n, x: Math.round(d.pos.x - 80), y: Math.round(d.pos.y - 75) });
        break;
      case "retirerCarte":
        tab.cartes = tab.cartes.filter(function (c) { return c.n !== n; });
        tab.fleches = tab.fleches.filter(function (f) { return f.de !== n && f.vers !== n; });
        if (d.dest === "pool" && v.pool.indexOf(n) < 0 && v.pool.length < 8) v.pool.push(n);
        break;
      case "supprimerFleche": tab.fleches = tab.fleches.filter(function (f) { return f.id !== d.id; }); break;
      case "supprimerTexte": tab.textes = tab.textes.filter(function (t) { return t.id !== d.id; }); break;
      case "deplacerCarte": {
        var c = tab.cartes.filter(function (x) { return x.n === n; })[0];
        if (!c) return false; c.x = Math.round(d.x); c.y = Math.round(d.y); break;
      }
      case "deplacerTexte": {
        var t1 = tab.textes.filter(function (x) { return x.id === d.id; })[0];
        if (!t1) return false; t1.x = Math.round(d.x); t1.y = Math.round(d.y); break;
      }
      case "creerFleche": {
        // Le serveur attribue le vrai identifiant ; en attendant on en pose un
        // provisoire, remplace des que l'etat autoritaire arrive.
        if (!surTable(+d.de) || !surTable(+d.vers) || +d.de === +d.vers) return false;
        tab.fleches.push({ id: "~" + (++seqProv), de: +d.de, vers: +d.vers, bidir: !!d.bidir, libelle: "" });
        break;
      }
      case "libellerFleche": {
        var f1 = tab.fleches.filter(function (x) { return x.id === d.id; })[0];
        if (!f1) return false; f1.libelle = String(d.libelle == null ? "" : d.libelle).slice(0, 40); break;
      }
      case "modifierTexte": {
        var t2 = tab.textes.filter(function (x) { return x.id === d.id; })[0];
        if (!t2) return false; t2.contenu = String(d.contenu == null ? "" : d.contenu).slice(0, 280);
        if (!t2.contenu.trim()) tab.textes = tab.textes.filter(function (x) { return x.id !== d.id; });
        break;
      }
      default: return false; // rien de visible a anticiper
    }
    if (!muet) { rendrePool(v); rendreDeck(v); rendreTableau(tab); }
    return true;
  }

  /* REJEU DES ACTIONS NON ACQUITTEES. Emprunte au netcode des jeux en reseau
     (« client-side prediction + server reconciliation ») : tant que le serveur
     n'a pas confirme nos actions, elles ne sont nulle part sauf chez nous. Si
     on applique bêtement l'etat recu de quelqu'un d'autre, notre carte a nous
     disparait de notre ecran, puis revient quand notre reponse arrive. Le
     remede est toujours le meme : repartir de l'etat recu, puis REAPPLIQUER par
     dessus les actions encore en vol. */
  var enVol = [];
  function rejouerEnVol() {
    for (var i = 0; i < enVol.length; i++) appliquerOptimiste(enVol[i], true);
  }

  /* MEME PRINCIPE POUR LA FRAPPE DES AUTRES. Le texte relaye est toujours en
     avance sur le texte enregistre : le relais part a chaque touche, alors que
     l'enregistrement serveur est etale pour ne pas ecrire trente fois par
     seconde. Poser l'etat serveur tel quel faisait donc RECULER le texte d'une
     demi-seconde a chaque nouvelle version, et la note semblait s'ecrire avec
     une ou deux secondes de retard alors que les lettres, elles, arrivaient
     bien en direct. On rejoue donc la frappe recente par-dessus l'etat, comme
     on rejoue nos propres actions non acquittees. */
  var vivant = {};            // id d'element -> { v: texte, ts }
  var VIVANT_MS = 6000;       // au-dela, la frappe est forcement enregistree
  function noterVif(id, v) { vivant[id] = { v: String(v == null ? "" : v), ts: Date.now() }; }
  function rejouerFrappe(vue) {
    var tab = vue && vue.tableau; if (!tab) return;
    var now = Date.now(), id, i;
    for (id in vivant) {
      if (now - vivant[id].ts > VIVANT_MS) { delete vivant[id]; continue; }
      var v = vivant[id].v, pose = false;
      var T = tab.textes || [];
      for (i = 0; i < T.length; i++) { if (T[i].id === id) { T[i].contenu = v; pose = true; break; } }
      if (pose) continue;
      var F = tab.fleches || [];
      for (i = 0; i < F.length; i++) { if (F[i].id === id) { F[i].libelle = v; break; } }
    }
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

  /* ---------- Temps reel : relais WebSocket ----------------------------------
     Un petit relais auto-heberge repete des messages EPHEMERES entre les membres
     de la session : curseurs, trace de fleche en cours, frappe en direct, et un
     simple « maj » qui dit aux autres de relire l'etat tout de suite (le serveur
     Blobs reste l'autorite et la memoire ; le relais ne fait que supprimer
     l'attente du sondage). ENTIEREMENT OPTIONNEL : si le relais est injoignable,
     bloque, ou tombe, le jeu continue normalement (aucune erreur, aucun blocage,
     on retombe simplement sur le sondage). Reconnexion avec backoff borne. */
  var CURSEURS_WS = "wss://curseurs.pauseia.fr";
  var curs = { ws: null, els: {}, pos: {}, vus: {}, montrer: true, envoiTs: 0, reconn: null, essais: 0, ferme: false,
    sansEtat: false, etatTs: 0, coupures: 0,
    v: 0, caps: null, sansGliss: false, avertiVieux: false, attenteBonjour: 0 };
  // Un etat de tableau complet pese ~4 Ko ; on ne depasse jamais cette borne
  // (le relais accepte 96 Ko). Au-dela, on se contente du signal « maj ».
  var LIMITE_ETAT = 60 * 1024;
  try { curs.montrer = localStorage.getItem("curseurs-off") !== "1"; } catch (e) {}
  var flLive = {};   // traces de fleche en cours des autres : id -> { de, x, y, ts }
  function connecterCurseurs() {
    if (curs.ferme || !etat.code || typeof WebSocket === "undefined") return;
    if (curs.ws && (curs.ws.readyState === 0 || curs.ws.readyState === 1)) return;
    var ws;
    try {
      ws = new WebSocket(CURSEURS_WS + "/?code=" + encodeURIComponent(etat.code) + "&nom=" + encodeURIComponent(nomMoi() || ""));
    } catch (e) { planifierReconnexionCurseurs(); return; }
    curs.ws = ws;
    ws.onopen = function () {
      curs.essais = 0;
      // Pas de carte de visite dans la seconde et demie : c'est un relais
      // anterieur a cette convention, donc trop ancien.
      clearTimeout(curs.attenteBonjour);
      curs.attenteBonjour = setTimeout(function () {
        if (!curs.v) relaisDepasse("aucune carte de visite recue");
      }, 1500);
    };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } recevoirRelais(m); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onclose = function (ev) {
      curs.ws = null;
      // Un relais pas encore mis a jour plafonne les messages a 2 Ko et COUPE la
      // connexion quand on lui envoie un etat (code 1009). Sans garde-fou, on
      // bouclerait sur des coupures et les curseurs eux-memes disparaitraient.
      // On le detecte et on retombe sur le simple signal « maj » pour la suite.
      var code = ev && ev.code;
      var justeApresEtat = curs.etatTs && Date.now() - curs.etatTs < 2000;
      if (code === 1009 || justeApresEtat) {
        curs.coupures++;
        if (!curs.sansEtat && (code === 1009 || curs.coupures >= 2)) {
          curs.sansEtat = true;
          flash(S.relaisAncien);
        }
      }
      planifierReconnexionCurseurs();
    };
  }
  function planifierReconnexionCurseurs() {
    if (curs.ferme) return;
    clearTimeout(curs.reconn);
    // backoff : 2s, 4s, 8s... plafonne a 30s, pour ne jamais marteler le relais.
    var delai = Math.min(30000, 2000 * Math.pow(2, Math.min(curs.essais, 4)));
    curs.essais++;
    curs.reconn = setTimeout(connecterCurseurs, delai);
  }
  // Envoi non bloquant : si le relais n'est pas la, on ne fait rien (le sondage
  // suffit, en un peu moins direct).
  function envoyerWS(obj) {
    var ws = curs.ws; if (!ws || ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
  // Diffusion de l'etat : la voie rapide. On retombe sur « maj » si le relais
  // ne sait pas la prendre (ancienne version) ou si le tableau est hors norme.
  function envoyerEtat(vue, correction) {
    if (!vue) { envoyerWS({ t: "maj" }); return; }
    var ws = curs.ws; if (!ws || ws.readyState !== 1) return;
    if (!curs.sansEtat) {
      var txt = null;
      // Le marqueur voyage DANS `s` (seul champ recopie par le relais), et sur
      // une copie de surface pour ne pas polluer notre propre `etat.vue`.
      var env = vue;
      if (correction) { env = {}; for (var k in vue) { if (Object.prototype.hasOwnProperty.call(vue, k)) env[k] = vue[k]; } env._corr = 1; }
      try { txt = JSON.stringify({ t: "etat", s: env }); } catch (e) {}
      if (txt && txt.length <= LIMITE_ETAT) {
        curs.etatTs = Date.now();
        try { ws.send(txt); } catch (e) {}
        return;
      }
    }
    envoyerWS({ t: "maj" });
  }
  // DIFFUSION PROVISOIRE : notre vue optimiste, poussee avant la reponse du
  // serveur. Le marqueur voyage DANS `s` et non a cote : le relais ne recopie
  // que ce champ-la, toute autre cle de premier niveau serait perdue en route
  // (et cela evite d'avoir a redeployer le relais pour cette fonction).
  function envoyerEtatProvisoire() {
    var v = etat.vue; if (!v) return;
    var ws = curs.ws; if (!ws || ws.readyState !== 1 || curs.sansEtat) return;
    var copie; try { copie = JSON.parse(JSON.stringify(v)); } catch (e) { return; }
    copie._prov = 1;
    // Version visee : celle du serveur telle qu'on la connait, plus une par
    // action encore en attente. Les autres gardent ce rendu tant qu'ils n'ont
    // pas recu au moins ce numero-la.
    copie._pv = Math.max(etat.version || 0, versionServeur || 0) + fileAgir.length;
    var txt; try { txt = JSON.stringify({ t: "etat", s: copie }); } catch (e) { return; }
    if (!txt || txt.length > LIMITE_ETAT) return;
    curs.etatTs = Date.now();
    try { ws.send(txt); } catch (e) {}
  }
  /* GLISSEMENT EN DIRECT : la troisieme couche, purement EPHEMERE.
     Pendant qu'une personne deplace une carte, on relaie le GESTE (quelques
     octets, ~30 fois par seconde), pas l'etat. Les autres voient la carte
     bouger pendant le deplacement, comme ils voient deja les curseurs et les
     fleches en cours. Rien n'est enregistre, rien ne passe par le serveur
     d'etat : c'est la meme couche « awareness » que chez Figma ou Excalidraw.
     Sans cela, la carte disparaissait d'un endroit et reapparaissait a un
     autre, et personne ne comprenait ce qui se passait. */
  /* ENVOI DU GESTE, CALE SUR L'AFFICHAGE.
     L'envoi etait limite a un message toutes les 33 ms. Ce pas coute deux fois :
     une fois en moyenne (16 ms d'attente avant de partir), et une seconde fois
     chez les autres, dont le tampon se regle sur l'intervalle d'arrivee. On
     envoie donc UNE fois par image, c'est-a-dire exactement au rythme auquel les
     autres peuvent l'afficher, et jamais plus (garde-fou a 15 ms : un ecran a
     120 Hz doublerait le trafic pour un gain que personne ne verrait).
     Les positions intermediaires d'une meme image sont ecrasees plutot
     qu'empilees : seule la derniere a un sens a l'affichage. */
  var glissEnAttente = null, glissRAF = 0, glissTs = 0;
  function envoyerGliss(n, wx, wy, depuisReserve) {
    var ws = curs.ws; if (!ws || ws.readyState !== 1 || curs.sansGliss) return;
    glissEnAttente = { t: "gliss", n: n, x: Math.round(wx), y: Math.round(wy), d: depuisReserve ? 1 : 0 };
    if (!glissRAF) glissRAF = requestAnimationFrame(viderGliss);
  }
  function viderGliss() {
    glissRAF = 0;
    if (!glissEnAttente) return;
    var now = Date.now();
    if (now - glissTs < 15) { glissRAF = requestAnimationFrame(viderGliss); return; }
    glissTs = now;
    var m = glissEnAttente; glissEnAttente = null;
    envoyerWS(m);
  }
  function envoyerGlissFin(n) {
    // Le dernier point du geste ne doit pas rester en attente : il porte la
    // position d'arrivee, et l'autre bout la joue avant de relacher la carte.
    if (glissRAF) { cancelAnimationFrame(glissRAF); glissRAF = 0; }
    if (glissEnAttente) { envoyerWS(glissEnAttente); glissEnAttente = null; }
    glissTs = 0;
    envoyerWS({ t: "gliss0", n: n });
  }

  var glissLive = {};      // id de la personne -> { n, x, y, dep, ts }
  var glissParCarte = {};  // numero de carte   -> id de la personne qui la tient
  function recevoirGliss(m) {
    var n = +m.n || 0; if (!n) return;
    var av = glissLive[m.id];
    if (av && av.n !== n) relacherGliss(av.n);
    var g = glissLive[m.id];
    var tx = +m.x || 0, ty = +m.y || 0;
    if (!g || g.n !== n) {
      // Nouveau geste : on part de la position recue, sans faire traverser le
      // tableau a la carte depuis l'endroit ou elle etait.
      g = glissLive[m.id] = { n: n, x: tx, y: ty, tp: tamponNeuf(tx, ty, m.id), dep: m.d ? 1 : 0, ts: 0, id: m.id, nom: m.nom || "" };
    } else {
      noterPos(g.tp, tx, ty, m.id);
    }
    g.dep = m.d ? 1 : 0; g.ts = Date.now(); g.nom = m.nom || g.nom;
    glissParCarte[n] = m.d ? 0 : 1;  // 1 = carte du tableau pilotee a distance
    lancerLissage();
  }
  // FIN DU GESTE CHEZ L'AUTRE : ON NE COUPE PAS NET. La lecture est differee de
  // RETARD_SUIVI : au moment ou « gliss0 » arrive, le tampon contient encore une
  // centaine de millisecondes de trajet qui n'ont pas ete jouees. Les jeter,
  // c'est faire sauter la carte de la position affichee a sa position finale,
  // et c'est la premiere des saccades de fin de deplacement. On marque donc la
  // fin, la boucle de lissage finit de jouer le geste, et relache ensuite.
  // Dernier point d'un geste distant : la position exacte donnee par le serveur,
  // que les messages de geste (envoyes 30 fois par seconde, donc jamais pile sur
  // la fin) n'ont pas transmise.
  function pointFinalGliss(n, x, y) {
    for (var id in glissLive) {
      var g = glissLive[id];
      if (g.n !== n || g.dep) continue;
      var b = g.tp && g.tp.buf, q = b && b[b.length - 1];
      if (q && Math.abs(q.x - x) < 0.5 && Math.abs(q.y - y) < 0.5) return;
      noterPos(g.tp, x, y, null); lancerLissage();
      return;
    }
  }
  function cloturerGliss(id) {
    var g = glissLive[id]; if (!g) return;
    g.fin = Date.now();
    lancerLissage();
  }
  // Meme lecture differee que pour les curseurs : la carte tiree par quelqu'un
  // d'autre avance a la vitesse reelle de son geste, sans a-coup.
  function lisserGliss(now) {
    var encore = false, bouge = false, finis = null, t = Date.now();
    for (var id in glissLive) {
      var g = glissLive[id];
      var p = positionDifferee(g.tp, now); if (!p) continue;
      if (p.encore) encore = true;
      if (g.x !== p.x || g.y !== p.y) { g.x = p.x; g.y = p.y; bouge = true; }
      // Geste fini ET tampon joue jusqu'au bout. La borne de temps est un filet :
      // un tampon qui ne se viderait jamais ne doit pas retenir la carte.
      if (g.fin && (!p.encore || t - g.fin > 400)) (finis || (finis = [])).push(id);
    }
    if (bouge || encore) dessinerGliss();
    if (finis) { for (var i = 0; i < finis.length; i++) finirGliss(finis[i]); }
    return encore;
  }
  // Enleve les marques du geste. ET SURTOUT : NE REPOSE PAS LA CARTE TOUT DE
  // SUITE. L'etat qui porte la nouvelle position arrive quelques dizaines de
  // millisecondes apres la fin du geste ; remettre la carte a l'ancienne place
  // dans cet intervalle, c'est lui faire faire un aller-retour visible a chaque
  // deplacement. On la laisse donc la ou le geste l'a laissee, et on ne recale
  // que si, un instant plus tard, l'etat n'a toujours pas bouge (geste annule,
  // action refusee, message perdu).
  var recalages = {};
  function relacherGliss(n) {
    delete glissParCarte[n];
    var f = document.getElementById("gl-" + n); if (f) f.remove();
    var el = etat.elCartes[n]; if (!el) return;
    el.classList.remove("glisse-autre");
    el.style.removeProperty("--gl-coul");
    el._gl = null;
    clearTimeout(recalages[n]);
    recalages[n] = setTimeout(function () { recalerCarte(n); }, 900);
  }
  function recalerCarte(n) {
    delete recalages[n];
    if (etat.dragN === n || glissParCarte[n] === 1) return;   // quelqu'un la tient de nouveau
    var el = etat.elCartes[n]; if (!el) return;
    var v = etat.vue && etat.vue.tableau;
    var c = v && v.cartes.filter(function (x) { return x.n === n; })[0];
    if (!c || (el._x === c.x && el._y === c.y)) return;
    el.style.left = c.x + "px"; el.style.top = c.y + "px"; el._x = c.x; el._y = c.y;
    majFleches();
  }
  function finirGliss(id) {
    var g = glissLive[id]; if (!g) return;
    delete glissLive[id];
    relacherGliss(g.n);
    majFleches();
  }
  function dessinerGliss() {
    var now = Date.now();
    for (var id in glissLive) {
      var g = glissLive[id];
      if (now - g.ts > 5000) { finirGliss(id); continue; }  // geste abandonne
      var el = etat.elCartes[g.n];
      if (el && !g.dep) {
        // Carte deja sur le tableau : on deplace la VRAIE carte. C'est le rendu
        // le plus lisible possible, et il ne coute rien de plus.
        var x = Math.round(g.x), y = Math.round(g.y);
        if (el._x !== x) { el.style.left = x + "px"; el._x = x; }
        if (el._y !== y) { el.style.top = y + "px"; el._y = y; }
        // Marque et couleur posees une seule fois, pas a chaque image.
        if (el._gl !== id) { el.classList.add("glisse-autre"); el.style.setProperty("--gl-coul", couleurCurseur(id)); el._gl = id; }
      } else {
        // Carte qui vient de la reserve ou de la pioche : elle n'existe pas
        // encore sur le tableau, on montre un fantome a sa place.
        fantomeGliss(id, g);
      }
    }
    majFleches();
  }
  function fantomeGliss(id, g) {
    var f = document.getElementById("gl-" + g.n);
    if (!f) {
      var c = etat.cartes[g.n];
      f = document.createElement("div"); f.className = "gliss-fantome"; f.id = "gl-" + g.n;
      f.innerHTML = '<img alt="" src="' + srcCarte(c && c.image) + '">'
        + '<span class="gliss-num">' + g.n + "</span>"
        + '<span class="gliss-qui">' + esc(g.nom) + "</span>";
      E.monde.appendChild(f);
    }
    f.style.setProperty("--gl-coul", couleurCurseur(id));
    f.style.left = g.x + "px"; f.style.top = g.y + "px";
  }

  function envoyerCurseur(cx, cy) {
    var ws = curs.ws; if (!ws || ws.readyState !== 1) return;
    var now = Date.now(); if (now - curs.envoiTs < 55) return; curs.envoiTs = now; // ~18 msg/s max
    var w = versMonde(cx, cy);
    envoyerWS({ t: "c", x: Math.round(w.x), y: Math.round(w.y) });
  }
  /* CARTE DE VISITE DU RELAIS. Le relais tourne sur un serveur a part et ne se
     met pas a jour tout seul quand le site est deploye. Quand il reste en
     retard, ses fonctions recentes disparaissent EN SILENCE : on cherche alors
     la panne dans le site, qui n'y est pour rien. C'est arrive deux fois.
     Il annonce donc sa version a la connexion ; si elle est trop ancienne, ou
     s'il n'annonce rien du tout (relais anterieur a cette convention), on le
     dit clairement dans la console, et a l'animateur a l'ecran. */
  var RELAIS_MINI = 4;
  function relaisBonjour(m) {
    clearTimeout(curs.attenteBonjour);
    curs.v = +m.v || 0;
    curs.caps = {};
    (m.caps || []).forEach(function (k) { curs.caps[k] = 1; });
    curs.sansGliss = !curs.caps.gliss;
    if (curs.v < RELAIS_MINI) relaisDepasse("version " + curs.v + ", attendue >= " + RELAIS_MINI);
  }
  function relaisDepasse(pourquoi) {
    if (curs.avertiVieux) return;
    curs.avertiVieux = true;
    curs.sansGliss = true;
    try { console.warn("[fresque] relais temps reel depasse (" + pourquoi + ") : les deplacements en direct ne seront pas visibles par les autres. Voir infra/curseurs/README.md."); } catch (e) {}
    if (etat.role === "animateur") flash(S.relaisAncien);
  }
  function recevoirRelais(m) {
    if (m && m.t === "bonjour") { relaisBonjour(m); return; }
    if (!m || !m.id) return;
    switch (m.t) {
      case "leave": enleverCurseur(m.id); delete flLive[m.id]; finirGliss(m.id); dessinerFlechesLive(); return;
      // Etat pousse par la personne qui vient d'agir. Deux natures :
      //  - PROVISOIRE (`_prov`) : sa vue optimiste, envoyee avant meme que le
      //    serveur ait repondu. On l'affiche tout de suite, sans avancer notre
      //    numero de version (appliquerEtat s'en charge).
      //  - AUTORITAIRE : ce que le serveur vient de lui renvoyer.
      // Les garde-fous de version sont tous dans appliquerEtat.
      case "etat":
        if (m.s) appliquerEtat(m.s, m.s._prov ? "prov" : (m.s._corr ? "corr" : undefined));
        return;
      case "maj": pollerVite(); return;                 // repli : relais ancien, on relit
      case "gliss": recevoirGliss(m); return;
      case "gliss0": cloturerGliss(m.id); return;
      case "voir": recevoirAppelVue(m); return;
      case "fl": flLive[m.id] = { de: +m.de || 0, x: +m.x || 0, y: +m.y || 0, ts: Date.now() }; dessinerFlechesLive(); return;
      case "fl0": delete flLive[m.id]; dessinerFlechesLive(); return;
      case "lib": libelleEnDirect(m.cid, m.v); return;
      case "note": noteEnDirect(m.cid, m.v, m.x, m.y); return;
      case "c": break;
      default: return;
    }
    curs.vus[m.id] = Date.now();
    var el = curs.els[m.id];
    var x = +m.x || 0, y = +m.y || 0;
    if (!el) {
      el = creerCurseur(m.id, m.nom); curs.els[m.id] = el; E.monde.appendChild(el);
      curs.pos[m.id] = tamponNeuf(x, y, m.id);
    } else {
      noterPos(curs.pos[m.id], x, y, m.id);
    }
    el.hidden = !curs.montrer;
    lancerLissage();
  }
  // Lissage des curseurs distants : au lieu de « teleporter » l'element a chaque
  // message (saccade desagreable, voire mal au coeur), on glisse vers la derniere
  // position connue a chaque frame. Le retard ajoute est de l'ordre de 2 frames.
  /* LECTURE DIFFEREE DES MOUVEMENTS DES AUTRES (« entity interpolation »).

     Le probleme, precisement. On rapprochait le curseur de sa derniere position
     connue d'un certain pourcentage a chaque image. Entre deux messages (envoyes
     toutes les ~55 ms), il ralentissait donc jusqu'a presque s'arreter, puis
     repartait d'un coup au message suivant. La VITESSE dessinait une dent de
     scie, dix-huit fois par seconde. C'est ce qui donne cette sensation
     desagreable, jusqu'a la nausee : l'oeil ne percoit pas les ecarts de
     position, il percoit les ruptures de vitesse. Un mouvement regulier qui
     s'arrete net se voit comme un a-coup ; dix-huit a-coups par seconde, c'est
     un scintillement de mouvement.

     Le remede, celui du netcode des jeux en reseau et des tableaux
     collaboratifs (Liveblocks, tldraw et sa bibliotheque perfect-cursors) :
     on garde les dernieres positions recues AVEC LEUR HEURE, et on affiche non
     pas la derniere, mais l'etat tel qu'il etait il y a RETARD millisecondes, en
     interpolant LINEAIREMENT entre les deux positions qui encadrent cet instant.
     Le curseur avance alors exactement a la vitesse de la personne, sans
     a-coup, et le petit retard absorbe au passage l'irregularite du reseau.
     Linaire et non « ease-in-out » : une courbe d'accueil rajouterait
     precisement le ralenti qu'on cherche a supprimer.

     On n'extrapole JAMAIS au-dela du dernier point connu : si la personne
     s'arrete, on s'arrete aussi. Extrapoler ferait depasser puis revenir en
     arriere, ce qui est encore plus desagreable que l'a-coup.

     Ce lissage-la n'est pas coupe par « mouvement reduit » : il ne s'agit pas
     d'une animation decorative mais du rendu fidele du geste de quelqu'un, et
     la version sans lissage (des sauts a 18 images par seconde) serait bien plus
     penible pour une personne sensible au mouvement. */
  /* LE RETARD N'A PAS DE BONNE VALEUR FIXE.
     Trop court, le tampon se vide et le geste s'arrete puis repart (la saccade
     qu'on avait supprimee). Trop long, on regarde le passe : c'est ce qui fait
     dire, a juste titre, que ce n'est « pas exactement ce que fait le joueur ».
     Mesure : a 110 ms fixes, le geste arrive avec 128 ms de retard sur un bon
     lien, alors que 45 ms y suffisent (aucun arret) et ramenent le retard a
     62 ms. Sur un lien degrade (60 ms, 120 ms de gigue), les memes 45 ms font en
     revanche s'arreter le geste une image sur cinq.
     On mesure donc, POUR CHAQUE PERSONNE, l'intervalle d'arrivee de ses messages
     et sa dispersion (le meme calcul de gigue que RTP, RFC 3550), et on vise
     juste au-dessus. On MONTE TOUT DE SUITE et on REDESCEND LENTEMENT : un
     message rate coute plus cher que vingt millisecondes de trop, et une
     descente brutale serait elle-meme une saccade, puisque changer le retard
     revient a changer la vitesse de lecture. */
  var RETARD_MIN = 60, RETARD_MAX = 190, RETARD_DEFAUT = 90;
  var reseau = {};   // id de la personne -> { intervalle, gigue, retard, dernier }
  function suivreArrivee(id, now) {
    var e = reseau[id];
    if (!e) { e = reseau[id] = { intervalle: 40, gigue: 12, retard: RETARD_DEFAUT, dernier: now }; return e; }
    var d = now - e.dernier; e.dernier = now;
    // Une pause (personne immobile) n'est pas de la gigue : on ne la compte pas.
    if (d <= 0 || d > 1200) return e;
    e.intervalle += (d - e.intervalle) * 0.12;
    e.gigue += (Math.abs(d - e.intervalle) - e.gigue) * 0.12;
    var vise = Math.min(RETARD_MAX, Math.max(RETARD_MIN, e.intervalle + 3 * e.gigue + 12));
    if (vise > e.retard) e.retard = vise;
    else e.retard += (vise - e.retard) * 0.02;
    return e;
  }
  function retardDe(id) { var e = reseau[id]; return e ? e.retard : RETARD_DEFAUT; }
  function tamponNeuf(x, y, id) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var r = retardDe(id);
    return { buf: [{ t: now - r, x: x, y: y }, { t: now, x: x, y: y }], x: x, y: y, id: id };
  }
  // `id` a null : le point ne vient pas du reseau (position finale donnee par le
  // serveur). Il ne doit alors pas entrer dans la mesure d'intervalle.
  function noterPos(tp, x, y, id) {
    if (!tp) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (id !== null) suivreArrivee(id || tp.id, now);
    var b = tp.buf;
    // Deux messages dans la meme milliseconde : on remplace, sinon la division
    // par la duree donnerait l'infini.
    if (b.length && now - b[b.length - 1].t < 1) { b[b.length - 1].x = x; b[b.length - 1].y = y; return; }
    b.push({ t: now, x: x, y: y });
    while (b.length > 2 && b[1].t < now - RETARD_MAX - 500) b.shift();
    if (b.length > 80) b.shift();
  }
  // Position a afficher maintenant, et si le tampon a encore de l'avance.
  function positionDifferee(tp, now) {
    var b = tp && tp.buf; if (!b || !b.length) return null;
    var cible = now - retardDe(tp.id);
    if (cible <= b[0].t) return { x: b[0].x, y: b[0].y, encore: b.length > 1 };
    for (var i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= cible && cible <= b[i].t) {
        var d = b[i].t - b[i - 1].t;
        var u = d > 0 ? (cible - b[i - 1].t) / d : 1;
        return { x: b[i - 1].x + (b[i].x - b[i - 1].x) * u,
                 y: b[i - 1].y + (b[i].y - b[i - 1].y) * u, encore: true };
      }
    }
    var q = b[b.length - 1];
    return { x: q.x, y: q.y, encore: false };   // rattrape : on tient la position
  }

  var animCurs = 0;
  function lancerLissage() { if (!animCurs) animCurs = requestAnimationFrame(lisserCurseurs); }
  function lisserCurseurs() {
    animCurs = 0;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var encore = false;
    for (var id in curs.els) {
      var p = positionDifferee(curs.pos[id], now); if (!p) continue;
      if (p.encore) encore = true;
      curs.els[id].style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px) scale(var(--iz,1))";
    }
    // Cartes tirees par quelqu'un d'autre : meme lecture differee, meme boucle.
    if (lisserGliss(now)) encore = true;
    if (encore) animCurs = requestAnimationFrame(lisserCurseurs);
  }

  function creerCurseur(id, nom) {
    var el = document.createElement("div"); el.className = "curseur-live";
    var coul = couleurCurseur(id);
    // DOUBLE LISERE. Aucune couleur ne peut etre lisible a la fois sur un
    // tableau blanc et sur un tableau noir : on ne compte donc pas sur la
    // couleur, mais sur deux contours. La fleche est tracee deux fois : un
    // trait FONCE large (qui la detache d'un fond clair), puis un trait BLANC
    // fin (qui la detache d'un fond sombre), et enfin le remplissage de
    // couleur, qui ne sert plus qu'a identifier la personne. Meme principe pour
    // l'etiquette du prenom, en CSS.
    var d = "M4 2 L20 12 L12.5 13.2 L9 21 Z";
    el.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">'
      + '<path d="' + d + '" fill="none" stroke="#14110d" stroke-width="5.5" stroke-linejoin="round"/>'
      + '<path d="' + d + '" fill="' + coul + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></svg>'
      + '<span class="curseur-nom" style="--c:' + coul + '">' + esc(nom || "") + '</span>';
    el.hidden = !curs.montrer;
    return el;
  }
  // Teintes assombries : le prenom s'ecrit en blanc par-dessus, il lui faut au
  // moins 4,5:1 (l'orange et le cyan d'avant tombaient a 2,8 et 4,1).
  function couleurCurseur(id) {
    var p = ["#A8560A", "#1f6b40", "#2d5b8f", "#6f3a99", "#a8353f", "#116d7d", "#8a5a12"];
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return p[h % p.length];
  }
  function enleverCurseur(id) { var el = curs.els[id]; if (el) el.remove(); delete curs.els[id]; delete curs.vus[id]; delete curs.pos[id]; delete reseau[id]; }
  setInterval(function () {
    var now = Date.now(), bouge = false;
    for (var id in curs.vus) { if (now - curs.vus[id] > 5000) enleverCurseur(id); }
    for (var gi in glissLive) { if (now - glissLive[gi].ts > 5000) finirGliss(gi); }
    for (var f in flLive) { if (now - flLive[f].ts > 4000) { delete flLive[f]; bouge = true; } }
    if (bouge) dessinerFlechesLive();
    // Notes provisoires (identifiant local « ~ ») dont la vraie n'est jamais
    // arrivee : sans ce menage, une creation refusee laisserait un fantome.
    var tab = etat.vue && etat.vue.tableau, T = tab && tab.textes;
    if (T && T.length) {
      var reste = T.filter(function (t) {
        if (String(t.id).charAt(0) !== "~") return true;
        var vi = vivant[t.id];
        return !!(vi && now - vi.ts < VIVANT_MS);
      });
      if (reste.length !== T.length) { tab.textes = reste; rendreTableau(tab); }
    }
  }, 2000);
  function basculerCurseurs() {
    curs.montrer = !curs.montrer;
    try { localStorage.setItem("curseurs-off", curs.montrer ? "0" : "1"); } catch (e) {}
    for (var id in curs.els) curs.els[id].hidden = !curs.montrer;
    var b = document.getElementById("btn-curseurs");
    if (b) {
      b.setAttribute("aria-pressed", curs.montrer ? "true" : "false");
      b.title = curs.montrer ? S.curseursOn : S.curseursOff;
    }
    flash(curs.montrer ? S.curseursOn : S.curseursOff);
  }

  /* ---------- Frappe en direct (libelles de fleche, notes) -------------------
     Le texte des autres s'affiche AU FUR ET A MESURE de leur frappe : chaque
     saisie est relayee en ephemere (WebSocket) et appliquee tout de suite chez
     les autres, pendant que l'enregistrement serveur, lui, est etale (throttle)
     pour ne pas ecrire a chaque touche. */
  function libelleEnDirect(id, v) {
    if (!id || !etat.vue) return;
    var f = (etat.vue.tableau.fleches || []).find(function (x) { return x.id === id; });
    if (!f) return;
    f.libelle = String(v == null ? "" : v);
    noterVif(id, v);
    dessinerFleches();
  }
  function noteEnDirect(id, v, x, y) {
    if (!id || !etat.vue) return;
    var t = (etat.vue.tableau.textes || []).find(function (o) { return o.id === id; });
    if (!t) { t = { id: id, x: +x || 0, y: +y || 0, contenu: "" }; etat.vue.tableau.textes.push(t); }
    t.contenu = String(v == null ? "" : v);
    noterVif(id, v);
    rendreTableau(etat.vue.tableau);
  }
  // Envoi throttle vers le serveur (memoire) + envoi immediat au relais (vue).
  function frappe(cle, ms, fn) {
    frappe.t = frappe.t || {};
    if (frappe.t[cle]) return;                    // un envoi est deja programme
    frappe.t[cle] = setTimeout(function () { delete frappe.t[cle]; fn(); }, ms);
  }
  frappe.annuler = function (cle) {
    if (frappe.t && frappe.t[cle]) { clearTimeout(frappe.t[cle]); delete frappe.t[cle]; }
  };
  // Declenche TOUT DE SUITE ce qui attendait la fin de la frappe. Sert avant une
  // operation qui lit l'etat du serveur et ne peut pas se permettre d'etre en
  // retard sur ce qui est a l'ecran : l'export de l'image, typiquement.
  frappe.vider = function () {
    if (!frappe.t) return;
    Object.keys(frappe.t).forEach(function (cle) {
      var h = frappe.t[cle]; delete frappe.t[cle]; clearTimeout(h);
    });
    // Les rappels eux-memes sont rejoues par les elements en cours d'edition
    // via leur `blur` (voir `poserLaPlume`).
  };

  /* ---------- Vue locale : zoom / pan / plein écran ---------- */
  function rectScene() { return E.scene.getBoundingClientRect(); }
  /* ZOOM SEMANTIQUE : trois distances de lecture.
     Une carte qui retrecit finit par n'etre qu'une tache : ni le numero, ni le
     titre, ni le lien ne se lisent, alors que c'est exactement ce qu'on cherche
     quand on prend du recul pour comprendre l'ensemble. Plutot que de tout
     reduire, on change CE QU'ON MONTRE selon la distance. C'est le « semantic
     zoom » de Figma, Miro et de la litterature : de loin, moins d'elements mais
     plus gros, pas les memes elements en plus petit.
       pres  (>= 62 %)  : la carte entiere, comme avant
       moyen (42-62 %)  : on retire le bouton d'agrandissement et on grossit le
                          numero, qui devient l'identifiant principal
       loin  (< 42 %)   : plus de titre (illisible de toute facon), un gros
                          numero au centre et la couleur du lot bien visible
     La BOITE de la carte, elle, ne change JAMAIS de taille. Une version
     precedente etirait la hauteur au dezoom : cela cassait l'image exportee,
     construite a partir de la hauteur reelle des elements. Ici on ne touche qu'a
     des elements en position absolue et a la VISIBILITE du titre, jamais a la
     mise en page. */
  var ZOOM_MOYEN = 0.62, ZOOM_LOIN = 0.42;
  function applyView() { E.monde.style.transform = "translate(" + etat.panX + "px," + etat.panY + "px) scale(" + etat.zoom + ")";
    // --iz (= 1/zoom) : pour tout ce qui doit garder une taille ECRAN constante
    // quel que soit le zoom (curseurs, ping, numero de carte de loin).
    var iz = 1 / etat.zoom;
    E.monde.style.setProperty("--iz", iz.toFixed(3));
    // Epaisseur des traits de fleche EN PIXELS D'ECRAN. Sans cela un trait de
    // 2,2 unites fait 0,5 px a 25 % : les liens, qui sont le sujet meme de la
    // fresque, disparaissaient au moment ou on prend du recul pour les lire.
    // La pointe suit automatiquement (elle est dimensionnee en stroke-width).
    E.monde.style.setProperty("--fw", (2.2 * Math.min(iz, 3.4)).toFixed(2));
    E.monde.classList.toggle("zoom-moyen", etat.zoom < ZOOM_MOYEN);
    E.monde.classList.toggle("zoom-loin", etat.zoom < ZOOM_LOIN);
    // La legende vit sur la scene, pas dans le monde : elle ne doit pas subir la
    // transformation de zoom.
    E.scene.classList.toggle("loin", etat.zoom < ZOOM_LOIN);
    E["z-niv"].textContent = Math.round(etat.zoom * 100) + " %";
    E["z-moins"].disabled = etat.zoom <= Math.max(ZMIN, _plancher) + 1e-4;
    E["z-plus"].disabled = etat.zoom >= ZMAX - 1e-4; majNettete(); positionnerEditeurs(); }
  // Zone de la scene qui n'est PAS masquee par le panneau de la reserve. Quand
  // le tableau tient en entier a l'ecran (« Tout voir », fort dezoom), on le
  // centre dans cette zone : le panneau ne recouvre plus la fresque.
  function zoneLibre(r) {
    var z = { x: 0, y: 0, largeur: r.width, hauteur: r.height };
    var p = E["pool"];
    if (!p || p.hidden || !p.offsetParent) return z;
    var pr = p.getBoundingClientRect();
    if (!pr.width || !pr.height) return z;
    var marge = 12, maxi = r.width * 0.6;      // on ne cede jamais plus de 60 %
    if (pr.left - r.left <= r.right - pr.right) {   // panneau plutot a gauche
      var pris = Math.min(maxi, pr.right - r.left + marge);
      if (pris > 0) { z.x = pris; z.largeur = r.width - pris; }
    } else {                                        // panneau plutot a droite
      var prisD = Math.min(maxi, r.right - pr.left + marge);
      if (prisD > 0) z.largeur = r.width - prisD;
    }
    return z;
  }
  function clampPan() {
    var r = rectScene(), z = zoneLibre(r), pw = PLAN_W * etat.zoom, ph = PLAN_H * etat.zoom;
    var margeG = z.x, margeD = r.width - (z.x + z.largeur);   // largeur masquee par le panneau
    etat.panX = pw <= z.largeur ? z.x + (z.largeur - pw) / 2
      : Math.min(margeG, Math.max(r.width - pw - margeD, etat.panX));
    etat.panY = ph <= z.hauteur ? z.y + (z.hauteur - ph) / 2
      : Math.min(0, Math.max(r.height - ph, etat.panY));
  }
  function centrer() { var r = rectScene(); etat.zoom = 1; etat.panX = (r.width - PLAN_W) / 2; etat.panY = (r.height - PLAN_H) / 2; clampPan(); applyView(); }
  // Zoom IMMEDIAT, pour la molette et le pincement : le geste est continu, il
  // doit coller au doigt. Toute animation de vue en cours est abandonnee.
  // Borne basse : le plancher lie au contenu (jamais en dessous de ZMIN).
  function bornerZoom(z) { return Math.max(Math.max(ZMIN, _plancher), Math.min(ZMAX, z)); }
  function zoomVers(nz, cx, cy) { stopVueAnim(); var wx = (cx - etat.panX) / etat.zoom, wy = (cy - etat.panY) / etat.zoom; etat.zoom = bornerZoom(nz); etat.panX = cx - wx * etat.zoom; etat.panY = cy - wy * etat.zoom; clampPan(); applyView(); majFleches(); }
  // Zoom des BOUTONS + et - : un cran discret, qui se voit arriver.
  function zoomAnime(nz, cx, cy) {
    var sz = etat.zoom, sx = etat.panX, sy = etat.panY;
    var wx = (cx - sx) / sz, wy = (cy - sy) / sz;
    etat.zoom = bornerZoom(nz);
    etat.panX = cx - wx * etat.zoom; etat.panY = cy - wy * etat.zoom; clampPan();
    var tz = etat.zoom, tx = etat.panX, ty = etat.panY;
    etat.zoom = sz; etat.panX = sx; etat.panY = sy;
    allerVers(tz, tx, ty);
  }

  /* RECADRAGE ANIME. « Tout voir » et les boutons de zoom sautaient d'un cadrage
     a l'autre : on perdait de vue ou on etait et il fallait re-chercher sa carte
     des yeux. Un glissement court (260 ms) garde le lien entre l'avant et
     l'apres. On anime les trois valeurs de la vue ensemble ; toute action de
     l'utilisateur (molette, main, nouveau clic) annule l'animation en cours,
     pour ne jamais lutter contre son geste. Coupe si le systeme demande moins de
     mouvement. La courbe est une sortie douce : rapide au debut, posee a la fin. */
  var _vueAnim = 0;
  function stopVueAnim() { if (_vueAnim) { cancelAnimationFrame(_vueAnim); _vueAnim = 0; } }
  function allerVers(z, px, py) {
    stopVueAnim();
    if (mvtReduit) { etat.zoom = z; etat.panX = px; etat.panY = py; clampPan(); applyView(); majFleches(); return; }
    var z0 = etat.zoom, x0 = etat.panX, y0 = etat.panY, t0 = 0, DUREE = 260;
    // Deja au bon endroit : rien a animer.
    if (Math.abs(z - z0) < 1e-4 && Math.abs(px - x0) < 1 && Math.abs(py - y0) < 1) return;
    function pas(t) {
      if (!t0) t0 = t;
      var u = Math.min(1, (t - t0) / DUREE);
      var e = 1 - Math.pow(1 - u, 3);           // sortie cubique
      etat.zoom = z0 + (z - z0) * e;
      etat.panX = x0 + (px - x0) * e;
      etat.panY = y0 + (py - y0) * e;
      applyView(); majFleches();
      _vueAnim = u < 1 ? requestAnimationFrame(pas) : 0;
    }
    _vueAnim = requestAnimationFrame(pas);
  }
  // Rectangle reellement occupe par la fresque (cartes + notes), avec une marge.
  // A defaut de contenu, le plan entier.
  function contenuRect() {
    var tab = etat.vue && etat.vue.tableau;
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9, vu = false;
    function eng(x, y, w, h) { vu = true; x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h); }
    if (tab) {
      (tab.cartes || []).forEach(function (c) { var el = etat.elCartes[c.n]; eng(c.x, c.y, el ? dimCarte(el)._w : 150, el ? el._h : 150); });
      (tab.textes || []).forEach(function (t) { var el = etat.elTextes[t.id]; eng(t.x, t.y, el ? el.offsetWidth : 90, el ? el.offsetHeight : 30); });
    }
    if (!vu) return { x: 0, y: 0, w: PLAN_W, h: PLAN_H };
    var m = 90;
    var x = Math.max(0, x1 - m), y = Math.max(0, y1 - m);
    return { x: x, y: y, w: Math.min(PLAN_W - x, x2 - x1 + 2 * m), h: Math.min(PLAN_H - y, y2 - y1 + 2 * m) };
  }
  /* PLANCHER DE ZOOM LIE AU CONTENU.
     Dezoomer en dessous du cadrage « Tout voir » n'apporte rien : on ne decouvre
     que du plan vide, la fresque devient un timbre-poste illisible, et on a
     perdu son chemin pour rien. Miro et Figma bornent le dezoom pour exactement
     cette raison. Le plancher suit donc le CONTENU : un peu en dessous du
     cadrage complet, pour garder une marge de confort, mais jamais plus haut que
     0,45 (sinon, en debut d'atelier ou le tableau est presque vide, on ne
     pourrait plus prendre de recul pour repartir les premieres cartes).
     Recalcule quand le tableau change ou que la fenetre bouge, jamais dans
     `applyView` : celui-ci tourne a chaque image d'un recadrage. */
  var _plancher = ZMIN;
  function majPlancher() {
    var r = rectScene(), z = zoneLibre(r), c = contenuRect();
    if (!c.w || !c.h) { _plancher = ZMIN; return; }
    var ajuste = Math.min(z.largeur / c.w, z.hauteur / c.h);
    _plancher = Math.max(ZMIN, Math.min(0.45, ajuste * 0.62));
  }
  function toutVoir() {
    var r = rectScene(), z = zoneLibre(r), c = contenuRect();
    var nz = Math.max(ZMIN, Math.min(ZMAX, Math.min(z.largeur / c.w, z.hauteur / c.h)));
    var nx = z.x + (z.largeur - c.w * nz) / 2 - c.x * nz;
    var ny = z.y + (z.hauteur - c.h * nz) / 2 - c.y * nz;
    // On borne la cible AVANT d'animer, sinon l'animation viserait un cadrage
    // que `clampPan` corrigerait a la derniere image (petit sursaut a l'arrivee).
    var sz = etat.zoom, sx = etat.panX, sy = etat.panY;
    etat.zoom = nz; etat.panX = nx; etat.panY = ny; clampPan();
    nz = etat.zoom; nx = etat.panX; ny = etat.panY;
    etat.zoom = sz; etat.panX = sx; etat.panY = sy;
    allerVers(nz, nx, ny);
  }
  /* --- « RASSEMBLER » : proposer aux autres de venir voir sa vue -------------
     Le ping (clic droit) designe un point, mais il ne sert a rien si la personne
     regarde ailleurs, ou n'est pas au meme niveau de zoom. A neuf, et sur trois
     heures, « je suis ou, la ? » coute du temps a chaque changement de lot.
     ON PROPOSE, ON N'IMPOSE PAS. Deplacer la vue de quelqu'un sans prevenir,
     alors qu'il est peut-etre en train de poser une carte, fait perdre le fil et
     desoriente ; le cadrage est personnel dans cet outil, et c'est un bon choix.
     Chacun recoit donc une invitation qu'il suit ou non, et qui s'efface d'elle-
     meme au bout de quelques secondes.
     On transmet le RECTANGLE DU MONDE regarde, pas le zoom ni le decalage : les
     ecrans n'ont pas la meme taille, et c'est le cadrage qui a un sens, pas les
     nombres qui le produisent chez l'emetteur.
     Purement ephemere : le relais repete, rien n'est enregistre nulle part. */
  var appel = null, appelTimer = null;
  function envoyerAppelVue() {
    if (etat.role !== "animateur") return;
    if (curs.caps && !curs.caps.voir) { flash(S.appelImpossible); return; }
    var r = rectVu();
    envoyerWS({ t: "voir", x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.largeur), h: Math.round(r.hauteur) });
    flash(S.appelEnvoye);
  }
  /* Ce que l'on voit VRAIMENT : la partie de la scene qui n'est pas masquee par
     le panneau de la reserve. Envoyer la scene entiere ferait arriver les autres
     un cran trop loin, puisqu'ils recadrent, eux, dans leur propre zone libre. */
  function rectVu() {
    var r = rectScene(), z = zoneLibre(r);
    return { x: (z.x - etat.panX) / etat.zoom, y: (z.y - etat.panY) / etat.zoom,
      largeur: z.largeur / etat.zoom, hauteur: z.hauteur / etat.zoom };
  }
  function assurerAppel() {
    if (appel) return;
    appel = document.createElement("div");
    appel.className = "appel-vue";
    appel.hidden = true;
    appel.setAttribute("role", "status");
    appel.innerHTML = '<span class="appel-txt"></span>'
      + '<button type="button" class="btn primaire appel-ok"></button>'
      + '<button type="button" class="btn appel-x" aria-label="' + esc(S.coachFermer || "Fermer") + '">✕</button>';
    E.scene.appendChild(appel);
    appel.querySelector(".appel-x").addEventListener("click", fermerAppel);
  }
  function recevoirAppelVue(m) {
    var r = { x: +m.x || 0, y: +m.y || 0,
      largeur: Math.max(80, +m.w || 0), hauteur: Math.max(80, +m.h || 0) };
    assurerAppel();
    appel.querySelector(".appel-txt").textContent = S.appelTexte(m.nom || "");
    var ok = appel.querySelector(".appel-ok");
    ok.textContent = S.appelVoir;
    ok.onclick = function () { cadrerSur(r); fermerAppel(); };
    appel.hidden = false;
    E.scene.classList.add("appel-ouvert");
    clearTimeout(appelTimer);
    appelTimer = setTimeout(fermerAppel, 12000);
    try { ok.focus({ preventScroll: true }); } catch (e) {}
  }
  function fermerAppel() {
    clearTimeout(appelTimer);
    if (appel) appel.hidden = true;
    E.scene.classList.remove("appel-ouvert");
  }
  // Cadre un rectangle du monde dans la partie de la scene qui n'est pas
  // masquee par le panneau de la reserve, exactement comme « Tout voir ».
  function cadrerSur(r) {
    var vr = rectScene(), z = zoneLibre(vr);
    var nz = Math.max(ZMIN, Math.min(ZMAX, Math.min(z.largeur / r.largeur, z.hauteur / r.hauteur)));
    var nx = z.x + (z.largeur - r.largeur * nz) / 2 - r.x * nz;
    var ny = z.y + (z.hauteur - r.hauteur * nz) / 2 - r.y * nz;
    var sz = etat.zoom, sx = etat.panX, sy = etat.panY;
    etat.zoom = nz; etat.panX = nx; etat.panY = ny; clampPan();
    nz = etat.zoom; nx = etat.panX; ny = etat.panY;
    etat.zoom = sz; etat.panX = sx; etat.panY = sy;
    allerVers(nz, nx, ny);
  }

  /* Le point de depot d'une carte posee au clic est choisi ICI, pas par le
     serveur. Le serveur, lui, tirait une position AU HASARD dans la zone
     visible : impossible a deviner, donc impossible de montrer la carte avant
     sa reponse. Or c'est justement ce qu'il faut faire, chez soi comme chez les
     autres (vue provisoire). En choisissant le point nous-memes, la carte
     apparait tout de suite, au bon endroit, partout. Le serveur garde le
     dernier mot : il borne le point au plan et decale si la place est prise. */
  function pointLibre() {
    var r = rectVisible(), w = 160, h = 150;
    var cartes = (etat.vue && etat.vue.tableau && etat.vue.tableau.cartes) || [];
    function libre(px, py) {
      return !cartes.some(function (c) { return Math.abs(c.x - px) < w && Math.abs(c.y - py) < h; });
    }
    var zw = Math.max(200, r.largeur || 800), zh = Math.max(200, r.hauteur || 600);
    for (var t = 0; t < 200; t++) {
      var px = r.x + Math.random() * Math.max(1, zw - w);
      var py = r.y + Math.random() * Math.max(1, zh - h);
      if (libre(px, py)) return { x: Math.round(px + w / 2), y: Math.round(py + h / 2) };
    }
    return { x: Math.round(r.x + zw / 2), y: Math.round(r.y + zh / 2) };
  }
  function rectVisible() { var r = rectScene(); return { x: -etat.panX / etat.zoom, y: -etat.panY / etat.zoom, largeur: r.width / etat.zoom, hauteur: r.height / etat.zoom }; }
  function versMonde(cx, cy) { var r = rectScene(); return { x: (cx - r.left - etat.panX) / etat.zoom, y: (cy - r.top - etat.panY) / etat.zoom }; }

  var pan = null;
  E.scene.addEventListener("pointerdown", function (e) {
    if (!fondScene(e.target)) return;
    if (etat.outil === "texte") { e.preventDefault(); var w = versMonde(e.clientX, e.clientY); creerNoteLocale(w.x, w.y); setOutil("deplacer"); return; }
    annulerFleche(); deselect();
    stopVueAnim();   // la main de l'utilisateur l'emporte toujours sur un recadrage en cours
    pan = { mx: e.clientX, my: e.clientY, px: etat.panX, py: etat.panY }; E.scene.classList.add("grabbing"); E.scene.setPointerCapture(e.pointerId);
  });
  function fondScene(t) { return t === E.scene || t === E.monde || t.classList.contains("plan-bord") || t.id === "fleches"; }
  // Note : double-clic sur une zone vide du tableau.
  E.scene.addEventListener("dblclick", function (e) {
    if (!fondScene(e.target)) return;
    var w = versMonde(e.clientX, e.clientY); creerNoteLocale(w.x, w.y);
  });
  E.scene.addEventListener("pointermove", function (e) { if (!pan) return; etat.panX = pan.px + (e.clientX - pan.mx); etat.panY = pan.py + (e.clientY - pan.my); clampPan(); applyView(); majFleches(); });
  // Curseur en direct : on diffuse sa position (throttlee) en permanence, meme
  // pendant un glissement de carte (l'evenement remonte jusqu'a la scene).
  E.scene.addEventListener("pointermove", function (e) { envoyerCurseur(e.clientX, e.clientY); suivreFleche(e.clientX, e.clientY); });
  E.scene.addEventListener("pointerup", function (e) { pan = null; E.scene.classList.remove("grabbing"); try { E.scene.releasePointerCapture(e.pointerId); } catch (x) {} });
  E.scene.addEventListener("wheel", function (e) { e.preventDefault(); var r = rectScene(); zoomVers(etat.zoom * (e.deltaY < 0 ? ZWHEEL : 1 / ZWHEEL), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  /* PINCEMENT A DEUX DOIGTS (tablette, ecran tactile).
     La scene est en `touch-action:none` : indispensable pour que le glissement
     d'une carte ne soit pas confisque par le defilement du navigateur, mais cela
     supprime AUSSI le pincement natif. Sur tablette, il ne restait donc que les
     boutons + et - pour zoomer, sur un tableau ou le zoom est l'outil principal.
     On le reimplemente : deux doigts posent une reference (ecartement et point
     milieu), et chaque mouvement applique le rapport d'ecartement autour de ce
     milieu, qui sert en meme temps de deplacement. C'est la meme fonction que la
     molette, donc le meme plancher de zoom et le meme recadrage. */
  var pince = null;
  var doigts = new Map();   // pointerId -> { x, y }
  function milieu() {
    var a = [];
    doigts.forEach(function (p) { a.push(p); });
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2,
             d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  }
  E.scene.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.size === 2) {
      // Deux doigts : on abandonne le deplacement a un doigt en cours, sinon le
      // tableau partirait en meme temps que le zoom.
      pan = null; E.scene.classList.remove("grabbing");
      stopVueAnim();
      var m = milieu();
      pince = { d0: m.d || 1, z0: etat.zoom, mx: m.x, my: m.y, px: etat.panX, py: etat.panY };
    }
  }, true);
  E.scene.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "touch" || !doigts.has(e.pointerId)) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.size !== 2 || !pince) return;
    e.preventDefault();
    var m = milieu(), r = rectScene();
    // Point du monde sous le milieu des doigts au moment ou ils se sont poses :
    // c'est lui qui doit rester sous les doigts pendant tout le geste.
    var wx = (pince.mx - r.left - pince.px) / pince.z0, wy = (pince.my - r.top - pince.py) / pince.z0;
    etat.zoom = bornerZoom(pince.z0 * ((m.d || 1) / pince.d0));
    etat.panX = (m.x - r.left) - wx * etat.zoom;
    etat.panY = (m.y - r.top) - wy * etat.zoom;
    clampPan(); applyView(); majFleches();
  }, true);
  function finDoigt(e) {
    if (e.pointerType !== "touch") return;
    doigts.delete(e.pointerId);
    if (doigts.size < 2) pince = null;
  }
  E.scene.addEventListener("pointerup", finDoigt, true);
  E.scene.addEventListener("pointercancel", finDoigt, true);

  // Ping : clic droit sur le tableau -> cercle qui s'agrandit chez tout le monde,
  // pour attirer l'attention (emprunte a Excalidraw / Foundry). On evite le menu
  // contextuel du navigateur et on borne au plan.
  E.scene.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var w = versMonde(e.clientX, e.clientY);
    agir({ op: "ping", x: Math.round(w.x), y: Math.round(w.y) });
    montrerPing(w.x, w.y, S.vous || "");
  });

  // Echap : annule un trace de fleche en cours (et referme la selection).
  document.addEventListener("keydown", function (e) {
    // Ctrl+Z (Cmd+Z sur Mac) : annuler sa derniere action. Jamais pendant une
    // saisie, ou c'est l'annulation du navigateur qui doit jouer.
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      var a = document.activeElement;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.getAttribute("contenteditable") === "true")) return;
      e.preventDefault(); annulerDerniere(); return;
    }
    if (e.key !== "Escape") return;
    if (etat.flecheDepart) { annulerFleche(); setOutil("deplacer"); }
    else deselect();
  });

  /* ---------- Barres / boutons ---------- */
  function setOutil(o) { etat.outil = o; document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.outil === o ? "true" : "false"); });
    E.scene.classList.toggle("outil-fleche", estFleche(o)); E.scene.classList.toggle("outil-texte", o === "texte"); annulerFleche();
    flash(estFleche(o) ? S.flecheDepart : (o === "texte" ? S.texteClic : "")); }
  document.querySelectorAll(".tool[data-outil]").forEach(function (b) { b.addEventListener("click", function () { setOutil(etat.outil === b.dataset.outil ? "deplacer" : b.dataset.outil); }); });
  E["z-plus"].addEventListener("click", function () { var r = rectScene(); zoomAnime(etat.zoom * ZSTEP, r.width / 2, r.height / 2); });
  E["z-moins"].addEventListener("click", function () { var r = rectScene(); zoomAnime(etat.zoom / ZSTEP, r.width / 2, r.height / 2); });
  E["z-tout"].addEventListener("click", toutVoir);
  (function () {
    var b = document.getElementById("btn-annuler"); if (!b) return;
    b.textContent = S.annuler; b.title = S.annulerTitre;
    b.addEventListener("click", annulerDerniere);
  })();
  // Plein écran : vraie API Fullscreen (masque la barre du navigateur), avec
  // repli sur une classe CSS si l'API n'est pas disponible.
  function reflowPlein() { setTimeout(function () { clampPan(); applyView(); dessinerFleches(); dessinerFlechesLive(); placerPool(); }, 60); }
  function syncPlein() {
    var actif = !!(document.fullscreenElement || document.webkitFullscreenElement) || document.body.classList.contains("plein-css");
    document.body.classList.toggle("plein", actif);
    // En plein ecran on GARDE la barre : elle est justement ce dont on a besoin
    // quand tout l'ecran est au tableau. Et si on choisit malgre tout de la
    // masquer, la palette flottante prend le relais (voir majBarres).
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

  /* Masquer / afficher la barre pour agrandir le tableau.
     LES OUTILS NE DISPARAISSENT JAMAIS. Avant, masquer la barre (ou passer en
     plein ecran, ce qu'on fait justement pour voir grand) enlevait la main, les
     liens, les notes, le zoom et l'annulation : il ne restait qu'a regarder. On
     DEPLACE donc les memes elements du document dans une palette flottante, et
     on les remet exactement ou ils etaient ensuite. Deplacer plutot que
     dupliquer : un doublon aurait son propre etat (outil actif, bouton
     desactive...) et les deux finiraient par se contredire. */
  function ancrer(el) {
    if (!el || el._ancre || !el.parentNode) return;
    el._ancre = document.createComment("place");
    el.parentNode.insertBefore(el._ancre, el);
  }
  function rendreALaBarre(el) {
    if (el && el._ancre && el._ancre.parentNode) el._ancre.parentNode.insertBefore(el, el._ancre);
  }
  function outilsMobiles() {
    return [document.querySelector(".seg-outils"), E["grp-zoom"], E["btn-annuler"]];
  }
  function majBarres(cachees) {
    document.body.classList.toggle("barres-cachees", cachees);
    var d = E["dock"];
    if (d) {
      var m = outilsMobiles();
      if (cachees) {
        m.forEach(function (el) { if (el) { ancrer(el); d.appendChild(el); } });
        d.appendChild(E["btn-barres-show"]);   // toujours en dernier
      } else {
        m.forEach(rendreALaBarre);
      }
      d.hidden = !cachees;
    }
    reflowPlein();
  }
  if (E["btn-barres"]) E["btn-barres"].addEventListener("click", function () { majBarres(true); });
  if (E["btn-barres-show"]) E["btn-barres-show"].addEventListener("click", function () { majBarres(false); });
  /* Menu « Affichage ». Il ne contient que des reglages : rien de ce qui s'y
     trouve n'est necessaire pour jouer, et rien de ce qui est necessaire pour
     jouer ne s'y trouve. */
  (function () {
    var b = E["btn-affichage"], m = E["menu-affichage"];
    if (!b || !m) return;
    function ouvrir(o) { m.hidden = !o; b.setAttribute("aria-expanded", o ? "true" : "false"); }
    b.addEventListener("click", function (e) { e.stopPropagation(); ouvrir(m.hidden); });
    m.addEventListener("click", function (e) { if (e.target.closest("button")) ouvrir(false); });
    document.addEventListener("click", function (e) {
      if (!m.hidden && !m.contains(e.target) && e.target !== b) ouvrir(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !m.hidden) { ouvrir(false); try { b.focus(); } catch (x) {} }
    });
  })();
  (function () {
    var bc = document.getElementById("btn-curseurs");
    if (!bc) return;
    bc.setAttribute("aria-pressed", curs.montrer ? "true" : "false");
    bc.title = curs.montrer ? S.curseursOn : S.curseursOff;
    bc.addEventListener("click", basculerCurseurs);
  })();
  /* ECRAN TELEPHONE. Ce n'est pas une impasse : la personne vient souvent de son
     e-mail d'invitation, cinq minutes avant l'atelier. On lui donne le lien, de
     quoi le copier ou se l'envoyer, et la possibilite d'essayer quand meme
     (grand telephone, tablette en portrait) plutot que de lui fermer la porte. */
  (function () {
    var champ = document.getElementById("ma-url");
    if (!champ) return;
    champ.value = location.href;
    var cop = document.getElementById("ma-copier");
    if (cop) cop.addEventListener("click", function () {
      var fait = function () { cop.textContent = S.lienCopie; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(fait, function () { champ.select(); });
      } else { champ.select(); try { document.execCommand("copy"); fait(); } catch (e) {} }
    });
    var ml = document.getElementById("ma-mail");
    if (ml) ml.href = "mailto:?subject=" + encodeURIComponent(S.lienSujet)
      + "&body=" + encodeURIComponent(location.href);
    var forcer = document.getElementById("ma-forcer");
    if (forcer) forcer.addEventListener("click", function () {
      document.body.classList.add("mobile-force");
      // Le tableau n'a jamais ete mesure a cette taille : on recalcule le
      // cadrage plutot que de laisser une vue calculee pour un ecran absent.
      setTimeout(function () { try { clampPan(); applyView(); centrer(); } catch (e) {} }, 80);
    });
  })();

  // Prevenir les autres a la fermeture de l'onglet (retrait immediat du curseur).
  window.addEventListener("beforeunload", function () { curs.ferme = true; try { if (curs.ws) curs.ws.close(); } catch (e) {} });
  (function () {
    var s = document.getElementById("btn-sombre");
    if (s) {
      // Le bouton bascule le theme de TOUTE LA PAGE (barres, panneaux, cartes,
      // tableau), pas seulement le canevas : c'est bien ce qu'on attend d'un
      // bouton « fond noir ». On pose data-theme sur <html> (le CSS de board.css
      // y reagit deja) et on memorise le choix sous la meme cle que le reste du
      // site ("theme"), pour rester coherent d'une page a l'autre.
      var racine = document.documentElement;
      var noirDepart = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var memo = null; try { memo = localStorage.getItem("theme"); } catch (e) {}
      var attr = racine.getAttribute("data-theme") || memo;
      if (attr === "dark") noirDepart = true; else if (attr === "light") noirDepart = false;
      function appliquerCanvas(noir) {
        racine.setAttribute("data-theme", noir ? "dark" : "light");
        document.body.classList.toggle("canvas-noir", noir);
        document.body.classList.toggle("canvas-blanc", !noir);
        s.setAttribute("aria-pressed", noir ? "true" : "false");
        s.textContent = noir ? S.fondBlanc : S.fondNoir; // le bouton propose l'action inverse
        try { dessinerFleches(); } catch (e) {}
      }
      appliquerCanvas(noirDepart);
      s.addEventListener("click", function () {
        var noir = !document.body.classList.contains("canvas-noir");
        try { localStorage.setItem("theme", noir ? "dark" : "light"); } catch (e) {}
        appliquerCanvas(noir);
      });
    }
    var e = document.getElementById("btn-export");
    if (e) e.addEventListener("click", exporterImage);
  })();
  // Deck (animateur) : replier / deplier le jeu complet en bas de l'ecran.
  if (E["deck-toggle"] && E["deck"]) {
    // Pli memorise par navigateur, comme celui de la reserve.
    try { if (localStorage.getItem("fresque:deckreplie") === "1") { E["deck"].classList.add("replie"); E["deck-toggle"].setAttribute("aria-expanded", "false"); } } catch (e) {}
    E["deck-toggle"].addEventListener("click", function () {
      var replie = E["deck"].classList.toggle("replie");
      this.setAttribute("aria-expanded", replie ? "false" : "true");
      try { localStorage.setItem("fresque:deckreplie", replie ? "1" : "0"); } catch (e) {}
      reflowPlein();
    });
  }
  if (E["btn-rassembler"]) E["btn-rassembler"].addEventListener("click", envoyerAppelVue);
  E["btn-participants"].addEventListener("click", function () { E.panneau.hidden = !E.panneau.hidden; });
  E["fermer-panneau"].addEventListener("click", function () { E.panneau.hidden = true; });
  if (E["btn-vocal"]) E["btn-vocal"].addEventListener("click", function () { agir({ op: "definirLienVocal", url: (E["vocal-url"].value || "").trim() }); });
  if (E["code-chip"]) E["code-chip"].addEventListener("click", function () { copier(etat.code, E["code-chip"].querySelector(".copier")); });
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
    // Pendant le tutoriel : Entrée/→/Espace = étape suivante, Échap = fermer ;
    // on bloque les autres raccourcis pour rester focalisé sur la visite.
    if (tuto) {
      if (e.key === "Escape") { e.preventDefault(); finirTuto(); }
      else if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); etapeSuivante(); }
      return;
    }
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
      fermerAppel(); deselect(); annulerFleche(); if (estFleche(etat.outil)) setOutil("deplacer"); }
    if ((e.key === "Delete" || e.key === "Backspace") && etat.sel) {
      if (document.activeElement && (document.activeElement.getAttribute("contenteditable") === "true" || document.activeElement.tagName === "INPUT")) return;
      e.preventDefault();
      if (etat.sel.type === "fleche") agir({ op: "supprimerFleche", id: etat.sel.id });
      else if (etat.sel.type === "carte" && etat.role === "animateur") agir({ op: "retirerCarte", n: etat.sel.n });
      deselect();
    }
  });
  window.addEventListener("resize", function () { clampPan(); applyView(); majFleches(); });

  // La scene change de hauteur a plusieurs moments (arrivee du jeu de cartes en
  // bas, repli des barres, plein ecran, redimensionnement). On replace alors le
  // panneau et on recadre : sans cela, le panneau calcule sur une scene plus
  // haute debordait sous le jeu de cartes.
  (function () {
    var reagir = function () {
      oublierDims();   // la hauteur d'un titre peut changer avec la largeur des polices
      majPlancher();   // la zone visible a change : le plancher de zoom aussi
      placerPool(); clampPan(); applyView(); majFleches();
    };
    // Anti-rebond A RETARDEMENT : la scene se redimensionne par rafales (le jeu
    // de cartes qui se remplit en bas). Un simple debit limite en tete de rafale
    // aurait garde la mesure du DEBUT, donc une scene encore trop haute.
    var minuteur = 0;
    var planifier = function () { clearTimeout(minuteur); minuteur = setTimeout(reagir, 80); };
    window.addEventListener("resize", planifier);
    if (typeof ResizeObserver === "function" && E.scene) new ResizeObserver(planifier).observe(E.scene);
  })();

  /* ---------- Modal ---------- */
  // Prechargement discret des grandes images : sans lui, ouvrir une carte
  // attendait le telechargement de son visuel plein format (le « delai quand on
  // clique sur une carte »). On precharge celles qui sont deja sous les yeux
  // (pool + tableau), au moment ou elles y arrivent.
  var precharge = {};
  function precharger(n) {
    var c = etat.cartes[n]; if (!c || !c.image || precharge[n]) return;
    precharge[n] = 1;
    var src = c.image.carte || c.image.grand; if (src) { var i = new Image(); i.src = BASE + src; }
    var v = c.image.verso && (c.image.verso.carte || c.image.verso.grand);
    if (v) { var j = new Image(); j.src = BASE + v; }
  }
  function ouvrirModal(n) { var c = etat.cartes[n]; if (!c) return;
    E["mg-img"].src = BASE + (c.image ? (c.image.carte || c.image.grand) : ""); E["mg-num"].textContent = n; E["mg-tit"].textContent = c.titre; E["mg-vtit"].textContent = c.titre;
    E["mg-verso"].innerHTML = ""; (c.verso || []).forEach(function (p) { var el = document.createElement("p"); el.textContent = /\[A COMPLETER\]/i.test(p) ? S.texteAVenir : p; E["mg-verso"].appendChild(el); });
    var vface = E["carte-grande"].querySelector(".verso");
    if (c.image && c.image.verso) { E["mg-vimg"].src = BASE + (c.image.verso.carte || c.image.verso.grand); E["mg-vimg"].alt = c.titre + ". " + (c.verso || []).join(" "); vface.classList.add("a-image"); }
    else { E["mg-vimg"].removeAttribute("src"); vface.classList.remove("a-image"); }
    var mpo = document.getElementById("modal-poser"); if (mpo) mpo.hidden = true; // plus de main individuelle
    E["carte-grande"].classList.remove("flip"); E.modal.classList.add("on"); }
  function fermerModal() { E.modal.classList.remove("on"); }
  // Retourner : le bouton ET le clic sur la carte retournent. stopPropagation
  // sur les boutons de la barre, sinon le clic remonte a .carte-grande et
  // annule aussitot le retournement (double bascule).
  E["modal-flip"].addEventListener("click", function (e) { e.stopPropagation(); E["carte-grande"].classList.toggle("flip"); });
  E["carte-grande"].addEventListener("click", function () { E["carte-grande"].classList.toggle("flip"); }); // clic = retourner
  E["modal-close"].addEventListener("click", function (e) { e.stopPropagation(); fermerModal(); });
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
  /* AVANT D'EXPORTER : POSER LA PLUME.
     Une note qu'on est en train d'ecrire n'existe, pendant quelques centaines de
     millisecondes, QUE dans la page : l'envoi au serveur est etale pour ne pas
     ecrire a chaque touche. Or l'image est dessinee a partir de l'etat du
     SERVEUR. Cliquer « Telecharger l'image » en pleine frappe produisait donc
     une image ou la note manquait, sans rien signaler. C'est le « il y a juste
     une note qui n'est pas sur l'image » remonte apres un atelier.
     On sort donc du champ en cours (ce qui declenche son enregistrement), on
     vide les envois en attente, et on attend que la file d'actions soit vide
     avant de dessiner. Attente bornee : mieux vaut une image dans tous les cas
     qu'un bouton qui ne repond pas. */
  function poserLaPlume() {
    var a = document.activeElement;
    if (a && (a.getAttribute("contenteditable") === "true" || a.tagName === "INPUT" || a.tagName === "TEXTAREA")) {
      try { a.blur(); } catch (e) {}
    }
    frappe.vider();
  }
  function quandCalme(fn, finAvant) {
    finAvant = finAvant || (Date.now() + 2500);
    if ((!fileAgir.length && etat.attente === 0) || Date.now() > finAvant) { fn(); return; }
    setTimeout(function () { quandCalme(fn, finAvant); }, 80);
  }
  /* DEPOT DE L'IMAGE POUR L'E-MAIL DE SUIVI. La fresque terminee est la seule
     chose que le groupe a envie de garder, et elle s'arretait sur la machine de
     l'animateur·ice. On la depose donc aussi cote serveur, qui la joindra a
     l'e-mail envoye au groupe apres l'atelier, puis l'effacera.
     Silencieux de bout en bout : c'est un bonus, il ne doit jamais gener le
     telechargement, ni inquieter si le depot echoue. Animateur·ice seulement. */
  var imageDeposee = false;
  function deposerImage(cv) {
    if (imageDeposee || etat.role !== "animateur" || !etat.code || !etat.jeton) return;
    var png;
    // Qualite volontairement moindre que le fichier telecharge : il s'agit de
    // tenir dans une piece jointe, pas de remplacer l'original.
    try { png = cv.toDataURL("image/jpeg", 0.82); } catch (e) { return; }
    var base64 = String(png).split(",")[1] || "";
    if (!base64 || base64.length > 3400000) return;
    imageDeposee = true;
    api("image", { code: etat.code, jeton: etat.jeton, png: base64 })
      .catch(function () { imageDeposee = false; });
  }
  function exporterImage() { poserLaPlume(); quandCalme(dessinerExport); }
  function dessinerExport() {
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

    var idx = {}, etiquettes = [];
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
      if (f.libelle) etiquettes.push({ x: cxp, y: cyp, t: f.libelle });
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
    // Etiquettes de fleche par-dessus les cartes (comme a l'ecran).
    etiquettes.forEach(function (l) {
      ctx.font = "600 13px 'Montserrat',sans-serif"; var tw = ctx.measureText(l.t).width;
      ctx.fillStyle = "#fff7e6"; coinRond(ctx, l.x - tw / 2 - 7, l.y - 11, tw + 14, 22, 7); ctx.fill();
      ctx.strokeStyle = "#e0b378"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#8a4200"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(l.t, l.x, l.y + 1);
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
      deposerImage(cv);
    }, "image/png");
    flash(EN ? "Image downloaded." : "Image téléchargée.");
  }
})();
