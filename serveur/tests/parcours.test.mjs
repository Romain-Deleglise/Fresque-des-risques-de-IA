/* LA CARTE DES PARCOURS DOIT CORRESPONDRE AU CODE.

   Un inventaire ecrit a la main derive : on ajoute un courriel, on oublie la
   carte, et elle devient un document qui ment avec autorite -- pire qu'une
   absence de document, parce qu'on s'y fie. On compare donc DANS LES DEUX SENS
   les sujets decrits dans serveur/src/parcours.js et les sujets reellement
   envoyes par netlify/functions.
*/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../../serveur/src/parcours.js");

const DIR = path.join(process.cwd(), "netlify", "functions");

/* Les sujets tels que le code les ecrit. On ne retient que les litteraux :
   un sujet construit (« Nouvelle inscription (2/8) ») est reconnu par son
   debut, c'est-a-dire par ce qui en est fixe. */
function sujetsDuCode() {
  const out = new Set();
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    for (const m of src.matchAll(/subject:\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
  }
  return [...out];
}

test("chaque courriel envoyé par le code figure sur la carte", () => {
  const decrits = P.sujets();
  const oublies = sujetsDuCode().filter(
    (s) => !decrits.some((d) => s === d || s.startsWith(d) || d.startsWith(s)));
  assert.deepEqual(oublies, [],
    "ces courriels partent sans figurer dans serveur/src/parcours.js");
});

test("chaque courriel décrit part vraiment", () => {
  const duCode = sujetsDuCode();
  /* Trois sujets sont assembles a l'envoi plutot qu'ecrits en toutes lettres :
     on les cherche alors dans la fonction qui les compose. */
  const composes = {
    // Le sujet de l'annonce hebdomadaire se compose selon ce qu'elle contient.
    "Un atelier de la Fresque des risques de l'IA près de chez vous":
      path.join(process.cwd(), "serveur", "src", "alertes.js"),
    "[Fresque] ": path.join(DIR, "surveillance.js")
  };
  const fantomes = P.sujets().filter((d) => {
    if (duCode.some((s) => s === d || s.startsWith(d) || d.startsWith(s))) return false;
    const f = composes[d];
    if (!f) return true;
    return !fs.readFileSync(f, "utf8").includes(d);
  });
  assert.deepEqual(fantomes, [], "ces courriels sont décrits mais n'existent plus");
});

test("chaque étape dit pour qui, quand, et d'où elle part", () => {
  for (const p of P.tous()) {
    assert.ok(p.titre && p.depart, `${p.cle} : il manque le titre ou le départ`);
    assert.ok(p.etapes.length, `${p.cle} : aucun courriel`);
    for (const e of p.etapes) {
      assert.ok(e.sujet, `${p.cle} : une étape sans sujet`);
      assert.ok(e.pour, `${e.sujet} : on ne sait pas pour qui`);
      assert.ok(e.quand, `${e.sujet} : on ne sait pas quand`);
      assert.ok(e.source && fs.existsSync(path.join(DIR, e.source)),
        `${e.sujet} : la fonction ${e.source} n'existe pas`);
      assert.ok(Array.isArray(e.porte), `${e.sujet} : « porte » doit être une liste`);
    }
  }
});

/* LES ENVOIS COLLECTIFS VONT EN COPIE CACHEE. Mettre un·e participant·e en
   « à » donnerait son adresse a tous les autres, qui ne se la sont pas donnee.
   La carte le dit ; le code doit le faire. */
test("les courriels annoncés « en copie cachée » le sont vraiment", () => {
  let verifies = 0;
  for (const p of P.tous()) {
    /* SANS ACCENT : parcours.js ecrit « copie cachee ». Avec l'accent, ce
       filtre ne retenait rien et le test passait en ne verifiant rien. */
    const collectifs = p.etapes.filter((x) => /copie cach/.test(x.pour));
    for (const e of collectifs) {
      const src = fs.readFileSync(path.join(DIR, e.source), "utf8");
      const i = src.indexOf(e.sujet);
      assert.ok(i !== -1, `${e.sujet} : introuvable dans ${e.source}`);
      const autour = src.slice(Math.max(0, i - 400), i + 200);
      assert.match(autour, /bcc:/, `${e.sujet} doit partir en copie cachée`);
      verifies++;
    }
  }
  /* UN TEST QUI NE VERIFIE RIEN PASSE TOUJOURS. C'est ce qui est arrive ici :
     le filtre portait un accent que la carte n'a pas, et la boucle tournait a
     vide. On compte donc ce qu'on a verifie. */
  assert.ok(verifies >= 5, `seulement ${verifies} envoi(s) collectif(s) vérifié(s)`);
});

/* LE JOURNAL NE GARDE AUCUNE ADRESSE. Un journal des envois qui retient les
   destinataires devient une seconde base d'adresses que personne n'a declaree. */
test("le journal des envois ne peut pas retenir d'adresse", () => {
  const J = require("../../serveur/src/journal.js");
  const e = J.entree({ evt: "envoye", sujet: "Test", dest: 3,
    to: "quelquun@exemple.fr", mail: "autre@exemple.fr" }, Date.now());
  assert.ok(!JSON.stringify(e).includes("exemple.fr"), "une adresse a traversé");
  assert.deepEqual(Object.keys(e).sort(), ["dest", "evt", "quand", "raison", "sujet"]);
});
