// Módulo de Escaneo (Entrega 3, con combinación multi-dispositivo).
//
// Cada celular escribe SOLO su propio archivo dentro de registros/parada_N/{deviceId}.json
// — nunca toca el archivo de otro celular, así que dos celulares en la misma parada
// jamás se pisan. La vista combinada (para "faltan"/"recientes"/estadísticas) se arma
// sumando el archivo propio con los de los demás celulares de esa misma parada, y se
// vuelve a combinar sola cada ciertos segundos y apenas vuelve la conexión.

import { $, escapeHtml, fmtTime, toast, downloadJSON, readFileAsJSON } from '../assets/js/utils.js';
import { state, PREFIX, normalizarNumero, getDeviceId } from '../assets/js/storage.js';
import { makeScanner } from '../assets/js/camera.js';
import {
  ghConfig, verificarConfig, ghBajarJSON, ghSubirJSON, ghListarCarpeta, ejecutarEnLotes,
  fetchImageAsDataURL, programarAutoSync, alVolverOnline, crearPoller, registrarForzarSync,
} from './github.js';

let peregrinosEscaneo = null; // null = todavía no se cargó nada
let scanner = null;
let pendingScan = null;
let lastScan = { code: null, ts: 0 };
const SCAN_COOLDOWN_MS = 4000;

// registros que efectivamente creó/borró ESTE celular en su parada actual
let misRegistros = [];
// última copia conocida de los registros de los OTROS celulares en esta misma parada
let peerRegistrosCache = [];
let poller = null;

function listaActiva(){ return peregrinosEscaneo || state.peregrinos; }
function deviceId(){ return getDeviceId(); }

export function init(){
  const el = document.getElementById('view-escaneo');
  el.innerHTML = `
    <div class="card" id="escaneoSinLista">
      <h2>Trayendo la lista de peregrinos…</h2>
      <p class="muted" id="ghEstadoEscaneoInicial">Un momento — se trae sola en cuanto haya conexión.</p>
      <div class="divider"></div>
      <p class="muted">¿No tenés internet en este momento?</p>
      <button class="btn ghost" id="btnImportarListaEscaneo">📂 Importar peregrinos.json desde un archivo</button>
      <input type="file" accept=".json" id="fileImportarListaEscaneo" style="display:none;">
    </div>

    <div id="escaneoConLista" style="display:none;">
      <div class="card" id="paradaCard">
        <h2>¿Qué parada es este celular?</h2>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">
          ${[1,2,3,4].map(n => `<button class="btn ghost parada-btn" data-p="${n}" style="margin:0;">Parada ${n}</button>`).join('')}
        </div>
        <p class="muted" id="paradaHint">Elegí la parada una vez y dejá este celular fijo ahí. Si hay más de un celular en la misma parada, no hay problema: se combinan solos.</p>
      </div>

      <div id="escaneoActivo" style="display:none;">
        <div class="card">
          <h2 id="paradaTitulo">Parada</h2>
          <div id="camWrap" style="position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:1/1;max-width:460px;margin:0 auto;">
            <video id="video" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;display:block;"></video>
            <div style="position:absolute;inset:12%;border:3px solid var(--primary);border-radius:16px;opacity:.9;pointer-events:none;"></div>
            <div id="camStatus" style="position:absolute;bottom:10px;left:0;right:0;text-align:center;color:#fff;font-size:.8rem;text-shadow:0 1px 3px #000;">Buscando código QR…</div>
          </div>
          <button class="btn" id="btnCamara">📷 Iniciar cámara</button>
          <canvas id="canvas" style="display:none;"></canvas>
        </div>

        <div class="card">
          <div class="stat-grid" style="margin-bottom:6px;">
            <div class="stat-box"><div class="v" id="statPasaron">0</div><div class="l">pasaron</div></div>
            <div class="stat-box"><div class="v" id="statFaltan">0</div><div class="l">faltan</div></div>
          </div>
          <span class="sync-pill" id="syncPillParada" style="margin-bottom:8px;"><span class="dot"></span><span class="txt">Combinando con otros celulares…</span></span>
          <a href="#" id="toggleFaltan" style="display:block; color:var(--primary); font-weight:600; margin-top:6px;">Ver quiénes faltan ▾</a>
          <div id="listaFaltan" style="display:none; max-height:240px; overflow-y:auto; margin-top:8px;"></div>
        </div>

        <div class="card">
          <h2>Buscar manualmente</h2>
          <p class="muted">Si un QR no se puede leer, buscá por nombre o escribí el número de credencial.</p>
          <label class="field">
            <span>Número de credencial</span>
            <div class="row"><input type="tel" inputmode="numeric" id="inpNumeroManual" placeholder="Ej: 5 o 005"><button class="btn ok" style="margin:0;" id="btnBuscarNumero">Buscar</button></div>
          </label>
          <div class="divider"></div>
          <input type="search" id="buscarManual" placeholder="…o escribí un nombre">
          <div id="listaManual" style="max-height:240px; overflow-y:auto; margin-top:8px;"></div>
        </div>

        <div class="card">
          <h2>Últimos registrados acá</h2>
          <p class="muted">Incluye lo registrado por cualquier celular de esta parada.</p>
          <div id="listaRecientes"><div class="empty">Todavía no hay nadie registrado en esta parada.</div></div>
        </div>

        <div class="card">
          <button class="btn ghost" id="btnExportarRegistros">💾 Guardar una copia de respaldo en este celular</button>
        </div>
      </div>
    </div>
  `;

  wireCargaInicial();
  wireParadas();
  wireCamara();
  wireBusquedaManual();
  wireExportarBackup();

  if(!$('overlayConfirm')) crearOverlayConfirmacion();

  intentarCargaAutomatica();
  alVolverOnline(() => intentarCargaAutomatica());
  registrarForzarSync(async () => {
    if(peregrinosEscaneo == null) await intentarCargaAutomatica();
    if(state.paradaActual != null) await combinarConOtrosCelulares();
  });
}

function crearOverlayConfirmacion(){
  const div = document.createElement('div');
  div.id = 'overlayConfirm';
  div.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(17,24,39,.65); align-items:center; justify-content:center; z-index:70; padding:20px;';
  div.innerHTML = `
    <div style="background:var(--surface); border-radius:22px; padding:30px 22px; width:100%; max-width:380px; text-align:center; box-shadow:var(--elev-2);">
      <div id="confIcono" style="font-size:3rem; margin-bottom:8px;">✅</div>
      <div id="confAvatar" style="width:110px;height:110px;border-radius:50%;margin:0 auto 14px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:2rem;border:1px solid var(--outline);">?</div>
      <h3 id="confNombre" style="font-size:1.4rem; margin-bottom:4px;">—</h3>
      <div id="confId" class="muted" style="margin-bottom:6px;">—</div>
      <div id="confWarn" style="display:none; background:var(--danger-bg); color:var(--danger); border-radius:10px; padding:9px 12px; font-size:.85rem; margin-bottom:12px;"></div>
      <div id="confHora" class="muted" style="margin-bottom:16px;"></div>
      <button class="btn ok" id="btnConfirmarOk">✅ Confirmar</button>
      <button class="btn danger" id="btnQuitarRegistro" style="display:none;">🗑️ Sacar de esta parada (fue un error)</button>
      <button class="btn ghost" id="btnConfirmarCancelar">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
  $('btnConfirmarOk').addEventListener('click', onConfirmarOk);
  $('btnQuitarRegistro').addEventListener('click', onQuitarRegistro);
  $('btnConfirmarCancelar').addEventListener('click', closeConfirm);
  div.addEventListener('click', (e) => { if(e.target.id === 'overlayConfirm') closeConfirm(); });
}

// ---------- carga automática de la lista ----------
async function intentarCargaAutomatica(){
  if(peregrinosEscaneo != null) return; // ya la tenemos
  const { repo, branch, file } = ghConfig();
  if(!repo){ $('ghEstadoEscaneoInicial').textContent = 'Falta configurar el repositorio en ⚙️ Configuración.'; return; }
  $('ghEstadoEscaneoInicial').textContent = 'Trayendo la lista…';
  try{
    const data = await ghBajarJSON(repo, branch, file);
    const nueva = (data.peregrinos || []).map((p) => ({ id: p.id, nombre: p.nombre, foto: null, _tieneFoto: !!p.tieneFoto }));
    peregrinosEscaneo = nueva;
    mostrarPantallaConLista();
    renderFaltantes(); renderManual(); renderRecientes();
    const conFoto = nueva.filter((p) => p._tieneFoto);
    const incluirFotos = document.getElementById('chkBajarFotos')?.checked !== false;
    if(incluirFotos && conFoto.length > 0){
      await ejecutarEnLotes(conFoto, async (p) => {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/fotos/${p.id}.jpg`;
        p.foto = await fetchImageAsDataURL(url);
      }, 6, () => {});
    }
    renderFaltantes(); renderManual(); renderRecientes();
  }catch(err){
    $('ghEstadoEscaneoInicial').textContent = 'Todavía sin conexión — se va a completar sola apenas haya señal.';
  }
}
function mostrarPantallaConLista(){
  $('escaneoSinLista').style.display = 'none';
  $('escaneoConLista').style.display = 'block';
}
function wireCargaInicial(){
  $('btnImportarListaEscaneo').addEventListener('click', () => $('fileImportarListaEscaneo').click());
  $('fileImportarListaEscaneo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = await readFileAsJSON(f);
      peregrinosEscaneo = data.peregrinos || [];
      mostrarPantallaConLista();
      toast(`Lista cargada: ${peregrinosEscaneo.length} peregrinos`);
      renderFaltantes(); renderManual(); renderRecientes();
    }catch(err){ toast('Archivo inválido'); }
  });
}

// ---------- parada ----------
function wireParadas(){
  document.querySelectorAll('.parada-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.parada-btn').forEach((b) => b.classList.remove('primary'));
      btn.classList.add('primary');
      state.paradaActual = parseInt(btn.dataset.p, 10);
      misRegistros = []; peerRegistrosCache = [];
      $('paradaTitulo').textContent = 'Parada ' + state.paradaActual;
      $('paradaHint').textContent = 'Este celular está fijado en la Parada ' + state.paradaActual + '.';
      $('escaneoActivo').style.display = 'block';
      recombinar();
      renderFaltantes(); renderManual(); renderRecientes();
      iniciarPollingParada();
    });
  });
}

function iniciarPollingParada(){
  if(poller) poller.stop();
  poller = crearPoller(combinarConOtrosCelulares, 20000);
  poller.start();
}

async function combinarConOtrosCelulares(){
  const chequeo = verificarConfig();
  if(!chequeo.ok){
    $('syncPillParada').className = 'sync-pill offline';
    $('syncPillParada').querySelector('.txt').textContent = chequeo.motivo;
    return;
  }
  const { repo, branch, token } = ghConfig();
  if(state.paradaActual == null) return;
  const carpeta = `registros/parada_${state.paradaActual}`;
  $('syncPillParada').className = 'sync-pill pending';
  $('syncPillParada').querySelector('.txt').textContent = 'Combinando…';
  try{
    const archivos = await ghListarCarpeta(repo, branch, carpeta, token);
    const miArchivo = `${deviceId()}.json`;
    const otros = archivos.filter((a) => a.name !== miArchivo);
    const todos = [];
    for(const a of otros){
      try{
        const data = await ghBajarJSON(repo, branch, a.path);
        (data.registros || []).forEach((r) => todos.push(r));
      }catch(e){ /* ese archivo puntual falló, seguimos con los demás */ }
    }
    peerRegistrosCache = todos;
    recombinar();
    renderFaltantes(); renderManual(); renderRecientes();
    $('syncPillParada').className = 'sync-pill ok';
    $('syncPillParada').querySelector('.txt').textContent = 'Combinado con ' + otros.length + ' celular(es) más · ' + fmtTime(Date.now());
  }catch(err){
    $('syncPillParada').className = 'sync-pill offline';
    $('syncPillParada').querySelector('.txt').textContent = 'No se pudo combinar: ' + (err && err.message ? err.message : 'error desconocido');
  }
}

// combina lo mío + lo de los demás celulares de esta parada en la vista que usa toda la app
function recombinar(){
  if(state.paradaActual == null) return;
  const combinados = [...misRegistros];
  peerRegistrosCache.forEach((r) => {
    if(r.parada !== state.paradaActual) return;
    const existente = combinados.find((x) => x.peregrinoId === r.peregrinoId);
    if(!existente) combinados.push(r);
    else if(r.ts > existente.ts) existente.ts = r.ts;
  });
  state.registros = state.registros.filter((r) => r.parada !== state.paradaActual).concat(combinados);
}

// ---------- cámara ----------
function wireCamara(){
  scanner = makeScanner({
    videoId: 'video', canvasId: 'canvas', size: 420,
    onDetect: onCodeScanned,
    onError: () => toast('No se pudo acceder a la cámara'),
  });
  $('btnCamara').addEventListener('click', async () => {
    if(scanner.isRunning()){ scanner.stop(); $('btnCamara').textContent = '📷 Iniciar cámara'; return; }
    const ok = await scanner.start();
    if(ok) $('btnCamara').textContent = '⏹️ Detener cámara';
  });
}
export function detenerCamaraEscaneo(){
  if(scanner && scanner.isRunning()){ scanner.stop(); const b = $('btnCamara'); if(b) b.textContent = '📷 Iniciar cámara'; }
  if($('overlayConfirm') && $('overlayConfirm').style.display === 'flex') closeConfirm();
  if(poller) poller.stop();
}

function onCodeScanned(data, opts){
  opts = opts || {};
  if(!data.startsWith(PREFIX)) return;
  if(!opts.force){
    if($('overlayConfirm').style.display === 'flex') return;
    if(lastScan.code === data && (Date.now() - lastScan.ts) < SCAN_COOLDOWN_MS) return;
  }
  const p = listaActiva().find((x) => x.id === data);
  scanner.setPaused(true);
  $('camStatus').textContent = 'Código detectado';
  pendingScan = data;
  const yaExiste = state.registros.find((r) => r.peregrinoId === data && r.parada === state.paradaActual);
  $('confAvatar').innerHTML = p && p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂';
  $('confNombre').textContent = p && p.nombre ? p.nombre.toUpperCase() : (p ? 'Credencial sin nombre' : 'Credencial no encontrada');
  $('confId').textContent = `${data} · Parada ${state.paradaActual}`;
  $('confHora').textContent = fmtTime(Date.now());
  if(!p){
    $('confIcono').textContent = '❌';
    $('confWarn').style.display = 'block';
    $('confWarn').textContent = 'Este código no está en la lista importada.';
    $('btnConfirmarOk').style.display = 'none'; $('btnQuitarRegistro').style.display = 'none';
  } else if(!p.nombre){
    $('confIcono').textContent = '❌';
    $('confWarn').style.display = 'block';
    $('confWarn').textContent = 'Esta credencial todavía no tiene nombre asignado.';
    $('btnConfirmarOk').style.display = 'none'; $('btnQuitarRegistro').style.display = 'none';
  } else if(yaExiste){
    $('confIcono').textContent = '⚠️';
    $('confWarn').style.display = 'block';
    $('confWarn').textContent = 'YA ESTABA REGISTRADO — hace ' + Math.max(1, Math.round((Date.now() - yaExiste.ts) / 60000)) + ' min (a las ' + fmtTime(yaExiste.ts) + ').';
    $('btnConfirmarOk').style.display = 'inline-flex'; $('btnQuitarRegistro').style.display = 'inline-flex';
  } else {
    $('confIcono').textContent = '✅';
    $('confWarn').style.display = 'none';
    $('btnConfirmarOk').style.display = 'inline-flex'; $('btnQuitarRegistro').style.display = 'none';
  }
  $('overlayConfirm').style.display = 'flex';
}
function onConfirmarOk(){
  const now = Date.now();
  misRegistros = misRegistros.filter((r) => r.peregrinoId !== pendingScan);
  misRegistros.push({ peregrinoId: pendingScan, parada: state.paradaActual, ts: now });
  recombinar();
  closeConfirm();
  renderFaltantes(); renderManual(); renderRecientes();
  toast('Registrado ✔');
  dispararSubidaMia();
}
function onQuitarRegistro(){
  const nombreQuitado = $('confNombre').textContent;
  misRegistros = misRegistros.filter((r) => r.peregrinoId !== pendingScan);
  recombinar();
  closeConfirm();
  renderFaltantes(); renderManual(); renderRecientes();
  toast(`Registro eliminado: ${nombreQuitado}`);
  dispararSubidaMia();
}
function closeConfirm(){
  if(pendingScan) lastScan = { code: pendingScan, ts: Date.now() };
  $('overlayConfirm').style.display = 'none';
  pendingScan = null;
  scanner.setPaused(false);
  $('camStatus').textContent = 'Buscando código QR… (alejá el QR para escanear el siguiente)';
  setTimeout(() => { $('camStatus').textContent = 'Buscando código QR…'; }, SCAN_COOLDOWN_MS);
}

// ---------- faltantes / búsqueda / recientes ----------
function faltanList(){
  const pasaron = new Set(state.registros.filter((r) => r.parada === state.paradaActual).map((r) => r.peregrinoId));
  return listaActiva().filter((p) => p.nombre && !pasaron.has(p.id));
}
function renderFaltantes(){
  if(state.paradaActual == null) return;
  $('statPasaron').textContent = state.registros.filter((r) => r.parada === state.paradaActual).length;
  const falt = faltanList();
  $('statFaltan').textContent = falt.length;
  $('listaFaltan').innerHTML = falt.length
    ? falt.map((p) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--outline);">
        <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂'}</div>
        <div><div style="font-weight:600;">${escapeHtml(p.nombre)}</div><div class="muted" style="font-size:.75rem;">${p.id}</div></div>
      </div>`).join('')
    : '<div class="empty">Pasaron todos 🎉</div>';
}
document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'toggleFaltan'){
    e.preventDefault();
    const w = $('listaFaltan');
    const showing = w.style.display !== 'none';
    w.style.display = showing ? 'none' : 'block';
    e.target.textContent = showing ? 'Ver quiénes faltan ▾' : 'Ocultar ▴';
  }
});

function renderManual(){
  const q = $('buscarManual') ? $('buscarManual').value.trim().toLowerCase() : '';
  const wrap = $('listaManual');
  if(!wrap || state.paradaActual == null) return;
  if(!q){ wrap.innerHTML = '<div class="muted" style="padding:8px 0;">Escribí para buscar…</div>'; return; }
  const list = listaActiva().filter((p) => p.nombre && p.nombre.toLowerCase().includes(q));
  wrap.innerHTML = list.slice(0, 30).map((p) => {
    const ya = state.registros.find((r) => r.peregrinoId === p.id && r.parada === state.paradaActual);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--outline);">
      <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">${p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂'}</div>
      <div style="flex:1;"><div style="font-weight:600;">${escapeHtml(p.nombre)}</div><div class="muted" style="font-size:.75rem;">${p.id}${ya ? ' · ya pasó ' + fmtTime(ya.ts) : ''}</div></div>
      <button class="btn ${ya ? 'ghost' : 'ok'}" style="width:auto;margin:0;padding:8px 12px;" data-id="${p.id}">${ya ? '↻' : 'OK'}</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('button[data-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const now = Date.now();
      misRegistros = misRegistros.filter((r) => r.peregrinoId !== b.dataset.id);
      misRegistros.push({ peregrinoId: b.dataset.id, parada: state.paradaActual, ts: now });
      recombinar();
      renderManual(); renderFaltantes(); renderRecientes();
      toast('Registrado ✔');
      dispararSubidaMia();
    });
  });
}
function wireBusquedaManual(){
  $('buscarManual').addEventListener('input', renderManual);
  $('btnBuscarNumero').addEventListener('click', () => {
    if(state.paradaActual == null){ toast('Elegí una parada primero'); return; }
    const raw = $('inpNumeroManual').value.trim();
    const id = normalizarNumero(raw);
    if(!id){ toast('Ingresá solo el número (ej: 5)'); return; }
    $('inpNumeroManual').value = '';
    onCodeScanned(id, { force: true });
  });
  $('inpNumeroManual').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('btnBuscarNumero').click(); });
}

function renderRecientes(){
  const wrap = $('listaRecientes');
  if(!wrap) return;
  const list = state.registros.filter((r) => r.parada === state.paradaActual).sort((a, b) => b.ts - a.ts).slice(0, 15);
  if(list.length === 0){ wrap.innerHTML = '<div class="empty">Todavía no hay nadie registrado en esta parada.</div>'; return; }
  wrap.innerHTML = list.map((r) => {
    const p = listaActiva().find((x) => x.id === r.peregrinoId);
    const esMio = misRegistros.some((m) => m.peregrinoId === r.peregrinoId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--outline);">
      <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">${p && p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂'}</div>
      <div style="flex:1;"><div style="font-weight:600;">${p ? escapeHtml(p.nombre) : r.peregrinoId}</div><div class="muted" style="font-size:.75rem;">${fmtTime(r.ts)}${esMio ? '' : ' · otro celular'}</div></div>
      ${esMio ? `<button class="del-recientes" data-id="${r.peregrinoId}" title="Sacar" style="background:none;border:none;color:var(--danger);font-size:1.1rem;padding:6px;cursor:pointer;">✕</button>` : ''}
    </div>`;
  }).join('');
  wrap.querySelectorAll('.del-recientes').forEach((b) => {
    b.addEventListener('click', () => {
      misRegistros = misRegistros.filter((r) => r.peregrinoId !== b.dataset.id);
      recombinar();
      renderFaltantes(); renderManual(); renderRecientes();
      toast('Registro eliminado');
      dispararSubidaMia();
    });
  });
}

// ---------- subir (solo mi propio archivo) / backup local ----------
async function subirMisRegistros(){
  const { repo, branch, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  if(state.paradaActual == null || misRegistros.length === 0) return;
  await ghSubirJSON(repo, branch, `registros/parada_${state.paradaActual}/${deviceId()}.json`, token,
    { tipo: 'registros_parada', parada: state.paradaActual, dispositivo: deviceId(), generado: new Date().toISOString(), registros: misRegistros },
    `Actualizar registros propios de la parada ${state.paradaActual} (` + new Date().toLocaleString('es-AR') + ')');
}

function dispararSubidaMia(){
  const chequeo = verificarConfig();
  if(!chequeo.ok){
    $('syncPillParada').className = 'sync-pill offline';
    $('syncPillParada').querySelector('.txt').textContent = chequeo.motivo;
    return;
  }
  programarAutoSync('registros_' + state.paradaActual, subirMisRegistros, 3000);
}

function wireExportarBackup(){
  $('btnExportarRegistros').addEventListener('click', () => {
    if(state.paradaActual == null){ toast('Elegí una parada primero'); return; }
    downloadJSON({ tipo: 'registros_parada', parada: state.paradaActual, generado: new Date().toISOString(), registros: state.registros.filter((r) => r.parada === state.paradaActual) }, `registros_parada_${state.paradaActual}_respaldo.json`);
    toast('Respaldo guardado en el celular');
  });
}
