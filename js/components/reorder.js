// reorder.js — P2b

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
