// risultati2.js — P2c

function renderResultsSelect(){
      const sel = document.getElementById("resultsDegSelect");
      if(!sel) return;
      // Filter only ARCHIVED
      const arch = state.tastings.filter(t=>t.status==="archiviata");
      // Sort by date desc
      arch.sort((a,b)=>(b.finishedAt||"").localeCompare(a.finishedAt||""));

      const opts = arch.map(t=>{
          const date = t.finishedAt ? t.finishedAt.slice(0,10) : "";
          return `<option value="${esc(t.id)}">${esc(t.title)} ${date?"("+date+")":""}</option>`;
      });
      sel.innerHTML = `<option value="">Seleziona...</option>` + opts.join("");
      sel.onchange = (e) => onResultsDegChange(e.target.value);
    }
    
    async function onResultsDegChange(tid){
       if(!tid){ renderResultsTable(); return; }

       const wrap = document.getElementById("resultsTableWrap");
       if(wrap) wrap.innerHTML = '<div class="muted">Caricamento dati in corso...</div>';

       if(typeof fetchArchivedEvaluations === 'function'){
           await fetchArchivedEvaluations(tid);
       }
       renderResultsTable();
    }

function onResultsSearch(val){
      state.ui.resultsSearch = String(val||"");
      saveState({skipCloud:true});
      renderResultsTable();
    }

    
    function getSampleName(t, s){
      if(t.mode!=="cieca"){
         const c = cols4(s.cols);
         return (c[0] + (c[1]?" "+c[1]:"")).trim() || "Campione "+s.id;
      }
      // Blind
      const pid = (t.blindMap||{})[String(s.id)];
      if(!pid) return "Campione "+s.id+" (Non svelato)";
      const p = (t.products||[]).find(x=>String(x.id)===String(pid));
      if(!p) return "Campione "+s.id+" (Prod?)";
      const c = cols4(p.cols);
      return (c[0] + (c[1]?" "+c[1]:"")).trim();
    }
    function getSampleNameForResults(t, s){
      // V184: Fixed for blind tasting with robust key matching
      function join4(cols){
        const c = cols4(cols);
        return c.map(x=>String(x||'').trim()).filter(Boolean).join(' - ');
      }

      if(t.mode!=="cieca"){
         return join4(s.cols) || ("Campione "+s.id);
      }
      
      // V184: Try multiple key formats for blindMap lookup
      const blindMap = t.blindMap || {};
      const sampleId = String(s.id);
      
      // Try: "1", "01", 1 (as stored)
      let pid = blindMap[sampleId] || 
                blindMap[sampleId.replace(/^0+/, '')] || // without leading zeros
                blindMap[String(parseInt(sampleId, 10))] || // as integer string
                blindMap[parseInt(sampleId, 10)]; // as actual integer key
      
      // Also try with leading zero
      if(!pid && sampleId.length === 1) {
        pid = blindMap['0' + sampleId];
      }
      
      console.log('🔍 V184 BlindMap lookup:', {sampleId, pid, blindMapKeys: Object.keys(blindMap)});
      
      if(!pid) return "Campione "+sampleId+" (Non svelato)";
      
      // V184: Find product with robust matching
      const products = t.products || [];
      const p = products.find(x => 
        String(x.id) === String(pid) || 
        String(x.id) === String(parseInt(pid, 10)) ||
        parseInt(x.id, 10) === parseInt(pid, 10)
      );
      
      if(!p) {
        console.log('⚠️ V184 Product not found for pid:', pid, 'products:', products.map(x=>x.id));
        return "Campione "+sampleId+" (Prod?)";
      }
      
      const name = join4(p.cols);
      console.log('✅ V184 Found product name:', name, 'for sample', sampleId);
      return name || ("Campione "+sampleId);
    }

    function renderResultsTable(){
      const wrap = document.getElementById("resultsTableWrap");
      const sel = document.getElementById("resultsDegSelect");
      if(!wrap || !sel) return;

      // V183: Check for multi-compare mode
      const multiIds = state.ui.multiCompareTastingIds || [];
      if(multiIds.length > 1){
        renderMultiCompareTable(wrap, multiIds);
        return;
      }

      const tid = sel.value || String((state.ui && state.ui.resultsTastingId) || '');
      if(!sel.value && tid) sel.value = tid;
      if(!tid){
        wrap.innerHTML = `<div class="muted">Seleziona una degustazione dall'elenco.</div>`;
        return;
      }

      // V183: Clear multi-compare mode when using single select
      state.ui.multiCompareTastingIds = [];

      const t = state.tastings.find(x=>x.id===tid);
      if(!t){
        wrap.innerHTML = `<div class="muted">Degustazione non trovata.</div>`;
        return;
      }

      wrap.innerHTML = renderSingleTastingTable(t);
    }

    // V183: Render a single tasting table (extracted for reuse)
    function renderSingleTastingTable(t){
      const activeTasters = state.tasters.filter(tas => {
         if(!(t.tasterIds||[]).includes(tas.id)) return false;
         const evs = t.evaluations && t.evaluations[String(tas.id)];
         return evs && Object.keys(evs).length > 0;
      });

      if(activeTasters.length === 0){
          return `<div class="muted">Nessuna valutazione presente per "${esc(t.title)}".</div>`;
      }

      const q = (state.ui.resultsSearch||"").toLowerCase().trim();
      const resultsSort = state.ui.resultsSort || 'id';

      const cols = [
        "Degustatore", "Profilo", "Gruppo", "Evoluzione", "Preferito", 
        "Vista I/L", "Vista descr.", 
        "Olfatto I/C", "Olfatto descr.", 
        "Gusto C/A/P", "Gusto descr.", 
        "Overall", "Note"
      ];

      let html = `<div style="overflow-x:auto"><table style="min-width:100%; border-collapse:collapse; font-size:12px;">`;
      html += `<thead><tr style="background:#7a2938; color:#fff; font-weight:bold;">`;
      cols.forEach(c => html += `<th style="padding:8px; text-align:left; border:1px solid #9d3d4f;">${esc(c)}</th>`);
      html += `</tr></thead><tbody>`;

      let anyRowShown = false;

      const samplesList = t.samples.slice();
      if(resultsSort==='group'){
        const gs = groupsForTasting(t);
        const gOrd = {}; gs.forEach((g,i)=> gOrd[String(g.key)] = i);
        samplesList.sort((a,b)=> (gOrd[String(a.groupKey)]??9999) - (gOrd[String(b.groupKey)]??9999) || cmpSampleId(a.id,b.id));
      } else {
        samplesList.sort((a,b)=>cmpSampleId(a.id,b.id));
      }

      samplesList.forEach(s=>{
        const name = getSampleNameForResults(t, s);
        const sampleText = (name + " " + s.id).toLowerCase();

        let tasterRowsHtml = "";
        let visibleTasterRows = 0;

        activeTasters.forEach(tas=>{
           const ev = (t.evaluations && t.evaluations[tas.id] && t.evaluations[tas.id][s.id]) || {};

           let pLabel = "";
           if(ev.profileKey){
             const p = (profileDef(t, ev.profileKey) || (state.profiles||[]).find(x=>x.key===ev.profileKey));
             if(p) pLabel = p.label;
           }
           const evo = ev.evolution || 0;
           const v_d = (ev.data?.vista?.desc || []).join(", ");
           const o_d = (ev.data?.olfatto?.desc || []).join(", ");
           const g_d = (ev.data?.gusto?.desc || []).join(", ");

           const g = groupDef(t, s.groupKey);
           const gLabel = g ? g.label : "";

           const rowText = [
              s.id, name,
              gLabel,
              tas.name, pLabel,
              evo > 0 ? "evoluzione" : "",
              ev.favourite ? "preferito" : "",
              v_d, o_d, g_d,
              (ev.overall||""),
              sampleText
           ].join(" ").toLowerCase();

           if(!q || rowText.includes(q)){
               visibleTasterRows++;

               let profHtml = "-";
               if(ev.profileKey){
                 const p = (profileDef(t, ev.profileKey) || (state.profiles||[]).find(x=>x.key===ev.profileKey));
                 if(p) profHtml = `<span style="display:inline-block; padding:2px 8px; border-radius:10px; background:#${p.color}40; border:1px solid #${p.color}; font-size:11px; font-weight:bold;">${esc(p.label)}</span>`;
               }

               let groupHtml = "-";
               const gDefRow = groupDef(t, s.groupKey);
               if(gDefRow){
                 groupHtml = '<span style=\"display:inline-block; padding:2px 8px; border-radius:10px; ' + 'background:#' + esc(gDefRow.color) + '40; border:1px solid #' + esc(gDefRow.color) + '; font-size:11px; font-weight:bold;\">' + esc(gDefRow.label) + '</span>';
               }
               const fav = ev.favourite ? '<span style="color:red; font-size:14px;">❤</span>' : "-";

               const v_int = ev.data?.vista?.intensita || 0;
               const v_lim = ev.data?.vista?.limpidezza || 0;
               const o_int = ev.data?.olfatto?.intensita || 0;
               const o_cmp = ev.data?.olfatto?.complessita || 0;
               const g_cor = ev.data?.gusto?.corpo || 0;
               const g_aci = ev.data?.gusto?.acidita || 0;
               const g_per = ev.data?.gusto?.persistenza || 0;
               const overall = ev.overall > 0 ? ev.overall.toFixed(1) : "-";

               const noteCanvas = (ev.data && ev.data.vista && ev.data.vista.canvas) || null;
               const tasterName = (typeof tas!=='undefined' && tas && tas.name) ? String(tas.name) : '';
               const noteTitle = encodeURIComponent((name||'') + ' / ' + (tasterName||''));
               const noteBtn = (!isCanvasEmptyDataUrl(noteCanvas)) ? ('<button class=\"btn\" style=\"padding:3px 8px;font-size:11px;\" title=\"Apri note\" onclick=\"openResultsCanvas(\'' + encodeURIComponent(noteCanvas) + '\',\'' + noteTitle + '\')\">✎</button>') : '';
               const evoHtml = `<div style="display:flex;gap:2px;">${[1,2,3,4,5].map(i=>`<div style="width:8px;height:8px;border-radius:50%;background:${i<=evo?'#7a2938':'#eee'};border:1px solid #999;"></div>`).join('')}</div>`;

               tasterRowsHtml += `<tr data-rowtype="taster" data-sampleid="${esc(s.id)}" data-search="${esc(rowText)}" style="background:#fff; border-bottom:1px solid #eee;">
                  <td style="padding:8px; color:#666;">${esc(tas.name)}</td>
                  <td style="padding:8px;">${profHtml}</td>
                  <td style="padding:8px;">${groupHtml}</td>
                  <td style="padding:8px;">${evoHtml}</td>
                  <td style="padding:8px; text-align:center;">${fav}</td>
                  <td style="padding:8px;">${v_int} / ${v_lim}</td>
                  <td style="padding:8px; font-style:italic; color:#555;">${esc(v_d||"-")}</td>
                  <td style="padding:8px;">${o_int} / ${o_cmp}</td>
                  <td style="padding:8px; font-style:italic; color:#555;">${esc(o_d||"-")}</td>
                  <td style="padding:8px;">${g_cor} / ${g_aci} / ${g_per}</td>
                  <td style="padding:8px; font-style:italic; color:#555;">${esc(g_d||"-")}</td>
                  <td style="padding:8px; font-weight:bold;">${overall}</td>
                  <td style="padding:8px; font-size:12px; color:#888;">${noteBtn}</td>
               </tr>`;
           }
        });

        if(visibleTasterRows > 0){
           anyRowShown = true;
           html += `<tr data-rowtype="sample" data-sampleid="${esc(s.id)}" data-search="${esc(sampleText + " " + name + " " + (groupDef(t,s.groupKey)?.label||""))}" style="background:#f9f5f0; border-top:2px solid #ccc;">
                   <td colspan="${cols.length}" style="padding:10px; font-weight:bold; font-size:14px; color:#333; border-bottom:1px solid #ddd;">
                     <span style="color:#7a2938; margin-right:8px;">${esc(s.id)}</span> ${esc(name)}
                   </td>
                 </tr>`;
           html += tasterRowsHtml;
        }
      });
      html += `</tbody></table></div>`;
      if(!anyRowShown) html = `<div class="muted">Nessun risultato per la ricerca.</div>`;
      return html;
    }

    // V183: Render multiple tasting tables
    function renderMultiCompareTable(wrap, tastingIds){
      let html = '<div style="margin-bottom:15px;padding:10px;background:#f5f5f5;border-radius:8px;">';
      html += '<strong>📊 Confronto multiplo:</strong> ' + tastingIds.length + ' degustazioni';
      html += ' <button class="btn" onclick="clearMultiCompare()" style="margin-left:15px;">Chiudi confronto multiplo</button>';
      html += '</div>';

      tastingIds.forEach((tid, idx) => {
        const t = state.tastings.find(x=>x.id===tid);
        if(!t) return;

        html += '<div style="margin-bottom:30px;">';
        html += '<h3 style="color:var(--bordeaux);margin-bottom:10px;padding:10px;background:#f9f5f0;border-radius:8px;">';
        html += (idx + 1) + '. ' + esc(t.title);
        html += ' <span style="font-size:12px;font-weight:normal;color:#666;">(' + t.samples.length + ' campioni, ' + esc(t.mode) + ')</span>';
        html += '</h3>';
        html += renderSingleTastingTable(t);
        html += '</div>';
      });

      wrap.innerHTML = html;
    }

    function clearMultiCompare(){
      state.ui.multiCompareTastingIds = [];
      window._multiSelectTastings = new Set();
      saveState({skipCloud: true});
      renderResultsTable();
    }


    // ---------- Create / Edit Tasting Logic ----------
    let draft = { id:null, items:[] };

    function openCreateModal(){
      draft = { id:null, items:[] };
      // Init 20 rows
      for(let i=0;i<12;i++) addDraftRow(false);

      document.getElementById("tastingModalTitle").textContent = "Nuova degustazione";
      document.getElementById("degTitle").value = "";
      document.getElementById("degStatus").value = "attiva";
      document.getElementById("degMode").value = "scoperta";
      // V185: Set default date to today
      document.getElementById("degDate").value = new Date().toISOString().split('T')[0];

      renderDraftTasters(state.tasters.map(t=>t.id));
      renderDraftTable();
      openModal("modalTasting");
      onModeChanged();
    }

    function openEditModal(id){
      const t = state.tastings.find(x=>x.id===id);
      if(!t) return;

      draft.id = id;
      draft.items = [];

      const isBlind = t.mode === "cieca";

      if(isBlind){
        const n = Math.max((t.samples||[]).length, (t.products||[]).length);
        for(let i=0;i<n;i++){
          const s = (t.samples||[])[i] || { id:"", cols:["","","",""], active: true };
          const p = (t.products||[])[i] || { id:null, cols:["","","",""] };
          const pc = cols4(p.cols);
          draft.items.push({
            use: s.active !== false, // V185: Use active flag from sample
            id: s.id || "",
            pid: p.id || null,
            groupKey: (s && ("groupKey" in s)) ? s.groupKey : null,
            c1: pc[0], c2: pc[1], c3: pc[2], c4: pc[3]
          });
        }
      } else {
        // Load samples - V185: preserve active flag
        t.samples.forEach(s=>{
          draft.items.push({
            use: s.active !== false, // V185: Use active flag
            id: s.id,
            pid: null,
            groupKey: (s && ("groupKey" in s)) ? s.groupKey : null,
            c1: s.cols[0], c2: s.cols[1], c3: s.cols[2], c4: s.cols[3]
          });
        });
      }

      // Add extra blank rows
      for(let i=0;i<5;i++) addDraftRow(false);

      document.getElementById("tastingModalTitle").textContent = "Modifica degustazione";
      document.getElementById("degTitle").value = t.title;
      document.getElementById("degStatus").value = t.status;
      document.getElementById("degMode").value = t.mode;
      // V185: Load date (createdAt or tastingDate)
      const dateVal = t.tastingDate || (t.createdAt ? t.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
      document.getElementById("degDate").value = dateVal;

      renderDraftTasters(t.tasterIds);
      renderDraftTable();
      openModal("modalTasting");
      onModeChanged();
    }


    function addDraftRow(render=true){
      draft.items.push({ use:true, id:"", pid:null, c1:"", c2:"", c3:"", c4:"" });
      if(render) renderDraftTable();
    }


    function renderDraftTasters(selectedIds){
      const sel = new Set(selectedIds || []);
      const wrap = document.getElementById("draftTasters");
      wrap.innerHTML = state.tasters.map(t=>`
        <label>
          <input type="checkbox" value="${esc(t.id)}" ${sel.has(t.id)?"checked":""} />
          ${esc(t.name)}
        </label>
      `).join("");
    }

    function renderDraftTable(){
      const tbody = document.getElementById("draftTableBody");
      tbody.innerHTML = draft.items.map((it,i)=>`
        <tr data-idx="${i}">
          <td style="text-align:center"><input type="checkbox" onchange="updateDraftItem(${i},'use',this.checked)" ${it.use?"checked":""} /></td>
          <td class="draft-cell id"><input class="draft-input" data-r="${i}" data-c="id" value="${esc(it.id)}" oninput="updateDraftItem(${i},'id',this.value)" placeholder="auto" /></td>
          <td class="draft-cell"><input class="draft-input" data-r="${i}" data-c="c1" value="${esc(it.c1)}" oninput="updateDraftItem(${i},'c1',this.value)" /></td>
          <td class="draft-cell"><input class="draft-input" data-r="${i}" data-c="c2" value="${esc(it.c2)}" oninput="updateDraftItem(${i},'c2',this.value)" /></td>
          <td class="draft-cell"><input class="draft-input" data-r="${i}" data-c="c3" value="${esc(it.c3)}" oninput="updateDraftItem(${i},'c3',this.value)" /></td>
          <td class="draft-cell"><input class="draft-input" data-r="${i}" data-c="c4" value="${esc(it.c4)}" oninput="updateDraftItem(${i},'c4',this.value)" /></td>
          <td style="text-align:center"><button class="btn" style="padding:2px 6px;font-size:11px;color:#c00;" onclick="removeDraftRow(${i})">✕</button></td>
        </tr>
      `).join("");

      setupDraftArrowNavigation();
    }

    function updateDraftItem(idx, field, val){
      if(draft.items[idx]) draft.items[idx][field] = val;
    }
    function removeDraftRow(idx){
      draft.items.splice(idx,1);
      renderDraftTable();
    }

    // V195: Export draft table to Excel
    function exportDraftToExcel() {
      const title = document.getElementById("degTitle").value || "Degustazione";
      const mode = document.getElementById("degMode").value;
      const isBlind = mode === "cieca";
      
      // Filter only active items with content
      const items = draft.items.filter(it => it.use && (it.id || it.c1 || it.c2 || it.c3 || it.c4));
      
      if(items.length === 0) {
        toast("Nessun campione da esportare");
        return;
      }
      
      // Build CSV content (for Excel compatibility)
      const headers = isBlind 
        ? ["ID", "ProdCol1", "ProdCol2", "ProdCol3", "ProdCol4"]
        : ["ID", "Prodotto", "Annata", "Zona", "Extra"];
      
      let csv = headers.join(";") + "\n";
      
      items.forEach((it, idx) => {
        const id = it.id || ("C" + (idx + 1));
        const row = [
          escCsv(id),
          escCsv(it.c1 || ""),
          escCsv(it.c2 || ""),
          escCsv(it.c3 || ""),
          escCsv(it.c4 || "")
        ];
        csv += row.join(";") + "\n";
      });
      
      // Add BOM for Excel UTF-8 compatibility
      const bom = "\uFEFF";
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = title.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ\s]/g, "").trim().replace(/\s+/g, "_");
      a.download = safeTitle + "_campioni.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast("📊 Esportato " + items.length + " campioni");
    }
    
    function escCsv(val) {
      if(!val) return "";
      val = String(val);
      if(val.includes(";") || val.includes('"') || val.includes("\n")) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }

    function onModeChanged(){
      const m = document.getElementById("degMode").value;
      const isBlind = m==="cieca";
      document.querySelectorAll(".col-drag").forEach(el=>{
        const c = parseInt(el.dataset.col);
        if(isBlind) el.textContent = "ProdCol"+(c+1);
        else el.textContent = ["Prodotto","Annata","Zona","Extra"][c];
      });
    }

    // Drag columns in Modal
    let dragColIdx = null;
    document.querySelectorAll(".col-drag").forEach(el=>{
      el.addEventListener("dragstart",()=>{ dragColIdx = parseInt(el.dataset.col); });
      el.addEventListener("dragover",(e)=>e.preventDefault());
      el.addEventListener("drop",()=>{
        const targetIdx = parseInt(el.dataset.col);
        if(dragColIdx===null || dragColIdx===targetIdx) return;
        // Swap values in all draft items
        const f1 = "c"+(dragColIdx+1);
        const f2 = "c"+(targetIdx+1);
        draft.items.forEach(it=>{
          const tmp = it[f1];
          it[f1] = it[f2];
          it[f2] = tmp;
        });
        renderDraftTable();
        dragColIdx=null;
      });
    });

    // Paste from Excel (robusto: evita che l'HTML di Excel rompa la tabella)
    document.addEventListener("paste", (e)=>{
      const active = document.activeElement;
      const isDraft = !!(active && active.classList && active.classList.contains("draft-input"));
      const modal = document.getElementById("modalTasting");
      const modalOpen = !!(modal && ((modal.classList && modal.classList.contains('active')) || (modal.style.display && modal.style.display !== 'none')));
      if(!isDraft && !modalOpen) return;

      if(active && active.tagName==="INPUT" && !isDraft) return;

      e.preventDefault();
      const cb = (e.clipboardData || window.clipboardData);
      let grid = [];

      // 1) Preferisci HTML di Excel se contiene <table>, ma PARSALO in sicurezza.
      try{
        const html = cb ? (cb.getData("text/html") || '') : '';
        if(html && html.toLowerCase().includes('<table')){
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const table = doc.querySelector('table');
          if(table){
            const trs = Array.from(table.querySelectorAll('tr'));
            trs.forEach(tr=>{
              const tds = Array.from(tr.querySelectorAll('td'));
              if(!tds.length) return;
              const row = tds.map(td=>{
                return String(td.innerText || '').replace(/ /g,' ').trim();
              });
              grid.push(row);
            });
          }
        }
      }catch(_e){}

      // 2) Fallback: TSV da text/plain
      if(!grid.length){
        const plain = cb ? (cb.getData("text/plain") || cb.getData("text") || '') : '';
        const norm = plain.split('\r\n').join('\n').split('\r').join('\n');
        const lines = norm.split('\n');
        grid = lines.filter(l=>l.length>0).map(l=>l.split('\t'));
      }

      if(!grid.length) return;

      let startIdx = 0;
      let colOffset = 0;

      if(isDraft){
        const r = parseIntSafe(active.dataset.r, -1);
        const c = active.dataset.c;
        if(r>=0) startIdx = r;
        if(c==="id") colOffset=0;
        else if(c==="c1") colOffset=1;
        else if(c==="c2") colOffset=2;
        else if(c==="c3") colOffset=3;
        else if(c==="c4") colOffset=4;
      }

      grid.forEach((vals, i)=>{
        const rowIndex = startIdx + i;
        while(rowIndex >= draft.items.length) addDraftRow(false);

        const it = draft.items[rowIndex];
        it.use = true;

        vals.forEach((v, j)=>{
          const colAbs = colOffset + j;
          const cleanV = String(v||'').split('\r\n').join('\n').split('\r').join('\n').trim();
          if(colAbs===0) it.id = cleanV;
          if(colAbs===1) it.c1 = cleanV;
          if(colAbs===2) it.c2 = cleanV;
          if(colAbs===3) it.c3 = cleanV;
          if(colAbs===4) it.c4 = cleanV;
        });
      });
      renderDraftTable();
    });

    function createOrUpdateTasting(){
      const title = document.getElementById("degTitle").value.trim();
      if(!title){ toast("Inserisci titolo"); return; }

      const mode = document.getElementById("degMode").value;
      const status = document.getElementById("degStatus").value;
      const isBlind = (mode === "cieca");
      // V185: Get tasting date
      const tastingDate = document.getElementById("degDate").value || new Date().toISOString().split('T')[0];

      // Get tasters
      const tIds = [];
      document.querySelectorAll("#draftTasters input:checked").forEach(cb=>tIds.push(parseInt(cb.value)));
      if(!tIds.length){ toast("Seleziona almeno un degustatore"); return; }

      // V185: Keep ALL items with data, but mark active/inactive
      const allItemsWithData = draft.items.filter(it => {
        const hasId = String(it.id||"").trim();
        const hasCols = (it.c1||"").trim() || (it.c2||"").trim() || (it.c3||"").trim() || (it.c4||"").trim();
        return !!(hasId || hasCols);
      });
      
      // V185: Active items (flagged with use=true)
      const validItems = allItemsWithData.filter(it => it.use);

      if(!validItems.length){
        toast(isBlind ? "Nessun campione/prodotto attivo" : "Nessun campione attivo");
        return;
      }

      // Auto-assign IDs 01..XX to items with no ID
      const usedIds = new Set(allItemsWithData.map(x=>String(x.id||"").trim()).filter(Boolean));
      let nextId = 1;
      allItemsWithData.forEach(it=>{
        if(String(it.id||"").trim()) return;
        let cand = String(nextId).padStart(2,"0");
        while(usedIds.has(cand)){ nextId++; cand = String(nextId).padStart(2,"0"); }
        it.id = cand;
        usedIds.add(cand);
        nextId++;
      });

      // Preserve existing data if editing
      let evals = {};
      let blindMap = {};
      let existing = null;

      if(draft.id){
        existing = state.tastings.find(x=>x.id===draft.id);
        if(existing){
          evals = existing.evaluations;
          blindMap = existing.blindMap || {};
        }
      }
      // Mappa groupKey esistenti (per preservare i gruppi su modifica/riapertura)
      const existingGroupById = {};
      try{ (existing && existing.samples || []).forEach(sm=>{ existingGroupById[String(sm.id)] = (('groupKey' in sm) ? sm.groupKey : null); }); }catch(e){}


      let finalSamples = null;
      let finalProducts = null;

      if(isBlind){
        // In cieca:
        // - ID colonna = ID campione (anonimo) -> NON si rinumera/azzera
        // - Col1..Col4 = descrizione prodotto -> salvata in t.products
        // V185: Save ALL items with active flag
        finalSamples = allItemsWithData.map(it=>({
          id: it.id ? it.id : uid(),
          cols: ["","","",""],
          groupKey: (("groupKey" in it) ? it.groupKey : (existingGroupById[String(it.id)] ?? null)),
          active: it.use !== false
        }));

        const prevProducts = (existing && Array.isArray(existing.products)) ? existing.products : [];
        finalProducts = allItemsWithData.map((it,i)=>({
          id: it.pid || (prevProducts[i] ? prevProducts[i].id : uid()),
          cols: [it.c1, it.c2, it.c3, it.c4]
        }));

        // Ripulisci blindMap: conserva solo associazioni che puntano a sampleId/prodId ancora esistenti
        const sSet = new Set(finalSamples.map(s=>String(s.id)));
        const pSet = new Set(finalProducts.map(p=>String(p.id)));
        const cleaned = {};
        Object.keys(blindMap||{}).forEach(sid=>{
          const pid = String(blindMap[sid]);
          if(sSet.has(String(sid)) && pSet.has(pid)) cleaned[String(sid)] = pid;
        });
        blindMap = cleaned;

      } else {
        // V185: Save ALL items with active flag
        finalSamples = allItemsWithData.map(it=>({
          id: it.id ? it.id : uid(),
          cols: [it.c1, it.c2, it.c3, it.c4],
          groupKey: (("groupKey" in it) ? it.groupKey : (existingGroupById[String(it.id)] ?? null)),
          active: it.use !== false
        }));
        finalProducts = null;
        blindMap = {};
      }

      const newT = {
        id: draft.id || uid(),
        title: title,
        status: status,
        mode: mode,
        tastingDate: tastingDate, // V185: Tasting date
        createdAt: tastingDate + 'T12:00:00.000Z', // V186: createdAt syncs with tastingDate
        finishedAt: existing ? existing.finishedAt : null,
        columns: ["Col1","Col2","Col3","Col4"],
        groups: existing ? existing.groups : clone(state.groups),
        profiles: existing ? (existing.profiles || clone(state.profiles)) : clone(state.profiles),
        samples: finalSamples,
        products: finalProducts,
        blindMap: blindMap,
        tasterIds: tIds,
        evaluations: evals
      };

      ensureTastingSampleIds(newT);

      // V143: default swipe colore su PROFILO (per ogni degustatore) alla creazione
      try{
        if(!existing){
          if(!newT.uiPrefs) newT.uiPrefs = {};
          if(!newT.uiPrefs.cardColorModeByTaster) newT.uiPrefs.cardColorModeByTaster = {};
          (newT.tasterIds || []).forEach(id=>{
            const k = String(id);
            if(!newT.uiPrefs.cardColorModeByTaster[k]) newT.uiPrefs.cardColorModeByTaster[k] = 'profile';
          });
        }
      }catch(e){}


      // V125: detach groups on create/edit (no anagrafica coupling)
      try{
        if(!newT.__groupsDetached){
          newT.groups = (newT.groups||[]).map(g=>({ key:g.key, label:g.label, color:g.color }));
          newT.__groupsDetached = 1;
        }
      }catch(_e){}

      if(existing){
        const idx = state.tastings.findIndex(x=>x.id===existing.id);
        state.tastings[idx] = newT;
      } else {
        state.tastings.unshift(newT);
      }

      saveState();
      renderPreparation();
      closeModal("modalTasting");
      toast("Degustazione salvata");
    }


    // Init
    window.addEventListener("DOMContentLoaded", ()=>{
      // MODIFICA 2: Splash gestito dal primo script, non chiudere qui
      
      const loaded = loadState();
      state = migrate(loaded);

      if(state.currentTastingId && !state.tastings.find(t=>t.id===state.currentTastingId)){
        state.currentTastingId = state.tastings[0]?.id || null;
      }

      const initTab = state.ui.prepTab || "attive";
      showPrepTab(initTab); 

      renderPreparation();
      renderAnagrafiche();
      renderArchive();
      renderResultsSelect();
      renderTastingPage(); 

      

      try{ applyLocalCardUiPrefs(); }catch(e){}
      try{ updateHiddenButtons(); }catch(e){}
