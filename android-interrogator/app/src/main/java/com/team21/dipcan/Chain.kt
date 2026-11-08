package com.team21.dipcan

import kotlin.math.cos
import kotlin.math.sin

/** Port of interrogator/chain.py: legs known at both ends, a silent puck is placed from its predecessor's pointer. */
object Chain {
    const val STEP_M = 0.75

    data class Node(
        val id: Int, val lat: Double, val lon: Double, val elevM: Int, val status: String,
        val minSinceDrop: Int, val steps: Int, val headingDeg: Int?, val legSource: String, val rssi: Double?,
    )

    class State {
        val seen = HashMap<Int, Packet.Answer>()
        val seenAt = HashMap<Int, Long>()
        val tampered = HashSet<Int>()
        var killed = false
        fun update(answers: List<Packet.Answer>, killed: Boolean = false) {
            val now = System.currentTimeMillis()
            for (a in answers) { seen[a.puckId] = a; seenAt[a.puckId] = now; if (a.tampered) tampered.add(a.puckId) }
            if (killed) this.killed = true
        }
        fun clear() { seen.clear(); seenAt.clear(); tampered.clear(); killed = false }
    }

    fun offset(lat: Double, lon: Double, distM: Double, bearingDeg: Double): Pair<Double, Double> {
        val dlat = distM * cos(Math.toRadians(bearingDeg)) / 111_320.0
        val dlon = distM * sin(Math.toRadians(bearingDeg)) / (111_320.0 * cos(Math.toRadians(lat)))
        return Pair(lat + dlat, lon + dlon)
    }

    /** Leg from id-1 to id: (steps, heading, dalt, source) from either end. */
    private fun leg(st: State, id: Int): Triple<Int, Int?, String>? {
        val a = st.seen[id]
        if (a != null && (a.steps > 0 || a.headingDeg != null)) return Triple(a.steps, a.headingDeg, "own")
        val p = st.seen[id - 1]
        // A pointer with no steps and no heading means "paired but still carried": not a leg yet.
        if (p != null && p.nextId == id && (p.nextSteps > 0 || p.nextHeading != null)) return Triple(p.nextSteps, p.nextHeading, "predecessor")
        if (a != null) return Triple(a.steps, a.headingDeg, "own")
        return null
    }

    fun build(st: State, anchorLat: Double, anchorLon: Double, staleMs: Long = 30_000): List<Node> {
        if (st.seen.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val maxId = maxOf(st.seen.keys.max(), st.seen.values.mapNotNull { it.nextId }.maxOrNull() ?: -1)
        val out = ArrayList<Node>()
        var lat = anchorLat; var lon = anchorLon; var lastHeading = 0.0
        for (id in 0..maxId) {
            val a = st.seen[id]
            val lg = if (id > 0) leg(st, id) else null
            var src = "none"
            if (id > 0) {
                if (lg != null) {
                    val (steps, hdg, s) = lg; src = s
                    val h = hdg?.toDouble() ?: lastHeading
                    val p = offset(lat, lon, steps * STEP_M, h); lat = p.first; lon = p.second; lastHeading = h
                } else if (a == null) {
                    continue   // known only as "paired, still carried": nothing to place yet
                }
            }
            if (a == null) {
                val status = if (lg != null && src == "predecessor") "pointer-only" else "silent"
                out.add(Node(id, lat, lon, 0, status, 0, lg?.first ?: 0, lg?.second, src, null)); continue
            }
            val status = when {
                st.killed -> "killed"
                id in st.tampered -> "tampered"
                now - (st.seenAt[id] ?: 0L) > staleMs -> "silent"
                a.unarmed -> "unarmed"
                else -> "answered"
            }
            out.add(Node(id, lat, lon, a.elevM, status, a.minSinceDrop, a.steps, a.headingDeg, src, a.rssi))
        }
        return out
    }
}
