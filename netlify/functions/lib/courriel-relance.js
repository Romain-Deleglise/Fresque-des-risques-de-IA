/* LE COURRIEL DE RELANCE AUX ANIMATEUR·ICES (logique pure, aucune I/O).

   Sorti de admin.js pour que l'apercu de /admin/ puisse le construire comme
   les autres : le catalogue des apercus requiert les fonctions qui envoient,
   et admin.js requiert le catalogue. Un courriel qui vit dans admin.js ferme
   donc la boucle.
*/
"use strict";

var G = require("./gabarit.js");

/* Message de relance. Volontairement court et sans reproche : la personne a
   donné de son temps une fois, elle ne doit rien à personne. On lui dit ce qui
   a changé depuis et on lui laisse la main -- pas de « on ne vous voit plus ».
   Un seul lien, celui qui sert : programmer. */
function relance() {
  const prog = require("./lien.js").SITE + "/devenir-animateur/#programmer";
  const text = [
    "Bonjour,",
    "",
    "Vous avez animé une Fresque des risques de l'IA il y a quelque temps, merci encore.",
    "",
    "La fresque a continué d'évoluer depuis : les cartes ont été corrigées grâce aux retours des animateur·ices, le guide s'est étoffé, et le site aide maintenant à trouver des participant·es (il annonce votre atelier aux personnes inscrites près de chez vous).",
    "",
    "Si l'envie vous en dit, programmer le prochain prend deux minutes :",
    prog,
    "",
    "Et si ce n'est pas le moment, ce message n'attend aucune réponse. Nous ne relançons personne plus d'une fois par semestre.",
    "",
    "À bientôt,",
    "L'équipe de la Fresque des risques de l'IA, Pause IA"
  ].join("\n");
  const html = [
    '<p style="margin:0 0 14px;">Bonjour,</p>',
    '<p style="margin:0 0 14px;">Vous avez animé une Fresque des risques de l\'IA il y a quelque temps, merci encore.</p>',
    '<p style="margin:0 0 14px;">La fresque a continué d\'évoluer depuis : les cartes ont été corrigées grâce aux retours des animateur·ices, le guide s\'est étoffé, et le site aide maintenant à trouver des participant·es (il annonce votre atelier aux personnes inscrites près de chez vous).</p>',
    /* BLANC SUR ORANGE NE FAISAIT QUE 2,8:1, illisible, et ce courriel etait le
       seul a ne pas passer par le gabarit commun : l'apercu de /admin/ l'a mis
       sous les yeux. Meme bouton que partout ailleurs (lib/gabarit.js). */
    '<p style="margin:0 0 18px;text-align:center;">' + G.bouton(prog, "Programmer un atelier") + '</p>',
    '<p style="margin:0;font-size:13px;color:#6b665e;">Si ce n\'est pas le moment, ce message n\'attend aucune réponse. Nous ne relançons personne plus d\'une fois par semestre.</p>'
  ].join("");
  return { text, html: G.mailHtml(html) };
}

module.exports = { relance: relance };
