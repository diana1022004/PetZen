/* PetZen — servidor (Node.js >= 18, SIN dependencias externas)
 * Sirve la app web (carpeta /public) y expone la API REST + endpoints para el ESP32.
 * Uso:  node server.js   →  http://localhost:3000
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');
const PUBLIC_DIR = path.join(__dirname, 'public');   // la app
const SITE_DIR = path.join(__dirname, 'site');       // la página publicitaria
const TZ = 'America/Bogota';
const CMD_TTL_MS = 2 * 60 * 1000;      // una orden sin atender caduca en 2 min
const ONLINE_MS = 45 * 1000;           // el comedero cuenta como "en línea" si habló hace < 45 s

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();

/* ------------------------------------------------------------------ BASE DE DATOS (JSON) */
const EMPTY = { users: [], pets: [], schedules: [], logs: [], reminders: [], orders: [], commands: [], appointments: [], docs: [], activity: [] };
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
let db = EMPTY;
try { db = { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch { db = structuredClone(EMPTY); }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
const uid = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();
function act(user, type, text) {            // historial de actividad del usuario
  db.activity.push({ id: uid(), userId: user.id, at: now(), type, text });
  if (db.activity.length > 4000) db.activity = db.activity.slice(-3000);
}

/* ------------------------------------------------------------------ SEGURIDAD */
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(h, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
// límite simple de intentos de login por IP
const attempts = new Map();
function tooMany(ip) {
  const a = (attempts.get(ip) || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
  attempts.set(ip, a);
  return a.length >= 10;
}

/* ------------------------------------------------------------------ UTILIDADES */
const clean = (s, max = 80) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const num = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
function bogotaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => ((a[p.type] = p.value), a), {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hh}:${parts.minute}` };
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, deviceKey: u.deviceKey, createdAt: u.createdAt, consentAt: u.consentAt, vet247: u.vet247 || null };
}
function deviceStatus(u) {
  const online = u.lastSeen && Date.now() - new Date(u.lastSeen).getTime() < ONLINE_MS;
  return { online: !!online, lastSeen: u.lastSeen || null, foodLevel: u.foodLevel ?? null, firmware: u.firmware || null };
}
/** Marca como "expirada" cualquier orden vieja y devuelve las pendientes */
function expireCommands() {
  const t = Date.now();
  for (const c of db.commands) {
    if (c.status === 'pendiente' && t - new Date(c.createdAt).getTime() > CMD_TTL_MS) {
      c.status = 'expirada';
      const log = db.logs.find((l) => l.id === c.logId);
      if (log) log.status = 'no_entregada';
      save();
    }
  }
}
function enqueueDispense(user, { petId, grams, source }) {
  const logId = uid();
  const pet = db.pets.find((p) => p.id === petId && p.userId === user.id);
  db.logs.push({ id: logId, userId: user.id, petId: pet ? pet.id : null, petName: pet ? pet.name : 'Sin asignar', grams, source, status: 'pendiente', at: now() });
  const cmd = { id: uid(), userId: user.id, logId, grams, status: 'pendiente', createdAt: now() };
  db.commands.push(cmd);
  save();
  return cmd;
}

/* ------------------------------------------------------------------ WORD / EXCEL SIN DEPENDENCIAS */
const zlib = require('node:zlib');
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {               // files: { 'ruta': 'texto' }
  const locals = [], centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = Buffer.from(name), data = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const xe = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const colName = (i) => String.fromCharCode(65 + i);
function makeXlsx(sheets) {             // sheets: [{ name, header:[..], rows:[[..]] }]
  const sheetXml = (sh) => {
    const rows = [sh.header, ...sh.rows].map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
      return typeof v === 'number' ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = sh.header.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(46, Math.max(14, ...[sh.header, ...sh.rows].map((r) => String(r[i] ?? '').length + 2)))}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B3162"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
  return makeZip(files);
}
function makeDocx(title, blocks) {      // blocks: {h:'..'} | {p:'..'} | {table:{header,rows}}
  const run = (t, o = '') => `<w:r><w:rPr>${o}</w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const para = (t, o = '', style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(t, o)}</w:p>`;
  const cell = (t, head) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="0B3162"/>' : ''}</w:tcPr>${para(t, head ? '<w:b/><w:color w:val="FFFFFF"/>' : '')}</w:tc>`;
  const body = blocks.map((b) => {
    if (b.h) return para(b.h, '', 'Heading1');
    if (b.p !== undefined) return para(b.p);
    const t = b.table;
    if (!t.rows.length) return para('— Sin registros —', '<w:i/>');
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFC7D5"/>`).join('')}</w:tblBorders></w:tblPr><w:tr>${t.header.map((h) => cell(h, true)).join('')}</w:tr>${t.rows.map((r) => `<w:tr>${r.map((v) => cell(v)).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`;
  }).join('');
  return makeZip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:color w:val="0B3162"/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="320" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0B3162"/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para(title, '', 'Title')}${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  });
}

/* ------------------------------------------------------------------ PLANIFICADOR (horarios automáticos) */
setInterval(() => {
  expireCommands();
  const { date, time } = bogotaNow();
  for (const s of db.schedules) {
    if (!s.enabled || s.time !== time || s.lastRun === date) continue;
    const user = db.users.find((u) => u.id === s.userId);
    if (!user) continue;
    s.lastRun = date;
    enqueueDispense(user, { petId: s.petId, grams: s.grams, source: 'horario' });
  }
  // recordatorios vencidos → quedan marcados como "vencidos" sólo visualmente en el cliente
}, 20 * 1000);

/* ------------------------------------------------------------------ TIENDAS ALIADAS */
const STORES = [
  { id: 'petzen', name: 'PetZen Oficial', emoji: '🐾', color: '#0B3162', type: 'goods', tag: 'Nuestro comedero, accesorios y planes', sections: ['Comedero', 'Accesorios', 'Suscripción'] },
  { id: 'supermasc', name: 'SuperMasc', emoji: '🛍️', color: '#D86F2B', type: 'goods', tag: 'Comida, ropa, juguetes, accesorios e higiene', sections: ['Comida', 'Ropa', 'Juguetes', 'Accesorios', 'Higiene'] },
  { id: 'clinica', name: 'Clínica Veterinaria Patitas', emoji: '🩺', color: '#1C8C7A', type: 'service', tag: 'Citas veterinarias', sections: ['Consultas', 'Prevención', 'Diagnóstico'] },
  { id: 'spa', name: 'Spa Canino Zen', emoji: '🛁', color: '#7A4FC2', type: 'service', tag: 'Baño, peluquería y cuidado', sections: ['Baño y peluquería', 'Cuidado extra'] },
];
const P = (id, store, section, name, price, emoji, desc, sizes) => ({ id, store, section, name, price, emoji, desc, ...(sizes ? { sizes } : {}) });
const SZ5 = ['XS', 'S', 'M', 'L', 'XL'], SZ3 = ['S', 'M', 'L'];
const PRODUCTS = [
  P('comedero', 'petzen', 'Comedero', 'Comedero inteligente PetZen', 400000, '🍽️', 'Dispensador WiFi con control desde la app.'),
  P('tolva', 'petzen', 'Accesorios', 'Tolva de repuesto 4 L', 65000, '🪣', 'Depósito extra para el comedero PetZen.'),
  P('plato-inox', 'petzen', 'Accesorios', 'Plato de acero inoxidable', 38000, '🥣', 'Antideslizante y apto para lavavajillas.'),
  P('fuente', 'petzen', 'Accesorios', 'Fuente de agua con filtro', 89000, '⛲', 'Agua fresca en circulación, silenciosa.'),
  P('suscripcion', 'petzen', 'Suscripción', 'Suscripción PetZen Premium (1 mes)', 9900, '⭐', 'Nutrición personalizada y reportes.'),
  P('suscripcion-anual', 'petzen', 'Suscripción', 'Suscripción PetZen Premium (12 meses)', 99000, '🌟', 'Un año de nutrición personalizada y reportes.'),

  P('alim-adulto', 'supermasc', 'Comida', 'Alimento premium adulto 3 kg', 98000, '🥩', 'Para perros adultos.'),
  P('alim-cachorro', 'supermasc', 'Comida', 'Alimento premium cachorro 3 kg', 105000, '🐶', 'Para cachorros en crecimiento.'),
  P('alim-senior', 'supermasc', 'Comida', 'Alimento senior 3 kg', 102000, '🧓', 'Articulaciones y digestión de perros mayores.'),
  P('alim-pequenas', 'supermasc', 'Comida', 'Alimento razas pequeñas 2 kg', 74000, '🐕', 'Croqueta pequeña, fácil de masticar.'),
  P('alim-light', 'supermasc', 'Comida', 'Alimento control de peso 3 kg', 96000, '⚖️', 'Menos calorías, misma saciedad.'),
  P('alim-gato', 'supermasc', 'Comida', 'Alimento para gato adulto 1,5 kg', 62000, '🐱', 'Para gatos adultos.'),
  P('alim-gato-cachorro', 'supermasc', 'Comida', 'Alimento para gatito 1,5 kg', 66000, '😺', 'Para gatitos hasta el año.'),
  P('alim-humedo', 'supermasc', 'Comida', 'Alimento húmedo (pack x6 latas)', 36000, '🥫', 'Pollo y verduras, para perro o gato.'),
  P('snacks', 'supermasc', 'Comida', 'Snacks naturales (pack)', 24000, '🦴', 'Premios para entrenamiento.'),
  P('galletas-dentales', 'supermasc', 'Comida', 'Galletas dentales', 26000, '🍪', 'Ayudan a reducir el sarro.'),

  P('impermeable', 'supermasc', 'Ropa', 'Impermeable para perro', 55000, '🧥', 'Para los días de lluvia.', SZ5),
  P('sueter', 'supermasc', 'Ropa', 'Suéter tejido', 48000, '🧶', 'Abrigado y suave.', SZ5),
  P('arnes', 'supermasc', 'Ropa', 'Arnés acolchado', 39000, '🎽', 'Cómodo para paseos.', SZ3),
  P('camiseta', 'supermasc', 'Ropa', 'Camiseta de algodón', 28000, '👕', 'Fresca para el clima de Cali.', SZ5),
  P('chaleco', 'supermasc', 'Ropa', 'Chaleco reflectivo', 45000, '🦺', 'Visible en paseos nocturnos.', SZ5),
  P('bandana', 'supermasc', 'Ropa', 'Bandana', 15000, '🧣', 'Un toque de estilo.', SZ3),
  P('botas', 'supermasc', 'Ropa', 'Botas protectoras (set x4)', 52000, '🐾', 'Protegen las patas del asfalto caliente.', SZ5),
  P('capa-gato', 'supermasc', 'Ropa', 'Capa suave para gato', 35000, '🐈', 'Ligera y abrigada.', SZ3),

  P('pelota', 'supermasc', 'Juguetes', 'Pelota resistente', 12000, '🎾', 'Para jugar y buscar.'),
  P('cuerda', 'supermasc', 'Juguetes', 'Cuerda de algodón', 15000, '🪢', 'Ideal para tirar.'),
  P('peluche', 'supermasc', 'Juguetes', 'Peluche con sonido', 18000, '🧸', 'Suave y resistente a mordidas.'),
  P('frisbee', 'supermasc', 'Juguetes', 'Frisbee flexible', 20000, '🥏', 'Seguro para los dientes.'),
  P('mordedor', 'supermasc', 'Juguetes', 'Mordedor de caucho rellenable', 34000, '🔴', 'Rellénalo con premios.'),
  P('dispensador-premios', 'supermasc', 'Juguetes', 'Juguete dispensador de premios', 38000, '🎲', 'Estimula su mente mientras come.'),
  P('rascador', 'supermasc', 'Juguetes', 'Rascador para gatos', 70000, '🐈', 'Con torre y plataforma.'),
  P('tunel', 'supermasc', 'Juguetes', 'Túnel plegable para gatos', 42000, '🌀', 'Para esconderse y cazar.'),
  P('ratones', 'supermasc', 'Juguetes', 'Ratones con catnip (x3)', 14000, '🐭', 'Diversión asegurada.'),
  P('varita', 'supermasc', 'Juguetes', 'Varita con plumas', 16000, '🪶', 'Para jugar juntos.'),

  P('collar', 'supermasc', 'Accesorios', 'Collar ajustable', 22000, '📿', 'Nylon resistente con cierre seguro.', SZ3),
  P('correa', 'supermasc', 'Accesorios', 'Correa retráctil 5 m', 58000, '🦮', 'Con freno y agarre antideslizante.'),
  P('placa', 'supermasc', 'Accesorios', 'Placa de identificación grabada', 18000, '🏷️', 'Con nombre y tu teléfono.'),
  P('cama', 'supermasc', 'Accesorios', 'Cama ortopédica', 120000, '🛏️', 'Espuma viscoelástica, funda lavable.', SZ3),
  P('bebedero', 'supermasc', 'Accesorios', 'Bebedero portátil', 29000, '💧', 'Para paseos y viajes.'),
  P('transportadora', 'supermasc', 'Accesorios', 'Transportadora rígida', 130000, '🧳', 'Ventilada y aprobada para viaje en carro.', SZ3),
  P('bolsas', 'supermasc', 'Accesorios', 'Bolsas biodegradables (x120)', 12000, '♻️', 'Para recoger en los paseos.'),

  P('shampoo', 'supermasc', 'Higiene', 'Shampoo hipoalergénico 500 ml', 36000, '🧴', 'Para piel sensible.'),
  P('arena', 'supermasc', 'Higiene', 'Arena sanitaria 4 kg', 28000, '🪨', 'Aglomerante, control de olores.'),
  P('cortaunas', 'supermasc', 'Higiene', 'Cortaúñas profesional', 21000, '✂️', 'Con guía de seguridad.'),
  P('toallitas', 'supermasc', 'Higiene', 'Toallitas húmedas (x80)', 16000, '🧻', 'Limpieza rápida de patas y pelaje.'),
  P('kit-dental', 'supermasc', 'Higiene', 'Cepillo y pasta dental', 24000, '🪥', 'Sabor pollo, sin enjuague.'),
  P('cepillo', 'supermasc', 'Higiene', 'Cepillo deslanador', 32000, '🪮', 'Reduce el pelo suelto.'),
  P('tapetes', 'supermasc', 'Higiene', 'Tapetes absorbentes (x30)', 45000, '📄', 'Para cachorros y mascotas mayores.'),
];
const SERVICES = [
  P('consulta', 'clinica', 'Consultas', 'Consulta veterinaria general', 60000, '🩺', 'Revisión completa (30 min).'),
  P('control-peso', 'clinica', 'Consultas', 'Control de peso y nutrición', 45000, '⚖️', 'Plan de alimentación con el veterinario.'),
  P('segunda-opinion', 'clinica', 'Consultas', 'Segunda opinión', 70000, '🔎', 'Revisión de diagnóstico y tratamiento.'),
  P('vacunacion', 'clinica', 'Prevención', 'Vacunación', 55000, '💉', 'Aplicación y actualización del carnet.'),
  P('desparasitacion', 'clinica', 'Prevención', 'Desparasitación', 35000, '💊', 'Control interno y externo.'),
  P('certificado', 'clinica', 'Prevención', 'Certificado de salud para viaje', 50000, '📜', 'Revisión y certificado.'),
  P('laboratorio', 'clinica', 'Diagnóstico', 'Examen de laboratorio (cuadro hemático)', 70000, '🧪', 'Resultados en 24 horas.'),
  P('ecografia', 'clinica', 'Diagnóstico', 'Ecografía abdominal', 90000, '📟', 'Con informe del veterinario.'),
  P('bano', 'spa', 'Baño y peluquería', 'Baño', 40000, '🛁', 'Baño, secado y cepillado.'),
  P('bano-corte', 'spa', 'Baño y peluquería', 'Baño y corte', 65000, '✂️', 'Incluye corte de pelo y uñas.'),
  P('spa-completo', 'spa', 'Baño y peluquería', 'Spa completo', 90000, '💆', 'Baño, corte, limpieza de oídos y perfume.'),
  P('unas', 'spa', 'Cuidado extra', 'Corte de uñas', 15000, '💅', 'Rápido y sin estrés.'),
  P('oidos', 'spa', 'Cuidado extra', 'Limpieza de oídos', 18000, '👂', 'Con productos suaves.'),
  P('dientes', 'spa', 'Cuidado extra', 'Cepillado dental', 20000, '🪥', 'Aliento fresco y menos sarro.'),
  P('deslanado', 'spa', 'Cuidado extra', 'Tratamiento de deslanado', 45000, '🪮', 'Reduce la caída de pelo.'),
];
const COUPONS = { PRIMERA10: 0.10 };
const COMMISSION = 0.10;                // comisión de referencia (8–15 % según el modelo de negocio)
const SLOT_TIMES = [];                  // 08:00 … 17:30 cada 30 min
for (let h = 8; h < 18; h++) for (const m of ['00', '30']) SLOT_TIMES.push(`${String(h).padStart(2, '0')}:${m}`);
const SLOT_CAPACITY = 2;
const ymd = (d) => d.toISOString().slice(0, 10);
function slotsFor(storeId, date, ignoreCartTimes = []) {
  const d = new Date(date + 'T12:00:00-05:00');
  if (Number.isNaN(d.getTime()) || d.getUTCDay() === 0) return [];           // domingos sin agenda
  const { date: today, time: nowT } = bogotaNow();
  if (date < today) return [];
  const [nh, nm] = nowT.split(':').map(Number);
  return SLOT_TIMES.filter((t) => {
    if (date === today) { const [h, m] = t.split(':').map(Number); if (h * 60 + m < nh * 60 + nm + 60) return false; }
    const taken = db.appointments.filter((a) => a.storeId === storeId && a.date === date && a.time === t && a.status === 'agendada').length;
    return taken < SLOT_CAPACITY;
  });
}
const DELIVERY_SLOTS = ['8:00 a. m. – 12:00 m.', '2:00 p. m. – 6:00 p. m.'];

/* ------------------------------------------------------------------ API */
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
};
const ok = (res, data, code = 200) => send(res, code, data);
const fail = (res, code, msg) => send(res, code, { error: msg });
function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// ---- Cuenta
route('POST', '/api/register', (req, res, { body, ip }) => {
  const name = clean(body.name, 60), email = clean(body.email, 100).toLowerCase(), password = String(body.password || '');
  if (!name) return fail(res, 400, 'Escribe tu nombre.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Correo no válido.');
  if (password.length < 8) return fail(res, 400, 'La contraseña debe tener mínimo 8 caracteres.');
  if (body.consent !== true) return fail(res, 400, 'Debes aceptar la política de tratamiento de datos (Ley 1581 de 2012).');
  if (db.users.some((u) => u.email === email)) return fail(res, 409, 'Ya existe una cuenta con ese correo.');
  const user = { id: uid(), name, email, pass: hashPassword(password), deviceKey: 'pz_' + crypto.randomBytes(8).toString('hex'), createdAt: now(), consentAt: now(), lastSeen: null, foodLevel: null };
  db.users.push(user); act(user, 'cuenta', 'Creaste tu cuenta en PetZen.'); save();
  ok(res, { token: sign({ uid: user.id, exp: Date.now() + 7 * 864e5 }), user: publicUser(user) }, 201);
}, { auth: false });

route('POST', '/api/login', (req, res, { body, ip }) => {
  if (tooMany(ip)) return fail(res, 429, 'Demasiados intentos. Espera unos minutos.');
  const email = clean(body.email, 100).toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (!user || !checkPassword(String(body.password || ''), user.pass)) {
    attempts.get(ip).push(Date.now());
    return fail(res, 401, 'Correo o contraseña incorrectos.');
  }
  act(user, 'cuenta', 'Iniciaste sesión.'); save();
  ok(res, { token: sign({ uid: user.id, exp: Date.now() + 7 * 864e5 }), user: publicUser(user) });
}, { auth: false });

route('GET', '/api/me', (req, res, { user }) => ok(res, { user: publicUser(user), device: deviceStatus(user) }));

function exportData(user) {
  const mine = (arr) => arr.filter((x) => x.userId === user.id);
  const dt = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: TZ });
  const pets = mine(db.pets).map((p) => [p.name, p.species, p.breed, p.sex, p.ageYears, p.weightKg, p.size, p.coatColor, p.coatType, p.temperament, (p.allergies || []).join(', ') || 'Ninguna', p.neutered ? 'Sí' : 'No', p.microchip ? 'Sí' : 'No', p.birthDate || '', p.microchipNumber || '', p.features || '', p.clinicalSummary || '', p.conditions || '', p.medications || '', p.allergyNotes || '', p.vetNotes || '', p.lastVaccine || '', p.lastDeworm || '', p.foodBrand || '', [p.vetName, p.vetPhone].filter(Boolean).join(' · ')]);
  const docs = mine(db.docs).map((d) => [(db.pets.find((p) => p.id === d.petId) || {}).name || '', d.kind === 'carnet' ? 'Carnet de vacunas' : 'Historia clínica', d.name, dt(d.at)]);
  const scheds = mine(db.schedules).map((s) => [(db.pets.find((p) => p.id === s.petId) || {}).name || '', s.time, s.grams, s.enabled ? 'Activo' : 'Pausado']);
  const logs = mine(db.logs).sort((a, b) => b.at.localeCompare(a.at)).map((l) => [dt(l.at), l.petName, l.grams, l.source, l.status]);
  const rems = mine(db.reminders).map((r) => [r.title, r.kind, r.petName, dt(r.when), r.done ? 'Hecho' : 'Pendiente']);
  const apps = mine(db.appointments).map((a) => [a.code, a.storeName, a.serviceName, a.petName, a.date, a.time, a.status, a.total]);
  const orders = mine(db.orders).map((o) => [o.code, o.storeName, o.items.map((i) => `${i.qty}× ${i.name}${i.size ? ' (' + i.size + ')' : ''}`).join('; '), o.total, o.delivery ? `${o.delivery.address}, ${o.delivery.city}` : '', o.delivery ? `${o.delivery.date} ${o.delivery.slot}` : '', o.payMethod, dt(o.at)]);
  return {
    sheets: [
      { name: 'Mascotas', header: ['Nombre', 'Especie', 'Raza', 'Sexo', 'Edad (años)', 'Peso (kg)', 'Tamaño', 'Color', 'Pelaje', 'Temperamento', 'Alergias', 'Esterilizado', 'Microchip', 'Nacimiento', 'N.º microchip', 'Características', 'Historia clínica', 'Enfermedades', 'Medicamentos', 'Otras alergias', 'Observaciones vet.', 'Última vacuna', 'Última desparasitación', 'Alimento actual', 'Veterinario habitual'], rows: pets },
      { name: 'Documentos', header: ['Mascota', 'Tipo', 'Archivo', 'Fecha de carga'], rows: docs },
      { name: 'Horarios', header: ['Mascota', 'Hora', 'Gramos', 'Estado'], rows: scheds },
      { name: 'Comidas', header: ['Fecha', 'Mascota', 'Gramos', 'Origen', 'Estado'], rows: logs },
      { name: 'Recordatorios', header: ['Título', 'Tipo', 'Mascota', 'Fecha', 'Estado'], rows: rems },
      { name: 'Citas', header: ['Código', 'Aliado', 'Servicio', 'Mascota', 'Fecha', 'Hora', 'Estado', 'Total (COP)'], rows: apps },
      { name: 'Pedidos', header: ['Código', 'Tienda', 'Productos', 'Total (COP)', 'Dirección', 'Entrega', 'Pago', 'Fecha'], rows: orders },
    ],
  };
}
function sendFile(res, buf, name, mime) {
  res.writeHead(200, { 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}
route('GET', '/api/export/excel', (req, res, { user }) => sendFile(res, makeXlsx(exportData(user).sheets), 'mis-datos-petzen.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
route('GET', '/api/export/word', (req, res, { user }) => {
  const blocks = [{ p: `Titular: ${user.name} · ${user.email}` }, { p: `Generado el ${new Date().toLocaleString('es-CO', { timeZone: TZ })}. Datos tratados bajo la Ley 1581 de 2012.` }];
  for (const sh of exportData(user).sheets) blocks.push({ h: sh.name }, { table: { header: sh.header, rows: sh.rows.map((r) => r.map((v) => String(v))) } });
  sendFile(res, makeDocx('Mis datos en PetZen', blocks), 'mis-datos-petzen.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

route('DELETE', '/api/account', (req, res, { user, body }) => {
  if (!checkPassword(String(body.password || ''), user.pass)) return fail(res, 401, 'Contraseña incorrecta.');
  removeDocs((d) => d.userId === user.id);
  for (const k of ['pets', 'schedules', 'logs', 'reminders', 'orders', 'commands', 'appointments', 'activity']) db[k] = db[k].filter((x) => x.userId !== user.id);
  db.users = db.users.filter((u) => u.id !== user.id);
  save(); ok(res, { deleted: true });
});

// ---- Mascotas
const pick = (v, list, def) => (list.includes(v) ? v : def);
const petFields = (b) => ({
  name: clean(b.name, 40),
  species: b.species === 'gato' ? 'gato' : 'perro',
  breed: clean(b.breed, 50) || 'Criollo / mestizo',
  sex: pick(b.sex, ['macho', 'hembra'], 'macho'),
  birthDate: /^\d{4}-\d{2}-\d{2}$/.test(b.birthDate || '') && Date.parse(b.birthDate) <= Date.now() ? b.birthDate : '',
  ageYears: /^\d{4}-\d{2}-\d{2}$/.test(b.birthDate || '') && Date.parse(b.birthDate) <= Date.now()
    ? Math.max(0, Math.min(30, Math.floor((Date.now() - Date.parse(b.birthDate)) / (365.2425 * 864e5))))
    : Math.round(num(b.ageYears, 0, 30, 1)),
  weightKg: num(b.weightKg, 0.3, 90, 10),
  size: pick(b.size, ['mini', 'pequeño', 'mediano', 'grande', 'gigante'], 'mediano'),
  coatColor: pick(b.coatColor, ['negro', 'blanco', 'café / chocolate', 'dorado / crema', 'gris', 'atigrado', 'manchado / bicolor', 'tricolor'], 'café / chocolate'),
  coatType: pick(b.coatType, ['corto', 'medio', 'largo', 'rizado', 'sin pelo'], 'corto'),
  temperament: pick(b.temperament, ['tranquilo', 'juguetón', 'nervioso', 'tímido', 'no le gustan los extraños'], 'juguetón'),
  allergies: (Array.isArray(b.allergies) ? b.allergies : []).filter((a) => ['pollo', 'res', 'granos', 'lácteos', 'picadura de pulga', 'otra'].includes(a)),
  microchip: !!b.microchip,
  neutered: !!b.neutered,
  activity: ['baja', 'media', 'alta'].includes(b.activity) ? b.activity : 'media',
  clinicalSummary: clean(b.clinicalSummary, 1200),
  features: clean(b.features, 300),
  allergyNotes: clean(b.allergyNotes, 300),
  conditions: clean(b.conditions, 400),
  medications: clean(b.medications, 400),
  vetNotes: clean(b.vetNotes, 600),
  microchipNumber: clean(b.microchipNumber, 30).replace(/[^\w -]/g, ''),
  lastVaccine: /^\d{4}-\d{2}-\d{2}$/.test(b.lastVaccine || '') ? b.lastVaccine : '',
  lastDeworm: /^\d{4}-\d{2}-\d{2}$/.test(b.lastDeworm || '') ? b.lastDeworm : '',
  foodBrand: clean(b.foodBrand, 60),
  vetName: clean(b.vetName, 60),
  vetPhone: clean(b.vetPhone, 20).replace(/[^\d+ ()-]/g, ''),
  notes: clean(b.notes, 200),
});
route('GET', '/api/pets', (req, res, { user }) => ok(res, db.pets.filter((p) => p.userId === user.id)));
route('POST', '/api/pets', (req, res, { user, body }) => {
  const f = petFields(body);
  if (!f.name) return fail(res, 400, 'Escribe el nombre de tu mascota.');
  const pet = { id: uid(), userId: user.id, ...f, createdAt: now() };
  db.pets.push(pet); act(user, 'mascota', `Registraste a ${pet.name}.`); save(); ok(res, pet, 201);
});
route('PUT', '/api/pets/:id', (req, res, { user, body, params }) => {
  const pet = db.pets.find((p) => p.id === params.id && p.userId === user.id);
  if (!pet) return fail(res, 404, 'No encontrada.');
  const f = petFields(body);
  if (!f.name) return fail(res, 400, 'Escribe el nombre de tu mascota.');
  Object.assign(pet, f); act(user, 'mascota', `Actualizaste los datos de ${pet.name}.`); save(); ok(res, pet);
});
route('DELETE', '/api/pets/:id', (req, res, { user, params }) => {
  const before = db.pets.length, gone = db.pets.find((p) => p.id === params.id && p.userId === user.id);
  db.pets = db.pets.filter((p) => !(p.id === params.id && p.userId === user.id));
  db.schedules = db.schedules.filter((s) => !(s.petId === params.id && s.userId === user.id));
  removeDocs((d) => d.petId === params.id && d.userId === user.id);
  if (db.pets.length === before) return fail(res, 404, 'No encontrada.');
  act(user, 'mascota', `Eliminaste a ${gone ? gone.name : 'una mascota'}.`); save(); ok(res, { deleted: true });
});

// ---- Horarios de alimentación
route('GET', '/api/schedules', (req, res, { user }) => ok(res, db.schedules.filter((s) => s.userId === user.id)));
route('POST', '/api/schedules', (req, res, { user, body }) => {
  const pet = db.pets.find((p) => p.id === body.petId && p.userId === user.id);
  if (!pet) return fail(res, 400, 'Elige una mascota.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || '')) return fail(res, 400, 'Hora no válida (HH:MM).');
  const s = { id: uid(), userId: user.id, petId: pet.id, time: body.time, grams: num(body.grams, 5, 1000, 100), enabled: true, lastRun: null };
  db.schedules.push(s); act(user, 'comedero', `Creaste un horario de comida para ${pet.name} a las ${s.time} (${s.grams} g).`); save(); ok(res, s, 201);
});
route('PATCH', '/api/schedules/:id', (req, res, { user, body, params }) => {
  const s = db.schedules.find((x) => x.id === params.id && x.userId === user.id);
  if (!s) return fail(res, 404, 'No encontrado.');
  if (typeof body.enabled === 'boolean') { s.enabled = body.enabled; act(user, 'comedero', `${s.enabled ? 'Activaste' : 'Pausaste'} el horario de las ${s.time}.`); }
  save(); ok(res, s);
});
route('DELETE', '/api/schedules/:id', (req, res, { user, params }) => {
  const sc = db.schedules.find((s) => s.id === params.id && s.userId === user.id);
  db.schedules = db.schedules.filter((s) => !(s.id === params.id && s.userId === user.id));
  if (sc) act(user, 'comedero', `Eliminaste el horario de las ${sc.time}.`);
  save(); ok(res, { deleted: true });
});

// ---- Comedero
route('GET', '/api/feeder', (req, res, { user }) => {
  expireCommands();
  ok(res, { device: deviceStatus(user), pending: db.commands.filter((c) => c.userId === user.id && c.status === 'pendiente').length });
});
route('POST', '/api/feeder/dispense', (req, res, { user, body }) => {
  const grams = num(body.grams, 5, 500, 0);
  if (!grams) return fail(res, 400, 'Indica una porción entre 5 y 500 g.');
  if (!db.pets.find((p) => p.id === body.petId && p.userId === user.id)) return fail(res, 400, 'Elige una mascota.');
  if (db.commands.some((c) => c.userId === user.id && c.status === 'pendiente')) return fail(res, 409, 'Ya hay una orden en curso. Espera a que termine.');
  const cmd = enqueueDispense(user, { petId: body.petId, grams, source: 'manual' });
  act(user, 'comedero', `Pediste dispensar ${grams} g desde la app.`);
  ok(res, { command: cmd, deviceOnline: deviceStatus(user).online }, 202);
});
route('GET', '/api/logs', (req, res, { user }) => {
  expireCommands();
  ok(res, db.logs.filter((l) => l.userId === user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100));
});

// ---- Endpoints del ESP32 (autenticación con la clave del dispositivo)
function deviceUser(url) {
  const key = url.searchParams.get('key');
  return key ? db.users.find((u) => u.deviceKey === key) : null;
}
route('GET', '/api/device/poll', (req, res, { url }) => {
  const user = deviceUser(url);
  if (!user) return fail(res, 401, 'Clave de dispositivo inválida.');
  user.lastSeen = now();
  const lvl = url.searchParams.get('level'); if (lvl !== null) user.foodLevel = num(lvl, 0, 100, null);
  const fw = url.searchParams.get('fw'); if (fw) user.firmware = clean(fw, 20);
  expireCommands(); save();
  const cmd = db.commands.find((c) => c.userId === user.id && c.status === 'pendiente');
  ok(res, cmd ? { id: cmd.id, grams: cmd.grams } : {});
}, { auth: false });
route('POST', '/api/device/ack', (req, res, { url, body }) => {
  const user = deviceUser(url);
  if (!user) return fail(res, 401, 'Clave de dispositivo inválida.');
  const cmd = db.commands.find((c) => c.id === body.id && c.userId === user.id);
  if (!cmd) return fail(res, 404, 'Orden no encontrada.');
  cmd.status = body.ok === false ? 'error' : 'completada';
  const log = db.logs.find((l) => l.id === cmd.logId);
  if (log) { log.status = body.ok === false ? 'error' : 'dispensado'; log.doneAt = now(); }
  user.lastSeen = now(); save(); ok(res, { ok: true });
}, { auth: false });

// ---- Recordatorios
route('GET', '/api/reminders', (req, res, { user }) => ok(res, db.reminders.filter((r) => r.userId === user.id).sort((a, b) => a.when.localeCompare(b.when))));
route('POST', '/api/reminders', (req, res, { user, body }) => {
  const title = clean(body.title, 80);
  if (!title) return fail(res, 400, 'Escribe un título.');
  if (Number.isNaN(Date.parse(body.when))) return fail(res, 400, 'Fecha y hora no válidas.');
  const pet = db.pets.find((p) => p.id === body.petId && p.userId === user.id);
  const r = { id: uid(), userId: user.id, petId: pet ? pet.id : null, petName: pet ? pet.name : '', title, kind: clean(body.kind, 20) || 'otro', when: body.when, done: false };
  db.reminders.push(r); act(user, 'recordatorio', `Creaste el recordatorio «${title}».`); save(); ok(res, r, 201);
});
route('PATCH', '/api/reminders/:id', (req, res, { user, body, params }) => {
  const r = db.reminders.find((x) => x.id === params.id && x.userId === user.id);
  if (!r) return fail(res, 404, 'No encontrado.');
  if (typeof body.done === 'boolean') { r.done = body.done; act(user, 'recordatorio', `${r.done ? 'Completaste' : 'Reabriste'} «${r.title}».`); }
  save(); ok(res, r);
});
route('DELETE', '/api/reminders/:id', (req, res, { user, params }) => {
  const rm = db.reminders.find((r) => r.id === params.id && r.userId === user.id);
  db.reminders = db.reminders.filter((r) => !(r.id === params.id && r.userId === user.id));
  if (rm) act(user, 'recordatorio', `Eliminaste el recordatorio «${rm.title}».`);
  save(); ok(res, { deleted: true });
});

// ---- Documentos de la mascota (historia clínica / carnet de vacunas)
function removeDocs(filter) {
  for (const d of db.docs.filter(filter)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, d.file)); } catch {} }
  db.docs = db.docs.filter((d) => !filter(d));
}
const MAGIC = [['pdf', 'application/pdf', (b) => b.slice(0, 4).toString() === '%PDF'], ['png', 'image/png', (b) => b.slice(0, 4).toString('hex') === '89504e47'], ['jpg', 'image/jpeg', (b) => b.slice(0, 3).toString('hex') === 'ffd8ff'], ['webp', 'image/webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP']];
route('GET', '/api/pets/:id/docs', (req, res, { user, params }) => ok(res, db.docs.filter((d) => d.userId === user.id && d.petId === params.id).map(({ file, ...d }) => d)));
route('POST', '/api/pets/:id/docs', (req, res, { user, body, params }) => {
  if (!db.pets.find((p) => p.id === params.id && p.userId === user.id)) return fail(res, 404, 'Mascota no encontrada.');
  const kind = body.kind === 'carnet' ? 'carnet' : 'historia';
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length) return fail(res, 400, 'Archivo vacío.');
  if (buf.length > 6 * 1024 * 1024) return fail(res, 413, 'El archivo supera 6 MB.');
  const type = MAGIC.find(([, , test]) => test(buf));
  if (!type) return fail(res, 400, 'Formato no permitido. Sube un PDF o una imagen (PNG, JPG, WEBP).');
  const id = uid(), file = `${id}.${type[0]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  const doc = { id, userId: user.id, petId: params.id, kind, name: clean(body.name, 80).replace(/[\\/]/g, '') || `documento.${type[0]}`, mime: type[1], size: buf.length, file, at: now() };
  db.docs.push(doc); act(user, 'documento', `Subiste ${kind === 'carnet' ? 'el carnet de vacunas' : 'la historia clínica'} de ${db.pets.find((p) => p.id === params.id).name} (${doc.name}).`); save();
  const { file: _f, ...pub } = doc; ok(res, pub, 201);
});
route('GET', '/api/docs/:id', (req, res, { user, params }) => {
  const d = db.docs.find((x) => x.id === params.id && x.userId === user.id);
  if (!d) return fail(res, 404, 'No encontrado.');
  const buf = fs.readFileSync(path.join(UPLOAD_DIR, d.file));
  res.writeHead(200, { 'Content-Type': d.mime, 'Content-Length': buf.length, 'Cache-Control': 'private, no-store' }); res.end(buf);
});
route('DELETE', '/api/docs/:id', (req, res, { user, params }) => { const d0 = db.docs.find((d) => d.id === params.id && d.userId === user.id); removeDocs((d) => d.id === params.id && d.userId === user.id); if (d0) act(user, 'documento', `Eliminaste el documento ${d0.name}.`); save(); ok(res, { deleted: true }); });
routes.find((r) => r.method === 'POST' && r.re.test('/api/pets/x/docs')).maxBody = 9_000_000;

// ---- Catálogo, horarios libres y citas
route('GET', '/api/stores', (req, res) => ok(res, { stores: STORES, items: [...PRODUCTS.map((p) => ({ ...p, kind: 'product' })), ...SERVICES.map((p) => ({ ...p, kind: 'service' }))], deliverySlots: DELIVERY_SLOTS, slotTimes: SLOT_TIMES }), { auth: false });
route('GET', '/api/slots', (req, res, { url }) => {
  const store = STORES.find((s) => s.id === url.searchParams.get('store') && s.type === 'service');
  if (!store) return fail(res, 400, 'Aliado no válido.');
  ok(res, { date: url.searchParams.get('date'), slots: slotsFor(store.id, url.searchParams.get('date') || '') });
});
route('GET', '/api/appointments', (req, res, { user }) => ok(res, db.appointments.filter((a) => a.userId === user.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))));
route('PATCH', '/api/appointments/:id', (req, res, { user, params }) => {
  const a = db.appointments.find((x) => x.id === params.id && x.userId === user.id);
  if (!a) return fail(res, 404, 'No encontrada.');
  a.status = 'cancelada'; act(user, 'cita', `Cancelaste la cita ${a.code} (${a.serviceName} · ${a.petName}).`);
  db.reminders = db.reminders.filter((r) => r.apptId !== a.id);
  save(); ok(res, a);
});
route('PUT', '/api/vet247', (req, res, { user, body }) => {          // veterinaria 24/7 de confianza del usuario
  user.vet247 = { name: clean(body.name, 60), phone: clean(body.phone, 20).replace(/[^\d+ ()-]/g, '') };
  act(user, 'cuenta', 'Guardaste tu veterinaria 24/7.');
  save(); ok(res, user.vet247);
});
route('GET', '/api/activity', (req, res, { user }) => ok(res, db.activity.filter((x) => x.userId === user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300)));
route('GET', '/api/vet247', (req, res, { user }) => ok(res, user.vet247 || { name: '', phone: '' }));

// ---- Pedidos
route('GET', '/api/orders', (req, res, { user }) => ok(res, db.orders.filter((o) => o.userId === user.id).sort((a, b) => b.at.localeCompare(a.at))));

// ---- Checkout: crea pedidos (uno por tienda) y citas
route('POST', '/api/checkout', (req, res, { user, body }) => {
  const cart = Array.isArray(body.items) ? body.items : [];
  const methods = ['tarjeta', 'pse', 'nequi', 'contraentrega'];
  const payMethod = methods.includes(body.payMethod) ? body.payMethod : null;
  if (!cart.length) return fail(res, 400, 'El carrito está vacío.');
  if (!payMethod) return fail(res, 400, 'Elige un método de pago.');
  const goods = {}, appts = [];
  for (const it of cart) {
    if (it.kind === 'service') {
      const sv = SERVICES.find((x) => x.id === it.id);
      const pet = db.pets.find((p) => p.id === it.petId && p.userId === user.id);
      if (!sv || !pet) return fail(res, 400, 'Una cita del carrito no es válida.');
      if (!slotsFor(sv.store, String(it.date)).includes(it.time)) return fail(res, 409, `El horario ${it.date} ${it.time} ya no está disponible. Elige otro.`);
      appts.push({ sv, pet, date: it.date, time: it.time, reason: clean(it.reason, 200) });
    } else {
      const p = PRODUCTS.find((x) => x.id === it.id);
      if (!p) continue;
      const size = p.sizes ? pick(it.size, p.sizes, p.sizes[0]) : '';
      (goods[p.store] = goods[p.store] || []).push({ id: p.id, name: p.name, price: p.price, qty: num(it.qty, 1, 20, 1), size });
    }
  }
  // dobles reservas dentro del mismo carrito
  const seen = new Set();
  for (const a of appts) { const k = a.sv.store + a.date + a.time; if (seen.size && [...seen].filter((x) => x === k).length >= SLOT_CAPACITY) return fail(res, 409, 'Tienes demasiadas citas en el mismo horario.'); seen.add(k); }
  if (appts.length && payMethod === 'contraentrega') return fail(res, 400, 'Las citas se pagan en línea (tarjeta, PSE o Nequi).');
  const d = body.delivery || {};
  const delivery = Object.keys(goods).length ? {
    address: clean(d.address, 120), city: clean(d.city, 40) || 'Cali', ref: clean(d.ref, 120), phone: clean(d.phone, 20),
    date: String(d.date || ''), slot: DELIVERY_SLOTS.includes(d.slot) ? d.slot : '', notes: clean(d.notes, 160),
  } : null;
  if (delivery) {
    if (delivery.address.length < 5) return fail(res, 400, 'Escribe la dirección de entrega.');
    if (delivery.phone.replace(/\D/g, '').length < 7) return fail(res, 400, 'Escribe un teléfono de contacto.');
    if (!delivery.slot) return fail(res, 400, 'Elige la franja horaria de entrega.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivery.date) || delivery.date <= bogotaNow().date) return fail(res, 400, 'Elige una fecha de entrega a partir de mañana.');
  }
  const coupon = clean(body.coupon, 20).toUpperCase(), rate = COUPONS[coupon] || 0;
  const mkCode = (pfx) => pfx + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const orders = [], appointments = [];
  for (const [storeId, items] of Object.entries(goods)) {
    const store = STORES.find((s) => s.id === storeId);
    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0), discount = Math.round(subtotal * rate), total = subtotal - discount;
    const o = { id: uid(), code: mkCode('PED'), userId: user.id, storeId, storeName: store.name, items, subtotal, discount, coupon: rate ? coupon : '', total, commission: Math.round(total * COMMISSION), delivery, payMethod, payStatus: payMethod === 'contraentrega' ? 'por pagar' : 'pagado', status: 'confirmado', at: now() };
    db.orders.push(o); orders.push(o);
    act(user, 'pedido', `Pagaste el pedido ${o.code} en ${store.name} por ${o.total.toLocaleString('es-CO')} COP.`);
  }
  for (const a of appts) {
    const store = STORES.find((s) => s.id === a.sv.store);
    const shared = body.shareDocs === false ? [] : db.docs.filter((x) => x.userId === user.id && x.petId === a.pet.id).map((x) => (x.kind === 'carnet' ? 'Carnet de vacunas' : 'Historia clínica') + ': ' + x.name);
    const ap = { id: uid(), code: mkCode('CITA'), userId: user.id, storeId: store.id, storeName: store.name, serviceId: a.sv.id, serviceName: a.sv.name, petId: a.pet.id, petName: a.pet.name, date: a.date, time: a.time, reason: a.reason, sharedDocs: shared, total: a.sv.price, payMethod, payStatus: 'pagado', status: 'agendada', at: now() };
    db.appointments.push(ap); appointments.push(ap);
    act(user, 'cita', `Agendaste ${a.sv.name} para ${a.pet.name}: ${a.date} a las ${a.time} (${ap.code}).`);
    db.reminders.push({ id: uid(), userId: user.id, apptId: ap.id, petId: a.pet.id, petName: a.pet.name, title: `Cita: ${a.sv.name} (${store.name})`, kind: 'cita', when: `${a.date}T${a.time}:00-05:00`, done: false });
  }
  save();
  ok(res, { orders, appointments, total: [...orders, ...appointments].reduce((x, y) => x + y.total, 0) }, 201);
});

/* ------------------------------------------------------------------ SERVIDOR HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

function readBody(req, limit = 200_000) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > limit) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress || 'x';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return fail(res, 404, 'Ruta no encontrada.');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    let user = null;
    if (r.auth) {
      const auth = req.headers.authorization || '';
      const p = verify(auth.startsWith('Bearer ') ? auth.slice(7) : '');
      user = p && db.users.find((u) => u.id === p.uid);
      if (!user) return fail(res, 401, 'Sesión no válida. Inicia sesión de nuevo.');
    }
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req, r.maxBody) : {};
    if (!attempts.has(ip)) attempts.set(ip, []);
    try { return r.handler(req, res, { user, body, params, url, ip }); }
    catch (e) { console.error(e); return fail(res, 500, 'Error interno.'); }
  }

  // archivos estáticos: la página publicitaria en "/" y la app en "/app/"
  if (url.pathname === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }
  const isApp = url.pathname.startsWith('/app/');
  const ROOT = isApp ? PUBLIC_DIR : SITE_DIR;
  const rel = isApp ? url.pathname.slice(4) : url.pathname;
  let file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`\n  🐾 PetZen listo\n     Página web →  http://localhost:${PORT}\n     La app     →  http://localhost:${PORT}/app/\n`));
process.on('SIGINT', () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch {} process.exit(0); });
