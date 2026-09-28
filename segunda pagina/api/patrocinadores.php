<?php
declare(strict_types=1);
require __DIR__ . '/_negocio.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    error_json(405, 'Método no permitido.');
}

$lista = array_values(array_filter(leer_json('patrocinadores', []), fn($m) => !empty($m['activo']) && in_array($m['simbolo'] ?? '', SIMBOLOS, true)));
usort($lista, fn($a, $b) => ($a['orden'] ?? 99) <=> ($b['orden'] ?? 99));

responder(200, ['ok' => true, 'patrocinadores' => array_map('patrocinador_publico', $lista)]);
