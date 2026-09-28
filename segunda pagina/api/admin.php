<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

header('X-Robots-Tag: noindex, nofollow');
solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

$d = entrada();
$accion = (string) ($d['accion'] ?? '');
$credenciales = leer_json('admin', []);

$publicas = [
    'estado' => function () use ($credenciales) {
        responder(200, [
            'ok'          => true,
            'configurado' => !empty($credenciales['hash']),
            'sesion'      => !empty($credenciales['hash']) && !empty($_SESSION['admin']) && time() - (int) ($_SESSION['admin_actividad'] ?? 0) <= 7200,
            'local'       => es_local(),
        ]);
    },
    'setup' => function () use ($d, $credenciales) {
        if (!empty($credenciales['hash'])) {
            error_json(409, 'La cuenta de administrador ya existe.');
        }
        if (!es_local()) {
            error_json(403, 'La cuenta solo se puede crear desde el mismo equipo del servidor.');
        }
        $usuario = (string) ($d['usuario'] ?? '');
        $clave = (string) ($d['clave'] ?? '');
        if (!preg_match('/^[a-zA-Z0-9_.-]{3,30}$/', $usuario)) {
            error_json(422, 'El usuario debe tener de 3 a 30 letras, números, punto o guion.');
        }
        if (strlen($clave) < 10 || strlen($clave) > 200) {
            error_json(422, 'La contraseña debe tener al menos 10 caracteres.');
        }
        guardar_json('admin', ['usuario' => $usuario, 'hash' => password_hash($clave, PASSWORD_DEFAULT), 'creado' => date('c')]);
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['admin_actividad'] = time();
        responder(200, ['ok' => true]);
    },
    'login' => function () use ($d, $credenciales) {
        if (empty($credenciales['hash'])) {
            error_json(409, 'Primero crea la cuenta de administrador.');
        }
        if (!limitar_por_ip('login', 5, 900)) {
            error_json(429, 'Demasiados intentos. Espera 15 minutos.');
        }
        $usuario = (string) ($d['usuario'] ?? '');
        $clave = (string) ($d['clave'] ?? '');
        if (!hash_equals($credenciales['usuario'], $usuario) || !password_verify($clave, $credenciales['hash'])) {
            usleep(400000);
            error_json(401, 'Usuario o contraseña incorrectos.');
        }
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['admin_actividad'] = time();
        responder(200, ['ok' => true]);
    },
    'logout' => function () {
        unset($_SESSION['admin'], $_SESSION['admin_actividad']);
        session_regenerate_id(true);
        responder(200, ['ok' => true]);
    },
];

if (isset($publicas[$accion])) {
    $publicas[$accion]();
}
if (empty($credenciales['hash'])) {
    unset($_SESSION['admin']);
    error_json(401, 'Primero crea la cuenta de administrador.', ['sesion' => false]);
}
requerir_admin();

function es_hoy(string $fecha): bool
{
    return substr($fecha, 0, 10) === ahora()->format('Y-m-d');
}

function minutos_preparacion(array $p): ?float
{
    foreach ($p['historial'] ?? [] as $h) {
        if ($h['estado'] === 'listo') {
            return (strtotime($h['fecha']) - strtotime($p['fecha'])) / 60;
        }
    }
    return null;
}

function slug(string $texto): string
{
    $t = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texto) ?: $texto;
    $t = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $t) ?? '');
    return trim(substr($t, 0, 50), '-') ?: 'plato';
}

function biblioteca_fotos(): array
{
    $lista = [];
    foreach (glob(RUTA_FOTOS . '/*.*') ?: [] as $f) {
        $ruta = 'img/menu/' . basename($f);
        if (imagen_valida($ruta)) {
            $lista[] = $ruta;
        }
    }
    sort($lista);
    return $lista;
}

function guardar_imagen(array $archivo): string
{
    if (($archivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_json(422, 'No se pudo subir la imagen.');
    }
    if ($archivo['size'] > 3 * 1024 * 1024) {
        error_json(422, 'La imagen pesa más de 3 MB.');
    }
    $info = @getimagesize($archivo['tmp_name']);
    $ext = $info ? (['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime']] ?? null) : null;
    if (!$ext) {
        error_json(422, 'La imagen debe ser JPG, PNG o WEBP.');
    }
    if (!is_dir(RUTA_SUBIDAS)) {
        mkdir(RUTA_SUBIDAS, 0755, true);
    }
    $nombre = bin2hex(random_bytes(10)) . '.' . $ext;
    if (!move_uploaded_file($archivo['tmp_name'], RUTA_SUBIDAS . '/' . $nombre)) {
        error_json(500, 'No se pudo guardar la imagen.');
    }
    return 'uploads/platos/' . $nombre;
}

function borrar_subida(string $ruta): void
{
    if (preg_match('/^uploads\/platos\/([a-f0-9]{20}\.(jpg|png|webp))$/', $ruta, $m) && is_file(RUTA_SUBIDAS . '/' . $m[1])) {
        unlink(RUTA_SUBIDAS . '/' . $m[1]);
    }
}

function hora_valida(string $h): bool
{
    return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $h);
}

function consumo_diario(array $pedidos): array
{
    $desde = time() - 7 * 86400;
    $total = [];
    foreach ($pedidos as $p) {
        if ($p['estado'] !== 'cancelado' && strtotime($p['fecha']) >= $desde) {
            foreach ($p['consumo'] ?? [] as $ing => $c) {
                $total[$ing] = ($total[$ing] ?? 0) + $c;
            }
        }
    }
    return array_map(fn($v) => $v / 7, $total);
}

$acciones = [

    'resumen' => function () {
        $config = config();
        $pedidos = leer_json('pedidos', []);
        $platos = leer_json('platos', []);
        $ingredientes = leer_json('ingredientes', []);
        $ahora = ahora();

        $hoy = array_filter($pedidos, fn($p) => es_hoy($p['fecha']) && $p['estado'] !== 'cancelado');
        $ventas = array_sum(array_column($hoy, 'total'));
        $tiempos = array_filter(array_map('minutos_preparacion', $hoy), fn($m) => $m !== null && $m > 0);

        $serie = [];
        [$abre, $cierra] = horario_dia($config, $ahora);
        for ($h = (int) $abre->format('G'); $h <= (int) $cierra->format('G'); $h++) {
            $serie[$h] = ['hora' => sprintf('%02d', $h), 'pedidos' => 0];
        }
        foreach ($hoy as $p) {
            $h = (int) (new DateTimeImmutable($p['fecha']))->format('G');
            if (isset($serie[$h])) {
                $serie[$h]['pedidos']++;
            }
        }

        $alertas = [];
        foreach ($pedidos as $p) {
            if (in_array($p['estado'], ACTIVOS, true) && strtotime($p['listo_estimado']) < time()) {
                $min = (int) floor((time() - strtotime($p['listo_estimado'])) / 60);
                $alertas[] = ['nivel' => 'urgente', 'vista' => 'cocina', 'texto' => "{$p['numero']} va {$min} min tarde",
                    'detalle' => $p['cliente']['nombre'] . ' · ' . ($p['tipo'] === 'domicilio' ? 'a domicilio' : 'recoge en tienda')];
            }
        }
        $diario = consumo_diario($pedidos);
        foreach ($ingredientes as $i) {
            $usan = array_values(array_map(fn($p) => $p['nombre'], array_filter($platos, fn($p) => isset($p['receta'][$i['id']]) && !empty($p['activo']))));
            $umbral = (int) ($i['umbral'] ?? $config['umbral_ingrediente']);
            if ((int) $i['stock'] <= 0) {
                $alertas[] = ['nivel' => 'urgente', 'vista' => 'inventario',
                    'texto' => "Sin {$i['nombre']}: " . (count($usan) === 1 ? '1 platillo se marcó agotado' : count($usan) . ' platillos se marcaron agotados'),
                    'detalle' => $usan ? implode(', ', array_slice($usan, 0, 4)) : 'Ningún platillo lo usa'];
            } elseif ((int) $i['stock'] <= $umbral) {
                $alertas[] = ['nivel' => 'aviso', 'vista' => 'inventario', 'texto' => "Quedan {$i['stock']} {$i['unidad']} de {$i['nombre']}", 'detalle' => "Aviso configurado en $umbral"];
            } elseif (($diario[$i['id']] ?? 0) > 0 && $i['stock'] / $diario[$i['id']] < 2) {
                $alertas[] = ['nivel' => 'aviso', 'vista' => 'inventario',
                    'texto' => "Reponer {$i['nombre']}: alcanza para ~" . round($i['stock'] / $diario[$i['id']], 1) . ' días',
                    'detalle' => 'Consumo promedio: ' . round($diario[$i['id']], 1) . " {$i['unidad']} por día"];
            }
        }
        $cocina = estado_cocina($pedidos, $config);
        $llenas = array_filter(array_slice($cocina['franjas'], 0, 8), fn($f) => !$f['disponible']);
        if ($llenas) {
            $alertas[] = ['nivel' => 'aviso', 'vista' => 'automatizaciones',
                'texto' => count($llenas) . ' turnos próximos llenos: ' . implode(', ', array_map(fn($f) => $f['etiqueta'], $llenas)),
                'detalle' => 'Los pedidos nuevos pasan solos al siguiente turno con lugar'];
        }
        foreach ($platos as $p) {
            if (promo_activa($p)) {
                $alertas[] = ['nivel' => 'ok', 'vista' => 'menu', 'texto' => "Promoción activa: {$p['promo']['nombre']} en {$p['nombre']}",
                    'detalle' => 'Hasta las ' . $p['promo']['hasta'] . ' · $' . number_format((float) $p['promo']['precio'], 2)];
            }
        }
        $orden = ['urgente' => 0, 'aviso' => 1, 'ok' => 2];
        usort($alertas, fn($a, $b) => $orden[$a['nivel']] <=> $orden[$b['nivel']]);

        $conteo = [];
        foreach ($pedidos as $p) {
            if ($p['estado'] !== 'cancelado' && strtotime($p['fecha']) > time() - 7 * 86400) {
                foreach ($p['items'] as $it) {
                    $conteo[$it['nombre']] = ($conteo[$it['nombre']] ?? 0) + $it['cantidad'];
                }
            }
        }
        arsort($conteo);
        $top = [];
        foreach (array_slice($conteo, 0, 5, true) as $n => $c) {
            $top[] = ['nombre' => $n, 'unidades' => $c];
        }
        $activos = count(array_filter($pedidos, fn($p) => in_array($p['estado'], ACTIVOS, true)));

        responder(200, [
            'ok' => true,
            'kpis' => [
                'ventas_hoy'  => round($ventas, 2),
                'pedidos_hoy' => count($hoy),
                'ticket'      => count($hoy) ? round($ventas / count($hoy), 2) : 0,
                'prep_prom'   => $tiempos ? round(array_sum($tiempos) / count($tiempos), 1) : 0,
                'espera'      => $cocina['espera_min'],
                'activos'     => $activos,
            ],
            'serie'   => array_values($serie),
            'alertas' => $alertas,
            'top'     => $top,
            'contadores' => [
                'cocina' => $activos,
                'inventario' => count(array_filter($alertas, fn($a) => $a['vista'] === 'inventario' && $a['nivel'] === 'urgente')),
            ],
            'demo' => (bool) array_filter($pedidos, fn($p) => !empty($p['demo'])),
        ]);
    },

    'cocina' => function () {
        $vista = array_values(array_filter(leer_json('pedidos', []), fn($p) => in_array($p['estado'], ['recibido', 'preparando', 'listo'], true)));
        usort($vista, fn($a, $b) => strcmp($a['listo_estimado'], $b['listo_estimado']));
        responder(200, ['ok' => true, 'pedidos' => $vista, 'ahora' => iso(ahora())]);
    },

    'avanzar' => function () use ($d) {
        $numero = (string) ($d['numero'] ?? '');
        $nuevo = (string) ($d['estado'] ?? '');
        if (!in_array($nuevo, ESTADOS, true)) {
            error_json(422, 'Estado no válido.');
        }
        $res = con_bloqueo(function () use ($numero, $nuevo) {
            $pedidos = leer_json('pedidos', []);
            foreach ($pedidos as $i => $p) {
                if ($p['numero'] !== $numero) {
                    continue;
                }
                if (in_array($p['estado'], ['cancelado', 'entregado'], true)) {
                    return ['error' => 'Este pedido ya está cerrado.'];
                }
                if ($nuevo === 'cancelado') {
                    $ingredientes = leer_json('ingredientes', []);
                    mover_ingredientes($ingredientes, $p['consumo'] ?? [], 1);
                    guardar_json('ingredientes', $ingredientes);
                }
                $pedidos[$i]['estado'] = $nuevo;
                $pedidos[$i]['historial'][] = ['estado' => $nuevo, 'fecha' => iso(ahora())];
                guardar_json('pedidos', $pedidos);
                return ['ok' => true];
            }
            return ['error' => 'El pedido no existe.'];
        });
        isset($res['error']) ? error_json(409, $res['error']) : responder(200, ['ok' => true]);
    },

    'pedidos' => function () {
        $pedidos = leer_json('pedidos', []);
        usort($pedidos, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
        responder(200, ['ok' => true, 'pedidos' => array_slice($pedidos, 0, 300)]);
    },

    'platos' => function () {
        $ingredientes = leer_json('ingredientes', []);
        $stock = stock_ingredientes($ingredientes);
        $nombres = array_column($ingredientes, 'nombre', 'id');
        $lista = array_map(function ($p) use ($stock, $nombres) {
            $falta = faltante($p['receta'] ?? [], $stock);
            $p['agotado_por'] = $falta !== null ? ($nombres[$falta] ?? $falta) : '';
            $p['precio_actual'] = precio_actual($p);
            $p['promo_activa'] = promo_activa($p);
            return $p;
        }, leer_json('platos', []));
        usort($lista, fn($a, $b) => ($a['orden'] ?? 99) <=> ($b['orden'] ?? 99));
        responder(200, ['ok' => true, 'platos' => $lista, 'ingredientes' => $ingredientes, 'fotos' => biblioteca_fotos()]);
    },

    'guardar_plato' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $nombre = limpiar($d['nombre'] ?? '', 60);
        $categoria = (string) ($d['categoria'] ?? '');
        $precio = round((float) ($d['precio'] ?? 0), 2);
        $kcal = (int) ($d['kcal'] ?? 0);
        $foto = (string) ($d['foto'] ?? '');

        $errores = [];
        if (mb_strlen($nombre) < 3)                    $errores[] = 'nombre';
        if (!in_array($categoria, CATEGORIAS, true))   $errores[] = 'categoría';
        if ($precio <= 0 || $precio > 1000)            $errores[] = 'precio';
        if ($kcal < 0 || $kcal > 5000)                 $errores[] = 'calorías';
        if ($foto !== '' && !in_array($foto, biblioteca_fotos(), true)) $errores[] = 'foto';

        $ingredientes = leer_json('ingredientes', []);
        $receta = [];
        foreach ($ingredientes as $i) {
            $c = (int) ($d['receta_' . $i['id']] ?? 0);
            if ($c < 0 || $c > 20) {
                $errores[] = 'receta';
            } elseif ($c > 0) {
                $receta[$i['id']] = $c;
            }
        }
        $promo = null;
        $pp = (float) ($d['promo_precio'] ?? 0);
        if ($pp > 0) {
            $dias = array_values(array_filter(array_map('intval', (array) ($d['promo_dias'] ?? [])), fn($x) => $x >= 0 && $x <= 6));
            $desde = (string) ($d['promo_desde'] ?? '');
            $hasta = (string) ($d['promo_hasta'] ?? '');
            if ($pp >= $precio)  $errores[] = 'el precio de promoción debe ser menor';
            if (!$dias)          $errores[] = 'días de la promoción';
            if (!hora_valida($desde) || !hora_valida($hasta) || $hasta <= $desde) $errores[] = 'horario de la promoción';
            $promo = ['nombre' => limpiar($d['promo_nombre'] ?? '', 24) ?: 'Promoción', 'precio' => round($pp, 2), 'dias' => $dias, 'desde' => $desde, 'hasta' => $hasta];
        }
        if ($errores) {
            error_json(422, 'Revisa: ' . implode(', ', array_unique($errores)) . '.');
        }
        $subida = !empty($_FILES['imagen']['name']) ? guardar_imagen($_FILES['imagen']) : null;

        $res = con_bloqueo(function () use ($id, $nombre, $categoria, $precio, $kcal, $foto, $receta, $promo, $subida, $d) {
            $platos = leer_json('platos', []);
            $indice = mapa_por_id($platos);
            if ($id !== '') {
                if (!isset($indice[$id])) {
                    return ['error' => 'El platillo ya no existe.'];
                }
                $p = $platos[$indice[$id]];
            } else {
                $base = slug($nombre);
                $nuevo = $base;
                for ($n = 2; isset($indice[$nuevo]); $n++) {
                    $nuevo = $base . '-' . $n;
                }
                $p = ['id' => $nuevo, 'creado' => date('c'), 'imagen' => '', 'orden' => count($platos) + 1, 'disponible' => true];
            }
            $anterior = $p['imagen'] ?? '';
            if ($subida) {
                $p['imagen'] = $subida;
            } elseif ($foto !== '') {
                $p['imagen'] = $foto;
            }
            if ($anterior !== $p['imagen']) {
                borrar_subida($anterior);
            }
            $p['nombre'] = $nombre;
            $p['categoria'] = $categoria;
            $p['descripcion'] = limpiar($d['descripcion'] ?? '', 200);
            $p['precio'] = $precio;
            $p['kcal'] = $kcal;
            $p['receta'] = $receta;
            $p['promo'] = $promo;
            $p['picante'] = !empty($d['picante']) && $d['picante'] !== '0';
            $p['favorito'] = !empty($d['favorito']) && $d['favorito'] !== '0';
            $p['activo'] = !empty($d['activo']) && $d['activo'] !== '0';
            if ($id !== '') {
                $platos[$indice[$id]] = $p;
            } else {
                $platos[] = $p;
            }
            guardar_json('platos', $platos);
            return ['id' => $p['id']];
        });
        isset($res['error']) ? error_json(404, $res['error']) : responder(200, ['ok' => true, 'id' => $res['id']]);
    },

    'eliminar_plato' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $ok = con_bloqueo(function () use ($id) {
            $platos = leer_json('platos', []);
            $indice = mapa_por_id($platos);
            if (!isset($indice[$id])) {
                return false;
            }
            borrar_subida($platos[$indice[$id]]['imagen'] ?? '');
            array_splice($platos, $indice[$id], 1);
            guardar_json('platos', $platos);
            return true;
        });
        $ok ? responder(200, ['ok' => true]) : error_json(404, 'El platillo ya no existe.');
    },

    'disponible' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $v = con_bloqueo(function () use ($id) {
            $platos = leer_json('platos', []);
            $indice = mapa_por_id($platos);
            if (!isset($indice[$id])) {
                return null;
            }
            $platos[$indice[$id]]['disponible'] = empty($platos[$indice[$id]]['disponible']);
            guardar_json('platos', $platos);
            return $platos[$indice[$id]]['disponible'];
        });
        $v === null ? error_json(404, 'El platillo ya no existe.') : responder(200, ['ok' => true, 'disponible' => $v]);
    },

    'inventario' => function () {
        $config = config();
        $platos = leer_json('platos', []);
        $diario = consumo_diario(leer_json('pedidos', []));
        $lista = array_map(function ($i) use ($platos, $diario, $config) {
            $i['usan'] = array_values(array_map(fn($p) => $p['nombre'], array_filter($platos, fn($p) => isset($p['receta'][$i['id']]))));
            $i['diario'] = round($diario[$i['id']] ?? 0, 1);
            $i['dias'] = ($diario[$i['id']] ?? 0) > 0 ? round($i['stock'] / $diario[$i['id']], 1) : null;
            $i['sugerido'] = ($diario[$i['id']] ?? 0) > 0 ? max(0, (int) ceil($diario[$i['id']] * 3 - $i['stock'])) : 0;
            $i['umbral'] = (int) ($i['umbral'] ?? $config['umbral_ingrediente']);
            return $i;
        }, leer_json('ingredientes', []));
        responder(200, ['ok' => true, 'ingredientes' => $lista]);
    },

    'stock' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $campo = (string) ($d['campo'] ?? 'stock');
        $valor = (int) ($d['valor'] ?? -1);
        if (!in_array($campo, ['stock', 'umbral'], true) || $valor < 0 || $valor > 99999) {
            error_json(422, 'Cantidad no válida.');
        }
        $ok = con_bloqueo(function () use ($id, $campo, $valor) {
            $ingredientes = leer_json('ingredientes', []);
            $indice = mapa_por_id($ingredientes);
            if (!isset($indice[$id])) {
                return false;
            }
            $ingredientes[$indice[$id]][$campo] = $valor;
            guardar_json('ingredientes', $ingredientes);
            return true;
        });
        $ok ? responder(200, ['ok' => true]) : error_json(404, 'El ingrediente ya no existe.');
    },

    'nuevo_ingrediente' => function () use ($d) {
        $nombre = limpiar($d['nombre'] ?? '', 40);
        $unidad = limpiar($d['unidad'] ?? '', 16) ?: 'porciones';
        $stock = (int) ($d['stock'] ?? 0);
        if (mb_strlen($nombre) < 2 || $stock < 0 || $stock > 99999) {
            error_json(422, 'Revisa el nombre y la cantidad.');
        }
        $id = con_bloqueo(function () use ($nombre, $unidad, $stock) {
            $ingredientes = leer_json('ingredientes', []);
            $indice = mapa_por_id($ingredientes);
            $base = str_replace('-', '_', slug($nombre));
            $id = $base;
            for ($n = 2; isset($indice[$id]); $n++) {
                $id = $base . '_' . $n;
            }
            $ingredientes[] = ['id' => $id, 'nombre' => $nombre, 'unidad' => $unidad, 'stock' => $stock, 'umbral' => config()['umbral_ingrediente']];
            guardar_json('ingredientes', $ingredientes);
            return $id;
        });
        responder(200, ['ok' => true, 'id' => $id]);
    },

    'eliminar_ingrediente' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $usan = array_filter(leer_json('platos', []), fn($p) => isset($p['receta'][$id]));
        if ($usan) {
            error_json(409, 'No se puede eliminar: lo usan ' . count($usan) . ' platillos. Quítalo primero de sus recetas.');
        }
        con_bloqueo(function () use ($id) {
            guardar_json('ingredientes', array_values(array_filter(leer_json('ingredientes', []), fn($i) => $i['id'] !== $id)));
        });
        responder(200, ['ok' => true]);
    },

    'config' => function () {
        responder(200, ['ok' => true, 'config' => config()]);
    },

    'guardar_config' => function () use ($d) {
        $rangos = [
            'capacidad_franja' => [1, 100], 'prep_base' => [1, 90], 'min_por_pedido' => [0, 30], 'cocineros' => [1, 20],
            'tiempo_entrega' => [0, 120], 'costo_envio' => [0, 100], 'envio_gratis_desde' => [0, 1000],
            'minimo_domicilio' => [0, 1000], 'umbral_ingrediente' => [0, 1000], 'dias_nuevo' => [0, 120],
        ];
        $nueva = [];
        foreach ($rangos as $k => [$min, $max]) {
            $v = $d[$k] ?? null;
            if (!is_numeric($v) || $v < $min || $v > $max) {
                error_json(422, "Valor fuera de rango: $k ($min a $max).");
            }
            $nueva[$k] = $v + 0;
        }
        $horario = [];
        for ($i = 0; $i < 7; $i++) {
            $a = (string) ($d['abre_' . $i] ?? '');
            $c = (string) ($d['cierra_' . $i] ?? '');
            if (!hora_valida($a) || !hora_valida($c) || $c <= $a) {
                error_json(422, 'Revisa el horario del ' . mb_strtolower(DIAS[$i]) . '.');
            }
            $horario[] = [$a, $c];
        }
        $nueva['horario'] = $horario;
        $nueva['minutos_franja'] = 15;
        guardar_json('config', $nueva);
        responder(200, ['ok' => true]);
    },

    'patrocinadores' => function () {
        $lista = leer_json('patrocinadores', []);
        usort($lista, fn($a, $b) => ($a['orden'] ?? 99) <=> ($b['orden'] ?? 99));
        responder(200, ['ok' => true, 'patrocinadores' => $lista]);
    },

    'guardar_patrocinador' => function () use ($d) {
        $simbolo = (string) ($d['simbolo'] ?? '');
        $url = trim((string) ($d['url'] ?? ''));
        $nombre = limpiar($d['nombre'] ?? '', 40);
        if (!in_array($simbolo, SIMBOLOS, true)) {
            error_json(422, 'Elige un logo de la lista.');
        }
        if ($url !== '' && (!preg_match('#^https?://[^\s"\'<>]+$#i', $url) || strlen($url) > 200 || !filter_var($url, FILTER_VALIDATE_URL))) {
            error_json(422, 'El enlace debe empezar con https://');
        }
        con_bloqueo(function () use ($nombre, $simbolo, $url) {
            $lista = leer_json('patrocinadores', []);
            $orden = array_reduce($lista, fn($m, $x) => max($m, (int) ($x['orden'] ?? 0)), 0);
            $lista[] = ['id' => nuevo_id('pt_'), 'nombre' => $nombre ?: $simbolo, 'simbolo' => $simbolo, 'url' => $url, 'activo' => true, 'orden' => $orden + 1];
            guardar_json('patrocinadores', $lista);
        });
        responder(200, ['ok' => true]);
    },

    'alternar_patrocinador' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        con_bloqueo(function () use ($id) {
            $lista = leer_json('patrocinadores', []);
            foreach ($lista as &$m) {
                if ($m['id'] === $id) {
                    $m['activo'] = empty($m['activo']);
                }
            }
            unset($m);
            guardar_json('patrocinadores', $lista);
        });
        responder(200, ['ok' => true]);
    },

    'mover_patrocinador' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $paso = (int) ($d['paso'] ?? 0) < 0 ? -1 : 1;
        con_bloqueo(function () use ($id, $paso) {
            $lista = leer_json('patrocinadores', []);
            usort($lista, fn($a, $b) => ($a['orden'] ?? 99) <=> ($b['orden'] ?? 99));
            foreach ($lista as $i => $m) {
                if ($m['id'] === $id && isset($lista[$i + $paso])) {
                    [$lista[$i], $lista[$i + $paso]] = [$lista[$i + $paso], $lista[$i]];
                    break;
                }
            }
            foreach ($lista as $i => &$m) {
                $m['orden'] = $i + 1;
            }
            unset($m);
            guardar_json('patrocinadores', $lista);
        });
        responder(200, ['ok' => true]);
    },

    'eliminar_patrocinador' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        con_bloqueo(function () use ($id) {
            guardar_json('patrocinadores', array_values(array_filter(leer_json('patrocinadores', []), fn($m) => $m['id'] !== $id)));
        });
        responder(200, ['ok' => true]);
    },

    'borrar_demo' => function () {
        con_bloqueo(function () {
            guardar_json('pedidos', array_values(array_filter(leer_json('pedidos', []), fn($p) => empty($p['demo']))));
        });
        responder(200, ['ok' => true]);
    },
];

if (!isset($acciones[$accion])) {
    error_json(400, 'Acción desconocida.');
}
$acciones[$accion]();
