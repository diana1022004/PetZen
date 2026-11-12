/* PetZen — ejemplo de firmware para ESP32 (Arduino IDE). SIN PROBAR EN HARDWARE.
 * Librerías: las incluidas con el paquete "esp32" de Arduino (WiFi, HTTPClient) + ArduinoJson.
 * Hardware supuesto: motor paso a paso con driver ULN2003/A4988 que empuja el alimento.
 * Ajusta pines, STEPS_PER_GRAM y calibra con una balanza antes de usarlo. */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "TU_WIFI";
const char* WIFI_PASS = "TU_CLAVE";
const char* SERVER    = "http://192.168.1.50:3000";   // IP de tu PC con "node server.js"
const char* DEVICE_KEY = "pz_xxxxxxxxxxxxxxxx";       // la ves en la app → Comedero

const int PINS[4] = {19, 18, 5, 17};                   // bobinas del motor
const float STEPS_PER_GRAM = 12.0;                     // CALIBRAR
const int SEQ[4][4] = {{1,0,0,1},{1,1,0,0},{0,1,1,0},{0,0,1,1}};

void stepMotor(long steps) {
  for (long i = 0; i < steps; i++) {
    for (int p = 0; p < 4; p++) digitalWrite(PINS[p], SEQ[i % 4][p]);
    delay(3);
  }
  for (int p = 0; p < 4; p++) digitalWrite(PINS[p], LOW);
}

void setup() {
  Serial.begin(115200);
  for (int p = 0; p < 4; p++) pinMode(PINS[p], OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");
}

void loop() {
  HTTPClient http;
  http.begin(String(SERVER) + "/api/device/poll?key=" + DEVICE_KEY + "&level=80&fw=esp32-1.0");
  if (http.GET() == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    if (doc["id"].is<const char*>()) {
      String id = doc["id"].as<String>();
      int grams = doc["grams"];
      Serial.printf("Dispensando %d g\n", grams);
      stepMotor((long)(grams * STEPS_PER_GRAM));
      HTTPClient ack;
      ack.begin(String(SERVER) + "/api/device/ack?key=" + DEVICE_KEY);
      ack.addHeader("Content-Type", "application/json");
      ack.POST("{\"id\":\"" + id + "\",\"ok\":true}");
      ack.end();
    }
  }
  http.end();
  delay(3000);
}
