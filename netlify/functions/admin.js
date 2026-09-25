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
const An = require("../../serveur/src/animateurs.js");
// Le circuit d'annulation vit dans la fonction « ateliers » : on l'appelle
// plutôt que de le recopier, pour que les inscrit·es soient prévenu·es
// exactement de la même façon.
const Ateliers = require("./ateliers.js");
const mail = require("./lib/mail.js");

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
/* Message de relance. Volontairement court et sans reproche : la personne a
   donné de son temps une fois, elle ne doit rien à personne. On lui dit ce qui
   a changé depuis et on lui laisse la main -- pas de « on ne vous voit plus ».
   Un seul lien, celui qui sert : programmer. */
const LIEN_SITE = (process.env.SITE_URL || "https://fresquedesrisquedelia.netlify.app").replace(/\/+$/, "");
function relanceAnimateur(mailDest) {
  const prog = LIEN_SITE + "/devenir-animateur/#programmer";
  const text = [
    "Bonjour,",
    "",
    "Vous avez animé une Fresque des risques de l'IA il y a quelque temps — merci encore.",
    "",
    "La fresque a continué d'évoluer depuis : les cartes ont été corrigées grâce aux retours des animateur·ices, le guide s'est étoffé, et le site aide maintenant à trouver des participant·es (il annonce votre atelier aux personnes inscrites près de chez vous).",
    "",
    "Si l'envie vous en dit, programmer le prochain prend deux minutes :",
    prog,
    "",
    "Et si ce n'est pas le moment, ce message n'attend aucune réponse. Nous ne relançons personne plus d'une fois par semestre.",
    "",
    "À bientôt,",
    "L'équipe de la Fresque des risques de l'IA, Pause IA"
  ].join("\n");
  const html = [
    '<p style="margin:0 0 14px;">Bonjour,</p>',
    '<p style="margin:0 0 14px;">Vous avez animé une Fresque des risques de l\'IA il y a quelque temps — merci encore.</p>',
    '<p style="margin:0 0 14px;">La fresque a continué d\'évoluer depuis : les cartes ont été corrigées grâce aux retours des animateur·ices, le guide s\'est étoffé, et le site aide maintenant à trouver des participant·es (il annonce votre atelier aux personnes inscrites près de chez vous).</p>',
    '<p style="margin:0 0 18px;text-align:center;"><a href="' + prog + '" style="display:inline-block;background:#E8811C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:700;">Programmer un atelier</a></p>',
    '<p style="margin:0;font-size:13px;color:#6b665e;">Si ce n\'est pas le moment, ce message n\'attend aucune réponse. Nous ne relançons personne plus d\'une fois par semestre.</p>'
  ].join("");
  return { text, html: html };
}

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
        const r = relanceAnimateur(m);
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
