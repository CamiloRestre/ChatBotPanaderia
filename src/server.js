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