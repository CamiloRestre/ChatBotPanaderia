// server.js
import crypto from "node:crypto";
import express from "express";
import dotenv from "dotenv";
import {
  finalizeHumanAttention,
  handleIncomingMessage
} from "./services/conversation.js";
import {
  createOrder,
  listPendingOrders,
  markOrderAsPrinted
} from "./services/orders.js";

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
const API_TOKEN = process.env.API_TOKEN;

function hasValidApiToken(req) {
  const authorization = req.get("authorization") || "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return Boolean(API_TOKEN && provided && provided === API_TOKEN);
}

function requireApiToken(req, res, next) {
  if (!hasValidApiToken(req)) {
    return res.status(401).json({ ok: false, error: "Token inválido." });
  }
  return next();
}

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

function extractMakeFinalization(payload) {
  const data = payload?.data || {};
  const phone =
    payload?.phone ??
    payload?.from ??
    payload?.to ??
    payload?.contactPhone ??
    data.phone ??
    data.from ??
    data.to ??
    data.contactPhone ??
    null;
  const text =
    payload?.text ??
    payload?.message ??
    payload?.body ??
    data.text ??
    data.message ??
    data.body ??
    null;

  return { phone, text };
}

app.get("/", (req, res) => {
  res.send("Bot de la panadería funcionando ✅");
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.post("/pedidos", requireApiToken, async (req, res) => {
  try {
    const order = await createOrder(req.body);
    return res.status(201).json({ ok: true, pedido: order });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("❌ Error guardando pedido:", error.message);
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se pudo guardar el pedido." : error.message
    });
  }
});

app.get("/pedidos/pendientes", requireApiToken, async (_req, res) => {
  try {
    const orders = await listPendingOrders();
    return res.status(200).json({ ok: true, pedidos: orders });
  } catch (error) {
    console.error("❌ Error leyendo pedidos pendientes:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudieron leer los pedidos." });
  }
});

app.post("/pedidos/:id/impreso", requireApiToken, async (req, res) => {
  try {
    const order = await markOrderAsPrinted(req.params.id);
    if (!order) {
      return res.status(404).json({ ok: false, error: "Pedido no encontrado." });
    }
    return res.status(200).json({ ok: true, pedido: order });
  } catch (error) {
    console.error("❌ Error marcando pedido como impreso:", error.message);
    return res.status(500).json({ ok: false, error: "No se pudo marcar el pedido." });
  }
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

app.post("/make/finalizado", async (req, res) => {
  if (!hasValidMakeSecret(req)) {
    console.warn("⚠️ Solicitud /make/finalizado rechazada: secreto inválido.");
    return res.sendStatus(403);
  }

  const { phone, text } = extractMakeFinalization(req.body || {});

  if (!phone || String(text || "").trim().toLowerCase() !== "finalizado") {
    return res.status(400).json({
      ok: false,
      error: "Se requiere phone y el texto FINALIZADO."
    });
  }

  try {
    const finalized = await finalizeHumanAttention(String(phone).trim());

    return res.status(200).json({
      ok: true,
      finalized
    });
  } catch (error) {
    console.error("❌ Error finalizando atención manual:", error.message);
    return res.status(500).json({
      ok: false,
      error: "No se pudo finalizar la atención."
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
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Política de Tratamiento de Datos Personales | Panadería Molinos</title>
        <style>
          :root {
            color-scheme: light;
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #2b2118;
            background: #fffaf3;
          }
          body { margin: 0; }
          main { max-width: 860px; margin: 0 auto; padding: 32px 20px 48px; }
          h1, h2 { color: #6b3f1d; }
          h1 { line-height: 1.2; }
          .notice {
            padding: 14px 16px;
            border-left: 4px solid #c8862f;
            background: #fff0d5;
          }
          .updated { color: #695f56; font-size: .95rem; }
        </style>
      </head>
      <body>
        <main>
          <h1>Política de Tratamiento de Datos Personales</h1>
          <p><strong>Panadería Molinos</strong></p>
          <p class="updated">Versión provisional: 1.0 · Fecha de vigencia: 8 de octubre de 2026</p>

          <p class="notice">
            Esta política es una versión provisional para informar el tratamiento
            de datos personales asociado al chatbot de WhatsApp de Panadería Molinos.
            Debe completarse con los datos legales del responsable y revisarse antes
            de su publicación definitiva.
          </p>

          <h2>1. Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento es
            <strong>[RAZÓN SOCIAL O NOMBRE COMPLETO DEL RESPONSABLE]</strong>,
            que opera comercialmente bajo el nombre Panadería Molinos.
          </p>
          <p>
            NIT o documento, si aplica:
            <strong>[NIT O DOCUMENTO]</strong><br>
            Correo para solicitudes de datos personales:
            <strong>[CORREO OFICIAL DE PROTECCIÓN DE DATOS]</strong><br>
            Teléfono o canal adicional:
            <strong>[TELÉFONO O CANAL OFICIAL, SI APLICA]</strong><br>
            Ciudad: Tuluá, Valle del Cauca, Colombia.
          </p>

          <h2>2. Marco aplicable</h2>
          <p>
            El tratamiento se realizará conforme a la Ley 1581 de 2012,
            el Decreto 1074 de 2015 y las demás normas colombianas aplicables
            sobre protección de datos personales, habeas data y privacidad.
          </p>

          <h2>3. Datos que podemos tratar</h2>
          <p>
            Cuando una persona interactúa con el chatbot o realiza un pedido,
            podemos tratar los datos que entregue voluntariamente y los necesarios
            para atender la solicitud, entre ellos:
          </p>
          <ul>
            <li>Nombre.</li>
            <li>Número de teléfono o identificador de WhatsApp.</li>
            <li>Dirección, barrio y referencias necesarias para la entrega.</li>
            <li>Productos, cantidades, valor y estado del pedido.</li>
            <li>Método de pago y datos necesarios para confirmar la operación.</li>
            <li>Contenido de las solicitudes, preguntas, reclamos o novedades.</li>
          </ul>
          <p>
            No solicitamos datos sensibles para gestionar pedidos. Por favor,
            evita enviar por el chat información sensible que no sea necesaria
            para la solicitud.
          </p>

          <h2>4. Finalidades</h2>
          <ul>
            <li>Recibir, confirmar y gestionar pedidos.</li>
            <li>Coordinar domicilios o la recogida de productos.</li>
            <li>Contactar al cliente sobre el pedido o una novedad relacionada.</li>
            <li>Responder preguntas y solicitudes de atención personalizada.</li>
            <li>Gestionar reclamos, consultas y solicitudes de los titulares.</li>
            <li>Cumplir obligaciones legales y atender requerimientos de autoridad competente.</li>
          </ul>
          <p>
            No utilizaremos los datos para publicidad o promociones no relacionadas
            con el pedido sin la autorización que corresponda.
          </p>

          <h2>5. Autorización</h2>
          <p>
            Antes de solicitar datos necesarios para continuar con un pedido,
            podremos pedir una autorización previa, expresa e informada mediante
            WhatsApp. La persona puede negarse; sin embargo, si no proporciona
            los datos estrictamente necesarios, es posible que no podamos gestionar
            el pedido o coordinar su entrega.
          </p>

          <h2>6. Proveedores y encargados</h2>
          <p>
            Para operar el servicio podemos utilizar proveedores tecnológicos
            necesarios para recibir mensajes, procesar solicitudes, alojar el
            servidor y enviar notificaciones. Actualmente el flujo puede involucrar
            WhatsApp Cloud API de Meta, Make y Render. Estos proveedores tratarán
            información según sus propias condiciones y según las funciones
            técnicas contratadas o configuradas.
          </p>
          <p>
            No compartiremos datos personales con terceros para fines propios de
            publicidad. Solo se comunicarán los datos necesarios para las
            finalidades informadas o para cumplir una obligación legal.
          </p>

          <h2>7. Derechos del titular</h2>
          <p>El titular puede:</p>
          <ul>
            <li>Conocer los datos personales tratados.</li>
            <li>Solicitar la actualización o rectificación de información inexacta.</li>
            <li>Solicitar prueba de la autorización, cuando corresponda.</li>
            <li>Solicitar información sobre el uso de sus datos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
            <li>Solicitar la supresión o revocar la autorización cuando sea procedente.</li>
          </ul>

          <h2>8. Consultas, reclamos y solicitudes</h2>
          <p>
            Las solicitudes deben enviarse al canal oficial:
            <strong>[CORREO OFICIAL DE PROTECCIÓN DE DATOS]</strong>.
            Deben indicar el nombre del titular, un medio de contacto, la
            descripción de la solicitud y los datos necesarios para identificarla.
          </p>
          <p>
            Las consultas y reclamos se atenderán dentro de los términos previstos
            por la normativa colombiana aplicable. Si el canal o los datos del
            responsable cambian, esta política será actualizada.
          </p>

          <h2>9. Conservación y seguridad</h2>
          <p>
            Conservaremos la información durante el tiempo necesario para cumplir
            las finalidades informadas, gestionar obligaciones legales y resolver
            posibles reclamaciones. Después se eliminará, anonimizará o conservará
            únicamente cuando exista una obligación o razón legal para hacerlo.
          </p>
          <p>
            Aplicamos medidas razonables de control de acceso, protección de
            credenciales, validación de solicitudes y reducción de datos en logs.
            Ninguna medida tecnológica garantiza seguridad absoluta.
          </p>

          <h2>10. Cambios a esta política</h2>
          <p>
            Cualquier cambio relevante será publicado en esta página indicando la
            nueva versión y la fecha de actualización.
          </p>

          <h2>11. Contacto</h2>
          <p>
            Para asuntos relacionados con esta política, utiliza:
            <strong>[CORREO OFICIAL DE PROTECCIÓN DE DATOS]</strong>.
          </p>

          <p class="updated">
            Fecha de actualización: [FECHA DE ACTUALIZACIÓN DEFINITIVA]
          </p>
        </main>
      </body>
    </html>
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