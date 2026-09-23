/* Abonnement aux alertes « prochains ateliers ».
   RAPPEL CSP : style-src 'self' sans 'unsafe-inline'. Aucun attribut style=" "
   ici : tout passe par des classes ou par element.style (CSSOM). */
(function () {
  "use strict";
  var form = document.getElementById("form-alertes");
  if (!form) return;

  var msg = document.getElementById("alertes-msg");
  var bloc = document.getElementById("bloc-zones");
  var choix = document.getElementById("zone-choix");
  var liste = document.getElementById("zones-choisies");
  var MAX = 8;
  var zones = [];

  function libelle(code) {
    var o = choix.querySelector('option[value="' + code + '"]');
    return o ? o.textContent : code;
  }

  function rendreZones() {
    liste.textContent = "";
    zones.forEach(function (code) {
      var li = document.createElement("li");
      li.className = "puce-zone";
      li.textContent = libelle(code) + " ";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "puce-x";
      b.setAttribute("aria-label", "Retirer " + libelle(code));
      b.textContent = "×";
      b.addEventListener("click", function () {
        zones = zones.filter(function (z) { return z !== code; });
        rendreZones();
      });
      li.appendChild(b);
      liste.appendChild(li);
    });
    document.getElementById("zone-ajout").disabled = zones.length >= MAX;
  }

  document.getElementById("zone-ajout").addEventListener("click", function () {
    var v = choix.value;
    if (!v || zones.indexOf(v) !== -1 || zones.length >= MAX) return;
    zones.push(v);
    choix.value = "";
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
      msg.textContent = "Choisissez au moins un département, pour ne recevoir que ce qui est près de chez vous.";
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
        zones: format === "enligne" ? [] : zones,
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
