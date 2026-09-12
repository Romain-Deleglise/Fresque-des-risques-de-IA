/* SURVEILLANCE (Netlify Scheduled Function, toutes les 15 minutes).

   POURQUOI. Sur ce projet, ce qui casse ne fait rien tomber. Le service de
   sessions perd l'ecriture conditionnelle et le tableau perd une action de
   temps en temps. Le relais n'est pas redeploye et les deplacements en direct
   disparaissent. Le relais tombe et le direct devient un sondage. Dans les
   trois cas le site repond 200, rien n'apparait nulle part, et on l'apprend en
   atelier, devant des gens. Les trois sont deja arrives.

   CE QU'ELLE VERIFIE, comme un participant le ferait :
     1. le service de sessions repond, et son autodiagnostic est au vert
        (ecriture conditionnelle operante) ;
     2. le relais repond, et sa version de protocole est au moins celle
        qu'attend le client du site.

   CE QU'ELLE ENVOIE. Un e-mail a la PREMIERE panne, un autre au retablissement,
   et rien entre les deux : une alerte qui se repete toutes les quinze minutes
   finit par etre filtree, et c'est alors comme si elle n'existait pas. L'etat
   est garde dans le magasin ; sans magasin, on prefere alerter une fois de trop
   que se taire.

   Sans RESEND_API_KEY, elle observe et journalise, mais n'envoie rien. */
"use strict";
const { getStore } = require("@netlify/blobs");
const mail = require("./lib/mail.js");

const LIEN = (process.env.SITE_URL || "https://fresquedesrisquesdelia.org").replace(/\/+$/, "");
const RELAIS = (process.env.RELAIS_URL || "https://curseurs.pauseia.fr").replace(/\/+$/, "");
// Doit rester egale a RELAIS_MINI dans site/en-ligne/session/session.js : c'est
// la version de protocole que le client exige pour avoir toutes ses fonctions.
const RELAIS_MINI = Number(process.env.RELAIS_MINI || 4);
const DEST = process.env.MAIL_ALERTE || "contact@pauseia.fr";
const CLE = "surveillance:etat";
const DELAI = 12000;

function store() { return getStore({ name: "fresque-limites" }); }

async function avecDelai(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})); }
  finally { clearTimeout(t); }
}

async function verifierSessions() {
  const url = LIEN + "/.netlify/functions/fresque";
  try {
    const r = await avecDelai(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "sante" })
    });
    if (!r.ok) return ["Le service de sessions repond " + r.status + " (" + url + ")."];
    const d = await r.json();
    const pb = [];
    if (d.ecritureConditionnelle !== "oui") {
      pb.push("Le service de sessions a PERDU l'ecriture conditionnelle : deux actions simultanees "
        + "peuvent se recouvrir, et le tableau perdra des cartes sans rien signaler. "
        + (d.details && d.details.length ? d.details.join(" ") : ""));
    }
    return pb;
  } catch (e) {
    return ["Le service de sessions est injoignable (" + String(e && e.message || e) + ")."];
  }
}

async function verifierRelais() {
  const url = RELAIS + "/sante";
  try {
    const r = await avecDelai(url);
    if (r.status === 404) {
      return ["Le relais repond mais n'a pas de point de sante : il tourne donc dans une version "
        + "anterieure a celle du depot. Ses fonctions recentes sont absentes, en silence. "
        + "Redeployer infra/curseurs/server.js."];
    }
    if (!r.ok) return ["Le relais repond " + r.status + " (" + url + ")."];
    const d = await r.json();
    const v = Number(d && d.v) || 0;
    if (v < RELAIS_MINI) {
      return ["Le relais est en version " + v + ", le site en attend au moins " + RELAIS_MINI
        + ". Les deplacements de cartes en direct sont probablement perdus, sans message d'erreur. "
        + "Redeployer infra/curseurs/server.js."];
    }
    return [];
  } catch (e) {
    return ["Le relais est injoignable (" + String(e && e.message || e) + "). Le tableau reste "
      + "utilisable mais retombe sur le sondage : plus de curseurs, plus de deplacements en direct."];
  }
}

async function lireEtat() {
  try {
    const r = await store().get(CLE, { type: "json" });
    return r && typeof r === "object" ? r : null;
  } catch (e) { return null; }
}
async function ecrireEtat(v) { try { await store().setJSON(CLE, v); } catch (e) {} }

async function alerter(sujet, texte) {
  const r = await mail.envoi({ to: [DEST], subject: sujet, text: texte, _interne: true });
  console.log(JSON.stringify({ fn: "surveillance", evt: "alerte", envoye: r.envoye, raison: r.raison || null }));
}

exports.handler = async function () {
  const [pbS, pbR] = await Promise.all([verifierSessions(), verifierRelais()]);
  const pb = pbS.concat(pbR);
  const avant = await lireEtat();
  const etaitEnPanne = !!(avant && avant.panne);
  const now = new Date().toISOString();

  console.log(JSON.stringify({ fn: "surveillance", evt: "controle", pannes: pb.length, details: pb }));

  if (pb.length) {
    const meme = etaitEnPanne && JSON.stringify(avant.pb) === JSON.stringify(pb);
    await ecrireEtat({ panne: true, pb: pb, depuis: (avant && avant.depuis) || now, vu: now });
    if (meme) return { statusCode: 200, body: "panne connue" };   // deja signale : on se tait
    await alerter("[Fresque] " + pb.length + " probleme" + (pb.length > 1 ? "s" : "") + " sur le service en ligne",
      "La surveillance automatique a detecte ceci :\n\n"
      + pb.map(function (p, i) { return (i + 1) + ". " + p; }).join("\n\n")
      + "\n\nControle effectue le " + now + "."
      + "\nSessions : " + LIEN + "/.netlify/functions/fresque  (POST {\"op\":\"sante\"})"
      + "\nRelais   : " + RELAIS + "/sante"
      + "\n\nCe message n'est envoye qu'une fois par panne. Un autre suivra au retablissement.");
    return { statusCode: 200, body: "alerte envoyee" };
  }

  await ecrireEtat({ panne: false, vu: now });
  if (etaitEnPanne) {
    await alerter("[Fresque] Tout est revenu a la normale",
      "Le service de sessions et le relais repondent de nouveau normalement.\n\n"
      + "La panne avait ete signalee le " + (avant.depuis || "?") + ".\n"
      + "Retablissement constate le " + now + ".");
  }
  return { statusCode: 200, body: "ok" };
};
