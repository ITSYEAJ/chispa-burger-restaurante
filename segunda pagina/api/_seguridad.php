<?php

declare(strict_types=1);

const RUTA_DATOS   = __DIR__ . '/../data';
const RUTA_SUBIDAS = __DIR__ . '/../uploads/platos';
const SAL_IP       = 'cambia-esta-frase-en-produccion';

date_default_timezone_set('America/Mexico_City');

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('chispa_sid');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure'   => !empty($_SERVER['HTTPS']),
        ]);
        session_start();
    }
}

function responder(int $codigo, array $datos): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function error_json(int $codigo, string $mensaje, array $extra = []): void
{
    responder($codigo, ['ok' => false, 'mensaje' => $mensaje] + $extra);
}

function solo_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        error_json(405, 'Método no permitido.');
    }
}

function verificar_origen(): void
{
    $origen = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
    if ($origen === '') {
        return;
    }
    $host   = parse_url($origen, PHP_URL_HOST);
    $propio = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
    if (!$host || !hash_equals((string) $propio, (string) $host)) {
        error_json(403, 'Origen no permitido.');
    }
}

function verificar_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['token'] ?? '');
    if (empty($_SESSION['token']) || !is_string($token) || !hash_equals($_SESSION['token'], $token)) {
        error_json(403, 'La sesión expiró. Recarga la página e inténtalo otra vez.');
    }
}

function entrada(): array
{
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($tipo, 'application/json')) {
        $crudo = file_get_contents('php://input', false, null, 0, 200000);
        $datos = json_decode($crudo ?: '', true);
        return is_array($datos) ? $datos : [];
    }
    return $_POST;
}

function es_local(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

function requerir_admin(): void
{
    $inactivo = time() - (int) ($_SESSION['admin_actividad'] ?? 0);
    if (empty($_SESSION['admin']) || $inactivo > 7200) {
        unset($_SESSION['admin']);
        error_json(401, 'Tu sesión terminó. Vuelve a entrar.', ['sesion' => false]);
    }
    $_SESSION['admin_actividad'] = time();
}

function limpiar($texto, int $max): string
{
    $texto = strip_tags(is_scalar($texto) ? (string) $texto : '');
    $texto = preg_replace('/[\x00-\x1F\x7F]/u', '', $texto) ?? '';
    return mb_substr(trim($texto), 0, $max);
}

function seguro_para_csv(string $valor): string
{
    return preg_match('/^[=+\-@\t\r]/', $valor) ? "'" . $valor : $valor;
}

function ip_anonima(): string
{
    return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . SAL_IP), 0, 16);
}

function nuevo_id(string $prefijo): string
{
    return $prefijo . bin2hex(random_bytes(5));
}

function ruta_dato(string $nombre): string
{
    return RUTA_DATOS . '/' . $nombre . '.json';
}

function leer_json(string $nombre, array $defecto = []): array
{
    $ruta = ruta_dato($nombre);
    if (!is_file($ruta)) {
        return $defecto;
    }
    $datos = json_decode((string) file_get_contents($ruta), true);
    return is_array($datos) ? $datos : $defecto;
}

function guardar_json(string $nombre, array $datos): void
{
    $tmp = ruta_dato($nombre) . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    rename($tmp, ruta_dato($nombre));
}

function con_bloqueo(callable $fn)
{
    $fp = fopen(RUTA_DATOS . '/.bloqueo', 'c');
    flock($fp, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function limitar_por_ip(string $grupo, int $max, int $ventana): bool
{
    return con_bloqueo(function () use ($grupo, $max, $ventana) {
        $registro = leer_json('limites', []);
        $ahora = time();
        $clave = $grupo . ':' . ip_anonima();

        foreach ($registro as $k => $marcas) {
            $registro[$k] = array_values(array_filter($marcas, fn($t) => $t > $ahora - $ventana));
            if (!$registro[$k]) {
                unset($registro[$k]);
            }
        }
        $permitido = count($registro[$clave] ?? []) < $max;
        if ($permitido) {
            $registro[$clave][] = $ahora;
        }
        guardar_json('limites', $registro);
        return $permitido;
    });
}
