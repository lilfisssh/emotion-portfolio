/*
 * sensor_hrv_v8.ino —— 心率 + 皮电 + HRV（最终版，输出已适配 emotion-portfolio 串口契约）
 *
 * 硬件：Arduino Uno + MAX30102（I2C 0x57，A4=SDA/A5=SCL）+ Grove GSR（A0）
 * 库：DevLab MAX30102（SparkFun MAX3010x 亦可）
 *
 * 输出（1s 一行 JSON，115200 baud）：
 *   {"hr":72,"gsr":512,"rmssd":42.3}
 *   hr     平均心率 BPM（无手指=0）
 *   gsr    皮电原始值 0~1023（analogRead）
 *   rmssd  心率变异性 ms；数据不足（<5 个有效 RR 间隔）时省略该字段，
 *          后端按契约沿用上一帧值
 */

#include <Wire.h>
#include "DevLab_MAX30102.h"
#include "heartRate.h"
#include <math.h>

DevLab_MAX30102 particleSensor;
const int GSR_PIN = A0;

// ---- 心率变量 ----
const byte RATE_SIZE = 2;          // 平均窗口：2=灵敏，4=平稳
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

// ---- HRV：最近 12 个心跳间隔(ms) ----
const byte RR_N = 12;
unsigned int rrBuf[RR_N];
byte rrIdx = 0;
byte rrCount = 0;

const long FINGER_IR = 50000;      // IR 阈值：高于此值=有手指

void recoverI2C() {                // I2C 锁死自愈
  Wire.end(); delay(10); Wire.begin();
  particleSensor.begin(Wire, I2C_SPEED_STANDARD);
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);
}

float calcRMSSD() {                // 相邻心跳间隔差的均方根
  if (rrCount < 5) return -1;
  float sumSq = 0; byte pairs = 0;
  for (byte i = 1; i < rrCount; i++) {
    byte prev = (rrIdx + RR_N - rrCount + i - 1) % RR_N;
    byte curr = (rrIdx + RR_N - rrCount + i) % RR_N;
    float d = (float)rrBuf[curr] - (float)rrBuf[prev];
    sumSq += d * d; pairs++;
  }
  return sqrt(sumSq / pairs);
}

void setup() {
  Serial.begin(115200);
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {  // 100kHz 防干扰锁死
    Serial.println("MAX30102 was not found. Please check wiring/power.");
    while (1);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);   // 红光=运行指示
  particleSensor.setPulseAmplitudeGreen(0);
}

void loop() {
  // ---- I2C 看门狗：每 2 秒探测 0x57，无应答才恢复 ----
  static unsigned long lastPing = 0;
  if (millis() - lastPing > 2000) {
    lastPing = millis();
    Wire.beginTransmission(0x57);
    if (Wire.endTransmission() != 0) recoverI2C();
  }

  // ---- 心率 + HRV ----
  long irValue = particleSensor.getIR();
  bool fingerOn = (irValue > FINGER_IR);

  if (fingerOn && checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60 / (delta / 1000.0);

    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
      beatAvg = 0;
      for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
      beatAvg /= RATE_SIZE;

      if (delta >= 300 && delta <= 2000) {   // 有效间隔入 HRV 缓冲
        rrBuf[rrIdx] = (unsigned int)delta;
        rrIdx = (rrIdx + 1) % RR_N;
        if (rrCount < RR_N) rrCount++;
      }
    }
  }
  if (!fingerOn) {                 // 拿开手指立即归零
    beatsPerMinute = 0; beatAvg = 0;
    for (byte x = 0; x < RATE_SIZE; x++) rates[x] = 0;
    rrCount = 0; rrIdx = 0;
  }

  // ---- 输出：1s 一行 JSON（emotion-portfolio 契约）----
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    float rmssd = calcRMSSD();
    Serial.print("{\"hr\":");
    Serial.print(beatAvg);
    Serial.print(",\"gsr\":");
    Serial.print(analogRead(GSR_PIN));
    if (rmssd >= 0) {
      Serial.print(",\"rmssd\":");
      Serial.print(rmssd, 1);
    }
    Serial.println("}");
  }
}
