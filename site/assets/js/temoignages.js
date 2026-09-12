/* TEMOIGNAGES DE LA PAGE D'ACCUEIL.
   Lus dans data/temoignages.json plutot qu'ecrits dans la page : ajouter une
   phrase entendue apres un atelier ne doit pas demander de toucher au HTML.
   La section DISPARAIT tant qu'il n'y a pas au moins deux temoignages dans la
   langue affichee : mieux vaut pas de section du tout qu'une section a moitie
   vide, et surtout aucun texte de remplissage (un faux temoignage coute plus
   cher en confiance qu'il ne rapporte). */
(function () {
  "use strict";
  var sec = document.getElementById("temoignages");
  if (!sec) return;
  var zone = sec.querySelector(".temoins");
  var lang = (document.documentElement.lang || "fr").slice(0, 2);
  var base = sec.dataset.base || "";

  function partir() { if (sec.parentNode) sec.parentNode.removeChild(sec); }

  fetch(base + "data/temoignages.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var liste = (d && d.temoignages || []).filter(function (t) {
        return t && t.texte && (!t.lang || t.lang === lang);
      });
      if (liste.length < 2) { partir(); return; }
      liste.slice(0, 3).forEach(function (t) {
        var f = document.createElement("figure");
        f.className = "temoin";
        var q = document.createElement("blockquote");
        q.textContent = t.texte;
        var c = document.createElement("figcaption");
        c.textContent = t.qui || "";
        if (t.contexte) {
          var s = document.createElement("span");
          s.className = "temoin-ctx";
          s.textContent = t.contexte;
          c.appendChild(s);
        }
        f.appendChild(q); f.appendChild(c); zone.appendChild(f);
      });
      sec.hidden = false;
    })
    .catch(partir);
})();
