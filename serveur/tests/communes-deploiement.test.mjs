/* LES DONNEES DES COMMUNES SURVIVENT-ELLES AU DEPLOIEMENT ?

   CE QUE CE BANC PROTEGE. Les tables de communes ne sont pas `require`es,
   elles sont ouvertes avec `fs.readFileSync`. esbuild n'embarque que ce qui
   est `require` : les tables partaient donc en developpement et nulle part
   ailleurs, et tous les tests passaient quand meme, puisqu'ils tournent dans
   le depot, ou les fichiers sont la.

   Ce que ca donnait pour un visiteur : « Enregistrement impossible » au bout
   d'une seconde sur le premier abonnement « pres de chez moi », puis, le
   conteneur restant chaud, « Choisissez au moins une commune dans la liste »
   alors qu'une commune etait bien choisie. La saisie, elle, marchait : le
   navigateur lit communes.txt comme fichier statique servi par le CDN, pas
   par la fonction. Huit fonctions sur seize dependent de ces tables ; la
   programmation d'un atelier en presentiel et l'envoi hebdomadaire des
   alertes tombaient de la meme facon, en silence pour le second.

   On verifie donc trois choses qu'aucun autre test ne regarde :
   1. la declaration qui fait voyager les fichiers existe ;
   2. le module les retrouve dans la disposition DEPLOYEE, pas seulement
      dans celle du depot ;
   3. quand ils manquent vraiment, il le dit au lieu de pretendre que la
      France ne compte aucune commune. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const MODULE = path.join(RACINE, "serveur", "src", "communes.js");
const NOMS = path.join(RACINE, "site", "data", "communes.txt");
const COORDS = path.join(RACINE, "serveur", "src", "communes-coords.txt");

test("netlify.toml fait voyager les deux tables avec les fonctions", () => {
  const toml = fs.readFileSync(path.join(RACINE, "netlify.toml"), "utf8");
  const ligne = toml.split("\n").find((l) => l.includes("included_files"));
  assert.ok(ligne, "aucun `included_files` : les tables resteraient dans le depot");
  assert.match(ligne, /site\/data\/communes\.txt/);
  assert.match(ligne, /serveur\/src\/communes-coords\.txt/);
});

/* On ne bouchonne rien : on reconstruit la disposition que Netlify produit.
   esbuild replie tout le code en UN fichier pose a la racine du paquet, et
   `included_files` y recopie les fichiers en gardant leur chemin depuis la
   racine du depot. `__dirname` ne designe donc plus serveur/src, et le chemin
   relatif du depot (« ../../site/data ») sort du paquet. */
function paquetDeploye() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paquet-"));
  fs.mkdirSync(path.join(tmp, "site", "data"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "serveur", "src"), { recursive: true });
  fs.copyFileSync(MODULE, path.join(tmp, "communes.js"));   // le code, replie a la racine
  fs.copyFileSync(NOMS, path.join(tmp, "site", "data", "communes.txt"));
  fs.copyFileSync(COORDS, path.join(tmp, "serveur", "src", "communes-coords.txt"));
  return tmp;
}

test("le module retrouve les tables dans la disposition deployee", () => {
  const tmp = paquetDeploye();
  try {
    const sortie = execFileSync(process.execPath,
      ["-e", 'var C=require("./communes.js");console.log(JSON.stringify({n:C.nombre(),lyon:C.valide("69123"),nom:C.libelle("69123")}))'],
      { cwd: tmp, encoding: "utf8" });
    const r = JSON.parse(sortie);
    assert.ok(r.n > 30000, "table chargee mais vide ou tronquee : " + r.n);
    assert.equal(r.lyon, true);
    assert.match(r.nom, /Lyon/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("sans les tables, il le dit au lieu de nier toutes les communes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paquet-vide-"));
  try {
    fs.copyFileSync(MODULE, path.join(tmp, "communes.js"));
    let code = 0, texte = "";
    try {
      execFileSync(process.execPath, ["-e", 'require("./communes.js").valide("69123")'],
        { cwd: tmp, encoding: "utf8", stdio: "pipe" });
    } catch (e) { code = e.status; texte = String(e.stderr || ""); }
    assert.notEqual(code, 0, "le module aurait du echouer bruyamment");
    assert.match(texte, /Table des communes introuvable/);
    assert.match(texte, /included_files/, "le message doit dire comment reparer");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

/* LE DEFAUT LE PLUS SOURNOIS : une premiere lecture qui echoue laissait le
   module avec une table VIDE qu'il croyait chargee, pour toute la duree du
   conteneur. Toutes les communes devenaient alors invalides, et le visiteur
   se faisait reprocher de ne pas en avoir choisi une. */
test("un echec de lecture n'empoisonne pas le module pour la suite", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paquet-tardif-"));
  try {
    fs.copyFileSync(MODULE, path.join(tmp, "communes.js"));
    fs.mkdirSync(path.join(tmp, "site", "data"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "serveur", "src"), { recursive: true });
    const script = [
      'var C=require("./communes.js");',
      'var fs=require("fs");',
      'var premier=null;',
      'try { C.valide("69123"); } catch (e) { premier = e.code || "ERREUR"; }',
      // les fichiers arrivent APRES le premier essai rate
      'fs.copyFileSync(' + JSON.stringify(NOMS) + ', "site/data/communes.txt");',
      'fs.copyFileSync(' + JSON.stringify(COORDS) + ', "serveur/src/communes-coords.txt");',
      'console.log(JSON.stringify({ premier: premier, ensuite: C.valide("69123"), n: C.nombre() }));'
    ].join("");
    const r = JSON.parse(execFileSync(process.execPath, ["-e", script], { cwd: tmp, encoding: "utf8" }));
    assert.equal(r.premier, "COMMUNES_ABSENTES", "le premier essai devait echouer franchement");
    assert.equal(r.ensuite, true, "le module est reste bloque sur une table vide");
    assert.ok(r.n > 30000, "table rechargee mais vide : " + r.n);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
