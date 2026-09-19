$URL = "https://parts-beam-shipment-hint.trycloudflare.com/webhook"

function Send($file) {
  Write-Host "`n=== $file ===" -ForegroundColor Cyan
  $result = curl.exe -s -X POST $URL -H "Content-Type: application/json" --data-binary "@$file"
  Write-Host "Respuesta: $result"
  Start-Sleep -Seconds 2
}

Send "payload-ola.json"
Send "payload-hoal.json"
Send "payload-aloha.json"
Send "payload-mnue.json"
Send "payload-hilo.json"

Write-Host "`n=== PRUEBAS DE TYPOS COMPLETAS ===" -ForegroundColor Green