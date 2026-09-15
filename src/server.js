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
    const message = value?.messages?.[0];

    if (!message) return;

    const phone = message.from;
    const text = message.text?.body;

    if (!text) return;

    await handleIncomingMessage(phone, text);
  } catch (error) {
    console.error("❌ Error procesando el mensaje entrante:", error);
  }
});

app.listen(PORT, () => {
  console.log(`🥐 Bot de la panadería escuchando en el puerto ${PORT}`);
});