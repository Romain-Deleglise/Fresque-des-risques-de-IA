/* Relais de curseurs en direct pour la Fresque en ligne.
   Role unique : repeter les positions de curseur entre les membres d'une meme
   session (meme "code"). Aucune persistance, aucune donnee conservee : un
   message recu est renvoye aux autres, puis oublie. Volontairement minimal et
   robuste ; si ce service tombe, le site continue de fonctionner normalement
   (le client degrade en silence).

   Protocole (JSON) :
     client -> serveur : { t:"c", x, y }         (position du curseur, monde)
     serveur -> clients: { t:"c", id, nom, x, y } (positions des autres)
     serveur -> clients: { t:"leave", id }        (un membre est parti)
   Connexion : wss://.../?code=ABC123&nom=Prenom
*/
"use strict";
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const MAX_PAR_SALON = Number(process.env.MAX_PAR_SALON || 30); // garde-fou
const MSG_MAX = 512;                                           // octets par message

const wss = new WebSocketServer({ port: PORT, maxPayload: 2048 });
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
  ws.on("message", function (data) {
    let m; try { m = JSON.parse(String(data).slice(0, MSG_MAX)); } catch (e) { return; }
    if (m && m.t === "c") {
      diffuser(set, ws, { t: "c", id: id, nom: nom, x: +m.x || 0, y: +m.y || 0 });
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
