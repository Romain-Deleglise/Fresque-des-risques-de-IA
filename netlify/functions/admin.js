/* Espace d'administration (Netlify Function), protege par une cle secrete.

   Donne acces au registre durable des contacts (animateur·ices, participant·es)
   pour le suivi et des statistiques, et permet la desinscription / l'effacement
   d'un contact (droits RGPD).

   Authentification : variable d'environnement ADMIN_TOKEN (a definir dans
   Netlify). Sans elle, l'espace est desactive. La cle est fournie par la page
   admin dans l'en-tete "x-cle" (POST) ou le parametre ?cle= (GET). Comparaison
   a temps constant.

   GET  ?action=tableau            -> { stats, contacts }
   GET  ?action=retours            -> { retours } (retours d'atelier + temoignages)
   GET  ?action=export             -> CSV des contacts (piece a telecharger)
    GET  ?action=alertes            -> { total, formats, zones } (abonnes aux annonces)
   GET  ?action=ateliers           -> { ateliers, inactifs } (programmation + relances)
   POST { op:"atelier", sousOp:"annuler", code } -> annule et previent tout le monde
   POST { op:"relancer", mail }    -> e-mail de relance a un·e animateur·ice
   POST { op:"desinscrire", mail } -> marque le contact desinscrit
   POST { op:"supprimer",   mail } -> efface le contact
   POST { op:"retour", sousOp, cle } -> publier / masquer / traiter / effacer
*/
"use strict";
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const Com = require("../../serveur/src/communes.js");
const C = require("./lib/contacts.js");
const R = require("../../serveur/src/retours.js");
const JOURNAL = require("../../serveur/src/journal.js");
const PARCOURS = require("../../serveur/src/parcours.js");
const An = require("../../serveur/src/animateurs.js");
// Le circuit d'annulation vit dans la fonction « ateliers » : on l'appelle
// plutôt que de le recopier, pour que les inscrit·es soient prévenu·es
// exactement de la même façon.
const Ateliers = require("./ateliers.js");
const mail = require("./lib/mail.js");
const BILLET = require("./lib/billet.js");
const APERCUS = require("./lib/apercus.js");

function contacts() { return getStore({ name: "fresque-contacts" }); }
function retours() { return getStore({ name: "fresque-retours" }); }
function alertes() { return getStore({ name: "fresque-alertes" }); }

/* Abonnes aux annonces « prochains ateliers ». On ne rend QUE des comptages :
   l'interet pour l'equipe est de savoir ou programmer le prochain atelier, pas
   de disposer d'une liste d'adresses de plus. */
async function resumeAlertes() {
  const s = alertes();
  const liste = await s.list().catch(() => ({ blobs: [] }));
  const formats = { enligne: 0, physique: 0, les_deux: 0 };
  const parZone = {};
  let total = 0;
  for (const b of liste.blobs || []) {
    if (b.key.indexOf("abonne:") !== 0) continue; // les cles "jeton:" pointent vers celles-ci
    const v = await s.get(b.key, { type: "json" }).catch(() => null);
    if (!v || !v.actif) continue;
    total++;
    if (formats[v.format] != null) formats[v.format]++;
    (v.communes || []).forEach((z) => { parZone[z] = (parZone[z] || 0) + 1; });
  }
  const zones = Object.keys(parZone)
    .map((z) => ({ zone: Com.libelle(z), n: parZone[z] }))
    .sort((a, b) => b.n - a.n);
  return { total, formats, zones };
}

/* Les retours d'atelier et les temoignages arrivent par /retour/ et
   /temoignage/. Rien n'est publie automatiquement : l'equipe les lit ici. */
async function listerRetours() {
  const s = retours();
  const liste = await s.list().catch(() => ({ blobs: [] }));
  const out = [];
  for (const b of liste.blobs || []) {
    const v = await s.get(b.key, { type: "json" }).catch(() => null);
    if (v) out.push(R.pourAdmin(v, b.key));
  }
  out.sort((a, b) => (b.date || 0) - (a.date || 0));
  return out;
}
// L'adresse du site vient de lib/lien.js : celle du DEPLOIEMENT qui envoie,
// pour qu'un courriel teste sur une preview y ramene au lieu de la production.
const LIENS = require("./lib/lien.js");
const LIEN_SITE = LIENS.SITE;
/* Le message de relance vit dans lib/courriel-relance.js : l'apercu de /admin/
   le construit comme les autres, et admin.js ne peut pas requerir le catalogue
   d'apercus s'il porte lui-meme un courriel (dependance circulaire). */
const relanceAnimateur = require("./lib/courriel-relance.js").relance;

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
      if (q.action === "retours") return json(200, { retours: await listerRetours() });

      /* LE JOURNAL DES ENVOIS. Le site est jeune et une bonne part de ce qu'il
         fait est invisible : un courriel part trois jours apres un atelier, le
         mardi matin, ou a l'instant d'une inscription. Quand quelqu'un dit
         « je n'ai rien recu », la question se posait depuis un terminal.
         Aucune adresse n'y figure : voir serveur/src/journal.js. */
      if (q.action === "journal") {
        const s2 = getStore({ name: "fresque-journal" });
        const v = await s2.get("envois", { type: "json" }).catch(() => null);
        const liste = (v && v.liste) || [];
        return json(200, { journal: liste, bilan: JOURNAL.bilan(liste, Date.now()),
          parcours: PARCOURS.tous() });
      }
      /* LE BILLET D'APERCU. Le tableau de bord affiche chaque courriel dans
         un cadre ; un cadre s'authentifie par son adresse, et la cle n'a rien
         a faire dans une adresse (historique, journaux). Il demande donc ici,
         avec sa cle, un laissez-passer de dix minutes qui n'ouvre que les
         apercus. */
      if (q.action === "billet-apercu") {
        return json(200, { billet: BILLET.emettre(process.env.ADMIN_TOKEN || ""),
          sujets: APERCUS.sujets() });
      }
      if (q.action === "alertes") return json(200, await resumeAlertes());
      if (q.action === "ateliers") {
        const ateliers = await Ateliers.listerPourAdmin();
        const contacts = await C.lister(st);
        return json(200, { ateliers, inactifs: An.inactifs(contacts, ateliers, Date.now()) });
      }
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

      if (d.op === "retour") {
        const cle = String(d.cle || "");
        // La cle vient de notre propre listing ; on la verifie quand meme,
        // une cle forgee pourrait designer autre chose dans le magasin.
        if (!/^(atelier|temoignage):[a-z0-9]{1,24}$/.test(cle)) {
          return json(400, { erreur: "Référence inconnue." });
        }
        const rs = retours();
        if (d.sousOp === "effacer") { await rs.delete(cle); return json(200, { ok: true }); }
        const v = await rs.get(cle, { type: "json" }).catch(() => null);
        if (!v) return json(404, { erreur: "Ce retour n’existe plus." });
        if (d.sousOp === "publier") v.publie = true;
        else if (d.sousOp === "masquer") v.publie = false;
        else if (d.sousOp === "traiter") v.traite = !v.traite;
        else return json(400, { erreur: "Opération inconnue." });
        await rs.setJSON(cle, v);
        return json(200, { ok: true });
      }

      const m = C.normaliserMail(d.mail);
      if (!m) return json(400, { erreur: "Adresse manquante." });
      if (d.op === "atelier") {
        if (d.sousOp !== "annuler") return json(400, { erreur: "Opération inconnue." });
        const r = await Ateliers.annulerParAdmin(d.code);
        return json(r.erreur ? 404 : 200, r);
      }

      if (d.op === "relancer") {
        const m = String(d.mail || "").trim().toLowerCase();
        if (!m) return json(400, { erreur: "Adresse manquante." });
        /* On enregistre la relance AVANT d'envoyer : si l'envoi échoue, la
           personne ne recevra rien, ce qui est réparable ; si on enregistrait
           après, un plantage entre les deux la ferait relancer deux fois. */
        const marque = await C.marquerRelance(st, m);
        if (!marque) return json(404, { erreur: "Ce contact n'existe pas." });
        const r = relanceAnimateur();
        const env = await mail.envoi({ to: m, subject: "On reprogramme une fresque ?", text: r.text, html: r.html });
        return json(200, { relance: true, envoye: !!env.envoye });
      }

      if (d.op === "desinscrire") { const ok = await C.desinscrire(st, m); return json(ok ? 200 : 404, { desinscrit: ok }); }
      if (d.op === "supprimer") { const ok = await C.supprimer(st, m); return json(200, { supprime: ok }); }
      return json(400, { erreur: "Opération inconnue." });
    }

    return json(405, { erreur: "Méthode non autorisée." });
  } catch (e) {
    return json(500, { erreur: "Erreur du service admin.", details: String(e && e.message || e) });
  }
};
