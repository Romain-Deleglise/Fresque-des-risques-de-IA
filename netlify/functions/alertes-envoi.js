/* ENVOI HEBDOMADAIRE DES ALERTES (Netlify Scheduled Function).

   Une fois par semaine : pour chaque abonne, les ateliers a venir qui le
   concernent, dans UN SEUL message. Les regles de selection (plafond d'un
   message par semaine, rien si rien ne le concerne, regroupement en ligne /
   par ville) vivent dans serveur/src/alertes.js et sont testees la.

   Sans RESEND_API_KEY, ne fait rien.
*/
"use strict";
const { getStore } = require("@netlify/blobs");
const A = require("../../serveur/src/alertes.js");
const At = require("../../serveur/src/ateliers.js");
const mail = require("./lib/mail.js");
const G = require("./lib/gabarit.js");
const h = G.h, mailHtml = G.mailHtml, bouton = G.bouton, boutonSecondaire = G.boutonSecondaire, dateLisible = G.dateLisible;

// L'adresse du site vient de lib/lien.js : celle du DEPLOIEMENT qui envoie,
// pour qu'un courriel teste sur une preview y ramene au lieu de la production.
const LIENS = require("./lib/lien.js");
const LIEN = LIENS.SITE;

function storeAlertes() { return getStore({ name: "fresque-alertes" }); }
function storeAteliers() { return getStore({ name: "fresque-ateliers" }); }

async function lireAbonnes() {
  const s = storeAlertes();
  const liste = await s.list({ prefix: "abonne:" }).catch(() => ({ blobs: [] }));
  const out = [];
  for (const b of liste.blobs || []) {
    const v = await s.get(b.key, { type: "json" }).catch(() => null);
    if (v) out.push({ cle: b.key, abonne: v });
  }
  return out;
}

async function lireAteliers() {
  const s = storeAteliers();
  const liste = await s.list({ prefix: "atelier:" }).catch(() => ({ blobs: [] }));
  const out = [];
  for (const b of liste.blobs || []) {
    const v = await s.get(b.key, { type: "json" }).catch(() => null);
    // On recalcule l'instant depuis la date et l'heure de Paris : quandMs
    // enregistre a la creation peut avoir ete pose avant un changement d'heure.
    if (v) { v.quandMs = At.instantDe(v); out.push(v); }
  }
  return out;
}

function ligneAtelier(a) {
  const quand = dateLisible(a.date, a.heure);
  /* LE LIEU EXACT, et pas seulement la ville. Il etait calcule puis jete : le
     message ne disait jamais ou l'atelier se tenait, alors que le titre de
     section ne donne que la commune. « Lyon » ne suffit pas pour s'y rendre. */
  const ou = a.mode === "enligne" ? "En ligne" : (a.lieu || "En présentiel");
  const places = Math.max(0, (Number(a.maxParticipants) || 0) - ((a.participants || []).length));
  return { quand: quand, ou: ou, places: places, url: LIEN + "/participer/#atelier-" + a.code };
}

function contenu(abonne, ateliers) {
  const g = A.grouper(ateliers);
  const desabo = LIEN + "/alertes/?d=" + encodeURIComponent(abonne.jeton);
  const prefs = LIEN + "/participer/?m=" + encodeURIComponent(abonne.jeton) + "#alertes";
  const l = [], c = [];

  const combien = ateliers.length;
  l.push("Bonjour,");
  l.push("");
  l.push(combien === 1
    ? "Un atelier de la Fresque des risques de l'IA est programmé et pourrait vous intéresser."
    : combien + " ateliers de la Fresque des risques de l'IA sont programmés et pourraient vous intéresser.");
  c.push('<p style="margin:0 0 14px;">Bonjour,</p>');
  c.push('<p style="margin:0 0 18px;">' + (combien === 1
    ? "Un atelier de la Fresque des risques de l'IA est programmé et pourrait vous intéresser."
    : combien + " ateliers de la Fresque des risques de l'IA sont programmés et pourraient vous intéresser.") + "</p>");

  /* CHAQUE ATELIER SE LIT COMME LES RAPPELS : les memes intitules en gris, les
     memes valeurs en gras, dans le meme ordre. C'etait le seul message du
     systeme a ne pas dire ou ni sous quelle forme, et son action principale,
     s'inscrire, etait un lien minuscule sous un gros bouton generique. */
  const section = (titre, liste) => {
    l.push("");
    l.push(titre.toUpperCase());
    c.push('<p style="margin:22px 0 10px;font-weight:700;color:' + G.ORANGE_TXT + ';">' + h(titre) + "</p>");
    liste.forEach((a) => {
      const x = ligneAtelier(a);
      const places = x.places ? x.places + " place" + (x.places > 1 ? "s" : "") + " restante" + (x.places > 1 ? "s" : "") : "";
      l.push("- " + x.quand);
      l.push("  " + x.ou + (places ? " · " + places : ""));
      l.push("  S'inscrire : " + x.url);
      const ligne = (cle, val) => '<tr><td style="padding:2px 12px 2px 0;color:' + G.GRIS + ';white-space:nowrap;">'
        + h(cle) + '</td><td style="padding:2px 0;font-weight:700;">' + h(val) + "</td></tr>";
      c.push('<div style="margin:0 0 10px;padding:14px 16px;border:1px solid #eadfce;border-radius:10px;">'
        + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:15px;">'
        + ligne("Date", x.quand) + ligne(a.mode === "enligne" ? "Format" : "Lieu", x.ou)
        + (places ? ligne("Places", places) : "")
        + "</table>"
        + boutonSecondaire(x.url, "S’inscrire") + "</div>");
    });
  };

  if (g.enligne.length) section("En ligne", g.enligne);
  g.villes.forEach((v) => section(v.ville || "Près de chez vous", v.ateliers));

  /* « Voir tous les ateliers » redevient ce qu'il est : une sortie de secours,
     pas l'appel principal. L'appel, c'est s'inscrire a l'un de ceux ci-dessus. */
  l.push("");
  l.push("Voir tous les ateliers : " + LIEN + "/participer/");
  c.push('<p style="margin:20px 0 0;text-align:center;font-size:14px;">'
    + '<a href="' + h(LIEN + "/participer/") + '" style="color:' + G.ORANGE_TXT + ';">Voir tous les ateliers</a></p>');

  /* LE DESABONNEMENT EN BAS, EN CLAIR, EN UN CLIC. C'est la contrepartie du
     droit de leur ecrire. */
  l.push("");
  l.push("Vous recevez ce message parce que vous avez demandé à être prévenu·e des prochains ateliers. Au plus un message par semaine, et rien s'il n'y a rien près de chez vous.");
  l.push("Modifier vos préférences : " + prefs);
  l.push("Se désabonner en un clic : " + desabo);
  c.push('<hr style="border:0;border-top:1px solid #eee;margin:24px 0 14px;">');
  c.push('<p style="margin:0 0 6px;font-size:13px;color:#6b665e;">Vous recevez ce message parce que vous avez demandé à être prévenu·e des prochains ateliers. Au plus un message par semaine, et rien s\'il n\'y a rien près de chez vous.</p>');
  c.push('<p style="margin:0;font-size:13px;">'
    + '<a href="' + h(prefs) + '" style="color:' + G.GRIS + ';text-decoration:underline;">Modifier vos préférences</a>'
    + ' &nbsp;·&nbsp; '
    + '<a href="' + h(desabo) + '" style="color:' + G.GRIS + ';text-decoration:underline;">Se désabonner en un clic</a></p>');

  return { text: l.join("\n"), html: mailHtml(c.join("")) };
}

exports.handler = async () => {
  if (!mail.configuree()) return { statusCode: 200, body: "email non configuré, aucune alerte" };

  const now = Date.now();
  const abonnes = await lireAbonnes();
  const ateliers = await lireAteliers();
  const envois = A.envoisDeLaSemaine(abonnes.map((x) => x.abonne), ateliers, now);

  const parMail = new Map(abonnes.map((x) => [x.abonne.mail, x.cle]));
  const s = storeAlertes();
  let envoyes = 0, purges = 0;

  /* ON TIENT LA PROMESSE DU MESSAGE D'INSCRIPTION. Il dit que sans
     confirmation, l'inscription s'effacera d'elle-meme : c'est ici que cela se
     passe. Sans cela on garderait indefiniment l'adresse de quelqu'un qui n'a
     jamais rien demande, celle d'un tiers inscrit a son insu, ou une adresse
     mal tapee qui appartient a une autre personne. On efface aussi le jeton,
     sinon il resterait une entree qui ne pointe plus sur rien. */
  for (const x of abonnes) {
    if (!A.aPurger(x.abonne, now)) continue;
    await s.delete(x.cle).catch(() => {});
    if (x.abonne.jeton) await s.delete("jeton:" + x.abonne.jeton).catch(() => {});
    purges++;
  }

  for (const e of envois) {
    try {
      const m = contenu(e.abonne, e.ateliers);
      const sujet = A.sujet(e.ateliers);
      const r = await mail.envoi({ to: [e.abonne.mail], subject: sujet, text: m.text, html: m.html,
        /* Le bouton « Se desabonner » de la boite de reception (RFC 8058).
           Sans lui, la seule sortie visible est « Signaler comme spam ». */
        headers: {
          "List-Unsubscribe": "<" + LIEN + "/.netlify/functions/alertes?d=" + encodeURIComponent(e.abonne.jeton) + ">",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        } });
      if (!r.envoye) continue;
      /* Le plafond hebdomadaire n'a de sens que si on note l'envoi, et la regle
         « un atelier n'est annonce qu'une fois » que si on note QUOI a ete
         annonce. Sans cette seconde ligne, le meme atelier repartait chaque
         semaine jusqu'a sa date : huit fois pour un atelier a deux mois. */
      const cle = parMail.get(e.abonne.mail);
      if (cle) {
        const frais = await s.get(cle, { type: "json" }).catch(() => null);
        if (frais) {
          frais.dernierEnvoi = now;
          frais.annonces = A.memoireApres(frais, e.ateliers, now);
          await s.setJSON(cle, frais);
        }
      }
      envoyes++;
    } catch (err) { /* un envoi qui échoue ne doit pas arrêter les autres */ }
  }

  return { statusCode: 200, body: "alertes envoyées: " + envoyes + ", inscriptions non confirmées effacées: " + purges };
};

/* LES CONSTRUCTEURS, EXPOSES POUR L'APERCU DE /admin/. Le tableau de bord
   affiche chaque courriel tel qu'il part, en appelant ces fonctions-la avec
   des donnees d'exemple : une copie du contenu ailleurs aurait derive.
   Rien n'est envoye par cette porte, elle ne fait que construire. */
exports._courriels = {
  annonce: contenu
};
