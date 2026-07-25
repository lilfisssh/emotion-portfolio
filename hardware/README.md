# Hardware · MAX30102 + Grove GSR on Arduino Uno

Key excerpts from the build log: parts, wiring, firmware, debugging.
Full firmware: [`sensor_hrv_v8/sensor_hrv_v8.ino`](sensor_hrv_v8/sensor_hrv_v8.ino).

## What it measures

- Heart rate (BPM) and HRV (RMSSD) from a MAX30102 PPG module
- Skin conductance (GSR) from a Grove GSR module
- Principle in one line: stress → sympathetic activation → faster, more regular
  heartbeat + sweaty palms; relaxed → parasympathetic → slower but more
  variable heartbeat. The two signals cross-validate each other.

## Parts list

| Part | Reference price | Buying notes |
|---|---|---|
| **Arduino Uno R3** | ¥25–150 | A compatible board is fine; make sure the USB cable is a *data* cable, not charge-only |
| **MAX30102 heart-rate/SpO2 module** | ¥8–20 | Buy the **3.3V–5V compatible** version (silkscreen `VIN`). Do NOT buy MAX30100 (incompatible algorithm) or MAX7219 (that's an LED driver!) |
| **Grove GSR skin-conductance sensor** | ¥40–60 | Seeed original or compatible; must include **two finger electrodes**. Analog output, no library needed |

Extras: 400-hole breadboard, 10+ male-to-female jumper wires (red = power,
black = GND, other = signal), rubber band or velcro to hold the finger steady
(10× more stable than pressing by hand). Optional: Grove Base Shield, a cheap
multimeter (continuity mode is a debugging superpower).

## Wiring

Two interface types are used:

| Interface | Used by | Notes |
|---|---|---|
| **I2C** (A4 = SDA, A5 = SCL) | MAX30102 | Fixed address `0x57` |
| **Analog in** (A0) | GSR | `analogRead` → 0–1023 |

**MAX30102 (only 4 of 8 pads used):**

| Pad | Connect to |
|---|---|
| VIN | Uno 5V |
| GND (either one) | Uno GND |
| SDA | Uno A4 |
| SCL | Uno A5 |
| INT / RD / IRD | not connected |

**Grove GSR (3 wires):** red (VCC) → 5V, black (GND) → GND, yellow/white (SIG) → A0.

**Pre-power checklist:**

1. Wire with power off, then re-check every line against the tables.
2. Multimeter continuity between (+) and (−) rails: silence = no short = safe.
3. Swapped SDA/SCL won't burn anything (just no data); **swapped VCC/GND can
   kill the module**.
4. Acceptance test: cover the sensor with a finger — you should see a dim red glow.

## Firmware

Arduino IDE + **`DevLab MAX30102`** library (SparkFun `MAX3010x` also works,
nearly identical API). Board: Arduino Uno. **Baud rate must be 115200** —
mismatched baud = garbage output, the #1 beginner trap.

The sketch `sensor_hrv_v8.ino`:

- Heartbeat detection on the IR channel; finger present when IR > 50000
- BPM = mean of last 2 beats; RMSSD over the last 12 RR intervals (needs ≥ 5)
- I2C watchdog: probes address 0x57 every 2 s and re-initializes the bus only
  when it stops answering (100 kHz bus speed prevents static-discharge lockups)
- Finger removed → all values reset to 0 immediately
- Output adapted to this project's serial contract — one JSON line per second:
  `{"hr":72,"gsr":512,"rmssd":42.3}` (`rmssd` is omitted until enough beats
  have been collected; the backend then reuses the last frame's value)

**Wearing:** MAX30102 — index fingertip lightly covering the window, fixed with
a rubber band. GSR electrodes — index + middle finger of the *same* hand. Put
the two sensors on different hands.

**Self-check scenarios:** slow deep breathing (4 s in / 6 s out) for a minute →
RMSSD rises; breath-hold 15 s or serial-subtract-7 → BPM and GSR climb; finger
off → BPM zero within a second.

## Debugging field notes (all traps actually hit)

| Symptom | Root cause | Fix |
|---|---|---|
| Garbage on serial | baud mismatch | set monitor to 115200 |
| `MAX30102 not found` | SDA/SCL swapped or loose | power off, re-seat |
| Sketch dies when touching sensor | I2C 400 kHz + flying wires + static locks the bus | use 100 kHz; touch window only, never pads; add watchdog |
| BPM stuck at one value | algorithm only updates on detected beats + unstable pressure | adjust pressure; allow 10 s warm-up |
| Values don't reset when finger removed | no "no-finger" branch | add `!fingerOn` reset logic |
| Always 0 after re-placing finger | watchdog mistook "no new sample" for bus lockup and kept rebooting the sensor | watchdog now probes I2C address ACK instead |
| Blank serial after upload | IDE2 monitor zombie / occupied by plotter | close monitor fully, press RESET |

**Discipline:** back up working code before editing; change one thing at a time;
record error messages verbatim.

## Limits

GSR is a strong arousal indicator; HRV indicates relaxed↔tense reasonably well;
but **valence estimation from these two signals is inherently rough**
(literature accuracy ≈ 40–50%). Treat the output as a trend/demo signal, not a
medical or psychological conclusion.
