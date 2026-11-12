/* Generador de códigos QR (modo byte, corrección M, versiones 1-10). Sin dependencias. */
const QR = (() => {
  const EC = { // versión: [codewords EC por bloque, [bloques, datos por bloque], [bloques, datos por bloque]]
    1: [10, [1, 16], [0, 0]], 2: [16, [1, 28], [0, 0]], 3: [26, [1, 44], [0, 0]], 4: [18, [2, 32], [0, 0]], 5: [24, [2, 43], [0, 0]],
    6: [16, [4, 27], [0, 0]], 7: [18, [4, 31], [0, 0]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]], 10: [26, [4, 43], [1, 44]],
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; }
  const dataCap = (v) => EC[v][1][0] * EC[v][1][1] + EC[v][2][0] * EC[v][2][1];

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 1; while (v <= 10 && bytes.length > dataCap(v) - (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error('Texto demasiado largo para este generador (máx. ~210 caracteres).');
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
    const cap = dataCap(v) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0xEC; data.length < dataCap(v); p ^= 0xEC ^ 0x11) data.push(p);
    // bloques + EC
    const [ecLen, g1, g2] = EC[v], blocks = []; let pos = 0;
    for (const [n, len] of [g1, g2]) for (let i = 0; i < n; i++) { const d = data.slice(pos, pos + len); pos += len; blocks.push({ d, e: rsRem(d, ecLen) }); }
    const out = []; const maxD = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.e[i]));
    // matriz
    const size = 17 + 4 * v, M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[v];
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const bit = (n, i) => ((n >>> i) & 1) !== 0;
    const drawFormat = (mask) => {
      const d = mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i)); set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); const b = (v << 12) | rem; for (let i = 0; i < 18; i++) { const c = bit(b, i), a = size - 11 + (i % 3), k = Math.floor(i / 3); set(a, k, c); set(k, a, c); } }
    // datos en zigzag
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && k < out.length * 8) { M[y][x] = bit(out[k >>> 3], 7 - (k & 7)); k++; }
      }
    }
    // máscara con menor penalización
    const cond = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const penalty = (G) => {
      let p = 0;
      for (const line of [...G, ...G[0].map((_, c) => G.map((r) => r[c]))]) {
        let run = 1; for (let i = 1; i <= size; i++) { if (i < size && line[i] === line[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
        const s = line.map((c) => (c ? 1 : 0)).join('');
        for (const pat of ['10111010000', '00001011101']) { let idx = -1; while ((idx = s.indexOf(pat, idx + 1)) !== -1) p += 40; }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (G[y][x] === G[y][x + 1] && G[y][x] === G[y + 1][x] && G[y][x] === G[y + 1][x + 1]) p += 3;
      const dark = G.flat().filter(Boolean).length; p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
      return p;
    };
    let best = null;
    for (let m = 0; m < 8; m++) {
      const G = M.map((r) => r.slice());
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && cond[m](x, y)) G[y][x] = !G[y][x];
      // formato con la máscara
      const save = { M, F }; // reutiliza drawFormat sobre G
      const setG = (x, y, d) => { G[y][x] = d; };
      const d = m; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setG(8, i, bit(b, i)); setG(8, 7, bit(b, 6)); setG(8, 8, bit(b, 7)); setG(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setG(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setG(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setG(8, size - 15 + i, bit(b, i));
      setG(8, size - 8, true);
      const pen = penalty(G); if (!best || pen < best.pen) best = { G, pen };
    }
    return { size, modules: best.G, version: v };
  }
  function toCanvas(canvas, text, { scale = 10, margin = 4, dark = '#000000', light = '#ffffff' } = {}) {
    const q = encode(text), px = (q.size + margin * 2) * scale;
    canvas.width = canvas.height = px; const c = canvas.getContext('2d');
    c.fillStyle = light; c.fillRect(0, 0, px, px); c.fillStyle = dark;
    q.modules.forEach((row, y) => row.forEach((d, x) => { if (d) c.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale); }));
    return canvas;
  }
  return { encode, toCanvas };
})();
if (typeof module !== 'undefined') module.exports = QR;
