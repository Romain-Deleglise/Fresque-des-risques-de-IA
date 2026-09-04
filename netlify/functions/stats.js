/* Lecture des agrégats d'audience (JSON). Aucune donnée personnelle.
   GET /.netlify/functions/stats?jours=30[&key=...]
   Si la variable d'environnement AUDIENCE_KEY est définie, la clé est exigée
   (protège l'accès aux chiffres) ; sinon l'accès est ouvert (chiffres non sensibles).
*/
const { getStore, connectLambda } = require("@netlify/blobs");

function store() { return getStore({ name: "audience", consistency: "strong" }); }
const json = (statut, corps) => ({
  statusCode: statut,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(corps)
});

function joursRecents(n) {
  const out = [];
  const t = Date.now();
  for (let i = 0; i < n; i++) out.push(new Date(t - i * 86400000).toISOString().slice(0, 10));
  return out;
}
function fusionner(cible, dict) {
  Object.keys(dict || {}).forEach(function (k) { cible[k] = (cible[k] || 0) + dict[k]; });
}
function topN(dict, n) {
  return Object.keys(dict).map(function (k) { return { nom: k, n: dict[k] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, n);
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) {}
  if (event.httpMethod !== "GET") return json(405, { error: "Méthode non autorisée" });
  const q = event.queryStringParameters || {};
  const attendue = process.env.AUDIENCE_KEY;
  if (attendue && q.key !== attendue) return json(401, { error: "Clé requise ou invalide." });

  const n = Math.max(1, Math.min(90, parseInt(q.jours, 10) || 30));
  const st = store();
  const jours = joursRecents(n);
  const parJour = [];
  let vues = 0, uniques = 0;
  const pages = {}, refs = {}, langues = { fr: 0, en: 0 };

  for (const jr of jours) {
    let data = null;
    try { const res = await st.getWithMetadata("j:" + jr, { type: "json" }); if (res) data = res.data; } catch (e) {}
    if (data) {
      vues += data.vues || 0; uniques += data.uniques || 0;
      fusionner(pages, data.pages); fusionner(refs, data.refs); fusionner(langues, data.langues);
      parJour.push({ jour: jr, vues: data.vues || 0, uniques: data.uniques || 0 });
    } else {
      parJour.push({ jour: jr, vues: 0, uniques: 0 });
    }
  }
  parJour.reverse(); // du plus ancien au plus récent

  return json(200, {
    periode: { jours: n, du: jours[jours.length - 1], au: jours[0] },
    total: { vues: vues, uniques: uniques, langues: langues },
    parJour: parJour,
    topPages: topN(pages, 20),
    topReferents: topN(refs, 20)
  });
};
