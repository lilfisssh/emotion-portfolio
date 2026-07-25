# Arduino 串口输出格式说明

后端 `server/index.js` 按行解析串口数据（115200 baud），**同时兼容以下两种格式**，无需修改后端即可混用。

## ① CSV 格式（当前用户 Arduino 实际格式）

每行输出 4 个逗号分隔数字：`hr,gsr,rmssd,valence`，`println` 换行结尾。
第 4 个数字是 Arduino 端估算的欢愉度，后端仅透传记录（WS 消息中的 `arduinoValence` 字段），
**不参与** valence 计算 —— valence 统一由后端 `server/lib/mapping.js` 计算。

```cpp
// Arduino sketch 片段：CSV 输出，115200 baud
void setup() {
  Serial.begin(115200);
}

void loop() {
  float hr     = readHeartRate();   // bpm，如 72.5
  float gsr    = readGsr();         // μS，如 1.23
  float rmssd  = readRmssd();       // ms，如 45.0
  float val    = estimateValence(); // Arduino 端估算欢愉度（可选，仅透传记录）

  Serial.print(hr, 1);
  Serial.print(",");
  Serial.print(gsr, 2);
  Serial.print(",");
  Serial.print(rmssd, 1);
  Serial.print(",");
  Serial.println(val, 2);  // 输出示例：72.5,1.23,45.0,0.6

  delay(1000);  // 1Hz
}
```

## ② JSON 行格式（契约格式）

每行一个 JSON 对象：`{"hr":72.5,"gsr":1.23,"rmssd":45.0}`。

```cpp
// Arduino sketch 片段：JSON 行输出，115200 baud
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
  Serial.println("}");  // 输出示例：{"hr":72.5,"gsr":1.23,"rmssd":45.0}

  delay(1000);  // 1Hz
}
```

## 解析行为说明

- 两种格式字段缺失时（如某行只有 hr），后端沿用上一帧的值补齐。
- 无法解析的坏行直接丢弃，不会导致后端崩溃。
- 串口断线时后端自动广播 `{type:"status", connected:false}`。
