// canvas_inline.js — P2b

      const tId = currentTasterId();
      const ui = tId ? getTasterUI(tId) : { sort: 'custom' };
      const current = ui.sort || "custom";
      const resetDisabled = !(tId && ui && ui.orderDirty);
      const btn=(key,label,disabled)=>`<button class="sort-btn ${current===key?"active":""} ${disabled?"disabled":""}" onclick="setSort('${esc(key)}', this)" ${disabled?"disabled":""}>${esc(label)}</button>`;
      wrap.innerHTML = btn("custom","Ordine",false) + btn("group","Gruppo",false) + btn("profile","Profilo",false) + btn("evolution","Evoluzione",false) + btn("reset","Reset",resetDisabled);
    }

function renderGroupFilterBtns(){
      const wrap = document.getElementById("groupFilterBtns");
      const t = getTasting();
      if(!wrap) return;
      const groups = t ? groupsForTasting(t) : state.groups;
      const tId = currentTasterId();
      const ui = tId ? getTasterUI(tId) : { filterGroup: 'tutti' };
      let current = ui.filterGroup || "tutti";

      // Mostra solo i gruppi effettivamente presenti nelle card (assegnati ai campioni)
      const used = new Set();
      if(t && Array.isArray(t.samples)){
        t.samples.forEach(s=>{
          const k = (s && s.groupKey!=null) ? String(s.groupKey) : "";
          if(k) used.add(k);
        });
      }

      if(current !== 'tutti' && !used.has(String(current))){
        try{ ui.filterGroup = 'tutti'; saveState(); }catch(e){}
        current = 'tutti';
      }

      const btn=(key,label)=>`<button class="filter-btn ${current===key?"active":""}" onclick="setFilterGroup('${esc(key)}', this)">${esc(label)}</button>`;
      let html = btn("tutti","Tutti");
      groups.forEach(g=>{ if(used.has(String(g.key))) html += btn(g.key, g.label); });
      wrap.innerHTML = html;
    }

function renderProfileFilterBtns(){
      const wrap = document.getElementById("profileFilterBtns");
      if(!wrap) return;
      const t = getTasting();
      const tId = currentTasterId();
      const ui = tId ? getTasterUI(tId) : { filterProfile: 'tutti' };
      let current = ui.filterProfile || "tutti";

      // Mostra solo i profili effettivamente presenti nelle card (per degustatore corrente)
      const used = new Set();
      if(t && tId && Array.isArray(t.samples)){
        t.samples.forEach(s=>{
          try{
            const ev = getEval(t, tId, s.id);
            const k = ev && ev.profileKey ? String(ev.profileKey) : "";
            if(k) used.add(k);
          }catch(e){}
        });
      }

      if(current !== 'tutti' && !used.has(String(current))){
        try{ ui.filterProfile = 'tutti'; saveState(); }catch(e){}
        current = 'tutti';
      }

      const btn=(key,label)=>`<button class="filter-btn ${current===key?"active":""}" onclick="setFilterProfile('${esc(key)}', this)">${esc(label)}</button>`;
      let html = btn("tutti","Tutti");
      state.profiles.forEach(p=>{ if(used.has(String(p.key))) html += btn(p.key, p.label); });
      wrap.innerHTML = html;
    }

function renderProfileOptions(){
      const wrap = document.getElementById("profileOptions");
      const t = getTasting();
      if(!wrap || !t) return;
      const lock = (state.ui && state.ui.taxLock) ? state.ui.taxLock : null;
      const profiles = profilesForTasting(t);
      const listHtml = profiles.map(p=>{
        const rgb = hexToRgbParts(p.color);
        const locked = !!(lock && lock.type==='profile' && String(lock.key)===String(p.key));
        return `<div class="profile-option${locked?' locked':''}" data-profile="${esc(p.key)}" data-hascolor="1" style="--pcol-r:${rgb.r};--pcol-g:${rgb.g};--pcol-b:${rgb.b}">${esc(p.label)}${locked?' <span class=\"lock-ico\">🔒</span>':''}</div>`;
      }).join("");
      const addBtn = `<div class="profile-option" onclick="addNewLocalProfile()" style="border:1px dashed #ccc;background:#f9f9f9;justify-content:center;color:#666;cursor:pointer;">+ Nuovo</div>`;
      wrap.innerHTML = listHtml + addBtn;
      attachProfileRenameLongPress();
      try{ bindTaxLockHandlers(); }catch(e){}
    }

function hydrateTasterSelect(){
      const sel = document.getElementById("tasterSelect");
      const t = getTasting();
      if(!sel) return;
      const ids = new Set(t?.tasterIds || []);
      sel.innerHTML =
        `<option value="">Seleziona degustatore...</option>` +
        state.tasters.filter(x=>ids.has(x.id)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
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

function renderZenPlusDescriptors(){
      const t = getTasting();
      const tid = currentTasterId();
      const sid = selectedSampleId;
      const ev = (t && tid && sid) ? getEval(t, tid, sid) : null;
      const src = (typeof getActiveDescriptorSource==='function') ? getActiveDescriptorSource() : (state.descriptors||{});

      function renderRow(sec, mountId){
        const el = document.getElementById(mountId);
        if(!el) return;
        const all = [].concat((src[sec]&&src[sec].white)||[], (src[sec]&&src[sec].red)||[]);
        el.innerHTML = all.map(d=>{
          const selected = !!(ev && ev.data && ev.data[sec] && Array.isArray(ev.data[sec].desc) && ev.data[sec].desc.includes(d));
          return `<span class="zenplus-desc-pill ${selected?'selected':''}" onclick="zenPlusToggleDesc('${esc(sec)}','${esc(d)}', this)">${esc(d)}</span>`;
        }).join('');
      }

      renderRow('vista','zenPlusDescVista');
      renderRow('olfatto','zenPlusDescOlfatto');
      renderRow('gusto','zenPlusDescGusto');
      try{ bindZenPlusDescWheelScroll(); }catch(_e){}
    }

function evoDotsHTML(evo, cls){
      const v = Math.max(0, Math.min(5, parseInt(evo||0,10)||0));
      const k = cls ? (' '+cls) : '';
      let h = '';
      for(let i=1; i<=5; i++){
        h += '<span class="dot'+k+' '+(i<=v?'on':'')+'"></span>';
      }
      return h;
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

function applyTaxLockToSelectedSample(){
  try{
    if(isArchived()) return;
    const lock = state.ui && state.ui.taxLock ? state.ui.taxLock : null;
    if(!lock) return;
    const t = getTasting();
    if(!t || !selectedSampleId) return;

    // V138: con lock attivo, se la card ha gia' lo stesso tag lo rimuove (toggle)
    if(lock.type === 'group'){
      const s = (t.samples||[]).find(x=>String(x.id)===String(selectedSampleId));
      if(!s) return;
      const cur = String(s.groupKey||'');
      const key = String(lock.key||'');
      s.groupKey = (cur === key) ? null : key;
      saveState();
      try{ renderGroupFilterBtns(); }catch(e){}
      return;
    }

    if(lock.type === 'profile'){
      const tId = currentTasterId();
      if(!tId) return;
      const ev = getEval(t, tId, selectedSampleId);
      const cur = String(ev.profileKey||'');
      const key = String(lock.key||'');
      ev.profileKey = (cur === key) ? null : key;
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      return;
    }
  }catch(e){}
}

function bindTaxLockHandlers(){
  const els = Array.from(document.querySelectorAll('.profile-option[data-profile], .group-option[data-group]'));
  els.forEach(el=>{
    if(el.dataset.taxLockBound === '1') return;
    el.dataset.taxLockBound = '1';

    const type = el.dataset.profile ? 'profile' : 'group';
    const key = el.dataset.profile ? el.dataset.profile : el.dataset.group;

    const doSingle = ()=>{ try{ type==='profile' ? toggleProfile(String(key)) : toggleGroup(String(key)); }catch(e){} };
    const doLock = ()=>{ try{ toggleTaxLock(type, String(key)); }catch(e){} };

    el.addEventListener('pointerup', (e)=>{
      const now = Date.now();
      const last = parseInt(el.dataset.lastTapTs || '0', 10) || 0;

      if(now - last < 420){
        el.dataset.lastTapTs = '0';
        if(el.__taxSingleTimer){ clearTimeout(el.__taxSingleTimer); el.__taxSingleTimer = null; }
        try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
        doLock();
        return;
      }

      el.dataset.lastTapTs = String(now);
      if(el.__taxSingleTimer){ clearTimeout(el.__taxSingleTimer); el.__taxSingleTimer = null; }
      el.__taxSingleTimer = setTimeout(()=>{ el.__taxSingleTimer = null; doSingle(); }, 450);
    }, { passive:false });
  });
}



// V140: Reset ordine (solo degustatore selezionato) + stato pulsante
function markOrderDirty(){
  try{
    const tId = currentTasterId();
    if(!tId) return;
    const ui = getTasterUI(tId);
    ui.orderDirty = true;
    saveState();
    try{ renderSortButtons(); }catch(e){}
  }catch(e){}
}

function resetOrderForCurrentTaster(){
  try{
    const t = getTasting();
    const tId = currentTasterId();
    if(!t || !tId) return;

    // Ripristina ordine iniziale (per ID crescente) SOLO per questo degustatore
    const ord = (t.samples||[]).slice().sort((a,b)=>cmpSampleId(a.id,b.id)).map(s=>String(s.id));
    setSampleOrder(t, tId, ord);

    const ui = getTasterUI(tId);
    ui.sort = 'custom';
    ui.orderDirty = false;

    saveState();
    try{ renderSortButtons(); }catch(e){}
