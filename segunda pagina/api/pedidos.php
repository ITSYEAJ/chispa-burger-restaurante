<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

$d = entrada();

if (!empty($d['sitio_web'])) {
    error_json(400, 'No pudimos procesar el pedido.');
}
if (time() - (int) ($_SESSION['ultimo_pedido'] ?? 0) < 20) {
    error_json(429, 'Espera unos segundos antes de enviar otro pedido.');
}
if (!limitar_por_ip('pedidos', 8, 3600)) {
    error_json(429, 'Demasiados pedidos desde esta conexión. Llámanos al 555 014 2020.');
}

$tipo      = (string) ($d['tipo'] ?? '');
$direccion = limpiar($d['direccion'] ?? '', 160);
$franja    = (string) ($d['franja'] ?? '');
$nombre    = limpiar($d['nombre'] ?? '', 60);
$telefono  = limpiar($d['telefono'] ?? '', 20);
$pago      = (string) ($d['pago'] ?? '');
$notas     = limpiar($d['notas'] ?? '', 160);

$errores = [];
if (!in_array($tipo, ['recoger', 'domicilio'], true))                              $errores[] = 'tipo de entrega';
if ($tipo === 'domicilio' && mb_strlen($direccion) < 6)                             $errores[] = 'dirección';
if ($franja !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $franja))    $errores[] = 'turno';
if (!preg_match("/^[\p{L}\s'.-]{2,60}$/u", $nombre))                                 $errores[] = 'nombre';
if (!preg_match('/^[0-9 +()-]{7,20}$/', $telefono))                                  $errores[] = 'teléfono';
if (!in_array($pago, ['efectivo', 'tarjeta'], true))                                 $errores[] = 'forma de pago';
if ($errores) {
    error_json(422, 'Revisa: ' . implode(', ', $errores) . '.');
}

$lineas = [];
foreach (is_array($d['items'] ?? null) ? array_slice($d['items'], 0, 30) : [] as $it) {
    $id = is_string($it['id'] ?? null) ? $it['id'] : '';
    $cant = (int) ($it['cantidad'] ?? 0);
    if (!preg_match('/^[a-z0-9-]{2,60}$/', $id) || $cant < 1 || $cant > 10) {
        error_json(422, 'Hay un platillo no válido en tu pedido.');
    }
    $lineas[] = [
        'id'       => $id,
        'cantidad' => $cant,
        'extras'   => array_values(array_unique(array_filter((array) ($it['extras'] ?? []), 'is_string'))),
        'quitar'   => array_values(array_unique(array_filter((array) ($it['quitar'] ?? []), 'is_string'))),
        'nota'     => limpiar($it['nota'] ?? '', 80),
    ];
}
if (!$lineas) {
    error_json(422, 'Tu pedido está vacío.');
}

$res = con_bloqueo(function () use ($lineas, $tipo, $direccion, $franja, $nombre, $telefono, $pago, $notas) {
    $programado = $franja !== '';
    $config = config();
    $platos = leer_json('platos', []);
    $indice = mapa_por_id($platos);
    $ingredientes = leer_json('ingredientes', []);
    $stock = stock_ingredientes($ingredientes);
    $pedidos = leer_json('pedidos', []);

    $items = [];
    $consumo = [];
    $subtotal = 0.0;
    foreach ($lineas as $l) {
        if (!isset($indice[$l['id']]) || empty($platos[$indice[$l['id']]]['activo']) || empty($platos[$indice[$l['id']]]['disponible'])) {
            return ['error' => 'Un platillo de tu pedido ya no está disponible.', 'recargar' => true];
        }
        $p = $platos[$indice[$l['id']]];
        $necesita = $p['receta'] ?? [];
        $nombresExtras = [];
        $precioExtras = 0.0;
        foreach ($l['extras'] as $xid) {
            $x = extra_por_id($p['categoria'], $xid);
            if (!$x) {
                return ['error' => 'Hay un extra no válido en tu pedido.'];
            }
            $nombresExtras[] = $x['nombre'];
            $precioExtras += $x['precio'];
            foreach ($x['ing'] as $ing => $c) {
                $necesita[$ing] = ($necesita[$ing] ?? 0) + $c;
            }
        }
        foreach ($necesita as $ing => $c) {
            $consumo[$ing] = ($consumo[$ing] ?? 0) + $c * $l['cantidad'];
        }
        $unitario = precio_actual($p) + $precioExtras;
        $subtotal += $unitario * $l['cantidad'];
        $items[] = [
            'id' => $p['id'], 'nombre' => $p['nombre'], 'cantidad' => $l['cantidad'], 'precio' => round($unitario, 2),
            'extras' => $nombresExtras, 'quitar' => array_values(array_intersect($l['quitar'], QUITAR[$p['categoria']] ?? [])), 'nota' => $l['nota'],
        ];
    }
    foreach ($consumo as $ing => $c) {
        if (($stock[$ing] ?? 0) < $c) {
            return ['error' => 'Se nos acaba de agotar un ingrediente de tu pedido. Actualizamos el menú.', 'recargar' => true];
        }
    }
    if ($tipo === 'domicilio' && $subtotal < $config['minimo_domicilio']) {
        return ['error' => 'El pedido mínimo a domicilio es $' . number_format((float) $config['minimo_domicilio'], 2) . '.'];
    }

    $cocina = estado_cocina($pedidos, $config);
    $minutos = (int) $config['minutos_franja'];
    if ($programado) {
        $elegida = null;
        foreach ($cocina['franjas'] as $f) {
            if ($f['valor'] === $franja) {
                $elegida = $f;
            }
        }
        if (!$elegida || !$elegida['disponible']) {
            return ['error' => 'Ese turno se acaba de llenar. Elige otro, por favor.', 'recargar' => true];
        }
        $listo = new DateTimeImmutable($franja);
    } else {
        if (!$cocina['abierto']) {
            return ['error' => 'La cocina está cerrada ahora. Programa tu pedido para un turno disponible.'];
        }
        $extra = $tipo === 'domicilio' ? (int) $config['tiempo_entrega'] : 0;
        $listo = ahora()->modify('+' . ($cocina['espera_min'] + $extra) . ' minutes');
        $ocupacion = ocupacion_franjas($pedidos);
        $t = redondear_franja($listo, $minutos);
        $saltos = 0;
        while (($ocupacion[clave_franja($t)] ?? 0) >= $config['capacidad_franja'] && $saltos < 16) {
            $t = $t->modify("+$minutos minutes");
            $saltos++;
        }
        if ($saltos > 0) {
            $listo = $t;
        }
        $franja = clave_franja($t);
    }

    mover_ingredientes($ingredientes, $consumo, -1);
    $envio = $tipo === 'domicilio' && $subtotal < $config['envio_gratis_desde'] ? (float) $config['costo_envio'] : 0.0;
    $mayor = 1000;
    foreach ($pedidos as $pe) {
        $mayor = max($mayor, (int) substr($pe['numero'], 3));
    }
    $pedido = [
        'numero'         => 'CH-' . ($mayor + 1),
        'codigo'         => strtoupper(bin2hex(random_bytes(3))),
        'fecha'          => iso(ahora()),
        'tipo'           => $tipo,
        'franja'         => $franja,
        'programado'     => $programado,
        'listo_estimado' => iso($listo),
        'cliente'        => ['nombre' => $nombre, 'telefono' => $telefono, 'direccion' => $direccion],
        'items'          => $items,
        'consumo'        => $consumo,
        'subtotal'       => round($subtotal, 2),
        'envio'          => $envio,
        'total'          => round($subtotal + $envio, 2),
        'pago'           => $pago,
        'notas'          => $notas,
        'estado'         => 'recibido',
        'historial'      => [['estado' => 'recibido', 'fecha' => iso(ahora())]],
    ];
    $pedidos[] = $pedido;
    guardar_json('ingredientes', $ingredientes);
    guardar_json('pedidos', $pedidos);
    return ['pedido' => $pedido];
});

if (isset($res['error'])) {
    error_json(409, $res['error'], ['recargar' => !empty($res['recargar'])]);
}

$_SESSION['ultimo_pedido'] = time();
$p = $res['pedido'];
responder(200, [
    'ok'             => true,
    'numero'         => $p['numero'],
    'codigo'         => $p['codigo'],
    'total'          => $p['total'],
    'tipo'           => $p['tipo'],
    'listo_estimado' => $p['listo_estimado'],
    'estado'         => $p['estado'],
]);
