# Bot de WhatsApp — Panadería Molinos

Bot de WhatsApp creado para **Panadería Molinos**.

## ¿Qué puede hacer?

- Mostrar el menú y los precios.
- Responder preguntas frecuentes.
- Informar horarios y opciones de pago.
- Recibir pedidos a domicilio.
- Consultar barrios y datos de entrega.
- Derivar conversaciones a atención humana.
- Responder preguntas libres con ayuda de IA.

El bot combina respuestas programadas con inteligencia artificial para ofrecer
una atención rápida y sencilla a los clientes de la panadería.

## Estado

Proyecto personal en producción.

## Tecnologías

- Node.js
- WhatsApp Cloud API
- Google Gemini
- Render

## Autor

Proyecto desarrollado para Panadería Molinos.

## Impresión automática de comandas a domicilio

La cola de impresión usa el flujo `Make -> Render -> agente Windows -> impresora
USB`. Render nunca intenta acceder a la impresora local: el agente consulta la
cola cada cinco segundos y confirma cada pedido solo después de imprimirlo.

### 1. Configurar el servidor en Render

1. En Render crea o usa el servicio Web existente apuntando a este repositorio.
   El comando de inicio es `npm start`.
2. Agrega las variables `API_TOKEN` y `ORDERS_DATA_DIR` en Environment. Usa un
   token largo y aleatorio; el mismo token se usará en Make y en Windows.
3. Para no perder la cola cuando el servicio se reinicie, agrega un Persistent
   Disk de Render montado en `/var/data` y configura
   `ORDERS_DATA_DIR=/var/data`. Sin un disco persistente, el archivo local de
   Render puede desaparecer al reiniciar o desplegar.
4. El endpoint público será, por ejemplo,
   `https://panaderia-bot.onrender.com`.

Los tres endpoints requieren `Authorization: Bearer <API_TOKEN>`:

- `POST /pedidos` crea un pedido en estado `pendiente`.
- `GET /pedidos/pendientes` devuelve los pedidos pendientes.
- `POST /pedidos/:id/impreso` cambia el estado a `impreso`.

### 2. Configurar Make

Al finalizar el pedido, agrega un módulo **HTTP > Make a request**:

- **URL:** `https://panaderia-bot.onrender.com/pedidos`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer EL_MISMO_API_TOKEN` y
  `Content-Type: application/json`
- **Body type:** `Raw`, `JSON (application/json)`
- **Body:**

```json
{
  "numero": "{{numero_pedido}}",
  "fecha": "{{fecha_y_hora}}",
  "cliente": "{{cliente}}",
  "telefono": "{{telefono}}",
  "direccion": "{{direccion}}",
  "referencia": "{{referencia}}",
  "productos": [
    { "cantidad": "{{cantidad_1}}", "nombre": "{{producto_1}}" }
  ],
  "notas": "{{notas}}",
  "metodo_pago": "{{metodo_pago}}",
  "total": "{{total}}",
  "paga_con": "{{paga_con}}"
}
```

Reemplaza cada marcador por el campo correspondiente del módulo anterior. Si
hay varios productos, agrega un objeto por producto. El `numero` debe ser
estable para poder rastrear el pedido.

### 3. Instalar el agente en Windows

En el computador conectado a la POS-58:

```powershell
cd "C:\Panaderia\printer"
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

Edita `.env` y conserva exactamente `PRINTER_NAME=IMPRESORA DOMICILIOS`; no se
usa la impresora predeterminada. Verifica el nombre en **Configuración >
Bluetooth y dispositivos > Impresoras y escáneres**. Ejecuta una prueba manual:

```powershell
.\.venv\Scripts\python.exe print_agent.py
```

El agente guarda sus confirmaciones en `PRINT_STATE_FILE`. Si una impresión ya
terminó pero falla Internet antes de confirmar en Render, la conserva en ese
archivo y reintenta solo la confirmación, evitando imprimirla de nuevo. Si la
impresora falla antes de completar el trabajo, el pedido no se confirma.

Para iniciar automáticamente, usa **Programador de tareas**:

1. Crear tarea (no solo tarea básica), marcar “Ejecutar tanto si el usuario
   inició sesión como si no” y “Ejecutar con los privilegios más altos”.
2. Desencadenador: “Al iniciar el equipo” o “Al iniciar sesión”.
3. Acción “Iniciar un programa”:
   - Programa:
     `C:\Panaderia\printer\.venv\Scripts\python.exe`
   - Argumentos: `C:\Panaderia\printer\print_agent.py`
   - Iniciar en: `C:\Panaderia\printer`
4. En Configuración, habilita reintento cada 1 minuto si la tarea falla.

También se puede crear un acceso directo al mismo comando en
`shell:startup`, pero el Programador de tareas es más confiable para equipos
que reinician automáticamente.

### 4. Pedido de prueba

Después de desplegar Render, ejecuta desde PowerShell o cualquier equipo con
acceso a Internet:

```powershell
$body = @{
  numero = "PRUEBA-001"
  fecha = "2026-10-09T21:12:00-05:00"
  cliente = "Ana Pérez"
  telefono = "3001234567"
  direccion = "Cra 28 A #11B-18"
  referencia = "Frente al parque"
  productos = @(
    @{ cantidad = 2; nombre = "Pan de bono grande con nombre muy largo" },
    @{ cantidad = 1; nombre = "Chocolate caliente" }
  )
  notas = "Tocar el timbre"
  metodo_pago = "Efectivo"
  total = 18000
  paga_con = 20000
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "https://panaderia-bot.onrender.com/pedidos" `
  -Method Post `
  -Headers @{ Authorization = "Bearer EL_MISMO_API_TOKEN" } `
  -ContentType "application/json" `
  -Body $body
```

La misma prueba con `curl`:

```bash
curl -X POST "https://panaderia-bot.onrender.com/pedidos" \
  -H "Authorization: Bearer EL_MISMO_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "numero": "PRUEBA-001",
    "fecha": "2026-10-09T21:12:00-05:00",
    "cliente": "Ana Pérez",
    "telefono": "3001234567",
    "direccion": "Cra 28 A #11B-18",
    "referencia": "Frente al parque",
    "productos": [
      {"cantidad": 2, "nombre": "Pan de bono grande con nombre muy largo"},
      {"cantidad": 1, "nombre": "Chocolate caliente"}
    ],
    "notas": "Tocar el timbre",
    "metodo_pago": "Efectivo",
    "total": 18000,
    "paga_con": 20000
  }'
```

El agente debe imprimir la comanda en `IMPRESORA DOMICILIOS` y luego el pedido
dejará de aparecer en `GET /pedidos/pendientes`. La salida usa ESC/POS RAW,
32 caracteres por línea, codificación `cp850`, negrita, centrado y comando de
corte; si la POS-58 no tiene cortador, las cuatro líneas finales sirven como
separación.
