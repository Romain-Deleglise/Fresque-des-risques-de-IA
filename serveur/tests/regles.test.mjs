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

// Exclusion d'un participant (animateur seulement)
r = R.appliquer(s, j1.jeton, { op: "exclure", id: j2.id });
t("participant ne peut pas exclure", r.refus && r.refus.code === "droit_insuffisant");
const avantExcl = s.participants.length;
R.appliquer(s, jAnim, { op: "exclure", id: j2.id });
t("animateur exclut un participant", s.participants.length === avantExcl - 1 && !s.participants.some((p) => p.id === j2.id));
t("jeton du participant exclu invalidé", !s.jetons[j2.jeton]);

// Ping du tableau (tout le monde), position bornée, marqueur éphémère
r = R.appliquer(s, j1.jeton, { op: "ping", x: 700, y: 800 });
t("participant peut ping", r.ok && s.ping && s.ping.x === 700 && s.ping.y === 800);
const idPing = s.ping.id;
r = R.appliquer(s, jAnim, { op: "ping", x: 999999, y: -50 });
t("ping animateur, coordonnées bornées + nouvel id", s.ping.x <= 3200 && s.ping.y === 0 && s.ping.id !== idPing);
t("ping exposé dans la vue", R.vue(s).ping && R.vue(s).ping.x === s.ping.x);

// Reservation de carte du pool (verrou souple) + glisser-deposer a un point precis
var s2 = R.creer("Ani", "ABCDEF").session;
var jA = "ja"; s2.jetons[jA] = { role: "animateur", id: "a1" };
var pj = R.rejoindre(s2, "Zoe"); var jZ = pj.jeton;
R.appliquer(s2, jA, { op: "poolAjouter", n: 5 });
r = R.appliquer(s2, jZ, { op: "reserverPool", n: 5 });
t("un joueur reserve une carte du pool", r.ok && R.vue(s2).reservations["5"] === "Zoe");
r = R.appliquer(s2, jA, { op: "reserverPool", n: 5 });
t("carte reservee : un autre ne peut pas la prendre", r.refus && r.refus.code === "carte_occupee");
r = R.appliquer(s2, jZ, { op: "libererPool", n: 5 });
t("le proprietaire libere sa reservation", r.ok && !R.vue(s2).reservations["5"]);
r = R.appliquer(s2, jZ, { op: "poserCarte", n: 5, pos: { x: 1000, y: 800 } });
var posee = s2.tableau.cartes.find(function (c) { return c.n === 5; });
t("glisser-deposer place la carte pres du point de depot", r.ok && posee && Math.abs(posee.x - (1000 - 80)) < 40 && Math.abs(posee.y - (800 - 75)) < 40);
t("carte posee : plus dans le pool", s2.pool.indexOf(5) < 0);
// Concurrence dure : deux prises simultanees, la seconde est refusee
R.appliquer(s2, jA, { op: "poolAjouter", n: 7 });
var r1 = R.appliquer(s2, jZ, { op: "poserCarte", n: 7, pos: { x: 500, y: 500 } });
var r2 = R.appliquer(s2, jA, { op: "poserCarte", n: 7, pos: { x: 900, y: 900 } });
t("prise concurrente : la seconde est refusee (hors_pool)", r1.ok && r2.refus && r2.refus.code === "hors_pool");

// Animateur : remettre une carte de la table vers le pool, ou vers la reserve
var s3 = R.creer("Ani", "GHIJKL").session;
var jA3 = "ja3"; s3.jetons[jA3] = { role: "animateur", id: "a1" };
R.appliquer(s3, jA3, { op: "poolAjouter", n: 10 });
R.appliquer(s3, jA3, { op: "poserCarte", n: 10, pos: { x: 800, y: 800 } });
R.appliquer(s3, jA3, { op: "poolAjouter", n: 11 });
R.appliquer(s3, jA3, { op: "poserCarte", n: 11, pos: { x: 1200, y: 800 } });
r = R.appliquer(s3, jA3, { op: "retirerCarte", n: 10, dest: "pool" });
t("carte de la table remise au pool", r.ok && s3.pool.indexOf(10) >= 0 && !s3.tableau.cartes.some(function (c) { return c.n === 10; }));
r = R.appliquer(s3, jA3, { op: "retirerCarte", n: 11 });
t("carte de la table remise en reserve (hors pool et hors table)", r.ok && s3.pool.indexOf(11) < 0 && !s3.tableau.cartes.some(function (c) { return c.n === 11; }));

// Remplir / vider le pool d'un geste (animateur)
var s4 = R.creer("Ani", "MNPQRT").session;
var jA4 = "ja4"; s4.jetons[jA4] = { role: "animateur", id: "a1" };
r = R.appliquer(s4, jA4, { op: "poolRemplir" });
t("remplir le pool : 8 cartes d'un coup", r.ok && s4.pool.length === 8 && s4.pool[0] === 1);
r = R.appliquer(s4, jA4, { op: "poolRemplir" });
t("remplir un pool deja plein n'ajoute rien", r.ok && s4.pool.length === 8);
R.appliquer(s4, jA4, { op: "poserCarte", n: 1, pos: { x: 400, y: 400 } });
r = R.appliquer(s4, jA4, { op: "poolRemplir" });
t("remplir complete sans reprendre une carte posee", r.ok && s4.pool.length === 8 && s4.pool.indexOf(1) < 0);
r = R.appliquer(s4, jA4, { op: "poolVider" });
t("vider le pool : plus aucune carte", r.ok && s4.pool.length === 0);
var pj4 = R.rejoindre(s4, "Lea");
r = R.appliquer(s4, pj4.jeton, { op: "poolVider" });
t("vider le pool est reserve a l'animateur", r.refus && r.refus.code === "droit_insuffisant");
r = R.appliquer(s4, jA4, { op: "poolRemplir", ns: [30, 31] });
t("remplir avec une liste explicite respecte l'ordre", r.ok && s4.pool.join(",") === "30,31");

// Lien de visioconference injecte a l'ouverture (atelier programme)
var sv = R.creer("Ani", "UVWXYZ", "https://visio.pauseia.fr/Salon").session;
t("le lien visio de l'atelier est repris dans la session", R.vue(sv).lienVocal === "https://visio.pauseia.fr/Salon");
var sv2 = R.creer("Ani", "UVWXY2", "http://pas-https").session;
t("un lien visio non https est ignore", R.vue(sv2).lienVocal === null);

// Homonymes : la seconde personne du meme prenom est refusee, avec la consigne
// d'ajouter une lettre de son nom de famille (plutot que « Antoine 1 / 2 »).
const sh = R.creer("Léa", "H0M0N1").session;
const hA = R.rejoindre(sh, "Antoine");
t("premier Antoine accepté", !!hA.jeton && sh.participants.length === 1);
const hB = R.rejoindre(sh, "Antoine");
t("second Antoine refusé", !!hB.refus && hB.refus.code === "prenom_pris");
t("le refus rappelle le prénom", hB.refus.prenom === "Antoine" && /nom de famille/.test(hB.refus.message));
t("aucune place créée pour le doublon", sh.participants.length === 1);
t("casse et accents ignorés", !!R.rejoindre(sh, "  ANTOÎNE ").refus);
t("prénom distinct accepté", !!R.rejoindre(sh, "Antoine D.").jeton);
t("prénom de l'animatrice pris aussi", !!R.rejoindre(sh, "léa").refus);
// Reprise : on revient toujours a sa place, meme avec son propre prenom.
const repr = R.rejoindre(sh, "Antoine", hA.jeton);
t("reprise avec son propre prénom acceptée", repr.jeton === hA.jeton && repr.id === hA.id);
t("reprise ne peut pas voler le prénom d'un autre", !!R.rejoindre(sh, "Antoine D.", hA.jeton).refus);
// Un prénom libéré par quelqu'un qui est parti ne bloque plus personne.
sh.participants.find((x) => x.id === hA.id).connecte = false;
t("prénom libéré après un départ", !!R.rejoindre(sh, "Antoine").jeton);

// Idempotence : renvoyer la meme action (echec reseau, reponse perdue) ne doit
// pas la jouer deux fois. Sans cela on obtenait DEUX fleches ou DEUX notes.
const si = R.creer("Lea", "IDEM01").session;
si.jetons["jA"] = { role: "animateur", id: "a1" };
R.appliquer(si, "jA", { op: "poolAjouter", n: 1 });
R.appliquer(si, "jA", { op: "poolAjouter", n: 2 });
R.appliquer(si, "jA", { op: "poserCarte", n: 1, pos: { x: 300, y: 300 } });
R.appliquer(si, "jA", { op: "poserCarte", n: 2, pos: { x: 900, y: 300 } });
const f1 = R.appliquer(si, "jA", { op: "creerFleche", de: 1, vers: 2, idem: "k1" });
const f2 = R.appliquer(si, "jA", { op: "creerFleche", de: 1, vers: 2, idem: "k1" });
t("une fleche renvoyee ne fait pas de doublon", si.tableau.fleches.length === 1);
t("le renvoi rend le meme identifiant", f2.resultat && f1.resultat && f2.resultat.id === f1.resultat.id);
const vAv = si.version;
R.appliquer(si, "jA", { op: "creerFleche", de: 1, vers: 2, idem: "k1" });
t("le renvoi ne fait pas avancer la version", si.version === vAv);
const n1 = R.appliquer(si, "jA", { op: "creerTexte", x: 100, y: 100, contenu: "salut", idem: "k2" });
R.appliquer(si, "jA", { op: "creerTexte", x: 100, y: 100, contenu: "salut", idem: "k2" });
t("une note renvoyee ne fait pas de doublon", si.tableau.textes.length === 1);
t("la note renvoyee garde son identifiant", n1.resultat && n1.resultat.id === si.tableau.textes[0].id);
// Une cle differente fait bien une nouvelle fleche.
R.appliquer(si, "jA", { op: "creerFleche", de: 2, vers: 1, idem: "k3" });
t("une cle differente cree bien une nouvelle fleche", si.tableau.fleches.length === 2);
// Sans cle, on ne bloque rien (compatibilite avec un client plus ancien).
R.appliquer(si, "jA", { op: "creerTexte", x: 200, y: 200, contenu: "bis" });
R.appliquer(si, "jA", { op: "creerTexte", x: 200, y: 200, contenu: "bis" });
t("sans cle, rien n'est bloque", si.tableau.textes.length === 3);
// La memoire des cles reste bornee.
for (let k = 0; k < 60; k++) R.appliquer(si, "jA", { op: "ping", x: 10, y: 10, idem: "p" + k });
t("la memoire des cles reste bornee", si.idem.l.length <= 40);

console.log((ko === 0 ? "✅" : "❌") + " Règles : " + ok + " réussis, " + ko + " échoués");
process.exit(ko === 0 ? 0 : 1);
