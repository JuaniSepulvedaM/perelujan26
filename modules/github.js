// Módulo de sincronización con GitHub (Entrega 6).
//
// Guarda el peregrinos.json / mochilas.json / registros_parada_N.json como
// archivos de texto livianos, y cada foto como su propio archivito
// (fotos/{id}.jpg, mochilas-fotos/{clave}.jpg) para no chocar con el límite
// de 1MB por archivo de la API simple de GitHub.

import { $, fmtTime, toast } from '../assets/js/utils.js';

export function init(){
  const el = document.getElementById('view-config-content');
  el.innerHTML = `
    <div class="card">
      <h2>Apariencia</h2>
      <p class="muted">El botón 🌙/☀️ del encabezado cambia entre tema claro y oscuro. Se recuerda para la próxima vez que abras la app en este celular.</p>
    </div>

    <div class="card">
      <h2>🔄 Sincronización con GitHub</h2>
      <p class="muted">Usá el mismo repositorio en todos los celulares (Registro, las 4 paradas de Escaneo, y Mochilas) para compartir la misma base de datos.</p>
      <label class="field">
        <span>Repositorio (usuario/repo)</span>
        <input type="text" id="ghRepo" placeholder="JuaniSepulvedaM/perelujan26" value="JuaniSepulvedaM/perelujan26">
      </label>
      <div class="row">
        <label class="field"><span>Rama</span><input type="text" id="ghBranch" value="main"></label>
        <label class="field"><span>Archivo de peregrinos</span><input type="text" id="ghFile" value="peregrinos.json"></label>
      </div>
      <label class="field">
        <span>Token personal de GitHub (solo hace falta para subir cambios)</span>
        <input type="password" id="ghToken" placeholder="ghp_xxxxxxxxxxxx">
      </label>
      <p class="muted">El token no se guarda en ningún lado ni queda en el código de la app: solo vive en la memoria del navegador mientras esta pestaña esté abierta. <a href="#" id="linkComoToken" style="color:var(--primary); font-weight:600;">¿Cómo genero un token?</a></p>
      <label class="field">
        <span><input type="checkbox" id="chkAutoSync" checked> Sincronizar automáticamente en segundo plano cuando haya conexión — no hace falta tocar "Subir" cada vez</span>
      </label>
      <label class="field">
        <span><input type="checkbox" id="chkBajarFotos" checked> Incluir fotos al bajar (más lento cuando hay muchas)</span>
      </label>
      <p class="muted" id="ghEstadoGlobal">Todavía no sincronizaste en esta sesión.</p>
    </div>

    <div class="card">
      <h2>Acerca de</h2>
      <p class="muted">Camino a Luján — control de peregrinos, paradas y mochilas. Funciona sin conexión; la sincronización con GitHub necesita internet.</p>
    </div>
  `;
  $('linkComoToken').addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      'Cómo generar un token de GitHub:\n\n' +
      '1) Entrá a github.com con tu cuenta.\n' +
      '2) Andá a Settings → Developer settings → Personal access tokens → Fine-grained tokens.\n' +
      '3) Creá uno nuevo, elegí SOLO el repositorio de la peregrinación.\n' +
      '4) En permisos, dale acceso de lectura y escritura a "Contents".\n' +
      '5) Copiá el token generado y pegalo acá. Empieza con "github_pat_" o "ghp_".\n\n' +
      'Guardalo en un lugar seguro (por ej. tu gestor de contraseñas): GitHub solo lo muestra una vez.\n\n' +
      'IMPORTANTE: nunca lo compartas por chat ni lo escribas en ningún archivo de código — cualquiera con el token puede escribir en tu repositorio.'
    );
  });
}

export function ghConfig(){
  return {
    repo: $('ghRepo')?.value.trim() || '',
    branch: $('ghBranch')?.value.trim() || 'main',
    file: $('ghFile')?.value.trim() || 'peregrinos.json',
    token: $('ghToken')?.value.trim() || '',
  };
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

// ---------- auto-sync en segundo plano ----------
const autoSyncTimers = {};
const autoSyncEnCurso = new Set();

export function isAutoSyncEnabled(){
  return $('chkAutoSync') ? $('chkAutoSync').checked : false;
}

export function programarAutoSync(key, fn, delay){
  if(!isAutoSyncEnabled()) return;
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
  if(!isAutoSyncEnabled()) return;
  reintentosAlVolverOnline.forEach((fn) => { try{ fn(); }catch(e){} });
});

export { reportarEstadoGlobal };
