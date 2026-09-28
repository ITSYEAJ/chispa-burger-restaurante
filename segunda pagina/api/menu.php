<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    error_json(405, 'Método no permitido.');
}

$config = config();
$stock = stock_ingredientes(leer_json('ingredientes', []));
$todos = leer_json('platos', []);
$platos = [];
foreach ($todos as $p) {
    if (!empty($p['activo'])) {
        $platos[] = plato_publico($p, $stock, $config);
    }
}

responder(200, [
    'ok'     => true,
    'platos' => $platos,
    'extras' => extras_publicos($stock),
    'quitar' => QUITAR,
    'envio'  => [
        'costo'        => (float) $config['costo_envio'],
        'gratis_desde' => (float) $config['envio_gratis_desde'],
        'minimo'       => (float) $config['minimo_domicilio'],
    ],
    'cocina' => estado_cocina(leer_json('pedidos', []), $config, $todos),
]);
