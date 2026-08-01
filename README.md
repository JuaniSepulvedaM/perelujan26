# Camino a Luján — v2

Rediseño completo de la app de control de peregrinos, escaneo por paradas,
estadísticas y mochilas para la Peregrinación a Luján. Funciona sin conexión,
es instalable como app (PWA), y está organizada en módulos en vez de un único
archivo HTML.

## Estado del proyecto

Las 7 entregas están escritas y el código pasó validación automática de
sintaxis, rutas de importación y referencias de IDs. **Lo que no pude hacer
desde acá es probarla tocando la pantalla de un celular real** (cámara,
GitHub, etc.) — por eso te recomiendo el plan de prueba de abajo antes de
usarla el día de la peregrinación.

- [x] Entrega 1 — Interfaz nueva, arquitectura, navegación inferior, modo oscuro.
- [x] Entrega 2 — Registro completo (blancos, Excel, asignar, imprimir).
- [x] Entrega 3 — Escáner QR con confirmación grande (✅/⚠️/❌).
- [x] Entrega 4 — Estadísticas con barras de progreso y embudo.
- [x] Entrega 5 — Mochilas con tarjetas visuales y botón grande de entrega.
- [x] Entrega 6 — Sincronización con GitHub (fotos individuales, auto-sync, reintento de conflictos).
- [x] Entrega 7 — PWA (manifest + Service Worker + íconos) integrada desde la Entrega 1.

**`peregrinacion.html` (v1) no se tocó y sigue funcionando** — usalo como
respaldo hasta que hayas probado esta versión a fondo.

## Plan de prueba recomendado antes de usarla en serio

1. Publicala en GitHub Pages (pasos abajo) y abrila en un celular real.
2. Configuración (⚙️) → cargá tu repositorio y, si vas a subir cambios, tu token.
3. Registro → generá 2-3 credenciales de prueba, asignales nombre y foto,
   subilas a GitHub.
4. Escaneo → bajá la lista, elegí una parada, escaneá las credenciales de
   prueba (imprimilas o mostralas en otra pantalla).
5. Mochilas → probá guardar una con y sin foto, buscarla, y entregarla.
6. Estadísticas → traé todo desde GitHub y confirmá que los números cierran.
7. Recién ahí, borrá los datos de prueba y cargá la lista real.

## Estructura

```
CaminoALujan/
├── index.html              # shell de la app: header, vistas, navegación inferior
├── manifest.json           # metadata de instalación como PWA
├── service-worker.js       # cachea el cascarón de la app para uso offline
├── assets/
│   ├── css/
│   │   ├── styles.css      # sistema de diseño (tema claro, base de todo)
│   │   └── dark.css        # overrides del tema oscuro
│   └── js/
│       ├── app.js          # arranque: registra módulos y navegación
│       ├── ui.js           # navegación entre vistas, tema, indicador de sync
│       ├── storage.js      # ajustes (localStorage) + estado en memoria compartido
│       ├── utils.js        # funciones chicas reutilizables
│       ├── camera.js       # helper de cámara + lectura de QR (jsQR)
│       └── vendor/         # librerías de terceros sin bundler (jsQR, qrcode, xlsx)
├── modules/
│   ├── registro.js         # generar credenciales, Excel, asignar, imprimir
│   ├── scanner.js          # cámara, confirmación grande, control por parada
│   ├── estadisticas.js     # embudo, tiempos, tabla, CSV
│   ├── mochilas.js         # guardar/buscar/entregar mochilas
│   └── github.js           # sincronización (config vive en ⚙️ Configuración)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

Todos los módulos comparten un mismo estado en memoria (`assets/js/storage.js
→ state`), así que si un mismo celular hace de Registro y de Escaneo a la vez,
ambos ven los mismos peregrinos sin tener que sincronizar entre pestañas.

## Cómo publicarlo (GitHub Pages)

1. Subí toda la carpeta `CaminoALujan/` a la raíz de tu repositorio,
   respetando la estructura de carpetas tal cual está.
2. En GitHub: **Settings → Pages** → Branch `main`, carpeta `/ (root)`.
3. Esperá un minuto y entrá a `https://tuusuario.github.io/turepo/`.
4. Abrilo una vez con conexión — así el Service Worker guarda una copia local
   del cascarón de la app para poder abrirla después sin señal.
5. Desde el navegador del celular podés "Agregar a la pantalla de inicio".

## Notas técnicas

- Los archivos propios usan **módulos ES nativos** (`import`/`export`), sin
  empaquetador — necesita servirse por `https://` (GitHub Pages ya lo hace),
  no funciona abriendo `index.html` como archivo local (`file://`).
- Las librerías de terceros (`vendor/jsqr.js`, `vendor/qrcode.js`,
  `vendor/xlsx.js`) se cargan como `<script>` clásicos (no son módulos) y
  quedan disponibles como `window.jsQR`, `window.qrcode` y `window.XLSX`.
- El `Service Worker` cachea únicamente los archivos propios de la app.
  **Nunca** cachea llamadas a la API de GitHub, así los datos siempre son los
  más nuevos disponibles. Si volvés a subir archivos actualizados, subí el
  número de `CACHE_NAME` en `service-worker.js` (ej. `camino-lujan-v3`) para
  que los celulares descarten la versión vieja cacheada.
- El token de GitHub vive solo en memoria del navegador (input en
  Configuración) — nunca se guarda en disco ni en el código.

## Sincronización automática y multi-dispositivo (importante)

- **No hay botones de "Bajar"/"Subir" en ninguna pantalla principal.** Todo pasa
  solo: se trae la información al entrar, se sube apenas hacés un cambio, y se
  reintenta solo si no había señal. El único control manual es
  **⚙️ Configuración → 🔄 Forzar sincronización ahora**, pensado solo para
  destrabar algo puntual, no para el uso normal.
- **Dos celulares en la misma parada (o dos puestos de mochilas) nunca se pisan.**
  Cada celular escribe únicamente su propio archivo (identificado con un ID
  interno que se genera solo la primera vez), dentro de una carpeta compartida
  por parada (`registros/parada_1/`, `registros/parada_2/`, etc.) o por tipo
  (`mochilas/`, `retiros/`). La app combina automáticamente todos los archivos
  de esa carpeta cada ~20 segundos y apenas vuelve la conexión, sumando lo que
  registró cada celular sin perder nada de ninguno de los dos.
- Esto significa que si estuvieron offline en momentos distintos, al recuperar
  señal cada uno sube lo suyo y ambos terminan viendo la información combinada
  de los dos, sola, sin que nadie tenga que hacer nada.
- **Excepción, para que quede claro:** la *lista de peregrinos* (nombres/fotos)
  sigue viviendo en un solo archivo compartido (`peregrinos.json`). Si dos
  celulares generan credenciales nuevas al mismo tiempo, se suman sin problema
  (se combinan solas). Pero si dos celulares editan **el mismo** peregrino
  (mismo número) casi al mismo tiempo, gana la última edición que se subió —
  no hay una fusión campo por campo para ese caso puntual. En la práctica esto
  rara vez pasa porque normalmente una sola persona/celular hace el Registro.

