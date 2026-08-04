// Módulo de sincronización con GitHub (Entrega 6).
//
// Guarda el peregrinos.json / mochilas.json / registros_parada_N.json como
// archivos de texto livianos, y cada foto como su propio archivito
// (fotos/{id}.jpg, mochilas-fotos/{clave}.jpg) para no chocar con el límite
// de 1MB por archivo de la API simple de GitHub.

import { $, fmtTime, toast } from '../assets/js/utils.js';
import { getSetting, setSetting } from '../assets/js/storage.js';

// El token de GitHub NUNCA se guarda en el código: vive solo en el campo
// de Configuración de cada celular (localStorage vía getSetting/setSetting).
// Ver ghConfig() más abajo.

export function init(){
  const el = document.getElementById('view-config-content');
  el.innerHTML = `
    <div class="card">
      <h2>Apariencia</h2>
      <p class="muted">El botón 🌙/☀️ del encabezado cambia entre tema claro y oscuro. Se recuerda para la próxima vez que abras la app en este celular.</p>
    </div>

    <div class="card">
      <h2>🔄 Sincronización con GitHub</h2>
      <p class="muted">Usá el mismo repositorio en todos los celulares (Registro, las paradas de Escaneo, y Mochilas). La sincronización es siempre automática: no hay que bajar ni subir nada a mano en ningún lado de la app.</p>
      <label class="field">
        <span>Repositorio (usuario/repo)</span>
        <input type="text" id="ghRepo" placeholder="JuaniSepulvedaM/perelujan26" value="JuaniSepulvedaM/perelujan26">
      </label>
      <div class="row">
        <label class="field"><span>Rama</span><input type="text" id="ghBranch" value="main"></label>
        <label class="field"><span>Archivo de peregrinos</span><input type="text" id="ghFile" value="peregrinos.json"></label>
      </div>
      <label class="field">
  <span>Token de GitHub (opcional)</span>
  <input
    type="password"
    id="ghToken"
    placeholder="Vacío = usar el token incorporado"
    autocomplete="off">
</label>
      <p class="muted">Hace falta en <b>todos</b> los celulares (no solo para subir): también se usa para bajar y combinar automáticamente lo que suben los demás. Se guarda solo en este celular (para que sobreviva si el navegador se reinicia solo) — nunca en el código ni compartido con nadie más. <a href="#" id="linkComoToken" style="color:var(--primary); font-weight:600;">¿Cómo genero un token?</a></p>
      <label class="field">
        <span><input type="checkbox" id="chkBajarFotos" checked> Incluir fotos al combinar (más lento cuando hay muchas)</span>
      </label>
      <p class="muted" id="ghEstadoGlobal">Todavía no sincronizaste en esta sesión.</p>
      <button class="btn ghost" id="btnForzarSync">🔄 Forzar sincronización ahora</button>
      <p class="muted">Normalmente no hace falta tocar esto — es solo para el caso de que algo parezca trabado.</p>
    </div>

    <div class="card">
      <h2>Acerca de</h2>
      <p class="muted">Camino a Luján — control de peregrinos, paradas y mochilas. Funciona sin conexión; la sincronización con GitHub necesita internet y sucede sola en segundo plano.</p>
    </div>
  `;
  ['ghRepo','ghBranch','ghFile'].forEach((id) => {
    const guardado = getSetting(id, null);
    if(guardado) $(id).value = guardado;
    $(id).addEventListener('input', () => setSetting(id, $(id).value.trim()));
});

// Token opcional
$('ghToken').value = getSetting('ghToken', '');

$('ghToken').addEventListener('input', () => {
    setSetting('ghToken', $('ghToken').value.trim());
});
  const chkGuardado = getSetting('chkBajarFotos', true);
  $('chkBajarFotos').checked = chkGuardado;
  $('chkBajarFotos').addEventListener('change', () => setSetting('chkBajarFotos', $('chkBajarFotos').checked));

  $('linkComoToken').addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      'Cómo generar un token de GitHub:\n\n' +
      '1) Entrá a github.com con tu cuenta.\n' +
      '2) Andá a Settings → Developer settings → Personal access tokens → Fine-grained tokens.\n' +
      '3) Creá uno nuevo, elegí SOLO el repositorio de la peregrinación.\n' +
      '4) En permisos, dale acceso de lectura y escritura a "Contents".\n' +
      '5) Copiá el token generado y pegalo acá en cada celular. Empieza con "github_pat_" o "ghp_".\n\n' +
      'Guardalo en un lugar seguro (por ej. tu gestor de contraseñas): GitHub solo lo muestra una vez.\n\n' +
      'IMPORTANTE: nunca lo compartas por chat ni lo escribas en ningún archivo de código — cualquiera con el token puede escribir en tu repositorio.'
    );
  });
  $('btnForzarSync').addEventListener('click', async () => {
    $('ghEstadoGlobal').textContent = 'Forzando sincronización…';
    await Promise.all(callbacksForzar.map((fn) => fn().catch(() => {})));
    $('ghEstadoGlobal').textContent = 'Listo, ' + new Date().toLocaleTimeString('es-AR');
    toast('Sincronización forzada ✔');
  });
}

// Lee la configuración de sincronización guardada en este celular
// (repositorio, rama, archivo de peregrinos y token). Faltaba esta función:
// todos los módulos la importaban pero nunca estaba definida acá.
export function ghConfig(){
  return {
    repo: getSetting('ghRepo', 'JuaniSepulvedaM/perelujan26'),
    branch: getSetting('ghBranch', 'main'),
    file: getSetting('ghFile', 'peregrinos.json'),
    token: getSetting('ghToken', ''),
  };
}

// chequeo explícito para poder avisar CLARAMENTE en pantalla cuando falta algo,
// en vez de que la sincronización falle calladamente y nadie entienda por qué.
export function verificarConfig(){
  const { repo, token } = ghConfig();
  if(!repo) return { ok: false, motivo: 'Falta el repositorio — configuralo en ⚙️ Configuración.' };
  if(!token) return { ok: false, motivo: 'Falta el token de GitHub en ESTE celular — cargalo en ⚙️ Configuración (hace falta en todos los celulares, no solo en uno).' };
  return { ok: true, motivo: '' };
}

export function incluirFotosAlBajar(){
  return $('chkBajarFotos') ? $('chkBajarFotos').checked : true;
}

function reportarEstadoGlobal(texto){
  const el = $('ghEstadoGlobal');
  if(el) el.textContent = texto;
}

function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}

export function dataURLtoRawBase64(dataUrl){
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export async function fetchImageAsDataURL(url){
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
  if(!res.ok){ const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// corre `worker` sobre cada item con un máximo de `concurrencia` en paralelo, informando progreso
export async function ejecutarEnLotes(items, worker, concurrencia, onProgreso){
  let i = 0, completados = 0;
  const errores = [];
  async function siguiente(){
    while(i < items.length){
      const idx = i++;
      try{ await worker(items[idx], idx); }
      catch(err){ errores.push({item: items[idx], err}); }
      completados++;
      if(onProgreso) onProgreso(completados, items.length);
    }
  }
  const n = Math.max(1, Math.min(concurrencia, items.length));
  await Promise.all(Array.from({length: n}, siguiente));
  return errores;
}

// baja un JSON público del repo (no necesita token)
export async function ghBajarJSON(repo, branch, file){
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}?t=${Date.now()}`;
  const res = await fetch(url);
  if(!res.ok){ const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  return await res.json();
}

// lista los archivos dentro de una carpeta del repo (para combinar el archivo de
// cada dispositivo). Devuelve [] si la carpeta todavía no existe (nadie subió nada ahí).
export async function ghListarCarpeta(repo, branch, path, token){
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const headers = { 'Accept': 'application/vnd.github+json' };
  if(token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(apiUrl, { headers });
  if(res.status === 404) return [];
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data.filter((f) => f.name.endsWith('.json')) : [];
}

// arranca/detiene una tarea periódica en segundo plano (para combinar datos de
// otros dispositivos cada tanto). Se salta silenciosamente si no hay conexión.
export function crearPoller(fn, intervalMs){
  let handle = null;
  return {
    start(){
      if(handle) return;
      const tick = async () => { try{ await fn(); }catch(e){} };
      tick();
      handle = setInterval(tick, intervalMs);
    },
    stop(){ clearInterval(handle); handle = null; },
  };
}

// sube/actualiza contenido crudo en base64 (sirve para JSON o fotos). Reintenta
// solo si GitHub avisa que el archivo cambió justo antes (otro dispositivo subiendo
// al mismo tiempo) — vuelve a traer el sha más nuevo y reintenta.
export async function ghSubirContenido(repo, branch, file, token, base64Content, mensaje, intento){
  intento = intento || 0;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${file}`;
  const authHeaders = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
  let sha = null;
  const getRes = await fetch(apiUrl + '?ref=' + encodeURIComponent(branch), {headers: authHeaders});
  if(getRes.ok){ sha = (await getRes.json()).sha; }
  else if(getRes.status !== 404){ throw new Error('No se pudo leer el archivo actual (HTTP ' + getRes.status + ')'); }
  const body = { message: mensaje, content: base64Content, branch };
  if(sha) body.sha = sha;
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {...authHeaders, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if(!putRes.ok){
    const errData = await putRes.json().catch(() => ({}));
    const msg = errData.message || ('HTTP ' + putRes.status);
    if(/does not match|sha/i.test(msg) && intento < 4){
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 500));
      return ghSubirContenido(repo, branch, file, token, base64Content, mensaje, intento + 1);
    }
    throw new Error(msg);
  }
  return true;
}

export async function ghSubirJSON(repo, branch, file, token, dataObj, mensaje){
  return ghSubirContenido(repo, branch, file, token, utf8ToBase64(JSON.stringify(dataObj, null, 2)), mensaje);
}

export async function ghSubirFoto(repo, branch, rutaFoto, token, dataUrlFoto, mensaje){
  return ghSubirContenido(repo, branch, rutaFoto, token, dataURLtoRawBase64(dataUrlFoto), mensaje);
}

// ---------- auto-sync en segundo plano (siempre activo) ----------
const autoSyncTimers = {};
const autoSyncEnCurso = new Set();

export function programarAutoSync(key, fn, delay){
  const {repo, token} = ghConfig();
  if(!repo || !token) return;
  clearTimeout(autoSyncTimers[key]);
  autoSyncTimers[key] = setTimeout(async () => {
    if(autoSyncEnCurso.has(key)){ programarAutoSync(key, fn, 1500); return; }
    autoSyncEnCurso.add(key);
    try{ await fn(); }
    catch(err){ /* silencioso: probablemente sin conexión, se reintenta en el próximo cambio */ }
    finally{ autoSyncEnCurso.delete(key); }
  }, delay || 3000);
}

const reintentosAlVolverOnline = [];
export function alVolverOnline(fn){ reintentosAlVolverOnline.push(fn); }
window.addEventListener('online', () => {
  reintentosAlVolverOnline.forEach((fn) => { try{ fn(); }catch(e){} });
});

// callbacks que corre el botón "Forzar sincronización ahora" de Configuración
const callbacksForzar = [];
export function registrarForzarSync(fn){ callbacksForzar.push(fn); }

export { reportarEstadoGlobal };
