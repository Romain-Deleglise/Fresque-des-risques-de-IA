/* Suivi post-atelier (Netlify Scheduled Function).
   Programmee via netlify.toml (une fois par jour). Pour chaque atelier termine
   (depuis ~3 h et moins de 3 jours) pas encore suivi, envoie DEUX e-mails de
   remerciement : un a l'animateur·ice, un aux participant·es. Les deux publics
   n'ont pas les memes besoins -- inviter a « animer a son tour » quelqu'un qui
   vient de le faire n'a pas de sens, et c'est aux participant·es qu'il faut
   demander ce qu'ils ont pense de l'atelier. Marque ensuite l'atelier comme
   suivi. Sans RESEND_API_KEY, ne fait rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const A = require("../../serveur/src/ateliers.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, mailHtml = G.mailHtml, bouton = G.bouton, boutonSecondaire = G.boutonSecondaire;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const FIN_MS = 3 * 60 * 60 * 1000;          // atelier considere termine 3 h apres le debut
const LIMITE_MS = 3 * 24 * 60 * 60 * 1000;  // fenetre d'envoi : jusqu'a 3 j apres
const DISCORD = "https://discord.gg/vyXGd7AeGc";
const PAUSEIA = "https://pauseia.fr";

/* LES DEUX FORMULAIRES sont heberges hors du site (Notion). Leurs adresses
   arrivent par l'environnement plutot que d'etre ecrites ici : elles peuvent
   changer sans toucher au code, et surtout, tant qu'elles ne sont pas
   renseignees les invitations correspondantes ne s'affichent pas. Un mail qui
   propose « laissez un retour » vers une page qui n'existe pas fait plus de
   mal que de bien. */
const FORM_RETOURS = (process.env.FORM_RETOURS_URL || "").trim();
const FORM_TEMOIGNAGE = (process.env.FORM_TEMOIGNAGE_URL || "").trim();

/* Pied commun : qui nous sommes, et ou nous suivre. L'atelier est le premier
   contact de beaucoup de gens avec Pause IA ; ne rien leur proposer ensuite
   serait un rendez-vous manque. */
function piedPauseIA(l, c) {
  l.push("");
  l.push("Pause IA est une association qui milite pour un moratoire mondial sur le développement des IA de pointe. Si l'atelier vous a parlé, il y a une place pour vous, quel que soit le temps que vous pouvez y consacrer.");
  l.push("- Rejoindre l'association : " + PAUSEIA + "/fr/rejoindre");
  l.push("- Notre lettre d'information : " + PAUSEIA + "/fr/newsletters");

  c.push('<hr style="border:0;border-top:1px solid #eee;margin:22px 0 16px;">');
  c.push('<p style="margin:0 0 12px;font-size:14px;color:#4a473f;"><strong>Pause IA</strong> est une association qui milite pour un moratoire mondial sur le développement des IA de pointe. Si l\'atelier vous a parlé, il y a une place pour vous, quel que soit le temps que vous pouvez y consacrer.</p>');
  c.push('<p style="margin:0 0 14px;text-align:center;">' + boutonSecondaire(PAUSEIA + "/fr/rejoindre", "Rejoindre l'association") + '</p>');
  c.push('<p style="margin:0;font-size:13px;color:#6b665e;text-align:center;">Pour suivre ce qu\'on fait : '
    + '<a href="' + PAUSEIA + '/fr/newsletters" style="color:#6b665e;">lettre d\'information</a> · '
    + '<a href="https://www.linkedin.com/company/pause-ia/" style="color:#6b665e;">LinkedIn</a> · '
    + '<a href="https://x.com/pause_ia" style="color:#6b665e;">X</a> · '
    + '<a href="https://www.facebook.com/Pause.IA/" style="color:#6b665e;">Facebook</a></p>');
}

function store() { return getStore({ name: "fresque-ateliers" }); }
function storeImages() { return getStore({ name: "fresque-images" }); }
// Au-dela, l'image ne sert plus a rien et n'a pas a etre conservee.
const IMG_LIMITE_MS = 7 * 24 * 60 * 60 * 1000;

/* L'IMAGE DE LA FRESQUE. C'est la seule chose que le groupe a envie de garder,
   et elle restait sur la machine de l'animateur·ice. Elle est deposee en fin
   d'atelier (op "image" de fresque.js) et jointe ici, puis effacee : on ne
   conserve pas le travail d'un groupe plus longtemps que le temps de le lui
   envoyer. */
async function imageDe(code) {
  if (!code) return null;
  try {
    const r = await storeImages().get("image:" + code, { type: "json" });
    if (!r || !r.png) return null;
    if (Date.now() - (r.ts || 0) > IMG_LIMITE_MS) { await effacerImage(code); return null; }
    return r.png;
  } catch (e) { return null; }
}
async function effacerImage(code) {
  if (!code) return;
  try { await storeImages().delete("image:" + code); } catch (e) {}
}

/* DEUX MAILS, PAS UN. Jusqu'ici animateur·ice et participant·es recevaient le
   meme message, ou l'essentiel invitait a « animer a son tour » : pour qui
   venait de le faire, c'etait absurde, et pour les participant·es, on passait
   a cote de ce qu'on a vraiment besoin de leur demander. */

function ligneImage(avecImage, l, c) {
  if (!avecImage) return;
  l.push("");
  l.push("Votre fresque est jointe à ce message, telle que le groupe l'a laissée.");
  c.push('<p style="margin:18px 0 0;font-size:13px;color:#6b665e;">Votre fresque est jointe à ce message, telle que le groupe l\'a laissée.</p>');
}

/* --- Aux participant·es --------------------------------------------------- */
function mailParticipants(avecImage) {
  const cartes = LIEN + "/#telecharger";
  const animer = LIEN + "/devenir-animateur/";
  const l = [], c = [];

  l.push("Bonjour,");
  l.push("");
  l.push("Merci d'avoir participé à la Fresque des risques de l'IA. Elle est toute jeune et elle va continuer d'évoluer.");
  c.push('<p style="margin:0 0 14px;">Bonjour,</p>');
  c.push('<p style="margin:0 0 16px;">Merci d\'avoir participé à la Fresque des risques de l\'IA. Elle est toute jeune et elle va continuer d\'évoluer.</p>');

  if (FORM_RETOURS) {
    l.push("");
    l.push("Dites-nous ce que vous en avez pensé : ce qui vous a marqué, ce qui n'était pas clair, ce que vous auriez voulu creuser.");
    l.push("- Laisser un retour : " + FORM_RETOURS);
    c.push('<p style="margin:0 0 12px;">Dites-nous ce que vous en avez pensé : ce qui vous a marqué, ce qui n\'était pas clair, ce que vous auriez voulu creuser.</p>');
    c.push('<p style="margin:0 0 18px;text-align:center;">' + bouton(FORM_RETOURS, "Laisser un retour") + '</p>');
  }
  if (FORM_TEMOIGNAGE) {
    l.push("");
    l.push("Et si vous avez aimé, laissez-nous quelques mots que nous pourrons partager pour donner envie à d'autres.");
    l.push("- Laisser un témoignage : " + FORM_TEMOIGNAGE);
    c.push('<p style="margin:0 0 12px;">Et si vous avez aimé, laissez-nous quelques mots que nous pourrons partager pour donner envie à d\'autres.</p>');
    c.push('<p style="margin:0 0 18px;text-align:center;">' + boutonSecondaire(FORM_TEMOIGNAGE, "Laisser un témoignage") + '</p>');
  }

  l.push("");
  l.push("Envie de l'animer vous-même ? Tout est libre et gratuit, et le site vous aide à trouver des participants.");
  l.push("- Devenir animateur·ice : " + animer);
  l.push("- Reprendre les cartes quand vous voulez : " + cartes);
  c.push('<div style="background:#fdf2e6;border:1px solid #f3d5b0;border-radius:10px;padding:16px 18px;margin:0 0 8px;">');
  c.push('<p style="margin:0 0 8px;font-weight:700;color:#9a4d0f;">Envie de l\'animer vous-même ?</p>');
  c.push('<p style="margin:0 0 14px;color:#4a473f;">Tout est libre et gratuit, et le site vous aide à trouver des participants.</p>');
  c.push('<p style="margin:0;text-align:center;">' + bouton(animer, "Devenir animateur·ice") + '</p>');
  c.push('</div>');
  c.push('<p style="margin:12px 0 0;font-size:13px;color:#6b665e;">Vous pouvez aussi <a href="' + h(cartes) + '" style="color:#6b665e;">reprendre les cartes</a> quand vous voulez.</p>');

  ligneImage(avecImage, l, c);
  piedPauseIA(l, c);
  l.push("");
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  return { text: l.join("\n"), html: mailHtml(c.join("")) };
}

/* --- À l'animateur·ice ---------------------------------------------------- */
function mailAnimateurSuivi(avecImage) {
  const espace = LIEN + "/animateurs/";
  const programmer = LIEN + "/devenir-animateur/#programmer";
  const l = [], c = [];

  l.push("Bonjour,");
  l.push("");
  l.push("Merci d'avoir animé la Fresque des risques de l'IA. C'est par ses animateur·ices qu'elle se diffuse, et il n'y a pas d'autre façon de la faire connaître.");
  c.push('<p style="margin:0 0 14px;">Bonjour,</p>');
  c.push('<p style="margin:0 0 16px;">Merci d\'avoir animé la Fresque des risques de l\'IA. C\'est par ses animateur·ices qu\'elle se diffuse, et il n\'y a pas d\'autre façon de la faire connaître.</p>');

  /* CE QU'ON LUI DEMANDE D'ABORD : son retour. Il vient de voir trente-huit
     cartes se heurter a un vrai public ; c'est la seule source qui nous dise
     lesquelles ne passent pas. */
  if (FORM_RETOURS) {
    l.push("");
    l.push("Qu'est-ce qui a coincé ? Une carte mal comprise, un lot trop long, une question à laquelle vous n'avez pas su répondre : c'est ce qui nous permet de corriger le jeu.");
    l.push("- Votre retour d'animation : " + FORM_RETOURS);
    c.push('<p style="margin:0 0 12px;">Qu\'est-ce qui a coincé ? Une carte mal comprise, un lot trop long, une question à laquelle vous n\'avez pas su répondre : c\'est ce qui nous permet de corriger le jeu.</p>');
    c.push('<p style="margin:0 0 18px;text-align:center;">' + bouton(FORM_RETOURS, "Donner mon retour d\'animation") + '</p>');
  }

  l.push("");
  l.push("Vous pouvez aussi signaler une carte directement depuis votre espace, et y retrouver la fresque de référence, l'antisèche et le minuteur.");
  l.push("- Votre espace animateur·ices (à garder pour vous) : " + espace);
  l.push("- Programmer votre prochain atelier : " + programmer);
  l.push("- Le Discord des animateur·ices : " + DISCORD);
  c.push('<p style="margin:0 0 12px;">Vous pouvez aussi signaler une carte directement depuis votre espace, et y retrouver la fresque de référence, l\'antisèche et le minuteur.</p>');
  c.push('<p style="margin:0 0 8px;text-align:center;">' + boutonSecondaire(espace, "Ouvrir mon espace") + '</p>');
  c.push('<p style="margin:0 0 18px;font-size:13px;color:#6b665e;text-align:center;">Gardez ce lien pour vous : il donne la fresque de référence.</p>');
  c.push('<p style="margin:0 0 6px;font-size:14px;color:#4a473f;">Prêt·e à recommencer ? <a href="' + h(programmer) + '" style="color:#B0560A;">Programmez votre prochain atelier</a>.</p>');
  c.push('<p style="margin:0;font-size:14px;color:#4a473f;">Une question, une envie de co-animer : <a href="' + h(DISCORD) + '" style="color:#B0560A;">le Discord des animateur·ices</a>.</p>');

  ligneImage(avecImage, l, c);
  piedPauseIA(l, c);
  l.push("");
  l.push("À bientôt,");
  l.push("L'équipe de la Fresque des risques de l'IA, Pause IA");
  return { text: l.join("\n"), html: mailHtml(c.join("")) };
}

exports.handler = async () => {
  if (!mail.configuree()) return { statusCode: 200, body: "email non configuré, aucun suivi" };
  const st = store();
  let envoyes = 0;
  try {
    const { blobs } = await st.list({ prefix: "atelier:" });
    const now = Date.now();
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        const a = res && res.data;
        if (!a || a.suiviEnvoye) continue;
        const quand = A.instantDe(a);   // heure de Paris, recalculee
        if (!isFinite(quand)) continue;
        if (now < quand + FIN_MS || now > quand + LIMITE_MS) continue;
        const dest = [a.animateur && a.animateur.mail].filter(Boolean);
        const parts = (a.participants || []).map((p) => p.mail).filter(Boolean);
        if (!dest.length && !parts.length) { a.suiviEnvoye = true; await st.setJSON(b.key, a, { onlyIfMatch: res.etag }); continue; }
        const png = await imageDe(a.code);
        const piece = png ? [{ filename: "fresque-des-risques-de-l-ia.jpg", content: png }] : undefined;

        /* DEUX ENVOIS DISTINCTS. Les participant·es restent en copie cachee
           entre eux : ils ne se sont pas donne leurs adresses. */
        let env = { envoye: false };
        if (dest.length) {
          const ma = mailAnimateurSuivi(!!png);
          const e = await mail.envoi({ to: dest, subject: "Merci d'avoir animé la Fresque des risques de l'IA",
            text: ma.text, html: ma.html, attachments: piece });
          if (e.envoye) env = e;
        }
        if (parts.length) {
          const mp = mailParticipants(!!png);
          /* Cci SEUL : mail.js met alors notre propre adresse en destinataire.
             Mettre un·e participant·e en « à » donnerait son adresse à tous
             les autres, qui ne se la sont pas donnée. */
          const e = await mail.envoi({ bcc: parts,
            subject: "Merci d'avoir participé à la Fresque des risques de l'IA",
            text: mp.text, html: mp.html, attachments: piece });
          if (e.envoye) env = e;
        }
        if (env.envoye) {
          a.suiviEnvoye = true;
          await st.setJSON(b.key, a, { onlyIfMatch: res.etag });
          await effacerImage(a.code);
          envoyes++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  // Menage : une image dont l'atelier n'a jamais donne lieu a un envoi ne doit
  // pas rester. Le travail d'un groupe n'a pas a trainer sur nos serveurs.
  try {
    const { blobs } = await storeImages().list({ prefix: "image:" });
    for (const b of blobs) {
      const r = await storeImages().get(b.key, { type: "json" });
      if (!r || Date.now() - (r.ts || 0) > IMG_LIMITE_MS) { try { await storeImages().delete(b.key); } catch (e) {} }
    }
  } catch (e) {}
  return { statusCode: 200, body: "suivis envoyés: " + envoyes };
};
