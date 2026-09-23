/* LE SUIVI POST-ATELIER ENVOIE DEUX MAILS DIFFÉRENTS.

   Il n'en envoyait qu'un, à l'animateur·ice en destinataire et aux
   participant·es en copie cachée, avec le même contenu. L'essentiel du message
   invitait à « animer à son tour » : absurde pour qui venait de le faire, et
   à côté de ce qu'il fallait demander aux participant·es.

   Ces tests lisent la fonction Netlify sans l'exécuter (elle dépend de Netlify
   Blobs). Ils vérifient ce qui se défait facilement : la séparation des deux
   publics, la confidentialité des adresses, et le fait qu'un lien de
   formulaire absent ne produise pas d'invitation vers le vide.

   `node --test`.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(RACINE, "netlify/functions/suivi.js"), "utf8");

const bloc = (nom) => {
  const d = SRC.indexOf("function " + nom);
  assert.ok(d > 0, `${nom} est introuvable`);
  const f = SRC.indexOf("\n}", d);
  return SRC.slice(d, f);
};

test("deux fonctions distinctes, une par public", () => {
  assert.match(SRC, /function mailParticipants/);
  assert.match(SRC, /function mailAnimateurSuivi/);
  // L'ancienne fonction unique ne doit pas réapparaître.
  assert.ok(!/function contenuSuivi/.test(SRC));
});

test("les deux mails ont des objets différents", () => {
  const objets = [...SRC.matchAll(/subject: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(objets.length, 2);
  assert.notEqual(objets[0], objets[1]);
  assert.match(objets.join(" | "), /animé/);
  assert.match(objets.join(" | "), /participé/);
});

test("les adresses des participant·es ne circulent pas", () => {
  // Copie cachée SEULE : mail.js met alors notre propre adresse en
  // destinataire. Mettre un·e participant·e en « à » donnerait son adresse à
  // tous les autres.
  assert.match(SRC, /mail\.envoi\(\{ bcc: parts,/);
  assert.ok(!/to: parts\.slice/.test(SRC), "un·e participant·e serait exposé·e");
});

test("aucune invitation vers un formulaire qui n'existe pas", () => {
  // Tant que la variable n'est pas renseignée, le bloc entier disparaît.
  assert.match(SRC, /const FORM_RETOURS = \(process\.env\.FORM_RETOURS_URL \|\| ""\)/);
  assert.match(SRC, /const FORM_TEMOIGNAGE = \(process\.env\.FORM_TEMOIGNAGE_URL \|\| ""\)/);
  for (const nom of ["mailParticipants", "mailAnimateurSuivi"]) {
    const b = bloc(nom);
    assert.match(b, /if \(FORM_RETOURS\)/, `${nom} doit conditionner le retour`);
  }
  assert.match(bloc("mailParticipants"), /if \(FORM_TEMOIGNAGE\)/);
});

test("chaque mail dit ce qui concerne son public", () => {
  const p = bloc("mailParticipants"), a = bloc("mailAnimateurSuivi");
  // Au participant : devenir animateur·ice. À l'animateur·ice : surtout pas.
  assert.match(p, /Devenir animateur/);
  assert.ok(!/Devenir animateur·ice", *\)/.test(a));
  // À l'animateur·ice : son espace, et la consigne de ne pas le diffuser.
  assert.match(a, /\/animateurs\//);
  assert.match(a, /Gardez ce lien pour vous/);
  // L'espace ne doit jamais partir aux participant·es.
  assert.ok(!/animateurs\//.test(p), "le mail participant ne doit pas donner l'espace");
});

test("les deux mails présentent Pause IA et où la suivre", () => {
  assert.match(SRC, /function piedPauseIA/);
  for (const nom of ["mailParticipants", "mailAnimateurSuivi"]) {
    assert.match(bloc(nom), /piedPauseIA\(l, c\)/, `${nom} doit appeler le pied commun`);
  }
  const pied = bloc("piedPauseIA");
  assert.match(pied, /rejoindre/);
  assert.match(pied, /newsletters/);
});
