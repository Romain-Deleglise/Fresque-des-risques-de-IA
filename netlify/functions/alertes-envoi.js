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
const h = G.h, mailHtml = G.mailHtml, bouton = G.bouton, dateLisible = G.dateLisible;

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");

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
  const ou = a.mode === "enligne" ? "en ligne" : (a.lieu || "");
  const places = Math.max(0, (Number(a.maxParticipants) || 0) - ((a.participants || []).length));
  return { quand: quand, ou: ou, places: places, url: LIEN + "/participer/#atelier-" + a.code };
}

function contenu(abonne, ateliers) {
  const g = A.grouper(ateliers);
  const desabo = LIEN + "/alertes/?d=" + encodeURIComponent(abonne.jeton);
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

  const section = (titre, liste) => {
    l.push("");
    l.push(titre.toUpperCase());
    c.push('<p style="margin:18px 0 8px;font-weight:700;color:#9a4d0f;">' + h(titre) + "</p>");
    liste.forEach((a) => {
      const x = ligneAtelier(a);
      l.push("- " + x.quand + (x.places ? " (" + x.places + " place" + (x.places > 1 ? "s" : "") + ")" : "") + " : " + x.url);
      c.push('<p style="margin:0 0 8px;padding:10px 12px;border:1px solid #eee;border-radius:8px;">'
        + '<strong>' + h(x.quand) + "</strong>"
        + (x.places ? ' <span style="color:#6b665e;font-size:13px;">' + x.places + " place" + (x.places > 1 ? "s" : "") + " restante" + (x.places > 1 ? "s" : "") + "</span>" : "")
        + '<br><a href="' + h(x.url) + '" style="color:#B0560A;">S’inscrire</a></p>');
    });
  };

  if (g.enligne.length) section("En ligne", g.enligne);
  g.villes.forEach((v) => section(v.ville || "Près de chez vous", v.ateliers));

  l.push("");
  l.push("Voir tous les ateliers : " + LIEN + "/participer/");
  c.push('<p style="margin:20px 0 0;text-align:center;">' + bouton(LIEN + "/participer/", "Voir tous les ateliers") + "</p>");

  /* LE DESABONNEMENT EN BAS, EN CLAIR, EN UN CLIC. C'est la contrepartie du
     droit de leur ecrire. */
  l.push("");
  l.push("Vous recevez ce message parce que vous avez demandé à être prévenu·e des prochains ateliers. Au plus un message par semaine, et rien s'il n'y a rien près de chez vous.");
  l.push("Se désabonner en un clic : " + desabo);
  c.push('<hr style="border:0;border-top:1px solid #eee;margin:24px 0 14px;">');
  c.push('<p style="margin:0 0 6px;font-size:13px;color:#6b665e;">Vous recevez ce message parce que vous avez demandé à être prévenu·e des prochains ateliers. Au plus un message par semaine, et rien s\'il n\'y a rien près de chez vous.</p>');
  c.push('<p style="margin:0;font-size:13px;"><a href="' + h(desabo) + '" style="color:#6b665e;text-decoration:underline;">Se désabonner en un clic</a></p>');

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
  let envoyes = 0;

  for (const e of envois) {
    try {
      const m = contenu(e.abonne, e.ateliers);
      const sujet = e.ateliers.length === 1
        ? "Un atelier de la Fresque des risques de l'IA près de chez vous"
        : e.ateliers.length + " ateliers de la Fresque des risques de l'IA";
      const r = await mail.envoi({ to: [e.abonne.mail], subject: sujet, text: m.text, html: m.html });
      if (!r.envoye) continue;
      // Le plafond hebdomadaire n'a de sens que si on note l'envoi.
      const cle = parMail.get(e.abonne.mail);
      if (cle) {
        const frais = await s.get(cle, { type: "json" }).catch(() => null);
        if (frais) { frais.dernierEnvoi = now; await s.setJSON(cle, frais); }
      }
      envoyes++;
    } catch (err) { /* un envoi qui échoue ne doit pas arrêter les autres */ }
  }

  return { statusCode: 200, body: "alertes envoyées: " + envoyes };
};
