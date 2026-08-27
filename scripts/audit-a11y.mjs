/* Audit d'accessibilité (axe-core / WCAG 2.1 A+AA) sur les pages du site.
   Sert en local et en CI. Sort en erreur si une violation est détectée.

   Usage : BASE=http://localhost:8099 node scripts/audit-a11y.mjs
   Dépendances (dev, non versionnées) : playwright, @axe-core/playwright.
*/
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const BASE = process.env.BASE || "http://localhost:8099";
const PAGES = [
  ["Accueil", "/"],
  ["À propos", "/a-propos/"],
  ["Devenir animateur", "/devenir-animateur/"],
  ["Demander un atelier", "/demander-un-atelier/"],
  ["Fresque en ligne", "/en-ligne/"],
  ["Mentions légales", "/mentions-legales/"],
  ["Atelier solo", "/en-ligne/atelier/"],
  ["Atelier solo (EN)", "/en-ligne/atelier/?lang=en"],
  ["Session (lobby)", "/en-ligne/session/"],
  ["EN Home", "/en/"],
  ["EN About", "/en/about/"],
  ["EN Facilitate", "/en/facilitate/"],
  ["EN Online", "/en/online/"],
  ["EN Request", "/en/request-a-workshop/"],
  ["EN Legal", "/en/legal/"],
];

// En CI, Playwright installe son propre Chromium. En local, on peut pointer un
// binaire déjà présent via PW_CHROMIUM (ex. /opt/pw-browsers/chromium-*/chrome-linux/chrome).
const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext();
let total = 0;

for (const [nom, chemin] of PAGES) {
  const page = await ctx.newPage();
  await page.goto(BASE + chemin, { waitUntil: "networkidle" }).catch(() => {});
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  if (r.violations.length === 0) {
    console.log(`✅ ${nom} : aucune violation`);
  } else {
    for (const v of r.violations) {
      total += v.nodes.length;
      console.log(`❌ ${nom} [${v.impact}] ${v.id} : ${v.help} (${v.nodes.length})`);
      v.nodes.slice(0, 3).forEach((n) => console.log(`      ${n.target.join(" ")}`));
    }
  }
  await page.close();
}

await browser.close();
if (total > 0) {
  console.error(`\n${total} violation(s) d'accessibilité détectée(s).`);
  process.exit(1);
}
console.log("\nAccessibilité : aucune violation (WCAG 2.1 A/AA).");
