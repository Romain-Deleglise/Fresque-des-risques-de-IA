/* Abonnement aux alertes « prochains ateliers ».
   RAPPEL CSP : style-src 'self' sans 'unsafe-inline'. Aucun attribut style=" "
   ici : tout passe par des classes ou par element.style (CSSOM). */
(function () {
  "use strict";
  var form = document.getElementById("form-alertes");
  if (!form) return;

  var msg = document.getElementById("alertes-msg");
  var bloc = document.getElementById("bloc-zones");
  var champ = document.getElementById("commune-champ");
  var btnAjout = document.getElementById("commune-ajout");
  var liste = document.getElementById("zones-choisies");
  var rayon = document.getElementById("rayon");
  var MAX = 5;
  var zones = [];        // { code, nom, rayon }
  var enAttente = null;  // commune choisie dans la liste, pas encore ajoutée
  var rayonTouche = false;

  var picker = window.Commune.attacher(champ, "../", function (c) {
    enAttente = c;
    btnAjout.disabled = !c || zones.length >= MAX;
  });

  // Le rayon se pré-remplit sur la première commune : 15 km à Paris, 100 en
  // Lozère. Dès que la personne y touche, on ne le change plus sous ses yeux.
  rayon.addEventListener("change", function () { rayonTouche = true; });

  function libelle(code) {
    var z = zones.filter(function (x) { return x.code === code; })[0];
    return z ? z.nom : code;
  }

  function rendreZones() {
    liste.textContent = "";
    zones.forEach(function (z) {
      var code = z.code;
      var li = document.createElement("li");
      li.className = "puce-zone";
      li.textContent = z.nom + " ";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "puce-x";
      b.setAttribute("aria-label", "Retirer " + z.nom);
      b.textContent = "×";
      b.addEventListener("click", function () {
        zones = zones.filter(function (x) { return x.code !== code; });
        rendreZones();
      });
      li.appendChild(b);
      liste.appendChild(li);
    });
    btnAjout.disabled = !enAttente || zones.length >= MAX;
    if (!rayonTouche && zones.length) rayon.value = String(zones[0].rayon);
  }

  /* AJOUTER LA COMMUNE EN ATTENTE. Rendue independante du bouton, parce que
     l'envoi doit pouvoir s'en servir : voir le commentaire du `submit`. */
  function ajouterEnAttente() {
    if (!enAttente || zones.length >= MAX) return false;
    var code = enAttente.code;
    if (!zones.some(function (z) { return z.code === code; })) {
      zones.push({ code: code, nom: window.Commune.etiquette(enAttente), rayon: enAttente.rayon });
    }
    enAttente = null;
    picker.vider();
    rendreZones();
    return true;
  }

  btnAjout.addEventListener("click", ajouterEnAttente);

  // Le bloc « départements » n'a de sens que si la personne veut du présentiel.
  function majFormat() {
    var f = form.querySelector('input[name="format"]:checked');
    bloc.hidden = !f || f.value === "enligne";
  }
  form.querySelectorAll('input[name="format"]').forEach(function (r) {
    r.addEventListener("change", majFormat);
  });
  majFormat();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var format = (form.querySelector('input[name="format"]:checked') || {}).value || "les_deux";

    /* UNE COMMUNE CHOISIE MAIS PAS « AJOUTEE » EST QUAND MEME PRISE EN COMPTE.
       C'est le defaut qui a ete signale, et il etait silencieux : on tapait sa
       ville, on la choisissait dans la liste, elle restait AFFICHEE dans le
       champ, on envoyait, et elle etait jetee. Avec une seule ville on recevait
       un message d'erreur qui demandait de choisir une commune alors qu'elle
       etait sous les yeux ; avec une deuxieme, pire, on recevait « c'est
       note » et on n'etait jamais prevenu pour cette ville-la.
       Laisser une commune choisie dans le champ, c'est vouloir cette commune.
       Le bouton « Ajouter » ne sert donc plus qu'a en enchainer une autre. */
    if (format !== "enligne") ajouterEnAttente();

    if (format !== "enligne" && !zones.length) {
      msg.className = "msg err";
      /* Du texte qui ne designe aucune commune n'est pas la meme erreur que pas
         de texte du tout : on dit laquelle des deux. */
      msg.textContent = champ.value.trim()
        ? "« " + champ.value.trim() + " » n'a pas été choisi dans la liste : tapez les premières lettres, puis cliquez la proposition qui apparaît."
        : "Choisissez au moins une commune dans la liste, pour ne recevoir que ce qui est près de chez vous.";
      champ.focus();
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    msg.className = "msg";
    msg.textContent = "Enregistrement…";
    fetch("/.netlify/functions/alertes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "abonner",
        mail: form.querySelector('[name="mail"]').value.trim(),
        format: format,
        communes: format === "enligne" ? [] : zones.map(function (z) { return z.code; }),
        rayonKm: rayon.value,
        site: form.querySelector('[name="site"]').value
      })
    }).then(function (r) {
      // Idem : une réponse illisible devient un message compréhensible.
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) { /* laissé à null */ }
        if (!d) throw new Error("Le service ne répond pas pour le moment. Réessayez dans un instant.");
        return { ok: r.ok, d: d };
      });
    }).then(function (r) {
      if (!r.ok || !r.d.ok) throw new Error((r.d && r.d.erreur) || "Enregistrement impossible.");
      msg.className = "msg ok";
      /* CE QUI SE PASSE ENSUITE, DIT TOUT DE SUITE. Un abonnement n'existe
         qu'une fois le lien du premier e-mail ouvert : si la page se contente
         de « c'est noté », la personne attend des annonces qui ne partiront
         jamais. C'est exactement ce qu'un participant avait pris pour une
         panne. */
      msg.textContent = r.d.aConfirmer
        ? "Presque fini : ouvrez l'e-mail que nous venons d'envoyer et cliquez le lien de confirmation. Sans ce clic, aucune annonce ne partira."
        : r.d.miseAJour
        ? "C'est mis à jour. Vous recevrez les prochaines annonces selon ces choix."
          : "C'est noté. Vous serez prévenu·e dès qu'un atelier vous concerne.";
    }).catch(function (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    }).finally(function () { btn.disabled = false; });
  });

  /* MODIFIER SES PREFERENCES depuis le lien d'un e-mail (« ?m=<jeton> »). On
     relit l'etat enregistre et on repose le formulaire dessus : sans cela, la
     seule facon de changer de rayon etait de se desabonner puis de tout
     ressaisir de memoire. Le point d'entree existait cote serveur depuis le
     debut (« ?etat= »), aucune page ne s'en servait. */
  function prefRemplir() {
    var jeton = new URLSearchParams(location.search).get("m") || "";
    if (!jeton) return;
    fetch("/.netlify/functions/alertes?etat=" + encodeURIComponent(jeton))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var mailChamp = form.querySelector('[name="mail"]');
        if (d.mail && mailChamp) mailChamp.value = d.mail;
        var fmt = form.querySelector('input[name="format"][value="' + d.format + '"]');
        if (fmt) { fmt.checked = true; fmt.dispatchEvent(new Event("change", { bubbles: true })); }
        if (d.rayonKm) { rayon.value = String(d.rayonKm); rayonTouche = true; }
        zones = [];
        (d.communes || []).forEach(function (code) {
          zones.push({ code: code, nom: code, rayon: d.rayonKm });
        });
        rendreZones();
        // Les noms des communes ne sont pas dans la reponse : on les relit dans
        // la meme table que le champ de recherche, pour ne pas afficher un code.
        if (window.Commune && window.Commune.nommer) {
          window.Commune.nommer(zones.map(function (z) { return z.code; }), "../").then(function (noms) {
            zones.forEach(function (z) { if (noms[z.code]) z.nom = noms[z.code]; });
            rendreZones();
          }).catch(function () {});
        }
        if (msg) { msg.className = "msg"; msg.textContent = "Vos préférences actuelles sont affichées. Modifiez-les, puis envoyez."; }
      })
      .catch(function () { /* le formulaire reste utilisable, vide */ });
  }

  rendreZones();
  prefRemplir();
})();
