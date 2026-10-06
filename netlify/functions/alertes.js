/* ALERTES « PROCHAINS ATELIERS » : abonnement et desabonnement.

   Regles pures : serveur/src/alertes.js. L'envoi hebdomadaire vit dans
   alertes-envoi.js. Stockage : Netlify Blobs, magasin "fresque-alertes".

   POST { op:"abonner", mail, format, communes, rayonKm } -> { ok, aConfirmer }
   GET/POST ?d=<jeton>                        -> desabonnement en un clic
   GET  ?c=<jeton>                            -> confirmation de l'abonnement
   GET  ?etat=<jeton>                         -> { format, communes, rayonKm } pour la page

   DOUBLE CONSENTEMENT. S'inscrire ne suffit pas : tant que le lien recu par
   e-mail n'a pas ete ouvert, l'abonne reste `actif: false` et ne recoit aucune
   annonce. Deux raisons, et aucune n'est une formalite :
   - sans cela, n'importe qui peut inscrire l'adresse d'un tiers, qui ne
     l'apprendrait qu'au premier envoi ;
   - une adresse mal tapee restait en base pour toujours, et la personne, elle,
     attendait un message qui ne pouvait pas arriver. C'est precisement ce
     qu'un participant a signale : « le systeme semble casse ». Il ne l'etait
     pas, il etait muet.

   LE DESABONNEMENT EST UN SIMPLE LIEN. Pas de connexion, pas de formulaire,
   pas de « confirmez-vous ». Rendre la sortie penible ne retient personne :
   cela transforme un desabonnement en signalement de courrier indesirable,
   ce qui abime la reputation de notre domaine d'envoi pour tout le monde.
*/
"use strict";
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const A = require("../../serveur/src/alertes.js");
const L = require("../../serveur/src/limites.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const Com = require("../../serveur/src/communes.js");

// L'adresse du site vient de lib/lien.js : celle du DEPLOIEMENT qui envoie,
// pour qu'un courriel teste sur une preview y ramene au lieu de la production.
const LIENS = require("./lib/lien.js");
const LIEN = LIENS.SITE;

const SEUIL = { limite: 10, fenetreMs: 60 * 60 * 1000 };

function store() { return getStore({ name: "fresque-alertes" }); }
function limites() { return getStore({ name: "fresque-limites" }); }

const json = (s, c) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(c)
});

function ip(event) {
  const h = event.headers || {};
  return (h["x-nf-client-connection-ip"] || h["client-ip"]
    || (h["x-forwarded-for"] || "").split(",")[0] || "inconnue").trim();
}

async function debitDepasse(cle) {
  const s = limites();
  const k = "alr:" + cle;
  const now = Date.now();
  const actuel = await s.get(k, { type: "json" }).catch(() => null);
  if (L.atteinte(actuel, now, SEUIL.limite, SEUIL.fenetreMs)) return true;
  await s.setJSON(k, L.incrementer(actuel, now, SEUIL.fenetreMs)).catch(() => {});
  return false;
}

/* L'adresse sert de cle : un reabonnement met a jour les preferences au lieu
   de creer un doublon, qui vaudrait deux messages par semaine. On la hache,
   pour ne pas semer des adresses en clair dans les noms de cles. */
const cleAbonne = (mail) => "abonne:" + crypto.createHash("sha256").update(mail).digest("hex").slice(0, 32);
const cleJeton = (jeton) => "jeton:" + jeton;

/* --- Les messages de l'inscription --------------------------------------- */

const lienDesabo = (jeton) => LIEN + "/alertes/?d=" + encodeURIComponent(jeton);
const lienConfirme = (jeton) => LIEN + "/alertes/?c=" + encodeURIComponent(jeton);
const lienPrefs = (jeton) => LIEN + "/participer/?m=" + encodeURIComponent(jeton) + "#alertes";

/* Le desabonnement en un clic depuis la boite de reception (RFC 8058). Il
   pointe la FONCTION et non la page : le bouton de Gmail envoie un POST, qu'un
   fichier statique ne saurait pas traiter. */
function enTetesDesabo(jeton) {
  return {
    "List-Unsubscribe": "<" + LIEN + "/.netlify/functions/alertes?d=" + encodeURIComponent(jeton) + ">",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

const NOM_FORMAT = { enligne: "en ligne uniquement", physique: "en présentiel uniquement", les_deux: "en ligne et en présentiel" };

/* Le recapitulatif de ce a quoi on vient de s'abonner. Le redire noir sur
   blanc est ce qui permet de reperer une erreur : une commune de trop, un
   rayon trop etroit, un format qu'on n'avait pas voulu. */
function recap(ab) {
  const l = ["Ateliers : " + (NOM_FORMAT[ab.format] || ab.format)];
  if (ab.format !== "enligne" && (ab.communes || []).length) {
    l.push("Autour de : " + ab.communes.map((c) => Com.libelle(c)).join(", "));
    l.push("Dans un rayon de : " + ab.rayonKm + " km");
  }
  return l;
}

function corpsRecap(ab) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:15px;">'
    + recap(ab).map((ligne) => {
      const i = ligne.indexOf(" : ");
      return '<tr><td style="padding:3px 14px 3px 0;color:' + G.GRIS + ';white-space:nowrap;">' + G.h(ligne.slice(0, i))
        + '</td><td style="padding:3px 0;font-weight:700;">' + G.h(ligne.slice(i + 3)) + "</td></tr>";
    }).join("")
    + "</table>";
}

/* LE PIED COMMUN AUX DEUX MESSAGES : modifier, se desabonner. Il repond a la
   question qu'on se pose en recevant un e-mail qu'on n'attendait pas. */
function pied(ab, texte) {
  const l = [], c = [];
  l.push("");
  l.push("Modifier vos préférences : " + lienPrefs(ab.jeton));
  l.push("Ne plus rien recevoir, en un clic : " + lienDesabo(ab.jeton));
  c.push('<hr style="border:0;border-top:1px solid #eee;margin:24px 0 14px;">');
  c.push('<p style="margin:0 0 6px;font-size:13px;color:' + G.GRIS + ';">' + texte + "</p>");
  c.push('<p style="margin:0;font-size:13px;">'
    + '<a href="' + G.h(lienPrefs(ab.jeton)) + '" style="color:' + G.GRIS + ';text-decoration:underline;">Modifier vos préférences</a>'
    + ' &nbsp;·&nbsp; '
    + '<a href="' + G.h(lienDesabo(ab.jeton)) + '" style="color:' + G.GRIS + ';text-decoration:underline;">Ne plus rien recevoir</a></p>');
  return { l: l, c: c };
}

/* PREMIER MESSAGE : il faut cliquer pour que l'abonnement existe. Le bouton
   est donc la seule action, et rien d'autre ne doit lui disputer l'attention. */
function mailConfirmation(ab) {
  const p = pied(ab, "Vous recevez ce message parce que cette adresse vient d'être inscrite aux annonces d'ateliers. "
    + "Si ce n'est pas vous, ignorez-le : sans confirmation, aucune annonce ne partira, et l'inscription s'effacera d'elle-même.");
  const l = ["Bonjour,", "",
    "Encore un clic et vous serez prévenu·e des prochains ateliers de la Fresque des risques de l'IA :",
    lienConfirme(ab.jeton), "",
    "Ce que vous recevrez :", ...recap(ab).map((x) => "- " + x),
    "", "Au plus un e-mail par semaine, et rien s'il n'y a rien pour vous.",
    ...p.l];
  const c = ['<p style="margin:0 0 14px;">Bonjour,</p>',
    '<p style="margin:0 0 18px;">Encore un clic et vous serez prévenu·e des prochains ateliers de la Fresque des risques de l\'IA.</p>',
    '<p style="margin:0 0 22px;text-align:center;">' + G.bouton(lienConfirme(ab.jeton), "Confirmer mon inscription") + "</p>",
    '<p style="margin:0 0 8px;font-weight:700;">Ce que vous recevrez</p>',
    corpsRecap(ab),
    '<p style="margin:0;color:' + G.GRIS + ';font-size:14px;">Au plus un e-mail par semaine, et rien s\'il n\'y a rien pour vous.</p>',
    ...p.c];
  return { subject: "Confirmez votre inscription aux annonces d'ateliers",
    text: l.join("\n"), html: G.mailHtml(c.join("")) };
}

/* DEUXIEME CAS : l'abonnement existait deja et vient d'etre modifie. Pas de
   confirmation a redemander, mais une trace ecrite du nouveau reglage. */
function mailMiseAJour(ab) {
  const p = pied(ab, "Vous recevez ce message parce que vous êtes inscrit·e aux annonces d'ateliers.");
  const l = ["Bonjour,", "", "Vos préférences d'annonces ont bien été modifiées.", "",
    ...recap(ab).map((x) => "- " + x), "",
    "Au plus un e-mail par semaine, et rien s'il n'y a rien pour vous.", ...p.l];
  const c = ['<p style="margin:0 0 14px;">Bonjour,</p>',
    '<p style="margin:0 0 18px;">Vos préférences d\'annonces ont bien été modifiées.</p>',
    corpsRecap(ab),
    '<p style="margin:0;color:' + G.GRIS + ';font-size:14px;">Au plus un e-mail par semaine, et rien s\'il n\'y a rien pour vous.</p>',
    ...p.c];
  return { subject: "Vos préférences d'annonces ont été modifiées",
    text: l.join("\n"), html: G.mailHtml(c.join("")) };
}

exports.handler = async (event) => {
  connectLambda(event);
  const s = store();

  const q = event.queryStringParameters || {};
  const parJeton = String(q.d || q.c || q.etat || "");

  /* UN CLIC DEPUIS LA BOITE DE RECEPTION. Le bouton « Se desabonner » de Gmail
     et de Yahoo envoie un POST a l'adresse de l'en-tete `List-Unsubscribe`
     (RFC 8058), sans corps. On l'accepte donc par les deux methodes ; une
     requete d'abonnement, elle, porte toujours un corps JSON. */
  const desabonnement = parJeton && q.d
    && (event.httpMethod === "GET" || event.httpMethod === "POST");

  if (desabonnement || (event.httpMethod === "GET" && parJeton)) {
    if (!/^[A-Za-z0-9_-]{16,48}$/.test(parJeton)) return json(400, { erreur: "Lien invalide." });

    const ref = await s.get(cleJeton(parJeton), { type: "json" }).catch(() => null);
    if (!ref || !ref.cle) return json(404, { erreur: "Ce lien n’est plus valable." });
    const ab = await s.get(ref.cle, { type: "json" }).catch(() => null);
    if (!ab) return json(404, { erreur: "Ce lien n’est plus valable." });

    if (q.etat) return json(200, { ok: true, mail: ab.mail, format: ab.format,
      communes: ab.communes || [], rayonKm: ab.rayonKm, actif: !!ab.actif });

    /* CONFIRMATION. Le lien du premier e-mail : il active l'abonnement, et lui
       seul. Reclique plus tard, il repond la meme chose plutot qu'une erreur :
       quelqu'un qui retrouve l'e-mail et reclique n'a rien fait de mal. */
    if (q.c) {
      if (!ab.actif) { ab.actif = true; ab.confirmeLe = Date.now(); await s.setJSON(ref.cle, ab); }
      return json(200, { ok: true, confirme: true });
    }

    /* On efface plutot que de marquer inactif : garder l'adresse de quelqu'un
       qui vient de demander a ne plus rien recevoir serait le contraire de ce
       qu'il demande. */
    await s.delete(ref.cle).catch(() => {});
    await s.delete(cleJeton(parJeton)).catch(() => {});
    return json(200, { ok: true, desabonne: true });
  }

  if (event.httpMethod !== "POST") return json(405, { erreur: "Méthode non autorisée." });

  let corps;
  try { corps = JSON.parse(event.body || "{}"); }
  catch { return json(400, { erreur: "Requête illisible." }); }

  // Champ piege, comme sur les formulaires de retour.
  if (String(corps.site || "").trim()) return json(200, { ok: true });

  /* UNE PANNE DU SERVEUR NE DOIT PAS SE DEGUISER EN FAUTE DU VISITEUR. La
     validation touche la table des communes, qui est lue sur le disque : si
     elle manque, l'exception remontait telle quelle et Netlify renvoyait un
     500 au corps technique, que la page traduisait par « Enregistrement
     impossible. ». On distingue donc ce cas, on le journalise pour qu'il soit
     visible cote exploitation, et on le dit franchement. */
  let v;
  try { v = A.validerAbonnement(corps, Date.now()); }
  catch (e) {
    if (e && e.code === "COMMUNES_ABSENTES") {
      console.error("[alertes] table des communes absente du paquet : " + e.message);
      return json(503, { erreur: "Le service est momentanément indisponible, le temps que nous le remettions en route. Réessayez dans un moment, ou écrivez-nous à contact@pauseia.fr." });
    }
    throw e;
  }
  if (v.erreur) return json(400, { erreur: v.erreur });

  if (await debitDepasse(ip(event))) {
    return json(429, { erreur: "Trop de tentatives. Réessayez dans une heure." });
  }

  const cle = cleAbonne(v.abonne.mail);
  const existant = await s.get(cle, { type: "json" }).catch(() => null);
  // Un reabonnement garde le jeton existant : les liens de desabonnement deja
  // envoyes doivent continuer de fonctionner.
  const jeton = (existant && existant.jeton) || crypto.randomBytes(18).toString("base64url");

  /* QUI EST DEJA CONFIRME NE REFAIT PAS LE CHEMIN. Redemander une confirmation
     a quelqu'un qui vient simplement de changer son rayon le priverait de ses
     annonces jusqu'a ce qu'il relise ses mails, pour une modification qu'il
     vient de faire sous nos yeux. */
  const dejaConfirme = !!(existant && existant.actif);
  const abonne = Object.assign({}, v.abonne, {
    jeton: jeton,
    actif: dejaConfirme,
    depuis: (existant && existant.depuis) || v.abonne.depuis,
    dernierEnvoi: (existant && existant.dernierEnvoi) || 0,
    confirmeLe: (existant && existant.confirmeLe) || 0,
    // Ce qui lui a deja ete annonce le suit : sans cela, changer de rayon
    // relancerait toutes les annonces deja recues.
    annonces: (existant && existant.annonces) || {}
  });

  await s.setJSON(cle, abonne);
  await s.setJSON(cleJeton(jeton), { cle: cle });

  /* L'E-MAIL QUI MANQUAIT. Jusqu'ici l'inscription ne declenchait rien du
     tout : la personne voyait « c'est noté » et plus jamais rien, parfois pour
     toujours s'il n'y avait pas d'atelier pres de chez elle. Elle n'avait
     aucun moyen de verifier son adresse, ni de se desabonner avant le premier
     envoi. Ce message porte les trois : la preuve, le recapitulatif, la
     sortie. Un echec d'envoi ne fait pas echouer l'inscription, mais il est
     dit a l'appelant, qui l'affiche. */
  const m = dejaConfirme ? mailMiseAJour(abonne) : mailConfirmation(abonne);
  let envoye = false;
  try {
    const r2 = await mail.envoi({ to: [abonne.mail], subject: m.subject, text: m.text, html: m.html,
      headers: enTetesDesabo(jeton) });
    envoye = !!r2.envoye;
  } catch (e) { console.error("[alertes] envoi du message d'inscription impossible : " + (e && e.message)); }

  return json(200, { ok: true, miseAJour: dejaConfirme, aConfirmer: !dejaConfirme, mailEnvoye: envoye });
};
