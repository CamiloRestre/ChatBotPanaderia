// server.js
// Punto de entrada del proyecto. Aquí se levanta el servidor web que Meta
// (WhatsApp Cloud API) usa para mandarle los mensajes al bot, y desde donde
// el bot responde.

import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "./services/conversation.js";

dotenv.config({ override: true });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "cambia_este_token";

// Chequeo rápido para saber que el servidor está vivo.
app.get("/", (req, res) => {
  res.send("Bot de la panadería funcionando ✅");
});

// Ruta de Health Check para UptimeRobot
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});
//prueba
// Endpoint para webhooks externos de Make (por ejemplo, Google Sheets, Telegram, CRM, etc.)
app.post("/make", async (req, res) => {
  const payload = req.body || {};
  console.log("📥 Webhook de Make recibido:", JSON.stringify(payload));

  try {
    const messageSource =
      payload.messages?.[0]?.text?.body ??
      payload.message ??
      payload.text ??
      payload.body ??
      payload?.data?.message ??
      payload?.data?.text;

    const phone =
      payload.messages?.[0]?.from ??
      payload.phone ??
      payload.from ??
      payload?.data?.from;

    if (!messageSource || !String(messageSource).trim()) {
      return res.status(400).json({ ok: false, error: "No hay mensaje" });
    }

    if (!phone) {
      return res.status(400).json({ ok: false, error: "No hay número de remitente" });
    }

    // Procesar el mensaje con la lógica del bot.
    // Este paso puede devolver un objeto de la API de Meta al enviar por WhatsApp,
    // pero para Make necesitamos devolver siempre un texto plano.
    const botResult = await handleIncomingMessage(phone, String(messageSource));

    const respuesta = typeof botResult === "string"
      ? botResult
      : (botResult && typeof botResult === "object")
        ? "Mensaje recibido y procesado correctamente."
        : "Lo siento, no encontré información sobre eso.";

    return res.status(200).json({
      ok: true,
      respuesta
    });
  } catch (error) {
    console.error("❌ Error procesando el mensaje:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno",
      respuesta: "Hubo un error procesando tu mensaje. Intenta de nuevo."
    });
  }
});

// Endpoint para integraciones o callbacks de Render.
app.post("/render", (req, res) => {
  const payload = req.body || {};
  console.log("📥 Evento de Render recibido:", JSON.stringify(payload));

  return res.status(200).json({
    ok: true,
    message: "Evento de Render recibido correctamente",
    receivedAt: new Date().toISOString()
  });
});

app.get("/privacidad", (req, res) => {
  res.type("html").send(`
    <h1>Política de Privacidad — Bot Panadería Molinos</h1>
    <p>Este chatbot de WhatsApp usa la información que nos compartes
    (nombre, número de teléfono, dirección y detalles del pedido)
    únicamente para gestionar tu pedido y comunicarnos contigo.</p>
    <p>No compartimos tus datos con terceros distintos a los necesarios
    para procesar el pedido (por ejemplo, herramientas internas de
    automatización). No usamos tu información con fines publicitarios.</p>
    <p>Puedes solicitar la eliminación de tus datos escribiéndonos
    directamente por este mismo chat.</p>
    <p>Contacto: camiloproyectos14@gmail.com</p>
  `);
});

// META llama a esta ruta UNA VEZ, cuando configuras el webhook.
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// META llama a esta ruta CADA VEZ que un cliente le escribe.
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.find((item) => item?.type === "text");

    if (!message?.text?.body) return;

    const phone = message.from;
    const text = message.text.body;

    if (!text || !String(text).trim()) return;

    await handleIncomingMessage(phone, text);
  } catch (error) {
    console.error("❌ Error procesando el mensaje entrante:", error);
  }
});

app.listen(PORT, () => {
  console.log(`🥐 Bot de la panadería escuchando en el puerto ${PORT}`);
});