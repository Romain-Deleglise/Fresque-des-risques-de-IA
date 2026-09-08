/* Moteur de règles de la Fresque en ligne : PUR (aucune I/O).
   Le serveur est l'autorité (cahier des charges B6). Ce module est utilisé
   par la fonction Netlify et par les tests. CommonJS pour être universel. */
"use strict";

var ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789"; // sans 0 O I 1 L S 5
var MAX_PARTICIPANTS = 8;
var MAX_POOL = 8;          // cartes maximum dans le pool commun (pour ne pas surcharger)
var SEUIL_PRESENCE_MS = 15000; // au-dela, on considere la personne deconnectee
var NB_CARTES = 38;        // cartes jouables 1..38 (la 0 est l'intro, hors jeu)
var LIMITE_TEXTES = 200, LIMITE_FLECHES = 300;
var LEN_PRENOM = 24, LEN_TEXTE = 280, LEN_LIBELLE = 40, LEN_VOCAL = 200;
var PLAN_W = 3200, PLAN_H = 2200;

function rnd(n) { return Math.floor(Math.random() * n); }
function jetonAleatoire() {
  var s = ""; for (var i = 0; i < 24; i++) s += ALPHABET[rnd(ALPHABET.length)]; return s;
}
function nouveauCode(codesExistants) {
  codesExistants = codesExistants || {};
  for (var essai = 0; essai < 50; essai++) {
    var c = ""; for (var i = 0; i < 6; i++) c += ALPHABET[rnd(ALPHABET.length)];
    if (!codesExistants[c]) return c;
  }
  return null;
}
function borne(v, min, max) { return Math.max(min, Math.min(max, v)); }
function tronque(s, n) { return String(s == null ? "" : s).slice(0, n); }

/* --- Création / entrée --------------------------------------------------- */
function creer(prenom, code) {
  var jeton = jetonAleatoire();
  var idAnim = "a1";
  return {
    session: {
      code: code,
      creeLe: Date.now(),
      version: 1,
      animateur: { id: idAnim, prenom: tronque(prenom, LEN_PRENOM) || "Animateur", connecte: true, vuLe: Date.now() },
      participants: [],
      pool: [],           // cartes mises a disposition par l'animateur (max MAX_POOL)
      lienVocal: null,
      tableau: { cartes: [], fleches: [], textes: [] },
      seq: 1,
      clos: false,
      jetons: {}
    },
    jeton: jeton,
    role: "animateur",
    idAnim: idAnim
  };
}

function participantsConnectes(s) {
  return s.participants.filter(function (p) { return p.connecte; }).length;
}

// rejoindre : jeton connu → reprise de place ; sinon nouveau participant
function rejoindre(s, prenom, jeton) {
  if (s.clos) return { refus: { code: "session_inconnue", message: "Cette session est terminée." } };
  // reprise via jeton
  if (jeton && s.jetons[jeton]) {
    var info = s.jetons[jeton];
    if (info.role === "animateur") { s.animateur.connecte = true; s.animateur.vuLe = Date.now(); return { role: "animateur", jeton: jeton }; }
    var p = s.participants.find(function (x) { return x.id === info.id; });
    if (p) { p.connecte = true; p.vuLe = Date.now(); if (prenom) p.prenom = tronque(prenom, LEN_PRENOM); return { role: "participant", jeton: jeton, id: p.id }; }
  }
  // nouvelle place
  if (participantsConnectes(s) >= MAX_PARTICIPANTS) {
    return { refus: { code: "session_pleine", message: "La session est complète (8 participants)." } };
  }
  var id = "p" + (s.seq++);
  var nouveau = { id: id, prenom: tronque(prenom, LEN_PRENOM) || "Invité", connecte: true, vuLe: Date.now() };
  s.participants.push(nouveau);
  var nj = jetonAleatoire();
  s.jetons[nj] = { role: "participant", id: id };
  bump(s);
  return { role: "participant", jeton: nj, id: id };
}

function toucher(s, jeton) {
  var info = s.jetons[jeton]; if (!info) return;
  if (info.role === "animateur") { s.animateur.connecte = true; s.animateur.vuLe = Date.now(); }
  else { var p = s.participants.find(function (x) { return x.id === info.id; }); if (p) { p.connecte = true; p.vuLe = Date.now(); } }
}

function bump(s) { s.version++; }

/* --- Vue publique (envoyée aux clients) ---------------------------------- */
function present(x) { return !!x && x.connecte && (Date.now() - (x.vuLe || 0) < SEUIL_PRESENCE_MS); }
function vue(s) {
  return {
    code: s.code, version: s.version, clos: s.clos, lienVocal: s.lienVocal,
    animateur: { prenom: s.animateur.prenom, connecte: present(s.animateur) },
    participants: s.participants.map(function (p) {
      return { id: p.id, prenom: p.prenom, connecte: present(p) };
    }),
    pool: s.pool.slice(),
    tableau: s.tableau,
    ping: s.ping || null
  };
}

/* --- Pool commun ---------------------------------------------------------
   L'animateur met des cartes a disposition dans un pool partage (max MAX_POOL).
   N'importe quel participant (ou l'animateur) peut ensuite prendre une carte du
   pool et la poser sur la table. Plus de tour par tour ni de main individuelle :
   un joueur absent ne bloque jamais la partie. */
function carteJouable(n) { n = +n; return Number.isInteger(n) && n >= 1 && n <= NB_CARTES; }
function surTable(s, n) { return s.tableau.cartes.some(function (c) { return c.n === n; }); }
function dansPool(s, n) { return s.pool.indexOf(n) >= 0; }

function poolAjouter(s, n) {
  n = +n;
  if (!carteJouable(n)) return { refus: { code: "carte_invalide", message: "Carte inconnue." } };
  if (dansPool(s, n) || surTable(s, n)) { return { ok: true }; } // deja disponible / posee : idempotent
  if (s.pool.length >= MAX_POOL) return { refus: { code: "pool_plein", message: "Le pool est plein (" + MAX_POOL + " cartes). Retirez-en une d'abord." } };
  s.pool.push(n); bump(s);
  return { ok: true, resultat: { n: n } };
}
function poolRetirer(s, n) {
  n = +n;
  var i = s.pool.indexOf(n); if (i < 0) return { ok: true };
  s.pool.splice(i, 1); bump(s);
  return { ok: true };
}

/* --- Tableau ------------------------------------------------------------- */
// Prendre une carte du pool et la poser sur la table (tout le monde peut).
function poserCarte(s, n, rect) {
  n = +n;
  var i = s.pool.indexOf(n);
  if (i < 0) return { refus: { code: "hors_pool", message: "Cette carte n'est plus dans le pool." } };
  s.pool.splice(i, 1);
  if (surTable(s, n)) { bump(s); return { ok: true }; }
  var pos = placementLibre(s, rect);
  s.tableau.cartes.push({ n: n, x: pos.x, y: pos.y });
  bump(s);
  return { ok: true, resultat: { n: n, x: pos.x, y: pos.y } };
}
function placementLibre(s, rect) {
  var w = 160, h = 150, pas = 186;
  var zx = 100, zy = 100, zw = PLAN_W - 200, zh = PLAN_H - 200;
  if (rect && isFinite(rect.x)) {
    zx = borne(rect.x, 0, PLAN_W - w); zy = borne(rect.y, 0, PLAN_H - h);
    zw = borne(rect.largeur || 800, 200, PLAN_W); zh = borne(rect.hauteur || 600, 200, PLAN_H);
  }
  function libre(px, py) { return !s.tableau.cartes.some(function (c) { return Math.abs(c.x - px) < w && Math.abs(c.y - py) < h; }); }
  for (var t = 0; t < 200; t++) {
    var px = borne(zx + rnd(Math.max(1, zw - w)), 0, PLAN_W - w);
    var py = borne(zy + rnd(Math.max(1, zh - h)), 0, PLAN_H - h);
    if (libre(px, py)) return { x: px, y: py };
  }
  return { x: borne(zx + rnd(zw), 0, PLAN_W - w), y: borne(zy + rnd(zh), 0, PLAN_H - h) };
}
function deplacerCarte(s, n, x, y) {
  var c = s.tableau.cartes.find(function (c) { return c.n === n; }); if (!c) return { refus: { code: "carte_absente" } };
  c.x = borne(+x || 0, 0, PLAN_W - 150); c.y = borne(+y || 0, 0, PLAN_H - 150); bump(s); return { ok: true };
}
function retirerCarte(s, n) {
  s.tableau.cartes = s.tableau.cartes.filter(function (c) { return c.n !== n; });
  s.tableau.fleches = s.tableau.fleches.filter(function (f) { return f.de !== n && f.vers !== n; });
  bump(s); return { ok: true };
}
function creerFleche(s, de, vers, bidir) {
  if (de === vers) return { refus: { code: "fleche_invalide" } };
  var posee = function (nn) { return s.tableau.cartes.some(function (c) { return c.n === nn; }); };
  if (!posee(de) || !posee(vers)) return { refus: { code: "fleche_invalide", message: "Les deux cartes doivent être sur le tableau." } };
  if (s.tableau.fleches.length >= LIMITE_FLECHES) return { refus: { code: "trop_de_fleches" } };
  var id = "f" + (s.seq++);
  s.tableau.fleches.push({ id: id, de: de, vers: vers, bidir: !!bidir, libelle: "" });
  bump(s); return { ok: true, resultat: { id: id } };
}
function libellerFleche(s, id, libelle) {
  var f = s.tableau.fleches.find(function (f) { return f.id === id; }); if (!f) return { refus: {} };
  f.libelle = tronque(libelle, LEN_LIBELLE); bump(s); return { ok: true };
}
function bidirFleche(s, id) {
  var f = s.tableau.fleches.find(function (f) { return f.id === id; }); if (!f) return { refus: {} };
  f.bidir = !f.bidir; bump(s); return { ok: true };
}
function supprimerFleche(s, id) {
  s.tableau.fleches = s.tableau.fleches.filter(function (f) { return f.id !== id; }); bump(s); return { ok: true };
}
function creerTexte(s, x, y, contenu) {
  if (s.tableau.textes.length >= LIMITE_TEXTES) return { refus: { code: "trop_de_textes" } };
  var id = "t" + (s.seq++);
  s.tableau.textes.push({ id: id, x: borne(+x || 0, 0, PLAN_W), y: borne(+y || 0, 0, PLAN_H), contenu: tronque(contenu, LEN_TEXTE) });
  bump(s); return { ok: true, resultat: { id: id } };
}
function modifierTexte(s, id, contenu) {
  var t = s.tableau.textes.find(function (t) { return t.id === id; }); if (!t) return { refus: {} };
  t.contenu = tronque(contenu, LEN_TEXTE);
  if (!t.contenu.trim()) s.tableau.textes = s.tableau.textes.filter(function (x) { return x.id !== id; });
  bump(s); return { ok: true };
}
function deplacerTexte(s, id, x, y) {
  var t = s.tableau.textes.find(function (t) { return t.id === id; }); if (!t) return { refus: {} };
  t.x = borne(+x || 0, 0, PLAN_W); t.y = borne(+y || 0, 0, PLAN_H); bump(s); return { ok: true };
}
function supprimerTexte(s, id) {
  s.tableau.textes = s.tableau.textes.filter(function (t) { return t.id !== id; }); bump(s); return { ok: true };
}
// Ping : signale un point du tableau aux autres (cercle qui s'agrandit chez eux).
// Ephemere : un seul ping courant, les clients l'ignorent apres ~2 s (via ts).
function ping(s, x, y, par) {
  s.ping = { x: borne(+x || 0, 0, PLAN_W), y: borne(+y || 0, 0, PLAN_H), par: tronque(par, LEN_PRENOM), ts: Date.now(), id: s.seq++ };
  bump(s); return { ok: true };
}
function definirLienVocal(s, url) {
  url = tronque(url, LEN_VOCAL);
  if (url && !/^https:\/\//i.test(url)) return { refus: { code: "url_invalide", message: "Le lien doit commencer par https://" } };
  s.lienVocal = url || null; bump(s); return { ok: true };
}
function clore(s) { s.clos = true; bump(s); return { ok: true }; }
// Exclure un participant (animateur) : le retire et invalide ses jetons.
function exclure(s, id) {
  var avant = s.participants.length;
  s.participants = s.participants.filter(function (p) { return p.id !== id; });
  Object.keys(s.jetons).forEach(function (j) { if (s.jetons[j].role === "participant" && s.jetons[j].id === id) delete s.jetons[j]; });
  if (s.participants.length !== avant) bump(s);
  return { ok: true };
}

/* --- Aiguillage d'une intention ------------------------------------------ */
function appliquer(s, jeton, intention) {
  var info = s.jetons[jeton];
  if (!info) return { refus: { code: "jeton_inconnu", message: "Session non reconnue." } };
  if (s.clos) return { refus: { code: "session_close", message: "Session terminée." } };
  var estAnim = info.role === "animateur";
  var moi = estAnim ? null : s.participants.find(function (p) { return p.id === info.id; });
  var d = intention || {}; var op = d.op;

  // Reservees a l'animateur : gerer le pool, retirer une carte de la table,
  // le lien vocal, clore la session.
  var actionsAnim = { poolAjouter: 1, poolRetirer: 1, retirerCarte: 1, exclure: 1, definirLienVocal: 1, clore: 1 };
  if (actionsAnim[op] && !estAnim) return { refus: { code: "droit_insuffisant", message: "Réservé à l'animateur." } };

  switch (op) {
    case "poolAjouter": return poolAjouter(s, d.n);
    case "poolRetirer": return poolRetirer(s, d.n);
    case "retirerCarte": return retirerCarte(s, d.n);
    case "exclure": return exclure(s, d.id);
    case "definirLienVocal": return definirLienVocal(s, d.url);
    case "clore": return clore(s);
    case "ping": return ping(s, d.x, d.y, estAnim ? s.animateur.prenom : (moi && moi.prenom) || ""); // tous
    case "poserCarte": return poserCarte(s, d.n, d.rect); // prendre du pool -> table (tous)
    case "deplacerCarte": return deplacerCarte(s, d.n, d.x, d.y);
    case "creerFleche": return creerFleche(s, d.de, d.vers, d.bidir);
    case "libellerFleche": return libellerFleche(s, d.id, d.libelle);
    case "bidirFleche": return bidirFleche(s, d.id);
    case "supprimerFleche": return supprimerFleche(s, d.id);
    case "creerTexte": return creerTexte(s, d.x, d.y, d.contenu);
    case "modifierTexte": return modifierTexte(s, d.id, d.contenu);
    case "deplacerTexte": return deplacerTexte(s, d.id, d.x, d.y);
    case "supprimerTexte": return supprimerTexte(s, d.id);
    default: return { refus: { code: "op_inconnue", message: "Action inconnue." } };
  }
}

module.exports = {
  ALPHABET: ALPHABET, MAX_PARTICIPANTS: MAX_PARTICIPANTS,
  nouveauCode: nouveauCode, jetonAleatoire: jetonAleatoire,
  creer: creer, rejoindre: rejoindre, toucher: toucher, vue: vue, appliquer: appliquer,
  MAX_POOL: MAX_POOL, NB_CARTES: NB_CARTES
};
