/* AGENDA PUBLIC DES ATELIERS. Lecture seule, sans authentification.

   GET /api/ateliers.json   -> { genere, source, ateliers: [...] }
   GET /ateliers.ics        -> calendrier iCalendar, a abonner depuis un agenda

   Pourquoi une adresse a part plutot que l'endpoint existant : celui de la page
   « Participer » est un POST avec un `op`, sans en-tete de partage entre
   origines, et il expose le `quandMs` ENREGISTRE, qui peut dater d'avant un
   changement d'heure. Publier une heure fausse dans l'agenda de quelqu'un
   d'autre est pire que ne rien publier : ici l'instant est recalcule.

   Les donnees sont celles que la page « Participer » montre deja publiquement.
   AUCUN atelier prive, AUCUNE adresse e-mail : voir serveur/src/agenda.js, ou
   le filtre est teste.

   Regles pures : serveur/src/agenda.js. Stockage : Netlify Blobs, meme magasin
   que la fonction ateliers. */
"use strict";
const { getStore, connectLambda } = require("@netlify/blobs");
const G = require("../../serveur/src/agenda.js");

const BASE = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");

function store() { return getStore({ name: "fresque-ateliers" }); }

/* Partage entre origines : ces donnees sont deja publiques sur le site, et
   l'interet meme de cette adresse est qu'un autre projet la lise. On autorise
   donc toutes les origines, en lecture seule. */
const ENTETES = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  // Cinq minutes : un atelier ajoute apparait vite, sans pour autant qu'un
  // agenda qui interroge souvent nous rappelle a chaque fois.
  "Cache-Control": "public, max-age=300"
};

async function lireAteliers() {
  const st = store();
  const { blobs } = await st.list({ prefix: "atelier:" }).catch(() => ({ blobs: [] }));
  const out = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" }).catch(() => null);
    if (v) out.push(v);
  }
  return out;
}

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: ENTETES, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: ENTETES, body: JSON.stringify({ erreur: "Méthode non autorisée." }) };
  }

  const q = event.queryStringParameters || {};
  const chemin = String(event.path || "");
  const ical = q.format === "ics" || /\.ics$/.test(chemin);
  const now = Date.now();

  let ateliers = [];
  try { ateliers = await lireAteliers(); }
  catch (e) {
    return { statusCode: 503, headers: ENTETES, body: JSON.stringify({ erreur: "Agenda indisponible." }) };
  }

  if (ical) {
    return {
      statusCode: 200,
      headers: Object.assign({}, ENTETES, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="ateliers-fresque-des-risques-de-l-ia.ics"'
      }),
      body: G.agendaIcal(ateliers, now, BASE)
    };
  }
  return {
    statusCode: 200,
    headers: Object.assign({}, ENTETES, { "Content-Type": "application/json; charset=utf-8" }),
    body: JSON.stringify(G.agendaJson(ateliers, now, BASE), null, 2)
  };
};
