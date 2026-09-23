/* Alertes « prochains ateliers » : logique PURE (aucune I/O).
   La persistance (Netlify Blobs) et l'envoi sont branches par-dessus dans
   netlify/functions/alertes.js et alertes-envoi.js.

   LE PIEGE A EVITER, c'est de transformer ce service en liste de diffusion.
   Trois regles le tiennent a distance :
     1. un seul message par personne et par semaine, quoi qu'il arrive ;
     2. aucun message s'il n'y a rien qui la concerne -- pas de « rien cette
        semaine », qui est precisement ce qui fait se desabonner ;
     3. tous les ateliers qui la concernent dans le MEME message : plusieurs en
        ligne et plusieurs dans sa ville tiennent dans un seul envoi.
*/
"use strict";

var SEMAINE_MS = 7 * 24 * 60 * 60 * 1000;
var FORMATS = ["enligne", "physique", "les_deux"];
var MAX_MAIL = 120, MAX_ZONE = 80, MAX_ZONES = 8;
// Au-dela, annoncer un atelier n'a plus de sens : personne ne s'inscrit six
// mois a l'avance, et la liste deviendrait illisible.
var HORIZON_MS = 60 * 24 * 60 * 60 * 1000;

function tronque(v, n) { return String(v == null ? "" : v).slice(0, n).trim(); }

/* Normalisation des zones geographiques. On compare des villes et des
   departements saisis a la main : « Lyon », « lyon », « LYON  » et « Lyon 7e »
   doivent se rencontrer. On retire les accents, la casse et la ponctuation. */
function normaliser(v) {
  return tronque(v, MAX_ZONE)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mailValide(v) {
  var m = tronque(v, MAX_MAIL).toLowerCase();
  return m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) ? m : "";
}

/* --- Abonnement ---------------------------------------------------------- */
function validerAbonnement(corps, now) {
  corps = corps || {};
  var mail = mailValide(corps.mail);
  if (!mail) return { erreur: "Indiquez une adresse e-mail valide." };

  var format = FORMATS.indexOf(tronque(corps.format, 20)) === -1 ? "les_deux" : tronque(corps.format, 20);

  var zones = [];
  if (format !== "enligne") {
    var brutes = Array.isArray(corps.zones) ? corps.zones : String(corps.zones || "").split(",");
    brutes.forEach(function (z) {
      var n = normaliser(z);
      if (n && zones.indexOf(n) === -1 && zones.length < MAX_ZONES) zones.push(n);
    });
    /* Sans zone, un abonne au presentiel recevrait les ateliers de toute la
       France. C'est le plus sur chemin vers le desabonnement, donc on refuse
       plutot que d'accepter un abonnement qui ne tiendra pas. */
    if (!zones.length) {
      return { erreur: "Indiquez au moins une ville ou un département, pour ne recevoir que ce qui est près de chez vous." };
    }
  }

  return {
    abonne: {
      mail: mail,
      format: format,
      zones: zones,
      // Le jeton sert au desabonnement en un clic : il doit etre dans l'URL du
      // mail, donc long et imprevisible.
      jeton: tronque(corps.jeton, 40) || null,
      depuis: now,
      dernierEnvoi: 0,
      actif: true
    }
  };
}

/* --- Selection : qui recoit quoi ----------------------------------------- */

/* Un atelier est annoncable s'il est public, a venir, dans l'horizon, et pas
   deja complet. Annoncer un atelier complet n'apporte qu'une deception. */
function annoncable(a, now) {
  if (!a || a.visibilite === "prive") return false;
  var t = Number(a.quandMs);
  if (!isFinite(t) || t <= now || t > now + HORIZON_MS) return false;
  var inscrits = (a.participants || []).length;
  var max = Number(a.maxParticipants) || 0;
  if (max && inscrits >= max) return false;
  return true;
}

/* L'atelier `a` concerne-t-il l'abonne ? */
function concerne(abonne, a) {
  if (a.mode === "enligne") return abonne.format !== "physique";
  if (abonne.format === "enligne") return false;
  // Presentiel : on compare la zone de l'abonne au lieu et a l'adresse, dans
  // les deux sens -- « Lyon » doit rencontrer « MJC des Tilleuls, Lyon 7e »,
  // et « Rhone » doit rencontrer « Rhone ».
  var ou = normaliser((a.lieu || "") + " " + (a.adresse || ""));
  if (!ou) return false;
  return (abonne.zones || []).some(function (z) {
    return z && (ou.indexOf(z) !== -1 || z.indexOf(ou) !== -1);
  });
}

/* Ce qu'on envoie cette semaine. Rend un tableau { abonne, ateliers }, sans
   aucune entree vide : un abonne sans atelier ne recoit rien du tout. */
function envoisDeLaSemaine(abonnes, ateliers, now) {
  var ouverts = (ateliers || []).filter(function (a) { return annoncable(a, now); });
  var envois = [];
  (abonnes || []).forEach(function (ab) {
    if (!ab || !ab.actif) return;
    // Le plafond d'un message par semaine est absolu : il ne depend ni du
    // nombre d'ateliers ni de l'enthousiasme du moment.
    if (now - (ab.dernierEnvoi || 0) < SEMAINE_MS) return;
    var pour = ouverts.filter(function (a) { return concerne(ab, a); });
    if (!pour.length) return;
    // Par date : la personne lit d'abord ce qui arrive le plus tot.
    pour.sort(function (x, y) { return Number(x.quandMs) - Number(y.quandMs); });
    envois.push({ abonne: ab, ateliers: pour });
  });
  return envois;
}

/* Regroupement pour la mise en forme du message : les ateliers en ligne d'un
   cote, puis chaque ville de l'autre. Tout tient dans un seul envoi. */
function grouper(ateliers) {
  var enligne = [], villes = [], index = {};
  (ateliers || []).forEach(function (a) {
    if (a.mode === "enligne") { enligne.push(a); return; }
    var cle = normaliser(a.lieu) || "ailleurs";
    if (!index[cle]) { index[cle] = { ville: a.lieu || "", ateliers: [] }; villes.push(index[cle]); }
    index[cle].ateliers.push(a);
  });
  return { enligne: enligne, villes: villes };
}

module.exports = {
  SEMAINE_MS: SEMAINE_MS, FORMATS: FORMATS, HORIZON_MS: HORIZON_MS,
  normaliser: normaliser, mailValide: mailValide,
  validerAbonnement: validerAbonnement, annoncable: annoncable, concerne: concerne,
  envoisDeLaSemaine: envoisDeLaSemaine, grouper: grouper
};
