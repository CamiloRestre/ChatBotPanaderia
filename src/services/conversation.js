// conversation.js
// Lógica completa del bot con flujo de domiciliarios, botones y comando "atrás".

import {
  sendWhatsAppMessage,
  sendWhatsAppList,
  sendWhatsAppButtons
} from "../config/whatsapp.js";
import {
  products,
  formatPrice,
  CATEGORY_LABELS,
  CATEGORY_BY_ID,
  menuPrincipal,
  menuLists,
  NAVIGATION_TARGETS,
  getProductById
} from "../data/products.js";
import { getAiSalesResponse } from "./ai.js";
import { notifyMake } from "./notify.js";

const states = new Map();

const BAKERY_NAME = process.env.BAKERY_NAME || "Panadería Molinos";
const BAKERY_ADDRESS =
  process.env.BAKERY_ADDRESS ||
  "Cra 28 A N. 11B-18, Tuluá, Valle del Cauca, Barrio San Antonio";
const HUMAN_ATTENTION_SCHEDULE =
  process.env.HUMAN_ATTENTION_SCHEDULE || "7:00 a.m. a 7:00 p.m.";

const PAYMENT_INFO = {
  bank: process.env.PAYMENT_BANK || "Nequi",
  accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "3016801729",
  holderName: process.env.PAYMENT_HOLDER_NAME || "Nelson Albeiro Pineda Salazar"
};

const GREETINGS = [
  "hola", "ola", "hoal", "hloa", "holaa", "holaaa", "hoola", "hol", "aloha",
  "buenas", "bunas", "buens", "wenas", "wenass", "buenos dias", "buenos d",
  "buen dia", "buendia", "buenas tardes", "buenas tades", "buenas tardess",
  "buenas noches", "buenas noch", "hey", "hi", "hello", "que tal", "q tal",
  "qtal", "k tal", "saludos", "saludo", "buenos", "buenas y santas", "quiubo",
  "quihubo", "quiubole", "epa", "epale", "que mas", "que hubo", "holi", "holis"
];

const MENU_COMMANDS = [
  "menu", "menú", "mnue", "meu", "men", "mnu", "mwnu", "menu principal",
  "inicio", "empezar", "empezemos", "comenzar", "reiniciar", "reset", "info",
  "informacion", "información", "ayuda", "help", "opciones", "opciones principales",
  "que puedo hacer", "qué puedo hacer", "mostrar menu", "ver menu", "ver opciones"
];

const BACK_COMMANDS = [
  "atras", "atrás", "atraz", "atrass", "atrazz", "volver", "regresar", "regresa",
  "back", "anterior", "previo", "before", "regresar atras", "volver atras", "vover", "bolver"
];

const YES_WORDS = [
  "si", "sí", "s", "yes", "yep", "yap", "sep", "sipi", "claro", "claroo",
  "ok", "okey", "okay", "okis", "dale", "listo", "afirmativo", "correcto",
  "acepto", "aceptar", "confirmo", "confirmar", "por supuesto", "obvio",
  "obviamente", "si señor", "si claro", "asi es", "así es", "otro", "agregar"
];

const NO_WORDS = [
  "no", "n", "nop", "nope", "nel", "neles", "para nada", "nunca", "negativo",
  "cancelar", "cancela", "saltar", "omitir", "luego", "despues", "después",
  "ahorita no", "no gracias", "no por ahora", "continuar", "finalizar"
];

const HUMAN_KEYWORDS = [
  "asesor", "asesora", "humano", "humana", "persona", "agente", "trabajador",
  "hablar con alguien", "hablar con persona", "hablar con humano", "atencion personalizada",
  "atencion humana", "reclamo", "queja", "quejas", "soporte", "ayuda humana",
  "quiero hablar con alguien", "necesito hablar", "me pueden llamar", "necesito ayuda",
  "urge", "urgente"
];

const ORDER_KEYWORDS = [
  "pedido", "pedir", "comprar", "ordenar", "orden", "quiero pedir", "hacer pedido",
  "hacer un pedido", "comprar algo", "quiero comprar", "necesito comprar", "deseo pedir",
  "voy a pedir", "adquirir"
];

const CARD_KEYWORDS = [
  "carta", "catalogo", "menu de productos", "que tienen", "que venden", "productos",
  "ver productos", "ver carta", "ver catalogo", "mostrar productos", "que hay",
  "que ofrecen", "lista de productos", "precios"
];

const HOURS_KEYWORDS = [
  "horario", "horarios", "hora", "a que hora", "cuando abren", "cuando cierran",
  "estan abiertos", "abren hoy", "atienden hoy", "horario de atencion"
];

const LOCATION_KEYWORDS = [
  "ubicacion", "donde estan", "donde queda", "direccion", "como llego",
  "donde los encuentro"
];

const RECOMMEND_KEYWORDS = [
  "recomiendame", "recomienda", "recomiendame algo", "sugerencia", "sugerencias",
  "sugerir", "que me recomiendas", "que me sugieres", "no se que pedir",
  "que me aconsejas", "estoy indeciso", "no me decido"
];

const NEGATIVE_KNOWLEDGE = ["no tengo", "no manejamos", "no vendemos", "no hacemos", "no ofrecemos"];

const ADVANCED_FLOW_STEPS = new Set([
  "CATEGORY_SELECTED", "PRODUCT_LIST_SHOWN", "PRODUCT_FOUND", "ASK_QUANTITY", "ASK_NOTE",
  "ASK_NOTE_TEXT", "ASK_ADD_MORE", "ASK_CUSTOMER_NAME", "ASK_PHONE", "ASK_ADDRESS",
  "ASK_DELIVERY_METHOD", "ASK_NEIGHBORHOOD", "ASK_CONTACT_PHONE", "ASK_OTHER_PHONE",
  "ASK_PAYMENT_METHOD",
  "ASK_RECO_CATEGORY", "ASK_RECO_MOOD",
  "SHOW_RECOMMENDATIONS", "ASK_LEAD_NAME", "ASK_LEAD_NEED"
]);

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()\[\]{}"']/g, "")
    .replace(/\s+/g, " ");
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

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1] + 1, current[j - 1] + 1, previous[j] + 1);
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function isSimilar(input, word, threshold = 0.8) {
  if (!input || !word) return false;

  const normalizedInput = normalize(input);
  const normalizedWord = normalize(word);
  const distance = levenshtein(normalizedInput, normalizedWord);
  const score = 1 - distance / Math.max(normalizedInput.length, normalizedWord.length);

  return score >= threshold;
}

function findBestMatch(input, wordList) {
  if (!input) return null;

  const normalizedInput = normalize(input);
  let bestMatch = null;

  for (const word of wordList) {
    const normalizedWord = normalize(word);

    if (normalizedInput === normalizedWord) {
      return { word, exact: true, score: 1 };
    }

    const distance = levenshtein(normalizedInput, normalizedWord);
    const score = 1 - distance / Math.max(normalizedInput.length, normalizedWord.length);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { word, exact: false, score };
    }
  }

  return bestMatch;
}

function isGreetingLike(text) {
  const match = findBestMatch(text, GREETINGS);
  return Boolean(match && match.score >= 0.8);
}

function isMenuCommand(text) {
  const match = findBestMatch(text, MENU_COMMANDS);
  return Boolean(match && match.score >= 0.8);
}

function isBackCommand(text) {
  const match = findBestMatch(text, BACK_COMMANDS);
  return Boolean(match && match.score >= 0.85);
}

function isYes(text) {
  const match = findBestMatch(text, YES_WORDS);
  return Boolean(match && match.score >= 0.9);
}

function isNo(text) {
  const match = findBestMatch(text, NO_WORDS);
  return Boolean(match && match.score >= 0.9);
}

function isHumanRequest(text) {
  const normalizedText = normalize(text);
  if (HUMAN_KEYWORDS.some((keyword) => normalizedText.includes(normalize(keyword)))) {
    return true;
  }

  const match = findBestMatch(text, HUMAN_KEYWORDS);
  return Boolean(match && match.score >= 0.85);
}

function suggestCorrection(text) {
  if (!text || text.length < 2) return null;

  if (normalize(text) === "hilo") return "Hola";

  const commands = [
    ...GREETINGS.map((word) => ({ text: word, label: word })),
    ...MENU_COMMANDS.slice(0, 3).map((word) => ({ text: word, label: word }))
  ];
  let best = null;

  for (const command of commands) {
    const input = normalize(text);
    const target = normalize(command.text);
    const distance = levenshtein(input, target);
    const score = 1 - distance / Math.max(input.length, target.length);

    if (!best || score > best.score) {
      best = { label: command.label, score };
    }
  }

  if (!best || best.score < 0.55 || best.score >= 0.8) return null;

  return best.label.charAt(0).toUpperCase() + best.label.slice(1);
}

function matchesKeyword(text, keywords) {
  const normalizedText = normalize(text);
  return keywords.some((keyword) => normalizedText.includes(normalize(keyword)));
}

function isExactCommand(text, words) {
  const normalizedText = normalize(text);
  return words.some((word) => normalizedText === normalize(word));
}

// Historial de pasos para el comando "atrás"
const STEPS_HISTORY = {
  MAIN_MENU: null,
  CATEGORY_SELECTED: "MAIN_MENU",
  PRODUCT_LIST_SHOWN: "CATEGORY_SELECTED",
  ASK_QUANTITY: "PRODUCT_LIST_SHOWN",
  ASK_NOTE: "ASK_QUANTITY",
  ASK_ADD_MORE: "ASK_NOTE",
  ASK_CUSTOMER_NAME: "ASK_ADD_MORE",
  ASK_PHONE: "ASK_CUSTOMER_NAME",
  ASK_DELIVERY_METHOD: "ASK_CUSTOMER_NAME",
  ASK_ADDRESS: "ASK_DELIVERY_METHOD",
  ASK_NEIGHBORHOOD: "ASK_ADDRESS",
  ASK_CONTACT_PHONE: "ASK_NEIGHBORHOOD",
  ASK_OTHER_PHONE: "ASK_CONTACT_PHONE",
  ASK_PAYMENT_METHOD: "ASK_CONTACT_PHONE",
  CONFIRM_CANCEL_ORDER: null
};

function getFreshState(phone, extra = {}) {
  const nextState = { step: "MAIN_MENU", cart: [], ...extra };
  states.set(phone, nextState);
  return nextState;
}

async function sendTextAndReturn(phone, text) {
  await sendWhatsAppMessage(phone, text);
  return text;
}

export async function handleIncomingMessage(phone, message, messageType = "text") {
  const rawText = String(message || "").trim();
  const text = normalize(rawText);

  if (!isBotAllowedToRespond()) {
    console.log(`Mensaje recibido fuera del horario del bot. Cliente: ${phone}`);
    return;
  }

  if (!text && messageType === "text") {
    return sendTextAndReturn(
      phone,
      "No alcancé a leer tu mensaje. ¿Me escribes nuevamente, por favor? 😊"
    );
  }

  // Las respuestas interactivas ya fueron convertidas por el webhook a su id
  // (cat_*, nav_* o el id de un producto), así que siguen el flujo textual.
  if (messageType !== "text" && messageType !== "interactive") {
    return sendNonTextResponse(phone, messageType);
  }

  const state = states.get(phone);

  if (state?.step === "CONFIRM_CANCEL_ORDER") {
    return handleCancelConfirmationStep(phone, text, state);
  }

  if (isBackCommand(text)) {
    return handleBack(phone);
  }

  if (state && ADVANCED_FLOW_STEPS.has(state.step) && (isGreetingLike(text) || isMenuCommand(text))) {
    state.previousStep = state.step;
    state.step = "CONFIRM_CANCEL_ORDER";
    states.set(phone, state);
    return sendCancelOrderQuestion(phone);
  }

  if (isExactCommand(text, [...GREETINGS, ...MENU_COMMANDS])) {
    getFreshState(phone);
    return sendMainMenu(phone);
  }

  if (isExactCommand(text, HUMAN_KEYWORDS) || isHumanRequest(text)) {
    return handleHumanHandoff(phone);
  }

  const suggestion = suggestCorrection(text);

  if (!state || state.step === "MAIN_MENU") {
    if (suggestion) {
      states.set(phone, {
        step: "CONFIRM_SUGGESTION",
        cart: state?.cart || [],
        history: [],
        suggestion
      });
      return sendTextAndReturn(
        phone,
        `No estoy seguro de haber entendido 🤔\n\n¿Quisiste decir *${suggestion}*?\n\nResponde *sí* para continuar o escribe *menu* para ver las opciones.`
      );
    }
  }

  if (!state) {
    const foundProducts = searchProducts(text);

    if (foundProducts.length > 0) {
      states.set(phone, {
        step: "PRODUCT_FOUND",
        foundProducts,
        cart: [],
        history: []
      });
      return sendProductSearchResults(phone, foundProducts);
    }

    if (matchesKeyword(text, CARD_KEYWORDS)) {
      const freshState = getFreshState(phone);
      return sendCarta(phone, freshState);
    }

    if (matchesKeyword(text, ORDER_KEYWORDS)) {
      const freshState = getFreshState(phone);
      return askProductName(phone, freshState, "Claro 😊 ¿Qué te gustaría pedir? Escríbeme el nombre del producto, por ejemplo: Croissant, Torta de chocolate, Café.");
    }

    if (matchesKeyword(text, RECOMMEND_KEYWORDS)) {
      const freshState = getFreshState(phone);
      freshState.step = "ASK_RECO_CATEGORY";
      states.set(phone, freshState);
      return sendRecoCategoryQuestion(phone);
    }

    if (matchesKeyword(text, HOURS_KEYWORDS) || matchesKeyword(text, LOCATION_KEYWORDS)) {
      const freshState = getFreshState(phone);
      return handleMainMenuStep(phone, text, rawText, freshState);
    }

    if (matchesKeyword(text, NEGATIVE_KNOWLEDGE)) {
      getFreshState(phone);
      return sendTextAndReturn(phone, "Por ahora no manejamos esa opción. Escribe *menu* para ver lo que sí tenemos disponible.");
    }

    if (shouldUseAi(text)) {
      const newState = { step: "PRODUCT_FOUND", cart: [], history: [] };
      return sendAiHelpOrFallback(phone, text, newState, "PRODUCT_FOUND");
    }

    getFreshState(phone);
    return sendMainMenu(phone);
  }

  switch (state.step) {
    case "CONFIRM_SUGGESTION":
      return handleConfirmSuggestionStep(phone, text, state);

    case "MAIN_MENU":
      return handleMainMenuStep(phone, text, rawText, state);

    case "CATEGORY_SELECTED":
      return handleCategorySelectedStep(phone, text, state);

    case "PRODUCT_LIST_SHOWN":
      return handleProductSelectedStep(phone, text, state);

    case "PRODUCT_FOUND":
      return handleProductFoundStep(phone, text, state);

    case "ASK_QUANTITY":
      return handleQuantityStep(phone, text, state);

    case "ASK_NOTE":
      return handleNoteStep(phone, text, rawText, state);

    case "ASK_NOTE_TEXT":
      return handleNoteTextStep(phone, rawText, state);

    case "ASK_ADD_MORE":
      return handleAddMoreStep(phone, text, state);

    case "ASK_CUSTOMER_NAME":
      return handleCustomerNameStep(phone, rawText, state);

    case "ASK_PHONE":
      return handlePhoneStep(phone, text, rawText, state);

    case "ASK_DELIVERY_METHOD":
      return handleDeliveryMethodStep(phone, text, state);

    case "ASK_ADDRESS":
      return handleAddressStep(phone, rawText, state);

    case "ASK_NEIGHBORHOOD":
      return handleNeighborhoodStep(phone, rawText, state);

    case "ASK_CONTACT_PHONE":
      return handleContactPhoneStep(phone, text, state);

    case "ASK_OTHER_PHONE":
      return handleOtherPhoneStep(phone, rawText, state);

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
      return sendTextAndReturn(
        phone,
        "Ya quedó registrado ✅ Si deseas hacer otro pedido, escribe *menu*."
      );
    }

    default:
      getFreshState(phone);
      return sendMainMenu(phone);
  }
}

async function handleConfirmSuggestionStep(phone, text, state) {
  if (isYes(text)) {
    getFreshState(phone);
    return sendMainMenu(phone);
  }

  if (isNo(text)) {
    getFreshState(phone);
    return sendTextAndReturn(
      phone,
      "No hay problema 😊 Escribe *menu* para ver las opciones."
    );
  }

  getFreshState(phone);
  return sendMainMenu(phone);
}

async function handleCancelConfirmationStep(phone, text, state) {
  if (text === "cancel_order_yes" || isYes(text)) {
    getFreshState(phone);
    return sendMainMenu(phone);
  }

  if (text === "cancel_order_no" || isNo(text)) {
    const previousStep = state.previousStep || "MAIN_MENU";
    state.step = previousStep;
    delete state.previousStep;
    states.set(phone, state);
    return resendStepPrompt(phone, state);
  }

  return sendTextAndReturn(phone, "Responde *sí* para cancelar el pedido o *no* para continuar.");
}

async function sendCancelOrderQuestion(phone) {
  await sendWhatsAppButtons(
    phone,
    "Parece que ya tienes un pedido en curso. ¿Deseas cancelarlo y empezar de nuevo?",
    [
      { id: "cancel_order_yes", title: "Sí, empezar de nuevo" },
      { id: "cancel_order_no", title: "No, continuar" }
    ],
    "Pedido en curso"
  );
  return "confirmación de pedido en curso enviada";
}

function resendStepPrompt(phone, state) {
  switch (state.step) {
    case "CATEGORY_SELECTED":
      return sendCarta(phone, state);
    case "PRODUCT_LIST_SHOWN":
      return state.currentListId
        ? showProductListById(phone, state, state.currentListId)
        : sendCarta(phone, state);
    case "PRODUCT_FOUND":
      return sendTextAndReturn(phone, "Escríbeme el nombre del producto que deseas buscar, o escribe *menu* para ver las opciones.");
    case "ASK_QUANTITY":
      return sendTextAndReturn(phone, `¿Cuántas unidades deseas agregar de *${state.selectedProduct.name}*?`);
    case "ASK_NOTE":
      return sendTextAndReturn(phone, "¿Deseas agregar una nota al producto?");
    case "ASK_NOTE_TEXT":
      return sendTextAndReturn(phone, `Escribe la nota o indicación especial para *${state.selectedProduct.name}*.`);
    case "ASK_ADD_MORE":
      return sendAddMoreButtons(phone, state);
    case "ASK_CUSTOMER_NAME":
      return sendTextAndReturn(phone, "¿Me regalas tu nombre completo, por favor?");
    case "ASK_PHONE":
      return sendTextAndReturn(phone, "¿A qué número te podemos llamar?");
    case "ASK_DELIVERY_METHOD":
      return sendDeliveryMethodQuestion(phone);
    case "ASK_ADDRESS":
      return sendTextAndReturn(phone, "¿Cuál es la dirección de entrega?");
    case "ASK_NEIGHBORHOOD":
      return sendTextAndReturn(phone, "¿En qué barrio queda?");
    case "ASK_PAYMENT_METHOD":
      return sendPaymentQuestion(phone);
    case "ASK_CONTACT_PHONE":
      return sendContactPhoneQuestion(phone, state);
    case "ASK_OTHER_PHONE":
      return sendTextAndReturn(
        phone,
        "Escribe el número de contacto. Ejemplo: 3001234567\n\nSi el domiciliario no encuentra la dirección, lo llamará a este número."
      );
    case "ASK_RECO_CATEGORY":
      return sendRecoCategoryQuestion(phone);
    case "ASK_RECO_MOOD":
      return sendTextAndReturn(phone, "¿Para qué ocasión es?\n\n1. Antojo del día\n2. Cumpleaños o celebración\n3. Para compartir\n4. Lo más pedido");
    default:
      return sendMainMenu(phone);
  }
}

function sendNonTextResponse(phone, messageType) {
  const responses = {
    image: "Recibí tu imagen 📷, pero solo proceso texto. ¿Me escribes lo que necesitas?",
    audio: "Recibí tu audio 🎤, pero solo proceso texto. ¿Me escribes lo que necesitas?",
    voice: "Recibí tu audio 🎤, pero solo proceso texto. ¿Me escribes lo que necesitas?",
    sticker: "¡Bonito sticker! 😄 Solo proceso texto. ¿En qué te ayudo?",
    location: "Recibí tu ubicación 📍. Si quieres pedir a domicilio, escribe *menu*.",
    video: "Recibí tu video 🎥, pero solo proceso texto.",
    document: "Recibí tu documento 📄, pero solo proceso texto."
  };

  return sendTextAndReturn(phone, responses[messageType] || "Recibí tu mensaje, pero solo proceso texto.");
}

// ---------------------------------------------------------------------------
// COMANDO "ATRÁS" — vuelve al paso anterior
// ---------------------------------------------------------------------------
async function handleBack(phone) {
  const state = states.get(phone);

  if (!state || state.step === "MAIN_MENU") {
    return sendTextAndReturn(phone, "Ya estás en el menú principal. Escribe *menu* para ver las opciones.");
  }

  const previousStep = STEPS_HISTORY[state.step];
  console.log("🔙 Cliente tocó Atrás. Volviendo al paso anterior:", previousStep);

  if (!previousStep) {
    return sendTextAndReturn(phone, "No puedo retroceder más. Escribe *menu* para reiniciar.");
  }

  state.step = previousStep;
  states.set(phone, state);

  // Redirigir al paso anterior mandando el prompt correspondiente
  switch (previousStep) {
    case "MAIN_MENU":
      return sendMainMenu(phone);

    case "CATEGORY_SELECTED":
      return sendCarta(phone, state);

    case "PRODUCT_LIST_SHOWN":
      if (state.currentListId) {
        return showProductListById(phone, state, state.currentListId);
      }
      return sendCarta(phone, state);

    case "ASK_QUANTITY":
      if (state.selectedProduct) {
        return sendTextAndReturn(
          phone,
          `Volviste al paso anterior.\n\nProducto: *${state.selectedProduct.name}*\nPrecio: ${formatPrice(state.selectedProduct.price)}\n\n¿Cuántas unidades deseas agregar?`
        );
      }
      return sendMainMenu(phone);

    case "ASK_NOTE":
      return sendTextAndReturn(phone, "¿Deseas agregar una nota al producto?");

    case "ASK_ADD_MORE":
      return sendTextAndReturn(
        phone,
        `${buildCartSummary(state)}\n\n¿Deseas agregar otro producto al pedido?`
      );

    case "ASK_CUSTOMER_NAME":
      return sendTextAndReturn(phone, "¿Me regalas tu nombre, por favor?");

    case "ASK_PHONE":
      return sendTextAndReturn(phone, "¿A qué número te podemos llamar?");
    case "ASK_DELIVERY_METHOD":
      return sendDeliveryMethodQuestion(phone);

    case "ASK_ADDRESS":
      return sendTextAndReturn(phone, "¿Cuál es la dirección de entrega?");

    case "ASK_NEIGHBORHOOD":
      return sendTextAndReturn(phone, "¿En qué barrio queda?");

    case "ASK_PAYMENT_METHOD":
      return sendPaymentQuestion(phone);
    case "ASK_CONTACT_PHONE":
      return sendContactPhoneQuestion(phone, state);
    case "ASK_OTHER_PHONE":
      return sendTextAndReturn(
        phone,
        "Escribe el número de contacto. Ejemplo: 3001234567\n\nSi el domiciliario no encuentra la dirección, lo llamará a este número."
      );

    default:
      return sendMainMenu(phone);
  }
}

// ---------------------------------------------------------------------------
// MENÚ PRINCIPAL
// ---------------------------------------------------------------------------

async function sendMainMenu(phone) {
  getFreshState(phone);
  await sendTextAndReturn(
    phone,
    `¡Hola! 👋 Bienvenido/a a ${BAKERY_NAME}. ¿En qué te puedo ayudar?`
  );

  await sendWhatsAppList(
    phone,
    "Elige una opción principal:",
    "Ver opciones",
    [{
      title: "Opciones principales",
      rows: [
        { id: "menu_ver_carta", title: "Ver la carta", description: "Revisa todos nuestros productos" },
        { id: "menu_recomendar", title: "Recomiéndame algo", description: "Sugerencias según tu antojo" },
        { id: "menu_horarios", title: "Horarios y ubicación", description: "Dirección y horario de atención" },
        { id: "menu_asesor", title: "Hablar con alguien", description: "Atención personalizada" }
      ]
    }],
    `Hola 👋 ${BAKERY_NAME}`
  );

  return "saludo y menú principal enviados";
}

async function handleMainMenuStep(phone, text, rawText, state) {
  if (text === "nav_atras") {
    return sendTextAndReturn(phone, "Ya estás en el menú principal 😊");
  }

  if (CATEGORY_BY_ID[text] || NAVIGATION_TARGETS[text]) {
    return handleCategorySelectedStep(phone, text, state);
  }

  if (getProductById(text.replace(/^prod_/, ""))) {
    return handleProductSelection(phone, text, state);
  }

  if (text === "menu_ver_carta") {
    return sendCarta(phone, state);
  }

  if (text === "menu_recomendar") {
    state.cart = [];
    state.step = "ASK_RECO_CATEGORY";
    states.set(phone, state);
    return sendRecoCategoryQuestion(phone);
  }

  if (text === "menu_horarios") {
    return sendTextAndReturn(
      phone,
      `📍 Estamos en: ${BAKERY_ADDRESS}\n\n🕒 Horario de atención: ${HUMAN_ATTENTION_SCHEDULE}\n\nEscribe *menu* para ver las opciones de nuevo.`
    );
  }

  if (text === "menu_asesor") {
    return handleHumanHandoff(phone);
  }

  if (matchesKeyword(text, CARD_KEYWORDS) || text.includes("menu")) {
    return sendCarta(phone, state);
  }

  if (matchesKeyword(text, ORDER_KEYWORDS)) {
    state.cart = [];
    return askProductName(phone, state, "Claro 😊 ¿Qué te gustaría pedir? Escríbeme el nombre del producto, por ejemplo: Croissant, Torta de chocolate, Café.");
  }

  if (matchesKeyword(text, RECOMMEND_KEYWORDS)) {
    state.cart = [];
    state.step = "ASK_RECO_CATEGORY";
    states.set(phone, state);
    return sendRecoCategoryQuestion(phone);
  }

  if (matchesKeyword(text, HOURS_KEYWORDS) || matchesKeyword(text, LOCATION_KEYWORDS)) {
    return sendTextAndReturn(
      phone,
      `📍 Estamos en: ${BAKERY_ADDRESS}\n\n🕒 Horario de atención: ${HUMAN_ATTENTION_SCHEDULE}\n\nEscribe *menu* para ver las opciones de nuevo.`
    );
  }

  if (isHumanRequest(text)) {
    return handleHumanHandoff(phone);
  }

  const foundProducts = searchProducts(text);

  if (foundProducts.length > 0) {
    states.set(phone, {
      step: "PRODUCT_FOUND",
      foundProducts,
      cart: state.cart || [],
      history: []
    });
    return sendProductSearchResults(phone, foundProducts);
  }

  if (shouldUseAi(text)) {
    return sendAiHelpOrFallback(phone, text, state, "PRODUCT_FOUND");
  }

  return sendTextAndReturn(
    phone,
    `Te entiendo 😊 Para ayudarte mejor, escribe *menu* para ver las opciones.`
  );
}


// ---------------------------------------------------------------------------
// CARTA COMO LISTA — Categorías → Productos
// ---------------------------------------------------------------------------

async function sendCarta(phone, state) {
  await sendWhatsAppList(
    phone,
    "Elige una categoría para ver los productos:",
    "Ver categorías",
    [
      {
        title: "Categorías",
        rows: menuPrincipal.map((category) => ({
          id: category.id,
          title: category.title,
          description: category.description
        }))
      }
    ],
    "📋 Nuestra carta"
  );

  state.step = "CATEGORY_SELECTED";
  state.cart = state.cart || [];
  states.set(phone, state);

  return "carta enviada como lista de categorías";
}

async function handleCategorySelectedStep(phone, text, state) {
  if (text === "nav_atras") {
    return handleListBack(phone, state);
  }

  const category = CATEGORY_BY_ID[text];
  if (category) {
    state.navigationHistory = [];
    state.currentListId = null;
    return showProductListById(phone, state, category.primera_lista);
  }
  if (NAVIGATION_TARGETS[text]) {
    return showProductListById(phone, state, NAVIGATION_TARGETS[text]);
  }
  return handleProductSelection(phone, text, state);
}

async function showProductListByCategory(phone, state, category) {
  return showProductListById(phone, state, CATEGORY_BY_ID[category]?.primera_lista);
}

async function showProductListById(phone, state, listId) {
  const list = menuLists[listId];
  if (!list) return sendTextAndReturn(phone, "No encontré esa lista de productos 😅");

  const history = state.navigationHistory || [];
  if (state.currentListId && state.currentListId !== listId) {
    history.push(state.currentListId);
  }
  state.navigationHistory = history;

  await sendWhatsAppList(
    phone,
    `Estos son los productos de ${list.titulo}:`,
    "Ver productos",
    [
      {
        title: list.titulo,
        rows: list.filas
      }
    ],
    "📋 Productos disponibles"
  );

  state.step = "PRODUCT_LIST_SHOWN";
  state.currentListId = listId;
  states.set(phone, state);

  return "lista de productos enviada";
}

async function handleProductSelectedStep(phone, text, state) {
  if (text === "nav_atras") {
    return handleListBack(phone, state);
  }

  if (NAVIGATION_TARGETS[text]) {
    return showProductListById(phone, state, NAVIGATION_TARGETS[text]);
  }
  return handleProductSelection(phone, text, state);
}

async function handleListBack(phone, state) {
  const previousList = state.navigationHistory?.pop();

  if (previousList) {
    console.log("🔙 Cliente tocó Atrás. Volviendo al paso anterior:", previousList);
    state.currentListId = null;
    return showProductListById(phone, state, previousList);
  }

  console.log("🔙 Cliente tocó Atrás. Volviendo al paso anterior:", "MAIN_MENU");
  state.currentListId = null;
  state.navigationHistory = [];
  return sendCarta(phone, state);
}

async function handleProductSelection(phone, text, state) {
  const product = getProductById(text.replace(/^prod_/, ""));
  if (!product) {
    return sendTextAndReturn(phone, "No encontré ese producto 😅 Escribe *menu* para empezar de nuevo.");
  }

  state.selectedProduct = product;
  state.step = "ASK_QUANTITY";
  states.set(phone, state);

  return sendTextAndReturn(
    phone,
    `Seleccionaste: *${product.name}*\n${product.description}\nPrecio: ${formatPrice(product.price)}\n\n¿Cuántas unidades deseas agregar?\n\n_Escribe "atrás" para volver._`
  );
}

// ---------------------------------------------------------------------------
// BÚSQUEDA Y SELECCIÓN DE PRODUCTO (flujo de texto)
// ---------------------------------------------------------------------------

function buildMenuText() {
  const sections = Object.keys(CATEGORY_LABELS).map((category) => {
    const items = products.filter((p) => p.available && p.category === category);
    const lines = items.map((product) => `• ${product.name} — ${formatPrice(product.price)}`).join("\n");
    return `*${CATEGORY_LABELS[category]}*\n${lines}`;
  });

  return `📋 Esta es nuestra carta:\n\n${sections.join("\n\n")}`;
}

function askProductName(phone, state, message) {
  state.step = "PRODUCT_FOUND";
  state.waitingForProductName = true;
  states.set(phone, state);

  return sendTextAndReturn(phone, message);
}

function offerProductHelp(phone, state) {
  state.step = "PRODUCT_FOUND";
  state.waitingForProductName = true;
  states.set(phone, state);

  return sendTextAndReturn(phone, "No encontré ese producto 😅 Escribe el nombre de otro o escribe *menu* para reiniciar.");
}

async function sendAiHelpOrFallback(phone, text, state, nextStep) {
  let aiResponse = null;

  try {
    aiResponse = await Promise.race([
      getAiSalesResponse(text),
      new Promise((resolve) => setTimeout(() => resolve(null), 10000))
    ]);
  } catch (error) {
    console.error("Error en el fallback de Gemini:", error.message);
  }

  state.step = nextStep;
  state.waitingForProductName = true;
  states.set(phone, state);

  if (aiResponse) {
    return sendTextAndReturn(
      phone,
      `${aiResponse}\n\nEscribe *menu* para ver las opciones.`
    );
  }

  getFreshState(phone);
  return sendMainMenu(phone);
}

async function handleProductFoundStep(phone, text, state) {
  if (state.waitingForProductName) {
    if (text.includes("carta") || text.includes("catalogo")) {
      return sendCarta(phone, state);
    }

    if (text.includes("recomien")) {
      state.step = "ASK_RECO_CATEGORY";
      states.set(phone, state);
      return sendRecoCategoryQuestion(phone);
    }

    if (text.includes("asesor") || text.includes("humano")) {
      return handleHumanHandoff(phone);
    }

    const foundProducts = searchProducts(text);

    if (foundProducts.length === 0) {
      return offerProductHelp(phone, state);
    }

    state.waitingForProductName = false;
    state.foundProducts = foundProducts;
    states.set(phone, state);

    return sendProductSearchResults(phone, foundProducts);
  }

  const selectedProduct = text.startsWith("prod_")
    ? state.foundProducts.find((product) => product.id === text.replace("prod_", ""))
    : null;

  if (!selectedProduct) {
    return sendTextAndReturn(phone, "Por favor elige una presentación usando la lista 😊");
  }

  state.selectedProduct = selectedProduct;
  state.step = "ASK_QUANTITY";
  states.set(phone, state);

  return sendTextAndReturn(
    phone,
    `Seleccionaste: *${selectedProduct.name}*\nPrecio: ${formatPrice(selectedProduct.price)}\n\n¿Cuántas unidades deseas agregar?\n\n_Escribe "atrás" para volver._`
  );
}

async function sendProductSearchResults(phone, foundProducts) {
  await sendWhatsAppList(
    phone,
    "Encontré estas opciones. Elige la presentación que deseas:",
    "Elegir producto",
    [{
      title: "Productos",
      rows: foundProducts.slice(0, 10).map((product) => ({
        id: `prod_${product.id}`,
        title: product.name,
        description: `${formatPrice(product.price)} · ${product.description}`
      }))
    }],
    "Presentaciones"
  );
  return "lista de coincidencias enviada";
}

// ---------------------------------------------------------------------------
// CANTIDAD → NOTA → AGREGAR MÁS
// ---------------------------------------------------------------------------

async function handleQuantityStep(phone, text, state) {
  const quantity = Number(text);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return sendTextAndReturn(phone, "Por favor dime cuántas unidades deseas. Ejemplo: 1, 2, 3...\n\n_Escribe \"atrás\" para volver._");
  }

  state.pendingQuantity = quantity;
  state.step = "ASK_NOTE";
  states.set(phone, state);

  await sendWhatsAppButtons(
    phone,
    `Perfecto, ${quantity} unidad(es) de *${state.selectedProduct.name}*.\n\n¿Deseas agregar alguna nota o indicación especial?`,
    [
      { id: "note_no", title: "No, sin notas" },
      { id: "note_yes", title: "Sí, agregar nota" }
    ],
    "📝 Nota del producto"
  );

    return "pregunta nota enviada";
}

async function handleNoteStep(phone, text, rawText, state) {
  if (text === "note_no" || text === "no" || text.includes("sin nota")) {
    state.note = null;
    addProductToCart(state, state.selectedProduct, state.pendingQuantity, state.note);
    state.pendingQuantity = null;
    state.step = "ASK_ADD_MORE";
    states.set(phone, state);

    return sendAddMoreButtons(phone, state);
  }

  if (text === "note_yes" || text === "si" || text === "sí" || text.includes("agregar nota")) {
    state.step = "ASK_NOTE_TEXT";
    states.set(phone, state);
    return sendTextAndReturn(phone, `Escribe la nota o indicación especial para *${state.selectedProduct.name}*.\n\n_Escribe "atrás" para volver._`);
  }

  // Por si escriben la nota directamente sin pulsar el botón
  state.note = text.trim();
  addProductToCart(state, state.selectedProduct, state.pendingQuantity, state.note);
  state.pendingQuantity = null;
  state.step = "ASK_ADD_MORE";
  states.set(phone, state);

  return sendAddMoreButtons(phone, state);
}

async function handleNoteTextStep(phone, rawText, state) {
  const note = rawText.trim();

  if (note.length < 1) {
    return sendTextAndReturn(phone, "Por favor escribe la nota o indicación.\n\n_Escribe \"atrás\" para volver._");
  }

  state.note = note;
  addProductToCart(state, state.selectedProduct, state.pendingQuantity, state.note);
  state.pendingQuantity = null;
  state.step = "ASK_ADD_MORE";
  states.set(phone, state);

  return sendAddMoreButtons(phone, state);
}

async function sendAddMoreButtons(phone, state) {
  await sendWhatsAppButtons(
    phone,
    `${buildCartSummary(state)}\n\n¿Qué deseas hacer ahora?`,
    [
      { id: "add_more", title: "Agregar producto" },
      { id: "finalize", title: "Finalizar orden" }
    ],
    "🛒 Tu pedido"
  );

  return "botones agregar/finalizar enviados";
}

async function handleAddMoreStep(phone, text, state) {
  if (text === "add_more" || isYes(text)) {
    return askProductName(phone, state, "Perfecto 😊 ¿Qué otro producto deseas agregar? Escríbeme el nombre o escribe *menu* para ver la carta.");
  }

  if (text === "finalize" || isNo(text)) {
    state.step = "ASK_CUSTOMER_NAME";
    states.set(phone, state);

    return sendTextAndReturn(
      phone,
      `${buildCartSummary(state)}\n\nPara registrar tu pedido necesito algunos datos.\n\n¿Me regalas tu *nombre completo*, por favor?\n\n_Escribe "atrás" para volver._`
    );
  }

  return sendAddMoreButtons(phone, state);
}

// ---------------------------------------------------------------------------
// CARRITO
// ---------------------------------------------------------------------------

function addProductToCart(state, product, quantity, note) {
  if (!state.cart) state.cart = [];

  const existingItem = state.cart.find((item) => item.product.id === product.id && (item.note || null) === (note || null));

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    state.cart.push({ product, quantity, note: note || null });
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

function buildCartSummary(state) {
  calculateCartTotals(state);

  const cartLines = state.cart
    .map((item, index) => {
      const note = item.note ? `\n   📝 ${item.note}` : "";
      return `${index + 1}. ${item.product.name} x${item.quantity} — ${formatPrice(item.subtotal)}${note}`;
    })
    .join("\n");

  return `🛒 Tu pedido:\n\n${cartLines}\n\nTotal: ${formatPrice(state.totalPrice)}`;
}

// ---------------------------------------------------------------------------
// DATOS DEL CLIENTE — Nombre, teléfono, dirección, barrio
// ---------------------------------------------------------------------------

function handleCustomerNameStep(phone, rawText, state) {
  const name = rawText.trim();

  if (name.length < 2 || isInvalidText(name)) {
    return sendTextAndReturn(phone, "Por favor escríbeme tu nombre completo. Ejemplo: Fabián Pérez 😊\n\n_Escribe \"atrás\" para volver._");
  }

  state.customerName = capitalizeWords(name);
  state.step = "ASK_DELIVERY_METHOD";
  states.set(phone, state);

  return sendDeliveryMethodQuestion(phone);
}

async function sendDeliveryMethodQuestion(phone) {
  await sendWhatsAppButtons(
    phone,
    "¿Cómo deseas recibir tu pedido?",
    [
      { id: "delivery_pickup", title: "Recoger en panadería" },
      { id: "delivery_home", title: "Domicilio" }
    ],
    "🚚 Método de entrega"
  );
  return "pregunta de entrega enviada";
}

function handleDeliveryMethodStep(phone, text, state) {
  if (text === "delivery_pickup") {
    state.deliveryMethod = "recoger";
    state.step = "ASK_PAYMENT_METHOD";
    states.set(phone, state);
    return sendPaymentQuestion(phone);
  }

  if (text === "delivery_home") {
    state.deliveryMethod = "domicilio";
    state.step = "ASK_ADDRESS";
    states.set(phone, state);
    return sendTextAndReturn(
      phone,
      `Gracias, ${state.customerName} 😊\n\nDime la *dirección de entrega* (calle, carrera, número, torre, apto, etc.):\n\nEjemplo: Calle 10 # 20-30, Torre 2, Apto 301\n\n_Escribe "atrás" para volver._`
    );
  }

  return sendDeliveryMethodQuestion(phone);
}

function handlePhoneStep(phone, text, rawText, state) {
  // Si responde "mismo" o "este", usar el mismo número de WhatsApp
  if (text === "mismo" || text === "este" || text === "mi numero" || text === "el mismo") {
    state.contactPhone = phone;
  } else {
    const cleanNumber = rawText.replace(/[^\d]/g, "");

    if (cleanNumber.length < 7) {
      return sendTextAndReturn(
        phone,
        `No entendí bien el número. Escríbelo completo, por ejemplo: 3001234567.\n\nO escribe *mismo* para usar este WhatsApp (${phone}).\n\n_Escribe "atrás" para volver._`
      );
    }

    state.contactPhone = cleanNumber;
  }

  state.step = "ASK_ADDRESS";
  states.set(phone, state);

  return sendTextAndReturn(
    phone,
    `Perfecto 📞\n\nAhora dime la *dirección de entrega* (calle, carrera, número, torre, apto, etc.):\n\nEjemplo: Calle 10 # 20-30, Torre 2, Apto 301\n\n_Escribe "atrás" para volver._`
  );
}

function handleAddressStep(phone, rawText, state) {
  const address = rawText.trim();

  if (address.length < 5 || isInvalidText(address)) {
    return sendTextAndReturn(
      phone,
      `Por favor escríbeme una dirección más completa.\n\nEjemplo: Calle 10 # 20-30, Torre 2, Apto 301\n\n_Escribe "atrás" para volver._`
    );
  }

  state.address = capitalizeWords(address);
  state.step = "ASK_NEIGHBORHOOD";
  states.set(phone, state);

  return sendTextAndReturn(
    phone,
    `Anotado ✅\n\n¿En qué *barrio* queda?\n\n_Escribe "atrás" para volver._`
  );
}

function handleNeighborhoodStep(phone, rawText, state) {
  const neighborhood = rawText.trim();

  if (neighborhood.length < 2 || isInvalidText(neighborhood)) {
    return sendTextAndReturn(
      phone,
      `Por favor escríbeme el nombre del barrio.\n\n_Escribe "atrás" para volver._`
    );
  }

  state.neighborhood = capitalizeWords(neighborhood);
  state.step = "ASK_CONTACT_PHONE";
  states.set(phone, state);

  return sendContactPhoneQuestion(phone, state);
}

async function sendContactPhoneQuestion(phone, state) {
  await sendWhatsAppButtons(
    phone,
    `¿A qué número te podemos llamar si el domiciliario no encuentra la dirección?\n\nUsar este WhatsApp: ${phone}\n\nSi el domiciliario no encuentra la dirección, lo llamará a este número.`,
    [
      { id: "tel_mismo", title: "Usar este WhatsApp" },
      { id: "tel_otro", title: "Dar otro número" }
    ],
    "📞 Teléfono de contacto"
  );

  return "pregunta de teléfono de contacto enviada";
}

function handleContactPhoneStep(phone, text, state) {
  if (text === "tel_mismo") {
    state.contactPhone = phone;
    console.log("📞 Teléfono de contacto guardado:", state.contactPhone);
    state.step = "ASK_PAYMENT_METHOD";
    states.set(phone, state);
    return sendPaymentQuestion(phone);
  }

  if (text === "tel_otro") {
    state.step = "ASK_OTHER_PHONE";
    states.set(phone, state);
    return sendTextAndReturn(
      phone,
      "Escribe el número de contacto. Ejemplo: 3001234567\n\nSi el domiciliario no encuentra la dirección, lo llamará a este número.\n\n_Escribe \"atrás\" para volver._"
    );
  }

  return sendContactPhoneQuestion(phone, state);
}

function handleOtherPhoneStep(phone, rawText, state) {
  const contactPhone = rawText.replace(/[^\d]/g, "");

  if (contactPhone.length < 10) {
    return sendTextAndReturn(
      phone,
      "El número debe tener al menos 10 dígitos. Ejemplo: 3001234567.\n\n_Escribe \"atrás\" para volver._"
    );
  }

  state.contactPhone = contactPhone;
  console.log("📞 Teléfono de contacto guardado:", state.contactPhone);
  state.step = "ASK_PAYMENT_METHOD";
  states.set(phone, state);

  return sendPaymentQuestion(phone);
}

async function sendPaymentQuestion(phone) {
  await sendWhatsAppButtons(
    phone,
    "¿Cómo prefieres pagar tu pedido?",
    [
      { id: "pay_cash", title: "Efectivo" },
      { id: "pay_transfer", title: "Transferencia" }
    ],
    "💵 Método de pago"
  );

  return "pregunta de pago enviada";
}

// ---------------------------------------------------------------------------
// PAGO Y CONFIRMACIÓN FINAL
// ---------------------------------------------------------------------------

async function handlePaymentMethodStep(phone, text, state) {
  let paymentMethod = null;

  if (text === "pay_cash" || text.includes("efectivo")) {
    paymentMethod = "efectivo";
  } else if (text === "pay_transfer" || text.includes("transferencia")) {
    paymentMethod = "transferencia";
  }

  if (!paymentMethod) {
    return sendTextAndReturn(
      phone,
      "Elige una opción usando los botones de transferencia o efectivo.\n\n_Escribe \"atrás\" para volver._"
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
    contactPhone: state.contactPhone,
    address: state.address,
    neighborhood: state.neighborhood,
    paymentMethod: state.paymentMethod,
    items: state.cart.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      note: item.note || null,
      subtotal: item.subtotal
    })),
    total: state.totalPrice
  };

  console.log("\n📦 PEDIDO NUEVO");
  console.log(JSON.stringify(orderPayload, null, 2));
  console.log("Estado: pendiente de confirmación\n");

  await notifyMake("nuevo_pedido", orderPayload);

  const paymentLine = paymentMethod === "transferencia"
    ? `💳 Pago: Transferencia\n\nTransfiere a:\n${PAYMENT_INFO.bank} — ${PAYMENT_INFO.accountNumber}\nTitular: ${PAYMENT_INFO.holderName}\n\nEnvía el comprobante por este chat.`
    : `💵 Pago: Efectivo contraentrega`;

  return sendTextAndReturn(
    phone,
    `Listo, ${state.customerName} ✅ Tu pedido quedó registrado:\n\n${buildCartSummary(state)}\n\n📋 *Datos de entrega*\n👤 Nombre: ${state.customerName}\n📞 Llamar al: ${state.contactPhone}\n🏠 Dirección: ${state.address}\n📍 Barrio: ${state.neighborhood}\n\n${paymentLine}\n\nGracias por preferir a ${BAKERY_NAME} 🥐`
  );
}

// ---------------------------------------------------------------------------
// RECOMENDACIONES
// ---------------------------------------------------------------------------

async function sendRecoCategoryQuestion(phone) {
  await sendWhatsAppList(
    phone,
    "¿Qué se te antoja hoy? 😊",
    "Elegir categoría",
    [{
      title: "Recomendaciones",
      rows: [
        { id: "reco_cat_pan", title: "Pan", description: "Panes y productos de panadería" },
        { id: "reco_cat_tortas", title: "Pasteles o tortas", description: "Tortas y porciones" },
        { id: "reco_cat_postres", title: "Postres", description: "Algo dulce para disfrutar" },
        { id: "reco_cat_bebidas", title: "Bebidas", description: "Maltas, gaseosas y bebidas" },
        { id: "reco_cat_sorpresa", title: "Sorpréndeme", description: "Elige por mí" }
      ]
    }],
    "✨ Recomendaciones"
  );
  return "lista de categorías de recomendación enviada";
}

function handleRecoCategoryStep(phone, text, state) {
  const category = parseRecoCategory(text);

  if (!category) {
    return sendRecoCategoryQuestion(phone);
  }

  state.recoCategory = category;
  state.step = "ASK_RECO_MOOD";
  states.set(phone, state);

  return sendRecoMoodQuestion(phone);
}

function handleRecoMoodStep(phone, text, state) {
  const mood = parseRecoMood(text);

  if (!mood) {
    return sendRecoMoodQuestion(phone);
  }

  state.recoMood = mood;

  const recommendedProducts = getRecommendations(state);

  state.recommendedProducts = recommendedProducts;
  state.step = "SHOW_RECOMMENDATIONS";
  states.set(phone, state);

  return sendRecommendationsList(phone, recommendedProducts);
}

async function sendRecoMoodQuestion(phone) {
  await sendWhatsAppList(
    phone,
    "¿Para qué ocasión es?",
    "Elegir ocasión",
    [{
      title: "Ocasiones",
      rows: [
        { id: "reco_mood_antojo", title: "Antojo del día", description: "Porciones individuales" },
        { id: "reco_mood_cumpleanos", title: "Cumpleaños", description: "Para una celebración" },
        { id: "reco_mood_compartir", title: "Para compartir", description: "Familia u oficina" },
        { id: "reco_mood_populares", title: "No sé", description: "Muéstrame lo más pedido" }
      ]
    }],
    "🎉 Ocasión"
  );
  return "lista de ocasiones enviada";
}

async function sendRecommendationsList(phone, recommendedProducts) {
  await sendWhatsAppList(
    phone,
    "Según lo que me cuentas, esto te puede gustar. Elige uno:",
    "Ver recomendaciones",
    [{
      title: "Recomendados",
      rows: recommendedProducts.map((product) => ({
        id: `prod_${product.id}`,
        title: product.name,
        description: `${formatPrice(product.price)} · ${product.description}`
      }))
    }],
    "⭐ Para ti"
  );
  return "lista de recomendaciones enviada";
}

function handleRecommendationSelectionStep(phone, text, state) {
  const selectedProduct = text.startsWith("prod_")
    ? state.recommendedProducts.find((product) => product.id === text.replace("prod_", ""))
    : null;

  if (!selectedProduct) {
    return sendRecommendationsList(phone, state.recommendedProducts || []);
  }

  state.selectedProduct = selectedProduct;
  state.step = "ASK_QUANTITY";
  states.set(phone, state);

  return sendTextAndReturn(
    phone,
    `Seleccionaste: *${selectedProduct.name}*\nPrecio: ${formatPrice(selectedProduct.price)}\n\n¿Cuántas unidades deseas agregar?\n\n_Escribe "atrás" para volver._`
  );
}

function getRecommendations(state) {
  const categoryGroups = {
    pan: ["cat_panaderia_tradicional", "cat_hojaldres_especiales", "cat_donas_reposteria"],
    tortas: ["cat_tortas"],
    postres: ["cat_postres"],
    bebidas: ["cat_maltas_bebidas", "cat_alpina", "cat_postobon", "cat_coca_cola"]
  };
  const selectedCategories = categoryGroups[state.recoCategory] || [];
  const byCategory = state.recoCategory === "sorpresa"
    ? products
    : products.filter((p) => selectedCategories.includes(p.category));

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
  if (text === "reco_cat_pan" || text.includes("pan")) return "pan";
  if (text === "reco_cat_tortas" || text.includes("pastel") || text.includes("torta")) return "tortas";
  if (text === "reco_cat_postres" || text.includes("postre")) return "postres";
  if (text === "reco_cat_bebidas" || text.includes("bebida")) return "bebidas";
  if (text === "reco_cat_sorpresa" || text.includes("sorprend")) return "sorpresa";
  return null;
}

function parseRecoMood(text) {
  if (text === "reco_mood_antojo" || text.includes("antojo")) return "antojo";
  if (text === "reco_mood_cumpleanos" || text.includes("cumple")) return "cumpleanos";
  if (text === "reco_mood_compartir" || text.includes("compartir")) return "compartir";
  if (text === "reco_mood_populares" || text.includes("no se") || text.includes("pedido")) return "populares";
  return null;
}

// ---------------------------------------------------------------------------
// HABLAR CON UNA PERSONA DEL EQUIPO
// ---------------------------------------------------------------------------

function handleHumanHandoff(phone) {
  states.set(phone, { step: "ASK_LEAD_NAME", cart: [], history: [] });

  return sendTextAndReturn(
    phone,
    `Claro 😊 Puedo dejar tu solicitud registrada para que alguien del equipo te escriba.\n\nNuestro horario de atención es de ${HUMAN_ATTENTION_SCHEDULE}.\n\n¿Me regalas tu nombre, por favor?`
  );
}

function handleLeadNameStep(phone, rawText, state) {
  const name = rawText.trim();

  if (name.length < 2) {
    return sendTextAndReturn(phone, "¿Me regalas tu nombre, por favor? 😊");
  }

  state.customerName = capitalizeWords(name);
  state.step = "ASK_LEAD_NEED";
  states.set(phone, state);

  return sendTextAndReturn(phone, `Gracias, ${state.customerName}. ¿En qué te podemos ayudar?`);
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

  return sendTextAndReturn(
    phone,
    `Gracias, ${state.customerName} ✅ Dejamos tu solicitud registrada:\n\n${state.need}\n\nAlguien del equipo revisará este chat en horario de atención. Gracias por escribirnos 😊`
  );
}

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------

function searchProducts(text) {
  const normalizedText = normalize(text);

  return products
    .filter((product) => {
      if (!product.available) return false;

      const searchableText = normalize(
        [
          product.name,
          CATEGORY_LABELS[product.category],
          product.category,
          ...product.tags,
          ...product.keywords
        ].join(" ")
      );

      if (searchableText.includes(normalizedText) || normalizedText.includes(normalize(product.name))) {
        return true;
      }

      return searchableText
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .some((word) => isSimilar(normalizedText, word, 0.72));
    })
    .slice(0, 10);
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
    "quiero", "busco", "recomienda", "recomiendame", "recomiéndame",
    "cumpleanos", "cumpleaños", "cumple", "sin gluten", "gluten",
    "vegano", "alergia", "dulce", "salado", "economico", "barato",
    "compartir", "personas", "cual es", "cuál es", "mejor", "rico",
    "rica", "antojo", "domicilio", "hacen", "tienen", "como", "cuando", "donde",
    "por que", "personalizada", "encargo"
  ];

  return aiKeywords.some((word) => text.includes(word)) || text.split(" ").length >= 4;
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
