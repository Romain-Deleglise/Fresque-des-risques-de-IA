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

// Garde-fous : limitation de débit par IP (B9). Fenêtres glissantes simples,
// comptées dans un magasin Blobs séparé. Les valeurs sont volontairement
// généreuses : elles n'entravent pas un usage normal (un atelier = une création,
// huit personnes qui rejoignent), mais coupent les abus automatisés.
const LIM_CREATION = 10;        // sessions créées par IP et par heure
const LIM_CREATION_MS = 60 * 60 * 1000;
const LIM_ENTREE = 60;          // tentatives pour rejoindre, par IP et par minute
const LIM_ENTREE_MS = 60 * 1000;
const LIM_CODES_INCONNUS = 20;  // codes inconnus tolérés par IP et par minute
const LIM_CODES_MS = 60 * 1000;

// Balayage des sessions expirées (B9) : au plus une fois par cette période,
// déclenché de façon opportuniste lors d'une création.
const BALAYAGE_MS = 15 * 60 * 1000;

function store() { return getStore({ name: "fresque-sessions", consistency: "strong" }); }
function limites() { return getStore({ name: "fresque-limites" }); }
function cle(code) { return "session:" + code; }
const json = (statut, corps) => ({
  statusCode: statut,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(corps)
});

// IP du client, telle que fournie par Netlify (en-têtes de confiance côté plateforme).
function ipClient(event) {
  const h = event.headers || {};
  const brut = h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "inconnue";
  return String(brut).split(",")[0].trim() || "inconnue";
}

// Compteur à fenêtre fixe : renvoie true si la limite est déjà atteinte (sans incrémenter).
// Le compteur n'est pas critique : en cas d'erreur du magasin, on laisse passer.
async function atteinte(seau, cleCompteur, limite, fenetreMs) {
  const lim = limites();
  try {
    const now = Date.now();
    const k = seau + ":" + cleCompteur;
    const res = await lim.getWithMetadata(k, { type: "json" });
    const c = res && res.data;
    if (!c || (now - c.debut) > fenetreMs) return false;
    return c.n >= limite;
  } catch (e) {
    return false;
  }
}

// Incrémente le compteur de la fenêtre courante.
async function incrementer(seau, cleCompteur, fenetreMs) {
  const lim = limites();
  try {
    const now = Date.now();
    const k = seau + ":" + cleCompteur;
    const res = await lim.getWithMetadata(k, { type: "json" });
    let c = res && res.data;
    if (!c || (now - c.debut) > fenetreMs) c = { debut: now, n: 0 };
    c.n += 1;
    await lim.setJSON(k, c);
  } catch (e) {}
}

// Vérifie puis incrémente (limite classique par fenêtre fixe).
async function depasse(seau, cleCompteur, limite, fenetreMs) {
  if (await atteinte(seau, cleCompteur, limite, fenetreMs)) return true;
  await incrementer(seau, cleCompteur, fenetreMs);
  return false;
}

// Balaye les sessions expirées, au plus une fois par BALAYAGE_MS (marqueur partagé).
async function balayer(st) {
  const lim = limites();
  const now = Date.now();
  try {
    const marq = await lim.getWithMetadata("balayage", { type: "json" });
    if (marq && marq.data && (now - marq.data.le) < BALAYAGE_MS) return;
    await lim.setJSON("balayage", { le: now }); // pose le marqueur avant de travailler
  } catch (e) {
    return; // sans marqueur fiable on n'insiste pas, la suppression paresseuse suffit
  }
  try {
    const { blobs } = await st.list({ prefix: "session:" });
    for (const b of blobs) {
      try {
        const res = await st.getWithMetadata(b.key, { type: "json" });
        if (res && res.data && expiree(res.data)) await st.delete(b.key);
      } catch (e) {}
    }
  } catch (e) {}
}

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
  const ip = ipClient(event);

  try {
    if (d.op === "creer") {
      if (await depasse("creation", ip, LIM_CREATION, LIM_CREATION_MS)) {
        return json(429, { refus: { code: "trop_de_creations", message: "Trop de sessions créées depuis cette connexion. Réessayez dans un moment." } });
      }
      await balayer(st);
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
      if (await depasse("entree", ip, LIM_ENTREE, LIM_ENTREE_MS)) {
        return json(429, { refus: { code: "trop_de_tentatives", message: "Trop de tentatives depuis cette connexion. Patientez une minute." } });
      }
      // Compteur dédié aux codes inconnus : freine la recherche de codes par force brute
      // sans pénaliser une reprise légitime. On le vérifie avant, mais on ne l'incrémente
      // que si le code se révèle réellement inconnu (plus bas).
      if (await atteinte("codes", ip, LIM_CODES_INCONNUS, LIM_CODES_MS)) {
        return json(429, { refus: { code: "trop_de_codes", message: "Trop de codes erronés. Vérifiez le code et patientez une minute." } });
      }
      const r = await muter(st, code, (s) => R.rejoindre(s, d.prenom, d.jeton));
      if (r.erreur) {
        if (r.erreur.code === "session_inconnue") await incrementer("codes", ip, LIM_CODES_MS);
        return json(r.erreur.statut, { refus: r.erreur });
      }
      if (r.out && r.out.refus) return json(200, { refus: r.out.refus });
      R.toucher(r.s, r.out.jeton);
      return json(200, { jeton: r.out.jeton, role: r.out.role, moi: r.out.id || null, etat: R.vue(r.s) });
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
