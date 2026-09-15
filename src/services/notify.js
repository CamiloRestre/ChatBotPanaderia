// notify.js
// Integración OPCIONAL con Make (make.com).
// Si defines MAKE_WEBHOOK_URL en tu .env, cada pedido nuevo o solicitud de
// atención se envía también a ese webhook, para que tu escenario de Make
// haga lo que necesites: guardarlo en Google Sheets, avisarte por Telegram,
// enviarte un correo, etc.
//
// Si no defines MAKE_WEBHOOK_URL, esta función simplemente no hace nada y
// el bot sigue funcionando normal.

import dotenv from "dotenv";
dotenv.config({ override: true });

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

export async function notifyMake(event, data) {
  if (!MAKE_WEBHOOK_URL) return;

  try {
    await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        date: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error("⚠️ No se pudo notificar a Make:", error.message);
  }
}
