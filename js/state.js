// state.js P2

function uid(){ return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10); }

function nowIso(){ return new Date().toISOString(); }

function fmtDateIT(iso){
  try{
    if(!iso) return '';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const wd = ['dom','lun','mar','mer','gio','ven','sab'][d.getDay()] || '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${wd} ${dd}/${mm}/${yyyy}`;
  }catch(e){ return ''; }
}

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function esc(s){
      return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

function fmtSampleId(id){
      const s = String(id ?? "").trim();
      if(/^\d+$/.test(s)) return s.padStart(2,"0");
      return s;
    }

function cmpSampleId(a,b){
      return String(a ?? "").localeCompare(String(b ?? ""), "it", {numeric:true, sensitivity:"base"});
    }

function toast(msg){
      const t = document.getElementById("toast");
      if(!t) return;
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 1600);
    }

function parseIntSafe(v, def=0){
      const n = parseInt(String(v ?? "").trim(), 10);
      return Number.isFinite(n) ? n : def;
    }

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function slugify(s){
      return String(s ?? "").trim().toLowerCase()
        .replace(/\s+/g,"-")
        .replace(/[^a-z0-9-]/g,"")
        .replace(/-+/g,"-");
    }

function safeCssEscape(s){
      try{ return CSS.escape(String(s)); }catch{ return String(s).replaceAll('"','\"'); }
    }

function hexToRgba(hex, alpha){
      const h = String(hex).trim().replace("#","");
      if(!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(0,0,0,${alpha})`;
      const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

function hexToRgbParts(hex){
      const h = String(hex).trim().replace("#","");
      if(!/^[0-9a-fA-F]{6}$/.test(h)) return {r:0,g:0,b:0};
      return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)};
    }

function downloadBlob(filename, text, mime="text/plain"){
      const blob = new Blob([text], {type:mime});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=filename;
      document.body.appendChild(a);
      a.click(); a.remove();
      URL.revokeObjectURL(url);
    }

function blankEval(){
      return {
        profileKey:null,
        evolution:0,
        favourite:false,
        overall:0,
        progress:0,
        data:{
          vista:{intensita:0, limpidezza:0, desc:[], canvas:null},
          olfatto:{intensita:0, complessita:0, desc:[]},
          gusto:{corpo:0, acidita:0, persistenza:0, desc:[]},
        }
      };
    }

function isBlankEval(ev){
      try{
        if(!ev) return true;
        // V150: se ha updatedAt, è stata modificata intenzionalmente, NON è blank
        if(ev.updatedAt) return false;
        if(ev.profileKey) return false;
        if((parseInt(ev.evolution||0,10)||0) > 0) return false;
        if(!!ev.favourite) return false;

        const v = ev.data?.vista || {};
        const o = ev.data?.olfatto || {};
        const g = ev.data?.gusto || {};

        const sliders = [v.intensita, v.limpidezza, o.intensita, o.complessita, g.corpo, g.acidita, g.persistenza];
        if(sliders.some(x => (parseInt(x||0,10)||0) > 0)) return false;

        if((v.desc||[]).length) return false;
        if((o.desc||[]).length) return false;
        if((g.desc||[]).length) return false;

        return true;
      }catch(e){ return false; }
    }

const stableStringify = (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k,v)=>{
      if(v && typeof v==='object'){
        if(seen.has(v)) return;
        seen.add(v);
        if(Array.isArray(v)) return v;
        const out={};
        Object.keys(v).sort().forEach(key=>out[key]=v[key]);
        return out;
      }
      return v;
    });
  }

function getTasting(){
      return state.tastings.find(t=>t.id===state.currentTastingId) || null;
    }

function isArchived(){
      const t = getTasting();
      return !!t && t.status==="archiviata";
    }

function getEval(tasting, tasterId, sampleId){
      tasting.evaluations = tasting.evaluations || {};
      tasting.evaluations[tasterId] = tasting.evaluations[tasterId] || {};
      if(!tasting.evaluations[tasterId][sampleId]) tasting.evaluations[tasterId][sampleId] = blankEval();
      return tasting.evaluations[tasterId][sampleId];
    }

function calcProgress(ev){
      let total=0, filled=0;
      const sliders = [
        ev.data.vista.intensita, ev.data.vista.limpidezza,
        ev.data.olfatto.intensita, ev.data.olfatto.complessita,
        ev.data.gusto.corpo, ev.data.gusto.acidita, ev.data.gusto.persistenza
      ];
      sliders.forEach(v=>{
        total++;
        if((v ?? 0) > 0) filled++;
      });
      total++; if(ev.profileKey) filled++;
      total++; if((ev.evolution ?? 0) > 0) filled++;
      total+=3;
      if(ev.data.vista.desc.length) filled++;
      if(ev.data.olfatto.desc.length) filled++;
      if(ev.data.gusto.desc.length) filled++;
      return Math.round((filled / Math.max(1,total))*100);
    }

function calcOverall(ev){
      const sliders = [
        ev.data.vista.intensita, ev.data.vista.limpidezza,
        ev.data.olfatto.intensita, ev.data.olfatto.complessita,
        ev.data.gusto.corpo, ev.data.gusto.acidita, ev.data.gusto.persistenza
      ];
      const avg = sliders.reduce((a,b)=>a+(b ?? 0),0) / sliders.length;
      const bonus = (ev.profileKey ? 0.35 : 0) + ((ev.evolution ?? 0) > 0 ? 0.35 : 0) +
        ((ev.data.vista.desc.length || ev.data.olfatto.desc.length || ev.data.gusto.desc.length) ? 0.2 : 0);
      return Math.round(clamp(avg + bonus, 0, 5) * 10) / 10;
    }

function currentTasterId(){
      const v = document.getElementById("tasterSelect")?.value;
      const id = parseIntSafe(v,0);
      return id ? id : null;
    }

function getTasterUI(tasterId){
      if(!tasterId) return { filterProfile:'tutti', filterGroup:'tutti', sort:'custom' };
      if(!state.ui.tasters) state.ui.tasters = {};
      const tid = String(tasterId);
      if(!state.ui.tasters[tid]) state.ui.tasters[tid] = { filterProfile:'tutti', filterGroup:'tutti', sort:'custom' };
      return state.ui.tasters[tid];
    }

function groupsForTasting(t){
      if(!t) return state.groups;
      // Gruppi sempre locali alla degustazione: se mancano, clona dall'anagrafica una sola volta.
      const changed = ensureTastingTaxonomies(t);
      if(changed) try{ saveState(true); }catch(_e){}
      return t.groups || [];
    }
    function groupDef(t, key){ return groupsForTasting(t).find(g=>g.key===key); }
    function profileDef(t, key){ return profilesForTasting(t).find(p=>p.key===key); }
    function productById(t,pid){
      if(!t || !Array.isArray(t.products)) return null;
      return t.products.find(p=>String(p.id)===String(pid)) || null;
    }

    function getTasterUI(tasterId){
      if(!tasterId) return { filterProfile:'tutti', filterGroup:'tutti', sort:'custom' };
      if(!state.ui.tasters) state.ui.tasters = {};
      const tid = String(tasterId);
      if(!state.ui.tasters[tid]) state.ui.tasters[tid] = { filterProfile:'tutti', filterGroup:'tutti', sort:'custom' };
      return state.ui.tasters[tid];
    }

    function getEval(tasting, tasterId, sampleId){
      tasting.evaluations = tasting.evaluations || {};
      tasting.evaluations[tasterId] = tasting.evaluations[tasterId] || {};
      if(!tasting.evaluations[tasterId][sampleId]) tasting.evaluations[tasterId][sampleId] = blankEval();
      return tasting.evaluations[tasterId][sampleId];
    }
    function calcProgress(ev){
      let total=0, filled=0;
      const sliders = [
        ev.data.vista.intensita, ev.data.vista.limpidezza,
        ev.data.olfatto.intensita, ev.data.olfatto.complessita,
        ev.data.gusto.corpo, ev.data.gusto.acidita, ev.data.gusto.persistenza
      ];
      sliders.forEach(v=>{
        total++;
        if((v ?? 0) > 0) filled++;
      });
      total++; if(ev.profileKey) filled++;
      total++; if((ev.evolution ?? 0) > 0) filled++;
      total+=3;
      if(ev.data.vista.desc.length) filled++;
      if(ev.data.olfatto.desc.length) filled++;
      if(ev.data.gusto.desc.length) filled++;
      return Math.round((filled / Math.max(1,total))*100);
    }
    function calcOverall(ev){
      const sliders = [
        ev.data.vista.intensita, ev.data.vista.limpidezza,
        ev.data.olfatto.intensita, ev.data.olfatto.complessita,
        ev.data.gusto.corpo, ev.data.gusto.acidita, ev.data.gusto.persistenza
      ];
      const avg = sliders.reduce((a,b)=>a+(b ?? 0),0) / sliders.length;
      const bonus = (ev.profileKey ? 0.35 : 0) + ((ev.evolution ?? 0) > 0 ? 0.35 : 0) +
        ((ev.data.vista.desc.length || ev.data.olfatto.desc.length || ev.data.gusto.desc.length) ? 0.2 : 0);
      return Math.round(clamp(avg + bonus, 0, 5) * 10) / 10;
    }
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

function setNpToolPen() { /* V194: Legacy - use Fabric.js */ }
function setNpToolEraser() { /* V194: Legacy - use Fabric.js */ }
function clearNotePanelCanvas() { /* V194: Legacy - use Fabric.js */ }
function openCanvasNotePanel() { 
  // V194: Redirect to Fabric.js notes
  if (typeof openFabricNotes === 'function') openFabricNotes();
}
function closeCanvasNotePanel() { /* V194: Legacy - use Fabric.js */ }
function setupNotePanelCanvasDrawing() { /* V194: Legacy - use Fabric.js */ }
function setA4Tool() { /* V194: Legacy */ }
function clearA4Canvas() { /* V194: Legacy */ }
function closeA4Overlay() { /* V194: Legacy */ }


function initCanvas(){
      canvas = document.getElementById("drawingCanvas");
      if(!canvas) return;
      const parent = canvas.parentElement;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasDpr = dpr;

      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";

      ctx = canvas.getContext("2d", { desynchronized: true });
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#111";
      ctx.globalCompositeOperation = "source-over";

      if(!canvas.dataset.bound){
        const EVT_OPTS = { passive:false, capture:true };
        canvas.dataset.bound = "1";
        canvas.style.touchAction = 'none';
        canvas.addEventListener("pointerdown", onCanvasDown, EVT_OPTS);
        canvas.addEventListener("pointermove", onCanvasMove, EVT_OPTS);
        canvas.addEventListener("pointerup", onCanvasUp, EVT_OPTS);
        canvas.addEventListener("pointercancel", onCanvasUp, EVT_OPTS);
        canvas.addEventListener("pointerleave", onCanvasUp, EVT_OPTS);
      }
    }


    function canvasPoint(e){
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return {x,y};
    }

    // --- Apple Pencil: coalesced events + smoothing (quadratic) + pressure + rAF ---
    let __canvasActivePointerId = null;
    let __canvasLastPt = null;
    let __canvasQueue = [];
    let __canvasRaf = 0;

    function __canvasMid(a, b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
    function __canvasPressure(p){ const v=(typeof p==='number' && p>0)?p:0.5; return Math.max(0, Math.min(1,v)); }
    function __canvasPenWidth(p){ const base=0.9, gain=2.1; const w=base+(__canvasPressure(p)*gain); return Math.max(0.8, Math.min(3.2,w)); }

    function __canvasEnqueuePoint(x,y,pressure){
      __canvasQueue.push({x:x,y:y,p:pressure});
      if(!__canvasRaf) __canvasRaf = requestAnimationFrame(__canvasFlushQueue);
    }

    function __canvasRestoreFromDataUrl(dataUrl){
      try{
        if(!dataUrl) return;
        if(typeof clearCanvasVisualOnly==='function') clearCanvasVisualOnly();
        const img=new Image();
        img.onload=()=>{ try{ ctx.globalCompositeOperation='source-over'; ctx.drawImage(img,0,0,canvas.width/(canvasDpr||1),canvas.height/(canvasDpr||1)); }catch(e){} };
        img.src=dataUrl;
      }catch(e){}
    }

    function __canvasFlushQueue(){
      __canvasRaf = 0;
      if(!state.ui.isDrawing || !canvas || !ctx){ __canvasQueue.length=0; return; }
      while(__canvasQueue.length){
        const pt=__canvasQueue.shift();
        if(!__canvasLastPt){
          __canvasLastPt={x:pt.x,y:pt.y,p:pt.p};
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          continue;
        }
        if(state.ui.canvasTool==='eraser'){
          ctx.globalCompositeOperation='destination-out';
          ctx.lineWidth=16;
        }else{
          ctx.globalCompositeOperation='source-over';
          ctx.lineWidth=__canvasPenWidth(pt.p);
        }
        const prev={x:__canvasLastPt.x,y:__canvasLastPt.y};
        const cur={x:pt.x,y:pt.y};
        const mid=__canvasMid(prev,cur);
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y);
        __canvasLastPt={x:pt.x,y:pt.y,p:pt.p};
      }
    }


    function onCanvasDown(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(isArchived() || !currentTasterId()) return;
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      __canvasActivePointerId = e.pointerId;
      try{ canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }catch(err){}

      // Snapshot dell'ultimo canvas salvato (ripristino se la gomma svuota tutto)
      try{
        const t = getTasting();
        const tid = currentTasterId();
        const sid = selectedSampleId;
        const ev = (t && tid && sid) ? getEval(t, tid, sid) : null;
        state.ui.canvasPrevDataUrl = (ev && ev.data && ev.data.vista && ev.data.vista.canvas) ? String(ev.data.vista.canvas) : null;
      }catch(err){ state.ui.canvasPrevDataUrl = null; }

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left);
      const y = (e.clientY - rect.top);
      const p = __canvasPressure(e.pressure);

      state.ui.isDrawing = true;
      __canvasQueue.length = 0;
      __canvasLastPt = null;

      ctx.beginPath();
      ctx.moveTo(x, y);
      __canvasEnqueuePoint(x, y, p);
    }


    function onCanvasMove(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(!state.ui.isDrawing) return;
      if(__canvasActivePointerId!=null && e.pointerId!==__canvasActivePointerId) return;
      if(!canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
      for(const ce of evs){
        const x = (ce.clientX - rect.left);
        const y = (ce.clientY - rect.top);
        const p = __canvasPressure(ce.pressure);
        __canvasEnqueuePoint(x, y, p);
      }
    }


    function onCanvasUp(e){
      try{ e.preventDefault(); }catch(err){}
      try{ e.stopPropagation(); }catch(err){}

      if(!state.ui.isDrawing) return;
      if(__canvasActivePointerId!=null && e.pointerId!==__canvasActivePointerId) return;

      try{ __canvasFlushQueue(); }catch(err){}

      state.ui.isDrawing = false;
      __canvasActivePointerId = null;
      try{ canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); }catch(err){}

      if(!canvas || !ctx) return;
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';

      const t = getTasting();
      const tid = currentTasterId();
      const sid = selectedSampleId;
      if(!(t && tid && sid)) return;

      const ev = getEval(t, tid, sid);
      if(!ev.data) ev.data = {};
      if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};

      setTimeout(()=>{
        try{
          const dataUrl = canvas.toDataURL('image/png');
          const prev = state.ui.canvasPrevDataUrl || null;

          // Protezione gomma: se il risultato è vuoto ripristina l'ultimo canvas valido
          if(typeof isCanvasEmptyDataUrl==='function' && isCanvasEmptyDataUrl(dataUrl)){
            if(prev && !isCanvasEmptyDataUrl(prev)){
              ev.data.vista.canvas = prev;
              __canvasRestoreFromDataUrl(prev);
            }
            return;
          }

          ev.data.vista.canvas = dataUrl;
          saveState({skipCloud:true});
          try{ window.queueCanvasSync && window.queueCanvasSync(t.id, tid, sid, ev.data.vista.canvas); }catch(e){}
        }catch(err){}
      }, 0);
    }


    function clearCanvas(){
      if(isArchived()) return;
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      clearCanvasVisualOnly();

      const t = getTasting();
      const tid = currentTasterId();
      const sid = selectedSampleId;
      if(t && tid && sid){
         const ev = getEval(t, tid, sid);
         if(!ev.data) ev.data = {};
         if(!ev.data.vista) ev.data.vista = {intensita:0, limpidezza:0, desc:[], canvas:null};
         ev.data.vista.canvas = null;
         saveState({skipCloud:true});
         try{ window.queueCanvasSync && window.queueCanvasSync(t.id, tid, sid, null); }catch(e){}
         toast("Appunti cancellati");
         setTool('pen');
      }
    }

    function clearCanvasVisualOnly(){
      if(!ctx || !canvas) return;
      ctx.clearRect(0,0, canvas.width/(canvasDpr||1), canvas.height/(canvasDpr||1));
    }

    function setTool(t, btnEl){
      state.ui.canvasTool = t;
      document.querySelectorAll('.canvas-tools .tool-btn').forEach(b=>b.classList.remove('active'));
      if(btnEl && btnEl.classList) btnEl.classList.add('active');
    }

    function loadCanvasFromEval(){
      if(!canvas || !ctx) initCanvas();
      if(!canvas || !ctx) return;

      clearCanvasVisualOnly();
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId) return;

      const ev = getEval(t,tId,selectedSampleId);
      const dataUrl = ev?.data?.vista?.canvas || null;
      if(!dataUrl) return;

      const img = new Image();
      img.onload = ()=>{
        ctx.drawImage(img, 0, 0, canvas.width/(canvasDpr||1), canvas.height/(canvasDpr||1));
      };
      img.src = dataUrl;
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
        saveState();
        renderGrid();
        updateDetail();
      });
    });
  } else if(evoPick) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
  }

    }

    function navSample(dir){
      const t = getTasting();
      if(!t) return;
      const ids = t.samples.map(s=>s.id);
      const idx = ids.findIndex(x=>String(x)===String(selectedSampleId));
      if(idx<0){ if(ids.length) selectSample(ids[0]); return; }
      const next = idx + (dir>0?1:-1);
      if(next>=0 && next<ids.length) selectSample(ids[next]);
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

    function uiSlider(sec, key, value){
      const lbl = document.getElementById("lbl"+sec+key);
      if(lbl) lbl.textContent = String(value);
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId) return;
      const ev = getEval(t,tId,selectedSampleId);
      ev.data[sec][key] = parseIntSafe(value,0);
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      renderGrid();
    }

    function toggleProfile(key){
      if(isArchived()) return;
      const t = getTasting();
      const tId = currentTasterId();
      if(!t || !tId || !selectedSampleId){ toast("Seleziona degustatore e campione"); return; }
      const ev = getEval(t,tId,selectedSampleId);
      ev.profileKey = (ev.profileKey===key) ? null : key;
      ev.updatedAt = nowIso();
      recalc();
      saveState();
      renderGrid();
      updateDetail();
    }

    function toggleGroup(groupKey){
      if(isArchived()) return;
      const t = getTasting();
      if(!t || !selectedSampleId){ toast("Seleziona un campione"); return; }
      const s = t.samples.find(x=>String(x.id)===String(selectedSampleId));
      if(!s) return;
      s.groupKey = (s.groupKey===groupKey) ? null : groupKey;
      saveState();
      renderGroupFilterBtns();
      renderGrid();
      updateDetail();
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

    function openBlindInfo(){
      renderBlindInfo();
      openModal("modalInfoBlind");
    }
    function renderBlindInfo(){
      const t = getTasting();
      const wrap = document.getElementById("blindInfoList");
      if(!wrap) return;

      if(!t || t.mode!=="cieca"){
        wrap.innerHTML = `<div class="muted">Nessuna degustazione alla cieca selezionata.</div>`;
        return;
      }

      if(!t.products || !t.products.length){
        wrap.innerHTML = `<div class="muted">Nessun prodotto.</div>`;
        return;
      }

      wrap.innerHTML = t.products.map(p=>{
        const c = cols4(p.cols);
        const main = c[0] + (c[1] ? " "+c[1] : "");
        const sub = [c[2],c[3]].filter(Boolean).join(" - ");
        return `
          <div class="list-card" style="margin:8px 0;">
            <div style="font-weight:950;color:var(--bordeaux);">${esc(main)}</div>
            <div class="muted">${esc(sub || "-")}</div>
            <div class="muted">ID prodotto: <b>${esc(p.id)}</b></div>
          </div>
        `;
      }).join("");
    }

    function renderPreparation(){
      const divAtt = document.getElementById("prep-attive");
      const divBoz = document.getElementById("prep-bozze");
      if(!divAtt || !divBoz) return;

      const attive = state.tastings.filter(t=>t.status!=="archiviata");
      const bozze = state.tastings.filter(t=>t.status==="bozza");

      const cardHtml = (t)=>`
        <div class="list-card">
          <h3>${esc(t.title)}</h3>
          <div class="meta">
            <span>${esc(t.samples.length)} campioni</span>
            <span>${esc(t.mode)}</span>
            <span>Creata: ${esc(fmtDateIT(t.createdAt))}</span>
          </div>
          <div class="row-actions">
            <button class="btn primary" onclick="openTasting('${esc(t.id)}')">Apri</button>
            <button class="btn" onclick="openEditModal('${esc(t.id)}')">Modifica</button>
            <button class="btn" onclick="copyTastingVirgin('${esc(t.id)}')">Copia</button>
            <button class="btn" onclick="deleteTasting('${esc(t.id)}')">Elimina</button>
          </div>
        </div>
      `;

      divAtt.innerHTML = attive.length ? attive.map(cardHtml).join("") : `<div class="muted">Nessuna degustazione attiva.</div>`;
      divBoz.innerHTML = bozze.length ? bozze.map(cardHtml).join("") : `<div class="muted">Nessuna bozza.</div>`;
    }

    function showPrepTab(tab, btn){
      state.ui.prepTab = tab;
      // UI-only: non salvare sul cloud
      document.querySelectorAll(".prep-tab").forEach(d=>d.style.display="none");
      document.getElementById("prep-"+tab).style.display="block";
      document.querySelectorAll("#page-preparazione .tab").forEach(b=>b.classList.remove("active"));
      if(btn) btn.classList.add("active");
      else document.querySelector(`#page-preparazione .tab[onclick*='${tab}']`)?.classList.add("active");
    }


    function openTasting(id){
      state.currentTastingId = id;
      state.currentTaster = null; 
      saveState();
      
      const t = state.tastings.find(x=>x.id===id);
      try{ if(t){ const ch = ensureTastingTaxonomies(t); if(ch) saveState({skipCloud:true}); } }catch(e){}
      
      // V183: Usa sessionStorage per il degustatore loggato dalla splash
      const activeSessionTasterId = sessionStorage.getItem('degustapp-session-taster-id');
      if (activeSessionTasterId && t) {
        const tasterIds = t.tasterIds || [];
        const activeTasterId = parseInt(activeSessionTasterId, 10);
        // Verifica che il degustatore attivo sia tra quelli della degustazione
        if (tasterIds.includes(activeTasterId)) {
          state.currentTaster = activeTasterId;
          saveState();
          console.log('👤 V183 Bypass modale: degustatore sessione attivo', activeTasterId);
          go("degustazione", document.getElementById("btnMenuDeg"));
          return;
        }
        // Se il degustatore non è nella lista, mostra comunque il modale
        console.log('⚠️ Degustatore sessione non nella lista degustazione, mostro modale');
      }
      
      // Altrimenti mostra il modale normale
      openModal("modalPickTaster");
      const sel = document.getElementById("modalPickTasterSelect");
      if(!sel || !t) return;
      const ids = new Set(t.tasterIds || []);
      sel.innerHTML = `<option value="">Seleziona...</option>` +
        state.tasters.filter(x=>ids.has(x.id)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
    }

    function confirmPickTasterAndOpen(){
      const sel = document.getElementById("modalPickTasterSelect");
      const id = parseIntSafe(sel.value, 0);
      if(!id){ toast("Seleziona un degustatore"); return; }
      state.currentTaster = id;
      saveState();
      closeModal("modalPickTaster");
      go("degustazione", document.getElementById("btnMenuDeg"));
    }

    function deleteTasting(id){
      if(!confirm("Eliminare questa degustazione?")) return;
      state.tastings = state.tastings.filter(t=>t.id!==id);
      if(state.currentTastingId===id) state.currentTastingId=null;
      saveState();
      if(typeof window.__deleteTastingCloud === "function") window.__deleteTastingCloud(id);
      renderPreparation();
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

    async function resetDemo(){
      const d = demoTasting();
      d.id = uid();
      d.title += " (Copia)";
      state.tastings.unshift(d);
      saveState();
      try{ if(typeof pushTastingMeta === 'function') await pushTastingMeta(d); }catch(e){ console.error('push demo error', e); }
      renderPreparation();
      toast("Nuova demo aggiunta!");
    }

    
    function normHex6(v){ const h=String(v||"").trim().replace("#",""); return /^[0-9a-fA-F]{6}$/.test(h)?h.toLowerCase():null; }
    function moveInArray(arr,i,dir){ const j=i+(dir<0?-1:1); if(j>=0 && j<arr.length){ const t=arr[i]; arr[i]=arr[j]; arr[j]=t; } }
    function syncGroupsToTastings(){
      // V125: DISABLED. Gruppi delle degustazioni sono indipendenti dall'anagrafica.
      return;
    }

    function editProfileLabel(key,val){ const p=state.profiles.find(x=>x.key===key); if(p && val.trim()){ p.label=val.trim(); saveState(); renderAnagrafiche(); } }
    function editProfileColor(key,val){ const p=state.profiles.find(x=>x.key===key); const h=normHex6(val); if(p && h){ p.color=h; saveState(); renderAnagrafiche(); } }
    function moveProfile(key,dir){ const i=state.profiles.findIndex(x=>x.key===key); if(i>=0){ moveInArray(state.profiles,i,dir); saveState(); renderAnagrafiche(); } }

    function editGroupLabel(key,val){ const g=state.groups.find(x=>x.key===key); if(g && val.trim()){ g.label=val.trim(); syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    function editGroupColor(key,val){ const g=state.groups.find(x=>x.key===key); const h=normHex6(val); if(g && h){ g.color=h; syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    function moveGroup(key,dir){ const i=state.groups.findIndex(x=>x.key===key); if(i>=0){ moveInArray(state.groups,i,dir); syncGroupsToTastings(); saveState(); renderAnagrafiche(); } }
    

    function attachAnaDrag(){
      let dragSrc = null;
      document.querySelectorAll('.ana-item').forEach(item=>{
        item.addEventListener('dragstart', (e)=>{
          dragSrc = item;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/html', item.outerHTML);
          item.style.opacity = '0.4';
        });
        item.addEventListener('dragend', (e)=>{
          item.style.opacity = '1';
          dragSrc = null;
          document.querySelectorAll('.ana-item').forEach(i=>i.style.borderTop='');
        });
        item.addEventListener('dragover', (e)=>{
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if(item !== dragSrc && item.dataset.type === dragSrc.dataset.type){
             item.style.borderTop = '2px solid var(--bordeaux)';
          }
        });
        item.addEventListener('dragleave', (e)=>{
          item.style.borderTop = '';
        });
        item.addEventListener('drop', (e)=>{
          e.stopPropagation();
          item.style.borderTop = '';
          if(dragSrc && dragSrc !== item && dragSrc.dataset.type === item.dataset.type){
             // Reorder logic
             const type = item.dataset.type;
             const arr = type==='profile' ? state.profiles : state.groups;
             const fromKey = dragSrc.dataset.key;
             const toKey = item.dataset.key;
             const fromIdx = arr.findIndex(x=>x.key===fromKey);
             const toIdx = arr.findIndex(x=>x.key===toKey);

             if(fromIdx>=0 && toIdx>=0){
               const moved = arr.splice(fromIdx, 1)[0];
               arr.splice(toIdx, 0, moved);
               if(type==='group') syncGroupsToTastings();
               saveState();
               renderAnagrafiche();
             }
          }
          return false;
        });
      });
    }

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

function isCanvasEmptyDataUrl(dataUrl){
      if(!dataUrl || typeof dataUrl !== 'string') return true;
      if(!dataUrl.startsWith('data:image')) return true;
      return dataUrl.length < 2000;
    }

    function openResultsCanvas(encodedUrl, encodedTitle){
      try{
        const url = decodeURIComponent(encodedUrl||'');
        const title = decodeURIComponent(encodedTitle||'');
        if(!url) return;
        const img = document.getElementById('resultsCanvasImg');
        const ttl = document.getElementById('resultsCanvasTitle');
        if(ttl) ttl.textContent = title ? (' — ' + title) : '';
        if(img) img.src = url;
        const m = document.getElementById('resultsCanvasModal');
        if(m) m.style.display = 'flex';
      }catch(e){ console.error(e); }
    }
    function closeResultsCanvas(){
      const m = document.getElementById('resultsCanvasModal');
      if(m) m.style.display = 'none';
      const img = document.getElementById('resultsCanvasImg');
      if(img) img.src = '';
    }

    function openResultsForTasting(tid){
      if(!tid) return;
      state.ui.resultsTastingId = String(tid);
      saveState({skipCloud:true});
      openResultsForTasting(id);
      setTimeout(()=>{
        try{
          const sel = document.getElementById('resultsDegSelect');
          if(sel) sel.value = String(tid);
          onResultsDegChange(String(tid));
        }catch(e){}
      }, 60);
    }

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

function groupDef(t, key){ return groupsForTasting(t).find(g=>g.key===key); }

function profileDef(t, key){ return profilesForTasting(t).find(p=>p.key===key); }

function productById(t,pid){
      if(!t || !Array.isArray(t.products)) return null;
      return t.products.find(p=>String(p.id)===String(pid)) || null;
    }

function profilesForTasting(t){ if(!t) return state.profiles; ensureTastingTaxonomies(t); return t.profiles || []; }

function getActiveDescriptorSource(){
      const t = getTasting();
      if(t && t.descriptors) return t.descriptors;
      return state.descriptors;
    }

function ensureTastingTaxonomies(t){
      if(!t) return false;
      let changed = false;

      // Gruppi: inizialmente uguali alle anagrafiche, ma subito dissociati (deep clone).
      if(!Array.isArray(t.groups) || !t.groups.length){
        t.groups = clone(state.groups||[]);
        t.__groupsDetached = 1;
        changed = true;
      } else if(!t.__groupsDetached){
        // Migrazione: spezza eventuali reference condivise create in passato.
        t.groups = (t.groups||[]).map(g=>({ key:g.key, label:g.label, color:g.color }));
        t.__groupsDetached = 1;
        changed = true;
      }

      // Profili: già clonati (comportamento esistente)
      if(!Array.isArray(t.profiles) || !t.profiles.length){
        t.profiles = clone(state.profiles||[]);
        changed = true;
      }
      return changed;
    }