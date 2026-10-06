/* BROUILLONS DE CARTES : logique PURE (aucune I/O).

   POURQUOI DES BROUILLONS, et pas une ecriture directe. On lit les retours sur
   une carte, on corrige, on passe a la suivante. Publier a chaque correction
   ferait autant de versions de cartes.json qu'il y a de virgules deplacees, et
   chacune devrait etre relue. On accumule donc les corrections, on les relit
   ensemble, on publie une fois.

   CE MODULE NE SAIT PAS OU ILS SONT RANGES. La persistance (Netlify Blobs) et
   l'authentification vivent dans netlify/functions/brouillons.js ; ici il n'y a
   que les regles, qui sont donc testables sans reseau ni magasin.
*/
"use strict";

var MAX_TITRE = 120, MAX_PARA = 2000, MAX_PARAS = 12;
var CARTE_MIN = 0, CARTE_MAX = 38;
/* Les champs qu'un brouillon peut porter. Tout le reste de la carte (numero,
   lot, image, cadrage) ne se corrige pas en lisant un retour : cela releve de
   la mise en page ou de la renumerotation, pas du texte. */
var CHAMPS = ["titre", "verso", "explication"];

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

function numeroDeCarte(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = typeof v === "number" ? v : parseInt(String(v), 10);
  return (isFinite(n) && n >= CARTE_MIN && n <= CARTE_MAX) ? n : null;
}

/* Une liste de paragraphes : on jette les lignes vides plutot que de les
   refuser, parce qu'un champ de saisie en produit toujours. */
function paragraphes(v) {
  var brut = Array.isArray(v) ? v : String(v == null ? "" : v).split(/\n{2,}|\r?\n/);
  var out = [];
  brut.forEach(function (p) {
    var t = tronque(p, MAX_PARA);
    if (t && out.length < MAX_PARAS) out.push(t);
  });
  return out;
}

/* Valide une proposition de correction. Rend { erreur } ou { brouillon }.

   UN BROUILLON NE PORTE QUE CE QUI CHANGE. Enregistrer les trois champs a
   chaque fois ecraserait le texte d'origine d'une carte dont on n'a touche que
   le titre, et on ne saurait plus, en relisant, ce qui a ete corrige. */
function valider(corps, carteOrigine, now) {
  corps = corps || {};
  var n = numeroDeCarte(corps.n);
  if (n === null) return { erreur: "Carte inconnue." };
  if (!carteOrigine) return { erreur: "Cette carte n'existe pas." };

  var brouillon = { n: n, quand: now, par: tronque(corps.par, 40) };
  /* REVENIR AU TEXTE D'ORIGINE, C'EST ANNULER SA CORRECTION. Un champ reecrit
     a l'identique de la source n'est pas « rien » : c'est le retrait d'une
     correction posee plus tot, et le brouillon doit l'oublier. Sans cela on ne
     pourrait jamais defaire une correction sans effacer tout le brouillon. */
  var retires = [], propose = 0;

  if (corps.titre !== undefined) {
    propose++;
    var titre = tronque(corps.titre, MAX_TITRE);
    if (!titre) return { erreur: "Le titre ne peut pas être vide." };
    if (titre !== carteOrigine.titre) brouillon.titre = titre; else retires.push("titre");
  }
  if (corps.verso !== undefined) {
    propose++;
    var verso = paragraphes(corps.verso);
    if (!verso.length) return { erreur: "Le verso ne peut pas être vide." };
    if (verso.join("\n") !== (carteOrigine.verso || []).join("\n")) brouillon.verso = verso;
    else retires.push("verso");
  }
  if (corps.explication !== undefined) {
    propose++;
    var expl = paragraphes(corps.explication);
    // Les explications, elles, PEUVENT etre vidées : elles sont facultatives.
    if (expl.join("\n") !== (carteOrigine.explication || []).join("\n")) brouillon.explication = expl;
    else retires.push("explication");
  }
  if (!propose) return { erreur: "Rien n'a été proposé." };
  return { brouillon: brouillon, retires: retires };
}

/* Applique les brouillons sur les cartes et rend le fichier complet, pret a
   etre relu puis depose. On ne touche a rien d'autre : l'ordre des cartes, les
   images et les champs de mise en page sont conserves tels quels. */
/* Le brouillon tel qu'il reste apres une proposition : on ajoute ce qui change,
   on retire ce qui revient a l'original. Rend null quand il ne reste rien, ce
   qui veut dire « ce brouillon n'a plus lieu d'etre ». */
function fusionner(avant, v) {
  var out = Object.assign({}, avant || {}, v.brouillon);
  (v.retires || []).forEach(function (champ) { delete out[champ]; });
  var reste = CHAMPS.some(function (champ) { return out[champ] !== undefined; });
  return reste ? out : null;
}

function appliquer(fichier, brouillons) {
  var parN = {};
  (brouillons || []).forEach(function (b) { if (b && b.n != null) parN[b.n] = b; });
  var cartes = (fichier.cartes || []).map(function (c) {
    var b = parN[c.n];
    if (!b) return c;
    var sortie = Object.assign({}, c);
    CHAMPS.forEach(function (champ) {
      if (b[champ] === undefined) return;
      // Une explication vidée disparait du fichier, elle ne devient pas [].
      if (champ === "explication" && (!b[champ] || !b[champ].length)) delete sortie[champ];
      else sortie[champ] = b[champ];
    });
    return sortie;
  });
  return Object.assign({}, fichier, { cartes: cartes });
}

/* CE QUI DIFFERE ENCORE DU FICHIER SOURCE, dans un calque deja publie.

   Publier ne passe plus par le depot : les corrections sont rangees dans un
   calque que le site lit par-dessus cartes.json, et elles sont en ligne tout de
   suite. Mais le depot finit par les recevoir (il le faut : c'est lui qui
   fabrique le jeu imprime). Le jour ou il les porte, le calque dit exactement
   la meme chose que la source : il ne doit plus rien ajouter.

   On ne demande a personne de faire ce menage. A chaque lecture, un champ egal
   a la source disparait, et une carte qui n'a plus de champ disparait avec lui.
   Le calque se vide donc tout seul au deploiement qui le rattrape. */
function residu(publies, cartes) {
  var parN = {};
  (cartes || []).forEach(function (c) { parN[c.n] = c; });
  var out = [];
  (publies || []).forEach(function (b) {
    if (!b || b.n == null) return;
    var source = parN[b.n];
    if (!source) return;          // la carte n'existe plus : le calque non plus
    var garde = { n: b.n, quand: b.quand, par: b.par };
    var reste = false;
    CHAMPS.forEach(function (champ) {
      if (b[champ] === undefined) return;
      var a = b[champ], o = source[champ];
      var pareil = Array.isArray(a)
        ? a.join("\n") === (o || []).join("\n")
        : String(a) === String(o == null ? "" : o);
      if (!pareil) { garde[champ] = a; reste = true; }
    });
    if (reste) out.push(garde);
  });
  return out;
}

/* Ce qui a change, carte par carte, pour la relecture avant publication. */
function resume(brouillons, cartes) {
  var parN = {};
  (cartes || []).forEach(function (c) { parN[c.n] = c; });
  return (brouillons || []).map(function (b) {
    var c = parN[b.n] || {};
    return {
      n: b.n,
      titre: c.titre || "",
      champs: CHAMPS.filter(function (champ) { return b[champ] !== undefined; }),
      quand: b.quand,
      par: b.par || ""
    };
  }).sort(function (x, y) { return x.n - y.n; });
}

module.exports = {
  CHAMPS: CHAMPS, MAX_TITRE: MAX_TITRE, MAX_PARA: MAX_PARA, MAX_PARAS: MAX_PARAS,
  numeroDeCarte: numeroDeCarte, paragraphes: paragraphes,
  valider: valider, fusionner: fusionner, appliquer: appliquer, resume: resume,
  residu: residu
};
