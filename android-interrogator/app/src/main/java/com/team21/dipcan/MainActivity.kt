package com.team21.dipcan

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.ToggleButton
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var bridge: Bridge
    private val exec = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())
    private val chain = Chain.State()
    private var autoOn = false
    private var anchor: Pair<Double, Double>? = null

    private val SLOT_S = 0.4; private val BASE_S = 0.7; private val PREAMBLE_S = 1.3; private val MAX_PUCKS = 8

    private lateinit var status: TextView; private lateinit var log: TextView; private lateinit var scroll: ScrollView
    private lateinit var keyField: EditText; private lateinit var chainField: EditText
    private lateinit var latField: EditText; private lateinit var lonField: EditText

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Bridge.ACTION_USB_PERMISSION -> if (i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) connect() else logLine("usb permission denied")
                UsbManager.ACTION_USB_DEVICE_DETACHED -> { bridge.close(); setStatus("bridge: unplugged") }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        bridge = Bridge(this)
        status = findViewById(R.id.status); log = findViewById(R.id.log); scroll = findViewById(R.id.scroll)
        keyField = findViewById(R.id.key); chainField = findViewById(R.id.chainId)
        latField = findViewById(R.id.anchorLat); lonField = findViewById(R.id.anchorLon)
        val prefs = getSharedPreferences("dipcan", MODE_PRIVATE)
        keyField.setText(prefs.getString("key", BuildConfig.DEFAULT_KEY))
        chainField.setText(prefs.getString("chain", "1"))

        findViewById<Button>(R.id.connect).setOnClickListener { connect() }
        findViewById<Button>(R.id.sweep).setOnClickListener { exec.execute { sweep(false) } }
        findViewById<Button>(R.id.kill).setOnClickListener { exec.execute { sweep(true) } }
        findViewById<Button>(R.id.clear).setOnClickListener { chain.clear(); anchor = null; log.text = ""; logLine("cleared") }
        findViewById<ToggleButton>(R.id.auto).setOnCheckedChangeListener { _, on -> autoOn = on; if (on) scheduleAuto() }

        val f = IntentFilter().apply { addAction(Bridge.ACTION_USB_PERMISSION); addAction(UsbManager.ACTION_USB_DEVICE_DETACHED) }
        ContextCompat.registerReceiver(this, usbReceiver, f, ContextCompat.RECEIVER_NOT_EXPORTED)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 1)
        logLine("ATAK: add a UDP input on port 4242 (Settings > Network Connections > Manage Inputs)")
        connect()
    }

    override fun onDestroy() { super.onDestroy(); autoOn = false; bridge.close(); unregisterReceiver(usbReceiver) }

    private fun setStatus(s: String) = ui.post { status.text = s }
    private fun logLine(s: String) = ui.post {
        log.append(s + "\n"); scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun connect() {
        val d = bridge.findDriver()
        if (d == null) { setStatus("bridge: no USB serial device (plug the 32u4 in with the OTG cable)"); return }
        if (!bridge.hasPermission(d)) { setStatus("bridge: asking for USB permission…"); bridge.requestPermission(d); return }
        try { bridge.close(); bridge.open(d); setStatus("bridge: connected (${d.device.productName ?: "usb serial"})"); logLine("bridge connected") }
        catch (e: Exception) { setStatus("bridge: open failed: ${e.message}") }
    }

    private fun savePrefs() {
        getSharedPreferences("dipcan", MODE_PRIVATE).edit().putString("key", keyField.text.toString().trim()).putString("chain", chainField.text.toString().trim()).apply()
    }

    private fun resolveAnchor(): Pair<Double, Double>? {
        anchor?.let { return it }
        val lat = latField.text.toString().toDoubleOrNull(); val lon = lonField.text.toString().toDoubleOrNull()
        if (lat != null && lon != null) { anchor = Pair(lat, lon); return anchor }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val loc = try { lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) } catch (_: SecurityException) { null }
            if (loc != null) { anchor = Pair(loc.latitude, loc.longitude); logLine("anchor = phone position %.5f, %.5f".format(loc.latitude, loc.longitude)); return anchor }
        }
        return null
    }

    private fun scheduleAuto() { if (autoOn) ui.postDelayed({ if (autoOn) { exec.execute { sweep(false) }; scheduleAuto() } }, 5000) }

    /** One signed challenge (or kill), collect the slotted answers, rebuild the chain, push CoT. Runs off the UI thread. */
    private fun sweep(kill: Boolean) {
        if (!bridge.connected) { logLine("not connected"); return }
        ui.post { savePrefs() }
        val keyHex = keyField.text.toString().trim(); val chainId = chainField.text.toString().trim().toIntOrNull() ?: 1
        if (keyHex.length != 32) { logLine("key must be 32 hex chars"); return }
        val key = Packet.hexToBytes(keyHex)
        val counter = System.currentTimeMillis() / 1000
        try { bridge.writeLine("TX " + Packet.bytesToHex(Packet.buildChallenge(key, chainId, counter, kill))) }
        catch (e: Exception) { logLine("write failed: ${e.message}"); return }
        logLine((if (kill) "KILL" else "challenge") + " ctr=$counter")
        val answers = ArrayList<Packet.Answer>()
        val deadline = System.currentTimeMillis() + ((PREAMBLE_S + BASE_S + SLOT_S * (MAX_PUCKS + 1)) * 1000).toLong()
        while (System.currentTimeMillis() < deadline) {
            for (line in bridge.readLines(200)) {
                if (!line.startsWith("RX ")) continue
                val parts = line.split(" ")
                val raw = try { Packet.hexToBytes(parts[1]) } catch (_: Exception) { continue }
                val rssi = parts.getOrNull(2)?.toDoubleOrNull() ?: 0.0
                val a = Packet.parseAnswer(key, raw, rssi)
                if (a == null) { logLine("  bad packet (${raw.size} B)"); continue }
                if (a.counterEcho != counter) { logLine("  stale echo from ${a.puckId}"); continue }
                logLine("  dipcan ${a.puckId}${if (a.unarmed) " (unarmed)" else ""} elev=${a.elevM}m leg=${a.steps}/${a.headingDeg ?: "?"}/${a.altDeltaM} next=${a.nextId?.let { "$it:${a.nextSteps}/${a.nextHeading ?: "?"}/${a.nextAltDelta}" } ?: "-"} rssi=${rssi.toInt()}")
                answers.add(a)
            }
        }
        if (answers.isEmpty() && !kill) { logLine("  no answers"); return }
        chain.update(answers, killed = kill)
        val (alat, alon) = resolveAnchor() ?: run { logLine("no anchor: enter lat/lon or wait for GPS"); return }
        val nodes = Chain.build(chain, alat, alon)
        val msgs = ArrayList<String>()
        nodes.forEach { msgs.add(Cot.marker(it, chainId)) }
        if (nodes.size > 1) msgs.add(Cot.route(nodes, chainId))
        nodes.forEach { logLine("  map: D${it.id} ${it.status} (${it.legSource}) %.5f,%.5f".format(it.lat, it.lon)) }
        logLine("  " + Cot.send(msgs))
    }
}
