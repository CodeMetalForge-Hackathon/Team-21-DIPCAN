package com.team21.dipcan

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbManager
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import java.io.IOException

/**
 * The 32u4 LoRa bridge over USB OTG. Line protocol (same as the Pi used):
 *   phone -> bridge:  TX <hex>\n
 *   bridge -> phone:  RX <hex> <rssi> <snr>\n  |  OK <n>  |  ERR ...
 */
class Bridge(private val ctx: Context) {
    companion object {
        const val ACTION_USB_PERMISSION = "com.team21.dipcan.USB_PERMISSION"
        private const val ADAFRUIT_VID = 0x239A
    }
    private var port: UsbSerialPort? = null
    private val buf = StringBuilder()
    val connected get() = port != null

    fun findDriver(): UsbSerialDriver? {
        val mgr = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
        val table = ProbeTable().apply {
            addProduct(ADAFRUIT_VID, 0x800C, CdcAcmSerialDriver::class.java)   // Feather 32u4
            addProduct(ADAFRUIT_VID, 0x812D, CdcAcmSerialDriver::class.java)   // Feather RP2040 RFM
        }
        val custom = UsbSerialProber(table).findAllDrivers(mgr)
        if (custom.isNotEmpty()) return custom[0]
        val def = UsbSerialProber.getDefaultProber().findAllDrivers(mgr)
        return def.firstOrNull()
    }

    fun hasPermission(d: UsbSerialDriver): Boolean =
        (ctx.getSystemService(Context.USB_SERVICE) as UsbManager).hasPermission(d.device)

    fun requestPermission(d: UsbSerialDriver) {
        val mgr = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
        val flags = if (android.os.Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ACTION_USB_PERMISSION).setPackage(ctx.packageName), flags)
        mgr.requestPermission(d.device, pi)
    }

    @Throws(IOException::class)
    fun open(d: UsbSerialDriver) {
        val mgr = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
        val conn = mgr.openDevice(d.device) ?: throw IOException("openDevice returned null (no permission?)")
        val p = d.ports[0]
        p.open(conn)
        p.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
        try { p.dtr = true } catch (_: Exception) {}
        port = p
        buf.setLength(0)
    }

    fun close() { try { port?.close() } catch (_: Exception) {}; port = null }

    @Throws(IOException::class)
    fun writeLine(s: String) { port?.write((s + "\n").toByteArray(), 500) ?: throw IOException("not connected") }

    /** Reads whatever is available (up to timeoutMs) and returns complete lines. */
    fun readLines(timeoutMs: Int): List<String> {
        val p = port ?: return emptyList()
        val tmp = ByteArray(1024)
        val n = try { p.read(tmp, timeoutMs) } catch (e: IOException) { return emptyList() }
        if (n > 0) buf.append(String(tmp, 0, n))
        val out = ArrayList<String>()
        while (true) {
            val i = buf.indexOf("\n"); if (i < 0) break
            out.add(buf.substring(0, i).trim()); buf.delete(0, i + 1)
        }
        return out
    }
}
