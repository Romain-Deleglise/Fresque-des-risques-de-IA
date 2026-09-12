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

// PAS DE COHERENCE FORTE ICI, et ce n'est pas un oubli. Dans une fonction au
// format « lambda » (exports.handler + connectLambda), @netlify/blobs ne recoit
// du runtime que `edgeURL` : `uncachedEdgeURL`, la seule adresse capable de
// servir une lecture fortement coherente, n'existe pas. Toute requete demandant
// `consistency: "strong"` y leve donc BlobsConsistencyError -- LECTURES COMME
// ECRITURES, car l'option posee sur le magasin s'applique a chaque appel.
// Demander la coherence forte sur le magasin mettait ainsi tout le service a
// terre : « Erreur du service de sessions » des la creation. La fraicheur du
// direct ne vient de toute facon pas d'ici mais du relais WebSocket, qui pousse
// l'etat complet aux autres ; le magasin reste l'autorite et la memoire.
function store() { return getStore({ name: "fresque-sessions" }); }
function storeAteliers() { return getStore({ name: "fresque-ateliers" }); }
function storePresence() { return getStore({ name: "fresque-presence" }); }
function limites() { return getStore({ name: "fresque-limites" }); }
function cle(code) { return "session:" + code; }
function clePres(code) { return "presence:" + code; }
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
// Lecture simple. Netlify Blobs sert ici des lectures « eventuellement
// coherentes » : apres une ecriture, une lecture peut renvoyer l'ancienne valeur
// pendant un court moment. On ne peut pas y echapper dans une fonction lambda
// (voir store() ci-dessus), et on n'essaie plus : l'essai etait voue a echouer a
// tous les coups. Ce qui rend le tableau direct, c'est le relais WebSocket, qui
// transmet aux autres l'etat complet renvoye a l'auteur de l'action ; le sondage
// qui continue en fond ne sert qu'a corriger les ecarts.
async function lireBrut(st, k) {
  return st.getWithMetadata(k, { type: "json" });
}
async function lire(st, code) {
  const res = await lireBrut(st, cle(code));
  return res ? { s: res.data, etag: res.etag } : null;
}
// ECRITURE CONDITIONNELLE (`onlyIfMatch`). Elle n'existait pas dans
// @netlify/blobs 8.x : `setJSON` y ignorait l'option en silence et ne renvoyait
// rien, si bien que deux ecritures simultanees se recouvraient et qu'une action
// pouvait disparaitre sans laisser de trace. Depuis la 9, le magasin compare
// l'etag et repond `{ modified: false }` s'il a change entre-temps : `muter`
// rejoue alors. Le code reste ecrit pour fonctionner dans les DEUX cas : si la
// plateforme ne rend pas de verdict, on retombe simplement sur l'ancien
// comportement (derniere ecriture gagnante) plutot que de bloquer.
async function ecrire(st, code, s, etag) {
  const opts = etag ? { onlyIfMatch: etag } : {};
  return st.setJSON(cle(code), s, opts); // { modified: bool }
}

/* PRESENCE : UN MAGASIN A PART, ET C'EST LE POINT IMPORTANT ---------------
   Le battement de presence (« je suis toujours la ») s'ecrivait avant DANS le
   document de session, a chaque sondage. C'etait la cause des pires symptomes
   du tableau : une carte posee qui n'arrivait jamais chez les autres puis
   revenait dans la reserve, des cartes qui bougeaient toutes seules, des
   fleches qui disparaissaient.

   Pourquoi. Le magasin sert des lectures EVENTUELLEMENT COHERENTES : la lecture
   peut renvoyer un document vieux de plusieurs secondes. Le battement lisait ce
   document perime, y posait son horodatage, et le reecrivait ENTIER, sans
   changer le numero de version. Il remettait donc le tableau dans son etat
   d'avant, en silence, sans que personne puisse s'en apercevoir : meme version,
   contenu plus ancien. Avec huit personnes qui sondent, cela arrivait en
   permanence. Et le garde-fou `onlyIfMatch` n'a jamais pu l'arreter, puisqu'il
   n'existe pas dans cette version de @netlify/blobs (voir `ecrire`).

   Le battement vit donc a cote, dans un document minuscule { id: horodatage }
   par session. Perdre un battement n'a aucune consequence (le suivant le
   rattrape), et le document de session n'est plus ecrit que par de vraies
   actions, qui font toutes avancer la version. */
async function presenceLire(code) {
  try {
    const res = await storePresence().getWithMetadata(clePres(code), { type: "json" });
    return (res && res.data) || {};
  } catch (e) { return {}; }
}
async function presenceToucher(code, id, pres) {
  const now = Date.now();
  if (pres[id] && now - pres[id] < 5000) return pres;   // deja frais : rien a ecrire
  const suivant = {};
  for (const k in pres) { if (now - pres[k] < 120000) suivant[k] = pres[k]; } // on elague
  suivant[id] = now;
  try { await storePresence().setJSON(clePres(code), suivant); } catch (e) {}
  return suivant;
}
// Reporte les horodatages de presence SUR LA COPIE EN MEMOIRE, juste avant de
// construire la vue. Rien n'est reecrit dans le document de session.
function injecterPresence(s, pres) {
  if (!s || !pres) return s;
  const pose = (x) => {
    if (!x) return;
    const t = pres[x.id] || 0;
    if (t > (x.vuLe || 0)) { x.vuLe = t; x.connecte = true; }
  };
  pose(s.animateur);
  (s.participants || []).forEach(pose);
  return s;
}

function expiree(s) {
  const now = Date.now();
  if (now - s.creeLe > TTL_MS) return true;
  const vus = [s.animateur.vuLe || 0].concat(s.participants.map((p) => p.vuLe || 0));
  return now - Math.max.apply(null, vus) > INACTIF_MS;
}

// lecture-modification-écriture avec quelques essais (concurrence optimiste).
// Le garde-fou VOULU est `onlyIfMatch` (etag) : si quelqu'un a écrit entre la
// lecture et l'écriture, le magasin refuse et on rejoue. Il ne joue que si le
// magasin sait répondre `{ modified: false }` : voir `ecrire()` ci-dessus.
//
// On ne cherche PAS à deviner le résultat quand le magasin ne renvoie pas de
// verdict. Une version antérieure relisait l'état pour vérifier que sa version
// avait été retenue, et rejouait sinon : or la version avance aussi quand
// quelqu'un écrit APRÈS nous (un simple battement de présence suffit), alors
// que notre écriture est intacte. On rejouait donc une mutation déjà appliquée.
// Pour `rejoindre`, qui crée une place et un jeton, cela fabriquait un
// participant fantôme : une seule entrée, deux personnes dans la liste.
// Une mutation n'est rejouée que sur un refus EXPLICITE du magasin.
// `base` : la version que le client avait sous les yeux au moment d'agir. Si le
// magasin nous rend plus ancien que cela, sa lecture est PERIMEE, c'est prouve,
// et agir sur cette base effacerait ce que quelqu'un vient de faire (la carte
// posee il y a une seconde retournerait dans la reserve). On laisse alors au
// magasin quelques dizaines de millisecondes pour rattraper, puis on agit quand
// meme : mieux vaut une action appliquee sur une base un peu vieille qu'une
// action perdue.
async function muter(st, code, fn, base) {
  for (let essai = 0; essai < 6; essai++) {
    const cur = await lire(st, code);
    if (!cur) return { erreur: { statut: 404, code: "session_inconnue", message: "Code inconnu, ou séance pas encore ouverte par l'animateur·ice. Vérifiez le code et réessayez peu avant le début." } };
    if (base && cur.s.version < base && essai < 4) { await new Promise((r) => setTimeout(r, 70)); continue; }
    if (expiree(cur.s)) { try { await st.delete(cle(code)); } catch (e) {} return { erreur: { statut: 404, code: "session_inconnue", message: "Session terminée." } }; }
    // On n'ecrit QUE si quelque chose a change. Une action refusee, ou sans
    // effet, ne doit pas reecrire le document : chaque ecriture inutile est une
    // occasion de reposer par-dessus une lecture perimee (meme cause que le
    // battement de presence, voir plus haut).
    const avant = JSON.stringify(cur.s);
    const out = fn(cur.s);
    if (JSON.stringify(cur.s) === avant) return { out, s: cur.s };
    const w = await ecrire(st, code, cur.s, cur.etag);
    if (w && w.modified === false) {
      // Quelqu'un a ecrit entre notre lecture et notre ecriture. On rejoue, mais
      // en laissant au magasin le temps de servir la nouvelle valeur : relire
      // aussitot redonnerait le meme etag perime et on echouerait six fois de
      // suite pour rien. Attentes courtes et croissantes, ~1,1 s au total.
      await new Promise((r) => setTimeout(r, 60 + essai * 90));
      continue;
    }
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
      const connue = Math.max(0, +d.version || 0);   // version que le client a deja
      let cur = await lire(st, code);
      if (!cur) return json(404, { refus: { code: "session_inconnue", message: "Code inconnu, ou séance pas encore ouverte par l'animateur·ice." } });
      let pres = await presenceLire(code);
      // Battement de presence : dans SON magasin, jamais dans le document de
      // session (voir presenceToucher plus haut pour la raison).
      const info = cur.s.jetons[d.jeton];
      if (info) pres = await presenceToucher(code, info.role === "animateur" ? cur.s.animateur.id : info.id, pres);
      let s = injecterPresence(cur.s, pres);
      if (expiree(s)) { try { await st.delete(cle(code)); } catch (e) {} return json(404, { refus: { code: "session_inconnue", message: "Session terminée." } }); }
      let etat = R.vue(s);
      // LECTURE PERIMEE, PROUVEE. Le client nous dit la version qu'il a deja.
      // Si le magasin nous rend plus ancien que ca, c'est une valeur perimee :
      // la renvoyer ferait reculer son tableau. On ne la sert pas, on attend
      // dans la boucle ci-dessous que le magasin rattrape son retard.
      const perimee = connue > 0 && etat.version < connue;
      // Attente maintenue ("hold-poll") : si le client est deja a jour, on ne
      // renvoie pas tout de suite « inchange ». On garde la requete ouverte et on
      // relit l'etat a petits intervalles jusqu'a ce que la version change (une
      // action d'un·e autre joueur·se) ou qu'un court delai s'ecoule. Resultat :
      // les autres voient l'action en ~0,3 s au lieu d'attendre le prochain
      // sondage, tout en divisant le nombre de requetes (une requete tenue vaut
      // des dizaines de sondages). Le client se rabat sur un sondage bref si la
      // plateforme coupe la requete.
      if (perimee || (connue > 0 && connue === etat.version)) {
        const finAvant = Date.now() + 8000;   // marge sous la limite de la fonction
        while (Date.now() < finAvant) {
          await new Promise((r) => setTimeout(r, 120));
          const c2 = await lire(st, code);
          if (!c2) break;                       // session supprimee entre-temps
          const e2 = R.vue(injecterPresence(c2.s, pres));
          if (e2.version > connue) { return json(200, { etat: e2 }); }
        }
        // Rien de neuf a servir. Si notre derniere lecture etait perimee, on le
        // dit franchement plutot que d'annoncer une version fausse.
        return json(200, { inchange: true, version: perimee ? connue : etat.version });
      }
      return json(200, { etat });
    }

    if (d.op === "agir") {
      const code = String(d.code || "").toUpperCase();
      // Plus de `R.toucher` ici : la presence vit dans son propre magasin, et
      // ecrire le document de session pour un simple horodatage etait
      // exactement ce qui faisait reculer le tableau.
      // `idem` : cle d'idempotence envoyee par le client. Elle sert quand il
      // renvoie une action apres un echec reseau : sans elle, une reponse perdue
      // faisait creer DEUX fleches ou DEUX notes. Bornee, comme toute entree.
      const intention = Object.assign({}, d.intention || {});
      if (d.idem) intention.idem = String(d.idem).slice(0, 48);
      const r = await muter(st, code, (s) => R.appliquer(s, d.jeton, intention), Math.max(0, +d.version || 0));
      if (r.erreur) return json(r.erreur.statut, { refus: r.erreur });
      if (r.out && r.out.refus) return json(200, { refus: r.out.refus, etat: R.vue(r.s) });
      return json(200, { etat: R.vue(r.s), resultat: r.out && r.out.resultat });
    }

    /* DIAGNOSTIC. Deux choses peuvent lacher EN SILENCE sur cette plateforme, et
       les deux l'ont deja fait : la coherence des lectures, et l'ecriture
       conditionnelle (`onlyIfMatch`). Quand elles lachent, rien ne plante : le
       tableau perd simplement des actions de temps en temps, ce qui est
       beaucoup plus difficile a diagnostiquer qu'une panne franche.
       Cette operation les met a l'epreuve sur un document jetable et rend un
       verdict lisible. A appeler apres chaque deploiement :
         curl -s -X POST https://<site>/.netlify/functions/fresque \
              -H 'Content-Type: application/json' -d '{"op":"sante"}' | jq
       Elle ne lit ni n'ecrit aucune session : elle ne peut rien casser, et ne
       divulgue rien (aucun code, aucun prenom, aucune cle). */
    if (d.op === "sante") {
      const st2 = limites();
      const k = "sante:" + Math.random().toString(36).slice(2, 10);
      const out = { ecritureConditionnelle: "inconnu", relectureImmediate: "inconnu", details: [] };
      try {
        const w1 = await st2.setJSON(k, { n: 1 });
        if (!w1 || typeof w1.modified !== "boolean") {
          out.ecritureConditionnelle = "non";
          out.details.push("setJSON ne rend aucun verdict : l'ecriture conditionnelle est inoperante, deux actions simultanees peuvent se recouvrir.");
        } else {
          // Etag volontairement faux : le magasin DOIT refuser.
          const w2 = await st2.setJSON(k, { n: 2 }, { onlyIfMatch: '"etag-volontairement-faux"' });
          out.ecritureConditionnelle = (w2 && w2.modified === false) ? "oui" : "non";
          if (out.ecritureConditionnelle === "non") {
            out.details.push("une ecriture avec un etag faux a ete ACCEPTEE : le verrou ne protege rien.");
          }
        }
        const r1 = await st2.getWithMetadata(k, { type: "json" });
        out.relectureImmediate = (r1 && r1.data && r1.data.n === 1) ? "oui" : "non";
        if (out.relectureImmediate === "non") {
          out.details.push("une valeur ecrite a l'instant n'est pas relue : lectures eventuellement coherentes (attendu sur cette plateforme, le direct passe par le relais).");
        }
        try { await st2.delete(k); } catch (e) {}
      } catch (e) {
        out.details.push("erreur pendant le test : " + String(e && e.message || e));
      }
      out.blobs = (() => { try { return require("@netlify/blobs/package.json").version; } catch (e) { return "inconnue"; } })();
      out.ok = out.ecritureConditionnelle === "oui";
      return json(200, out);
    }

    return json(400, { error: "Opération inconnue." });
  } catch (e) {
    return json(500, { error: "Erreur du service de sessions.", details: String(e && e.message || e) });
  }
};
