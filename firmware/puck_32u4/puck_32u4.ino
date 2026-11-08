// Granule puck for Adafruit Feather 32u4 RFM95 (3078). Pucks P1 and P3.
// Adds a Seeed Grove IMU 9DOF (ICM20600 accelerometer + AK09918 magnetometer) on I2C for
// tilt-compensated heading and step counting while carried. The phone SET line over Serial1
// still works and overrides the IMU vector if it arrives.
// Barometer: BMP280 (2651) or BME280 (2652). Pick one define.
// Wiring: antenna soldered to ANT (spring or a 78 to 82 mm quarter-wave wire). Sensors on 3V/GND/SDA/SCL.
// Wake: a short wire loop from D6 to GND. Cutting it lets the pull-up take D6 HIGH, and the dipcan starts.
// XIAO TX -> pin 0 (RX1) at 9600 (optional).
// 32u4 budget: 28,672 B flash, 2,560 B RAM. No String, no float printf.
#ifndef USE_BME280
#define USE_BME280 0          // 1 for BME280 (2652), 0 for BMP280 (2651)
#endif
#ifndef HAS_IMU
#define HAS_IMU 1             // Seeed ICM20600 + AK09918 on I2C (0x69 / 0x0C)
#endif
#define PUCK_ID "P1"
#define PUCK_POS 1

#include <SPI.h>
#include <Wire.h>
#include <RH_RF95.h>
#include <Adafruit_SleepyDog.h>
#if USE_BME280
  #include <Adafruit_BME280.h>
  Adafruit_BME280 baro;
#else
  #include <Adafruit_BMP280.h>
  Adafruit_BMP280 baro;
#endif
#if HAS_IMU
  #include "ICM20600.h"
  #include "AK09918.h"
  ICM20600 icm(true);         // AD0 high -> 0x69 on the Grove board
  AK09918  mag;
#endif

#define CS 8
#define RST 4
#define IRQ 7
#define WAKE_PIN 6             // held LOW by the wire loop; HIGH once the wire is cut
#define LED 13
#define FREQ 915.0
#define DEMO_STILL_MS 20000UL   // 60000 for real use
#define STRIDE_CM 75            // average stride, centimeters
#define MAG_DECL_DEG -14        // Boston, 2026 (about -14 deg west). Set per theater.
// hard-iron offsets in AK09918 raw units (uT * 1); measure on the bench and fill in
#define MAG_OFF_X 0
#define MAG_OFF_Y 0
#define MAG_OFF_Z 0
// step detector: |a| crosses these mg thresholds with hysteresis, >= STEP_GAP_MS apart
#define STEP_HI_MG 1150
#define STEP_LO_MG 950
#define STEP_GAP_MS 300
#define STILL_BAND_MG 80        // |a| within 1 g +/- this for STILL_MS = dropped and still
#define IMU_PERIOD_MS 20        // 50 Hz
#define HDG_BINS 16             // 22.5 deg bins for the heading histogram

RH_RF95 rf95(CS, IRQ);
char vec[96] = "";              // segments + resultant: from phone SET, or built from the IMU at drop
float dropAlt = 0; unsigned long dropMs = 0;
enum { DORMANT, CARRIED, DROPPED, AWAKE, KILLED } st = DORMANT;
unsigned long lastSet = 0;
bool vecFromPhone = false;

#if HAS_IMU
uint16_t steps = 0;
uint16_t hist[HDG_BINS];        // steps per heading bin
long dxCm = 0, dyCm = 0;        // resultant, east/north, centimeters
uint16_t lastHeading = 0;
bool above = false; unsigned long lastStepMs = 0, lastImuMs = 0, stillSince = 0;
#endif

void blink(int n){ for(int i=0;i<n;i++){ digitalWrite(LED,HIGH); delay(80); digitalWrite(LED,LOW); delay(120);} }
float altM(){ return 44330.0*(1.0-pow(baro.readPressure()/100.0/1013.25,0.1903)); }

#if HAS_IMU
// Tilt-compensated heading, 0..359, from accel (mg) and mag (raw uT). Board flat, X forward.
uint16_t headingDeg(int16_t ax, int16_t ay, int16_t az, int32_t mx, int32_t my, int32_t mz){
  float fax=ax, fay=ay, faz=az;
  float roll  = atan2(fay, faz);
  float pitch = atan2(-fax, sqrt(fay*fay + faz*faz));
  float sr=sin(roll), cr=cos(roll), sp=sin(pitch), cp=cos(pitch);
  float fmx = mx - MAG_OFF_X, fmy = my - MAG_OFF_Y, fmz = mz - MAG_OFF_Z;
  float xh = fmx*cp + fmz*sp;
  float yh = fmx*sr*sp + fmy*cr - fmz*sr*cp;
  int h = (int)(atan2(-yh, xh) * 57.2958) + MAG_DECL_DEG;
  while(h < 0) h += 360; while(h >= 360) h -= 360;
  return (uint16_t)h;
}
// One IMU tick: step detection on |a|, heading sampled at each step. Returns true if still for STILL_MS.
bool imuTick(unsigned long now){
  if(now - lastImuMs < IMU_PERIOD_MS) return false;
  lastImuMs = now;
  int16_t ax = icm.getAccelerationX(), ay = icm.getAccelerationY(), az = icm.getAccelerationZ();   // mg
  long m2 = (long)ax*ax + (long)ay*ay + (long)az*az;
  uint16_t mag_mg = (uint16_t)sqrt((float)m2);
  // stillness
  if(mag_mg > 1000-STILL_BAND_MG && mag_mg < 1000+STILL_BAND_MG){ if(!stillSince) stillSince = now; }
  else stillSince = 0;
  // step: rising edge through STEP_HI, reset below STEP_LO
  if(!above && mag_mg > STEP_HI_MG && now - lastStepMs >= STEP_GAP_MS){
    above = true; lastStepMs = now;
    int32_t mx, my, mz;
    if(mag.isDataReady() == AK09918_ERR_OK) mag.getData(&mx, &my, &mz);
    else { mx = 0; my = 1; mz = 0; }
    uint16_t h = headingDeg(ax, ay, az, mx, my, mz);
    lastHeading = h; steps++;
    hist[(h + 11) / 22 % HDG_BINS]++;
    float r = h * 0.0174533;
    dxCm += (long)(sin(r) * STRIDE_CM); dyCm += (long)(cos(r) * STRIDE_CM);
  } else if(above && mag_mg < STEP_LO_MG) above = false;
  return stillSince && (now - stillSince > DEMO_STILL_MS);
}
// Build vec from the histogram: up to 3 largest bins as "n@hhh", then "R<dist m>@<brg>".
void buildVec(){
  char* p = vec; char* end = vec + sizeof(vec) - 1; *p = 0;
  uint8_t used[HDG_BINS] = {0};
  for(uint8_t k = 0; k < 3; k++){
    int best = -1; uint16_t bv = 0;
    for(uint8_t b = 0; b < HDG_BINS; b++) if(!used[b] && hist[b] > bv){ bv = hist[b]; best = b; }
    if(best < 0 || bv == 0) break;
    used[best] = 1;
    int n = snprintf(p, end - p, "%s%u@%03u", k ? "," : "", bv, (unsigned)(best * 360 / HDG_BINS));
    if(n < 0 || p + n >= end) break; p += n;
  }
  long distM = (long)(sqrt((float)dxCm*dxCm + (float)dyCm*dyCm) / 100.0);
  int brg = (int)(atan2((float)dxCm, (float)dyCm) * 57.2958); if(brg < 0) brg += 360;
  snprintf(p, end - p, "%sR%ld@%03d", (p > vec) ? "," : "", distM, brg);
}
#endif

void setup(){
  pinMode(LED,OUTPUT); pinMode(WAKE_PIN,INPUT_PULLUP);
  pinMode(RST,OUTPUT); digitalWrite(RST,HIGH); delay(10); digitalWrite(RST,LOW); delay(10); digitalWrite(RST,HIGH); delay(10);
  Serial1.begin(9600);
  Wire.begin();
  if(!rf95.init()) { while(1){ blink(5); delay(1000);} }   // antenna or pins wrong
  rf95.setFrequency(FREQ); rf95.setTxPower(20,false);
  baro.begin(0x77);
#if HAS_IMU
  icm.initialize();
  icm.setAccScaleRange(RANGE_4G);
  icm.setAccAverageSample(ACC_AVERAGE_8);
  mag.initialize();
  mag.switchMode(AK09918_POWER_DOWN);
  mag.switchMode(AK09918_CONTINUOUS_100HZ);
  for(uint8_t b = 0; b < HDG_BINS; b++) hist[b] = 0;
#endif
  blink(1);
  lastSet = millis();
}

void readSet(){
  static char line[100]; static uint8_t n=0;
  while(Serial1.available()){
    char c=Serial1.read();
    if(c=='\n'||n>=99){ line[n]=0; n=0;
      if(strncmp(line,"SET,",4)==0){ strncpy(vec,line+4,95); vec[95]=0; lastSet=millis(); vecFromPhone=true; blink(2); }
    } else if(c!='\r') line[n++]=c;
  }
}

void reply(){
  char out[128];
  float alt = (st==DROPPED||st==AWAKE) ? dropAlt : altM();
  unsigned long hrs = (millis()-dropMs)/3600000UL;
  snprintf(out,128,"%s,%d,%ld,%lu,%s",PUCK_ID,PUCK_POS,(long)alt,hrs,vec);
  delay(random(0,2000));
  rf95.send((uint8_t*)out,strlen(out)); rf95.waitPacketSent();
  blink(1);
}

void drop(){
#if HAS_IMU
  if(!vecFromPhone) buildVec();
#endif
  dropAlt=altM(); dropMs=millis(); st=DROPPED; rf95.sleep(); blink(3);
}

void loop(){
  unsigned long now = millis();
  if(st==KILLED){ Watchdog.sleep(8000); return; }

  if(st==DORMANT){
    // Nothing runs until the wire is cut. Sleep in 1 s steps and check the pin.
    if(digitalRead(WAKE_PIN)==HIGH){ st=CARRIED; lastSet=millis(); blink(1); return; }
    Watchdog.sleep(1000); return;
  }

  if(st==CARRIED){
    readSet();
#if HAS_IMU
    if(imuTick(now)) { drop(); return; }               // real stillness from the accelerometer
#else
    if(vec[0] && now-lastSet>DEMO_STILL_MS){ drop(); return; }   // quiet after the last SET
#endif
    delay(5); return;
  }

  if(st==DROPPED){
    // Dropped and settled: listen for the team. Always-on receiver for the demo; duty cycle later.
    st=AWAKE; rf95.setModeRx(); return;
  }

  // AWAKE: listen continuously for the demo
  uint8_t buf[64]; uint8_t len=sizeof(buf);
  if(rf95.waitAvailableTimeout(500) && rf95.recv(buf,&len)){
    buf[len]=0;
    if(strncmp((char*)buf,"CHAL",4)==0) reply();
    else if(strncmp((char*)buf,"KILL",4)==0){ st=KILLED; vec[0]=0; blink(10); }
  }
  if(millis()-dropMs > 72UL*3600000UL + 1) { /* 72 h dead-man: enable for production */ }
}
