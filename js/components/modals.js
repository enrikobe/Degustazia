// modals.js — P2c

const lastPage = document.querySelector(".page.active")?.id?.replace("page-","") || "preparazione";
      updateTopActions(lastPage);

      document.addEventListener("click", (e)=>{
         if(!e.target.closest("#filtersPanel") && !e.target.closest("#btnTopFilters") && !e.target.closest("#zenBar button") && !e.target.closest("#btnZenPlusTopFilters")){
            closeFiltersPanel();
         }
      });

      setTimeout(initCanvas, 500);
      window.addEventListener("resize", initCanvas);
    });
  
let currentEditEntity = null;
function openGroupEditModal(key){
    const t = getTasting();
    const g = groupDef(t, key);
    if(!g) return;
    currentEditEntity = { type: 'group', key: key };
    document.getElementById("editEntityTitle").innerText = "Gruppo";
    const inp = document.getElementById("editEntityName");
    inp.value = g.label;
    document.getElementById("editEntityColor").value = "#" + g.color;
    
    document.getElementById("editEntityModal").style.display = "flex";
    setTimeout(()=>inp.select(), 50);
}
function openProfileEditModal(key){
    const t = getTasting();
    const p = profileDef(t, key);
    if(!p) return;
    currentEditEntity = { type: 'profile', key: key };
    document.getElementById("editEntityTitle").innerText = "Profilo";
    const inp = document.getElementById("editEntityName");
    inp.value = p.label;
    document.getElementById("editEntityColor").value = "#" + p.color;
    
    document.getElementById("editEntityModal").style.display = "flex";
    setTimeout(()=>inp.select(), 50);
}


function closeEditEntityModal(){ document.getElementById("editEntityModal").style.display = "none"; currentEditEntity = null; }
function saveEditEntity(){
    if(!currentEditEntity) return;

    // Copia prima di chiudere: closeEditEntityModal() azzera currentEditEntity
    const entity = clone(currentEditEntity);

    const t = getTasting();
    const name = document.getElementById("editEntityName").value.trim();
    const col = document.getElementById("editEntityColor").value.substring(1);

    closeEditEntityModal();

    if(!t || !name) return;

    if(entity.type === 'group'){
        if(!t.groups || !t.groups.length) t.groups = clone(groupsForTasting(t));
        const g = t.groups.find(x=>x.key===entity.key);
        if(g){ g.label = name; g.color = col; toast("Gruppo aggiornato"); }
    } else {
        if(!t.profiles || !t.profiles.length) t.profiles = clone(profilesForTasting(t));
        const p = t.profiles.find(x=>x.key===entity.key);
        if(p){ p.label = name; p.color = col; toast("Profilo aggiornato"); }
    }

    saveState();
    renderGroupOptions();
    renderProfileOptions();
    renderGroupFilterBtns();
    renderProfileFilterBtns();
    renderGrid();
    updateDetail();
}
function deleteEditEntity(){
    if(!currentEditEntity) return;

    const entity = clone(currentEditEntity);
    const t = getTasting();
    if(!t) return;

    const label = entity.type === 'group' ? 'gruppo' : 'profilo';
    if(!confirm(`Eliminare questo ${label} dalla degustazione attuale?`)) return;

    if(entity.type === 'group'){
      // forza lista locale per la degustazione
      t.groups = clone(groupsForTasting(t)).filter(g=>g.key!==entity.key);
      // rimuovi assegnazione ai campioni
      (t.samples||[]).forEach(s=>{ if(String(s.groupKey)===String(entity.key)) s.groupKey = null; });
      if(String(state.ui.filterGroup||'tutti')===String(entity.key)) state.ui.filterGroup = 'tutti';
      toast('Gruppo eliminato');
    } else {
      t.profiles = clone(profilesForTasting(t)).filter(p=>p.key!==entity.key);
      // rimuovi assegnazione profilo da tutte le valutazioni
      if(t.evaluations){
        Object.keys(t.evaluations).forEach(tasterId=>{
          const evs = t.evaluations[tasterId] || {};
          Object.keys(evs).forEach(sampleId=>{
            const ev = evs[sampleId];
            if(ev && String(ev.profileKey)===String(entity.key)) ev.profileKey = null;
          });
        });
      }
      if(String(state.ui.filterProfile||'tutti')===String(entity.key)) state.ui.filterProfile = 'tutti';
      toast('Profilo eliminato');
    }

    closeEditEntityModal();
    saveState();
    renderGroupOptions();
    renderProfileOptions();
    renderGroupFilterBtns();
    renderProfileFilterBtns();
    renderGrid();
    updateDetail();
}


function addNewLocalGroup(){
    const t = getTasting();
    if(!t.groups || !t.groups.length) t.groups = clone(state.groups);
    const newKey = "lg_" + Date.now() + "_" + Math.floor(Math.random()*999);
    t.groups.push({ key: newKey, label: "Nuovo Gruppo", color: "999999" });
    saveState(); renderGroupOptions(); openGroupEditModal(newKey);
}
function addNewLocalProfile(){
    const t = getTasting();
    if(!t.profiles || !t.profiles.length) t.profiles = clone(state.profiles);
    const newKey = "lp_" + Date.now() + "_" + Math.floor(Math.random()*999);
    t.profiles.push({ key: newKey, label: "Nuovo Profilo", color: "999999" });
    saveState(); renderProfileOptions(); openProfileEditModal(newKey);
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
       saveState();
       renderProductsStrip(); renderGrid(); updateDetail();
    };
