// Helper de cámara + lectura de QR (usa la librería jsQR cargada como vendor global).
// Se usa tanto en Registro (escanear para asignar nombre) como en Escaneo (el flujo principal).

export function makeScanner({ videoId, canvasId, size, onDetect, onError }){
  size = size || 400;
  let stream = null, running = false, paused = false;

  function video(){ return document.getElementById(videoId); }
  function canvas(){ return document.getElementById(canvasId); }

  async function start(){
    if(stream) return true;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
      });
      video().srcObject = stream;
      running = true;
      requestAnimationFrame(loop);
      return true;
    }catch(err){
      if(onError) onError(err);
      return false;
    }
  }

  function stop(){
    running = false;
    if(stream){ stream.getTracks().forEach((t) => t.stop()); stream = null; }
    const v = video();
    if(v) v.srcObject = null;
  }

  function loop(){
    if(!running) return;
    const v = video();
    if(v && v.readyState === v.HAVE_ENOUGH_DATA && !paused){
      const c = canvas();
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, size, size);
      const imgData = ctx.getImageData(0, 0, size, size);
      const code = window.jsQR(imgData.data, size, size);
      if(code && code.data) onDetect(code.data);
    }
    requestAnimationFrame(loop);
  }

  return {
    start, stop,
    isRunning: () => !!stream,
    setPaused: (v) => { paused = v; },
  };
}
