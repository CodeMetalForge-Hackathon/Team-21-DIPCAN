package com.team21.dipcan

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Cursor-on-Target to ATAK on the same phone: UDP to 127.0.0.1:4242 (add a UDP input in ATAK), plus SA multicast. */
object Cot {
    private const val LOCAL_PORT = 4242
    private const val MCAST = "239.2.3.1"
    private const val MCAST_PORT = 6969
    private const val STALE_MIN = 30

    private val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    private fun iso(offsetMin: Int = 0) = fmt.format(Date(System.currentTimeMillis() + offsetMin * 60_000L))

    private val type = mapOf("answered" to "a-f-G-U-C", "unarmed" to "a-f-G-U-C", "pointer-only" to "a-u-G",
        "silent" to "a-u-G", "tampered" to "a-h-G", "killed" to "a-n-G")
    private val color = mapOf("answered" to "-16711936", "unarmed" to "-256", "pointer-only" to "-7829368",
        "silent" to "-7829368", "tampered" to "-65536", "killed" to "-7829368")

    fun marker(n: Chain.Node, chainId: Int): String {
        val uid = "dipcan-$chainId-${n.id}"
        val remarks = "Dipcan ${n.id} ${n.status.uppercase()} | elev ${n.elevM} m | dropped ${n.minSinceDrop} min ago | " +
            "leg ${n.steps} steps hdg ${n.headingDeg ?: "?"} (${n.legSource})" + (n.rssi?.let { " | rssi ${it.toInt()}" } ?: "")
        return """<event version="2.0" uid="$uid" type="${type[n.status]}" how="m-g" time="${iso()}" start="${iso()}" stale="${iso(STALE_MIN)}">""" +
            """<point lat="%.6f" lon="%.6f" hae="${n.elevM}" ce="150" le="20"/>""".format(Locale.US, n.lat, n.lon) +
            """<detail><contact callsign="D${n.id}"/><color argb="${color[n.status]}"/><remarks>$remarks</remarks></detail></event>"""
    }

    fun route(nodes: List<Chain.Node>, chainId: Int): String {
        val uid = "dipcan-route-$chainId"
        val links = nodes.joinToString("") { n ->
            """<link uid="${UUID.randomUUID()}" callsign="D${n.id}" type="b-m-p-w" point="%.6f,%.6f" remarks="elev ${n.elevM} m"/>""".format(Locale.US, n.lat, n.lon)
        }
        val f = nodes.first()
        return """<event version="2.0" uid="$uid" type="b-m-r" how="m-g" time="${iso()}" start="${iso()}" stale="${iso(STALE_MIN)}">""" +
            """<point lat="%.6f" lon="%.6f" hae="${f.elevM}" ce="150" le="20"/>""".format(Locale.US, f.lat, f.lon) +
            """<detail><contact callsign="Dipcan chain $chainId"/>$links<strokeColor value="-256"/><strokeWeight value="3.0"/><__routeinfo><__navcues/></__routeinfo></detail></event>"""
    }

    /** Sends to the local ATAK input and to the SA multicast group. Returns a short status string. */
    fun send(msgs: List<String>): String {
        var ok = 0; var err: String? = null
        try {
            DatagramSocket().use { s ->
                val local = InetAddress.getByName("127.0.0.1"); val mc = InetAddress.getByName(MCAST)
                for (m in msgs) {
                    val b = m.toByteArray()
                    try { s.send(DatagramPacket(b, b.size, local, LOCAL_PORT)); ok++ } catch (e: Exception) { err = e.message }
                    try { s.send(DatagramPacket(b, b.size, mc, MCAST_PORT)) } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) { err = e.message }
        return "cot: $ok/${msgs.size} sent to 127.0.0.1:$LOCAL_PORT" + (err?.let { " ($it)" } ?: "")
    }
}
