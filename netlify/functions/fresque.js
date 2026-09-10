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
const { getStore, connectLambda } = require("@netlify/blobs");
const R = require("../../serveur/src/regles.js");
const L = require("../../serveur/src/limites.js");

const TTL_MS = 12 * 60 * 60 * 1000;     // 12 h d'existence (A9.4)
const INACTIF_MS = 2 * 60 * 60 * 1000;  // 2 h sans activité

// Garde-fous : limitation de débit par IP (B9). Fenêtres glissantes simples,
// comptées dans un magasin Blobs séparé. Les valeurs sont volontairement
// généreuses : elles n'entravent pas un usage normal (un atelier = une création,
// huit personnes qui rejoignent), mais coupent les abus automatisés.

// Balayage des sessions expirées (B9) : au plus une fois par cette période,
// déclenché de façon opportuniste lors d'une création.
const BALAYAGE_MS = 15 * 60 * 1000;

function store() { return getStore({ name: "fresque-sessions" }); }
function storeAteliers() { return getStore({ name: "fresque-ateliers" }); }
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

// Ces enveloppes appliquent la logique PURE de serveur/src/limites.js au magasin
// Blobs. Le compteur n'est pas critique : en cas d'erreur du magasin, on laisse passer.
async function atteinte(seau, cleCompteur) {
  const s = L.SEUILS[seau];
  try {
    const res = await limites().getWithMetadata(seau + ":" + cleCompteur, { type: "json" });
    return L.atteinte(res && res.data, Date.now(), s.limite, s.fenetreMs);
  } catch (e) {
    return false;
  }
}

// Incrémente le compteur de la fenêtre courante.
async function incrementer(seau, cleCompteur) {
  const s = L.SEUILS[seau];
  const lim = limites();
  try {
    const k = seau + ":" + cleCompteur;
    const res = await lim.getWithMetadata(k, { type: "json" });
    await lim.setJSON(k, L.incrementer(res && res.data, Date.now(), s.fenetreMs));
  } catch (e) {}
}

// Vérifie puis incrémente (limite classique par fenêtre fixe).
async function depasse(seau, cleCompteur) {
  if (await atteinte(seau, cleCompteur)) return true;
  await incrementer(seau, cleCompteur);
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

// Lien de visioconference d'un atelier programme (store des ateliers). Toujours
// optionnel : si l'atelier n'existe pas ou que le store est indisponible, on
// ouvre la session sans lien (aucune erreur visible).
async function visioAtelier(code) {
  try {
    const res = await lireBrut(storeAteliers(), "atelier:" + code);
    const v = res && res.data && res.data.visio;
    return typeof v === "string" && /^https:\/\//i.test(v) ? v : null;
  } catch (e) { return null; }
}
// LECTURE EN COHERENCE FORTE. Par defaut, Netlify Blobs sert des lectures
// « eventuellement coherentes » : apres l'ecriture de A, la lecture de B peut
// renvoyer l'ancienne valeur pendant plusieurs secondes. C'etait la cause des
// ~5 s de latence ressentis sur TOUTES les actions (la boucle d'attente relisait
// en boucle une valeur perimee). En coherence forte, la lecture voit toujours la
// derniere ecriture : la propagation retombe au temps d'un aller-retour.
// Repli : si la plateforme refuse la coherence forte sur ce type de fonction,
// on le constate UNE fois et on repasse en lecture normale pour toute la duree
// de l'instance (le service continue de marcher, simplement moins direct).
let fort = true;
async function lireBrut(st, k) {
  if (fort) {
    try { return await st.getWithMetadata(k, { type: "json", consistency: "strong" }); }
    catch (e) { fort = false; }
  }
  return st.getWithMetadata(k, { type: "json" });
}
async function lire(st, code) {
  const res = await lireBrut(st, cle(code));
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
    if (!cur) return { erreur: { statut: 404, code: "session_inconnue", message: "Code inconnu, ou séance pas encore ouverte par l'animateur·ice. Vérifiez le code et réessayez peu avant le début." } };
    if (expiree(cur.s)) { try { await st.delete(cle(code)); } catch (e) {} return { erreur: { statut: 404, code: "session_inconnue", message: "Session terminée." } }; }
    const out = fn(cur.s);
    const w = await ecrire(st, code, cur.s, cur.etag);
    if (w && w.modified === false) continue; // quelqu'un a écrit entre-temps : on rejoue
    return { out, s: cur.s };
  }
  return { erreur: { statut: 409, code: "conflit", message: "Trop de monde écrit en même temps, réessayez." } };
}

exports.handler = async (event) => {
  try { connectLambda(event); } catch (e) {}
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {} };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });

  let d; try { d = JSON.parse(event.body || "{}"); } catch { d = {}; }
  const st = store();
  const ip = ipClient(event);

  try {
    if (d.op === "creer") {
      if (await depasse("creation", ip)) {
        return json(429, { refus: { code: "trop_de_creations", message: "Trop de sessions créées depuis cette connexion. Réessayez dans un moment." } });
      }
      await balayer(st);
      const prenom = d.prenom;
      let code = null;
      // Code reserve (atelier programme) transmis par l'animateur : on ouvre la
      // session AVEC ce code s'il est libre ; s'il existe deja, on le signale
      // pour que le client bascule sur une reprise (rejoindre).
      const souhaite = String(d.code || "").toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(souhaite)) {
        const exist = await lire(st, souhaite);
        if (exist) return json(200, { existe: true, code: souhaite });
        code = souhaite;
      }
      for (let i = 0; i < 8 && !code; i++) {
        const cand = R.nouveauCode({});
        const exist = await lire(st, cand);
        if (!exist) code = cand;
      }
      if (!code) return json(500, { error: "Impossible de créer la session." });
      // Lien visio de l'atelier programme : l'animateur le retrouve dans le
      // tableau (panneau Participants) sans avoir a rouvrir son e-mail.
      const c = R.creer(prenom, code, await visioAtelier(code));
      c.session.jetons[c.jeton] = { role: "animateur", id: c.idAnim };
      await ecrire(st, code, c.session, null);
      return json(200, { code, jeton: c.jeton, role: "animateur", etat: R.vue(c.session) });
    }

    if (d.op === "rejoindre") {
      const code = String(d.code || "").toUpperCase();
      if (await depasse("entree", ip)) {
        return json(429, { refus: { code: "trop_de_tentatives", message: "Trop de tentatives depuis cette connexion. Patientez une minute." } });
      }
      // Compteur dédié aux codes inconnus : freine la recherche de codes par force brute
      // sans pénaliser une reprise légitime. On le vérifie avant, mais on ne l'incrémente
      // que si le code se révèle réellement inconnu (plus bas).
      if (await atteinte("codes", ip)) {
        return json(429, { refus: { code: "trop_de_codes", message: "Trop de codes erronés. Vérifiez le code et patientez une minute." } });
      }
      const r = await muter(st, code, (s) => R.rejoindre(s, d.prenom, d.jeton));
      if (r.erreur) {
        if (r.erreur.code === "session_inconnue") await incrementer("codes", ip);
        return json(r.erreur.statut, { refus: r.erreur });
      }
      if (r.out && r.out.refus) return json(200, { refus: r.out.refus });
      R.toucher(r.s, r.out.jeton);
      return json(200, { jeton: r.out.jeton, role: r.out.role, moi: r.out.id || null, etat: R.vue(r.s) });
    }

    if (d.op === "etat") {
      const code = String(d.code || "").toUpperCase();
      let cur = await lire(st, code);
      if (!cur) return json(404, { refus: { code: "session_inconnue", message: "Code inconnu, ou séance pas encore ouverte par l'animateur·ice." } });
      let s = cur.s;
      if (expiree(s)) { try { await st.delete(cle(code)); } catch (e) {} return json(404, { refus: { code: "session_inconnue", message: "Session terminée." } }); }
      // Heartbeat de presence : on ne reecrit le blob que si vuLe est ancien
      // (> 5 s), pour eviter un write a chaque poll (contention etag) et garder
      // un polling rapide fluide. La presence (seuil 15 s) reste a jour.
      const info = s.jetons[d.jeton];
      if (info) {
        const cible = info.role === "animateur" ? s.animateur : s.participants.find((p) => p.id === info.id);
        if (cible && (!cible.connecte || Date.now() - (cible.vuLe || 0) > 5000)) {
          cible.connecte = true; cible.vuLe = Date.now();
          try { const w = await ecrire(st, code, s, cur.etag); if (w && w.modified === false) { cur = await lire(st, code); if (cur) s = cur.s; } } catch (e) {}
        }
      }
      let etat = R.vue(s);
      // Attente maintenue ("hold-poll") : si le client est deja a jour, on ne
      // renvoie pas tout de suite « inchange ». On garde la requete ouverte et on
      // relit l'etat a petits intervalles jusqu'a ce que la version change (une
      // action d'un·e autre joueur·se) ou qu'un court delai s'ecoule. Resultat :
      // les autres voient l'action en ~0,3 s au lieu d'attendre le prochain
      // sondage, tout en divisant le nombre de requetes (une requete tenue vaut
      // des dizaines de sondages). Le client se rabat sur un sondage bref si la
      // plateforme coupe la requete.
      if (d.version && d.version === etat.version) {
        const finAvant = Date.now() + 8000;   // marge sous la limite de la fonction
        while (Date.now() < finAvant) {
          await new Promise((r) => setTimeout(r, 120));
          const c2 = await lire(st, code);
          if (!c2) break;                       // session supprimee entre-temps
          const e2 = R.vue(c2.s);
          if (e2.version !== d.version) { return json(200, { etat: e2 }); }
        }
        return json(200, { inchange: true, version: etat.version });
      }
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
