/* Relais temps reel pour la Fresque en ligne.
   Role unique : repeter des messages EPHEMERES entre les membres d'une meme
   session (meme "code"). Aucune persistance, aucune donnee conservee : un
   message recu est renvoye aux autres, puis oublie. L'autorite et la memoire du
   tableau restent cote serveur (Netlify Blobs) ; ce relais ne fait que du
   « pousse » pour supprimer l'attente du sondage. Volontairement minimal et
   robuste ; si ce service tombe, le site continue de fonctionner normalement
   (le client se rabat sur son sondage, en silence).

   Protocole (JSON), client -> serveur puis rediffuse aux AUTRES du meme salon,
   enrichi de { id, nom } :
     { t:"c", x, y }            position du curseur (coordonnees monde)
     { t:"etat", s }           « voici le tableau apres mon action » : l'etat
                                complet, tel que le serveur vient de le renvoyer
                                a son auteur. Les autres l'appliquent tout de
                                suite, sans relire (voir plus bas)
     { t:"maj" }               « j'ai modifie le tableau » : repli si l'etat
                                n'a pas pu etre joint ; les autres relisent
     { t:"fl", x, y, de }      trace de fleche en cours (elastique en direct)
     { t:"fl0" }               trace de fleche abandonne / termine
     { t:"gliss", n, x, y, d } carte en cours de deplacement : numero, position
                                monde, et d=1 si elle vient de la reserve ou de
                                la pioche (elle n'est pas encore sur le tableau)
     { t:"gliss0", n }         deplacement termine
     { t:"lib", id, v }        libelle de fleche en cours de frappe
     { t:"note", id, x, y, v } note en cours de frappe
   serveur -> clients : le meme objet + { id, nom }, ou { t:"leave", id }.
   Connexion : wss://.../?code=ABC123&nom=Prenom

   POURQUOI l'etat complet et pas un simple signal : le magasin d'etat (Netlify
   Blobs) sert des lectures EVENTUELLEMENT coherentes. Dire aux autres « relisez »
   ne sert donc a rien : ils reliraient la valeur perimee pendant plusieurs
   secondes. En transportant l'etat que le serveur vient de renvoyer a son
   auteur, ils l'ont immediatement. Le magasin reste l'autorite et la memoire :
   le sondage continue en fond et corrige tout ecart.
*/
"use strict";
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const MAX_PAR_SALON = Number(process.env.MAX_PAR_SALON || 30); // garde-fou
const MSG_MAX = 96 * 1024;                                     // caracteres par message (un etat de tableau)
const MSG_PAR_SEC = Number(process.env.MSG_PAR_SEC || 150);    // garde-fou de debit, par connexion

const wss = new WebSocketServer({ port: PORT, maxPayload: 128 * 1024 });
const salons = new Map(); // code -> Set<ws>

function salon(code) { let s = salons.get(code); if (!s) { s = new Set(); salons.set(code, s); } return s; }
function diffuser(set, sauf, obj) {
  const txt = JSON.stringify(obj);
  for (const c of set) { if (c !== sauf && c.readyState === 1) { try { c.send(txt); } catch (e) {} } }
}

wss.on("connection", function (ws, req) {
  let code = "", nom = "";
  try {
    const u = new URL(req.url, "http://x");
    code = (u.searchParams.get("code") || "").toUpperCase().slice(0, 12);
    nom = (u.searchParams.get("nom") || "").slice(0, 24);
  } catch (e) {}
  if (!/^[A-Z0-9]{4,12}$/.test(code)) { try { ws.close(); } catch (e) {} return; }
  const set = salon(code);
  if (set.size >= MAX_PAR_SALON) { try { ws.close(); } catch (e) {} return; }
  const id = Math.random().toString(36).slice(2, 10);
  ws._meta = { code: code, id: id, nom: nom };
  ws.isAlive = true;
  set.add(ws);

  ws.on("pong", function () { ws.isAlive = true; });
  // Garde-fou de debit. Le service est joignable depuis Internet : un client
  // fautif (ou une boucle) ne doit pas pouvoir saturer un salon. Un usage normal
  // reste tres en dessous : ~18 messages/s pour le curseur, ~30/s pour une carte
  // qu'on deplace. Au-dela du seau, on JETTE le message plutot que de couper la
  // connexion : on ne casse jamais une session pour une rafale.
  let seau = MSG_PAR_SEC, seauTs = Date.now();
  function debitOk() {
    const now = Date.now();
    seau = Math.min(MSG_PAR_SEC, seau + (now - seauTs) * MSG_PAR_SEC / 1000);
    seauTs = now;
    if (seau < 1) return false;
    seau -= 1; return true;
  }
  ws.on("message", function (data) {
    if (!debitOk()) return;
    let m; try { m = JSON.parse(String(data).slice(0, MSG_MAX)); } catch (e) { return; }
    if (!m || typeof m.t !== "string") return;
    if (m.t === "c" || m.t === "fl") {
      diffuser(set, ws, { t: m.t, id: id, nom: nom, x: +m.x || 0, y: +m.y || 0, de: +m.de || 0 });
    } else if (m.t === "fl0" || m.t === "maj") {
      diffuser(set, ws, { t: m.t, id: id, nom: nom });
    } else if (m.t === "gliss") {
      // Geste de deplacement, pur ephemere : on repete, on n'interprete pas.
      diffuser(set, ws, { t: "gliss", id: id, nom: nom, n: +m.n || 0,
        x: +m.x || 0, y: +m.y || 0, d: m.d ? 1 : 0 });
    } else if (m.t === "gliss0") {
      diffuser(set, ws, { t: "gliss0", id: id, nom: nom, n: +m.n || 0 });
    } else if (m.t === "etat" && m.s && typeof m.s === "object") {
      // Rediffusion telle quelle : le relais ne juge pas du contenu, il repete.
      diffuser(set, ws, { t: "etat", id: id, nom: nom, s: m.s });
    } else if (m.t === "lib" || m.t === "note") {
      // Frappe en direct : on borne les champs texte pour ne jamais relayer plus
      // que ce que le serveur d'etat acceptera de toute facon.
      diffuser(set, ws, { t: m.t, id: id, nom: nom, cid: String(m.cid || "").slice(0, 24),
        x: +m.x || 0, y: +m.y || 0, v: String(m.v == null ? "" : m.v).slice(0, 280) });
    }
  });
  function partir() {
    if (!set.has(ws)) return;
    set.delete(ws);
    diffuser(set, ws, { t: "leave", id: id });
    if (set.size === 0) salons.delete(code);
  }
  ws.on("close", partir);
  ws.on("error", function () { try { ws.close(); } catch (e) {} });
});

// Heartbeat : coupe les connexions mortes (onglet ferme brutalement, reseau perdu).
const battement = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) { try { return ws.terminate(); } catch (e) {} }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  });
}, 30000);
wss.on("close", function () { clearInterval(battement); });

console.log("[curseurs] relais WebSocket en ecoute sur le port " + PORT);
