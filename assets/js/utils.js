// Funciones chicas y reutilizables, sin dependencias de otros módulos.

export function $(id){ return document.getElementById(id); }

export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

export function fmtTime(ts){
  return new Date(ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

export function fmtDuration(ms){
  if(ms == null || isNaN(ms)) return '–';
  const s = Math.round(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h>0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

export function pad3(n){ return String(n).padStart(3,'0'); }

export function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

export function downloadText(text, filename, mime){
  const blob = new Blob([text], {type: mime || 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

export function readFileAsJSON(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try{ resolve(JSON.parse(r.result)); } catch(e){ reject(e); } };
    r.onerror = reject;
    r.readAsText(file);
  });
}

export function resizeImage(file, maxDim){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h){ if(w > maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else { if(h > maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

let toastTimer = null;
export function toast(msg){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
