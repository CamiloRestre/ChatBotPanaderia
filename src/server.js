// server.js
import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "./services/conversation.js";

dotenv.config({ override: true });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "cambia_este_token";

app.get("/", (req, res) => {
  res.send("Bot de la panaderia funcionando ✅");
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

function extractMessageContent(message) {
  if (!message) return null;

  if (message.type === "interactive" && message.interactive) {
    const reply = message.interactive.list_reply || message.interactive.button_reply;
    if (reply?.id) return reply.id;
  }

  if (message.text?.body !== undefined) {
    return message.text.body;
  }

  return null;
}

function extractInboundMessage(payload) {
  const result = extractInboundMessageInner(payload);
  console.log("EXTRACT v2 salida:", JSON.stringify(result));
  return result;
}

function extractInboundMessageInner(payload) {
  console.log("EXTRACT v2 entrada:", JSON.stringify(payload));

  // Formato plano de Make: from, type, text_body, list_id, button_id
  if (payload && typeof payload === "object" && payload.from !== undefined &&
      ("text_body" in payload || "list_id" in payload || "button_id" in payload)) {

    const clean = (v) => (typeof v === "string" ? v.trim() : "");
    const listId = clean(payload.list_id);
    const buttonId = clean(payload.button_id);
    const textBody = clean(payload.text_body);

    const command = listId || buttonId || textBody;
    const type = clean(payload.type) || ((listId || buttonId) ? "interactive" : "text");

    if (command) {
      return { phone: clean(payload.from), text: command, type };
    }
    return null;
  }

  const metaMessage = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (metaMessage) {
    return {
      phone: metaMessage.from,
      text: extractMessageContent(metaMessage),
      type: metaMessage.type || "text"
    };
  }

  const simpleMessage = payload.messages?.[0];
  const flatText = payload.text_body ?? null;
  const flatListId = payload.list_id ?? null;
  const flatButtonId = payload.button_id ?? null;
  const flatInteractiveId = flatListId || flatButtonId;
  const flatType = payload.type || (flatInteractiveId ? "interactive" : "text");
  const text =
    extractMessageContent(simpleMessage) ??
    flatText ??
    flatInteractiveId ??
    payload.message ??
    payload.text ??
    payload.body ??
    payload?.data?.message ??
    payload?.data?.text ??
    null;

  const phone =
    simpleMessage?.from ??
    payload.phone ??
    payload.from ??
    payload?.data?.from ??
    null;

  return { phone, text, type: simpleMessage?.type || flatType };
}

app.post("/make", async (req, res) => {
  const payload = req.body || {};
  console.log("📥 Webhook de Make recibido:", JSON.stringify(payload));

  try {
    const { phone, text: messageSource, type: messageType } = extractInboundMessage(payload);

    if (messageType === "text" && (!messageSource || !String(messageSource).trim())) {
      return res.status(200).json({
        ok: false,
        error: "No hay mensaje",
        respuesta: "No recibi ningun mensaje para procesar."
      });
    }

    if (!phone) {
      return res.status(200).json({
        ok: false,
        error: "No hay numero de remitente",
        respuesta: "No pude identificar el numero del remitente."
      });
    }

    const botResult = await handleIncomingMessage(phone, String(messageSource || ""), messageType);

    const respuesta = typeof botResult === "string"
      ? botResult
      : (botResult && typeof botResult === "object")
        ? "Mensaje recibido y procesado correctamente."
        : "Lo siento, no encontre informacion sobre eso.";

    return res.status(200).json({ ok: true, respuesta });
  } catch (error) {
    console.error("❌ Error procesando el mensaje:", error);
    return res.status(200).json({
      ok: false,
      error: "Error interno",
      respuesta: "Hubo un error procesando tu mensaje. Intenta de nuevo."
    });
  }
});

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
    <h1>Politica de Privacidad - Bot Panaderia Molinos</h1>
    <p>Este chatbot de WhatsApp usa la informacion que nos compartes
    (nombre, numero de telefono, direccion y detalles del pedido)
    unicamente para gestionar tu pedido y comunicarnos contigo.</p>
    <p>No compartimos tus datos con terceros distintos a los necesarios
    para procesar el pedido. No usamos tu informacion con fines publicitarios.</p>
    <p>Puedes solicitar la eliminacion de tus datos escribiendonos
    directamente por este mismo chat.</p>
    <p>Contacto: camiloproyectos14@gmail.com</p>
  `);
});

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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    console.log("📨 Mensaje recibido:", JSON.stringify(message, null, 2));

    const phone = message.from;
    const text = extractMessageContent(message);

    if (message.type === "text" && (!text || !String(text).trim())) return;

    await handleIncomingMessage(phone, text || "", message.type || "text");
  } catch (error) {
    console.error("❌ Error procesando el mensaje entrante:", error);
  }
});

app.listen(PORT, () => {
  console.log(`🥐 Bot de la panaderia escuchando en el puerto ${PORT}`);
});