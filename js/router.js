// router.js P2

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

function toggleZen(force){
      const want = (typeof force==="boolean") ? force : !document.body.classList.contains("zen");
      if(want){
        setZenUI(true);
        try{ if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); }catch{}
      }else{
        setZenUI(false);
        try{ if(document.fullscreenElement) await document.exitFullscreen(); }catch{}
      }
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

function closeFiltersPanel(){
      document.getElementById("filtersPanel")?.classList.remove("active");
      document.getElementById("filtersOverlay")?.classList.remove("active");
    }

function toggleFiltersPanel(){
      const p = document.getElementById("filtersPanel");
      if(!p) return;
      if(p.classList.contains("active")) closeFiltersPanel();
      else openFiltersPanel();
    }

window.showSplashTastersV181 = function() {
    console.log('🔍 showSplashTastersV181() chiamato, retry:', _retryCount);
    
    var sp = document.getElementById('splashScreen');
    var list = document.getElementById('splash-tasters-list');
    if (!sp || !list) {
      console.log('⚠️ Elementi splash non trovati');
      return;
    }

    // Ottieni lista degustatori
    var tasters = [];
    try {
      if (typeof state !== 'undefined' && state && state.tasters && state.tasters.length > 0) {
        tasters = state.tasters;
      }
    } catch(e) {}

    var cloudReady = window.__cloudReady || false;

    // Se non ci sono tasters e cloud non pronto, aspetta (max 15 retry)
    if (tasters.length === 0 && !cloudReady && _retryCount < 15) {
      _retryCount++;
      if (_retryCount === 1) {
        list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.7);font-size:14px;">⏳ Connessione al server...</p></div>';
        list.classList.add('visible');
      }
      console.log('⏳ Aspetto dati Firebase... retry ' + _retryCount + '/15');
      setTimeout(window.showSplashTastersV181, 1000);
      return;
    }

    if (_splashInitialized) return;
    _splashInitialized = true;

    // Nessun degustatore trovato
    if (tasters.length === 0) {
      list.innerHTML = '<div style="margin-top:30px;text-align:center;">' +
        '<p style="color:rgba(255,255,255,0.8);margin-bottom:20px;">' +
        (cloudReady ? 'Nessun degustatore configurato.<br>Vai in Anagrafiche per aggiungere degustatori.' : '⚠️ Connessione non riuscita') +
        '</p>' +
        '<button onclick="window.closeSplashV181()" class="splash-taster-btn" style="margin-top:15px;">Continua →</button>' +
        '</div>';
      list.classList.add('visible');
      return;
    }

    // Mostra lista degustatori con layout responsive
    var html = '<div style="margin-top:20px;text-align:center;">';
    html += '<h3 style="color:#fff;margin-bottom:20px;font-size:18px;font-weight:500;">Seleziona il tuo profilo</h3>';
    html += '<div class="splash-tasters-container">';
    
    for (var i = 0; i < tasters.length; i++) {
      var t = tasters[i];
      var name = t.name || ('Degustatore ' + t.id);
      html += '<button onclick="window.selectSplashTasterV181(' + t.id + ',\'' + name.replace(/'/g, "\\'") + '\')" class="splash-taster-btn">' + name + '</button>';
    }
    html += '</div></div>';
    
    list.innerHTML = html;
    list.classList.add('visible');
    console.log('✅ Splash login V181: ' + tasters.length + ' degustatori mostrati');
  };

  window.selectSplashTasterV181 = function(id, name) {
    // Salva in session storage
    sessionStorage.setItem(SESSION_KEY_ID, String(id));
    sessionStorage.setItem(SESSION_KEY_NAME, name);
    
    // Anche in window per accesso rapido
    window.__sessionTasterId = id;
    window.__sessionTasterName = name;
    
    console.log('👤 V181 Login:', name, '(ID:', id, ')');
    
    // Chiudi splash
    var sp = document.getElementById('splashScreen');
    if (sp) {
      sp.classList.add('hide');
      setTimeout(function() { sp.style.display = 'none'; }, 400);
    }
    
    // Naviga a preparazione
    setTimeout(function() {
      if (typeof go === 'function') {
        go('preparazione', document.getElementById('btnMenuPrep'));
      }
      // Sincronizza il select del degustatore se presente
      setTimeout(function() {
        var sel = document.getElementById('tasterSelect');
        if (sel) {
          sel.value = String(id);
          if (typeof onSelectTaster === 'function') {
            onSelectTaster();
          }
        }
      }, 200);
    }, 500);
  };

  window.closeSplashV181 = function() {
    var sp = document.getElementById('splashScreen');
    if (sp) {
      sp.classList.add('hide');
      setTimeout(function() { sp.style.display = 'none'; }, 400);
    }
    setTimeout(function() {
      if (typeof go === 'function') {
        go('preparazione', document.getElementById('btnMenuPrep'));
      }
    }, 500);
  };

  window.getSessionTaster = function() {
    var id = sessionStorage.getItem(SESSION_KEY_ID);
    var name = sessionStorage.getItem(SESSION_KEY_NAME);
    if (id && name) {
      return { id: id, name: name };
    }
    return null;
  };

  window.getLoggedTaster = function() {
    var session = window.getSessionTaster();
    return session || { id: null, name: null };
  };

  window.logoutTaster = function() {
    sessionStorage.removeItem(SESSION_KEY_ID);
    sessionStorage.removeItem(SESSION_KEY_NAME);
    window.__sessionTasterId = null;
    window.__sessionTasterName = null;
    console.log('👤 V181 Logout effettuato');
  };

  console.log('✅ V181 Splash Login System loaded');
})();

// Visibilità pulsanti condizionali
(function() {
  function updateButtonsVisibility() {
    const pageDeg = document.getElementById('page-degustazione');
    if (!pageDeg) return;

    const isActive = pageDeg.style.display !== 'none' && 
                    !pageDeg.classList.contains('hidden');

    const btnFinish = document.getElementById('btnTopFinish');
    const btnFilters = document.getElementById('btnTopFilters');
    const btnZenFilters = document.getElementById('btnZenPlusTopFilters');

    if (btnFinish) btnFinish.style.display = isActive ? 'inline-block' : 'none';
    if (btnFilters) btnFilters.style.display = isActive ? 'inline-block' : 'none';
    if (btnZenFilters) btnZenFilters.style.display = isActive ? 'inline-block' : 'none';
  }

  const observer = new MutationObserver(updateButtonsVisibility);

  document.addEventListener('DOMContentLoaded', function() {
    updateButtonsVisibility();

    observer.observe(document.body, { 
      attributes: true, 
      childList: true, 
      subtree: true 
    });

    document.addEventListener('click', function() {
      setTimeout(updateButtonsVisibility, 100);
    });
  });
})();

// Touch menu
(function() {
  let startY = 0;
  let startTime = 0;

  document.addEventListener('DOMContentLoaded', function() {
    const menu = document.getElementById('zenPlusTop');
    if (!menu) return;

    menu.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    menu.addEventListener('touchend', function(e) {
      const distance = Math.abs(e.changedTouches[0].clientY - startY);
      const duration = Date.now() - startTime;

      if (distance > 10 || duration > 200) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, { passive: false });
  });
})();

// Inizializza menu touch handling
document.addEventListener('DOMContentLoaded', function() {
  if (typeof initMenuTouchHandling === 'function') {
    initMenuTouchHandling();
  }
});

 // ==== MODIFICHE AGGIUNTE ====

  let npPenSize = 2;
  function updateNpPenSize(size) {
    npPenSize = parseInt(size);
    const label = document.getElementById('npPenSizeLabel');
    if (label) label.textContent = size + 'px';
  }

  function syncCanvasWidgetToFullscreen(x, y, isDrawing, tool) {
    const npCanvas = document.getElementById('canvasNotePanelCanvas');
    if (!npCanvas) return;
    const npCtx = npCanvas.getContext('2d');
    if (tool === 'pen' && isDrawing) {
      npCtx.strokeStyle = '#000';
      npCtx.lineWidth = npPenSize || 2;
      npCtx.lineTo(x, y);
      npCtx.stroke();
    } else if (tool === 'eraser') {
      npCtx.clearRect(x - 10, y - 10, 20, 20);
    }
  }

  // MODIFICA 3: Gestione touch migliorata per menu
  let menuTouchStartX = 0, menuTouchStartY = 0, menuTouchStartTime = 0;
  let menuTouchMoved = false;
  
  function initMenuTouchHandling() {
    const menuBar = document.querySelector('.menu-bar');
    if (!menuBar) return;
    
    // Traccia inizio touch
    menuBar.addEventListener('touchstart', function(e) {
      menuTouchStartX = e.touches[0].clientX;
      menuTouchStartY = e.touches[0].clientY;
      menuTouchStartTime = Date.now();
      menuTouchMoved = false;
    }, {passive: true});
    
    // Traccia movimento - se > 10px è uno scroll
    menuBar.addEventListener('touchmove', function(e) {
      const deltaX = Math.abs(e.touches[0].clientX - menuTouchStartX);
      const deltaY = Math.abs(e.touches[0].clientY - menuTouchStartY);
      if (deltaX > 10 || deltaY > 10) {
        menuTouchMoved = true;
      }
    }, {passive: true});
    
    // Al termine del touch, se era uno scroll blocca l'evento
    menuBar.addEventListener('touchend', function(e) {
      const deltaX = Math.abs(e.changedTouches[0].clientX - menuTouchStartX);
      const deltaY = Math.abs(e.changedTouches[0].clientY - menuTouchStartY);
      const duration = Date.now() - menuTouchStartTime;
      
      // Se è stato uno scroll (movimento > 10px) o tocco lungo (> 300ms)
      if (menuTouchMoved || deltaX > 10 || deltaY > 10 || duration > 300) {
        e.preventDefault();
        e.stopPropagation();
        
        // Marca i bottoni per ignorare il click successivo
        const btns = menuBar.querySelectorAll('.menu-btn');
        btns.forEach(function(btn) {
          btn.setAttribute('data-ignore-click', 'true');
          setTimeout(function() { btn.removeAttribute('data-ignore-click'); }, 100);
        });
        
        return false;
      }
    });
    
    // Intercetta click sui bottoni e ignora se marcati
    menuBar.addEventListener('click', function(e) {
      const btn = e.target.closest('.menu-btn');
      if (btn && btn.hasAttribute('data-ignore-click')) {
        e.preventDefault();
        e.stopPropagation();
        btn.removeAttribute('data-ignore-click');
        return false;
      }
    }, true); // capture phase
    
    console.log('✅ Menu touch handling inizializzato');
  }

  function updateTopButtonsVisibility() {
    const currentPage = (typeof getCurrentPage === 'function') ? getCurrentPage() : '';
    const btnTermina = document.querySelector('[onclick*="finishTasting"]');
    const btnFiltri = document.getElementById('btnTopFilters');
    const btnZEN = document.getElementById('btnTopZEN');
    const isDegtab = (currentPage === 'degustazione' || 
                     document.body.classList.contains('zen-mode') ||
                     document.body.classList.contains('zen-plus-mode'));
    if (btnTermina) btnTermina.style.display = isDegtab ? '' : 'none';
    if (btnFiltri) btnFiltri.style.display = isDegtab ? '' : 'none';
    if (btnZEN) btnZEN.style.display = isDegtab ? '' : 'none';
  }

  (function() {
    const orig = window.showPage;
    if (orig) {
      window.showPage = function(page) {
        orig(page);
        setTimeout(updateTopButtonsVisibility, 50);
      };
    }
  })();

  let selectedGlobalTaster = null;

  function showTasterSelection() {
    const sp = document.getElementById("splashScreen");
    const list = document.getElementById("splash-tasters-list");
    if (!sp || !list) return;
    const tasters = JSON.parse(localStorage.getItem('tasters') || '[]');
    if (tasters.length === 0) {
      tasters.push({id: 1, name: 'Degustatore Predefinito', email: ''});
      localStorage.setItem('tasters', JSON.stringify(tasters));
    }
    const isLandscape = window.innerWidth > window.innerHeight;
    let html = '<div style="margin-top:30px;"><h3 style="color:#fff;text-align:center;margin-bottom:25px;font-weight:normal;">Seleziona Degustatore</h3>';
    html += '<div style="display:flex;flex-direction:' + (isLandscape ? 'row' : 'column') + ';gap:15px;justify-content:center;flex-wrap:wrap;">';
    tasters.forEach(function(t) {
      html += '<button onclick="selectGlobalTaster(' + t.id + ',\''+t.name.replace(/'/g,"\\'")+'\')" ';
      html += 'style="padding:15px 30px;background:#4CAF50;color:#fff;border:none;border-radius:8px;';
      html += 'font-size:18px;font-weight:normal;cursor:pointer;min-width:180px;">' + t.name + '</button>';
    });
    html += '</div></div>';
    list.innerHTML = html;
  }

  function selectGlobalTaster(id, name) {
    selectedGlobalTaster = {id: id, name: name};
    localStorage.setItem('selectedGlobalTaster', JSON.stringify(selectedGlobalTaster));
    const sp = document.getElementById("splashScreen");
    if (sp) {
      sp.classList.add("hide");
      setTimeout(function() { sp.style.display = "none"; }, 500);
    }
    const sel = document.getElementById('tasterSelect');
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    }
  }

  try {
    const saved = localStorage.getItem('selectedGlobalTaster');
    if (saved) selectedGlobalTaster = JSON.parse(saved);
  } catch(e) {}

  // ==== FINE MODIFICHE ====



(function() {
  var ACTIVE_TASTER_ID_KEY = 'degustapp-active-taster-id';
  var ACTIVE_TASTER_NAME_KEY = 'degustapp-active-taster-name';
  var _splashShown = false;
  var _splashRetry = 0;

  window.showSplashTastersV2 = function() {
    var sp = document.getElementById("splashScreen");
    var list = document.getElementById("splash-tasters-list");
    if (!sp || !list) return;

    // Aspetta che Firebase carichi i dati (max 10 retry)
    var tasters = [];
    try {
      if (typeof state !== 'undefined' && state && state.tasters && state.tasters.length > 0) {
        tasters = state.tasters;
      }
    } catch(e) {}

    var cloudReady = window.__cloudReady || false;

    // Se non ci sono tasters e cloud non pronto, riprova
    if (tasters.length === 0 && !cloudReady && _splashRetry < 10) {
      _splashRetry++;
      if (_splashRetry === 1) {
        list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);">⏳ Connessione...</p></div>';
        list.classList.add('visible');
      }
      console.log('⏳ Aspetto Firebase... retry ' + _splashRetry + '/10');
      setTimeout(window.showSplashTastersV2, 1000);
      return;
    }

    if (_splashShown) return;
    _splashShown = true;

    // Nessun degustatore trovato
    if (tasters.length === 0) {
      list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);margin-bottom:20px;">' + 
        (cloudReady ? 'Nessun degustatore configurato' : '⚠️ Connessione non riuscita') + 
        '</p><button onclick="window.closeSplashAndProceed()" style="padding:14px 32px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4);color:#fff;border-radius:10px;font-size:16px;cursor:pointer;">Continua →</button></div>';
      list.classList.add('visible');
      return;
    }

    // Mostra lista degustatori
    var html = '<div style="margin-top:30px;text-align:center;"><h3 style="color:#fff;margin-bottom:25px;font-size:20px;">Seleziona il tuo profilo</h3><div style="display:flex;flex-direction:column;gap:12px;align-items:center;">';
    for (var i = 0; i < tasters.length; i++) {
      var t = tasters[i];
      var name = t.name || ('Degustatore ' + t.id);
      html += '<button onclick="window.selectSplashTasterV2(' + t.id + ',\'' + name.replace(/'/g, "\\'") + '\')" style="padding:14px 28px;background:transparent;border:2px solid rgba(255,255,255,0.3);color:#fff;border-radius:10px;font-size:17px;min-width:200px;cursor:pointer;transition:all 0.2s;">' + name + '</button>';
    }
    html += '</div></div>';
    list.innerHTML = html;
    list.classList.add('visible');
    console.log('✅ Splash tasters V2: ' + tasters.length + ' degustatori');
  };

  window.selectSplashTasterV2 = function(id, name) {
    // Salva degustatore attivo
    localStorage.setItem(ACTIVE_TASTER_ID_KEY, String(id));
    localStorage.setItem(ACTIVE_TASTER_NAME_KEY, name);
    if (typeof selectedGlobalTaster !== 'undefined') {
      selectedGlobalTaster = { id: id, name: name };
    }
    console.log('👤 Degustatore selezionato:', name, '(ID:', id, ')');
    
    // Chiudi splash
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    
    // Naviga a preparazione
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };

  window.closeSplashAndProceed = function() {
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };
  
  // Helper per ottenere degustatore attivo
  window.getActiveTaster = function() {
    var id = localStorage.getItem(ACTIVE_TASTER_ID_KEY);
    var name = localStorage.getItem(ACTIVE_TASTER_NAME_KEY);
    return id ? { id: parseInt(id, 10), name: name } : null;
  };
  
  // Helper per cancellare degustatore attivo
  window.clearActiveTaster = function() {
    localStorage.removeItem(ACTIVE_TASTER_ID_KEY);
    localStorage.removeItem(ACTIVE_TASTER_NAME_KEY);
  };
}

window.showSplashTastersV2 = function() {
    var sp = document.getElementById("splashScreen");
    var list = document.getElementById("splash-tasters-list");
    if (!sp || !list) return;

    // Aspetta che Firebase carichi i dati (max 10 retry)
    var tasters = [];
    try {
      if (typeof state !== 'undefined' && state && state.tasters && state.tasters.length > 0) {
        tasters = state.tasters;
      }
    } catch(e) {}

    var cloudReady = window.__cloudReady || false;

    // Se non ci sono tasters e cloud non pronto, riprova
    if (tasters.length === 0 && !cloudReady && _splashRetry < 10) {
      _splashRetry++;
      if (_splashRetry === 1) {
        list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);">⏳ Connessione...</p></div>';
        list.classList.add('visible');
      }
      console.log('⏳ Aspetto Firebase... retry ' + _splashRetry + '/10');
      setTimeout(window.showSplashTastersV2, 1000);
      return;
    }

    if (_splashShown) return;
    _splashShown = true;

    // Nessun degustatore trovato
    if (tasters.length === 0) {
      list.innerHTML = '<div style="margin-top:30px;text-align:center;"><p style="color:rgba(255,255,255,0.8);margin-bottom:20px;">' + 
        (cloudReady ? 'Nessun degustatore configurato' : '⚠️ Connessione non riuscita') + 
        '</p><button onclick="window.closeSplashAndProceed()" style="padding:14px 32px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4);color:#fff;border-radius:10px;font-size:16px;cursor:pointer;">Continua →</button></div>';
      list.classList.add('visible');
      return;
    }

    // Mostra lista degustatori
    var html = '<div style="margin-top:30px;text-align:center;"><h3 style="color:#fff;margin-bottom:25px;font-size:20px;">Seleziona il tuo profilo</h3><div style="display:flex;flex-direction:column;gap:12px;align-items:center;">';
    for (var i = 0; i < tasters.length; i++) {
      var t = tasters[i];
      var name = t.name || ('Degustatore ' + t.id);
      html += '<button onclick="window.selectSplashTasterV2(' + t.id + ',\'' + name.replace(/'/g, "\\'") + '\')" style="padding:14px 28px;background:transparent;border:2px solid rgba(255,255,255,0.3);color:#fff;border-radius:10px;font-size:17px;min-width:200px;cursor:pointer;transition:all 0.2s;">' + name + '</button>';
    }
    html += '</div></div>';
    list.innerHTML = html;
    list.classList.add('visible');
    console.log('✅ Splash tasters V2: ' + tasters.length + ' degustatori');
  };

  window.selectSplashTasterV2 = function(id, name) {
    // Salva degustatore attivo
    localStorage.setItem(ACTIVE_TASTER_ID_KEY, String(id));
    localStorage.setItem(ACTIVE_TASTER_NAME_KEY, name);
    if (typeof selectedGlobalTaster !== 'undefined') {
      selectedGlobalTaster = { id: id, name: name };
    }
    console.log('👤 Degustatore selezionato:', name, '(ID:', id, ')');
    
    // Chiudi splash
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    
    // Naviga a preparazione
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };

  window.closeSplashAndProceed = function() {
    var sp = document.getElementById("splashScreen");
    if (sp) { 
      sp.classList.add("hide"); 
      setTimeout(function(){ sp.style.display = "none"; }, 400); 
    }
    setTimeout(function() {
      if (typeof go === 'function') {
        go("preparazione", document.getElementById("btnMenuPrep"));
      }
    }, 500);
  };
  
  // Helper per ottenere degustatore attivo
  window.getActiveTaster = function() {
    var id = localStorage.getItem(ACTIVE_TASTER_ID_KEY);
    var name = localStorage.getItem(ACTIVE_TASTER_NAME_KEY);
    return id ? { id: parseInt(id, 10), name: name } : null;
  };
  
  // Helper per cancellare degustatore attivo
  window.clearActiveTaster = function() {
    localStorage.removeItem(ACTIVE_TASTER_ID_KEY);
    localStorage.removeItem(ACTIVE_TASTER_NAME_KEY);
  };
})();


(function() {
  'use strict';
  
  // ═══════════════════════════════════════════════════════════════
  // V191: Fabric.js Notes System - Unified Widget/Fullscreen
  // ═══════════════════════════════════════════════════════════════
  
  // Fullscreen canvas
  var fabricCanvas = null;
  var quillEditor = null;
  
  // V191: Widget canvas (same system, scaled 70%)
  var widgetCanvas = null;
  var widgetTextEditor = null;
  
  var currentTool = 'pen';
  var currentColor = '#000000';
  var currentHighlighterColor = '#ffeb3b';
  var currentStroke = 1;
  var currentPaper = 'lined';
  var quillInitialized = false;
  var widgetInitialized = false;
  var currentMode = 'draw';
  
  // Undo history
  var undoHistory = [];
  var MAX_UNDO_STEPS = 20;
  
  // Track current sample context
  var currentNoteContext = null;
  
  // V191: Larger canvas dimensions
  var CANVAS_WIDTH = 900;
  var CANVAS_HEIGHT = 1150;
  
  // Stroke widths for each size
  var STROKE_SIZES = {
    1: 2,
    2: 5,
    3: 10
  };
  
  // Fabric.js performance optimization
  if (typeof fabric !== 'undefined') {
    fabric.perfLimitSizeTotal = 2097152;
    fabric.maxCacheSideLimit = 2048;
    fabric.minCacheSideLimit = 256;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Get current note context
  // ═══════════════════════════════════════════════════════════════
  
  function getNoteContext() {
    var t = typeof getTasting === 'function' ? getTasting() : null;
    var tid = typeof currentTasterId === 'function' ? currentTasterId() : null;
    var sid = typeof selectedSampleId !== 'undefined' ? selectedSampleId : null;
    
    if (!t || !tid || !sid) return null;
    
    return {
      tastingId: t.id,
      tasterId: tid,
      sampleId: sid,
      key: t.id + '_' + tid + '_' + sid
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // V189: Undo System
  // ═══════════════════════════════════════════════════════════════
  
  function saveUndoState() {
    if (!fabricCanvas) return;
    
    try {
      var state = JSON.stringify(fabricCanvas.toJSON(['selectable', 'evented']));
      undoHistory.push(state);
      
      // Limit history size
      if (undoHistory.length > MAX_UNDO_STEPS) {
        undoHistory.shift();
      }
    } catch(e) {
      console.log('Undo save error:', e);
    }
  }
  
  window.undoFabricNotes = function() {
    if (currentMode === 'draw' && fabricCanvas && undoHistory.length > 0) {
      try {
        var lastState = undoHistory.pop();
        fabricCanvas.loadFromJSON(lastState, function() {
          fabricCanvas.renderAll();
          console.log('↩️ Undo applied');
        });
      } catch(e) {
        console.log('Undo error:', e);
      }
    } else if (currentMode === 'text' && quillEditor) {
      // Quill has its own undo with Ctrl+Z
      if (typeof toast === 'function') toast('Usa Ctrl+Z per annullare nel testo');
    }
  };
  
  // ═══════════════════════════════════════════════════════════════
  // Initialize Functions
  // ═══════════════════════════════════════════════════════════════
  
  function initFabricCanvas() {
    console.log('🎨 V192: Initializing Fabric.js canvas...');
    
    if (fabricCanvas) {
      try {
        fabricCanvas.dispose();
      } catch(e) {}
      fabricCanvas = null;
    }
    
    var canvasEl = document.getElementById('fabricDrawCanvas');
    if (!canvasEl) {
      console.error('❌ Canvas element not found');
      return false;
    }
    
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;
    canvasEl.style.width = CANVAS_WIDTH + 'px';
    canvasEl.style.height = CANVAS_HEIGHT + 'px';
    
    try {
      // V192: Use transparent background so paper lines show through
      fabricCanvas = new fabric.Canvas('fabricDrawCanvas', {
        isDrawingMode: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 'transparent',
        selection: false,
        renderOnAddRemove: true,
        enableRetinaScaling: false
      });
      
      // Setup drawing brush
      fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
      fabricCanvas.freeDrawingBrush.color = currentColor;
      fabricCanvas.freeDrawingBrush.width = STROKE_SIZES[currentStroke] || 2;
      fabricCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      
      // V196: Setup object-based eraser
      setupEraserMode(fabricCanvas);
      
      // V192: Save undo state after each stroke
      fabricCanvas.on('path:created', function() {
        saveUndoState();
        queueNotesAutoSave(); // V196: Auto-save after drawing
      });
      
      // Update wrapper size
      var wrap = document.getElementById('fabricCanvasWrap');
      if (wrap) {
        wrap.style.width = CANVAS_WIDTH + 'px';
        wrap.style.height = CANVAS_HEIGHT + 'px';
      }
      
      fabricCanvas.renderAll();
      
      console.log('✅ V196: Fabric.js canvas initialized:', CANVAS_WIDTH, 'x', CANVAS_HEIGHT);
      return true;
      
    } catch(e) {
      console.error('❌ Fabric.js init error:', e);
      return false;
    }
  }
  
  function initQuillEditor() {
    if (quillInitialized && quillEditor) return true;
    
    console.log('📝 V189: Initializing Quill editor...');
    
    var editorEl = document.getElementById('fabricQuillEditor');
    if (!editorEl) {
      console.error('❌ Quill editor element not found');
      return false;
    }
    
    try {
      quillEditor = new Quill('#fabricQuillEditor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['clean']
          ]
        },
        placeholder: 'Scrivi le tue note qui...'
      });
      
      quillInitialized = true;
      console.log('✅ Quill editor initialized');
      return true;
      
    } catch(e) {
      console.error('❌ Quill init error:', e);
      return false;
    }
  }
  
  function updateBrush() {
    if (!fabricCanvas) return;
    
    var strokeWidth = STROKE_SIZES[currentStroke] || 2;
    
    try {
      if (currentTool === 'eraser') {
        // V197: Eraser mode - stay in drawing mode but track eraser state
        fabricCanvas._isEraserMode = true;
        fabricCanvas._eraserRadius = strokeWidth * 6;
        fabricCanvas.isDrawingMode = false; // Disable drawing to allow mouse events
        fabricCanvas.selection = false;
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.hoverCursor = 'crosshair';
        
        // Make all objects non-selectable
        fabricCanvas.forEachObject(function(obj) {
          obj.selectable = false;
          obj.evented = false;
        });
        
      } else if (currentTool === 'highlighter') {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = hexToRgba(currentHighlighterColor, 0.4);
        fabricCanvas.freeDrawingBrush.width = strokeWidth * 8;
      } else if (currentTool === 'pencil') {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = currentColor;
        fabricCanvas.freeDrawingBrush.width = Math.max(1, strokeWidth * 0.5);
      } else {
        fabricCanvas._isEraserMode = false;
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = currentColor;
        fabricCanvas.freeDrawingBrush.width = strokeWidth;
      }
      
      if (fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      }
    } catch(e) {
      console.log('Brush update error:', e);
    }
  }
  
  // V197: Improved eraser that removes paths under cursor
  function setupEraserMode(canvas) {
    if (!canvas) return;
    if (canvas._eraserSetup) return; // Avoid duplicate setup
    canvas._eraserSetup = true;
    
    var isErasing = false;
    
    canvas.on('mouse:down', function(opt) {
      if (!canvas._isEraserMode) return;
      isErasing = true;
      eraseAtPoint(canvas, opt.pointer);
    });
    
    canvas.on('mouse:move', function(opt) {
      if (!canvas._isEraserMode || !isErasing) return;
      eraseAtPoint(canvas, opt.pointer);
    });
    
    canvas.on('mouse:up', function() {
      if (!canvas._isEraserMode || !isErasing) return;
      isErasing = false;
      saveUndoState();
      queueNotesAutoSave();
    });
  }
  
  // V197: Erase paths at pointer location
  function eraseAtPoint(canvas, pointer) {
    if (!canvas || !pointer) return;
    
    var radius = canvas._eraserRadius || 25;
    var objectsToRemove = [];
    
    canvas.forEachObject(function(obj) {
      // Only erase path objects (drawings), not other shapes
      if (obj.type !== 'path') return;
      
      var objBounds = obj.getBoundingRect();
      
      // Quick bounds check first
      if (pointer.x < objBounds.left - radius || 
          pointer.x > objBounds.left + objBounds.width + radius ||
          pointer.y < objBounds.top - radius || 
          pointer.y > objBounds.top + objBounds.height + radius) {
        return;
      }
      
      // Check if pointer is near the path
      if (isPointNearPath(pointer, obj, radius)) {
        objectsToRemove.push(obj);
      }
    });
    
    if (objectsToRemove.length > 0) {
      objectsToRemove.forEach(function(obj) {
        canvas.remove(obj);
      });
      canvas.renderAll();
    }
  }
  
  function isPointNearPath(pointer, pathObj, radius) {
    if (!pathObj.path) return false;
    
    try {
      var path = pathObj.path;
      var matrix = pathObj.calcTransformMatrix();
      
      for (var i = 0; i < path.length; i++) {
        var cmd = path[i];
        var x, y;
        
        if (cmd[0] === 'M' || cmd[0] === 'L') {
          x = cmd[1];
          y = cmd[2];
        } else if (cmd[0] === 'Q') {
          x = cmd[3];
          y = cmd[4];
        } else if (cmd[0] === 'C') {
          x = cmd[5];
          y = cmd[6];
        } else {
          continue;
        }
        
        // Transform point
        var pt = fabric.util.transformPoint({x: x, y: y}, matrix);
        var dx = pointer.x - pt.x;
        var dy = pointer.y - pt.y;
        
        if (Math.sqrt(dx*dx + dy*dy) < radius) {
          return true;
        }
      }
    } catch(e) {}
    
    return false;
  }
  
  function hexToRgba(hex, alpha) {
    try {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    } catch(e) {
      return 'rgba(255,235,59,' + alpha + ')';
    }
  }
  
  function clearEditorsContent() {
    // V194: Clear content but keep transparent background for grid/lines
    if (quillEditor) {
      try { quillEditor.setText(''); } catch(e) {}
    }
    if (fabricCanvas) {
      try {
        fabricCanvas.clear();
        fabricCanvas.backgroundColor = 'transparent'; // V194: Keep transparent for grid
        fabricCanvas.renderAll();
      } catch(e) {}
    }
    // V194: Also clear widget
    if (widgetCanvas) {
      try {
        widgetCanvas.clear();
        widgetCanvas.backgroundColor = 'transparent';
        widgetCanvas.renderAll();
      } catch(e) {}
    }
    var widgetText = document.getElementById('widgetTextEditor');
    if (widgetText) {
      widgetText.innerHTML = '';
    }
    undoHistory = [];
  }
  
  // ═══════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════
  
  window.openNotesFullscreenV181 = function() {
    openFabricNotes();
  };
  
  window.openFabricNotes = function() {
    var ctx = getNoteContext();
    console.log('📝 V194: Opening notes for:', ctx ? ctx.key : 'no context');
    
    var modal = document.getElementById('fabricNotesModal');
    if (!modal) {
      console.error('❌ fabricNotesModal not found');
      return;
    }
    
    currentNoteContext = ctx;
    undoHistory = [];
    
    // V194: Update sample info strip
    updateSampleInfoStrip();
    
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
    
    // V194: Initialize and sync widget content to fullscreen
    setTimeout(function() {
      // Initialize Quill if needed
      if (!quillInitialized) {
        initQuillEditor();
      }
      
      // V194: Initialize fullscreen canvas fresh
      initFabricCanvas();
      
      // V194: Load notes from storage first
      loadNotesFromStorage();
      loadDrawingFromStorage();
      
      // V194: Sync widget text to fullscreen Quill
      var widgetText = document.getElementById('widgetTextEditor');
      if (widgetText && quillEditor) {
        var widgetContent = widgetText.innerHTML.trim();
        if (widgetContent && widgetContent !== '<br>' && widgetContent.length > 0) {
          console.log('📝 V194: Syncing widget text to fullscreen');
          quillEditor.root.innerHTML = widgetContent;
        }
      }
      
      // V194: Sync widget canvas to fullscreen canvas
      if (widgetCanvas && fabricCanvas) {
        var json = widgetCanvas.toJSON(['selectable', 'evented']);
        if (json && json.objects && json.objects.length > 0) {
          console.log('📝 V194: Syncing widget canvas to fullscreen, objects:', json.objects.length);
          fabricCanvas.loadFromJSON(json, function() {
            fabricCanvas.backgroundColor = 'transparent';
            fabricCanvas.renderAll();
          });
        }
      }
      
      // V194: Start on DRAW mode (default)
      switchFabricMode('draw');
      
    }, 250);
  };
  
  window.closeFabricNotes = function() {
    // V194: Use immediate save when closing
    immediateSaveNotes();
    
    var modal = document.getElementById('fabricNotesModal');
    if (modal) {
      modal.classList.remove('visible');
    }
    document.body.style.overflow = '';
    
    // V194: Sync fullscreen to widget
    syncToWidgetCanvas();
    
    console.log('✅ V194: Notes closed and saved to cloud');
  };
  
  window.saveFabricNotes = function() {
    // V192: Use immediate save for explicit save button
    var saved = immediateSaveNotes();
    if (saved !== false) {
      closeFabricNotes();
      if (typeof toast === 'function') toast('Note salvate');
    } else {
      if (typeof toast === 'function') toast('Errore nel salvataggio');
    }
  };
  
  // V197: Print notes function (A4 vertical layout)
  window.printNotes = function() {
    try {
      // Get current context
      var ctx = getNoteContext();
      if (!ctx) {
        if (typeof toast === 'function') toast('Nessun campione selezionato');
        return;
      }
      
      var t = typeof getTasting === 'function' ? getTasting() : null;
      var sampleName = 'Campione';
      if (t && ctx.sampleId) {
        var sample = (t.samples || []).find(function(s) { return String(s.id) === String(ctx.sampleId); });
        if (sample) sampleName = sample.codice || sample.name || ('Campione ' + ctx.sampleId);
      }
      
      // Get text content
      var textContent = '';
      if (quillEditor && quillEditor.root) {
        textContent = quillEditor.root.innerHTML;
      } else {
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText) textContent = widgetText.innerHTML;
      }
      
      // Get canvas image
      var canvasDataUrl = '';
      var activeCanvas = fabricCanvas || widgetCanvas;
      if (activeCanvas) {
        try {
          canvasDataUrl = activeCanvas.toDataURL({format: 'png', quality: 1.0});
        } catch(e) {}
      }
      
      // Create print window
      var printWindow = window.open('', '_blank');
      if (!printWindow) {
        if (typeof toast === 'function') toast('Popup bloccato - abilita i popup');
        return;
      }
      
      var tastingTitle = t ? t.title : 'Degustazione';
      var today = new Date().toLocaleDateString('it-IT');
      // V197: Build HTML using array join to avoid </ in script context
      var ct = '<' + '/'; // closing tag safe
      var html = [];
      html.push('<!DOCTYPE html><html><head><title>Note - ' + sampleName + ct + 'title>');
      html.push('<style>');
      html.push('@page { size: A4 portrait; margin: 20mm; }');
      html.push('* { box-sizing: border-box; }');
      html.push('body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }');
      html.push('.print-header { text-align: center; border-bottom: 2px solid #722F37; padding-bottom: 10px; margin-bottom: 20px; }');
      html.push('.print-header h1 { color: #722F37; margin: 0 0 5px 0; font-size: 24px; }');
      html.push('.print-header .subtitle { color: #666; font-size: 14px; }');
      html.push('.print-section { margin-bottom: 20px; }');
      html.push('.print-section-title { font-weight: bold; color: #722F37; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }');
      html.push('.print-text { font-size: 12px; line-height: 1.6; }');
      html.push('.print-canvas { text-align: center; }');
      html.push('.print-canvas img { max-width: 100%; height: auto; border: 1px solid #ddd; }');
      html.push('@media print { .no-print { display: none; } }');
      html.push(ct + 'style>');
      html.push(ct + 'head><body>');
      
      // Header
      html.push('<div class="print-header">');
      html.push('<h1>' + escHtml(sampleName) + ct + 'h1>');
      html.push('<div class="subtitle">' + escHtml(tastingTitle) + ' - ' + today + ct + 'div>');
      html.push(ct + 'div>');
      
      // Text section
      if (textContent && textContent.trim() && textContent !== '<p><br>' + ct + 'p>') {
        html.push('<div class="print-section">');
        html.push('<div class="print-section-title">\u{1F4DD} Appunti' + ct + 'div>');
        html.push('<div class="print-text">' + textContent + ct + 'div>');
        html.push(ct + 'div>');
      }
      
      // Canvas/drawing section
      if (canvasDataUrl) {
        html.push('<div class="print-section">');
        html.push('<div class="print-section-title">\u{1F58C}\uFE0F Disegno' + ct + 'div>');
        html.push('<div class="print-canvas"><img src="' + canvasDataUrl + '" >' + ct + 'div>');
        html.push(ct + 'div>');
      }
      
      html.push(ct + 'body>' + ct + 'html>');
      
      printWindow.document.write(html.join('\n'));
      printWindow.document.close();
      
      // Trigger print
      setTimeout(function() {
        printWindow.print();
      }, 500);
      
    } catch(e) {
      console.error('Print error:', e);
      if (typeof toast === 'function') toast('Errore stampa');
    }
  };
  
  function escHtml(str) {
    var s = String(str || '');
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/\u003c/g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;');
    return s;
  }
  
  window.clearFabricNotes = function() {
    if (!confirm('Cancellare tutte le note (testo e disegno)?')) return;
    
    clearEditorsContent();
    immediateSaveNotes();
    
    if (typeof toast === 'function') toast('Note cancellate');
  };
  
  // V192: New iOS-style mode switch with auto-save
  window.switchFabricMode = function(mode) {
    console.log('📑 V192: Switching to mode:', mode);
    
    // V192: Use immediate save when switching modes
    if (currentMode !== mode) {
      immediateSaveNotes();
    }
    
    currentMode = mode;
    
    // Update switch buttons
    document.querySelectorAll('.fabric-notes-switch-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.mode === mode) btn.classList.add('active');
    });
    
    // Update panels
    document.querySelectorAll('.fabric-notes-panel').forEach(function(panel) {
      panel.classList.remove('active');
    });
    
    if (mode === 'text') {
      document.getElementById('fabricTextPanel').classList.add('active');
    } else {
      document.getElementById('fabricDrawPanel').classList.add('active');
      
      setTimeout(function() {
        var success = initFabricCanvas();
        if (success) {
          loadDrawingFromStorage();
        }
      }, 100);
    }
  };
  
  // Keep old function for compatibility
  window.switchFabricTab = function(tab) {
    switchFabricMode(tab);
  };
  
  window.setFabricTool = function(tool) {
    currentTool = tool;
    
    document.querySelectorAll('.fabric-tool-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.tool === tool) btn.classList.add('active');
    });
    
    var colorsGroup = document.getElementById('fabricColorsGroup');
    var highlighterColors = document.getElementById('fabricHighlighterColors');
    
    if (tool === 'highlighter') {
      if (colorsGroup) colorsGroup.style.display = 'none';
      if (highlighterColors) highlighterColors.style.display = 'flex';
    } else {
      if (colorsGroup) colorsGroup.style.display = 'flex';
      if (highlighterColors) highlighterColors.style.display = 'none';
    }
    
    updateBrush();
  };
  
  window.setFabricColor = function(color) {
    currentColor = color;
    
    document.querySelectorAll('#fabricColorsGroup .fabric-color-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.color === color) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricHighlighterColor = function(color) {
    currentHighlighterColor = color;
    
    document.querySelectorAll('#fabricHighlighterColors .fabric-color-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.hcolor === color) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricStroke = function(size) {
    currentStroke = size;
    
    document.querySelectorAll('.fabric-stroke-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (parseInt(btn.dataset.stroke) === size) btn.classList.add('active');
    });
    
    updateBrush();
  };
  
  window.setFabricPaper = function(type) {
    currentPaper = type;
    
    // V191: Apply paper class to wrap elements
    var fullscreenWrap = document.getElementById('fabricCanvasWrap');
    var widgetWrap = document.getElementById('widgetCanvasWrap');
    
    [fullscreenWrap, widgetWrap].forEach(function(wrap) {
      if (wrap) {
        wrap.classList.remove('paper-lined', 'paper-grid', 'paper-blank');
        wrap.classList.add('paper-' + type);
      }
    });
    
    document.querySelectorAll('.fabric-paper-btn').forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.dataset.paper === type) btn.classList.add('active');
    });
  };
  
  // ═══════════════════════════════════════════════════════════════
  // V191: Widget Canvas Initialization
  // ═══════════════════════════════════════════════════════════════
  
  function initWidgetCanvas() {
    if (widgetCanvas) {
      try { widgetCanvas.dispose(); } catch(e) {}
      widgetCanvas = null;
    }
    
    var canvasEl = document.getElementById('widgetDrawCanvas');
    if (!canvasEl) return false;
    
    // V191: Widget canvas at full size, CSS scales to 70%
    canvasEl.width = CANVAS_WIDTH;
    canvasEl.height = CANVAS_HEIGHT;
    
    try {
      widgetCanvas = new fabric.Canvas('widgetDrawCanvas', {
        isDrawingMode: true,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 'transparent',
        selection: false,
        renderOnAddRemove: true
      });
      
      widgetCanvas.freeDrawingBrush = new fabric.PencilBrush(widgetCanvas);
      widgetCanvas.freeDrawingBrush.color = currentColor;
      widgetCanvas.freeDrawingBrush.width = STROKE_SIZES[currentStroke] || 2;
      widgetCanvas.freeDrawingBrush.limitedToCanvasSize = true;
      
      // V196: Setup object-based eraser for widget
      setupEraserMode(widgetCanvas);
      
      // V196: Use immediate save for canvas strokes
      widgetCanvas.on('path:created', function() {
        queueNotesAutoSave();
        // Also sync to fullscreen if open
        syncWidgetToFullscreen();
      });
      
      // Update wrapper size for CSS scale
      var wrap = document.getElementById('widgetCanvasWrap');
      if (wrap) {
        wrap.style.width = CANVAS_WIDTH + 'px';
        wrap.style.height = CANVAS_HEIGHT + 'px';
      }
      
      widgetCanvas.renderAll();
      widgetInitialized = true;
      console.log('✅ V196: Widget canvas initialized');
      return true;
    } catch(e) {
      console.error('Widget canvas init error:', e);
      return false;
    }
  }
  
  function initWidgetTextEditor() {
    var editor = document.getElementById('widgetTextEditor');
    if (!editor) return;
    
    // V197: Debounced save for text input - skip during sync refresh
    editor.addEventListener('input', function() {
      if (__isRefreshing) return; // V197: Don't auto-save during sync refresh
      debouncedSaveNotes();
      // Sync to fullscreen Quill if open
      if (quillEditor && document.getElementById('fabricNotesModal').classList.contains('visible')) {
        quillEditor.root.innerHTML = editor.innerHTML;
      }
    });
    
    console.log('✅ V192: Widget text editor initialized');
  }

function selectGlobalTaster(id, name) {
    selectedGlobalTaster = {id: id, name: name};
    localStorage.setItem('selectedGlobalTaster', JSON.stringify(selectedGlobalTaster));
    const sp = document.getElementById("splashScreen");
    if (sp) {
      sp.classList.add("hide");
      setTimeout(function() { sp.style.display = "none"; }, 500);
    }
    const sel = document.getElementById('tasterSelect');
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    }
  }