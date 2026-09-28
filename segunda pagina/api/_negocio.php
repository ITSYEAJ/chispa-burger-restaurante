<?php
declare(strict_types=1);
require_once __DIR__ . '/_seguridad.php';

const CATEGORIAS = ['hamburguesas', 'pollo', 'hotdogs', 'acompanantes', 'bebidas', 'postres', 'combos'];
const ESTADOS = ['recibido', 'preparando', 'listo', 'entregado', 'cancelado'];
const ACTIVOS = ['recibido', 'preparando'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SIMBOLOS = ['cocacola', 'ubereats', 'pepsi', 'redbull', 'doordash', 'mercadopago', 'glovo', 'visa', 'deliveroo', 'justeat', 'mastercard', 'ifood', 'grubhub'];
const RUTA_FOTOS = __DIR__ . '/../img/menu';

const EXTRAS = [
    'hamburguesas' => [
        ['id' => 'queso', 'nombre' => 'Queso cheddar extra', 'precio' => 1.0, 'ing' => ['queso' => 1]],
        ['id' => 'tocino', 'nombre' => 'Tocino ahumado', 'precio' => 1.5, 'ing' => ['tocino' => 1]],
        ['id' => 'carne', 'nombre' => 'Carne extra 120 g', 'precio' => 2.5, 'ing' => ['carne' => 1]],
        ['id' => 'jalapenos', 'nombre' => 'Jalapeños asados', 'precio' => 0.5, 'ing' => []],
        ['id' => 'combo', 'nombre' => 'Hazlo combo: papas + refresco', 'precio' => 3.5, 'ing' => ['papas' => 1, 'vaso' => 1]],
    ],
    'pollo' => [
        ['id' => 'queso', 'nombre' => 'Queso cheddar', 'precio' => 1.0, 'ing' => ['queso' => 1]],
        ['id' => 'bbq', 'nombre' => 'Salsa BBQ ahumada', 'precio' => 0.5, 'ing' => []],
        ['id' => 'picante', 'nombre' => 'Salsa picante de la casa', 'precio' => 0.5, 'ing' => []],
        ['id' => 'combo', 'nombre' => 'Hazlo combo: papas + refresco', 'precio' => 3.5, 'ing' => ['papas' => 1, 'vaso' => 1]],
    ],
    'hotdogs' => [
        ['id' => 'queso', 'nombre' => 'Queso fundido', 'precio' => 1.0, 'ing' => ['queso' => 1]],
        ['id' => 'tocino', 'nombre' => 'Envuelto en tocino', 'precio' => 1.5, 'ing' => ['tocino' => 1]],
    ],
    'acompanantes' => [
        ['id' => 'queso', 'nombre' => 'Queso fundido', 'precio' => 1.0, 'ing' => ['queso' => 1]],
        ['id' => 'tocino', 'nombre' => 'Tocino picado', 'precio' => 1.5, 'ing' => ['tocino' => 1]],
    ],
    'bebidas' => [['id' => 'grande', 'nombre' => 'Tamaño grande', 'precio' => 0.8, 'ing' => []]],
    'postres' => [['id' => 'chocolate', 'nombre' => 'Salsa de chocolate', 'precio' => 0.5, 'ing' => []]],
    'combos' => [['id' => 'agrandar', 'nombre' => 'Agrandar papas y bebida', 'precio' => 1.5, 'ing' => ['papas' => 1]]],
];

const QUITAR = [
    'hamburguesas' => ['Cebolla', 'Pepinillos', 'Tomate', 'Lechuga', 'Salsa de la casa'],
    'pollo' => ['Lechuga', 'Mayonesa', 'Tomate'],
    'hotdogs' => ['Cebolla', 'Mostaza', 'Pepinillo'],
    'combos' => ['Cebolla', 'Pepinillos', 'Hielo en la bebida'],
];

function config(): array
{
    return array_merge([
        'horario'            => [['12:00', '22:00'], ['11:00', '23:00'], ['11:00', '23:00'], ['11:00', '23:00'], ['11:00', '23:00'], ['11:00', '23:00'], ['11:00', '23:00']],
        'capacidad_franja'   => 6,
        'minutos_franja'     => 15,
        'prep_base'          => 8,
        'min_por_pedido'     => 3,
        'cocineros'          => 2,
        'tiempo_entrega'     => 15,
        'costo_envio'        => 2.5,
        'envio_gratis_desde' => 25,
        'minimo_domicilio'   => 10,
        'umbral_ingrediente' => 10,
        'dias_nuevo'         => 21,
    ], leer_json('config', []));
}

function ahora(): DateTimeImmutable
{
    return new DateTimeImmutable('now');
}

function iso(DateTimeImmutable $d): string
{
    return $d->format(DATE_ATOM);
}

function clave_franja(DateTimeImmutable $d): string
{
    return $d->format('Y-m-d\TH:i');
}

function horario_dia(array $config, DateTimeImmutable $dia): array
{
    [$abre, $cierra] = $config['horario'][(int) $dia->format('w')];
    return [new DateTimeImmutable($dia->format('Y-m-d') . ' ' . $abre), new DateTimeImmutable($dia->format('Y-m-d') . ' ' . $cierra)];
}

function redondear_franja(DateTimeImmutable $d, int $minutos): DateTimeImmutable
{
    $paso = $minutos * 60;
    return (new DateTimeImmutable())->setTimestamp((int) (ceil($d->getTimestamp() / $paso) * $paso));
}

function ocupacion_franjas(array $pedidos): array
{
    $o = [];
    foreach ($pedidos as $p) {
        if ($p['estado'] !== 'cancelado' && !empty($p['franja'])) {
            $o[$p['franja']] = ($o[$p['franja']] ?? 0) + 1;
        }
    }
    return $o;
}

function espera_minutos(array $pedidos, array $config): int
{
    $activos = count(array_filter($pedidos, fn($p) => in_array($p['estado'], ACTIVOS, true)));
    return (int) ($config['prep_base'] + ceil($activos / max(1, $config['cocineros'])) * $config['min_por_pedido']);
}

function semana_horario(array $config): array
{
    $grupos = [];
    foreach ([1, 2, 3, 4, 5, 6, 0] as $dia) {
        $horas = $config['horario'][$dia][0] . '–' . $config['horario'][$dia][1];
        $u = count($grupos) - 1;
        if ($u >= 0 && $grupos[$u]['horas'] === $horas) {
            $grupos[$u]['incluye'][] = $dia;
        } else {
            $grupos[] = ['horas' => $horas, 'incluye' => [$dia]];
        }
    }
    return array_map(function ($g) {
        $primero = DIAS[$g['incluye'][0]];
        $ultimo = DIAS[end($g['incluye'])];
        $g['dias'] = count($g['incluye']) === 1 ? $primero : $primero . ' a ' . mb_strtolower($ultimo);
        return $g;
    }, $grupos);
}

function estado_cocina(array $pedidos, array $config, array $platos = []): array
{
    $ahora = ahora();
    [$abre, $cierra] = horario_dia($config, $ahora);
    $abierto = $ahora >= $abre && $ahora < $cierra->modify('-15 minutes');
    $espera = espera_minutos($pedidos, $config);
    $ocupacion = ocupacion_franjas($pedidos);
    $minutos = (int) $config['minutos_franja'];

    $franjas = [];
    foreach ([$ahora, $ahora->modify('+1 day')] as $i => $dia) {
        [$a, $c] = horario_dia($config, $dia);
        $desde = $i === 0 ? max($a, $ahora->modify("+$espera minutes")) : $a;
        $t = redondear_franja($desde, $minutos);
        while ($t <= $c->modify('-15 minutes') && count($franjas) < 40) {
            $clave = clave_franja($t);
            $franjas[] = [
                'valor'      => $clave,
                'etiqueta'   => $t->format('H:i'),
                'dia'        => $i === 0 ? 'Hoy' : 'Mañana, ' . mb_strtolower(DIAS[(int) $t->format('w')]),
                'disponible' => ($ocupacion[$clave] ?? 0) < $config['capacidad_franja'],
            ];
            $t = $t->modify("+$minutos minutes");
        }
        if ($i === 0 && count($franjas) >= 8) {
            break;
        }
    }

    $mensaje = '';
    if (!$abierto) {
        $mensaje = $ahora < $abre
            ? 'Cerrado · abrimos hoy a las ' . $abre->format('H:i')
            : 'Cerrado · abrimos mañana a las ' . horario_dia($config, $ahora->modify('+1 day'))[0]->format('H:i');
    }

    $promoActiva = false;
    foreach ($platos as $p) {
        if (($p['id'] ?? '') === 'papas-clasicas' && promo_activa($p)) {
            $promoActiva = true;
        }
    }

    return [
        'abierto'     => $abierto,
        'espera_min'  => $espera,
        'mensaje'     => $mensaje,
        'cierra'      => $cierra->format('H:i'),
        'horario_hoy' => $abre->format('H:i') . '–' . $cierra->format('H:i'),
        'dia_hoy'     => (int) $ahora->format('w'),
        'semana'      => semana_horario($config),
        'promo'       => ['activa' => $promoActiva, 'texto' => 'Lunes a viernes · 15:00 a 18:00'],
        'franjas'     => $franjas,
    ];
}

function mapa_por_id(array $lista): array
{
    $m = [];
    foreach ($lista as $i => $x) {
        $m[$x['id']] = $i;
    }
    return $m;
}

function stock_ingredientes(array $ingredientes): array
{
    return array_column(array_map(fn($i) => ['id' => $i['id'], 's' => (int) $i['stock']], $ingredientes), 's', 'id');
}

function faltante(array $receta, array $stock): ?string
{
    foreach ($receta as $ing => $cant) {
        if (($stock[$ing] ?? 0) < $cant) {
            return $ing;
        }
    }
    return null;
}

function promo_activa(array $p): bool
{
    $pr = $p['promo'] ?? null;
    if (!$pr || empty($pr['precio']) || (float) $pr['precio'] >= (float) $p['precio']) {
        return false;
    }
    $ahora = ahora();
    if (!in_array((int) $ahora->format('w'), array_map('intval', $pr['dias'] ?? []), true)) {
        return false;
    }
    $h = $ahora->format('H:i');
    return $h >= ($pr['desde'] ?? '00:00') && $h < ($pr['hasta'] ?? '23:59');
}

function precio_actual(array $p): float
{
    return promo_activa($p) ? (float) $p['promo']['precio'] : (float) $p['precio'];
}

function imagen_valida(string $ruta): bool
{
    return (bool) preg_match('/^(img\/menu\/[a-z0-9-]{2,60}\.(webp|jpg|png)|uploads\/platos\/[a-f0-9]{20}\.(jpg|png|webp))$/', $ruta);
}

function plato_publico(array $p, array $stock, array $config): array
{
    $falta = faltante($p['receta'] ?? [], $stock);
    $disponible = !empty($p['disponible']) && $falta === null;
    $creado = strtotime($p['creado'] ?? '') ?: 0;
    return [
        'id'              => $p['id'],
        'nombre'          => $p['nombre'],
        'categoria'       => $p['categoria'],
        'descripcion'     => $p['descripcion'] ?? '',
        'precio'          => precio_actual($p),
        'precio_original' => promo_activa($p) ? (float) $p['precio'] : null,
        'promo'           => promo_activa($p) ? ($p['promo']['nombre'] ?: 'Promoción') : '',
        'imagen'          => imagen_valida($p['imagen'] ?? '') ? $p['imagen'] : '',
        'kcal'            => (int) ($p['kcal'] ?? 0),
        'picante'         => !empty($p['picante']),
        'favorito'        => !empty($p['favorito']),
        'nuevo'           => $creado > time() - $config['dias_nuevo'] * 86400,
        'disponible'      => $disponible,
        'motivo'          => empty($p['disponible']) ? 'No disponible hoy' : ($falta !== null ? 'Agotado hoy' : ''),
        'orden'           => (int) ($p['orden'] ?? 99),
    ];
}

function extras_publicos(array $stock): array
{
    $res = [];
    foreach (EXTRAS as $cat => $lista) {
        foreach ($lista as $x) {
            $res[$cat][] = ['id' => $x['id'], 'nombre' => $x['nombre'], 'precio' => $x['precio'], 'disponible' => faltante($x['ing'], $stock) === null];
        }
    }
    return $res;
}

function extra_por_id(string $categoria, string $id): ?array
{
    foreach (EXTRAS[$categoria] ?? [] as $x) {
        if ($x['id'] === $id) {
            return $x;
        }
    }
    return null;
}

function mover_ingredientes(array &$ingredientes, array $consumo, int $signo): void
{
    $indice = mapa_por_id($ingredientes);
    foreach ($consumo as $ing => $cant) {
        if (isset($indice[$ing])) {
            $ingredientes[$indice[$ing]]['stock'] = max(0, (int) $ingredientes[$indice[$ing]]['stock'] + $signo * $cant);
        }
    }
}

function patrocinador_publico(array $m): array
{
    $url = (string) ($m['url'] ?? '');
    return [
        'id'      => $m['id'],
        'nombre'  => $m['nombre'],
        'simbolo' => $m['simbolo'],
        'url'     => preg_match('#^https?://[^\s"\'<>]+$#i', $url) ? $url : '',
    ];
}
