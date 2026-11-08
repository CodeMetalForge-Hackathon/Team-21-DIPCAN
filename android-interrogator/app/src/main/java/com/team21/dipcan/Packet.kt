package com.team21.dipcan

import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Mirror of firmware/common/packet.h (little-endian, HMAC-SHA256 truncated to 16 bytes). */
object Packet {
    const val HMAC_LEN = 16
    const val ID_NONE = 0xFF
    const val PKT_CHALLENGE = 0x01
    const val PKT_ANSWER = 0x02
    const val PKT_KILL = 0x03
    const val ST_TAMPERED = 0x01
    const val ST_ANCHOR = 0x10
    const val ST_UNARMED = 0x20
    const val CHALLENGE_LEN = 23
    const val ANSWER_LEN = 42

    fun hexToBytes(hex: String): ByteArray = hex.trim().chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    fun bytesToHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

    private fun mac(key: ByteArray, data: ByteArray): ByteArray {
        val m = Mac.getInstance("HmacSHA256")
        m.init(SecretKeySpec(key, "HmacSHA256"))
        return m.doFinal(data).copyOf(HMAC_LEN)
    }

    fun buildChallenge(key: ByteArray, chainId: Int, counter: Long, kill: Boolean = false): ByteArray {
        val body = ByteBuffer.allocate(7).order(ByteOrder.LITTLE_ENDIAN)
            .put((if (kill) PKT_KILL else PKT_CHALLENGE).toByte()).putShort(chainId.toShort()).putInt(counter.toInt()).array()
        return body + mac(key, body)
    }

    data class Answer(
        val chainId: Int, val puckId: Int, val status: Int, val counterEcho: Long,
        val elevM: Int, val minSinceDrop: Int, val steps: Int, val headingDeg: Int?, val altDeltaM: Int,
        val nextId: Int?, val nextSteps: Int, val nextHeading: Int?, val nextAltDelta: Int,
        val rssi: Double,
    ) {
        val tampered get() = status and ST_TAMPERED != 0
        val unarmed get() = status and ST_UNARMED != 0
    }

    fun parseAnswer(key: ByteArray, raw: ByteArray, rssi: Double): Answer? {
        if (raw.size != ANSWER_LEN) return null
        val body = raw.copyOfRange(0, ANSWER_LEN - HMAC_LEN)
        val tag = raw.copyOfRange(ANSWER_LEN - HMAC_LEN, ANSWER_LEN)
        if (!mac(key, body).contentEquals(tag)) return null
        val b = ByteBuffer.wrap(body).order(ByteOrder.LITTLE_ENDIAN)
        val type = b.get().toInt() and 0xFF
        if (type != PKT_ANSWER) return null
        val chainId = b.short.toInt() and 0xFFFF
        val puckId = b.get().toInt() and 0xFF
        val status = b.get().toInt() and 0xFF
        val ctr = b.int.toLong() and 0xFFFFFFFFL
        val elev = b.short.toInt()
        val mins = b.short.toInt() and 0xFFFF
        val steps = b.short.toInt() and 0xFFFF
        val hdg = b.short.toInt() and 0xFFFF
        val dalt = b.short.toInt()
        val nid = b.get().toInt() and 0xFF
        val nsteps = b.short.toInt() and 0xFFFF
        val nhdg = b.short.toInt() and 0xFFFF
        val ndalt = b.short.toInt()
        return Answer(chainId, puckId, status, ctr, elev, mins, steps, if (hdg == 0xFFFF) null else hdg, dalt,
            if (nid == ID_NONE) null else nid, nsteps, if (nhdg == 0xFFFF) null else nhdg, ndalt, rssi)
    }
}
