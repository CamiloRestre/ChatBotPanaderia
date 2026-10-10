import json
import logging
import os
import tempfile
import time
from pathlib import Path

import requests
import win32print
from dotenv import load_dotenv

load_dotenv()

SERVER_URL = os.environ["ORDERS_SERVER_URL"].rstrip("/")
API_TOKEN = os.environ["API_TOKEN"]
PRINTER_NAME = os.getenv("PRINTER_NAME", "IMPRESORA DOMICILIOS")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))
ENCODING = os.getenv("PRINTER_ENCODING", "cp850")
STATE_FILE = Path(os.getenv("PRINT_STATE_FILE", "./print_state.json"))
LINE_WIDTH = 32
HTTP_TIMEOUT = (5, 20)
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("domicilios-printer")


def clean_text(value):
    return " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split())


def wrap_text(value, width=LINE_WIDTH):
    text = clean_text(value)
    if not text:
        return [""]
    words = text.split(" ")
    lines = []
    current = ""
    for word in words:
        while len(word) > width:
            if current:
                lines.append(current)
                current = ""
            lines.append(word[:width])
            word = word[width:]
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def line(label, value):
    prefix = f"{label}: "
    available = max(1, LINE_WIDTH - len(prefix))
    values = wrap_text(value, available)
    return [prefix + values[0]] + [f"  {item}" for item in values[1:]]


def money(value):
    if isinstance(value, (int, float)):
        return f"${value:,.0f}".replace(",", ".")
    return clean_text(value)


def build_receipt(order):
    lines = []
    lines.append(("center", "PEDIDO DOMICILIO"))
    lines.append(("bold", f"PEDIDO #{clean_text(order.get('numero'))}"))
    lines.append(("bold", "=" * LINE_WIDTH))
    lines.extend(("normal", item) for item in line("Fecha", order.get("fecha")))
    lines.extend(("normal", item) for item in line("Cliente", order.get("cliente")))
    lines.extend(("normal", item) for item in line("Teléfono", order.get("telefono")))
    lines.extend(("bold", item) for item in line("Dirección", order.get("direccion")))
    if order.get("referencia"):
        lines.extend(("normal", item) for item in line("Referencia", order.get("referencia")))
    lines.append(("normal", "-" * LINE_WIDTH))
    lines.append(("bold", f"{'CANT':<5}{'PRODUCTO':<{LINE_WIDTH - 5}}"))
    lines.append(("normal", "-" * LINE_WIDTH))
    for product in order.get("productos", []):
        quantity = clean_text(product.get("cantidad"))
        name_lines = wrap_text(product.get("nombre"), LINE_WIDTH - 5)
        lines.append(("normal", f"{quantity[:5]:<5}{name_lines[0]}"))
        lines.extend(("normal", f"{'':<5}{item}") for item in name_lines[1:])
    lines.append(("normal", "-" * LINE_WIDTH))
    if order.get("notas"):
        lines.extend(("normal", item) for item in line("Notas", order.get("notas")))
    if order.get("subtotal") is not None:
        lines.extend(("normal", item) for item in line("Subtotal", money(order.get("subtotal"))))
    if order.get("domicilio") is not None:
        lines.extend(("normal", item) for item in line("Domicilio", money(order.get("domicilio"))))
    lines.extend(("bold", item) for item in line("TOTAL", money(order.get("total"))))
    if order.get("paga_con"):
        lines.extend(("normal", item) for item in line("Paga con", money(order.get("paga_con"))))
    lines.extend(("normal", item) for item in line("Pago", order.get("metodo_pago")))
    lines.append(("bold", "=" * LINE_WIDTH))
    lines.extend(("normal", "") for _ in range(4))
    return lines


def encode(text):
    return f"{text}\n".encode(ENCODING, errors="replace")


def print_order(order):
    printer = win32print.OpenPrinter(PRINTER_NAME)
    try:
        win32print.StartDocPrinter(printer, 1, (f"Pedido {order.get('numero')}", None, "RAW"))
        try:
            win32print.StartPagePrinter(printer)
            win32print.WritePrinter(printer, b"\x1b@")
            for style, text in build_receipt(order):
                if style == "center":
                    win32print.WritePrinter(printer, b"\x1ba\x01")
                elif style == "bold":
                    win32print.WritePrinter(printer, b"\x1bE\x01")
                else:
                    win32print.WritePrinter(printer, b"\x1ba\x00\x1bE\x00")
                win32print.WritePrinter(printer, encode(text))
            # ESC/POS cut command; printers without a cutter ignore it.
            win32print.WritePrinter(printer, b"\x1dV\x00")
            win32print.EndPagePrinter(printer)
        finally:
            win32print.EndDocPrinter(printer)
    finally:
        win32print.ClosePrinter(printer)


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"printed_ids": []}
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError(f"No se pudo leer {STATE_FILE}: {error}") from error


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=STATE_FILE.parent, delete=False
    ) as temporary:
        json.dump(state, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(STATE_FILE)


def headers():
    return {"Authorization": f"Bearer {API_TOKEN}"}


def acknowledge(order_id):
    response = requests.post(
        f"{SERVER_URL}/pedidos/{order_id}/impreso",
        headers=headers(),
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()


def process_pending():
    response = requests.get(
        f"{SERVER_URL}/pedidos/pendientes",
        headers=headers(),
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    orders = response.json().get("pedidos", [])
    state = load_state()
    printed_ids = set(state.get("printed_ids", []))

    for order in orders:
        order_id = order.get("id")
        if not order_id:
            logger.error("Pedido sin id recibido; se omite para no perder trazabilidad.")
            continue
        try:
            if order_id not in printed_ids:
                print_order(order)
                printed_ids.add(order_id)
                state["printed_ids"] = sorted(printed_ids)
                save_state(state)
                logger.info("Pedido %s impreso.", order.get("numero", order_id))
            acknowledge(order_id)
            printed_ids.discard(order_id)
            state["printed_ids"] = sorted(printed_ids)
            save_state(state)
            logger.info("Pedido %s marcado como impreso.", order.get("numero", order_id))
        except Exception as error:
            logger.error("No se pudo completar pedido %s: %s", order_id, error)
            state["printed_ids"] = sorted(printed_ids)
            save_state(state)


def main():
    logger.info("Agente iniciado. Impresora configurada: %s", PRINTER_NAME)
    while True:
        try:
            process_pending()
        except Exception as error:
            logger.error("Consulta fallida; se reintentará en %s s: %s", POLL_SECONDS, error)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
