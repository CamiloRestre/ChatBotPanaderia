import menu from "../src/data/menu_whatsapp_molinos.json" with { type: "json" };
import { products } from "../src/data/products.js";

const errors = [];
const ids = new Set();
const addId = (id, location) => {
  if (ids.has(id)) errors.push(`id duplicado "${id}" (${location})`);
  ids.add(id);
};

for (const category of menu.menu_principal) {
  addId(category.id, "menu_principal");
  if (!menu.listas[category.primera_lista]) {
    errors.push(`la categoría "${category.id}" apunta a una lista inexistente "${category.primera_lista}"`);
  }
}

const navigationTargets = {
  nav_pan_abuela: "1B",
  nav_hojaldres_y_pastelitos: "2B",
  nav_dulces_e_integrales: "2C",
  nav_tortas_medio_tres_cuartos_y_1_libra: "4B",
  nav_otras_bebidas: "6B",
  nav_avenas_leches_y_mas: "7B",
  nav_energia_e_hidratacion: "8B",
  nav_aguas_te_y_mas: "8C",
  nav_jugos_y_aguas: "9B"
};

for (const [listId, list] of Object.entries(menu.listas)) {
  if (list.filas.length > 10) errors.push(`la lista "${listId}" tiene ${list.filas.length} filas; el máximo es 10`);
  for (const row of list.filas) {
    addId(row.id, `lista ${listId}`);
    if (row.title.length > 24) errors.push(`el título "${row.id}" supera 24 caracteres`);
    if (row.description.length > 72) errors.push(`la descripción "${row.id}" supera 72 caracteres`);
    if (row.id.startsWith("nav_") && !menu.listas[navigationTargets[row.id]]) {
      errors.push(`"${row.id}" apunta a una lista inexistente`);
    }
  }
}

for (const product of products) {
  if (!Number.isFinite(product.price)) errors.push(`el producto "${product.id}" no tiene precio numérico`);
}

if (errors.length) {
  console.error(`Validación del menú fallida (${errors.length} errores):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Menú válido: ${menu.menu_principal.length} categorías, ${products.length} productos y ${Object.keys(menu.listas).length} listas.`);
