// descriptors.js — P2c

function cardDescriptorsHtml(ev){
      if(!ev || !ev.data) return '';
      const a = [];
      const pushAll = (arr)=>{ (arr||[]).forEach(x=>{ if(x && !a.includes(x)) a.push(x); }); };
      pushAll(ev.data.vista?.desc);
      pushAll(ev.data.olfatto?.desc);
      pushAll(ev.data.gusto?.desc);
      if(!a.length) return '';
      const shown = a.slice(0,10);
      return `<div class="card-desc-row">` + shown.map((x,i)=>`<span class="card-desc">${esc(x)}</span>${i<shown.length-1?', ':''}`).join('') + `</div>`;
    }


    function recalc(){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId) return;
      const ev = getEval(t,tId,selectedSampleId);
      ev.progress = calcProgress(ev);
      ev.overall = calcOverall(ev);
    }

    function openModal(id){
      const el = document.getElementById(id);
      if(!el) return;
      el.style.display="block";
      el.classList.add("active");
    }
    function closeModal(id){
      const el = document.getElementById(id);
      if(!el) return;
      el.style.display="none";
      el.classList.remove("active");
    }

    function closeFiltersPanel(){
      document.getElementById("filtersPanel")?.classList.remove("active");
      document.getElementById("filtersOverlay")?.classList.remove("active");
    }
    function openFiltersPanel(){
      const okPage = document.getElementById("page-degustazione")?.classList.contains("active");
      const okZen = document.body.classList.contains("zenplus") || document.body.classList.contains("zen");
      if(!(okPage || okZen)) return;
      document.getElementById("filtersPanel")?.classList.add("active");
      document.getElementById("filtersOverlay")?.classList.add("active");
      try{ applyLocalCardUiPrefs(); }catch(e){}
      try{ updateHiddenButtons(); }catch(e){}
    }
    function toggleFiltersPanel(){
      const p = document.getElementById("filtersPanel");
      if(!p) return;
      if(p.classList.contains("active")) closeFiltersPanel();
      else openFiltersPanel();
    }

    // V111: apertura Filtri in ZEN+ (evita chiusura immediata e forza overlay/pannello)
    function forceOpenFiltersPanel(){
      document.getElementById("filtersPanel")?.classList.add("active");
      document.getElementById("filtersOverlay")?.classList.add("active");
    }

    function zenPlusToggleFilters(ev){
      try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){}
      const p = document.getElementById("filtersPanel");
      if(!p) return;
      if(p.classList.contains("active")) closeFiltersPanel();
      else forceOpenFiltersPanel();
    }


    function setZenUI(on){
      document.body.classList.toggle("zen", !!on);
      state.ui.zen = !!on;
      saveState();
      updateTopActions(document.querySelector(".page.active")?.id?.replace("page-","") || "preparazione");
      setTimeout(()=>{ initCanvas(); loadCanvasFromEval();
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
 }, 50);
    }
    async function toggleZen(force){
      const want = (typeof force==="boolean") ? force : !document.body.classList.contains("zen");
      if(want){
        setZenUI(true);
        try{ if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); }catch{}
      }else{
        setZenUI(false);
        try{ if(document.fullscreenElement) await document.exitFullscreen(); }catch{}
      }
    }

    // ZEN+: long-press su ZEN (senza rompere il tap normale)
    let __zenPlusLP = 0;
    let __zenPlusTriggered = false;

    function bindZenPlusLongPress(){
      const btn = document.getElementById('btnTopZen');
      if(!btn || btn.dataset.zenPlusBound) return;
      btn.dataset.zenPlusBound = '1';

      const onDown = (e)=>{
        clearTimeout(__zenPlusLP);
        __zenPlusTriggered = false;
        __zenPlusLP = setTimeout(()=>{ __zenPlusTriggered = true; toggleZenPlus(true); }, 650);
      };
      const onUp = ()=>{ clearTimeout(__zenPlusLP); };
      const onClickCapture = (e)=>{
        // Se è stato un long-press, blocca il click (che altrimenti attiverebbe anche ZEN)
        if(__zenPlusTriggered){
          try{ e.preventDefault(); e.stopPropagation(); }catch(err){}
          __zenPlusTriggered = false;
        }
      };

      btn.addEventListener('pointerdown', onDown, {passive:true, capture:true});
      btn.addEventListener('touchstart', onDown, {passive:true, capture:true});
      btn.addEventListener('pointerup', onUp, {passive:true, capture:true});
      btn.addEventListener('touchend', onUp, {passive:true, capture:true});
      btn.addEventListener('pointercancel', onUp, {passive:true, capture:true});
      btn.addEventListener('touchcancel', onUp, {passive:true, capture:true});
      btn.addEventListener('pointerleave', onUp, {passive:true, capture:true});
      btn.addEventListener('touchmove', onUp, {passive:true, capture:true});
      btn.addEventListener('click', onClickCapture, {passive:false, capture:true});
    }

    const __zenPlusMoved = {};
    function __zenPlusMove(elId, targetId){
      const el = document.getElementById(elId);
      const target = document.getElementById(targetId);
      if(!el || !target) return;
      if(__zenPlusMoved[elId]) return;
      __zenPlusMoved[elId] = { parent: el.parentNode, next: el.nextSibling };
      target.appendChild(el);
    }
    function __zenPlusRestore(elId){
      const m = __zenPlusMoved[elId];
      if(!m) return;
      const el = document.getElementById(elId);
      if(!el || !m.parent) return;
      if(m.next) m.parent.insertBefore(el, m.next);
      else m.parent.appendChild(el);
      delete __zenPlusMoved[elId];
    }

    function bindZenPlusDescWheelScroll(){
      const lists = document.querySelectorAll('.zenplus-desc-list');
      lists.forEach(el=>{
        if(el.dataset.wheelBound==='1') return;
        el.dataset.wheelBound='1';

        let velocity = 0;
        let animFrame = null;

        const applyMomentum = () => {
          if(Math.abs(velocity) < 0.5){
            velocity = 0;
            animFrame = null;
            return;
          }
          el.scrollLeft += velocity;
          velocity *= 0.92;
          animFrame = requestAnimationFrame(applyMomentum);
        };

        el.addEventListener('wheel', (e)=>{
          if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
            const delta = e.deltaY;
            if(animFrame){
              cancelAnimationFrame(animFrame);
              animFrame = null;
            }
            el.scrollLeft += delta * 0.8;
            velocity = delta * 0.6;
            if(Math.abs(velocity) > 1){
              animFrame = requestAnimationFrame(applyMomentum);
            }
            try{ e.preventDefault(); }catch(err){}
          }
        }, {passive:false});
      });
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

    function toggleZenPlus(on){
      const overlay = document.getElementById('zenPlusOverlay');
      if(!overlay) return;
      const enable = (on===undefined) ? !document.body.classList.contains('zenplus') : !!on;

      // V183: Previeni uscita immediata se attivato via longpress
      if(enable && window.__zenPlusActivating) return;
      if(!enable && window.__zenPlusJustActivated) {
        console.log('⚠️ V183: Blocco uscita immediata ZEN+ (longpress protection)');
        return;
      }

      if(enable){
        // V183: Imposta flag di protezione
        window.__zenPlusActivating = true;
        window.__zenPlusJustActivated = true;
        
        document.body.classList.add('zenplus');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden','false');

        __zenPlusMove('productsStrip','zenPlusTop');
        __zenPlusMove('samplesGrid','zenPlusTop');
        try{ renderProductsStrip(); }catch(e){}
        try{ updateHiddenButtons(); }catch(e){}
        __zenPlusMove('profileOptions','zenPlusProfilesSlot');
        __zenPlusMove('groupOptions','zenPlusGroupsSlot');

        try{ syncCardColorModeUI(); }catch(e){} // V143
        renderZenPlusDescriptors();
        
        // V183: Rimuovi protezione dopo 800ms (tempo sufficiente per rilasciare il dito)
        setTimeout(function() {
          window.__zenPlusActivating = false;
        }, 100);
        setTimeout(function() {
          window.__zenPlusJustActivated = false;
          console.log('✅ V183: ZEN+ protection disattivata');
        }, 800);
      }else{
        document.body.classList.remove('zenplus');
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden','true');

        __zenPlusRestore('samplesGrid');
        __zenPlusRestore('productsStrip');
        try{ renderProductsStrip(); }catch(e){}
        try{ updateHiddenButtons(); }catch(e){}
        __zenPlusRestore('profileOptions');
        __zenPlusRestore('groupOptions');
      }
    }

    // Aggiorna descrittori in ZEN+ quando cambia campione
    // V192: Also refresh widget notes
    (function(){
      const _sel = selectSample;
      selectSample = function(sampleId){
        _sel(sampleId);
        try{ if(document.body.classList.contains('zenplus')) renderZenPlusDescriptors(); }catch(e){}
        // V192: Refresh widget notes when sample changes
        try{ if(typeof refreshWidgetNotes === 'function') refreshWidgetNotes(); }catch(e){}
      };
    })();

    setTimeout(bindZenPlusLongPress, 0);

    document.addEventListener("fullscreenchange", ()=>{
      const fs = !!document.fullscreenElement;
      if(document.body.classList.contains("zen") && !fs) setZenUI(false);
    });

    function updateTopActions(pageId){
      const t = getTasting();
      const isDeg = pageId==="degustazione";
      const btnF = document.getElementById("btnTopFilters");
      const btnT = document.getElementById("btnTopFinish");
      const btnZ = document.getElementById("btnTopZen");
      if(btnF) btnF.disabled = !isDeg || !t;
      if(btnT) btnT.disabled = !isDeg || !t || isArchived();
      if(btnZ) btnZ.disabled = !isDeg || !t;

      const zenBar = document.getElementById("zenBar");
      if(zenBar) zenBar.style.display = (document.body.classList.contains("zen") && isDeg) ? "flex" : "none";
      if(!isDeg) closeFiltersPanel();
    }

    function go(pageId, btnEl){
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      document.querySelectorAll(".menu-btn").forEach(b=>b.classList.remove("active"));
      document.getElementById("page-"+pageId)?.classList.add("active");
      btnEl?.classList.add("active");

      updateTopActions(pageId);

      if(pageId==="degustazione"){ setTimeout(()=>{ initCanvas(); renderTastingPage(); }, 0); }
      if(pageId==="preparazione"){ renderPreparation(); }
      if(pageId==="anagrafiche"){ renderAnagrafiche(); }
      if(pageId==="archivio"){ renderArchive(); }
      if(pageId==="risultati"){ renderResultsSelect(); renderResultsTable(); }
    }

    function disableInputs(disabled){
      document.querySelectorAll("#page-degustazione input[type=range]").forEach(el=>el.disabled = disabled);
      document.querySelectorAll("#page-degustazione .profile-option, #page-degustazione .group-option, #page-degustazione .desc-pill, #page-degustazione .tool-btn, #page-degustazione .dot, #page-degustazione .fav-heart")
        .forEach(el=>{
          el.style.pointerEvents = disabled ? "none" : "auto";
          el.style.opacity = disabled ? "0.65" : "1";
        });
      const sel = document.getElementById("tasterSelect");
      if(sel) sel.disabled = false;
    }

    function currentTasterId(){
      const v = document.getElementById("tasterSelect")?.value;
      const id = parseIntSafe(v,0);
      return id ? id : null;
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
    function onSelectTaster(){
      state.currentTaster = currentTasterId();
      try{ syncCardColorModeUI(); }catch(e){}
      saveState({skipCloud:true});
      renderGrid();
      updateDetail();
      loadCanvasFromEval();
      try{ updateHiddenButtons(); }catch(e){}
      try{ applyLocalCardUiPrefs(); }catch(e){}
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

      disableInputs(isArchived() || !currentTasterId());
    }

    function eligibleForReorder(){
      const tId = currentTasterId();
      if(!tId) return false;
      const ui = getTasterUI(tId);
      return ui.filterProfile==="tutti" && ui.filterGroup==="tutti";
    }
    function setFilterProfile(profileKey, btnEl){
      const tId = currentTasterId(); if(!tId) return; const ui = getTasterUI(tId); ui.filterProfile = profileKey;
      saveState();
      document.querySelectorAll("#profileFilterBtns .filter-btn").forEach(b=>b.classList.remove("active"));
      btnEl?.classList.add("active");
      renderGrid(); updateDetail();
    }
    function setFilterGroup(groupKey, btnEl){
      const tId = currentTasterId(); if(!tId) return; const ui = getTasterUI(tId); ui.filterGroup = groupKey;
      saveState();
      document.querySelectorAll("#groupFilterBtns .filter-btn").forEach(b=>b.classList.remove("active"));
      btnEl?.classList.add("active");
      renderGrid(); updateDetail();
    }
    function setSort(kind, btnEl){
      const tId = currentTasterId();
      if(!tId) return;
      const ui = getTasterUI(tId);

      // V148: Reset e' un'azione, non un ordinamento persistente
      if(kind === 'reset'){
        if(!ui.orderDirty) return;
        resetOrderForCurrentTaster();
        return;
      }

      // V148: ordinamenti NON vincolanti => generano un ordine custom iniziale ma permettono drag&drop
      if(kind === 'group' || kind === 'profile' || kind === 'evolution'){
        const t = getTasting();
        if(!t) return;

        let list = (t.samples||[]).slice();
        try{ list = list.filter(s=>!isSampleHidden(t.id, s.id)); }catch(e){}

        if(kind === 'group'){
          const ord={};
          try{ groupsForTasting(t).forEach((g,i)=>ord[g.key]=i+1); }catch(e){}
          list.sort((a,b)=> (ord[a.groupKey]??9999) - (ord[b.groupKey]??9999) || cmpSampleId(a.id,b.id));
        }

        if(kind === 'profile'){
          const ord={};
          try{ profilesForTasting(t).forEach((p,i)=>ord[p.key]=i+1); }catch(e){}
          list.sort((a,b)=>{
            const ea = getEval(t,tId,a.id), eb = getEval(t,tId,b.id);
            return (ord[ea.profileKey]??9999) - (ord[eb.profileKey]??9999) || cmpSampleId(a.id,b.id);
          });
        }

        if(kind === 'evolution'){
          list.sort((a,b)=>{
            const ea = getEval(t,tId,a.id), eb = getEval(t,tId,b.id);
            return ( (eb.evolution||0) - (ea.evolution||0) ) || cmpSampleId(a.id,b.id);
          });
        }

        const order = list.map(s=>String(s.id));
        try{ setSampleOrder(t, tId, order); }catch(e){}

        ui.sort = 'custom';
        ui.orderDirty = true;
        saveState();
        try{ renderSortButtons(); }catch(e){}
        renderGrid();
        return;
      }

      ui.sort = kind;
      saveState();
      document.querySelectorAll("#sortBtnsWrap .sort-btn").forEach(b=>b.classList.remove("active"));
      btnEl?.classList.add("active");
      renderGrid();
    }
    function renderSortButtons(){
      const wrap = document.getElementById("sortBtnsWrap");
      if(!wrap) return;
      const tId = currentTasterId();
      const ui = tId ? getTasterUI(tId) : { sort: 'custom' };
      const current = ui.sort || "custom";
      const resetDisabled = !(tId && ui && ui.orderDirty);
      const btn=(key,label,disabled)=>`<button class="sort-btn ${current===key?"active":""} ${disabled?"disabled":""}" onclick="setSort('${esc(key)}', this)" ${disabled?"disabled":""}>${esc(label)}</button>`;
      wrap.innerHTML = btn("custom","Ordine",false) + btn("group","Gruppo",false) + btn("profile","Profilo",false) + btn("evolution","Evoluzione",false) + btn("reset","Reset",resetDisabled);
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

