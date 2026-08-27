/* Service de sessions de la Fresque en ligne (Netlify Function).
   État partagé via Netlify Blobs ; le serveur est l'autorité (règles pures
   dans serveur/src/regles.js). Le client interroge périodiquement (polling),
   ce qui satisfait la tolérance de 5-10 s du cahier des charges (B5.2 / B8.2).

   Opérations (POST JSON { op, ... }) :
     creer {prenom}                 -> { code, jeton, role, etat }
     rejoindre {code, prenom, jeton}-> { jeton, role, etat }  (reprise si jeton connu)
     etat {code, jeton, version}    -> { etat } ou { inchange:true }
     agir {code, jeton, intention}  -> { etat } ou { refus }
*/
const { getStore } = require("@netlify/blobs");
const R = require("../../serveur/src/regles.js");

const TTL_MS = 12 * 60 * 60 * 1000;     // 12 h d'existence (A9.4)
const INACTIF_MS = 2 * 60 * 60 * 1000;  // 2 h sans activité

function store() { return getStore({ name: "fresque-sessions", consistency: "strong" }); }
function cle(code) { return "session:" + code; }
const json = (statut, corps) => ({
  statusCode: statut,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(corps)
});

async function lire(st, code) {
  const res = await st.getWithMetadata(cle(code), { type: "json" });
  return res ? { s: res.data, etag: res.etag } : null;
}
async function ecrire(st, code, s, etag) {
  const opts = etag ? { onlyIfMatch: etag } : {};
  return st.setJSON(cle(code), s, opts); // { modified: bool }
}

function expiree(s) {
  const now = Date.now();
  if (now - s.creeLe > TTL_MS) return true;
  const vus = [s.animateur.vuLe || 0].concat(s.participants.map((p) => p.vuLe || 0));
  return now - Math.max.apply(null, vus) > INACTIF_MS;
}

// lecture-modification-écriture avec quelques essais (concurrence optimiste)
async function muter(st, code, fn) {
  for (let essai = 0; essai < 6; essai++) {
    const cur = await lire(st, code);
    if (!cur) return { erreur: { statut: 404, code: "session_inconnue", message: "Code inconnu ou session terminée." } };
    if (expiree(cur.s)) { try { await st.delete(cle(code)); } catch (e) {} return { erreur: { statut: 404, code: "session_inconnue", message: "Session terminée." } }; }
    const out = fn(cur.s);
    const w = await ecrire(st, code, cur.s, cur.etag);
    if (w && w.modified === false) continue; // quelqu'un a écrit entre-temps : on rejoue
    return { out, s: cur.s };
  }
  return { erreur: { statut: 409, code: "conflit", message: "Trop de monde écrit en même temps, réessayez." } };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });

  let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
  const st = store();

  try {
    if (d.op === "creer") {
      const prenom = d.prenom;
      let code = null;
      for (let i = 0; i < 8 && !code; i++) {
        const cand = R.nouveauCode({});
        const exist = await lire(st, cand);
        if (!exist) code = cand;
      }
      if (!code) return json(500, { error: "Impossible de créer la session." });
      const c = R.creer(prenom, code);
      c.session.jetons[c.jeton] = { role: "animateur", id: c.idAnim };
      await ecrire(st, code, c.session, null);
      return json(200, { code, jeton: c.jeton, role: "animateur", etat: R.vue(c.session) });
    }

    if (d.op === "rejoindre") {
      const code = String(d.code || "").toUpperCase();
      const r = await muter(st, code, (s) => R.rejoindre(s, d.prenom, d.jeton));
      if (r.erreur) return json(r.erreur.statut, { refus: r.erreur });
      if (r.out && r.out.refus) return json(200, { refus: r.out.refus });
      R.toucher(r.s, r.out.jeton);
      return json(200, { jeton: r.out.jeton, role: r.out.role, etat: R.vue(r.s) });
    }

    if (d.op === "etat") {
      const code = String(d.code || "").toUpperCase();
      const r = await muter(st, code, (s) => { R.toucher(s, d.jeton); });
      if (r.erreur) return json(r.erreur.statut, { refus: r.erreur });
      const etat = R.vue(r.s);
      if (d.version && d.version === etat.version) return json(200, { inchange: true, version: etat.version });
      return json(200, { etat });
    }

    if (d.op === "agir") {
      const code = String(d.code || "").toUpperCase();
      const r = await muter(st, code, (s) => { R.toucher(s, d.jeton); return R.appliquer(s, d.jeton, d.intention || {}); });
      if (r.erreur) return json(r.erreur.statut, { refus: r.erreur });
      if (r.out && r.out.refus) return json(200, { refus: r.out.refus, etat: R.vue(r.s) });
      return json(200, { etat: R.vue(r.s), resultat: r.out && r.out.resultat });
    }

    return json(400, { error: "Opération inconnue." });
  } catch (e) {
    return json(500, { error: "Erreur du service de sessions.", details: String(e && e.message || e) });
  }
};
