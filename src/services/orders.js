import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ override: true });

const dataDirectory = process.env.ORDERS_DATA_DIR || path.join(process.cwd(), "data");
const ordersFile = path.join(dataDirectory, "pedidos.json");
let writeQueue = Promise.resolve();

const requiredFields = [
  "numero",
  "cliente",
  "telefono",
  "direccion",
  "productos",
  "total",
  "metodo_pago"
];

function normalizeOrder(payload) {
  const order = payload && typeof payload === "object" ? payload : {};
  const missing = requiredFields.filter((field) => {
    if (field === "productos") return !Array.isArray(order[field]);
    return order[field] === undefined || order[field] === null || String(order[field]).trim() === "";
  });

  if (missing.length > 0) {
    const error = new Error(`Faltan campos obligatorios: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  if (order.productos.length === 0 || order.productos.some(
    (product) => !product || product.cantidad === undefined || !String(product.nombre || "").trim()
  )) {
    const error = new Error("productos debe contener cantidad y nombre en cada elemento.");
    error.statusCode = 400;
    throw error;
  }

  return {
    numero: String(order.numero).trim(),
    fecha: order.fecha ? String(order.fecha) : new Date().toISOString(),
    cliente: String(order.cliente ?? "").trim(),
    telefono: String(order.telefono ?? "").trim(),
    direccion: String(order.direccion ?? "").trim(),
    referencia: String(order.referencia ?? "").trim(),
    neighborhood: String(order.neighborhood ?? "").trim(),
    deliveryMethod: String(order.deliveryMethod ?? "").trim(),
    productos: order.productos.map((product) => ({
      cantidad: String(product.cantidad).trim(),
      nombre: String(product.nombre).trim(),
      nota: String(product.nota ?? "").trim()
    })),
    notas: String(order.notas ?? "").trim(),
    metodo_pago: String(order.metodo_pago).trim(),
    subtotal: order.subtotal ?? null,
    domicilio: order.domicilio ?? order.deliveryCost ?? null,
    total: order.total,
    paga_con: order.paga_con === undefined || order.paga_con === null
      ? ""
      : String(order.paga_con).trim()
  };
}

async function readOrders() {
  try {
    const content = await fs.readFile(ordersFile, "utf8");
    const orders = JSON.parse(content);
    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function enqueueWrite(operation) {
  const next = writeQueue.then(operation);
  writeQueue = next.catch(() => {});
  return next;
}

async function writeOrders(orders) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${ordersFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, ordersFile);
}

export async function createOrder(payload) {
  const order = normalizeOrder(payload);
  return enqueueWrite(async () => {
    const orders = await readOrders();
    const savedOrder = {
      id: crypto.randomUUID(),
      ...order,
      estado: "pendiente",
      creado_en: new Date().toISOString()
    };
    orders.push(savedOrder);
    await writeOrders(orders);
    return savedOrder;
  });
}

export async function listPendingOrders() {
  return readOrders().then((orders) => orders.filter((order) => order.estado === "pendiente"));
}

export async function markOrderAsPrinted(id) {
  return enqueueWrite(async () => {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === id);
    if (!order) return null;
    if (order.estado !== "impreso") {
      order.estado = "impreso";
      order.impreso_en = new Date().toISOString();
      await writeOrders(orders);
    }
    return order;
  });
}
