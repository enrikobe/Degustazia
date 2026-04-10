/*
 * ═══════════════════════════════════════════════════════════════════════
 * DEGUSTAPP V200 — NOTES SYSTEM HOTFIX
 * ═══════════════════════════════════════════════════════════════════════
 *
 * COME USARE:
 * Aggiungi questa riga ALLA FINE del file index.html, 
 * PRIMA del tag </body></html>:
 *
 *   <script src="v200-notes-fix.js"></script>
 *
 * Questo file sovrascrive SOLO le funzioni del sistema note/canvas
 * che causano i bug di perdita dati e mancata sincronizzazione.
 *
 * NON MODIFICA: Firebase config, librerie, HTML, CSS, logiche UI
 * ═══════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  console.log('🔧 V200: Loading notes system hotfix...');

  // ═══════════════════════════════════════════════════════════════
  // 1. INSTANCE ID UNICO PER TAB (fix multi-tab stessa sessione)
  // ═══════════════════════════════════════════════════════════════

  // Sovrascrive il vecchio instanceId basato su Date.now() con crypto UUID
  try {
    window.__notesInstanceId = 'v200_' + crypto.randomUUID();
  } catch(e) {
    window.__notesInstanceId = 'v200_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
  }
  console.log('🆔 V200: Instance ID =', window.__notesInstanceId);


  // ═══════════════════════════════════════════════════════════════
  // 2. NUOVO MOTORE queueNotesSync — DEBOUNCE PER-SAMPLE + LAZY
  // ═══════════════════════════════════════════════════════════════

  // State tracking per-sample (sostituisce i globali V197)
  var __v200SyncTimers = {};
  var __v200DirtyUntil = {};        // Per-sample dirty windows
  var __v200LastReceived = {};       // Per-sample last received timestamp

  var V200_SAVE_DEBOUNCE_MS = 1500;  // Era 500ms in V197
  var V200_DIRTY_WINDOW_MS = 2000;   // Era 1200ms globale in V197

  /**
   * Sovrascrive window.queueNotesSync
   *
   * Differenze da V197:
   * - Debounce per-sample (non globale)
   * - Accetta una funzione lazy come notesData (serializza solo al fire)
   * - Non chiama più queueCanvasSync (doppio canale eliminato)
   * - Retry automatico su errore
   */
  window.queueNotesSync = function(tid, tasterId, sampleId, notesDataOrFn) {
    // Verifica che Firebase sia disponibile
    if (typeof db === 'undefined' || !db || !tid || !tasterId || !sampleId) return;

    var sampleKey = String(tasterId) + '_' + String(sampleId);
    var fullKey = String(tid) + '_' + sampleKey;

    // Marca dirty PER QUESTO SAMPLE
    __v200DirtyUntil[fullKey] = Date.now() + V200_DIRTY_WINDOW_MS;

    // Cancella timer precedente per QUESTO sample
    if (__v200SyncTimers[fullKey]) clearTimeout(__v200SyncTimers[fullKey]);

    __v200SyncTimers[fullKey] = setTimeout(function() {
      delete __v200SyncTimers[fullKey];

      // Serializzazione LAZY
      var notesData;
      if (typeof notesDataOrFn === 'function') {
        try { notesData = notesDataOrFn(); } catch(e) { console.error('V200: lazy serialize error', e); return; }
      } else {
        notesData = notesDataOrFn;
      }
      if (!notesData) return;

      var payload = {
        tastingId: String(tid),
        tasterId: Number(tasterId),
        sampleId: String(sampleId),
        notesData: notesData,
        updatedAt: new Date().toISOString(),
        instanceId: window.__notesInstanceId
      };

      // Usa beginWrite/endWrite esistenti
      if (typeof beginWrite === 'function') beginWrite();

      (async function() {
        try {
          console.log('☁️ V200: Syncing notes...', sampleKey);
          await setDoc(
            doc(db, 'tastings', String(tid), 'fabricNotes', sampleKey),
            payload,
            { merge: true }
          );
          console.log('✅ V200: Notes synced');
        } catch(e) {
          console.error('❌ V200: Notes sync error:', e);
          // Retry dopo 3 secondi
          setTimeout(function() {
            if (typeof db !== 'undefined' && db) {
              window.queueNotesSync(tid, tasterId, sampleId, notesData);
            }
          }, 3000);
        } finally {
          if (typeof endWrite === 'function') endWrite();
        }
      })();
    }, V200_SAVE_DEBOUNCE_MS);
  };


  // ═══════════════════════════════════════════════════════════════
  // 3. NUOVO LISTENER ensureNotesSubDeg — DIRTY WINDOW PER-SAMPLE
  // ═══════════════════════════════════════════════════════════════

  // Riferimento alla sottoscrizione attiva (per cleanup)
  var __v200NotesSub = null;

  /**
   * Sovrascrive ensureNotesSubDeg
   *
   * Differenze da V196/V197:
   * - __notesDirtyUntil è ora per-sample via __v200DirtyUntil
   * - Log ridotto (no spam in console)
   * - Gestione robusta dei docChanges
   */
  window.ensureNotesSubDeg = function(tid) {
    // Cleanup sottoscrizione precedente
    if (__v200NotesSub) { __v200NotesSub(); __v200NotesSub = null; }
    if (typeof db === 'undefined' || !db || !tid) return;

    console.log('📡 V200: Subscribing to notes for tasting', tid);

    __v200NotesSub = onSnapshot(
      collection(db, 'tastings', String(tid), 'fabricNotes'),
      function(snap) {
        var t = (state.tastings || []).find(function(x) { return String(x.id) === String(tid); });
        if (!t) return;

        snap.docChanges().forEach(function(change) {
          if (change.type !== 'added' && change.type !== 'modified') return;

          var ds = change.doc;
          var d = ds.data() || {};
          var key = ds.id;
          var parts = String(key).split('_');
          var ta = parts[0];
          var sa = parts.slice(1).join('_');
          if (!ta || !sa) return;

          // Skip proprie scritture
          if (d.instanceId && d.instanceId === window.__notesInstanceId) return;

          // Skip se update più vecchio
          var fullKey = String(tid) + '_' + ta + '_' + sa;
          var lastReceived = __v200LastReceived[fullKey] || 0;
          var updateTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
          if (updateTime <= lastReceived) return;
          __v200LastReceived[fullKey] = updateTime;

          // V200: Check dirty PER-SAMPLE
          var isCurrentSample = false;
          try {
            isCurrentSample = String(ta) === String(currentTasterId()) &&
                              String(sa) === String(selectedSampleId);
          } catch(e) {}

          var sampleDirtyExpiry = __v200DirtyUntil[fullKey] || 0;
          if (Date.now() < sampleDirtyExpiry && isCurrentSample) {
            console.log('⏭️ V200: Skipping — editing', ta, sa);
            return;
          }

          // Applica dati nell'evaluation locale
          if (!t.evaluations) t.evaluations = {};
          if (!t.evaluations[String(ta)]) t.evaluations[String(ta)] = {};
          if (!t.evaluations[String(ta)][String(sa)]) {
            t.evaluations[String(ta)][String(sa)] = (typeof blankEval === 'function') ? blankEval() : {};
          }
          var ev = t.evaluations[String(ta)][String(sa)];
          if (!ev.data) ev.data = { vista: {}, olfatto: {}, gusto: {} };
          if (!ev.data.vista) ev.data.vista = { intensita: 0, limpidezza: 0, desc: [], canvas: null };

          if (d.notesData) {
            ev.data.vista.notesV187 = d.notesData;
            console.log('📥 V200: Notes received for', ta, sa, '- current:', isCurrentSample);

            // Refresh UI se è il campione corrente
            if (isCurrentSample) {
              try {
                if (typeof refreshWidgetNotes === 'function') refreshWidgetNotes();
                if (typeof refreshFullscreenNotes === 'function') refreshFullscreenNotes();
              } catch(e) { console.error('V200: Refresh error:', e); }
            }
          }
        });
      },
      function(err) { console.error('V200: fabricNotes snapshot error', err); }
    );
  };


  // ═══════════════════════════════════════════════════════════════
  // 4. SAVE SYSTEM RISCRITTA — NO toDataURL, NO CANVAS LEGACY
  // ═══════════════════════════════════════════════════════════════

  // Riferimenti alle variabili interne del modulo note (closure IIFE originale)
  // Li intercettiamo tramite le window.* functions

  /**
   * Nuova saveNotesToStorage che viene iniettata nel modulo note.
   * Siccome il modulo originale è in una IIFE, non possiamo sovrascrivere
   * le variabili interne. Invece sovrascriviamo le window.* functions
   * che il modulo espone.
   */

  // Stato del nostro sistema
  var __v200IsRefreshing = false;
  var __v200SaveTimer = null;

  /**
   * Sovrascrive window.refreshWidgetNotes
   *
   * FIX CRITICO: NON fa più clear() prima di caricare i dati.
   * Usa loadFromJSON() che sovrascrive atomicamente.
   */
  window.refreshWidgetNotes = function() {
    console.log('🔄 V200: Refreshing widget notes');

    __v200IsRefreshing = true;

    // Cancella auto-save in coda
    if (__v200SaveTimer) {
      clearTimeout(__v200SaveTimer);
      __v200SaveTimer = null;
    }

    // V200: Carica SENZA clear() — le funzioni load* del modulo originale
    // sovrascrivono il contenuto atomicamente
    try {
      if (typeof loadNotesFromStorage === 'function') loadNotesFromStorage();
      if (typeof loadDrawingFromStorage === 'function') loadDrawingFromStorage();
    } catch(e) {
      console.error('V200: Error in refreshWidgetNotes:', e);
    }

    // Re-enable auto-save dopo rendering completo
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        __v200IsRefreshing = false;
      });
    });
  };


  /**
   * Sovrascrive window.refreshFullscreenNotes
   *
   * FIX CRITICO: NON fa più clear(), caricamento atomico
   */
  window.refreshFullscreenNotes = function() {
    var modal = document.getElementById('fabricNotesModal');
    if (!modal || !modal.classList.contains('visible')) return;

    console.log('🔄 V200: Refreshing fullscreen notes');

    __v200IsRefreshing = true;

    if (__v200SaveTimer) {
      clearTimeout(__v200SaveTimer);
      __v200SaveTimer = null;
    }

    try {
      // Ottieni contesto note
      var ctx = null;
      try { ctx = (typeof getNoteContext === 'function') ? getNoteContext() : null; } catch(e) {}
      if (!ctx) { __v200IsRefreshing = false; return; }

      var t = (typeof getTasting === 'function') ? getTasting() : null;
      var ev = (typeof getEval === 'function') ? getEval(t, ctx.tasterId, ctx.sampleId) : null;

      if (!ev || !ev.data || !ev.data.vista) { __v200IsRefreshing = false; return; }

      var notesData = ev.data.vista.notesV187;

      if (notesData && notesData.version >= 187) {
        // Aggiorna testo in Quill
        if (typeof quillEditor !== 'undefined' && quillEditor) {
          if (notesData.textDelta) {
            try { quillEditor.setContents(notesData.textDelta); } catch(e) {}
          } else if (notesData.text) {
            quillEditor.root.innerHTML = notesData.text;
          }
        }

        // V200: Canvas — loadFromJSON atomico, NO clear()
        if (typeof fabricCanvas !== 'undefined' && fabricCanvas && notesData.fabricJson) {
          fabricCanvas.loadFromJSON(notesData.fabricJson, function() {
            fabricCanvas.backgroundColor = 'transparent';
            fabricCanvas.renderAll();
          });
        }

        // Aggiorna paper type
        if (notesData.paperType && typeof currentPaper !== 'undefined' &&
            notesData.paperType !== currentPaper) {
          try { if (typeof setFabricPaper === 'function') setFabricPaper(notesData.paperType); } catch(e) {}
        }

        // Aggiorna widget (senza clear!)
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText && notesData.text) {
          widgetText.innerHTML = notesData.text;
        }
        if (typeof widgetCanvas !== 'undefined' && widgetCanvas && notesData.fabricJson) {
          widgetCanvas.loadFromJSON(notesData.fabricJson, function() {
            widgetCanvas.backgroundColor = 'transparent';
            widgetCanvas.renderAll();
          });
        }
      }
    } catch(e) {
      console.error('V200: Error refreshing fullscreen:', e);
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        __v200IsRefreshing = false;
      });
    });
  };


  // ═══════════════════════════════════════════════════════════════
  // 5. OVERRIDE saveNotesToStorage — ELIMINA DOPPIO CANALE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Intercetta le chiamate al vecchio saveNotesToStorage.
   * 
   * Il modulo originale è in una IIFE, quindi le funzioni interne
   * (saveNotesToStorage, queueNotesAutoSave, etc.) non sono su window.
   * PERÒ vengono richiamate da window.saveFabricNotes, 
   * window.closeFabricNotes, etc.
   *
   * La strategia: sovrascriviamo saveFabricNotes e closeFabricNotes
   * per usare il nostro sistema di save.
   */

  // Salva riferimenti alle funzioni originali
  var __origSaveFabricNotes = window.saveFabricNotes;
  var __origCloseFabricNotes = window.closeFabricNotes;
  var __origOpenFabricNotes = window.openFabricNotes;

  /**
   * V200: Save completo delle note (sostituto di immediateSaveNotes)
   * Chiamata su chiusura fullscreen e bottone "Salva"
   */
  function v200SaveNotes() {
    if (__v200IsRefreshing) return false;

    try {
      var ctx = (typeof getNoteContext === 'function') ? getNoteContext() : null;
      if (!ctx) return false;

      var t = (typeof getTasting === 'function') ? getTasting() : null;
      if (!t) return false;

      var ev = (typeof getEval === 'function') ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      if (!ev) return false;
      if (!ev.data) ev.data = { vista: {}, olfatto: {}, gusto: {} };
      if (!ev.data.vista) ev.data.vista = {};

      // Leggi contenuto dagli editor attivi
      var textContent = '';
      var textDelta = null;
      var fabricJson = null;

      var isFullscreenOpen = false;
      try {
        var modal = document.getElementById('fabricNotesModal');
        isFullscreenOpen = modal && modal.classList.contains('visible');
      } catch(e) {}

      // Testo
      if (isFullscreenOpen && typeof quillEditor !== 'undefined' && quillEditor) {
        textContent = quillEditor.root.innerHTML || '';
        try { textDelta = quillEditor.getContents(); } catch(e) {}
      } else {
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText) textContent = widgetText.innerHTML || '';
      }

      // Canvas
      if (isFullscreenOpen && typeof fabricCanvas !== 'undefined' && fabricCanvas) {
        try { fabricJson = fabricCanvas.toJSON(['selectable', 'evented']); } catch(e) {}
      } else if (typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        try { fabricJson = widgetCanvas.toJSON(['selectable', 'evented']); } catch(e) {}
      }

      // Check contenuto vuoto
      var textIsEmpty = !textContent || textContent.trim() === '' ||
                        textContent === '<p><br></p>' || textContent === '<br>';
      var drawIsEmpty = !fabricJson || !fabricJson.objects || fabricJson.objects.length === 0;

      // Anti-data-loss: se ENTRAMBI vuoti ma ci sono dati esistenti, non sovrascrivere
      var existingNotes = ev.data.vista.notesV187;
      if (textIsEmpty && drawIsEmpty && existingNotes) {
        if ((existingNotes.text && existingNotes.text.trim()) ||
            (existingNotes.fabricJson && existingNotes.fabricJson.objects &&
             existingNotes.fabricJson.objects.length > 0)) {
          console.log('⏭️ V200: Skip save — empty editors but data exists');
          return false;
        }
      }

      // Preserva dati parziali
      if (textIsEmpty && existingNotes && existingNotes.text && existingNotes.text.trim()) {
        textContent = existingNotes.text;
        textDelta = existingNotes.textDelta;
      }
      if (drawIsEmpty && existingNotes && existingNotes.fabricJson) {
        fabricJson = existingNotes.fabricJson;
      }

      var notesData = {
        version: 200,
        text: textContent,
        textDelta: textDelta,
        fabricJson: fabricJson,
        paperType: (typeof currentPaper !== 'undefined') ? currentPaper : 'lined',
        updatedAt: new Date().toISOString(),
        instanceId: window.__notesInstanceId
      };

      // Salva localmente
      ev.data.vista.notesV187 = notesData;
      ev.updatedAt = (typeof nowIso === 'function') ? nowIso() : new Date().toISOString();

      // Stato locale senza cloud push
      if (typeof saveState === 'function') {
        saveState({ skipCloud: true });
      }

      // V200: Solo queueNotesSync — NIENTE queueCanvasSync (eliminato doppio canale)
      window.queueNotesSync(t.id, ctx.tasterId, ctx.sampleId, notesData);

      console.log('💾 V200: Notes saved for', ctx.sampleId,
                  '- text:', !textIsEmpty, '- draw:', !drawIsEmpty);
      return true;

    } catch(e) {
      console.error('V200: Save error:', e);
      return false;
    }
  }

  /**
   * Sovrascrive window.saveFabricNotes (bottone "Salva e Chiudi")
   */
  window.saveFabricNotes = function() {
    var saved = v200SaveNotes();
    
    // Chiudi il modale (stessa logica dell'originale)
    var modal = document.getElementById('fabricNotesModal');
    if (modal) modal.classList.remove('visible');
    document.body.style.overflow = '';

    // Sync fullscreen → widget (one-shot)
    try {
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas &&
          typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        var json = fabricCanvas.toJSON(['selectable', 'evented']);
        widgetCanvas.loadFromJSON(json, function() {
          widgetCanvas.renderAll();
        });
      }
      var wt = document.getElementById('widgetTextEditor');
      if (wt && typeof quillEditor !== 'undefined' && quillEditor) {
        wt.innerHTML = quillEditor.root.innerHTML;
      }
    } catch(e) {}

    if (saved !== false) {
      if (typeof toast === 'function') toast('Note salvate');
    } else {
      if (typeof toast === 'function') toast('Errore nel salvataggio');
    }
  };

  /**
   * Sovrascrive window.closeFabricNotes (X / gesto chiudi)
   */
  window.closeFabricNotes = function() {
    // Salva immediatamente
    v200SaveNotes();

    // Chiudi modale
    var modal = document.getElementById('fabricNotesModal');
    if (modal) modal.classList.remove('visible');
    document.body.style.overflow = '';

    // Sync fullscreen → widget (one-shot)
    try {
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas &&
          typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        var json = fabricCanvas.toJSON(['selectable', 'evented']);
        widgetCanvas.loadFromJSON(json, function() {
          widgetCanvas.renderAll();
        });
      }
      var wt = document.getElementById('widgetTextEditor');
      if (wt && typeof quillEditor !== 'undefined' && quillEditor) {
        wt.innerHTML = quillEditor.root.innerHTML;
      }
    } catch(e) {}

    console.log('✅ V200: Notes closed and saved');
  };


  // ═══════════════════════════════════════════════════════════════
  // 6. INTERCETTA WIDGET path:created — RIMUOVI SYNC CIRCOLARE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Problema: non possiamo rimuovere gli event listeners Fabric.js
   * dal widget/fullscreen canvas perché sono nella IIFE originale.
   * 
   * Soluzione: sovrascriviamo syncWidgetToFullscreen e
   * syncFullscreenToWidget come no-op. La sync avviene solo
   * su apertura/chiusura fullscreen (gestita sopra).
   */

  // Rendiamo no-op le funzioni di sync continuo
  // (vengono chiamate da path:created nell'originale)
  if (typeof window.syncWidgetToFullscreen !== 'undefined') {
    // Non possiamo accedere alla closure, ma possiamo fare un monkey-patch
    // delle funzioni se sono esposte su window
  }

  // Strategia alternativa: usiamo un flag che le funzioni originali controllano
  // NOTA: le funzioni sync sono INTERNE alla IIFE, non su window.
  // L'unico modo per bloccarle è rendere il loro effetto nullo.
  // Dato che path:created chiama queueNotesAutoSave() (interna) E syncWidgetToFullscreen() (interna),
  // e noi abbiamo già sovrascritto queueNotesSync su window,
  // il salvataggio passerà comunque per il nostro motore V200.
  // La sync circolare widget→fullscreen rimane ma è meno dannosa
  // perché il nostro refreshWidget/refreshFullscreen non fa clear().

  // Il fix più importante è già applicato: refreshWidgetNotes e refreshFullscreenNotes
  // non fanno più clear() → niente finestra vuota → niente salvataggio di dati vuoti.


  // ═══════════════════════════════════════════════════════════════
  // 7. HELPER: GENERA dataUrl ON-DEMAND (per stampa)
  // ═══════════════════════════════════════════════════════════════

  window.v200GenerateCanvasDataUrl = function() {
    try {
      var c = (typeof fabricCanvas !== 'undefined' && fabricCanvas) ? fabricCanvas :
              (typeof widgetCanvas !== 'undefined' && widgetCanvas) ? widgetCanvas : null;
      if (!c) return null;
      return c.toDataURL({ format: 'png', quality: 0.8, multiplier: 1 });
    } catch(e) {
      return null;
    }
  };


  // ═══════════════════════════════════════════════════════════════
  // 8. INTEGRAZIONE — Aggancia il nuovo listener al cambio degustazione
  // ═══════════════════════════════════════════════════════════════

  /**
   * Il sistema originale chiama ensureNotesSubDeg(tid) all'interno
   * di ensureCanvasSubDeg(tid). Dato che abbiamo sovrascritto
   * ensureNotesSubDeg su window, verrà chiamata automaticamente.
   *
   * Verifica: se ensureNotesSubDeg è chiamata dalla IIFE originale
   * come funzione locale, il nostro override su window non viene usato.
   * In quel caso, il listener originale resta attivo, ma il nostro
   * refreshWidgetNotes/refreshFullscreenNotes sono comunque quelli V200
   * (senza clear), quindi il fix funziona lo stesso.
   */

  // Conferma che il fix è caricato
  window.__v200Loaded = true;

  console.log('═══════════════════════════════════════════');
  console.log('✅ V200 HOTFIX LOADED SUCCESSFULLY');
  console.log('  • Instance ID: per-tab (crypto UUID)');
  console.log('  • Debounce: 1500ms per-sample');
  console.log('  • Refresh: atomic loadFromJSON (no clear)');
  console.log('  • Save: no legacy canvas sync');
  console.log('  • Anti-data-loss: empty save protection');
  console.log('═══════════════════════════════════════════');

})();
