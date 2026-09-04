// Tests des règles (pur, sans I/O). Lancement : node serveur/tests/regles.test.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../src/regles.js");

let ok = 0, ko = 0;
function t(nom, cond) { if (cond) { ok++; } else { ko++; console.error("  ✗ " + nom); } }

// Création
const c = R.creer("Léa", "H7KQ2M");
const s = c.session;
s.jetons[c.jeton] = { role: "animateur", id: c.idAnim };
t("code posé", s.code === "H7KQ2M");
t("pioche 38, carte 0 absente", s.pioche.length === 38 && s.pioche[0] === 1 && !s.pioche.includes(0));
t("animateur sans main", s.animateur.carteEnMain === undefined);

// Rejoindre 2 participants
const j1 = R.rejoindre(s, "Ana");
const j2 = R.rejoindre(s, "Bo");
t("2 participants", s.participants.length === 2);
t("jetons distincts", j1.jeton && j2.jeton && j1.jeton !== j2.jeton);

// Distribution dans l'ordre
let r = R.appliquer(s, c.jeton, { op: "distribuer" });
t("distribue à Ana", r.ok && r.resultat.prenom === "Ana" && r.resultat.carte === 1);
r = R.appliquer(s, c.jeton, { op: "distribuer" });
t("distribue à Bo (2e)", r.ok && r.resultat.prenom === "Bo" && r.resultat.carte === 2);

// Refus si main pleine (retour à Ana qui tient déjà)
r = R.appliquer(s, c.jeton, { op: "distribuer" });
t("refus main pleine", r.refus && r.refus.code === "main_pleine");

// passerAuSuivant débloque
r = R.appliquer(s, c.jeton, { op: "passerAuSuivant" });
t("passer au suivant ok", r.ok);

// Participant ne peut pas distribuer
r = R.appliquer(s, j1.jeton, { op: "distribuer" });
t("participant refusé distribuer", r.refus && r.refus.code === "droit_insuffisant");

// Poser une carte
const ana = s.participants[0];
r = R.appliquer(s, j1.jeton, { op: "poser", n: ana.carteEnMain, rect: { x: 1400, y: 1000, largeur: 800, hauteur: 600 } });
t("Ana pose sa carte", r.ok && s.tableau.cartes.length === 1 && ana.carteEnMain === null);

// Deuxième pose (Bo) puis flèche entre les deux
const bo = s.participants[1];
R.appliquer(s, j2.jeton, { op: "poser", n: bo.carteEnMain, rect: { x: 1600, y: 1200, largeur: 800, hauteur: 600 } });
t("2 cartes posées", s.tableau.cartes.length === 2);
const deux = s.tableau.cartes.map(x => x.n);
r = R.appliquer(s, j1.jeton, { op: "creerFleche", de: deux[0], vers: deux[1], bidir: false });
t("flèche créée", r.ok && s.tableau.fleches.length === 1);
r = R.appliquer(s, j1.jeton, { op: "creerFleche", de: deux[0], vers: 99 });
t("flèche vers carte absente refusée", r.refus);
const fid = s.tableau.fleches[0].id;
r = R.appliquer(s, j1.jeton, { op: "bidirFleche", id: fid });
t("flèche passée en double sens", r.ok && s.tableau.fleches[0].bidir === true);
r = R.appliquer(s, j1.jeton, { op: "bidirFleche", id: fid });
t("flèche re-basculée en sens unique", r.ok && s.tableau.fleches[0].bidir === false);

// Texte : créer puis vider => disparaît
r = R.appliquer(s, j1.jeton, { op: "creerTexte", x: 500, y: 500, contenu: "alimente" });
const tid = r.resultat.id;
t("texte créé", s.tableau.textes.length === 1);
R.appliquer(s, j1.jeton, { op: "modifierTexte", id: tid, contenu: "   " });
t("texte vidé disparaît", s.tableau.textes.length === 0);

// Retirer une carte (animateur) supprime ses flèches
r = R.appliquer(s, c.jeton, { op: "retirerCarte", n: deux[0] });
t("carte retirée + flèches en cascade", s.tableau.cartes.length === 1 && s.tableau.fleches.length === 0);

// Limite 8 participants
for (let i = 0; i < 6; i++) R.rejoindre(s, "P" + i);
const trop = R.rejoindre(s, "Neuvième");
t("9e refusé", trop.refus && trop.refus.code === "session_pleine");

// Reprise via jeton même quand plein
const reprise = R.rejoindre(s, "Ana", j1.jeton);
t("reprise via jeton acceptée même plein", reprise.role === "participant" && reprise.jeton === j1.jeton);

// Distribuer à tous ne sert que les mains libres
const avant = s.pioche.length;
r = R.appliquer(s, c.jeton, { op: "distribuerATous" });
t("distribuer à chacun ok", r.ok && r.resultat.servis >= 1);
t("pioche décroît", s.pioche.length < avant);

// Lien vocal doit être https
r = R.appliquer(s, c.jeton, { op: "definirLienVocal", url: "http://mauvais" });
t("lien vocal http refusé", r.refus);
r = R.appliquer(s, c.jeton, { op: "definirLienVocal", url: "https://meet.example/x" });
t("lien vocal https ok", r.ok && s.lienVocal === "https://meet.example/x");

// Version incrémentée
t("version a augmenté", s.version > 1);

console.log((ko === 0 ? "✅" : "❌") + " Règles : " + ok + " réussis, " + ko + " échoués");
process.exit(ko === 0 ? 0 : 1);
