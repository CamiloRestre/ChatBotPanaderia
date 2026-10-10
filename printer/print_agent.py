import json
import logging
import os
import tempfile
import time
from datetime import datetime
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


def format_date(value):
    """Format an ISO date as dd/mm/aaaa hh:mm for the receipt."""
    raw_value = clean_text(value)
    if not raw_value:
        return ""

    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        return parsed.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return raw_value


def add_labeled_lines(lines, label, value, style="normal"):
    lines.extend((style, item) for item in line(label, value))


def build_receipt(order):
    delivery_method = clean_text(
        order.get("deliveryMethod") or order.get("metodo_entrega")
    ).lower()
    is_delivery = "domicilio" in delivery_method
    order_type = "PEDIDO DOMICILIO" if is_delivery else "PEDIDO RECOGER"
    domicilio = order.get("deliveryCost")
    if domicilio is None:
        domicilio = order.get("domicilio")

    lines = []
    lines.append(("center", order_type))
    lines.append(("bold", f"PEDIDO #{clean_text(order.get('numero'))}"))
    lines.append(("bold", "=" * LINE_WIDTH))
    add_labeled_lines(lines, "Fecha", format_date(order.get("fecha")))
    add_labeled_lines(lines, "Cliente", order.get("cliente"))
    add_labeled_lines(lines, "Teléfono", order.get("telefono"))

    if is_delivery:
        add_labeled_lines(lines, "Dirección", order.get("direccion"), "bold")
        reference = order.get("referencia") or order.get("neighborhood")
        if reference:
            add_labeled_lines(lines, "Referencia", reference)

    lines.append(("normal", "-" * LINE_WIDTH))
    lines.append(("bold", f"{'CANT':<5}{'PRODUCTO':<{LINE_WIDTH - 5}}"))
    lines.append(("normal", "-" * LINE_WIDTH))

    for product in order.get("productos", []):
        quantity = clean_text(product.get("cantidad"))
        name_lines = wrap_text(product.get("nombre"), LINE_WIDTH - 5)
        lines.append(("normal", f"{quantity[:5]:<5}{name_lines[0]}"))
        lines.extend(("normal", f"{'':<5}{item}") for item in name_lines[1:])

        if product.get("nota"):
            note_lines = wrap_text(product.get("nota"), LINE_WIDTH - 8)
            lines.append(("normal", f"{'':<5}>> {note_lines[0]}"))
            lines.extend(
                ("normal", f"{'':<7}{item}")
                for item in note_lines[1:]
            )

    lines.append(("normal", "-" * LINE_WIDTH))

    if order.get("notas"):
        add_labeled_lines(lines, "Notas", order.get("notas"))

    if order.get("subtotal") is not None:
        add_labeled_lines(lines, "Subtotal", money(order.get("subtotal")))
    if domicilio is not None and is_delivery:
        add_labeled_lines(lines, "Domicilio", money(domicilio))

    lines.extend(("bold", item) for item in line("TOTAL", money(order.get("total"))))
    payment = order.get("metodo_pago") or order.get("paymentMethod") or ""
    add_labeled_lines(lines, "Pago", payment)

    if order.get("paga_con"):
        add_labeled_lines(lines, "Paga con", money(order.get("paga_con")))

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
