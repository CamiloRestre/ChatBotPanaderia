# Bot de WhatsApp para Panadería Molinos

Bot personal de WhatsApp para atender clientes de la panadería: muestra el
menú, responde preguntas frecuentes, guía el pedido a domicilio y puede usar
Gemini como respaldo para preguntas libres.

El bot usa la API oficial de **WhatsApp Cloud API** y está preparado para
ejecutarse en Render.

## Qué hace

- Responde mensajes recibidos por el webhook de WhatsApp.
- Muestra productos, precios, horarios y medios de pago.
- Guía al cliente durante el pedido.
- Valida barrios y datos de domicilio.
- Puede enviar pedidos o solicitudes de atención humana a Make.
- Usa Gemini de forma opcional cuando el flujo normal no encuentra una
  respuesta.
- Expone endpoints de salud y privacidad para el despliegue.

## Estructura

```text
.
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
├── scripts/
│   └── validate-menu.js
├── services/
└── src/
    ├── server.js                 # Servidor Express y endpoints
    ├── config/
    │   ├── googleMaps.js         # Configuración de Google Maps
    │   └── whatsapp.js           # Envío de mensajes a WhatsApp
    ├── data/
    │   ├── domicilio.js          # Barrios y reglas de domicilio
    │   ├── menu_whatsapp_molinos.json
    │   └── products.js            # Productos y precios
    └── services/
        ├── ai.js                 # Respaldo opcional con Gemini
        ├── conversation.js        # Flujo principal de conversación
        └── notify.js             # Notificaciones opcionales a Make
```

Los archivos `payload-*.json`, scripts de prueba y `.env` son archivos locales
de trabajo y no forman parte del código que se despliega.

## Requisitos

- Node.js 18 o superior.
- Una aplicación de Meta con WhatsApp Cloud API para recibir mensajes reales.
- Una cuenta de Render si se quiere publicar el bot.
- Gemini y Google Maps son opcionales.

## Instalación local

```bash
git clone https://github.com/CamiloRestre/ChatBotPanaderia.git
cd ChatBotPanaderia
npm install
npm start
```

El servidor usa el puerto `3000` por defecto. Para cambiarlo:

```bash
PORT=8080 npm start
```

En Windows PowerShell:

```powershell
$env:PORT = "8080"
npm start
```

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto. No lo subas a GitHub.

```dotenv
PORT=3000

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TOKEN=
WHATSAPP_VERIFY_TOKEN=

# IA opcional
GEMINI_API_KEY=

# Google Maps opcional
GOOGLE_MAPS_API_KEY=

# Datos de la panadería
BAKERY_NAME=Panaderia Molinos
BAKERY_ADDRESS=
HUMAN_ATTENTION_SCHEDULE=7:00 a.m. a 7:00 p.m.

# Pagos
PAYMENT_BANK=Nequi
PAYMENT_ACCOUNT_NUMBER=
PAYMENT_HOLDER_NAME=

# Horario del bot
BOT_ONLY_NIGHT=false
BOT_TIMEZONE=America/Bogota
BOT_START_TIME=07:00
BOT_END_TIME=19:00

# Notificaciones opcionales
MAKE_WEBHOOK_URL=
```

`WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` son necesarios para enviar
respuestas a WhatsApp. `WHATSAPP_VERIFY_TOKEN` debe coincidir exactamente con
el token configurado en Meta.

Si `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY` o `MAKE_WEBHOOK_URL` están vacías,
esas integraciones se desactivan y el flujo principal sigue funcionando.

## Configurar el webhook de Meta

Después de desplegar el bot, configura en Meta:

- **Callback URL:** `https://TU-SERVICIO.onrender.com/webhook`
- **Verify token:** el mismo valor de `WHATSAPP_VERIFY_TOKEN`
- **Suscripción:** `messages`

Endpoints principales:

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/` | Estado básico del servicio |
| `GET` | `/health` | Health check |
| `GET` | `/webhook` | Verificación de Meta |
| `POST` | `/webhook` | Mensajes entrantes de WhatsApp |
| `GET` | `/privacidad` | Página de privacidad |
| `POST` | `/make` | Recepción de eventos desde Make |
| `POST` | `/render` | Endpoint auxiliar para Render |

## Desplegar en Render

1. Crea un **Web Service** conectado a este repositorio.
2. Usa la rama `devs` si quieres desplegar la versión de producción actual.
3. Configura:

   ```text
   Build Command: npm install
   Start Command: npm start
   ```

4. Agrega las variables de entorno en **Environment** de Render.
5. Copia la URL pública de Render y úsala como `Callback URL` en Meta.
6. Verifica que `https://TU-SERVICIO.onrender.com/health` responda
   correctamente.

No pongas tokens en el código ni en el repositorio. Si un token se filtra,
revócalo y genera uno nuevo antes de actualizar Render.

## Validar el menú

El proyecto incluye un validador para detectar errores en el catálogo:

```bash
npm run validate:menu
```

Ejecuta esta validación después de modificar los productos o precios.

## Personalizar el bot

- **Productos y precios:** `src/data/products.js`
- **Barrios y domicilios:** `src/data/domicilio.js`
- **Menú estructurado:** `src/data/menu_whatsapp_molinos.json`
- **Flujo, mensajes y horarios:** `src/services/conversation.js`
- **Respuestas de Gemini:** `src/services/ai.js`
- **Envío de mensajes a WhatsApp:** `src/config/whatsapp.js`
- **Notificaciones a Make:** `src/services/notify.js`

Después de cambiar el menú, ejecuta:

```bash
npm run validate:menu
```

## Seguridad y Git

El `.gitignore` excluye credenciales, payloads, logs, scripts de prueba y
archivos temporales. El archivo `.env.example` puede conservarse localmente
como referencia, pero no debe contener secretos reales.

Para revisar qué archivos están rastreados:

```bash
git ls-files
```

Para comprobar que no se está rastreando el entorno local:

```bash
git check-ignore -v .env .env.example
```

## Licencia

Proyecto personal de uso privado. No incluye una licencia de redistribución.
