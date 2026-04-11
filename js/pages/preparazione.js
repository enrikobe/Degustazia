// preparazione.js P2

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

window.toggleBlindProduct = function(pid){
  if(isArchived()) return;

  const t = getTasting();
  if(!t || t.mode!=="cieca") return;

  if(!t.blindMap) t.blindMap = {};

  const sid = String(selectedSampleId || "");
  if(!sid){ toast("Seleziona un campione"); return; }

  const sPid = String(pid);
  const ownerSid = Object.keys(t.blindMap).find(k => String(t.blindMap[k]) === sPid);

  // Se già assegnato ad un altro campione: chiedi se spostare
  if(ownerSid && ownerSid !== sid){
    if(!confirm(`Questo prodotto è assegnato al campione ${ownerSid}. Spostarlo sul campione ${sid}?`)) return;
    delete t.blindMap[ownerSid];
  }

  // Toggle sul campione selezionato
  if(String(t.blindMap[sid] || "") === sPid){
    delete t.blindMap[sid];
    toast("Dissociato");
  } else {
    t.blindMap[sid] = sPid;
    toast(ownerSid && ownerSid !== sid ? "Spostato e assegnato" : "Assegnato");
  }

  saveState();
  renderProductsStrip();
  renderGrid();
  updateDetail();
      try{ syncCardColorModeUI(); }catch(e){}
}