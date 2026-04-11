// profiles.js — P2c

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

function attachProfileRenameLongPress(){
      const wrap = document.getElementById("profileOptions");
      if(!wrap || wrap.dataset.lpAttached) return;
      wrap.dataset.lpAttached = "1";

      let timer = null;
      const start = (el) => {
         if(!el || el.innerText.includes("Nuovo")) return;
         timer = setTimeout(() => {
             timer = null;
             const key = el.dataset.profile;
             openProfileEditModal(key);
         }, 800);
      };
      const clear = () => { if(timer) { clearTimeout(timer); timer = null; } };

      wrap.addEventListener("mousedown", (e) => start(e.target.closest(".profile-option")));
      wrap.addEventListener("mouseup", clear);
      wrap.addEventListener("mouseleave", clear);

      wrap.addEventListener("touchstart", (e) => {
         start(e.target.closest(".profile-option"));
      }, {passive:true});
      wrap.addEventListener("touchend", clear);
      wrap.addEventListener("touchmove", clear);

      wrap.addEventListener("contextmenu", (e) => {
         const el = e.target.closest(".profile-option");
         if(el && !el.innerText.includes("Nuovo")){
            e.preventDefault();
            e.stopPropagation();
            return false;
         }
      });
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
    function renderGroupOptions(){
      const wrap = document.getElementById("groupOptions");
      const t = getTasting();
      if(!wrap || !t) return;
      const lock = (state.ui && state.ui.taxLock) ? state.ui.taxLock : null;
      const groups = groupsForTasting(t);
      const listHtml = groups.map(g=>{
        const locked = !!(lock && lock.type==='group' && String(lock.key)===String(g.key));
        return `
        <div class="group-option${locked?' locked':''}" data-group="${esc(g.key)}" style="border-left:8px solid #${esc(g.color)};background:${hexToRgba(g.color,0.1)}">
          <span class="group-swatch" style="background:#${esc(g.color)}"></span>
          <span class="group-label" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(g.label)}${locked?' <span class=\"lock-ico\">🔒</span>':''}</span>
        </div>
      `;
      }).join("");
      const addBtn = `<div class="group-option" onclick="addNewLocalGroup()" style="border:1px dashed #ccc;background:#f9f9f9;justify-content:center;color:#666;cursor:pointer;">+ Nuovo</div>`;
      wrap.innerHTML = listHtml + addBtn;
      attachGroupRenameLongPress();
      try{ bindTaxLockHandlers(); }catch(e){}
    }

    function attachGroupRenameLongPress(){
      const wrap = document.getElementById("groupOptions");
      if(!wrap || wrap.dataset.lpAttached) return;
      wrap.dataset.lpAttached = "1";

      let timer = null;
      const start = (el) => {
         if(!el || el.innerText.includes("Nuovo")) return;
         timer = setTimeout(() => {
             timer = null;
             const key = el.dataset.group;
             openGroupEditModal(key);
         }, 800);
      };
      const clear = () => { if(timer) { clearTimeout(timer); timer = null; } };

      wrap.addEventListener("mousedown", (e) => start(e.target.closest(".group-option")));
      wrap.addEventListener("mouseup", clear);
      wrap.addEventListener("mouseleave", clear);

      wrap.addEventListener("touchstart", (e) => {
         start(e.target.closest(".group-option"));
      }, {passive:true});
      wrap.addEventListener("touchend", clear);
      wrap.addEventListener("touchmove", clear);

      wrap.addEventListener("contextmenu", (e) => {
         const el = e.target.closest(".group-option");
         if(el && !el.innerText.includes("Nuovo")){
            e.preventDefault();
            e.stopPropagation();
            return false;
         }
      });
    }

    function ensureTastingDescriptors(t){
      if(!t) return null;
      if(!t.descriptors){
        t.descriptors = JSON.parse(JSON.stringify(state.descriptors || {vista:{white:[],red:[]},olfatto:{white:[],red:[]},gusto:{white:[],red:[]}}));
      }
      ['vista','olfatto','gusto'].forEach(sec=>{
        if(!t.descriptors[sec]) t.descriptors[sec] = {white:[], red:[]};
        if(!Array.isArray(t.descriptors[sec].white)) t.descriptors[sec].white = [];
        if(!Array.isArray(t.descriptors[sec].red)) t.descriptors[sec].red = [];
      });
      return t.descriptors;
    }

    function getActiveDescriptorSource(){
      const t = getTasting();
      if(t && t.descriptors) return t.descriptors;
      return state.descriptors;
    }

    function addTastingDescriptor(sec, color){
      try{
        const t = getTasting();
        if(!t) return;
        const store = ensureTastingDescriptors(t);
        const label = prompt('Nuovo descrittore ('+sec+' / '+(color==='white'?'Bianchi':'Rossi')+'):', '');
        if(label==null) return;
        const v = String(label||'').trim();
        if(!v) return;
        const arr = (store[sec] && store[sec][color]) ? store[sec][color] : [];
        if(arr.includes(v)) return;
        arr.push(v);
        try{ arr.sort((a,b)=>String(a).localeCompare(String(b),'it')); }catch(e){}
        store[sec][color] = arr;
        saveState({skipCloud:true});
        renderDescriptorPickers();
      }catch(e){ console.error(e); }
    }

    function addTastingDescriptorQuick(sec){
      // No conferma: aggiunge nella lista Bianchi (default) e ricarica ZEN+
      addTastingDescriptor(sec, 'white');
      try{ if(document.body.classList.contains('zenplus')) setTimeout(renderZenPlusDescriptors,0); }catch(e){}
    }

    function zenPlusToggleDesc(sec, d, el){
      toggleDesc(sec, d, el);
      try{ if(document.body.classList.contains('zenplus')) setTimeout(renderZenPlusDescriptors,0); }catch(e){}
    }


    function renderDescriptorPickers(){
      ["vista","olfatto","gusto"].forEach(sec=>{
        const el = document.getElementById("pick"+sec);
        if(!el) return;
        const src = getActiveDescriptorSource();
        const w = (src[sec] && src[sec].white) ? src[sec].white : [];
        const r = (src[sec] && src[sec].red) ? src[sec].red : [];
        el.innerHTML = `
          <div>
            <div class="desc-col-title">Bianchi <span class="muted" style="font-weight:800;cursor:pointer" onclick="addTastingDescriptor('${esc(sec)}','white')">+ aggiungi</span></div>
            <div class="desc-list">${w.map(d=>`<div class="desc-pill" data-sec="${esc(sec)}" data-desc="${esc(d)}" onclick="toggleDesc('${esc(sec)}','${esc(d)}', this)">${esc(d)}</div>`).join("")}</div>
          </div>
          <div>
            <div class="desc-col-title">Rossi <span class="muted" style="font-weight:800;cursor:pointer" onclick="addTastingDescriptor('${esc(sec)}','red')">+ aggiungi</span></div>
            <div class="desc-list">${r.map(d=>`<div class="desc-pill" data-sec="${esc(sec)}" data-desc="${esc(d)}" onclick="toggleDesc('${esc(sec)}','${esc(d)}', this)">${esc(d)}</div>`).join("")}</div>
          </div>
        `;
      });
    }

    let selectedSampleId = null;

    function renderTastingPage(){
      const t = getTasting();
      renderSortButtons();
      renderProfileFilterBtns();
      renderGroupFilterBtns();
      renderProfileOptions();
      renderDescriptorPickers();
      hydrateTasterSelect();

      try{
        const sel = document.getElementById("tasterSelect");
        const t0 = getTasting();
        if(sel && t0){
          const ok = (t0.tasterIds || []).map(x=>String(x));
          if(state.currentTaster && ok.includes(String(state.currentTaster))) sel.value = String(state.currentTaster);
        }
      }catch{}

      const ro = !!t && isArchived();
      const b = document.getElementById("readonlyBanner");
      if(b) b.style.display = ro ? "block" : "none";

      const blindBtn = document.getElementById("btnBlindInfo");
      if(blindBtn) blindBtn.style.display = (t && t.mode==="cieca") ? "inline-block" : "none";

      if(!t){
        document.getElementById("headerTitle").textContent = "Degustazione: seleziona o crea in Preparazione";
        document.getElementById("samplesGrid").innerHTML = `<div class="muted" style="padding:10px;">Nessuna degustazione selezionata.</div>`;
        selectedSampleId = null;
        renderProductsStrip();
        updateDetail();
        disableInputs(true);
        return;
      }

      document.getElementById("headerTitle").textContent =
        t.title + " — " + (t.mode==="cieca" ? "Alla cieca" : "Scoperta") + (ro ? " (Sola lettura)" : "");

      renderGroupOptions();
      renderProductsStrip();
      renderGrid();
      updateDetail();

      disableInputs(isArchived() || !currentTasterId());

      if(state.ui.zen) setZenUI(true);
    }

    function assignBlindProduct(pid){
      if(isArchived()) return;
      const t = getTasting();
      if(!t || t.mode!=="cieca") return;
      if(!selectedSampleId){ toast("Seleziona prima un campione"); return; }
      const sid = String(selectedSampleId);
      if(t.blindMap && t.blindMap[sid] === String(pid)){ toast("Già assegnato a questo campione"); return; }
      const usedBy = Object.entries(t.blindMap||{}).find(([k,v])=> String(v)===String(pid) && String(k)!==sid);
      if(usedBy){ toast("Prodotto già assegnato al campione " + usedBy[0]); return; }
      if(!t.blindMap) t.blindMap = {};
      t.blindMap[sid] = String(pid);
      saveState();
      renderProductsStrip(); renderGrid(); updateDetail(); toast("Prodotto associato");
    }
    

    // ========= Blind mode: Product DnD + Assign/Dissociate (robust) =========
    function getActiveBlindTasting(){
      const t = getTasting();
      if(!t || t.mode!=="cieca") return null;
      return t;
    }

    window.assignProductToSample = function(pid, sid){
      if(isArchived()) return;
      const t = getActiveBlindTasting();
      if(!t) return;
      if(!t.blindMap) t.blindMap = {};

      const sPid = String(pid);
      const sSid = String(sid);

      // If product already assigned elsewhere, ask to move
      const ownerSid = Object.keys(t.blindMap).find(k => String(t.blindMap[k]) === sPid);
      if(ownerSid && ownerSid !== sSid){
        if(!confirm(`Questo prodotto è assegnato al campione ${ownerSid}. Spostarlo sul campione ${sSid}?`)) return;
        delete t.blindMap[ownerSid];
      }

      t.blindMap[sSid] = sPid;
      saveState({skipCloud:true});
      try{ window.queueBlindSync && window.queueBlindSync(t.id, sSid, sPid); }catch(e){}
      try{ updateBlindCardTag(sSid); }catch(e){}
      renderProductsStrip();
      updateDetail();
            // V103J: aggiorna subito UI locale
      try{ renderGrid(); }catch(e){}
      try{ updateDetail(); }catch(e){}
      try{ updateHiddenButtons(); }catch(e){}
      try{ if(document.body.classList.contains('zenplus')) renderZenPlusDescriptors(); }catch(e){}
      toast("✓ Assegnato");
    };

    window.dissociateBlindSample = function(sid){
      if(isArchived()) return;
      const t = getActiveBlindTasting();
      if(!t || !t.blindMap) return;
      const sSid = String(sid);
      if(!t.blindMap[sSid]) return;
      delete t.blindMap[sSid];
      saveState({skipCloud:true});
      try{ window.queueBlindSync && window.queueBlindSync(t.id, sSid, null); }catch(e){}
      try{ updateBlindCardTag(sSid); }catch(e){}
      renderProductsStrip();
      updateDetail();
      toast("✓ Dissociato");
    };

    window.handleProductDragStart = function(e){
      const pid = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.pid : null;
      if(!pid) return;
      e.dataTransfer.setData("text/plain", "PID:"+pid);
      e.dataTransfer.effectAllowed = "move";
      try{ e.currentTarget.style.opacity = "0.55"; }catch(_e){}
    };

    window.handleProductDragEnd = function(e){
      try{ e.currentTarget.style.opacity = "1"; }catch(_e){}
    };

    window.handleSampleDragOver = function(e){
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };

    window.handleSampleDrop = function(e){
      e.preventDefault();
      e.stopPropagation();
      let raw = e.dataTransfer.getData("text/plain") || "";
      if(raw.startsWith("SID:")) return;
      const pid = raw.startsWith("PID:") ? raw.slice(4) : raw;
      const sid = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.sampleid : null;
      if(!pid || !sid) return;
      window.assignProductToSample(pid, sid);
    };
