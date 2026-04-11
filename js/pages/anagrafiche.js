// anagrafiche.js P2

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

function addProfile(){
      const n = document.getElementById("newProfileName").value.trim();
      const c = document.getElementById("newProfileColor").value.trim().replace("#","");
      if(!n) return;
      state.profiles.push({key:slugify(n), label:n, color:c||"777777"});
      saveState();
      renderAnagrafiche();
      document.getElementById("newProfileName").value="";
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