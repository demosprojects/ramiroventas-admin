import { db, auth } from "./firebase.js";
import { 
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ─── PROTECCIÓN DE RUTA ──────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        cargarProductos();
        cargarTarjetas();
    }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', () => {
    document.getElementById('modal-logout').classList.remove('hidden');
    document.body.classList.add('modal-active');
});

document.getElementById('confirm-logout-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirm-logout-btn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin mr-1"></i>Saliendo...`;
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (e) {
        mostrarToast("Error al cerrar sesión");
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-right-from-bracket mr-1"></i>Salir`;
        document.getElementById('modal-logout').classList.add('hidden');
        document.body.classList.remove('modal-active');
    }
});

let productos = [];
let productosFiltrados = [];
let idAEliminar = null;

// ─── TARJETAS (planes de pago) ────────────────────────────────────────────────
let tarjetas = [];

async function cargarTarjetas() {
    try {
        const snap = await getDocs(collection(db, "tarjetas"));
        tarjetas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        tarjetas.sort((a, b) => (a.banco || '').localeCompare(b.banco || '') || (a.cuotas - b.cuotas));
        renderListaTarjetas();
        renderCheckboxesTarjetas();
    } catch (e) {
        console.error("Error al cargar tarjetas:", e);
    }
}

function renderListaTarjetas() {
    const cont = document.getElementById('lista-tarjetas');
    if (!cont) return;
    if (!tarjetas.length) {
        cont.innerHTML = `<p class="text-center text-slate-300 text-[11px] font-bold py-6">Todavía no cargaste ningún plan.</p>`;
        return;
    }
    cont.innerHTML = tarjetas.map(t => `
        <div class="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2.5">
            <div>
                <p class="font-black text-xs uppercase italic">${t.banco} <span class="text-slate-400 font-bold normal-case">· ${t.cuotas} cuotas</span></p>
                <p class="text-[10px] text-slate-400 font-bold">Recargo: +${t.recargo}%</p>
            </div>
            <div class="flex items-center gap-1">
                <button onclick="editarTarjeta('${t.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-[#0056b3] transition-all">
                    <i class="fa-solid fa-pen text-[11px]"></i>
                </button>
                <button onclick="eliminarTarjeta('${t.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                    <i class="fa-solid fa-trash-can text-[11px]"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Genera los checkboxes de tarjetas dentro del form de producto,
// preservando cuáles quedaron tildados si ya había una selección previa
function renderCheckboxesTarjetas(seleccionadas = null) {
    const cont = document.getElementById('tarjetas-checkboxes');
    if (!cont) return;

    // Si no se pasa selección explícita, conservar la que esté tildada actualmente
    const previas = seleccionadas || Array.from(cont.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);

    if (!tarjetas.length) {
        cont.innerHTML = `<p class="text-[10px] text-slate-300 font-bold italic">No hay planes de tarjeta cargados todavía.</p>`;
        return;
    }
    cont.innerHTML = tarjetas.map(t => `
        <label class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-[#0056b3] transition-all has-[:checked]:border-[#0056b3] has-[:checked]:bg-blue-50">
            <input type="checkbox" value="${t.id}" class="tarjeta-checkbox accent-[#0056b3]" ${previas.includes(t.id) ? 'checked' : ''}>
            <span class="text-[10px] font-bold text-slate-600">${t.banco} · ${t.cuotas}c (+${t.recargo}%)</span>
        </label>
    `).join('');
}

window.editarTarjeta = function(id) {
    const t = tarjetas.find(x => x.id === id);
    if (!t) return;
    document.getElementById('tarjeta-edit-id').value = id;
    document.getElementById('tarjeta-banco').value   = t.banco;
    document.getElementById('tarjeta-cuotas').value  = t.cuotas;
    document.getElementById('tarjeta-recargo').value = t.recargo;
    document.getElementById('btn-guardar-tarjeta-txt').innerText = 'Guardar cambios';
    document.getElementById('btn-cancelar-tarjeta').classList.remove('hidden');
};

window.cancelarEdicionTarjeta = function() {
    document.getElementById('tarjeta-edit-id').value = '';
    document.getElementById('tarjeta-banco').value = '';
    document.getElementById('tarjeta-cuotas').value = '';
    document.getElementById('tarjeta-recargo').value = '';
    document.getElementById('btn-guardar-tarjeta-txt').innerText = 'Agregar plan';
    document.getElementById('btn-cancelar-tarjeta').classList.add('hidden');
};

window.guardarTarjeta = async function() {
    const id      = document.getElementById('tarjeta-edit-id').value;
    const banco   = document.getElementById('tarjeta-banco').value.trim();
    const cuotas  = Number(document.getElementById('tarjeta-cuotas').value);
    const recargo = Number(document.getElementById('tarjeta-recargo').value);

    if (!banco) return mostrarToast("Ingresá el nombre del banco/tarjeta");
    if (!cuotas || cuotas < 1) return mostrarToast("Ingresá una cantidad de cuotas válida");
    if (recargo === '' || isNaN(recargo) || recargo < 0) return mostrarToast("Ingresá un recargo válido");

    const btn         = document.getElementById('btn-guardar-tarjeta');
    const btnTexto    = document.getElementById('btn-guardar-tarjeta-texto');
    const btnSpinner  = document.getElementById('btn-guardar-tarjeta-spinner');
    btn.disabled = true;
    btnTexto.classList.add('opacity-0');
    btnSpinner.classList.remove('hidden');
    try {
        if (id) {
            await updateDoc(doc(db, "tarjetas", id), { banco, cuotas, recargo });
            mostrarToast("Plan actualizado");
        } else {
            await addDoc(collection(db, "tarjetas"), { banco, cuotas, recargo });
            mostrarToast("Plan agregado");
        }
        cancelarEdicionTarjeta();
        await cargarTarjetas();
    } catch (e) {
        console.error("Error al guardar tarjeta:", e);
        mostrarToast("Error al guardar el plan");
    } finally {
        btn.disabled = false;
        btnTexto.classList.remove('opacity-0');
        btnSpinner.classList.add('hidden');
    }
};

let idTarjetaAEliminar = null;

window.eliminarTarjeta = function(id) {
    const t = tarjetas.find(x => x.id === id);
    if (!t) return;
    idTarjetaAEliminar = id;
    document.getElementById('modal-delete-tarjeta-texto').innerText =
        `"${t.banco} · ${t.cuotas} cuotas" — Los productos que lo tenían cargado dejarán de mostrarlo.`;
    document.getElementById('modal-delete-tarjeta').classList.remove('hidden');
};

window.cerrarModalDeleteTarjeta = function() {
    document.getElementById('modal-delete-tarjeta').classList.add('hidden');
    idTarjetaAEliminar = null;
};

document.getElementById('confirm-delete-tarjeta-btn')?.addEventListener('click', async () => {
    if (!idTarjetaAEliminar) return;
    const idParaBorrar = idTarjetaAEliminar;
    const btn = document.getElementById('confirm-delete-tarjeta-btn');
    btn.disabled = true;
    try {
        await deleteDoc(doc(db, "tarjetas", idParaBorrar));
        tarjetas = tarjetas.filter(t => t.id !== idParaBorrar);
        renderListaTarjetas();
        renderCheckboxesTarjetas();
        mostrarToast("Plan eliminado");
        cerrarModalDeleteTarjeta();
    } catch (e) {
        console.error(e);
        mostrarToast("Error al eliminar");
    } finally {
        btn.disabled = false;
    }
});

window.abrirModalTarjetas = function() {
    cancelarEdicionTarjeta();
    renderListaTarjetas();
    document.getElementById('modal-tarjetas').classList.remove('hidden');
    document.body.classList.add('modal-active');
};

window.cerrarModalTarjetas = function() {
    document.getElementById('modal-tarjetas').classList.add('hidden');
    document.body.classList.remove('modal-active');
    // Al cerrar, refrescar los checkboxes del form de producto por si se agregó/editó algo
    renderCheckboxesTarjetas(Array.from(document.querySelectorAll('#tarjetas-checkboxes input:checked')).map(i => i.value));
};

// ─── CARGA INICIAL ────────────────────────────────────────────────────────────
async function cargarProductos() {
    toggleLoader(true);
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productos = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        aplicarFiltros();
    } catch (e) {
        console.error("Error al cargar:", e);
        mostrarToast("Error al cargar datos");
    } finally {
        toggleLoader(false);
    }
}

// ─── LÓGICA DE FILTRADO UNIFICADA ────────────────────────────────────────────

// Mapa de palabras clave de disponibilidad para búsqueda por texto
const KEYWORDS_DISPONIBLE  = ['disponible', 'stock', 'con stock', 'activo'];
const KEYWORDS_AGOTADO     = ['agotado', 'sin stock', 'agotada', 'inactivo'];

// Mapa de alias de categorías para búsqueda por texto
const ALIAS_CATEGORIAS = {
    'dormitorio': 'Dormitorio', 'cuarto': 'Dormitorio', 'habitacion': 'Dormitorio', 'habitación': 'Dormitorio',
    'colchon': 'Colchones & Sommiers', 'colchón': 'Colchones & Sommiers', 'colchones': 'Colchones & Sommiers', 'sommier': 'Colchones & Sommiers', 'sommiers': 'Colchones & Sommiers',
    'ropero': 'Dormitorio', 'roperos': 'Dormitorio', 'placard': 'Dormitorio',
    'comoda': 'Dormitorio', 'cómoda': 'Dormitorio', 'comodas': 'Dormitorio', 'cómodas': 'Dormitorio',
    'mesa de luz': 'Dormitorio', 'mesas de luz': 'Dormitorio', 'mesita': 'Dormitorio', 'mesitas': 'Dormitorio',
    'cocina': 'Cocina & Comedor', 'comedor': 'Cocina & Comedor',
    'exterior': 'Exterior', 'jardin': 'Exterior', 'jardín': 'Exterior', 'patio': 'Exterior',
    'electronica': 'Electrónica', 'electrónica': 'Electrónica', 'electronico': 'Electrónica', 'electrónico': 'Electrónica', 'tecnologia': 'Electrónica', 'tecnología': 'Electrónica',
    'electrodomesticos': 'Electrodomésticos', 'electrodomésticos': 'Electrodomésticos', 'electrodomestico': 'Electrodomésticos', 'electrodoméstico': 'Electrodomésticos',
    'climatizacion': 'Climatización', 'climatización': 'Climatización', 'aire': 'Climatización', 'calefaccion': 'Climatización', 'calefacción': 'Climatización',
    'mates': 'Mates & Termos', 'mate': 'Mates & Termos', 'mates y termos': 'Mates & Termos', 'mates & termos': 'Mates & Termos',
    'termo': 'Mates & Termos', 'termos': 'Mates & Termos',
    'bombilla': 'Mates & Termos', 'bombillas': 'Mates & Termos',
    'mochilas': 'Mochilas', 'mochila': 'Mochilas', 'bolso': 'Mochilas', 'bolsos': 'Mochilas',
    'ferreteria': 'Ferreteria y Hogar', 'ferretería': 'Ferreteria y Hogar', 'hogar': 'Ferreteria y Hogar',
    'novedades': 'Novedades y Varios', 'varios': 'Novedades y Varios',
};

function aplicarFiltros() {
    const textoRaw = document.getElementById('admin-buscador').value.trim();
    const texto    = textoRaw.toLowerCase();
    const stock    = document.getElementById('filtro-stock').value;
    const catVal   = document.getElementById('filtro-categoria').value;

    // Nuevo formato: __sub__Categoria__Subcategoria
    const esFiltroSubcat = catVal.startsWith('__sub__');
    let catPadre = null, subcatFiltro = null;
    if (esFiltroSubcat) {
        const partes = catVal.replace('__sub__', '').split('__');
        catPadre     = partes[0];   // ej: "Dormitorio" o "Mates y Termos"
        subcatFiltro = partes[1];   // ej: "Roperos" o "Termos"
    }
    const cat = esFiltroSubcat ? 'todos' : catVal;

    // Detectar si el texto coincide con un keyword de disponibilidad
    const textoPideDisp    = KEYWORDS_DISPONIBLE.some(k => texto.includes(k));
    const textoPideAgotado = KEYWORDS_AGOTADO.some(k => texto.includes(k));

    // Detectar si el texto coincide con una categoría
    const categoriaDetectada = ALIAS_CATEGORIAS[texto] || null;

    productosFiltrados = productos.filter(p => {
        // ── Filtro de texto ──
        const esKeywordEspecial = textoPideDisp || textoPideAgotado || categoriaDetectada;
        const matchTexto = esKeywordEspecial
            ? true
            : (texto === '' || p.nombre.toLowerCase().includes(texto) ||
               (p.categoria && p.categoria.toLowerCase().includes(texto)) ||
               (p.subcategoria && p.subcategoria.toLowerCase().includes(texto)));

        // ── Filtro de stock ──
        let matchStock;
        if (stock !== 'todos') {
            matchStock = stock === 'disponible' ? p.disponible !== false : p.disponible === false;
        } else if (textoPideDisp) {
            matchStock = p.disponible !== false;
        } else if (textoPideAgotado) {
            matchStock = p.disponible === false;
        } else {
            matchStock = true;
        }

        // ── Filtro de categoría / subcategoría ──
        let matchCat;
        if (esFiltroSubcat) {
            // Filtrar por categoría padre exacta + subcategoría exacta
            matchCat = p.categoria === catPadre && p.subcategoria === subcatFiltro;
        } else if (cat !== 'todos') {
            matchCat = p.categoria === cat;
        } else if (categoriaDetectada) {
            matchCat = p.categoria === categoriaDetectada;
        } else {
            matchCat = true;
        }

        return matchTexto && matchStock && matchCat;
    });

    actualizarStats();
    renderAdmin();
}

function actualizarStats() {
    const total     = productos.length;
    const filtrados = productosFiltrados.length;
    const statsEl   = document.getElementById('stats-text');
    if (statsEl) statsEl.innerHTML = `${filtrados} de ${total} productos mostrados`;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAdmin() {
    const container = document.getElementById("admin-productos");
    
    if (productosFiltrados.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center"><p class="font-black italic text-slate-300 uppercase text-[10px]">Sin resultados</p></div>`;
        return;
    }

    container.innerHTML = productosFiltrados.map(p => {
        const disponible = p.disponible !== false;
        const enOferta   = p.enOferta === true;
        const imgs = p.imagenes || [];
        const imgsJson = JSON.stringify(imgs).replace(/"/g, '&quot;');

        return `
            <div class="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 hover:border-[#0056b3] transition-all group relative">
                <div class="relative aspect-square rounded-xl overflow-hidden mb-2 bg-slate-50">
                    <img src="${imgs[0]}" class="w-full h-full object-cover ${!disponible ? 'grayscale opacity-50' : ''}">
                    <div class="absolute top-1.5 left-1.5 flex flex-col gap-1">
                        ${!disponible ? '<span class="stat-pill bg-slate-800 text-white">Agotado</span>' : ''}
                        ${enOferta ? '<span class="stat-pill bg-red-500 text-white">Oferta</span>' : ''}
                    </div>
                    <button onclick="abrirLightbox(&quot;${imgs[0]}&quot;, ${imgsJson})" 
                        class="absolute bottom-1.5 right-1.5 bg-black/50 hover:bg-black/80 text-white w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm">
                        <i class="fa-solid fa-magnifying-glass-plus text-[10px]"></i>
                    </button>
                </div>
                <h3 class="font-black text-[10px] uppercase truncate mb-0.5">${p.nombre}</h3>
                <p class="text-[#0056b3] font-black text-xs">$${Number(p.precio).toLocaleString('es-AR')}</p>
                <div class="flex gap-1.5 mt-3 pt-2 border-t border-slate-50">
                    <button onclick="editarProducto('${p.id}')" class="flex-1 bg-slate-50 text-slate-500 py-1.5 rounded-lg font-bold text-[9px] uppercase hover:bg-blue-50 hover:text-blue-600 transition-all">
                        Editar
                    </button>
                    <button onclick="preguntarEliminar('${p.id}')" class="px-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all">
                        <i class="fa-solid fa-trash-can text-[9px]"></i>
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

// ─── EVENTOS DE FILTROS ───────────────────────────────────────────────────────
['admin-buscador', 'filtro-stock', 'filtro-categoria'].forEach(id => {
    document.getElementById(id).addEventListener('input', aplicarFiltros);
});

// ─── MODALES ──────────────────────────────────────────────────────────────────
window.preguntarEliminar = function(id) {
    idAEliminar = id;
    document.getElementById("modal-delete").classList.remove("hidden");
    document.body.classList.add("modal-active");
}

window.cerrarModalDelete = function() {
    document.getElementById("modal-delete").classList.add("hidden");
    document.body.classList.remove("modal-active");
    idAEliminar = null;
}

document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!idAEliminar) return;
    const idParaBorrar = idAEliminar;
    cerrarModalDelete();
    toggleLoader(true);
    try {
        await deleteDoc(doc(db, "products", idParaBorrar));
        // Sacar el producto del array local en vez de recargar todo
        productos = productos.filter(p => p.id !== idParaBorrar);
        mostrarToast("🔥 Eliminado");
        aplicarFiltros();
    } catch (e) {
        console.error("Error al eliminar:", e);
        mostrarToast(e.code === "permission-denied" ? "Sin permisos en Firestore" : "Error al borrar");
    } finally {
        toggleLoader(false);
    }
});

// ─── GUARDAR PRODUCTO ─────────────────────────────────────────────────────────
window.guardarProducto = async function() {
    const id     = document.getElementById("edit-id").value;
    const nombre = document.getElementById("nombre").value.trim();
    const precio = document.getElementById("precio").value;

    if (!nombre || !precio) return mostrarToast("Falta nombre o precio");
    const catValRaw = document.getElementById("categoria").value;
    if (!catValRaw) return mostrarToast("Seleccioná una categoría");

    // Separar categoría principal y subcategoría (formato "Dormitorio|Roperos")
    const partes       = catValRaw.split('|');
    const categoriaVal = partes[0];
    const subcatVal    = partes[1] || null; // null si no hay subcategoría

    // Leer las URLs desde los inputs hidden populados por el uploader de imágenes
    const imgs = [
        document.getElementById("img1").value.trim(),
        document.getElementById("img2").value.trim(),
        document.getElementById("img3").value.trim(),
        document.getElementById("img4").value.trim(),
        document.getElementById("img5").value.trim(),
        document.getElementById("img6").value.trim()
    ].filter(i => i !== "");

    if (imgs.length === 0) return mostrarToast("Agregá al menos una imagen");

    // Leer variantes desde el array global definido en admin.html
    const variantesValidas = (typeof window.variantesData !== 'undefined' ? window.variantesData : [])
        .filter(v => v.nombre.trim() !== '' && Number(v.precio) > 0)
        .map(v => ({
            nombre:         v.nombre.trim(),
            precio:         Number(v.precio),
            disponible:     v.disponible !== false,
            enOferta:       v.enOferta === true,
            precioAnterior: v.enOferta === true && Number(v.precioAnterior) > 0
                                ? Number(v.precioAnterior)
                                : null,
            imagen:         v.imagen || null
        }));

    const datos = {
        nombre,
        precio:          Number(precio),
        categoria:       categoriaVal,
        subcategoria:    subcatVal,
        descripcion:     document.getElementById("descripcion").value,
        caracteristicas: document.getElementById("caracteristicas").value,
        imagenes:        imgs,
        disponible:      document.getElementById("disponible").checked,
        enOferta:        document.getElementById("enOferta").checked,
        precioAnterior:  document.getElementById("enOferta").checked
                            ? Number(document.getElementById("precioAnterior").value) || null
                            : null,
        variantes:       variantesValidas,
        tarjetas:        Array.from(document.querySelectorAll('#tarjetas-checkboxes input:checked')).map(i => i.value)
    };

    toggleLoader(true);
    const btnGuardar = document.getElementById("btn-guardar");
    const btnTexto = document.getElementById("btn-guardar-texto");
    const btnSpinner = document.getElementById("btn-guardar-spinner");
    btnGuardar.disabled = true;
    btnTexto.classList.add("opacity-0");
    btnSpinner.classList.remove("hidden");
    try {
        if (id) {
            await updateDoc(doc(db, "products", id), datos);
            // Actualizar el producto en el array local en vez de recargar todo
            const idx = productos.findIndex(p => p.id === id);
            if (idx !== -1) productos[idx] = { ...productos[idx], ...datos };
            mostrarToast("Producto actualizado");
        } else {
            const fecha = Date.now();
            const nuevoDoc = await addDoc(collection(db, "products"), { ...datos, fecha });
            // Agregar el producto nuevo al array local en vez de recargar todo
            productos.push({ id: nuevoDoc.id, ...datos, fecha });
            mostrarToast("Producto creado");
        }
        cerrarModalAdmin();
        aplicarFiltros();
    } catch (e) {
        console.error("Error al guardar:", e);
        mostrarToast(e.code === "permission-denied" ? "Sin permisos en Firestore" : "Error al guardar");
    } finally {
        toggleLoader(false);
        btnGuardar.disabled = false;
        btnTexto.classList.remove("opacity-0");
        btnSpinner.classList.add("hidden");
    }
}

// ─── ABRIR / CERRAR MODAL FORM ────────────────────────────────────────────────
window.abrirModalCrear = function() {
    limpiarForm();
    document.getElementById("modal-titulo").innerText = "Nuevo Producto";
    document.getElementById("btn-guardar-texto").innerText = "Guardar producto";
    document.getElementById("modal-form").classList.remove("hidden");
    document.getElementById("modal-body").scrollTop = 0;
    document.body.classList.add("modal-active");
}

window.cerrarModalAdmin = function() {
    document.getElementById("modal-form").classList.add("hidden");
    document.body.classList.remove("modal-active");
}

window.editarProducto = function(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    limpiarForm();

    document.getElementById("edit-id").value        = id;
    document.getElementById("nombre").value         = p.nombre;
    document.getElementById("precio").value         = p.precio;
    // Pre-seleccionar categoría: si tiene subcategoría usar formato "Categoria|Subcategoria"
    const selectCatVal = p.subcategoria
        ? `${p.categoria}|${p.subcategoria}`
        : (p.categoria || "Dormitorio");
    document.getElementById("categoria").value      = selectCatVal;
    document.getElementById("descripcion").value    = p.descripcion || "";
    document.getElementById("caracteristicas").value = p.caracteristicas || "";

    // Cargar imágenes existentes en las zonas de upload
    // loadExistingImage es una función global definida en admin.html
    if (p.imagenes && typeof loadExistingImage === 'function') {
        p.imagenes.forEach((url, i) => {
            if (url && i < 6) loadExistingImage(url, i + 1);
        });
    }

    document.getElementById("disponible").checked = p.disponible !== false;
    document.getElementById("enOferta").checked   = p.enOferta === true;
    if (p.enOferta) {
        document.getElementById("campo-precio-anterior").classList.remove("hidden");
        document.getElementById("precioAnterior").value = p.precioAnterior || "";
    }

    // Cargar variantes existentes
    if (typeof cargarVariantesExistentes === 'function') {
        cargarVariantesExistentes(p.variantes || []);
    }

    // Pre-tildar los planes de tarjeta que ya tenía este producto
    renderCheckboxesTarjetas(p.tarjetas || []);

    document.getElementById("modal-titulo").innerText = "Editar Producto";
    document.getElementById("btn-guardar-texto").innerText = "Actualizar producto";
    document.getElementById("modal-form").classList.remove("hidden");
    document.getElementById("modal-body").scrollTop = 0;
    document.body.classList.add("modal-active");
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function toggleLoader(show) {
    document.getElementById("loader").classList.toggle("hidden", !show);
    document.getElementById("admin-productos").classList.toggle("hidden", show);
}

function mostrarToast(msj) {
    const t = document.getElementById("toast");
    t.innerHTML = msj;
    t.classList.remove("translate-y-32");
    setTimeout(() => t.classList.add("translate-y-32"), 2800);
}

function limpiarForm() {
    document.getElementById("edit-id").value = "";
    ["nombre", "precio", "descripcion", "caracteristicas", "precioAnterior"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("categoria").value    = "";
    document.getElementById("disponible").checked = true;
    document.getElementById("enOferta").checked   = false;
    document.getElementById("campo-precio-anterior").classList.add("hidden");

    // Limpiar variantes
    if (typeof resetVariantes === 'function') resetVariantes();

    // Limpiar zonas de imagen — función global en admin.html
    if (typeof resetImageZones === 'function') resetImageZones();

    // Destildar todos los planes de tarjeta
    renderCheckboxesTarjetas([]);
}
