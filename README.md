## Funcionalidades

### Sitio para clientes (`public/`)

- **Menú dinámico** con categorías, buscador, platillos favoritos y etiquetas de *Nuevo*, *Picante* y *Agotado*.
- **Personalización de platillos**: extras con precio, ingredientes que se pueden quitar y notas para la cocina.
- **Carrito persistente** con cálculo de envío y aviso de cuánto falta para el envío gratis.
- **Pedidos por turnos de 15 minutos**: el cliente elige entre *lo antes posible* o un turno programado. Los turnos llenos se bloquean y los pedidos inmediatos pasan solos al siguiente turno libre.
- **Tiempo de espera en vivo**, calculado con los pedidos que hay en cocina y el número de cocineros en turno.
- **Seguimiento del pedido** con número y código privado, y una línea de tiempo del estado.
- **Promociones por horario** que se activan y se desactivan solas.
- Carrusel de patrocinadores, horario y ubicación.

### Panel de administración (`admin/`)

- **Resumen del día**: indicadores, gráfico de pedidos por hora, platillos más vendidos de los últimos 7 días y alertas automáticas.
- **Pantalla de cocina** tipo tablero (Recibidos → En la plancha → Listos) con cronómetros y pedidos atrasados marcados en rojo.
- **Gestión de pedidos** con filtros por estado y exportación a CSV.
- **Editor de menú**: fotos (de la biblioteca o subidas), receta por porción, promociones por día y hora, y visibilidad.
- **Inventario conectado al menú**: cada pedido descuenta sus ingredientes. Si uno se acaba, los platillos que lo usan se marcan agotados, y vuelven a la venta al reponerlo. Cancelar un pedido devuelve los ingredientes.
- **Automatizaciones configurables**: capacidad por turno, tiempos de preparación y entrega, costo de envío, pedido mínimo y horario semanal.
- Modo claro y oscuro.

## Seguridad

- Protección CSRF con token por sesión y verificación de origen en las peticiones POST.
- Contraseña del administrador guardada con `password_hash`. La cuenta solo se puede crear desde el mismo equipo del servidor.
- Límite de intentos por IP para el inicio de sesión y para los pedidos, más un campo trampa contra bots.
- Sesión con cookies `HttpOnly` y `SameSite=Strict`, que se cierra tras 2 horas sin actividad.
- Precios, stock y turnos validados de nuevo en el servidor: no se confía en lo que envía el navegador.
- Escritura atómica de los JSON con bloqueo de archivo para evitar pedidos duplicados o inventario inconsistente.
- Subida de imágenes validada por tipo real y tamaño, guardadas con nombre aleatorio en una carpeta sin ejecución de scripts.
- Encabezados de seguridad (CSP, `X-Frame-Options`, `nosniff`) y bloqueo de acceso directo a `data/`.
- Exportación a CSV protegida contra inyección de fórmulas.

## Tecnologías

| Capa | Herramientas |
| --- | --- |
| Frontend | HTML5, CSS3 y JavaScript sin frameworks (Canvas, `<dialog>`, IntersectionObserver) |
| Backend | PHP 8 |
| Datos | Archivos JSON |
| Servidor | Apache con `.htaccess` (probado con Laragon) |

## Estructura

```
├── public/          Sitio para clientes
├── admin/           Panel del restaurante
├── api/             Endpoints PHP (menú, cocina, pedidos, seguimiento, admin)
├── js/              menu.js (compartido), pagina2.js (sitio), admin.js (panel), tema.js
├── css/             Estilos
├── img/             Fotos del menú y del sitio
├── data/            Datos en JSON (sin acceso público)
└── uploads/         Fotos subidas desde el panel
```

## Instalación local

1. Clona el repositorio dentro de la carpeta `www` de Laragon, XAMPP o de cualquier servidor Apache con PHP 8 o superior.
2. Comprueba que PHP pueda escribir en `data/` y `uploads/`.
3. Abre `http://localhost/<carpeta-del-proyecto>/` para entrar al sitio.
4. Abre `http://localhost/<carpeta-del-proyecto>/admin/` desde el mismo equipo para crear la cuenta de administrador (contraseña de al menos 10 caracteres).

El panel incluye pedidos de ejemplo. Se borran desde **Automatizaciones → Datos de ejemplo**.

### Antes de publicar en un servidor

- Cambia la constante `SAL_IP` en `api/_seguridad.php`.
- Ajusta la zona horaria (`America/Mexico_City`) en el mismo archivo.
- Usa HTTPS para que la cookie de sesión se marque como segura.

## Créditos

Fotografías de [Unsplash](https://unsplash.com/).
