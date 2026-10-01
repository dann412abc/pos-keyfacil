# POS KeyFácil Clone — Sistema de Punto de Venta Personalizable

Clon de sistema POS estilo **KeyFácil**, hecho con Python (Flask) + HTML/JS, listo para subir a la nube. Incluye ventas, inventario, reportes, usuarios, personalización de marca y ticket imprimible. Adaptado a Perú (IGV 18%, Yape/Plin, boletas/facturas, soles).

---

## 🚀 Accesos de demostración
| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | Administrador (todo) |
| `cajero` | `cajero123` | Cajero (solo ventas) |

---

## ✅ Funcionalidades
- 🛒 **Punto de venta rápido**: búsqueda por nombre/código, escaneo de código de barras (Enter), carrito, descuentos, IGV calculado automáticamente.
- 💳 **Múltiples formas de pago**: Efectivo (con cálculo de vuelto), Tarjeta, Yape, Plin, Transferencia, Crédito.
- 📄 **Comprobantes**: Boleta / Factura / Ticket, con numeración automática y **ticket imprimible**.
- 📦 **Inventario**: CRUD de productos, categorías, control de stock, alertas de stock bajo.
- 📊 **Reportes**: ventas del día/mes, gráficos de 7 días, top productos, métodos de pago, utilidad estimada.
- 👥 **Usuarios y roles**: admin / gerente / cajero, con permisos diferenciados.
- 🎨 **Personalización**: nombre del negocio, RUC, dirección, logo, color del tema, moneda, % de IGV, series de comprobante, mensaje de ticket.
- 🧾 **Facturación Electrónica SUNAT**: integración con Nubefact (OSE autorizado). Envío de boletas/facturas a SUNAT con un clic, con PDF/XML/CDR y estado en tiempo real.
- ⚖️ **Báscula / productos a granel**: soporte para productos vendidos por kg, conexión a báscula por puerto serial/USB (Web Serial API en Chrome/Edge) + entrada manual de peso.
- 📴 **Modo Offline**: funciona sin internet (Service Worker). Las ventas se guardan en el dispositivo y se sincronizan automáticamente al recuperar la conexión.
- ☁️ **Desplegable en la nube**: compatible con Render, Railway, Vercel (serverless), AWS, cualquier VPS.

---

## 🧾 Facturación Electrónica (SUNAT)
1. Crea una cuenta en **Nubefact** (nubefact.com) — es un OSE autorizado por la SUNAT, con planes desde S/ 29/mes (también hay prueba gratuita).
2. En Nubefact: configura tu RUC, Clave SOL, certificado digital y obtén tu **Token de API**.
3. En el POS: entra como admin → **Configuración** → sección Facturación Electrónica → activa y pega el token.
4. Al finalizar una venta (boleta o factura), en el ticket haz clic en **Enviar a SUNAT**. El sistema genera el XML, lo firma y envía, y guarda el enlace al PDF, XML y CDR. El estado aparece en el historial de ventas.
5. Requisito: el cliente debe tener DNI (8 dígitos) o RUC (11 dígitos) para factura electrónica.

## ⚖️ Uso de la báscula
1. Marca tus productos a granel como **Unidad: Kilogramo** (en Inventario → editar producto).
2. En la pantalla de venta, haz clic en **Báscula** → selecciona el puerto COM/USB de tu báscula (bajos 9600, 8N1 — estándar en CAS, Toledo, Torrey, etc.).
3. Al tocar un producto por kg, se abre la ventana de peso: lee el peso automáticamente desde la báscula o ingrésalo manualmente.
4. Si tu navegador no soporta Web Serial (Firefox, Safari), usa siempre la entrada manual de peso.

## 📴 Modo Offline
- La app se cachea automáticamente (Service Worker) tras el primer uso con internet.
- Si pierdes conexión, la barra superior muestra **Sin conexión**. Puedes seguir vendiendo: los comprobantes se guardan localmente.
- Al recuperar internet, aparece un badge **Pendientes: N** en la barra superior. Haz clic para sincronizar (o se hace automáticamente).
- El stock se descuenta en el servidor al sincronizar. Recomendado: sincroniza al menos una vez al día.

---

## 🖥️ Ejecutar en local (Windows/Mac/Linux)
Requisito: Python 3.9+ instalado.

```bash
# 1. Descomprimir y entrar a la carpeta
cd pos-keyfacil

# 2. Crear entorno virtual (opcional pero recomendado)
python -m venv venv
# Windows:  venv\Scripts\activate
# Mac/Linux: source venv/bin/activate

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Ejecutar
python app.py
```
Abre en el navegador: **http://localhost:5000**

La base de datos se crea automáticamente (`pos.db` SQLite) con productos de ejemplo.

---

## ☁️ Subir a la nube (Render — opción más fácil, gratis)

### Opción A: Conectar con GitHub (recomendado)
1. Crea una cuenta en **github.com** y sube esta carpeta a un repositorio (arrastra los archivos o usa git):
   ```bash
   git init
   git add .
   git commit -m "POS inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/pos-keyfacil.git
   git push -u origin main
   ```
2. Entra a **render.com** → regístrate con GitHub.
3. Click en **New +** → **Web Service** → selecciona tu repositorio.
4. Configura:
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Plan**: Free (USD 0/mes — se duerme tras inactividad, despierta al primer acceso)
5. (Opcional pero recomendado) En **Environment** agrega:
   - `SECRET_KEY` → genera una clave aleatoria larga
6. Click **Create Web Service**. En ~2 minutos tendrás tu URL: `https://pos-keyfacil.onrender.com`

### Base de datos persistente (importante)
El plan Free de Render **no guarda archivos en disco** de forma permanente, así que SQLite se borrará al reiniciar. Solución gratuita:
1. En Render → **New +** → **PostgreSQL** → plan Free (expira en 90 días en free; o usa [Supabase](https://supabase.com) / [Neon](https://neon.tech) gratis permanente).
2. Copia la **Internal Database URL** (o External).
3. En tu Web Service → **Environment** → agrega variable `DATABASE_URL` con ese valor.
4. Redeploy. La app detecta PostgreSQL automáticamente.

### Opción B: Railway / Fly.io
Similar: conecta el repo, el start command es `gunicorn app:app` y agrega `DATABASE_URL` con un PostgreSQL propio.

### Opción C: VPS propio (AWS EC2, DigitalOcean, Hostinger)
```bash
sudo apt update && sudo apt install python3-pip nginx -y
git clone <tu-repo> /var/www/pos && cd /var/www/pos
pip3 install -r requirements.txt
# Configura gunicorn como servicio systemd + nginx como proxy inverso
gunicorn --bind 0.0.0.0:80 app:app
```

---

## 🎨 Personalizar tu marca
1. Entra como **admin** → menú **Configuración**.
2. Cambia: nombre del negocio, RUC, dirección, teléfono, URL del logo, color principal (tema completo), moneda, % IGV, series de boleta/factura y mensaje del ticket.
3. Guarda y recarga la página. Todo se aplica automáticamente.

## 🖨️ Impresión de tickets
Al finalizar una venta se muestra el ticket; click en **Imprimir Ticket** envía a la impresora térmica o normal (formato 80mm optimizado).

## 🔒 Seguridad (antes de producción)
- Cambia las contraseñas de `admin` y `cajero` desde el menú Usuarios.
- Configura `SECRET_KEY` con un valor aleatorio.
- Usa PostgreSQL (no SQLite) en producción.
- Si manejas datos sensibles, habilita HTTPS (Render lo incluye gratis).

## 📁 Estructura
```
pos-keyfacil/
├── app.py              # Backend Flask + modelos + API
├── requirements.txt
├── render.yaml         # Configuración para Render
├── templates/
│   ├── login.html
│   └── index.html      # SPA principal
└── static/
    ├── css/style.css
    └── js/app.js       # Toda la lógica frontend
```

---
Hecho para ser modificado libremente. ¡Éxito con tu negocio!
