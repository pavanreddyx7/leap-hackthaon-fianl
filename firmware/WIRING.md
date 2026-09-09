# ESP32 Power Node — Wiring & Pin Reference

Two ESP32 boards, identical pin map, different device identity. Hardware: **ACS712 current sensor + "0-25V DC Voltage Sensor Module" + ESP32 + status LEDs** — no RTC module.

|                | POLE unit                             | HOME unit                                          |
| -------------- | -------------------------------------- | --------------------------------------------------- |
| Firmware       | `esp32_pole_node/esp32_pole_node.ino` | `esp32_home_node/esp32_home_node.ino`               |
| `DEVICE_ID`    | `P001`                                 | `H001`                                              |
| `DEVICE_TYPE`  | `pole`                                 | `home`                                              |
| `DEVICE_TOKEN` | `token123`                             | `token456`                                          |
| Fed from       | 12V DC adapter directly                | HOME LINE (+), i.e. the pole's FAULT SWITCH output   |

Both tokens must match the rows in `gateway/auth.py` on the server. If you build more units, add `P002`–`P004` / `H002`–`H006` there (already present) or new rows for anything beyond that, matching entries in `seed_db.py`.

## Pin map (same on both boards)

| ESP32 pin              | Connects to                                 | Role                                                    |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `GPIO34` (ADC1_CH6)     | ACS712 `OUT`                                 | Current draw, reported alongside — **diagnostic only, does not decide ON/OFF** |
| `GPIO35` (ADC1_CH7)     | Voltage sensor module `S` pin                | **PRIMARY** — line voltage decides ON/OFF (`> 1V` = ON) |
| `GPIO25`                | Green LED (via 220Ω)                        | Lit when reporting ON                                   |
| `GPIO26`                | Red LED (via 220Ω)                          | Lit when reporting OFF                                  |
| `GPIO27`                | Blue LED (via 220Ω)                         | Solid = WiFi connected, blinking = disconnected          |
| `5V` / `VIN`            | ACS712 `VCC`, USB power source               | Sensor + board power                                     |
| `GND`                   | ACS712 `GND`, voltage sensor `-` pin, LED cathodes, common ground | Shared ground                       |

**Voltage decides ON/OFF, current is diagnostic-only**: `NO_VOLTAGE_THRESHOLD_V = 1.0` — real voltage above 1V means ON, at or below means OFF. That threshold sits comfortably above a floating/unconnected sensor's noise (an unwired `GPIO35` reads well under 1V of stray coupling) and comfortably below a real 12V line, so it can't be fooled by a sensor that isn't actually wired in. Current is still measured and sent with every reading, but no longer gates the status.

## The voltage sensor module

A generic "0-25V DC Voltage Sensor Module" (screw terminal breakout with a 3-pin `S`/`+`(unused)/`-` header) — it's an onboard resistor divider, not an active/powered sensor. Typical spec: **30kΩ / 7.5kΩ, a fixed 5:1 ratio**, so `S` outputs the sensed line voltage ÷ 5. At 12V that's ~2.4V on `S`, comfortably inside the ESP32's ADC range.

- Screw terminals **VCC(+)** and **GND(-)** connect to the line being measured (your 12V rail — safely under the module's 25V rating).
- Header pin **`S`** → ESP32 `GPIO35` (the analog reading).
- Header pin **`-`** → common ground (same ground as `S` is referenced to).
- Header pin **`+`** is not used for the passive-divider version of this board — leave it unconnected unless your specific listing's documentation says otherwise (cheap clones vary; check yours if in doubt).

## Sensor calibration constants

| Constant                  | Meaning                             | How to set it                                                                                                          |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `VOLTAGE_SENSOR_RATIO`     | Module's divider ratio               | Default `5.0` (the module's documented 30k/7.5k divider). Real resistor tolerance can be off a percent or two — if your readings run consistently high or low against a multimeter, nudge this. |
| `NO_VOLTAGE_THRESHOLD_V`   | Voltage above which status = ON (**the decision**) | Default `1.0` V — well above floating-pin noise, well below a real 12V line |
| `ACS712_MV_PER_AMP`        | Sensitivity of your ACS712 variant (diagnostic only) | 5A module = `185`, 20A = `100`, 30A = `66` (check the module's silkscreen)                                |
| `ACS712_MIDPOINT_MV`       | OUT voltage at zero current (diagnostic only) | Measure per-board — reflash with the load removed, read the raw mV printed to Serial, and set this to that value. Never auto-calibrate at boot: the pole's lamp is always-on, so a "zero current at startup" reading would be wrong. |

## POLE unit (P001) circuit

```
                                     12V DC ADAPTER
                                   +---------------+
                                   |   (+)     (-) |
                                   +----+------+---+
                                        |      |
                          POLE 12V(+)  |      |  COMMON GND (12V-)
                        +---------------+------+--------------------------+
                        |                                                 |
            +-----------------------------+               +--------------+-----+
            |        ACS712  (P001)       |               |  VOLTAGE SENSOR    |
            |    current sensor, in-line  |               |  MODULE (0-25V)    |
            |                             |               |  screw terminals:  |
 POLE 12V(+)o-------> IP+           IP- --+-> POLE LINE    |  VCC(+) and GND    |
            |                             |    LOAD/switch |                    |
            |  VCC ------------------------+->ESP32-P 5V   o-VCC        S-------+--> ESP32-P GPIO35
            |  GND ------------------------+->COMMON GND---+-GND               |    (line volts / 5,
            |  OUT ------------------------+->ESP32-P      |                   |     module does the divide,
            +-----------------------------+  GPIO34        +----------+--------+     PRIMARY: decides ON/OFF)
              (current draw, diagnostic only)                         |
                                                             (- pin --> COMMON GND)
     POLE LINE (+) --+--------------------------------------------------------> POLE LOAD
                      |                                                        (always-on
                      |                                                         12V lamp)
                      v
                FAULT SWITCH  (SPST, manual — this is the demo control)
                      |
                      v
                HOME LINE (+) --------------------> to HOME UNIT (H001)
```

### ESP32-P — LEDs

```
GPIO34 <-- ACS712 OUT               (current draw, reported alongside — diagnostic only)
GPIO35 <-- voltage sensor S pin     (PRIMARY: line voltage -> ON/OFF)

GPIO25 --[220 ohm]--> GREEN LED --> COMMON GND   (lit = reporting ON)
GPIO26 --[220 ohm]--> RED   LED --> COMMON GND   (lit = reporting OFF)
GPIO27 --[220 ohm]--> BLUE  LED --> COMMON GND   (solid = WiFi connected,
                                                    blink = disconnected)

5V/VIN <-- USB power source #1 (separate from the 12V demo rail)
GND    <-- USB power source #1, tied to COMMON GND
```

## HOME unit (H001) circuit

Fed from HOME LINE(+), i.e. the pole's FAULT SWITCH output — not straight off the 12V adapter.

```
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
```

### ESP32-H — LEDs

```
GPIO34 <-- ACS712 OUT               (current draw, reported alongside — diagnostic only)
GPIO35 <-- voltage sensor S pin     (PRIMARY: line voltage -> ON/OFF)

GPIO25 --[220 ohm]--> GREEN LED --> COMMON GND   (lit = reporting ON)
GPIO26 --[220 ohm]--> RED   LED --> COMMON GND   (lit = reporting OFF)
GPIO27 --[220 ohm]--> BLUE  LED --> COMMON GND   (solid = WiFi connected,
                                                    blink = disconnected)

5V/VIN <-- USB power source #2 (separate from the 12V demo rail)
GND    <-- USB power source #2, tied to COMMON GND
```

## Notes

- All ground nets (12V supply return, both ACS712 modules, both voltage sensor modules, both ESP32 boards, all LEDs, both USB sources) are **one shared common ground**.
- `GPIO34` and `GPIO35` are both ADC1 channels — chosen deliberately because ADC2 pins conflict with WiFi on the ESP32.
- No RTC hardware: timestamps come from NTP when WiFi has internet access, falling back to a device-uptime placeholder otherwise. The server records its own receipt time either way, so this only needs to satisfy the API's required `timestamp` field.
- `voltage` in the telemetry payload is now a **real measurement** from the voltage sensor module (it used to be a fixed `12.0V` placeholder — that's gone), and it's now also the value that decides ON/OFF (`> 1V` = ON). `current_amps` is still measured and sent every cycle, but is diagnostic-only — it does not affect status.
- Calibrating the ACS712 midpoint (for the diagnostic current reading only): reflash with the load disconnected, read the raw mV Serial prints, and set `ACS712_MIDPOINT_MV` to that exact value — a generic `2500.0` guess will show a constant "phantom current" that's really just your board's own offset from the ideal VCC÷2 point. If that phantom current still drifts after calibrating, suspect ACS712 `VCC` sagging during WiFi activity (its zero-point is `VCC÷2`) — a 0.1µF decoupling cap across the ACS712's VCC/GND pins is the standard fix.
- Flip the **FAULT SWITCH** to cut power to the HOME unit only: the pole keeps reporting ON (its own voltage sensor still reads the live 12V line) while the home's voltage sensor reads near 0V and reports OFF — this is the "LOCAL FAULT" case `engines/outage.py` auto-tickets.
- Pull the WiFi/router to see the BLUE LED start blinking on whichever unit lost connectivity, and watch the dashboard mark that pole "NOT SENDING DATA" once its 2-minute stale window passes.
- Set `SERVER_HOST` in both sketches to your PC's LAN IP (not `localhost`) — find it with `ipconfig` on Windows.
