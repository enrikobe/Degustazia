// archivio.js P2

function renderArchive(){
      const list = document.getElementById("archiveList");
      if(!list) return;
      const q = (state.ui.archiveSearch||"").toLowerCase().trim();

      const arch = state.tastings.filter(t=>t.status==="archiviata");
      const filtered = !q ? arch : arch.filter(t=>buildArchiveHaystack(t).includes(q));

      // V183: Multi-select state
      if(!window._multiSelectTastings) window._multiSelectTastings = new Set();

      list.innerHTML = filtered.length ? filtered.map(t=>{
        const isSelected = window._multiSelectTastings.has(t.id);
        return `
        <div class="list-card" style="${isSelected ? 'border:2px solid var(--bordeaux);background:#fff8f8;' : ''}">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <input type="checkbox" 
                   id="chk_${esc(t.id)}" 
                   ${isSelected ? 'checked' : ''} 
                   onchange="toggleMultiSelect('${esc(t.id)}')"
                   style="width:20px;height:20px;margin-top:5px;cursor:pointer;" />
            <div style="flex:1;">
              <h3>${esc(t.title)}</h3>
              <div class="meta">
                <span>${esc(t.samples.length)} campioni</span>
                <span>${esc(t.mode)}</span>
                <span>Terminata: ${esc(fmtDateIT(t.finishedAt))}</span>
              </div>
              <div class="row-actions" style="gap:6px; flex-wrap:wrap">
                <button class="btn primary" onclick="viewArchived('${esc(t.id)}')">Visualizza</button>
                <button class="btn" onclick="reopenTasting('${esc(t.id)}')">Riapri</button>
                <button class="btn" onclick="copyTasting('${esc(t.id)}')">Copia</button>
                <button class="btn" onclick="openComparison('${esc(t.id)}')">Confronto</button>
                <button class="btn" onclick="deleteTasting('${esc(t.id)}')">Elimina</button>
              </div>
            </div>
          </div>
        </div>
      `}).join("") : `<div class="muted">Nessuna degustazione in archivio.</div>`;
      
      // V183: Aggiorna UI multi-select
      updateMultiSelectUI();
    }

function onArchiveSearch(val){
      state.ui.archiveSearch = String(val||"");
      // UI-only: non salvare sul cloud
      renderArchive();
    }

function exportJson(){
      const data = JSON.stringify(state, null, 2);
      downloadBlob("degustapp_backup.json", data, "application/json");
    }

function exportSingleJson(id){
      const t = state.tastings.find(x=>x.id===id);
      if(!t) return;
      const data = JSON.stringify(t, null, 2);
      downloadBlob("degustazione_"+id+".json", data, "application/json");
    }

function triggerImportJson(){
      document.getElementById("importJsonInput").click();
    }

function openMultiComparison(){
      if(!window._multiSelectTastings || window._multiSelectTastings.size === 0){
        toast('Seleziona almeno una degustazione');
        return;
      }
      
      const tastingIds = Array.from(window._multiSelectTastings);
      console.log('📊 V184 openMultiComparison:', tastingIds.length, 'degustazioni');
      
      // Vai alla pagina risultati
      go('risultati', document.getElementById('btnMenuRes'));
      
      const wrap = document.getElementById('resultsTableWrap');
      if(wrap) wrap.innerHTML = '<div class="muted">Caricamento dati per ' + tastingIds.length + ' degustazioni...</div>';
      
      // V184: Carica i dati per TUTTE le degustazioni selezionate
      for(const tid of tastingIds) {
        try {
          // Forza refresh metadati
          if(typeof pollTastings === 'function') await pollTastings();
          
          // Attendi che la degustazione sia presente
          let t = state.tastings.find(x=>String(x.id)===String(tid));
          for(let i=0; i<10 && (!t || !t.samples || !t.samples.length); i++){
            await new Promise(r=>setTimeout(r,100));
            if(typeof pollTastings === 'function') await pollTastings();
            t = state.tastings.find(x=>String(x.id)===String(tid));
          }
          
          // Carica valutazioni archiviate
          if(typeof fetchArchivedEvaluations === 'function') {
            await fetchArchivedEvaluations(tid);
          }
          
          console.log('✅ Dati caricati per:', tid, t ? t.title : 'N/A');
        } catch(e) {
          console.error('Errore caricamento dati per', tid, e);
        }
      }
      
      // Salva gli ID selezionati e renderizza
      state.ui.multiCompareTastingIds = tastingIds;
      saveState({skipCloud: true});
      
      // Renderizza tutte le tabelle
      renderResultsTable();
      console.log('✅ V184 Multi-compare completato');
    }

function clearMultiSelection(){
      window._multiSelectTastings = new Set();
      updateMultiSelectUI();
      renderArchive();
    }

function updateMultiSelectUI(){
      const controls = document.getElementById('multiCompareControls');
      const countEl = document.getElementById('multiCompareCount');
      if(!controls || !countEl) return;
      
      const count = window._multiSelectTastings ? window._multiSelectTastings.size : 0;
      controls.style.display = count > 0 ? 'block' : 'none';
      countEl.textContent = count + ' selezionat' + (count === 1 ? 'a' : 'e');
    }