// server.js
// Punto de entrada del proyecto. Aquí se levanta el servidor web que Meta
// (WhatsApp Cloud API) usa para mandarle los mensajes al bot, y desde donde
// el bot responde.

import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "../services/conversation.js";

dotenv.config({ override: true });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "cambia_este_token";

// Chequeo rápido para saber que el servidor está vivo (útil para Render).
app.get("/", (req, res) => {
  res.send("Bot de la panadería funcionando ✅");
});

// META llama a esta ruta UNA VEZ, cuando configuras el webhook en el panel
// de desarrolladores, para comprobar que el servidor es tuyo.
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

// META llama a esta ruta CADA VEZ que un cliente le escribe al número
// de WhatsApp conectado. Aquí es donde entra la conversación del bot.
app.post("/webhook", async (req, res) => {
  // Respondemos 200 de inmediato: a Meta solo le importa que confirmemos
  // que recibimos el mensaje, no espera a que el bot termine de contestar.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // Puede ser una notificación de "mensaje entregado/leído", no un
      // mensaje nuevo del cliente. No hay nada que responder.
      return;
    }

    const phone = message.from;
    const text = message.text?.body;

    if (!text) {
      // El cliente envió audio, imagen, ubicación, etc. Por ahora el bot
      // solo entiende texto.
      return;
    }

    await handleIncomingMessage(phone, text);
  } catch (error) {
    console.error("❌ Error procesando el mensaje entrante:", error);
  }
});

app.listen(PORT, () => {
  console.log(`🥐 Bot de la panadería escuchando en el puerto ${PORT}`);
});
