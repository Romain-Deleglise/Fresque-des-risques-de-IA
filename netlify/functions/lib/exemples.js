/* DONNEES D'EXEMPLE POUR L'APERCU DES COURRIELS (logique pure, aucune I/O).

   POURQUOI. Verifier un courriel demandait de provoquer l'evenement qui
   l'envoie : creer un atelier, s'y inscrire, attendre le mardi matin. On
   relisait donc rarement ce qui part, et une mise en forme cassee pouvait
   vivre des semaines. L'apercu rend chaque courriel visible en un clic, et il
   le fait en appelant LES VRAIS CONSTRUCTEURS, avec ces donnees-ci : ce qui
   s'affiche est ce qui part, pas une copie qui finirait par mentir.

   Rien ici n'est reel : ni l'atelier, ni les adresses, qui pointent toutes
   vers le domaine reserve a cet usage (RFC 2606).
*/
"use strict";

// Dans deux semaines, a l'heure ou se tiennent la plupart des ateliers : une
// date figee donnerait un apercu qui vieillit (« atelier du 3 mars 2025 »).
function dansDeuxSemaines() {
  var d = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function atelier(extra) {
  var a = {
    code: "DEMO42",
    date: dansDeuxSemaines(),
    heure: "18:30",
    mode: "presentiel",
    lieu: "Maison des associations, 12 rue de l'Exemple, 35000 Rennes",
    ville: "Rennes",
    visio: "",
    maxParticipants: 12,
    animateur: { prenom: "Camille", mail: "camille@example.org" },
    participants: [
      { prenom: "Alex", mail: "alex@example.org" },
      { prenom: "Sofia", mail: "sofia@example.org" },
      { prenom: "Tao", mail: "tao@example.org" }
    ]
  };
  return Object.assign(a, extra || {});
}

function atelierEnLigne() {
  return atelier({ mode: "enligne", lieu: "", ville: "",
    visio: "https://meet.example.org/fresque-demo" });
}

// L'atelier avant un deplacement : sert aux courriels « atelier deplace ».
function ancienAtelier() {
  var d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return atelier({ date: d.toISOString().slice(0, 10), heure: "14:00" });
}

function abonne(extra) {
  return Object.assign({
    mail: "abonne@example.org",
    jeton: "jeton-d-exemple",
    modes: ["enligne", "presentiel"],
    rayonKm: 50,
    communes: [{ nom: "Rennes", code: "35238" }],
    confirme: true
  }, extra || {});
}

/* Deux ateliers a annoncer : un en ligne, un pres de chez soi, pour que
   l'apercu de l'annonce hebdomadaire montre ses deux sections. */
function ateliersAnnonces() {
  var a1 = atelierEnLigne(), a2 = atelier();
  return [a1, a2];
}

module.exports = { atelier: atelier, atelierEnLigne: atelierEnLigne,
  ancienAtelier: ancienAtelier, abonne: abonne, ateliersAnnonces: ateliersAnnonces };
