# -*- coding: utf-8 -*-
"""
POS KeyFácil Clone - Sistema de Punto de Venta personalizable
Backend: Flask + SQLAlchemy
Desplegable en Render / Railway / VPS
"""
import os
import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'pos-keyfacil-secret-key-change-me')

# Base de datos: SQLite local / PostgreSQL en producción (variable DATABASE_URL)
db_url = os.environ.get('DATABASE_URL')
if db_url:
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///pos.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False

db = SQLAlchemy(app)

# ============================================================
# MODELOS
# ============================================================
class Usuario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    nombre = db.Column(db.String(100))
    rol = db.Column(db.String(20), default='cajero')  # admin / cajero / gerente
    activo = db.Column(db.Boolean, default=True)

    def set_password(self, pwd):
        self.password_hash = generate_password_hash(pwd)

    def check_password(self, pwd):
        return check_password_hash(self.password_hash, pwd)

    def to_dict(self):
        return {'id': self.id, 'username': self.username, 'nombre': self.nombre,
                'rol': self.rol, 'activo': self.activo}


class Categoria(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

    def to_dict(self):
        return {'id': self.id, 'nombre': self.nombre}


class Producto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False)  # código de barras / SKU
    nombre = db.Column(db.String(150), nullable=False)
    descripcion = db.Column(db.String(300))
    precio_compra = db.Column(db.Float, default=0)
    precio_venta = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, default=0)
    stock_minimo = db.Column(db.Integer, default=5)
    unidad = db.Column(db.String(10), default='unidad')  # unidad / kg
    categoria_id = db.Column(db.Integer, db.ForeignKey('categoria.id'))
    categoria = db.relationship('Categoria', backref='productos')
    activo = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id, 'codigo': self.codigo, 'nombre': self.nombre,
            'descripcion': self.descripcion or '', 'precio_compra': self.precio_compra,
            'precio_venta': self.precio_venta, 'stock': self.stock,
            'stock_minimo': self.stock_minimo, 'unidad': self.unidad,
            'categoria_id': self.categoria_id,
            'categoria': self.categoria.nombre if self.categoria else 'Sin categoría',
            'activo': self.activo
        }


class Venta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(30), unique=True)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    subtotal = db.Column(db.Float, default=0)
    igv = db.Column(db.Float, default=0)
    descuento = db.Column(db.Float, default=0)
    total = db.Column(db.Float, nullable=False)
    metodo_pago = db.Column(db.String(30), default='Efectivo')  # Efectivo / Tarjeta / Yape / Plin / Transferencia
    tipo_comprobante = db.Column(db.String(20), default='Boleta')  # Boleta / Factura
    cliente_nombre = db.Column(db.String(150), default='Cliente General')
    cliente_doc = db.Column(db.String(20), default='')
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'))
    usuario = db.relationship('Usuario')
    detalles = db.relationship('DetalleVenta', backref='venta', cascade='all, delete-orphan')
    # Facturación electrónica
    estado_electronica = db.Column(db.String(20), default='pendiente')  # pendiente / aceptado / rechazado / error
    enlace_pdf = db.Column(db.Text)
    enlace_xml = db.Column(db.Text)
    sunat_respuesta = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id, 'numero': self.numero,
            'fecha': self.fecha.strftime('%Y-%m-%d %H:%M'),
            'subtotal': self.subtotal, 'igv': self.igv, 'descuento': self.descuento,
            'total': self.total, 'metodo_pago': self.metodo_pago,
            'tipo_comprobante': self.tipo_comprobante,
            'cliente_nombre': self.cliente_nombre, 'cliente_doc': self.cliente_doc,
            'cajero': self.usuario.nombre if self.usuario else '',
            'estado_electronica': self.estado_electronica,
            'enlace_pdf': self.enlace_pdf or '',
            'enlace_xml': self.enlace_xml or '',
            'sunat_respuesta': self.sunat_respuesta or '',
            'items': [d.to_dict() for d in self.detalles]
        }


class DetalleVenta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('venta.id'))
    producto_id = db.Column(db.Integer, db.ForeignKey('producto.id'))
    producto_nombre = db.Column(db.String(150))
    cantidad = db.Column(db.Integer, default=1)
    precio_unitario = db.Column(db.Float)
    subtotal = db.Column(db.Float)

    def to_dict(self):
        return {'producto': self.producto_nombre, 'cantidad': self.cantidad,
                'precio_unitario': self.precio_unitario, 'subtotal': self.subtotal}


class Configuracion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    clave = db.Column(db.String(50), unique=True)
    valor = db.Column(db.Text)


# ============================================================
# HELPERS
# ============================================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'No autorizado'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('rol') != 'admin':
            return jsonify({'error': 'Se requiere permisos de administrador'}), 403
        return f(*args, **kwargs)
    return decorated


def get_config(clave, default=''):
    c = Configuracion.query.filter_by(clave=clave).first()
    return c.valor if c else default


def set_config(clave, valor):
    c = Configuracion.query.filter_by(clave=clave).first()
    if c:
        c.valor = valor
    else:
        c = Configuracion(clave=clave, valor=valor)
        db.session.add(c)
    db.session.commit()


def generar_numero_venta():
    ultima = Venta.query.order_by(Venta.id.desc()).first()
    n = (ultima.id + 1) if ultima else 1
    serie = get_config('serie_boleta', 'B001')
    return f"{serie}-{str(n).zfill(6)}"


# ============================================================
# RUTAS DE AUTENTICACIÓN
# ============================================================
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form
        user = Usuario.query.filter_by(username=data.get('username')).first()
        if user and user.activo and user.check_password(data.get('password', '')):
            session['user_id'] = user.id
            session['username'] = user.username
            session['nombre'] = user.nombre
            session['rol'] = user.rol
            return jsonify({'ok': True, 'user': user.to_dict()})
        return jsonify({'ok': False, 'error': 'Credenciales inválidas'}), 401
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/api/me')
def me():
    if 'user_id' in session:
        return jsonify({'user': {'id': session['user_id'], 'username': session['username'],
                                 'nombre': session.get('nombre'), 'rol': session.get('rol')}})
    return jsonify({'user': None})


# ============================================================
# PÁGINA PRINCIPAL (SPA)
# ============================================================
@app.route('/')
@login_required
def index():
    return render_template('index.html')


# ============================================================
# API: PRODUCTOS
# ============================================================
@app.route('/api/productos', methods=['GET'])
@login_required
def listar_productos():
    q = request.args.get('q', '')
    query = Producto.query.filter_by(activo=True)
    if q:
        query = query.filter((Producto.nombre.contains(q)) | (Producto.codigo.contains(q)))
    productos = query.order_by(Producto.nombre).all()
    return jsonify([p.to_dict() for p in productos])


@app.route('/api/productos', methods=['POST'])
@login_required
@admin_required
def crear_producto():
    data = request.get_json()
    if Producto.query.filter_by(codigo=data['codigo']).first():
        return jsonify({'error': 'Ya existe un producto con ese código'}), 400
    p = Producto(
        codigo=data['codigo'], nombre=data['nombre'],
        descripcion=data.get('descripcion', ''),
        precio_compra=float(data.get('precio_compra', 0)),
        precio_venta=float(data['precio_venta']),
        stock=int(data.get('stock', 0)),
        stock_minimo=int(data.get('stock_minimo', 5)),
        unidad=data.get('unidad', 'unidad'),
        categoria_id=data.get('categoria_id')
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({'ok': True, 'producto': p.to_dict()})


@app.route('/api/productos/<int:pid>', methods=['PUT'])
@login_required
@admin_required
def actualizar_producto(pid):
    p = Producto.query.get_or_404(pid)
    data = request.get_json()
    p.codigo = data.get('codigo', p.codigo)
    p.nombre = data.get('nombre', p.nombre)
    p.descripcion = data.get('descripcion', p.descripcion)
    p.precio_compra = float(data.get('precio_compra', p.precio_compra))
    p.precio_venta = float(data.get('precio_venta', p.precio_venta))
    p.stock = int(data.get('stock', p.stock))
    p.stock_minimo = int(data.get('stock_minimo', p.stock_minimo))
    p.unidad = data.get('unidad', p.unidad)
    p.categoria_id = data.get('categoria_id', p.categoria_id)
    db.session.commit()
    return jsonify({'ok': True, 'producto': p.to_dict()})


@app.route('/api/productos/<int:pid>', methods=['DELETE'])
@login_required
@admin_required
def eliminar_producto(pid):
    p = Producto.query.get_or_404(pid)
    p.activo = False
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/productos/buscar/<codigo>')
@login_required
def buscar_producto_codigo(codigo):
    p = Producto.query.filter_by(codigo=codigo, activo=True).first()
    if not p:
        return jsonify({'error': 'Producto no encontrado'}), 404
    return jsonify(p.to_dict())


# ============================================================
# API: CATEGORÍAS
# ============================================================
@app.route('/api/categorias', methods=['GET'])
@login_required
def listar_categorias():
    return jsonify([c.to_dict() for c in Categoria.query.order_by(Categoria.nombre).all()])


@app.route('/api/categorias', methods=['POST'])
@login_required
@admin_required
def crear_categoria():
    data = request.get_json()
    c = Categoria(nombre=data['nombre'])
    db.session.add(c)
    db.session.commit()
    return jsonify({'ok': True, 'categoria': c.to_dict()})


# ============================================================
# API: VENTAS (CHECKOUT)
# ============================================================
@app.route('/api/ventas', methods=['POST'])
@login_required
def crear_venta():
    data = request.get_json()
    items = data.get('items', [])
    if not items:
        return jsonify({'error': 'La venta no tiene productos'}), 400

    venta = Venta(
        numero=generar_numero_venta(),
        subtotal=float(data.get('subtotal', 0)),
        igv=float(data.get('igv', 0)),
        descuento=float(data.get('descuento', 0)),
        total=float(data['total']),
        metodo_pago=data.get('metodo_pago', 'Efectivo'),
        tipo_comprobante=data.get('tipo_comprobante', 'Boleta'),
        cliente_nombre=data.get('cliente_nombre', 'Cliente General'),
        cliente_doc=data.get('cliente_doc', ''),
        usuario_id=session.get('user_id')
    )
    db.session.add(venta)

    for it in items:
        prod = Producto.query.get(it['producto_id'])
        if not prod:
            return jsonify({'error': f"Producto {it.get('producto_id')} no existe"}), 400
        if prod.stock < it['cantidad']:
            return jsonify({'error': f"Stock insuficiente para {prod.nombre}"}), 400
        prod.stock -= it['cantidad']
        det = DetalleVenta(
            producto_id=prod.id, producto_nombre=prod.nombre,
            cantidad=it['cantidad'], precio_unitario=it['precio_unitario'],
            subtotal=it['cantidad'] * it['precio_unitario']
        )
        venta.detalles.append(det)

    db.session.commit()
    return jsonify({'ok': True, 'venta': venta.to_dict()})


@app.route('/api/ventas', methods=['GET'])
@login_required
def listar_ventas():
    dias = int(request.args.get('dias', 30))
    desde = datetime.utcnow() - timedelta(days=dias)
    ventas = Venta.query.filter(Venta.fecha >= desde).order_by(Venta.fecha.desc()).all()
    return jsonify([v.to_dict() for v in ventas])


@app.route('/api/ventas/<int:vid>')
@login_required
def ver_venta(vid):
    v = Venta.query.get_or_404(vid)
    return jsonify(v.to_dict())


# ============================================================
# API: FACTURACIÓN ELECTRÓNICA (SUNAT vía Nubefact / OSE)
# ============================================================
@app.route('/api/facturacion/enviar/<int:vid>', methods=['POST'])
@login_required
@admin_required
def enviar_factura_electronica(vid):
    v = Venta.query.get_or_404(vid)
    habilitada = get_config('facturacion_habilitada', '0') == '1'
    token = get_config('nubefact_token', '')
    if not habilitada or not token:
        return jsonify({'error': 'Facturación electrónica no configurada. Ve a Configuración e ingresa tu token de Nubefact.'}), 400

    # Mapeo de tipo de comprobante: factura=01, boleta=03
    tipo = '01' if v.tipo_comprobante.lower().startswith('fact') else '03'
    serie_numero = v.numero.split('-') if '-' in v.numero else [v.numero, '1']
    serie, numero = serie_numero[0], serie_numero[1]

    # Determinar tipo de documento del cliente
    doc = (v.cliente_doc or '').strip()
    if len(doc) == 8:
        tipo_doc = '1'  # DNI
        razon = v.cliente_nombre
    elif len(doc) == 11:
        tipo_doc = '6'  # RUC
        razon = v.cliente_nombre
    else:
        tipo_doc = '0'  # Sin documento
        razon = v.cliente_nombre or 'Varios'

    items = []
    for d in v.detalles:
        precio_unit = d.precio_unitario / 1.18  # Nubefact espera precio sin IGV
        items.append({
            'unidad_de_medida': 'NIU',
            'codigo': '',
            'descripcion': d.producto_nombre,
            'cantidad': str(d.cantidad),
            'valor_unitario': f"{precio_unit:.4f}",
            'precio_unitario': f"{d.precio_unitario:.2f}",
            'subtotal': f"{d.subtotal / 1.18:.2f}",
            'tipo_de_igv': '1',
            'igv': f"{d.subtotal - d.subtotal / 1.18:.2f}",
            'total': f"{d.subtotal:.2f}",
        })

    payload = {
        'operacion': 'generar_comprobante',
        'tipo_de_comprobante': tipo,
        'serie': serie,
        'numero': int(numero),
        'sunat_transaction': '1',
        'cliente_tipo_de_documento': tipo_doc,
        'cliente_numero_de_documento': doc or '00000000',
        'cliente_denominacion': razon,
        'cliente_direccion': get_config('direccion', ''),
        'cliente_email': '',
        'fecha_de_emision': datetime.utcnow().strftime('%d-%m-%Y'),
        'moneda': 'PEN',
        'porcentaje_de_igv': float(get_config('igv_porcentaje', '18')),
        'total_gravada': f"{v.subtotal / 1.18:.2f}",
        'total_igv': f"{v.igv:.2f}",
        'total_pagar': f"{v.total:.2f}",
        'enviar_a_sunat': True,
        'items': items,
    }

    url = get_config('nubefact_url', 'https://api.nubefact.com/api/v1/') + token
    try:
        resp = requests.post(url, json=payload, timeout=30,
                             headers={'Authorization': token, 'Content-Type': 'application/json'})
        data = resp.json()
    except Exception as e:
        v.estado_electronica = 'error'
        v.sunat_respuesta = str(e)
        db.session.commit()
        return jsonify({'error': f'Error de conexión con el OSE: {e}'}), 502

    if data.get('aceptada_por_sunat'):
        v.estado_electronica = 'aceptado'
        v.enlace_pdf = data.get('enlace_del_pdf', '')
        v.enlace_xml = data.get('enlace_del_xml', '')
        v.sunat_respuesta = data.get('sunat_description', '')
        db.session.commit()
        return jsonify({'ok': True, 'estado': 'aceptado',
                        'enlace_pdf': v.enlace_pdf, 'enlace_xml': v.enlace_xml,
                        'respuesta': v.sunat_respuesta})
    else:
        v.estado_electronica = 'rechazado'
        v.sunat_respuesta = data.get('sunat_description') or data.get('errors') or str(data)
        db.session.commit()
        return jsonify({'error': v.sunat_respuesta, 'estado': 'rechazado'}), 400


# ============================================================
# API: SINCRONIZACIÓN POR LOTES (modo offline)
# ============================================================
@app.route('/api/ventas/lote', methods=['POST'])
@login_required
def crear_venta_lote():
    """Recibe un array de ventas pendientes (offline) y las registra una a una."""
    lote = request.get_json().get('ventas', [])
    resultados = []
    for data in lote:
        try:
            items = data.get('items', [])
            if not items:
                resultados.append({'ok': False, 'error': 'Sin items'}); continue
            venta = Venta(
                numero=generar_numero_venta(),
                subtotal=float(data.get('subtotal', 0)), igv=float(data.get('igv', 0)),
                descuento=float(data.get('descuento', 0)), total=float(data['total']),
                metodo_pago=data.get('metodo_pago', 'Efectivo'),
                tipo_comprobante=data.get('tipo_comprobante', 'Boleta'),
                cliente_nombre=data.get('cliente_nombre', 'Cliente General'),
                cliente_doc=data.get('cliente_doc', ''),
                usuario_id=session.get('user_id')
            )
            db.session.add(venta)
            for it in items:
                prod = Producto.query.get(it['producto_id'])
                if prod and prod.stock >= it['cantidad']:
                    prod.stock -= it['cantidad']
                    venta.detalles.append(DetalleVenta(
                        producto_id=prod.id, producto_nombre=prod.nombre,
                        cantidad=it['cantidad'], precio_unitario=it['precio_unitario'],
                        subtotal=it['cantidad'] * it['precio_unitario']))
            db.session.commit()
            resultados.append({'ok': True, 'numero': venta.numero, 'offline_id': data.get('offline_id')})
        except Exception as e:
            db.session.rollback()
            resultados.append({'ok': False, 'error': str(e), 'offline_id': data.get('offline_id')})
    return jsonify({'resultados': resultados,
                    'sincronizados': sum(1 for r in resultados if r['ok'])})


# ============================================================
# API: REPORTES
# ============================================================
@app.route('/api/reportes/resumen')
@login_required
def resumen():
    hoy = datetime.utcnow().date()
    ventas_hoy = Venta.query.filter(db.func.date(Venta.fecha) == hoy).all()
    total_hoy = sum(v.total for v in ventas_hoy)
    ventas_mes = Venta.query.filter(
        db.extract('year', Venta.fecha) == hoy.year,
        db.extract('month', Venta.fecha) == hoy.month
    ).all()
    total_mes = sum(v.total for v in ventas_mes)

    # Productos más vendidos
    top = db.session.query(
        DetalleVenta.producto_nombre,
        db.func.sum(DetalleVenta.cantidad).label('cant'),
        db.func.sum(DetalleVenta.subtotal).label('monto')
    ).group_by(DetalleVenta.producto_nombre).order_by(db.desc('cant')).limit(10).all()

    # Stock bajo
    bajo_stock = Producto.query.filter(Producto.stock <= Producto.stock_minimo, Producto.activo == True).all()

    # Ventas últimos 7 días
    serie = []
    for i in range(6, -1, -1):
        d = hoy - timedelta(days=i)
        vd = Venta.query.filter(db.func.date(Venta.fecha) == d).all()
        serie.append({'fecha': d.strftime('%d/%m'), 'total': round(sum(v.total for v in vd), 2)})

    # Por método de pago
    pagos = db.session.query(
        Venta.metodo_pago, db.func.sum(Venta.total).label('monto')
    ).group_by(Venta.metodo_pago).all()

    return jsonify({
        'total_hoy': round(total_hoy, 2),
        'num_ventas_hoy': len(ventas_hoy),
        'total_mes': round(total_mes, 2),
        'num_ventas_mes': len(ventas_mes),
        'top_productos': [{'nombre': t[0], 'cantidad': t[1], 'monto': round(t[2] or 0, 2)} for t in top],
        'bajo_stock': [p.to_dict() for p in bajo_stock],
        'serie_7dias': serie,
        'por_metodo_pago': [{'metodo': p[0], 'monto': round(p[1] or 0, 2)} for p in pagos]
    })


# ============================================================
# API: USUARIOS
# ============================================================
@app.route('/api/usuarios', methods=['GET'])
@login_required
@admin_required
def listar_usuarios():
    return jsonify([u.to_dict() for u in Usuario.query.all()])


@app.route('/api/usuarios', methods=['POST'])
@login_required
@admin_required
def crear_usuario():
    data = request.get_json()
    if Usuario.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Usuario ya existe'}), 400
    u = Usuario(username=data['username'], nombre=data.get('nombre', ''), rol=data.get('rol', 'cajero'))
    u.set_password(data['password'])
    db.session.add(u)
    db.session.commit()
    return jsonify({'ok': True, 'usuario': u.to_dict()})


@app.route('/api/usuarios/<int:uid>', methods=['PUT'])
@login_required
@admin_required
def actualizar_usuario(uid):
    u = Usuario.query.get_or_404(uid)
    data = request.get_json()
    u.nombre = data.get('nombre', u.nombre)
    u.rol = data.get('rol', u.rol)
    u.activo = data.get('activo', u.activo)
    if data.get('password'):
        u.set_password(data['password'])
    db.session.commit()
    return jsonify({'ok': True})


# ============================================================
# API: CONFIGURACIÓN / PERSONALIZACIÓN
# ============================================================
@app.route('/api/config', methods=['GET'])
@login_required
def obtener_config():
    claves = ['nombre_negocio', 'ruc', 'direccion', 'telefono', 'email',
              'logo_url', 'color_primario', 'moneda', 'igv_porcentaje',
              'serie_boleta', 'serie_factura', 'mensaje_ticket',
              'facturacion_habilitada', 'nubefact_token', 'nubefact_url']
    return jsonify({c: get_config(c, '') for c in claves})


@app.route('/api/config', methods=['POST'])
@login_required
@admin_required
def guardar_config():
    data = request.get_json()
    for k, v in data.items():
        set_config(k, str(v))
    return jsonify({'ok': True})


# ============================================================
# INICIALIZACIÓN Y DATOS DE PRUEBA
# ============================================================
def seed_data():
    if not Usuario.query.filter_by(username='admin').first():
        admin = Usuario(username='admin', nombre='Administrador', rol='admin')
        admin.set_password('admin123')
        cajero = Usuario(username='cajero', nombre='Cajero Demo', rol='cajero')
        cajero.set_password('cajero123')
        db.session.add_all([admin, cajero])

    if Categoria.query.count() == 0:
        for cat in ['Bebidas', 'Snacks', 'Limpieza', 'Abarrotes', 'Otros']:
            db.session.add(Categoria(nombre=cat))
        db.session.commit()

    if Producto.query.count() == 0:
        cats = {c.nombre: c.id for c in Categoria.query.all()}
        demos = [
            ('001', 'Coca Cola 500ml', 1.5, 2.5, 50, 'Bebidas', 'unidad'),
            ('002', 'Inca Kola 500ml', 1.4, 2.5, 40, 'Bebidas', 'unidad'),
            ('003', 'Agua San Luis 625ml', 0.8, 1.5, 60, 'Bebidas', 'unidad'),
            ('004', "Papas Lay's Mediana", 2.0, 3.5, 30, 'Snacks', 'unidad'),
            ('005', 'Galleta Oreo', 1.0, 1.8, 45, 'Snacks', 'unidad'),
            ('006', 'Detergente Bolívar 1kg', 4.5, 7.0, 20, 'Limpieza', 'unidad'),
            ('007', 'Arroz Costeño 5kg', 12.0, 18.0, 15, 'Abarrotes', 'unidad'),
            ('008', 'Azúcar Rubia 1kg', 3.0, 4.8, 25, 'Abarrotes', 'unidad'),
            ('009', 'Aceite Primor 1L', 6.5, 9.5, 18, 'Abarrotes', 'unidad'),
            ('010', 'Chicle Trident', 0.5, 1.0, 100, 'Otros', 'unidad'),
            ('011', 'Pollo fresco (kg)', 7.0, 10.5, 50, 'Abarrotes', 'kg'),
            ('012', 'Azúcar a granel (kg)', 2.8, 4.2, 40, 'Abarrotes', 'kg'),
            ('013', 'Manzana (kg)', 2.5, 4.0, 30, 'Otros', 'kg'),
        ]
        for cod, nombre, pc, pv, st, cat, und in demos:
            db.session.add(Producto(
                codigo=cod, nombre=nombre, precio_compra=pc,
                precio_venta=pv, stock=st, stock_minimo=10,
                unidad=und, categoria_id=cats.get(cat)
            ))

    # Configuración por defecto
    defaults = {
        'nombre_negocio': 'Mi Tienda POS',
        'ruc': '20123456789',
        'direccion': 'Av. Principal 123, Lima, Perú',
        'telefono': '+51 987 654 321',
        'email': 'ventas@mitienda.pe',
        'logo_url': '',
        'color_primario': '#0ea5e9',
        'moneda': 'S/',
        'igv_porcentaje': '18',
        'serie_boleta': 'B001',
        'serie_factura': 'F001',
        'mensaje_ticket': '¡Gracias por su compra! Vuelva pronto.',
        'facturacion_habilitada': '0',
        'nubefact_token': '',
        'nubefact_url': 'https://api.nubefact.com/api/v1/'
    }
    for k, v in defaults.items():
        if not Configuracion.query.filter_by(clave=k).first():
            db.session.add(Configuracion(clave=k, valor=v))

    db.session.commit()


with app.app_context():
    db.create_all()
    seed_data()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
