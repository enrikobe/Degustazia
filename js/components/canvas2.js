// canvas2.js — P2c

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


    function canvasPoint(e){
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return {x,y};
    }

    // --- Apple Pencil: coalesced events + smoothing (quadratic) + pressure + rAF ---
    let __canvasActivePointerId = null;
    let __canvasLastPt = null;
    let __canvasQueue = [];
    let __canvasRaf = 0;

    function __canvasMid(a, b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
    function __canvasPressure(p){ const v=(typeof p==='number' && p>0)?p:0.5; return Math.max(0, Math.min(1,v)); }
    function __canvasPenWidth(p){ const base=0.9, gain=2.1; const w=base+(__canvasPressure(p)*gain); return Math.max(0.8, Math.min(3.2,w)); }

    function __canvasEnqueuePoint(x,y,pressure){
      __canvasQueue.push({x:x,y:y,p:pressure});
      if(!__canvasRaf) __canvasRaf = requestAnimationFrame(__canvasFlushQueue);
    }

    function __canvasRestoreFromDataUrl(dataUrl){
      try{
        if(!dataUrl) return;
        if(typeof clearCanvasVisualOnly==='function') clearCanvasVisualOnly();
        const img=new Image();
        img.onload=()=>{ try{ ctx.globalCompositeOperation='source-over'; ctx.drawImage(img,0,0,canvas.width/(canvasDpr||1),canvas.height/(canvasDpr||1)); }catch(e){} };
        img.src=dataUrl;
      }catch(e){}
    }

    function __canvasFlushQueue(){
      __canvasRaf = 0;
      if(!state.ui.isDrawing || !canvas || !ctx){ __canvasQueue.length=0; return; }
      while(__canvasQueue.length){
        const pt=__canvasQueue.shift();
        if(!__canvasLastPt){
          __canvasLastPt={x:pt.x,y:pt.y,p:pt.p};
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          continue;
        }
        if(state.ui.canvasTool==='eraser'){
          ctx.globalCompositeOperation='destination-out';
          ctx.lineWidth=16;
        }else{
          ctx.globalCompositeOperation='source-over';
          ctx.lineWidth=__canvasPenWidth(pt.p);
        }
        const prev={x:__canvasLastPt.x,y:__canvasLastPt.y};
        const cur={x:pt.x,y:pt.y};
        const mid=__canvasMid(prev,cur);
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
        __canvasLastPt={x:pt.x,y:pt.y,p:pt.p};
      }
    }


    function onCanvasDown(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(isArchived() || !currentTasterId()) return;
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      __canvasActivePointerId = e.pointerId;
      try{ canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }catch(err){}

      // Snapshot dell'ultimo canvas salvato (ripristino se la gomma svuota tutto)
      try{
        const t = getTasting();
        const tid = currentTasterId();
        const sid = selectedSampleId;
        const ev = (t && tid && sid) ? getEval(t, tid, sid) : null;
        state.ui.canvasPrevDataUrl = (ev && ev.data && ev.data.vista && ev.data.vista.canvas) ? String(ev.data.vista.canvas) : null;
      }catch(err){ state.ui.canvasPrevDataUrl = null; }

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left);
      const y = (e.clientY - rect.top);
      const p = __canvasPressure(e.pressure);

      state.ui.isDrawing = true;
      __canvasQueue.length = 0;
      __canvasLastPt = null;

      ctx.beginPath();
      ctx.moveTo(x, y);
      __canvasEnqueuePoint(x, y, p);
    }


    function onCanvasMove(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(!state.ui.isDrawing) return;
      if(__canvasActivePointerId!=null && e.pointerId!==__canvasActivePointerId) return;
      if(!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
      for(const ce of evs){
        const x = (ce.clientX - rect.left);
        const y = (ce.clientY - rect.top);
        const p = __canvasPressure(ce.pressure);
        __canvasEnqueuePoint(x, y, p);
      }
    }


    function onCanvasUp(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(!state.ui.isDrawing) return;
      if(__canvasActivePointerId!=null && e.pointerId!==__canvasActivePointerId) return;

      try{ __canvasFlushQueue(); }catch(err){}

      state.ui.isDrawing = false;
      __canvasActivePointerId = null;
      try{ canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); }catch(err){}

      if(!canvas || !ctx) return;
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';

      const t = getTasting();
      const tid = currentTasterId();
      const sid = selectedSampleId;
      if(!(t && tid && sid)) return;

      const ev = getEval(t, tid, sid);
      if(!ev.data) ev.data = {};
      if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};

      setTimeout(()=>{
        try{
          const dataUrl = canvas.toDataURL('image/png');
          const prev = state.ui.canvasPrevDataUrl || null;

          // Protezione gomma: se il risultato è vuoto ripristina l'ultimo canvas valido
          if(typeof isCanvasEmptyDataUrl==='function' && isCanvasEmptyDataUrl(dataUrl)){
            if(prev && !isCanvasEmptyDataUrl(prev)){
              ev.data.vista.canvas = prev;
              __canvasRestoreFromDataUrl(prev);
            }
            return;
          }

          ev.data.vista.canvas = dataUrl;
          saveState({skipCloud:true});
          try{ window.queueCanvasSync && window.queueCanvasSync(t.id, tid, sid, ev.data.vista.canvas); }catch(e){}
        }catch(err){}
      }, 0);
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


    function selectSample(sampleId){
      const t = getTasting();
      const tId = currentTasterId();
      // Flush canvas del campione corrente PRIMA di cambiare selezione
      if(!isArchived() && t && tId && selectedSampleId && canvas){
        try{
          const prevSid = String(selectedSampleId);
          const prev = getEval(t,tId,prevSid);
          const dataUrl = canvas.toDataURL('image/png');
          if(!prev.data) prev.data = {};
          if(!prev.data.vista) prev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
          if(!isCanvasEmptyDataUrl(dataUrl)) prev.data.vista.canvas = dataUrl;
          saveState({skipCloud:true});
          try{ window.queueCanvasSync && window.queueCanvasSync(t.id, tId, prevSid, dataUrl); }catch(e){}
        }catch(e){}
      }

      selectedSampleId = sampleId;
      // V136_applyLockHook
      try{ applyTaxLockToSelectedSample(); }catch(e){}
      renderGrid();
      updateDetail();
      loadCanvasFromEval();
      
      // V196: Instantly refresh notes widget for new sample
      try{
        if(typeof refreshWidgetNotes === 'function') {
          refreshWidgetNotes();
        }
      }catch(e){ console.error('V196: Notes refresh error:', e); }
      
  // V31: Render evo picker
  const evoPick = document.getElementById('detailEvoPick');
  if(evoPick && tId && !isArchived()) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
    evoPick.querySelectorAll('.dot').forEach((dot, i) => {
      const val = i + 1;
      dot.addEventListener('click', () => {
        const next = (ev.evolution||0) === val ? 0 : val;
        ev.evolution = next;
        ev.progress = calcProgress(ev);
        ev.overall = calcOverall(ev);
        saveState();
        renderGrid();
        updateDetail();
      });
    });
  } else if(evoPick) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
  }

    }

    function navSample(dir){
      const t = getTasting();
      if(!t) return;
      const ids = t.samples.map(s=>s.id);
      const idx = ids.findIndex(x=>String(x)===String(selectedSampleId));
      if(idx<0){ if(ids.length) selectSample(ids[0]); return; }
      const next = idx + (dir>0?1:-1);
      if(next>=0 && next<ids.length) selectSample(ids[next]);
    }

    function updateDetail(){ setTimeout(forceEnableClear,0);
      const t = getTasting();
      const tId = currentTasterId();
      const s = t ? t.samples.find(x=>String(x.id)===String(selectedSampleId)) : null;

      if(!t || !s){
        document.getElementById("detailId").textContent="--";
        document.getElementById("detailName").textContent="Seleziona un campione";
        document.getElementById("detailSub").textContent="-";
        disableInputs(true);
        clearCanvasVisualOnly();
        return;
      }

      document.getElementById("detailId").textContent = String(s.id).padStart(2,"0");

      const c = cols4(s.cols);

      if(t.mode==="cieca"){
        document.getElementById("detailName").textContent = "Campione";
        const pid = (t.blindMap||{})[String(s.id)];
        if(pid){
          const p = productById(t, pid);
          const pc = p ? cols4(p.cols) : ["Prodotto?","","",""];
          const main = pc[0] + (pc[1] ? " "+pc[1] : "");
          const sub = [pc[2],pc[3]].filter(Boolean).join(" - ");
          document.getElementById("detailSub").textContent = "Associato: " + main + (sub ? " - " + sub : "");
        }else{
          document.getElementById("detailSub").textContent = "Non associato";
        }
      }else{
        const main = c[0] + (c[1] ? " "+c[1] : "");
        const sub = [c[2],c[3]].filter(Boolean).join(" - ");
        document.getElementById("detailName").textContent = main || "Campione";
        document.getElementById("detailSub").textContent = sub || "-";
      }

      if(!tId){
        disableInputs(true);
        clearCanvasVisualOnly();
        document.querySelectorAll(".profile-option").forEach(o=>o.classList.remove("selected"));
        document.querySelectorAll(".group-option").forEach(o=>o.classList.remove("selected"));
        document.querySelectorAll(".desc-pill").forEach(p=>p.classList.remove("selected"));
        return;
      }

      disableInputs(isArchived());

      const ev = getEval(t,tId,s.id);
      ev.progress = calcProgress(ev);
      ev.overall = calcOverall(ev);

      document.querySelectorAll(".profile-option").forEach(o=>o.classList.remove("selected"));
      if(ev.profileKey){
        document.querySelector(`.profile-option[data-profile="${safeCssEscape(ev.profileKey)}"]`)?.classList.add("selected");
      }

      document.querySelectorAll(".group-option").forEach(o=>o.classList.remove("selected"));
      if(s.groupKey){
        document.querySelector(`.group-option[data-group="${safeCssEscape(s.groupKey)}"]`)?.classList.add("selected");
      }

      const set = (sec,key,val)=>{
        const lbl = document.getElementById("lbl"+sec+key);
        const sl = document.getElementById("sl"+sec+key);
        if(lbl) lbl.textContent = String(val ?? 0);
        if(sl) sl.value = String(val ?? 0);
      };
      set("vista","intensita", ev.data.vista.intensita);
      set("vista","limpidezza", ev.data.vista.limpidezza);
      set("olfatto","intensita", ev.data.olfatto.intensita);
      set("olfatto","complessita", ev.data.olfatto.complessita);
      set("gusto","corpo", ev.data.gusto.corpo);
      set("gusto","acidita", ev.data.gusto.acidita);
      set("gusto","persistenza", ev.data.gusto.persistenza);

      document.querySelectorAll(".desc-pill").forEach(p=>p.classList.remove("selected"));
      ["vista","olfatto","gusto"].forEach(sec=>{
        (ev.data[sec].desc || []).forEach(d=>{
          document.querySelector(`.desc-pill[data-sec="${sec}"][data-desc="${safeCssEscape(d)}"]`)?.classList.add("selected");
        });
      });

      loadCanvasFromEval();
  // V31: Render evo picker
  const evoPick = document.getElementById('detailEvoPick');
  if(evoPick && tId && !isArchived()) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
    evoPick.querySelectorAll('.dot').forEach((dot, i) => {
      const val = i + 1;
      dot.addEventListener('click', () => {
        const next = (ev.evolution||0) === val ? 0 : val;
        ev.evolution = next;
        ev.progress = calcProgress(ev);
        ev.overall = calcOverall(ev);
        saveState();
        renderGrid();
        updateDetail();
      });
    });
  } else if(evoPick) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
  }

    }

    function uiSlider(sec, key, value){
      const lbl = document.getElementById("lbl"+sec+key);
      if(lbl) lbl.textContent = String(value);
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId) return;
      const ev = getEval(t,tId,selectedSampleId);
      ev.data[sec][key] = parseIntSafe(value,0);
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      renderGrid();
    }

    function toggleProfile(key){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId){ toast("Seleziona degustatore e campione"); return; }
      const ev = getEval(t,tId,selectedSampleId);
      ev.profileKey = (ev.profileKey===key) ? null : key;
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      renderGrid();
      updateDetail();
    }

    function toggleGroup(groupKey){
      if(isArchived()) return;
      const t = getTasting();
      if(!t || !selectedSampleId){ toast("Seleziona un campione"); return; }
      const s = t.samples.find(x=>String(x.id)===String(selectedSampleId));
      if(!s) return;
      s.groupKey = (s.groupKey===groupKey) ? null : groupKey;
      saveState();
      renderGroupFilterBtns();
      renderGrid();
      updateDetail();
    }

    function toggleDesc(sec, desc, el){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId){ toast("Seleziona degustatore e campione"); return; }
      const ev = getEval(t,tId,selectedSampleId);
      const arr = ev.data[sec].desc = ev.data[sec].desc || [];
      const i = arr.indexOf(desc);
      if(i>=0) arr.splice(i,1);
      else arr.push(desc);
      el?.classList.toggle("selected");
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      renderGrid();
    }

    function openBlindInfo(){
      renderBlindInfo();
      openModal("modalInfoBlind");
    }
    function renderBlindInfo(){
      const t = getTasting();
      const wrap = document.getElementById("blindInfoList");
      if(!wrap) return;

      if(!t || t.mode!=="cieca"){
        wrap.innerHTML = `<div class="muted">Nessuna degustazione alla cieca selezionata.</div>`;
        return;
      }

      if(!t.products || !t.products.length){
        wrap.innerHTML = `<div class="muted">Nessun prodotto.</div>`;
        return;
      }

      wrap.innerHTML = t.products.map(p=>{
        const c = cols4(p.cols);
        const main = c[0] + (c[1] ? " "+c[1] : "");
        const sub = [c[2],c[3]].filter(Boolean).join(" - ");
        return `
          <div class="list-card" style="margin:8px 0;">
            <div style="font-weight:950;color:var(--bordeaux);">${esc(main)}</div>
            <div class="muted">${esc(sub || "-")}</div>
            <div class="muted">ID prodotto: <b>${esc(p.id)}</b></div>
          </div>
        `;
      }).join("");
    }

    function renderPreparation(){
      const divAtt = document.getElementById("prep-attive");
      const divBoz = document.getElementById("prep-bozze");
      if(!divAtt || !divBoz) return;

      const attive = state.tastings.filter(t=>t.status!=="archiviata");
      const bozze = state.tastings.filter(t=>t.status==="bozza");

      const cardHtml = (t)=>`
        <div class="list-card">
          <h3>${esc(t.title)}</h3>
          <div class="meta">
            <span>${esc(t.samples.length)} campioni</span>
            <span>${esc(t.mode)}</span>
            <span>Creata: ${esc(fmtDateIT(t.createdAt))}</span>
          </div>
          <div class="row-actions">
            <button class="btn primary" onclick="openTasting('${esc(t.id)}')">Apri</button>
            <button class="btn" onclick="openEditModal('${esc(t.id)}')">Modifica</button>
            <button class="btn" onclick="copyTastingVirgin('${esc(t.id)}')">Copia</button>
            <button class="btn" onclick="deleteTasting('${esc(t.id)}')">Elimina</button>
          </div>
        </div>
      `;

      divAtt.innerHTML = attive.length ? attive.map(cardHtml).join("") : `<div class="muted">Nessuna degustazione attiva.</div>`;
      divBoz.innerHTML = bozze.length ? bozze.map(cardHtml).join("") : `<div class="muted">Nessuna bozza.</div>`;
    }

    function showPrepTab(tab, btn){
      state.ui.prepTab = tab;
      // UI-only: non salvare sul cloud
      document.querySelectorAll(".prep-tab").forEach(d=>d.style.display="none");
      document.getElementById("prep-"+tab).style.display="block";
      document.querySelectorAll("#page-preparazione .tab").forEach(b=>b.classList.remove("active"));
      if(btn) btn.classList.add("active");
      else document.querySelector(`#page-preparazione .tab[onclick*='${tab}']`)?.classList.add("active");
    }


    function openTasting(id){
      state.currentTastingId = id;
      state.currentTaster = null; 
      saveState();
      
      const t = state.tastings.find(x=>x.id===id);
      try{ if(t){ const ch = ensureTastingTaxonomies(t); if(ch) saveState({skipCloud:true}); } }catch(e){}
      
      // V183: Usa sessionStorage per il degustatore loggato dalla splash
      const activeSessionTasterId = sessionStorage.getItem('degustapp-session-taster-id');
      if (activeSessionTasterId && t) {
        const tasterIds = t.tasterIds || [];
        const activeTasterId = parseInt(activeSessionTasterId, 10);
        // Verifica che il degustatore attivo sia tra quelli della degustazione
        if (tasterIds.includes(activeTasterId)) {
          state.currentTaster = activeTasterId;
          saveState();
          console.log('👤 V183 Bypass modale: degustatore sessione attivo', activeTasterId);
          go("degustazione", document.getElementById("btnMenuDeg"));
          return;
        }
        // Se il degustatore non è nella lista, mostra comunque il modale
        console.log('⚠️ Degustatore sessione non nella lista degustazione, mostro modale');
      }
      
      // Altrimenti mostra il modale normale
      openModal("modalPickTaster");
      const sel = document.getElementById("modalPickTasterSelect");
      if(!sel || !t) return;
      const ids = new Set(t.tasterIds || []);
      sel.innerHTML = `<option value="">Seleziona...</option>` +
        state.tasters.filter(x=>ids.has(x.id)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
    }

    function confirmPickTasterAndOpen(){
      const sel = document.getElementById("modalPickTasterSelect");
      const id = parseIntSafe(sel.value, 0);
      if(!id){ toast("Seleziona un degustatore"); return; }
      state.currentTaster = id;
      saveState();
      closeModal("modalPickTaster");
      go("degustazione", document.getElementById("btnMenuDeg"));
    }

    function deleteTasting(id){
      if(!confirm("Eliminare questa degustazione?")) return;
      state.tastings = state.tastings.filter(t=>t.id!==id);
      if(state.currentTastingId===id) state.currentTastingId=null;
      saveState();
      if(typeof window.__deleteTastingCloud === "function") window.__deleteTastingCloud(id);
      renderPreparation();
    }

    function finishTasting(){
      if(isArchived()) return;
      if(!confirm("Terminare la degustazione? Sarà spostata in Archivio e diventerà sola lettura.")) return;
      const t = getTasting();
      if(!t) return;
      try{ ensureTastingTaxonomies(t); }catch(e){}
      t.status = "archiviata";
      t.finishedAt = nowIso();
      saveState();
      go("archivio", document.getElementById("btnMenuArc"));
    }

    async function resetDemo(){
      const d = demoTasting();
      d.id = uid();
      d.title += " (Copia)";
      state.tastings.unshift(d);
      saveState();
      try{ if(typeof pushTastingMeta === 'function') await pushTastingMeta(d); }catch(e){ console.error('push demo error', e); }
      renderPreparation();
      toast("Nuova demo aggiunta!");
    }

    
    function normHex6(v){ const h=String(v||"").trim().replace("#",""); return /^[0-9a-fA-F]{6}$/.test(h)?h.toLowerCase():null; }
    function moveInArray(arr,i,dir){ const j=i+(dir<0?-1:1); if(j>=0 && j<arr.length){ const t=arr[i]; arr[i]=arr[j]; arr[j]=t; } }
    function syncGroupsToTastings(){
      // V125: DISABLED. Gruppi delle degustazioni sono indipendenti dall'anagrafica.
      return;
    }

    function editProfileLabel(key,val){ const p=state.profiles.find(x=>x.key===key); if(p && val.trim()){ p.label=val.trim(); saveState(); renderAnagrafiche(); } }
    function editProfileColor(key,val){ const p=state.profiles.find(x=>x.key===key); const h=normHex6(val); if(p && h){ p.color=h; saveState(); renderAnagrafiche(); } }
    function moveProfile(key,dir){ const i=state.profiles.findIndex(x=>x.key===key); if(i>=0){ moveInArray(state.profiles,i,dir); saveState(); renderAnagrafiche(); } }

    function editGroupLabel(key,val){ const g=state.groups.find(x=>x.key===key); if(g && val.trim()){ g.label=val.trim(); syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    function editGroupColor(key,val){ const g=state.groups.find(x=>x.key===key); const h=normHex6(val); if(g && h){ g.color=h; syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    function moveGroup(key,dir){ const i=state.groups.findIndex(x=>x.key===key); if(i>=0){ moveInArray(state.groups,i,dir); syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    

    function attachAnaDrag(){
      let dragSrc = null;
      document.querySelectorAll('.ana-item').forEach(item=>{
        item.addEventListener('dragstart', (e)=>{
          dragSrc = item;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/html', item.outerHTML);
          item.style.opacity = '0.4';
        });
        item.addEventListener('dragend', (e)=>{
          item.style.opacity = '1';
          dragSrc = null;
          document.querySelectorAll('.ana-item').forEach(i=>i.style.borderTop='');
        });
        item.addEventListener('dragover', (e)=>{
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if(item !== dragSrc && item.dataset.type === dragSrc.dataset.type){
             item.style.borderTop = '2px solid var(--bordeaux)';
          }
        });
        item.addEventListener('dragleave', (e)=>{
          item.style.borderTop = '';
        });
        item.addEventListener('drop', (e)=>{
          e.stopPropagation();
          item.style.borderTop = '';
          if(dragSrc && dragSrc !== item && dragSrc.dataset.type === item.dataset.type){
             // Reorder logic
             const type = item.dataset.type;
             const arr = type==='profile' ? state.profiles : state.groups;
             const fromKey = dragSrc.dataset.key;
             const toKey = item.dataset.key;
             const fromIdx = arr.findIndex(x=>x.key===fromKey);
             const toIdx = arr.findIndex(x=>x.key===toKey);

             if(fromIdx>=0 && toIdx>=0){
               const moved = arr.splice(fromIdx, 1)[0];
               arr.splice(toIdx, 0, moved);
               if(type==='group') syncGroupsToTastings();
               saveState();
               renderAnagrafiche();
             }
          }
          return false;
        });
      });
    }

