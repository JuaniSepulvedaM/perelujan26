// Módulo de Mochilas (Entrega 5, con combinación multi-dispositivo).
//
// Cada puesto de mochilas escribe SOLO dos archivos propios:
//   mochilas/{deviceId}.json  → las mochilas que ESE puesto guardó
//   retiros/{deviceId}.json   → las entregas que ESE puesto marcó (puede ser
//                               una mochila guardada por otro puesto — por eso
//                               va separado: "guardar" y "entregar" son eventos
//                               independientes que cualquier puesto puede generar).
// La vista combinada se arma sola sumando todos los archivos, y se actualiza
// sola cada ciertos segundos y apenas vuelve la conexión.

import { $, escapeHtml, fmtTime, toast, resizeImage, downloadJSON, readFileAsJSON } from '../assets/js/utils.js';
import { state, normalizarNumero, getDeviceId } from '../assets/js/storage.js';
import { makeScanner } from '../assets/js/camera.js';
import {
  ghConfig, ghBajarJSON, ghSubirJSON, ghSubirFoto, ghListarCarpeta, ejecutarEnLotes,
  fetchImageAsDataURL, programarAutoSync, alVolverOnline, crearPoller, registrarForzarSync,
} from './github.js';

let peregrinosMochilas = [];
let fotoMochilaPendiente = null;
let mochilaEnVista = null;
let scannerGuardar = null, scannerBuscar = null;
let poller = null;

// ledgers propios de este dispositivo
let misMochilas = [];   // mochilas que guardó este puesto: {numero, foto, horaGuardada}
let misRetiros = [];    // entregas que marcó este puesto: {numero, horaGuardada, horaRetirada}
// última copia conocida de lo que subieron los demás puestos
let peerMochilasCache = [];
let peerRetirosCache = [];

function claveMochila(m){ return m.numero + '__' + m.horaGuardada; }
function nombreDeNumero(id){ const p = peregrinosMochilas.find((x) => x.id === id); return p && p.nombre ? p.nombre : null; }
function deviceId(){ return getDeviceId(); }

export function init(){
  const el = document.getElementById('view-mochilas');
  el.innerHTML = `
    <div class="card">
      <h2>Peregrinos (opcional, para ver nombres)</h2>
      <p class="muted" id="mochilasListaStatus">Trayendo nombres…</p>
    </div>

    <div class="card">
      <h2>🎒 Guardar una mochila</h2>
      <label class="field">
        <span>Número de credencial del dueño</span>
        <div class="row"><input type="tel" inputmode="numeric" id="inpNumeroMochila" placeholder="Ej: 5 o 005"><button class="btn" style="margin:0;" id="btnEscanearMochilaGuardar">📷</button></div>
      </label>
      <div id="camMochilaGuardarWrap" style="display:none; margin-top:10px;">
        <div style="position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:1/1;max-width:280px;margin:0 auto;">
          <video id="videoMochilaGuardar" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;display:block;"></video>
          <div style="position:absolute;inset:14%;border:3px solid var(--primary);border-radius:16px;opacity:.85;pointer-events:none;"></div>
        </div>
        <canvas id="canvasMochilaGuardar" style="display:none;"></canvas>
        <button class="btn" id="btnDetenerMochilaGuardar" style="margin-top:8px;">⏹️ Detener cámara</button>
      </div>
      <label class="field"><span>Foto de la mochila (opcional)</span><input type="file" accept="image/*" capture="environment" id="inpFotoMochila"></label>
      <div id="fotoMochilaPreviewWrap" style="display:none; margin-bottom:10px;"><img id="fotoMochilaPreview" style="width:100%;max-width:220px;border-radius:10px;border:1px solid var(--outline);display:block;"></div>
      <button class="btn primary" id="btnGuardarMochila">💾 Guardar mochila</button>
    </div>

    <div class="card">
      <h2>🔎 Buscar una mochila</h2>
      <label class="field">
        <span>Número de credencial</span>
        <div class="row"><input type="tel" inputmode="numeric" id="inpNumeroBuscarMochila" placeholder="Ej: 5 o 005"><button class="btn" style="margin:0;" id="btnEscanearMochilaBuscar">📷</button></div>
      </label>
      <button class="btn primary" id="btnBuscarMochila">Buscar</button>
      <div id="camMochilaBuscarWrap" style="display:none; margin-top:10px;">
        <div style="position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:1/1;max-width:280px;margin:0 auto;">
          <video id="videoMochilaBuscar" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;display:block;"></video>
          <div style="position:absolute;inset:14%;border:3px solid var(--primary);border-radius:16px;opacity:.85;pointer-events:none;"></div>
        </div>
        <canvas id="canvasMochilaBuscar" style="display:none;"></canvas>
        <button class="btn" id="btnDetenerMochilaBuscar" style="margin-top:8px;">⏹️ Detener cámara</button>
      </div>
      <div id="resultadoMochila" style="display:none; margin-top:14px; text-align:center;">
        <div class="divider"></div>
        <img id="resMochilaFoto" style="width:100%; max-width:260px; border-radius:14px; border:1px solid var(--outline); display:none; margin:0 auto 12px;">
        <div id="resMochilaIconoGrande" style="font-size:3rem; display:none; margin-bottom:6px;">🎒</div>
        <h3 id="resMochilaTitulo" style="margin-bottom:4px;"></h3>
        <p class="muted" id="resMochilaEstado"></p>
        <button class="btn ok" id="btnMarcarRetirada" style="display:none; font-size:1.05rem; padding:16px;">✅ ENTREGAR</button>
      </div>
    </div>

    <div class="card">
      <h2>Mochilas guardadas ahora (<span id="countMochilasActivas">0</span>)</h2>
      <p class="muted">Se combina solo con lo que guardaron otros puestos. Tocá una para buscarla.</p>
      <span class="sync-pill" id="syncPillMochilas"><span class="dot"></span><span class="txt">Combinando…</span></span>
      <div id="listaMochilasActivas" style="margin-top:10px;"><div class="empty"><span class="ic">🎒</span>No hay mochilas guardadas.</div></div>
    </div>

    <div class="card">
      <button class="btn ghost" id="btnExportarMochilas">💾 Guardar una copia de respaldo en este celular</button>
    </div>
  `;

  wireListaPeregrinos();
  wireGuardar();
  wireBuscar();
  wireExportarBackup();
  renderMochilasActivas();

  iniciarPolling();
  alVolverOnline(() => combinarConOtrosPuestos());
  registrarForzarSync(async () => { await bajarListaPeregrinos(); await combinarConOtrosPuestos(); });

  bajarListaPeregrinos();
}

export function detenerCamarasMochilas(){
  if(scannerGuardar){ scannerGuardar.stop(); const w = $('camMochilaGuardarWrap'); if(w) w.style.display = 'none'; }
  if(scannerBuscar){ scannerBuscar.stop(); const w = $('camMochilaBuscarWrap'); if(w) w.style.display = 'none'; }
  if(poller) poller.stop();
}

function iniciarPolling(){
  if(poller) poller.stop();
  poller = crearPoller(combinarConOtrosPuestos, 20000);
  poller.start();
}

async function bajarListaPeregrinos(){
  const { repo, branch, file } = ghConfig();
  if(!repo){ $('mochilasListaStatus').textContent = 'Falta configurar el repositorio en ⚙️ Configuración.'; return; }
  try{
    const data = await ghBajarJSON(repo, branch, file);
    peregrinosMochilas = (data.peregrinos || []).map((p) => ({ id: p.id, nombre: p.nombre }));
    $('mochilasListaStatus').textContent = `${peregrinosMochilas.length} personas · actualizado ${fmtTime(Date.now())}`;
    renderMochilasActivas();
  }catch(err){
    $('mochilasListaStatus').textContent = 'Sin conexión todavía — se muestra solo el número hasta que se pueda traer los nombres.';
  }
}

// ---------- combinar con otros puestos ----------
async function combinarConOtrosPuestos(){
  const { repo, branch, token } = ghConfig();
  if(!repo) return;
  $('syncPillMochilas').className = 'sync-pill pending';
  $('syncPillMochilas').querySelector('.txt').textContent = 'Combinando…';
  try{
    const [archivosMochilas, archivosRetiros] = await Promise.all([
      ghListarCarpeta(repo, branch, 'mochilas', token),
      ghListarCarpeta(repo, branch, 'retiros', token),
    ]);
    const miArchivo = `${deviceId()}.json`;
    const otrosMochilas = archivosMochilas.filter((a) => a.name !== miArchivo);
    const otrosRetiros = archivosRetiros.filter((a) => a.name !== miArchivo);

    const todasMochilas = [];
    for(const a of otrosMochilas){
      try{ const data = await ghBajarJSON(repo, branch, a.path); (data.mochilas || []).forEach((m) => todasMochilas.push(m)); }
      catch(e){}
    }
    const todosRetiros = [];
    for(const a of otrosRetiros){
      try{ const data = await ghBajarJSON(repo, branch, a.path); (data.retiros || []).forEach((r) => todosRetiros.push(r)); }
      catch(e){}
    }
    peerMochilasCache = todasMochilas;
    peerRetirosCache = todosRetiros;
    recombinar();
    renderMochilasActivas();
    if(mochilaEnVista) buscarMochila(mochilaEnVista.numero);
    $('syncPillMochilas').className = 'sync-pill ok';
    $('syncPillMochilas').querySelector('.txt').textContent = 'Combinado con ' + otrosMochilas.length + ' puesto(s) más · ' + fmtTime(Date.now());
  }catch(err){
    $('syncPillMochilas').className = 'sync-pill offline';
    $('syncPillMochilas').querySelector('.txt').textContent = 'Sin conexión — se combina solo cuando vuelva';
  }
}

function recombinar(){
  const metaSinFoto = (m) => ({ numero: m.numero, horaGuardada: m.horaGuardada });
  const base = [...misMochilas, ...peerMochilasCache].map((m) => ({ ...m, horaRetirada: null }));
  // dedup por clave (numero+horaGuardada), preferimos la copia que tenga foto si hay dos iguales
  const porClave = new Map();
  base.forEach((m) => {
    const k = claveMochila(m);
    const prev = porClave.get(k);
    if(!prev || (!prev.foto && m.foto)) porClave.set(k, m);
  });
  const retiros = [...misRetiros, ...peerRetirosCache];
  retiros.forEach((r) => {
    const k = r.numero + '__' + r.horaGuardada;
    const m = porClave.get(k);
    if(m && (!m.horaRetirada || r.horaRetirada > m.horaRetirada)) m.horaRetirada = r.horaRetirada;
  });
  state.mochilas = [...porClave.values()];
}

// ---------- guardar ----------
function wireGuardar(){
  $('inpFotoMochila').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    fotoMochilaPendiente = await resizeImage(f, 500);
    $('fotoMochilaPreview').src = fotoMochilaPendiente;
    $('fotoMochilaPreviewWrap').style.display = 'block';
  });
  scannerGuardar = makeScanner({
    videoId: 'videoMochilaGuardar', canvasId: 'canvasMochilaGuardar', size: 320,
    onDetect: (data) => {
      if(!data.startsWith('LUJAN-')) return;
      scannerGuardar.stop();
      $('camMochilaGuardarWrap').style.display = 'none';
      $('inpNumeroMochila').value = data.replace('LUJAN-', '');
      toast('Código detectado: ' + data);
    },
    onError: () => toast('No se pudo acceder a la cámara'),
  });
  $('btnEscanearMochilaGuardar').addEventListener('click', async () => { $('camMochilaGuardarWrap').style.display = 'block'; await scannerGuardar.start(); });
  $('btnDetenerMochilaGuardar').addEventListener('click', () => { scannerGuardar.stop(); $('camMochilaGuardarWrap').style.display = 'none'; });

  $('btnGuardarMochila').addEventListener('click', () => {
    const id = normalizarNumero($('inpNumeroMochila').value.trim());
    if(!id){ toast('Ingresá un número válido'); return; }
    const activa = state.mochilas.find((m) => m.numero === id && !m.horaRetirada);
    if(activa){
      const ok = confirm('Ya hay una mochila guardada para este número desde las ' + fmtTime(activa.horaGuardada) + '. ¿Guardar esta de todas formas como otra mochila más?');
      if(!ok) return;
    }
    const nuevaMochila = { numero: id, foto: fotoMochilaPendiente, horaGuardada: Date.now() };
    misMochilas.push(nuevaMochila);
    recombinar();
    fotoMochilaPendiente = null;
    $('inpNumeroMochila').value = ''; $('inpFotoMochila').value = '';
    $('fotoMochilaPreviewWrap').style.display = 'none';
    renderMochilasActivas();
    const nombre = nombreDeNumero(id);
    toast(`Mochila guardada: ${id}${nombre ? ' — ' + nombre : ''}${nuevaMochila.foto ? '' : ' (sin foto)'}`);
    programarAutoSync('mochilas_guardar', subirMisMochilas, 3000);
  });
}

// ---------- buscar / entregar ----------
function buscarMochila(id){
  const entradas = state.mochilas.filter((m) => m.numero === id).sort((a, b) => b.horaGuardada - a.horaGuardada);
  const activa = entradas.find((m) => !m.horaRetirada);
  const nombre = nombreDeNumero(id);
  $('resultadoMochila').style.display = 'block';
  $('resMochilaTitulo').textContent = id + (nombre ? ' — ' + nombre : '');
  $('resMochilaIconoGrande').style.display = 'none';
  if(activa){
    mochilaEnVista = activa;
    if(activa.foto){ $('resMochilaFoto').src = activa.foto; $('resMochilaFoto').style.display = 'block'; }
    else { $('resMochilaFoto').style.display = 'none'; $('resMochilaIconoGrande').style.display = 'block'; $('resMochilaIconoGrande').textContent = '🎒'; }
    $('resMochilaEstado').innerHTML = `✅ <b>Sí, la tenemos.</b> Guardada a las ${fmtTime(activa.horaGuardada)}.` + (activa.foto ? '' : ' (sin foto guardada)');
    $('btnMarcarRetirada').style.display = 'inline-flex';
  } else if(entradas.length > 0){
    const ultima = entradas[0];
    mochilaEnVista = null;
    if(ultima.foto){ $('resMochilaFoto').src = ultima.foto; $('resMochilaFoto').style.display = 'block'; }
    else { $('resMochilaFoto').style.display = 'none'; }
    $('resMochilaEstado').innerHTML = `↩️ Esta mochila ya fue <b>retirada</b> a las ${fmtTime(ultima.horaRetirada)}.`;
    $('btnMarcarRetirada').style.display = 'none';
  } else {
    mochilaEnVista = null;
    $('resMochilaFoto').style.display = 'none';
    $('resMochilaIconoGrande').textContent = '❌';
    $('resMochilaIconoGrande').style.display = 'block';
    $('resMochilaEstado').innerHTML = `<b>No tenemos</b> ninguna mochila registrada con ese número.`;
    $('btnMarcarRetirada').style.display = 'none';
  }
}

function wireBuscar(){
  scannerBuscar = makeScanner({
    videoId: 'videoMochilaBuscar', canvasId: 'canvasMochilaBuscar', size: 320,
    onDetect: (data) => {
      if(!data.startsWith('LUJAN-')) return;
      scannerBuscar.stop();
      $('camMochilaBuscarWrap').style.display = 'none';
      $('inpNumeroBuscarMochila').value = data.replace('LUJAN-', '');
      buscarMochila(data);
    },
    onError: () => toast('No se pudo acceder a la cámara'),
  });
  $('btnEscanearMochilaBuscar').addEventListener('click', async () => { $('camMochilaBuscarWrap').style.display = 'block'; await scannerBuscar.start(); });
  $('btnDetenerMochilaBuscar').addEventListener('click', () => { scannerBuscar.stop(); $('camMochilaBuscarWrap').style.display = 'none'; });
  $('btnBuscarMochila').addEventListener('click', () => {
    const id = normalizarNumero($('inpNumeroBuscarMochila').value.trim());
    if(!id){ toast('Ingresá un número válido'); return; }
    buscarMochila(id);
  });
  $('inpNumeroBuscarMochila').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('btnBuscarMochila').click(); });
  $('btnMarcarRetirada').addEventListener('click', () => {
    if(!mochilaEnVista) return;
    const horaRetirada = Date.now();
    misRetiros.push({ numero: mochilaEnVista.numero, horaGuardada: mochilaEnVista.horaGuardada, horaRetirada });
    recombinar();
    toast('Marcada como retirada ✔');
    buscarMochila(mochilaEnVista.numero);
    renderMochilasActivas();
    programarAutoSync('mochilas_retiros', subirMisRetiros, 3000);
  });
}

function renderMochilasActivas(){
  const activas = state.mochilas.filter((m) => !m.horaRetirada).sort((a, b) => a.horaGuardada - b.horaGuardada);
  $('countMochilasActivas').textContent = activas.length;
  const wrap = $('listaMochilasActivas');
  if(activas.length === 0){ wrap.innerHTML = '<div class="empty"><span class="ic">🎒</span>No hay mochilas guardadas.</div>'; return; }
  wrap.innerHTML = activas.map((m) => {
    const nombre = nombreDeNumero(m.numero);
    return `<div class="mochila-item" data-num="${m.numero}" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--outline);cursor:pointer;">
      <div style="width:42px;height:42px;border-radius:10px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">${m.foto ? `<img src="${m.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🎒'}</div>
      <div><div style="font-weight:600;">${m.numero}${nombre ? ' — ' + escapeHtml(nombre) : ''}</div><div class="muted" style="font-size:.75rem;">Guardada ${fmtTime(m.horaGuardada)}${m.foto ? '' : ' · sin foto'}</div></div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.mochila-item').forEach((el2) => {
    el2.addEventListener('click', () => {
      $('inpNumeroBuscarMochila').value = el2.dataset.num.replace('LUJAN-', '');
      buscarMochila(el2.dataset.num);
    });
  });
}

// ---------- subir (solo mis propios archivos) / backup local ----------
async function subirMisMochilas(){
  const { repo, branch, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  if(misMochilas.length === 0) return;
  await ejecutarEnLotes(misMochilas.filter((m) => m.foto && !m._subida), async (m) => {
    await ghSubirFoto(repo, branch, `mochilas-fotos/${claveMochila(m)}.jpg`, token, m.foto, `Foto de mochila ${m.numero}`);
    m._subida = true;
  }, 4, () => {});
  const metaMochilas = misMochilas.map((m) => ({ numero: m.numero, horaGuardada: m.horaGuardada, tieneFoto: !!m.foto }));
  await ghSubirJSON(repo, branch, `mochilas/${deviceId()}.json`, token,
    { tipo: 'mochilas', dispositivo: deviceId(), generado: new Date().toISOString(), mochilas: metaMochilas },
    'Actualizar mochilas guardadas por este puesto (' + new Date().toLocaleString('es-AR') + ')');
}
async function subirMisRetiros(){
  const { repo, branch, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  if(misRetiros.length === 0) return;
  await ghSubirJSON(repo, branch, `retiros/${deviceId()}.json`, token,
    { tipo: 'retiros', dispositivo: deviceId(), generado: new Date().toISOString(), retiros: misRetiros },
    'Actualizar entregas marcadas por este puesto (' + new Date().toLocaleString('es-AR') + ')');
}

function wireListaPeregrinos(){ /* la carga es automática (bajarListaPeregrinos), no hace falta nada acá */ }

function wireExportarBackup(){
  $('btnExportarMochilas').addEventListener('click', () => {
    if(state.mochilas.length === 0){ toast('No hay datos de mochilas para exportar'); return; }
    downloadJSON({ tipo: 'mochilas', generado: new Date().toISOString(), mochilas: state.mochilas }, 'mochilas_respaldo.json');
    toast('Respaldo guardado en el celular');
  });
}
