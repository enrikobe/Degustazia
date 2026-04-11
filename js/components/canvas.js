// canvas.js P2

function initCanvas(){
      canvas = document.getElementById("drawingCanvas");
      if(!canvas) return;
      const parent = canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasDpr = dpr;

      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";

      ctx = canvas.getContext("2d", { desynchronized: true });
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#111";
      ctx.globalCompositeOperation = "source-over";

      if(!canvas.dataset.bound){
        const EVT_OPTS = { passive:false, capture:true };
        canvas.dataset.bound = "1";
        canvas.style.touchAction = 'none';
        canvas.addEventListener("pointerdown", onCanvasDown, EVT_OPTS);
        canvas.addEventListener("pointermove", onCanvasMove, EVT_OPTS);
        canvas.addEventListener("pointerup", onCanvasUp, EVT_OPTS);
        canvas.addEventListener("pointercancel", onCanvasUp, EVT_OPTS);
        canvas.addEventListener("pointerleave", onCanvasUp, EVT_OPTS);
      }
    }

function loadCanvasFromEval(){
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      clearCanvasVisualOnly();
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId) return;

      const ev = getEval(t,tId,selectedSampleId);
      const dataUrl = ev?.data?.vista?.canvas || null;
      if(!dataUrl) return;

      const img = new Image();
      img.onload = ()=>{
        ctx.drawImage(img, 0, 0, canvas.width/(canvasDpr||1), canvas.height/(canvasDpr||1));
      };
      img.src = dataUrl;
    }

function clearCanvas(){
      if(isArchived()) return;
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      clearCanvasVisualOnly();

      const t = getTasting();
      const tid = currentTasterId();
      const sid = selectedSampleId;
      if(t && tid && sid){
         const ev = getEval(t, tid, sid);
         if(!ev.data) ev.data = {};
         if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
         ev.data.vista.canvas = null;
         saveState({skipCloud:true});
         try{ window.queueCanvasSync && window.queueCanvasSync(t.id, tid, sid, null); }catch(e){}
         toast("Appunti cancellati");
         setTool('pen');
      }
    }

function clearCanvasVisualOnly(){
      if(!ctx || !canvas) return;
      ctx.clearRect(0,0, canvas.width/(canvasDpr||1), canvas.height/(canvasDpr||1));
    }

function setTool(t, btnEl){
      state.ui.canvasTool = t;
      document.querySelectorAll('.canvas-tools .tool-btn').forEach(b=>b.classList.remove('active'));
      if(btnEl && btnEl.classList) btnEl.classList.add('active');
    }

function isCanvasEmptyDataUrl(dataUrl){
      if(!dataUrl || typeof dataUrl !== 'string') return true;
      if(!dataUrl.startsWith('data:image')) return true;
      return dataUrl.length < 2000;
    }

function initFSMaster() {
  if (window._fsMaster) return;

  window._fsMaster = {
    canvas: document.createElement('canvas'),
    width: 2480,
    height: 3508,
    ctx: null
  };

  window._fsMaster.canvas.width = window._fsMaster.width;
  window._fsMaster.canvas.height = window._fsMaster.height;
  window._fsMaster.ctx = window._fsMaster.canvas.getContext('2d');
  window._fsMaster.ctx.lineCap = 'round';
  window._fsMaster.ctx.lineJoin = 'round';

  // Carica FS da storage
  const t = getTasting();
  const tId = currentTasterId();
  const sid = selectedSampleId;

  if (t && tId && sid) {
    const ev = getEval(t, tId, sid);
    if (ev.data && ev.data.vista && ev.data.vista.canvasFS) {
      const img = new Image();
      img.onload = function() {
        window._fsMaster.ctx.drawImage(img, 0, 0);
        console.log('🎨 FS master caricato da storage');
      };
      img.src = ev.data.vista.canvasFS;
    } else if (ev.data && ev.data.vista && ev.data.vista.canvas) {
      // Migrazione: carica widget in FS
      const img = new Image();
      img.onload = function() {
        const w = img.width;
        const h = img.height;
        window._fsMaster.ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
        console.log('🔄 Widget migrato in FS master (' + w + 'x' + h + ')');
      };
      img.src = ev.data.vista.canvas;
    }
  }

  console.log('✅ FS master inizializzato (background)');
}

function syncWidgetToFS() {
  const widget = document.getElementById('drawingCanvas');
  if (!widget) return;

  initFSMaster();

  const w = widget.width;
  const h = widget.height;

  // Aggiorna area widget in FS master
  window._fsMaster.ctx.clearRect(0, 0, w, h);
  window._fsMaster.ctx.drawImage(widget, 0, 0);

  console.log('🔄 Widget → FS master (' + w + 'x' + h + ')');

  // Salva con debounce
  if (window._syncTimeout) clearTimeout(window._syncTimeout);
  window._syncTimeout = setTimeout(function() {
    const t = getTasting();
    const tId = currentTasterId();
    const sid = selectedSampleId;

    if (t && tId && sid) {
      const ev = getEval(t, tId, sid);
      if (!ev.data) ev.data = { vista: {}, olfatto: {}, gusto: {} };
      if (!ev.data.vista) ev.data.vista = {};

      ev.data.vista.canvasFS = window._fsMaster.canvas.toDataURL('image/png');
      ev.data.vista.canvas = widget.toDataURL('image/png');
      ev.updatedAt = nowIso();

      saveState({ skipCloud: false });

      try {
        if (typeof queueCanvasSync === 'function') queueCanvasSync();
      } catch(e) {}

      console.log('💾 FS master salvato');
    }
  }, 600);
}

function forceEnableClear(){
    const clrBtns = document.querySelectorAll("button");
    for(let b of clrBtns){
        if(b.innerText.includes("Pulisci") || (b.getAttribute("onclick")||"").includes("clearCanvas")){
            b.disabled = false;
            b.style.pointerEvents = "auto";
            b.style.opacity = "1";
        }
    }
}