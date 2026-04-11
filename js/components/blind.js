// blind.js — P2c

function renderProductsStrip(){
      const strip = document.getElementById("productsStrip");
      const t = getTasting();
      if(!strip) return;
      if(!t || t.mode!=="cieca" || isArchived()){
        strip.classList.remove("active"); strip.innerHTML = ""; return;
      }
      strip.classList.add("active");

      const map = t.blindMap || {};
      const currentSid = String(selectedSampleId || "");

      strip.innerHTML = (t.products || []).map(p=>{
         const pid = String(p.id);
         const ownerSid = Object.keys(map).find(k => String(map[k]) === pid);
         const isAssignedToMe = (ownerSid && ownerSid === currentSid);
         const isAssignedToOther = (ownerSid && ownerSid !== currentSid);

         let style = "cursor:grab; transition:all 0.2s;";
         let icon = "";
         let cls = "pchip blind-prod";

         if(isAssignedToMe){
           style += "background:#444; color:#fff; border-color:#444; font-weight:bold;";
           icon = "✓ ";
         } else if(isAssignedToOther){
           style += "background:#ddd; color:#888; border-color:#ccc; opacity:0.65; cursor:not-allowed;";
           icon = `(${ownerSid}) `;
           cls += " disabled";
         }

         const c = cols4(p.cols);
         const main = c[0] + (c[1] ? " "+c[1] : "");

         return `<span class="${cls}" data-pid="${esc(p.id)}" style="${style}" title="Trascina su un campione (o clicca dopo aver selezionato il campione)">${esc(icon)}${esc(main)}</span>`;
      }).join("");

      // Bind events (robust)
      strip.querySelectorAll(".blind-prod").forEach(el=>{
        const pid = el.dataset.pid;
        const disabled = el.classList.contains("disabled");
        el.draggable = !disabled;
        if(!disabled){
          el.addEventListener("dragstart", window.handleProductDragStart);
          el.addEventListener("dragend", window.handleProductDragEnd);
          el.addEventListener("click", ()=>{
            const sid = String(selectedSampleId || "");
            if(!sid){ toast("Seleziona un campione"); return; }
            window.assignProductToSample(pid, sid);
          });
        }
      });
    }

    function unassignBlindFromSample(sampleId){
      if(isArchived()) return;
      const tid = state.ui.currentTastingId;
      if(!tid) return;
      const t = state.tastings.find(x=>x.id===tid);
      if(!t || t.mode!=="cieca") return;

      const sid = String(sampleId);
      if(!t.blindMap || !t.blindMap[sid]) return;

      delete t.blindMap[sid];

      // Force persistence immediately
      saveState();

      renderProductsStrip();
      renderGrid();
      updateDetail();
      toast("Associazione rimossa");
    }
    function renderGrid(){
      const grid = document.getElementById("samplesGrid");
      const t = getTasting();
      if(!grid) return;
      if(!t){ grid.innerHTML = ""; return; }
      const tId = currentTasterId();
      const ui = currentTasterId() ? getTasterUI(currentTasterId()) : { filterProfile:'tutti', filterGroup:'tutti', sort:'custom' }; const filterProfile = ui.filterProfile || "tutti";
      const filterGroup = ui.filterGroup || "tutti";
      let list = t.samples.slice();
      // V185: Filter only active samples
      list = list.filter(s => s.active !== false);
      try{ list = list.filter(s=>!isSampleHidden(t.id, s.id)); }catch(e){}
      if(ui.sort === 'custom') {
         if(tId) {
            const ord = getSampleOrder(t, tId);
            if(ord && Array.isArray(ord)) {
               const map = {}; ord.forEach((id,i) => map[String(id)] = i);
               list.sort((a,b) => (map[String(a.id)]??9999) - (map[String(b.id)]??9999));
            }
         }
      } else if(ui.sort === "group"){
        const ord={}; groupsForTasting(t).forEach((g,i)=>ord[g.key]=i+1);
        list.sort((a,b)=> (ord[a.groupKey]??9999) - (ord[b.groupKey]??9999) || cmpSampleId(a.id,b.id));
      } else if(ui.sort === "profile" && tId){
        const ord={}; profilesForTasting(t).forEach((p,i)=>ord[p.key]=i+1);
        list.sort((a,b)=>{ const ea = getEval(t,tId,a.id), eb = getEval(t,tId,b.id); return (ord[ea.profileKey]??9999) - (ord[eb.profileKey]??9999) || cmpSampleId(a.id,b.id); });
      } else if(ui.sort === "evolution" && tId){
        list.sort((a,b)=>{ const ea = getEval(t,tId,a.id), eb = getEval(t,tId,b.id); return (eb.evolution||0)-(ea.evolution||0) || cmpSampleId(a.id,b.id); });
      } else if(ui.sort === "reset"){
        list.sort((a,b)=>cmpSampleId(a.id,b.id));
      }
      if(filterGroup!=="tutti") list = list.filter(s=>String(s.groupKey)===String(filterGroup));
      if(filterProfile!=="tutti" && tId) list = list.filter(s=> String(getEval(t,tId,s.id).profileKey)===String(filterProfile));
      const blind = t.mode==="cieca";
      const dragOk = !isArchived() && eligibleForReorder();
      grid.innerHTML = list.map(s=>{
        const ev = tId ? getEval(t,tId,s.id) : blankEval();
        ev.progress = calcProgress(ev); ev.overall = calcOverall(ev);
        const c = cols4(s.cols);
        const group = groupDef(t, s.groupKey);
        const accent = (()=>{
          try{
            const __mode = getCardColorMode(t);
            if(__mode==='profile' && tId){
              const pk = String(ev.profileKey||'');
              if(!pk) return {cls:'', style:''};
              const p = profileDef(t, pk);
              if(!p || !p.color) return {cls:'', style:''};
              const rgb = hexToRgbParts(p.color);
              return {cls:'has-accent', style:`--acc-r:${rgb.r};--acc-g:${rgb.g};--acc-b:${rgb.b};`};
            }
            if(__mode==='group'){
              const gk = String(s.groupKey||'');
              if(!gk) return {cls:'', style:''};
              const g2 = groupDef(t, gk);
              if(!g2 || !g2.color) return {cls:'', style:''};
              const rgb = hexToRgbParts(g2.color);
              return {cls:'has-accent', style:`--acc-r:${rgb.r};--acc-g:${rgb.g};--acc-b:${rgb.b};`};
            }
          }catch(e){}
          return {cls:'', style:''};
        })();
        const accentClass = accent.cls;
        const accentStyle = accent.style;
        const cardColorMode = getCardColorMode(t);
        const groupBg = (cardColorMode==='group' && group) ? hexToRgba(group.color, 0.14) : "#fff"; // V140
        const groupChip = group ? `<span class="chip group" style="background:#${esc(group.color)}">${esc(group.label)}</span>` : "";
        let profileChip = "";
        if(ev.profileKey){ const p = profileDef(t, ev.profileKey); if(p) profileChip = `<span class="chip profile" style="background:${hexToRgba(p.color,0.22)}">${esc(p.label)}</span>`; }
        
let assignedHtml = "";
let assignedHtmlTop = "";
if(blind){
  const pid = (t.blindMap||{})[String(s.id)];
  if(pid){
    const p = productById(t,pid);
    const pc = p ? cols4(p.cols) : ["Prodotto?","","",""];
    const pm = (pc[0]||"") + ((pc[1]||"") ? " "+(pc[1]||"") : "");
    assignedHtmlTop = `<span class="pchip blind-assigned" data-sid="${esc(s.id)}" style="font-size:12px; padding:6px 10px; margin:2px auto; display:inline-flex; max-width:100%; background:#111; color:#fff; border-color:#111; box-shadow:0 1px 2px rgba(0,0,0,0.25); cursor:pointer; border-radius:999px;">${esc(pm || ("TAG: "+pid))}</span>`;
    assignedHtml = ""; // de-dup
  }
}const evo = ev.evolution || 0;
        const dots = Array.from({length:5},(_,i)=>`<span class="dot ${i+1<=evo?"on":""}" data-dot-evo="${i+1}" data-dot-sample="${esc(s.id)}"></span>`).join("");
        const favOn = !!ev.favourite;

const l1 = blind ? "Campione" : (c[0]||"");
const l2 = blind ? "Alla cieca" : (c[1]||"");
const l3 = blind ? "" : (c[2]||"");
const l4 = blind ? "" : (c[3]||"");

let l1Html = esc(l1);
let l2Html = esc(l2);
let l3Html = esc(l3);
let l4Html = esc(l4);
if(blind && assignedHtmlTop){
  l1Html = assignedHtmlTop;
  l2Html = "";
  l3Html = "";
  l4Html = "";
}
        return `
          <div class="sample-card ${selectedSampleId===String(s.id)?"selected":""} ${accentClass}" data-sampleid="${esc(s.id)}" draggable="${dragOk?"true":"false"}" style="background:${groupBg};${accentStyle}">
            <div class="sample-top">
              <div class="sample-id-col"><div class="sample-id-row"><div class="sample-id">${esc(String(s.id).padStart(2,"0"))}</div>
              <div class="fav-heart ${favOn?"on":""} ${(!tId||isArchived())?"disabled":""}" data-fav-sample="${esc(s.id)}">${favOn?"❤":"♡"}</div></div></div>
              <div class="sample-meta">
                <div class="sample-lines" style="gap:1px">
                  <div class="sample-line first">${l1Html}</div>
                  <div class="sample-line other">${l2Html}</div>
                  <div class="sample-line other">${l3Html}</div>
                  <div class="sample-line other">${l4Html}</div>
                </div>
              </div>

            </div>
            <div class="chips-row">${profileChip}${groupChip}${assignedHtml}</div>
            <div class="evo-row"><span class="evo-label">Evol.</span><span class="dots">${dots}</span></div>
            ${cardDescriptorsHtml(ev)}
          </div>
        `;
      }).join("");
      // Listeners
      grid.querySelectorAll(".sample-card").forEach(card=>{
        card.addEventListener("click", ()=>{ const sid = String(card.dataset.sampleid); if(sid) selectSample(sid); });
      });
      
// Blind mode: accept product drops + enable dissociation
if(blind && !isArchived()) {
  grid.querySelectorAll('.sample-card').forEach(card=>{
    card.addEventListener('dragover', window.handleSampleDragOver);
    card.addEventListener('drop', window.handleSampleDrop);
  });

  grid.querySelectorAll('.blind-assigned').forEach(tag=>{
    tag.addEventListener('click', (e)=>{
      e.stopPropagation();
      const sid = tag.dataset.sid;
      if(!sid) return;
      try{ window.dissociateBlindSample(String(sid)); }catch(err){}
      // refresh immediato UI locale (no sync change)
      try{ renderGrid(); }catch(err){}
      try{ renderProductsStrip(); }catch(err){}
      try{ updateDetail(); }catch(err){}
    });
  });
}
      grid.querySelectorAll(".fav-heart").forEach(h=>{
         if(isArchived() || !currentTasterId()) { h.classList.add("disabled"); return; }
         h.addEventListener("click", e=>{ e.stopPropagation(); const sid = h.dataset.favSample; if(!sid) return; toggleFavourite(sid); });
      });
      grid.querySelectorAll(".dot[data-dot-evo]").forEach(dot=>{
         if(isArchived() || !currentTasterId()) { dot.classList.add("disabled"); return; }
         dot.addEventListener("click", e=>{ e.stopPropagation(); const sid = dot.dataset.dotSample; const val = parseIntSafe(dot.dataset.dotEvo,0); if(selectedSampleId!==sid) selectSample(sid); else setEvolutionForSample(sid, val); });
      });
      if(!isArchived() && eligibleForReorder()) attachReorderDnD();
    }

    
    function attachReorderDnD(){
      const grid = document.getElementById('samplesGrid');
      const t = getTasting();
      if(!grid || !t) return;

      let dragSrcId = null;

      const doMove = (srcId, tgtId) => {
         if(!srcId || !tgtId || srcId === tgtId) return;
         const tId = currentTasterId();
         if(!tId) { toast('Seleziona un degustatore'); return; }

         let order = getSampleOrder(t, tId);
         if(!order) order = t.samples.map(s => String(s.id));

         const allIds = t.samples.map(s => String(s.id));
         order = order.filter(id => allIds.includes(id));
         allIds.forEach(id => { if(!order.includes(id)) order.push(id); });

         const idxA = order.indexOf(String(srcId));
         const idxB = order.indexOf(String(tgtId));
         if(idxA > -1 && idxB > -1) {
            const item = order.splice(idxA, 1)[0];
            order.splice(idxB, 0, item);
            setSampleOrder(t, tId, order);
      try{ markOrderDirty(); }catch(e){}
            saveState();
            renderGrid();
         }
      };

      grid.querySelectorAll('.sample-card').forEach(card => {
         const sid = String(card.dataset.sampleid);
         card.setAttribute('draggable', 'true');

         // Mouse
         card.addEventListener('dragstart', e => {
            if(e.target.closest('.fav-heart') || e.target.closest('.dot')) { e.preventDefault(); return; }
            dragSrcId = sid;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'SID:'+sid);
            card.style.opacity = '0.5';
         });
         card.addEventListener('dragend', () => card.style.opacity = '1');
         card.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
         card.addEventListener('drop', e => {
            e.preventDefault();
            const tgt = e.target.closest('.sample-card');
            if(tgt) doMove(dragSrcId, String(tgt.dataset.sampleid));
         });

         // Touch (Simple Tap-Selection for Move)
         // Logic: Tap one card (selects it for move), Tap another (moves it there)
         // Visual feedback needed.
         card.addEventListener('click', e => {
            // Only if specific sort mode active? No, always allow reorder if eligible.
            // Check if we are in "Reorder Mode" implicit?
            // Let's use Long Press or specific interaction? 
            // The user asked for "fluid drag & drop". Touch Drag is hard to impl robustly in vanilla JS without libs.
            // fallback: Standard Touch API emulation
         });

         // Touch Drag Emulation (tablet-safe)
         // Arm move only after a long-press, and cancel if the finger moves (scroll).
         const REORDER_LP_MS = 500;
         const REORDER_MOVE_PX = 14;
         let __reLpTimer = null;
         let __reLpFired = false;
         let __reStartX = 0, __reStartY = 0;

         const __reClear = ()=>{
            if(__reLpTimer){ clearTimeout(__reLpTimer); __reLpTimer = null; }
            __reLpFired = false;
            dragSrcId = null;
            try{ card.style.opacity = '1'; }catch(_e){}
         };

         card.addEventListener('touchstart', e => {
            if(e.target.closest('.fav-heart') || e.target.closest('.dot')) return;
            const t0 = e.touches && e.touches[0];
            if(!t0) return;
            __reClear();
            __reStartX = t0.clientX; __reStartY = t0.clientY;
            __reLpFired = false;
            __reLpTimer = setTimeout(()=>{
              __reLpFired = true;
              dragSrcId = sid;
              __reLpTimer = null;
              try{ card.style.opacity = '0.65'; }catch(_e){}
            }, REORDER_LP_MS);
         }, {passive:true});

         card.addEventListener('touchmove', e => {
            if(!__reLpTimer || __reLpFired) return;
            const t0 = e.touches && e.touches[0];
            if(!t0) return;
            const dx = Math.abs(t0.clientX - __reStartX);
            const dy = Math.abs(t0.clientY - __reStartY);
            if(dx > REORDER_MOVE_PX || dy > REORDER_MOVE_PX) __reClear();
         }, {passive:true});

         ['touchend','touchcancel'].forEach(ev=> card.addEventListener(ev, e => {
            if(!__reLpFired || !dragSrcId){ __reClear(); return; }
            const t = e.changedTouches && e.changedTouches[0];
            if(!t){ __reClear(); return; }
            const el = document.elementFromPoint(t.clientX, t.clientY);
            const tgt = el ? el.closest('.sample-card') : null;
            if(tgt) doMove(dragSrcId, String(tgt.dataset.sampleid));
            __reClear();
         }));
      });
    }

    function attachBlindDrop(){
      const grid = document.getElementById("samplesGrid");
      const t = getTasting();
      if(!grid || !t) return;

      if(grid.dataset.dropAttached === "1") return;
      grid.dataset.dropAttached = "1";

      grid.addEventListener("dragover", (e) => {
        if(e.target.closest(".sample-card")) {
           e.preventDefault();
           e.dataTransfer.dropEffect = "move";
        }
      });

      grid.addEventListener("drop", (e) => {
        const card = e.target.closest(".sample-card");
        if(!card) return;

        e.preventDefault();
        let raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text") || "";
        if(raw.startsWith("SID:")) return;
        const pid = raw.startsWith("PID:") ? raw.slice(4) : raw;
        const sid = String(card.dataset.sampleid);

        if(!pid || !sid) return;

        if(!t.blindMap) t.blindMap = {};

        if(t.blindMap[sid]){ toast("Campione già associato"); return; }

        const used = new Set(Object.values(t.blindMap).map(x=>String(x)));
        if(used.has(String(pid))){ toast("Prodotto già assegnato"); return; }

        t.blindMap[sid] = String(pid);
        saveState();
        renderProductsStrip();
        renderGrid();
        updateDetail();
        toast("Prodotto associato");
      });
    }

    function toggleFavourite(sampleId){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId){ toast("Seleziona un degustatore"); return; }
      const ev = getEval(t,tId,sampleId);
      ev.favourite = !ev.favourite;
      ev.updatedAt = nowIso();
      saveState();
      renderGrid();
      if(selectedSampleId===sampleId) updateDetail();
    }

    function setEvolutionForSample(sampleId, evo){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId){ toast("Seleziona un degustatore"); return; }
      if(selectedSampleId!==sampleId){ toast("Seleziona prima il campione"); return; }
      const ev = getEval(t,tId,sampleId);
      const next = clamp(parseIntSafe(evo,0), 1, 5);
      ev.evolution = (ev.evolution||0)===next ? 0 : next;
      ev.updatedAt = nowIso();
      ev.progress = calcProgress(ev);
      ev.overall = calcOverall(ev);
      saveState();
      renderGrid();
      updateDetail();
    }

    let canvas=null, ctx=null;
    let currentTool="pen";
    let isDrawing=false, lastX=0, lastY=0;

    

// ═══════════════════════════════════════════════════════════════
// V194: Legacy panel functions removed - using Fabric.js notes
// Stub functions for backward compatibility
// ═══════════════════════════════════════════════════════════════

