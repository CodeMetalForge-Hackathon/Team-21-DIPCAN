// Read sheet for recording the narration: one numbered line per spoken row of script.md, in play order.
// Usage: bun tools/readsheet.ts  -> read-sheet.md
import { readFileSync, writeFileSync } from "node:fs";
const md = readFileSync("script.md", "utf8").split("\n");
const rows: { n: number; text: string; scene: string }[] = []; let scene = "";
for (const l of md) {
  const h = l.match(/^## (S\d+)\. (.+?) \(/); if (h) { scene = h[2]; continue; }
  const r = l.match(/^\| (\d+) \| (.+?) \| /); if (!r) continue;
  const text = r[2].trim().replace(/\[\^\d+\]/g, "").replace(/^\[pause [\d.]+\]\s*/i, "");
  if (/^\[cut\]/i.test(text)) continue;
  rows.push({ n: Number(r[1]), text, scene });
}
let out = `# DIPCAN narration read sheet\n\nRecord one file per line, named by the number in the first column, into \`video/audio/human/\` (for example \`29.wav\`, \`29.m4a\`). Or record one continuous take, leave at least two seconds of silence between lines, and run \`bun tools/split-take.ts <take.m4a>\`.\n\nDelivery: flat, unhurried, a half beat after the number. Say the clock as military time ("zero four fifty-two", "fifteen ten", "twenty-two fifteen"). Say elevations in full ("two thousand nine hundred forty meters"). Pronunciations: Koh-gee-loo-yeh (yeh rhymes with say), Bo-yer Ah-mad, Deh-dasht, Zag-ross, "A-tack" for ATAK, "Dude four four Bravo". Leave a clear pause before "Team 21".\n\n${rows.length} lines.\n\n| # | Line |\n|---|------|\n`;
let last = "";
for (const r of rows) { if (r.scene !== last) { out += `| | **${r.scene}** |\n`; last = r.scene; } out += `| ${r.n} | ${r.text} |\n`; }
writeFileSync("read-sheet.md", out);
console.log(`read-sheet.md: ${rows.length} lines`);
