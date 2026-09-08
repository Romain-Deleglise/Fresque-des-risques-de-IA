// Tests des règles (pur, sans I/O). Lancement : node serveur/tests/regles.test.mjs
// Modèle : pool commun (l'animateur met des cartes à disposition, tout le monde
// les pose sur la table). Plus de tour par tour ni de main individuelle.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../src/regles.js");

let ok = 0, ko = 0;
function t(nom, cond) { if (cond) { ok++; } else { ko++; console.error("  ✗ " + nom); } }

// Création
const c = R.creer("Léa", "H7KQ2M");
const s = c.session;
const jAnim = c.jeton;
s.jetons[jAnim] = { role: "animateur", id: c.idAnim }; // le serveur le fait normalement
t("code posé", s.code === "H7KQ2M");
t("pool vide au départ", Array.isArray(s.pool) && s.pool.length === 0);
t("pas de pioche/tour dans la vue", R.vue(s).piocheRestante === undefined && R.vue(s).tour === undefined);
t("vue expose le pool", Array.isArray(R.vue(s).pool));

// Rejoindre 2 participants
const j1 = R.rejoindre(s, "Ana");
const j2 = R.rejoindre(s, "Bo");
t("2 participants", s.participants.length === 2);
t("jonctions distinctes = jetons distincts", j1.jeton && j2.jeton && j1.jeton !== j2.jeton);
t("jonctions distinctes = identifiants distincts", j1.id !== j2.id);

// Pool : réservé à l'animateur
let r = R.appliquer(s, j1.jeton, { op: "poolAjouter", n: 1 });
t("participant ne peut pas alimenter le pool", r.refus && r.refus.code === "droit_insuffisant");
r = R.appliquer(s, jAnim, { op: "poolAjouter", n: 1 });
t("animateur ajoute au pool", r.ok && s.pool.length === 1 && s.pool[0] === 1);
r = R.appliquer(s, jAnim, { op: "poolAjouter", n: 1 });
t("ajout idempotent (même carte)", s.pool.length === 1);
r = R.appliquer(s, jAnim, { op: "poolAjouter", n: 0 });
t("carte 0 (intro) refusée", r.refus && r.refus.code === "carte_invalide");
r = R.appliquer(s, jAnim, { op: "poolAjouter", n: 39 });
t("carte 39 hors bornes refusée", r.refus && r.refus.code === "carte_invalide");

// Plafond du pool
for (let n = 2; n <= 8; n++) R.appliquer(s, jAnim, { op: "poolAjouter", n: n });
t("pool à 8", s.pool.length === 8);
r = R.appliquer(s, jAnim, { op: "poolAjouter", n: 9 });
t("9e carte refusée (pool plein)", r.refus && r.refus.code === "pool_plein");

// Retirer du pool
r = R.appliquer(s, jAnim, { op: "poolRetirer", n: 8 });
t("animateur retire du pool", s.pool.length === 7 && s.pool.indexOf(8) < 0);

// Poser depuis le pool : n'importe quel participant
r = R.appliquer(s, j1.jeton, { op: "poserCarte", n: 1, rect: { x: 400, y: 400 } });
t("participant pose une carte du pool", r.ok && s.tableau.cartes.some((x) => x.n === 1) && s.pool.indexOf(1) < 0);
r = R.appliquer(s, j2.jeton, { op: "poserCarte", n: 1 });
t("poser une carte hors pool refusé", r.refus && r.refus.code === "hors_pool");

// Poser une 2e carte puis relier
R.appliquer(s, j2.jeton, { op: "poserCarte", n: 2, rect: { x: 800, y: 400 } });
t("2 cartes sur la table", s.tableau.cartes.length === 2);
r = R.appliquer(s, j1.jeton, { op: "creerFleche", de: 1, vers: 2, bidir: false });
t("flèche créée entre 2 cartes posées", r.ok && s.tableau.fleches.length === 1);
r = R.appliquer(s, j1.jeton, { op: "creerFleche", de: 1, vers: 3 });
t("flèche vers une carte absente refusée", r.refus);

// Déplacer une carte (tout le monde)
r = R.appliquer(s, j1.jeton, { op: "deplacerCarte", n: 1, x: 1000, y: 900 });
t("carte déplacée", r.ok && s.tableau.cartes.find((x) => x.n === 1).x === 1000);

// Retirer une carte de la table : réservé à l'animateur, cascade des flèches
r = R.appliquer(s, j1.jeton, { op: "retirerCarte", n: 1 });
t("participant ne peut pas retirer une carte", r.refus && r.refus.code === "droit_insuffisant");
r = R.appliquer(s, jAnim, { op: "retirerCarte", n: 1 });
t("animateur retire + flèches en cascade", s.tableau.cartes.length === 1 && s.tableau.fleches.length === 0);

// Notes
r = R.appliquer(s, j1.jeton, { op: "creerTexte", x: 500, y: 500, contenu: "alimente" });
t("texte créé", s.tableau.textes.length === 1);

// Lien vocal (animateur), validation https
r = R.appliquer(s, jAnim, { op: "definirLienVocal", url: "http://x" });
t("lien vocal non https refusé", r.refus && r.refus.code === "url_invalide");
r = R.appliquer(s, jAnim, { op: "definirLienVocal", url: "https://meet.example/x" });
t("lien vocal https ok", r.ok && s.lienVocal === "https://meet.example/x");

// Reprise via jeton même si plein
for (let i = 0; i < 6; i++) R.rejoindre(s, "P" + i);
const trop = R.rejoindre(s, "Neuvième");
t("9e participant refusé", trop.refus && trop.refus.code === "session_pleine");
const reprise = R.rejoindre(s, "Ana", j1.jeton);
t("reprise via jeton acceptée même plein", reprise.role === "participant" && reprise.jeton === j1.jeton);

console.log((ko === 0 ? "✅" : "❌") + " Règles : " + ok + " réussis, " + ko + " échoués");
process.exit(ko === 0 ? 0 : 1);
