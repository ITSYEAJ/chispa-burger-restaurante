(function () {
  "use strict";

  var C = window.Chispa;
  document.documentElement.classList.add("js");

  var reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hayServidor = location.protocol === "http:" || location.protocol === "https:";
  var css = getComputedStyle(document.body);
  var PALETA = {
    fondo: css.getPropertyValue("--color-1").trim() || "#191919",
    claro: css.getPropertyValue("--color-2").trim() || "#E8E6E1",
    acento: css.getPropertyValue("--color-3").trim() || "#E8572A"
  };
  var POR_PAGINA = 8;

  function $(id) { return document.getElementById(id); }

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  var almacen = {
    leer: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    guardar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return; } }
  };

  var estado = {
    platos: [],
    extras: C.EXTRAS,
    quitar: C.QUITAR,
    envio: { costo: 2.5, gratis_desde: 25, minimo: 10 },
    cocina: null,
    bolsa: Array.isArray(almacen.leer("chispa_bolsa")) ? almacen.leer("chispa_bolsa") : [],
    filtro: { categoria: "todo", texto: "" },
    visibles: POR_PAGINA,
    token: ""
  };

  function buscarPlato(id) {
    for (var i = 0; i < estado.platos.length; i++) if (estado.platos[i].id === id) return estado.platos[i];
    return null;
  }

  function normalizar(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function foto(p, clase, perezosa) {
    var img = el("img", clase);
    img.src = C.rutaImagen(p) || "../img/menu/la-chispa.webp";
    img.alt = p.nombre;
    img.width = 800;
    img.height = 600;
    img.decoding = "async";
    if (perezosa !== false) img.loading = "lazy";
    return img;
  }

  function crearPrecio(p) {
    var s = el("span", "precio" + (p.precio_original ? " precio--promo" : ""), C.dinero(p.precio));
    if (p.precio_original) {
      var d = el("del", null, C.dinero(p.precio_original));
      d.setAttribute("aria-label", "antes " + C.dinero(p.precio_original));
      s.appendChild(d);
    }
    return s;
  }

  var temporizadorToast;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("visible");
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () { t.classList.remove("visible"); }, 3500);
  }

  function irA(sel) {
    var d = document.querySelector(sel);
    if (d) d.scrollIntoView({ behavior: reducirMovimiento ? "auto" : "smooth" });
  }

  function hora(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }

  function iniciarLogo() {
    var canvas = $("logoCanvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = 56 * dpr;
    canvas.height = 56 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var inicio = null;
    var activo = false;
    var DURACION = 2400;

    function chispa(x, y, r, alfa) {
      ctx.save();
      ctx.globalAlpha = alfa;
      ctx.fillStyle = PALETA.claro;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
      ctx.restore();
    }

    function dibujar(ms) {
      var e = reducirMovimiento ? 1 : Math.min(1, ms / 800);
      var s = 1 - Math.pow(1 - e, 3);
      ctx.clearRect(0, 0, 56, 56);
      ctx.fillStyle = PALETA.acento;
      ctx.beginPath();
      ctx.moveTo(28, 28);
      ctx.arc(28, 28, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(28, 28, 22, 0, Math.PI * 2 * s);
      ctx.stroke();
      ctx.globalAlpha = s;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 30px 'Cascadia Code', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("C", 27, 30);
      ctx.globalAlpha = 1;
      var ciclo = reducirMovimiento || ms > DURACION ? 0.5 : (ms % 1200) / 1200;
      var brillo = Math.sin(ciclo * Math.PI);
      chispa(44, 12, 2.5 + brillo * 4, s * (0.5 + brillo * 0.5));
      chispa(12, 44, 1.5 + (1 - brillo) * 2, s * 0.6);
    }

    function bucle(t) {
      if (inicio === null) inicio = t;
      var ms = t - inicio;
      dibujar(ms);
      if (ms < DURACION + 100) requestAnimationFrame(bucle); else activo = false;
    }

    function reproducir(desde) {
      if (activo || reducirMovimiento) return;
      activo = true;
      inicio = null;
      requestAnimationFrame(function (t) { inicio = t - (desde || 0); bucle(t); });
    }

    canvas.parentElement.addEventListener("mouseenter", function () { reproducir(800); });
    var fuente = document.fonts && document.fonts.load ? document.fonts.load("700 30px 'Cascadia Code'") : Promise.resolve();
    Promise.race([fuente, new Promise(function (r) { setTimeout(r, 1200); })]).then(function () {
      if (reducirMovimiento) dibujar(DURACION); else reproducir(0);
    });
  }

  function iniciarNavegacion() {
    var encabezado = $("encabezado");
    var boton = document.querySelector(".barra__toggle");
    var menu = $("menu");
    function cerrar() { menu.classList.remove("abierto"); boton.setAttribute("aria-expanded", "false"); }
    boton.addEventListener("click", function () { boton.setAttribute("aria-expanded", String(menu.classList.toggle("abierto"))); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) cerrar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(); });
    window.addEventListener("scroll", function () { encabezado.classList.toggle("con-borde", window.scrollY > 8); }, { passive: true });
    $("abrirBolsa").addEventListener("click", abrirBolsa);
    $("barraPedido").addEventListener("click", function (e) { e.preventDefault(); abrirBolsa(); });

    if (!("IntersectionObserver" in window)) return;
    var enlaces = menu.querySelectorAll("a[href^='#']");
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        enlaces.forEach(function (a) {
          var activo = a.getAttribute("href") === "#" + en.target.id;
          a.classList.toggle("activo", activo);
          if (activo) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main section[id]").forEach(function (s) { obs.observe(s); });
  }

  function cocinaLocal() {
    var franjas = [];
    var t = new Date(Date.now() + 20 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
    for (var i = 0; i < 12; i++) {
      var f = new Date(t.getTime() + i * 15 * 60000);
      franjas.push({ valor: f.toISOString().slice(0, 16), etiqueta: hora(f), dia: "Hoy", disponible: i % 5 !== 1 });
    }
    return {
      abierto: true, espera_min: 14, mensaje: "", cierra: "23:00", horario_hoy: "11:00–23:00", dia_hoy: new Date().getDay(),
      semana: [{ dias: "Lunes a sábado", horas: "11:00–23:00", incluye: [1, 2, 3, 4, 5, 6] }, { dias: "Domingo", horas: "12:00–22:00", incluye: [0] }],
      promo: { activa: false, texto: "Lunes a viernes · 15:00 a 18:00" }, franjas: franjas
    };
  }

  function cargarMenu() {
    var respaldo = { platos: C.MENU_LOCAL, cocina: cocinaLocal() };
    if (!hayServidor) return Promise.resolve(respaldo);
    return fetch("../api/menu.php", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("menu"); return r.json(); })
      .then(function (d) { return Array.isArray(d.platos) ? d : respaldo; })
      .catch(function () { return respaldo; });
  }

  function aplicarMenu(d) {
    estado.platos = d.platos;
    if (d.extras) estado.extras = d.extras;
    if (d.quitar) estado.quitar = d.quitar;
    if (d.envio) estado.envio = d.envio;
    if (d.cocina) aplicarCocina(d.cocina);
    estado.bolsa = estado.bolsa.filter(function (l) { return buscarPlato(l.id); });
    guardarBolsa();
    pintarFavoritos();
    pintarPestanas();
    pintarPlatos();
    pintarBolsa();
  }

  function refrescarCocina() {
    if (!hayServidor) return;
    fetch("../api/cocina.php", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) aplicarCocina(d); })
      .catch(function () { return null; });
  }

  function aplicarCocina(c) {
    estado.cocina = c;
    $("datoEspera").textContent = c.abierto ? "~" + c.espera_min + " min" : "Cerrado";
    $("cifraEspera").textContent = c.abierto ? c.espera_min + " min" : "—";
    if (c.horario_hoy) $("datoHorario").textContent = c.horario_hoy;
    $("cuandoAhoraTexto").textContent = c.abierto ? "~" + c.espera_min + " min" : "cerrado ahora";
    var ahora = document.querySelector("input[name='cuando'][value='ahora']");
    ahora.disabled = !c.abierto;
    if (!c.abierto) {
      document.querySelector("input[name='cuando'][value='programar']").checked = true;
      actualizarCuando();
    }
    if (c.promo) $("promoEstado").textContent = c.promo.activa ? "Activa ahora · hasta las 18:00" : c.promo.texto;
    pintarHorario(c);
    pintarFranjas();
  }

  function pintarHorario(c) {
    if (!Array.isArray(c.semana)) return;
    var lista = $("horarioLista");
    var pie = $("pieHorario");
    lista.textContent = "";
    pie.textContent = "";
    c.semana.forEach(function (d) {
      var li = el("li", (d.incluye || []).indexOf(c.dia_hoy) !== -1 ? "hoy" : "");
      li.appendChild(el("span", null, d.dias + ((d.incluye || []).indexOf(c.dia_hoy) !== -1 ? " · hoy" : "")));
      li.appendChild(el("span", null, d.horas));
      lista.appendChild(li);
      pie.appendChild(el("li", null, d.dias + " · " + d.horas));
    });
  }

  function pintarFavoritos() {
    var cont = $("favoritosLista");
    cont.textContent = "";
    var favs = estado.platos.filter(function (p) { return p.favorito && p.disponible; }).slice(0, 3);
    if (favs.length < 3) favs = favs.concat(estado.platos.filter(function (p) { return p.disponible && favs.indexOf(p) === -1; }).slice(0, 3 - favs.length));
    favs.forEach(function (p, i) {
      var b = el("button", "favorito");
      b.type = "button";
      b.setAttribute("aria-label", p.nombre + ", " + C.dinero(p.precio) + ". Personalizar y agregar");
      b.appendChild(foto(p));
      b.appendChild(el("span", "favorito__num", "0" + (i + 1)));
      b.appendChild(el("h3", null, p.nombre));
      b.appendChild(el("p", null, p.descripcion));
      var pie = el("span", "favorito__pie");
      pie.appendChild(el("span", "favorito__precio", C.dinero(p.precio)));
      var mas = el("span", "favorito__mas");
      mas.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>');
      pie.appendChild(mas);
      b.appendChild(pie);
      b.addEventListener("click", function () { abrirFicha(p.id); });
      cont.appendChild(b);
    });
  }

  function pintarEsqueletos() {
    var cont = $("platos");
    cont.textContent = "";
    for (var i = 0; i < POR_PAGINA; i++) {
      var a = el("div", "plato esqueleto");
      a.setAttribute("aria-hidden", "true");
      a.appendChild(el("div", "plato__foto"));
      var info = el("div", "plato__info");
      info.appendChild(el("div", "esqueleto__linea esqueleto__linea--titulo"));
      info.appendChild(el("div", "esqueleto__linea"));
      info.appendChild(el("div", "esqueleto__linea esqueleto__linea--corta"));
      a.appendChild(info);
      cont.appendChild(a);
    }
    $("conteo").textContent = "Cargando menú…";
  }

  function pintarPestanas() {
    var cont = $("pestanas");
    cont.textContent = "";
    [["todo", "Todo"]].concat(Object.keys(C.CATEGORIAS).map(function (k) { return [k, C.CATEGORIAS[k]]; })).forEach(function (o) {
      var n = o[0] === "todo" ? estado.platos.length : estado.platos.filter(function (p) { return p.categoria === o[0]; }).length;
      if (!n) return;
      var b = el("button", "pestana", o[1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(estado.filtro.categoria === o[0]));
      b.addEventListener("click", function () {
        estado.filtro.categoria = o[0];
        estado.visibles = POR_PAGINA;
        pintarPestanas();
        pintarPlatos();
      });
      cont.appendChild(b);
    });
  }

  function platosFiltrados() {
    var f = estado.filtro;
    var texto = normalizar(f.texto.trim());
    return estado.platos.filter(function (p) {
      if (f.categoria !== "todo" && p.categoria !== f.categoria) return false;
      if (texto && normalizar(p.nombre + " " + p.descripcion).indexOf(texto) === -1) return false;
      return true;
    }).sort(function (a, b) { return (b.disponible - a.disponible) || (a.orden - b.orden); });
  }

  function tieneOpciones(p) {
    return (estado.extras[p.categoria] || []).length > 0 || (estado.quitar[p.categoria] || []).length > 0;
  }

  function crearTarjeta(p, i) {
    var art = el("article", "plato" + (p.disponible ? "" : " plato--agotado"));
    art.style.setProperty("--retraso", Math.min(i, 8) * 0.04 + "s");

    var btnFoto = el("button", "plato__foto");
    btnFoto.type = "button";
    btnFoto.disabled = !p.disponible;
    btnFoto.setAttribute("aria-label", "Ver " + p.nombre);
    btnFoto.appendChild(foto(p));
    var ins = el("span", "insignias");
    if (!p.disponible) ins.appendChild(el("span", "insignia insignia--agotado", p.motivo || "Agotado"));
    if (p.promo) ins.appendChild(el("span", "insignia insignia--promo", p.promo));
    if (p.nuevo) ins.appendChild(el("span", "insignia insignia--nuevo", "Nuevo"));
    if (p.picante) ins.appendChild(el("span", "insignia", "Picante"));
    btnFoto.appendChild(ins);
    btnFoto.addEventListener("click", function () { abrirFicha(p.id); });
    art.appendChild(btnFoto);

    var info = el("div", "plato__info");
    var fila = el("div", "plato__fila");
    var h = el("h3", "plato__nombre");
    var bn = el("button", null, p.nombre);
    bn.type = "button";
    bn.disabled = !p.disponible;
    bn.addEventListener("click", function () { abrirFicha(p.id); });
    h.appendChild(bn);
    fila.appendChild(h);
    fila.appendChild(crearPrecio(p));
    info.appendChild(fila);
    info.appendChild(el("p", "plato__desc", p.descripcion));

    var pie = el("div", "plato__pie");
    pie.appendChild(p.disponible ? el("span", "plato__meta", p.kcal ? p.kcal + " kcal" : "") : el("span", "plato__motivo", "Vuelve pronto"));
    var mas = el("button", "agregar");
    mas.type = "button";
    mas.disabled = !p.disponible;
    mas.setAttribute("aria-label", "Agregar " + p.nombre);
    mas.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>');
    mas.appendChild(document.createTextNode("Agregar"));
    mas.addEventListener("click", function () {
      if (tieneOpciones(p)) abrirFicha(p.id);
      else agregarABolsa({ id: p.id, cantidad: 1, extras: [], quitar: [], nota: "" });
    });
    pie.appendChild(mas);
    info.appendChild(pie);
    art.appendChild(info);
    return art;
  }

  function pintarPlatos(soloNuevos) {
    var cont = $("platos");
    var lista = platosFiltrados();
    var desde = soloNuevos ? cont.children.length : 0;
    if (!soloNuevos) cont.textContent = "";
    var frag = document.createDocumentFragment();
    lista.slice(desde, estado.visibles).forEach(function (p, i) { frag.appendChild(crearTarjeta(p, i)); });
    cont.appendChild(frag);
    $("vacio").hidden = lista.length > 0;
    $("conteo").textContent = lista.length + (lista.length === 1 ? " platillo" : " platillos");
    var mostrados = Math.min(estado.visibles, lista.length);
    var restantes = lista.length - mostrados;
    $("verMas").hidden = lista.length <= POR_PAGINA;
    $("verMasTexto").textContent = restantes > 0 ? "Estás viendo " + mostrados + " de " + lista.length + " platillos" : "Ya viste todo el menú";
    $("verMasBarra").style.width = (lista.length ? mostrados / lista.length * 100 : 0) + "%";
    $("botonVerMas").hidden = restantes <= 0;
    $("botonVerMasTexto").textContent = "Ver " + Math.min(POR_PAGINA, restantes) + " más";
  }

  function iniciarFiltros() {
    var espera;
    $("buscar").addEventListener("input", function (e) {
      clearTimeout(espera);
      espera = setTimeout(function () {
        estado.filtro.texto = e.target.value.slice(0, 40);
        estado.visibles = POR_PAGINA;
        pintarPlatos();
      }, 180);
    });
    $("limpiarFiltros").addEventListener("click", function () {
      estado.filtro = { categoria: "todo", texto: "" };
      $("buscar").value = "";
      estado.visibles = POR_PAGINA;
      pintarPestanas();
      pintarPlatos();
    });
    $("botonVerMas").addEventListener("click", function () {
      var primera = $("platos").children.length;
      estado.visibles += POR_PAGINA;
      pintarPlatos(true);
      var nueva = $("platos").children[primera];
      if (nueva) {
        var b = nueva.querySelector(".plato__nombre button");
        if (b) b.focus({ preventScroll: true });
      }
    });
    $("promoBoton").addEventListener("click", function () {
      var papas = buscarPlato("papas-clasicas");
      if (papas && papas.disponible) abrirFicha(papas.id); else toast("Las papas no están disponibles en este momento.");
    });
  }

  var ficha = { plato: null, cantidad: 1 };

  function extrasDe(p) { return estado.extras[p.categoria] || []; }

  function precioLinea(l) {
    var p = buscarPlato(l.id);
    if (!p) return 0;
    var extra = extrasDe(p).reduce(function (s, x) { return s + (l.extras.indexOf(x.id) !== -1 ? x.precio : 0); }, 0);
    return (p.precio + extra) * l.cantidad;
  }

  function leerFicha() {
    return {
      id: ficha.plato.id,
      cantidad: ficha.cantidad,
      extras: Array.prototype.map.call($("fichaExtras").querySelectorAll("input:checked"), function (i) { return i.value; }),
      quitar: Array.prototype.map.call($("fichaQuitar").querySelectorAll("input:checked"), function (i) { return i.value; }),
      nota: $("fichaNota").value.trim().slice(0, 80)
    };
  }

  function actualizarFicha() {
    $("fichaCantidad").textContent = ficha.cantidad;
    $("fichaAgregar").textContent = "Agregar · " + C.dinero(precioLinea(leerFicha()));
  }

  function abrirFicha(id) {
    var p = buscarPlato(id);
    if (!p || !p.disponible) return;
    ficha.plato = p;
    ficha.cantidad = 1;
    var contFoto = $("fichaFoto");
    Array.prototype.slice.call(contFoto.querySelectorAll("img")).forEach(function (n) { n.remove(); });
    contFoto.insertBefore(foto(p, null, false), contFoto.firstChild);
    $("fichaCategoria").textContent = C.CATEGORIAS[p.categoria] || "";
    $("fichaNombre").textContent = p.nombre;
    $("fichaDesc").textContent = p.descripcion;
    var meta = C.dinero(p.precio) + (p.kcal ? " · " + p.kcal + " kcal" : "") + (p.picante ? " · picante" : "");
    $("fichaMeta").textContent = meta;
    $("fichaNota").value = "";

    var grupo = $("fichaExtras");
    Array.prototype.slice.call(grupo.querySelectorAll(".opcion")).forEach(function (n) { n.remove(); });
    var extras = extrasDe(p);
    grupo.hidden = !extras.length;
    extras.forEach(function (x) {
      var lab = el("label", "opcion" + (x.disponible === false ? " opcion--no" : ""));
      var inp = el("input");
      inp.type = "checkbox";
      inp.value = x.id;
      inp.disabled = x.disponible === false;
      inp.addEventListener("change", actualizarFicha);
      lab.appendChild(inp);
      lab.appendChild(el("span", null, x.nombre));
      lab.appendChild(el("small", null, x.disponible === false ? "agotado" : "+" + C.dinero(x.precio)));
      grupo.appendChild(lab);
    });

    var quitar = estado.quitar[p.categoria] || [];
    $("fichaQuitarGrupo").hidden = !quitar.length;
    var q = $("fichaQuitar");
    q.textContent = "";
    quitar.forEach(function (nombre) {
      var lab = el("label");
      var inp = el("input");
      inp.type = "checkbox";
      inp.value = nombre;
      lab.appendChild(inp);
      lab.appendChild(el("span", null, nombre));
      q.appendChild(lab);
    });

    actualizarFicha();
    $("dlgPlato").showModal();
    $("fichaAgregar").focus({ preventScroll: true });
  }

  function iniciarFicha() {
    $("fichaMenos").addEventListener("click", function () { ficha.cantidad = Math.max(1, ficha.cantidad - 1); actualizarFicha(); });
    $("fichaMas").addEventListener("click", function () { ficha.cantidad = Math.min(10, ficha.cantidad + 1); actualizarFicha(); });
    $("formPlato").addEventListener("submit", function (e) {
      e.preventDefault();
      agregarABolsa(leerFicha());
      $("dlgPlato").close();
    });
  }

  function claveLinea(l) {
    return [l.id, l.extras.slice().sort().join("+"), l.quitar.slice().sort().join("+"), l.nota].join("|");
  }

  function guardarBolsa() { almacen.guardar("chispa_bolsa", estado.bolsa); }

  function agregarABolsa(linea) {
    var p = buscarPlato(linea.id);
    if (!p || !p.disponible) return;
    var existente = estado.bolsa.find(function (l) { return claveLinea(l) === claveLinea(linea); });
    if (existente) existente.cantidad = Math.min(10, existente.cantidad + linea.cantidad);
    else estado.bolsa.push(linea);
    guardarBolsa();
    pintarBolsa();
    var num = $("bolsaNum");
    num.classList.remove("salto");
    void num.offsetWidth;
    num.classList.add("salto");
    toast(linea.cantidad + " × " + p.nombre + " agregado");
  }

  function esDomicilio() {
    var r = document.querySelector("input[name='tipo']:checked");
    return r && r.value === "domicilio";
  }

  function totales() {
    var subtotal = estado.bolsa.reduce(function (s, l) { return s + precioLinea(l); }, 0);
    var envio = esDomicilio() && subtotal > 0 && subtotal < estado.envio.gratis_desde ? estado.envio.costo : 0;
    return { subtotal: subtotal, envio: envio, total: subtotal + envio };
  }

  function describirLinea(l, p) {
    var partes = [];
    extrasDe(p).forEach(function (x) { if (l.extras.indexOf(x.id) !== -1) partes.push("+ " + x.nombre); });
    l.quitar.forEach(function (q) { partes.push("sin " + q.toLowerCase()); });
    if (l.nota) partes.push("“" + l.nota + "”");
    return partes.join(" · ");
  }

  function pintarBolsa() {
    var cantidad = estado.bolsa.reduce(function (s, l) { return s + l.cantidad; }, 0);
    $("bolsaNum").textContent = cantidad;
    $("bolsaNum").hidden = cantidad === 0;
    $("bolsaCuenta").textContent = cantidad ? "(" + cantidad + ")" : "";

    var lista = $("bolsaLineas");
    lista.textContent = "";
    estado.bolsa.forEach(function (l, i) {
      var p = buscarPlato(l.id);
      if (!p) return;
      var li = el("li", "linea");
      var img = foto(p, "linea__img");
      img.alt = "";
      li.appendChild(img);
      var centro = el("div");
      centro.appendChild(el("p", "linea__nombre", p.nombre));
      var detalle = describirLinea(l, p);
      if (detalle) centro.appendChild(el("p", "linea__meta", detalle));
      if (!p.disponible) centro.appendChild(el("p", "linea__meta", "Se agotó: quítalo para continuar."));
      var cant = el("div", "cantidad");
      var menos = el("button", null, "−");
      var mas = el("button", null, "+");
      menos.type = mas.type = "button";
      menos.setAttribute("aria-label", "Quitar una unidad de " + p.nombre);
      mas.setAttribute("aria-label", "Agregar una unidad de " + p.nombre);
      menos.addEventListener("click", function () { cambiarCantidad(i, -1); });
      mas.addEventListener("click", function () { cambiarCantidad(i, 1); });
      cant.appendChild(menos);
      cant.appendChild(el("span", null, String(l.cantidad)));
      cant.appendChild(mas);
      centro.appendChild(cant);
      li.appendChild(centro);
      var lado = el("div", "linea__lado");
      lado.appendChild(el("span", "precio", C.dinero(precioLinea(l))));
      var quitar = el("button", "linea__quitar", "Quitar");
      quitar.type = "button";
      quitar.setAttribute("aria-label", "Quitar " + p.nombre + " del pedido");
      quitar.addEventListener("click", function () { estado.bolsa.splice(i, 1); guardarBolsa(); pintarBolsa(); });
      lado.appendChild(quitar);
      li.appendChild(lado);
      lista.appendChild(li);
    });

    var vacia = cantidad === 0;
    $("bolsaVacia").hidden = !vacia;
    $("bolsaPie").hidden = vacia;
    $("avisoEnvio").hidden = vacia;
    var t = totales();
    var falta = estado.envio.gratis_desde - t.subtotal;
    $("envioTexto").textContent = falta > 0
      ? "Envío a domicilio gratis desde " + C.dinero(estado.envio.gratis_desde) + ". Te faltan " + C.dinero(falta) + "."
      : "Tu envío a domicilio es gratis.";
    $("envioBarra").style.width = Math.min(100, t.subtotal / estado.envio.gratis_desde * 100) + "%";
    $("tipoEnvioTexto").textContent = falta > 0 ? "+" + C.dinero(estado.envio.costo) + " envío" : "envío gratis";
    $("bolsaSubtotal").textContent = C.dinero(t.subtotal);
    $("bolsaEnvio").textContent = esDomicilio() ? (t.envio ? C.dinero(t.envio) : "Gratis") : "Recoges en tienda";
    $("bolsaTotal").textContent = C.dinero(t.total);
    $("botonPagar").textContent = "Confirmar pedido · " + C.dinero(t.total);

    var barra = $("barraPedido");
    barra.hidden = vacia;
    barra.classList.toggle("visible", !vacia);
    $("barraCantidad").textContent = cantidad;
    $("barraTotal").textContent = C.dinero(t.subtotal);
  }

  function cambiarCantidad(i, delta) {
    var l = estado.bolsa[i];
    if (!l) return;
    l.cantidad = Math.min(10, l.cantidad + delta);
    if (l.cantidad <= 0) estado.bolsa.splice(i, 1);
    guardarBolsa();
    pintarBolsa();
  }

  function mostrarPaso(id) {
    ["pasoBolsa", "pasoPago", "pasoListo"].forEach(function (p) { $(p).hidden = p !== id; });
  }

  function abrirBolsa() {
    mostrarPaso("pasoBolsa");
    pintarBolsa();
    if (!$("dlgBolsa").open) $("dlgBolsa").showModal();
  }

  function pintarFranjas() {
    var sel = $("pFranja");
    var elegido = sel.value;
    sel.textContent = "";
    var franjas = (estado.cocina && estado.cocina.franjas) || [];
    if (!franjas.length) { sel.appendChild(new Option("No hay turnos disponibles", "")); return; }
    var grupos = {};
    franjas.forEach(function (f) {
      if (!grupos[f.dia]) {
        grupos[f.dia] = el("optgroup");
        grupos[f.dia].label = f.dia;
        sel.appendChild(grupos[f.dia]);
      }
      var o = new Option(f.etiqueta + (f.disponible ? "" : " · lleno"), f.valor, false, f.valor === elegido);
      o.disabled = !f.disponible;
      grupos[f.dia].appendChild(o);
    });
    if (!sel.value || (sel.selectedOptions[0] && sel.selectedOptions[0].disabled)) {
      var libre = franjas.find(function (f) { return f.disponible; });
      if (libre) sel.value = libre.valor;
    }
  }

  function actualizarCuando() {
    $("campoFranja").hidden = document.querySelector("input[name='cuando']:checked").value !== "programar";
  }

  var REGLAS = {
    nombre: function (v) { return /^[\p{L}\s'.-]{2,60}$/u.test(v) || "Escribe tu nombre usando solo letras."; },
    telefono: function (v) { return /^[0-9 +()-]{7,20}$/.test(v) || "Escribe un teléfono de al menos 7 dígitos."; }
  };

  function iniciarPago() {
    var form = $("pasoPago");
    document.querySelectorAll("input[name='tipo']").forEach(function (r) {
      r.addEventListener("change", function () { $("campoDireccion").hidden = !esDomicilio(); pintarBolsa(); });
    });
    document.querySelectorAll("input[name='cuando']").forEach(function (r) { r.addEventListener("change", actualizarCuando); });

    $("irPagar").addEventListener("click", function () {
      if (estado.bolsa.some(function (l) { var p = buscarPlato(l.id); return !p || !p.disponible; })) {
        toast("Quita los platillos agotados antes de continuar.");
        return;
      }
      var cliente = almacen.leer("chispa_cliente");
      if (cliente) {
        ["nombre", "telefono", "direccion"].forEach(function (k) {
          if (!form.elements[k].value && typeof cliente[k] === "string") form.elements[k].value = cliente[k];
        });
      }
      pintarFranjas();
      mostrarPaso("pasoPago");
      pintarBolsa();
      form.elements.nombre.focus();
    });
    $("volverBolsa").addEventListener("click", function () { mostrarPaso("pasoBolsa"); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var error = $("errorPago");
      error.textContent = "";
      var fallo = null;
      Object.keys(REGLAS).forEach(function (k) {
        var r = REGLAS[k](form.elements[k].value.trim());
        form.elements[k].setAttribute("aria-invalid", String(r !== true));
        if (r !== true && !fallo) fallo = { input: form.elements[k], msg: r };
      });
      var direccion = form.elements.direccion.value.trim();
      var t = totales();
      if (!fallo && esDomicilio() && direccion.length < 6) fallo = { input: form.elements.direccion, msg: "Escribe la dirección completa, con calle y número." };
      if (!fallo && esDomicilio() && t.subtotal < estado.envio.minimo) fallo = { input: form.elements.direccion, msg: "El pedido mínimo a domicilio es " + C.dinero(estado.envio.minimo) + ". Agrega algo más o elige recoger." };
      var programar = form.elements.cuando.value === "programar";
      if (!fallo && programar && !form.elements.franja.value) fallo = { input: form.elements.franja, msg: "Elige un turno con lugar disponible." };
      if (fallo) { error.textContent = fallo.msg; fallo.input.focus(); return; }

      var pedido = {
        tipo: esDomicilio() ? "domicilio" : "recoger",
        direccion: esDomicilio() ? direccion : "",
        franja: programar ? form.elements.franja.value : "",
        nombre: form.elements.nombre.value.trim(),
        telefono: form.elements.telefono.value.trim(),
        pago: form.elements.pago.value,
        notas: form.elements.notas.value.trim().slice(0, 160),
        sitio_web: form.elements.sitio_web.value,
        items: estado.bolsa.map(function (l) { return { id: l.id, cantidad: l.cantidad, extras: l.extras, quitar: l.quitar, nota: l.nota }; })
      };
      almacen.guardar("chispa_cliente", { nombre: pedido.nombre, telefono: pedido.telefono, direccion: pedido.direccion });

      if (!hayServidor) {
        terminarPedido({ numero: "CH-DEMO", codigo: "LOCAL", listo_estimado: new Date(Date.now() + 15 * 60000).toISOString(), tipo: pedido.tipo, estado: "recibido", demo: true });
        return;
      }
      var boton = $("botonPagar");
      boton.disabled = true;
      boton.textContent = "Enviando a cocina…";
      fetch("../api/pedidos.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": estado.token },
        body: JSON.stringify(pedido)
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (r) {
          if (r.ok) { terminarPedido(r); cargarMenu().then(aplicarMenu); }
          else {
            error.textContent = r.mensaje || "No pudimos enviar el pedido. Intenta de nuevo.";
            if (r.recargar) cargarMenu().then(aplicarMenu);
          }
        })
        .catch(function () { error.textContent = "Sin conexión con el restaurante. Revisa tu internet e intenta de nuevo."; })
        .finally(function () { boton.disabled = false; pintarBolsa(); });
    });
  }

  function terminarPedido(r) {
    estado.bolsa = [];
    guardarBolsa();
    pintarBolsa();
    $("listoNumero").textContent = r.numero;
    $("listoCodigo").textContent = "Código de seguimiento: " + r.codigo;
    var cuando = hora(r.listo_estimado);
    $("listoTexto").textContent = r.demo
      ? "Modo local: el pedido no se envió porque la página está abierta como archivo. Ábrela desde XAMPP para enviar pedidos reales."
      : (r.tipo === "domicilio" ? "Llega aproximadamente a las " + cuando + "." : "Estará listo a las " + cuando + ". Pasa al mostrador de pedidos en línea.");
    pintarLinea($("listoLinea"), r.estado || "recibido", r.tipo);
    mostrarPaso("pasoListo");
    if (!r.demo) {
      almacen.guardar("chispa_ultimo", { numero: r.numero, codigo: r.codigo });
      $("rNumero").value = r.numero;
      $("rCodigo").value = r.codigo;
      seguirPedido(true);
    }
  }

  var PASOS = [
    ["recibido", "Recibido", "La cocina ya lo tiene"],
    ["preparando", "En la plancha", "Se está preparando"],
    ["listo", "Listo", "Esperándote"],
    ["entregado", "Entregado", "¡Buen provecho!"]
  ];

  function pintarLinea(ol, actual, tipo) {
    ol.textContent = "";
    var indice = PASOS.findIndex(function (p) { return p[0] === actual; });
    PASOS.forEach(function (p, i) {
      var li = el("li");
      if (actual !== "cancelado" && (i < indice || (i === indice && (actual === "listo" || actual === "entregado")))) li.className = "hecho";
      else if (i === indice) li.className = "actual";
      li.appendChild(el("strong", null, p[0] === "listo" && tipo === "domicilio" ? "En camino" : p[1]));
      li.appendChild(document.createTextNode(p[2]));
      ol.appendChild(li);
    });
  }

  var sondeo = null;

  function seguirPedido(silencioso) {
    var numero = $("rNumero").value.trim().toUpperCase();
    var codigo = $("rCodigo").value.trim().toUpperCase();
    var error = $("errorRastreo");
    if (!/^CH-\d{4,6}$/.test(numero) || !/^[A-F0-9]{6}$/.test(codigo)) {
      if (!silencioso) error.textContent = "Revisa el número (por ejemplo CH-1042) y el código de 6 caracteres.";
      return;
    }
    error.textContent = "";
    if (!hayServidor) { error.textContent = "El seguimiento necesita el servidor PHP (XAMPP)."; return; }
    fetch("../api/seguimiento.php?numero=" + encodeURIComponent(numero) + "&codigo=" + encodeURIComponent(codigo), { credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (r) {
        if (!r.ok) {
          if (!silencioso) error.textContent = r.mensaje || "No encontramos ese pedido.";
          else {
            almacen.guardar("chispa_ultimo", null);
            $("rNumero").value = "";
            $("rCodigo").value = "";
          }
          $("resultadoRastreo").hidden = true;
          return;
        }
        $("resultadoRastreo").hidden = false;
        var titulos = { recibido: "Recibimos tu pedido", preparando: "Está en la plancha", listo: r.tipo === "domicilio" ? "Va en camino" : "¡Está listo!", entregado: "Pedido entregado", cancelado: "Pedido cancelado" };
        $("rastreoTitulo").textContent = titulos[r.estado] || r.estado;
        var detalle = r.numero + " · ";
        if (r.estado === "recibido" || r.estado === "preparando") {
          detalle += (r.tipo === "domicilio" ? "llega aprox. " : "listo aprox. ") + hora(r.listo_estimado);
          if (r.delante > 0) detalle += " · " + r.delante + (r.delante === 1 ? " pedido" : " pedidos") + " antes que el tuyo";
        } else if (r.estado === "listo") {
          detalle += r.tipo === "domicilio" ? "el repartidor ya salió" : "pasa al mostrador de pedidos en línea";
        } else {
          detalle += "actualizado " + hora(r.actualizado);
        }
        $("rastreoDetalle").textContent = detalle;
        pintarLinea($("rastreoLinea"), r.estado, r.tipo);
        if ($("dlgBolsa").open && !$("pasoListo").hidden) pintarLinea($("listoLinea"), r.estado, r.tipo);
        clearTimeout(sondeo);
        if (r.estado !== "entregado" && r.estado !== "cancelado") sondeo = setTimeout(function () { seguirPedido(true); }, 15000);
      })
      .catch(function () { if (!silencioso) error.textContent = "Sin conexión con el restaurante."; });
  }

  function iniciarSeguimiento() {
    $("formRastreo").addEventListener("submit", function (e) { e.preventDefault(); seguirPedido(false); });
    ["rNumero", "rCodigo"].forEach(function (id) {
      $(id).addEventListener("input", function (e) { e.target.value = e.target.value.toUpperCase(); });
    });
    var ultimo = almacen.leer("chispa_ultimo");
    if (ultimo && typeof ultimo.numero === "string" && typeof ultimo.codigo === "string") {
      $("rNumero").value = ultimo.numero;
      $("rCodigo").value = ultimo.codigo;
      seguirPedido(true);
    }
  }

  function cargarPatrocinadores() {
    if (!hayServidor) return Promise.resolve(C.PATROCINADORES_LOCAL);
    return fetch("../api/patrocinadores.php", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("marcas"); return r.json(); })
      .then(function (d) { return Array.isArray(d.patrocinadores) ? d.patrocinadores : C.PATROCINADORES_LOCAL; })
      .catch(function () { return C.PATROCINADORES_LOCAL; });
  }

  function pintarPatrocinadores(lista) {
    lista = lista.filter(function (m) { return C.esLogo(m.simbolo); });
    var pista = $("carruselPista");
    pista.textContent = "";
    $("patrocinadores").hidden = !lista.length;
    if (!lista.length) return;
    [false, true].forEach(function (copia) {
      var g = el("div", "carrusel__grupo");
      if (copia) g.setAttribute("aria-hidden", "true");
      lista.forEach(function (m) {
        var url = /^https?:\/\/[^\s"'<>]+$/i.test(m.url || "") ? m.url : "";
        var n = el(url ? "a" : "div", "aliado");
        if (url) {
          n.href = url;
          n.target = "_blank";
          n.rel = "noopener noreferrer nofollow";
          if (copia) n.tabIndex = -1;
        }
        n.title = m.nombre;
        n.insertAdjacentHTML("beforeend", C.svgLogo(m.simbolo, 32));
        n.appendChild(el("span", "visualmente-oculto", m.nombre));
        g.appendChild(n);
      });
      pista.appendChild(g);
    });
    pista.style.setProperty("--duracion", Math.max(24, lista.length * 4) + "s");
  }

  function iniciarDialogos() {
    document.querySelectorAll("dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    });
    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cerrar]");
      if (c) c.closest("dialog").close();
      var ir = e.target.closest("[data-cerrar-ir]");
      if (ir) { ir.closest("dialog").close(); irA(ir.dataset.cerrarIr); }
    });
  }

  function pedirToken() {
    if (!hayServidor) return;
    fetch("../api/token.php", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.token) estado.token = d.token; })
      .catch(function () { return null; });
  }

  document.querySelectorAll("[data-red]").forEach(function (a) { a.insertAdjacentHTML("beforeend", C.svgRed(a.dataset.red)); });
  $("anio").textContent = new Date().getFullYear();
  iniciarLogo();
  iniciarNavegacion();
  iniciarDialogos();
  iniciarFiltros();
  iniciarFicha();
  iniciarPago();
  iniciarSeguimiento();
  pedirToken();
  pintarBolsa();
  pintarEsqueletos();
  cargarMenu().then(aplicarMenu);
  cargarPatrocinadores().then(pintarPatrocinadores);
  setInterval(function () { if (!document.hidden) refrescarCocina(); }, 60000);
})();
