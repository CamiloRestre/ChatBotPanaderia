export const zonasDomicilio = {
  zona1: {
    precio: 1500,
    barrios: [
      "san antonio", "el bosque", "la inmaculada", "popular", "morales",
      "la villa", "las brisas", "santa rita del rio"
    ]
  },
  zona2: {
    precio: 2000,
    barrios: [
      "centro", "escobar", "las olas", "palobonito", "tomas uribe",
      "el dorado", "estambul", "la santa cruz", "casa huertas", "moralito"
    ]
  },
  zona3: {
    precio: 3000,
    barrios: [
      "fatima", "el retiro", "la rivera", "miraflores", "panamericano",
      "victoria", "villa del rio", "alvernia", "cespedes", "franciscanos",
      "san vicente de paul", "la merced", "las acacias", "sajonia",
      "el principe", "lusitania", "doce de octubre", "el lago"
    ]
  },
  zona4: {
    precio: 4000,
    barrios: [
      "bolivar", "playas", "pueblo nuevo", "la esperanza", "primero de mayo",
      "farfan", "la quinta", "las americas", "rojas", "guayacanes",
      "chiminangos", "municipal", "bello horizonte", "santa isabel", "el refugio"
    ]
  },
  zona5: {
    precio: 5000,
    barrios: [
      "la graciela", "maracaibo", "villa colombia", "el palmar", "juan xxiii",
      "saman del norte", "portales del rio", "alameda", "el jardin",
      "la trinidad", "siete de agosto", "internacional", "aguaclara",
      "la paz", "el paraiso"
    ]
  }
};

function normalizeBarrio(barrio) {
  return String(barrio || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getZonaByBarrio(barrio) {
  const normalized = normalizeBarrio(barrio);

  for (const [zona, data] of Object.entries(zonasDomicilio)) {
    if (data.barrios.includes(normalized)) {
      return { zona, precio: data.precio };
    }
  }

  return null;
}

export function getZonaByDistancia(distanciaMetros) {
  if (distanciaMetros <= 800) return { zona: "zona1", precio: 1500 };
  if (distanciaMetros <= 1500) return { zona: "zona2", precio: 2000 };
  if (distanciaMetros <= 2000) return { zona: "zona3", precio: 3000 };
  if (distanciaMetros <= 3000) return { zona: "zona4", precio: 4000 };
  if (distanciaMetros <= 4000) return { zona: "zona5", precio: 5000 };
  return null;
}