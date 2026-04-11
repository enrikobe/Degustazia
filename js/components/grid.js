// grid.js — P2b

// degustazione.js P2

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
