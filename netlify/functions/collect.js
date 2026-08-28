/* Mesure d'audience sans cookie ni traceur (première partie, même origine).
   Reçoit une vue de page anonyme et l'agrège par jour dans Netlify Blobs.
   Aucune donnée personnelle : pas de cookie, pas d'adresse IP stockée, pas
   d'identifiant de visiteur. Conforme à une mesure d'audience exemptée de
   consentement (CNIL) : agrégats seulement, aucun suivi entre sites.

   POST JSON : { p: chemin, r: hôte référent, u: 0|1 (vue unique/onglet), l: langue }
*/
const { getStore } = require("@netlify/blobs");

const MAX_PAGES = 300;   // bornes pour éviter une croissance illimitée
const MAX_REFS = 200;

function store() { return getStore({ name: "audience", consistency: "strong" }); }
const json = (statut, corps) => ({
  statusCode: statut,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(corps)
});

// Nettoie un chemin : commence par "/", sans requête ni fragment, longueur bornée.
function nettoyerChemin(p) {
  if (typeof p !== "string") return null;
  p = p.split("?")[0].split("#")[0].trim();
  if (!p || p[0] !== "/") return null;
  if (p.length > 128) p = p.slice(0, 128);
  return p;
}
// Réduit un référent à un hôte court (ou "direct"). Jamais d'URL complète.
function nettoyerRef(r) {
  if (typeof r !== "string" || !r) return "direct";
  r = r.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (!r || r.length > 64 || !/^[a-z0-9.\-]+$/.test(r)) return "autre";
  return r;
}
function jourUTC() { return new Date().toISOString().slice(0, 10); }

function incr(dict, cle, max) {
  if (cle in dict) { dict[cle]++; return; }
  if (Object.keys(dict).length < max) dict[cle] = 1;
  else dict.autres = (dict.autres || 0) + 1;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });

  let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
  const chemin = nettoyerChemin(d.p);
  if (!chemin) return json(204, {}); // rien d'exploitable : on ignore silencieusement
  const ref = nettoyerRef(d.r);
  const unique = d.u ? 1 : 0;
  const lang = d.l === "en" ? "en" : "fr";

  const st = store();
  const cle = "j:" + jourUTC();
  for (let essai = 0; essai < 6; essai++) {
    let cur = null, etag = null;
    try {
      const res = await st.getWithMetadata(cle, { type: "json" });
      if (res) { cur = res.data; etag = res.etag; }
    } catch (e) { /* premier écrit du jour */ }
    const j = cur || { vues: 0, uniques: 0, pages: {}, refs: {}, langues: { fr: 0, en: 0 } };
    j.vues++;
    j.uniques += unique;
    j.langues[lang] = (j.langues[lang] || 0) + 1;
    incr(j.pages, chemin, MAX_PAGES);
    incr(j.refs, ref, MAX_REFS);
    try {
      const w = await st.setJSON(cle, j, etag ? { onlyIfMatch: etag } : {});
      if (w && w.modified === false) continue; // écriture concurrente : on rejoue
      return json(204, {});
    } catch (e) { /* on retente */ }
  }
  return json(204, {}); // la mesure n'est jamais bloquante
};
