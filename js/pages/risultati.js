// risultati.js P2

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
         if(t.mode!=="cieca"){
             const c = cols4(s.cols);
             const n = (c[0] + " " + c[1]).trim();
             if(n) name += " - " + esc(n);
         } else {
             const pid = (t.blindMap||{})[String(s.id)];
             if(pid){
                 const p = (t.products||[]).find(x=>String(x.id)===String(pid));
                 if(p){
                    const c = cols4(p.cols);
                    const n = (c[0] + " " + c[1]).trim();
                    if(n) name += " (Svelato: " + esc(n) + ")";
                 }
             }
         }
         h += '<li>' + name + _ct + 'li>';
      });
      h += _ct + 'ul>';

      const tblWrap = document.getElementById("resultsTableWrap");
      if(tblWrap) h += '<div style="width:100%">' + tblWrap.innerHTML + _ct + 'div>';
      h += '\n<div id="editEntityModal" class="modal-overlay" style="display:none">\n' +
'  <div class="modal">\n' +
'    <div class="modal-header">Modifica <span id="editEntityTitle">' + _ct + 'span>' + _ct + 'div>\n' +
'    <div class="pad" style="text-align:center; display:flex; flex-direction:column; align-items:center;">\n' +
'       <div class="label" style="width:100%;text-align:center">Nome' + _ct + 'div>\n' +
'       <input id="editEntityName" class="input" style="text-align:center" />\n' +
'       <div class="label" style="margin-top:10px;width:100%;text-align:center">Colore' + _ct + 'div>\n' +
'       <div style="display:flex;justify-content:center;margin:10px 0;">\n' +
'          <input id="editEntityColor" type="color" style="width:50px;height:50px;cursor:pointer;border:2px solid #ddd;border-radius:50%;overflow:hidden;" />\n' +
'       ' + _ct + 'div>\n' +
'       <div style="margin-top:20px;display:flex;justify-content:center;gap:10px;width:100%">\n' +
'          <button class="btn" onclick="closeEditEntityModal()">Annulla' + _ct + 'button>\n' +
'          <button class="btn" style="background:var(--rosso); border-color:var(--rosso); color:#fff;" onclick="deleteEditEntity()">Elimina' + _ct + 'button>\n' +
'          <button class="btn primary" onclick="saveEditEntity()">Salva' + _ct + 'button>\n' +
'       ' + _ct + 'div>\n' +
'    ' + _ct + 'div>\n' +
'  ' + _ct + 'div>\n' +
'\n' +
'<div id="resultsCanvasModal" class="modal-overlay" style="display:none">\n' +
'  <div class="modal" style="max-width:520px">\n' +
'    <div class="modal-header">Anteprima note <span id="resultsCanvasTitle" style="font-weight:700">' + _ct + 'span>' + _ct + 'div>\n' +
'    <div class="pad" style="text-align:center">\n' +
'      <img id="resultsCanvasImg" alt="Canvas" style="max-width:100%; border:1px solid #ddd; border-radius:10px; background:#fff" />\n' +
'      <div style="margin-top:12px">\n' +
'        <button class="btn primary" onclick="closeResultsCanvas()">Chiudi' + _ct + 'button>\n' +
'      ' + _ct + 'div>\n' +
'    ' + _ct + 'div>\n' +
'  ' + _ct + 'div>\n' +
_ct + 'div>\n' +
'\n' +
_ct + 'div>\n' +
'\n' +
_ct + 'body>' + _ct + 'html>';

      win.document.write(h);
      win.document.close();
    }

function onResultsSort(v){ state.ui.resultsSort = String(v||'id'); saveState({skipCloud:true}); renderResultsTable(); }

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