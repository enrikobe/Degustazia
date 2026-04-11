// detail.js — P2b

    try{ renderGrid(); }catch(e){}
  }catch(e){}
}



// V140: Copia vergine anche per degustazioni attive (crea una Bozza senza assegnazioni)
function copyTastingVirgin(id){
  const t = state.tastings.find(x=>x.id===id);
  if(!t) return;
  if(!confirm("Copiare questa degustazione (vergine)?")) return;

  const newT = clone(t);
  // V125: detach groups on copy (mantiene solo definizioni)
  try{ newT.groups = (newT.groups||[]).map(g=>({ key:g.key, label:g.label, color:g.color })); newT.__groupsDetached = 1; }catch(_e){}

  newT.id = uid();
  newT.title = (newT.title || '') + " (Copia)";
  newT.status = "bozza";
  newT.createdAt = nowIso();
  newT.finishedAt = null;

  // Mantieni campioni ma azzera gruppo assegnato
  try{ newT.samples = (newT.samples||[]).map(s=>({ ...s, groupKey: null })); }catch(e){}

  // Nessuna valutazione / profilo / preferiti / ordine
  newT.evaluations = {};

  // Nessuna associazione cieca
  newT.blindMap = {};

  // Niente preferenze UI della degustazione (filtri, hidden, ecc) => torna default
  try{ delete newT.uiPrefs; }catch(e){}

  // V143: default swipe colore su PROFILO (copia)
  try{ newT.uiPrefs = newT.uiPrefs || {}; newT.uiPrefs.cardColorModeByTaster = {}; (t.tasterIds||[]).forEach(id=> newT.uiPrefs.cardColorModeByTaster[String(id)]='profile'); }catch(e){}

  state.tastings.unshift(newT);
  saveState();

  try{ go('preparazione', document.getElementById('btnMenuPrep')); }catch(e){}
  try{ showPrepTab('attive'); }catch(e){}
  try{ renderPreparation(); }catch(e){}
  toast("Degustazione copiata (Bozza)");
}



// V140: Modalita' colore card (profilo vs gruppo), memorizzata nella degustazione
function getCardColorMode(t){
  try{
    if(!t) t = getTasting();
    const tasterId = currentTasterId();
    const tastingId = String((t && t.id) || state?.ui?.currentTastingId || '');
    if(!tasterId || !tastingId) return 'profile';

    // Locale: per prestazioni e per evitare sync inutile
    let m = __getLocalCardColorMode(tastingId, tasterId);
    if(!m){
      // Default: profilo
      __setLocalCardColorMode(tastingId, tasterId, 'profile');
      m = 'profile';
    }
    return (m === 'group') ? 'group' : 'profile';
  }catch(e){ return 'profile'; }
}

function syncCardColorModeUI(){
  try{
    const t = getTasting();
    const mode = getCardColorMode(t);

    // Scheda Degustazione
    const swP = document.getElementById('swColorProfile');
    const swG = document.getElementById('swColorGroup');
    if(swP) swP.checked = (mode === 'profile');
    if(swG) swG.checked = (mode === 'group');

    // ZEN+
    const zP = document.getElementById('swZenColorProfile');
    const zG = document.getElementById('swZenColorGroup');
    if(zP) zP.checked = (mode === 'profile');
    if(zG) zG.checked = (mode === 'group');
  }catch(e){}
}

function setCardColorMode(mode){
  try{
    const t = getTasting();
    const tasterId = currentTasterId();
    const tastingId = String((t && t.id) || state?.ui?.currentTastingId || '');
    if(!tasterId || !tastingId) return;

    __setLocalCardColorMode(tastingId, tasterId, (String(mode)==='group') ? 'group' : 'profile');

    // UI only (no cloud)
    syncCardColorModeUI();
    try{ renderGrid(); }catch(e){}
  }catch(e){}
}



    const STORAGEKEY = "degustapp_cloud_v24";

    // ---------- Helpers ----------

    function printResults() {
      const sel = document.getElementById("resultsDegSelect");
      if(!sel) return;
      const tid = sel.value || String(state.ui.resultsTastingId||'');
      if(!tid) { toast("Seleziona una degustazione"); return; }
      const t = state.tastings.find(x=>x.id===tid);
      if(!t) return;
const tasterIdsFromTasting = (t.tasterIds && t.tasterIds.length) ? t.tasterIds.slice() : Object.keys((t.evaluations||{}));
const tastersExpanded = (tasterIdsFromTasting||[]).map(id => {
   return state.tasters.find(x=>String(x.id)===String(id)) || { id: id, name: `Degustatore ${id}`, email: '' };
});

const activeTasters = tastersExpanded.filter(tas => {
   const evs = t.evaluations && t.evaluations[String(tas.id)];
   return evs && Object.keys(evs).length > 0;
});

      const win = window.open('','_blank');
      if(!win) { toast("Popup bloccato"); return; }

      // V197: Build print HTML avoiding </ sequences inside script block
      var _ct = '<' + '/'; // safe closing tag prefix
      let h = '<html><head>\n';
      h += '  <link rel="icon" href="data:,"><title>Stampa Degustazione' + _ct + 'title>\n';
      h += '      <style>\n';
      h += '        @page{size:A4; margin:12mm;}\n';
      h += '        body{font-family:sans-serif; padding:20px; font-size:12px;}\n';
      h += '        h1{color:#7a2938; margin-bottom:5px;}\n';
      h += '        .meta{color:#666; margin-bottom:20px; font-size:14px;}\n';
      h += '        ul{margin-bottom:20px;}\n';
      h += '        table{width:100%; border-collapse:collapse; font-size:11px;}\n';
      h += '        th{background:#7a2938; color:#fff; padding:5px; border:1px solid #999;}\n';
      h += '        td{padding:5px; border:1px solid #ccc;}\n';
      h += '    #groupOptions, #profileOptions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }\n';
      h += '    .group-option, .profile-option { width: auto !important; font-size: 13px !important; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 8px 4px !important; }\n';
      h += '    #groupOptions + div.muted { display: none; }\n';
      h += '.modal-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999; }\n';
      h += '.modal { background:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);width:90%;max-width:350px; }\n';
      h += '.modal-header { background:#7a2938;color:#fff;padding:12px;font-weight:bold;text-align:center; }\n';
      h += '.pchip { font-size:11px !important; padding:2px 8px !important; }\n';
      h += '.sample-card{ overflow-y:auto; overflow-x:hidden; scrollbar-width:none; }\n';
      h += '.sample-card::-webkit-scrollbar{ display:none; width:0; height:0; }\n';
      h += '.card-desc-row, .card-desc{ font-style: italic; }\n';
      h += '.sample-id-row{ display:flex; align-items:center; gap:6px; justify-content:flex-start; }\n';
      h += 'body.zenplus .sample-id-row{ justify-content:center; }\n';
      h += '.menu-btn.unhide-square{ background:#2196F3 !important; color:#fff !important; border-radius:6px !important; width:44px; padding:10px 0 !important; text-align:center; }\n';
      h += '.btn.unhide-square{ background:#2196F3 !important; border-color:#2196F3 !important; color:#fff !important; border-radius:6px !important; width:44px; }\n';
      h += 'body.zenplus .zenplus-overlay{ height:100vh; }\n';
      h += 'body.zenplus .zenplus-top{ flex:1 1 auto; min-height:0; }\n';
      h += _ct + 'style>\n';
      h += _ct + 'head><body>';

      h += `<h1>${esc(t.title)}` + _ct + `h1>`;
      h += `<div class="meta">
              Data: ${new Date().toLocaleDateString()} | 
              Modalità: ${t.mode==="cieca"?"Alla cieca":"Scoperta"} | 
              Campioni: ${t.samples.length} | 
              Degustatori attivi: ${activeTasters.length}
            ` + _ct + `div>`;

      h += '<h3>Elenco Campioni' + _ct + 'h3><ul>';
      t.samples.forEach(s=>{
         let name = "Campione " + s.id;
