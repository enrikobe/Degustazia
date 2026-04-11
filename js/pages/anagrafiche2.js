// anagrafiche2.js — P2c

function renderAnagrafiche(){
      const dwrap = document.getElementById("descriptorsWrap");
      if(dwrap){
        const secs=["vista","olfatto","gusto"];
        dwrap.innerHTML = secs.map(sec=>{
          return `
            <div class="list-card">
              <h3>${esc(sec.toUpperCase())}</h3>
              <div class="grid-2">
                <div>
                  <div class="desc-col-title">Bianchi</div>
                  <div class="desc-list">${(state.descriptors[sec].white||[]).map(x=>`<div class="desc-pill" onclick="removeDesc('${sec}','white','${esc(x)}')">${esc(x)} ✕</div>`).join("")}</div>
                  <div style="margin-top:6px;display:flex;gap:6px;">
                    <input id="desc_${sec}_white" class="input" style="padding:4px 8px;font-size:12px;flex:1;" placeholder="Nuovo..." onkeydown="if(event.key==='Enter') addDesc('${sec}','white',this.value,this)" />
                    <button class="btn" style="padding:4px 8px;font-size:11px;" onclick="addDesc('${sec}','white',document.getElementById('desc_${sec}_white').value); document.getElementById('desc_${sec}_white').value='';">Aggiungi</button>
                  </div>
                </div>
                <div>
                  <div class="desc-col-title">Rossi</div>
                  <div class="desc-list">${(state.descriptors[sec].red||[]).map(x=>`<div class="desc-pill" onclick="removeDesc('${sec}','red','${esc(x)}')">${esc(x)} ✕</div>`).join("")}</div>
                  <div style="margin-top:6px;display:flex;gap:6px;">
                    <input id="desc_${sec}_red" class="input" style="padding:4px 8px;font-size:12px;flex:1;" placeholder="Nuovo..." onkeydown="if(event.key==='Enter') addDesc('${sec}','red',this.value,this)" />
                    <button class="btn" style="padding:4px 8px;font-size:11px;" onclick="addDesc('${sec}','red',document.getElementById('desc_${sec}_red').value); document.getElementById('desc_${sec}_red').value='';">Aggiungi</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }

      const pList = document.getElementById("profilesList");
      if(pList){
        pList.innerHTML = state.profiles.map(p=>`
          <div class="ana-item" draggable="true" data-type="profile" data-key="${esc(p.key)}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;background:#fff;cursor:grab">
            <div style="cursor:grab;color:#ccc;padding:0 4px">☰</div>
            <div style="width:16px;height:16px;background:#${p.color};border-radius:4px;flex:0 0 auto;"></div>
            <input class="input" style="padding:4px 8px;font-size:12px;width:140px" value="${esc(p.label)}" onchange="editProfileLabel('${esc(p.key)}',this.value)">
            <input type="color" value="#${esc(p.color)}" style="width:50px;height:28px;padding:0;border:1px solid #ddd;cursor:pointer;" onchange="editProfileColor('${esc(p.key)}',this.value.substring(1))" />
            <div style="flex:1"></div>
            <button class="btn" style="padding:4px 8px;font-size:11px;color:#c00" onclick="removeProfile('${esc(p.key)}')">✕</button>
          </div>
`).join("");
      }

      const gList = document.getElementById("groupsList");
      if(gList){
        gList.innerHTML = state.groups.map(g=>`
          <div class="ana-item" draggable="true" data-type="group" data-key="${esc(g.key)}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;background:#fff;cursor:grab">
             <div style="cursor:grab;color:#ccc;padding:0 4px">☰</div>
            <div style="width:16px;height:16px;background:#${g.color};border-radius:4px;flex:0 0 auto;"></div>
            <input class="input" style="padding:4px 8px;font-size:12px;width:140px" value="${esc(g.label)}" onchange="editGroupLabel('${esc(g.key)}',this.value)">
            <input type="color" value="#${esc(g.color)}" style="width:50px;height:28px;padding:0;border:1px solid #ddd;cursor:pointer;" onchange="editGroupColor('${esc(g.key)}',this.value.substring(1))" />
            <div style="flex:1"></div>
            <button class="btn" style="padding:4px 8px;font-size:11px;color:#c00" onclick="removeGroup('${esc(g.key)}')">✕</button>
          </div>
`).join("");
      }

      const tBody = document.getElementById("tastersTbody");
      if(tBody){
        tBody.innerHTML = state.tasters.map(t=>`
          <tr>
            <td>${esc(t.id)}</td>
            <td>${esc(t.name)}</td>
            <td>${esc(t.email)}</td>
            <td><button class="btn" style="padding:4px 8px;font-size:11px;" onclick="removeTaster('${esc(t.id)}')">Elimina</button></td>
          </tr>
        `).join("");
      setTimeout(attachAnaDrag, 50);
      }
    }

    function showAnaTab(tab, btn){
      document.querySelectorAll(".ana-tab").forEach(d=>d.style.display="none");
      document.getElementById("ana-"+tab).style.display="block";
      document.querySelectorAll("#page-anagrafiche .tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    }

    function addDesc(sec, col, val, inputEl){
    if(!val) return;
    val = val.trim();
    if(!val) return;
    if(!state.descriptors) state.descriptors = { vista:{white:[],red:[]}, olfatto:{white:[],red:[]}, gusto:{white:[],red:[]} };
    if(!state.descriptors[sec]) state.descriptors[sec] = {white:[],red:[]};
    if(!state.descriptors[sec][col]) state.descriptors[sec][col] = [];

    const list = state.descriptors[sec][col];
    if(!list.includes(val)){
        list.push(val);
        saveState();
        renderAnagrafiche();
        renderDescriptorPickers();
        toast("Descrittore aggiunto");
    }
    if(inputEl) inputEl.value = '';
}
    function removeDesc(sec, type, val){
      if(!confirm("Eliminare descrittore?")) return;
      state.descriptors[sec][type] = state.descriptors[sec][type].filter(x=>x!==val);
      saveState();
      renderAnagrafiche();
    }

    function addProfile(){
      const n = document.getElementById("newProfileName").value.trim();
      const c = document.getElementById("newProfileColor").value.trim().replace("#","");
      if(!n) return;
      state.profiles.push({key:slugify(n), label:n, color:c||"777777"});
      saveState();
      renderAnagrafiche();
      document.getElementById("newProfileName").value="";
    }
    function removeProfile(key){
      if(!confirm("Eliminare profilo?")) return;
      state.profiles = state.profiles.filter(p=>p.key!==key);
      saveState();
      renderAnagrafiche();
    }

    function addGroup(){
      const n = document.getElementById("newGroupName").value.trim();
      const c = document.getElementById("newGroupColor").value.trim().replace("#","");
      if(!n) return;
      state.groups.push({key:slugify(n), label:n, color:c||"777777"});
      saveState();
      renderAnagrafiche();
      document.getElementById("newGroupName").value="";
    }
    function removeGroup(key){
      if(!confirm("Eliminare gruppo?")) return;
      state.groups = state.groups.filter(g=>g.key!==key);
      saveState();
      renderAnagrafiche();
    }

    function addTaster(){
      const n = document.getElementById("newTasterName").value.trim();
      const e = document.getElementById("newTasterEmail").value.trim();
      if(!n) return;
      const maxId = state.tasters.reduce((m,t)=>Math.max(m,t.id),0);
      state.tasters.push({id:maxId+1, name:n, email:e});
      saveState();
      renderAnagrafiche();
      document.getElementById("newTasterName").value="";
      document.getElementById("newTasterEmail").value="";
    }
    function removeTaster(id){
      if(!confirm("Eliminare degustatore?")) return;
      state.tasters = state.tasters.filter(t=>String(t.id)!==String(id));
      saveState();
      renderAnagrafiche();
    }

    
    function viewArchived(id){
      const t=state.tastings.find(x=>x.id===id); if(!t)return;
      state.currentTastingId=id;
      state.currentTaster=(t.tasterIds||[])[0]||null; // Auto-select first taster
      saveState();
      go("degustazione", document.getElementById("btnMenuDeg"));
      setTimeout(()=>{ const s=document.getElementById("tasterSelect"); if(s && state.currentTaster) s.value=String(state.currentTaster); onSelectTaster(); }, 50);
    }
    function reopenTasting(id){
      const t=state.tastings.find(x=>x.id===id); if(!t)return;
      t.status="attiva"; t.finishedAt=null; saveState();
      go("preparazione", document.getElementById("btnMenuPrep")); renderPreparation();
      setTimeout(()=>openEditModal(id), 100);
    }
    async function copyTasting(id){
      const t = state.tastings.find(x=>x.id===id);
      if(!t) return;
      if(!confirm("Duplicare questa degustazione?")) return;
      const newT = clone(t);
      // V125: detach groups on copy
      try{ newT.groups = (newT.groups||[]).map(g=>({ key:g.key, label:g.label, color:g.color })); newT.__groupsDetached = 1; }catch(_e){}
      newT.id = uid();
      newT.title = newT.title + " (Copia)";
      newT.status = "bozza";
      newT.createdAt = nowIso();
      newT.evaluations = {}; 
      newT.blindMap = clone(t.blindMap || {});
      // V143: default swipe colore su PROFILO (duplica)
      try{ newT.uiPrefs = newT.uiPrefs || {}; newT.uiPrefs.cardColorModeByTaster = {}; (t.tasterIds||[]).forEach(id=> newT.uiPrefs.cardColorModeByTaster[String(id)]='profile'); }catch(e){}
      state.tastings.unshift(newT);
      saveState();
      try{ if(typeof pushTastingMeta === 'function') await pushTastingMeta(newT); }catch(e){ console.error('push copia error', e); }
      renderPreparation();
      toast("Degustazione duplicata (Bozza)");
      try{ go('preparazione', document.getElementById('btnMenuPrep')); }catch(e){}
      try{ showPrepTab('attive'); }catch(e){}
    }
    async function openComparison(id){
      const tid = String(id||'');
      if(!tid) return;

      go('risultati', document.getElementById('btnMenuRes'));

      const wrap = document.getElementById('resultsTableWrap');
      if(wrap) wrap.innerHTML = '<div class="muted">Caricamento dati archivio…</div>';

      // Forza refresh metadati (se disponibile nel layer cloud)
      try{ if(typeof pollTastings === 'function') await pollTastings(); }catch(e){}

      // Attendi che i metadati della degustazione siano presenti
      let t = state.tastings.find(x=>String(x.id)===tid);
      for(let i=0;i<12 && (!t || !t.samples || !t.samples.length); i++){
        await new Promise(r=>setTimeout(r,150));
        try{ if(typeof pollTastings === 'function') await pollTastings(); }catch(e){}
        t = state.tastings.find(x=>String(x.id)===tid);
      }
      if(!t){
        if(wrap) wrap.innerHTML = '<div class="muted">Degustazione non trovata.</div>';
        return;
      }

      // Forza prelievo valutazioni archiviate prima di rendere la tabella
      try{ if(typeof fetchArchivedEvaluations === 'function') await fetchArchivedEvaluations(tid); }catch(e){}

      try{ renderResultsSelect(); }catch(e){}
      const sel = document.getElementById('resultsDegSelect');
      if(sel) sel.value = tid;

      try{ if(typeof onResultsDegChange === 'function') await onResultsDegChange(tid); else renderResultsTable(); }catch(e){
        try{ renderResultsTable(); }catch(_e){}
      }
    }

