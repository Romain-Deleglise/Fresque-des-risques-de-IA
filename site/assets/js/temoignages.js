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

  /* DEUX SOURCES. Le fichier statique porte les temoignages ecrits a la main,
     et la fonction ceux qui sont arrives par /temoignage/ puis ont ete publies
     depuis l'espace admin. Publier dans l'admin doit suffire a les faire
     apparaitre ici, sans redeploiement. Si la fonction ne repond pas, le
     fichier statique s'affiche seul : la page d'accueil ne depend pas d'elle. */
  Promise.all([
    fetch(base + "data/temoignages.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }),
    fetch("/.netlify/functions/retour")
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
  ])
    .then(function (res) {
      var d = res[0];
      var recus = (res[1] && res[1].temoignages || []).map(function (t) {
        // Les temoignages deposes sur le site sont en francais ; la page
        // anglaise n'affiche que ceux du fichier statique marques lang:"en".
        // Le fichier statique nomme ce champ `contexte` : on s'aligne dessus,
        // sinon la precision saisie sur le site ne s'afficherait jamais.
        return { texte: t.texte, qui: t.qui, contexte: t.precision || "", lang: "fr" };
      });
      var liste = (d && d.temoignages || []).concat(recus).filter(function (t) {
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
