/* Tableau de bord d'audience : lit /.netlify/functions/stats et l'affiche.
   La clé (si le service en demande une) est gardée le temps de l'onglet. */
(function () {
  "use strict";
  var form = document.getElementById("stats-form");
  var cle = document.getElementById("stats-cle");
  var jours = document.getElementById("stats-jours");
  var msg = document.getElementById("stats-msg");
  var res = document.getElementById("stats-resultat");

  try { var k = sessionStorage.getItem("stats-cle"); if (k) cle.value = k; } catch (e) {}

  function fmt(n) { return (n || 0).toLocaleString("fr-FR"); }
  function vider(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function afficher(d) {
    document.getElementById("s-vues").textContent = fmt(d.total.vues);
    document.getElementById("s-uniques").textContent = fmt(d.total.uniques);
    document.getElementById("s-langues").textContent = fmt(d.total.langues.fr) + " / " + fmt(d.total.langues.en);

    var maxi = d.parJour.reduce(function (m, j) { return Math.max(m, j.vues); }, 0) || 1;
    var bars = document.getElementById("s-jours"); vider(bars);
    d.parJour.forEach(function (j) {
      var b = document.createElement("div"); b.className = "barre";
      b.title = j.jour + " : " + j.vues + " vues, " + j.uniques + " visites";
      var f = document.createElement("span"); f.className = "fill";
      f.style.height = Math.round((j.vues / maxi) * 100) + "%";
      b.appendChild(f); bars.appendChild(b);
    });

    remplirTable("s-pages", d.topPages);
    remplirTable("s-refs", d.topReferents);
    res.hidden = false;
  }
  function remplirTable(id, lignes) {
    var tb = document.querySelector("#" + id + " tbody"); vider(tb);
    (lignes || []).forEach(function (r) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td"); td1.textContent = r.nom;
      var td2 = document.createElement("td"); td2.textContent = r.n; td2.className = "n";
      tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
    });
    if (!lignes || !lignes.length) {
      var tr = document.createElement("tr"); var td = document.createElement("td");
      td.colSpan = 2; td.className = "vide"; td.textContent = "Aucune donnée pour l'instant.";
      tr.appendChild(td); tb.appendChild(tr);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.textContent = "Chargement…";
    try { sessionStorage.setItem("stats-cle", cle.value || ""); } catch (x) {}
    var url = "/.netlify/functions/stats?jours=" + encodeURIComponent(jours.value);
    if (cle.value) url += "&key=" + encodeURIComponent(cle.value);
    fetch(url)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (o) {
        if (!o.ok) { msg.textContent = o.d && o.d.error ? o.d.error : "Accès refusé."; return; }
        msg.textContent = ""; afficher(o.d);
      })
      .catch(function () { msg.textContent = "Service indisponible."; });
  });
})();
