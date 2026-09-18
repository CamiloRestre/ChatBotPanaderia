// conversation.js
// Aquí vive la "lógica" del bot: qué responder según lo que escribe el
// cliente y en qué paso de la conversación está.
//
// Esta es la BASE DE CONOCIMIENTOS de flujo: los textos fijos (saludo, menú,
// horarios, etc.) están escritos directamente aquí. Los productos vienen de
// products.js. Cuando el mensaje del cliente no calza con nada de esto,
// se usa ai.js (Gemini) como respaldo.

import { sendWhatsAppMessage, sendWhatsAppDocument } from "../config/whatsapp.js";
import { products, formatPrice, CATEGORY_LABELS } from "../data/products.js";
import { getAiSalesResponse } from "./ai.js";
import { notifyMake } from "./notify.js";

// Guarda en memoria en qué paso de la conversación va cada cliente.
// (Se reinicia si el servidor se reinicia; para producción real se podría
// mover a una base de datos, pero para este proyecto es suficiente).
const states = new Map();

const BAKERY_NAME = process.env.BAKERY_NAME || "Panadería Molinos";
const BAKERY_ADDRESS =
  process.env.BAKERY_ADDRESS || "Calle Principal #12-34, Tuluá, Valle del Cauca";
const HUMAN_ATTENTION_SCHEDULE = process.env.HUMAN_ATTENTION_SCHEDULE || "7:00 a.m. a 7:00 p.m.";

const PAYMENT_INFO = {
  bank: process.env.PAYMENT_BANK || "Nequi",
  accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "3000000000",
  holderName: process.env.PAYMENT_HOLDER_NAME || "Nombre del Titular"
};

function getFreshState(phone, extra = {}) {
  const nextState = { step: "MAIN_MENU", cart: [], ...extra };
  states.set(phone, nextState);
  return nextState;
}

export async function handleIncomingMessage(phone, message) {
  const rawText = message.trim();
  const text = normalize(rawText);

  if (!isBotAllowedToRespond()) {
    console.log(`Mensaje recibido fuera del horario del bot. Cliente: ${phone}`);
    return;
  }

  if (!text) {
    return sendWhatsAppMessage(
      phone,
      "No alcancé a leer tu mensaje. ¿Me escribes nuevamente, por favor? 😊"
    );
  }

  if (isMainMenuRequest(text)) {
    getFreshState(phone);
    return sendMainMenu(phone);
  }

  if (
    text.includes("asesor") ||
    text.includes("humano") ||
    text.includes("persona") ||
    text.includes("hablar con alguien")
  ) {
    return handleHumanHandoff(phone);
  }

  const state = states.get(phone);

  if (!state) {
    const foundProducts = searchProducts(text);

    if (foundProducts.length > 0) {
      states.set(phone, { step: "PRODUCT_FOUND", foundProducts, cart: [] });
      return sendProductSearchResults(phone, foundProducts);
    }

    if (shouldUseAi(text)) {
      const newState = { step: "PRODUCT_FOUND", cart: [] };
      return sendAiHelpOrFallback(phone, text, newState, "PRODUCT_FOUND");
    }

    getFreshState(phone);
    return sendMainMenu(phone);
  }

  switch (state.step) {
    case "MAIN_MENU":
      return handleMainMenuStep(phone, text, rawText, state);

    case "PRODUCT_FOUND":
      return handleProductFoundStep(phone, text, state);

    case "ASK_QUANTITY":
      return handleQuantityStep(phone, text, state);

    case "ASK_ADD_MORE":
      return handleAddMoreStep(phone, text, state);

    case "ASK_CUSTOMER_NAME":
      return handleCustomerNameStep(phone, rawText, state);

    case "ASK_DELIVERY_METHOD":
      return handleDeliveryMethodStep(phone, text, state);

    case "ASK_ADDRESS":
      return handleAddressStep(phone, rawText, state);

    case "ASK_PAYMENT_METHOD":
      return handlePaymentMethodStep(phone, text, state);

    case "ASK_RECO_CATEGORY":
      return handleRecoCategoryStep(phone, text, state);

    case "ASK_RECO_MOOD":
      return handleRecoMoodStep(phone, text, state);

    case "SHOW_RECOMMENDATIONS":
      return handleRecommendationSelectionStep(phone, text, state);

    case "ASK_LEAD_NAME":
      return handleLeadNameStep(phone, rawText, state);

    case "ASK_LEAD_NEED":
      return handleLeadNeedStep(phone, rawText, state);

    case "ORDER_CONFIRMED":
    case "LEAD_REGISTERED": {
      getFreshState(phone);
      return sendWhatsAppMessage(
        phone,
        "Ya quedó registrado ✅ Si deseas hacer otro pedido, escribe *menu*."
      );
    }

    default:
      getFreshState(phone);
      return sendMainMenu(phone);
  }
}

// ---------------------------------------------------------------------------
// MENÚ PRINCIPAL — esto es lo primero que ve el cliente al saludar
// ---------------------------------------------------------------------------

function sendMainMenu(phone) {
  return sendWhatsAppMessage(
    phone,
    `Hola 👋 Bienvenido/a a ${BAKERY_NAME}.

Soy el asistente virtual y puedo ayudarte con:

1. Ver la carta
2. Hacer un pedido
3. Recomiéndame algo
4. Horarios y ubicación
5. Hablar con alguien del equipo

Responde con el número de la opción que prefieras.`
  );
}

async function handleMainMenuStep(phone, text, rawText, state) {
  if (text === "1" || text.includes("carta") || text.includes("menu") || text.includes("catalogo")) {
    return sendCarta(phone, state);
  }

  if (text === "2" || text.includes("pedido") || text.includes("pedir") || text.includes("comprar")) {
    state.cart = [];
    return askProductName(
      phone,
      state,
      "Claro 😊 ¿Qué te gustaría pedir? Escríbeme el nombre del producto, por ejemplo: Croissant, Torta de chocolate, Café."
    );
  }

  if (text === "3" || text.includes("recomien")) {
    state.cart = [];
    state.step = "ASK_RECO_CATEGORY";
    states.set(phone, state);
    return sendRecoCategoryQuestion(phone);
  }

  if (text === "4" || text.includes("horario") || text.includes("ubicacion") || text.includes("direccion")) {
    return sendWhatsAppMessage(
      phone,
      `📍 Estamos en: ${BAKERY_ADDRESS}

🕒 Horario de atención: ${HUMAN_ATTENTION_SCHEDULE}

Escribe *menu* para ver las opciones de nuevo.`
    );
  }

  if (text === "5" || text.includes("asesor") || text.includes("humano")) {
    return handleHumanHandoff(phone);
  }

  const foundProducts = searchProducts(text);

  if (foundProducts.length > 0) {
    states.set(phone, { step: "PRODUCT_FOUND", foundProducts, cart: state.cart || [] });
    return sendProductSearchResults(phone, foundProducts);
  }

  if (shouldUseAi(text)) {
    return sendAiHelpOrFallback(phone, text, state, "PRODUCT_FOUND");
  }

  return sendWhatsAppMessage(
    phone,
    `Te entiendo 😊 Para ayudarte mejor, elige una opción:

1. Ver la carta
2. Hacer un pedido
3. Recomiéndame algo
4. Horarios y ubicación
5. Hablar con alguien del equipo`
  );
}

async function sendCarta(phone, state) {
  const mediaId = process.env.CATALOG_MEDIA_ID || "";
  const filename = process.env.CATALOG_FILE_NAME || `Carta ${BAKERY_NAME}.pdf`;

  // Si configuras CATALOG_MEDIA_ID en .env, se envía un PDF ya subido a Meta.
  // Si no, se arma automáticamente un texto con el catálogo (products.js).
  if (mediaId) {
    await sendWhatsAppDocument(
      phone,
      mediaId,
      filename,
      "Aquí tienes nuestra carta actualizada 😊"
    );
  } else {
    const menuText = buildMenuText();
    await sendWhatsAppMessage(phone, menuText);
  }

  state.step = "PRODUCT_FOUND";
  state.waitingForProductName = true;
  states.set(phone, state);

  return sendWhatsAppMessage(
    phone,
    "Cuando veas algo que te guste, escríbeme el nombre para agregarlo a tu pedido 😊"
  );
}

function buildMenuText() {
  const sections = Object.keys(CATEGORY_LABELS).map((category) => {
    const items = products.filter((p) => p.available && p.category === category);

    const lines = items
      .map((product) => `• ${product.name} — ${formatPrice(product.price)}`)
      .join("\n");

    return `*${CATEGORY_LABELS[category]}*\n${lines}`;
  });

  return `📋 Esta es nuestra carta:\n\n${sections.join("\n\n")}`;
}

function askProductName(phone, state, message) {
  state.step = "PRODUCT_FOUND";
  state.waitingForProductName = true;
  states.set(phone, state);

  return sendWhatsAppMessage(
    phone,
    `${message}

También puedes responder:

1. Ver la carta
2. Recomiéndame algo
3. Hablar con alguien del equipo`
  );
}

function offerProductHelp(phone, state) {
  state.step = "PRODUCT_FOUND";
  state.waitingForProductName = true;
  states.set(phone, state);

  return sendWhatsAppMessage(
    phone,
    `No hay problema 😊 Puedes elegir una de estas opciones:

1. Ver la carta
2. Recomiéndame algo
3. Hablar con alguien del equipo

Responde con el número de la opción que prefieras.`
  );
}

async function sendAiHelpOrFallback(phone, text, state, nextStep) {
  const aiResponse = await getAiSalesResponse(text);

  state.step = nextStep;
  state.waitingForProductName = true;
  states.set(phone, state);

  if (aiResponse) {
    return sendWhatsAppMessage(
      phone,
      `${aiResponse}

Si algo te gustó, escríbeme el nombre del producto y te ayudo a agregarlo al pedido 😊

También puedes responder:

1. Ver la carta
2. Recomiéndame algo
3. Hablar con alguien del equipo`
    );
  }

  return sendWhatsAppMessage(
    phone,
    `Te ayudo con gusto 😊

Puedes elegir una de estas opciones:

1. Ver la carta
2. Recomiéndame algo
3. Hablar con alguien del equipo

O escríbeme el nombre de un producto que quieras buscar.`
  );
}

// ---------------------------------------------------------------------------
// BÚSQUEDA Y SELECCIÓN DE PRODUCTO
// ---------------------------------------------------------------------------

async function handleProductFoundStep(phone, text, state) {
  if (state.waitingForProductName) {
    if (text === "1" || text.includes("carta") || text.includes("catalogo")) {
      return sendCarta(phone, state);
    }

    if (text === "2" || text.includes("recomien")) {
      state.step = "ASK_RECO_CATEGORY";
      states.set(phone, state);
      return sendRecoCategoryQuestion(phone);
    }

    if (text === "3" || text.includes("asesor") || text.includes("humano")) {
      return handleHumanHandoff(phone);
    }

    const foundProducts = searchProducts(text);

    if (foundProducts.length === 0) {
      if (shouldUseAi(text)) {
        return sendAiHelpOrFallback(phone, text, state, "PRODUCT_FOUND");
      }
      return offerProductHelp(phone, state);
    }

    state.waitingForProductName = false;
    state.foundProducts = foundProducts;
    states.set(phone, state);

    return sendProductSearchResults(phone, foundProducts);
  }

  const selectedIndex = Number(text);

  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > state.foundProducts.length) {
    return sendWhatsAppMessage(phone, "Por favor responde con el número del producto que quieres agregar 😊");
  }

  const selectedProduct = state.foundProducts[selectedIndex - 1];

  state.selectedProduct = selectedProduct;
  state.step = "ASK_QUANTITY";
  states.set(phone, state);

  return askForQuantityAfterProduct(phone, selectedProduct);
}

function sendProductSearchResults(phone, foundProducts) {
  const productList = foundProducts
    .map((product, index) => `${index + 1}. ${product.name} — ${formatPrice(product.price)}\n${product.description}`)
    .join("\n\n");

  return sendWhatsAppMessage(
    phone,
    `Encontré estas opciones relacionadas con tu búsqueda:

${productList}

¿Cuál te gustaría agregar a tu pedido?

Responde con el número de la opción 😊`
  );
}

function askForQuantityAfterProduct(phone, selectedProduct) {
  return sendWhatsAppMessage(
    phone,
    `Excelente elección 🔥

Seleccionaste: ${selectedProduct.name}
Precio: ${formatPrice(selectedProduct.price)}

¿Cuántas unidades deseas agregar?`
  );
}

function handleQuantityStep(phone, text, state) {
  const quantity = Number(text);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return sendWhatsAppMessage(phone, "Por favor dime cuántas unidades deseas. Ejemplo: 1, 2, 3...");
  }

  addProductToCart(state, state.selectedProduct, quantity);
  state.step = "ASK_ADD_MORE";
  states.set(phone, state);

  return sendCartSummaryWithAddMoreQuestion(phone, state);
}

function handleAddMoreStep(phone, text, state) {
  if (isYes(text)) {
    return askProductName(phone, state, "Perfecto 😊 ¿Qué otro producto deseas agregar?");
  }

  if (isNo(text)) {
    state.step = "ASK_CUSTOMER_NAME";
    states.set(phone, state);

    return sendWhatsAppMessage(
      phone,
      `${buildCartSummary(state)}

Para dejar tu pedido registrado, ¿me regalas tu nombre, por favor?`
    );
  }

  return sendWhatsAppMessage(phone, "¿Deseas agregar otro producto al pedido? Responde *sí* o *no* 😊");
}

function addProductToCart(state, product, quantity) {
  if (!state.cart) state.cart = [];

  const existingItem = state.cart.find((item) => item.product.id === product.id);

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    state.cart.push({ product, quantity });
  }

  calculateCartTotals(state);
}

function calculateCartTotals(state) {
  const cart = state.cart || [];

  let totalUnits = 0;
  let totalPrice = 0;

  state.cart = cart.map((item) => {
    const subtotal = item.product.price * item.quantity;
    totalUnits += item.quantity;
    totalPrice += subtotal;
    return { ...item, subtotal };
  });

  state.totalUnits = totalUnits;
  state.totalPrice = totalPrice;
}

function sendCartSummaryWithAddMoreQuestion(phone, state) {
  calculateCartTotals(state);

  return sendWhatsAppMessage(
    phone,
    `${buildCartSummary(state)}

¿Deseas agregar otro producto al pedido?

Responde *sí* para agregar otro o *no* para continuar con tus datos.`
  );
}

function buildCartSummary(state) {
  calculateCartTotals(state);

  const cartLines = state.cart
    .map((item, index) => `${index + 1}. ${item.product.name} x${item.quantity} — ${formatPrice(item.subtotal)}`)
    .join("\n");

  return `🛒 Resumen de tu pedido:

${cartLines}

Total: ${formatPrice(state.totalPrice)}`;
}

// ---------------------------------------------------------------------------
// DATOS DEL CLIENTE, ENTREGA Y PAGO
// ---------------------------------------------------------------------------

function handleCustomerNameStep(phone, rawText, state) {
  const name = rawText.trim();

  if (name.length < 2 || isInvalidText(name)) {
    return sendWhatsAppMessage(phone, "Por favor escríbeme tu nombre. Ejemplo: Fabián 😊");
  }

  state.customerName = capitalizeWords(name);
  state.step = "ASK_DELIVERY_METHOD";
  states.set(phone, state);

  return sendWhatsAppMessage(
    phone,
    `Gracias, ${state.customerName} 😊

¿Cómo prefieres recibir tu pedido?

1. Recoger en la panadería
2. Domicilio`
  );
}

function handleDeliveryMethodStep(phone, text, state) {
  const method = parseDeliveryMethod(text);

  if (!method) {
    return sendWhatsAppMessage(
      phone,
      `Por favor elige una opción válida:

1. Recoger en la panadería
2. Domicilio`
    );
  }

  state.deliveryMethod = method;

  if (method === "domicilio") {
    state.step = "ASK_ADDRESS";
    states.set(phone, state);

    return sendWhatsAppMessage(
      phone,
      "Perfecto 😊 Dime la dirección completa y el barrio para el domicilio. Ejemplo: Calle 10 # 20-30, barrio Centro."
    );
  }

  state.step = "ASK_PAYMENT_METHOD";
  states.set(phone, state);

  return sendPaymentQuestion(phone);
}

function handleAddressStep(phone, rawText, state) {
  const address = rawText.trim();

  if (address.length < 5 || isInvalidText(address)) {
    return sendWhatsAppMessage(
      phone,
      "Por favor escríbeme una dirección más completa. Ejemplo: Calle 10 # 20-30, barrio Centro 😊"
    );
  }

  state.address = capitalizeWords(address);
  state.step = "ASK_PAYMENT_METHOD";
  states.set(phone, state);

  return sendPaymentQuestion(phone);
}

function sendPaymentQuestion(phone) {
  return sendWhatsAppMessage(
    phone,
    `¿Qué método de pago prefieres?

1. Transferencia
2. Efectivo contraentrega`
  );
}

async function handlePaymentMethodStep(phone, text, state) {
  const paymentMethod = parsePaymentMethod(text);

  if (!paymentMethod) {
    return sendWhatsAppMessage(
      phone,
      `Elige una opción válida:

1. Transferencia
2. Efectivo contraentrega`
    );
  }

  state.paymentMethod = paymentMethod;
  state.step = "ORDER_CONFIRMED";
  states.set(phone, state);

  calculateCartTotals(state);

  const orderPayload = {
    phone,
    customerName: state.customerName,
    deliveryMethod: state.deliveryMethod,
    address: state.address || null,
    paymentMethod: state.paymentMethod,
    items: state.cart.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      subtotal: item.subtotal
    })),
    total: state.totalPrice
  };

  console.log("\n📦 PEDIDO NUEVO");
  console.log(JSON.stringify(orderPayload, null, 2));
  console.log("Estado: pendiente de confirmación\n");

  // Si configuras MAKE_WEBHOOK_URL en .env, este evento llega a tu escenario
  // de Make (por ejemplo para guardarlo en Google Sheets o avisarte por
  // Telegram). Si no lo configuras, simplemente no hace nada.
  await notifyMake("nuevo_pedido", orderPayload);

  const deliveryLine =
    state.deliveryMethod === "domicilio"
      ? `Entrega: Domicilio\nDirección: ${state.address}`
      : `Entrega: Recoger en ${BAKERY_NAME} (${BAKERY_ADDRESS})`;

  if (paymentMethod === "transferencia") {
    return sendWhatsAppMessage(
      phone,
      `Listo, ${state.customerName} ✅ Tu pedido quedó registrado:

${buildCartSummary(state)}

${deliveryLine}
Pago: Transferencia

Puedes transferir a:
${PAYMENT_INFO.bank} — ${PAYMENT_INFO.accountNumber}
Titular: ${PAYMENT_INFO.holderName}

Cuando hagas el pago, envía el comprobante por este chat.

Gracias por preferir a ${BAKERY_NAME} 🥐`
    );
  }

  return sendWhatsAppMessage(
    phone,
    `Listo, ${state.customerName} ✅ Tu pedido quedó registrado:

${buildCartSummary(state)}

${deliveryLine}
Pago: Efectivo contraentrega

Gracias por preferir a ${BAKERY_NAME} 🥐`
  );
}

// ---------------------------------------------------------------------------
// RECOMENDACIONES ("no sé qué pedir")
// ---------------------------------------------------------------------------

function sendRecoCategoryQuestion(phone) {
  return sendWhatsAppMessage(
    phone,
    `¿Qué se te antoja hoy? 😊

1. Pan
2. Pasteles o tortas
3. Postres
4. Bebidas
5. Sorpréndeme`
  );
}

function handleRecoCategoryStep(phone, text, state) {
  const category = parseRecoCategory(text);

  if (!category) {
    return sendWhatsAppMessage(
      phone,
      `Elige una opción válida:

1. Pan
2. Pasteles o tortas
3. Postres
4. Bebidas
5. Sorpréndeme`
    );
  }

  state.recoCategory = category;
  state.step = "ASK_RECO_MOOD";
  states.set(phone, state);

  return sendWhatsAppMessage(
    phone,
    `¿Para qué ocasión es?

1. Antojo del día
2. Cumpleaños o celebración
3. Para compartir en familia u oficina
4. No sé, muéstrame lo más pedido`
  );
}

function handleRecoMoodStep(phone, text, state) {
  const mood = parseRecoMood(text);

  if (!mood) {
    return sendWhatsAppMessage(
      phone,
      `Elige una opción válida:

1. Antojo del día
2. Cumpleaños o celebración
3. Para compartir en familia u oficina
4. No sé, muéstrame lo más pedido`
    );
  }

  state.recoMood = mood;

  const recommendedProducts = getRecommendations(state);

  state.recommendedProducts = recommendedProducts;
  state.step = "SHOW_RECOMMENDATIONS";
  states.set(phone, state);

  const productList = recommendedProducts
    .map((product, index) => `${index + 1}. ${product.name} — ${formatPrice(product.price)}\n${product.description}`)
    .join("\n\n");

  return sendWhatsAppMessage(
    phone,
    `Según lo que me cuentas, esto te puede gustar:

${productList}

¿Cuál te gustaría agregar a tu pedido?

Responde con el número de la opción 😊`
  );
}

function handleRecommendationSelectionStep(phone, text, state) {
  const selectedIndex = Number(text);

  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > state.recommendedProducts.length) {
    return sendWhatsAppMessage(phone, "Por favor responde con el número de la opción que quieres agregar 😊");
  }

  const selectedProduct = state.recommendedProducts[selectedIndex - 1];

  state.selectedProduct = selectedProduct;
  state.step = "ASK_QUANTITY";
  states.set(phone, state);

  return askForQuantityAfterProduct(phone, selectedProduct);
}

function getRecommendations(state) {
  const byCategory =
    state.recoCategory === "sorpresa"
      ? products
      : products.filter((p) => p.category === state.recoCategory);

  const moodTag =
    { antojo: "antojo", cumpleanos: "cumpleanos", compartir: "compartir" }[state.recoMood] || null;

  let filtered = byCategory.filter((p) => p.available);

  if (moodTag) {
    const withMood = filtered.filter((p) => p.tags.includes(moodTag));
    if (withMood.length >= 3) {
      filtered = withMood;
    }
  } else {
    const popular = filtered.filter((p) => p.tags.includes("popular"));
    if (popular.length >= 3) {
      filtered = popular;
    }
  }

  if (filtered.length >= 3) {
    return filtered.slice(0, 3);
  }

  // Si no hay suficientes con el filtro exacto, se completa con productos
  // de la misma categoría (o populares en general) hasta llegar a 3.
  const combined = [...filtered];
  const pool = products.filter((p) => p.available);

  for (const product of pool) {
    if (combined.length === 3) break;
    if (!combined.find((item) => item.id === product.id)) {
      combined.push(product);
    }
  }

  return combined.slice(0, 3);
}

function parseRecoCategory(text) {
  if (text === "1" || text.includes("pan")) return "pan";
  if (text === "2" || text.includes("pastel") || text.includes("torta")) return "pastel";
  if (text === "3" || text.includes("postre")) return "postre";
  if (text === "4" || text.includes("bebida")) return "bebida";
  if (text === "5" || text.includes("sorprend")) return "sorpresa";
  return null;
}

function parseRecoMood(text) {
  if (text === "1" || text.includes("antojo")) return "antojo";
  if (text === "2" || text.includes("cumple")) return "cumpleanos";
  if (text === "3" || text.includes("compartir")) return "compartir";
  if (text === "4" || text.includes("no se") || text.includes("no sé") || text.includes("pedido")) return "populares";
  return null;
}

// ---------------------------------------------------------------------------
// HABLAR CON UNA PERSONA DEL EQUIPO
// ---------------------------------------------------------------------------

function handleHumanHandoff(phone) {
  states.set(phone, { step: "ASK_LEAD_NAME" });

  return sendWhatsAppMessage(
    phone,
    `Claro 😊 Puedo dejar tu solicitud registrada para que alguien del equipo te escriba.

Nuestro horario de atención es de ${HUMAN_ATTENTION_SCHEDULE}.

¿Me regalas tu nombre, por favor?`
  );
}

function handleLeadNameStep(phone, rawText, state) {
  const name = rawText.trim();

  if (name.length < 2) {
    return sendWhatsAppMessage(phone, "¿Me regalas tu nombre, por favor? 😊");
  }

  state.customerName = capitalizeWords(name);
  state.step = "ASK_LEAD_NEED";
  states.set(phone, state);

  return sendWhatsAppMessage(phone, `Gracias, ${state.customerName}. ¿En qué te podemos ayudar?`);
}

async function handleLeadNeedStep(phone, rawText, state) {
  state.need = rawText.trim();
  state.step = "LEAD_REGISTERED";
  states.set(phone, state);

  const leadPayload = {
    phone,
    customerName: state.customerName,
    need: state.need
  };

  console.log("\n📩 SOLICITUD DE ATENCIÓN PERSONALIZADA");
  console.log(JSON.stringify(leadPayload, null, 2));
  console.log("Estado: pendiente de revisión por el equipo\n");

  await notifyMake("solicitud_atencion", leadPayload);

  return sendWhatsAppMessage(
    phone,
    `Gracias, ${state.customerName} ✅ Dejamos tu solicitud registrada:

${state.need}

Alguien del equipo revisará este chat en horario de atención. Gracias por escribirnos 😊`
  );
}

// ---------------------------------------------------------------------------
// BÚSQUEDA Y UTILIDADES
// ---------------------------------------------------------------------------

function searchProducts(text) {
  const normalizedText = normalize(text);

  return products
    .filter((product) => {
      if (!product.available) return false;

      const searchableText = normalize(
        [product.name, product.category, ...product.tags, ...product.keywords].join(" ")
      );

      return searchableText.includes(normalizedText) || normalizedText.includes(normalize(product.name));
    })
    .slice(0, 3);
}

function isMainMenuRequest(text) {
  if (!text) return false;

  const exactMenuMessages = [
    "menu",
    "menu principal",
    "inicio",
    "reiniciar",
    "empezar",
    "hola",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "info",
    "informacion"
  ];

  if (exactMenuMessages.includes(text)) return true;

  const hasGreeting =
    text.startsWith("hola") || text.startsWith("buenas") || text.startsWith("buenos dias");

  return hasGreeting && text.split(" ").length <= 4;
}

function shouldUseAi(text) {
  if (!text || text.length < 4) return false;

  const directOptions = ["1", "2", "3", "4", "5", "si", "sí", "no"];
  if (directOptions.includes(text)) return false;

  const aiKeywords = [
    "quiero",
    "busco",
    "recomienda",
    "recomiendame",
    "recomiéndame",
    "cumpleanos",
    "cumpleaños",
    "cumple",
    "sin gluten",
    "gluten",
    "vegano",
    "alergia",
    "dulce",
    "salado",
    "economico",
    "barato",
    "compartir",
    "personas",
    "cual es",
    "cuál es",
    "mejor",
    "rico",
    "rica",
    "antojo",
    "domicilio",
    "hacen",
    "tienen",
    "personalizada",
    "encargo"
  ];

  return aiKeywords.some((word) => text.includes(word)) || text.split(" ").length >= 4;
}

function parseDeliveryMethod(text) {
  if (text === "1" || text.includes("recoger") || text.includes("tienda")) return "recoger";
  if (text === "2" || text.includes("domicilio") || text.includes("enviar")) return "domicilio";
  return null;
}

function parsePaymentMethod(text) {
  if (text === "1" || text.includes("transferencia")) return "transferencia";
  if (text === "2" || text.includes("efectivo") || text.includes("contraentrega")) return "contraentrega";
  return null;
}

function isYes(text) {
  return text === "si" || text === "sí" || text === "s" || text.includes("claro") || text.includes("otro");
}

function isNo(text) {
  return text === "no" || text === "n" || text.includes("continuar") || text.includes("listo");
}

function isBotAllowedToRespond() {
  const onlyRestricted = process.env.BOT_ONLY_NIGHT === "true";
  if (!onlyRestricted) return true;

  const timezone = process.env.BOT_TIMEZONE || "America/Bogota";
  const startTime = process.env.BOT_START_TIME || "07:00";
  const endTime = process.env.BOT_END_TIME || "19:00";

  const currentMinutes = getCurrentMinutesInTimezone(timezone);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) return true;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function getCurrentMinutesInTimezone(timezone) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  return hour * 60 + minute;
}

function timeToMinutes(time) {
  if (!time || !time.includes(":")) return null;

  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function normalize(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function capitalizeWords(text) {
  return text
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isInvalidText(value) {
  const normalized = normalize(value);
  const invalidWords = ["1", "2", "transferencia", "contraentrega", "pago", "domicilio", "recoger"];
  return invalidWords.includes(normalized);
}
