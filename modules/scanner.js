// Módulo de Escaneo (Entrega 3): cámara, confirmación grande, control por parada.

import { $, escapeHtml, fmtTime, toast, downloadJSON, readFileAsJSON } from '../assets/js/utils.js';
import { state, PREFIX, normalizarNumero } from '../assets/js/storage.js';
import { makeScanner } from '../assets/js/camera.js';
import { ghConfig, ghBajarJSON, ghSubirJSON, ejecutarEnLotes, fetchImageAsDataURL, programarAutoSync, alVolverOnline } from './github.js';

let peregrinosEscaneo = null; // null = todavía no se cargó nada
let scanner = null;
let pendingScan = null;
let lastScan = { code: null, ts: 0 };
const SCAN_COOLDOWN_MS = 4000;

function listaActiva(){ return peregrinosEscaneo || state.peregrinos; }

export function init(){
  const el = document.getElementById('view-escaneo');
  el.innerHTML = `
    <div class="card" id="escaneoSinLista">
      <h2>Traer lista de peregrinos</h2>
      <p class="muted">Este celular necesita la lista para poder mostrar nombre y foto al escanear.</p>
      <button class="btn primary" id="btnGhBajarListaEscaneoInicial">⬇️ Bajar desde GitHub</button>
      <p class="muted" id="ghEstadoEscaneoInicial" style="margin-top:6px;"></p>
      <div class="divider"></div>
      <p class="muted">...o si no usás GitHub:</p>
      <button class="btn ghost" id="btnImportarListaEscaneo">📂 Importar peregrinos.json desde un archivo</button>
      <input type="file" accept=".json" id="fileImportarListaEscaneo" style="display:none;">
    </div>

    <div id="escaneoConLista" style="display:none;">
      <div class="card" id="paradaCard">
        <h2>¿Qué parada es este celular?</h2>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">
          ${[1,2,3,4].map(n => `<button class="btn ghost parada-btn" data-p="${n}" style="margin:0;">Parada ${n}</button>`).join('')}
        </div>
        <p class="muted" id="paradaHint">Elegí la parada una vez y dejá este celular fijo ahí.</p>
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
          <a href="#" id="toggleFaltan" style="color:var(--primary); font-weight:600;">Ver quiénes faltan ▾</a>
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
          <div id="listaRecientes"><div class="empty">Todavía no registraste a nadie en esta parada.</div></div>
        </div>

        <div class="card">
          <button class="btn primary" id="btnExportarRegistros">💾 Exportar registros de esta parada</button>
        </div>

        <div class="card">
          <h2>🔄 Sincronizar con GitHub</h2>
          <button class="btn" id="btnGhBajarListaEscaneo">⬇️ Bajar lista de peregrinos actualizada</button>
          <button class="btn primary" id="btnGhSubirRegistros">⬆️ Subir registros de esta parada</button>
          <p class="muted" id="ghEstadoEscaneo">Todavía no sincronizaste en esta sesión.</p>
        </div>
      </div>
    </div>
  `;

  wireCargaInicial();
  wireParadas();
  wireCamara();
  wireBusquedaManual();
  wireExportarYSync();

  if(!$('overlayConfirm')) crearOverlayConfirmacion();

  alVolverOnline(() => {
    if(state.paradaActual != null) programarAutoSync('registros_' + state.paradaActual, () => subirRegistrosSilencioso(state.paradaActual), 1200);
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

// ---------- carga inicial de la lista ----------
async function bajarListaDesdeGitHub(estadoElId){
  const { repo, branch, file } = ghConfig();
  if(!repo){ toast('Repositorio no configurado en ⚙️ Configuración'); return; }
  $(estadoElId).textContent = 'Bajando lista…';
  try{
    const data = await ghBajarJSON(repo, branch, file);
    const nueva = (data.peregrinos || []).map((p) => ({ id: p.id, nombre: p.nombre, foto: null, _tieneFoto: !!p.tieneFoto }));
    peregrinosEscaneo = nueva;
    mostrarPantallaConLista();
    renderFaltantes(); renderManual(); renderRecientes();
    const conFoto = nueva.filter((p) => p._tieneFoto);
    if(conFoto.length > 0){
      await ejecutarEnLotes(conFoto, async (p) => {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/fotos/${p.id}.jpg`;
        p.foto = await fetchImageAsDataURL(url);
      }, 6, (completados, total) => { $(estadoElId).textContent = `Bajando fotos… ${completados}/${total}`; });
    }
    renderFaltantes(); renderManual(); renderRecientes();
    $(estadoElId).textContent = `Lista actualizada a las ${fmtTime(Date.now())} · ${nueva.length} credenciales, ${conFoto.length} fotos.`;
    toast('Lista actualizada desde GitHub');
  }catch(err){
    $(estadoElId).textContent = 'No se pudo bajar (¿hay conexión? ¿está el archivo en el repo?).';
    toast('Error al bajar de GitHub');
  }
}
function mostrarPantallaConLista(){
  $('escaneoSinLista').style.display = 'none';
  $('escaneoConLista').style.display = 'block';
}
function wireCargaInicial(){
  $('btnGhBajarListaEscaneoInicial').addEventListener('click', () => bajarListaDesdeGitHub('ghEstadoEscaneoInicial'));
  $('btnGhBajarListaEscaneo').addEventListener('click', () => bajarListaDesdeGitHub('ghEstadoEscaneo'));
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
      $('paradaTitulo').textContent = 'Parada ' + state.paradaActual;
      $('paradaHint').textContent = 'Este celular está fijado en la Parada ' + state.paradaActual + '.';
      $('escaneoActivo').style.display = 'block';
      renderFaltantes(); renderManual(); renderRecientes();
    });
  });
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
  state.registros = state.registros.filter((r) => !(r.peregrinoId === pendingScan && r.parada === state.paradaActual));
  state.registros.push({ peregrinoId: pendingScan, parada: state.paradaActual, ts: now });
  closeConfirm();
  renderFaltantes(); renderManual(); renderRecientes();
  toast('Registrado ✔');
  programarAutoSync('registros_' + state.paradaActual, () => subirRegistrosSilencioso(state.paradaActual), 3000);
}
function onQuitarRegistro(){
  const nombreQuitado = $('confNombre').textContent;
  state.registros = state.registros.filter((r) => !(r.peregrinoId === pendingScan && r.parada === state.paradaActual));
  closeConfirm();
  renderFaltantes(); renderManual(); renderRecientes();
  toast(`Registro eliminado: ${nombreQuitado}`);
  programarAutoSync('registros_' + state.paradaActual, () => subirRegistrosSilencioso(state.paradaActual), 3000);
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
      state.registros = state.registros.filter((r) => !(r.peregrinoId === b.dataset.id && r.parada === state.paradaActual));
      state.registros.push({ peregrinoId: b.dataset.id, parada: state.paradaActual, ts: now });
      renderManual(); renderFaltantes(); renderRecientes();
      toast('Registrado ✔');
      programarAutoSync('registros_' + state.paradaActual, () => subirRegistrosSilencioso(state.paradaActual), 3000);
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
  if(list.length === 0){ wrap.innerHTML = '<div class="empty">Todavía no registraste a nadie en esta parada.</div>'; return; }
  wrap.innerHTML = list.map((r) => {
    const p = listaActiva().find((x) => x.id === r.peregrinoId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--outline);">
      <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">${p && p.foto ? `<img src="${p.foto}" style="width:100%;height:100%;object-fit:cover;">` : '🙂'}</div>
      <div style="flex:1;"><div style="font-weight:600;">${p ? escapeHtml(p.nombre) : r.peregrinoId}</div><div class="muted" style="font-size:.75rem;">${fmtTime(r.ts)}</div></div>
      <button class="del-recientes" data-id="${r.peregrinoId}" title="Sacar" style="background:none;border:none;color:var(--danger);font-size:1.1rem;padding:6px;cursor:pointer;">✕</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.del-recientes').forEach((b) => {
    b.addEventListener('click', () => {
      state.registros = state.registros.filter((r) => !(r.peregrinoId === b.dataset.id && r.parada === state.paradaActual));
      renderFaltantes(); renderManual(); renderRecientes();
      toast('Registro eliminado');
      programarAutoSync('registros_' + state.paradaActual, () => subirRegistrosSilencioso(state.paradaActual), 3000);
    });
  });
}

// ---------- exportar / GitHub ----------
async function subirRegistros(parada, mostrarToast){
  const { repo, branch, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  const registrosDeEsta = state.registros.filter((r) => r.parada === parada);
  if(registrosDeEsta.length === 0) return;
  $('ghEstadoEscaneo').textContent = 'Subiendo…';
  await ghSubirJSON(repo, branch, `registros_parada_${parada}.json`, token,
    { tipo: 'registros_parada', parada, generado: new Date().toISOString(), registros: registrosDeEsta },
    `Actualizar registros de la parada ${parada} (` + new Date().toLocaleString('es-AR') + ')');
  $('ghEstadoEscaneo').textContent = (mostrarToast ? 'Subido correctamente' : '🔄 Auto-sincronizado') + ' a las ' + fmtTime(Date.now()) + ' · ' + registrosDeEsta.length + ' registros.';
  if(mostrarToast) toast('Registros subidos a GitHub ✔');
}
async function subirRegistrosSilencioso(parada){ await subirRegistros(parada, false); }

function wireExportarYSync(){
  $('btnExportarRegistros').addEventListener('click', () => {
    if(state.paradaActual == null){ toast('Elegí una parada primero'); return; }
    downloadJSON({ tipo: 'registros_parada', parada: state.paradaActual, generado: new Date().toISOString(), registros: state.registros.filter((r) => r.parada === state.paradaActual) }, `registros_parada_${state.paradaActual}.json`);
    toast('Exportado');
  });
  $('btnGhSubirRegistros').addEventListener('click', async () => {
    if(state.paradaActual == null){ toast('Elegí una parada primero'); return; }
    const { repo, token } = ghConfig();
    if(!repo){ toast('Completá el repositorio en Configuración'); return; }
    if(!token){ toast('Pegá tu token en Configuración'); return; }
    if(state.registros.filter((r) => r.parada === state.paradaActual).length === 0){ toast('Todavía no hay registros para subir'); return; }
    try{ await subirRegistros(state.paradaActual, true); }
    catch(err){ $('ghEstadoEscaneo').textContent = 'Error al subir: ' + err.message; toast('Error al subir a GitHub'); }
  });
}
