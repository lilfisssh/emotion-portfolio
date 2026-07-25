# Arduino Serial Output Format

The backend `server/index.js` parses serial data line by line (115200 baud) and **accepts both formats below** — they can be mixed without any backend changes.

## ① CSV format (the user's actual Arduino format)

Each line outputs 4 comma-separated numbers: `hr,gsr,rmssd,valence`, terminated by a `println` newline.
The 4th number is the Arduino-side valence estimate; the backend only records it pass-through
(the `arduinoValence` field in WS messages) and **does not** use it in the valence computation —
valence is always computed by the backend `server/lib/mapping.js`.

```cpp
// Arduino sketch excerpt: CSV output, 115200 baud
void setup() {
  Serial.begin(115200);
}

void loop() {
  float hr     = readHeartRate();   // bpm, e.g. 72.5
  float gsr    = readGsr();         // μS, e.g. 1.23
  float rmssd  = readRmssd();       // ms, e.g. 45.0
  float val    = estimateValence(); // Arduino-side valence estimate (optional, pass-through only)

  Serial.print(hr, 1);
  Serial.print(",");
  Serial.print(gsr, 2);
  Serial.print(",");
  Serial.print(rmssd, 1);
  Serial.print(",");
  Serial.println(val, 2);  // example output: 72.5,1.23,45.0,0.6

  delay(1000);  // 1Hz
}
```

## ② JSON-line format (contract format)

One JSON object per line: `{"hr":72.5,"gsr":1.23,"rmssd":45.0}`.

```cpp
// Arduino sketch excerpt: JSON-line output, 115200 baud
void setup() {
  Serial.begin(115200);
}

void loop() {
  float hr    = readHeartRate();
  float gsr   = readGsr();
  float rmssd = readRmssd();

  Serial.print("{\"hr\":");
  Serial.print(hr, 1);
  Serial.print(",\"gsr\":");
  Serial.print(gsr, 2);
  Serial.print(",\"rmssd\":");
  Serial.print(rmssd, 1);
  Serial.println("}");  // example output: {"hr":72.5,"gsr":1.23,"rmssd":45.0}

  delay(1000);  // 1Hz
}
```

## Parsing behavior

- When fields are missing in either format (e.g. a line with only hr), the backend carries forward the values from the previous frame.
- Unparseable lines are dropped silently and never crash the backend.
- When the serial connection drops, the backend automatically broadcasts `{type:"status", connected:false}`.
