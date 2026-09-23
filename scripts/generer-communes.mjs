/* Génère la liste fermée des communes françaises.
   À relancer quand le découpage administratif change (fusions de communes) :
     node scripts/generer-communes.mjs
   Nécessite un accès réseau ; les fichiers produits sont versionnés pour que
   ni le site ni les tests n'aient besoin du réseau.

   Deux sorties, volontairement séparées :
     - site/data/communes.txt      « code;nom;cp;rayon », chargé par le
                                   navigateur au moment où quelqu'un cherche sa
                                   commune ; `rayon` est le rayon PROPOSÉ par
                                   défaut (voir plus bas) ;
     - serveur/src/communes-coords.txt  « code;lat;lon », JAMAIS envoyé au
                                   navigateur : seul le serveur calcule les
                                   distances, et 700 Ko de coordonnées n'ont
                                   rien à faire dans une page.

   Sources :
     - noms, codes INSEE, départements, population : @etalab/decoupage-administratif
       (le Code officiel géographique de l'INSEE, la référence) ;
     - coordonnées : base des codes postaux (La Poste), jointe par code INSEE.
       Elle ne sert QU'À ÇA : ses noms sont en capitales sans accents. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = "https://registry.npmjs.org/@etalab/decoupage-administratif";
const GPS = "https://raw.githubusercontent.com/high54/Communes-France-JSON/master/france.json";

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " : HTTP " + r.status);
  return r.json();
}

async function communesEtalab() {
  const meta = await json(NPM);
  const v = meta["dist-tags"].latest;
  const r = await fetch(meta.versions[v].dist.tarball);
  const tgz = Buffer.from(await r.arrayBuffer());
  const tar = zlib.gunzipSync(tgz);
  // Lecture tar minimale : on ne cherche qu'un seul fichier.
  for (let o = 0; o + 512 <= tar.length;) {
    const nom = tar.toString("utf8", o, o + 100).replace(/\0.*$/, "");
    const taille = parseInt(tar.toString("utf8", o + 124, o + 136).replace(/\0.*$/, "").trim(), 8) || 0;
    const debut = o + 512;
    if (nom === "package/data/communes.json") return JSON.parse(tar.toString("utf8", debut, debut + taille));
    o = debut + Math.ceil(taille / 512) * 512;
  }
  throw new Error("communes.json introuvable dans l'archive npm");
}

/* Paris, Lyon et Marseille sont UNE commune pour l'INSEE, mais la base postale
   ne connaît que leurs arrondissements (75101…, 69381…, 13201…). Sans ce
   rattachement, les trois plus grandes villes de France n'ont pas de position :
   on prend le centre de leurs arrondissements. */
function communeMere(code) {
  if (/^751\d\d$/.test(code)) return "75056";
  if (/^693(8[1-9])$/.test(code)) return "69123";
  if (/^132(0[1-9]|1[0-6])$/.test(code)) return "13055";
  return null;
}

function coordonnees(brut) {
  const m = new Map();
  const meres = new Map();
  for (const l of brut) {
    const g = String(l.coordonnees_gps || "").split(",");
    if (g.length !== 2) continue;
    const lat = Number(g[0]), lon = Number(g[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    // Les codes arrivent en nombre : « 1001 » doit redevenir « 01001 ».
    const code = String(l.Code_commune_INSEE).padStart(5, "0").toUpperCase();
    if (!m.has(code)) m.set(code, [lat, lon]);
    const mere = communeMere(code);
    if (mere) {
      if (!meres.has(mere)) meres.set(mere, []);
      meres.get(mere).push([lat, lon]);
    }
  }
  for (const [code, pts] of meres) {
    m.set(code, [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length
    ]);
  }
  return m;
}

const [etalab, gps] = await Promise.all([communesEtalab(), json(GPS)]);
const coords = coordonnees(gps);

const gardees = etalab.filter((c) => c.type === "commune-actuelle" && c.zone !== "com");
gardees.sort((a, b) => (b.population || 0) - (a.population || 0));

/* Repli quand une commune n'a pas de coordonnées : le centre des communes du
   même département. Mieux vaut une position approchée qu'une commune absente
   de la liste, qui serait inchoisissable. */
const parDep = new Map();
for (const c of gardees) {
  const p = coords.get(c.code);
  if (!p) continue;
  if (!parDep.has(c.departement)) parDep.set(c.departement, []);
  parDep.get(c.departement).push(p);
}
const centreDep = new Map();
for (const [dep, pts] of parDep) {
  centreDep.set(dep, [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length
  ]);
}

/* RAYON PROPOSÉ PAR DÉFAUT, commune par commune.

   Un rayon fixe ne peut pas marcher : 50 km autour de Paris, c'est toute
   l'Île-de-France et douze millions d'habitants ; 50 km en Lozère, c'est deux
   bourgs. On cherche donc, pour chaque commune, le plus PETIT rayon proposé qui
   met environ 800 000 personnes à portée. Le seuil est volontairement
   généreux : au démarrage il y aura peu d'ateliers, et mieux vaut proposer un
   peu trop large que laisser quelqu'un ne rien recevoir pendant six mois. Il
   reste assez serré pour ne pas noyer un Parisien sous les ateliers de Melun.
   La personne garde la main : ce n'est qu'une valeur pré-remplie. */
const RAYONS = [15, 30, 50, 100];
const BASSIN = 800000;

function rayonsProposes(liste, position) {
  // Grille de 1° : sans elle, il faudrait comparer 34 875 communes deux à deux.
  const grille = new Map();
  const cle = (la, lo) => Math.round(la) + "/" + Math.round(lo);
  for (const c of liste) {
    const p = position.get(c.code);
    if (!p) continue;
    const k = cle(p[0], p[1]);
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push({ p, pop: c.population || 0 });
  }
  const R = 6371, rad = Math.PI / 180;
  const dist = (a, b) => {
    const dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const out = new Map();
  for (const c of liste) {
    const p = position.get(c.code);
    if (!p) { out.set(c.code, 50); continue; }
    const cumul = RAYONS.map(() => 0);
    for (let dla = -2; dla <= 2; dla++) {
      for (let dlo = -2; dlo <= 2; dlo++) {
        const seau = grille.get(cle(p[0] + dla, p[1] + dlo));
        if (!seau) continue;
        for (const v of seau) {
          const d = dist(p, v.p);
          for (let i = 0; i < RAYONS.length; i++) if (d <= RAYONS[i]) cumul[i] += v.pop;
        }
      }
    }
    let choisi = RAYONS[RAYONS.length - 1];
    for (let i = 0; i < RAYONS.length; i++) if (cumul[i] >= BASSIN) { choisi = RAYONS[i]; break; }
    out.set(c.code, choisi);
  }
  return out;
}

const positionFinale = new Map();
for (const c of gardees) {
  const p = coords.get(c.code) || centreDep.get(c.departement);
  if (p) positionFinale.set(c.code, p);
}
const rayons = rayonsProposes(gardees, positionFinale);

const lignes = [], lignesGps = [];
let sansGps = 0;
for (const c of gardees) {
  const cp = (c.codesPostaux || [])[0] || "";
  const nom = c.nom.replace(/[;\n]/g, " ");
  lignes.push(c.code + ";" + nom + ";" + cp + ";" + (rayons.get(c.code) || 50));
  let p = coords.get(c.code);
  if (!p) { p = centreDep.get(c.departement); sansGps++; }
  if (!p) continue;
  lignesGps.push(c.code + ";" + p[0].toFixed(4) + ";" + p[1].toFixed(4));
}

fs.mkdirSync(path.join(RACINE, "site/data"), { recursive: true });
fs.writeFileSync(path.join(RACINE, "site/data/communes.txt"), lignes.join("\n") + "\n");
fs.writeFileSync(path.join(RACINE, "serveur/src/communes-coords.txt"), lignesGps.join("\n") + "\n");
const repartition = {};
for (const r of rayons.values()) repartition[r] = (repartition[r] || 0) + 1;
console.log(gardees.length + " communes, " + lignesGps.length + " avec position (" + sansGps + " repliées sur le centre du département).");
console.log("rayons proposés :", repartition);
