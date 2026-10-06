import { chromium } from "playwright";
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pg = await nav.newPage({ viewport: { width: 1400, height: 1000 }, colorScheme: "light" });
await pg.route("**/.netlify/functions/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ ok: true, compte: {}, retours: [], brouillons: [], resume: [], publie: [], fresque: null }) }));
await pg.goto("http://localhost:8099/animateurs/retours/", { waitUntil: "networkidle" });
await pg.waitForTimeout(1300);
await pg.evaluate(() => { const c = document.getElementById("mode-commentaires"); c.checked = true;
  c.dispatchEvent(new Event("change", { bubbles: true })); });
await pg.evaluate(() => document.querySelector('.c-carte[data-n="3"]').click());
await pg.waitForTimeout(600);
await pg.evaluate(() => { const o = document.getElementById("onglet-retours"); if (o) o.click(); });
await pg.waitForTimeout(500);
const b = await pg.locator("#panneau-commentaire").boundingBox();
await pg.screenshot({ path: "/tmp/claude-0/-home-user-Fresque-des-risques-de-IA/c12ee711-c9b3-5669-806b-4d25cd936079/scratchpad/select.png",
  clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 420) } });
console.log("capture faite");
await nav.close();
