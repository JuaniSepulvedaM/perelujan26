// Módulo de Mochilas (Entrega 5): guardar (foto opcional + número), buscar
// (foto + estado + botón grande de entrega), sincronizar con GitHub.

import { $, escapeHtml, fmtTime, toast, resizeImage, downloadJSON, readFileAsJSON } from '../assets/js/utils.js';
import { state, normalizarNumero } from '../assets/js/storage.js';
import { makeScanner } from '../assets/js/camera.js';
import { ghConfig, ghBajarJSON, ghSubirJSON, ghSubirFoto, ejecutarEnLotes, fetchImageAsDataURL, programarAutoSync, alVolverOnline } from './github.js';

let peregrinosMochilas = [];
let fotoMochilaPendiente = null;
let mochilaEnVista = null;
let scannerGuardar = null, scannerBuscar = null;

function claveMochila(m){ return m.numero + '__' + m.horaGuardada; }
function nombreDeNumero(id){ const p = peregrinosMochilas.find((x) => x.id === id); return p && p.nombre ? p.nombre : null; }

export function init(){
  const el = document.getElementById('view-mochilas');
  el.innerHTML = `
    <div class="card">
      <h2>Peregrinos (opcional, para ver nombres)</h2>
      <p class="muted">Si tenés la lista, vas a ver el nombre del dueño de cada mochila además del número.</p>
      <button class="btn primary" id="btnGhBajarListaMochilas">⬇️ Bajar desde GitHub</button>
      <button class="btn ghost" id="btnImportarListaMochilas">📂 ...o importar desde un archivo</button>
      <input type="file" accept=".json" id="fileImportarListaMochilas" style="display:none;">
      <p class="muted" id="mochilasListaStatus">Sin lista importada — se va a mostrar solo el número.</p>
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
      <p class="muted">Tocá una para buscarla.</p>
      <div id="listaMochilasActivas"><div class="empty"><span class="ic">🎒</span>No hay mochilas guardadas.</div></div>
    </div>

    <div class="card">
      <h2>Datos de mochilas</h2>
      <button class="btn" id="btnExportarMochilas">💾 Descargar datos (mochilas.json)</button>
      <button class="btn ghost" id="btnImportarMochilas">📂 Importar datos existentes</button>
      <input type="file" accept=".json" id="fileImportarMochilas" style="display:none;">
    </div>

    <div class="card">
      <h2>🔄 Sincronizar con GitHub</h2>
      <button class="btn" id="btnGhBajarMochilas">⬇️ Bajar la última versión</button>
      <button class="btn primary" id="btnGhSubirMochilas">⬆️ Subir cambios</button>
      <p class="muted" id="ghEstadoMochilas">Todavía no sincronizaste en esta sesión.</p>
    </div>
  `;

  wireListaPeregrinos();
  wireGuardar();
  wireBuscar();
  wireDatos();
  wireGithub();
  renderMochilasActivas();

  alVolverOnline(() => {
    if(state.mochilas.length > 0) programarAutoSync('mochilas', subirMochilasSilencioso, 1400);
  });
}

export function detenerCamarasMochilas(){
  if(scannerGuardar){ scannerGuardar.stop(); const w = $('camMochilaGuardarWrap'); if(w) w.style.display = 'none'; }
  if(scannerBuscar){ scannerBuscar.stop(); const w = $('camMochilaBuscarWrap'); if(w) w.style.display = 'none'; }
}

function wireListaPeregrinos(){
  $('btnGhBajarListaMochilas').addEventListener('click', async () => {
    const { repo, branch, file } = ghConfig();
    if(!repo){ toast('Repositorio no configurado en ⚙️ Configuración'); return; }
    $('mochilasListaStatus').textContent = 'Bajando…';
    try{
      const data = await ghBajarJSON(repo, branch, file);
      peregrinosMochilas = (data.peregrinos || []).map((p) => ({ id: p.id, nombre: p.nombre }));
      $('mochilasListaStatus').textContent = `Lista actualizada a las ${fmtTime(Date.now())}: ${peregrinosMochilas.length} personas.`;
      renderMochilasActivas();
      toast('Lista actualizada desde GitHub');
    }catch(err){
      $('mochilasListaStatus').textContent = 'No se pudo bajar (¿hay conexión?).';
      toast('Error al bajar de GitHub');
    }
  });
  $('btnImportarListaMochilas').addEventListener('click', () => $('fileImportarListaMochilas').click());
  $('fileImportarListaMochilas').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = await readFileAsJSON(f);
      peregrinosMochilas = data.peregrinos || [];
      $('mochilasListaStatus').textContent = `Lista importada: ${peregrinosMochilas.length} personas.`;
      renderMochilasActivas();
      toast('Lista importada');
    }catch(err){ toast('Archivo inválido'); }
  });
}

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
    const nuevaMochila = { numero: id, foto: fotoMochilaPendiente, horaGuardada: Date.now(), horaRetirada: null };
    state.mochilas.push(nuevaMochila);
    if(nuevaMochila.foto) state.mochilasPendientesSubir.add(claveMochila(nuevaMochila));
    fotoMochilaPendiente = null;
    $('inpNumeroMochila').value = ''; $('inpFotoMochila').value = '';
    $('fotoMochilaPreviewWrap').style.display = 'none';
    renderMochilasActivas();
    const nombre = nombreDeNumero(id);
    toast(`Mochila guardada: ${id}${nombre ? ' — ' + nombre : ''}${nuevaMochila.foto ? '' : ' (sin foto)'}`);
    programarAutoSync('mochilas', subirMochilasSilencioso, 3000);
  });
}

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
    else { $('resMochilaFoto').style.display = 'none'; $('resMochilaIconoGrande').style.display = 'block'; }
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
    mochilaEnVista.horaRetirada = Date.now();
    toast('Marcada como retirada ✔');
    buscarMochila(mochilaEnVista.numero);
    renderMochilasActivas();
    programarAutoSync('mochilas', subirMochilasSilencioso, 3000);
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

function wireDatos(){
  $('btnExportarMochilas').addEventListener('click', () => {
    if(state.mochilas.length === 0){ toast('No hay datos de mochilas para exportar'); return; }
    downloadJSON({ tipo: 'mochilas', generado: new Date().toISOString(), mochilas: state.mochilas }, 'mochilas.json');
  });
  $('btnImportarMochilas').addEventListener('click', () => $('fileImportarMochilas').click());
  $('fileImportarMochilas').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = await readFileAsJSON(f);
      state.mochilas = data.mochilas || [];
      renderMochilasActivas();
      toast(`Importados ${state.mochilas.length} registros de mochilas`);
    }catch(err){ toast('Archivo inválido'); }
  });
}

async function subirMochilas(mostrarToast){
  const { repo, branch, token } = ghConfig();
  if(!repo || !token) throw new Error('Falta repositorio o token');
  if(state.mochilas.length === 0) return;
  $('ghEstadoMochilas').textContent = 'Subiendo datos…';
  const metaMochilas = state.mochilas.map((m) => ({ numero: m.numero, horaGuardada: m.horaGuardada, horaRetirada: m.horaRetirada, tieneFoto: !!m.foto }));
  await ghSubirJSON(repo, branch, 'mochilas.json', token,
    { tipo: 'mochilas', generado: new Date().toISOString(), mochilas: metaMochilas },
    'Actualizar datos de mochilas (' + new Date().toLocaleString('es-AR') + ')');
  const pendientes = [...state.mochilasPendientesSubir].filter((clave) => state.mochilas.some((m) => claveMochila(m) === clave && m.foto));
  if(pendientes.length === 0){
    $('ghEstadoMochilas').textContent = 'Subido correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.mochilas.length + ' registros (sin fotos nuevas).';
    if(mostrarToast) toast('Mochilas subidas a GitHub ✔');
    return;
  }
  const errores = await ejecutarEnLotes(pendientes, async (clave) => {
    const m = state.mochilas.find((x) => claveMochila(x) === clave);
    await ghSubirFoto(repo, branch, `mochilas-fotos/${clave}.jpg`, token, m.foto, `Foto de mochila ${m.numero}`);
    state.mochilasPendientesSubir.delete(clave);
  }, 4, (completados, total) => { $('ghEstadoMochilas').textContent = `Subiendo fotos… ${completados}/${total}`; });
  if(errores.length > 0){
    $('ghEstadoMochilas').textContent = `Subido con errores: ${pendientes.length - errores.length} fotos ok, ${errores.length} fallaron. Se reintentará solo.`;
    if(mostrarToast) toast('Algunas fotos no se pudieron subir');
  } else {
    $('ghEstadoMochilas').textContent = 'Subido correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.mochilas.length + ' registros, ' + pendientes.length + ' fotos nuevas.';
    if(mostrarToast) toast('Mochilas subidas a GitHub ✔');
  }
}
async function subirMochilasSilencioso(){ await subirMochilas(false); }

function wireGithub(){
  $('btnGhBajarMochilas').addEventListener('click', async () => {
    const { repo, branch } = ghConfig();
    if(!repo){ toast('Completá el repositorio en Configuración'); return; }
    if(state.mochilas.length > 0){
      const ok = confirm('Esto va a reemplazar los datos de mochilas que tenés cargados ahora por la versión de GitHub. ¿Continuar?');
      if(!ok) return;
    }
    $('ghEstadoMochilas').textContent = 'Bajando datos…';
    try{
      const data = await ghBajarJSON(repo, branch, 'mochilas.json');
      state.mochilas = (data.mochilas || []).map((m) => ({ numero: m.numero, horaGuardada: m.horaGuardada, horaRetirada: m.horaRetirada || null, foto: null, _tieneFoto: !!m.tieneFoto }));
      state.mochilasPendientesSubir.clear();
      renderMochilasActivas();
      const conFoto = state.mochilas.filter((m) => m._tieneFoto);
      if(conFoto.length > 0){
        const errores = await ejecutarEnLotes(conFoto, async (m) => {
          const url = `https://raw.githubusercontent.com/${repo}/${branch}/mochilas-fotos/${claveMochila(m)}.jpg`;
          m.foto = await fetchImageAsDataURL(url);
        }, 6, (completados, total) => {
          $('ghEstadoMochilas').textContent = `Bajando fotos… ${completados}/${total}`;
          if(completados % 10 === 0 || completados === total) renderMochilasActivas();
        });
        renderMochilasActivas();
        $('ghEstadoMochilas').textContent = 'Bajado correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.mochilas.length + ' registros' + (errores.length ? `, ${conFoto.length - errores.length} fotos (${errores.length} fallaron)` : `, ${conFoto.length} fotos`) + '.';
      } else {
        $('ghEstadoMochilas').textContent = 'Bajado correctamente a las ' + fmtTime(Date.now()) + ' · ' + state.mochilas.length + ' registros (sin fotos).';
      }
      toast('Mochilas actualizadas desde GitHub');
    }catch(err){
      $('ghEstadoMochilas').textContent = 'No se pudo bajar (¿hay conexión?).';
      toast('Error al bajar de GitHub');
    }
  });
  $('btnGhSubirMochilas').addEventListener('click', async () => {
    const { repo, token } = ghConfig();
    if(!repo){ toast('Completá el repositorio en Configuración'); return; }
    if(!token){ toast('Pegá tu token en Configuración'); return; }
    if(state.mochilas.length === 0){ toast('No hay nada para subir todavía'); return; }
    try{ await subirMochilas(true); }
    catch(err){ $('ghEstadoMochilas').textContent = 'Error al subir: ' + err.message; toast('Error al subir a GitHub'); }
  });
}
