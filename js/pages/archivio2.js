// archivio2.js — P2c

function buildArchiveHaystack(t){
      const parts = [];
      parts.push(t.title||"");
      parts.push(t.mode||"");
      parts.push(t.status||"");
      parts.push(t.finishedAt||"");

      (t.samples||[]).forEach(s=>{
        parts.push(String(s.id||""));
        (cols4(s.cols)||[]).forEach(x=>parts.push(String(x||"")));
        const g = groupDef(t, s.groupKey);
        if(g) parts.push(g.label||"");
      });
      (t.products||[]).forEach(p=>{
        parts.push(String(p.id||""));
        (cols4(p.cols)||[]).forEach(x=>parts.push(String(x||"")));
      });

      (t.tasterIds||[]).forEach(tid=>{
        const tas = state.tasters.find(x=>String(x.id)===String(tid));
        if(tas){ parts.push(tas.name||""); parts.push(tas.email||""); }
      });

      const evals = t.evaluations || {};
      Object.keys(evals).forEach(tasterId=>{
        const per = evals[tasterId] || {};
        Object.keys(per).forEach(sampleId=>{
          const ev = per[sampleId] || {};
          parts.push(String(ev.profileKey||""));
          parts.push(String(ev.evolution||""));
          const d = ev.data || {};
          ['vista','olfatto','gusto'].forEach(k=>{
            const sec = d[k] || {};
            (sec.desc||[]).forEach(x=>parts.push(String(x||"")));
          });
        });
      });

      return parts.join(' ').toLowerCase();
    }

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

    // V183: Toggle selezione per confronto multiplo
    function toggleMultiSelect(id){
      if(!window._multiSelectTastings) window._multiSelectTastings = new Set();
      if(window._multiSelectTastings.has(id)){
        window._multiSelectTastings.delete(id);
      } else {
        window._multiSelectTastings.add(id);
      }
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

    function clearMultiSelection(){
      window._multiSelectTastings = new Set();
      updateMultiSelectUI();
      renderArchive();
    }

    // V184: Fixed multi-comparison to load all data properly
    async function openMultiComparison(){
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
    document.getElementById("importJsonInput").addEventListener("change", (e)=>{
      const f = e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        try{
          const json = JSON.parse(ev.target.result);
          if(Array.isArray(json.tastings)){
            state = migrate(json);
          } else if(json.id && json.samples){
            if(state.tastings.find(x=>x.id===json.id)){
               if(!confirm("Esiste già una degustazione con questo ID. Sovrascrivere?")) return;
               state.tastings = state.tastings.filter(x=>x.id!==json.id);
            }
            state.tastings.push(json);
            state = migrate(state);
          } else {
            toast("Formato non valido");
            return;
          }
          saveState();
          location.reload();
        }catch(ex){ console.error(ex); toast("Errore lettura file"); }
      };
      reader.readAsText(f);
    });

    function onResultsSort(v){ state.ui.resultsSort = String(v||'id'); saveState({skipCloud:true}); renderResultsTable(); }

