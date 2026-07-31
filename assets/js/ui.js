import { $ } from './utils.js';
import { getSetting, setSetting } from './storage.js';

const listenersPorVista = {};
const listenersSalidaPorVista = {};
let vistaActual = null;

export function onEnterView(viewName, fn){
  (listenersPorVista[viewName] ||= []).push(fn);
}

export function onLeaveView(viewName, fn){
  (listenersSalidaPorVista[viewName] ||= []).push(fn);
}

export function irAVista(viewName){
  if(vistaActual && vistaActual !== viewName){
    (listenersSalidaPorVista[vistaActual] || []).forEach(fn => fn());
  }
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + viewName));
  vistaActual = viewName;
  (listenersPorVista[viewName] || []).forEach(fn => fn());
}

export function initNav(){
  document.querySelectorAll('.bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => irAVista(btn.dataset.view));
  });
}

export function initTheme(){
  const guardado = getSetting('theme', null);
  const preferido = guardado || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  aplicarTema(preferido);
  $('btnTheme')?.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    aplicarTema(actual === 'dark' ? 'light' : 'dark');
  });
}

function aplicarTema(tema){
  document.documentElement.setAttribute('data-theme', tema);
  setSetting('theme', tema);
  const btn = $('btnTheme');
  if(btn) btn.textContent = tema === 'dark' ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', tema === 'dark' ? '#1c1e24' : '#f97316');
}

// Indicador de sincronización: 🟢 sincronizado, 🟡 cambios pendientes, 🔴 sin internet
export function setSyncStatus(estado, texto){
  const pill = $('syncPill');
  if(!pill) return;
  pill.className = 'sync-pill ' + estado;
  pill.querySelector('.txt').textContent = texto;
}

export function actualizarSyncPorConexion(){
  setSyncStatus(navigator.onLine ? 'ok' : 'offline', navigator.onLine ? 'Sincronizado' : 'Sin internet');
}
window.addEventListener('online', actualizarSyncPorConexion);
window.addEventListener('offline', actualizarSyncPorConexion);
