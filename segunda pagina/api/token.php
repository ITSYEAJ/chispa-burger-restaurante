<?php

declare(strict_types=1);
require __DIR__ . '/_seguridad.php';

iniciar_sesion();

if (empty($_SESSION['token'])) {
    $_SESSION['token'] = bin2hex(random_bytes(32));
}
$_SESSION['token_hora'] = time();

responder(200, ['token' => $_SESSION['token']]);
