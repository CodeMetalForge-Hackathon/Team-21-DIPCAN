// Loads timing, route, borders, Boston streets, and decodes terrarium PNGs into Float32 height grids.
const J = async (p) => (await fetch(p)).json();
export async function loadAll() {
  const [timing, route, zMeta, iMeta, borders, boston] = await Promise.all([
    J('../data/timing.json'), J('../data/route.json'), J('../data/zagros.json'), J('../data/iran.json'), J('../data/borders.json'), J('../data/boston.json')]);
  const [zagros, iran] = await Promise.all([decode('../data/zagros.png', zMeta), decode('../data/iran.png', iMeta)]);
  return { timing, route, zagros, iran, borders, boston };
}
function decode(src, meta) {
  return new Promise((res, rej) => {
    const im = new Image(); im.onerror = rej;
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; const h = new Float32Array(c.width * c.height);
      for (let i = 0, j = 0; i < h.length; i++, j += 4) h[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
      res({ ...meta, w: c.width, h: c.height, data: h });
    };
    im.src = src;
  });
}
// Web Mercator helpers in image pixel space of a grid.
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export function toPx(grid, lon, lat) {
  const x = ((lon - grid.west) / (grid.east - grid.west)) * grid.w;
  const y = ((merc(grid.north) - merc(lat)) / (merc(grid.north) - merc(grid.south))) * grid.h;
  return [x, y];
}
export function metersPerPx(grid) { const latMid = (grid.north + grid.south) / 2; return (40075016.686 * Math.cos((latMid * Math.PI) / 180)) / (256 * 2 ** grid.z); }
