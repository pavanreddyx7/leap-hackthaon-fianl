/*
  ==========================================================
  Power Station Control Center — ESP32 HOME Node (H001)
  ==========================================================
  Flash this onto the ESP32 sitting on the HOME side of the bench
  rig. For the POLE side, flash firmware/esp32_pole_node instead —
  same logic, different device identity and wiring position.

  Hardware: ACS712 current sensor + "0-25V DC Voltage Sensor Module"
  + ESP32 + status LEDs. No RTC module.

  ==========================================================
  CIRCUIT DIAGRAM — HOME NODE (H001)
  ==========================================================
  Fed from HOME LINE(+), which comes off the POLE unit's FAULT
  SWITCH output (see firmware/esp32_pole_node) — not straight off
  the 12V adapter.

                                              HOME LINE (+)
                                         (from POLE fault switch)
                                                    |
                        +---------------------------+-----------------+
                        |                                             |
            +-----------------------------+               +----------+---------+
            |        ACS712  (H001)       |               |  VOLTAGE SENSOR    |
            |    current sensor, in-line  |               |  MODULE (0-25V)    |
            |                             |               |  screw terminals:  |
 HOME LINE(+)o-------> IP+           IP- --+-> HOME LOAD   |  VCC(+) and GND    |
            |                             |    (12V lamp) |                    |
            |  VCC ------------------------+->ESP32-H 5V  o-VCC        S-------+--> ESP32-H GPIO35
            |  GND ------------------------+->COMMON GND--+-GND               |    (line volts / 5,
            |  OUT ------------------------+->ESP32-H     |                   |     module does the divide,
            +-----------------------------+  GPIO34       +----------+--------+     PRIMARY: decides ON/OFF)
              (current draw, diagnostic only)                        |
                                                            (- pin --> COMMON GND)
     HOME LOAD (12V lamp) -----------------------------------------------------+
     returns to COMMON GND, shared with the POLE unit's ground.

  --------------------------------------------------------------
  ESP32-H (DevKit) — LEDs

     GPIO34 <-- ACS712 OUT               (current draw, reported alongside — diagnostic only)
     GPIO35 <-- voltage sensor S pin     (PRIMARY: line voltage -> ON/OFF)

     GPIO25 --[220 ohm]--> GREEN LED --> COMMON GND   (lit = reporting ON)
     GPIO26 --[220 ohm]--> RED   LED --> COMMON GND   (lit = reporting OFF)
     GPIO27 --[220 ohm]--> BLUE  LED --> COMMON GND   (solid = WiFi connected,
                                                         blink = disconnected)

     5V/VIN <-- USB power source #2 (separate from the 12V demo rail)
     GND    <-- USB power source #2, tied to COMMON GND

  All GND nets above (HOME LINE return, ACS712, ESP32, LEDs, USB
  source #2) are one single common ground, shared with the POLE
  unit's ground.

  --------------------------------------------------------------
  DEMO TIP: when the POLE unit's FAULT SWITCH is opened, this unit
  loses HOME LINE power and reports OFF (voltage drops below 1V) while the
  pole itself keeps reporting ON — that's exactly the "LOCAL FAULT"
  case the backend's outage engine (engines/outage.py) is built to
  detect and auto-ticket. Pull the WiFi/router instead to see the
  BLUE LED start blinking and the dashboard mark this home's pole
  "NOT SENDING DATA" once its 2-minute stale window passes.

  No timestamp hardware on this build: the sketch uses NTP if WiFi
  has internet access, and falls back to a device-uptime placeholder
  if not. Either way, the server records its own receipt time for
  the dashboard, so this only needs to satisfy the API's required
  "timestamp" field.

  Server: main.py listens on port 5000. Set SERVER_HOST to your PC's
  LAN IP (not "localhost"). On Windows: `ipconfig` -> IPv4 Address.
  ==========================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

// ---------------- DEVICE IDENTITY (fixed — this is the home board) ----------------
const char* DEVICE_ID    = "H001";      // Must match a row in gateway/auth.py
const char* DEVICE_TYPE  = "home";
const char* DEVICE_TOKEN = "token456";  // Must match DEVICE_ID's row in gateway/auth.py
// --------------------------------------------------------------------

// ---------------- WIFI + SERVER CONFIG ----------------
const char* WIFI_SSID     = "X7";        // <-- CHECK THIS: confirm your full network name
const char* WIFI_PASSWORD = "12345678";
const char* SERVER_HOST   = "10.204.222.2";  // Your PC's LAN IP running main.py
const int   SERVER_PORT   = 5000;
// --------------------------------------------------------------

// ---------------- PIN MAP ----------------
const int PIN_ACS712          = 34; // ADC1_CH6 — current draw, reported alongside (diagnostic only)
const int PIN_VOLTAGE_SENSOR  = 35; // ADC1_CH7 — PRIMARY: line voltage -> ON/OFF
const int PIN_LED_GREEN       = 25; // lit when reporting ON
const int PIN_LED_RED         = 26; // lit when reporting OFF
const int PIN_LED_BLUE        = 27; // solid = WiFi connected, blink = not
// --------------------------------------------------------------------

// ---------------- SENSOR CALIBRATION ----------------
// Generic "0-25V DC Voltage Sensor Module" — an onboard 30k/7.5k divider,
// fixed 5:1 ratio (its S output = line voltage / 5). Real resistor
// tolerance can be off by a percent or two; if your readings are
// consistently a bit high or low versus a multimeter, adjust this.
const float VOLTAGE_SENSOR_RATIO = 5.0;
// PRIMARY: line voltage above this counts as ON. Above the floating-pin
// noise floor (an unconnected ADC pin reads well under 1V of stray
// coupling) but well below a real 12V line, so it can't be fooled by
// "sensor not actually wired in" the way a near-zero threshold could.
const float NO_VOLTAGE_THRESHOLD_V = 1.0;

// ACS712 — reported alongside for diagnostics only, does NOT decide ON/OFF.
// Set to match your module's printed rating (5A=185, 20A=100, 30A=66 mV/A)
const float ACS712_MV_PER_AMP = 100.0;
// Measure OUT with a multimeter at zero current (with the fault switch
// open, so the home load is genuinely off) and set this precisely —
// don't rely on an auto-calibration routine here either.
const float ACS712_MIDPOINT_MV = 2504.5; // measured from your board's own zero-current readings
// --------------------------------------------------------------------

const unsigned long SEND_INTERVAL_MS = 5000; // Report every 5s — comfortably inside the dashboard's 2-minute stale window
unsigned long lastSend = 0;
unsigned long lastBlueToggle = 0;
bool blueLedState = false;
bool lastKnownOn = false;
bool timeSynced = false;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(300);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connect failed, will keep retrying in loop().");
  }
}

void syncTimeFromNTP() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing time from NTP");
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 8 * 3600 * 2 && attempts < 15) {
    delay(300);
    Serial.print(".");
    now = time(nullptr);
    attempts++;
  }
  timeSynced = now >= 8 * 3600 * 2;
  Serial.println(timeSynced ? " done." : " skipped (no internet) — using device uptime instead.");
}

String isoTimestampNow() {
  if (timeSynced) {
    time_t now = time(nullptr);
    struct tm timeinfo;
    gmtime_r(&now, &timeinfo);
    char buf[25];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    return String(buf);
  }
  return "1970-01-01T00:00:" + String(millis() / 1000) + "Z"; // last-resort placeholder
}

// Averages ADC readings (in mV) over a short window to smooth ripple/noise
float readAveragedMv(int pin, int samples = 64) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogReadMilliVolts(pin);
    delayMicroseconds(200);
  }
  return sum / (float)samples;
}

void updateLeds(bool isOn, bool wifiConnected) {
  digitalWrite(PIN_LED_GREEN, isOn ? HIGH : LOW);
  digitalWrite(PIN_LED_RED, isOn ? LOW : HIGH);

  if (wifiConnected) {
    digitalWrite(PIN_LED_BLUE, HIGH);
  } else if (millis() - lastBlueToggle > 300) {
    blueLedState = !blueLedState;
    digitalWrite(PIN_LED_BLUE, blueLedState ? HIGH : LOW);
    lastBlueToggle = millis();
  }
}

void sendTelemetry(const char* status, float lineVoltage, float currentAmps) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi dropped, reconnecting...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return; // try again next cycle
  }

  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/telemetry";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-ID", DEVICE_ID);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  // current_amps is extra diagnostic info — the backend ignores unknown
  // JSON fields today, but it's there if you extend the schema later.
  String payload = String("{") +
    "\"device_id\":\"" + DEVICE_ID + "\"," +
    "\"type\":\"" + DEVICE_TYPE + "\"," +
    "\"status\":\"" + status + "\"," +
    "\"voltage\":" + String(lineVoltage, 2) + "," +
    "\"current_amps\":" + String(currentAmps, 3) + "," +
    "\"timestamp\":\"" + isoTimestampNow() + "\"" +
  "}";

  int code = http.POST(payload);
  Serial.printf("  -> HTTP %d\n", code);
  if (code > 0 && code != 200) {
    Serial.println(http.getString()); // print server error detail (e.g. bad token, validation failure)
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_BLUE, OUTPUT);

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_ACS712, ADC_11db);          // needed to read up to ~3.3V
  analogSetPinAttenuation(PIN_VOLTAGE_SENSOR, ADC_11db); // same

  connectWiFi();
  syncTimeFromNTP();
}

void loop() {
  bool wifiConnected = WiFi.status() == WL_CONNECTED;

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();

    // PRIMARY: line voltage decides ON/OFF
    float sensorMv = readAveragedMv(PIN_VOLTAGE_SENSOR);
    float lineVoltage = (sensorMv / 1000.0) * VOLTAGE_SENSOR_RATIO;
    lastKnownOn = lineVoltage > NO_VOLTAGE_THRESHOLD_V;

    // Current draw — reported alongside for diagnostics, not decision-making
    float acsMv = readAveragedMv(PIN_ACS712);
    float currentAmps = fabs(acsMv - ACS712_MIDPOINT_MV) / ACS712_MV_PER_AMP;

    Serial.printf("[%s] %s  current=%.3fA (raw %.1fmV)  voltage=%.2fV (raw %.1fmV)",
                  DEVICE_ID, lastKnownOn ? "ON" : "OFF", currentAmps, acsMv, lineVoltage, sensorMv);

    sendTelemetry(lastKnownOn ? "ON" : "OFF", lineVoltage, currentAmps);
  }

  updateLeds(lastKnownOn, wifiConnected); // keeps the blue LED blinking smoothly between sends
}
