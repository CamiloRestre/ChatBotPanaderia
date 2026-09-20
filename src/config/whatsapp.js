// whatsapp.js
// Aqui se conecta el bot con la API de WhatsApp Cloud de Meta.
// Las credenciales (token y phone number id) se leen desde el archivo .env,
// nunca se escriben directamente aqui.

import dotenv from "dotenv";
dotenv.config({ override: true });

const GRAPH_API_VERSION = "v20.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function callGraphApi(payload) {
  if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    console.log(
      "⚠ Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN en el .env. No se envio el mensaje:",
      JSON.stringify(payload)
    );
    return null;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json();
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("❌ Error enviando mensaje de WhatsApp:", JSON.stringify(data));
    }

    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      console.error("❌ Timeout: WhatsApp API no respondio en 15s");
    } else {
      console.error("❌ Error en fetch a WhatsApp:", error.message);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. MENSAJE DE TEXTO SIMPLE
// ---------------------------------------------------------------------------
export async function sendWhatsAppMessage(phone, text) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text }
  });
}

// ---------------------------------------------------------------------------
// 2. MENSAJE CON BOTONES (maximo 3)
// ---------------------------------------------------------------------------
export async function sendWhatsAppButtons(phone, bodyText, buttons, header, footer) {
  const safeButtons = (buttons || []).slice(0, 3).map((b) => ({
    type: "reply",
    reply: {
      id: String(b.id).slice(0, 256),
      title: String(b.title).slice(0, 20)
    }
  }));

  if (safeButtons.length === 0) {
    return sendWhatsAppMessage(phone, bodyText);
  }

  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type: "text", text: String(header).slice(0, 60) } } : {}),
      body: { text: String(bodyText).slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: { buttons: safeButtons }
    }
  });
}

// ---------------------------------------------------------------------------
// 3. MENSAJE CON LISTA DESPLEGABLE (maximo 10 filas)
// ---------------------------------------------------------------------------
export async function sendWhatsAppList(phone, bodyText, buttonLabel, sections, header, footer) {
  const safeSections = (sections || []).slice(0, 10).map((section) => ({
    title: String(section.title).slice(0, 24),
    rows: (section.rows || []).slice(0, 10).map((row) => ({
      id: String(row.id).slice(0, 200),
      title: String(row.title).slice(0, 24),
      ...(row.description
        ? { description: String(row.description).slice(0, 72) }
        : {})
    }))
  }));

  if (safeSections.length === 0 || safeSections.every((s) => s.rows.length === 0)) {
    return sendWhatsAppMessage(phone, bodyText);
  }

  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      ...(header ? { header: { type: "text", text: String(header).slice(0, 60) } } : {}),
      body: { text: String(bodyText).slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        button: String(buttonLabel).slice(0, 20),
        sections: safeSections
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 4. MENSAJE CON DOCUMENTO
// ---------------------------------------------------------------------------
export async function sendWhatsAppDocument(phone, mediaId, filename, caption) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to: phone,
    type: "document",
    document: { id: mediaId, filename, caption }
  });
}