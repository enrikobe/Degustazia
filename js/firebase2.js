// firebase2.js — P2c residuo

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



  // --- Firebase Compat loader (works also on file://) ---
  // Exposes a minimal v9-like surface used by the app.
  function initializeApp(config){
    try{ return firebase.initializeApp(config); }
    catch(e){ try{ return firebase.app(); }catch(_){ return firebase.initializeApp(config); } }
  }
  function getFirestore(app){ return firebase.firestore(); }
  function doc(db, ...parts){ return db.doc(parts.join('/')); }
  function collection(db, ...parts){ return db.collection(parts.join('/')); }
  function setDoc(docRef, data, opts){ return docRef.set(data, opts || {}); }
  function deleteDoc(docRef){ return docRef.delete(); }
  function getDoc(docRef){ return docRef.get(); }
  function getDocs(colRef){ return colRef.get(); }
  function onSnapshot(ref, next, err){ return ref.onSnapshot(next, err); }
  function serverTimestamp(){ return firebase.firestore.FieldValue.serverTimestamp(); }



  // ====== CONFIGURAZIONE FIREBASE (COMPILA) ======
  const firebaseConfig = {
  apiKey: "AIzaSyBO8jio2Ylyc5e7qQgkDttiDYVRDUaX0xM",
  authDomain: "degustazia-ed29c.firebaseapp.com",
  projectId: "degustazia-ed29c",
  storageBucket: "degustazia-ed29c.firebasestorage.app",
  messagingSenderId: "689428903782",
  appId: "1:689428903782:web:a8fc272dd0b2e74ce2baa7"
};

  // ====== LED ======
  const led = document.getElementById('syncLed');
  const setLed = (cls) => {
    if(!led) return;
    const infl = window.__syncInflight || 0;
    if(infl>0 && cls==='connected') return;
    led.classList.remove('connected','offline','syncing');
    led.classList.add(cls);
  };

  if((window.__syncInflight||0)===0) setLed(navigator.onLine ? 'connected' : 'offline');

  // Sync indicator (in-flight writes)
  let inflight = 0;
  window.__syncInflight = 0;
  const beginWrite = () => { inflight++; window.__syncInflight = inflight; setLed('syncing'); };
  const endWrite = () => {
    inflight = Math.max(0, inflight-1);
    window.__syncInflight = inflight;
    if(inflight===0) if((window.__syncInflight||0)===0) setLed(navigator.onLine ? 'connected' : 'offline');
  };

  window.addEventListener('online', ()=>{ if(inflight===0) setLed('connected'); });
  window.addEventListener('offline', ()=>{ setLed('offline'); });

  
  // ====== CLOUD READY GATE (prevenzione overwrite su avvio/refresh) ======
  window.__cloudReady = false;
  let __cloudTastingsReady = false;
  let __cloudAnaReady = false;
  function __markCloudReady(which){
    if(which==='tastings') __cloudTastingsReady = true;
    if(which==='anagrafiche') __cloudAnaReady = true;
    if(__cloudTastingsReady && __cloudAnaReady) window.__cloudReady = true;
  }
// ====== INIT FIREBASE (NON BLOCCANTE) ======
  let db = null;
  let storage = null; // V198
  try{
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    try{ storage = firebase.storage(); }catch(se){ console.warn('Storage init failed:', se); }
  }catch(e){
    console.error('Firebase init error:', e);
    setLed('offline');
  }

  // ====== DIFF-BASED CLOUD SYNC ======
  // Salva SEMPRE sul cloud; niente salvataggio locale.

  const stableStringify = (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k,v)=>{
      if(v && typeof v==='object'){
        if(seen.has(v)) return;
        seen.add(v);
        if(Array.isArray(v)) return v;
        const out={};
        Object.keys(v).sort().forEach(key=>out[key]=v[key]);
        return out;
      }
      return v;
    });
  };

  // Track last pushed hashes
  let lastAnaHash = '';
  const lastTastingHash = new Map();
  const lastEvalHash = new Map(); // key: tid|tasterId|sampleId

  // Prevent echo loops
  window.__cloudApplying = false;

  // Cloud write helpers
    // Expose delete for UI without name collisions
  window.__deleteTastingCloud = async (id) => {
    if(!db || !id) return;
    beginWrite();
    try{ await deleteDoc(doc(db,'tastings', String(id))); }
    catch(e){ console.error('delete tasting cloud error', e); setLed('offline'); }
    finally{ endWrite(); }
  };

const pushAnagrafiche = async () => {
    if(!db) return;
    const payload = {
      tasters: state.tasters || [],
      profiles: state.profiles || [],
      groups: state.groups || [],
      descriptors: state.descriptors || [],
      updatedAt: new Date().toISOString()
    };
    beginWrite();
    try{ await setDoc(doc(db,'global','anagrafiche'), payload, {merge:true}); }
    finally{ endWrite(); }
  };

  const pushTastingMeta = async (t) => {
    if(!db || !t || !t.id) return;
    const payload = JSON.parse(JSON.stringify(t));
    delete payload.evaluations;
    // blindMap viene sincronizzato su canale separato
    try{ delete payload.blindMap; }catch(e){}
    payload.updatedAt = new Date().toISOString();
    beginWrite();
    try{ await setDoc(doc(db,'tastings', String(t.id)), payload, {merge:true}); }
    finally{ endWrite(); }
  };

  const deleteTastingDoc = async (id) => {
    if(!db || !id) return;
    beginWrite();
    try{ await deleteDoc(doc(db,'tastings', String(id))); }
    finally{ endWrite(); }
  };

  const pushEvalDoc = async (tid, tasterId, sampleId, ev) => {
    if(!db || !tid || !tasterId || !sampleId) return;
    const payload = JSON.parse(JSON.stringify(ev || {}));
    // Non sincronizzare il canvas dentro le evaluation (troppo pesante e causa refresh UI continui)
    try{ if(payload && payload.data && payload.data.vista) delete payload.data.vista.canvas; }catch(e){}
    payload.tastingId = String(tid);
    payload.tasterId = Number(tasterId);
    payload.sampleId = String(sampleId);
    payload.updatedAt = new Date().toISOString();
    beginWrite();
    try{ await setDoc(doc(db,'tastings', String(tid), 'evaluations', `${tasterId}_${sampleId}`), payload, {merge:true}); }
    finally{ endWrite(); }
  };

  

  // ====== ISOLATED CANVAS SYNC — V198: Firebase Storage ======
  let __canvasSyncTimer = null;
  let __canvasDirtyUntil = 0;

  const queueCanvasSync = (tid, tasterId, sampleId, dataUrl) => {
    if(!db || !tid || !tasterId || !sampleId) return;
    __canvasDirtyUntil = Date.now() + 1500;
    if(__canvasSyncTimer) clearTimeout(__canvasSyncTimer);
    __canvasSyncTimer = setTimeout(async ()=>{
      const docKey = String(tasterId) + '_' + String(sampleId);
      if(!dataUrl){
        const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), storageUrl: null, dataUrl: null, updatedAt: new Date().toISOString() };
        beginWrite();
        try{ await setDoc(doc(db,'tastings', String(tid), 'canvases', docKey), payload, {merge:true}); } finally { endWrite(); }
        return;
      }
      if(storage){
        try{
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const path = 'canvases/' + tid + '/' + docKey + '.png';
          const storageRef = firebase.storage().ref(path);
          beginWrite();
          try{
            await storageRef.put(blob, { contentType: 'image/png' });
            const storageUrl = await storageRef.getDownloadURL();
            const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), storageUrl: storageUrl, dataUrl: null, updatedAt: new Date().toISOString() };
            await setDoc(doc(db,'tastings', String(tid), 'canvases', docKey), payload, {merge:true});
            console.log('V198: Canvas to Storage:', path);
          } finally { endWrite(); }
        } catch(e){
          console.warn('V198: Storage fallback:', e);
          const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), dataUrl: dataUrl, updatedAt: new Date().toISOString() };
          beginWrite();
          try{ await setDoc(doc(db,'tastings', String(tid), 'canvases', docKey), payload, {merge:true}); } finally { endWrite(); }
        }
      } else {
        const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), dataUrl: dataUrl, updatedAt: new Date().toISOString() };
        beginWrite();
        try{ await setDoc(doc(db,'tastings', String(tid), 'canvases', docKey), payload, {merge:true}); } finally { endWrite(); }
      }
    }, 700);
  };
  window.queueCanvasSync = queueCanvasSync;

  // ====== V197: IMPROVED FABRIC NOTES SYNC ======
  // Generate unique instance ID for this browser session
  window.__notesInstanceId = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  let __notesSyncTimers = {}; // V197: Per-sample timers
  let __notesDirtyUntil = 0;
  let __notesLastSyncedAt = {}; // Track last sync per sample
  let __notesLastReceivedAt = {}; // Track when we last received an update

  const queueNotesSync = (tid, tasterId, sampleId, notesData) => {
    if(!db || !tid || !tasterId || !sampleId) return;
    
    const key = String(tid) + '_' + String(tasterId) + '_' + String(sampleId);
    __notesDirtyUntil = Date.now() + 1200; // V197: Reduced to 1.2s
    __notesLastSyncedAt[key] = Date.now();
    
    // V197: Clear previous timer for this specific sample
    if(__notesSyncTimers[key]) clearTimeout(__notesSyncTimers[key]);
    
    __notesSyncTimers[key] = setTimeout(async ()=>{
      delete __notesSyncTimers[key];
      const payload = {
        tastingId: String(tid),
        tasterId: Number(tasterId),
        sampleId: String(sampleId),
        notesData: notesData || null,
        updatedAt: new Date().toISOString(),
        instanceId: window.__notesInstanceId
      };
      beginWrite();
      try{
        console.log('☁️ V197: Syncing notes to Firebase...', tid, tasterId, sampleId);
        await setDoc(doc(db,'tastings', String(tid), 'fabricNotes', String(tasterId) + '_' + String(sampleId)), payload, {merge:true});
        console.log('✅ V197: Notes synced to Firebase');
      } catch(e) {
        console.error('❌ V197: Notes sync error:', e);
      } finally { endWrite(); }
    }, 500); // V197: Reduced to 500ms for faster sync
  };
  window.queueNotesSync = queueNotesSync;

  let unsubNotesDeg = null;
  function ensureNotesSubDeg(tid){
    if(unsubNotesDeg){ unsubNotesDeg(); unsubNotesDeg=null; }
    if(!db || !tid) return;
    
    console.log('📡 V196: Subscribing to notes collection for tasting', tid);
    
    unsubNotesDeg = onSnapshot(collection(db,'tastings', String(tid), 'fabricNotes'), (snap)=>{
      const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
      if(!t) return;
      
      snap.docChanges().forEach(change => {
        if(change.type !== 'added' && change.type !== 'modified') return;
        
        const ds = change.doc;
        const d = ds.data() || {};
        const key = ds.id;
        const parts = String(key).split('_');
        const ta = parts[0];
        const sa = parts.slice(1).join('_');
        if(!ta || !sa) return;

        // V196: Check if this is from our own instance (skip to avoid loops)
        if(d.instanceId && d.instanceId === window.__notesInstanceId) {
          console.log('⏭️ V196: Skipping own instance change for', ta, sa);
          return;
        }
        
        // V196: Check update timestamp - only apply if newer
        const fullKey = String(tid) + '_' + ta + '_' + sa;
        const lastReceived = __notesLastReceivedAt[fullKey] || 0;
        const updateTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        
        if(updateTime <= lastReceived) {
          console.log('⏭️ V196: Skipping older update for', ta, sa);
          return;
        }
        
        __notesLastReceivedAt[fullKey] = updateTime;
        
        // V196: Check if we're currently editing this sample
        const isCurrentSample = String(ta)===String(currentTasterId()) && String(sa)===String(selectedSampleId);
        const isLocallyDirty = Date.now() < __notesDirtyUntil && isCurrentSample;
        
        if(isLocallyDirty) {
          console.log('⏭️ V196: Skipping - local editing in progress for', ta, sa);
          return;
        }

        if(!t.evaluations) t.evaluations = {};
        if(!t.evaluations[String(ta)]) t.evaluations[String(ta)] = {};
        if(!t.evaluations[String(ta)][String(sa)]) t.evaluations[String(ta)][String(sa)] = blankEval();
        const ev = t.evaluations[String(ta)][String(sa)];
        if(!ev.data) ev.data = blankEval().data;
        if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
        
        // V195: Load notes data from Firebase
        if(d.notesData) {
          ev.data.vista.notesV187 = d.notesData;
          console.log('📥 V195: Notes received from Firebase for', ta, sa, '- current sample:', isCurrentSample);
          
          // V195: Refresh UI if this is current sample
          if(isCurrentSample){
            console.log('🔄 V195: Refreshing notes UI for current sample');
            try{ 
              if(typeof refreshWidgetNotes === 'function') refreshWidgetNotes();
              if(typeof refreshFullscreenNotes === 'function') refreshFullscreenNotes();
            }catch(e){ console.error('Refresh error:', e); }
          }
        }
      });
    }, (err)=>{ console.error('fabricNotes snapshot error', err); });
  }

  let unsubCanvasDeg = null;
  function ensureCanvasSubDeg(tid){
    if(unsubCanvasDeg){ unsubCanvasDeg(); unsubCanvasDeg=null; }
    if(!db || !tid) return;
    // V195: Also subscribe to notes
    ensureNotesSubDeg(tid);
    
    unsubCanvasDeg = onSnapshot(collection(db,'tastings', String(tid), 'canvases'), (snap)=>{
      const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
      if(!t) return;
      snap.forEach(ds=>{
        const d = ds.data() || {};
        const key = ds.id;
        const parts = String(key).split('_');
        const ta = parts[0];
        const sa = parts.slice(1).join('_');
        if(!ta || !sa) return;

        try{
          if(Date.now() < __canvasDirtyUntil && String(ta)===String(currentTasterId()) && String(sa)===String(selectedSampleId)) return;
        }catch(e){}

        if(!t.evaluations) t.evaluations = {};
        if(!t.evaluations[String(ta)]) t.evaluations[String(ta)] = {};
        if(!t.evaluations[String(ta)][String(sa)]) t.evaluations[String(ta)][String(sa)] = blankEval();
        const ev = t.evaluations[String(ta)][String(sa)];
        if(!ev.data) ev.data = blankEval().data;
        if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
        // V198: preferisci storageUrl, fallback dataUrl legacy
        ev.data.vista.canvas = d.storageUrl || d.dataUrl || null;

        try{
          if(String(ta)===String(currentTasterId()) && String(sa)===String(selectedSampleId)){
            loadCanvasFromEval();
          }
        }catch(e){}
      });
    }, (err)=>{ console.error('canvases snapshot error (degustazione)', err); });
  }

  // ====== ISOLATED BLIND TAG SYNC ======
  const queueBlindSync = async (tid, sampleId, productIdOrNull) => {
    if(!db || !tid || !sampleId) return;
    const payload = {
      tastingId: String(tid),
      sampleId: String(sampleId),
      productId: productIdOrNull ? String(productIdOrNull) : null,
      updatedAt: new Date().toISOString()
    };
    beginWrite();
    try{ await setDoc(doc(db,'tastings', String(tid), 'blind', String(sampleId)), payload, {merge:true}); }
    finally{ endWrite(); }
  };
  window.queueBlindSync = queueBlindSync;

  const updateBlindCardTag = (sampleId) => {
    const sid = String(sampleId||'');
    // usa apici singoli nell'attributo CSS per evitare escape in JS
    const selector = ".sample-card[data-sampleid='" + safeCssEscape(sid) + "']";
    const card = document.querySelector(selector);
    if(!card) return;
    const t = getTasting();
    if(!t || t.mode!=='cieca') return;
    const row = card.querySelector('.chips-row');
    if(!row) return;
    row.querySelectorAll('.blind-assigned').forEach(n=>n.remove());
    const pid = t.blindMap ? t.blindMap[sid] : null;
    if(!pid) return;
    const p = productById(t, pid);
    const pc = p ? cols4(p.cols) : ['Prodotto?','','',''];
    const pm = (pc[0] && pc[1]) ? pc[1] : pc[0];
    const tag = document.createElement('span');
    tag.className = 'pchip blind-assigned';
    tag.dataset.sid = sid;
    tag.textContent = pm;
    tag.style.cssText = 'font-size:10px;padding:2px 6px;margin:2px 0;margin-right:auto;display:inline-block;width:auto;background:#444;color:#fff;border:1px solid #333;box-shadow:0 1px 2px rgba(0,0,0,0.2);cursor:pointer;';
    row.appendChild(tag);
    tag.addEventListener('click', (e)=>{ e.stopPropagation(); try{ window.dissociateBlindSample(sid); }catch(_){} });
  };

  let unsubBlindDeg = null;
  function ensureBlindSubDeg(tid){
    if(unsubBlindDeg){ unsubBlindDeg(); unsubBlindDeg=null; }
    if(!db || !tid) return;
    unsubBlindDeg = onSnapshot(collection(db,'tastings', String(tid), 'blind'), (snap)=>{
      const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
      if(!t) return;
      const next = {};
      snap.forEach(ds=>{
        const d = ds.data() || {};
        const sid = String(d.sampleId || ds.id);
        if(!sid) return;
        if(d.productId) next[sid] = String(d.productId);
      });
      t.blindMap = next;
      try{ renderProductsStrip(); }catch(e){}
      Object.keys(next).forEach(sid=>{ try{ updateBlindCardTag(sid); }catch(e){} });
      document.querySelectorAll('.sample-card .blind-assigned').forEach(tag=>{
        const sid = tag.dataset.sid;
        if(sid && !next[sid]) tag.remove();
      });
    }, (err)=>{ console.error('blind snapshot error (degustazione)', err); });
  }

// V196: Faster sync scheduler (400ms instead of 800ms)
  let syncTimer = null;
  window.cloudRequestSync = function(){
    if(!window.__cloudReady) return;
    if(window.__cloudApplying) return;
    if(syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, 400); // V196: Reduced from 800ms
  };

  async function runSync(){
    if(!db) return;

    // 1) Anagrafiche
    const anaObj = {
      tasters: state.tasters || [],
      profiles: state.profiles || [],
      groups: state.groups || [],
      descriptors: state.descriptors || []
    };
    const anaHash = stableStringify(anaObj);
    if(anaHash !== lastAnaHash){
      await pushAnagrafiche();
      lastAnaHash = anaHash;
    }

    // 2) Tastings meta + detect deletions
    const currentIds = new Set((state.tastings||[]).map(t=>String(t.id)));
    for(const [tid] of list(lastTastingHash)){
      if(!currentIds.has(tid)){
        // deleted locally -> delete in cloud
        await deleteTastingDoc(tid);
        lastTastingHash.delete(tid);
      }
    }

    for(const t of (state.tastings||[])){
      const meta = JSON.parse(JSON.stringify(t));
      delete meta.evaluations;
      const h = stableStringify(meta);
      const tid = String(t.id);
      if(lastTastingHash.get(tid) !== h){
        await pushTastingMeta(t);
        lastTastingHash.set(tid, h);
      }

      // 3) Evaluations push (diff)
      const evals = (t.evaluations||{});
      Object.keys(evals).forEach(tasterId=>{
        const per = evals[tasterId] || {};
        Object.keys(per).forEach(sampleId=>{
          const ev = per[sampleId];
          const key = `${tid}|${tasterId}|${sampleId}`;
          const eh = stableStringify(ev);
          if(lastEvalHash.get(key) !== eh){
            // Fire and await sequentially for safety
            // eslint-disable-next-line no-async-promise-executor
          }
        });
      });

      for(const tasterId of Object.keys(evals)){
        const per = evals[tasterId] || {};
        for(const sampleId of Object.keys(per)){
          const ev = per[sampleId];
          const key = `${tid}|${tasterId}|${sampleId}`;
          const eh = stableStringify(ev);
          if(lastEvalHash.get(key) !== eh){
            // V148: non pushare evaluation vuote (placeholder UI) => evita overwrite cross-istanz a
            if(typeof isBlankEval==='function' && isBlankEval(ev)){
              lastEvalHash.set(key, eh);
              continue;
            }
            await pushEvalDoc(tid, tasterId, sampleId, ev);
            lastEvalHash.set(key, eh);
          }
        }
      }
    }
  }

  // helper for iterating maps
  function list(m){ return Array.from(m.entries()); }

  // ====== POLLING SYNC (SOURCE OF TRUTH, 1s) ======
  // Nota: con Firebase compat, DocumentSnapshot.exists è una proprietà booleana.
  let __pollBusy = false;
  let __pollTimer = null;
  let __uiBusyUntil = 0;
  window.markUiBusy = (ms=1100)=>{ __uiBusyUntil = Date.now() + (ms||1100); };

  // V142: finestra di protezione locale (evita che il polling sovrascriva modifiche appena fatte)
  let __localDirtyUntil = 0;
  window.markLocalDirty = (ms=4500)=>{
    try{ __localDirtyUntil = Math.max(__localDirtyUntil, Date.now() + (ms||4500)); }catch(e){}
  };


  let __lastTastingsHash = '';
  let __lastBlindHash = '';
  let __lastCanvasHash = '';

  async function pollTastings(){
    if(!db) return;
    const snap = await getDocs(collection(db,'tastings'));

    // V146: preserva evaluations (profili/evoluzione/descrittori/preferiti) su refresh da altre istanze.
    // Aggiorna solo metadati riusando l'oggetto esistente quando possibile.
    const existingById = new Map();
    (state.tastings||[]).forEach(t0=> existingById.set(String(t0.id), t0));

    const blindMapLocal = new Map();
    (state.tastings||[]).forEach(t0=> blindMapLocal.set(String(t0.id), t0.blindMap||{}));

    const list = [];
    snap.forEach(ds=>{
      const d = ds.data() || {};
      try{ delete d.blindMap; }catch(e){}
      const id = String(ds.id);

      let obj = existingById.get(id);
      if(obj){
        const keepEvals = obj.evaluations || {};
        const keepBlind = blindMapLocal.get(id) || obj.blindMap || {};
        Object.assign(obj, d, { id });
        obj.evaluations = keepEvals;
        obj.blindMap = keepBlind;
      } else {
        obj = { ...d, id, evaluations: {}, blindMap: (blindMapLocal.get(id) || {}) };
      }
      list.push(obj);
    });
    list.sort((a,b)=>(String(b.createdAt||'')).localeCompare(String(a.createdAt||'')));

const meta = list.map(t=>({id:t.id, updatedAt:t.updatedAt||'', status:t.status||'', title:t.title||''}));
    const h = stableStringify(meta);
    if(h === __lastTastingsHash) return;

    window.__cloudApplying = true;
    try{
      state.tastings = list;
      // V146: oggetti riusati => non si perdono evaluations già caricate
      if(state.currentTastingId && !state.tastings.some(t=>String(t.id)===String(state.currentTastingId))){
        state.currentTastingId = state.tastings[0]?.id || null;
      }
    } finally { window.__cloudApplying = false; }

    __lastTastingsHash = h;
    __markCloudReady('tastings');

    if(Date.now() < __uiBusyUntil) return;
    try{ if(typeof renderPreparation==='function') renderPreparation(); }catch(e){}
    try{ if(typeof renderArchive==='function') renderArchive(); }catch(e){}
    try{ if(typeof renderResultsSelect==='function') renderResultsSelect(); }catch(e){}
    try{ const page = document.querySelector('.page.active')?.id || ''; if(page==='page-degustazione' && typeof renderTastingPage==='function') renderTastingPage(); }catch(e){}
  }

  async function pollAnagrafiche(){
    if(!db) return;
    const snap = await getDoc(doc(db,'global','anagrafiche'));
    if(!snap.exists){
      await pushAnagrafiche();
      __markCloudReady('anagrafiche');
      return;
    }
    const d = snap.data() || {};
    const h = stableStringify({
      tasters: Array.isArray(d.tasters)?d.tasters:[],
      profiles: Array.isArray(d.profiles)?d.profiles:[],
      groups: Array.isArray(d.groups)?d.groups:[],
      descriptors: (d.descriptors && typeof d.descriptors==='object') ? d.descriptors : {}
    });
    if(h === lastAnaHash) { __markCloudReady('anagrafiche'); return; }

    window.__cloudApplying = true;
    try{
      state.tasters = Array.isArray(d.tasters) ? d.tasters : state.tasters;
      state.profiles = Array.isArray(d.profiles) ? d.profiles : state.profiles;
      state.groups = Array.isArray(d.groups) ? d.groups : state.groups;
      state.descriptors = (d.descriptors && typeof d.descriptors==='object') ? d.descriptors : state.descriptors;
      lastAnaHash = h;
    } finally { window.__cloudApplying = false; }

    __markCloudReady('anagrafiche');

    if(Date.now() < __uiBusyUntil) return;
    try{ if(typeof renderAnagrafiche==='function') renderAnagrafiche(); }catch(e){}
    try{ if(typeof renderPreparation==='function') renderPreparation(); }catch(e){}
    try{ if(typeof renderResultsTable==='function') renderResultsTable(); }catch(e){}
    try{ const page = document.querySelector('.page.active')?.id || ''; if(page==='page-degustazione' && typeof renderTastingPage==='function') renderTastingPage(); }catch(e){}
  }

  
  window.fetchArchivedEvaluations = async (tid) => {
     if(!db || !tid) return;
     const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
     if(!t) return;
     try{
       const snap = await getDocs(collection(db,'tastings', String(tid), 'evaluations'));
       t.evaluations = t.evaluations || {};
       snap.forEach(ds=>{
          const ev = ds.data() || {};
          if(!ev.tasterId || !ev.sampleId) return;
          const ta = String(ev.tasterId);
          const sa = String(ev.sampleId);
          if(!t.evaluations[ta]) t.evaluations[ta] = {};
          t.evaluations[ta][sa] = ev; 
       });
     }catch(e){
       console.error("Errore fetch archivio", e);
     }
  };

async function pollEvaluations(tid){
    // V142: evita overwrite da cloud mentre ci sono modifiche locali recenti o write in corso
    try{ if((window.__syncInflight||0)>0) return; }catch(e){}
    try{ if(Date.now() < __localDirtyUntil) return; }catch(e){}
    if(!db || !tid) return;
    const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
    if(!t) return;
    const snap = await getDocs(collection(db,'tastings', String(tid), 'evaluations'));
    let changed = false;

    window.__cloudApplying = true;
    try{
      t.evaluations = t.evaluations || {};
      snap.forEach(ds=>{
        const ev = ds.data() || {};
        // Il canvas NON viaggia nelle evaluation: preserva quello locale già applicato da pollCanvases()
        let keepCanvas = null;
        try{ keepCanvas = t.evaluations?.[String(ev.tasterId)]?.[String(ev.sampleId)]?.data?.vista?.canvas || null; }catch(e){}
        try{ if(ev && ev.data && ev.data.vista) delete ev.data.vista.canvas; }catch(e){}
        if(!ev.tasterId || !ev.sampleId) return;
        const ta = String(ev.tasterId);
        const sa = String(ev.sampleId);
        if(!t.evaluations[ta]) t.evaluations[ta] = {};
        const key = `${tid}|${ta}|${sa}`;
        const eh = stableStringify(ev);
        if(lastEvalHash.get(key) !== eh){
          // V148: merge updatedAt (non sovrascrivere locale piu' recente)
          try{
            const cur = t.evaluations?.[ta]?.[sa];
            const rU = String(ev.updatedAt||'');
            const lU = String(cur?.updatedAt||'');
            if(cur && lU && rU && lU > rU && !(typeof isBlankEval==='function' && isBlankEval(cur))){
              // locale piu' recente: aggiorna solo hash e non applicare
              lastEvalHash.set(key, eh);
              return;
            }
          }catch(_e){}
          t.evaluations[ta][sa] = ev;
          if(keepCanvas){
            try{
              if(!t.evaluations[ta][sa].data) t.evaluations[ta][sa].data = {};
              if(!t.evaluations[ta][sa].data.vista) t.evaluations[ta][sa].data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
              t.evaluations[ta][sa].data.vista.canvas = keepCanvas;
            }catch(e){}
          }
          lastEvalHash.set(key, eh);
          changed = true;
        }
      });
    } finally { window.__cloudApplying = false; }

    if(!changed) return;
    if(Date.now() < __uiBusyUntil) return;

    try{ if(typeof renderGrid==='function') renderGrid(); }catch(e){}
    try{ if(typeof updateDetail==='function') updateDetail(); }catch(e){}
    try{ if(typeof renderResultsTable==='function') renderResultsTable(); }catch(e){}
  }

  async function pollCanvases(tid){
    if(!db || !tid) return;
    const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
    if(!t) return;
    const snap = await getDocs(collection(db,'tastings', String(tid), 'canvases'));
    const list = [];
    snap.forEach(ds=>{ list.push({id: ds.id, ...(ds.data()||{})}); });
    const h = stableStringify(list.map(x=>({id:x.id, updatedAt:x.updatedAt||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id))));
    if(h === __lastCanvasHash) return;
    __lastCanvasHash = h;

    window.__cloudApplying = true;
    try{
      list.forEach(d=>{
        const key = String(d.id||'');
        const parts = key.split('_');
        const ta = parts[0];
        const sa = parts.slice(1).join('_');
        if(!ta || !sa) return;
        if(!t.evaluations) t.evaluations = {};
        if(!t.evaluations[String(ta)]) t.evaluations[String(ta)] = {};
        if(!t.evaluations[String(ta)][String(sa)]) t.evaluations[String(ta)][String(sa)] = blankEval();
        const ev = t.evaluations[String(ta)][String(sa)];
        if(!ev.data) ev.data = blankEval().data;
        if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
        ev.data.vista.canvas = d.dataUrl || null;
      });
    } finally { window.__cloudApplying = false; }

    if(Date.now() < __uiBusyUntil) return;
    try{ loadCanvasFromEval(); }catch(e){}
  }

  async function pollBlind(tid){
    if(!db || !tid) return;
    const t = (state.tastings||[]).find(x=>String(x.id)===String(tid));
    if(!t) return;
    const snap = await getDocs(collection(db,'tastings', String(tid), 'blind'));
    const next = {};
    snap.forEach(ds=>{
      const d = ds.data() || {};
      const sid = String(d.sampleId || ds.id);
      if(!sid) return;
      if(d.productId) next[sid] = String(d.productId);
    });
    const h = stableStringify(next);
    if(h === __lastBlindHash) return;
    __lastBlindHash = h;

    window.__cloudApplying = true;
    try{ t.blindMap = next; } finally { window.__cloudApplying = false; }

    if(Date.now() < __uiBusyUntil) return;
    try{ renderProductsStrip(); }catch(e){}
    try{ updateDetail(); }catch(e){}
    try{ Object.keys(next).forEach(sid=>{ updateBlindCardTag(sid); }); }catch(e){}
    try{ document.querySelectorAll('.sample-card .blind-assigned').forEach(tag=>{ const sid = tag.dataset.sid; if(sid && !next[sid]) tag.remove(); }); }catch(e){}
  }

  async function __pollStep(name, fn){
    try{ return await fn(); }
    catch(e){
      const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
      throw new Error(`[pollStep:${name}] ${msg}`);
    }
  }

  async function pollOnce(){
    if(!db || __pollBusy) return;
    __pollBusy = true;
    try{
      await __pollStep('tastings', pollTastings);
      await __pollStep('anagrafiche', pollAnagrafiche);
      const tid = state.currentTastingId;
      if(tid){
        await __pollStep('blind', ()=>pollBlind(tid));
        await __pollStep('canvases', ()=>pollCanvases(tid));
        await __pollStep('evaluations', ()=>pollEvaluations(tid));
      }
      if((window.__syncInflight||0)===0) setLed(navigator.onLine ? 'connected' : 'offline');
    }catch(e){
      console.error('poll error', e && (e.stack || e.message || e));
      setLed('offline');
    }finally{
      __pollBusy = false;
    }
  }

  if(db){
    pollOnce();
    __pollTimer = setInterval(pollOnce, 10000);
  }

  // compat stubs
  function ensureEvalSub(tid){}
  function ensureEvalSubDeg(tid){}
  function ensureCanvasSubDeg(tid){}
  function ensureBlindSubDeg(tid){}

  // ====== END POLLING SYNC ======

  // V29 helpers
    function evoDotsHTML(evo, cls){
      const v = Math.max(0, Math.min(5, parseInt(evo||0,10)||0));
      const k = cls ? (' '+cls) : '';
      let h = '';
      for(let i=1; i<=5; i++){
        h += '<span class="dot'+k+' '+(i<=v?'on':'')+'"></span>';
      }
      return h;
    }
    function tasterHasAnyData(t, tasterId){
      const per = t?.evaluations?.[String(tasterId)];
      if(!per) return false;
      for(const sid of Object.keys(per)){
        const ev = per[sid];
        if(!ev) continue;
        if(ev.profileKey || (ev.evolution||0)>0 || ev.favourite) return true;
        const v = ev.data?.vista||{};
        const o = ev.data?.olfatto||{};
        const g = ev.data?.gusto||{};
        const sliders = [v.intensita, v.limpidezza, o.intensita, o.complessita, g.corpo, g.acidita, g.persistenza];
        if(sliders.some(x=>(parseInt(x||0,10)||0)>0)) return true;
        if((v.desc||[]).length || (o.desc||[]).length || (g.desc||[]).length) return true;
        if((v.canvas||'').length>50) return true;
      }
      return false;
    }
window.toggleBlindProduct = function(pid){
       if(isArchived()) return;
       const tid = state.ui.currentTastingId;
       if(!tid) return;
       const t = state.tastings.find(x=>x.id===tid);
       if(!t) return;

       const sPid = String(pid);
       const existingSid = Object.keys(t.blindMap || {}).find(k => String(t.blindMap[k]) === sPid);

       if(existingSid){
           const currentSid = String(selectedSampleId);
           if(existingSid === currentSid){
               delete t.blindMap[currentSid];
               toast("Dissociato");
           } else {
               if(confirm(`Questo prodotto è assegnato al campione ${existingSid}. Spostarlo qui?`)){
                   delete t.blindMap[existingSid];
                   t.blindMap[currentSid] = sPid;
                   toast("Spostato e Assegnato");
               } else { return; }
           }
       } else {
           if(!selectedSampleId){ toast("Seleziona un campione"); return; }
           t.blindMap[String(selectedSampleId)] = sPid;
       toast("Assegnato");
       }
       saveState({skipCloud:true});
       try{ window.queueBlindSync && window.queueBlindSync(t.id, String(selectedSampleId), sPid); }catch(e){}
       try{ updateBlindCardTag(String(selectedSampleId)); }catch(e){}
       renderProductsStrip(); updateDetail();
    };
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


// Override finale: gestione robusta blind (no renderGrid, sync su canale blind)
window.toggleBlindProduct = async function(pid){
  if(isArchived()) return;
  const t = getTasting();
  if(!t || t.mode!=='cieca') return;
  if(!selectedSampleId){ toast('Seleziona un campione'); return; }

  const sPid = String(pid);
  const currentSid = String(selectedSampleId);
  if(!t.blindMap) t.blindMap = {};
  const existingSid = Object.keys(t.blindMap).find(k => String(t.blindMap[k]) === sPid);

  if(existingSid){
    if(existingSid === currentSid){
      delete t.blindMap[currentSid];
      saveState({skipCloud:true});
      try{ window.queueBlindSync && window.queueBlindSync(t.id, currentSid, null); }catch(e){}
      try{ updateBlindCardTag(currentSid); }catch(e){}
      renderProductsStrip(); updateDetail();
      toast('Dissociato');
      return;
    }
    if(!confirm(`Questo prodotto è assegnato al campione ${existingSid}. Spostarlo qui?`)) return;
    delete t.blindMap[existingSid];
    t.blindMap[currentSid] = sPid;
    saveState({skipCloud:true});
    try{ window.queueBlindSync && window.queueBlindSync(t.id, existingSid, null); }catch(e){}
    try{ window.queueBlindSync && window.queueBlindSync(t.id, currentSid, sPid); }catch(e){}
    try{ updateBlindCardTag(existingSid); }catch(e){}
    try{ updateBlindCardTag(currentSid); }catch(e){}
    renderProductsStrip(); updateDetail();
    toast('Spostato e Assegnato');
    return;
  }

  t.blindMap[currentSid] = sPid;
  saveState({skipCloud:true});
  try{ window.queueBlindSync && window.queueBlindSync(t.id, currentSid, sPid); }catch(e){}
  try{ updateBlindCardTag(currentSid); }catch(e){}
  renderProductsStrip(); updateDetail();
  toast('Assegnato');
};



/* =========================
   UI: Campioni nascosti (V100)
   - Long press 1.5s su card (senza movimento) => nasconde
   - ∅ ripristina
   ========================= */

function _hidTid(tid){ return String(tid||''); }

function getHiddenSamplesForTasting(tid){
  if(!state.ui) state.ui = {};
  if(!state.ui.hiddenSamples) state.ui.hiddenSamples = {};
  return state.ui.hiddenSamples[_hidTid(tid)] || [];
}

function isSampleHidden(tastingId, sampleId){
  const key = hiddenKeyForCurrent();
  if(!key) return false;
  const arr = getHiddenSamplesForTasting(key) || [];
  return arr.includes(String(sampleId));
}



function hiddenKeyForCurrent(){
  const t = getTasting();
  if(!t) return null;
  const ta = currentTasterId();
  // per degustatore: tastingId|tasterId (0 se non selezionato)
  return String(t.id) + '|' + String(ta||0);
}
function hideSample(sid){
  const t = getTasting();
  if(!t) return;
  const tid = hiddenKeyForCurrent();
  if(!tid) return;
  const arr = getHiddenSamplesForTasting(tid).slice();
  const s = String(sid);
  if(!arr.includes(s)) arr.push(s);
  state.ui.hiddenSamples[tid] = arr;

  if(String(selectedSampleId||'') === s) selectedSampleId = null;

  saveState();
  renderProductsStrip();
  renderGrid();
  updateDetail();
  updateHiddenButtons();
  toast('Campione nascosto');
}

function unhideAllSamples(){
  const t = getTasting();
  if(!t) return;
  const tid = hiddenKeyForCurrent();
  if(!tid) return;
  if(state.ui && state.ui.hiddenSamples && state.ui.hiddenSamples[tid]){
    state.ui.hiddenSamples[tid] = [];
    saveState();
  }

function unhideSingleSample(sampleId){
  const tId = currentTasterId();
  if(!tId) return;
  const key = hiddenKeyForCurrent();
  const list = getHiddenSamplesForTasting(key) || [];
  const sid = String(sampleId);
  const next = list.filter(x => String(x) !== sid);
  setHiddenSamplesForTasting(key, next);
  saveState({skipCloud:true});
  try{ renderGrid(); }catch(e){}
  try{ updateHiddenButtons(); }catch(e){}
}

function renderHiddenSampleIdBtns(){
  const wrap = document.getElementById('hiddenSampleIdsWrap');
  if(!wrap) return;
  const tId = currentTasterId();
  if(!tId){ wrap.innerHTML = ''; return; }

  const key = hiddenKeyForCurrent();
  const list = getHiddenSamplesForTasting(key) || [];
  if(!list.length){ wrap.innerHTML = ''; return; }

  wrap.innerHTML = '<div class="muted" style="margin-top:10px; font-weight:900">Campioni nascosti</div>' +
    '<div class="hidden-ids-row">' +
      list.map(sid => `<button class="hidden-id-btn" onclick="unhideSingleSample('${esc(String(sid))}')">${esc(String(sid))}</button>`).join('') +
    '</div>';
}

  renderProductsStrip();
  renderGrid();
  updateDetail();
  updateHiddenButtons();
  toast('Campioni ripristinati');
}

function countHiddenCurrent(){
  const key = hiddenKeyForCurrent();
  if(!key) return 0;
  const arr = getHiddenSamplesForTasting(key) || [];
  return arr.length;
}


function updateHiddenButtons(){
  const tId = currentTasterId();
  const n = tId ? countHiddenCurrent() : 0;

  const btn = document.getElementById('btnFiltersUnhide');
  if(btn){
    const onUnhide = (tId && n>0);
    btn.classList.toggle('disabled', !onUnhide);
    btn.disabled = !onUnhide;
  }

  // Render lista ID campioni nascosti per degustatore attivo
  try{ renderHiddenSampleIdBtns(); }catch(e){}

  // Evidenzia Filtri SOLO se è selezionato un degustatore e ha campioni nascosti
  const on = (tId && n>0);
  const bTop = document.getElementById('btnTopFilters');
  if(bTop) bTop.classList.toggle('filters-has-hidden', on);

  const bZenPlus = document.getElementById('btnZenPlusTopFilters');
  if(bZenPlus) bZenPlus.classList.toggle('filters-has-hidden', on);

  try{
    document.querySelectorAll('#zenBar button[onclick*="toggleFiltersPanel"]').forEach(b=>{
      b.classList.toggle('filters-has-hidden', on);
    });
  }catch(e){}
}

const __hideLP = { timer:null, x:0, y:0, suppressUntil:0 };

function bindHideLongPress(){
  const grid = document.getElementById('samplesGrid');
  if(!grid || grid.__hideBound) return;
  grid.__hideBound = true;

  const LP_MS = 1500;
  const MOVE_PX = 12;

  let timer = null;
  let startX = 0, startY = 0;
  let sid = null;
  let fired = false;

  const clear = ()=>{
    if(timer){ clearTimeout(timer); timer = null; }
    sid = null;
  };

  const start = (x,y,target)=>{
    const card = target && target.closest ? target.closest('.sample-card') : null;
    if(!card) return;
    if(target.closest && (target.closest('.fav-heart') || target.closest('.dot'))) return;

    sid = String(card.dataset.sampleid || card.getAttribute('data-sampleid') || '');
    if(!sid) return;

    startX = x; startY = y;
    fired = false;
    if(timer) clearTimeout(timer);

    timer = setTimeout(()=>{
      fired = true;
      try{ hideSample(sid); }catch(err){}
    }, LP_MS);
  };

  const move = (x,y)=>{
    if(!timer) return;
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    if(dx>MOVE_PX || dy>MOVE_PX) clear();
  };

  const end = ()=>{ clear(); };

  grid.addEventListener('pointerdown', (e)=> start(e.clientX, e.clientY, e.target), {capture:true});
  grid.addEventListener('pointermove', (e)=> move(e.clientX, e.clientY), {capture:true, passive:true});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=> grid.addEventListener(ev, end, {capture:true, passive:true}));

  // Touch fallback
  grid.addEventListener('touchstart', (e)=>{
    const t = e.touches && e.touches[0];
    if(!t) return;
    start(t.clientX, t.clientY, e.target);
  }, {capture:true, passive:true});
  grid.addEventListener('touchmove', (e)=>{
    const t = e.touches && e.touches[0];
    if(!t) return;
    move(t.clientX, t.clientY);
  }, {capture:true, passive:true});
  ['touchend','touchcancel'].forEach(ev=> grid.addEventListener(ev, end, {capture:true, passive:true}));

  // Blocca il click che segue il long-press
  grid.addEventListener('click', (e)=>{
    if(fired){
      e.preventDefault();
      e.stopPropagation();
      fired = false;
    }
  }, true);
}

setTimeout(()=>{ try{ bindHideLongPress(); updateHiddenButtons(); }catch(e){} }, 0);



  
  // ========================================================================

  (function() {
    'use strict';

    console.log('🚀 V160 FINALE caricato');

    // ========================================================================
    // 1. REAL-TIME SYNC
    // ========================================================================

    window.v160Listeners = window.v160Listeners || new Map();

    window.setupRealtimeListener = function(tastingId) {
      if(!db || !tastingId) return;
      if(v160Listeners.has(tastingId)) return;

      try {
        var tastingRef = doc(db, 'tastings', tastingId);
        var unsubscribe = onSnapshot(tastingRef, function(docSnap) {
          if(!docSnap.exists()) return;

          var cloudData = docSnap.data();
          var localTasting = state.tastings.find(function(t) { return t.id === tastingId; });

          if(localTasting) {
            var cloudTs = cloudData._lastModified || 0;
            var localTs = localTasting._lastModified || 0;

            if(cloudTs > localTs) {
              console.log('⚡ Sync ricevuto:', tastingId);
              Object.assign(localTasting, cloudData);
              localTasting._lastModified = cloudTs;
              saveState();

              if(state.currentTastingId === tastingId) {
                requestAnimationFrame(function() {
                  if(typeof renderTastingPage === 'function') renderTastingPage();
                  if(typeof renderGrid === 'function') renderGrid();
                  if(typeof updateDetail === 'function') updateDetail();
                });
              }

              if(typeof tastingChannel !== 'undefined' && tastingChannel) {
                tastingChannel.postMessage({
                  type: 'cloud_update',
                  tastingId: tastingId,
                  timestamp: cloudTs
                });
              }
            }
          }
        });

        v160Listeners.set(tastingId, unsubscribe);
        console.log('✓ Listener attivo:', tastingId);
      } catch(e) {
        console.error('Errore onSnapshot:', e);
      }
    };

    var originalOpenTasting = window.openTasting;
    if(originalOpenTasting) {
      window.openTasting = function(tasting) {
        var result = originalOpenTasting.apply(this, arguments);
        if(tasting && tasting.id) {
          setTimeout(function() { setupRealtimeListener(tasting.id); }, 100);
        }
        return result;
      };
    }

    // ========================================================================
    // 2. TABLET TOUCH SUPPORT
    // ========================================================================

    var isTablet = /iPad|iPhone|Android/i.test(navigator.userAgent);
    if(isTablet) console.log('📱 Tablet rilevato');

    document.addEventListener('touchend', function(e) {
      var target = e.target;
      if((target.tagName === 'BUTTON' || target.tagName === 'A') && 
         !target.hasAttribute('data-touch-handled')) {
        target.setAttribute('data-touch-handled', 'true');
        setTimeout(function() { target.removeAttribute('data-touch-handled'); }, 300);
        var clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        target.dispatchEvent(clickEvent);
      }
    }, { passive: true });

    var activeSlider = null;
    document.addEventListener('touchstart', function(e) {
      if(e.target.type === 'range') activeSlider = e.target;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if(activeSlider) {
        setTimeout(function() {
          if(activeSlider) {
            var inputEvent = new Event('input', { bubbles: true, cancelable: true });
            activeSlider.dispatchEvent(inputEvent);
          }
        }, 16);
      }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      if(activeSlider) {
        setTimeout(function() {
          if(activeSlider) {
            var changeEvent = new Event('change', { bubbles: true, cancelable: true });
            activeSlider.dispatchEvent(changeEvent);
            console.log('👆 Slider touch');
          }
          activeSlider = null;
        }, 100);
      }
    }, { passive: true });

    // ========================================================================
    // 3. DEBOUNCING
    // ========================================================================

    var writeTimers = {};
    var pushTastingMeta_original = window.pushTastingMeta;

    if(pushTastingMeta_original) {
      window.pushTastingMeta = function(tasting, immediate) {
        tasting._lastModified = Date.now();

        if(isTablet && !immediate) {
          console.log('⚡ Tablet: immediate write');
          immediate = true;
        }

        if(immediate === true) {
          if(writeTimers[tasting.id]) {
            clearTimeout(writeTimers[tasting.id]);
            delete writeTimers[tasting.id];
          }
          return pushTastingMeta_original(tasting);
        }

        var key = tasting.id;
        if(writeTimers[key]) clearTimeout(writeTimers[key]);

        writeTimers[key] = setTimeout(function() {
          delete writeTimers[key];
          pushTastingMeta_original(tasting);
        }, 200);
      };
    }

    // ========================================================================
    // 4. EXPORT EXCEL - VISTA CONFRONTO FEDELE
    // ========================================================================

    window.exportComparisonTableToExcel = function() {
      var tasting = state.tastings.find(function(t) { return t.id === state.currentTastingId; });
      if(!tasting || !tasting.samples || tasting.samples.length === 0) {
        alert('Nessun campione da esportare');
        return;
      }

      console.log('📊 Export tabella confronto...');

      var csv = [];

      // Header: Campione + tutti i descrittori + Totale
      var header = ['Campione'];

      // Raccogli descrittori (come nella vista)
      var descriptorKeys = new Set();
      tasting.samples.forEach(function(s) {
        if(s.evaluations) {
          Object.keys(s.evaluations).forEach(function(k) {
            descriptorKeys.add(k);
          });
        }
      });

      // Ordina descrittori in modo logico
      var categories = {
        vista: ['colore', 'limpidezza', 'intensità visiva', 'viscosità'],
        olfatto: ['intensità olfattiva', 'complessità olfattiva', 'qualità olfattiva', 'aroma', 'bouquet'],
        gusto: ['dolcezza', 'acidità', 'tannini', 'corpo', 'alcol', 'intensità gustativa', 'persistenza', 'equilibrio'],
        finale: ['finale', 'complessità', 'eleganza', 'tipicità']
      };

      var orderedDescriptors = [];

      // Ordina per categoria
      ['vista', 'olfatto', 'gusto', 'finale'].forEach(function(cat) {
        var catKeys = categories[cat] || [];
        Array.from(descriptorKeys).forEach(function(key) {
          var keyLower = key.toLowerCase();
          if(catKeys.some(function(ck) { return keyLower.includes(ck); }) && 
             orderedDescriptors.indexOf(key) === -1) {
            orderedDescriptors.push(key);
          }
        });
      });

      // Aggiungi rimanenti
      Array.from(descriptorKeys).forEach(function(key) {
        if(orderedDescriptors.indexOf(key) === -1) {
          orderedDescriptors.push(key);
        }
      });

      // Header completo
      orderedDescriptors.forEach(function(d) {
        header.push(d);
      });
      header.push('Punteggio Totale');
      header.push('Note');

      csv.push(header);

      // Righe campioni
      tasting.samples.forEach(function(sample) {
        var row = [sample.name || ('Campione ' + sample.sampleNumber)];

        // Valori descrittori
        orderedDescriptors.forEach(function(desc) {
          var val = '';
          if(sample.evaluations && sample.evaluations[desc] !== undefined) {
            val = sample.evaluations[desc];
            if(typeof val === 'number') {
              val = val.toFixed(1);
            }
          }
          row.push(val);
        });

        // Punteggio totale
        var total = 0;
        if(sample.evaluations) {
          Object.values(sample.evaluations).forEach(function(v) {
            if(typeof v === 'number') total += v;
          });
        }
        row.push(total.toFixed(1));

        // Note
        row.push(sample.notes || '');

        csv.push(row);
      });

      // Converti in CSV
      var csvContent = csv.map(function(row) {
        return row.map(function(cell) {
          var cellStr = String(cell || '');
          // Escape virgolette e wrappa se necessario
          if(cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            cellStr = '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(',');
      }).join('\n');

      // BOM UTF-8 per Excel
      var BOM = '\uFEFF';
      var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

      // Download
      var link = document.createElement('a');
      var url = URL.createObjectURL(blob);
      var fileName = 'confronto_' + (tasting.name || 'degustazione').replace(/[^a-z0-9]/gi, '_') + '.csv';
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('✅ Tabella esportata:', fileName);
      alert('Tabella esportata con successo!\n\nFile: ' + fileName + '\nApri con Excel o LibreOffice Calc.');
    };

    // ========================================================================
    // 5. FULLSCREEN NOTES HD - CANVAS ALTA QUALITÀ
    // ========================================================================

    var fullscreenOverlay = null;
    var fullscreenCanvas = null;
    var originalCanvas = null;
    var fullscreenCtx = null;

    window.toggleNotesFullscreen = function() {
      console.log('🔍 toggleNotesFullscreen');

      if(fullscreenOverlay && fullscreenOverlay.parentNode) {
        // EXIT fullscreen
        console.log('✓ Chiusura fullscreen');

        // Sync canvas fullscreen → originale
        if(fullscreenCanvas && originalCanvas) {
          var ctx = originalCanvas.getContext('2d');
          ctx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
          ctx.drawImage(fullscreenCanvas, 0, 0);

          // Trigger save
          if(typeof saveCanvasData === 'function') {
            saveCanvasData();
          }
        }

        document.body.removeChild(fullscreenOverlay);
        fullscreenOverlay = null;
        fullscreenCanvas = null;
        fullscreenCtx = null;
        originalCanvas = null;
        document.body.style.overflow = '';

        console.log('✅ Fullscreen chiuso');
        return;
      }

      // ENTER fullscreen
      console.log('✓ Apertura fullscreen');

      // Trova canvas originale
      originalCanvas = document.getElementById('drawingCanvas');
      if(!originalCanvas) {
        console.error('❌ Canvas non trovato');
        alert('Errore: canvas non trovato');
        return;
      }

      console.log('✓ Canvas originale trovato');

      // Crea overlay
      fullscreenOverlay = document.createElement('div');
      fullscreenOverlay.id = 'notesFullscreenOverlay';
      fullscreenOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;background:white;z-index:999999;padding:20px;box-sizing:border-box;overflow:auto;';

      // Header
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;padding-bottom:15px;border-bottom:2px solid #ddd;';

      var title = document.createElement('h2');
      title.textContent = 'Note e Appunti - Fullscreen';
      title.style.cssText = 'margin:0;font-size:24px;color:#333;';

      var toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;gap:10px;align-items:center;';

      // Buttons
      var btnPen = document.createElement('button');
      btnPen.textContent = 'Penna';
      btnPen.className = 'tool-btn active';
      btnPen.onclick = function() { 
        if(typeof setTool === 'function') setTool('pen', this);
        toolbar.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
      };

      var btnEraser = document.createElement('button');
      btnEraser.textContent = 'Gomma';
      btnEraser.className = 'tool-btn';
      btnEraser.onclick = function() { 
        if(typeof setTool === 'function') setTool('eraser', this);
        toolbar.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
      };

      var btnClear = document.createElement('button');
      btnClear.textContent = 'Pulisci';
      btnClear.className = 'tool-btn';
      btnClear.onclick = function() { 
        if(confirm('Cancellare tutti gli appunti?')) {
          if(fullscreenCtx && fullscreenCanvas) {
            fullscreenCtx.clearRect(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
            console.log('✓ Canvas pulito');
          }
        }
      };

      var btnClose = document.createElement('button');
      btnClose.textContent = '✕ Chiudi';
      btnClose.style.cssText = 'padding:10px 20px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;font-size:16px;font-weight:500;';
      btnClose.onclick = toggleNotesFullscreen;

      toolbar.appendChild(btnPen);
      toolbar.appendChild(btnEraser);
      toolbar.appendChild(btnClear);
      toolbar.appendChild(btnClose);

      header.appendChild(title);
      header.appendChild(toolbar);

      // Canvas container
      var canvasContainer = document.createElement('div');
      canvasContainer.style.cssText = 'width:100%;height:calc(100vh - 120px);background:#fffef0;border:1px solid #ddd;border-radius:4px;position:relative;overflow:hidden;';

      // Background lines
      var linesBg = document.createElement('div');
      linesBg.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(transparent,transparent 29px,#e0e0e0 29px,#e0e0e0 30px);pointer-events:none;z-index:0;';

      // Canvas HD
      fullscreenCanvas = document.createElement('canvas');
      fullscreenCanvas.id = 'drawingCanvasFullscreen';
      fullscreenCanvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;position:relative;z-index:1;';

      // Dimensioni HD con DPR
      var containerRect = canvasContainer.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;

      fullscreenCanvas.width = containerRect.width * dpr;
      fullscreenCanvas.height = containerRect.height * dpr;

      console.log('✓ Canvas HD:', fullscreenCanvas.width + 'x' + fullscreenCanvas.height, 'DPR:', dpr);

      fullscreenCtx = fullscreenCanvas.getContext('2d');
      fullscreenCtx.scale(dpr, dpr);

      // Copia contenuto da originale
      if(originalCanvas.width > 0 && originalCanvas.height > 0) {
        fullscreenCtx.drawImage(originalCanvas, 0, 0, containerRect.width, containerRect.height);
        console.log('✓ Contenuto copiato');
      }

      canvasContainer.appendChild(linesBg);
      canvasContainer.appendChild(fullscreenCanvas);

      fullscreenOverlay.appendChild(header);
      fullscreenOverlay.appendChild(canvasContainer);

      document.body.appendChild(fullscreenOverlay);
      document.body.style.overflow = 'hidden';

      // Setup drawing HD
      setupFullscreenCanvasHD(fullscreenCanvas, fullscreenCtx, dpr);

      console.log('✅ Fullscreen HD aperto');
    };

    function setupFullscreenCanvasHD(canvas, ctx, dpr) {
      var isDrawing = false;
      var lastX = 0;
      var lastY = 0;

      function getCoords(e, canvas) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
        var clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);

        return {
          x: (clientX - rect.left),
          y: (clientY - rect.top)
        };
      }

      function startDrawing(e) {
        e.preventDefault();
        isDrawing = true;
        var coords = getCoords(e, canvas);
        lastX = coords.x;
        lastY = coords.y;
      }

      function draw(e) {
        if(!isDrawing) return;
        e.preventDefault();

        var coords = getCoords(e, canvas);
        var currentX = coords.x;
        var currentY = coords.y;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(currentX, currentY);

        var tool = (state && state.ui && state.ui.canvasTool) || 'pen';

        if(tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 20;
          ctx.lineCap = 'round';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5; // Tratto sottile
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }

        ctx.stroke();

        lastX = currentX;
        lastY = currentY;
      }

      function stopDrawing(e) {
        if(isDrawing) {
          isDrawing = false;
          console.log('✓ Disegno completato');
        }
      }

      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseleave', stopDrawing);

      canvas.addEventListener('touchstart', startDrawing);
      canvas.addEventListener('touchmove', draw);
      canvas.addEventListener('touchend', stopDrawing);
      canvas.addEventListener('touchcancel', stopDrawing);
    }

    // ESC per chiudere
    document.addEventListener('keydown', function(e) {
      if((e.key === 'Escape' || e.keyCode === 27) && fullscreenOverlay) {
        console.log('⌨️ ESC');
        toggleNotesFullscreen();
      }
    });

    console.log('✅ V160 pronto');
    console.log('📱 Tablet:', isTablet);
    console.log('🎨 Canvas HD: DPR scaling attivo');

  })();


// ========================================================================
// V160 FINALE - VERSIONE FUNZIONANTE GARANTITA
// ========================================================================

(function() {
  'use strict';

  console.log('🚀 V160 FINALE - VERSIONE FUNZIONANTE');

  // ======================================================================
  // 1. REAL-TIME SYNC
  // ======================================================================

  window.v160Listeners = window.v160Listeners || new Map();

  window.setupRealtimeListener = function(tastingId) {
    if(!db || !tastingId) return;
    if(v160Listeners.has(tastingId)) return;

    try {
      var tastingRef = doc(db, 'tastings', tastingId);
      var unsubscribe = onSnapshot(tastingRef, function(docSnap) {
        if(!docSnap.exists()) return;

        var cloudData = docSnap.data();
        var localTasting = state.tastings.find(function(t) { return t.id === tastingId; });

        if(localTasting) {
          var cloudTs = cloudData._lastModified || 0;
          var localTs = localTasting._lastModified || 0;

          if(cloudTs > localTs) {
            console.log('⚡ Sync');
            Object.assign(localTasting, cloudData);
            localTasting._lastModified = cloudTs;
            saveState();

            if(state.currentTastingId === tastingId) {
              requestAnimationFrame(function() {
                if(typeof renderTastingPage === 'function') renderTastingPage();
                if(typeof renderGrid === 'function') renderGrid();
                if(typeof updateDetail === 'function') updateDetail();
              });
            }

            if(typeof tastingChannel !== 'undefined' && tastingChannel) {
              tastingChannel.postMessage({
                type: 'cloud_update',
                tastingId: tastingId,
                timestamp: cloudTs
              });
            }
          }
        }
      });

      v160Listeners.set(tastingId, unsubscribe);
    } catch(e) {
      console.error('Errore sync:', e);
    }
  };

  var originalOpenTasting = window.openTasting;
  if(originalOpenTasting) {
    window.openTasting = function(tasting) {
      var result = originalOpenTasting.apply(this, arguments);
      if(tasting && tasting.id) {
        setTimeout(function() { setupRealtimeListener(tasting.id); }, 100);
      }
      return result;
    };
  }

  // ======================================================================
  // 2. TABLET TOUCH
  // ======================================================================

  var isTablet = /iPad|iPhone|Android/i.test(navigator.userAgent);
  if(isTablet) console.log('📱 Tablet');

  document.addEventListener('touchend', function(e) {
    var target = e.target;
    if((target.tagName === 'BUTTON' || target.tagName === 'A') && 
       !target.hasAttribute('data-touch-handled')) {
      target.setAttribute('data-touch-handled', 'true');
      setTimeout(function() { target.removeAttribute('data-touch-handled'); }, 300);
      var clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      target.dispatchEvent(clickEvent);
    }
  }, { passive: true });

  var activeSlider = null;
  document.addEventListener('touchstart', function(e) {
    if(e.target.type === 'range') activeSlider = e.target;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if(activeSlider) {
      setTimeout(function() {
        if(activeSlider) {
          var inputEvent = new Event('input', { bubbles: true, cancelable: true });
          activeSlider.dispatchEvent(inputEvent);
        }
      }, 16);
    }
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if(activeSlider) {
      setTimeout(function() {
        if(activeSlider) {
          var changeEvent = new Event('change', { bubbles: true, cancelable: true });
          activeSlider.dispatchEvent(changeEvent);
        }
        activeSlider = null;
      }, 100);
    }
  }, { passive: true });

  // ======================================================================
  // 3. DEBOUNCING
  // ======================================================================

  var writeTimers = {};
  var pushTastingMeta_original = window.pushTastingMeta;

  if(pushTastingMeta_original) {
    window.pushTastingMeta = function(tasting, immediate) {
      tasting._lastModified = Date.now();

      if(isTablet && !immediate) {
        immediate = true;
      }

      if(immediate === true) {
        if(writeTimers[tasting.id]) {
          clearTimeout(writeTimers[tasting.id]);
          delete writeTimers[tasting.id];
        }
        return pushTastingMeta_original(tasting);
      }

      var key = tasting.id;
      if(writeTimers[key]) clearTimeout(writeTimers[key]);

      writeTimers[key] = setTimeout(function() {
        delete writeTimers[key];
        pushTastingMeta_original(tasting);
      }, 200);
    };
  }

  // ======================================================================
  // 4. EXPORT EXCEL
  // ======================================================================

  window.exportComparisonTableToExcel = function() {
    var tasting = state.tastings.find(function(t) { return t.id === state.currentTastingId; });
    if(!tasting || !tasting.samples || tasting.samples.length === 0) {
      alert('Nessun campione da esportare');
      return;
    }

    console.log('📊 Export Excel');

    var csv = [];
    var header = ['Campione'];

    var descriptorKeys = new Set();
    tasting.samples.forEach(function(s) {
      if(s.evaluations) {
        Object.keys(s.evaluations).forEach(function(k) {
          descriptorKeys.add(k);
        });
      }
    });

    var orderedDescriptors = Array.from(descriptorKeys).sort();
    orderedDescriptors.forEach(function(d) {
      header.push(d);
    });

    header.push('Punteggio Totale');
    header.push('Note');
    csv.push(header);

    tasting.samples.forEach(function(sample) {
      var row = [sample.name || ('Campione ' + sample.sampleNumber)];

      orderedDescriptors.forEach(function(desc) {
        var val = '';
        if(sample.evaluations && sample.evaluations[desc] !== undefined) {
          val = sample.evaluations[desc];
          if(typeof val === 'number') val = val.toFixed(1);
        }
        row.push(val);
      });

      var total = 0;
      if(sample.evaluations) {
        Object.values(sample.evaluations).forEach(function(v) {
          if(typeof v === 'number') total += v;
        });
      }
      row.push(total.toFixed(1));
      row.push(sample.notes || '');

      csv.push(row);
    });

    var csvContent = csv.map(function(row) {
      return row.map(function(cell) {
        var cellStr = String(cell || '');
        if(cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          cellStr = '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',');
    }).join('\n');

    var BOM = '\uFEFF';
    var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    var fileName = 'confronto_' + (tasting.name || 'degustazione').replace(/[^a-z0-9]/gi, '_') + '.csv';
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ Excel esportato');
    alert('Tabella esportata: ' + fileName);
  };

  // ======================================================================
  // 5. FULLSCREEN NOTES - FUNZIONANTE GARANTITO
  // ======================================================================

  var fsOverlay = null;
  var fsCanvas = null;
  var fsCtx = null;
  var origCanvas = null;
  var isDrawing = false;
  var lastX = 0;
  var lastY = 0;

  window.toggleNotesFullscreen = function() {
    console.log('🔍 toggleNotesFullscreen');

    if(fsOverlay) {
      // CHIUDI
      console.log('✓ Chiusura');

      if(fsCanvas && origCanvas) {
        var ctx = origCanvas.getContext('2d');
        ctx.clearRect(0, 0, origCanvas.width, origCanvas.height);
        ctx.drawImage(fsCanvas, 0, 0);

        if(typeof saveCanvasData === 'function') {
          setTimeout(saveCanvasData, 100);
        }
      }

      document.body.removeChild(fsOverlay);
      fsOverlay = null;
      fsCanvas = null;
      fsCtx = null;
      origCanvas = null;
      isDrawing = false;
      document.body.style.overflow = '';

      console.log('✅ Chiuso');
      return;
    }

    // APRI
    console.log('✓ Apertura');

    origCanvas = document.getElementById('drawingCanvas');
    if(!origCanvas) {
      alert('Canvas non trovato');
      return;
    }

    console.log('✓ Canvas:', origCanvas.width + 'x' + origCanvas.height);

    // Crea overlay
    fsOverlay = document.createElement('div');
    fsOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:white;z-index:999999;padding:20px;box-sizing:border-box;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;padding-bottom:15px;border-bottom:2px solid #ddd;';

    var title = document.createElement('h2');
    title.textContent = 'Note e Appunti';
    title.style.cssText = 'margin:0;font-size:24px;';

    var toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:10px;';

    var btnPen = document.createElement('button');
    btnPen.textContent = 'Penna';
    btnPen.style.cssText = 'padding:10px 20px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;';
    btnPen.onclick = function() {
      if(typeof setTool === 'function') setTool('pen');
      console.log('Penna attiva');
    };

    var btnEraser = document.createElement('button');
    btnEraser.textContent = 'Gomma';
    btnEraser.style.cssText = 'padding:10px 20px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;';
    btnEraser.onclick = function() {
      if(typeof setTool === 'function') setTool('eraser');
      console.log('Gomma attiva');
    };

    var btnClear = document.createElement('button');
    btnClear.textContent = 'Pulisci';
    btnClear.style.cssText = 'padding:10px 20px;background:#FFA726;color:white;border:none;border-radius:4px;cursor:pointer;';
    btnClear.onclick = function() {
      if(confirm('Cancellare?')) {
        if(fsCtx && fsCanvas) {
          fsCtx.clearRect(0, 0, fsCanvas.width, fsCanvas.height);
        }
      }
    };

    var btnClose = document.createElement('button');
    btnClose.textContent = '✕ Chiudi';
    btnClose.style.cssText = 'padding:10px 20px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;';
    btnClose.onclick = function() {
      console.log('✓ Click chiudi');
      window.toggleNotesFullscreen();
    };

    toolbar.appendChild(btnPen);
    toolbar.appendChild(btnEraser);
    toolbar.appendChild(btnClear);
    toolbar.appendChild(btnClose);
    header.appendChild(title);
    header.appendChild(toolbar);

    // Canvas container
    var container = document.createElement('div');
    container.style.cssText = 'width:100%;height:calc(100vh - 120px);background:#fffef0;border:1px solid #ddd;position:relative;';

    // Lines
    var lines = document.createElement('div');
    lines.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(transparent,transparent 29px,#e0e0e0 29px,#e0e0e0 30px);pointer-events:none;';

    // Canvas
    fsCanvas = document.createElement('canvas');
    fsCanvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;';

    var rect = container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    fsCanvas.width = rect.width * dpr;
    fsCanvas.height = rect.height * dpr;

    fsCtx = fsCanvas.getContext('2d');
    fsCtx.scale(dpr, dpr);

    console.log('✓ Canvas HD:', fsCanvas.width + 'x' + fsCanvas.height, 'DPR:', dpr);

    // Copia contenuto
    if(origCanvas.width > 0 && origCanvas.height > 0) {
      fsCtx.drawImage(origCanvas, 0, 0, rect.width, rect.height);
      console.log('✓ Contenuto copiato');
    }

    container.appendChild(lines);
    container.appendChild(fsCanvas);
    fsOverlay.appendChild(header);
    fsOverlay.appendChild(container);
    document.body.appendChild(fsOverlay);
    document.body.style.overflow = 'hidden';

    // Drawing
    function getPos(e) {
      var r = fsCanvas.getBoundingClientRect();
      var x = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      var y = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      return { x: x - r.left, y: y - r.top };
    }

    function startDraw(e) {
      isDrawing = true;
      var pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      console.log('✓ Start');
    }

    function draw(e) {
      if(!isDrawing) return;

      var pos = getPos(e);

      fsCtx.beginPath();
      fsCtx.moveTo(lastX, lastY);
      fsCtx.lineTo(pos.x, pos.y);

      var tool = (state && state.ui && state.ui.canvasTool) || 'pen';

      if(tool === 'eraser') {
        fsCtx.globalCompositeOperation = 'destination-out';
        fsCtx.lineWidth = 20;
      } else {
        fsCtx.globalCompositeOperation = 'source-over';
        fsCtx.strokeStyle = '#000';
        fsCtx.lineWidth = 1.5;
      }

      fsCtx.lineCap = 'round';
      fsCtx.stroke();

      lastX = pos.x;
      lastY = pos.y;
    }

    function stopDraw() {
      if(isDrawing) {
        isDrawing = false;
        console.log('✓ Stop');
      }
    }

    fsCanvas.addEventListener('mousedown', startDraw);
    fsCanvas.addEventListener('mousemove', draw);
    fsCanvas.addEventListener('mouseup', stopDraw);
    fsCanvas.addEventListener('mouseleave', stopDraw);

    fsCanvas.addEventListener('touchstart', function(e) {
      e.preventDefault();
      startDraw(e);
    });
    fsCanvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
      draw(e);
    });
    fsCanvas.addEventListener('touchend', function(e) {
      e.preventDefault();
      stopDraw();
    });

    console.log('✅ Fullscreen aperto');
  };

  // ESC
  document.addEventListener('keydown', function(e) {
    if((e.key === 'Escape' || e.keyCode === 27) && fsOverlay) {
      console.log('⌨️ ESC');
      window.toggleNotesFullscreen();
    }
  });

  console.log('✅ V160 ready');

})();




// === V177 CANVAS A4 OVERLAY ===
let a4Canvas = null;
let a4Ctx = null;
let a4Tool = 'pen';
let a4Drawing = false;

function openA4Overlay() {
  console.log('🔍 openA4Overlay() - Mostra FS master');

  if (isArchived()) {
    toast("Degustazione archiviata");
    return;
  }

  const t = getTasting();
  const tId = currentTasterId();
  const sid = selectedSampleId;

  if (!t || !tId || !sid) {
    toast("Seleziona campione e degustatore");
    return;
  }

  const overlay = document.getElementById('canvasA4Overlay');
  a4Canvas = document.getElementById('canvasA4Full');

  if (!overlay || !a4Canvas) return;

  const A4_W = 2480;
  const A4_H = 3508;

  a4Canvas.width = A4_W;
  a4Canvas.height = A4_H;

  a4Ctx = a4Canvas.getContext('2d');
  a4Ctx.lineCap = 'round';
  a4Ctx.lineJoin = 'round';

  // Carica da FS master in memoria
  if (window._fsMaster && window._fsMaster.canvas) {
    a4Ctx.drawImage(window._fsMaster.canvas, 0, 0);
    console.log('  ✅ FS master caricato da memoria');
  } else {
    // Carica da storage
    const ev = getEval(t, tId, sid);
    if (ev.data && ev.data.vista && ev.data.vista.canvasFS) {
      const img = new Image();
      img.onload = function() {
        a4Ctx.drawImage(img, 0, 0);
        console.log('  ✅ FS caricato da storage');
      };
      img.src = ev.data.vista.canvasFS;
    }
  }

  // Mostra overlay
  overlay.style.display = 'flex';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.zIndex = '999999';
  overlay.style.background = '#e5e5e5';
  overlay.style.overflowY = 'auto';
  overlay.classList.add('active');

  bindA4Events();

  try { a4Tool = window.canvasTool || 'pen'; } catch(e) { a4Tool = 'pen'; }

  console.log('  ✅ FS overlay aperto');
}

function closeA4Overlay() {
  console.log('💾 closeA4Overlay() - Salva FS master');

  const overlay = document.getElementById('canvasA4Overlay');
  const widget = document.getElementById('drawingCanvas');

  if (!overlay || !a4Canvas || !widget) return;

  // Aggiorna FS master da overlay
  if (!window._fsMaster) {
    window._fsMaster = {
      canvas: document.createElement('canvas'),
      width: 2480,
      height: 3508
    };
    window._fsMaster.canvas.width = 2480;
    window._fsMaster.canvas.height = 3508;
    window._fsMaster.ctx = window._fsMaster.canvas.getContext('2d');
  }

  window._fsMaster.ctx.clearRect(0, 0, 2480, 3508);
  window._fsMaster.ctx.drawImage(a4Canvas, 0, 0);

  // Aggiorna widget con porzione top-left di FS
  const ctx = widget.getContext('2d');
  const wW = widget.width;
  const wH = widget.height;

  ctx.clearRect(0, 0, wW, wH);
  ctx.drawImage(a4Canvas, 0, 0, wW, wH, 0, 0, wW, wH);

  // Salva
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

    console.log('  ✅ FS master salvato');
  }

  overlay.style.display = 'none';
  overlay.classList.remove('active');

  toast('Note salvate');
}

function setA4Tool(tool) {
  a4Tool = tool;
  console.log('🖊️ Tool:', tool);
  try {
    if (typeof setCanvasTool === 'function') setCanvasTool(tool);
  } catch(e) {}
}

function clearA4Canvas() {
  if (isArchived()) {
    toast("Degustazione archiviata");
    return;
  }
  if (!a4Canvas || !a4Ctx) return;
  if (!confirm('Cancellare tutte le note?')) return;

  a4Ctx.clearRect(0, 0, a4Canvas.width, a4Canvas.height);
  console.log('🗑️ Pulito');
  toast('Canvas pulito');
}

function getA4Point(e) {
  const rect = a4Canvas.getBoundingClientRect();
  let x, y;
  if (e.touches && e.touches[0]) {
    x = e.touches[0].clientX;
    y = e.touches[0].clientY;
  } else {
    x = e.clientX;
    y = e.clientY;
  }
  x -= rect.left;
  y -= rect.top;
  return {
    x: x * (a4Canvas.width / rect.width),
    y: y * (a4Canvas.height / rect.height)
  };
}

function bindA4Events() {
  if (!a4Canvas) return;
  console.log('  🎯 Binding eventi...');

  let lastX = 0, lastY = 0;

  const start = (e) => {
    if (isArchived()) return;
    e.preventDefault();
    a4Drawing = true;
    const pt = getA4Point(e);
    lastX = pt.x;
    lastY = pt.y;
    a4Ctx.beginPath();
    a4Ctx.moveTo(lastX, lastY);
  };

  const move = (e) => {
    if (!a4Drawing) return;
    e.preventDefault();
    const pt = getA4Point(e);
    a4Ctx.globalCompositeOperation = a4Tool === 'eraser' ? 'destination-out' : 'source-over';
    try {
      a4Ctx.strokeStyle = window.canvasColor || '#000';
      a4Ctx.lineWidth = window.canvasLineWidth || 2;
    } catch(e) {
      a4Ctx.strokeStyle = '#000';
      a4Ctx.lineWidth = 2;
    }
    a4Ctx.lineTo(pt.x, pt.y);
    a4Ctx.stroke();
    lastX = pt.x;
    lastY = pt.y;
  };

  const stop = () => {
    if (!a4Drawing) return;
    a4Drawing = false;
    a4Ctx.closePath();
  };

  a4Canvas.addEventListener('touchstart', start, { passive: false });
  a4Canvas.addEventListener('touchmove', move, { passive: false });
  a4Canvas.addEventListener('touchend', stop);
  a4Canvas.addEventListener('touchcancel', stop);
  a4Canvas.addEventListener('mousedown', start);
  a4Canvas.addEventListener('mousemove', move);
  a4Canvas.addEventListener('mouseup', stop);
  a4Canvas.addEventListener('mouseleave', stop);

  console.log('  ✅ Eventi OK');
}



// ============================================
// V185: CANVAS SYNC + SPLASH LOGIN
// ============================================

// FS Master in memoria (background)
window._fsMaster = null;

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

// Hook widget events
setTimeout(function() {
  const widget = document.getElementById('drawingCanvas');
  if (widget) {
    widget.addEventListener('mouseup', syncWidgetToFS);
    widget.addEventListener('touchend', syncWidgetToFS);
    console.log('✅ Widget→FS sync attivo');
  }

  // Inizializza FS master al caricamento
  initFSMaster();
}, 1000);

// ============================================
// V181: SPLASH LOGIN DEGUSTATORE - SESSION BASED
// ============================================
(function() {
  var SESSION_KEY_ID = 'degustapp-session-taster-id';
  var SESSION_KEY_NAME = 'degustapp-session-taster-name';
  var _splashInitialized = false;
  var _retryCount = 0;

  // V181: Clear session on page load - each session = new login
  sessionStorage.removeItem(SESSION_KEY_ID);
  sessionStorage.removeItem(SESSION_KEY_NAME);

  window.showSplashTastersV181 = function() {
    console.log('🔍 showSplashTastersV181() chiamato, retry:', _retryCount);
    
    var sp = document.getElementById('splashScreen');
    var list = document.getElementById('splash-tasters-list');
    if (!sp || !list) {
      console.log('⚠️ Elementi splash non trovati');
      return;
    }

    // Ottieni lista degustatori
    var tasters = [];
    try {
      if (typeof state !== 'undefined' && state && state.tasters && state.tasters.length > 0) {
        tasters = state.tasters;
      }
    } catch(e) {}

    var cloudReady = window.__cloudReady || false;

    // Se non ci sono tasters e cloud non pronto, aspetta (max 15 retry)
    if (tasters.length === 0 && !cloudReady && _retryCount < 15) {
      _retryCount++;
      if (_retryCount === 1) {
        list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.7);font-size:14px;">⏳ Connessione al server...</p></div>';
        list.classList.add('visible');
      }
      console.log('⏳ Aspetto dati Firebase... retry ' + _retryCount + '/15');
      setTimeout(window.showSplashTastersV181, 1000);
      return;
    }

    if (_splashInitialized) return;
    _splashInitialized = true;

    // Nessun degustatore trovato
    if (tasters.length === 0) {
      list.innerHTML = '<div style="margin-top:30px;text-align:center;">' +
        '<p style="color:rgba(255,255,255,0.8);margin-bottom:20px;">' +
        (cloudReady ? 'Nessun degustatore configurato.<br>Vai in Anagrafiche per aggiungere degustatori.' : '⚠️ Connessione non riuscita') +
        '</p>' +
        '<button onclick="window.closeSplashV181()" class="splash-taster-btn" style="margin-top:15px;">Continua →</button>' +
        '</div>';
      list.classList.add('visible');
      return;
    }

    // Mostra lista degustatori con layout responsive
    var html = '<div style="margin-top:20px;text-align:center;">';
    html += '<h3 style="color:#fff;margin-bottom:20px;font-size:18px;font-weight:500;">Seleziona il tuo profilo</h3>';
    html += '<div class="splash-tasters-container">';
    
    for (var i = 0; i < tasters.length; i++) {
      var t = tasters[i];
      var name = t.name || ('Degustatore ' + t.id);
      html += '<button onclick="window.selectSplashTasterV181(' + t.id + ',\'' + name.replace(/'/g, "\\'") + '\')" class="splash-taster-btn">' + name + '</button>';
    }
    html += '</div></div>';
    
    list.innerHTML = html;
    list.classList.add('visible');
    console.log('✅ Splash login V181: ' + tasters.length + ' degustatori mostrati');
  };

  window.selectSplashTasterV181 = function(id, name) {
    // Salva in session storage
    sessionStorage.setItem(SESSION_KEY_ID, String(id));
    sessionStorage.setItem(SESSION_KEY_NAME, name);
    
    // Anche in window per accesso rapido
    window.__sessionTasterId = id;
    window.__sessionTasterName = name;
    
    console.log('👤 V181 Login:', name, '(ID:', id, ')');
    
    // Chiudi splash
    var sp = document.getElementById('splashScreen');
    if (sp) {
      sp.classList.add('hide');
      setTimeout(function() { sp.style.display = 'none'; }, 400);
    }
    
    // Naviga a preparazione
    setTimeout(function() {
      if (typeof go === 'function') {
        go('preparazione', document.getElementById('btnMenuPrep'));
      }
      // Sincronizza il select del degustatore se presente
      setTimeout(function() {
        var sel = document.getElementById('tasterSelect');
        if (sel) {
          sel.value = String(id);
          if (typeof onSelectTaster === 'function') {
            onSelectTaster();
          }
        }
      }, 200);
    }, 500);
  };

  window.closeSplashV181 = function() {
    var sp = document.getElementById('splashScreen');
    if (sp) {
      sp.classList.add('hide');
      setTimeout(function() { sp.style.display = 'none'; }, 400);
    }
    setTimeout(function() {
      if (typeof go === 'function') {
        go('preparazione', document.getElementById('btnMenuPrep'));
      }
    }, 500);
  };

  window.getSessionTaster = function() {
    var id = sessionStorage.getItem(SESSION_KEY_ID);
    var name = sessionStorage.getItem(SESSION_KEY_NAME);
    if (id && name) {
      return { id: id, name: name };
    }
    return null;
  };

  window.getLoggedTaster = function() {
    var session = window.getSessionTaster();
    return session || { id: null, name: null };
  };

  window.logoutTaster = function() {
    sessionStorage.removeItem(SESSION_KEY_ID);
    sessionStorage.removeItem(SESSION_KEY_NAME);
    window.__sessionTasterId = null;
    window.__sessionTasterName = null;
    console.log('👤 V181 Logout effettuato');
  };

  console.log('✅ V181 Splash Login System loaded');
})();

// Visibilità pulsanti condizionali
(function() {
  function updateButtonsVisibility() {
    const pageDeg = document.getElementById('page-degustazione');
    if (!pageDeg) return;

    const isActive = pageDeg.style.display !== 'none' && 
                    !pageDeg.classList.contains('hidden');

    const btnFinish = document.getElementById('btnTopFinish');
    const btnFilters = document.getElementById('btnTopFilters');
    const btnZenFilters = document.getElementById('btnZenPlusTopFilters');

    if (btnFinish) btnFinish.style.display = isActive ? 'inline-block' : 'none';
    if (btnFilters) btnFilters.style.display = isActive ? 'inline-block' : 'none';
    if (btnZenFilters) btnZenFilters.style.display = isActive ? 'inline-block' : 'none';
  }

  const observer = new MutationObserver(updateButtonsVisibility);

  document.addEventListener('DOMContentLoaded', function() {
    updateButtonsVisibility();

    observer.observe(document.body, { 
      attributes: true, 
      childList: true, 
      subtree: true 
    });

    document.addEventListener('click', function() {
      setTimeout(updateButtonsVisibility, 100);
    });
  });
})();

// Touch menu
(function() {
  let startY = 0;
  let startTime = 0;

  document.addEventListener('DOMContentLoaded', function() {
    const menu = document.getElementById('zenPlusTop');
    if (!menu) return;

    menu.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    menu.addEventListener('touchend', function(e) {
      const distance = Math.abs(e.changedTouches[0].clientY - startY);
      const duration = Date.now() - startTime;

      if (distance > 10 || duration > 200) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, { passive: false });
  });
})();

// Inizializza menu touch handling
document.addEventListener('DOMContentLoaded', function() {
  if (typeof initMenuTouchHandling === 'function') {
    initMenuTouchHandling();
  }
});

 // ==== MODIFICHE AGGIUNTE ====

  let npPenSize = 2;
  function updateNpPenSize(size) {
    npPenSize = parseInt(size);
    const label = document.getElementById('npPenSizeLabel');
    if (label) label.textContent = size + 'px';
  }

  function syncCanvasWidgetToFullscreen(x, y, isDrawing, tool) {
    const npCanvas = document.getElementById('canvasNotePanelCanvas');
    if (!npCanvas) return;
    const npCtx = npCanvas.getContext('2d');
    if (tool === 'pen' && isDrawing) {
      npCtx.strokeStyle = '#000';
      npCtx.lineWidth = npPenSize || 2;
      npCtx.lineTo(x, y);
      npCtx.stroke();
    } else if (tool === 'eraser') {
      npCtx.clearRect(x - 10, y - 10, 20, 20);
    }
  }

  // MODIFICA 3: Gestione touch migliorata per menu
  let menuTouchStartX = 0, menuTouchStartY = 0, menuTouchStartTime = 0;
  let menuTouchMoved = false;
  
  function initMenuTouchHandling() {
    const menuBar = document.querySelector('.menu-bar');
    if (!menuBar) return;
    
    // Traccia inizio touch
    menuBar.addEventListener('touchstart', function(e) {
      menuTouchStartX = e.touches[0].clientX;
      menuTouchStartY = e.touches[0].clientY;
      menuTouchStartTime = Date.now();
      menuTouchMoved = false;
    }, {passive: true});
    
    // Traccia movimento - se > 10px è uno scroll
    menuBar.addEventListener('touchmove', function(e) {
      const deltaX = Math.abs(e.touches[0].clientX - menuTouchStartX);
      const deltaY = Math.abs(e.touches[0].clientY - menuTouchStartY);
      if (deltaX > 10 || deltaY > 10) {
        menuTouchMoved = true;
      }
    }, {passive: true});
    
    // Al termine del touch, se era uno scroll blocca l'evento
    menuBar.addEventListener('touchend', function(e) {
      const deltaX = Math.abs(e.changedTouches[0].clientX - menuTouchStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - menuTouchStartY);
      const duration = Date.now() - menuTouchStartTime;
      
      // Se è stato uno scroll (movimento > 10px) o tocco lungo (> 300ms)
      if (menuTouchMoved || deltaX > 10 || deltaY > 10 || duration > 300) {
        e.preventDefault();
        e.stopPropagation();
        
        // Marca i bottoni per ignorare il click successivo
        const btns = menuBar.querySelectorAll('.menu-btn');
        btns.forEach(function(btn) {
          btn.setAttribute('data-ignore-click', 'true');
          setTimeout(function() { btn.removeAttribute('data-ignore-click'); }, 100);
        });
        
        return false;
      }
    });
    
    // Intercetta click sui bottoni e ignora se marcati
    menuBar.addEventListener('click', function(e) {
      const btn = e.target.closest('.menu-btn');
      if (btn && btn.hasAttribute('data-ignore-click')) {
        e.preventDefault();
        e.stopPropagation();
        btn.removeAttribute('data-ignore-click');
        return false;
      }
    }, true); // capture phase
    
    console.log('✅ Menu touch handling inizializzato');
  }

  function updateTopButtonsVisibility() {
    const currentPage = (typeof getCurrentPage === 'function') ? getCurrentPage() : '';
    const btnTermina = document.querySelector('[onclick*="finishTasting"]');
    const btnFiltri = document.getElementById('btnTopFilters');
    const btnZEN = document.getElementById('btnTopZEN');
    const isDegtab = (currentPage === 'degustazione' || 
                     document.body.classList.contains('zen-mode') ||
                     document.body.classList.contains('zen-plus-mode'));
    if (btnTermina) btnTermina.style.display = isDegtab ? '' : 'none';
    if (btnFiltri) btnFiltri.style.display = isDegtab ? '' : 'none';
    if (btnZEN) btnZEN.style.display = isDegtab ? '' : 'none';
  }

  (function() {
    const orig = window.showPage;
    if (orig) {
      window.showPage = function(page) {
        orig(page);
        setTimeout(updateTopButtonsVisibility, 50);
      };
    }
  })();

  let selectedGlobalTaster = null;

  function showTasterSelection() {
    const sp = document.getElementById("splashScreen");
    const list = document.getElementById("splash-tasters-list");
    if (!sp || !list) return;
    const tasters = JSON.parse(localStorage.getItem('tasters') || '[]');
    if (tasters.length === 0) {
      tasters.push({id: 1, name: 'Degustatore Predefinito', email: ''});
      localStorage.setItem('tasters', JSON.stringify(tasters));
    }
    const isLandscape = window.innerWidth > window.innerHeight;
    let html = '<div style="margin-top:30px;"><h3 style="color:#fff;text-align:center;margin-bottom:25px;font-weight:normal;">Seleziona Degustatore</h3>';
    html += '<div style="display:flex;flex-direction:' + (isLandscape ? 'row' : 'column') + ';gap:15px;justify-content:center;flex-wrap:wrap;">';
    tasters.forEach(function(t) {
      html += '<button onclick="selectGlobalTaster(' + t.id + ',\''+t.name.replace(/'/g,"\\'")+'\')" ';
      html += 'style="padding:15px 30px;background:#4CAF50;color:#fff;border:none;border-radius:8px;';
      html += 'font-size:18px;font-weight:normal;cursor:pointer;min-width:180px;">' + t.name + '</button>';
    });
    html += '</div></div>';
    list.innerHTML = html;
  }

  function selectGlobalTaster(id, name) {
    selectedGlobalTaster = {id: id, name: name};
    localStorage.setItem('selectedGlobalTaster', JSON.stringify(selectedGlobalTaster));
    const sp = document.getElementById("splashScreen");
    if (sp) {
      sp.classList.add("hide");
      setTimeout(function() { sp.style.display = "none"; }, 500);
    }
    const sel = document.getElementById('tasterSelect');
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    }
  }

  try {
    const saved = localStorage.getItem('selectedGlobalTaster');
    if (saved) selectedGlobalTaster = JSON.parse(saved);
  } catch(e) {}

  // ==== FINE MODIFICHE ====



(function() {
  var ACTIVE_TASTER_ID_KEY = 'degustapp-active-taster-id';
  var ACTIVE_TASTER_NAME_KEY = 'degustapp-active-taster-name';
  var _splashShown = false;
  var _splashRetry = 0;

  window.showSplashTastersV2 = function() {
    var sp = document.getElementById("splashScreen");
    var list = document.getElementById("splash-tasters-list");
    if (!sp || !list) return;

    // Aspetta che Firebase carichi i dati (max 10 retry)
    var tasters = [];
    try {
      if (typeof state !== 'undefined' && state && state.tasters && state.tasters.length > 0) {
        tasters = state.tasters;
      }
    } catch(e) {}

    var cloudReady = window.__cloudReady || false;

    // Se non ci sono tasters e cloud non pronto, riprova
    if (tasters.length === 0 && !cloudReady && _splashRetry < 10) {
      _splashRetry++;
      if (_splashRetry === 1) {
        list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);">⏳ Connessione...</p></div>';
        list.classList.add('visible');
      }
      console.log('⏳ Aspetto Firebase... retry ' + _splashRetry + '/10');
      setTimeout(window.showSplashTastersV2, 1000);
      return;
    }

    if (_splashShown) return;
    _splashShown = true;

    // Nessun degustatore trovato
    if (tasters.length === 0) {
      list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);margin-bottom:20px;">' + 
        (cloudReady ? 'Nessun degustatore configurato' : '⚠️ Connessione non riuscita') + 
        '</p><button onclick="window.closeSplashAndProceed()" style="padding:14px 32px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4);color:#fff;border-radius:10px;font-size:16px;cursor:pointer;">Continua →</button></div>';
      list.classList.add('visible');
      return;
    }

    // Mostra lista degustatori
    var html = '<div style="margin-top:30px;text-align:center;"><h3 style="color:#fff;margin-bottom:25px;font-size:20px;">Seleziona il tuo profilo</h3><div style="display:flex;flex-direction:column;gap:12px;align-items:center;">';
    for (var i = 0; i < tasters.length; i++) {
      var t = tasters[i];
      var name = t.name || ('Degustatore ' + t.id);
      html += '<button onclick="window.selectSplashTasterV2(' + t.id + ',\'' + name.replace(/'/g, "\\'") + '\')" style="padding:14px 28px;background:transparent;border:2px solid rgba(255,255,255,0.3);color:#fff;border-radius:10px;font-size:17px;min-width:200px;cursor:pointer;transition:all 0.2s;">' + name + '</button>';
    }
    html += '</div></div>';
    list.innerHTML = html;
    list.classList.add('visible');
    console.log('✅ Splash tasters V2: ' + tasters.length + ' degustatori');
  };

  window.selectSplashTasterV2 = function(id, name) {
    // Salva degustatore attivo
    localStorage.setItem(ACTIVE_TASTER_ID_KEY, String(id));
    localStorage.setItem(ACTIVE_TASTER_NAME_KEY, name);
    if (typeof selectedGlobalTaster !== 'undefined') {
      selectedGlobalTaster = { id: id, name: name };
    }
    console.log('👤 Degustatore selezionato:', name, '(ID:', id, ')');
    
    // Chiudi splash
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    
    // Naviga a preparazione
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };

  window.closeSplashAndProceed = function() {
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };
  
  // Helper per ottenere degustatore attivo
  window.getActiveTaster = function() {
    var id = localStorage.getItem(ACTIVE_TASTER_ID_KEY);
    var name = localStorage.getItem(ACTIVE_TASTER_NAME_KEY);
    return id ? { id: parseInt(id, 10), name: name } : null;
  };
  
  // Helper per cancellare degustatore attivo
  window.clearActiveTaster = function() {
    localStorage.removeItem(ACTIVE_TASTER_ID_KEY);
    localStorage.removeItem(ACTIVE_TASTER_NAME_KEY);
  };
})();


(function() {
  'use strict';
  
  // ═══════════════════════════════════════════════════════════════
  // V191: Fabric.js Notes System - Unified Widget/Fullscreen
  // ═══════════════════════════════════════════════════════════════
  
  // Fullscreen canvas
  var fabricCanvas = null;
  var quillEditor = null;
  
  // V191: Widget canvas (same system, scaled 70%)
  var widgetCanvas = null;
  var widgetTextEditor = null;
  
  var currentTool = 'pen';
  var currentColor = '#000000';
  var currentHighlighterColor = '#ffeb3b';
  var currentStroke = 1;
  var currentPaper = 'lined';
  var quillInitialized = false;
  var widgetInitialized = false;
  var currentMode = 'draw';
  
  // Undo history
  var undoHistory = [];
  var MAX_UNDO_STEPS = 20;
  
  // Track current sample context
  var currentNoteContext = null;
  
  // V191: Larger canvas dimensions
  var CANVAS_WIDTH = 900;
  var CANVAS_HEIGHT = 1150;
  
  // Stroke widths for each size
  var STROKE_SIZES = {
    1: 2,
    2: 5,
    3: 10
  };
  
  // Fabric.js performance optimization
  if (typeof fabric !== 'undefined') {
    fabric.perfLimitSizeTotal = 2097152;
    fabric.maxCacheSideLimit = 2048;
    fabric.minCacheSideLimit = 256;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Get current note context
  // ═══════════════════════════════════════════════════════════════
  
  function getNoteContext() {
    var t = typeof getTasting === 'function' ? getTasting() : null;
    var tid = typeof currentTasterId === 'function' ? currentTasterId() : null;
    var sid = typeof selectedSampleId !== 'undefined' ? selectedSampleId : null;
    
    if (!t || !tid || !sid) return null;
    
    return {
      tastingId: t.id,
      tasterId: tid,
      sampleId: sid,
      key: t.id + '_' + tid + '_' + sid
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // V189: Undo System
  // ═══════════════════════════════════════════════════════════════
  
  function saveUndoState() {
    if (!fabricCanvas) return;
    
    try {
      var state = JSON.stringify(fabricCanvas.toJSON(['selectable', 'evented']));
      undoHistory.push(state);
      
      // Limit history size
      if (undoHistory.length > MAX_UNDO_STEPS) {
        undoHistory.shift();
      }
    } catch(e) {
      console.log('Undo save error:', e);
    }
  }
  
  window.undoFabricNotes = function() {
    if (currentMode === 'draw' && fabricCanvas && undoHistory.length > 0) {
      try {
        var lastState = undoHistory.pop();
        fabricCanvas.loadFromJSON(lastState, function() {
          fabricCanvas.renderAll();
          console.log('↩️ Undo applied');
        });
      } catch(e) {
        console.log('Undo error:', e);
      }
    } else if (currentMode === 'text' && quillEditor) {
      // Quill has its own undo with Ctrl+Z
      if (typeof toast === 'function') toast('Usa Ctrl+Z per annullare nel testo');
    }
  };
  
  // ═══════════════════════════════════════════════════════════════
  // Initialize Functions
  // ═══════════════════════════════════════════════════════════════
  
  function initFabricCanvas() {
    console.log('🎨 V192: Initializing Fabric.js canvas...');
    
    if (fabricCanvas) {
      try {
        fabricCanvas.dispose();
      } catch(e) {}
      fabricCanvas = null;
    }
    
    var canvasEl = document.getElementById('fabricDrawCanvas');
    if (!canvasEl) {
      console.error('❌ Canvas element not found');
      return false;
    }
    
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;
    canvasEl.style.width = CANVAS_WIDTH + 'px';
    canvasEl.style.height = CANVAS_HEIGHT + 'px';
    
    try {
      // V192: Use transparent background so paper lines show through
      fabricCanvas = new fabric.Canvas('fabricDrawCanvas', {
        isDrawingMode: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 'transparent',
        selection: false,
        renderOnAddRemove: true,
        enableRetinaScaling: false
      });
      
      // Setup drawing brush
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      fabricCanvas.freeDrawingBrush.color = currentColor;
      fabricCanvas.freeDrawingBrush.width = STROKE_SIZES[currentStroke] || 2;
      fabricCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      
      // V196: Setup object-based eraser
      setupEraserMode(fabricCanvas);
      
      // V192: Save undo state after each stroke
      fabricCanvas.on('path:created', function() {
        saveUndoState();
        queueNotesAutoSave(); // V196: Auto-save after drawing
      });
      
      // Update wrapper size
      var wrap = document.getElementById('fabricCanvasWrap');
      if (wrap) {
        wrap.style.width = CANVAS_WIDTH + 'px';
        wrap.style.height = CANVAS_HEIGHT + 'px';
      }
      
      fabricCanvas.renderAll();
      
      console.log('✅ V196: Fabric.js canvas initialized:', CANVAS_WIDTH, 'x', CANVAS_HEIGHT);
      return true;
      
    } catch(e) {
      console.error('❌ Fabric.js init error:', e);
      return false;
    }
  }
  
  function initQuillEditor() {
    if (quillInitialized && quillEditor) return true;
    
    console.log('📝 V189: Initializing Quill editor...');
    
    var editorEl = document.getElementById('fabricQuillEditor');
    if (!editorEl) {
      console.error('❌ Quill editor element not found');
      return false;
    }
    
    try {
      quillEditor = new Quill('#fabricQuillEditor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['clean']
          ]
        },
        placeholder: 'Scrivi le tue note qui...'
      });
      
      quillInitialized = true;
      console.log('✅ Quill editor initialized');
      return true;
      
    } catch(e) {
      console.error('❌ Quill init error:', e);
      return false;
    }
  }
  
  function updateBrush() {
    if (!fabricCanvas) return;
    
    var strokeWidth = STROKE_SIZES[currentStroke] || 2;
    
    try {
      if (currentTool === 'eraser') {
        // V197: Eraser mode - stay in drawing mode but track eraser state
        fabricCanvas._isEraserMode = true;
        fabricCanvas._eraserRadius = strokeWidth * 6;
        fabricCanvas.isDrawingMode = false; // Disable drawing to allow mouse events
        fabricCanvas.selection = false;
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.hoverCursor = 'crosshair';
        
        // Make all objects non-selectable
        fabricCanvas.forEachObject(function(obj) {
          obj.selectable = false;
          obj.evented = false;
        });
        
      } else if (currentTool === 'highlighter') {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = hexToRgba(currentHighlighterColor, 0.4);
        fabricCanvas.freeDrawingBrush.width = strokeWidth * 8;
      } else if (currentTool === 'pencil') {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = currentColor;
        fabricCanvas.freeDrawingBrush.width = Math.max(1, strokeWidth * 0.5);
      } else {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = currentColor;
        fabricCanvas.freeDrawingBrush.width = strokeWidth;
      }
      
      if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      }
    } catch(e) {
      console.log('Brush update error:', e);
    }
  }
  
  // V197: Improved eraser that removes paths under cursor
  function setupEraserMode(canvas) {
    if (!canvas) return;
    if (canvas._eraserSetup) return; // Avoid duplicate setup
    canvas._eraserSetup = true;
    
    var isErasing = false;
    
    canvas.on('mouse:down', function(opt) {
      if (!canvas._isEraserMode) return;
      isErasing = true;
      eraseAtPoint(canvas, opt.pointer);
    });
    
    canvas.on('mouse:move', function(opt) {
      if (!canvas._isEraserMode || !isErasing) return;
      eraseAtPoint(canvas, opt.pointer);
    });
    
    canvas.on('mouse:up', function() {
      if (!canvas._isEraserMode || !isErasing) return;
      isErasing = false;
      saveUndoState();
      queueNotesAutoSave();
    });
  }
  
  // V197: Erase paths at pointer location
  function eraseAtPoint(canvas, pointer) {
    if (!canvas || !pointer) return;
    
    var radius = canvas._eraserRadius || 25;
    var objectsToRemove = [];
    
    canvas.forEachObject(function(obj) {
      // Only erase path objects (drawings), not other shapes
      if (obj.type !== 'path') return;
      
      var objBounds = obj.getBoundingRect();
      
      // Quick bounds check first
      if (pointer.x < objBounds.left - radius || 
          pointer.x > objBounds.left + objBounds.width + radius ||
          pointer.y < objBounds.top - radius || 
          pointer.y > objBounds.top + objBounds.height + radius) {
        return;
      }
      
      // Check if pointer is near the path
      if (isPointNearPath(pointer, obj, radius)) {
        objectsToRemove.push(obj);
      }
    });
    
    if (objectsToRemove.length > 0) {
      objectsToRemove.forEach(function(obj) {
        canvas.remove(obj);
      });
      canvas.renderAll();
    }
  }
  
  function isPointNearPath(pointer, pathObj, radius) {
    if (!pathObj.path) return false;
    
    try {
      var path = pathObj.path;
      var matrix = pathObj.calcTransformMatrix();
      
      for (var i = 0; i < path.length; i++) {
        var cmd = path[i];
        var x, y;
        
        if (cmd[0] === 'M' || cmd[0] === 'L') {
          x = cmd[1];
          y = cmd[2];
        } else if (cmd[0] === 'Q') {
          x = cmd[3];
          y = cmd[4];
        } else if (cmd[0] === 'C') {
          x = cmd[5];
          y = cmd[6];
        } else {
          continue;
        }
        
        // Transform point
        var pt = fabric.util.transformPoint({x: x, y: y}, matrix);
        var dx = pointer.x - pt.x;
        var dy = pointer.y - pt.y;
        
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          return true;
        }
      }
    } catch(e) {}
    
    return false;
  }
  
  function hexToRgba(hex, alpha) {
    try {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    } catch(e) {
      return 'rgba(255,235,59,' + alpha + ')';
    }
  }
  
  function clearEditorsContent() {
    // V194: Clear content but keep transparent background for grid/lines
    if (quillEditor) {
      try { quillEditor.setText(''); } catch(e) {}
    }
    if (fabricCanvas) {
      try {
        fabricCanvas.clear();
        fabricCanvas.backgroundColor = 'transparent'; // V194: Keep transparent for grid
        fabricCanvas.renderAll();
      } catch(e) {}
    }
    // V194: Also clear widget
    if (widgetCanvas) {
      try {
        widgetCanvas.clear();
        widgetCanvas.backgroundColor = 'transparent';
        widgetCanvas.renderAll();
      } catch(e) {}
    }
    var widgetText = document.getElementById('widgetTextEditor');
    if (widgetText) {
      widgetText.innerHTML = '';
    }
    undoHistory = [];
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════
  
  window.openNotesFullscreenV181 = function() {
    openFabricNotes();
  };
  
  window.openFabricNotes = function() {
    var ctx = getNoteContext();
    console.log('📝 V194: Opening notes for:', ctx ? ctx.key : 'no context');
    
    var modal = document.getElementById('fabricNotesModal');
    if (!modal) {
      console.error('❌ fabricNotesModal not found');
      return;
    }
    
    currentNoteContext = ctx;
    undoHistory = [];
    
    // V194: Update sample info strip
    updateSampleInfoStrip();
    
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
    
    // V194: Initialize and sync widget content to fullscreen
    setTimeout(function() {
      // Initialize Quill if needed
      if (!quillInitialized) {
        initQuillEditor();
      }
      
      // V194: Initialize fullscreen canvas fresh
      initFabricCanvas();
      
      // V194: Load notes from storage first
      loadNotesFromStorage();
      loadDrawingFromStorage();
      
      // V194: Sync widget text to fullscreen Quill
      var widgetText = document.getElementById('widgetTextEditor');
      if (widgetText && quillEditor) {
        var widgetContent = widgetText.innerHTML.trim();
        if (widgetContent && widgetContent !== '<br>' && widgetContent.length > 0) {
          console.log('📝 V194: Syncing widget text to fullscreen');
          quillEditor.root.innerHTML = widgetContent;
        }
      }
      
      // V194: Sync widget canvas to fullscreen canvas
      if (widgetCanvas && fabricCanvas) {
        var json = widgetCanvas.toJSON(['selectable', 'evented']);
        if (json && json.objects && json.objects.length > 0) {
          console.log('📝 V194: Syncing widget canvas to fullscreen, objects:', json.objects.length);
          fabricCanvas.loadFromJSON(json, function() {
            fabricCanvas.backgroundColor = 'transparent';
            fabricCanvas.renderAll();
          });
        }
      }
      
      // V194: Start on DRAW mode (default)
      switchFabricMode('draw');
      
    }, 250);
  };
  
  window.closeFabricNotes = function() {
    // V194: Use immediate save when closing
    immediateSaveNotes();
    
    var modal = document.getElementById('fabricNotesModal');
    if (modal) {
      modal.classList.remove('visible');
    }
    document.body.style.overflow = '';
    
    // V194: Sync fullscreen to widget
    syncToWidgetCanvas();
    
    console.log('✅ V194: Notes closed and saved to cloud');
  };
  
  window.saveFabricNotes = function() {
    // V192: Use immediate save for explicit save button
    var saved = immediateSaveNotes();
    if (saved !== false) {
      closeFabricNotes();
      if (typeof toast === 'function') toast('Note salvate');
    } else {
      if (typeof toast === 'function') toast('Errore nel salvataggio');
    }
  };
  
  // V197: Print notes function (A4 vertical layout)
  window.printNotes = function() {
    try {
      // Get current context
      var ctx = getNoteContext();
      if (!ctx) {
        if (typeof toast === 'function') toast('Nessun campione selezionato');
        return;
      }
      
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var sampleName = 'Campione';
      if (t && ctx.sampleId) {
        var sample = (t.samples || []).find(function(s) { return String(s.id) === String(ctx.sampleId); });
        if (sample) sampleName = sample.codice || sample.name || ('Campione ' + ctx.sampleId);
      }
      
      // Get text content
      var textContent = '';
      if (quillEditor && quillEditor.root) {
        textContent = quillEditor.root.innerHTML;
      } else {
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText) textContent = widgetText.innerHTML;
      }
      
      // Get canvas image
      var canvasDataUrl = '';
      var activeCanvas = fabricCanvas || widgetCanvas;
      if (activeCanvas) {
        try {
          canvasDataUrl = activeCanvas.toDataURL({format: 'png', quality: 1.0});
        } catch(e) {}
      }
      
      // Create print window
      var printWindow = window.open('', '_blank');
      if (!printWindow) {
        if (typeof toast === 'function') toast('Popup bloccato - abilita i popup');
        return;
      }
      
      var tastingTitle = t ? t.title : 'Degustazione';
      var today = new Date().toLocaleDateString('it-IT');
      // V197: Build HTML using array join to avoid </ in script context
      var ct = '<' + '/'; // closing tag safe
      var html = [];
      html.push('<!DOCTYPE html><html><head><title>Note - ' + sampleName + ct + 'title>');
      html.push('<style>');
      html.push('@page { size: A4 portrait; margin: 20mm; }');
      html.push('* { box-sizing: border-box; }');
      html.push('body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }');
      html.push('.print-header { text-align: center; border-bottom: 2px solid #722F37; padding-bottom: 10px; margin-bottom: 20px; }');
      html.push('.print-header h1 { color: #722F37; margin: 0 0 5px 0; font-size: 24px; }');
      html.push('.print-header .subtitle { color: #666; font-size: 14px; }');
      html.push('.print-section { margin-bottom: 20px; }');
      html.push('.print-section-title { font-weight: bold; color: #722F37; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }');
      html.push('.print-text { font-size: 12px; line-height: 1.6; }');
      html.push('.print-canvas { text-align: center; }');
      html.push('.print-canvas img { max-width: 100%; height: auto; border: 1px solid #ddd; }');
      html.push('@media print { .no-print { display: none; } }');
      html.push(ct + 'style>');
      html.push(ct + 'head><body>');
      
      // Header
      html.push('<div class="print-header">');
      html.push('<h1>' + escHtml(sampleName) + ct + 'h1>');
      html.push('<div class="subtitle">' + escHtml(tastingTitle) + ' - ' + today + ct + 'div>');
      html.push(ct + 'div>');
      
      // Text section
      if (textContent && textContent.trim() && textContent !== '<p><br>' + ct + 'p>') {
        html.push('<div class="print-section">');
        html.push('<div class="print-section-title">\u{1F4DD} Appunti' + ct + 'div>');
        html.push('<div class="print-text">' + textContent + ct + 'div>');
        html.push(ct + 'div>');
      }
      
      // Canvas/drawing section
      if (canvasDataUrl) {
        html.push('<div class="print-section">');
        html.push('<div class="print-section-title">\u{1F58C}\uFE0F Disegno' + ct + 'div>');
        html.push('<div class="print-canvas"><img src="' + canvasDataUrl + '" >' + ct + 'div>');
        html.push(ct + 'div>');
      }
      
      html.push(ct + 'body>' + ct + 'html>');
      
      printWindow.document.write(html.join('\n'));
      printWindow.document.close();
      
      // Trigger print
      setTimeout(function() {
        printWindow.print();
      }, 500);
      
    } catch(e) {
      console.error('Print error:', e);
      if (typeof toast === 'function') toast('Errore stampa');
    }
  };
  
  function escHtml(str) {
    var s = String(str || '');
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/\u003c/g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;');
    return s;
  }
  
  window.clearFabricNotes = function() {
    if (!confirm('Cancellare tutte le note (testo e disegno)?')) return;
    
    clearEditorsContent();
    immediateSaveNotes();
    
    if (typeof toast === 'function') toast('Note cancellate');
  };
  
  // V192: New iOS-style mode switch with auto-save
  window.switchFabricMode = function(mode) {
    console.log('📑 V192: Switching to mode:', mode);
    
    // V192: Use immediate save when switching modes
    if (currentMode !== mode) {
      immediateSaveNotes();
    }
    
    currentMode = mode;
    
    // Update switch buttons
    document.querySelectorAll('.fabric-notes-switch-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.mode === mode) btn.classList.add('active');
    });
    
    // Update panels
    document.querySelectorAll('.fabric-notes-panel').forEach(function(panel) {
      panel.classList.remove('active');
    });
    
    if (mode === 'text') {
      document.getElementById('fabricTextPanel').classList.add('active');
    } else {
      document.getElementById('fabricDrawPanel').classList.add('active');
      
      setTimeout(function() {
        var success = initFabricCanvas();
        if (success) {
          loadDrawingFromStorage();
        }
      }, 100);
    }
  };
  
  // Keep old function for compatibility
  window.switchFabricTab = function(tab) {
    switchFabricMode(tab);
  };
  
  window.setFabricTool = function(tool) {
    currentTool = tool;
    
    document.querySelectorAll('.fabric-tool-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.tool === tool) btn.classList.add('active');
    });
    
    var colorsGroup = document.getElementById('fabricColorsGroup');
    var highlighterColors = document.getElementById('fabricHighlighterColors');
    
    if (tool === 'highlighter') {
      if (colorsGroup) colorsGroup.style.display = 'none';
      if (highlighterColors) highlighterColors.style.display = 'flex';
    } else {
      if (colorsGroup) colorsGroup.style.display = 'flex';
      if (highlighterColors) highlighterColors.style.display = 'none';
    }
    
    updateBrush();
  };
  
  window.setFabricColor = function(color) {
    currentColor = color;
    
    document.querySelectorAll('#fabricColorsGroup .fabric-color-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.color === color) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricHighlighterColor = function(color) {
    currentHighlighterColor = color;
    
    document.querySelectorAll('#fabricHighlighterColors .fabric-color-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.hcolor === color) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricStroke = function(size) {
    currentStroke = size;
    
    document.querySelectorAll('.fabric-stroke-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (parseInt(btn.dataset.stroke) === size) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricPaper = function(type) {
    currentPaper = type;
    
    // V191: Apply paper class to wrap elements
    var fullscreenWrap = document.getElementById('fabricCanvasWrap');
    var widgetWrap = document.getElementById('widgetCanvasWrap');
    
    [fullscreenWrap, widgetWrap].forEach(function(wrap) {
      if (wrap) {
        wrap.classList.remove('paper-lined', 'paper-grid', 'paper-blank');
        wrap.classList.add('paper-' + type);
      }
    });
    
    document.querySelectorAll('.fabric-paper-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.paper === type) btn.classList.add('active');
    });
  };
  
  // ═══════════════════════════════════════════════════════════════
  // V191: Widget Canvas Initialization
  // ═══════════════════════════════════════════════════════════════
  
  function initWidgetCanvas() {
    if (widgetCanvas) {
      try { widgetCanvas.dispose(); } catch(e) {}
      widgetCanvas = null;
    }
    
    var canvasEl = document.getElementById('widgetDrawCanvas');
    if (!canvasEl) return false;
    
    // V191: Widget canvas at full size, CSS scales to 70%
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;
    
    try {
      widgetCanvas = new fabric.Canvas('widgetDrawCanvas', {
        isDrawingMode: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 'transparent',
        selection: false,
        renderOnAddRemove: true
      });
      
      widgetCanvas.freeDrawingBrush = new fabric.PencilBrush(widgetCanvas);
      widgetCanvas.freeDrawingBrush.color = currentColor;
      widgetCanvas.freeDrawingBrush.width = STROKE_SIZES[currentStroke] || 2;
      widgetCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      
      // V196: Setup object-based eraser for widget
      setupEraserMode(widgetCanvas);
      
      // V196: Use immediate save for canvas strokes
      widgetCanvas.on('path:created', function() {
        queueNotesAutoSave();
        // Also sync to fullscreen if open
        syncWidgetToFullscreen();
      });
      
      // Update wrapper size for CSS scale
      var wrap = document.getElementById('widgetCanvasWrap');
      if (wrap) {
        wrap.style.width = CANVAS_WIDTH + 'px';
        wrap.style.height = CANVAS_HEIGHT + 'px';
      }
      
      widgetCanvas.renderAll();
      widgetInitialized = true;
      console.log('✅ V196: Widget canvas initialized');
      return true;
    } catch(e) {
      console.error('Widget canvas init error:', e);
      return false;
    }
  }
  
  function initWidgetTextEditor() {
    var editor = document.getElementById('widgetTextEditor');
    if (!editor) return;
    
    // V197: Debounced save for text input - skip during sync refresh
    editor.addEventListener('input', function() {
      if (__isRefreshing) return; // V197: Don't auto-save during sync refresh
      debouncedSaveNotes();
      // Sync to fullscreen Quill if open
      if (quillEditor && document.getElementById('fabricNotesModal').classList.contains('visible')) {
        quillEditor.root.innerHTML = editor.innerHTML;
      }
    });
    
    console.log('✅ V192: Widget text editor initialized');
  }
  
  function syncWidgetToFullscreen() {
    if (widgetCanvas && fabricCanvas) {
      var json = widgetCanvas.toJSON(['selectable', 'evented']);
      fabricCanvas.loadFromJSON(json, function() {
        fabricCanvas.renderAll();
      });
    }
  }
  
  function syncFullscreenToWidget() {
    if (fabricCanvas && widgetCanvas) {
      var json = fabricCanvas.toJSON(['selectable', 'evented']);
      widgetCanvas.loadFromJSON(json, function() {
        widgetCanvas.renderAll();
      });
    }
    
    // Sync text
    var widgetText = document.getElementById('widgetTextEditor');
    if (widgetText && quillEditor) {
      widgetText.innerHTML = quillEditor.root.innerHTML;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Storage Functions
  // ═══════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════
  // V192: Debounced save to prevent too many cloud syncs
  // ═══════════════════════════════════════════════════════════════
  
  var saveDebounceTimer = null;
  var SAVE_DEBOUNCE_MS = 800;
  
  // V197: Flag to prevent auto-save during sync refresh
  var __isRefreshing = false;
  
  // V197: Queue auto-save - blocked during refresh
  function queueNotesAutoSave() {
    if (__isRefreshing) {
      console.log('⏭️ V197: Auto-save blocked during refresh');
      return;
    }
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
    saveDebounceTimer = setTimeout(function() {
      if (__isRefreshing) return; // Double-check
      saveNotesToStorage();
      saveDebounceTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }
  
  function debouncedSaveNotes() {
    queueNotesAutoSave();
  }
  
  // Immediate save (for explicit save button or closing)
  function immediateSaveNotes() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    saveNotesToStorage();
  }
  
  function saveNotesToStorage() {
    var ctx = getNoteContext();
    if (!ctx) {
      console.log('⚠️ No context for saving notes');
      return false;
    }
    
    // V197: Don't save during refresh (would overwrite incoming data)
    if (__isRefreshing) {
      console.log('⏭️ V197: Save blocked during refresh');
      return false;
    }
    
    try {
      var t = typeof getTasting === 'function' ? getTasting() : null;
      if (!t) {
        console.log('⚠️ No tasting found');
        return false;
      }
      
      var ev = typeof getEval === 'function' ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      if (!ev) {
        console.log('⚠️ No evaluation found');
        return false;
      }
      
      if (!ev.data) ev.data = {};
      if (!ev.data.vista) ev.data.vista = {};
      
      // V197: Get text from Quill (fullscreen) or widget
      var widgetText = document.getElementById('widgetTextEditor');
      var textContent = '';
      var textDelta = null;
      
      if (quillEditor && quillEditor.root) {
        textContent = quillEditor.root.innerHTML;
        textDelta = quillEditor.getContents();
      } else if (widgetText) {
        textContent = widgetText.innerHTML;
      }
      
      // V197: Get canvas JSON from whichever canvas has content
      var fabricJson = null;
      if (fabricCanvas) {
        var json = fabricCanvas.toJSON(['selectable', 'evented']);
        if (json && json.objects && json.objects.length > 0) {
          fabricJson = json;
        }
      }
      if (!fabricJson && widgetCanvas) {
        var json = widgetCanvas.toJSON(['selectable', 'evented']);
        if (json && json.objects && json.objects.length > 0) {
          fabricJson = json;
        }
      }
      
      // V197: If BOTH text and drawing are empty, check storage for fallback
      // (This handles the case where editors aren't initialized yet)
      var existingNotes = ev.data.vista.notesV187 || {};
      var emptyCheck = '<' + 'p><br><' + '/p>';
      var textIsEmpty = !textContent || textContent === emptyCheck || textContent === '<br>' || textContent.trim() === '';
      var drawIsEmpty = !fabricJson;
      
      if (textIsEmpty && drawIsEmpty && (existingNotes.text || existingNotes.fabricJson)) {
        // Both editors empty but storage has data - likely editors not loaded yet, skip save
        console.log('⏭️ V197: Skipping save - editors empty but storage has data');
        return false;
      }
      
      // V197: If only text is empty but drawing exists (or vice versa), preserve the other from storage
      if (textIsEmpty && existingNotes.text && existingNotes.text.trim()) {
        textContent = existingNotes.text;
        textDelta = existingNotes.textDelta;
      }
      if (drawIsEmpty && existingNotes.fabricJson) {
        fabricJson = existingNotes.fabricJson;
      }
      
      var notesData = {
        version: 197,
        text: textContent,
        textDelta: textDelta,
        fabricJson: fabricJson,
        paperType: currentPaper,
        updatedAt: new Date().toISOString(),
        instanceId: window.__notesInstanceId
      };
      
      // Save locally in evaluation
      ev.data.vista.notesV187 = notesData;
      
      // Legacy compatibility - save canvas dataUrl
      var dataUrl = null;
      var activeCanvas = fabricCanvas || widgetCanvas;
      if (activeCanvas) {
        try {
          dataUrl = activeCanvas.toDataURL({format: 'png', quality: 0.7, multiplier: 0.7});
          ev.data.vista.canvas = dataUrl;
          ev.data.vista.canvasFS = dataUrl;
        } catch(e) {}
      }
      
      ev.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
      
      // Save local state (skipCloud to avoid conflicts)
      if (typeof saveState === 'function') {
        saveState({skipCloud: true});
      }
      
      // Queue notes sync to Firebase (dedicated collection)
      if (typeof window.queueNotesSync === 'function') {
        window.queueNotesSync(t.id, ctx.tasterId, ctx.sampleId, notesData);
      }
      
      // V198: Upload canvas PNG su Firebase Storage (via queueCanvasSync)
      if (dataUrl && typeof window.queueCanvasSync === 'function') {
        window.queueCanvasSync(t.id, ctx.tasterId, ctx.sampleId, dataUrl);
      }
      
      console.log('💾 V197: Notes saved for sample', ctx.sampleId, '- text:', !textIsEmpty, '- drawing:', !drawIsEmpty);
      return true;
      
    } catch(e) {
      console.error('Error saving notes:', e);
      return false;
    }
  }
  
  function loadNotesFromStorage() {
    var ctx = getNoteContext();
    if (!ctx) return;
    
    try {
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var ev = typeof getEval === 'function' ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      
      if (!ev || !ev.data || !ev.data.vista) {
        console.log('📭 No notes found for sample', ctx.sampleId);
        return;
      }
      
      var notesData = ev.data.vista.notesV187;
      
      if (notesData && notesData.version >= 187) {
        console.log('📖 V191: Loading notes for sample', ctx.sampleId);
        
        // Load to fullscreen Quill
        if (quillEditor) {
          if (notesData.textDelta) {
            quillEditor.setContents(notesData.textDelta);
          } else if (notesData.text) {
            quillEditor.root.innerHTML = notesData.text;
          }
        }
        
        // V191: Also load to widget text editor
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText && notesData.text) {
          widgetText.innerHTML = notesData.text;
        }
        
        if (notesData.paperType) {
          setFabricPaper(notesData.paperType);
        }
      }
      
    } catch(e) {
      console.error('Error loading notes:', e);
    }
  }
  
  // V191: Load drawing to both canvases
  function loadDrawingFromStorage() {
    var ctx = getNoteContext();
    if (!ctx) return;
    
    try {
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var ev = typeof getEval === 'function' ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      
      if (!ev || !ev.data || !ev.data.vista) return;
      
      var notesData = ev.data.vista.notesV187;
      
      if (notesData && notesData.fabricJson && notesData.fabricJson.objects) {
        console.log('📖 V191: Loading Fabric.js drawing...');
        
        // Load to fullscreen canvas
        if (fabricCanvas) {
          fabricCanvas.loadFromJSON(notesData.fabricJson, function() {
            fabricCanvas.renderAll();
            saveUndoState();
            console.log('✅ Fullscreen drawing restored');
          });
        }
        
        // V191: Also load to widget canvas
        if (widgetCanvas) {
          widgetCanvas.loadFromJSON(notesData.fabricJson, function() {
            widgetCanvas.renderAll();
            console.log('✅ Widget drawing restored');
          });
        }
        
      } else {
        var canvasData = ev.data.vista.canvasFS || ev.data.vista.canvas;
        if (canvasData && canvasData.length > 100) {
          console.log('📖 V191: Loading legacy canvas image...');
          
          fabric.Image.fromURL(canvasData, function(img) {
            if (img) {
              if (fabricCanvas) {
                fabricCanvas.setBackgroundImage(img, function() {
                  fabricCanvas.renderAll();
                  saveUndoState();
                }, {
                  scaleX: fabricCanvas.width / img.width,
                  scaleY: fabricCanvas.height / img.height
                });
              }
              if (widgetCanvas) {
                widgetCanvas.setBackgroundImage(img, function() {
                  widgetCanvas.renderAll();
                }, {
                  scaleX: widgetCanvas.width / img.width,
                  scaleY: widgetCanvas.height / img.height
                });
              }
            }
          });
        }
      }
      
    } catch(e) {
      console.error('Error loading drawing:', e);
    }
  }
  
  // V191: Sync fullscreen to widget on close
  function syncToWidgetCanvas() {
    // Sync drawing
    if (fabricCanvas && widgetCanvas) {
      var json = fabricCanvas.toJSON(['selectable', 'evented']);
      widgetCanvas.loadFromJSON(json, function() {
        widgetCanvas.renderAll();
      });
    }
    
    // Sync text
    var widgetText = document.getElementById('widgetTextEditor');
    if (widgetText && quillEditor) {
      widgetText.innerHTML = quillEditor.root.innerHTML;
    }
    
    console.log('✅ V191: Synced fullscreen to widget');
  }
  
  // V191: Widget mode switch
  window.switchWidgetMode = function(mode) {
    // Update switch buttons
    document.querySelectorAll('.widget-notes-switch-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.mode === mode) btn.classList.add('active');
    });
    
    var drawContainer = document.getElementById('widgetDrawContainer');
    var textContainer = document.getElementById('widgetTextContainer');
    
    if (mode === 'text') {
      if (drawContainer) drawContainer.classList.add('hidden');
      if (textContainer) textContainer.classList.remove('hidden');
    } else {
      if (drawContainer) drawContainer.classList.remove('hidden');
      if (textContainer) textContainer.classList.add('hidden');
      
      // V191: Init widget canvas if needed
      if (!widgetInitialized) {
        setTimeout(function() {
          initWidgetCanvas();
          loadDrawingFromStorage();
        }, 100);
      }
    }
  };
  
  // V191: Initialize widget on page load
  function initWidgetOnLoad() {
    // Init widget text editor events
    initWidgetTextEditor();
    
    // Init widget canvas
    setTimeout(function() {
      initWidgetCanvas();
      loadNotesFromStorage();
      loadDrawingFromStorage();
    }, 500);
  }
  
  // Call init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidgetOnLoad);
  } else {
    setTimeout(initWidgetOnLoad, 100);
  }
  
  // V196: Update widget when sample changes or remote sync - instant loading
  window.refreshWidgetNotes = function() {
    console.log('🔄 V197: Refreshing widget notes');
    
    // V197: Block auto-save during refresh to prevent overwriting remote data
    __isRefreshing = true;
    
    // Cancel any pending auto-save
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    
    // Clear widget canvas
    if (widgetCanvas) {
      widgetCanvas.clear();
      widgetCanvas.backgroundColor = 'transparent';
      widgetCanvas.renderAll();
    }
    
    // Clear widget text
    var widgetText = document.getElementById('widgetTextEditor');
    if (widgetText) {
      widgetText.innerHTML = '';
    }
    
    // Load new data from storage (which was already updated by Firebase listener)
    loadNotesFromStorage();
    loadDrawingFromStorage();
    
    // V197: Re-enable auto-save after a delay (let all events settle)
    setTimeout(function() {
      __isRefreshing = false;
      console.log('✅ V197: Refresh complete, auto-save re-enabled');
    }, 300);
  };
  
  // V197: Refresh fullscreen notes from storage (for real-time sync)
  window.refreshFullscreenNotes = function() {
    var modal = document.getElementById('fabricNotesModal');
    if (!modal || !modal.classList.contains('visible')) {
      return; // Don't refresh if fullscreen isn't open
    }
    
    console.log('🔄 V197: Refreshing fullscreen notes');
    
    // V197: Block auto-save during refresh
    __isRefreshing = true;
    
    // Cancel any pending auto-save
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    
    // Load from storage into fullscreen editors
    var ctx = getNoteContext();
    if (!ctx) { __isRefreshing = false; return; }
    
    try {
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var ev = typeof getEval === 'function' ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      
      if (!ev || !ev.data || !ev.data.vista) { __isRefreshing = false; return; }
      
      var notesData = ev.data.vista.notesV187;
      
      if (notesData && notesData.version >= 187) {
        // V197: Always update text (user isn't the author of this change)
        if (quillEditor) {
          if (notesData.textDelta) {
            try { quillEditor.setContents(notesData.textDelta); } catch(e) {}
          } else if (notesData.text) {
            quillEditor.root.innerHTML = notesData.text;
          }
        }
        
        // V197: Always update canvas
        if (fabricCanvas && notesData.fabricJson) {
          fabricCanvas.loadFromJSON(notesData.fabricJson, function() {
            fabricCanvas.backgroundColor = 'transparent';
            fabricCanvas.renderAll();
          });
        }
        
        // Update paper type
        if (notesData.paperType && notesData.paperType !== currentPaper) {
          setFabricPaper(notesData.paperType);
        }
        
        // V197: Also update widget
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText && notesData.text) {
          widgetText.innerHTML = notesData.text;
        }
        if (widgetCanvas && notesData.fabricJson) {
          widgetCanvas.loadFromJSON(notesData.fabricJson, function() {
            widgetCanvas.backgroundColor = 'transparent';
            widgetCanvas.renderAll();
          });
        }
      }
    } catch(e) {
      console.error('V197: Error refreshing fullscreen notes:', e);
    }
    
    // V197: Re-enable auto-save after events settle
    setTimeout(function() {
      __isRefreshing = false;
      console.log('✅ V197: Fullscreen refresh complete, auto-save re-enabled');
    }, 300);
  };
  
  // V192: Update sample info in fullscreen header
  function updateSampleInfoStrip() {
    var strip = document.getElementById('fabricNotesSampleInfo');
    if (!strip) return;
    
    try {
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var sid = typeof selectedSampleId !== 'undefined' ? selectedSampleId : null;
      
      if (t && sid) {
        var sample = t.samples ? t.samples.find(function(s) { return s.id === sid; }) : null;
        if (sample) {
          var sampleName = sample.codice || sample.name || ('Campione ' + sid);
          strip.textContent = 'Campione: ' + sampleName;
          return;
        }
      }
      strip.textContent = 'Campione: --';
    } catch(e) {
      strip.textContent = 'Campione: --';
    }
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    var modal = document.getElementById('fabricNotesModal');
    if (!modal || !modal.classList.contains('visible')) return;
    
    if (e.key === 'Escape') {
      closeFabricNotes();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFabricNotes();
    }
    
    // V191: Ctrl+Z for undo in draw mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && currentMode === 'draw') {
      e.preventDefault();
      undoFabricNotes();
    }
  });
  
  console.log('✅ Fabric.js Notes V190 module loaded');
})();


(function() {
  // V181: CSV Export
  window.exportComparisonCSV = function() {
    var sel = document.getElementById('resultsDegSelect');
    var tid = sel ? sel.value : (state.ui.resultsTastingId || '');
    var tasting = state.tastings.find(function(t) { return t.id === tid; });
    
    if(!tasting || !tasting.samples || tasting.samples.length === 0) {
      alert('Seleziona una degustazione con campioni da esportare');
      return;
    }

    console.log('📊 Export CSV V181');

    var rows = [];
    var header = ['Campione', 'Degustatore', 'Profilo', 'Gruppo', 'Preferito', 'Descrittori_Vista', 'Descrittori_Olfatto'];
    rows.push(header.join(';'));

    var tasterIds = tasting.tasterIds || [];
    if(tasterIds.length === 0 && tasting.evaluations) {
      tasterIds = Object.keys(tasting.evaluations).map(function(k) { return parseInt(k, 10); });
    }

    tasting.samples.forEach(function(sample) {
      var sampleId = String(sample.id || '');
      var sampleName = '';
      
      if(tasting.mode === 'cieca') {
        sampleName = 'Campione ' + sampleId.padStart(2, '0');
      } else {
        var c = (sample.cols || []).slice(0, 4);
        sampleName = (c[0] + ' ' + (c[1] || '')).trim() || ('Campione ' + sampleId.padStart(2, '0'));
      }

      tasterIds.forEach(function(tasterId) {
        var taster = state.tasters.find(function(x) { return String(x.id) === String(tasterId); });
        var tasterName = taster ? taster.name : ('Degustatore ' + tasterId);

        var ev = null;
        if(tasting.evaluations && tasting.evaluations[String(tasterId)]) {
          ev = tasting.evaluations[String(tasterId)][String(sampleId)];
        }

        var profileName = '';
        if(ev && ev.profileKey) {
          var prof = state.profiles.find(function(x) { return x.key === ev.profileKey; });
          profileName = prof ? prof.label : ev.profileKey;
        }

        var groupName = '';
        if(sample.groupKey) {
          var g = (tasting.groups || []).find(function(x) { return x.key === sample.groupKey; });
          groupName = g ? g.label : sample.groupKey;
        }

        var favourite = (ev && ev.favourite) ? 'Sì' : '';
        var descVista = (ev && ev.data && ev.data.vista && ev.data.vista.desc) ? ev.data.vista.desc.join(', ') : '';
        var descOlfatto = (ev && ev.data && ev.data.olfatto && ev.data.olfatto.desc) ? ev.data.olfatto.desc.join(', ') : '';

        var row = [sampleName, tasterName, profileName, groupName, favourite, descVista, descOlfatto];
        rows.push(row.map(function(c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(';'));
      });
    });

    var csvContent = '\uFEFF' + rows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    var fileName = 'export_' + (tasting.title || 'degustazione').replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0,10) + '.csv';
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ CSV esportato: ' + fileName);
    if(typeof toast === 'function') toast('Esportato: ' + fileName);
  };

  // Backward compatibility
  window.exportComparisonTableToExcel = window.exportComparisonCSV;

  // V183: MD Export con struttura gerarchica (supporta multi-compare)
  window.exportComparisonMD = function() {
    // V183: Check for multi-compare mode
    var multiIds = (state.ui && state.ui.multiCompareTastingIds) || [];
    
    if(multiIds.length > 1) {
      // Multi-compare export
      exportMultiCompareMD(multiIds);
      return;
    }

    var sel = document.getElementById('resultsDegSelect');
    var tid = sel ? sel.value : (state.ui.resultsTastingId || '');
    var tasting = state.tastings.find(function(t) { return t.id === tid; });
    
    if(!tasting || !tasting.samples || tasting.samples.length === 0) {
      alert('Seleziona una degustazione con campioni da esportare');
      return;
    }

    console.log('📝 Export MD V183');

    var md = exportSingleTastingMD(tasting);
    downloadMD(md, tasting.title || 'degustazione');
  };

  // V185: Export single tasting to MD with correct structure
  function exportSingleTastingMD(tasting) {
    var md = [];
    
    // Titolo
    md.push('# ' + (tasting.title || 'Degustazione'));
    md.push('');
    // V185: Use tastingDate if available
    var dateStr = tasting.tastingDate || (tasting.finishedAt ? tasting.finishedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    md.push('**Data:** ' + formatDateIT(dateStr));
    md.push('**Modalità:** ' + (tasting.mode === 'cieca' ? 'Alla cieca' : 'Scoperta'));
    // V185: Count only active samples
    var activeSamples = (tasting.samples || []).filter(function(s) { return s.active !== false; });
    md.push('**Campioni:** ' + activeSamples.length);
    md.push('');
    md.push('---');
    md.push('');

    var tasterIds = tasting.tasterIds || [];
    if(tasterIds.length === 0 && tasting.evaluations) {
      tasterIds = Object.keys(tasting.evaluations).map(function(k) { return parseInt(k, 10); });
    }

    // V185: Group samples by groupKey
    var groups = tasting.groups || [];
    var samplesByGroup = {};
    var noGroupSamples = [];
    
    activeSamples.forEach(function(sample) {
      if(sample.groupKey) {
        if(!samplesByGroup[sample.groupKey]) samplesByGroup[sample.groupKey] = [];
        samplesByGroup[sample.groupKey].push(sample);
      } else {
        noGroupSamples.push(sample);
      }
    });

    // V185: Helper to get sample name
    function getSampleName(sample) {
      var sampleId = String(sample.id || '');
      if(tasting.mode === 'cieca') {
        var name = 'Campione ' + sampleId.padStart(2, '0');
        var pid = (tasting.blindMap || {})[sampleId];
        if(pid) {
          var p = (tasting.products || []).find(function(x) { return String(x.id) === String(pid); });
          if(p && p.cols) {
            var pc = p.cols.slice(0, 4);
            var pname = (pc[0] + ' ' + (pc[1] || '')).trim();
            if(pname) name += ' (' + pname + ')';
          }
        }
        return name;
      } else {
        var c = (sample.cols || []).slice(0, 4);
        return c.filter(Boolean).join(' - ') || ('Campione ' + sampleId.padStart(2, '0'));
      }
    }

    // V185: Helper to get profile label (search in tasting.profiles first, then state.profiles)
    function getProfileLabel(profileKey) {
      if(!profileKey) return null;
      var prof = (tasting.profiles || []).find(function(x) { return x.key === profileKey; });
      if(!prof) prof = (state.profiles || []).find(function(x) { return x.key === profileKey; });
      return prof ? prof.label : null;
    }

    // V185: Render sample with all tasters
    function renderSampleMD(sample, indent) {
      var sampleId = String(sample.id || '');
      var sampleName = getSampleName(sample);
      
      md.push(indent + '* **' + sampleName + '**');

      // Per ogni degustatore
      tasterIds.forEach(function(tasterId) {
        var taster = state.tasters.find(function(x) { return String(x.id) === String(tasterId); });
        var tasterName = taster ? taster.name : ('Degustatore ' + tasterId);

        var ev = null;
        if(tasting.evaluations && tasting.evaluations[String(tasterId)]) {
          ev = tasting.evaluations[String(tasterId)][String(sampleId)];
        }

        md.push(indent + '  * **' + tasterName + '**');
        
        // Preferito
        if(ev && ev.favourite) {
          md.push(indent + '    * Preferito: ⭐');
        }

        // Profilo - V185: Fixed to use label instead of key
        if(ev && ev.profileKey) {
          var profileLabel = getProfileLabel(ev.profileKey);
          if(profileLabel) {
            md.push(indent + '    * Profilo: ' + profileLabel);
          }
        }

        // Descrittori per famiglia
        if(ev && ev.data) {
          // Vista
          if(ev.data.vista && ev.data.vista.desc && ev.data.vista.desc.length > 0) {
            md.push(indent + '    * Vista');
            ev.data.vista.desc.forEach(function(d) {
              md.push(indent + '      * ' + d);
            });
          }
          
          // Olfatto
          if(ev.data.olfatto && ev.data.olfatto.desc && ev.data.olfatto.desc.length > 0) {
            md.push(indent + '    * Olfatto');
            ev.data.olfatto.desc.forEach(function(d) {
              md.push(indent + '      * ' + d);
            });
          }
          
          // Gusto
          if(ev.data.gusto && ev.data.gusto.desc && ev.data.gusto.desc.length > 0) {
            md.push(indent + '    * Gusto');
            ev.data.gusto.desc.forEach(function(d) {
              md.push(indent + '      * ' + d);
            });
          }
        }
      });
    }

    // V185: Output structure grouped by GROUP then SAMPLE
    groups.forEach(function(group) {
      var samplesInGroup = samplesByGroup[group.key] || [];
      if(samplesInGroup.length === 0) return;
      
      md.push('* **' + (group.label || group.key) + '**');
      
      samplesInGroup.forEach(function(sample) {
        renderSampleMD(sample, '  ');
      });
      
      md.push('');
    });

    // Samples without group
    if(noGroupSamples.length > 0) {
      noGroupSamples.forEach(function(sample) {
        renderSampleMD(sample, '');
        md.push('');
      });
    }

    return md;
  }

  // V185: Helper to format date in Italian
  function formatDateIT(dateStr) {
    if(!dateStr) return '';
    try {
      var parts = dateStr.split('-');
      if(parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }
      return dateStr;
    } catch(e) {
      return dateStr;
    }
  }

  // V183: Export multiple tastings to MD
  function exportMultiCompareMD(tastingIds) {
    console.log('📝 Export Multi-Compare MD V183:', tastingIds.length, 'degustazioni');
    
    var md = [];
    md.push('# Confronto Multiplo Degustazioni');
    md.push('');
    md.push('**Data export:** ' + new Date().toLocaleDateString('it-IT'));
    md.push('**Degustazioni:** ' + tastingIds.length);
    md.push('');
    md.push('---');
    md.push('');

    tastingIds.forEach(function(tid, idx) {
      var tasting = state.tastings.find(function(t) { return t.id === tid; });
      if(!tasting) return;

      md.push('');
      md.push('---');
      md.push('');
      md.push('## ' + (idx + 1) + '. ' + (tasting.title || 'Degustazione'));
      md.push('');

      var singleMd = exportSingleTastingMD(tasting);
      // Remove the first line (title) since we already have it
      singleMd.shift(); // Remove '# Title'
      md = md.concat(singleMd);
    });

    downloadMD(md, 'confronto_multiplo_' + tastingIds.length + '_degustazioni');
  }

  // V183: Download MD helper
  function downloadMD(mdArray, title) {
    var mdContent = mdArray.join('\n');
    var blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    var fileName = 'export_' + (title || 'degustazione').replace(/[^a-z0-9]/gi, '_') + '_' + new Date().toISOString().slice(0,10) + '.md';
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ MD esportato: ' + fileName);
    if(typeof toast === 'function') toast('Esportato: ' + fileName);
  }

  console.log('✅ V183 Export module loaded');
})();
