"""
Sends fake telemetry for P001/H001 (the same two device IDs and tokens the
real ESP32 firmware uses) so the dashboards can be tested without the
physical voltage/current sensors connected.

Usage:
    python simulate_devices.py                 loop through every scenario forever (Ctrl+C to stop)
    python simulate_devices.py --once           send each scenario exactly one round, then exit
    python simulate_devices.py --server http://127.0.0.1:5000
"""

import argparse
import datetime
import time

import requests

DEVICE_TOKENS = {
    "P001": "token123",
    "H001": "token456",
}

DEVICE_TYPES = {
    "P001": "pole",
    "H001": "home",
}

# (label, {device_id: (status, voltage, current_amps)})
SCENARIOS = [
    ("NORMAL - pole and home both have current", {
        "P001": ("ON", 12.10, 0.45),
        "H001": ("ON", 12.00, 0.30),
    }),
    ("LOCAL FAULT - home voltage drops to zero, pole stays fine", {
        "P001": ("ON", 12.10, 0.45),
        "H001": ("OFF", 0.03, 0.00),
    }),
    ("UPSTREAM OUTAGE - pole voltage drops to zero, home also zero", {
        "P001": ("OFF", 0.02, 0.00),
        "H001": ("OFF", 0.01, 0.00),
    }),
    ("SENSOR INCONSISTENCY - pole is OFF but home still reports ON (dashboard must still show the home as OFF, cascaded from the pole)", {
        "P001": ("OFF", 0.02, 0.00),
        "H001": ("ON", 11.80, 0.28),
    }),
    ("RECOVERY - both back to normal", {
        "P001": ("ON", 12.10, 0.45),
        "H001": ("ON", 12.00, 0.30),
    }),
]


def send_telemetry(server, device_id, status, voltage, current_amps):
    payload = {
        "device_id": device_id,
        "type": DEVICE_TYPES[device_id],
        "status": status,
        "voltage": voltage,
        "current_amps": current_amps,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    headers = {
        "Content-Type": "application/json",
        "X-Device-ID": device_id,
        "X-Device-Token": DEVICE_TOKENS[device_id],
    }
    try:
        resp = requests.post(f"{server}/api/telemetry", json=payload, headers=headers, timeout=5)
        ok = resp.status_code == 200
        print(f"  -> {device_id:5s} {status:3s}  {voltage:6.2f}V  {current_amps:5.3f}A  HTTP {resp.status_code}{'' if ok else ' ' + resp.text}")
    except requests.exceptions.RequestException as e:
        print(f"  -> {device_id:5s} FAILED to reach {server}: {e}")


def run_scenario(server, label, readings, duration, interval):
    print(f"\n=== {label} ===")
    end_time = time.time() + duration
    while True:
        for device_id, (status, voltage, current_amps) in readings.items():
            send_telemetry(server, device_id, status, voltage, current_amps)
        if time.time() >= end_time:
            break
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", default="http://127.0.0.1:5000", help="Base URL of the running server (default: %(default)s)")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between repeated sends within a scenario (default: %(default)s, matches real firmware)")
    parser.add_argument("--phase-duration", type=float, default=20.0, help="Seconds to hold each scenario before moving to the next (default: %(default)s)")
    parser.add_argument("--once", action="store_true", help="Send each scenario a single time and exit, instead of looping forever")
    args = parser.parse_args()

    print(f"Simulating telemetry for P001/H001 against {args.server}")
    print("Open the office dashboard (/) and customer dashboard (/customer) to watch it update live.")

    try:
        while True:
            for label, readings in SCENARIOS:
                if args.once:
                    print(f"\n=== {label} ===")
                    for device_id, (status, voltage, current_amps) in readings.items():
                        send_telemetry(args.server, device_id, status, voltage, current_amps)
                else:
                    run_scenario(args.server, label, readings, args.phase_duration, args.interval)
            if args.once:
                break
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
