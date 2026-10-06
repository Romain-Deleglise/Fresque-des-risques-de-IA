import { chromium } from "playwright";
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const th of ["light", "dark"]) {
  const pg = await nav.newPage({ viewport: { width: 1400, height: 1000 }, colorScheme: th });
  await pg.route("**/.netlify/functions/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, compte: {}, retours: [], brouillons: [], resume: [], publie: [], fresque: null }) }));
  await pg.goto("http://localhost:8099/animateurs/retours/", { waitUntil: "networkidle" });
  await pg.waitForTimeout(1300);
  await pg.evaluate(() => { const c = document.getElementById("mode-commentaires"); c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true })); });
  await pg.evaluate(() => document.querySelector('.c-carte[data-n="3"]').click());
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { const o = document.getElementById("onglet-retours"); if (o) o.click(); });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate(() => {
    const s = document.getElementById("c-lien"), t = document.getElementById("c-texte");
    if (!s) return { absent: true };
    const cs = getComputedStyle(s), ct = getComputedStyle(t);
    const env = s.closest(".select-joli");
    const fleche = env ? getComputedStyle(env, "::after").content : "aucune";
    return { police: cs.fontFamily.split(",")[0], policeTexte: ct.fontFamily.split(",")[0],
      rayon: cs.borderRadius, rayonTexte: ct.borderRadius,
      bord: cs.borderColor, bordTexte: ct.borderColor,
      fond: cs.backgroundColor, encre: cs.color,
      apparence: cs.appearance, padDroite: cs.paddingRight,
      largeur: Math.round(s.getBoundingClientRect().width),
      largeurTexte: Math.round(t.getBoundingClientRect().width), fleche };
  });
  console.log("\n--- " + th + " ---");
  for (const [k, v] of Object.entries(m)) console.log("  " + k.padEnd(14), v);
  await pg.close();
}
await nav.close();
