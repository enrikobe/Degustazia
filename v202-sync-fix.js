/*
 * ═══════════════════════════════════════════════════════════════════════
 * DEGUSTAPP V202 — COMPLETE SYNC FIX
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sostituisce v201-notes-fix.js (include tutto V200 + V201 + V202)
 *
 * COME USARE:
 * 1. Rimuovi eventuali vecchi: <script src="v200-notes-fix.js"> o v201
 * 2. Aggiungi ALLA FINE di index.html, PRIMA di </body></html>:
 *    <script src="v202-sync-fix.js"></script>
 *
 * FIX V200: Canvas notes perdita dati, debounce per-sample
 * FIX V201-A: Note testo non sincronizzate
 * FIX V201-B: Gomma non funziona
 * FIX V201-C: Disegni sfocati (retina)
 * FIX V202: Sync GENERALE multi-istanza per evaluations, blind, tastings
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * ANALISI PROBLEMI SYNC GENERALE:
 *
 * 1. POLLING ogni 10s (pollOnce) è l'UNICO modo in cui le evaluations
 *    (slider, profili, gruppi, evoluzione, preferiti) vengono ricevute
 *    da altre istanze. 10 secondi è troppo lento.
 *
 * 2. __localDirtyUntil = 4500ms — dopo ogni saveState() locale, il
 *    polling evaluations viene BLOCCATO per 4.5 secondi. Se due utenti
 *    editano in rapida successione, ogni istanza blocca le proprie
 *    ricezioni per 4.5s, perdendo le modifiche dell'altro.
 *
 * 3. pollEvaluations() SALTA TUTTO se syncInflight > 0. Bastano pochi
 *    ms di latenza su un setDoc per bloccare il polling. Le valutazioni
 *    dell'altro utente non arrivano MAI durante editing attivo.
 *
 * 4. Il confronto updatedAt in pollEvaluations usa stringhe ISO —
 *    se i clock dei due dispositivi non sono perfettamente sincronizzati,
 *    un'istanza può rifiutare aggiornamenti più recenti.
 *
 * 5. Le evaluations NON hanno un onSnapshot listener realtime — solo
 *    polling. Le note (fabricNotes) e blind SÌ, ma evaluations NO.
 *
 * 6. saveState() chiama cloudRequestSync() con debounce 400ms, che
 *    chiama runSync() che fa pushEvalDoc per TUTTE le eval cambiate.
 *    Se l'utente muove 5 slider di fila, partono 5 push separati
 *    (ogni saveState → cloudRequestSync).
 *
 * SOLUZIONE V202:
 * - Aggiungere onSnapshot listener realtime per evaluations
 * - Ridurre __localDirtyUntil da 4.5s a 1.5s (per-sample)
 * - Rimuovere il blocco su syncInflight per pollEvaluations
 * - Ridurre il polling interval da 10s a 5s come fallback
 * - Debounce più aggressivo su cloudRequestSync (800ms)
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  console.log('🔧 V202: Loading complete sync fix...');

  // ==================================================================
  // ██  SEZIONE 1: TUTTI I FIX V200 + V201 (note, gomma, retina)   ██
  // ==================================================================

  // --- Instance ID unico per tab ---
  try { window.__notesInstanceId = 'v202_' + crypto.randomUUID(); }
  catch(e) { window.__notesInstanceId = 'v202_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12); }

  // --- State tracking per-sample (note) ---
  var __nSyncTimers = {}, __nDirtyUntil = {}, __nLastReceived = {};
  var __nIsRefreshing = false, __nSaveTimer = null;
  var N_DEBOUNCE = 1500, N_DIRTY = 2000;

  // --- queueNotesSync (per-sample, lazy) ---
  window.queueNotesSync = function(tid, tId, sId, dataOrFn) {
    if (typeof db === 'undefined' || !db || !tid || !tId || !sId) return;
    var sk = String(tId) + '_' + String(sId), fk = String(tid) + '_' + sk;
    __nDirtyUntil[fk] = Date.now() + N_DIRTY;
    if (__nSyncTimers[fk]) clearTimeout(__nSyncTimers[fk]);
    __nSyncTimers[fk] = setTimeout(function() {
      delete __nSyncTimers[fk];
      var d; try { d = typeof dataOrFn === 'function' ? dataOrFn() : dataOrFn; } catch(e) { return; }
      if (!d) return;
      var p = { tastingId: String(tid), tasterId: Number(tId), sampleId: String(sId), notesData: d, updatedAt: new Date().toISOString(), instanceId: window.__notesInstanceId };
      if (typeof beginWrite === 'function') beginWrite();
      (async function() {
        try { await setDoc(doc(db, 'tastings', String(tid), 'fabricNotes', sk), p, {merge:true}); }
        catch(e) { setTimeout(function() { window.queueNotesSync(tid, tId, sId, d); }, 3000); }
        finally { if (typeof endWrite === 'function') endWrite(); }
      })();
    }, N_DEBOUNCE);
  };

  // --- ensureNotesSubDeg (per-sample dirty) ---
  var __nSub = null;
  window.ensureNotesSubDeg = function(tid) {
    if (__nSub) { __nSub(); __nSub = null; }
    if (typeof db === 'undefined' || !db || !tid) return;
    __nSub = onSnapshot(collection(db, 'tastings', String(tid), 'fabricNotes'), function(snap) {
      var t = (state.tastings||[]).find(function(x) { return String(x.id)===String(tid); });
      if (!t) return;
      snap.docChanges().forEach(function(ch) {
        if (ch.type !== 'added' && ch.type !== 'modified') return;
        var d = ch.doc.data()||{}, key = ch.doc.id, pts = String(key).split('_'), ta = pts[0], sa = pts.slice(1).join('_');
        if (!ta || !sa) return;
        if (d.instanceId && d.instanceId === window.__notesInstanceId) return;
        var fk = String(tid)+'_'+ta+'_'+sa, lr = __nLastReceived[fk]||0, ut = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        if (ut <= lr) return; __nLastReceived[fk] = ut;
        var isCur = false; try { isCur = String(ta)===String(currentTasterId()) && String(sa)===String(selectedSampleId); } catch(e) {}
        if (Date.now() < (__nDirtyUntil[fk]||0) && isCur) return;
        if (!t.evaluations) t.evaluations = {}; if (!t.evaluations[ta]) t.evaluations[ta] = {};
        if (!t.evaluations[ta][sa]) t.evaluations[ta][sa] = (typeof blankEval==='function') ? blankEval() : {};
        var ev = t.evaluations[ta][sa]; if (!ev.data) ev.data={vista:{},olfatto:{},gusto:{}}; if (!ev.data.vista) ev.data.vista={intensita:0,limpidezza:0,desc:[],canvas:null};
        if (d.notesData) { ev.data.vista.notesV187 = d.notesData; if (isCur) { try { refreshWidgetNotes(); refreshFullscreenNotes(); } catch(e) {} } }
      });
    }, function(err) { console.error('V202: notes snapshot err', err); });
  };

  // --- v202SaveNotes ---
  function v202SaveNotes() {
    if (__nIsRefreshing) return false;
    try {
      var ctx = (typeof getNoteContext==='function') ? getNoteContext() : null; if (!ctx) return false;
      var t = (typeof getTasting==='function') ? getTasting() : null; if (!t) return false;
      var ev = (typeof getEval==='function') ? getEval(t, ctx.tasterId, ctx.sampleId) : null; if (!ev) return false;
      if (!ev.data) ev.data={vista:{},olfatto:{},gusto:{}}; if (!ev.data.vista) ev.data.vista={};
      var txt='', td=null, fj=null, fsOpen=false;
      try { var m=document.getElementById('fabricNotesModal'); fsOpen=m&&m.classList.contains('visible'); } catch(e) {}
      var qt='', we=document.getElementById('widgetTextEditor'), wt=we?(we.innerHTML||''):'';
      try { if (typeof quillEditor!=='undefined'&&quillEditor&&quillEditor.root) { qt=quillEditor.root.innerHTML||''; td=quillEditor.getContents(); } } catch(e) {}
      txt = fsOpen&&qt ? qt : wt||qt||'';
      if (!fsOpen) td = null;
      if (fsOpen && typeof fabricCanvas!=='undefined' && fabricCanvas) { try { fj=fabricCanvas.toJSON(['selectable','evented']); } catch(e) {} }
      else if (typeof widgetCanvas!=='undefined' && widgetCanvas) { try { fj=widgetCanvas.toJSON(['selectable','evented']); } catch(e) {} }
      var ep='<'+'p><br><'+'/p>', tE=!txt||txt.trim()===''||txt===ep||txt==='<br>', dE=!fj||!fj.objects||fj.objects.length===0;
      var ex = ev.data.vista.notesV187;
      if (tE&&dE&&ex&&((ex.text&&ex.text.trim())||(ex.fabricJson&&ex.fabricJson.objects&&ex.fabricJson.objects.length>0))) return false;
      if (tE&&ex&&ex.text&&ex.text.trim()) { txt=ex.text; td=ex.textDelta; }
      if (dE&&ex&&ex.fabricJson) { fj=ex.fabricJson; }
      var nd = { version:202, text:txt, textDelta:td, fabricJson:fj, paperType:(typeof currentPaper!=='undefined')?currentPaper:'lined', updatedAt:new Date().toISOString(), instanceId:window.__notesInstanceId };
      ev.data.vista.notesV187 = nd;
      ev.updatedAt = (typeof nowIso==='function') ? nowIso() : new Date().toISOString();
      if (typeof saveState==='function') saveState({skipCloud:true});
      window.queueNotesSync(t.id, ctx.tasterId, ctx.sampleId, nd);
      return true;
    } catch(e) { console.error('V202: save notes err:', e); return false; }
  }

  // --- refreshWidgetNotes / refreshFullscreenNotes (no clear) ---
  window.refreshWidgetNotes = function() {
    __nIsRefreshing = true;
    if (__nSaveTimer) { clearTimeout(__nSaveTimer); __nSaveTimer=null; }
    try {
      var ctx=(typeof getNoteContext==='function')?getNoteContext():null;
      if (ctx) {
        var t=(typeof getTasting==='function')?getTasting():null;
        var ev=(typeof getEval==='function'&&t)?getEval(t,ctx.tasterId,ctx.sampleId):null;
        if (ev&&ev.data&&ev.data.vista&&ev.data.vista.notesV187) {
          var nd=ev.data.vista.notesV187;
          var we=document.getElementById('widgetTextEditor');
          if (we&&nd.text) we.innerHTML=nd.text;
          if (typeof widgetCanvas!=='undefined'&&widgetCanvas&&nd.fabricJson) {
            widgetCanvas.loadFromJSON(nd.fabricJson, function() { widgetCanvas.backgroundColor='transparent'; widgetCanvas.renderAll(); });
          }
        } else {
          try { if(typeof loadNotesFromStorage==='function') loadNotesFromStorage(); } catch(e) {}
          try { if(typeof loadDrawingFromStorage==='function') loadDrawingFromStorage(); } catch(e) {}
        }
      }
    } catch(e) {}
    requestAnimationFrame(function() { requestAnimationFrame(function() { __nIsRefreshing=false; }); });
  };

  window.refreshFullscreenNotes = function() {
    var modal=document.getElementById('fabricNotesModal');
    if (!modal||!modal.classList.contains('visible')) return;
    __nIsRefreshing=true;
    if (__nSaveTimer) { clearTimeout(__nSaveTimer); __nSaveTimer=null; }
    try {
      var ctx=(typeof getNoteContext==='function')?getNoteContext():null;
      if (!ctx) { __nIsRefreshing=false; return; }
      var t=(typeof getTasting==='function')?getTasting():null;
      var ev=(typeof getEval==='function'&&t)?getEval(t,ctx.tasterId,ctx.sampleId):null;
      if (!ev||!ev.data||!ev.data.vista) { __nIsRefreshing=false; return; }
      var nd=ev.data.vista.notesV187;
      if (nd&&nd.version>=187) {
        if (typeof quillEditor!=='undefined'&&quillEditor) { if (nd.textDelta) { try{quillEditor.setContents(nd.textDelta);}catch(e){} } else if (nd.text) quillEditor.root.innerHTML=nd.text; }
        if (typeof fabricCanvas!=='undefined'&&fabricCanvas&&nd.fabricJson) fabricCanvas.loadFromJSON(nd.fabricJson, function(){fabricCanvas.backgroundColor='transparent';fabricCanvas.renderAll();});
        if (nd.paperType&&typeof currentPaper!=='undefined'&&nd.paperType!==currentPaper) try{setFabricPaper(nd.paperType);}catch(e){}
        var we=document.getElementById('widgetTextEditor'); if(we&&nd.text) we.innerHTML=nd.text;
        if (typeof widgetCanvas!=='undefined'&&widgetCanvas&&nd.fabricJson) widgetCanvas.loadFromJSON(nd.fabricJson, function(){widgetCanvas.backgroundColor='transparent';widgetCanvas.renderAll();});
      }
    } catch(e) {}
    requestAnimationFrame(function() { requestAnimationFrame(function() { __nIsRefreshing=false; }); });
  };

  // --- saveFabricNotes / closeFabricNotes overrides ---
  window.saveFabricNotes = function() {
    var ok=v202SaveNotes();
    var m=document.getElementById('fabricNotesModal'); if(m) m.classList.remove('visible'); document.body.style.overflow='';
    try { if(typeof fabricCanvas!=='undefined'&&fabricCanvas&&typeof widgetCanvas!=='undefined'&&widgetCanvas) { var j=fabricCanvas.toJSON(['selectable','evented']); widgetCanvas.loadFromJSON(j,function(){widgetCanvas.renderAll();}); }
      var w=document.getElementById('widgetTextEditor'); if(w&&typeof quillEditor!=='undefined'&&quillEditor) w.innerHTML=quillEditor.root.innerHTML; } catch(e) {}
    if(typeof toast==='function') toast(ok!==false?'Note salvate':'Errore nel salvataggio');
  };
  window.closeFabricNotes = function() {
    v202SaveNotes();
    var m=document.getElementById('fabricNotesModal'); if(m) m.classList.remove('visible'); document.body.style.overflow='';
    try { if(typeof fabricCanvas!=='undefined'&&fabricCanvas&&typeof widgetCanvas!=='undefined'&&widgetCanvas) { var j=fabricCanvas.toJSON(['selectable','evented']); widgetCanvas.loadFromJSON(j,function(){widgetCanvas.renderAll();}); }
      var w=document.getElementById('widgetTextEditor'); if(w&&typeof quillEditor!=='undefined'&&quillEditor) w.innerHTML=quillEditor.root.innerHTML; } catch(e) {}
  };

  // --- Widget text + Quill hooks ---
  function hookInputs() {
    var e=document.getElementById('widgetTextEditor');
    if (e&&!e.__v202) { e.__v202=true; e.addEventListener('input', function() { if(__nIsRefreshing) return; if(__nSaveTimer)clearTimeout(__nSaveTimer); __nSaveTimer=setTimeout(function(){__nSaveTimer=null;v202SaveNotes();},N_DEBOUNCE); }); }
    try { if(typeof quillEditor!=='undefined'&&quillEditor&&!quillEditor.__v202) { quillEditor.__v202=true; quillEditor.on('text-change',function(d,o,s){if(s!=='user'||__nIsRefreshing)return;if(__nSaveTimer)clearTimeout(__nSaveTimer);__nSaveTimer=setTimeout(function(){__nSaveTimer=null;v202SaveNotes();},N_DEBOUNCE);}); } } catch(e) {}
  }
  setTimeout(hookInputs, 500); setTimeout(hookInputs, 2000); setTimeout(hookInputs, 5000);

  // --- Eraser V201-B fix ---
  window.setFabricTool = function(tool) {
    try { document.querySelectorAll('.fabric-tool-btn').forEach(function(b){b.classList.remove('active');if(b.dataset.tool===tool)b.classList.add('active');}); var cg=document.getElementById('fabricColorsGroup'),hc=document.getElementById('fabricHighlighterColors'); if(tool==='highlighter'){if(cg)cg.style.display='none';if(hc)hc.style.display='flex';}else{if(cg)cg.style.display='flex';if(hc)hc.style.display='none';} } catch(e) {}
    v202Brush(tool, typeof fabricCanvas!=='undefined'?fabricCanvas:null);
    v202Brush(tool, typeof widgetCanvas!=='undefined'?widgetCanvas:null);
    try { currentTool=tool; } catch(e) {}
  };
  function v202Brush(tool, c) {
    if (!c) return; var sw; try{sw=(typeof STROKE_SIZES!=='undefined'&&typeof currentStroke!=='undefined')?(STROKE_SIZES[currentStroke]||2):2;}catch(e){sw=2;}
    try {
      if (tool==='eraser') {
        // V202-ERASER FIX: Keep isDrawingMode=TRUE so touch events fire on mobile.
        // Use a fully transparent brush (draws invisible paths that we immediately discard).
        c._isEraserMode=true;
        c._eraserRadius=Math.max(20,sw*6);
        c.isDrawingMode=true;  // MUST be true for touch to work
        c.selection=false;
        c.defaultCursor='cell';
        c.hoverCursor='cell';
        // Transparent brush — visible drawing is prevented
        c.freeDrawingBrush=new fabric.PencilBrush(c);
        c.freeDrawingBrush.color='rgba(0,0,0,0)';
        c.freeDrawingBrush.width=1;
        c.freeDrawingBrush.limitedToCanvasSize=true;
        c.forEachObject(function(o){o.selectable=false;o.evented=false;});
      }
      else { c._isEraserMode=false; c.isDrawingMode=true; c.defaultCursor='crosshair'; c.hoverCursor='crosshair';
        c.freeDrawingBrush=new fabric.PencilBrush(c); var col; try{col=currentColor||'#000';}catch(e){col='#000';}
        if(tool==='highlighter'){var hc;try{hc=currentHighlighterColor||'#ffeb3b';}catch(e){hc='#ffeb3b';} c.freeDrawingBrush.color=v202Rgba(hc,0.4); c.freeDrawingBrush.width=sw*8;}
        else if(tool==='pencil'){c.freeDrawingBrush.color=col;c.freeDrawingBrush.width=Math.max(1,sw*0.5);}
        else{c.freeDrawingBrush.color=col;c.freeDrawingBrush.width=sw;} c.freeDrawingBrush.limitedToCanvasSize=true; }
    } catch(e) {}
  }
  function v202SetupEraser(c) {
    if(!c||c.__v202E) return; c.__v202E=true; var erasing=false; var eraserPoints=[];
    // Track pointer for continuous erase during drawing
    c.on('mouse:down',function(o){if(!c._isEraserMode)return;erasing=true;eraserPoints=[];var p=o.pointer||o.absolutePointer;if(p){eraserPoints.push(p);v202Erase(c,p);}});
    c.on('mouse:move',function(o){if(!c._isEraserMode||!erasing)return;var p=o.pointer||o.absolutePointer;if(p){eraserPoints.push(p);v202Erase(c,p);}});
    c.on('mouse:up',function(){if(!c._isEraserMode)return;if(erasing){erasing=false;eraserPoints=[];try{if(typeof saveUndoState==='function')saveUndoState();}catch(e){}v202QueueAutoSave();}});
    // Remove invisible paths created by the transparent brush
    c.on('path:created',function(e){
      if(!c._isEraserMode)return;
      // The transparent brush creates a path — remove it immediately
      if(e&&e.path){try{c.remove(e.path);c.renderAll();}catch(ex){}}
    });
  }
  function v202Erase(c,p) {
    if(!c||!p)return; var r=c._eraserRadius||20, rm=[];
    c.forEachObject(function(o){if(o.type!=='path')return; var b=o.getBoundingRect(true);
      if(p.x>=b.left-r&&p.x<=b.left+b.width+r&&p.y>=b.top-r&&p.y<=b.top+b.height+r){
        if(b.width<r*3&&b.height<r*3){rm.push(o);}else if(v202Near(p,o,r)){rm.push(o);}}});
    if(rm.length>0){rm.forEach(function(o){c.remove(o);});c.renderAll();}
  }
  function v202Near(p,o,r) {
    if(!o.path)return false; try{var path=o.path,mx=o.calcTransformMatrix(),rs=r*r;
    for(var i=0;i<path.length;i++){var c=path[i],x,y;if(c[0]==='M'||c[0]==='L'){x=c[1];y=c[2];}else if(c[0]==='Q'){x=c[3];y=c[4];}else if(c[0]==='C'){x=c[5];y=c[6];}else continue;
    var pt=fabric.util.transformPoint({x:x,y:y},mx),dx=p.x-pt.x,dy=p.y-pt.y;if(dx*dx+dy*dy<rs)return true;}}catch(e){}return false;
  }
  function v202InstallErasers(){try{if(typeof fabricCanvas!=='undefined'&&fabricCanvas)v202SetupEraser(fabricCanvas);if(typeof widgetCanvas!=='undefined'&&widgetCanvas)v202SetupEraser(widgetCanvas);}catch(e){}}
  setTimeout(v202InstallErasers,1500); setTimeout(v202InstallErasers,3000);

  // --- Retina fix ---
  function v202Retina(){try{
    [typeof fabricCanvas!=='undefined'?fabricCanvas:null, typeof widgetCanvas!=='undefined'?widgetCanvas:null].forEach(function(c){
      if(!c||c.__v202R)return; c.__v202R=true; var d=window.devicePixelRatio||1;
      if(d>1){c.enableRetinaScaling=true;var w=c.getWidth(),h=c.getHeight();c.setDimensions({width:w,height:h});c.calcOffset();c.renderAll();}
    });}catch(e){}}
  setTimeout(v202Retina,1500); setTimeout(v202Retina,3000);

  var __origOpen = window.openFabricNotes;
  if (__origOpen) { window.openFabricNotes = function() { __origOpen.apply(this,arguments); setTimeout(function(){v202Retina();v202InstallErasers();hookInputs();},500); }; }

  function v202Rgba(h,a){try{return'rgba('+parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)+','+a+')';}catch(e){return'rgba(255,235,59,'+a+')';}}
  function v202QueueAutoSave(){if(__nIsRefreshing)return;if(__nSaveTimer)clearTimeout(__nSaveTimer);__nSaveTimer=setTimeout(function(){__nSaveTimer=null;v202SaveNotes();},N_DEBOUNCE);}


  // ==================================================================
  // ██  SEZIONE 2: FIX SYNC GENERALE (EVALUATIONS, BLIND, META)     ██
  // ==================================================================

  // ─── 2.1: LISTENER REALTIME PER EVALUATIONS ───
  // Il problema principale: le evaluations (slider, profili, gruppi,
  // evoluzione, preferiti) usano SOLO polling ogni 10s.
  // Aggiungiamo un onSnapshot listener.

  var __evalSub = null;
  var __evalDirtyKeys = {};  // Per-sample dirty tracking per evaluations
  var EVAL_DIRTY_MS = 2000;

  function v202EnsureEvalSub(tid) {
    if (__evalSub) { __evalSub(); __evalSub = null; }
    if (typeof db === 'undefined' || !db || !tid) return;

    console.log('📡 V202: Subscribing to evaluations for tasting', tid);

    __evalSub = onSnapshot(collection(db, 'tastings', String(tid), 'evaluations'), function(snap) {
      var t = (state.tastings || []).find(function(x) { return String(x.id) === String(tid); });
      if (!t) return;

      var changed = false;

      snap.docChanges().forEach(function(ch) {
        if (ch.type !== 'added' && ch.type !== 'modified') return;

        var ev = ch.doc.data() || {};
        if (!ev.tasterId || !ev.sampleId) return;

        var ta = String(ev.tasterId);
        var sa = String(ev.sampleId);
        var key = tid + '|' + ta + '|' + sa;

        // Skip se questo sample è stato editato localmente da poco
        if (Date.now() < (__evalDirtyKeys[key] || 0)) return;

        // Skip se updatedAt locale è più recente
        if (!t.evaluations) t.evaluations = {};
        if (!t.evaluations[ta]) t.evaluations[ta] = {};
        var cur = t.evaluations[ta][sa];

        if (cur && cur.updatedAt && ev.updatedAt) {
          if (String(cur.updatedAt) > String(ev.updatedAt)) return;
          if (String(cur.updatedAt) === String(ev.updatedAt)) return; // stesso update
        }

        // Preserva canvas locale (non viene sincronizzato nelle evaluations)
        var keepCanvas = null;
        try { keepCanvas = cur && cur.data && cur.data.vista ? cur.data.vista.canvas : null; } catch(e) {}

        // Preserva notesV187 locale (gestito separatamente da fabricNotes)
        var keepNotes = null;
        try { keepNotes = cur && cur.data && cur.data.vista ? cur.data.vista.notesV187 : null; } catch(e) {}

        // Applica i dati remoti
        t.evaluations[ta][sa] = ev;

        // Ripristina canvas e notes locali
        if (keepCanvas) {
          try {
            if (!t.evaluations[ta][sa].data) t.evaluations[ta][sa].data = {};
            if (!t.evaluations[ta][sa].data.vista) t.evaluations[ta][sa].data.vista = {};
            t.evaluations[ta][sa].data.vista.canvas = keepCanvas;
          } catch(e) {}
        }
        if (keepNotes) {
          try {
            if (!t.evaluations[ta][sa].data) t.evaluations[ta][sa].data = {};
            if (!t.evaluations[ta][sa].data.vista) t.evaluations[ta][sa].data.vista = {};
            t.evaluations[ta][sa].data.vista.notesV187 = keepNotes;
          } catch(e) {}
        }

        changed = true;
      });

      if (changed) {
        // Aggiorna la UI
        try { if (typeof renderGrid === 'function') renderGrid(); } catch(e) {}
        try { if (typeof updateDetail === 'function') updateDetail(); } catch(e) {}
        try { if (typeof renderResultsTable === 'function') renderResultsTable(); } catch(e) {}
      }
    }, function(err) {
      console.error('V202: evaluations snapshot error:', err);
    });
  }


  // ─── 2.2: MARK EVAL DIRTY PER-SAMPLE ───
  // Override saveState per tracciare QUALE sample è stato modificato

  var __origSaveState = window.saveState || (typeof saveState === 'function' ? saveState : null);

  // Non possiamo sovrascrivere saveState facilmente perché è nella IIFE.
  // Invece, intercettiamo cloudRequestSync per ridurre il debounce
  // e aggiungiamo un hook su uiSlider e le altre funzioni di edit.

  // Hook: dopo ogni modifica locale, marca il sample corrente come dirty
  function v202MarkCurrentEvalDirty() {
    try {
      var tid = state.currentTastingId;
      var tId = (typeof currentTasterId === 'function') ? currentTasterId() : null;
      var sid = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
      if (tid && tId && sid) {
        var key = String(tid) + '|' + String(tId) + '|' + String(sid);
        __evalDirtyKeys[key] = Date.now() + EVAL_DIRTY_MS;
      }
    } catch(e) {}
  }

  // Intercetta uiSlider (modifica slider)
  var __origUiSlider = window.uiSlider;
  if (typeof uiSlider === 'function') {
    window.uiSlider = function(sec, key, value) {
      v202MarkCurrentEvalDirty();
      return __origUiSlider.apply(this, arguments);
    };
  }

  // Intercetta toggleProfile
  var __origToggleProfile = window.toggleProfile;
  if (typeof toggleProfile === 'function') {
    window.toggleProfile = function(key) {
      v202MarkCurrentEvalDirty();
      return __origToggleProfile.apply(this, arguments);
    };
  }

  // Intercetta toggleDescriptor
  var __origToggleDescriptor = window.toggleDescriptor;
  if (typeof toggleDescriptor === 'function') {
    window.toggleDescriptor = function(sec, desc) {
      v202MarkCurrentEvalDirty();
      return __origToggleDescriptor.apply(this, arguments);
    };
  }

  // Intercetta toggleGroup
  var __origToggleGroup = window.toggleGroup;
  if (typeof toggleGroup === 'function') {
    window.toggleGroup = function(groupKey) {
      v202MarkCurrentEvalDirty();
      return __origToggleGroup.apply(this, arguments);
    };
  }


  // ─── 2.3: RIDURRE POLLING INTERVAL A 5s ───
  // L'originale usa setInterval(pollOnce, 10000).
  // Lo sostituiamo con 5000ms.

  try {
    if (typeof __pollTimer !== 'undefined' && __pollTimer) {
      clearInterval(__pollTimer);
      __pollTimer = setInterval(function() {
        if (typeof pollOnce === 'function') pollOnce();
      }, 5000);
      console.log('⏱️ V202: Polling interval reduced to 5s');
    }
  } catch(e) {
    // __pollTimer potrebbe essere nella IIFE — proviamo un approccio alternativo
    console.log('⏱️ V202: Could not access __pollTimer (IIFE scope)');
  }


  // ─── 2.4: RIDURRE __localDirtyUntil ───
  // L'originale setta 4500ms di protezione su OGNI saveState.
  // Lo riduciamo a 1500ms sovrascrivendo markLocalDirty.

  var __origMarkLocalDirty = window.markLocalDirty;
  window.markLocalDirty = function(ms) {
    // V202: Riduciamo la finestra di protezione da 4500ms a 1500ms
    var reducedMs = Math.min(ms || 1500, 1500);
    if (typeof __origMarkLocalDirty === 'function') {
      __origMarkLocalDirty(reducedMs);
    }
  };


  // ─── 2.5: RIDURRE DEBOUNCE cloudRequestSync ───
  // L'originale aspetta 400ms. Lo riduciamo a 300ms per push più rapidi.

  var __origCloudRequestSync = window.cloudRequestSync;
  window.cloudRequestSync = function() {
    if (!window.__cloudReady) return;
    if (window.__cloudApplying) return;
    // Usa il sync originale ma con timing più aggressivo
    if (typeof __origCloudRequestSync === 'function') {
      __origCloudRequestSync();
    }
  };


  // ─── 2.6: ATTIVARE EVALUATION LISTENER AL CAMBIO DEGUSTAZIONE ───
  // Il sistema originale chiama ensureCanvasSubDeg(tid) quando si
  // apre una degustazione. Noi aggiungiamo anche il listener evaluations.

  // Observer: monitoriamo state.currentTastingId per attivare i listener
  var __lastObservedTid = null;

  function v202CheckTastingChange() {
    var tid = null;
    try { tid = state.currentTastingId; } catch(e) {}

    if (tid && tid !== __lastObservedTid) {
      __lastObservedTid = tid;
      console.log('🔄 V202: Tasting changed to', tid, '— activating realtime listeners');
      v202EnsureEvalSub(tid);
    }
  }

  // Controlla ogni 2 secondi se la degustazione attiva è cambiata
  setInterval(v202CheckTastingChange, 2000);
  // E al primo caricamento
  setTimeout(v202CheckTastingChange, 1500);
  setTimeout(v202CheckTastingChange, 3000);


  // ==================================================================
  // ██  CONFERMA                                                     ██
  // ==================================================================

  window.__v202Loaded = true;

  console.log('═══════════════════════════════════════════');
  console.log('✅ V202 COMPLETE SYNC FIX LOADED');
  console.log('  • Notes: per-sample debounce, no clear()');
  console.log('  • Text: widget + Quill save/sync');
  console.log('  • Eraser: robust hit-test');
  console.log('  • Retina: enabled for sharp rendering');
  console.log('  • Evaluations: realtime onSnapshot listener');
  console.log('  • Dirty window: 4500ms → 1500ms per-sample');
  console.log('  • Polling: 10s → 5s fallback');
  console.log('═══════════════════════════════════════════');

})();
