/*
 * ═══════════════════════════════════════════════════════════════════════
 * DEGUSTAPP V201 — NOTES SYSTEM COMPLETE FIX
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sostituisce v200-notes-fix.js
 *
 * COME USARE:
 * 1. Rimuovi il vecchio:  <script src="v200-notes-fix.js"></script>
 * 2. Aggiungi ALLA FINE del file index.html, PRIMA di </body></html>:
 *    <script src="v201-notes-fix.js"></script>
 *
 * FIX INCLUSI:
 * - V200: Perdita dati canvas, sync multi-istanza, debounce per-sample
 * - V201-A: Note TESTO non salvate / non sincronizzate multi-istanza
 * - V201-B: Gomma (eraser) non funziona
 * - V201-C: Disegni sfocati al ricaricamento (risoluzione canvas)
 *
 * NON MODIFICA: Firebase config, librerie, HTML, CSS, logiche UI
 * ═══════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  console.log('🔧 V201: Loading complete notes system fix...');

  // ═══════════════════════════════════════════════════════════════
  // 1. INSTANCE ID UNICO PER TAB
  // ═══════════════════════════════════════════════════════════════
  try {
    window.__notesInstanceId = 'v201_' + crypto.randomUUID();
  } catch(e) {
    window.__notesInstanceId = 'v201_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. STATE TRACKING PER-SAMPLE
  // ═══════════════════════════════════════════════════════════════
  var __v201SyncTimers = {};
  var __v201DirtyUntil = {};
  var __v201LastReceived = {};
  var __v201IsRefreshing = false;
  var __v201SaveTimer = null;

  var V201_SAVE_DEBOUNCE_MS = 1500;
  var V201_DIRTY_WINDOW_MS = 2000;

  // ═══════════════════════════════════════════════════════════════
  // 3. queueNotesSync — DEBOUNCE PER-SAMPLE + LAZY
  // ═══════════════════════════════════════════════════════════════
  window.queueNotesSync = function(tid, tasterId, sampleId, notesDataOrFn) {
    if (typeof db === 'undefined' || !db || !tid || !tasterId || !sampleId) return;

    var sampleKey = String(tasterId) + '_' + String(sampleId);
    var fullKey = String(tid) + '_' + sampleKey;

    __v201DirtyUntil[fullKey] = Date.now() + V201_DIRTY_WINDOW_MS;

    if (__v201SyncTimers[fullKey]) clearTimeout(__v201SyncTimers[fullKey]);

    __v201SyncTimers[fullKey] = setTimeout(function() {
      delete __v201SyncTimers[fullKey];

      var notesData;
      if (typeof notesDataOrFn === 'function') {
        try { notesData = notesDataOrFn(); } catch(e) { return; }
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

      if (typeof beginWrite === 'function') beginWrite();

      (async function() {
        try {
          await setDoc(
            doc(db, 'tastings', String(tid), 'fabricNotes', sampleKey),
            payload,
            { merge: true }
          );
          console.log('✅ V201: Notes synced', sampleKey);
        } catch(e) {
          console.error('❌ V201: Sync error:', e);
          setTimeout(function() {
            if (typeof db !== 'undefined' && db) {
              window.queueNotesSync(tid, tasterId, sampleId, notesData);
            }
          }, 3000);
        } finally {
          if (typeof endWrite === 'function') endWrite();
        }
      })();
    }, V201_SAVE_DEBOUNCE_MS);
  };

  // ═══════════════════════════════════════════════════════════════
  // 4. LISTENER onSnapshot — DIRTY WINDOW PER-SAMPLE
  // ═══════════════════════════════════════════════════════════════
  var __v201NotesSub = null;

  window.ensureNotesSubDeg = function(tid) {
    if (__v201NotesSub) { __v201NotesSub(); __v201NotesSub = null; }
    if (typeof db === 'undefined' || !db || !tid) return;

    __v201NotesSub = onSnapshot(
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

          if (d.instanceId && d.instanceId === window.__notesInstanceId) return;

          var fullKey = String(tid) + '_' + ta + '_' + sa;
          var lastReceived = __v201LastReceived[fullKey] || 0;
          var updateTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
          if (updateTime <= lastReceived) return;
          __v201LastReceived[fullKey] = updateTime;

          var isCurrentSample = false;
          try {
            isCurrentSample = String(ta) === String(currentTasterId()) &&
                              String(sa) === String(selectedSampleId);
          } catch(e) {}

          var sampleDirtyExpiry = __v201DirtyUntil[fullKey] || 0;
          if (Date.now() < sampleDirtyExpiry && isCurrentSample) return;

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
            console.log('📥 V201: Notes received for', ta, sa);

            if (isCurrentSample) {
              try {
                if (typeof refreshWidgetNotes === 'function') refreshWidgetNotes();
                if (typeof refreshFullscreenNotes === 'function') refreshFullscreenNotes();
              } catch(e) {}
            }
          }
        });
      },
      function(err) { console.error('V201: snapshot error', err); }
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // 5. v201SaveNotes — SALVA TESTO + DISEGNO + SYNC FIREBASE
  //    FIX V201-A: il testo ora viene letto correttamente e inviato
  // ═══════════════════════════════════════════════════════════════
  function v201SaveNotes() {
    if (__v201IsRefreshing) return false;

    try {
      var ctx = (typeof getNoteContext === 'function') ? getNoteContext() : null;
      if (!ctx) return false;

      var t = (typeof getTasting === 'function') ? getTasting() : null;
      if (!t) return false;

      var ev = (typeof getEval === 'function') ? getEval(t, ctx.tasterId, ctx.sampleId) : null;
      if (!ev) return false;
      if (!ev.data) ev.data = { vista: {}, olfatto: {}, gusto: {} };
      if (!ev.data.vista) ev.data.vista = {};

      // ── Leggi TESTO ──
      var textContent = '';
      var textDelta = null;

      var isFullscreenOpen = false;
      try {
        var modal = document.getElementById('fabricNotesModal');
        isFullscreenOpen = modal && modal.classList.contains('visible');
      } catch(e) {}

      // V201-A FIX: Leggi il testo da ENTRAMBE le sorgenti e prendi quella non vuota
      var quillText = '';
      var widgetTextEl = document.getElementById('widgetTextEditor');
      var widgetTextContent = widgetTextEl ? (widgetTextEl.innerHTML || '') : '';

      try {
        if (typeof quillEditor !== 'undefined' && quillEditor && quillEditor.root) {
          quillText = quillEditor.root.innerHTML || '';
          textDelta = quillEditor.getContents();
        }
      } catch(e) {}

      // Se fullscreen è aperto, preferisci Quill; altrimenti widget
      if (isFullscreenOpen && quillText) {
        textContent = quillText;
      } else if (widgetTextContent) {
        textContent = widgetTextContent;
        textDelta = null; // niente delta dal contenteditable
      } else {
        textContent = quillText || widgetTextContent || '';
      }

      // ── Leggi CANVAS ──
      var fabricJson = null;

      if (isFullscreenOpen && typeof fabricCanvas !== 'undefined' && fabricCanvas) {
        try { fabricJson = fabricCanvas.toJSON(['selectable', 'evented']); } catch(e) {}
      } else if (typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        try { fabricJson = widgetCanvas.toJSON(['selectable', 'evented']); } catch(e) {}
      }

      // ── Check vuoto ──
      var emptyP = '<' + 'p><br><' + '/p>';
      var textIsEmpty = !textContent || textContent.trim() === '' ||
                        textContent === emptyP || textContent === '<br>';
      var drawIsEmpty = !fabricJson || !fabricJson.objects || fabricJson.objects.length === 0;

      // Anti-data-loss
      var existingNotes = ev.data.vista.notesV187;
      if (textIsEmpty && drawIsEmpty && existingNotes) {
        if ((existingNotes.text && existingNotes.text.trim()) ||
            (existingNotes.fabricJson && existingNotes.fabricJson.objects &&
             existingNotes.fabricJson.objects.length > 0)) {
          return false; // non sovrascrivere con dati vuoti
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
        version: 201,
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

      if (typeof saveState === 'function') {
        saveState({ skipCloud: true });
      }

      // Sync Firebase
      window.queueNotesSync(t.id, ctx.tasterId, ctx.sampleId, notesData);

      console.log('💾 V201: Saved — text:', !textIsEmpty, '- draw:', !drawIsEmpty);
      return true;

    } catch(e) {
      console.error('V201: Save error:', e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. REFRESH WIDGET + FULLSCREEN — NO CLEAR(), CARICA TESTO
  //    FIX V201-A: il testo viene caricato nel widget e nel Quill
  // ═══════════════════════════════════════════════════════════════

  window.refreshWidgetNotes = function() {
    __v201IsRefreshing = true;

    if (__v201SaveTimer) { clearTimeout(__v201SaveTimer); __v201SaveTimer = null; }

    // V201: Carica testo + disegno SENZA clear()
    try {
      // Leggi dati dall'evaluation (già aggiornata dal listener)
      var ctx = (typeof getNoteContext === 'function') ? getNoteContext() : null;
      if (ctx) {
        var t = (typeof getTasting === 'function') ? getTasting() : null;
        var ev = (typeof getEval === 'function' && t) ? getEval(t, ctx.tasterId, ctx.sampleId) : null;

        if (ev && ev.data && ev.data.vista && ev.data.vista.notesV187) {
          var nd = ev.data.vista.notesV187;

          // V201-A: Carica TESTO nel widget
          var widgetText = document.getElementById('widgetTextEditor');
          if (widgetText && nd.text) {
            widgetText.innerHTML = nd.text;
          }

          // V201-C: Carica DISEGNO nel widget canvas (atomico, no clear)
          if (typeof widgetCanvas !== 'undefined' && widgetCanvas && nd.fabricJson) {
            widgetCanvas.loadFromJSON(nd.fabricJson, function() {
              widgetCanvas.backgroundColor = 'transparent';
              widgetCanvas.renderAll();
            });
          }
        } else {
          // Nessun dato: fallback alle funzioni originali
          try { if (typeof loadNotesFromStorage === 'function') loadNotesFromStorage(); } catch(e) {}
          try { if (typeof loadDrawingFromStorage === 'function') loadDrawingFromStorage(); } catch(e) {}
        }
      }
    } catch(e) {
      console.error('V201: refreshWidget error:', e);
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        __v201IsRefreshing = false;
      });
    });
  };

  window.refreshFullscreenNotes = function() {
    var modal = document.getElementById('fabricNotesModal');
    if (!modal || !modal.classList.contains('visible')) return;

    __v201IsRefreshing = true;

    if (__v201SaveTimer) { clearTimeout(__v201SaveTimer); __v201SaveTimer = null; }

    try {
      var ctx = (typeof getNoteContext === 'function') ? getNoteContext() : null;
      if (!ctx) { __v201IsRefreshing = false; return; }

      var t = (typeof getTasting === 'function') ? getTasting() : null;
      var ev = (typeof getEval === 'function' && t) ? getEval(t, ctx.tasterId, ctx.sampleId) : null;

      if (!ev || !ev.data || !ev.data.vista) { __v201IsRefreshing = false; return; }

      var nd = ev.data.vista.notesV187;

      if (nd && nd.version >= 187) {
        // V201-A: Aggiorna TESTO nel Quill fullscreen
        if (typeof quillEditor !== 'undefined' && quillEditor) {
          if (nd.textDelta) {
            try { quillEditor.setContents(nd.textDelta); } catch(e) {}
          } else if (nd.text) {
            quillEditor.root.innerHTML = nd.text;
          }
        }

        // V201-C: Aggiorna CANVAS fullscreen (atomico)
        if (typeof fabricCanvas !== 'undefined' && fabricCanvas && nd.fabricJson) {
          fabricCanvas.loadFromJSON(nd.fabricJson, function() {
            fabricCanvas.backgroundColor = 'transparent';
            fabricCanvas.renderAll();
          });
        }

        if (nd.paperType && typeof currentPaper !== 'undefined' && nd.paperType !== currentPaper) {
          try { if (typeof setFabricPaper === 'function') setFabricPaper(nd.paperType); } catch(e) {}
        }

        // V201-A: Aggiorna anche WIDGET testo
        var widgetText = document.getElementById('widgetTextEditor');
        if (widgetText && nd.text) {
          widgetText.innerHTML = nd.text;
        }

        // V201-C: Aggiorna anche WIDGET canvas
        if (typeof widgetCanvas !== 'undefined' && widgetCanvas && nd.fabricJson) {
          widgetCanvas.loadFromJSON(nd.fabricJson, function() {
            widgetCanvas.backgroundColor = 'transparent';
            widgetCanvas.renderAll();
          });
        }
      }
    } catch(e) {
      console.error('V201: refreshFullscreen error:', e);
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        __v201IsRefreshing = false;
      });
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // 7. OVERRIDE saveFabricNotes / closeFabricNotes
  //    Usa v201SaveNotes che salva TESTO + DISEGNO
  // ═══════════════════════════════════════════════════════════════

  window.saveFabricNotes = function() {
    var saved = v201SaveNotes();

    var modal = document.getElementById('fabricNotesModal');
    if (modal) modal.classList.remove('visible');
    document.body.style.overflow = '';

    // One-shot fullscreen → widget
    try {
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas &&
          typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        var json = fabricCanvas.toJSON(['selectable', 'evented']);
        widgetCanvas.loadFromJSON(json, function() { widgetCanvas.renderAll(); });
      }
      var wt = document.getElementById('widgetTextEditor');
      if (wt && typeof quillEditor !== 'undefined' && quillEditor) {
        wt.innerHTML = quillEditor.root.innerHTML;
      }
    } catch(e) {}

    if (typeof toast === 'function') toast(saved !== false ? 'Note salvate' : 'Errore nel salvataggio');
  };

  window.closeFabricNotes = function() {
    v201SaveNotes();

    var modal = document.getElementById('fabricNotesModal');
    if (modal) modal.classList.remove('visible');
    document.body.style.overflow = '';

    try {
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas &&
          typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        var json = fabricCanvas.toJSON(['selectable', 'evented']);
        widgetCanvas.loadFromJSON(json, function() { widgetCanvas.renderAll(); });
      }
      var wt = document.getElementById('widgetTextEditor');
      if (wt && typeof quillEditor !== 'undefined' && quillEditor) {
        wt.innerHTML = quillEditor.root.innerHTML;
      }
    } catch(e) {}
  };

  // ═══════════════════════════════════════════════════════════════
  // 8. V201-A: HOOK WIDGET TEXT INPUT → AUTOSAVE + SYNC FIREBASE
  //    Il problema: initWidgetTextEditor() nella IIFE originale
  //    chiama debouncedSaveNotes() (interna) che chiama
  //    saveNotesToStorage() (interna) che usa queueNotesSync (window).
  //    MA saveNotesToStorage interna può NON leggere il testo
  //    dal widget perché preferisce quillEditor (fullscreen).
  //
  //    FIX: aggiungiamo un SECONDO listener sull'input del widget
  //    che triggera il nostro v201SaveNotes()
  // ═══════════════════════════════════════════════════════════════

  function hookWidgetTextInput() {
    var editor = document.getElementById('widgetTextEditor');
    if (!editor) {
      // Riprova tra 1s (il DOM potrebbe non essere pronto)
      setTimeout(hookWidgetTextInput, 1000);
      return;
    }

    // Evitiamo doppio hook
    if (editor.__v201Hooked) return;
    editor.__v201Hooked = true;

    editor.addEventListener('input', function() {
      if (__v201IsRefreshing) return;

      // Debounce del nostro save
      if (__v201SaveTimer) clearTimeout(__v201SaveTimer);
      __v201SaveTimer = setTimeout(function() {
        __v201SaveTimer = null;
        v201SaveNotes();
      }, V201_SAVE_DEBOUNCE_MS);
    });

    console.log('✅ V201: Widget text input hooked for sync');
  }

  // Hook anche il Quill fullscreen per il testo
  function hookQuillInput() {
    // Aspetta che quillEditor sia disponibile
    if (typeof quillEditor === 'undefined' || !quillEditor) {
      setTimeout(hookQuillInput, 2000);
      return;
    }

    if (quillEditor.__v201Hooked) return;
    quillEditor.__v201Hooked = true;

    quillEditor.on('text-change', function(delta, oldDelta, source) {
      if (source !== 'user') return;
      if (__v201IsRefreshing) return;

      if (__v201SaveTimer) clearTimeout(__v201SaveTimer);
      __v201SaveTimer = setTimeout(function() {
        __v201SaveTimer = null;
        v201SaveNotes();
      }, V201_SAVE_DEBOUNCE_MS);
    });

    console.log('✅ V201: Quill text-change hooked for sync');
  }

  // Avvia hook dopo che il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(hookWidgetTextInput, 500);
      setTimeout(hookQuillInput, 2000);
    });
  } else {
    setTimeout(hookWidgetTextInput, 500);
    setTimeout(hookQuillInput, 2000);
  }


  // ═══════════════════════════════════════════════════════════════
  // 9. V201-B: FIX GOMMA (ERASER)
  //    Problema: setupEraserMode usa isPointNearPath che confronta
  //    i punti del path con la posizione del mouse, ma il calcolo
  //    delle coordinate è sbagliato quando il canvas è scalato
  //    (transform: scale(0.85) nel widget, o dimensioni diverse
  //    nel fullscreen).
  //
  //    Inoltre updateBrush() setta isDrawingMode=false per la gomma,
  //    il che disabilita il cursor tracking su mobile (no touch events).
  //
  //    FIX: Riscriviamo la gomma con un approccio basato su
  //    bounding rect + hit test semplificato.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sovrascrive window.setFabricTool per fixare la gomma
   */
  var __origSetFabricTool = window.setFabricTool;

  window.setFabricTool = function(tool) {
    // Aggiorna UI dei bottoni (stessa logica dell'originale)
    try {
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
    } catch(e) {}

    // V201-B: Aggiorna il brush su ENTRAMBI i canvas
    v201UpdateBrush(tool, typeof fabricCanvas !== 'undefined' ? fabricCanvas : null);
    v201UpdateBrush(tool, typeof widgetCanvas !== 'undefined' ? widgetCanvas : null);

    // Salva il tool corrente
    try { currentTool = tool; } catch(e) {}
  };

  function v201UpdateBrush(tool, canvas) {
    if (!canvas) return;

    var strokeWidth;
    try {
      strokeWidth = (typeof STROKE_SIZES !== 'undefined' && typeof currentStroke !== 'undefined')
        ? (STROKE_SIZES[currentStroke] || 2) : 2;
    } catch(e) { strokeWidth = 2; }

    try {
      if (tool === 'eraser') {
        // V201-B FIX: La gomma usa isDrawingMode=false + mouse events custom
        canvas._isEraserMode = true;
        canvas._eraserRadius = Math.max(15, strokeWidth * 5);
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'cell';
        canvas.hoverCursor = 'cell';

        // Rendi tutti gli oggetti non selezionabili
        canvas.forEachObject(function(obj) {
          obj.selectable = false;
          obj.evented = false;
        });

      } else if (tool === 'highlighter') {
        canvas._isEraserMode = false;
        canvas.isDrawingMode = true;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        var hlColor;
        try { hlColor = currentHighlighterColor || '#ffeb3b'; } catch(e) { hlColor = '#ffeb3b'; }
        canvas.freeDrawingBrush.color = v201HexToRgba(hlColor, 0.4);
        canvas.freeDrawingBrush.width = strokeWidth * 8;
        canvas.freeDrawingBrush.limitedToCanvasSize = true;

      } else if (tool === 'pencil') {
        canvas._isEraserMode = false;
        canvas.isDrawingMode = true;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        var penColor;
        try { penColor = currentColor || '#000000'; } catch(e) { penColor = '#000000'; }
        canvas.freeDrawingBrush.color = penColor;
        canvas.freeDrawingBrush.width = Math.max(1, strokeWidth * 0.5);
        canvas.freeDrawingBrush.limitedToCanvasSize = true;

      } else {
        // pen (default)
        canvas._isEraserMode = false;
        canvas.isDrawingMode = true;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        var drawColor;
        try { drawColor = currentColor || '#000000'; } catch(e) { drawColor = '#000000'; }
        canvas.freeDrawingBrush.color = drawColor;
        canvas.freeDrawingBrush.width = strokeWidth;
        canvas.freeDrawingBrush.limitedToCanvasSize = true;
      }
    } catch(e) {
      console.error('V201: updateBrush error:', e);
    }
  }

  /**
   * V201-B: NUOVA gomma con hit-test basato su bounding rect
   * Sovrascrive setupEraserMode installando nuovi handler
   */
  function v201SetupEraser(canvas) {
    if (!canvas || canvas.__v201EraserSetup) return;
    canvas.__v201EraserSetup = true;

    var isErasing = false;

    canvas.on('mouse:down', function(opt) {
      if (!canvas._isEraserMode) return;
      isErasing = true;
      v201EraseAt(canvas, opt.pointer || opt.absolutePointer);
    });

    canvas.on('mouse:move', function(opt) {
      if (!canvas._isEraserMode || !isErasing) return;
      v201EraseAt(canvas, opt.pointer || opt.absolutePointer);
    });

    canvas.on('mouse:up', function() {
      if (!canvas._isEraserMode) return;
      if (isErasing) {
        isErasing = false;
        // Trigger save dopo cancellazione
        try {
          if (typeof saveUndoState === 'function') saveUndoState();
        } catch(e) {}
        v201QueueAutoSave();
      }
    });
  }

  function v201EraseAt(canvas, pointer) {
    if (!canvas || !pointer) return;

    var radius = canvas._eraserRadius || 20;
    var toRemove = [];

    canvas.forEachObject(function(obj) {
      if (obj.type !== 'path') return;

      // V201-B FIX: Usa bounding rect per hit test (robusto con qualsiasi scala)
      var bounds = obj.getBoundingRect(true); // true = absolute coords

      // Espandi il bounding rect del raggio della gomma
      var left = bounds.left - radius;
      var right = bounds.left + bounds.width + radius;
      var top = bounds.top - radius;
      var bottom = bounds.top + bounds.height + radius;

      if (pointer.x >= left && pointer.x <= right &&
          pointer.y >= top && pointer.y <= bottom) {
        // Hit! Per path sottili, fai un check più preciso
        if (bounds.width < radius * 3 && bounds.height < radius * 3) {
          // Path piccolo: rimuovi se il pointer è nel bounding rect allargato
          toRemove.push(obj);
        } else {
          // Path grande: verifica distanza dal centro dei segmenti
          if (v201IsNearPath(pointer, obj, radius)) {
            toRemove.push(obj);
          }
        }
      }
    });

    if (toRemove.length > 0) {
      toRemove.forEach(function(obj) { canvas.remove(obj); });
      canvas.renderAll();
    }
  }

  function v201IsNearPath(pointer, pathObj, radius) {
    if (!pathObj.path) return false;

    try {
      var path = pathObj.path;
      var matrix = pathObj.calcTransformMatrix();
      var radiusSq = radius * radius;

      for (var i = 0; i < path.length; i++) {
        var cmd = path[i];
        var x, y;

        if (cmd[0] === 'M' || cmd[0] === 'L') {
          x = cmd[1]; y = cmd[2];
        } else if (cmd[0] === 'Q') {
          x = cmd[3]; y = cmd[4];
        } else if (cmd[0] === 'C') {
          x = cmd[5]; y = cmd[6];
        } else {
          continue;
        }

        // Trasforma il punto del path in coordinate canvas
        var pt = fabric.util.transformPoint({ x: x, y: y }, matrix);
        var dx = pointer.x - pt.x;
        var dy = pointer.y - pt.y;

        if (dx * dx + dy * dy < radiusSq) {
          return true;
        }
      }
    } catch(e) {}

    return false;
  }

  // Installa la gomma V201 su entrambi i canvas quando disponibili
  function v201InstallErasers() {
    try {
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas) v201SetupEraser(fabricCanvas);
      if (typeof widgetCanvas !== 'undefined' && widgetCanvas) v201SetupEraser(widgetCanvas);
    } catch(e) {}

    // Riprova perché i canvas vengono creati dinamicamente
    setTimeout(function() {
      try {
        if (typeof fabricCanvas !== 'undefined' && fabricCanvas) v201SetupEraser(fabricCanvas);
        if (typeof widgetCanvas !== 'undefined' && widgetCanvas) v201SetupEraser(widgetCanvas);
      } catch(e) {}
    }, 3000);
  }

  setTimeout(v201InstallErasers, 1500);


  // ═══════════════════════════════════════════════════════════════
  // 10. V201-C: FIX RISOLUZIONE CANVAS (DISEGNI SFOCATI)
  //     Problema: enableRetinaScaling: false nel canvas fullscreen
  //     + toJSON() salva coordinate logiche a 900×1150.
  //     Al ricaricamento su schermi Retina (devicePixelRatio > 1),
  //     il canvas viene renderizzato a 900×1150 CSS pixels, ma il
  //     backing store è solo 900×1150 device pixels → sfocato.
  //
  //     Soluzione: Abilitare enableRetinaScaling: true e assicurarsi
  //     che loadFromJSON preservi le dimensioni originali.
  //     Inoltre, aumentare quality e multiplier nel toDataURL per
  //     export/stampa.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Override initFabricCanvas per abilitare retina scaling
   * Lo facciamo monkey-patchando: dopo che il canvas originale
   * viene creato con enableRetinaScaling: false, lo correggiamo.
   */
  function v201FixCanvasResolution() {
    try {
      // Fix fullscreen canvas
      if (typeof fabricCanvas !== 'undefined' && fabricCanvas) {
        if (!fabricCanvas.__v201RetinaFixed) {
          fabricCanvas.__v201RetinaFixed = true;

          // Abilita retina scaling
          var dpr = window.devicePixelRatio || 1;
          if (dpr > 1) {
            // Il canvas Fabric.js gestisce internamente il DPR
            // Basta ri-settare le dimensioni per forzare il re-render
            fabricCanvas.enableRetinaScaling = true;

            var w = fabricCanvas.getWidth();
            var h = fabricCanvas.getHeight();
            fabricCanvas.setDimensions({ width: w, height: h });
            fabricCanvas.calcOffset();
            fabricCanvas.renderAll();

            console.log('🔍 V201: Fullscreen canvas retina fix applied (DPR:', dpr, ')');
          }
        }
      }

      // Fix widget canvas
      if (typeof widgetCanvas !== 'undefined' && widgetCanvas) {
        if (!widgetCanvas.__v201RetinaFixed) {
          widgetCanvas.__v201RetinaFixed = true;

          var dpr2 = window.devicePixelRatio || 1;
          if (dpr2 > 1) {
            widgetCanvas.enableRetinaScaling = true;

            var w2 = widgetCanvas.getWidth();
            var h2 = widgetCanvas.getHeight();
            widgetCanvas.setDimensions({ width: w2, height: h2 });
            widgetCanvas.calcOffset();
            widgetCanvas.renderAll();

            console.log('🔍 V201: Widget canvas retina fix applied (DPR:', dpr2, ')');
          }
        }
      }
    } catch(e) {
      console.error('V201: retina fix error:', e);
    }
  }

  // Applica il fix dopo l'init dei canvas (che avviene con delay)
  setTimeout(v201FixCanvasResolution, 1500);
  setTimeout(v201FixCanvasResolution, 3000);

  // Ri-applica quando si apre il fullscreen (il canvas viene ricreato)
  var __origOpenFabricNotes = window.openFabricNotes;
  if (__origOpenFabricNotes) {
    window.openFabricNotes = function() {
      __origOpenFabricNotes.apply(this, arguments);
      // Dopo l'init (250ms setTimeout interno + margine)
      setTimeout(function() {
        v201FixCanvasResolution();
        v201InstallErasers();
      }, 500);
    };
  }

  /**
   * V201-C: Override toDataURL per stampa/export ad alta risoluzione
   */
  window.v201GenerateCanvasDataUrl = function() {
    try {
      var c = (typeof fabricCanvas !== 'undefined' && fabricCanvas) ? fabricCanvas :
              (typeof widgetCanvas !== 'undefined' && widgetCanvas) ? widgetCanvas : null;
      if (!c) return null;
      // V201: multiplier: 2 per output ad alta risoluzione
      return c.toDataURL({ format: 'png', quality: 1.0, multiplier: 2 });
    } catch(e) {
      return null;
    }
  };


  // ═══════════════════════════════════════════════════════════════
  // 11. UTILITY
  // ═══════════════════════════════════════════════════════════════

  function v201HexToRgba(hex, alpha) {
    try {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    } catch(e) {
      return 'rgba(255,235,59,' + alpha + ')';
    }
  }

  function v201QueueAutoSave() {
    if (__v201IsRefreshing) return;
    if (__v201SaveTimer) clearTimeout(__v201SaveTimer);
    __v201SaveTimer = setTimeout(function() {
      __v201SaveTimer = null;
      v201SaveNotes();
    }, V201_SAVE_DEBOUNCE_MS);
  }


  // ═══════════════════════════════════════════════════════════════
  // 12. CONFERMA
  // ═══════════════════════════════════════════════════════════════

  window.__v201Loaded = true;

  console.log('═══════════════════════════════════════════');
  console.log('✅ V201 COMPLETE FIX LOADED');
  console.log('  • V200: Canvas sync, debounce per-sample');
  console.log('  • V201-A: Text notes save + multi-instance sync');
  console.log('  • V201-B: Eraser tool with robust hit-test');
  console.log('  • V201-C: Retina canvas resolution fix');
  console.log('═══════════════════════════════════════════');

})();
