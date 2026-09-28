(function () {
  "use strict";
  var guardado = null;
  try { guardado = localStorage.getItem("chispa_tema_admin"); } catch (e) { guardado = null; }
  var oscuro = guardado ? guardado === "oscuro" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (oscuro) document.documentElement.classList.add("tema-oscuro");
})();
