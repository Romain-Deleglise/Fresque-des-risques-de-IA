/* Espace d'administration (Netlify Function), protege par une cle secrete.

   Donne acces au registre durable des contacts (animateur·ices, participant·es)
   pour le suivi et des statistiques, et permet la desinscription / l'effacement
   d'un contact (droits RGPD).

   Authentification : variable d'environnement ADMIN_TOKEN (a definir dans
   Netlify). Sans elle, l'espace est desactive. La cle est fournie par la page
   admin dans l'en-tete "x-cle" (POST) ou le parametre ?cle= (GET). Comparaison
   a temps constant.

   GET  ?action=tableau            -> { stats, contacts }
   GET  ?action=export             -> CSV des contacts (piece a telecharger)
   POST { op:"desinscrire", mail } -> marque le contact desinscrit
   POST { op:"supprimer",   mail } -> efface le contact
*/
"use strict";
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const C = require("./lib/contacts.js");

function contacts() { return getStore({ name: "fresque-contacts" }); }
const json = (s, c) => ({ statusCode: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(c) });

function egales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch (e) { return false; }
}
function autorise(event) {
  const attendu = process.env.ADMIN_TOKEN || "";
  if (!attendu) return { code: 503, msg: "Espace admin non configuré (ADMIN_TOKEN manquant côté serveur)." };
  const q = event.queryStringParameters || {};
  const hd = event.headers || {};
  const fourni = hd["x-cle"] || q.cle || "";
  if (!fourni || !egales(fourni, attendu)) return { code: 401, msg: "Clé invalide." };
  return { ok: true };
}

// Agrege les statistiques a partir du registre des contacts (source durable).
function statistiques(liste) {
  const codes = new Set();
  const codesEnligne = new Set(), codesPhysique = new Set();
  const parMois = {};              // "AAAA-MM" -> Set de codes d'ateliers
  let animateurs = 0, participants = 0, desinscrits = 0;

  for (const c of liste) {
    if (c.animateur) animateurs++;
    if (c.participant) participants++;
    if (c.desinscrit) desinscrits++;
    for (const p of (c.ateliers || [])) {
      if (!p.code) continue;
      codes.add(p.code);
      if (p.mode === "enligne") codesEnligne.add(p.code);
      else if (p.mode === "physique") codesPhysique.add(p.code);
      if (isFinite(p.quandMs)) {
        const d = new Date(p.quandMs);
        const mk = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        (parMois[mk] = parMois[mk] || new Set()).add(p.code);
      }
    }
  }
  // Timeline : 12 derniers mois, nombre d'ateliers distincts par mois.
  const mois = [];
  const maintenant = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const mk = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    mois.push({ mois: mk, ateliers: parMois[mk] ? parMois[mk].size : 0 });
  }
  return {
    contacts: liste.length,
    animateurs: animateurs,
    participants: participants,
    desinscrits: desinscrits,
    ateliers: codes.size,
    ateliersEnligne: codesEnligne.size,
    ateliersPhysique: codesPhysique.size,
    parMois: mois
  };
}

function versionPublique(c) {
  return {
    mail: c.mail, prenom: c.prenom || "",
    animateur: !!c.animateur, participant: !!c.participant,
    nbAnimations: c.nbAnimations || 0, nbParticipations: c.nbParticipations || 0,
    premierMs: c.premierMs || 0, dernierMs: c.dernierMs || 0,
    desinscrit: !!c.desinscrit
  };
}

function csv(liste) {
  const esc = function (v) { const s = String(v == null ? "" : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const iso = function (ms) { return isFinite(ms) && ms ? new Date(ms).toISOString().slice(0, 10) : ""; };
  const lignes = [["prenom", "email", "animateur", "participant", "nb_animations", "nb_participations", "premier_contact", "dernier_contact", "desinscrit"].join(";")];
  for (const c of liste) {
    lignes.push([
      esc(c.prenom || ""), esc(c.mail), c.animateur ? "oui" : "non", c.participant ? "oui" : "non",
      c.nbAnimations || 0, c.nbParticipations || 0, iso(c.premierMs), iso(c.dernierMs), c.desinscrit ? "oui" : "non"
    ].join(";"));
  }
  return "﻿" + lignes.join("\r\n"); // BOM pour Excel
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) {}
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };

  const a = autorise(event);
  if (!a.ok) return json(a.code, { erreur: a.msg });

  const st = contacts();

  try {
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      const liste = await C.lister(st);
      if (q.action === "export") {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="contacts-fresque.csv"',
            "Cache-Control": "no-store"
          },
          body: csv(liste)
        };
      }
      return json(200, { stats: statistiques(liste), contacts: liste.map(versionPublique) });
    }

    if (event.httpMethod === "POST") {
      let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
      const m = C.normaliserMail(d.mail);
      if (!m) return json(400, { erreur: "Adresse manquante." });
      if (d.op === "desinscrire") { const ok = await C.desinscrire(st, m); return json(ok ? 200 : 404, { desinscrit: ok }); }
      if (d.op === "supprimer") { const ok = await C.supprimer(st, m); return json(200, { supprime: ok }); }
      return json(400, { erreur: "Opération inconnue." });
    }

    return json(405, { erreur: "Méthode non autorisée." });
  } catch (e) {
    return json(500, { erreur: "Erreur du service admin.", details: String(e && e.message || e) });
  }
};
