// products.js
// Base de conocimiento de PRODUCTOS de la panadería.
// Todo lo que el bot "sabe" sobre el menú sale de aquí.
// Para agregar, quitar o cambiar precios de un producto, este es el ÚNICO
// archivo que necesitas editar.

export const CATEGORY_LABELS = {
  pan: "Panadería",
  pastel: "Pasteles y tortas",
  postre: "Postres",
  bebida: "Bebidas"
};

// [nombre, categoria, precio, etiquetas]
// etiquetas posibles: "popular", "sin gluten", "vegano",
// "antojo" (porción individual), "cumpleanos" (torta entera / evento),
// "compartir" (formato grande / para varias personas)
const rawProducts = [
  // ---------- PANADERÍA ----------
  ["Pan Francés", "pan", 2500, ["popular"]],
  ["Pan Integral", "pan", 3000, []],
  ["Croissant de Mantequilla", "pan", 4500, ["popular"]],
  ["Croissant de Jamón y Queso", "pan", 6000, []],
  ["Pan de Queso", "pan", 3500, []],
  ["Pandebono", "pan", 2000, ["popular", "sin gluten"]],
  ["Almojábana", "pan", 2200, ["sin gluten"]],
  ["Pan de Yuca", "pan", 2200, ["sin gluten"]],
  ["Mogolla Integral", "pan", 3000, []],
  ["Pan de Chocolate", "pan", 4000, []],

  // ---------- PASTELES Y TORTAS ----------
  ["Torta de Chocolate (porción)", "pastel", 8000, ["antojo"]],
  ["Torta de Chocolate Entera", "pastel", 65000, ["cumpleanos", "compartir"]],
  ["Torta Tres Leches (porción)", "pastel", 8500, ["antojo"]],
  ["Torta Tres Leches Entera", "pastel", 70000, ["cumpleanos", "compartir"]],
  ["Torta Red Velvet (porción)", "pastel", 9000, ["antojo"]],
  ["Torta Red Velvet Entera", "pastel", 75000, ["cumpleanos", "compartir"]],
  ["Cheesecake de Fresa (porción)", "pastel", 9500, ["antojo"]],
  ["Cheesecake de Fresa Entero", "pastel", 80000, ["cumpleanos", "compartir"]],
  ["Torta de Zanahoria (porción)", "pastel", 8000, ["antojo"]],
  ["Torta de Vainilla Personalizada", "pastel", 90000, ["cumpleanos", "compartir"]],

  // ---------- POSTRES ----------
  ["Brownie con Nueces", "postre", 6000, ["antojo", "popular"]],
  ["Milhoja de Arequipe", "postre", 5500, ["antojo"]],
  ["Tiramisú Individual", "postre", 7500, ["antojo"]],
  ["Flan de Caramelo", "postre", 5000, ["antojo", "sin gluten"]],
  ["Arroz con Leche", "postre", 4500, ["antojo", "sin gluten"]],
  ["Galleta de Avena y Chocolate", "postre", 3000, ["antojo", "vegano"]],
  ["Cupcake de Vainilla", "postre", 4000, ["antojo"]],
  ["Cupcake Red Velvet", "postre", 4500, ["antojo"]],
  ["Rollo de Canela", "postre", 5000, ["antojo", "popular"]],
  ["Alfajor de Maicena", "postre", 3500, ["antojo"]],

  // ---------- BEBIDAS ----------
  ["Café Americano", "bebida", 3000, ["popular"]],
  ["Café con Leche", "bebida", 3500, ["popular"]],
  ["Capuchino", "bebida", 4500, []],
  ["Chocolate Caliente", "bebida", 4000, []],
  ["Té Chai", "bebida", 4000, []],
  ["Limonada Natural", "bebida", 4000, ["compartir"]],
  ["Jugo de Mora", "bebida", 4500, []],
  ["Jugo de Mango", "bebida", 4500, []],
  ["Malteada de Chocolate", "bebida", 6000, ["antojo"]]
];

function buildDescription(category, tags) {
  const extras = [];

  if (tags.includes("sin gluten")) extras.push("apto para dietas sin gluten");
  if (tags.includes("vegano")) extras.push("opción vegana");
  if (tags.includes("cumpleanos")) extras.push("ideal para cumpleaños o celebraciones");
  if (tags.includes("compartir")) extras.push("perfecto para compartir");

  const base = `Producto de nuestra sección de ${CATEGORY_LABELS[category]}`;

  return extras.length > 0 ? `${base}, ${extras.join(", ")}.` : `${base}.`;
}

export const products = rawProducts.map(([name, category, price, tags], index) => ({
  id: index + 1,
  name,
  category,
  price,
  tags,
  available: true,
  description: buildDescription(category, tags),
  keywords: [
    name.toLowerCase(),
    name.toLowerCase().replace(/\s+/g, ""),
    category,
    ...tags,
    ...name.toLowerCase().split(" ")
  ]
}));

export function formatPrice(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

export function getProductsByCategory(category) {
  return products.filter(
    (product) => product.available && product.category === category
  );
}
