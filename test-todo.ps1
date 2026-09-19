$URL = "https://parts-beam-shipment-hint.trycloudflare.com/webhook"

function Send($file) {
  Write-Host "`n=== $file ===" -ForegroundColor Cyan
  $result = curl.exe -s -X POST $URL -H "Content-Type: application/json" --data-binary "@$file"
  Write-Host "Respuesta: $result"
  Start-Sleep -Seconds 2
}

# ===== SUITE 1: Menú y saludos =====
Write-Host "`n##### SUITE 1: MENÚ #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-menu.json"
Send "payload-buenosdias.json"
Send "payload-horarios.json"

# ===== SUITE 2: Categorías (recrear state) =====
Write-Host "`n##### SUITE 2: CATEGORÍAS #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-carta.json"
Send "payload-cat-pan.json"

Send "payload-hola.json"
Send "payload-carta.json"
Send "payload-cat-pastel.json"

Send "payload-hola.json"
Send "payload-carta.json"
Send "payload-cat-postre.json"

Send "payload-hola.json"
Send "payload-carta.json"
Send "payload-cat-bebida.json"

# ===== SUITE 3: Asesor =====
Write-Host "`n##### SUITE 3: ASESOR #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-asesor.json"

# ===== SUITE 4: Recomendar =====
Write-Host "`n##### SUITE 4: RECOMENDAR #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-recomendar.json"

# ===== SUITE 5: Búsqueda por texto =====
Write-Host "`n##### SUITE 5: BÚSQUEDA #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-buscar-croissant.json"

Send "payload-hola.json"
Send "payload-buscar-pizza.json"

# ===== SUITE 6: Casos borde =====
Write-Host "`n##### SUITE 6: CASOS BORDE #####" -ForegroundColor Yellow
Send "payload-hola.json"
Send "payload-vacio.json"

Send "payload-hola.json"
Send "payload-categoria-invalida.json"

Send "payload-hola.json"
Send "payload-producto-invalido.json"

Send "payload-hola.json"
Send "payload-boton-invalido.json"

Write-Host "`n=== PRUEBAS COMPLETAS ===" -ForegroundColor Green