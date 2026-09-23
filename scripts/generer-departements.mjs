/* Injecte la liste fermee des departements dans les formulaires HTML, depuis
   l'UNIQUE source de verite : serveur/src/departements.js. Le formulaire et la
   validation serveur ne peuvent donc pas diverger -- une divergence signifierait
   un animateur qui choisit une zone que le serveur refuse, ou pire, un atelier
   range dans une zone a laquelle personne n'est abonne. */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Z = require("../serveur/src/departements.js");

export function options(vide) {
  return ['<option value="">' + vide + "</option>"].concat(
    Object.keys(Z.ZONES).map((c) => '<option value="' + c + '">' + Z.libelle(c) + "</option>")
  ).join("");
}

const CIBLES = [
  ["site/devenir-animateur/index.html", "— Choisissez —"],
  ["site/en/facilitate/index.html", "— Select —"],
  ["site/participer/index.html", "— Choisissez un département —"]
];

if (import.meta.url === "file://" + process.argv[1]) {
  for (const [f, vide] of CIBLES) {
    const src = fs.readFileSync(f, "utf8");
    if (!/<select (?:name="departement"|id="zone-choix")/.test(src)) throw new Error("select introuvable dans " + f);
    const out = src.replace(
      /(<select (?:name="departement"|id="zone-choix")[^>]*>)[\s\S]*?(<\/select>)/,
      (m, a, b) => a + options(vide) + b
    );
    fs.writeFileSync(f, out);
    console.log("ok " + f);
  }
}
