import menu from "./menu_whatsapp_molinos.json" with { type: "json" };

export const menuPrincipal = menu.menu_principal;
export const menuLists = menu.listas;

export const CATEGORY_LABELS = Object.fromEntries(
  menuPrincipal.map((category) => [category.id, category.title])
);

export const CATEGORY_BY_ID = Object.fromEntries(
  menuPrincipal.map((category) => [category.id, category])
);

export const NAVIGATION_TARGETS = Object.fromEntries(
  Object.values(menuLists)
    .flatMap((list) => list.filas)
    .filter((row) => row.id.startsWith("nav_"))
    .map((row) => [row.id, {
      "nav_pan_abuela": "1B",
      "nav_hojaldres_y_pastelitos": "2B",
      "nav_dulces_e_integrales": "2C",
      "nav_tortas_medio_tres_cuartos_y_1_libra": "4B",
      "nav_otras_bebidas": "6B",
      "nav_avenas_leches_y_mas": "7B",
      "nav_energia_e_hidratacion": "8B",
      "nav_aguas_te_y_mas": "8C",
      "nav_jugos_y_aguas": "9B"
    }[row.id]])
);

function priceFromId(id) {
  const price = Number(id.match(/_(\d+)$/)?.[1]);
  return Number.isFinite(price) ? price : null;
}

function fullName(row) {
  const descriptionName = row.description?.split(" · $")[0];
  return descriptionName && descriptionName !== row.description
    ? descriptionName
    : row.title;
}

function tagsFor(product) {
  const normalized = product.name.toLowerCase();
  return [
    ...(normalized.includes("torta") ? ["cumpleanos", "compartir"] : []),
    ...(normalized.includes("porcion") || normalized.includes("vaso") ? ["antojo"] : [])
  ];
}

export const products = Object.entries(menuLists).flatMap(([listId, list]) =>
  list.filas
    .filter((row) => !row.id.startsWith("nav_"))
    .map((row) => {
      const name = fullName(row);
      const category = menuPrincipal.find((item) => item.primera_lista === listId)?.id || listId;
      return {
        id: row.id,
        name,
        category,
        listId,
        price: priceFromId(row.id),
        tags: tagsFor({ name }),
        available: true,
        description: row.description,
        keywords: [
          name.toLowerCase(),
          row.title.toLowerCase(),
          row.description.toLowerCase(),
          category,
          list.titulo.toLowerCase(),
          ...name.toLowerCase().split(/\s+/)
        ]
      };
    })
);

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

export function getListRows(listId) {
  return menuLists[listId]?.filas || [];
}

export function getProductById(id) {
  return products.find((product) => product.id === id) || null;
}
