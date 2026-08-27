/* Garde-fous : logique PURE de limitation de débit à fenêtre fixe (B9).
   Aucune dépendance : la persistance (Netlify Blobs) est branchée par-dessus
   dans netlify/functions/fresque.js. On teste ici la décision, pas le stockage.

   Un « compteur » est un objet { debut:number(ms), n:number } ou null/undefined.
*/

// Seuils partagés (repris tels quels par la fonction serverless et par les tests).
const SEUILS = {
  creation:     { limite: 10, fenetreMs: 60 * 60 * 1000 }, // sessions créées / IP / heure
  entree:       { limite: 60, fenetreMs: 60 * 1000 },      // tentatives pour rejoindre / IP / min
  codes:        { limite: 20, fenetreMs: 60 * 1000 },      // codes inconnus / IP / min
};

// Renvoie le compteur courant, réinitialisé si la fenêtre est écoulée.
function fenetreCourante(compteur, now, fenetreMs) {
  if (!compteur || (now - compteur.debut) > fenetreMs) return { debut: now, n: 0 };
  return { debut: compteur.debut, n: compteur.n };
}

// La limite est-elle déjà atteinte pour la fenêtre courante ? (ne modifie rien)
function atteinte(compteur, now, limite, fenetreMs) {
  const c = fenetreCourante(compteur, now, fenetreMs);
  return c.n >= limite;
}

// Compteur après une tentative supplémentaire.
function incrementer(compteur, now, fenetreMs) {
  const c = fenetreCourante(compteur, now, fenetreMs);
  return { debut: c.debut, n: c.n + 1 };
}

module.exports = { SEUILS, fenetreCourante, atteinte, incrementer };
