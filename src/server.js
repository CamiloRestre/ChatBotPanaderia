// server.js
import crypto from "node:crypto";
import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "./services/conversation.js";

dotenv.config({ override: true });

const app = express();

const processedMessageIds = new Map();
const MESSAGE_ID_TTL_MS = 24 * 60 * 60 * 1000;
const MESSAGE_ID_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function captureRawBody(req, _res, buffer) {
  req.rawBody = Buffer.from(buffer);
}

app.use(express.json({ limit: "50kb", verify: captureRawBody }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "cambia_este_token";
const META_APP_SECRET = process.env.META_APP_SECRET;
const MAKE_SECRET = process.env.MAKE_SECRET;

const messageIdCleanupTimer = setInterval(() => {
  const expiration = Date.now() - MESSAGE_ID_TTL_MS;

  for (const [messageId, processedAt] of processedMessageIds) {
    if (processedAt <= expiration) {
      processedMessageIds.delete(messageId);
    }
  }
}, MESSAGE_ID_CLEANUP_INTERVAL_MS);
messageIdCleanupTimer.unref();

function hasProcessedMessage(messageId) {
  if (!messageId) return false;

  const processedAt = processedMessageIds.get(messageId);
  if (!processedAt) return false;

  if (processedAt <= Date.now() - MESSAGE_ID_TTL_MS) {
    processedMessageIds.delete(messageId);
    return false;
  }

  return true;
}

function markMessageAsProcessed(messageId) {
  if (messageId) {
    processedMessageIds.set(messageId, Date.now());
  }
}

function isValidMetaSignature(req) {
  const signature = req.get("x-hub-signature-256");

  if (!META_APP_SECRET || !signature || !req.rawBody) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(req.rawBody)
    .digest("hex")}`;
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

function hasValidMakeSecret(req) {
  const providedSecret = req.get("x-make-secret");

  if (!MAKE_SECRET || !providedSecret) {
    return false;
  }

  const provided = Buffer.from(providedSecret, "utf8");
  const expected = Buffer.from(MAKE_SECRET, "utf8");

  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

app.get("/", (req, res) => {
  res.send("Bot de la panadería funcionando ✅");
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

function extractIncomingText(message) {
  if (!message) return null;

  if (message.interactive) {
    const interactive = message.interactive;

    if (interactive.list_reply) {
      return interactive.list_reply.id ?? interactive.list_reply.title ?? null;
    }

    if (interactive.button_reply) {
      return interactive.button_reply.id ?? interactive.button_reply.title ?? null;
    }
  }

  if (message.text?.body !== undefined) {
    return message.text.body;
  }

  return null;
}

function extractInboundMessage(payload) {
  const metaMessage = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (metaMessage) {
    return {
      phone: metaMessage.from,
      text: extractIncomingText(metaMessage),
      type: metaMessage.type || "text"
    };
  }

  const simpleMessage = payload.messages?.[0];
  const text =
    extractIncomingText(simpleMessage) ??
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

  return { phone, text, type: simpleMessage?.type || "text" };
}

app.post("/make", async (req, res) => {
  if (!hasValidMakeSecret(req)) {
    console.warn("⚠️ Solicitud /make rechazada: secreto inválido.");
    return res.sendStatus(403);
  }

  const payload = req.body || {};

  try {
    const { phone, text: messageSource, type: messageType } = extractInboundMessage(payload);
    const messageId = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id
      ?? payload.messages?.[0]?.id;
    console.log("📥 Mensaje recibido. Tipo:", messageType || "desconocido");

    if (hasProcessedMessage(messageId)) {
      console.log("📥 Mensaje duplicado ignorado.");
      return res.status(200).json({ ok: true, duplicate: true });
    }

    markMessageAsProcessed(messageId);

    if (messageType === "text" && (!messageSource || !String(messageSource).trim())) {
      return res.status(200).json({
        ok: false,
        error: "No hay mensaje",
        respuesta: "No recibí ningún mensaje para procesar."
      });
    }

    if (!phone) {
      return res.status(200).json({
        ok: false,
        error: "No hay número de remitente",
        respuesta: "No pude identificar el número del remitente."
      });
    }

    const botResult = await handleIncomingMessage(phone, String(messageSource || ""), messageType);

    const respuesta = typeof botResult === "string"
      ? botResult
      : (botResult && typeof botResult === "object")
        ? "Mensaje recibido y procesado correctamente."
        : "Lo siento, no encontré información sobre eso.";

    return res.status(200).json({ ok: true, respuesta });
  } catch (error) {
    console.error("❌ Error procesando el mensaje:", error.message);
    return res.status(200).json({
      ok: false,
      error: "Error interno",
      respuesta: "Hubo un error procesando tu mensaje. Intenta de nuevo."
    });
  }
});

app.post("/render", (req, res) => {
  console.log("📥 Evento de Render recibido.");

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
    para procesar el pedido. No usamos tu información con fines publicitarios.</p>
    <p>Puedes solicitar la eliminación de tus datos escribiéndonos
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
  if (!isValidMetaSignature(req)) {
    console.warn("⚠️ Solicitud /webhook rechazada: firma inválida.");
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    console.log("📨 Mensaje recibido. Tipo:", message.type || "desconocido");

    if (hasProcessedMessage(message.id)) {
      console.log("📨 Mensaje duplicado ignorado.");
      return;
    }

    markMessageAsProcessed(message.id);

    const phone = message.from;
    const text = extractIncomingText(message);

    if (message.type === "text" && (!text || !String(text).trim())) return;

    await handleIncomingMessage(phone, text || "", message.type || "text");
  } catch (error) {
    console.error("❌ Error procesando el mensaje entrante:", error.message);
  }
});

app.use((error, _req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      ok: false,
      error: "Payload demasiado grande"
    });
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      ok: false,
      error: "Payload JSON inválido"
    });
  }

  return next(error);
});

app.listen(PORT, () => {
  console.log(`🥐 Bot de la panadería escuchando en el puerto ${PORT}`);
});