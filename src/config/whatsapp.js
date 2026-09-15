// whatsapp.js
// Aquí se conecta el bot con la API de WhatsApp Cloud de Meta.
// Las credenciales (token y phone number id) se leen desde el archivo .env,
// nunca se escriben directamente aquí.

import dotenv from "dotenv";
dotenv.config({ override: true });

const GRAPH_API_VERSION = "v20.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function callGraphApi(payload) {
  if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    console.log(
      "⚠️ Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN en el .env. No se envió el mensaje:",
      JSON.stringify(payload)
    );
    return null;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Error enviando mensaje de WhatsApp:", JSON.stringify(data));
  }

  return data;
}

export async function sendWhatsAppMessage(phone, text) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text }
  });
}

export async function sendWhatsAppDocument(phone, mediaId, filename, caption) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "document",
    document: {
      id: mediaId,
      filename,
      caption
    }
  });
}
