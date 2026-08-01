// Módulo de Registro (Entrega 2): generar credenciales, importar desde Excel,
// asignar nombres (a mano o escaneando), alta directa, imprimir QR, sincronizar.

import { $, escapeHtml, fmtTime, toast, downloadJSON, readFileAsJSON, resizeImage } from '../assets/js/utils.js';
import { state, PREFIX, nextId, normalizarNumero } from '../assets/js/storage.js';
import { makeScanner } from '../assets/js/camera.js';
import {
  ghConfig, ghBajarJSON, ghSubirJSON, ghSubirFoto, ejecutarEnLotes,
  fetchImageAsDataURL, programarAutoSync, alVolverOnline, crearPoller, registrarForzarSync,
} from './github.js';

let fotoPendiente = null;
let fotoPendienteAsig = null;
let codigoEnAsignacion = null;
let excelRows = [];
let asignarScanner = null;

export function init(){
  const el = document.getElementById('view-registro');
  el.innerHTML = `
    <div class="card">
      <h2>1. Generar credenciales en blanco</h2>
      <p class="muted">Los QR son únicos (ej: LUJAN-001, LUJAN-002…). Generalos primero, imprimí las hojas y después asignale el nombre a cada uno cuando lo sepas.</p>
      <label class="field">
        <span>¿Cuántas credenciales nuevas?</span>
        <div class="row">
          <input type="tel" inputmode="numeric" id="inpCantidadBlancos" placeholder="Ej: 30">
          <button class="btn primary" style="margin:0;" id="btnGenerarBlancos">Generar</button>
        </div>
      </label>
      <p class="muted" id="proximoCodigoHint"></p>
    </div>

    <div class="card">
      <h2>2. Importar nombres desde Excel/CSV</h2>
      <p class="muted">Subí tu planilla con los nombres. La app le asigna un código nuevo a cada uno automáticamente, en el mismo orden de la planilla.</p>
      <label class="field">
        <span>Archivo (.xlsx, .xls o .csv)</span>
        <input type="file" accept=".xlsx,.xls,.csv" id="inpExcelFile">
      </label>
      <div id="excelPreviewWrap" style="display:none;">
        <div class="divider"></div>
        <label class="field"><span><input type="checkbox" id="chkPrimeraFilaEncabezado" checked> La primera fila es un encabezado</span></label>
        <label class="field"><span><input type="checkbox" id="chkColumnasSeparadas"> El nombre y el apellido están en columnas separadas</span></label>
        <label class="field" id="wrapColNombre"><span id="lblColNombre">Columna con el nombre completo</span><select id="selColNombre"></select></label>
        <label class="field" id="wrapColApellido" style="display:none;"><span>Columna con el apellido</span><select id="selColApellido"></select></label>
        <p class="muted"><b>Vista previa:</b></p>
        <div id="excelPreviewLista" class="card" style="max-height:180px; overflow-y:auto;"></div>
        <button class="btn primary" id="btnGenerarDesdeExcel">➕ Generar credenciales para estos nombres</button>
      </div>
    </div>

    <div class="card">
      <h2>3. Asignar nombre a una credencial</h2>
      <p class="muted">Buscá la credencial por el número impreso debajo del QR, o escaneala directamente.</p>
      <label class="field">
        <span>Número de credencial</span>
        <div class="row">
          <input type="tel" inputmode="numeric" id="inpNumeroAsignar" placeholder="Ej: 5 o 005">
          <button class="btn" style="margin:0;" id="btnBuscarAsignar">Buscar</button>
        </div>
      </label>
      <button class="btn ghost" id="btnEscanearAsignar">📷 Escanear código</button>
      <div id="camAsignarWrap" style="display:none; margin-top:12px;">
        <div style="position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:1/1;max-width:280px;margin:0 auto;">
          <video id="videoAsig" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;display:block;"></video>
          <div style="position:absolute;inset:14%;border:3px solid var(--primary);border-radius:16px;opacity:.85;pointer-events:none;"></div>
        </div>
        <canvas id="canvasAsig" style="display:none;"></canvas>
        <button class="btn" id="btnDetenerAsig" style="margin-top:8px;">⏹️ Detener cámara</button>
      </div>
      <div id="asignarPanel" style="display:none; margin-top:6px;">
        <div class="divider"></div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <div id="asigAvatar" style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--outline);">?</div>
          <div><div id="asigCodigo" style="font-weight:700;">—</div><div id="asigEstado" class="muted">—</div></div>
        </div>
        <label class="field"><span>Nombre y apellido</span><input type="text" id="inpNombreAsignar" placeholder="Ej: María Gómez"></label>
        <label class="field"><span>Foto (opcional)</span><input type="file" accept="image/*" capture="environment" id="inpFotoAsignar"></label>
        <div id="fotoAsigPreviewWrap" style="display:none; margin-bottom:10px;"><img id="fotoAsigPreview" style="width:64px;height:64px;border-radius:50%;object-fit:cover;"></div>
        <button class="btn primary" id="btnGuardarAsignacion">💾 Guardar asignación</button>
      </div>
    </div>

    <div class="card">
      <h2>Lista de credenciales (<span id="countPeregrinos">0</span>)</h2>
      <p class="muted" id="countResumen"></p>
      <div id="listaPeregrinos"><div class="empty"><span class="ic">🪪</span>Todavía no generaste ninguna credencial.</div></div>
    </div>

    <div class="card">
      <h2>🔄 Sincronización</h2>
      <p class="muted">Se trae y se sube sola en segundo plano, usando el repositorio de ⚙️ Configuración. Si dos celulares están cargando peregrinos distintos al mismo tiempo, se suman los dos (nunca se pisan) — lo único que no se combina solo son ediciones del mismo peregrino hechas casi al mismo tiempo en dos celulares distintos.</p>
      <span class="sync-pill" id="syncPillRegistro"><span class="dot"></span><span class="txt">Sincronizando…</span></span>
      <p class="muted" id="ghEstado" style="margin-top:8px;"></p>
    </div>

    <div class="card">
      <h2>¿No tenés una credencial impresa para alguien?</h2>
      <label class="field"><span>Nombre y apellido</span><input type="text" id="inpNombre" placeholder="Ej: María Gómez"></label>
      <label class="field"><span>Foto (opcional)</span><input type="file" accept="image/*" capture="environment" id="inpFoto"></label>
      <div id="fotoPreviewWrap" style="display:none; margin-bottom:10px;"><img id="fotoPreview" style="width:64px;height:64px;border-radius:50%;object-fit:cover;"></div>
      <button class="btn" id="btnAgregar">➕ Agregar directamente</button>
    </div>

    <div class="card">
      <h2>Hoja de QR / exportar</h2>
      <button class="btn" id="btnImprimir">🖨️ Generar hoja de QR para imprimir</button>
      <button class="btn" id="btnExportarLista">💾 Descargar lista (peregrinos.json)</button>
      <button class="btn ghost" id="btnImportarLista">📂 Importar lista existente</button>
      <input type="file" accept=".json" id="fileImportarLista" style="display:none;">
    </div>

    <div id="printSheet" style="display:none;">
      <h2>Camino a Luján — Credenciales</h2>
      <div id="printGrid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px;"></div>
    </div>
  `;

  wireGenerarBlancos();
  wireExcel();
  wireAsignacion();
  wireAltaDirecta();
  wireListaYExport();
  wireGithub();
  renderListaPeregrinos();

  alVolverOnline(() => {
    if(state.peregrinos.length > 0) programarAutoSync('peregrinos', subirPeregrinosSilencioso, 1000);
  });
}

// ---------- 1. generar en blanco ----------
function wireGenerarBlancos(){
  $('btnGenerarBlancos').addEventListener('click', () => {
    const n = parseInt($('inpCantidadBlancos').value, 10);
    if(!n || n < 1){ toast('Ingresá una cantidad válida'); return; }
    let primero = null, ultimo = null;
    for(let i = 0; i < n; i++){
      const id = nextId();
      if(!primero) primero = id;
      ultimo = id;
      state.peregrinos.push({ id, nombre: null, foto: null });
    }
    $('inpCantidadBlancos').value = '';
    renderListaPeregrinos();
    toast(`Generadas ${n} credenciales: ${primero} a ${ultimo}`);
    programarAutoSync('peregrinos', subirPeregrinosSilencioso, 4000);
  });
}

// ---------- 2. Excel ----------
function colLetter(i){
  let s = ''; i = i + 1;
  while(i > 0){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
function excelFileToRows(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try{
        const data = new Uint8Array(e.target.result);
        const wb = window.XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(window.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }));
      }catch(err){ reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
function numCols(){ return excelRows.reduce((m, r) => Math.max(m, r.length), 0); }
function poblarSelectsColumnas(){
  const n = numCols();
  const encabezado = $('chkPrimeraFilaEncabezado').checked && excelRows.length ? excelRows[0] : null;
  const prevNombre = $('selColNombre').value;
  const prevApellido = $('selColApellido').value;
  const opciones = [];
  for(let i = 0; i < n; i++){
    const label = encabezado && encabezado[i] ? `${colLetter(i)} — "${encabezado[i]}"` : `Columna ${colLetter(i)}`;
    opciones.push(`<option value="${i}">${escapeHtml(label)}</option>`);
  }
  $('selColNombre').innerHTML = opciones.join('');
  $('selColApellido').innerHTML = opciones.join('');
  if(prevNombre !== '' && parseInt(prevNombre, 10) < n) $('selColNombre').value = prevNombre;
  if(prevApellido !== '' && parseInt(prevApellido, 10) < n) $('selColApellido').value = prevApellido;
  else if(n > 1) $('selColApellido').value = 1;
}
function nombresDetectados(){
  const separadas = $('chkColumnasSeparadas').checked;
  const colN = parseInt($('selColNombre').value, 10) || 0;
  const colA = parseInt($('selColApellido').value, 10) || 0;
  const filas = $('chkPrimeraFilaEncabezado').checked ? excelRows.slice(1) : excelRows;
  return filas.map((r) => {
    const nombre = (r[colN] || '').toString().trim();
    const apellido = separadas ? (r[colA] || '').toString().trim() : '';
    return separadas ? `${nombre} ${apellido}`.trim() : nombre;
  }).filter((n) => n.length > 0);
}
function actualizarVistaPreviaExcel(){
  poblarSelectsColumnas();
  $('wrapColApellido').style.display = $('chkColumnasSeparadas').checked ? 'block' : 'none';
  $('lblColNombre').textContent = $('chkColumnasSeparadas').checked ? 'Columna con el nombre' : 'Columna con el nombre completo';
  const nombres = nombresDetectados();
  const prev = nombres.slice(0, 8);
  $('excelPreviewLista').innerHTML = nombres.length
    ? prev.map((n) => `<div style="padding:6px 0; border-bottom:1px solid var(--outline);">${escapeHtml(n)}</div>`).join('') +
      (nombres.length > 8 ? `<div class="muted" style="padding:6px 0;">…y ${nombres.length - 8} más (${nombres.length} en total)</div>` : '')
    : '<div class="empty">No se detectaron nombres con esta configuración.</div>';
}
function wireExcel(){
  $('inpExcelFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      excelRows = await excelFileToRows(f);
      if(excelRows.length === 0){ toast('El archivo está vacío'); return; }
      $('excelPreviewWrap').style.display = 'block';
      actualizarVistaPreviaExcel();
    }catch(err){ toast('No se pudo leer el archivo'); }
  });
  ['chkPrimeraFilaEncabezado', 'chkColumnasSeparadas', 'selColNombre', 'selColApellido'].forEach((id) => {
    $(id).addEventListener('change', actualizarVistaPreviaExcel);
  });
  $('btnGenerarDesdeExcel').addEventListener('click', () => {
    const nombres = nombresDetectados();
    if(nombres.length === 0){ toast('No hay nombres para generar'); return; }
    let primero = null, ultimo = null;
    nombres.forEach((nombre) => {
      const id = nextId();
      if(!primero) primero = id;
      ultimo = id;
      state.peregrinos.push({ id, nombre, foto: null });
    });
    renderListaPeregrinos();
    toast(`Generadas ${nombres.length} credenciales asignadas: ${primero} a ${ultimo}`);
    programarAutoSync('peregrinos', subirPeregrinosSilencioso, 4000);
    $('excelPreviewWrap').style.display = 'none';
    $('inpExcelFile').value = '';
    excelRows = [];
  });
}

// ---------- 3. asignación ----------
function abrirPanelAsignacion(id){
  codigoEnAsignacion = id;
  let p = state.peregrinos.find((x) => x.id === id);
  if(!p){ p = { id, nombre: null, foto: null }; state.peregrinos.push(p); renderListaPeregrinos(); }
  $('asigCodigo').textContent = id;
  $('asigAvatar').innerHTML = p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂';
  $('asigEstado').textContent = p.nombre ? `Ya asignada a: ${p.nombre} (podés corregirla)` : 'Sin asignar todavía';
  $('inpNombreAsignar').value = p.nombre || '';
  fotoPendienteAsig = p.foto || null;
  $('fotoAsigPreviewWrap').style.display = p.foto ? 'block' : 'none';
  if(p.foto) $('fotoAsigPreview').src = p.foto;
  $('asignarPanel').style.display = 'block';
  $('inpNumeroAsignar').value = '';
}
function wireAsignacion(){
  $('btnBuscarAsignar').addEventListener('click', () => {
    const id = normalizarNumero($('inpNumeroAsignar').value.trim());
    if(!id){ toast('Ingresá un número válido'); return; }
    abrirPanelAsignacion(id);
  });
  $('inpNumeroAsignar').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('btnBuscarAsignar').click(); });
  $('inpFotoAsignar').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    fotoPendienteAsig = await resizeImage(f, 200);
    $('fotoAsigPreview').src = fotoPendienteAsig;
    $('fotoAsigPreviewWrap').style.display = 'block';
  });
  $('btnGuardarAsignacion').addEventListener('click', () => {
    if(!codigoEnAsignacion) return;
    const nombre = $('inpNombreAsignar').value.trim();
    if(!nombre){ toast('Escribí un nombre'); return; }
    const p = state.peregrinos.find((x) => x.id === codigoEnAsignacion);
    if(!p){ toast('Error interno, probá de nuevo'); return; }
    p.nombre = nombre;
    p.foto = fotoPendienteAsig;
    if(p.foto) state.fotosPendientesSubir.add(p.id);
    renderListaPeregrinos();
    toast(`Asignado: ${nombre} → ${codigoEnAsignacion}`);
    programarAutoSync('peregrinos', subirPeregrinosSilencioso, 4000);
    $('asignarPanel').style.display = 'none';
    codigoEnAsignacion = null;
  });
  asignarScanner = makeScanner({
    videoId: 'videoAsig', canvasId: 'canvasAsig', size: 320,
    onDetect: (data) => {
      if(!data.startsWith(PREFIX)) return;
      asignarScanner.stop();
      $('camAsignarWrap').style.display = 'none';
      abrirPanelAsignacion(data);
    },
    onError: () => toast('No se pudo acceder a la cámara'),
  });
  $('btnEscanearAsignar').addEventListener('click', async () => {
    $('camAsignarWrap').style.display = 'block';
    await asignarScanner.start();
  });
  $('btnDetenerAsig').addEventListener('click', () => {
    asignarScanner.stop();
    $('camAsignarWrap').style.display = 'none';
  });
}
export function detenerCamarasRegistro(){
  if(asignarScanner){ asignarScanner.stop(); const w = $('camAsignarWrap'); if(w) w.style.display = 'none'; }
}

// ---------- alta directa ----------
function wireAltaDirecta(){
  $('inpFoto').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    fotoPendiente = await resizeImage(f, 200);
    $('fotoPreview').src = fotoPendiente;
    $('fotoPreviewWrap').style.display = 'block';
  });
  $('btnAgregar').addEventListener('click', () => {
    const nombre = $('inpNombre').value.trim();
    if(!nombre){ toast('Escribí un nombre'); return; }
    const p = { id: nextId(), nombre, foto: fotoPendiente };
    state.peregrinos.push(p);
    if(p.foto) state.fotosPendientesSubir.add(p.id);
    fotoPendiente = null;
    $('inpNombre').value = ''; $('inpFoto').value = '';
    $('fotoPreviewWrap').style.display = 'none';
    renderListaPeregrinos();
    toast(`Agregado: ${nombre} (${p.id})`);
    programarAutoSync('peregrinos', subirPeregrinosSilencioso, 4000);
  });
}

// ---------- lista, export/import, imprimir ----------
function renderListaPeregrinos(){
  $('countPeregrinos').textContent = state.peregrinos.length;
  const asignados = state.peregrinos.filter((p) => p.nombre).length;
  const sinAsignar = state.peregrinos.length - asignados;
  $('countResumen').textContent = state.peregrinos.length ? `${asignados} con nombre asignado · ${sinAsignar} sin asignar` : '';
  $('proximoCodigoHint').textContent = `Próximo código a generar: ${nextId()}`;
  const wrap = $('listaPeregrinos');
  if(state.peregrinos.length === 0){ wrap.innerHTML = '<div class="empty"><span class="ic">🪪</span>Todavía no generaste ninguna credencial.</div>'; return; }
  const ordenados = [...state.peregrinos].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  wrap.innerHTML = ordenados.map((p) => {
    const nombreHtml = p.nombre ? escapeHtml(p.nombre) : '<span style="color:var(--text-dim); font-style:italic;">Sin asignar</span>';
    return `<div style="display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--outline);">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px solid var(--outline);">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂'}</div>
      <div style="flex:1; min-width:0;"><div style="font-weight:600;">${nombreHtml}</div><div class="muted" style="font-size:.75rem;">${p.id}</div></div>
      ${p.nombre ? '' : `<button class="btn ghost asignar-btn" style="width:auto;margin:0;padding:8px 10px;" data-id="${p.id}">Asignar</button>`}
      <button class="del-btn" data-id="${p.id}" style="background:none;border:none;color:var(--danger);font-size:1.1rem;padding:6px;cursor:pointer;">✕</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.del-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.peregrinos = state.peregrinos.filter((p) => p.id !== b.dataset.id);
      renderListaPeregrinos();
      programarAutoSync('peregrinos', subirPeregrinosSilencioso, 4000);
    });
  });
  wrap.querySelectorAll('.asignar-btn').forEach((b) => {
    b.addEventListener('click', () => { abrirPanelAsignacion(b.dataset.id); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });
}

function wireListaYExport(){
  $('btnExportarLista').addEventListener('click', () => {
    if(state.peregrinos.length === 0){ toast('No hay credenciales para exportar'); return; }
    downloadJSON({ tipo: 'lista_peregrinos', generado: new Date().toISOString(), peregrinos: state.peregrinos }, 'peregrinos.json');
  });
  $('btnImportarLista').addEventListener('click', () => $('fileImportarLista').click());
  $('fileImportarLista').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = await readFileAsJSON(f);
      state.peregrinos = data.peregrinos || [];
      renderListaPeregrinos();
      toast(`Importados ${state.peregrinos.length} registros`);
    }catch(err){ toast('Archivo inválido'); }
  });
  $('btnImprimir').addEventListener('click', () => {
    if(state.peregrinos.length === 0){ toast('Generá credenciales primero'); return; }
    const grid = $('printGrid'); grid.innerHTML = '';
    const ordenados = [...state.peregrinos].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    ordenados.forEach((p) => {
      const qr = window.qrcode(0, 'M');
      qr.addData(p.id);
      qr.make();
      const img = qr.createDataURL(6, 6);
      const nombreImpreso = p.nombre ? escapeHtml(p.nombre) : 'Sin asignar';
      const card = document.createElement('div');
      card.style.cssText = 'border:1px dashed #999;border-radius:8px;padding:8px;text-align:center;';
      card.innerHTML = `<img src="${img}" style="width:100%;max-width:140px;"><div style="font-weight:700;font-size:.85rem;margin-top:4px;">${nombreImpreso}</div><div style="font-size:.7rem;color:#666;">${p.id}</div>`;
      grid.appendChild(card);
    });
    const sheet = $('printSheet');
    sheet.style.display = 'block';
    window.print();
    sheet.style.display = 'none';
  });
}

// ---------- GitHub ----------
async function subirPeregrinos(mostrarToast){
  const { repo, branch, file, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  if(state.peregrinos.length === 0) return;
  $('ghEstado').textContent = 'Subiendo lista…';
  const metaPeregrinos = state.peregrinos.map((p) => ({ id: p.id, nombre: p.nombre, tieneFoto: !!p.foto }));
  await ghSubirJSON(repo, branch, file, token,
    { tipo: 'lista_peregrinos', generado: new Date().toISOString(), peregrinos: metaPeregrinos },
    'Actualizar lista de peregrinos (' + new Date().toLocaleString('es-AR') + ')');
  const pendientes = [...state.fotosPendientesSubir].filter((id) => state.peregrinos.some((p) => p.id === id && p.foto));
  if(pendientes.length === 0){
    $('ghEstado').textContent = 'Subido correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.peregrinos.length + ' credenciales (sin fotos nuevas).';
    if(mostrarToast) toast('Cambios subidos a GitHub ✔');
    return;
  }
  const errores = await ejecutarEnLotes(pendientes, async (id) => {
    const p = state.peregrinos.find((x) => x.id === id);
    await ghSubirFoto(repo, branch, `fotos/${id}.jpg`, token, p.foto, `Foto de ${p.nombre || id}`);
    state.fotosPendientesSubir.delete(id);
  }, 4, (completados, total) => { $('ghEstado').textContent = `Subiendo fotos… ${completados}/${total}`; });
  if(errores.length > 0){
    $('ghEstado').textContent = `Subido con errores: ${pendientes.length - errores.length} fotos ok, ${errores.length} fallaron. Se reintentará solo.`;
    if(mostrarToast) toast('Algunas fotos no se pudieron subir');
  } else {
    $('ghEstado').textContent = 'Subido correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.peregrinos.length + ' credenciales, ' + pendientes.length + ' fotos nuevas.';
    if(mostrarToast) toast('Cambios subidos a GitHub ✔');
  }
}
async function subirPeregrinosSilencioso(){ await subirPeregrinos(false); }

let poller = null;

async function bajarSiEstaVacio(mostrarPill){
  const { repo, branch, file } = ghConfig();
  if(!repo) return;
  if(state.peregrinos.length > 0) return; // ya hay datos locales: no pisamos nada
  if(mostrarPill) marcarPill('pending', 'Trayendo la lista…');
  try{
    const data = await ghBajarJSON(repo, branch, file);
    state.peregrinos = (data.peregrinos || []).map((p) => ({ id: p.id, nombre: p.nombre, foto: null, _tieneFoto: !!p.tieneFoto }));
    state.fotosPendientesSubir.clear();
    renderListaPeregrinos();
    const conFoto = state.peregrinos.filter((p) => p._tieneFoto);
    const incluirFotos = document.getElementById('chkBajarFotos')?.checked !== false;
    if(incluirFotos && conFoto.length > 0){
      await ejecutarEnLotes(conFoto, async (p) => {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/fotos/${p.id}.jpg`;
        p.foto = await fetchImageAsDataURL(url);
      }, 6, (completados, total) => {
        $('ghEstado').textContent = `Trayendo fotos… ${completados}/${total}`;
        if(completados % 10 === 0 || completados === total) renderListaPeregrinos();
      });
      renderListaPeregrinos();
    }
    marcarPill('ok', 'Sincronizado · ' + fmtTime(Date.now()));
  }catch(err){
    marcarPill('offline', 'Sin conexión — se completa sola cuando haya señal');
  }
}

// combinación segura y automática: agrega credenciales nuevas que hayan subido
// desde otro celular, sin pisar nunca nada de lo que ya tenés cargado acá.
async function combinarNuevasCredenciales(){
  const { repo, branch, token } = ghConfig();
  if(!repo) return;
  marcarPill('pending', 'Combinando…');
  try{
    const data = await ghBajarJSON(repo, branch, ghConfig().file);
    const remotas = data.peregrinos || [];
    const idsLocales = new Set(state.peregrinos.map((p) => p.id));
    let agregadas = 0;
    remotas.forEach((p) => {
      if(!idsLocales.has(p.id)){
        state.peregrinos.push({ id: p.id, nombre: p.nombre, foto: null, _tieneFoto: !!p.tieneFoto });
        agregadas++;
      }
    });
    if(agregadas > 0){
      renderListaPeregrinos();
      toast(`Se sumaron ${agregadas} credenciales que cargó otro celular`);
      const incluirFotos = document.getElementById('chkBajarFotos')?.checked !== false;
      if(incluirFotos){
        const nuevas = state.peregrinos.filter((p) => p._tieneFoto && !p.foto);
        await ejecutarEnLotes(nuevas, async (p) => {
          const url = `https://raw.githubusercontent.com/${repo}/${branch}/fotos/${p.id}.jpg`;
          p.foto = await fetchImageAsDataURL(url);
        }, 6, () => { renderListaPeregrinos(); });
      }
    }
    // subimos lo nuestro también, por si el otro celular no vio todavía lo que agregamos acá
    if(token && state.peregrinos.length > 0) await subirPeregrinosSilencioso();
    marcarPill('ok', 'Sincronizado · ' + fmtTime(Date.now()));
  }catch(err){
    marcarPill('offline', 'Sin conexión — se combina sola cuando vuelva');
  }
}

function marcarPill(estado, texto){
  const pill = $('syncPillRegistro');
  if(!pill) return;
  pill.className = 'sync-pill ' + estado;
  pill.querySelector('.txt').textContent = texto;
}

function wireGithub(){
  bajarSiEstaVacio(true);
  poller = crearPoller(combinarNuevasCredenciales, 25000);
  poller.start();
  alVolverOnline(() => { bajarSiEstaVacio(true); combinarNuevasCredenciales(); });
  registrarForzarSync(async () => { await bajarSiEstaVacio(true); await combinarNuevasCredenciales(); });
}

export { subirPeregrinos, subirPeregrinosSilencioso };
