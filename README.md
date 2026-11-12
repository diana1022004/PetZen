# 🐾 PetZen — App web + servidor

App integradora para el cuidado de mascotas con control de un comedero inteligente.
Servidor en **Node.js sin dependencias** (no hay `npm install`) + app web responsive.

## Cómo correrla (VS Code)
1. Instala **Node.js 18 o superior** (https://nodejs.org) — verifica con `node -v`.
2. En VS Code: *Archivo → Abrir carpeta…* → elige `petzen-app`.
3. Abre la terminal (`Ctrl + ñ`) y ejecuta:
   ```
   node server.js
   ```
4. Abre en el navegador:
   - **http://localhost:3000** → página web publicitaria (landing). Tiene un **código QR** que lleva a la app.
   - **http://localhost:3000/app/** → la app. Crea una cuenta, agrega tu mascota y listo.
   (Otro puerto: `PORT=4000 node server.js`; en Windows PowerShell: `$env:PORT=4000; node server.js`)

## Qué hace
- **Zen**, el perrito guía animado: te explica cada sección (tócalo para otro consejo).
- Registro / login reales (contraseña cifrada con scrypt, sesión con token firmado) y consentimiento de datos (Ley 1581/2012).
- **Mascotas** con razas por opciones (o criollo/mestizo), sexo, fecha de nacimiento y edad en años enteros, tamaño, color y tipo de pelaje, temperamento, características particulares, alergias, enfermedades, medicamentos, historia clínica, observaciones del veterinario, última vacuna y desparasitación, microchip y veterinario habitual.
- **Ficha de la mascota**: datos, historia clínica y carnet de vacunas (subes PDF o imagen, máx. 6 MB).
- **Alimentación**: ración diaria estimada y horarios automáticos (hora de Colombia).
- **Comedero**: dispensar ahora, estado en línea, nivel de alimento, historial y comedero virtual para probar sin el aparato.
- **Salud**: citas, recordatorios con agenda ordenada (vencidos, hoy, esta semana) y **Urgencias**: qué es una urgencia, señales, botón para llamar a tu veterinaria 24/7 y, si no es urgencia, el **formulario para agendar la cita** (mascota, resumen médico, servicio, día y hora libre) con "Agregar al carrito" o "Agendar y pagar".
- **Tiendas aliadas**: PetZen Oficial, SuperMasc (comida, ropa, juguetes, accesorios e higiene), Clínica Veterinaria y Spa Canino, con más de 40 productos y servicios, **búsqueda, filtro de precio (rangos o mín/máx) y orden**. Una barra de carrito siempre visible lleva al carrito con un clic.
- **Carrito** agrupado por tienda y **pago en otra pantalla con pasos**: para productos pide dirección, día y franja de entrega; para citas elige día y hora libres y comparte tu ficha con el aliado si lo autorizas. Al pagar, el carrito se vacía.
- **Mis pedidos**: cada pedido con su número (PED-…), estado (confirmado, preparando, en camino, entregado según la fecha de entrega) y las citas con su código (CITA-…).
- **Historial de actividad**: todo lo que hace el usuario (cuenta, mascotas, documentos, comedero, recordatorios, citas, pedidos), con filtros.
- **Descargar tus datos** en Word (.docx) o Excel (.xlsx).
- Cupón `PRIMERA10`, tema claro/oscuro y diseño para celular.

## Estructura
```
petzen-app/
├─ server.js        ← API REST + servidor de archivos (toda la lógica del backend)
├─ data/db.json     ← base de datos (se crea sola; bórrala para reiniciar)
├─ data/uploads/    ← documentos que suben los usuarios
├─ site/            ← página web publicitaria (index.html, css, js/qr.js, qr-tool.html)
├─ public/          ← app web (index.html, css/app.css, js/app.js, img/)
└─ firmware/        ← ejemplo de código para el ESP32 (sin probar en hardware)
```

## Página web y QR
- La landing se sirve en `/` y la app en `/app/`. El QR de la sección «Abre la app» se genera solo con la dirección donde esté publicada (`/app/`), así que funciona en localhost o en cualquier hosting.
- Para fijar otra dirección, en `site/index.html` cambia `window.PETZEN_APP_URL = '';` por tu URL, por ejemplo `'https://app.petzen.com'`.
- `site/qr-tool.html` (ábrelo en el navegador): escribe una URL, ve el QR y descárgalo en PNG. Úsalo para el QR del brochure (por defecto `https://www.petzen.com`).
- Para que el QR sirva desde un celular real, la app debe estar publicada en internet (un `localhost` solo existe en tu computador).

## API del comedero (ESP32)
Cada usuario tiene una `deviceKey` (la ves en la pantalla *Comedero*).
- `GET  /api/device/poll?key=KEY&level=70&fw=1.0` → `{}` o `{ "id": "...", "grams": 80 }`
- `POST /api/device/ack?key=KEY` con `{ "id": "...", "ok": true }` → confirma que dispensó.
Una orden que el comedero no atiende en 2 minutos caduca y queda como "No entregada".

## Importante
- GitHub Pages **no** sirve para esta app (solo aloja archivos estáticos). Para publicarla necesitas un hosting con Node.js (Render, Railway, Fly.io…).
- La base de datos es un archivo JSON: suficiente para el prototipo y una sustentación; para producción conviene PostgreSQL/MySQL.
- Los pagos y el estado de los pedidos son una simulación del flujo (no hay pasarela ni logística reales). Los textos legales son de apoyo académico; un abogado debe revisarlos antes de operar comercialmente.
