// Módulo de Estadísticas (Entrega 4): embudo por parada, tiempos promedio,
// tabla de detalle, faltantes, exportar CSV. Combina automáticamente los
// registros de todos los celulares de cada parada (carpetas por dispositivo).

import { $, escapeHtml, fmtTime, fmtDuration, toast, downloadText } from '../assets/js/utils.js';
import { ghConfig, ghBajarJSON, ghListarCarpeta } from './github.js';

let statsPeregrinos = [];
let statsRegistros = [];

export function init(){
  const el = document.getElementById('view-estadisticas');
  el.innerHTML = `
    <div class="card">
      <h2>📊 Estadísticas</h2>
      <p class="muted">Trae la lista de peregrinos y combina los registros de todos los celulares de las 4 paradas. Necesita internet.</p>
      <button class="btn primary" id="btnActualizarStats">🔄 Actualizar estadísticas</button>
      <p class="muted" id="ghEstadoStats">Todavía no se actualizó en esta sesión.</p>
    </div>

    <div id="statsResultado" style="display:none;">
      <div class="card">
        <h2>Recorrido general</h2>
        <div id="funnelBars"></div>
      </div>

      <div class="card">
        <div class="stat-grid">
          <div class="stat-box"><div class="v" id="statTotal">0</div><div class="l">peregrinos</div></div>
          <div class="stat-box"><div class="v" id="statCompletaron">0</div><div class="l">completaron las 4</div></div>
          <div class="stat-box"><div class="v" id="statTiempoProm">–</div><div class="l">tiempo total promedio</div></div>
          <div class="stat-box"><div class="v" id="statTramoLento">–</div><div class="l">tramo más lento (prom.)</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Detalle por persona</h2>
        <div style="overflow-x:auto;"><table id="tablaDetalle" style="width:100%; border-collapse:collapse; font-size:.82rem;"></table></div>
        <button class="btn" id="btnExportarCSV">💾 Exportar tabla como CSV</button>
      </div>

      <div class="card">
        <h2>Faltantes por parada</h2>
        <div id="faltantesPorParada"></div>
      </div>
    </div>
  `;

  $('btnActualizarStats').addEventListener('click', actualizarEstadisticas);
}

async function actualizarEstadisticas(){
  const { repo, branch, file, token } = ghConfig();
  if(!repo){ toast('Repositorio no configurado en ⚙️ Configuración'); return; }
  $('ghEstadoStats').textContent = 'Trayendo la lista de peregrinos…';
  try{
    const dataPeregrinos = await ghBajarJSON(repo, branch, file);
    statsPeregrinos = (dataPeregrinos.peregrinos || []).filter((p) => p.nombre);
  }catch(err){
    $('ghEstadoStats').textContent = 'No se pudo traer la lista de peregrinos (¿hay conexión?).';
    toast('Error al traer datos de GitHub');
    return;
  }

  statsRegistros = [];
  const resumen = [];
  for(let i = 1; i <= 4; i++){
    $('ghEstadoStats').textContent = `Combinando registros de la parada ${i}…`;
    try{
      const archivos = await ghListarCarpeta(repo, branch, `registros/parada_${i}`, token);
      let count = 0;
      for(const a of archivos){
        try{
          const data = await ghBajarJSON(repo, branch, a.path);
          (data.registros || []).forEach((r) => { statsRegistros.push(r); count++; });
        }catch(e){}
      }
      resumen.push(`Parada ${i}: ${count} registros de ${archivos.length} celular(es)`);
    }catch(err){
      resumen.push(`Parada ${i}: sin datos todavía`);
    }
  }
  $('ghEstadoStats').innerHTML = resumen.map((r) => '• ' + r).join('<br>') + `<br><b>Actualizado a las ${fmtTime(Date.now())}.</b>`;
  toast('Estadísticas actualizadas');
  renderStats();
}

function renderStats(){
  if(statsPeregrinos.length === 0 || statsRegistros.length === 0){
    $('statsResultado').style.display = 'none';
    return;
  }
  $('statsResultado').style.display = 'block';

  const byPerson = {};
  statsPeregrinos.forEach((p) => byPerson[p.id] = { p, t: { 1: null, 2: null, 3: null, 4: null } });
  statsRegistros.forEach((r) => {
    if(byPerson[r.peregrinoId]){
      const cur = byPerson[r.peregrinoId].t[r.parada];
      if(cur == null || r.ts > cur) byPerson[r.peregrinoId].t[r.parada] = r.ts;
    }
  });
  const rows = Object.values(byPerson);
  const total = rows.length;

  const funnel = $('funnelBars');
  funnel.innerHTML = [1,2,3,4].map((i) => {
    const pasaron = rows.filter((r) => r.t[i] != null).length;
    const pct = total ? Math.round((pasaron / total) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label"><span>Parada ${i}</span><span>${pasaron}/${total} · ${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
    </div>`;
  }).join('');

  const completaron = rows.filter((r) => r.t[1] && r.t[2] && r.t[3] && r.t[4]).length;
  $('statTotal').textContent = total;
  $('statCompletaron').textContent = completaron;

  const totales = rows.filter((r) => r.t[1] && r.t[4]).map((r) => r.t[4] - r.t[1]);
  const promTotal = totales.length ? totales.reduce((a, b) => a + b, 0) / totales.length : null;
  $('statTiempoProm').textContent = fmtDuration(promTotal);

  const tramos = [[1,2],[2,3],[3,4]].map(([a,b]) => {
    const vals = rows.filter((r) => r.t[a] && r.t[b]).map((r) => r.t[b] - r.t[a]);
    const prom = vals.length ? vals.reduce((x,y)=>x+y,0)/vals.length : null;
    return { a, b, prom };
  });
  const peor = tramos.filter((t) => t.prom != null).sort((x,y) => y.prom - x.prom)[0];
  $('statTramoLento').textContent = peor ? `P${peor.a}→P${peor.b} (${fmtDuration(peor.prom)})` : '–';

  const tabla = $('tablaDetalle');
  const head = `<tr><th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">Nombre</th><th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">ID</th>${[1,2,3,4].map(i=>`<th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">P${i}</th>`).join('')}<th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">P1→P4</th></tr>`;
  const body = rows.map((r) => {
    const cells = [1,2,3,4].map((i) => r.t[i] != null
      ? `<td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${fmtTime(r.t[i])}</td>`
      : `<td style="padding:8px 6px;border-bottom:1px solid var(--outline);color:var(--danger);">falta</td>`).join('');
    const totalTiempo = (r.t[1] && r.t[4]) ? fmtDuration(r.t[4] - r.t[1]) : '–';
    return `<tr><td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${escapeHtml(r.p.nombre)}</td><td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${r.p.id}</td>${cells}<td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${totalTiempo}</td></tr>`;
  }).join('');
  tabla.innerHTML = head + body;

  const faltWrap = $('faltantesPorParada'); faltWrap.innerHTML = '';
  for(let i=1;i<=4;i++){
    const falt = rows.filter((r) => r.t[i] == null);
    const box = document.createElement('div');
    box.innerHTML = `<h3 style="font-size:.9rem; margin:10px 0 6px;">Parada ${i} — faltan ${falt.length}</h3>` +
      (falt.length ? `<div class="muted">${falt.map((f) => escapeHtml(f.p.nombre)).join(', ')}</div>` : `<div class="muted">Pasaron todos ✅</div>`);
    faltWrap.appendChild(box);
  }

  $('btnExportarCSV').onclick = () => {
    let csv = 'Nombre,ID,Parada1,Parada2,Parada3,Parada4,TiempoTotal\n';
    rows.forEach((r) => {
      const c = [1,2,3,4].map((i) => r.t[i] != null ? new Date(r.t[i]).toLocaleString('es-AR') : 'FALTA');
      const totalTiempo = (r.t[1] && r.t[4]) ? fmtDuration(r.t[4] - r.t[1]) : '-';
      csv += `"${r.p.nombre}","${r.p.id}","${c[0]}","${c[1]}","${c[2]}","${c[3]}","${totalTiempo}"\n`;
    });
    downloadText(csv, 'estadisticas_peregrinacion.csv', 'text/csv');
  };
}
