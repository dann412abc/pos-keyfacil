// POS KeyFácil - Lógica del frontend
let CONFIG = {};
let CURRENT_USER = null;
let CARRITO = [];
let PRODUCTOS = [];
let chartVentas = null, chartPagos = null;

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (CONFIG.moneda || 'S/') + ' ' + Number(n || 0).toFixed(2);

// ---------- Utilidades ----------
function toast(msg, tipo = 'exito') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-white font-medium ' +
    (tipo === 'error' ? 'bg-red-500' : tipo === 'info' ? 'bg-sky-500' : 'bg-emerald-500');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2800);
}

function abrirModal(html) {
  $('#modalContent').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function cerrarModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: {'Content-Type': 'application/json'},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { window.location.href = '/login'; return null; }
  return res.json();
}

// ---------- Inicialización ----------
async function init() {
  const me = await api('/api/me');
  CURRENT_USER = me.user;
  if (!CURRENT_USER) { window.location.href = '/login'; return; }

  CONFIG = await api('/api/config');
  aplicarTema();

  $('#userName').textContent = CURRENT_USER.nombre || CURRENT_USER.username;
  $('#userRol').textContent = CURRENT_USER.rol;
  $('#userAvatar').textContent = (CURRENT_USER.nombre || CURRENT_USER.username).charAt(0).toUpperCase();
  $('#brandName').textContent = CONFIG.nombre_negocio || 'POS KeyFácil';
  document.title = CONFIG.nombre_negocio || 'POS KeyFácil';

  const now = new Date();
  $('#currentDate').textContent = now.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Ocultar secciones de admin si no lo es
  if (CURRENT_USER.rol !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  // Navegación
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navegar(btn.dataset.view));
  });

  navegar('dashboard');
  setupOffline();
}

// ---------- Modo Offline ----------
function setupOffline() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/js/sw.js').catch(() => {});
  }
  window.addEventListener('online', () => { actualizarEstadoConexion(); sincronizarPendientes(true); });
  window.addEventListener('offline', actualizarEstadoConexion);
  actualizarEstadoConexion();
  actualizarBadgeSync();
  $('#syncBadge')?.addEventListener('click', () => sincronizarPendientes());
}

function actualizarEstadoConexion() {
  const el = $('#connStatus');
  if (!el) return;
  if (navigator.onLine) {
    el.className = 'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700';
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>En línea';
  } else {
    el.className = 'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700';
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span>Sin conexión (modo offline)';
  }
}

function ventasPendientes() {
  return JSON.parse(localStorage.getItem('offline_sales') || '[]');
}
function guardarVentaOffline(venta) {
  const lista = ventasPendientes();
  venta.offline_id = 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  lista.push(venta);
  localStorage.setItem('offline_sales', JSON.stringify(lista));
  actualizarBadgeSync();
}
function actualizarBadgeSync() {
  const n = ventasPendientes().length;
  const badge = $('#syncBadge');
  if (!badge) return;
  if (n > 0) { badge.classList.remove('hidden'); $('#syncCount').textContent = n; }
  else badge.classList.add('hidden');
}

async function sincronizarPendientes(auto = false) {
  if (!navigator.onLine) return;
  const lista = ventasPendientes();
  if (!lista.length) return;
  if (!auto && !confirm(`Sincronizar ${lista.length} venta(s) pendiente(s)?`)) return;
  const res = await api('/api/ventas/lote', { method: 'POST', body: { ventas: lista } });
  if (res && res.resultados) {
    const okIds = res.resultados.filter(r => r.ok).map(r => r.offline_id);
    const restantes = lista.filter(v => !okIds.includes(v.offline_id));
    localStorage.setItem('offline_sales', JSON.stringify(restantes));
    actualizarBadgeSync();
    toast(`Sincronizadas ${res.sincronizados} de ${lista.length} ventas`);
  }
}

function aplicarTema() {
  const color = CONFIG.color_primario || '#0ea5e9';
  document.documentElement.style.setProperty('--primary', color);
  // Aplicar gradiente a botones primarios activos vía estilo inline
  const style = document.createElement('style');
  style.textContent = `.btn-primary{background:linear-gradient(90deg,${color},#6366f1)!important}
    .nav-btn.active{background:linear-gradient(90deg,${color},#6366f1)!important}`;
  document.head.appendChild(style);
}

function navegar(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const titulos = { dashboard: 'Dashboard', pos: 'Nueva Venta', inventario: 'Inventario',
    ventas: 'Historial de Ventas', reportes: 'Reportes', usuarios: 'Usuarios', config: 'Configuración' };
  $('#pageTitle').textContent = titulos[view] || '';
  const vistas = { dashboard: vistaDashboard, pos: vistaPOS, inventario: vistaInventario,
    ventas: vistaVentas, reportes: vistaReportes, usuarios: vistaUsuarios, config: vistaConfig };
  (vistas[view] || vistaDashboard)();
}

// ============================================================
// DASHBOARD
// ============================================================
async function vistaDashboard() {
  const c = $('#viewContainer');
  c.innerHTML = `<div class="text-center py-20 text-gray-400"><svg class="animate-spin w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Cargando...</div>`;
  const r = await api('/api/reportes/resumen');
  if (!r) return;

  c.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
      <div class="stat-card bg-white rounded-2xl p-5 shadow-sm border-l-4 border-sky-500">
        <p class="text-gray-500 text-sm">Ventas de Hoy</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">${fmt(r.total_hoy)}</p>
        <p class="text-xs text-gray-400 mt-1">${r.num_ventas_hoy} transacciones</p>
      </div>
      <div class="stat-card bg-white rounded-2xl p-5 shadow-sm border-l-4 border-emerald-500">
        <p class="text-gray-500 text-sm">Ventas del Mes</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">${fmt(r.total_mes)}</p>
        <p class="text-xs text-gray-400 mt-1">${r.num_ventas_mes} transacciones</p>
      </div>
      <div class="stat-card bg-white rounded-2xl p-5 shadow-sm border-l-4 border-amber-500">
        <p class="text-gray-500 text-sm">Ticket Promedio</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">${fmt(r.num_ventas_hoy ? r.total_hoy / r.num_ventas_hoy : 0)}</p>
        <p class="text-xs text-gray-400 mt-1">Hoy</p>
      </div>
      <div class="stat-card bg-white rounded-2xl p-5 shadow-sm border-l-4 border-red-500">
        <p class="text-gray-500 text-sm">Productos Bajo Stock</p>
        <p class="text-2xl font-bold text-gray-800 mt-1">${r.bajo_stock.length}</p>
        <p class="text-xs text-gray-400 mt-1">requieren reposición</p>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Ventas últimos 7 días</h3>
        <canvas id="chartVentas" style="height:280px"></canvas>
      </div>
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Métodos de Pago</h3>
        <canvas id="chartPagos" style="height:280px"></canvas>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Top Productos</h3>
        <div class="space-y-2">
          ${r.top_productos.length ? r.top_productos.map((p, i) => `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
              <span class="w-6 h-6 rounded-full bg-sky-100 text-sky-600 text-xs font-bold flex items-center justify-center">${i+1}</span>
              <span class="flex-1 text-sm text-gray-700 truncate">${p.nombre}</span>
              <span class="text-sm font-semibold text-gray-600">${p.cantidad} und</span>
              <span class="text-sm font-bold text-emerald-600">${fmt(p.monto)}</span>
            </div>`).join('') : '<p class="text-gray-400 text-sm text-center py-6">Sin ventas aún</p>'}
        </div>
      </div>
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Alertas de Stock</h3>
        <div class="space-y-2">
          ${r.bajo_stock.length ? r.bajo_stock.map(p => `
            <div class="flex items-center justify-between p-2 rounded-lg low-stock">
              <span class="text-sm font-medium">${p.nombre}</span>
              <span class="text-sm font-bold">Stock: ${p.stock} (mín ${p.stock_minimo})</span>
            </div>`).join('') : '<p class="text-gray-400 text-sm text-center py-6">Todo el stock está en orden</p>'}
        </div>
      </div>
    </div>`;

  // Gráficos
  setTimeout(() => {
    const ctx1 = $('#chartVentas');
    if (ctx1) {
      if (chartVentas) chartVentas.destroy();
      chartVentas = new Chart(ctx1, {
        type: 'bar',
        data: { labels: r.serie_7dias.map(d => d.fecha),
          datasets: [{ label: 'Ventas (S/)', data: r.serie_7dias.map(d => d.total),
            backgroundColor: 'rgba(14,165,233,0.7)', borderRadius: 6 }]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }
    const ctx2 = $('#chartPagos');
    if (ctx2) {
      if (chartPagos) chartPagos.destroy();
      chartPagos = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: r.por_metodo_pago.map(p => p.metodo),
          datasets: [{ data: r.por_metodo_pago.map(p => p.monto),
            backgroundColor: ['#0ea5e9','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'] }]},
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }, 100);
}

// ============================================================
// POS / NUEVA VENTA
// ============================================================
async function vistaPOS() {
  PRODUCTOS = await api('/api/productos');
  const c = $('#viewContainer');
  c.innerHTML = `
    <div class="flex gap-5 h-full" style="min-height:calc(100vh - 140px)">
      <!-- Panel productos -->
      <div class="flex-1 flex flex-col">
        <div class="flex gap-3 mb-4">
          <div class="flex-1 relative">
            <input id="buscarProd" type="text" placeholder="Buscar producto o escanear código de barras..."
              class="w-full px-4 py-3 pl-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent">
            <svg class="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <button id="btnBascula" title="Conectar báscula (puerto serial/USB)" class="px-4 py-3 border-2 border-sky-500 text-sky-600 rounded-xl font-semibold hover:bg-sky-50 transition flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
            Báscula
          </button>
          <select id="filtroCat" class="px-4 py-3 border border-gray-300 rounded-xl bg-white">
            <option value="">Todas las categorías</option>
          </select>
        </div>
        <div id="gridProductos" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 content-start pr-1"></div>
      </div>
      <!-- Carrito -->
      <div class="w-96 bg-white rounded-2xl shadow-lg flex flex-col overflow-hidden flex-shrink-0">
        <div class="p-4 bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
          <h3 class="font-bold text-lg">Carrito de Venta</h3>
          <p class="text-xs opacity-80"><span id="cartCount">0</span> productos</p>
        </div>
        <div id="cartItems" class="flex-1 overflow-y-auto p-3 space-y-2">
          <p class="text-center text-gray-400 text-sm py-10">Agregue productos tocando las tarjetas</p>
        </div>
        <div class="p-4 border-t bg-gray-50 space-y-2">
          <div class="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span id="cartSubtotal">S/ 0.00</span></div>
          <div class="flex justify-between text-sm text-gray-600">
            <span>Descuento</span>
            <input id="cartDescuento" type="number" min="0" value="0" class="w-24 px-2 py-1 border rounded text-right text-sm">
          </div>
          <div class="flex justify-between text-sm text-gray-600"><span>IGV (${CONFIG.igv_porcentaje||18}%)</span><span id="cartIgv">S/ 0.00</span></div>
          <div class="flex justify-between text-xl font-bold text-gray-800 pt-2 border-t"><span>TOTAL</span><span id="cartTotal">S/ 0.00</span></div>
          <button id="btnCheckout" class="btn-primary w-full py-3 rounded-xl font-bold text-white shadow-lg disabled:opacity-40" disabled>
            COBRAR / FINALIZAR VENTA
          </button>
          <button id="btnVaciar" class="w-full py-2 rounded-xl text-gray-500 text-sm hover:bg-gray-200 transition">Vaciar carrito</button>
        </div>
      </div>
    </div>`;

  // Cargar categorías en filtro
  const cats = await api('/api/categorias');
  const sel = $('#filtroCat');
  cats.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; sel.appendChild(o); });

  renderizarProductos(PRODUCTOS);

  $('#buscarProd').addEventListener('input', (e) => filtrarProductos());
  $('#filtroCat').addEventListener('change', filtrarProductos);
  $('#cartDescuento').addEventListener('input', actualizarCarrito);
  $('#btnVaciar').addEventListener('click', () => { CARRITO = []; renderizarCarrito(); });
  $('#btnCheckout').addEventListener('click', modalCheckout);
  $('#btnBascula').addEventListener('click', conectarBascula);

  // Escaneo de código de barras: detectar Enter en el buscador
  $('#buscarProd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cod = e.target.value.trim();
      const p = PRODUCTOS.find(x => x.codigo === cod);
      if (p) { agregarAlCarrito(p); e.target.value = ''; }
    }
  });
}

function filtrarProductos() {
  const q = $('#buscarProd').value.toLowerCase();
  const cat = $('#filtroCat').value;
  let lista = PRODUCTOS.filter(p =>
    (!q || p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)) &&
    (!cat || String(p.categoria_id) === cat));
  renderizarProductos(lista);
}

function renderizarProductos(lista) {
  const grid = $('#gridProductos');
  if (!lista.length) { grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-10">No se encontraron productos</p>'; return; }
  grid.innerHTML = lista.map(p => `
    <div class="product-card bg-white rounded-xl p-3 border-2 border-transparent shadow-sm" data-id="${p.id}">
      <div class="flex justify-between items-start mb-2">
        <span class="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">${p.categoria}</span>
        ${p.unidad === 'kg' ? '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">x kg</span>' : ''}
        ${p.stock <= p.stock_minimo ? '<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Bajo</span>' : ''}
      </div>
      <p class="font-semibold text-gray-800 text-sm leading-tight mb-1 truncate">${p.nombre}</p>
      <p class="text-xs text-gray-400 mb-2">Cod: ${p.codigo} · ${p.unidad === 'kg' ? 'Precio/kg' : 'Stock: ' + p.stock}</p>
      <p class="text-lg font-bold text-sky-600">${fmt(p.precio_venta)}${p.unidad === 'kg' ? '/kg' : ''}</p>
    </div>`).join('');
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = PRODUCTOS.find(x => x.id == card.dataset.id);
      agregarAlCarrito(p);
    });
  });
}

function agregarAlCarrito(p) {
  if (!p || p.stock <= 0) { toast('Producto sin stock', 'error'); return; }
  if (p.unidad === 'kg') { modalPesoKg(p); return; }
  const existente = CARRITO.find(x => x.id === p.id);
  if (existente) {
    if (existente.cantidad >= p.stock) { toast('Stock insuficiente', 'error'); return; }
    existente.cantidad++;
  } else {
    CARRITO.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio_venta, cantidad: 1, unidad: 'unidad' });
  }
  renderizarCarrito();
}

// Modal para pesar productos a granel (kg)
function modalPesoKg(p) {
  abrirModal(`
    <div class="p-6">
      <h3 class="text-xl font-bold text-gray-800 mb-1">${p.nombre}</h3>
      <p class="text-sm text-gray-500 mb-4">Precio: ${fmt(p.precio_venta)} / kg</p>
      <div class="bg-gray-50 rounded-xl p-4 mb-4 text-center">
        <p class="text-xs text-gray-500 mb-1">Peso (kg)</p>
        <input id="pesoKg" type="number" step="0.01" min="0.01" value="0.5" class="text-4xl font-bold text-center w-full bg-transparent border-b-2 border-sky-400 focus:border-sky-600 outline-none py-2">
        <p class="text-lg font-bold text-sky-600 mt-2">Importe: <span id="pesoImporte">${fmt(p.precio_venta * 0.5)}</span></p>
      </div>
      <button id="btnLeerBascula" class="w-full py-3 mb-3 border-2 border-sky-500 text-sky-600 rounded-xl font-semibold hover:bg-sky-50 transition">
        Leer peso desde báscula
      </button>
      <div class="flex gap-3">
        <button onclick="cerrarModal()" class="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button id="btnAgregarKg" class="btn-primary flex-1 py-3 rounded-xl font-bold text-white">Agregar al carrito</button>
      </div>
    </div>`);
  const input = $('#pesoKg');
  input.addEventListener('input', () => {
    $('#pesoImporte').textContent = fmt(p.precio_venta * Number(input.value || 0));
  });
  input.focus(); input.select();
  $('#btnLeerBascula').addEventListener('click', async () => {
    const peso = await leerPesoBascula();
    if (peso > 0) { input.value = peso.toFixed(3); $('#pesoImporte').textContent = fmt(p.precio_venta * peso); }
  });
  $('#btnAgregarKg').addEventListener('click', () => {
    const peso = Number(input.value);
    if (peso <= 0) { toast('Ingrese un peso válido', 'error'); return; }
    const existente = CARRITO.find(x => x.id === p.id);
    if (existente) existente.cantidad = Number((existente.cantidad + peso).toFixed(3));
    else CARRITO.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio_venta, cantidad: peso, unidad: 'kg' });
    cerrarModal();
    renderizarCarrito();
    toast(`${peso.toFixed(3)} kg agregado`);
  });
}

// Conexión a báscula por puerto serial (Web Serial API - Chrome/Edge)
let puertoSerie = null;
async function conectarBascula() {
  if (!('serial' in navigator)) {
    toast('Tu navegador no soporta Web Serial. Usa Chrome/Edge o ingresa peso manualmente', 'info');
    return;
  }
  try {
    puertoSerie = await navigator.serial.requestPort();
    await puertoSerie.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    toast('Báscula conectada. Los productos a granel leerán el peso automáticamente', 'exito');
  } catch (e) {
    if (e.name !== 'NotFoundError') toast('No se pudo conectar: ' + e.message, 'error');
  }
}

async function leerPesoBascula() {
  if (!puertoSerie) { toast('Conecta la báscula primero (botón Báscula)', 'info'); return 0; }
  try {
    const reader = puertoSerie.readable.getReader();
    let buffer = '';
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: undefined, done: true }), 1500))
      ]);
      if (done) break;
      if (value) {
        buffer += new TextDecoder().decode(value);
        const match = buffer.match(/([0-9]*\.?[0-9]+)\s*(kg|KG|g|G)?/);
        if (match) {
          let peso = parseFloat(match[1]);
          if (match[2] && match[2].toUpperCase() === 'G') peso = peso / 1000;
          reader.releaseLock();
          return peso;
        }
      }
    }
    reader.releaseLock();
    toast('No se recibió lectura de la báscula', 'error');
    return 0;
  } catch (e) {
    toast('Error de lectura: ' + e.message, 'error');
    return 0;
  }
}

function renderizarCarrito() {
  const cont = $('#cartItems');
  $('#cartCount').textContent = CARRITO.reduce((s, x) => s + x.cantidad, 0);
  if (!CARRITO.length) {
    cont.innerHTML = '<p class="text-center text-gray-400 text-sm py-10">Agregue productos tocando las tarjetas</p>';
  } else {
    cont.innerHTML = CARRITO.map((x, i) => `
      <div class="cart-item flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 truncate">${x.nombre}</p>
          <p class="text-xs text-gray-500">${fmt(x.precio)} ${x.unidad === 'kg' ? '/kg' : 'c/u'}</p>
        </div>
        <div class="flex items-center gap-1">
          <span class="qty-btn text-gray-500" onclick="cambiarCant(${i},${x.unidad === 'kg' ? '-0.1' : '-1'})">−</span>
          <span class="w-12 text-center text-sm font-bold">${x.unidad === 'kg' ? Number(x.cantidad).toFixed(2) + 'kg' : x.cantidad}</span>
          <span class="qty-btn text-sky-600" onclick="cambiarCant(${i},${x.unidad === 'kg' ? '0.1' : '1'})">+</span>
        </div>
        <span class="text-sm font-bold text-gray-700 w-16 text-right">${fmt(x.precio * x.cantidad)}</span>
        <span class="qty-btn text-red-500" onclick="quitarDelCarrito(${i})">×</span>
      </div>`).join('');
  }
  actualizarCarrito();
}

window.cambiarCant = (i, delta) => {
  CARRITO[i].cantidad = Number((CARRITO[i].cantidad + Number(delta)).toFixed(3));
  if (CARRITO[i].cantidad <= 0) CARRITO.splice(i, 1);
  renderizarCarrito();
};
window.quitarDelCarrito = (i) => { CARRITO.splice(i, 1); renderizarCarrito(); };

function actualizarCarrito() {
  const subtotal = CARRITO.reduce((s, x) => s + x.precio * x.cantidad, 0);
  const descuento = Math.min(Number($('#cartDescuento')?.value || 0), subtotal);
  const igvPct = Number(CONFIG.igv_porcentaje || 18) / 100;
  const base = subtotal - descuento;
  const igv = base * igvPct;
  const total = base + igv;
  if ($('#cartSubtotal')) $('#cartSubtotal').textContent = fmt(subtotal);
  if ($('#cartIgv')) $('#cartIgv').textContent = fmt(igv);
  if ($('#cartTotal')) $('#cartTotal').textContent = fmt(total);
  if ($('#btnCheckout')) $('#btnCheckout').disabled = CARRITO.length === 0;
  return { subtotal, descuento, igv, total };
}

function modalCheckout() {
  const { subtotal, descuento, igv, total } = actualizarCarrito();
  abrirModal(`
    <div class="p-6">
      <h3 class="text-xl font-bold text-gray-800 mb-4">Finalizar Venta</h3>
      <div class="space-y-3 mb-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Comprobante</label>
          <select id="chkComprobante" class="w-full px-3 py-2 border rounded-lg">
            <option>Boleta</option><option>Factura</option><option>Ticket</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <input id="chkCliente" type="text" value="Cliente General" class="w-full px-3 py-2 border rounded-lg">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">DNI / RUC</label>
            <input id="chkDoc" type="text" class="w-full px-3 py-2 border rounded-lg">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
          <div class="grid grid-cols-3 gap-2" id="metodosPago">
            ${['Efectivo','Tarjeta','Yape','Plin','Transferencia','Crédito'].map(m => `
              <label class="cursor-pointer">
                <input type="radio" name="metodo" value="${m}" class="hidden peer" ${m==='Efectivo'?'checked':''}>
                <div class="px-3 py-2 text-center text-sm border-2 rounded-lg peer-checked:border-sky-500 peer-checked:bg-sky-50 peer-checked:text-sky-700 border-gray-200 text-gray-600">${m}</div>
              </label>`).join('')}
          </div>
        </div>
        <div id="montoRecibidoWrap">
          <label class="block text-sm font-medium text-gray-700 mb-1">Monto Recibido (efectivo)</label>
          <input id="chkRecibido" type="number" min="0" step="0.01" class="w-full px-3 py-2 border rounded-lg">
          <p class="text-sm mt-1">Vuelto: <span id="chkVuelto" class="font-bold text-emerald-600">S/ 0.00</span></p>
        </div>
      </div>
      <div class="bg-gray-50 rounded-xl p-4 space-y-1 text-sm mb-5">
        <div class="flex justify-between"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div class="flex justify-between"><span>Descuento</span><span>-${fmt(descuento)}</span></div>
        <div class="flex justify-between"><span>IGV</span><span>${fmt(igv)}</span></div>
        <div class="flex justify-between text-lg font-bold pt-2 border-t"><span>TOTAL</span><span class="text-sky-600">${fmt(total)}</span></div>
      </div>
      <div class="flex gap-3">
        <button onclick="cerrarModal()" class="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button id="btnConfirmarVenta" class="btn-primary flex-1 py-3 rounded-xl font-bold text-white">Confirmar Venta</button>
      </div>
    </div>`);

  const recibido = $('#chkRecibido');
  recibido.addEventListener('input', () => {
    const v = Math.max(0, Number(recibido.value) - total);
    $('#chkVuelto').textContent = fmt(v);
  });
  // Ocultar monto recibido si no es efectivo
  document.querySelectorAll('input[name="metodo"]').forEach(r => r.addEventListener('change', () => {
    $('#montoRecibidoWrap').style.display = r.value === 'Efectivo' && r.checked ? 'block' : 'none';
  }));

  $('#btnConfirmarVenta').addEventListener('click', async () => {
    const metodo = document.querySelector('input[name="metodo"]:checked').value;
    const ventaData = {
      items: CARRITO.map(x => ({ producto_id: x.id, cantidad: x.cantidad, precio_unitario: x.precio })),
      subtotal, igv, descuento, total,
      metodo_pago: metodo,
      tipo_comprobante: $('#chkComprobante').value,
      cliente_nombre: $('#chkCliente').value,
      cliente_doc: $('#chkDoc').value
    };
    if (!navigator.onLine) {
      guardarVentaOffline(ventaData);
      cerrarModal();
      toast('Venta guardada offline. Se sincronizará al recuperar conexión.', 'info');
      CARRITO = [];
      renderizarCarrito();
      return;
    }
    const res = await api('/api/ventas', { method: 'POST', body: ventaData });
    if (res && res.ok) {
      cerrarModal();
      toast('Venta registrada correctamente');
      mostrarTicket(res.venta);
      CARRITO = [];
      PRODUCTOS = await api('/api/productos'); // refrescar stock
      renderizarCarrito();
      renderizarProductos(PRODUCTOS);
    } else {
      toast(res?.error || 'Error al registrar venta', 'error');
    }
  });
}

function mostrarTicket(v) {
  abrirModal(`
    <div class="p-6">
      <div id="ticketPrint" class="max-w-xs mx-auto text-center font-mono text-sm text-gray-800">
        ${CONFIG.logo_url ? `<img src="${CONFIG.logo_url}" class="w-16 h-16 mx-auto mb-2 rounded">` : ''}
        <h3 class="font-bold text-base">${CONFIG.nombre_negocio || 'Mi Tienda'}</h3>
        <p class="text-xs">RUC: ${CONFIG.ruc || ''}</p>
        <p class="text-xs">${CONFIG.direccion || ''}</p>
        <p class="text-xs">Tel: ${CONFIG.telefono || ''}</p>
        <div class="border-t border-dashed my-2"></div>
        <p class="text-xs">${v.tipo_comprobante} N° ${v.numero}</p>
        <p class="text-xs">${v.fecha}</p>
        <p class="text-xs">Cliente: ${v.cliente_nombre} ${v.cliente_doc ? '('+v.cliente_doc+')' : ''}</p>
        <p class="text-xs">Cajero: ${v.cajero}</p>
        <div class="border-t border-dashed my-2"></div>
        <table class="w-full text-xs">
          <thead><tr><th class="text-left">Prod.</th><th>Cant</th><th class="text-right">Total</th></tr></thead>
          <tbody>
            ${v.items.map(i => `<tr><td class="text-left">${i.producto}</td><td class="text-center">${i.cantidad}</td><td class="text-right">${fmt(i.subtotal)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="border-t border-dashed my-2"></div>
        <div class="text-xs space-y-1">
          <div class="flex justify-between"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div>
          <div class="flex justify-between"><span>Descuento</span><span>-${fmt(v.descuento)}</span></div>
          <div class="flex justify-between"><span>IGV</span><span>${fmt(v.igv)}</span></div>
          <div class="flex justify-between font-bold text-base"><span>TOTAL</span><span>${fmt(v.total)}</span></div>
          <div class="flex justify-between"><span>Pago: ${v.metodo_pago}</span></div>
        </div>
        <div class="border-t border-dashed my-2"></div>
        <p class="text-xs">${CONFIG.mensaje_ticket || '¡Gracias por su compra!'}</p>
      </div>
      <div class="flex gap-3 mt-5 flex-wrap">
        <button onclick="cerrarModal()" class="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-600 hover:bg-gray-50 min-w-[100px]">Cerrar</button>
        <button onclick="window.print()" class="btn-primary flex-1 py-3 rounded-xl font-bold text-white min-w-[100px]">Imprimir Ticket</button>
        ${CURRENT_USER && CURRENT_USER.rol === 'admin' ? `
          <button onclick="enviarASunat(${v.id})" class="flex-1 py-3 rounded-xl font-bold text-white min-w-[100px] ${v.estado_electronica === 'aceptado' ? 'bg-emerald-500' : 'bg-indigo-600 hover:opacity-90'}">
            ${v.estado_electronica === 'aceptado' ? '✓ Enviado a SUNAT' : 'Enviar a SUNAT'}
          </button>` : ''}
      </div>
      ${v.enlace_pdf ? `<div class="mt-3 text-center text-xs"><a href="${v.enlace_pdf}" target="_blank" class="text-sky-600 hover:underline">Ver PDF electrónico</a> · <a href="${v.enlace_xml}" target="_blank" class="text-sky-600 hover:underline">XML</a></div>` : ''}
      ${v.sunat_respuesta && v.estado_electronica !== 'aceptado' ? `<p class="mt-2 text-xs text-red-500 text-center">SUNAT: ${v.sunat_respuesta}</p>` : ''}
    </div>`);
}

window.enviarASunat = async (ventaId) => {
  if (!confirm('¿Enviar este comprobante a la SUNAT (facturación electrónica)?')) return;
  toast('Enviando a SUNAT...', 'info');
  const res = await api('/api/facturacion/enviar/' + ventaId, { method: 'POST' });
  if (res && res.ok) {
    toast('Comprobante aceptado por SUNAT', 'exito');
    cerrarModal();
    const v = await api('/api/ventas/' + ventaId);
    if (v) mostrarTicket(v);
  } else {
    toast(res?.error || 'Error al enviar a SUNAT', 'error');
  }
};

// ============================================================
// INVENTARIO
// ============================================================
async function vistaInventario() {
  const c = $('#viewContainer');
  const esAdmin = CURRENT_USER.rol === 'admin';
  c.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm p-5">
      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <input id="invBuscar" type="text" placeholder="Buscar producto..." class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg">
        ${esAdmin ? `<button id="btnNuevoProd" class="btn-primary px-5 py-2 rounded-lg font-semibold text-white">+ Nuevo Producto</button>` : ''}
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-3 px-2">Código</th><th class="py-3 px-2">Producto</th><th class="py-3 px-2">Categoría</th>
              <th class="py-3 px-2 text-right">P. Compra</th><th class="py-3 px-2 text-right">P. Venta</th>
              <th class="py-3 px-2 text-center">Stock</th>${esAdmin ? '<th class="py-3 px-2 text-center">Acciones</th>' : ''}
            </tr>
          </thead>
          <tbody id="invTabla"></tbody>
        </table>
      </div>
    </div>`;
  await cargarInventario();
  $('#invBuscar').addEventListener('input', cargarInventario);
  if (esAdmin) $('#btnNuevoProd').addEventListener('click', () => modalProducto(null));
}

async function cargarInventario() {
  const q = $('#invBuscar')?.value || '';
  const prods = await api('/api/productos?q=' + encodeURIComponent(q));
  const esAdmin = CURRENT_USER.rol === 'admin';
  $('#invTabla').innerHTML = prods.map(p => `
    <tr class="border-b hover:bg-gray-50">
      <td class="py-3 px-2 font-mono text-xs">${p.codigo}</td>
      <td class="py-3 px-2 font-medium text-gray-800">${p.nombre}</td>
      <td class="py-3 px-2"><span class="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">${p.categoria}</span></td>
      <td class="py-3 px-2 text-right text-gray-500">${fmt(p.precio_compra)}</td>
      <td class="py-3 px-2 text-right font-semibold text-emerald-600">${fmt(p.precio_venta)}</td>
      <td class="py-3 px-2 text-center"><span class="${p.stock <= p.stock_minimo ? 'low-stock px-2 py-1 rounded font-bold' : 'font-semibold'}">${p.stock}</span></td>
      ${esAdmin ? `<td class="py-3 px-2 text-center">
        <button onclick="modalProducto(${p.id})" class="text-sky-600 hover:underline mr-2">Editar</button>
        <button onclick="eliminarProducto(${p.id})" class="text-red-500 hover:underline">Eliminar</button>
      </td>` : ''}
    </tr>`).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-400">Sin productos</td></tr>';
}

window.eliminarProducto = async (id) => {
  if (!confirm('¿Eliminar este producto?')) return;
  await api('/api/productos/' + id, { method: 'DELETE' });
  toast('Producto eliminado');
  cargarInventario();
};

async function modalProducto(id) {
  const cats = await api('/api/categorias');
  let p = null;
  if (id) {
    const prods = await api('/api/productos');
    p = prods.find(x => x.id === id);
  }
  abrirModal(`
    <div class="p-6">
      <h3 class="text-xl font-bold text-gray-800 mb-4">${p ? 'Editar' : 'Nuevo'} Producto</h3>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Código / SKU</label>
          <input id="pCodigo" value="${p?.codigo || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
          <select id="pCat" class="w-full px-3 py-2 border rounded-lg bg-white">
            ${cats.map(c => `<option value="${c.id}" ${p?.categoria_id==c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
          <input id="pNombre" value="${p?.nombre || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Precio Compra</label>
          <input id="pPC" type="number" step="0.01" value="${p?.precio_compra || 0}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Precio Venta</label>
          <input id="pPV" type="number" step="0.01" value="${p?.precio_venta || 0}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Stock</label>
          <input id="pStock" type="number" value="${p?.stock || 0}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Stock Mínimo</label>
          <input id="pMin" type="number" value="${p?.stock_minimo || 5}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div class="col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">Unidad de venta</label>
          <select id="pUnidad" class="w-full px-3 py-2 border rounded-lg bg-white">
            <option value="unidad" ${p?.unidad !== 'kg' ? 'selected' : ''}>Unidad (pieza, unidad)</option>
            <option value="kg" ${p?.unidad === 'kg' ? 'selected' : ''}>Kilogramo (pesable en báscula)</option>
          </select></div>
      </div>
      <div class="flex gap-3 mt-5">
        <button onclick="cerrarModal()" class="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button id="btnGuardarProd" class="btn-primary flex-1 py-3 rounded-xl font-bold text-white">Guardar</button>
      </div>
    </div>`);
  $('#btnGuardarProd').addEventListener('click', async () => {
    const body = {
      codigo: $('#pCodigo').value, nombre: $('#pNombre').value,
      categoria_id: Number($('#pCat').value),
      precio_compra: Number($('#pPC').value), precio_venta: Number($('#pPV').value),
      stock: Number($('#pStock').value), stock_minimo: Number($('#pMin').value),
      unidad: $('#pUnidad').value
    };
    const res = p ? await api('/api/productos/' + id, { method: 'PUT', body })
                  : await api('/api/productos', { method: 'POST', body });
    if (res && res.ok) { cerrarModal(); toast('Producto guardado'); cargarInventario(); }
    else toast(res?.error || 'Error al guardar', 'error');
  });
}

// ============================================================
// HISTORIAL DE VENTAS
// ============================================================
async function vistaVentas() {
  const c = $('#viewContainer');
  c.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm p-5">
      <div class="flex gap-3 mb-4 items-center">
        <label class="text-sm text-gray-600">Últimos:</label>
        <select id="ventasDias" class="px-3 py-2 border rounded-lg">
          <option value="7">7 días</option><option value="30" selected>30 días</option><option value="90">90 días</option>
        </select>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b">
            <th class="py-3 px-2">N°</th><th class="py-3 px-2">Fecha</th><th class="py-3 px-2">Cliente</th>
            <th class="py-3 px-2">Comprobante</th><th class="py-3 px-2">Pago</th>
            <th class="py-3 px-2">Cajero</th><th class="py-3 px-2">Electrónica</th><th class="py-3 px-2 text-right">Total</th><th></th>
          </tr></thead>
          <tbody id="ventasTabla"></tbody>
        </table>
      </div>
    </div>`;
  const cargar = async () => {
    const ventas = await api('/api/ventas?dias=' + $('#ventasDias').value);
    const estBadge = (v) => {
      const map = { aceptado: 'bg-emerald-100 text-emerald-700', rechazado: 'bg-red-100 text-red-600', error: 'bg-red-100 text-red-600', pendiente: 'bg-gray-100 text-gray-500' };
      const label = { aceptado: '✓ SUNAT', rechazado: 'Rechazado', error: 'Error', pendiente: 'Pendiente' };
      return `<span class="text-xs px-2 py-0.5 rounded-full ${map[v.estado_electronica]||map.pendiente}">${label[v.estado_electronica]||'Pendiente'}</span>`;
    };
    $('#ventasTabla').innerHTML = ventas.map(v => `
      <tr class="border-b hover:bg-gray-50">
        <td class="py-3 px-2 font-mono text-xs">${v.numero}</td>
        <td class="py-3 px-2">${v.fecha}</td>
        <td class="py-3 px-2">${v.cliente_nombre}</td>
        <td class="py-3 px-2"><span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">${v.tipo_comprobante}</span></td>
        <td class="py-3 px-2"><span class="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">${v.metodo_pago}</span></td>
        <td class="py-3 px-2 text-gray-500 text-xs">${v.cajero}</td>
        <td class="py-3 px-2">${estBadge(v)} ${v.estado_electronica !== 'aceptado' && CURRENT_USER.rol==='admin' ? `<button onclick="enviarASunat(${v.id})" class="text-indigo-600 hover:underline text-xs ml-1">Enviar</button>` : ''}</td>
        <td class="py-3 px-2 text-right font-bold text-gray-800">${fmt(v.total)}</td>
        <td class="py-3 px-2"><button onclick='verTicket(${JSON.stringify(v).replace(/'/g,"&#39;")})' class="text-sky-600 hover:underline text-xs">Ticket</button></td>
      </tr>`).join('') || '<tr><td colspan="9" class="text-center py-8 text-gray-400">Sin ventas en el período</td></tr>';
  };
  $('#ventasDias').addEventListener('change', cargar);
  cargar();
}

window.verTicket = (v) => mostrarTicket(v);

// ============================================================
// REPORTES
// ============================================================
async function vistaReportes() {
  const r = await api('/api/reportes/resumen');
  const c = $('#viewContainer');
  c.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
      <div class="stat-card bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-2xl p-5 shadow-lg">
        <p class="opacity-80 text-sm">Ventas Hoy</p>
        <p class="text-3xl font-bold mt-2">${fmt(r.total_hoy)}</p>
        <p class="text-xs opacity-70 mt-1">${r.num_ventas_hoy} ventas</p>
      </div>
      <div class="stat-card bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl p-5 shadow-lg">
        <p class="opacity-80 text-sm">Ventas del Mes</p>
        <p class="text-3xl font-bold mt-2">${fmt(r.total_mes)}</p>
        <p class="text-xs opacity-70 mt-1">${r.num_ventas_mes} ventas</p>
      </div>
      <div class="stat-card bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl p-5 shadow-lg">
        <p class="opacity-80 text-sm">Utilidad Estimada</p>
        <p class="text-3xl font-bold mt-2">${fmt(r.total_mes * 0.3)}</p>
        <p class="text-xs opacity-70 mt-1">~30% margen promedio</p>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Ventas últimos 7 días</h3>
        <canvas id="repChart1" style="height:300px"></canvas>
      </div>
      <div class="bg-white rounded-2xl p-5 shadow-sm">
        <h3 class="font-bold text-gray-800 mb-4">Distribución por Método de Pago</h3>
        <canvas id="repChart2" style="height:300px"></canvas>
      </div>
      <div class="bg-white rounded-2xl p-5 shadow-sm lg:col-span-2">
        <h3 class="font-bold text-gray-800 mb-4">Top 10 Productos Más Vendidos</h3>
        <div class="space-y-2">
          ${r.top_productos.length ? r.top_productos.map((p, i) => `
            <div class="flex items-center gap-3">
              <span class="w-6 text-center font-bold text-gray-400">${i+1}</span>
              <span class="w-40 text-sm text-gray-700 truncate">${p.nombre}</span>
              <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full" style="width:${(p.cantidad / r.top_productos[0].cantidad * 100).toFixed(0)}%"></div>
              </div>
              <span class="text-sm font-semibold w-20 text-right">${p.cantidad} und</span>
              <span class="text-sm font-bold text-emerald-600 w-24 text-right">${fmt(p.monto)}</span>
            </div>`).join('') : '<p class="text-gray-400 text-center py-6">Sin datos</p>'}
        </div>
      </div>
    </div>`;
  setTimeout(() => {
    new Chart($('#repChart1'), { type: 'line',
      data: { labels: r.serie_7dias.map(d => d.fecha),
        datasets: [{ label: 'Ventas', data: r.serie_7dias.map(d => d.total),
          borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.15)', fill: true, tension: 0.4 }]},
      options: { responsive: true, maintainAspectRatio: false } });
    new Chart($('#repChart2'), { type: 'pie',
      data: { labels: r.por_metodo_pago.map(p => p.metodo),
        datasets: [{ data: r.por_metodo_pago.map(p => p.monto),
          backgroundColor: ['#0ea5e9','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'] }]},
      options: { responsive: true, maintainAspectRatio: false } });
  }, 100);
}

// ============================================================
// USUARIOS (admin)
// ============================================================
async function vistaUsuarios() {
  const users = await api('/api/usuarios');
  const c = $('#viewContainer');
  c.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm p-5">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-gray-800">Usuarios del Sistema</h3>
        <button id="btnNuevoUser" class="btn-primary px-5 py-2 rounded-lg font-semibold text-white">+ Nuevo Usuario</button>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b">
          <th class="py-3 px-2">Usuario</th><th class="py-3 px-2">Nombre</th><th class="py-3 px-2">Rol</th>
          <th class="py-3 px-2">Estado</th><th class="py-3 px-2">Acciones</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr class="border-b hover:bg-gray-50">
              <td class="py-3 px-2 font-mono">${u.username}</td>
              <td class="py-3 px-2">${u.nombre}</td>
              <td class="py-3 px-2"><span class="text-xs px-2 py-0.5 rounded-full ${u.rol==='admin'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-600'}">${u.rol}</span></td>
              <td class="py-3 px-2"><span class="text-xs px-2 py-0.5 rounded-full ${u.activo?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600'}">${u.activo?'Activo':'Inactivo'}</span></td>
              <td class="py-3 px-2"><button onclick='modalUsuario(${JSON.stringify(u)})' class="text-sky-600 hover:underline">Editar</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  $('#btnNuevoUser').addEventListener('click', () => modalUsuario(null));
}

window.modalUsuario = (u) => {
  abrirModal(`
    <div class="p-6">
      <h3 class="text-xl font-bold text-gray-800 mb-4">${u ? 'Editar' : 'Nuevo'} Usuario</h3>
      <div class="space-y-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Usuario (login)</label>
          <input id="uUsername" value="${u?.username || ''}" ${u?'disabled':''} class="w-full px-3 py-2 border rounded-lg ${u?'bg-gray-100':''}"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Nombre completo</label>
          <input id="uNombre" value="${u?.nombre || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Rol</label>
          <select id="uRol" class="w-full px-3 py-2 border rounded-lg bg-white">
            <option value="admin" ${u?.rol==='admin'?'selected':''}>Administrador</option>
            <option value="gerente" ${u?.rol==='gerente'?'selected':''}>Gerente</option>
            <option value="cajero" ${u?.rol==='cajero'?'selected':''}>Cajero</option>
          </select></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Contraseña ${u?'(dejar vacío para mantener)':''}</label>
          <input id="uPassword" type="password" class="w-full px-3 py-2 border rounded-lg"></div>
        ${u ? `<label class="flex items-center gap-2 text-sm"><input id="uActivo" type="checkbox" ${u.activo?'checked':''}> Usuario activo</label>` : ''}
      </div>
      <div class="flex gap-3 mt-5">
        <button onclick="cerrarModal()" class="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button id="btnGuardarUser" class="btn-primary flex-1 py-3 rounded-xl font-bold text-white">Guardar</button>
      </div>
    </div>`);
  $('#btnGuardarUser').addEventListener('click', async () => {
    const body = { nombre: $('#uNombre').value, rol: $('#uRol').value, password: $('#uPassword').value };
    let res;
    if (u) { body.activo = $('#uActivo').checked; res = await api('/api/usuarios/' + u.id, { method: 'PUT', body }); }
    else { body.username = $('#uUsername').value; res = await api('/api/usuarios', { method: 'POST', body }); }
    if (res && res.ok) { cerrarModal(); toast('Usuario guardado'); vistaUsuarios(); }
    else toast(res?.error || 'Error al guardar', 'error');
  });
};

// ============================================================
// CONFIGURACIÓN / PERSONALIZACIÓN (admin)
// ============================================================
async function vistaConfig() {
  const c = $('#viewContainer');
  c.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-2xl shadow-sm p-6">
        <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
          Datos del Negocio
        </h3>
        <div class="space-y-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Nombre del Negocio</label>
            <input id="cfgNombre" value="${CONFIG.nombre_negocio || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">RUC</label>
              <input id="cfgRuc" value="${CONFIG.ruc || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input id="cfgTel" value="${CONFIG.telefono || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input id="cfgDir" value="${CONFIG.direccion || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input id="cfgEmail" value="${CONFIG.email || ''}" class="w-full px-3 py-2 border rounded-lg"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">URL del Logo (opcional)</label>
            <input id="cfgLogo" value="${CONFIG.logo_url || ''}" placeholder="https://..." class="w-full px-3 py-2 border rounded-lg"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Mensaje del Ticket</label>
            <textarea id="cfgMsg" rows="2" class="w-full px-3 py-2 border rounded-lg">${CONFIG.mensaje_ticket || ''}</textarea></div>
        </div>
      </div>
      <div class="space-y-5">
        <div class="bg-white rounded-2xl shadow-sm p-6">
          <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            Apariencia y Fiscal
          </h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Color Principal (tema)</label>
              <div class="flex gap-2 items-center">
                <input id="cfgColor" type="color" value="${CONFIG.color_primario || '#0ea5e9'}" class="w-12 h-10 border rounded cursor-pointer">
                <div class="flex gap-2">
                  ${['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'].map(c => `<button onclick="document.getElementById('cfgColor').value='${c}'" class="w-8 h-8 rounded-full border-2 border-white shadow" style="background:${c}"></button>`).join('')}
                </div>
              </div></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
                <select id="cfgMoneda" class="w-full px-3 py-2 border rounded-lg bg-white">
                  <option value="S/" ${CONFIG.moneda==='S/'?'selected':''}>Soles (S/)</option>
                  <option value="$" ${CONFIG.moneda==='$'?'selected':''}>Dólares ($)</option>
                  <option value="€" ${CONFIG.moneda==='€'?'selected':''}>Euros (€)</option>
                </select></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">IGV %</label>
                <input id="cfgIgv" type="number" value="${CONFIG.igv_porcentaje || 18}" class="w-full px-3 py-2 border rounded-lg"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Serie Boleta</label>
                <input id="cfgSerieB" value="${CONFIG.serie_boleta || 'B001'}" class="w-full px-3 py-2 border rounded-lg"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Serie Factura</label>
                <input id="cfgSerieF" value="${CONFIG.serie_factura || 'F001'}" class="w-full px-3 py-2 border rounded-lg"></div>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-6">
          <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Facturación Electrónica (SUNAT)
          </h3>
          <div class="space-y-3">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input id="cfgFeHabilitada" type="checkbox" ${CONFIG.facturacion_habilitada==='1'?'checked':''} class="w-4 h-4">
              Habilitar envío de comprobantes electrónicos a SUNAT
            </label>
            <p class="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">Se usa <b>Nubefact</b> (OSE autorizado por SUNAT). Crea tu cuenta en nubefact.com y pega tu token de API aquí. La factura/boleta se envía con un clic desde el ticket o el historial de ventas.</p>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Token de API Nubefact</label>
              <input id="cfgFeToken" type="password" value="${CONFIG.nubefact_token || ''}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" class="w-full px-3 py-2 border rounded-lg font-mono text-xs"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">URL del OSE</label>
              <input id="cfgFeUrl" value="${CONFIG.nubefact_url || 'https://api.nubefact.com/api/v1/'}" class="w-full px-3 py-2 border rounded-lg text-xs"></div>
          </div>
        </div>
        <button id="btnGuardarCfg" class="btn-primary w-full py-3 rounded-xl font-bold text-white shadow-lg">Guardar Configuración</button>
      </div>
    </div>`;
  $('#btnGuardarCfg').addEventListener('click', async () => {
    const body = {
      nombre_negocio: $('#cfgNombre').value, ruc: $('#cfgRuc').value,
      telefono: $('#cfgTel').value, direccion: $('#cfgDir').value,
      email: $('#cfgEmail').value, logo_url: $('#cfgLogo').value,
      mensaje_ticket: $('#cfgMsg').value, color_primario: $('#cfgColor').value,
      moneda: $('#cfgMoneda').value, igv_porcentaje: $('#cfgIgv').value,
      serie_boleta: $('#cfgSerieB').value, serie_factura: $('#cfgSerieF').value,
      facturacion_habilitada: $('#cfgFeHabilitada').checked ? '1' : '0',
      nubefact_token: $('#cfgFeToken').value, nubefact_url: $('#cfgFeUrl').value
    };
    const res = await api('/api/config', { method: 'POST', body });
    if (res && res.ok) {
      CONFIG = await api('/api/config');
      $('#brandName').textContent = CONFIG.nombre_negocio;
      document.title = CONFIG.nombre_negocio;
      toast('Configuración guardada. Recargue para aplicar el tema.');
    } else toast('Error al guardar', 'error');
  });
}

// Iniciar
init();
