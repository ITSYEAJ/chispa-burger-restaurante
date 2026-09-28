<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    error_json(405, 'Método no permitido.');
}
if (!limitar_por_ip('seguimiento', 60, 600)) {
    error_json(429, 'Demasiadas consultas. Espera unos minutos.');
}

$numero = strtoupper((string) ($_GET['numero'] ?? ''));
$codigo = strtoupper((string) ($_GET['codigo'] ?? ''));
if (!preg_match('/^CH-\d{4,6}$/', $numero) || !preg_match('/^[A-F0-9]{6}$/', $codigo)) {
    error_json(422, 'Revisa el número y el código.');
}

$pedidos = leer_json('pedidos', []);
$pedido = null;
foreach ($pedidos as $p) {
    if ($p['numero'] === $numero) {
        $pedido = $p;
        break;
    }
}
if (!$pedido || !hash_equals((string) $pedido['codigo'], $codigo)) {
    usleep(200000);
    error_json(404, 'No encontramos un pedido con ese número y código.');
}

$delante = 0;
if (in_array($pedido['estado'], ACTIVOS, true)) {
    foreach ($pedidos as $p) {
        if (in_array($p['estado'], ACTIVOS, true) && $p['listo_estimado'] < $pedido['listo_estimado']) {
            $delante++;
        }
    }
}
$ultimo = end($pedido['historial']);

responder(200, [
    'ok'             => true,
    'numero'         => $pedido['numero'],
    'estado'         => $pedido['estado'],
    'tipo'           => $pedido['tipo'],
    'listo_estimado' => $pedido['listo_estimado'],
    'delante'        => $delante,
    'actualizado'    => $ultimo ? $ultimo['fecha'] : $pedido['fecha'],
]);
