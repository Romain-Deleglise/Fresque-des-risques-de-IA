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

  btnAjout.addEventListener("click", function () {
    if (!enAttente || zones.length >= MAX) return;
    var code = enAttente.code;
    if (!zones.some(function (z) { return z.code === code; })) {
      zones.push({ code: code, nom: window.Commune.etiquette(enAttente), rayon: enAttente.rayon });
    }
    enAttente = null;
    picker.vider();
    rendreZones();
  });

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
    if (format !== "enligne" && !zones.length) {
      msg.className = "msg err";
      msg.textContent = "Choisissez au moins une commune dans la liste, pour ne recevoir que ce qui est près de chez vous.";
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
      msg.textContent = r.d.miseAJour
        ? "C'est mis à jour. Vous recevrez les prochaines annonces selon ces choix."
        : "C'est noté. Vous serez prévenu·e dès qu'un atelier vous concerne.";
    }).catch(function (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    }).finally(function () { btn.disabled = false; });
  });

  rendreZones();
})();
