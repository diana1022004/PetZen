/* PetZen — aplicación web (SPA sin frameworks) */
'use strict';

/* ============================================================ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('es-CO');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const TZ = 'America/Bogota';
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: TZ });
const fmtDT = (iso) => `${fmtDate(iso)} · ${fmtTime(iso)}`;
const todayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const todayISO = () => todayKey(new Date().toISOString());
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const longDate = (ymd) => new Date(ymd + 'T12:00:00-05:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const hhmm12 = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const ago = (iso) => {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fmtDate(iso);
};
const ymdLabel = (d) => (d ? new Date(d + 'T12:00:00-05:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) : '');
const years = (n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'año' : 'años'}`;

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
function confetti() {
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
  const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#D89D59', '#0B3162', '#2E9E5B', '#E86F6F', '#7A4FC2', '#F4C95D'];
  const ps = Array.from({ length: 130 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, r: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, a: Math.random() * 6 }));
  let f = 0;
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => { p.y += p.vy; p.x += p.vx + Math.sin(p.a += 0.08); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.r, p.r * 0.6); });
    if (++f < 220) requestAnimationFrame(tick); else c.remove();
  })();
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('No hay conexión con el servidor. ¿Está corriendo "node server.js"?'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token && !path.startsWith('/login')) { logout(true); throw new Error('Tu sesión expiró.'); }
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
}
async function download(path, filename) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + S.token } });
  if (!res.ok) throw new Error('No se pudo descargar el archivo.');
  const url = URL.createObjectURL(await res.blob());
  if (filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  else window.open(url, '_blank');
}

/* ============================================================ datos de apoyo */
const DOG_BREEDS = ['Criollo / mestizo', 'Labrador retriever', 'Golden retriever', 'Pastor alemán', 'Bulldog francés', 'Bulldog inglés', 'Poodle (caniche)', 'Chihuahua', 'Pug', 'Beagle', 'Rottweiler', 'Husky siberiano', 'Schnauzer', 'Shih tzu', 'Yorkshire terrier', 'Cocker spaniel', 'Dálmata', 'Pinscher miniatura', 'Boxer', 'Border collie', 'Maltés', 'Pitbull', 'Pomerania', 'Samoyedo', 'Dachshund (salchicha)', 'Gran danés', 'Bichón frisé', 'Akita', 'Doberman', 'Otra raza'];
const CAT_BREEDS = ['Criollo / doméstico', 'Siamés', 'Persa', 'Maine coon', 'Angora', 'Bengalí', 'Ragdoll', 'British shorthair', 'Sphynx', 'Otra raza'];
const COLORS = ['negro', 'blanco', 'café / chocolate', 'dorado / crema', 'gris', 'atigrado', 'manchado / bicolor', 'tricolor'];
const COATS = ['corto', 'medio', 'largo', 'rizado', 'sin pelo'];
const SIZES = ['mini', 'pequeño', 'mediano', 'grande', 'gigante'];
const TEMPERS = ['tranquilo', 'juguetón', 'nervioso', 'tímido', 'no le gustan los extraños'];
const ALLERGIES = ['pollo', 'res', 'granos', 'lácteos', 'picadura de pulga', 'otra'];
const KINDS = ['vacuna', 'cita', 'baño', 'desparasitación', 'medicina', 'otro'];
const PAY = { tarjeta: ['💳', 'Tarjeta débito/crédito'], pse: ['🏦', 'PSE (débito bancario)'], nequi: ['📱', 'Nequi / Daviplata'], contraentrega: ['💵', 'Contra entrega'] };
const URGENT_SIGNS = ['Dificultad para respirar, respiración con la boca abierta (en gatos) o encías azules/pálidas', 'Convulsiones o desmayo', 'Sangrado que no para, heridas profundas o fracturas', 'Atropello, caída desde altura o golpe fuerte', 'Sospecha de envenenamiento o de que comió algo tóxico (chocolate, uvas, veneno, medicinas humanas)', 'Vómito o diarrea repetidos con decaimiento, o con sangre', 'Abdomen hinchado y duro, intentos de vomitar sin lograrlo', 'No puede orinar o lo intenta sin éxito (sobre todo gatos)', 'Golpe de calor: jadeo extremo, lengua muy roja, tambaleo', 'Dolor intenso: llora, se esconde o no deja que lo toquen', 'Parto con complicaciones'];

/* ============================================================ estado */
const S = {
  token: store.get('pz_token', null),
  user: null, device: null, vet247: { name: '', phone: '' },
  pets: [], schedules: [], logs: [], reminders: [], orders: [], appointments: [], docs: [], activity: [], flt: {},
  stores: [], items: [], deliverySlots: [],
  cart: store.get('pz_cart2', []), coupon: store.get('pz_coupon', ''),
  petId: store.get('pz_pet', null),
  route: 'inicio', arg: null, authTab: 'login', sim: false, simBusy: false,
  fichaTab: 'datos', saludTab: 'citas', sec: {},
  co: { step: 1, delivery: store.get('pz_delivery', { address: '', city: 'Cali', ref: '', phone: '', date: '', slot: '', notes: '' }), method: 'tarjeta', share: true, busy: false, result: null },
};
const NAV = [
  ['inicio', '🏠', 'Inicio'], ['mascotas', '🐶', 'Mascotas'], ['alimentacion', '🥣', 'Alimentación'], ['comedero', '📡', 'Comedero'],
  ['salud', '🩺', 'Salud'], ['tiendas', '🛍️', 'Tiendas'], ['carrito', '🛒', 'Carrito'], ['historial', '🕘', 'Historial'], ['perfil', '👤', 'Perfil'],
];
const BOTTOM = ['inicio', 'mascotas', 'salud', 'tiendas', 'carrito'];
const TITLES = { inicio: 'Inicio', mascotas: 'Mis mascotas', ficha: 'Ficha de mi mascota', alimentacion: 'Alimentación', comedero: 'Comedero inteligente', salud: 'Salud', tiendas: 'Tiendas aliadas', tienda: 'Tienda', carrito: 'Mi carrito', pedidos: 'Mis pedidos', pago: 'Finalizar compra', historial: 'Historial de actividad', perfil: 'Mi perfil' };
const currentPet = () => S.pets.find((p) => p.id === S.petId) || S.pets[0] || null;
const petEmoji = (p) => (p?.species === 'gato' ? '🐱' : '🐶');
const itemById = (id) => S.items.find((i) => i.id === id);
const storeById = (id) => S.stores.find((s) => s.id === id);
const saveCart = () => store.set('pz_cart2', S.cart);
const cartCount = () => S.cart.reduce((a, i) => a + (i.kind === 'service' ? 1 : i.qty), 0);

/* ============================================================ nutrición (estimación de referencia) */
function nutrition(p, kcal100 = 350) {
  if (!p) return null;
  const rer = 70 * Math.pow(p.weightKg, 0.75);
  let f;
  if (p.species === 'perro') f = p.ageYears < 1 ? 2.5 : p.ageYears >= 8 ? 1.4 : p.neutered ? 1.6 : 1.8;
  else f = p.ageYears < 1 ? 2.5 : p.ageYears >= 10 ? 1.1 : p.neutered ? 1.2 : 1.4;
  const act = { baja: 0.85, media: 1, alta: 1.2 }[p.activity] || 1;
  const kcal = rer * f * act;
  return { kcal: Math.round(kcal), grams: Math.round(kcal / (kcal100 / 100)), factor: f };
}
const todayGrams = (petId) => S.logs.filter((l) => l.petId === petId && l.status === 'dispensado' && todayKey(l.at) === todayISO()).reduce((a, l) => a + l.grams, 0);

/* ============================================================ arranque y rutas */
async function boot() {
  const th = store.get('pz_theme', null);
  if (th) document.documentElement.dataset.theme = th;
  document.body.insertAdjacentHTML('beforeend', guideHTML());
  if (S.token) { try { await loadAll(); } catch { S.token = null; store.del('pz_token'); } }
  if (!S.token) setTimeout(() => say('auth'), 600);
  window.addEventListener('hashchange', route);
  route();
  setInterval(poll, 4000);
}
async function loadAll() {
  const [me, pets, schedules, logs, reminders, orders, appts, shop, vet, activity] = await Promise.all([
    api('/me'), api('/pets'), api('/schedules'), api('/logs'), api('/reminders'), api('/orders'), api('/appointments'), api('/stores'), api('/vet247'), api('/activity'),
  ]);
  S.activity = activity;
  S.user = me.user; S.device = me.device; S.pets = pets; S.schedules = schedules; S.logs = logs; S.reminders = reminders; S.orders = orders; S.appointments = appts;
  S.stores = shop.stores; S.items = shop.items; S.deliverySlots = shop.deliverySlots; S.vet247 = vet;
  if (!S.pets.find((p) => p.id === S.petId)) S.petId = S.pets[0]?.id || null;
}
async function poll() {
  if (!S.token || !S.user) return;
  try {
    const [f, logs] = await Promise.all([api('/feeder'), api('/logs')]);
    const changed = JSON.stringify(logs) !== JSON.stringify(S.logs) || f.device.online !== S.device?.online || f.device.foodLevel !== S.device?.foodLevel;
    S.device = f.device; S.logs = logs;
    if (changed && ['inicio', 'comedero'].includes(S.route) && !$('#modal').open) render();
  } catch {}
}
async function route() {
  const parts = location.hash.replace('#/', '').split('/');
  const r = parts[0] || 'inicio';
  S.route = TITLES[r] ? r : 'inicio'; S.arg = parts[1] || null;
  if (S.route === 'ficha') {
    if (S.arg) { S.petId = S.arg; store.set('pz_pet', S.arg); }
    try { if (S.token && S.petId) S.docs = await api(`/pets/${S.petId}/docs`); } catch {}
  }
  if (S.route === 'historial') { try { S.activity = await api('/activity'); S.logs = await api('/logs'); } catch {} }
  if (S.route === 'pedidos') { try { [S.orders, S.appointments] = await Promise.all([api('/orders'), api('/appointments')]); } catch {} }
  if (S.route === 'pago' && cartCount() && S.co.step === 3) { S.co.step = 1; S.co.result = null; S.co.busy = false; }
  if (S.route === 'pago' && !cartCount() && !(S.co.step === 3 && S.co.result)) { location.hash = '#/carrito'; return; }
  render(); window.scrollTo({ top: 0 });
  say(S.token && S.user ? S.route : 'auth');
}
function go(r) { location.hash = '#/' + r; }

/* ============================================================ perrito guía ZEN */
const TIPS = {
  auth: ['¡Guau! Soy Zen 🐶, tu guía en PetZen. ¡Crea tu cuenta y empezamos!', 'Con PetZen tu peludito come a tiempo aunque no estés.'],
  inicio: ['¡Hola! Aquí ves cómo va el día de tu mascota 🐾', 'Toca “Dispensar ahora” para darle comida desde el celular.'],
  mascotas: ['Cuéntame de tu peludito: raza, pelaje, tamaño… ¡mientras más sé, mejor lo cuido!', 'Toca “Ver ficha” para subir su historia clínica y carnet.'],
  ficha: ['Sube la historia clínica y el carnet de vacunas: así agendar citas es súper fácil 📋', 'Toca las pestañas para ver cada parte de la ficha.'],
  alimentacion: ['Te calculo la ración diaria ideal 🥣 (el veterinario tiene la última palabra).', 'Toca “3 comidas” para crear los horarios automáticos.'],
  comedero: ['Aquí controlas el comedero. Activa el “comedero virtual” para probar sin hardware 📡', 'Cuando el comedero esté en línea, ¡la comida cae al instante!'],
  salud: ['Aquí están tus citas, recordatorios y urgencias 🩺', 'Si es una urgencia, no esperes: ve a la pestaña “Urgencias”.'],
  tiendas: ['Elige una tienda aliada: cada una tiene sus secciones 🛍️', 'La clínica y el spa son para agendar citas con día y hora.'],
  tienda: ['Mira las secciones de arriba para encontrar lo que buscas 🔎', 'Para citas elegirás mascota, día y hora.'],
  carrito: ['Tu carrito está separado por tienda 🛒', 'Con el cupón PRIMERA10 tienes 10 % de descuento en productos.'],
  pago: ['Ya casi 🎉 Completa tus datos y confirma tu pago.', 'Para productos necesito dirección, día y franja de entrega.'],
  pedidos: ['Aquí ves todos tus pedidos con su número 📦', 'Cada pedido muestra en qué paso va: confirmado, preparando, en camino o entregado.'],
  historial: ['Este es el historial de todo lo que has hecho en PetZen 🕘', 'Usa los filtros para ver solo pedidos, citas o comidas.'],
  perfil: ['Aquí puedes descargar tus datos en Word o Excel 📄', 'Tus datos son tuyos: también puedes borrarlos cuando quieras.'],
};
let tipIdx = 0, tipTimer = null, guideOn = true;
function guideHTML() {
  return `<div id="guide" class="guide"><div class="bubble" id="bubble"></div>
  <svg class="zen" data-act="zen" viewBox="0 0 180 190" aria-label="Zen, tu perrito guía" role="img">
    <g class="tail"><path d="M128 150 Q168 130 160 92 Q150 112 124 132Z" fill="#C98A3C"/></g>
    <ellipse cx="90" cy="158" rx="52" ry="36" fill="#E3A857"/>
    <ellipse cx="62" cy="184" rx="14" ry="8" fill="#F1C27B"/><ellipse cx="118" cy="184" rx="14" ry="8" fill="#F1C27B"/>
    <ellipse cx="90" cy="148" rx="26" ry="22" fill="#FBEBD0"/>
    <g class="head">
      <g class="ear-l"><ellipse cx="38" cy="66" rx="18" ry="38" fill="#B97B2F" transform="rotate(10 38 66)"/></g>
      <g class="ear-r"><ellipse cx="142" cy="66" rx="18" ry="38" fill="#B97B2F" transform="rotate(-10 142 66)"/></g>
      <ellipse cx="90" cy="70" rx="54" ry="50" fill="#E9B467"/>
      <ellipse cx="90" cy="90" rx="29" ry="22" fill="#FBEBD0"/>
      <g class="eyes"><ellipse class="eye" cx="68" cy="62" rx="7" ry="8" fill="#081B33"/><ellipse class="eye" cx="112" cy="62" rx="7" ry="8" fill="#081B33"/>
      <circle cx="70" cy="59" r="2.5" fill="#fff"/><circle cx="114" cy="59" r="2.5" fill="#fff"/></g>
      <ellipse cx="90" cy="82" rx="11" ry="8" fill="#081B33"/>
      <path d="M90 90 V98 M90 98 Q80 108 72 98 M90 98 Q100 108 108 98" stroke="#081B33" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path class="tongue" d="M82 102 Q90 124 98 102Z" fill="#E56B7A"/>
    </g>
  </svg></div>`;
}
function say(routeKey, force, custom) {
  const list = custom ? [custom] : (TIPS[routeKey] || TIPS.inicio);
  if (force) tipIdx = (tipIdx + 1) % list.length; else tipIdx = 0;
  const b = $('#bubble'), g = $('#guide'); if (!b) return;
  if (!guideOn && !force) return;
  g.classList.remove('hide'); guideOn = true;
  b.textContent = list[tipIdx]; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  clearTimeout(tipTimer); tipTimer = setTimeout(() => b.classList.remove('pop'), 9000);
}

/* ============================================================ render raíz */
function render() {
  const app = $('#app');
  document.body.classList.toggle('authed', !!(S.token && S.user));
  if (!S.token || !S.user) { app.innerHTML = authView(); return; }
  const views = { inicio: vInicio, mascotas: vMascotas, ficha: vFicha, alimentacion: vAlimentacion, comedero: vComedero, salud: vSalud, tiendas: vTiendas, tienda: vTienda, carrito: vCarrito, pedidos: vPedidos, pago: vPago, historial: vHistorial, perfil: vPerfil };
  const view = views[S.route]();
  const active = S.route === 'ficha' ? 'mascotas' : S.route === 'tienda' ? 'tiendas' : S.route === 'pago' || S.route === 'pedidos' ? 'carrito' : S.route;
  const badge = (k) => (k === 'carrito' && cartCount() ? `<em class="badge">${cartCount()}</em>` : '');
  const side = NAV.map(([k, i, l]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span class="ic">${i}</span>${l}${badge(k)}</a>`).join('');
  const short = { mascotas: 'Mascotas', tiendas: 'Tiendas' };
  const bottom = BOTTOM.map((k) => { const [, i, l] = NAV.find((n) => n[0] === k); return `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span class="ic">${i}</span><span>${short[k] || l}</span>${badge(k)}</a>`; }).join('') +
    `<a href="#" data-act="more" class="${['alimentacion', 'comedero', 'historial', 'perfil'].includes(active) ? 'on' : ''}"><span class="ic">➕</span><span>Más</span></a>`;
  const cartPill = `<a class="cartpill" href="#/carrito">🛒 Carrito${cartCount() ? ` <em class="badge">${cartCount()}</em>` : ''}</a>`;
  const online = `<span class="pill ${S.device?.online ? 'ok' : 'bad'}">${S.device?.online ? '● Comedero en línea' : '● Comedero sin conexión'}</span>`;
  app.innerHTML = `
  <div class="shell">
    <aside class="side"><img class="logo" src="img/logo-white.png" alt="PetZen"><nav class="nav">${side}</nav>
      <div class="foot">Hola, ${esc(S.user.name.split(' ')[0])} 🐾<br>La app no reemplaza al veterinario.</div></aside>
    <main class="main">
      <div class="mobhead"><img src="img/logo.png" alt="PetZen"><div class="row" style="gap:8px">${online}${cartPill}</div></div>
      <div class="topbar"><h1>${S.route === 'tienda' ? esc(storeById(S.arg)?.name || 'Tienda') : TITLES[S.route]}</h1><div class="desk row" style="gap:10px">${online}${cartPill}</div></div>
      <div class="view" key="${S.route}">${view}</div>
    </main>
    <nav class="bottom">${bottom}</nav>
  </div>`;
  if (B?.inline && S.route === 'salud' && S.saludTab === 'urg') { docNote(); if (B.date) loadSlots(); }
}

/* ============================================================ AUTENTICACIÓN */
function authView() {
  const reg = S.authTab === 'register';
  return `
  <div class="auth">
    <section class="hero">
      <div class="floaties"><i>🐾</i><i>🦴</i><i>🐾</i><i>🐕</i><i>🐾</i></div>
      <img class="logo" src="img/logo-white.png" alt="PetZen">
      <div>
        <h1>Tu perro come a tiempo, <em>aunque tú no estés.</em></h1>
        <p style="color:#CFDAEC;max-width:460px">Todo el cuidado de tu mascota en una sola app: rutinas, citas veterinarias, tiendas aliadas y un comedero inteligente conectado por WiFi.</p>
        <div class="photo" style="margin-top:22px"></div>
      </div>
      <div class="small" style="color:#9FB1CC">© PetZen · Cali, Colombia</div>
    </section>
    <section class="form"><div class="box">
      <h2 style="font-size:28px">${reg ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
      <p class="muted">${reg ? 'Empieza a cuidar mejor a tu mejor amigo.' : 'Inicia sesión para ver a tu mascota.'}</p>
      <div class="tabs"><button class="${reg ? '' : 'on'}" data-act="tab" data-v="login">Ingresar</button><button class="${reg ? 'on' : ''}" data-act="tab" data-v="register">Registrarme</button></div>
      <form data-form="${reg ? 'register' : 'login'}" autocomplete="on">
        ${reg ? '<label>Tu nombre</label><input name="name" required maxlength="60" placeholder="Ej: Diana">' : ''}
        <label>Correo</label><input name="email" type="email" required placeholder="tucorreo@gmail.com">
        <label>Contraseña</label><input name="password" type="password" required minlength="${reg ? 8 : 1}" placeholder="${reg ? 'Mínimo 8 caracteres' : 'Tu contraseña'}">
        ${reg ? `<label class="check"><input type="checkbox" name="consent" required><span>He leído y acepto la <a href="#" data-act="legal">política de tratamiento de datos</a> (Ley 1581 de 2012) y entiendo que la app no reemplaza al veterinario.</span></label>` : ''}
        <button class="btn gold big" style="width:100%;margin-top:10px" type="submit">${reg ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
    </div></section>
  </div>`;
}
function logout(silent) {
  S.token = null; S.user = null; store.del('pz_token'); S.sim = false;
  if (!silent) toast('Sesión cerrada.');
  location.hash = ''; render(); say('auth');
}

/* ============================================================ VISTAS */
function petSelector() {
  if (S.pets.length < 2) return '';
  return `<div class="row wrap" style="margin-bottom:14px">${S.pets.map((p) => `<button class="btn sm ${p.id === currentPet()?.id ? '' : 'ghost'}" data-act="pick-pet" data-id="${p.id}">${petEmoji(p)} ${esc(p.name)}</button>`).join('')}</div>`;
}
const nextAppt = () => S.appointments.find((a) => a.status === 'agendada' && a.date >= todayISO());

const KIND_ICON = { vacuna: '💉', cita: '🩺', 'baño': '🛁', 'desparasitación': '💊', medicina: '💊', otro: '📌' };
function relDay(iso) {
  const diff = Math.round((new Date(todayKey(iso) + 'T12:00:00Z') - new Date(todayISO() + 'T12:00:00Z')) / 864e5);
  return diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : diff > 1 ? `En ${diff} días` : `Hace ${-diff} días`;
}
function remCard(r, actions) {
  const d = new Date(r.when), late = !r.done && d < new Date();
  const dd = d.toLocaleDateString('es-CO', { day: 'numeric', timeZone: TZ }), mm = d.toLocaleDateString('es-CO', { month: 'short', timeZone: TZ }).replace('.', '');
  return `<div class="rem ${r.done ? 'done' : ''} ${late ? 'late' : ''} k-${esc(r.kind)}"><div class="datebox"><b>${dd}</b><span>${mm}</span></div>
    <div class="grow"><div class="rtitle">${KIND_ICON[r.kind] || '📌'} ${esc(r.title)}</div><div class="small muted">🕒 ${fmtTime(r.when)}${r.petName ? ` · 🐾 ${esc(r.petName)}` : ''}</div></div>
    <div class="col-end"><span class="pill ${late ? 'bad' : r.done ? 'ok' : 'gold'}">${late ? 'Vencido' : r.done ? '✔ Listo' : relDay(r.when)}</span>${actions ? `<div class="row" style="gap:6px"><button class="btn sm ghost" data-act="rem-ok" data-id="${r.id}" data-v="${r.done ? '' : '1'}">${r.done ? '↩ Reabrir' : '✔ Hecho'}</button><button class="btn sm ghost" data-act="rem-del" data-id="${r.id}" aria-label="Eliminar">🗑</button></div>` : ''}</div></div>`;
}
function vInicio() {
  const p = currentPet();
  if (!p) return `<div class="card empty"><div class="big wiggle">🐾</div><h2>Registra a tu mascota</h2><p>Para empezar, cuéntanos quién es tu compañero.</p><button class="btn gold" data-act="pet-new">Agregar mascota</button></div>`;
  const n = nutrition(p), eaten = todayGrams(p.id), pct = Math.min(100, Math.round((eaten / n.grams) * 100));
  const next = S.schedules.filter((s) => s.enabled && s.petId === p.id).map((s) => s.time).sort();
  const nowHM = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const nextT = next.find((t) => t > nowHM) || next[0];
  const upcoming = S.reminders.filter((r) => !r.done).slice(0, 4);
  const level = S.device?.foodLevel, ap = nextAppt();
  return `
  <div class="hello"><span class="wave">👋</span> <b>¡Hola, ${esc(S.user.name.split(' ')[0])}!</b> <span class="muted">Así va el día de ${esc(p.name)}.</span></div>
  ${petSelector()}
  <div class="grid g2">
    <div class="card navy"><div class="row" style="gap:20px">
      <div class="ring" style="--p:${pct}"><div><b>${pct}%</b><span class="small">de hoy</span></div></div>
      <div><h2 style="margin:0 0 6px">${esc(p.name)} hoy</h2>
        <div class="kpi">${eaten} g</div><div class="small" style="opacity:.8">de ${n.grams} g recomendados</div>
        <div class="small" style="opacity:.8;margin-top:8px">Próxima comida: <b>${nextT || 'sin horarios'}</b></div></div>
    </div></div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">📡 Comedero</h2><span class="pill ${S.device?.online ? 'ok' : 'bad'}">${S.device?.online ? 'En línea' : 'Sin conexión'}</span></div>
      <p class="muted small" style="margin:8px 0 12px">Última señal: ${ago(S.device?.lastSeen)}${level !== null && level !== undefined ? ` · Alimento: <b>${level}%</b>` : ''}</p>
      <div class="row wrap"><button class="btn gold" data-act="dispense-quick">🍽️ Dispensar ahora (${Math.round(n.grams / Math.max(next.length, 2))} g)</button><a class="btn ghost" href="#/comedero">Ver comedero</a></div>
    </div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <a class="card tile" href="#/salud"><div class="e wiggle">🩺</div><b>${ap ? 'Próxima cita' : 'Agendar cita'}</b><span class="small muted">${ap ? `${longDate(ap.date)} · ${hhmm12(ap.time)}<br>${esc(ap.petName)} · ${esc(ap.serviceName)}` : 'Veterinario y spa, con día y hora.'}</span></a>
    <a class="card tile" href="#/tiendas"><div class="e wiggle">🛍️</div><b>Tiendas aliadas</b><span class="small muted">Comida, ropa, juguetes y más.</span></a>
    <a class="card tile" href="#/ficha/${p.id}"><div class="e wiggle">📋</div><b>Ficha de ${esc(p.name)}</b><span class="small muted">Historia clínica y carnet de vacunas.</span></a>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card agenda"><span class="eyebrow">PRÓXIMAS ACTIVIDADES</span><h2>Tu agenda</h2>
      ${upcoming.length ? `<div class="remlist">${upcoming.map((r) => remCard(r)).join('')}</div>` : '<div class="empty small"><div class="big wiggle">🎉</div>Todo al día. ¡No tienes actividades pendientes!</div>'}
      <div class="row between wrap" style="margin-top:12px"><a href="#/salud" class="small" data-act="goto-rem">Ver todas →</a><a href="#/historial" class="small">🕘 Mi historial</a></div></div>
    <div class="card"><h2>🥣 Últimas comidas</h2>${logList(S.logs.slice(0, 5))}</div>
  </div>
  <div class="note" style="margin-top:16px">Las recomendaciones son estimaciones de referencia y <b>no reemplazan la consulta con tu veterinario</b>.</div>`;
}

const STATUS = { dispensado: ['ok', '✔ Dispensado'], pendiente: ['warn', '⏳ En curso'], no_entregada: ['bad', '✖ No entregada'], error: ['bad', '✖ Error'] };
function logList(logs) {
  if (!logs.length) return '<div class="empty small">Aún no hay comidas registradas.</div>';
  return `<div class="list">${logs.map((l) => `<div class="row between"><div><b>${esc(l.petName)} · ${l.grams} g</b><div class="small muted">${fmtDT(l.at)} · ${l.source === 'horario' ? 'Horario automático' : 'Manual'}</div></div><span class="pill ${STATUS[l.status]?.[0] || ''}">${STATUS[l.status]?.[1] || l.status}</span></div>`).join('')}</div>`;
}

/* ---------- Mascotas */
function vMascotas() {
  return `
  <div class="row between wrap" style="margin-bottom:16px"><p class="muted" style="margin:0">Registra a tus compañeros: así personalizamos su alimentación y tus citas.</p><button class="btn gold" data-act="pet-new">＋ Agregar mascota</button></div>
  ${S.pets.length ? `<div class="grid g2">${S.pets.map((p) => { const n = nutrition(p); return `
    <div class="card petcard"><div class="row"><div class="avatar">${petEmoji(p)}</div>
      <div class="grow"><h3 style="margin:0">${esc(p.name)}</h3><div class="small muted">${esc(p.breed)} · ${years(p.ageYears)} · ${p.weightKg} kg</div>
      <div class="chips"><span class="chip">${p.sex === 'hembra' ? '♀ Hembra' : '♂ Macho'}</span><span class="chip">${esc(p.size)}</span><span class="chip">${esc(p.coatColor)}</span></div></div></div>
      <div class="note" style="margin:12px 0">Meta diaria estimada: <b>${n.grams} g</b> (~${n.kcal} kcal)</div>
      <div class="row wrap"><a class="btn sm gold" href="#/ficha/${p.id}">📋 Ver ficha</a><button class="btn sm ghost" data-act="pet-edit" data-id="${p.id}">Editar</button><button class="btn sm ghost" data-act="pet-del" data-id="${p.id}" style="color:var(--bad)">Eliminar</button></div></div>`; }).join('')}</div>`
    : `<div class="card empty"><div class="big wiggle">🐾</div><p>Aún no has agregado mascotas.</p></div>`}`;
}

function opts(list, sel) { return list.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join(''); }
function petForm(p = {}) {
  const sp = p.species || 'perro', breeds = sp === 'gato' ? CAT_BREEDS : DOG_BREEDS;
  const al = p.allergies || [];
  const ta = (name, label, ph, rows = 2, max = 400) => `<label>${label}</label><textarea name="${name}" rows="${rows}" maxlength="${max}" placeholder="${ph}">${esc(p[name] || '')}</textarea>`;
  return `<div class="in"><h2>${p.id ? 'Editar mascota' : 'Nueva mascota'}</h2>
  <form data-form="pet" data-id="${p.id || ''}">
    <div class="step-title">1 · Lo básico</div>
    <label>Nombre</label><input name="name" required maxlength="40" value="${esc(p.name || '')}" placeholder="Ej: Max">
    <label>¿Qué es?</label>
    <div class="radios"><label class="rad"><input type="radio" name="species" value="perro" data-act="species" ${sp === 'perro' ? 'checked' : ''}><span>🐶 Perro</span></label><label class="rad"><input type="radio" name="species" value="gato" data-act="species" ${sp === 'gato' ? 'checked' : ''}><span>🐱 Gato</span></label></div>
    <div class="grid g2"><div><label>Sexo</label><select name="sex">${opts(['macho', 'hembra'], p.sex)}</select></div>
    <div><label>Raza</label><select name="breed" id="breed">${opts(breeds, p.breed)}</select></div>
    <div><label>Fecha de nacimiento (opcional)</label><input name="birthDate" type="date" data-act="birth" max="${todayISO()}" value="${esc(p.birthDate || '')}"></div>
    <div><label>Edad (años)</label><input name="ageYears" id="ageYears" type="number" min="0" max="30" step="1" required value="${Math.round(p.ageYears ?? 2)}"></div>
    <div><label>Peso (kg)</label><input name="weightKg" type="number" min="0.3" max="90" step="0.1" required value="${p.weightKg ?? 10}"></div>
    <div><label>Alimento actual (marca)</label><input name="foodBrand" maxlength="60" value="${esc(p.foodBrand || '')}" placeholder="Ej: Alimento premium adulto"></div></div>
    <div class="step-title">2 · Cómo es</div>
    <div class="grid g2"><div><label>Tamaño</label><select name="size">${opts(SIZES, p.size || 'mediano')}</select></div>
    <div><label>Color del pelaje</label><select name="coatColor">${opts(COLORS, p.coatColor)}</select></div>
    <div><label>Tipo de pelaje</label><select name="coatType">${opts(COATS, p.coatType)}</select></div>
    <div><label>Temperamento</label><select name="temperament">${opts(TEMPERS, p.temperament || 'juguetón')}</select></div></div>
    ${ta('features', 'Características particulares', 'Manchas, cicatrices, color de ojos, señas…', 2, 300)}
    <div class="step-title">3 · Salud e historia clínica</div>
    <label>Alergias o sensibilidades conocidas</label>
    <div class="chipsel">${ALLERGIES.map((a) => `<label class="chk"><input type="checkbox" name="allergies" value="${a}" ${al.includes(a) ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div>
    ${ta('allergyNotes', 'Otras alergias (detalle)', 'Ej: reacción a un shampoo específico', 2, 300)}
    ${ta('conditions', 'Enfermedades o condiciones conocidas', 'Ej: displasia de cadera, dermatitis…')}
    ${ta('medications', 'Medicamentos actuales', 'Nombre, dosis y frecuencia')}
    ${ta('clinicalSummary', 'Historia clínica / antecedentes', 'Cirugías, hospitalizaciones, tratamientos previos…', 3, 1200)}
    ${ta('vetNotes', 'Observaciones del veterinario', 'Recomendaciones de tu veterinario', 2, 600)}
    <div class="grid g2"><div><label>Última vacuna</label><input name="lastVaccine" type="date" max="${todayISO()}" value="${esc(p.lastVaccine || '')}"></div>
    <div><label>Última desparasitación</label><input name="lastDeworm" type="date" max="${todayISO()}" value="${esc(p.lastDeworm || '')}"></div>
    <div><label>Veterinario habitual</label><input name="vetName" maxlength="60" value="${esc(p.vetName || '')}" placeholder="Nombre o clínica"></div>
    <div><label>Teléfono del veterinario</label><input name="vetPhone" maxlength="20" value="${esc(p.vetPhone || '')}" placeholder="Ej: 602 555 0000"></div>
    <div><label>Nivel de actividad</label><select name="activity">${opts(['baja', 'media', 'alta'], p.activity || 'media')}</select></div>
    <div><label>N.º de microchip</label><input name="microchipNumber" maxlength="30" value="${esc(p.microchipNumber || '')}" placeholder="Si lo tiene"></div></div>
    <label class="check"><input type="checkbox" name="neutered" ${p.neutered ? 'checked' : ''}><span>Está esterilizado/a</span></label>
    <label class="check"><input type="checkbox" name="microchip" ${p.microchip ? 'checked' : ''}><span>Tiene microchip</span></label>
    ${ta('notes', 'Notas (opcional)', 'Preferencias, manías…', 2, 200)}
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn gold">Guardar</button></div>
  </form></div>`;
}

/* ---------- Ficha de la mascota */
function vFicha() {
  const p = S.pets.find((x) => x.id === S.arg) || currentPet();
  if (!p) return `<div class="card empty"><p>Mascota no encontrada.</p><a class="btn gold" href="#/mascotas">Volver</a></div>`;
  const tabs = [['datos', '🐾 Datos'], ['clinica', '🩺 Historia clínica'], ['carnet', '💉 Carnet de vacunas']];
  const docs = (kind) => S.docs.filter((d) => d.kind === kind);
  const upload = (kind) => `<label class="btn gold sm">⬆ Subir archivo<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf" data-act="upload" data-kind="${kind}" data-pet="${p.id}"></label>`;
  const docList = (kind, label) => `
    <div class="card"><div class="row between wrap"><h2 style="margin:0">${label}</h2>${upload(kind)}</div>
      <p class="small muted" style="margin:8px 0 12px">PDF o imagen (PNG, JPG, WEBP), máximo 6 MB. Si agendas una cita, podrás compartirlo con el veterinario.</p>
      ${docs(kind).length ? `<div class="list">${docs(kind).map((d) => `<div class="row between"><div class="row"><span class="docic">${d.mime === 'application/pdf' ? '📄' : '🖼️'}</span><div><b>${esc(d.name)}</b><div class="small muted">${fmtDT(d.at)} · ${Math.round(d.size / 1024)} KB</div></div></div><div class="row"><button class="btn sm ghost" data-act="doc-open" data-id="${d.id}">Ver</button><button class="btn sm ghost" data-act="doc-del" data-id="${d.id}">🗑</button></div></div>`).join('')}</div>` : '<div class="empty small"><div class="big">📂</div>Aún no has subido nada.</div>'}
    </div>`;
  let body = '';
  if (S.fichaTab === 'datos') {
    const rows = [['Especie', p.species === 'gato' ? 'Gato' : 'Perro'], ['Raza', p.breed], ['Sexo', p.sex], ['Nacimiento', ymdLabel(p.birthDate)], ['Edad', years(p.ageYears)], ['Peso', p.weightKg + ' kg'], ['Tamaño', p.size], ['Color', p.coatColor], ['Pelaje', p.coatType], ['Temperamento', p.temperament], ['Actividad', p.activity], ['Esterilizado', p.neutered ? 'Sí' : 'No'], ['Microchip', p.microchip ? 'Sí' + (p.microchipNumber ? ' · ' + p.microchipNumber : '') : 'No'], ['Alimento actual', p.foodBrand], ['Veterinario habitual', [p.vetName, p.vetPhone].filter(Boolean).join(' · ')], ['Alergias', [...(p.allergies || []), p.allergyNotes].filter(Boolean).join(', ') || 'Ninguna conocida']];
    body = `<div class="card"><div class="facts">${rows.map(([k, v]) => `<div><span class="small muted">${k}</span><b>${esc(v || '—')}</b></div>`).join('')}</div>
      ${p.features ? `<p class="small" style="margin-top:12px">✨ <b>Características:</b> ${esc(p.features)}</p>` : ''}
      ${p.notes ? `<p class="small muted" style="margin-top:12px">📝 ${esc(p.notes)}</p>` : ''}
      <div class="row wrap" style="margin-top:14px"><button class="btn sm ghost" data-act="pet-edit" data-id="${p.id}">✏️ Editar datos</button><a class="btn sm gold" href="#/tienda/clinica">🩺 Agendar cita</a></div></div>`;
  } else if (S.fichaTab === 'clinica') {
    const item = (k, v) => `<div><span class="small muted">${k}</span><b>${esc(v || '—')}</b></div>`;
    body = `<div class="card"><h3>Historia clínica</h3><p>${p.clinicalSummary ? esc(p.clinicalSummary) : '<span class="muted">Sin información. Puedes agregarla editando los datos.</span>'}</p>
      <div class="facts" style="margin-top:12px">${item('Enfermedades', p.conditions)}${item('Medicamentos', p.medications)}${item('Alergias', [...(p.allergies || []), p.allergyNotes].filter(Boolean).join(', '))}${item('Última vacuna', ymdLabel(p.lastVaccine))}${item('Última desparasitación', ymdLabel(p.lastDeworm))}${item('Observaciones del veterinario', p.vetNotes)}</div>
      <button class="btn sm ghost" style="margin-top:12px" data-act="pet-edit" data-id="${p.id}">✏️ Editar historia clínica</button></div><div style="height:16px"></div>${docList('historia', 'Historia clínica')}`;
  } else body = docList('carnet', 'Carnet de vacunas');
  return `
  <a href="#/mascotas" class="small back">← Mis mascotas</a>
  <div class="card navy fichahead"><div class="avatar big">${petEmoji(p)}</div><div><h2 style="margin:0">${esc(p.name)}</h2><div style="opacity:.85">${esc(p.breed)} · ${years(p.ageYears)} · ${p.weightKg} kg</div>
    <div class="chips dark"><span class="chip">${p.sex === 'hembra' ? '♀ Hembra' : '♂ Macho'}</span><span class="chip">${esc(p.size)}</span><span class="chip">${esc(p.coatColor)}</span><span class="chip">${esc(p.coatType)}</span></div></div></div>
  <div class="tabs wide" style="margin:16px 0">${tabs.map(([k, l]) => `<button class="${S.fichaTab === k ? 'on' : ''}" data-act="ficha-tab" data-v="${k}">${l}</button>`).join('')}</div>
  ${body}`;
}

/* ---------- Alimentación */
function vAlimentacion() {
  const p = currentPet();
  if (!p) return `<div class="card empty"><p>Primero agrega una mascota.</p><button class="btn gold" data-act="pet-new">Agregar mascota</button></div>`;
  const kc = store.get('pz_kcal', 350), n = nutrition(p, kc);
  const mine = S.schedules.filter((s) => s.petId === p.id).sort((a, b) => a.time.localeCompare(b.time));
  return `${petSelector()}
  <div class="grid g2">
    <div class="card navy"><h2>Recomendación para ${esc(p.name)}</h2>
      <div class="row" style="gap:28px"><div><div class="kpi">${n.grams} g</div><div class="small" style="opacity:.8">al día</div></div><div><div class="kpi">${n.kcal}</div><div class="small" style="opacity:.8">kcal/día</div></div></div>
      <label style="color:#CFDAEC">Energía de tu alimento (kcal por 100 g)</label>
      <input type="number" min="200" max="600" value="${kc}" data-act="kcal" style="max-width:160px">
      <p class="small" style="opacity:.75;margin-top:10px">Cálculo: energía en reposo (70 × kg^0,75) × factor de vida (${n.factor}) × actividad. Es una estimación de referencia; confírmala con tu veterinario.</p>
      <div class="row wrap" style="margin-top:6px">${[2, 3, 4].map((m) => `<button class="btn sm gold" data-act="suggest" data-m="${m}">${m} comidas</button>`).join('')}</div>
      <p class="small" style="opacity:.75;margin:6px 0 0">Crea horarios sugeridos con la porción dividida.</p>
    </div>
    <div class="card"><div class="row between"><h2 style="margin:0">⏰ Horarios automáticos</h2><button class="btn sm" data-act="sched-new">＋ Horario</button></div>
      ${mine.length ? `<div class="list" style="margin-top:8px">${mine.map((s) => `<div class="row between"><div><b style="font-size:20px;font-family:Fraunces,serif">${s.time}</b> <span class="muted">· ${s.grams} g</span></div><div class="row"><label class="toggle"><input type="checkbox" data-act="sched-toggle" data-id="${s.id}" ${s.enabled ? 'checked' : ''}><span></span></label><button class="btn sm ghost" data-act="sched-del" data-id="${s.id}">🗑</button></div></div>`).join('')}</div>` : '<div class="empty small">Sin horarios. Usa los botones de "comidas" para crear unos sugeridos.</div>'}
      <p class="small muted">El servidor envía la orden al comedero a la hora indicada (hora de Colombia).</p>
    </div>
  </div>`;
}

/* ---------- Comedero */
function vComedero() {
  const p = currentPet(), d = S.device || {};
  const pending = S.logs.some((l) => l.status === 'pendiente');
  const portion = p ? Math.round(nutrition(p).grams / 3) : 60;
  return `${petSelector()}
  <div class="grid g2">
    <div class="card"><div class="feeder ${pending ? 'run' : ''}">
      <div style="position:relative"><div class="body"><div class="scr">${d.online ? 'petzen · WiFi' : 'sin señal'}</div><div class="led ${d.online ? 'on' : ''}"></div><div class="paw">🐾</div><i class="kibble"></i><i class="kibble"></i><i class="kibble"></i></div></div>
      <div class="bowl"></div>
      ${pending ? '<div class="runner">🐕💨</div>' : ''}
      <span class="pill ${d.online ? 'ok' : 'bad'}">${d.online ? '● En línea' : '● Sin conexión'} · ${ago(d.lastSeen)}</span>
      ${d.foodLevel !== null && d.foodLevel !== undefined ? `<span class="small muted">Nivel de alimento: <b>${d.foodLevel}%</b>${d.firmware ? ' · fw ' + esc(d.firmware) : ''}</span>` : ''}
    </div></div>
    <div class="card"><h2>Dispensar ahora</h2>
      ${p ? `<label>Porción (gramos)</label><input id="grams" type="number" min="5" max="500" value="${portion}">
      <button class="btn gold big" style="width:100%;margin-top:14px" data-act="dispense" ${pending ? 'disabled' : ''}>${pending ? '⏳ Dispensando…' : '🍽️ Dispensar para ' + esc(p.name)}</button>
      ${!d.online ? '<p class="small" style="color:var(--bad)">El comedero está sin conexión: la orden quedará en espera 2 minutos.</p>' : ''}` : '<p>Agrega una mascota primero.</p>'}
      <hr style="border:none;border-top:1px solid var(--line);margin:18px 0">
      <h3>Comedero virtual</h3>
      <p class="small muted">Prueba el comedero desde este navegador, sin necesidad del aparato.</p>
      <label class="check"><input type="checkbox" data-act="sim" ${S.sim ? 'checked' : ''}><span>Comedero virtual encendido</span></label>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Historial</h2>${logList(S.logs.slice(0, 15))}</div>
  <div class="card" style="margin-top:16px"><h3>Clave de tu comedero</h3>
    <p class="small muted">Es la clave con la que tu comedero real se identifica (no la compartas):</p><code class="k">${esc(S.user.deviceKey)}</code></div>`;
}

/* ---------- Salud: citas, recordatorios, urgencias */
function vSalud() {
  const tabs = [['citas', '📅 Citas'], ['rem', '⏰ Recordatorios'], ['urg', '🚨 Urgencias']];
  const body = S.saludTab === 'citas' ? saludCitas() : S.saludTab === 'rem' ? saludRem() : saludUrg();
  return `<div class="tabs wide" style="margin-bottom:16px">${tabs.map(([k, l]) => `<button class="${S.saludTab === k ? 'on' : ''} ${k === 'urg' ? 'urgtab' : ''}" data-act="salud-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}
function apptCard(a) {
  const d = new Date(a.date + 'T12:00:00-05:00');
  return `<div class="appt ${a.status}"><div class="datebox"><b>${d.toLocaleDateString('es-CO', { day: 'numeric', timeZone: TZ })}</b><span>${d.toLocaleDateString('es-CO', { month: 'short', timeZone: TZ })}</span></div>
    <div class="grow"><b>${esc(a.serviceName)}</b><div class="small muted">${esc(a.storeName)}</div><div class="small">🐾 ${esc(a.petName)} · 🕒 ${hhmm12(a.time)} · ${longDate(a.date)}</div>
    ${a.sharedDocs?.length ? `<div class="small muted">📎 Compartido: ${a.sharedDocs.map(esc).join(', ')}</div>` : ''}
    <div class="small muted">Código ${esc(a.code)}</div></div>
    <div class="col-end"><span class="pill ${a.status === 'agendada' ? 'ok' : 'bad'}">${a.status === 'agendada' ? '✔ Agendada' : 'Cancelada'}</span>${a.status === 'agendada' && a.date >= todayISO() ? `<button class="btn sm ghost" data-act="appt-cancel" data-id="${a.id}">Cancelar</button>` : ''}</div></div>`;
}
function saludCitas() {
  const up = S.appointments.filter((a) => a.status === 'agendada' && a.date >= todayISO()), old = S.appointments.filter((a) => !up.includes(a));
  return `<div class="row between wrap" style="margin-bottom:14px"><p class="muted" style="margin:0">Veterinario y spa, con día y hora confirmados.</p><a class="btn gold" href="#/tienda/clinica">＋ Agendar cita</a></div>
  <div class="card"><h2>Próximas citas</h2>${up.length ? `<div class="list">${up.map(apptCard).join('')}</div>` : '<div class="empty"><div class="big wiggle">📅</div>No tienes citas próximas.</div>'}</div>
  ${old.length ? `<div class="card" style="margin-top:16px"><h2>Historial de citas</h2><div class="list">${old.map(apptCard).join('')}</div></div>` : ''}`;
}
function saludRem() {
  const open = S.reminders.filter((r) => !r.done), done = S.reminders.filter((r) => r.done);
  const nowD = new Date(), t0 = todayISO(), wk = addDays(t0, 7);
  const g = { late: [], today: [], week: [], later: [] };
  for (const r of open) { const k = todayKey(r.when); (new Date(r.when) < nowD && k < t0 ? g.late : k === t0 ? g.today : k <= wk ? g.week : g.later).push(r); }
  const block = (title, arr) => arr.length ? `<div class="remgroup"><h3>${title} <span class="count">${arr.length}</span></h3><div class="remlist">${arr.map((r) => remCard(r, true)).join('')}</div></div>` : '';
  return `<div class="row between wrap" style="margin-bottom:14px"><p class="muted" style="margin:0">Vacunas, baños, medicinas… que nada se te olvide.</p><button class="btn gold" data-act="rem-new">＋ Nuevo</button></div>
  <div class="card agenda"><span class="eyebrow">PENDIENTES</span><h2>Tu agenda</h2>
    ${open.length ? block('⚠️ Vencidos', g.late) + block('📍 Hoy', g.today) + block('📆 Esta semana', g.week) + block('🗓️ Más adelante', g.later) : '<div class="empty"><div class="big wiggle">🎉</div>Todo al día. ¡Buen trabajo!</div>'}</div>
  ${done.length ? `<div class="card" style="margin-top:16px"><h2>Completados</h2><div class="remlist" style="margin-top:12px">${done.map((r) => remCard(r, true)).join('')}</div></div>` : ''}`;
}
function callBtn(big) {
  const v = S.vet247;
  return v.phone ? `<a class="btn danger ${big ? 'big' : ''}" href="tel:${esc(v.phone.replace(/[^\d+]/g, ''))}">📞 Llamar a ${esc(v.name || 'mi veterinaria 24/7')} · ${esc(v.phone)}</a>` : `<button class="btn danger ${big ? 'big' : ''}" data-act="vet-set">📞 Configurar mi veterinaria 24/7</button>`;
}
function medSummary(p) {
  if (!p) return '';
  const al = [...(p.allergies || []), p.allergyNotes].filter(Boolean).join(', ');
  const none = !al && !p.medications && !p.conditions && !p.clinicalSummary;
  return `<div class="medsum"><b>Resumen médico</b>${none ? '<div class="small muted">Sin antecedentes médicos registrados.</div>' : ''}
    <div class="small"><b>Alergias:</b> ${esc(al || 'ninguna registrada')} · <b>Medicamentos:</b> ${esc(p.medications || 'ninguno registrado')}${p.conditions ? ` · <b>Enfermedades:</b> ${esc(p.conditions)}` : ''}</div>
    <a class="small" href="#/ficha/${p.id}">Actualizar historia clínica</a></div>`;
}
function urgBook() {
  const pets = S.pets, svcs = S.items.filter((i) => i.store === 'clinica'), st = storeById('clinica');
  if (!st || !svcs.length) return '';
  if (!pets.length) return `<div class="card bookcard"><span class="eyebrow">SI NO ES UNA URGENCIA</span><h2>Agenda con tranquilidad</h2><p>Primero registra a tu mascota para poder agendar su cita.</p><button class="btn gold" data-act="pet-new">Agregar mascota</button></div>`;
  if (!B || !B.inline || !pets.find((p) => p.id === B.petId)) B = { inline: true, item: svcs[0], petId: currentPet().id, date: '', time: '' };
  const p = pets.find((x) => x.id === B.petId);
  const groups = st.sections.map((sec) => `<optgroup label="${esc(sec)}">${svcs.filter((i) => i.section === sec).map((i) => `<option value="${i.id}" ${i.id === B.item.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="card bookcard"><span class="eyebrow">SI NO ES UNA URGENCIA</span><h2>Agenda con tranquilidad</h2>
    <p class="small muted" style="margin:4px 0 12px">${esc(st.name)}. Vacunas, chequeos, control de peso o consulta general: elige mascota, servicio y una hora libre.</p>
    <div class="miniSteps"><span class="on">1 · Mascota</span><span>2 · Servicio</span><span>3 · Horario</span><span>4 · Pago</span></div>
    <label>Selecciona tu mascota</label><select id="bk-pet" data-act="bk-pet">${pets.map((x) => `<option value="${x.id}" ${x.id === B.petId ? 'selected' : ''}>${petEmoji(x)} ${esc(x.name)} · ${esc(x.species)} · ${years(x.ageYears)}</option>`).join('')}</select>
    <div id="medsum">${medSummary(p)}</div>
    <label>Servicio</label><select id="bk-svc" data-act="bk-svc">${groups}</select>
    <label>Día</label><input id="bk-date" type="date" data-act="bk-date" min="${todayISO()}" max="${addDays(todayISO(), 60)}" value="${esc(B.date)}">
    <label>Hora disponible</label><div id="slots" class="slots"><span class="small muted">Elige un día para ver los horarios.</span></div>
    <label>Motivo (opcional)</label><textarea id="bk-reason" rows="2" maxlength="200" placeholder="Cuéntale al veterinario qué necesitas…"></textarea>
    <div id="docnote" class="note" style="margin-top:12px"></div>
    <div class="row between pricerow"><span>Valor de la cita</span><b id="bk-price">${money(B.item.price)}</b></div>
    <div class="row wrap"><button type="button" class="btn ghost" id="bk-add" data-act="bk-add" disabled>🛒 Agregar al carrito</button><button type="button" class="btn gold grow" id="bk-pay" data-act="bk-pay" disabled>Agendar y pagar →</button></div></div>`;
}
function saludUrg() {
  return `<div class="card urgent"><div class="row" style="gap:14px"><div class="sirena">🚨</div><div><h2 style="margin:0;color:#fff">¿Es una urgencia?</h2><p style="margin:4px 0 0">Una urgencia es una situación que pone en riesgo la vida o causa mucho dolor, y <b>no puede esperar a una cita</b>. En esos casos llama de inmediato a una veterinaria 24/7.</p></div></div>
    <div style="margin-top:14px">${callBtn(true)}</div></div>
  <div class="grid g2" style="margin-top:16px;align-items:start">
    ${urgBook()}
    <div><div class="card"><h2>🚩 Señales de urgencia</h2><ul class="signs">${URGENT_SIGNS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="small muted">No le des medicamentos humanos ni induzcas el vómito sin indicación del veterinario.</p></div>
    <div class="card" style="margin-top:16px"><h3>Mi veterinaria 24/7</h3><p class="small muted">Guarda el nombre y teléfono de la veterinaria de urgencias de tu confianza para llamar con un toque.</p>
      <button class="btn sm ghost" data-act="vet-set">${S.vet247.phone ? '✏️ Cambiar' : '＋ Configurar'}</button></div></div>
  </div>
  <div class="note" style="margin-top:16px">PetZen es una herramienta de apoyo: no diagnostica ni reemplaza la atención veterinaria.</div>`;
}

/* ---------- Tiendas */
function vTiendas() {
  return `${cartBar()}<p class="muted" style="margin:0 0 16px">Elige una tienda aliada. Cada una tiene sus secciones y su forma de entrega o cita.</p>
  <div class="grid g2">${S.stores.map((st) => `<a class="card storecard" href="#/tienda/${st.id}" style="--c:${st.color}"><div class="sbanner"><span class="se wiggle">${st.emoji}</span></div>
    <div class="sbody"><b>${esc(st.name)}</b><span class="small muted">${esc(st.tag)}</span><div class="chips">${st.sections.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <span class="pill ${st.type === 'service' ? 'gold' : ''}">${st.type === 'service' ? '📅 Citas con día y hora' : '📦 Entrega a domicilio'}</span></div></a>`).join('')}</div>
  `;
}
const PRICE_CHIPS = [['Todos', 0, 0], ['Hasta $20.000', 0, 20000], ['$20.000 – $50.000', 20000, 50000], ['$50.000 – $100.000', 50000, 100000], ['Más de $100.000', 100000, 0]];
const flt = (id) => (S.flt[id] = S.flt[id] || { q: '', min: '', max: '', sort: 'rel' });
function cartBar() {
  const n = cartCount(), t = cartTotals();
  return `<a class="cartbar ${n ? 'has' : ''}" href="#/carrito"><span>🛒 <b>Carrito</b>${n ? ` · ${n} ${n === 1 ? 'ítem' : 'ítems'} · <b>${money(t.total)}</b>` : ' · vacío'}</span><span class="go">Ver carrito →</span></a>`;
}
function shopItems(st) {
  const f = flt(st.id), sec = S.sec[st.id] || 'Todo', q = f.q.trim().toLowerCase();
  let items = S.items.filter((i) => i.store === st.id && (sec === 'Todo' || i.section === sec));
  if (q) items = items.filter((i) => (i.name + ' ' + i.desc).toLowerCase().includes(q));
  if (f.min !== '') items = items.filter((i) => i.price >= +f.min);
  if (f.max !== '') items = items.filter((i) => i.price <= +f.max);
  if (f.sort === 'asc') items = [...items].sort((a, b) => a.price - b.price);
  else if (f.sort === 'desc') items = [...items].sort((a, b) => b.price - a.price);
  return items;
}
function prodGrid(st) {
  const items = shopItems(st), showSec = (S.sec[st.id] || 'Todo') === 'Todo';
  if (!items.length) return `<div class="card empty"><div class="big">🔎</div><p>No encontramos nada con esos filtros.</p><button class="btn gold" data-act="pclear" data-store="${st.id}">Quitar filtros</button></div>`;
  return `<div class="grid g3">${items.map((p) => `<div class="card prod"><div class="e wiggle">${p.emoji}</div>${showSec ? `<span class="chip">${esc(p.section)}</span>` : ''}<b>${esc(p.name)}</b><span class="small muted">${esc(p.desc)}</span>
    ${p.sizes ? `<span class="small muted">Tallas: ${p.sizes.join(' · ')}</span>` : ''}
    <div class="row between" style="margin-top:auto"><span class="price">${money(p.price)}</span>${p.kind === 'service' ? `<button class="btn sm gold" data-act="book" data-id="${p.id}">📅 Agendar</button>` : `<button class="btn sm gold" data-act="add" data-id="${p.id}">＋ Agregar</button>`}</div></div>`).join('')}</div>`;
}
function chipsHTML(id) {
  const f = flt(id), mn = f.min === '' ? 0 : +f.min, mx = f.max === '' ? 0 : +f.max;
  return PRICE_CHIPS.map(([l, a, b]) => `<button type="button" class="fchip ${mn === a && mx === b ? 'on' : ''}" data-act="pchip" data-store="${id}" data-min="${a}" data-max="${b}">${l}</button>`).join('');
}
function refreshShop(id, syncInputs) {
  const st = storeById(id), f = flt(id);
  const g = $('#pgrid'); if (g) g.innerHTML = prodGrid(st);
  const c = $('#pchips'); if (c) c.innerHTML = chipsHTML(id);
  const n = $('#rescount'); if (n) n.textContent = shopItems(st).length + ' resultado(s)';
  if (syncInputs) { const a = $('#f-min'), b = $('#f-max'); if (a) a.value = f.min; if (b) b.value = f.max; }
}
function vTienda() {
  const st = storeById(S.arg);
  if (!st) return `<div class="card empty"><p>Tienda no encontrada.</p><a class="btn gold" href="#/tiendas">Volver</a></div>`;
  const sec = S.sec[st.id] || 'Todo', f = flt(st.id), all = S.items.filter((i) => i.store === st.id);
  const first = st.id === 'clinica' ? `<div class="banner urgbanner" style="margin-bottom:14px">🚨 ¿Es una urgencia? No agendes: <a href="#/salud" data-act="goto-urg" style="color:inherit">llama a una veterinaria 24/7</a>.</div>` : '';
  const tabs = ['Todo', ...st.sections];
  return `${cartBar()}<a href="#/tiendas" class="small back">← Tiendas</a>
  <div class="storehead" style="--c:${st.color}"><span class="se">${st.emoji}</span><div><h2 style="color:#fff;margin:0">${esc(st.name)}</h2><div style="opacity:.9">${esc(st.tag)} · ${st.type === 'service' ? 'Agenda con día y hora' : 'Entrega a domicilio'}</div></div></div>
  ${first}
  <div class="tabs wide" style="margin:16px 0 10px">${tabs.map((s) => `<button class="${s === sec ? 'on' : ''}" data-act="sec" data-store="${st.id}" data-v="${esc(s)}">${esc(s)} <small>${s === 'Todo' ? all.length : all.filter((i) => i.section === s).length}</small></button>`).join('')}</div>
  <div class="card filterbar">
    <div class="frow"><input id="f-q" data-act="shop-q" data-store="${st.id}" type="search" placeholder="🔎 Buscar en ${esc(st.name)}…" value="${esc(f.q)}">
      <select data-act="shop-sort" data-store="${st.id}" aria-label="Ordenar"><option value="rel" ${f.sort === 'rel' ? 'selected' : ''}>Ordenar: destacados</option><option value="asc" ${f.sort === 'asc' ? 'selected' : ''}>Precio: menor a mayor</option><option value="desc" ${f.sort === 'desc' ? 'selected' : ''}>Precio: mayor a menor</option></select></div>
    <div class="frow"><span class="small muted">Precio</span><div id="pchips" class="fchips">${chipsHTML(st.id)}</div>
      <div class="frange"><input id="f-min" data-act="shop-min" data-store="${st.id}" type="number" min="0" step="1000" placeholder="Mín $" value="${esc(f.min)}"><span>–</span><input id="f-max" data-act="shop-max" data-store="${st.id}" type="number" min="0" step="1000" placeholder="Máx $" value="${esc(f.max)}"></div></div>
    <div class="small muted" id="rescount">${shopItems(st).length} resultado(s)</div></div>
  <div id="pgrid" style="margin-top:14px">${prodGrid(st)}</div>`;
}

/* ---------- Carrito (apartado propio) */
function cartGroups() {
  const groups = {};
  for (const c of S.cart) {
    const it = itemById(c.id); if (!it) continue;
    (groups[it.store] = groups[it.store] || []).push({ c, it });
  }
  return groups;
}
function cartTotals() {
  let goods = 0, services = 0;
  for (const c of S.cart) { const it = itemById(c.id); if (!it) continue; if (c.kind === 'service') services += it.price; else goods += it.price * c.qty; }
  const rate = S.coupon === 'PRIMERA10' ? 0.1 : 0, discount = Math.round(goods * rate);
  return { goods, services, discount, total: goods + services - discount, hasGoods: goods > 0, hasServices: services > 0 };
}
function cartTabs(active) {
  return `<div class="tabs wide" style="margin:0 0 16px"><button class="${active === 'carrito' ? 'on' : ''}" data-act="goto" data-r="carrito">🛒 Carrito (${cartCount()})</button><button class="${active === 'pedidos' ? 'on' : ''}" data-act="goto" data-r="pedidos">📦 Mis pedidos (${S.orders.length})</button></div>`;
}
function vCarrito() {
  const t = cartTotals(), groups = cartGroups();
  if (!S.cart.length) return `${cartTabs('carrito')}<div class="card empty"><div class="big wiggle">🛒</div><h2>Tu carrito está vacío</h2><p>Explora las tiendas aliadas y agenda citas o compra para tu peludito.</p><a class="btn gold" href="#/tiendas">Ir a las tiendas</a></div>`;
  return `${cartTabs('carrito')}<div class="grid cartgrid">
  <div>${Object.entries(groups).map(([sid, rows]) => { const st = storeById(sid); return `<div class="card" style="margin-bottom:16px;padding:0;overflow:hidden"><div class="cartstore" style="--c:${st.color}">${st.emoji} ${esc(st.name)} <span class="pill">${st.type === 'service' ? 'Cita' : 'Entrega a domicilio'}</span></div>
    <div class="list" style="padding:0 18px">${rows.map(({ c, it }) => c.kind === 'service' ? `<div class="row between"><div><b>${it.emoji} ${esc(it.name)}</b><div class="small muted">🐾 ${esc(S.pets.find((p) => p.id === c.petId)?.name || '—')} · 📅 ${longDate(c.date)} · 🕒 ${hhmm12(c.time)}</div></div><div class="row"><b>${money(it.price)}</b><button class="btn sm ghost" data-act="cart-del" data-key="${c.key}">🗑</button></div></div>`
      : `<div class="row between"><div><b>${it.emoji} ${esc(it.name)}</b>${c.size ? `<div class="small muted">Talla ${esc(c.size)}</div>` : ''}</div><div class="row"><span class="qty"><button data-act="qty" data-key="${c.key}" data-d="-1">−</button><b>${c.qty}</b><button data-act="qty" data-key="${c.key}" data-d="1">+</button></span><b style="min-width:90px;text-align:right">${money(it.price * c.qty)}</b></div></div>`).join('')}</div></div>`; }).join('')}
    <a href="#/tiendas" class="small">← Seguir comprando</a></div>
  <div class="card summary"><h2>Resumen</h2>
    ${t.hasGoods ? `<div class="banner" style="margin-bottom:12px">🎁 Cupón <b>PRIMERA10</b>: 10 % en productos.</div><div class="row"><input id="coupon" placeholder="Cupón" value="${esc(S.coupon)}"><button class="btn sm ghost" data-act="coupon">Aplicar</button></div>` : ''}
    <div class="sumrow"><span>Productos</span><b>${money(t.goods)}</b></div><div class="sumrow"><span>Citas</span><b>${money(t.services)}</b></div>
    ${t.discount ? `<div class="sumrow" style="color:var(--ok)"><span>Descuento</span><b>−${money(t.discount)}</b></div>` : ''}
    <div class="sumrow total"><span>Total</span><span class="kpi">${money(t.total)}</span></div>
    <a class="btn gold big" style="width:100%;text-align:center;display:block;text-decoration:none" href="#/pago">Ir a pagar →</a>
    </div></div>`;
}
const STAGES = ['Confirmado', 'Preparando', 'En camino', 'Entregado'];
function orderStage(o) {
  if (!o.delivery) return 1;
  const t = todayISO(), d = o.delivery.date;
  return d < t ? 4 : d === t ? 3 : d === addDays(t, 1) ? 2 : 1;
}
function orderCard(o) {
  const stg = orderStage(o), st = storeById(o.storeId);
  return `<article class="order"><div class="row between wrap"><div><span class="eyebrow">PEDIDO</span><h3>N.º ${esc(o.code)}</h3><div class="small muted">${fmtDT(o.at)} · ${st ? st.emoji : ''} ${esc(o.storeName)}</div></div>
    <div class="col-end"><span class="pill ${stg === 4 ? 'ok' : 'gold'}">${STAGES[stg - 1]}</span><b class="price">${money(o.total)}</b></div></div>
    <div class="track4">${STAGES.map((s, i) => `<div class="${i < stg ? 'on' : ''}"><i>${i < stg ? '✔' : i + 1}</i><span>${s}</span></div>`).join('')}</div>
    <div class="list small">${o.items.map((i) => `<div class="row between"><span>${i.qty}× ${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ''}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}</div>
    ${o.discount ? `<div class="small" style="color:var(--ok)">Descuento ${esc(o.coupon)}: −${money(o.discount)}</div>` : ''}
    ${o.delivery ? `<div class="small muted" style="margin-top:8px">📍 ${esc(o.delivery.address)}, ${esc(o.delivery.city)} · 📅 ${longDate(o.delivery.date)} · 🕒 ${esc(o.delivery.slot)}</div>` : ''}
    <div class="small muted">💳 ${esc(PAY[o.payMethod]?.[1] || o.payMethod)} · ${esc(o.payStatus)}</div></article>`;
}
function vPedidos() {
  const orders = S.orders, appts = S.appointments;
  return `${cartTabs('pedidos')}
  ${orders.length ? `<div class="orders">${orders.map(orderCard).join('')}</div>` : `<div class="card empty"><div class="big wiggle">📦</div><h2>Aún no tienes pedidos</h2><p>Cuando pagues, tus pedidos aparecerán aquí con su número.</p><a class="btn gold" href="#/tiendas">Ir a las tiendas</a></div>`}
  ${appts.length ? `<div class="card" style="margin-top:16px"><div class="row between wrap"><h2 style="margin:0">Citas pagadas</h2><a class="small" href="#/salud">Ver en Salud →</a></div><div class="list">${appts.map(apptCard).join('')}</div></div>` : ''}`;
}

/* ---------- Pago (otra interfaz con pasos) */
function stepper(step) {
  const s = ['Datos', 'Pago', 'Listo'];
  return `<div class="stepper">${s.map((l, i) => `<div class="st ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}"><i>${step > i + 1 ? '✔' : i + 1}</i><span>${l}</span></div>`).join('<div class="bar"></div>')}</div>`;
}
function vPago() {
  const co = S.co, t = cartTotals();
  if (co.step === 3 && co.result) return pagoOk(co.result);
  const groups = cartGroups();
  const services = S.cart.filter((c) => c.kind === 'service');
  const min = addDays(todayISO(), 1);
  if (co.step === 1) {
    const d = co.delivery;
    return `${stepper(1)}<form data-form="co1" class="grid cartgrid">
    <div>${t.hasGoods ? `<div class="card" style="margin-bottom:16px"><h2>📦 Entrega de tus productos</h2>
      <label>Dirección</label><input name="address" required minlength="5" maxlength="120" value="${esc(d.address)}" placeholder="Ej: Calle 5 # 38-20, Apto 301">
      <div class="grid g2"><div><label>Ciudad</label><input name="city" required maxlength="40" value="${esc(d.city)}"></div><div><label>Teléfono de contacto</label><input name="phone" required maxlength="20" value="${esc(d.phone)}" placeholder="Ej: 323 458 7897"></div></div>
      <label>Barrio / referencia</label><input name="ref" maxlength="120" value="${esc(d.ref)}" placeholder="Ej: Barrio San Fernando, portería azul">
      <label>Día de entrega</label><input name="date" type="date" required min="${min}" max="${addDays(todayISO(), 21)}" value="${esc(d.date)}">
      <label>Franja horaria</label><div class="radios">${S.deliverySlots.map((sl) => `<label class="rad"><input type="radio" name="slot" value="${esc(sl)}" ${d.slot === sl ? 'checked' : ''} required><span>🕒 ${esc(sl)}</span></label>`).join('')}</div>
      <label>Indicaciones para el domiciliario (opcional)</label><textarea name="notes" rows="2" maxlength="160">${esc(d.notes)}</textarea></div>` : ''}
    ${services.length ? `<div class="card"><h2>📅 Tus citas</h2><div class="list">${services.map((c) => { const it = itemById(c.id); return `<div><b>${it.emoji} ${esc(it.name)}</b><div class="small muted">${esc(storeById(it.store).name)} · 🐾 ${esc(S.pets.find((p) => p.id === c.petId)?.name || '')} · ${longDate(c.date)} · ${hhmm12(c.time)}</div></div>`; }).join('')}</div>
      <label class="check"><input type="checkbox" name="share" ${co.share ? 'checked' : ''}><span>Compartir con el aliado la ficha de la mascota, su historia clínica y su carnet de vacunas (si los cargaste).</span></label></div>` : ''}</div>
    ${paySide(t, 'Continuar al pago →')}</form>`;
  }
  return `${stepper(2)}<form data-form="co2" class="grid cartgrid">
    <div class="card"><h2>💳 Método de pago</h2><div class="paygrid">${Object.entries(PAY).filter(([k]) => !(k === 'contraentrega' && t.hasServices)).map(([k, [e, l]]) => `<label class="rad pay"><input type="radio" name="method" value="${k}" ${co.method === k ? 'checked' : ''}><span><b>${e}</b> ${l}</span></label>`).join('')}</div>
      ${t.hasServices ? '<p class="small muted">Las citas se pagan en línea.</p>' : ''}
      <div class="note" style="margin-top:14px">🔒 PetZen no pide ni guarda datos de tarjetas ni de cuentas bancarias.</div>
      <div class="row" style="margin-top:16px"><button type="button" class="btn ghost" data-act="co-back">← Volver</button></div></div>
    ${paySide(t, co.busy ? 'Procesando…' : `Pagar ${money(t.total)}`)}</form>
    ${co.busy ? `<div class="paying"><div class="track"><span class="dogrun">🐕💨</span></div><b>Procesando tu pago…</b></div>` : ''}`;
}
function paySide(t, label) {
  return `<div class="card summary"><h2>Tu pedido</h2>${S.cart.map((c) => { const it = itemById(c.id); if (!it) return ''; return `<div class="sumrow small"><span>${it.emoji} ${esc(it.name)}${c.kind === 'service' ? '' : ' ×' + c.qty}</span><b>${money(it.price * (c.kind === 'service' ? 1 : c.qty))}</b></div>`; }).join('')}
    ${t.discount ? `<div class="sumrow" style="color:var(--ok)"><span>Descuento</span><b>−${money(t.discount)}</b></div>` : ''}
    <div class="sumrow total"><span>Total</span><span class="kpi">${money(t.total)}</span></div>
    <button class="btn gold big" style="width:100%" ${S.co.busy ? 'disabled' : ''}>${label}</button></div>`;
}
function pagoOk(r) {
  return `${stepper(4)}<div class="okhead"><div class="okcheck">✔</div><h2>¡Todo listo!</h2><p class="muted">Pago confirmado por ${money(r.total)}. Guau 🐶🎉</p></div>
  ${r.appointments.map((a) => `<div class="card okcard" style="--c:#1C8C7A"><div class="pill ok">✔ Cita agendada</div><h3>${esc(a.serviceName)}</h3><div class="bigdate"><div><span>📅 Día</span><b>${longDate(a.date)}</b></div><div><span>🕒 Hora</span><b>${hhmm12(a.time)}</b></div><div><span>🐾 Mascota</span><b>${esc(a.petName)}</b></div><div><span>📍 Lugar</span><b>${esc(a.storeName)}</b></div></div>
    ${a.sharedDocs.length ? `<p class="small muted">📎 Compartido con el aliado: ${a.sharedDocs.map(esc).join(', ')}</p>` : '<p class="small muted">No se compartieron documentos.</p>'}
    <p class="small">Llega 10 minutos antes. Código: <b>${esc(a.code)}</b>. Te creamos un recordatorio.</p></div>`).join('')}
  ${r.orders.map((o) => `<div class="card okcard" style="--c:#D86F2B"><div class="pill ok">✔ Pedido confirmado</div><h3>${esc(o.storeName)}</h3><div class="bigdate"><div><span>📅 Día de entrega</span><b>${longDate(o.delivery.date)}</b></div><div><span>🕒 Franja</span><b>${esc(o.delivery.slot)}</b></div><div><span>📍 Dirección</span><b>${esc(o.delivery.address)}, ${esc(o.delivery.city)}</b></div><div><span>💳 Pago</span><b>${esc(o.payStatus)}</b></div></div>
    <p class="small muted">${o.items.map((i) => `${i.qty}× ${esc(i.name)}${i.size ? ' (' + esc(i.size) + ')' : ''}`).join(' · ')}</p><p class="small">Número de pedido: <b>${esc(o.code)}</b></p></div>`).join('')}
  <div class="row wrap" style="margin-top:8px">${r.orders.length ? '<a class="btn gold" href="#/pedidos">Ver mis pedidos</a>' : ''}${r.appointments.length ? `<a class="btn ${r.orders.length ? 'ghost' : 'gold'}" href="#/salud">Ver mis citas</a>` : ''}<a class="btn ghost" href="#/tiendas">Seguir comprando</a><a class="btn ghost" href="#/inicio">Ir al inicio</a></div>`;
}

/* ---------- Historial de actividad */
const ACT_ICON = { cuenta: '👤', mascota: '🐾', documento: '📎', comedero: '🍽️', recordatorio: '⏰', cita: '🩺', pedido: '📦', comida: '🥣' };
const ACT_FILTERS = [['todo', 'Todo'], ['pedido', 'Pedidos'], ['cita', 'Citas'], ['comedero', 'Comedero'], ['mascota', 'Mascotas'], ['documento', 'Documentos'], ['recordatorio', 'Recordatorios'], ['cuenta', 'Cuenta']];
function vHistorial() {
  const flt = S.actFilter || 'todo';
  const meals = S.logs.filter((l) => l.status === 'dispensado').map((l) => ({ id: 'l' + l.id, at: l.doneAt || l.at, type: 'comedero', icon: 'comida', text: `${l.petName} comió ${l.grams} g (${l.source === 'horario' ? 'horario automático' : 'dispensado desde la app'}).` }));
  const all = [...S.activity, ...meals].sort((a, b) => b.at.localeCompare(a.at));
  const list = (flt === 'todo' ? all : all.filter((x) => x.type === flt)).slice(0, 200);
  const label = (iso) => { const k = todayKey(iso); return k === todayISO() ? 'Hoy' : k === addDays(todayISO(), -1) ? 'Ayer' : longDate(k); };
  const days = []; for (const x of list) { const l = label(x.at); const last = days[days.length - 1]; if (last && last.l === l) last.rows.push(x); else days.push({ l, rows: [x] }); }
  return `<div class="card"><div class="row between wrap"><div><span class="eyebrow">TU ACTIVIDAD</span><h2 style="margin:0">Lo que has hecho en PetZen</h2></div><span class="pill">${list.length} registro(s)</span></div>
    <div class="fchips" style="margin:14px 0">${ACT_FILTERS.map(([k, l]) => `<button type="button" class="fchip ${flt === k ? 'on' : ''}" data-act="act-filter" data-v="${k}">${l}</button>`).join('')}</div>
    ${days.length ? days.map((d) => `<div class="tl"><h4>${d.l}</h4>${d.rows.map((x) => `<div class="tlrow"><span class="tlic t-${esc(x.type)}">${ACT_ICON[x.icon || x.type] || '•'}</span><div class="grow">${esc(x.text)}<div class="small muted">🕒 ${fmtTime(x.at)}</div></div></div>`).join('')}</div>`).join('') : '<div class="empty"><div class="big wiggle">🕘</div>Todavía no hay actividad en esta categoría.</div>'}</div>`;
}

/* ---------- Perfil */
function vPerfil() {
  const u = S.user;
  return `<div class="grid g2">
    <div class="card"><div class="row"><div class="avatar">👤</div><div><h3 style="margin:0">${esc(u.name)}</h3><div class="small muted">${esc(u.email)}</div><div class="small muted">Cuenta creada el ${fmtDate(u.createdAt)}</div></div></div>
      <div class="row wrap" style="margin-top:16px"><button class="btn sm ghost" data-act="theme">🌓 Cambiar tema</button><button class="btn sm ghost" data-act="logout">Cerrar sesión</button></div></div>
    <div class="card"><h2>Contacto PetZen</h2>
      <div class="list small"><div>📞 WhatsApp / teléfono: <b>323 458 7897</b></div><div>✉️ <b>PetZenOficial@gmail.com</b></div><div>🌐 <b>www.petzen.com</b></div><div>📍 <b>Cali, Colombia</b></div></div></div>
    <div class="card"><h2>📥 Descargar mis datos</h2>
      <p class="small muted">Mascotas, documentos, horarios, comidas, recordatorios, citas y pedidos.</p>
      <div class="row wrap"><button class="btn sm gold" data-act="export" data-f="word">📄 Word (.docx)</button><button class="btn sm gold" data-act="export" data-f="excel">📊 Excel (.xlsx)</button></div></div>
    <div class="card"><h2>🔐 Tus datos y derechos</h2>
      <p class="small muted">Según la Ley 1581 de 2012 puedes conocer, actualizar, rectificar y suprimir tus datos. Consentimiento otorgado el ${fmtDate(u.consentAt)}.</p>
      <div class="row wrap"><button class="btn sm ghost" data-act="legal">Política de datos</button><button class="btn sm danger" data-act="del-account">Eliminar mi cuenta</button></div></div>
    <div class="card" style="grid-column:1/-1"><h2>Aviso importante</h2><p class="small">PetZen es una herramienta de apoyo. Las recomendaciones de alimentación son estimaciones y <b>no reemplazan al veterinario</b>. Ante cualquier síntoma o duda sobre la salud de tu mascota, consulta a un profesional.</p></div>
  </div>`;
}

/* ============================================================ modal */
function openModal(html) { const m = $('#modal'); m.innerHTML = html; if (!m.open) m.showModal(); }
function closeModal() { const m = $('#modal'); if (m.open) m.close(); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

function legalHTML() {
  return `<div class="in"><h2>Política de tratamiento de datos</h2><div class="small" style="line-height:1.6">
  <p><b>Responsable:</b> PetZen, Cali (Colombia). Contacto: PetZenOficial@gmail.com.</p>
  <p><b>Datos que tratamos:</b> nombre y correo del titular; datos de tu mascota (características, historia clínica y carnet que decidas cargar) y del uso del comedero; datos de entrega y de citas.</p>
  <p><b>Finalidad:</b> prestar el servicio (rutinas, recordatorios, recomendaciones, citas, pedidos y control del comedero). Los documentos de salud solo se comparten con un aliado cuando tú lo autorizas al agendar.</p>
  <p><b>Tus derechos (Ley 1581 de 2012):</b> conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización. Puedes descargar o eliminar tus datos desde <i>Perfil</i> o escribiéndonos.</p>
  <p><b>Seguridad:</b> las contraseñas se guardan cifradas (scrypt) y la sesión usa un token firmado.</p>
  </div>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn gold" data-act="close">Entendido</button></div></div>`;
}

/* ---------- reserva de cita (modal) */
let B = null;
function bookModal(it) {
  const pets = S.pets;
  if (!pets.length) { openModal(`<div class="in"><h2>Primero agrega una mascota</h2><p>Para agendar necesitamos saber para quién es la cita.</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="close">Cerrar</button><button class="btn gold" data-act="pet-new">Agregar mascota</button></div></div>`); return; }
  B = { item: it, petId: currentPet().id, date: '', time: '', urgent: false };
  const st = storeById(it.store);
  openModal(`<div class="in"><h2>${it.emoji} ${esc(it.name)}</h2><div class="small muted">${esc(st.name)} · ${money(it.price)}</div>
  ${st.id === 'clinica' ? `<label class="check urgchk"><input type="checkbox" data-act="urgent"><span><b>Es una urgencia</b> (riesgo para su vida o mucho dolor)</span></label>` : ''}
  <div id="urgbox" class="hidden"><div class="card urgent" style="margin:10px 0"><h3 style="color:#fff">No esperes a una cita 🚨</h3><p class="small" style="margin:0 0 10px">Llama ahora a una veterinaria 24/7. Estas son señales de urgencia:</p><ul class="signs light">${URGENT_SIGNS.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${callBtn(true)}</div></div>
  <div id="bookbody">
  <label>¿Para quién es?</label><select id="bk-pet" data-act="bk-pet">${pets.map((p) => `<option value="${p.id}" ${p.id === B.petId ? 'selected' : ''}>${petEmoji(p)} ${esc(p.name)}</option>`).join('')}</select>
  <label>Día</label><input id="bk-date" type="date" data-act="bk-date" min="${todayISO()}" max="${addDays(todayISO(), 60)}">
  <label>Hora disponible</label><div id="slots" class="slots"><span class="small muted">Elige un día para ver los horarios.</span></div>
  <label>Motivo (opcional)</label><textarea id="bk-reason" rows="2" maxlength="200" placeholder="Cuéntale al veterinario qué necesitas…"></textarea>
  <div id="docnote" class="note" style="margin-top:12px"></div>
  <div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn gold" id="bk-add" data-act="bk-add" disabled>Agregar al carrito</button></div></div></div>`);
  docNote();
}
async function docNote() {
  const n = $('#docnote'); if (!n || !B) return;
  try {
    const docs = await api(`/pets/${B.petId}/docs`);
    const h = docs.filter((d) => d.kind === 'historia').length, c = docs.filter((d) => d.kind === 'carnet').length;
    n.innerHTML = h || c ? `📎 Con tu permiso compartiremos con el aliado: ficha de la mascota${h ? ', historia clínica' : ''}${c ? ', carnet de vacunas' : ''}.` : `📋 Aún no cargaste historia clínica ni carnet. <a href="#/ficha/${B.petId}" data-act="close">Súbelos en la ficha</a> para facilitar la cita.`;
  } catch {}
}
function bkEnable(on) { for (const id of ['#bk-add', '#bk-pay']) { const b = $(id); if (b) b.disabled = !on; } }
async function loadSlots() {
  const box = $('#slots'); if (!box || !B.date) return;
  B.time = ''; bkEnable(false);
  box.innerHTML = '<span class="small muted">Buscando horarios…</span>';
  try {
    const r = await api(`/slots?store=${B.item.store}&date=${B.date}`);
    box.innerHTML = r.slots.length ? r.slots.map((t) => `<button type="button" class="slot" data-act="pick-slot" data-t="${t}">${hhmm12(t)}</button>`).join('') : '<span class="small" style="color:var(--bad)">No hay horarios ese día (los domingos no hay agenda). Prueba otra fecha.</span>';
  } catch (e) { box.innerHTML = `<span class="small" style="color:var(--bad)">${esc(e.message)}</span>`; }
}
function sizeModal(it) {
  openModal(`<div class="in"><h2>${it.emoji} ${esc(it.name)}</h2><p class="muted small">Elige la talla de tu mascota.</p><div class="slots">${it.sizes.map((s) => `<button class="slot" data-act="add-size" data-id="${it.id}" data-size="${s}">${s}</button>`).join('')}</div></div>`);
}
function addToCart(id, size) {
  const key = 'p:' + id + ':' + (size || '');
  const ex = S.cart.find((c) => c.key === key);
  if (ex) ex.qty = Math.min(20, ex.qty + 1); else S.cart.push({ key, kind: 'product', id, size: size || '', qty: 1 });
  saveCart(); toast('Agregado al carrito 🛒', 'ok'); render();
}

/* ============================================================ eventos */
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const kind = f.dataset.form, fd = new FormData(f), obj = Object.fromEntries(fd);
  const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  try {
    if (kind === 'login' || kind === 'register') {
      const body = kind === 'register' ? { ...obj, consent: !!obj.consent } : obj;
      const r = await api('/' + kind, { method: 'POST', body });
      S.token = r.token; store.set('pz_token', r.token);
      await loadAll(); toast(kind === 'register' ? '¡Cuenta creada! Bienvenida 🐾' : 'Hola de nuevo 🐾', 'ok');
      location.hash = '#/inicio'; route();
    } else if (kind === 'pet') {
      const body = { ...obj, allergies: fd.getAll('allergies'), neutered: !!obj.neutered, microchip: !!obj.microchip };
      const id = f.dataset.id;
      const pet = await api(id ? '/pets/' + id : '/pets', { method: id ? 'PUT' : 'POST', body });
      S.pets = await api('/pets'); if (!id || !S.petId) { S.petId = pet.id; store.set('pz_pet', S.petId); }
      closeModal(); toast('Mascota guardada ✔', 'ok'); render();
    } else if (kind === 'sched') {
      await api('/schedules', { method: 'POST', body: obj });
      S.schedules = await api('/schedules'); closeModal(); toast('Horario creado ✔', 'ok'); render();
    } else if (kind === 'rem') {
      await api('/reminders', { method: 'POST', body: { ...obj, when: new Date(obj.when).toISOString() } });
      S.reminders = await api('/reminders'); closeModal(); toast('Recordatorio creado ✔', 'ok'); render();
    } else if (kind === 'vet') {
      S.vet247 = await api('/vet247', { method: 'PUT', body: obj }); closeModal(); toast('Guardado ✔', 'ok'); render();
    } else if (kind === 'delacc') {
      await api('/account', { method: 'DELETE', body: obj });
      closeModal(); logout(true); toast('Cuenta eliminada.');
    } else if (kind === 'co1') {
      if (cartTotals().hasGoods) {
        S.co.delivery = { address: obj.address, city: obj.city, ref: obj.ref || '', phone: obj.phone, date: obj.date, slot: obj.slot || '', notes: obj.notes || '' };
        store.set('pz_delivery', S.co.delivery);
        if (!S.co.delivery.slot) throw new Error('Elige la franja horaria de entrega.');
      }
      S.co.share = !!obj.share || !S.cart.some((c) => c.kind === 'service');
      S.co.step = 2; render(); window.scrollTo({ top: 0 });
    } else if (kind === 'co2') {
      S.co.method = obj.method || S.co.method; S.co.busy = true; render();
      const started = Date.now();
      try {
        const r = await api('/checkout', { method: 'POST', body: {
          items: S.cart.map((c) => ({ kind: c.kind, id: c.id, qty: c.qty, size: c.size, petId: c.petId, date: c.date, time: c.time, reason: c.reason })),
          delivery: cartTotals().hasGoods ? S.co.delivery : null, payMethod: S.co.method, coupon: S.coupon, shareDocs: S.co.share } });
        await new Promise((ok) => setTimeout(ok, Math.max(0, 1800 - (Date.now() - started))));
        S.co.result = r; S.co.step = 3; S.co.busy = false;
        S.cart = []; S.coupon = ''; saveCart(); store.set('pz_coupon', '');
        const [orders, appts, reminders] = await Promise.all([api('/orders'), api('/appointments'), api('/reminders')]);
        S.orders = orders; S.appointments = appts; S.reminders = reminders;
        render(); confetti(); window.scrollTo({ top: 0 });
        say('pago', false, r.appointments.length ? '¡Listo! Tu cita quedó agendada 🎉 La encuentras en Salud → Citas.' : '¡Listo! Tu pedido quedó confirmado 🎉');
      } catch (err) { S.co.busy = false; render(); throw err; }
    }
  } catch (err) { toast(err.message, 'err'); if (btn) btn.disabled = false; }
});

document.addEventListener('input', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act; if (!['shop-q', 'shop-min', 'shop-max'].includes(a)) return;
  const f = flt(t.dataset.store);
  if (a === 'shop-q') f.q = t.value; else if (a === 'shop-min') f.min = t.value === '' ? '' : String(Math.max(0, +t.value)); else f.max = t.value === '' ? '' : String(Math.max(0, +t.value));
  refreshShop(t.dataset.store, false);
});

document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  try {
    if (a === 'sched-toggle') { await api('/schedules/' + t.dataset.id, { method: 'PATCH', body: { enabled: t.checked } }); S.schedules = await api('/schedules'); }
    else if (a === 'rem-done') { await api('/reminders/' + t.dataset.id, { method: 'PATCH', body: { done: t.checked } }); S.reminders = await api('/reminders'); render(); }
    else if (a === 'kcal') { store.set('pz_kcal', Math.min(600, Math.max(200, Number(t.value) || 350))); render(); }
    else if (a === 'sim') { S.sim = t.checked; if (S.sim) simLoop(); toast(S.sim ? 'Comedero virtual encendido' : 'Comedero virtual apagado'); }
    else if (a === 'birth') { if (t.value) { const y = Math.max(0, Math.floor((Date.now() - Date.parse(t.value)) / (365.2425 * 864e5))); $('#ageYears').value = y; } }
    else if (a === 'species') { $('#breed').innerHTML = opts(t.value === 'gato' ? CAT_BREEDS : DOG_BREEDS); }
    else if (a === 'shop-sort') { flt(t.dataset.store).sort = t.value; refreshShop(t.dataset.store, false); }
    else if (a === 'bk-pet') { B.petId = t.value; docNote(); const m = $('#medsum'); if (m) m.innerHTML = medSummary(S.pets.find((p) => p.id === t.value)); }
    else if (a === 'bk-svc') { B.item = itemById(t.value); const pr = $('#bk-price'); if (pr) pr.textContent = money(B.item.price); }
    else if (a === 'bk-date') { B.date = t.value; loadSlots(); }
    else if (a === 'urgent') { B.urgent = t.checked; $('#urgbox').classList.toggle('hidden', !t.checked); $('#bookbody').classList.toggle('hidden', t.checked); }
    else if (a === 'upload') {
      const file = t.files[0]; if (!file) return;
      if (file.size > 6 * 1024 * 1024) throw new Error('El archivo supera 6 MB.');
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
      await api(`/pets/${t.dataset.pet}/docs`, { method: 'POST', body: { kind: t.dataset.kind, name: file.name, data } });
      S.docs = await api(`/pets/${t.dataset.pet}/docs`); toast('Archivo subido ✔', 'ok'); render();
    }
  } catch (err) { toast(err.message, 'err'); }
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  const a = t.dataset.act, id = t.dataset.id;
  if (['legal', 'more', 'goto-rem', 'goto-urg'].includes(a)) e.preventDefault();
  try {
    switch (a) {
      case 'zen': say(S.token && S.user ? S.route : 'auth', true); break;
      case 'tab': S.authTab = t.dataset.v; render(); break;
      case 'legal': openModal(legalHTML()); break;
      case 'close': closeModal(); break;
      case 'more': openModal(`<div class="in"><h2>Más opciones</h2><div class="morelist">${NAV.filter((n) => ['alimentacion', 'comedero', 'historial', 'perfil'].includes(n[0])).map(([k, i, l]) => `<a href="#/${k}" data-act="close"><span>${i}</span>${l}</a>`).join('')}</div></div>`); break;
      case 'goto-rem': S.saludTab = 'rem'; go('salud'); break;
      case 'goto-urg': S.saludTab = 'urg'; go('salud'); break;
      case 'logout': logout(); break;
      case 'theme': { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('pz_theme', nx); break; }
      case 'pick-pet': S.petId = id; store.set('pz_pet', id); render(); break;
      case 'pet-new': closeModal(); openModal(petForm()); break;
      case 'pet-edit': openModal(petForm(S.pets.find((p) => p.id === id))); break;
      case 'pet-del': if (confirm('¿Eliminar esta mascota, sus horarios y sus documentos?')) { await api('/pets/' + id, { method: 'DELETE' }); await loadAll(); toast('Mascota eliminada'); location.hash = '#/mascotas'; render(); } break;
      case 'ficha-tab': S.fichaTab = t.dataset.v; render(); break;
      case 'doc-open': await download('/docs/' + id); break;
      case 'doc-del': if (confirm('¿Eliminar este archivo?')) { await api('/docs/' + id, { method: 'DELETE' }); S.docs = await api(`/pets/${S.petId}/docs`); render(); } break;
      case 'salud-tab': S.saludTab = t.dataset.v; render(); break;
      case 'appt-cancel': if (confirm('¿Cancelar esta cita?')) { await api('/appointments/' + id, { method: 'PATCH' }); S.appointments = await api('/appointments'); S.reminders = await api('/reminders'); toast('Cita cancelada'); render(); } break;
      case 'vet-set': openModal(`<div class="in"><h2>Mi veterinaria 24/7</h2><p class="small muted">Guarda la veterinaria de urgencias de tu confianza para llamar con un toque.</p><form data-form="vet"><label>Nombre</label><input name="name" maxlength="60" value="${esc(S.vet247.name)}" placeholder="Ej: Clínica veterinaria 24 horas"><label>Teléfono</label><input name="phone" required maxlength="20" value="${esc(S.vet247.phone)}" placeholder="Ej: 602 555 0000"><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn gold">Guardar</button></div></form></div>`); break;
      case 'sched-new': openModal(`<div class="in"><h2>Nuevo horario</h2><form data-form="sched"><input type="hidden" name="petId" value="${currentPet().id}"><label>Hora</label><input name="time" type="time" required value="08:00"><label>Porción (g)</label><input name="grams" type="number" min="5" max="1000" required value="${Math.round(nutrition(currentPet(), store.get('pz_kcal', 350)).grams / 2)}"><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn gold">Guardar</button></div></form></div>`); break;
      case 'sched-del': await api('/schedules/' + id, { method: 'DELETE' }); S.schedules = await api('/schedules'); render(); break;
      case 'suggest': {
        const m = +t.dataset.m, p = currentPet(), n = nutrition(p, store.get('pz_kcal', 350));
        const times = { 2: ['07:30', '18:30'], 3: ['07:00', '13:00', '19:00'], 4: ['07:00', '11:30', '15:30', '19:30'] }[m];
        for (const s of S.schedules.filter((x) => x.petId === p.id)) await api('/schedules/' + s.id, { method: 'DELETE' });
        for (const tm of times) await api('/schedules', { method: 'POST', body: { petId: p.id, time: tm, grams: Math.round(n.grams / m) } });
        S.schedules = await api('/schedules'); toast(`Listo: ${m} comidas de ${Math.round(n.grams / m)} g`, 'ok'); render(); break;
      }
      case 'dispense-quick': case 'dispense': {
        const p = currentPet(); if (!p) return;
        const grams = a === 'dispense' ? +$('#grams').value : Math.round(nutrition(p, store.get('pz_kcal', 350)).grams / 3);
        const r = await api('/feeder/dispense', { method: 'POST', body: { petId: p.id, grams } });
        S.logs = await api('/logs'); toast(r.deviceOnline ? 'Orden enviada al comedero 🍽️' : 'Orden en espera: el comedero está sin conexión', r.deviceOnline ? 'ok' : ''); render(); break;
      }
      case 'rem-new': openModal(`<div class="in"><h2>Nuevo recordatorio</h2><form data-form="rem"><label>Título</label><input name="title" required maxlength="80" placeholder="Ej: Vacuna antirrábica"><label>Tipo</label><select name="kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select><label>Mascota</label><select name="petId"><option value="">—</option>${S.pets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><label>Fecha y hora</label><input name="when" type="datetime-local" required><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn gold">Guardar</button></div></form></div>`); break;
      case 'rem-del': await api('/reminders/' + id, { method: 'DELETE' }); S.reminders = await api('/reminders'); render(); break;
      case 'sec': S.sec[t.dataset.store] = t.dataset.v; render(); break;
      case 'add': { const it = itemById(id); if (it.sizes) sizeModal(it); else addToCart(id); break; }
      case 'add-size': closeModal(); addToCart(id, t.dataset.size); break;
      case 'book': bookModal(itemById(id)); break;
      case 'pick-slot': B.time = t.dataset.t; document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('on', s === t)); bkEnable(true); break;
      case 'bk-add': case 'bk-pay': {
        if (!B.date || !B.time) return;
        S.cart.push({ key: 's:' + Math.random().toString(36).slice(2), kind: 'service', id: B.item.id, qty: 1, petId: B.petId, date: B.date, time: B.time, reason: $('#bk-reason').value });
        saveCart(); closeModal();
        if (a === 'bk-pay') { go('pago'); break; }
        toast('Cita agregada al carrito 📅', 'ok'); B.time = ''; render(); break;
      }
      case 'goto': go(t.dataset.r); break;
      case 'act-filter': S.actFilter = t.dataset.v; render(); break;
      case 'rem-ok': await api('/reminders/' + id, { method: 'PATCH', body: { done: !!t.dataset.v } }); S.reminders = await api('/reminders'); render(); break;
      case 'pchip': { const f = flt(t.dataset.store); f.min = t.dataset.min === '0' ? '' : t.dataset.min; f.max = t.dataset.max === '0' ? '' : t.dataset.max; refreshShop(t.dataset.store, true); break; }
      case 'pclear': { S.flt[t.dataset.store] = { q: '', min: '', max: '', sort: 'rel' }; S.sec[t.dataset.store] = 'Todo'; render(); break; }
      case 'cart-del': S.cart = S.cart.filter((c) => c.key !== t.dataset.key); saveCart(); render(); break;
      case 'qty': { const c = S.cart.find((x) => x.key === t.dataset.key); if (!c) break; c.qty += +t.dataset.d; if (c.qty <= 0) S.cart = S.cart.filter((x) => x !== c); saveCart(); render(); break; }
      case 'coupon': { const v = $('#coupon').value.trim().toUpperCase(); if (v && v !== 'PRIMERA10') { toast('Cupón no válido', 'err'); break; } S.coupon = v; store.set('pz_coupon', v); toast(v ? 'Cupón aplicado ✔' : 'Cupón quitado', v ? 'ok' : ''); render(); break; }
      case 'co-back': S.co.step = 1; render(); break;
      case 'export': await download('/export/' + t.dataset.f, t.dataset.f === 'word' ? 'mis-datos-petzen.docx' : 'mis-datos-petzen.xlsx'); toast('Descarga lista ✔', 'ok'); break;
      case 'del-account': openModal(`<div class="in"><h2>Eliminar mi cuenta</h2><p class="small">Se borrarán tu cuenta, mascotas, documentos, horarios, historial, citas y pedidos. No se puede deshacer.</p><form data-form="delacc"><label>Confirma tu contraseña</label><input name="password" type="password" required><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="close">Cancelar</button><button class="btn danger">Eliminar definitivamente</button></div></form></div>`); break;
    }
  } catch (err) { toast(err.message, 'err'); }
});

/* ============================================================ comedero virtual (simula el ESP32) */
async function simLoop() {
  if (!S.sim || !S.user) return;
  if (!S.simBusy) {
    S.simBusy = true;
    try {
      const k = encodeURIComponent(S.user.deviceKey);
      const r = await fetch(`/api/device/poll?key=${k}&level=${store.get('pz_level', 80)}&fw=virtual-1.0`).then((x) => x.json());
      if (r.id) {
        await new Promise((ok) => setTimeout(ok, 2500));
        store.set('pz_level', Math.max(5, store.get('pz_level', 80) - Math.ceil(r.grams / 40)));
        await fetch(`/api/device/ack?key=${k}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, ok: true }) });
        poll();
      }
    } catch {}
    S.simBusy = false;
  }
  setTimeout(simLoop, 3000);
}

boot();
