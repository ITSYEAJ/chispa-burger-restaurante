(function () {
  "use strict";

  var C = window.Chispa;
  var token = "";
  var cache = { platos: [], ingredientes: [], fotos: [], pedidos: [] };
  var DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  var DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function $(id) { return document.getElementById(id); }

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  var temporizador;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("visible");
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { t.classList.remove("visible"); }, 3500);
  }

  function hora(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }

  function fecha(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function chip(texto, tipo) { return el("span", "estado estado--" + tipo, texto); }

  function filaVacia(cuerpo, columnas, texto) {
    var tr = el("tr");
    var td = el("td", null, texto);
    td.colSpan = columnas;
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }

  function miniatura(p) {
    var img = el("img", "miniatura");
    img.src = C.rutaImagen(p) || "../img/menu/la-chispa.webp";
    img.alt = "";
    img.width = 52;
    img.height = 52;
    img.loading = "lazy";
    return img;
  }

  function plural(n, uno, varios) { return n === 1 ? "1 " + uno : n + " " + varios; }

  function api(accion, datos) {
    var op = { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": token } };
    if (datos instanceof FormData) {
      datos.append("accion", accion);
      op.body = datos;
    } else {
      op.headers["Content-Type"] = "application/json";
      op.body = JSON.stringify(Object.assign({ accion: accion }, datos || {}));
    }
    return fetch("../api/admin.php", op).then(function (r) {
      return r.json().catch(function () { return { ok: false, mensaje: "Respuesta inesperada del servidor." }; })
        .then(function (d) {
          if (r.status === 401 && d.sesion === false) mostrarAcceso(true);
          return d;
        });
    }).catch(function () { return { ok: false, mensaje: "Sin conexión con el servidor." }; });
  }

  var modoSetup = false;

  function mostrarAcceso(vencida) {
    detenerCocina();
    $("panel").hidden = true;
    $("pantallaAcceso").hidden = false;
    if (vencida) $("errorAcceso").textContent = "Tu sesión terminó. Vuelve a entrar.";
    $("usuario").focus();
  }

  function mostrarPanel() {
    $("pantallaAcceso").hidden = true;
    $("panel").hidden = false;
    $("fechaHoy").textContent = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
    cambiarVista("resumen");
  }

  function iniciarAcceso() {
    $("formAcceso").addEventListener("submit", function (e) {
      e.preventDefault();
      var error = $("errorAcceso");
      var usuario = $("usuario").value.trim();
      var clave = $("clave").value;
      error.textContent = "";
      if (modoSetup) {
        if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(usuario)) { error.textContent = "El usuario debe tener de 3 a 30 letras o números."; return; }
        if (clave.length < 10) { error.textContent = "La contraseña debe tener al menos 10 caracteres."; return; }
        if (clave !== $("clave2").value) { error.textContent = "Las contraseñas no coinciden."; return; }
      } else if (!usuario || !clave) {
        error.textContent = "Escribe tu usuario y contraseña.";
        return;
      }
      var b = $("botonAcceso");
      b.disabled = true;
      api(modoSetup ? "setup" : "login", { usuario: usuario, clave: clave }).then(function (r) {
        b.disabled = false;
        $("clave").value = "";
        $("clave2").value = "";
        if (r.ok) { modoSetup = false; mostrarPanel(); } else error.textContent = r.mensaje || "No se pudo entrar.";
      });
    });
    $("salir").addEventListener("click", function () {
      api("logout").then(function () { $("errorAcceso").textContent = ""; mostrarAcceso(false); });
    });
  }

  var cargadores = {};
  var vistaActual = "";

  function cambiarVista(nombre) {
    vistaActual = nombre;
    document.querySelectorAll(".lateral__nav button").forEach(function (b) {
      var activo = b.dataset.vista === nombre;
      b.classList.toggle("activo", activo);
      if (activo) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.querySelectorAll(".vista").forEach(function (v) { v.hidden = v.id !== "vista-" + nombre; });
    if (nombre !== "cocina") detenerCocina();
    if (cargadores[nombre]) cargadores[nombre]();
    window.scrollTo(0, 0);
  }

  function contadores(c) {
    $("cCocina").hidden = !c.cocina;
    $("cCocina").textContent = c.cocina || "";
    if (c.inventario !== undefined) {
      $("cInventario").hidden = !c.inventario;
      $("cInventario").textContent = c.inventario || "";
    }
  }

  cargadores.resumen = function () {
    api("resumen").then(function (r) {
      if (!r.ok) return;
      var k = r.kpis;
      var kpis = $("kpis");
      kpis.textContent = "";
      [
        ["Ventas de hoy", C.dinero(k.ventas_hoy), plural(k.pedidos_hoy, "pedido", "pedidos") + " · ticket " + C.dinero(k.ticket)],
        ["En cocina ahora", String(k.activos), "espera que ve el cliente: " + k.espera + " min"],
        ["Preparación promedio", k.prep_prom + " min", "de recibido a listo, hoy"],
        ["Alertas", String(r.alertas.filter(function (a) { return a.nivel !== "ok"; }).length), "revisa la lista de abajo"]
      ].forEach(function (d) {
        var c = el("div", "kpi");
        c.appendChild(el("p", "kpi__etiqueta", d[0]));
        c.appendChild(el("p", "kpi__valor", d[1]));
        c.appendChild(el("p", "kpi__nota", d[2]));
        kpis.appendChild(c);
      });
      dibujarGrafico(r.serie);
      var top = $("top");
      top.textContent = "";
      if (!r.top.length) top.appendChild(el("li", null, "Sin pedidos todavía."));
      r.top.forEach(function (t) {
        var li = el("li");
        li.appendChild(el("span", null, t.nombre));
        li.appendChild(el("strong", null, String(t.unidades)));
        top.appendChild(li);
      });
      var lista = $("alertas");
      lista.textContent = "";
      $("nAlertas").textContent = r.alertas.length ? plural(r.alertas.length, "activa", "activas") : "";
      if (!r.alertas.length) {
        var ok = el("li", "alerta alerta--ok");
        ok.appendChild(el("span", null, "Todo en orden."));
        lista.appendChild(ok);
      }
      r.alertas.forEach(function (a) {
        var li = el("li", "alerta alerta--" + a.nivel);
        var t = el("span", null, a.texto);
        t.appendChild(el("small", null, a.detalle));
        li.appendChild(t);
        var b = el("button", "btn-mini", "Ver");
        b.type = "button";
        b.setAttribute("aria-label", "Ver " + a.texto);
        b.addEventListener("click", function () { cambiarVista(a.vista); });
        li.appendChild(b);
        lista.appendChild(li);
      });
      $("notaDemo").hidden = !r.demo;
      $("panelDemo").hidden = !r.demo;
      contadores(r.contadores);
    });
  };

  var ultimaSerie = null;

  function dibujarGrafico(serie) {
    ultimaSerie = serie;
    var estilos = getComputedStyle(document.body);
    var tinta = estilos.getPropertyValue("--tinta").trim() || "#191919";
    var oscuro = document.documentElement.classList.contains("tema-oscuro");
    var reja = oscuro ? "rgba(232,230,225,0.1)" : "rgba(25,25,25,0.08)";
    var textoEje = oscuro ? "rgba(232,230,225,0.65)" : "rgba(25,25,25,0.6)";
    var canvas = $("grafico");
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ancho = canvas.parentElement.clientWidth - 40;
    var alto = 220;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var max = Math.max.apply(null, serie.map(function (s) { return s.pedidos; }).concat([1]));
    $("totalSerie").textContent = plural(serie.reduce(function (s, d) { return s + d.pedidos; }, 0), "pedido", "pedidos");
    var abajo = 24, arriba = 16;
    var paso = ancho / Math.max(1, serie.length);
    var barra = Math.max(6, paso * 0.6);
    var horaActual = new Date().getHours();
    var reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var inicio = null;
    function cuadro(t) {
      if (inicio === null) inicio = t;
      var p = reducir ? 1 : Math.min(1, (t - inicio) / 600);
      p = 1 - Math.pow(1 - p, 3);
      ctx.clearRect(0, 0, ancho, alto);
      ctx.strokeStyle = reja;
      [0.25, 0.5, 0.75, 1].forEach(function (f) {
        var y = Math.round(alto - abajo - (alto - abajo - arriba) * f) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke();
      });
      ctx.font = "11px 'Cascadia Code', monospace";
      ctx.textAlign = "center";
      serie.forEach(function (d, i) {
        var h = (alto - abajo - arriba) * (d.pedidos / max) * p;
        var x = paso * i + (paso - barra) / 2;
        ctx.fillStyle = Number(d.hora) === horaActual ? tinta : "#E8572A";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, alto - abajo - h, barra, h, [4, 4, 0, 0]); else ctx.rect(x, alto - abajo - h, barra, h);
        ctx.fill();
        ctx.fillStyle = textoEje;
        ctx.fillText(d.hora + "h", x + barra / 2, alto - 6);
      });
      if (p < 1) requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);
  }

  var relojCocina = null;
  var sondeoCocina = null;

  function detenerCocina() {
    clearInterval(relojCocina);
    clearInterval(sondeoCocina);
    relojCocina = sondeoCocina = null;
  }

  function pintarRelojes() {
    document.querySelectorAll(".comanda").forEach(function (c) {
      var r = c.querySelector(".comanda__reloj");
      if (c.dataset.estado === "listo") {
        r.textContent = "listo hace " + Math.max(0, Math.round((Date.now() - new Date(c.dataset.cambio)) / 60000)) + " min";
        return;
      }
      var restante = Math.round((new Date(c.dataset.listo) - Date.now()) / 1000);
      var abs = Math.abs(restante);
      var txt = Math.floor(abs / 60) + ":" + String(abs % 60).padStart(2, "0");
      r.textContent = restante >= 0 ? "sale en " + txt : "tarde " + txt;
      c.classList.toggle("comanda--tarde", restante < 0);
      c.classList.toggle("comanda--cerca", restante >= 0 && restante < 180);
    });
  }

  var SIGUIENTE = { recibido: ["preparando", "Empezar"], preparando: ["listo", "Marcar listo"], listo: ["entregado", "Entregado"] };

  function crearComanda(p) {
    var c = el("article", "comanda");
    c.dataset.listo = p.listo_estimado;
    c.dataset.estado = p.estado;
    var ultimo = p.historial[p.historial.length - 1];
    c.dataset.cambio = ultimo ? ultimo.fecha : p.fecha;
    var cab = el("div", "comanda__cab");
    cab.appendChild(el("strong", null, p.numero));
    cab.appendChild(el("span", "comanda__reloj"));
    c.appendChild(cab);
    var meta = el("div", "comanda__meta");
    meta.appendChild(chip(p.tipo === "domicilio" ? "Domicilio" : "Recoger", p.tipo === "domicilio" ? "listo" : "ok"));
    meta.appendChild(el("span", null, p.cliente.nombre + " · " + hora(p.listo_estimado) + (p.programado ? " · programado" : "")));
    c.appendChild(meta);
    var items = el("ul", "comanda__items");
    p.items.forEach(function (it) {
      var li = el("li", null, it.cantidad + " × " + it.nombre);
      var extra = [];
      it.extras.forEach(function (x) { extra.push("+ " + x); });
      it.quitar.forEach(function (q) { extra.push("sin " + q.toLowerCase()); });
      if (it.nota) extra.push("“" + it.nota + "”");
      if (extra.length) li.appendChild(el("small", null, extra.join(" · ")));
      items.appendChild(li);
    });
    c.appendChild(items);
    if (p.notas) c.appendChild(el("small", null, "Nota: " + p.notas));
    var acciones = el("div", "comanda__acciones");
    var sig = SIGUIENTE[p.estado];
    var avanzar = el("button", "btn-mini btn-mini--principal", sig[1]);
    avanzar.type = "button";
    avanzar.addEventListener("click", function () { cambiarEstado(p, sig[0], avanzar); });
    acciones.appendChild(avanzar);
    if (p.estado !== "listo") {
      var cancelar = el("button", "btn-mini btn-mini--peligro", "Cancelar");
      cancelar.type = "button";
      cancelar.addEventListener("click", function () {
        if (window.confirm("¿Cancelar " + p.numero + "? Sus ingredientes vuelven al inventario.")) cambiarEstado(p, "cancelado", cancelar);
      });
      acciones.appendChild(cancelar);
    }
    c.appendChild(acciones);
    return c;
  }

  function cambiarEstado(p, nuevo, boton) {
    if (boton) boton.disabled = true;
    api("avanzar", { numero: p.numero, estado: nuevo }).then(function (r) {
      if (!r.ok) { toast(r.mensaje || "No se pudo actualizar."); if (boton) boton.disabled = false; return; }
      toast(p.numero + ": " + { preparando: "en la plancha", listo: "listo para entregar", entregado: "entregado", cancelado: "cancelado, ingredientes devueltos" }[nuevo]);
      if (vistaActual === "cocina") cargadores.cocina();
    });
  }

  cargadores.cocina = function () {
    api("cocina").then(function (r) {
      if (!r.ok) return;
      var cols = { recibido: $("colRecibido"), preparando: $("colPreparando"), listo: $("colListo") };
      var n = { recibido: 0, preparando: 0, listo: 0 };
      Object.keys(cols).forEach(function (k) { cols[k].textContent = ""; });
      r.pedidos.forEach(function (p) { n[p.estado]++; cols[p.estado].appendChild(crearComanda(p)); });
      $("nRecibido").textContent = n.recibido;
      $("nPreparando").textContent = n.preparando;
      $("nListo").textContent = n.listo;
      Object.keys(cols).forEach(function (k) { if (!cols[k].children.length) cols[k].appendChild(el("p", "texto-suave", "Sin pedidos")); });
      $("cocinaActualizado").textContent = "Actualizado " + hora(r.ahora) + " · se refresca solo";
      contadores({ cocina: n.recibido + n.preparando });
      pintarRelojes();
      if (!relojCocina) relojCocina = setInterval(pintarRelojes, 1000);
      if (!sondeoCocina) sondeoCocina = setInterval(function () { if (!document.hidden) cargadores.cocina(); }, 10000);
    });
  };

  var ESTADOS = { recibido: "Recibido", preparando: "Preparando", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
  var filtroPedido = "todos";

  cargadores.pedidos = function () {
    api("pedidos").then(function (r) {
      if (!r.ok) return;
      cache.pedidos = r.pedidos;
      pintarFiltroPedidos();
      pintarPedidos();
    });
  };

  function pintarFiltroPedidos() {
    var cont = $("filtroPedidos");
    cont.textContent = "";
    [["todos", "Todos"]].concat(Object.keys(ESTADOS).map(function (k) { return [k, ESTADOS[k]]; })).forEach(function (o) {
      var n = o[0] === "todos" ? cache.pedidos.length : cache.pedidos.filter(function (p) { return p.estado === o[0]; }).length;
      var b = el("button", "pestana", o[1] + " · " + n);
      b.type = "button";
      b.setAttribute("aria-pressed", String(filtroPedido === o[0]));
      b.addEventListener("click", function () { filtroPedido = o[0]; pintarFiltroPedidos(); pintarPedidos(); });
      cont.appendChild(b);
    });
  }

  function pintarPedidos() {
    var cuerpo = $("tablaPedidos");
    cuerpo.textContent = "";
    var lista = cache.pedidos.filter(function (p) { return filtroPedido === "todos" || p.estado === filtroPedido; });
    if (!lista.length) filaVacia(cuerpo, 6, "No hay pedidos en este estado.");
    lista.forEach(function (p) {
      var tr = el("tr");
      var tdN = el("td");
      tdN.appendChild(el("strong", null, p.numero));
      tdN.appendChild(el("small", null, fecha(p.fecha)));
      tr.appendChild(tdN);
      var tdC = el("td", null, p.cliente.nombre);
      tdC.appendChild(el("small", null, p.cliente.telefono));
      if (p.cliente.direccion) tdC.appendChild(el("small", null, p.cliente.direccion));
      tr.appendChild(tdC);
      var tdI = el("td");
      p.items.forEach(function (it) { tdI.appendChild(el("small", null, it.cantidad + " × " + it.nombre)); });
      tr.appendChild(tdI);
      var tdT = el("td", "num", C.dinero(p.total));
      tdT.appendChild(el("small", null, p.pago === "tarjeta" ? "tarjeta" : "efectivo"));
      tr.appendChild(tdT);
      var tdE = el("td", null, p.tipo === "domicilio" ? "Domicilio" : "Recoger");
      tdE.appendChild(el("small", null, (p.programado ? "programado " : "aprox. ") + hora(p.listo_estimado)));
      tr.appendChild(tdE);
      var tdS = el("td");
      tdS.appendChild(chip(ESTADOS[p.estado], p.estado));
      tr.appendChild(tdS);
      cuerpo.appendChild(tr);
    });
  }

  function celdaCsv(v) {
    var s = String(v === undefined || v === null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportarPedidos() {
    var filas = [["Pedido", "Fecha", "Estado", "Tipo", "Cliente", "Teléfono", "Dirección", "Platillos", "Subtotal", "Envío", "Total", "Pago"]];
    cache.pedidos.forEach(function (p) {
      filas.push([p.numero, p.fecha, p.estado, p.tipo, p.cliente.nombre, p.cliente.telefono, p.cliente.direccion,
        p.items.map(function (i) { return i.cantidad + "x " + i.nombre; }).join(" | "), p.subtotal, p.envio, p.total, p.pago]);
    });
    var csv = "﻿" + filas.map(function (f) { return f.map(celdaCsv).join(","); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var a = el("a");
    a.href = url;
    a.download = "pedidos-chispa-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  cargadores.menu = function () {
    return api("platos").then(function (r) {
      if (!r.ok) return;
      cache.platos = r.platos;
      cache.ingredientes = r.ingredientes;
      cache.fotos = r.fotos;
      pintarPlatos();
    });
  };

  function pintarPlatos() {
    var texto = $("buscarPlato").value.trim().toLowerCase();
    var nombres = {};
    cache.ingredientes.forEach(function (i) { nombres[i.id] = i.nombre; });
    var cuerpo = $("tablaPlatos");
    cuerpo.textContent = "";
    var lista = cache.platos.filter(function (p) { return !texto || p.nombre.toLowerCase().indexOf(texto) !== -1; });
    if (!lista.length) filaVacia(cuerpo, 5, "No hay platillos con esa búsqueda.");
    lista.forEach(function (p) {
      var tr = el("tr");
      var tdP = el("td");
      var celda = el("div", "celda-producto");
      celda.appendChild(miniatura(p));
      var n = el("div");
      n.appendChild(el("strong", null, p.nombre));
      n.appendChild(el("small", null, C.CATEGORIAS[p.categoria] + (p.kcal ? " · " + p.kcal + " kcal" : "")));
      celda.appendChild(n);
      tdP.appendChild(celda);
      tr.appendChild(tdP);
      var tdPr = el("td", null, C.dinero(p.precio_actual));
      if (p.promo) tdPr.appendChild(el("small", null, p.promo.nombre + ": " + C.dinero(p.promo.precio) + " · " + p.promo.desde + "–" + p.promo.hasta));
      tr.appendChild(tdPr);
      var tdR = el("td");
      tdR.appendChild(el("small", null, Object.keys(p.receta || {}).map(function (k) { return p.receta[k] + " " + (nombres[k] || k); }).join(", ") || "Sin receta"));
      tr.appendChild(tdR);
      var tdE = el("td");
      var chips = el("div", "acciones-fila");
      if (!p.activo) chips.appendChild(chip("Oculto", "inactivo"));
      else if (p.agotado_por) chips.appendChild(chip("Agotado: falta " + p.agotado_por.toLowerCase(), "agotado"));
      else if (!p.disponible) chips.appendChild(chip("Pausado", "inactivo"));
      else chips.appendChild(chip("A la venta", "ok"));
      if (p.favorito) chips.appendChild(chip("Favorito", "listo"));
      if (p.promo_activa) chips.appendChild(chip("Promo activa", "preparando"));
      tdE.appendChild(chips);
      tr.appendChild(tdE);
      var tdA = el("td");
      var acc = el("div", "acciones-fila");
      var pausa = el("button", "btn-mini", p.disponible ? "Pausar" : "Reanudar");
      pausa.type = "button";
      pausa.setAttribute("aria-label", (p.disponible ? "Pausar la venta de " : "Reanudar la venta de ") + p.nombre);
      pausa.addEventListener("click", function () {
        api("disponible", { id: p.id }).then(function (r) {
          if (r.ok) { toast(p.nombre + (r.disponible ? " vuelve a la venta." : " pausado.")); cargadores.menu(); }
        });
      });
      var editar = el("button", "btn-mini", "Editar");
      editar.type = "button";
      editar.setAttribute("aria-label", "Editar " + p.nombre);
      editar.addEventListener("click", function () { abrirEditor(p); });
      acc.appendChild(pausa);
      acc.appendChild(editar);
      tdA.appendChild(acc);
      tr.appendChild(tdA);
      cuerpo.appendChild(tr);
    });
  }

  var editando = null;
  var urlVista = null;

  function vistaPrevia() {
    var f = $("formPlato");
    var img = $("editorMiniatura");
    if (urlVista) { URL.revokeObjectURL(urlVista); urlVista = null; }
    var archivo = f.elements.imagen.files[0];
    if (archivo) {
      urlVista = URL.createObjectURL(archivo);
      img.src = urlVista;
    } else if (f.elements.foto.value) {
      img.src = "../" + f.elements.foto.value;
    } else if (editando && C.rutaImagen(editando)) {
      img.src = C.rutaImagen(editando);
    }
  }

  function abrirEditor(p) {
    var f = $("formPlato");
    f.reset();
    editando = p || null;
    $("editorTitulo").textContent = p ? "Editar platillo" : "Nuevo platillo";
    $("eliminarPlato").hidden = !p;
    $("errorPlato").textContent = "";

    var sel = f.elements.foto;
    sel.textContent = "";
    if (p && /^uploads\//.test(p.imagen || "")) sel.appendChild(new Option("Foto subida actual", ""));
    cache.fotos.forEach(function (ruta) {
      var nombre = ruta.replace("img/menu/", "").replace(/\.(webp|jpg|png)$/, "").replace(/-/g, " ");
      sel.appendChild(new Option(nombre.charAt(0).toUpperCase() + nombre.slice(1), ruta));
    });
    sel.value = p ? (/^img\//.test(p.imagen || "") ? p.imagen : "") : (cache.fotos[0] || "");

    var receta = $("editorReceta");
    receta.textContent = "";
    cache.ingredientes.forEach(function (i) {
      var lab = el("label", null, i.nombre);
      var inp = el("input");
      inp.type = "number";
      inp.name = "receta_" + i.id;
      inp.min = 0;
      inp.max = 20;
      inp.value = p && p.receta && p.receta[i.id] ? p.receta[i.id] : 0;
      inp.setAttribute("aria-label", "Cantidad de " + i.nombre);
      lab.appendChild(inp);
      receta.appendChild(lab);
    });

    f.elements.id.value = p ? p.id : "";
    f.elements.nombre.value = p ? p.nombre : "";
    f.elements.categoria.value = p ? p.categoria : "hamburguesas";
    f.elements.precio.value = p ? p.precio : "";
    f.elements.kcal.value = p ? p.kcal || "" : "";
    f.elements.descripcion.value = p ? p.descripcion || "" : "";
    var pr = p && p.promo;
    f.elements.promo_nombre.value = pr ? pr.nombre : "";
    f.elements.promo_precio.value = pr ? pr.precio : "";
    f.elements.promo_desde.value = pr ? pr.desde : "15:00";
    f.elements.promo_hasta.value = pr ? pr.hasta : "18:00";
    f.querySelectorAll("input[name='promo_dias[]']").forEach(function (c) {
      c.checked = pr ? pr.dias.indexOf(Number(c.value)) !== -1 : Number(c.value) >= 1 && Number(c.value) <= 5;
    });
    f.elements.favorito.checked = !!(p && p.favorito);
    f.elements.picante.checked = !!(p && p.picante);
    f.elements.activo.checked = p ? !!p.activo : true;
    vistaPrevia();
    $("dlgEditor").showModal();
    f.elements.nombre.focus();
  }

  function iniciarMenu() {
    var cat = $("eCategoria");
    Object.keys(C.CATEGORIAS).forEach(function (k) { cat.appendChild(new Option(C.CATEGORIAS[k], k)); });
    var dias = $("editorDias");
    DIAS.forEach(function (d, i) {
      var lab = el("label");
      var inp = el("input");
      inp.type = "checkbox";
      inp.name = "promo_dias[]";
      inp.value = i;
      lab.appendChild(inp);
      lab.appendChild(el("span", null, d));
      dias.appendChild(lab);
    });
    $("buscarPlato").addEventListener("input", pintarPlatos);
    $("nuevoPlato").addEventListener("click", function () {
      if (cache.fotos.length) abrirEditor(null);
      else cargadores.menu().then(function () { abrirEditor(null); });
    });
    var f = $("formPlato");
    ["foto", "imagen"].forEach(function (n) { f.elements[n].addEventListener("change", vistaPrevia); });
    $("eliminarPlato").addEventListener("click", function () {
      if (!editando || !window.confirm("¿Eliminar «" + editando.nombre + "» del menú? No se puede deshacer.")) return;
      api("eliminar_plato", { id: editando.id }).then(function (r) {
        if (!r.ok) { toast(r.mensaje || "No se pudo eliminar."); return; }
        $("dlgEditor").close();
        toast("Platillo eliminado.");
        cargadores.menu();
      });
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var error = $("errorPlato");
      error.textContent = "";
      var precio = Number(f.elements.precio.value);
      var promo = Number(f.elements.promo_precio.value || 0);
      if (f.elements.nombre.value.trim().length < 3) { error.textContent = "El nombre debe tener al menos 3 caracteres."; f.elements.nombre.focus(); return; }
      if (!(precio > 0)) { error.textContent = "Escribe un precio mayor que cero."; f.elements.precio.focus(); return; }
      if (promo && promo >= precio) { error.textContent = "El precio de promoción debe ser menor que el precio normal."; f.elements.promo_precio.focus(); return; }
      var archivo = f.elements.imagen.files[0];
      if (archivo && archivo.size > 3 * 1024 * 1024) { error.textContent = "La foto pesa más de 3 MB. Elige una más ligera."; return; }
      var datos = new FormData(f);
      ["activo", "picante", "favorito"].forEach(function (k) { datos.set(k, f.elements[k].checked ? "1" : "0"); });
      if (!archivo) datos.delete("imagen");
      var b = $("guardarPlato");
      b.disabled = true;
      b.textContent = "Guardando…";
      api("guardar_plato", datos).then(function (r) {
        b.disabled = false;
        b.textContent = "Guardar platillo";
        if (!r.ok) { error.textContent = r.mensaje || "No se pudo guardar."; return; }
        $("dlgEditor").close();
        toast("Platillo guardado. Ya aparece en la página.");
        cargadores.menu();
      });
    });
  }

  cargadores.inventario = function () {
    api("inventario").then(function (r) {
      if (!r.ok) return;
      var cuerpo = $("tablaInventario");
      cuerpo.textContent = "";
      if (!r.ingredientes.length) filaVacia(cuerpo, 7, "Aún no hay ingredientes.");
      r.ingredientes.forEach(function (i) {
        var tr = el("tr");
        var tdN = el("td");
        tdN.appendChild(el("strong", null, i.nombre));
        tdN.appendChild(el("small", null, i.unidad));
        tr.appendChild(tdN);
        [["stock", i.stock], ["umbral", i.umbral]].forEach(function (par) {
          var td = el("td");
          var inp = el("input", "stock-input");
          inp.type = "number";
          inp.min = 0;
          inp.max = 99999;
          inp.value = par[1];
          inp.dataset.previo = par[1];
          inp.setAttribute("aria-label", (par[0] === "stock" ? "Existencia de " : "Aviso de ") + i.nombre);
          if (par[0] === "stock") marcarStock(inp, i.stock, i.umbral);
          inp.addEventListener("change", function () { guardarStock(i, par[0], inp); });
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") inp.blur(); });
          td.appendChild(inp);
          tr.appendChild(td);
        });
        var tdC = el("td", null, i.diario ? i.diario + " al día" : "—");
        if (i.dias !== null) tdC.appendChild(el("small", null, "alcanza ~" + i.dias + " días"));
        tr.appendChild(tdC);
        tr.appendChild(el("td", null, i.sugerido ? "+" + i.sugerido + " " + i.unidad : "—"));
        var tdU = el("td");
        tdU.appendChild(el("small", null, i.usan.length ? i.usan.slice(0, 3).join(", ") + (i.usan.length > 3 ? " y " + (i.usan.length - 3) + " más" : "") : "Ningún platillo"));
        tr.appendChild(tdU);
        var tdA = el("td");
        var borrar = el("button", "btn-mini btn-mini--peligro", "Eliminar");
        borrar.type = "button";
        borrar.setAttribute("aria-label", "Eliminar " + i.nombre);
        borrar.addEventListener("click", function () {
          if (!window.confirm("¿Eliminar «" + i.nombre + "» del inventario?")) return;
          api("eliminar_ingrediente", { id: i.id }).then(function (res) {
            if (!res.ok) { toast(res.mensaje || "No se pudo eliminar."); return; }
            cargadores.inventario();
          });
        });
        tdA.appendChild(borrar);
        tr.appendChild(tdA);
        cuerpo.appendChild(tr);
      });
    });
  };

  function marcarStock(inp, valor, umbral) {
    inp.classList.toggle("cero", valor <= 0);
    inp.classList.toggle("bajo", valor > 0 && valor <= umbral);
  }

  function guardarStock(i, campo, inp) {
    var v = parseInt(inp.value, 10);
    if (isNaN(v) || v < 0 || v > 99999) { inp.value = inp.dataset.previo; toast("Escribe un número entre 0 y 99999."); return; }
    api("stock", { id: i.id, campo: campo, valor: v }).then(function (r) {
      if (!r.ok) { inp.value = inp.dataset.previo; toast(r.mensaje || "No se guardó."); return; }
      var antes = Number(inp.dataset.previo);
      inp.dataset.previo = v;
      i[campo] = v;
      if (campo === "stock") marcarStock(inp, v, i.umbral);
      inp.classList.remove("guardado");
      void inp.offsetWidth;
      inp.classList.add("guardado");
      var n = i.usan.length;
      if (campo === "stock" && antes === 0 && v > 0 && n) toast(i.nombre + " repuesto: " + plural(n, "platillo vuelve", "platillos vuelven") + " a la venta.");
      else if (campo === "stock" && v === 0 && n) toast("Sin " + i.nombre.toLowerCase() + ": " + plural(n, "platillo quedó agotado", "platillos quedaron agotados") + ".");
      else toast(i.nombre + ": " + v);
    });
  }

  function iniciarInventario() {
    $("formIngrediente").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var error = $("errorIngrediente");
      error.textContent = "";
      if (f.elements.nombre.value.trim().length < 2) { error.textContent = "Escribe el nombre del ingrediente."; f.elements.nombre.focus(); return; }
      api("nuevo_ingrediente", { nombre: f.elements.nombre.value.trim(), unidad: f.elements.unidad.value.trim(), stock: Number(f.elements.stock.value) || 0 })
        .then(function (r) {
          if (!r.ok) { error.textContent = r.mensaje || "No se pudo agregar."; return; }
          f.reset();
          toast("Ingrediente agregado. Ya puedes usarlo en las recetas.");
          cargadores.inventario();
        });
    });
  }

  cargadores.patrocinadores = function () {
    api("patrocinadores").then(function (r) {
      if (!r.ok) return;
      var lista = r.patrocinadores;
      $("nPatrocinadores").textContent = lista.filter(function (m) { return m.activo; }).length + " visibles de " + lista.length;
      var cuerpo = $("tablaPatrocinadores");
      cuerpo.textContent = "";
      if (!lista.length) filaVacia(cuerpo, 3, "Aún no hay marcas.");
      lista.forEach(function (m, i) {
        var tr = el("tr");
        var tdM = el("td");
        var celda = el("span", "celda-producto");
        var logo = el("span", "logo-tabla");
        if (C.esLogo(m.simbolo)) logo.insertAdjacentHTML("beforeend", C.svgLogo(m.simbolo, 22));
        celda.appendChild(logo);
        var t = el("span");
        t.appendChild(el("strong", null, m.nombre));
        if (m.url) t.appendChild(el("small", null, m.url));
        celda.appendChild(t);
        tdM.appendChild(celda);
        tr.appendChild(tdM);
        var tdE = el("td");
        tdE.appendChild(m.activo ? chip("Visible", "ok") : chip("Oculta", "inactivo"));
        tr.appendChild(tdE);
        var tdA = el("td");
        var acc = el("div", "acciones-fila");
        [
          ["↑", "Subir " + m.nombre, function () { return api("mover_patrocinador", { id: m.id, paso: -1 }); }, i === 0],
          ["↓", "Bajar " + m.nombre, function () { return api("mover_patrocinador", { id: m.id, paso: 1 }); }, i === lista.length - 1],
          [m.activo ? "Ocultar" : "Mostrar", null, function () { return api("alternar_patrocinador", { id: m.id }); }, false],
          ["Eliminar", "Eliminar " + m.nombre, function () {
            if (!window.confirm("¿Eliminar «" + m.nombre + "» del carrusel?")) return Promise.resolve({ ok: false, cancelado: true });
            return api("eliminar_patrocinador", { id: m.id });
          }, false]
        ].forEach(function (a) {
          var b = el("button", "btn-mini" + (a[0] === "Eliminar" ? " btn-mini--peligro" : ""), a[0]);
          b.type = "button";
          b.disabled = a[3];
          if (a[1]) b.setAttribute("aria-label", a[1]);
          b.addEventListener("click", function () {
            a[2]().then(function (res) {
              if (res.ok) cargadores.patrocinadores();
              else if (!res.cancelado) toast(res.mensaje || "No se pudo actualizar.");
            });
          });
          acc.appendChild(b);
        });
        tdA.appendChild(acc);
        tr.appendChild(tdA);
        cuerpo.appendChild(tr);
      });
    });
  };

  function iniciarPatrocinadores() {
    var f = $("formPatrocinador");
    var sel = $("mSimbolo");
    Object.keys(C.LOGOS).forEach(function (k) { sel.appendChild(new Option(C.LOGOS[k].nombre, k)); });
    function vista() {
      var caja = $("mVista");
      caja.textContent = "";
      caja.insertAdjacentHTML("beforeend", C.svgLogo(sel.value, 28));
    }
    sel.addEventListener("change", vista);
    vista();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var error = $("errorPatrocinador");
      var url = f.elements.url.value.trim();
      error.textContent = "";
      if (url && !/^https?:\/\/[^\s"'<>]+$/i.test(url)) { error.textContent = "El enlace debe empezar con https://"; return; }
      var nombre = C.LOGOS[sel.value].nombre;
      api("guardar_patrocinador", { nombre: nombre, simbolo: sel.value, url: url }).then(function (r) {
        if (!r.ok) { error.textContent = r.mensaje || "No se pudo agregar."; return; }
        toast(nombre + " ya aparece en el carrusel.");
        f.elements.url.value = "";
        cargadores.patrocinadores();
      });
    });
  }

  cargadores.automatizaciones = function () {
    api("config").then(function (r) {
      if (!r.ok) return;
      var f = $("formConfig");
      Object.keys(r.config).forEach(function (k) {
        if (f.elements[k] && f.elements[k].type === "number") f.elements[k].value = r.config[k];
      });
      r.config.horario.forEach(function (h, i) {
        f.elements["abre_" + i].value = h[0];
        f.elements["cierra_" + i].value = h[1];
      });
    });
    api("resumen").then(function (r) { if (r.ok) $("panelDemo").hidden = !r.demo; });
  };

  function iniciarAutomatizaciones() {
    var cont = $("horario");
    [1, 2, 3, 4, 5, 6, 0].forEach(function (i) {
      var lab = el("label");
      lab.appendChild(el("span", null, DIAS_LARGOS[i]));
      ["abre_", "cierra_"].forEach(function (pref) {
        var inp = el("input");
        inp.type = "time";
        inp.name = pref + i;
        inp.setAttribute("aria-label", (pref === "abre_" ? "Abre el " : "Cierra el ") + DIAS_LARGOS[i].toLowerCase());
        lab.appendChild(inp);
      });
      cont.appendChild(lab);
    });
    $("formConfig").addEventListener("submit", function (e) {
      e.preventDefault();
      var datos = {};
      Array.prototype.forEach.call(e.target.elements, function (c) {
        if (c.name) datos[c.name] = c.type === "number" ? Number(c.value) : c.value;
      });
      api("guardar_config", datos).then(function (r) {
        $("errorConfig").textContent = r.ok ? "" : (r.mensaje || "No se pudo guardar.");
        if (r.ok) toast("Automatizaciones guardadas.");
      });
    });
    $("borrarDemo").addEventListener("click", function () {
      if (!window.confirm("¿Borrar los pedidos de ejemplo?")) return;
      api("borrar_demo").then(function (r) {
        if (!r.ok) { toast(r.mensaje || "No se pudo borrar."); return; }
        toast("Pedidos de ejemplo borrados.");
        $("panelDemo").hidden = true;
      });
    });
  }

  function iniciarTema() {
    var raiz = document.documentElement;
    var boton = $("cambiarTema");
    function pintar() {
      var oscuro = raiz.classList.contains("tema-oscuro");
      boton.setAttribute("aria-pressed", String(oscuro));
      $("cambiarTemaTexto").textContent = oscuro ? "Modo claro" : "Modo oscuro";
      boton.setAttribute("aria-label", oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    }
    boton.addEventListener("click", function () {
      var oscuro = raiz.classList.toggle("tema-oscuro");
      try { localStorage.setItem("chispa_tema_admin", oscuro ? "oscuro" : "claro"); } catch (e) { oscuro = !!oscuro; }
      pintar();
      if (vistaActual === "resumen" && ultimaSerie) dibujarGrafico(ultimaSerie);
    });
    pintar();
  }

  function iniciarDialogos() {
    document.querySelectorAll("dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    });
    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cerrar]");
      if (c) c.closest("dialog").close();
    });
  }

  document.querySelectorAll(".lateral__nav button").forEach(function (b) {
    b.addEventListener("click", function () { cambiarVista(b.dataset.vista); });
  });
  $("exportarPedidos").addEventListener("click", exportarPedidos);

  iniciarDialogos();
  iniciarTema();
  iniciarAcceso();
  iniciarMenu();
  iniciarInventario();
  iniciarPatrocinadores();
  iniciarAutomatizaciones();

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    $("pantallaAcceso").hidden = false;
    $("accesoTexto").textContent = "El panel necesita PHP. Abre el sitio desde XAMPP (http://localhost/…).";
    $("formAcceso").hidden = true;
    return;
  }

  fetch("../api/token.php", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (d) { token = d.token || ""; return api("estado"); })
    .then(function (r) {
      if (!r.ok) throw new Error("estado");
      if (!r.configurado) {
        modoSetup = true;
        $("accesoTexto").textContent = r.local ? "Primer uso: crea la cuenta de administrador." : "La cuenta se crea desde el mismo equipo del servidor (localhost).";
        $("campoClave2").hidden = false;
        $("clave").autocomplete = "new-password";
        $("botonAcceso").textContent = "Crear cuenta";
        $("botonAcceso").disabled = !r.local;
        mostrarAcceso(false);
      } else if (r.sesion) {
        mostrarPanel();
      } else {
        mostrarAcceso(false);
      }
    })
    .catch(function () {
      $("pantallaAcceso").hidden = false;
      $("accesoTexto").textContent = "No hay conexión con el servidor PHP.";
      $("formAcceso").hidden = true;
    });
})();
