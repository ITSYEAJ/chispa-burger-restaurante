<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    error_json(405, 'Método no permitido.');
}

responder(200, ['ok' => true] + estado_cocina(leer_json('pedidos', []), config(), leer_json('platos', [])));
