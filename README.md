# Bot de WhatsApp — Panadería

Chatbot de WhatsApp con una base de conocimientos propia (menú, horarios,
flujo de pedido) y un respaldo de IA (Gemini) para preguntas libres.

## 1. Estructura del proyecto

```
panaderia-bot/
├── package.json        → dependencias del proyecto
├── .env.example        → plantilla de variables de entorno
├── .gitignore
├── server.js            → arranca el servidor y recibe los mensajes de Meta
├── whatsapp.js          → envía mensajes usando la API de Meta
├── notify.js            → (opcional) avisa a Make cuando hay un pedido
├── conversation.js       → EL FLUJO DEL BOT (base de conocimientos de conversación)
└── products.js           → EL MENÚ / CATÁLOGO (base de conocimientos de productos)
```

`ai.js` no se incluyó en esta lista porque ya lo tenías: solo se le cambiaron
el catálogo y el mensaje de sistema para que hable como panadería.

## 2. Instalar y probar en tu computador

1. Copia toda esta carpeta a tu proyecto en Visual Studio Code.
2. Abre una terminal dentro de la carpeta y corre:
   ```
   npm install
   ```
3. Copia `.env.example` como `.env` y rellena los datos (ver punto 3 y 4).
4. Corre el bot:
   ```
   npm start
   ```
   Verás en la terminal: `🥐 Bot de la panadería escuchando en el puerto 3000`.

Por sí solo, tu computador no es visible desde internet, así que Meta no
podrá mandarle mensajes todavía — para eso lo vas a desplegar en Render
(punto 5). Puedes probar la lógica localmente llamando a
`handleIncomingMessage("573000000000", "hola")` desde un pequeño script si
quieres, pero lo normal es probar ya desplegado.

## 3. Dónde va la API key de Gemini (gratis)

1. Entra a **https://aistudio.google.com/app/apikey** con tu cuenta de Google.
2. Crea una API key gratuita.
3. Pégala en tu archivo `.env`, en la línea:
   ```
   GEMINI_API_KEY=tu_clave_aqui
   ```
   El código nunca tiene la clave escrita directamente — siempre se lee desde
   esta variable de entorno (`ai.js` la usa con `process.env.GEMINI_API_KEY`).

Si dejas esa variable vacía, el bot sigue funcionando: simplemente nunca usa
IA y siempre se queda en el flujo de menú/carta/pedido.

## 4. Dónde va la cuenta y el código de Meta (WhatsApp)

1. Entra a **https://developers.facebook.com/** y crea una app de tipo
   "Business".
2. Agrégale el producto **WhatsApp**. Meta te da automáticamente un número
   de pruebas.
3. En la sección **API Setup** de WhatsApp vas a encontrar dos datos clave:
   - **Temporary access token** → va en `WHATSAPP_TOKEN`
   - **Phone number ID** → va en `WHATSAPP_PHONE_NUMBER_ID`
   (El token temporal dura 24 horas; cuando pases a producción real generas
   uno permanente en la misma sección, con un usuario del sistema).
4. En **Configuration → Webhook**, Meta te pide dos cosas:
   - **Callback URL**: la URL de tu servidor en Render + `/webhook`,
     por ejemplo `https://panaderia-bot.onrender.com/webhook`.
   - **Verify token**: cualquier palabra que tú inventes. Debe ser
     EXACTAMENTE la misma que pongas en `.env` como `WHATSAPP_VERIFY_TOKEN`.
   Meta llama automáticamente a `GET /webhook` (ya está implementado en
   `server.js`) para comprobar que coincide, antes de dejarte guardar.
5. Suscríbete al campo **messages** del webhook — así es como te llegan los
   mensajes de los clientes a `POST /webhook`.

Toda la lógica que recibe y responde esos mensajes ya está en `server.js` y
`whatsapp.js` — no tienes que escribir nada de eso, solo poner tus
credenciales en `.env`.

## 5. Desplegar en Render (gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. En **https://render.com**, crea un **New → Web Service** y conecta ese
   repositorio.
3. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. En la pestaña **Environment**, agrega ahí (no en el código) todas las
   variables que tienes en tu `.env` local: `GEMINI_API_KEY`,
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
   `BAKERY_NAME`, etc.
5. Al desplegar, Render te da una URL pública
   (`https://tu-servicio.onrender.com`). Esa es la que usas como
   **Callback URL** del webhook de Meta (punto 4).

Nota: en el plan gratuito de Render el servicio "se duerme" tras un rato sin
tráfico y tarda unos segundos en despertar con el primer mensaje — normal
en un plan gratuito, no es un error tuyo.

## 6. Dónde encaja Make (opcional)

No es obligatorio, pero si quieres que cada pedido también caiga en una hoja
de Google Sheets, te llegue una notificación a Telegram, etc.:

1. En Make, crea un escenario nuevo con el módulo **Webhooks → Custom webhook**.
2. Copia la URL que te da Make y pégala en `.env` como `MAKE_WEBHOOK_URL`.
3. Cada vez que un cliente completa un pedido o pide hablar con alguien,
   `notify.js` le manda automáticamente esos datos a esa URL — desde ahí armas
   en Make lo que necesites (Google Sheets, correo, Telegram, etc.).

Si dejas `MAKE_WEBHOOK_URL` vacío, esto simplemente no hace nada; el bot no
se ve afectado.

## 7. Cómo editar el menú o los textos del bot

- **Productos y precios** → edita `products.js`. Es un arreglo simple de
  `[nombre, categoría, precio, etiquetas]`.
- **Saludo, opciones del menú, horarios, mensajes fijos** → edita
  `conversation.js`. Los textos están escritos directamente ahí.
- **Cuándo usa IA en vez del flujo normal** → función `shouldUseAi` dentro
  de `conversation.js`.
# ChatBotPanaderia
