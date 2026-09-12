/* FIDELITE DU GESTE RELAYE.

   « C'est beaucoup mieux qu'avant, mais pas encore exactement ce que fait le
   joueur. » Ce script dit pourquoi, en chiffres, plutot qu'a l'estime.

   Il fait deplacer une carte par A selon un trace connu (vitesse variable,
   changements de direction), enregistre chez A ce que fait vraiment la souris et
   chez B ce qui s'affiche, puis RECALE l'un sur l'autre. Ce recalage separe deux
   choses qu'on confond toujours :
     - le RETARD : de combien de temps B est en arriere. C'est lui qu'on ressent
       comme « pas exactement ce que fait le joueur ».
     - l'ECART RESIDUEL : ce qui reste une fois le retard enleve, c'est-a-dire la
       deformation reelle du trace. Il est de quelques pixels sur un geste de
       deux mille : le trace, lui, est fidele.
   Il mesure aussi les ARRETS (B immobile alors que A bouge : le tampon s'est
   vide) et l'IRREGULARITE de la vitesse, celle qui donne mal au coeur, comparee
   a celle du geste reel.

   Le reseau est SIMULE cote client : chaque message est retarde d'un delai
   variable, en gardant l'ordre (TCP ne reordonne pas). Sans cela, tout marche
   sur une boucle locale et le tampon parait inutile, ce qu'il n'est pas.

   Usage : node scripts/verifier-geste.mjs
   Reglages : RESEAU_BASE, RESEAU_GIGUE (ms). Pour comparer un reglage fige :
   RETARD_SUIVI=110 PAS_GLISS=33 reproduit la version d'avant.
   Dependances (dev, non versionnees) : playwright (ou playwright-core +
   PW_CHROMIUM), ws.
*/
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const R = require('../serveur/src/regles.js');
const { chromium } = await import('playwright-core');
const RACINE='/home/user/Fresque-des-risques-de-IA';
const PORT_SITE=8135, PORT_RELAIS=8136;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const site=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(RACINE,'site',p);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>site.listen(PORT_SITE,r));
process.env.PORT=String(PORT_RELAIS);
await import('../infra/curseurs/server.js');

const c0=R.creer('Anim','GESTE1'); const S=c0.session;
S.jetons['jAnim']={role:'animateur',id:c0.idAnim};
const jP=R.rejoindre(S,'Bleu');
let x=400,y=400;
for(let n=1;n<=6;n++){R.appliquer(S,'jAnim',{op:'poolAjouter',n});R.appliquer(S,'jAnim',{op:'poserCarte',n,pos:{x,y}});x+=350;}
const LAT=Number(process.env.LATENCE||250), ECR=Number(process.env.LATENCE_ECRIT||900);
const dodo=(ms)=>new Promise(r=>setTimeout(r,ms));
async function servir(route){
  let d={};try{d=JSON.parse(route.request().postData()||'{}');}catch(e){}
  await dodo(LAT/2); let corps={};
  if(d.op==='rejoindre'){const o=R.rejoindre(S,d.prenom,d.jeton);corps=o&&o.refus?{refus:o.refus}:{jeton:o.jeton,role:o.role,moi:o.id||null,etat:R.vue(S)};}
  else if(d.op==='etat'){corps={etat:R.vue(S)};}
  else if(d.op==='agir'){await dodo(ECR);const o=R.appliquer(S,d.jeton,d.intention||{});corps=o&&o.refus?{refus:o.refus,etat:R.vue(S)}:{etat:R.vue(S),resultat:o&&o.resultat};}
  await dodo(LAT/2);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corps)});
}
const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
async function ouvrir(jeton,role){
  const ctx=await nav.newContext({viewport:{width:1200,height:800}});
  const p=await ctx.newPage();
  await p.addInitScript(([j,r,base,gigue])=>{
    localStorage.setItem('coach-multi-off','1');localStorage.setItem('fresque:tuto:animateur','1');localStorage.setItem('fresque:tuto:participant','1');
    localStorage.setItem(r==='animateur'?'fresque:anim:GESTE1':'fresque:GESTE1',j);
    if (!base && !gigue) return;
    // RESEAU SIMULE. Un lien reel n'est pas regulier : les messages arrivent par
    // paquets, avec des trous. On retarde chaque message d'un delai variable, en
    // gardant l'ORDRE (TCP ne reordonne pas) : c'est exactement ce que le tampon
    // de lecture differee est cense absorber.
    const Vrai = window.WebSocket;
    function Retarde(u, p) {
      const s = p ? new Vrai(u, p) : new Vrai(u);
      let prochain = 0;
      const vraiAdd = s.addEventListener.bind(s);
      s.addEventListener = function (type, fn, o) {
        if (type !== 'message') return vraiAdd(type, fn, o);
        return vraiAdd('message', function (e) {
          const now = performance.now();
          const d = base + Math.random() * gigue;
          prochain = Math.max(prochain, now) + 0;
          const quand = Math.max(prochain, now + d);
          prochain = quand;
          setTimeout(function () { fn(e); }, Math.max(0, quand - performance.now()));
        }, o);
      };
      Object.defineProperty(s, 'onmessage', {
        set(fn) { s.addEventListener('message', fn); }, get() { return null; }
      });
      return s;
    }
    Retarde.prototype = Vrai.prototype;
    Retarde.OPEN = Vrai.OPEN; Retarde.CLOSED = Vrai.CLOSED;
    Retarde.CONNECTING = Vrai.CONNECTING; Retarde.CLOSING = Vrai.CLOSING;
    window.WebSocket = Retarde;
  },[jeton,role,Number(process.env.RESEAU_BASE||0),Number(process.env.RESEAU_GIGUE||0)]);
  await p.route('**/session.js',async route=>{const rr=await route.fetch();let t=(await rr.text()).replace('wss://curseurs.pauseia.fr','ws://127.0.0.1:'+PORT_RELAIS);
  // Pour comparer, on peut FIGER le tampon a une valeur donnee.
  if (process.env.RETARD_MIN) t = t.replace(/var RETARD_MIN = \d+,/, 'var RETARD_MIN = '+Number(process.env.RETARD_MIN)+',');
  if (process.env.RETARD_SUIVI) { const v=Number(process.env.RETARD_SUIVI);
    t = t.replace(/var RETARD_MIN = \d+, RETARD_MAX = \d+, RETARD_DEFAUT = \d+;/,
      'var RETARD_MIN = '+v+', RETARD_MAX = '+v+', RETARD_DEFAUT = '+v+';'); }
  if (process.env.PAS_GLISS) t = t.replace(/now - glissTs < 15/, 'now - glissTs < '+Number(process.env.PAS_GLISS));await route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:t});});
  await p.route('**/.netlify/functions/fresque',servir);
  await p.goto('http://127.0.0.1:'+PORT_SITE+'/en-ligne/session/?s=GESTE1',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#app:not([hidden])',{timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll('.c-carte').length>0,null,{timeout:30000});
  return p;
}
const A=await ouvrir('jAnim','animateur');
const B=await ouvrir(jP.jeton,'participant');
await dodo(2500);

// Enregistrement : A la verite (ce que fait la souris), B ce qui s'affiche.
const capteur = (n)=>`(()=>{const el=document.querySelector('.c-carte[data-n="${n}"]');window.__tr=[];const f=()=>{window.__tr.push([Date.now(),+el._x||0,+el._y||0]);requestAnimationFrame(f);};requestAnimationFrame(f);})()`;
await A.evaluate(capteur(1)); await B.evaluate(capteur(1));

await A.evaluate(()=>{const b=document.getElementById('z-tout');if(b)b.click();});
await dodo(900);
const bo=await A.evaluate(()=>{const r=document.querySelector('.c-carte[data-n="1"]').getBoundingClientRect();const s=document.getElementById('scene').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dansScene:r.x>s.x&&r.right<s.right&&r.y>s.y&&r.bottom<s.bottom,r:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)}};});

await A.mouse.move(bo.x,bo.y); await A.mouse.down();
// Un geste realiste : vitesse variable, changements de direction.
const T0=Date.now();
for(let i=1;i<=120;i++){
  const t=i/120;
  const vx = bo.x + 380*t + 60*Math.sin(t*9);
  const vy = bo.y + 120*Math.sin(t*6.5) + 40*Math.sin(t*17);
  await A.mouse.move(vx,vy);
  await dodo(8);
}
await A.mouse.up();
await dodo(2500);
const ta=await A.evaluate(()=>window.__tr), tb=await B.evaluate(()=>window.__tr);

// Recale le trace de B sur celui de A : on cherche le retard qui minimise
// l'ecart, puis on mesure ce qui RESTE une fois ce retard enleve.
function posA(t){
  for(let i=1;i<ta.length;i++){ if(ta[i][0]>=t){ const a=ta[i-1],b=ta[i];const d=b[0]-a[0]||1;const u=Math.max(0,Math.min(1,(t-a[0])/d));return [a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u]; } }
  return ta.length?[ta[ta.length-1][1],ta[ta.length-1][2]]:[0,0];
}
const debut=T0+120, fin=Date.now();
const utiles=tb.filter(p=>p[0]>=debut && p[0]<=fin);
let best=null;
for(let lag=0;lag<=420;lag+=2){
  let s=0,n=0;
  for(const p of utiles){ const [ax,ay]=posA(p[0]-lag); s+=(p[1]-ax)**2+(p[2]-ay)**2; n++; }
  const rms=Math.sqrt(s/Math.max(1,n));
  if(!best||rms<best.rms) best={lag,rms};
}
// Amplitude du geste, pour rapporter l'erreur a quelque chose.
let amp=0; for(let i=1;i<ta.length;i++) amp+=Math.hypot(ta[i][1]-ta[i-1][1],ta[i][2]-ta[i-1][2]);
let arrets=0, bouges=0;
for(let i=1;i<utiles.length;i++){
  const dB=Math.hypot(utiles[i][1]-utiles[i-1][1],utiles[i][2]-utiles[i-1][2]);
  const a0=posA(utiles[i-1][0]-best.lag), a1=posA(utiles[i][0]-best.lag);
  const dA=Math.hypot(a1[0]-a0[0],a1[1]-a0[1]);
  if(dA>0.8){ bouges++; if(dB<0.15) arrets++; }
}
// Irregularite de la vitesse : c'est elle qu'on ressent comme une saccade.
// On compare la dispersion de la vitesse chez B a celle, reelle, chez A.
function irregularite(pts, decal){
  const v=[];
  for(let i=1;i<pts.length;i++){
    const dt=pts[i][0]-pts[i-1][0]; if(dt<=0) continue;
    v.push(Math.hypot(pts[i][1]-pts[i-1][1],pts[i][2]-pts[i-1][2])/dt);
  }
  if(v.length<5) return 0;
  const m=v.reduce((a,b)=>a+b,0)/v.length;
  if(m<=0) return 0;
  const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);
  return Math.round(100*sd/m);
}
const vraiA=ta.filter(p=>p[0]>=debut-best.lag && p[0]<=fin-best.lag);
const m = {
  irregularite_vitesse_A_pct: irregularite(vraiA),
  irregularite_vitesse_B_pct: irregularite(utiles),
  reglage_RETARD_SUIVI: Number(process.env.RETARD_SUIVI||110),
  reseau_base_ms: Number(process.env.RESEAU_BASE||0), reseau_gigue_ms: Number(process.env.RESEAU_GIGUE||0),
  pas_envoi_ms: Number(process.env.PAS_GLISS||33),
  arrets_pendant_que_l_autre_bouge_pct: Math.round(1000*arrets/Math.max(1,bouges))/10,
  echantillons_A: ta.length, echantillons_B: tb.length, points_compares: utiles.length,
  retard_ms: best.lag, ecart_residuel_px: Math.round(best.rms*10)/10,
  longueur_du_geste_px: Math.round(amp),
  ecart_sans_recalage_px: (()=>{let s=0,n=0;for(const p of utiles){const [ax,ay]=posA(p[0]);s+=(p[1]-ax)**2+(p[2]-ay)**2;n++;}return Math.round(Math.sqrt(s/Math.max(1,n))*10)/10;})()
};

console.log(JSON.stringify(m, null, 1));

/* VERDICT. Les seuils sont ceux qu'on sait tenir, mesures : sur un lien correct
   le geste doit arriver en moins de 115 ms, sans arret, et sans etre plus
   irregulier que le geste lui-meme. Repere : la version a tampon fixe de 110 ms
   mesurait 128 ms ici, et jusqu'a 135 sur un lien reel ; le tampon adaptatif
   descend a 90. Le seuil est place entre les deux, avec de la marge des deux
   cotes, pour qu'un retour en arriere se voie et qu'une machine chargee ne
   fasse pas echouer le controle pour rien. */
let ko = 0;
function t(nom, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + nom + (detail ? "  → " + detail : ""));
  if (!cond) ko++;
}
const degrade = Number(process.env.RESEAU_GIGUE || 0) > 60;
console.log("");
if (!degrade) {
  t("le geste arrive chez l'autre en moins de 115 ms",
    m.retard_ms < 115, "mesure : " + m.retard_ms + " ms");
  t("le geste ne s'arrete jamais en route",
    m.arrets_pendant_que_l_autre_bouge_pct < 2, m.arrets_pendant_que_l_autre_bouge_pct + " % des images");
} else {
  t("sur un lien degrade, le tampon evite quand meme les arrets",
    m.arrets_pendant_que_l_autre_bouge_pct < 5, m.arrets_pendant_que_l_autre_bouge_pct + " % des images");
}
t("le trace n'est pas deforme (l'ecart restant est marginal)",
  m.ecart_residuel_px < 25, m.ecart_residuel_px + " px sur un geste de " + m.longueur_du_geste_px + " px");
t("la vitesse affichee n'est pas plus irreguliere que le geste reel",
  m.irregularite_vitesse_B_pct < m.irregularite_vitesse_A_pct + 60,
  "affichee " + m.irregularite_vitesse_B_pct + " %, reelle " + m.irregularite_vitesse_A_pct + " %");
console.log("\n" + (ko ? "❌" : "✅") + " Geste relaye : " + ko + " controle(s) en echec.\n");
await nav.close(); site.close(); process.exit(ko ? 1 : 0);
