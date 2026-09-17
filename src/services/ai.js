// ai.js
// Este módulo SOLO se usa cuando el mensaje del cliente no calza con ninguna
// opción de la base de conocimientos (menu, búsqueda de producto, etc.).
// Es el "plan B" para preguntas libres, usando la API gratuita de Gemini.

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { products, formatPrice, CATEGORY_LABELS } from "../data/products.js";   

dotenv.config({ override: true });

const BAKERY_NAME = process.env.BAKERY_NAME || "Panadería Dulce Hogar";

// La API KEY de Gemini se lee desde la variable de entorno GEMINI_API_KEY
// (ver .env.example). Nunca se escribe la key directamente en el código.
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

function getCatalogContext() {
  return products
    .map((product) => {
      return `- ${product.name} | Categoría: ${CATEGORY_LABELS[product.category]} | Precio: ${formatPrice(product.price)}${
        product.tags.length ? ` | Etiquetas: ${product.tags.join(", ")}` : ""
      }`;
    })
    .join("\n");
}

export async function getAiSalesResponse(userMessage) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.log("Gemini no configurado. Se usa flujo normal.");
      return null;
    }

    const catalogContext = getCatalogContext();

    const prompt = `
Eres una asesora virtual de ${BAKERY_NAME}, una panadería.

Tu objetivo es ayudar a vender de forma amable, clara y natural por WhatsApp.

REGLAS OBLIGATORIAS:
- No inventes productos.
- No inventes precios.
- No inventes disponibilidad exacta.
- No confirmes pedidos.
- No pidas pagos directamente.
- No digas que un producto está disponible con seguridad si no está en el catálogo.
- Usa solamente productos del catálogo entregado.
- Si recomiendas, recomienda máximo 3 productos.
- Si el cliente quiere pedir algo, dile que escriba el nombre del producto para agregarlo al pedido.
- Responde breve, cálida y de forma cercana, en español colombiano.
- Si el cliente está indeciso, ayúdalo a escoger según lo que menciona (antojo, ocasión, si quiere algo dulce o salado, para compartir, etc.).
- Si no estás segura de algo (por ejemplo alergias o ingredientes exactos), ofrece que pida hablar con una persona del equipo.

CATÁLOGO DISPONIBLE:
${catalogContext}

MENSAJE DEL CLIENTE:
"${userMessage}"

Responde como asesora de WhatsApp en español colombiano.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt
    });

    const text = response.text;

    if (!text) {
      return null;
    }

    return text.trim();
  } catch (error) {
    console.error("\n⚠️ Gemini no respondió. El bot seguirá con el flujo normal.");

    if (error.message) {
      console.error("Detalle:", error.message);
    }

    return null;
  }
}
