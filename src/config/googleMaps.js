const PANADERIA_ADDRESS =
  process.env.BAKERY_ADDRESS ||
  "Cra 28 A N. 11B-18, Barrio San Antonio, Tuluá, Valle del Cauca";

function getApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY;
}

export async function geocodificarDireccion(direccion) {
  const apiKey = getApiKey();
  if (!apiKey || !direccion) return null;

  const params = new URLSearchParams({
    address: `${direccion}, Tuluá, Valle del Cauca, Colombia`,
    components: "country:CO|administrative_area:Valle del Cauca|locality:Tuluá",
    key: apiKey
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.results?.[0]?.geometry?.location || null;
  } catch (error) {
    console.error("⚠️ No se pudo geocodificar la dirección:", error.message);
    return null;
  }
}

export async function calcularDistancia(origen, destino) {
  const apiKey = getApiKey();
  if (!apiKey || !destino) return null;

  const destination = typeof destino === "string"
    ? destino
    : `${destino.lat},${destino.lng}`;
  const params = new URLSearchParams({
    origins: typeof origen === "string" ? origen : `${origen.lat},${origen.lng}`,
    destinations: destination,
    mode: "driving",
    key: apiKey
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const element = data.rows?.[0]?.elements?.[0];
    return element?.status === "OK" ? element.distance.value : null;
  } catch (error) {
    console.error("⚠️ No se pudo calcular la distancia:", error.message);
    return null;
  }
}

export { PANADERIA_ADDRESS };