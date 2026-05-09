/*
 * ═══════════════════════════════════════════════════════════════════════
 * DEGUSTAPP — SKETCHPAD BETA (v2)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nuovo blocco appunti A4 vettoriale, integrato in due modalità:
 *
 *   1. MODE = COABITAZIONE (default):
 *      Bottone 🧪 nel widget delle note esistente. Il sistema vecchio
 *      (Fabric+Quill) resta attivo come prima. Dato isolato.
 *
 *   2. MODE = REPLACE (toggle utente in widget):
 *      - Click su 🔍 Espandi → apre SketchPad invece del vecchio fullscreen
 *      - Click su ⛶ → idem
 *      - Click su 🖨️ Stampa → stampa il disegno SketchPad (se presente)
 *      - Anteprima nel confronto → mostra disegno SketchPad (se presente)
 *      - Widget inline → canvas SketchPad EDITABILE (single source of truth)
 *      - I tratti SketchPad e quelli del vecchio sistema sono separati;
 *        attivando REPLACE, il widget mostra/edita SketchPad.
 *
 * Toggle persiste in localStorage. Default OFF.
 *
 * STORAGE ISOLATO (sempre, in entrambe le modalità):
 *   - Locale:  ev.data.vista.sketchPadV1 = { strokes, paperType, updatedAt }
 *   - Cloud:   tastings/{tid}/sketchPadV1/{tasterId}_{sampleId}
 *
 * RIPRISTINO RAPIDO: toggle off + reload, o window.SP_REPLACE = false.
 * ═══════════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  console.log('🧪 SketchPad Beta v2: loading...');

  // ────────────────────────────────────────────────────────────────────
  // CONFIG
  // ────────────────────────────────────────────────────────────────────
  var PAPER_W = 1240;       // px logici (A4 a 150dpi)
  var PAPER_H = 1754;       // 1240 * 1.4145
  var LINE_SPACING = 60;    // px logici tra righe (~10mm)
  var GRID_SPACING = 60;
  var LINE_COLOR = '#c8d4e0';
  var LINE_WIDTH = 1.2;
  var MARGIN_LEFT = 100;
  var STORAGE_FIELD = 'sketchPadV1'; // campo dentro ev.data.vista
  var REPLACE_MODE_KEY = 'sketchpad_replace_mode_v1';

  // ────────────────────────────────────────────────────────────────────
  // REPLACE MODE
  // Quando attivo, SketchPad sostituisce il vecchio sistema in tutti i
  // punti d'accesso (Espandi, Stampa, Anteprima, Widget editabile).
  // Persiste in localStorage. Default OFF.
  // ────────────────────────────────────────────────────────────────────
  function isReplaceMode() {
    if (typeof window.SP_REPLACE === 'boolean') return window.SP_REPLACE;
    try {
      return localStorage.getItem(REPLACE_MODE_KEY) === '1';
    } catch(e) { return false; }
  }
  function setReplaceMode(on) {
    window.SP_REPLACE = !!on;
    try { localStorage.setItem(REPLACE_MODE_KEY, on ? '1' : '0'); } catch(e) {}
  }

  // ────────────────────────────────────────────────────────────────────
  // STATE
  // ────────────────────────────────────────────────────────────────────
  var modal = null;
  var bgCanvas = null, bgCtx = null;
  var drawCanvas = null, drawCtx = null;
  var paperEl = null;
  var stageEl = null;
  var openContextKey = null; // chiave del campione attualmente aperto
  var dirty = false;
  var saveTimer = null;

  var tool = 'pen';
  var color = '#1a1410';
  var highlighterColor = '#ffeb3b';
  var strokeSize = 4;
  var paperType = 'lined';

  var strokes = [];
  var currentStroke = null;
  var drawing = false;
  var activePointerId = null;
  var inputTarget = null; // 'fullscreen' | 'widget' — chi sta ricevendo l'input

  // Widget state (riempito da setupWidget quando replace mode è on)
  var widget = {
    canvas: null,        // wrap esterno
    bgCanvas: null,
    bgCtx: null,
    drawCanvas: null,
    drawCtx: null,
    overlay: null,       // overlay "aperto in fullscreen"
    visible: false,
    contextKey: null     // campione attualmente caricato nel widget
  };

  // ────────────────────────────────────────────────────────────────────
  // CONTEXT (dall'app esistente, sola lettura)
  // ────────────────────────────────────────────────────────────────────
  function getCtx() {
    var t = (typeof getTasting === 'function') ? getTasting() : null;
    var tid = (typeof currentTasterId === 'function') ? currentTasterId() : null;
    var sid = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
    if (!t || !tid || !sid) return null;
    return {
      tasting: t,
      tastingId: t.id,
      tasterId: tid,
      sampleId: sid,
      key: t.id + '_' + tid + '_' + sid
    };
  }

  function getEvForCtx(ctx) {
    if (!ctx) return null;
    if (typeof getEval !== 'function') return null;
    return getEval(ctx.tasting, ctx.tasterId, ctx.sampleId);
  }

  function isArchivedSafe() {
    try { return (typeof isArchived === 'function') ? !!isArchived() : false; }
    catch(e) { return false; }
  }

  // ────────────────────────────────────────────────────────────────────
  // CLOUD SYNC (Firestore: tastings/{tid}/sketchPadV1/{tasterId}_{sampleId})
  // Last-write-wins, no real-time subscriber. Pull all'apertura, push a
  // chiusura/cambio campione/blur. Isolato dalla collection fabricNotes.
  // ────────────────────────────────────────────────────────────────────
  var __spInstanceId = 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  var __spPushTimers = {};   // per-sample debounce
  var __spPullCache = {};    // per-key: ultimo updatedAt visto in cloud

  function fbDb() {
    try {
      if (typeof firebase !== 'undefined' && firebase && firebase.firestore) {
        return firebase.firestore();
      }
    } catch(e) {}
    return null;
  }

  function cloudReadyOk() {
    // Se l'app espone un flag, lo rispettiamo. Altrimenti basta che fbDb() esista.
    if (typeof window.__cloudReady !== 'undefined') return !!window.__cloudReady;
    return !!fbDb();
  }

  function cloudDocRef(tid, tasterId, sampleId) {
    var db = fbDb();
    if (!db) return null;
    var docId = String(tasterId) + '_' + String(sampleId);
    return db.collection('tastings').doc(String(tid))
             .collection('sketchPadV1').doc(docId);
  }

  // PUSH: chiamata con debounce per evitare scritture continue
  function cloudPush(ctx, payload) {
    if (!ctx) return;
    if (!cloudReadyOk()) {
      console.log('[SketchPad] cloud not ready, skip push');
      return;
    }
    var ref = cloudDocRef(ctx.tastingId, ctx.tasterId, ctx.sampleId);
    if (!ref) return;
    var key = ctx.key;
    if (__spPushTimers[key]) clearTimeout(__spPushTimers[key]);
    __spPushTimers[key] = setTimeout(function() {
      delete __spPushTimers[key];
      // Serializzo strokes come stringa per evitare nested arrays >20 livelli
      // (limite Firestore). I points sono [[x,y,p],...] = nested array livello 3.
      // Documenti Firestore tollerano fino a 20 livelli, quindi non serve
      // stringify; ma le stroke con migliaia di punti possono bloccare la
      // scrittura. Prudenza: stringify.
      var doc = {
        tastingId: String(ctx.tastingId),
        tasterId: Number(ctx.tasterId),
        sampleId: String(ctx.sampleId),
        version: payload.version || 1,
        paperType: payload.paperType || 'lined',
        strokesJson: JSON.stringify(payload.strokes || []),
        strokesCount: (payload.strokes || []).length,
        updatedAt: payload.updatedAt || new Date().toISOString(),
        instanceId: __spInstanceId
      };
      try {
        if (typeof window.beginWrite === 'function') window.beginWrite();
      } catch(e) {}
      ref.set(doc, { merge: true })
        .then(function() {
          __spPullCache[key] = doc.updatedAt;
          console.log('[SketchPad] ☁️ pushed', ctx.key, doc.strokesCount, 'strokes');
        })
        .catch(function(err) {
          console.error('[SketchPad] push error', err);
        })
        .then(function() {
          try {
            if (typeof window.endWrite === 'function') window.endWrite();
          } catch(e) {}
        });
    }, 700);
  }

  // PULL: una sola lettura all'apertura. Confronto con il dato locale,
  // tengo il più recente (last-write-wins per updatedAt).
  // callback(loadedRemoteData | null)
  function cloudPull(ctx, callback) {
    if (!ctx) { callback(null); return; }
    if (!cloudReadyOk()) {
      console.log('[SketchPad] cloud not ready, skip pull');
      callback(null);
      return;
    }
    var ref = cloudDocRef(ctx.tastingId, ctx.tasterId, ctx.sampleId);
    if (!ref) { callback(null); return; }
    ref.get()
      .then(function(snap) {
        if (!snap || !snap.exists) {
          console.log('[SketchPad] ☁️ no cloud doc for', ctx.key);
          callback(null);
          return;
        }
        var d = snap.data();
        if (!d) { callback(null); return; }
        var strokes;
        try {
          strokes = (typeof d.strokesJson === 'string')
            ? JSON.parse(d.strokesJson)
            : (Array.isArray(d.strokes) ? d.strokes : []);
        } catch(e) {
          console.error('[SketchPad] cloud doc parse error', e);
          strokes = [];
        }
        var data = {
          version: d.version || 1,
          paperType: d.paperType || 'lined',
          strokes: strokes,
          updatedAt: d.updatedAt || null
        };
        __spPullCache[ctx.key] = data.updatedAt;
        console.log('[SketchPad] ☁️ pulled', ctx.key, strokes.length, 'strokes, ts=', data.updatedAt);
        callback(data);
      })
      .catch(function(err) {
        console.error('[SketchPad] pull error', err);
        callback(null);
      });
  }

  // PUSH immediato: bypassa debounce. Usato in close()/beforeunload.
  function cloudPushImmediate(ctx, payload) {
    if (!ctx) return;
    if (!cloudReadyOk()) return;
    var ref = cloudDocRef(ctx.tastingId, ctx.tasterId, ctx.sampleId);
    if (!ref) return;
    var key = ctx.key;
    if (__spPushTimers[key]) { clearTimeout(__spPushTimers[key]); delete __spPushTimers[key]; }
    var doc = {
      tastingId: String(ctx.tastingId),
      tasterId: Number(ctx.tasterId),
      sampleId: String(ctx.sampleId),
      version: payload.version || 1,
      paperType: payload.paperType || 'lined',
      strokesJson: JSON.stringify(payload.strokes || []),
      strokesCount: (payload.strokes || []).length,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      instanceId: __spInstanceId
    };
    try { if (typeof window.beginWrite === 'function') window.beginWrite(); } catch(e) {}
    // Non aspettiamo la promise: vogliamo solo che la richiesta parta.
    // Firestore SDK ha buffering interno e gestisce il flush in beforeunload.
    ref.set(doc, { merge: true })
      .then(function() {
        __spPullCache[key] = doc.updatedAt;
        console.log('[SketchPad] ☁️ pushed immediate', ctx.key, doc.strokesCount, 'strokes');
      })
      .catch(function(err) { console.error('[SketchPad] push immediate error', err); })
      .then(function() {
        try { if (typeof window.endWrite === 'function') window.endWrite(); } catch(e) {}
      });
  }

  // ────────────────────────────────────────────────────────────────────
  // PERSISTENZA LOCALE (mappa in memoria del modulo, NON dentro ev.data)
  //
  // CRITICO: NON scriviamo MAI dentro ev.data.vista perché Firestore non
  // supporta nested arrays e i punti dei tratti sono [[x,y,p],...] = nested.
  // Qualsiasi saveState() che serializzi l'evaluation si blocca con
  // "Nested arrays are not supported". Quindi i dati SketchPad locali
  // vivono in __spLocalStore (mappa per-key) e in cloud nella collection
  // dedicata. Lo state in memoria dell'app resta intatto.
  // ────────────────────────────────────────────────────────────────────
  var __spLocalStore = {}; // key (tid|taid|sid) → { strokes, paperType, updatedAt }

  function loadFromEval(ctx) {
    if (!ctx) return null;
    return __spLocalStore[ctx.key] || null;
  }

  function saveToEval(ctx, payload) {
    if (!ctx) return false;
    __spLocalStore[ctx.key] = {
      strokes: payload.strokes || [],
      paperType: payload.paperType || 'lined',
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
    // NON tocchiamo ev.data.vista: i dati pesanti vanno solo qui e in cloud.
    // NON chiamiamo saveState: l'app non ha bisogno di sapere di noi.
    return true;
  }

  // Pulizia di sicurezza: se l'utente aveva già dati SketchPad in
  // ev.data.vista da versioni vecchie del modulo, li migriamo nel local
  // store e li rimuoviamo dalle evaluations per evitare ulteriori errori
  // di Firestore. Pulisce SIA lo state in memoria SIA il documento cloud
  // (tramite update con FieldValue.delete) per evitare che il sync li
  // reintroduca.
  var __spCloudCleanupDone = {}; // key (tid_taid_sid) → true (cleaned in cloud)

  function migrateAndCleanLegacyContamination() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.tastings)) return;
    var migrated = 0, cleanedLocal = 0, cleanedCloud = 0;
    state.tastings.forEach(function(t) {
      if (!t.evaluations) return;
      Object.keys(t.evaluations).forEach(function(taid) {
        Object.keys(t.evaluations[taid] || {}).forEach(function(sid) {
          var ev = t.evaluations[taid][sid];
          if (!ev || !ev.data || !ev.data.vista) return;
          var sp = ev.data.vista[STORAGE_FIELD];
          if (sp && Array.isArray(sp.strokes)) {
            // 1. Migra a local store se non già presente o se più recente
            var key = String(t.id) + '|' + String(taid) + '|' + String(sid);
            var existing = __spLocalStore[key];
            var spTs = sp.updatedAt ? Date.parse(sp.updatedAt) : 0;
            var exTs = existing && existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
            if (!existing || spTs > exTs) {
              __spLocalStore[key] = {
                strokes: sp.strokes,
                paperType: sp.paperType || 'lined',
                updatedAt: sp.updatedAt || new Date().toISOString()
              };
              migrated++;
            }
            // 2. Rimuovi dallo state in memoria
            delete ev.data.vista[STORAGE_FIELD];
            cleanedLocal++;

            // 3. Rimuovi dal documento cloud (una sola volta per chiave)
            var cloudKey = String(t.id) + '_' + String(taid) + '_' + String(sid);
            if (!__spCloudCleanupDone[cloudKey]) {
              __spCloudCleanupDone[cloudKey] = true;
              cleanCloudEvaluation(t.id, taid, sid);
              cleanedCloud++;
            }
          }
        });
      });
    });
    if (cleanedLocal > 0) {
      console.log('[SketchPad] Cleanup: migrated=' + migrated + ' cleanedLocal=' + cleanedLocal + ' cleanedCloud=' + cleanedCloud);
    }
  }

  // Rimuove ev.data.vista.sketchPadV1 dal documento Firestore evaluations
  function cleanCloudEvaluation(tid, tasterId, sampleId) {
    var db = fbDb();
    if (!db) return;
    try {
      var ref = db.collection('tastings').doc(String(tid))
                  .collection('evaluations').doc(String(tasterId) + '_' + String(sampleId));
      // FieldValue.delete() su path nested
      var FV = firebase.firestore.FieldValue;
      var update = {};
      update['data.vista.' + STORAGE_FIELD] = FV.delete();
      ref.update(update)
        .then(function() {
          console.log('[SketchPad] cloud cleaned ' + tid + '/' + tasterId + '_' + sampleId);
        })
        .catch(function(err) {
          // Possibile permission-denied o doc inesistente: non fatale
          console.warn('[SketchPad] cloud clean failed (non-fatal)', err.code, err.message);
        });
    } catch(e) {
      console.warn('[SketchPad] cloud clean exception', e);
    }
  }

  function flushSaveSync() {
    flushSaveInternal(false);
  }
  function flushSaveSyncImmediate() {
    flushSaveInternal(true);
  }
  function flushSaveInternal(immediate) {
    if (!dirty) return;
    if (!openContextKey) return;
    var ctx = getCtx();
    if (!ctx || ctx.key !== openContextKey) {
      console.warn('[SketchPad] context changed before flush, skip save');
      dirty = false;
      return;
    }
    var payload = {
      version: 1,
      strokes: strokes,
      paperType: paperType,
      updatedAt: new Date().toISOString()
    };
    if (saveToEval(ctx, payload)) {
      dirty = false;
      console.log('[SketchPad] saved local', strokes.length, 'strokes for', ctx.key);
    }
    if (immediate) cloudPushImmediate(ctx, payload);
    else cloudPush(ctx, payload);
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSaveSync, 1500);
  }

  function markDirty() {
    dirty = true;
    var ind = document.getElementById('spDirtyDot');
    if (ind) ind.style.opacity = '1';
    scheduleSave();
  }

  // Salva su unload e cambio visibilità
  window.addEventListener('beforeunload', flushSaveSyncImmediate);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') flushSaveSyncImmediate();
  });

  // ────────────────────────────────────────────────────────────────────
  // HOOK su selectSample dell'app: flush prima del cambio campione
  // (additivo, non sostitutivo: chiama l'originale e poi noi)
  // ────────────────────────────────────────────────────────────────────
  function installSelectSampleHook() {
    if (typeof window.selectSample !== 'function') {
      // selectSample non è ancora globalmente esposto. Lo aggrappiamo via closure
      // tramite un MutationObserver fallback non è necessario — selectSample
      // è dichiarata come `function selectSample` in scope IIFE dell'app, NON globale.
      // → uso un'altra strategia: hook su click delle sample-card e su navSample
      console.log('[SketchPad] selectSample not global, using fallback hook');
      installFallbackHook();
      return;
    }
    var orig = window.selectSample;
    window.selectSample = function(sid) {
      try { if (modal && modal.classList.contains('sp-visible')) flushSaveSyncImmediate(); } catch(e) {}
      var r = orig.apply(this, arguments);
      try { if (modal && modal.classList.contains('sp-visible')) reloadForCurrentSample(); } catch(e) {}
      return r;
    };
    console.log('[SketchPad] selectSample hook installed');
  }

  // Fallback: se il blocco è aperto e cambia il campione, ricarica
  // tramite polling leggero su selectedSampleId (solo quando il modale è aperto)
  var __pollLast = null, __pollTimer = null;
  function startContextPoll() {
    stopContextPoll();
    __pollLast = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
    __pollTimer = setInterval(function() {
      if (!modal || !modal.classList.contains('sp-visible')) return;
      var cur = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
      if (cur !== __pollLast) {
        flushSaveSyncImmediate();
        __pollLast = cur;
        reloadForCurrentSample();
      }
    }, 250);
  }
  function stopContextPoll() {
    if (__pollTimer) { clearInterval(__pollTimer); __pollTimer = null; }
  }
  function installFallbackHook() {
    // Niente da fare qui: il polling è attivato/disattivato all'apertura del modale
  }

  // ────────────────────────────────────────────────────────────────────
  // SMOOTHING + RENDERING TRATTI
  // Implementazione inline minimale: curve quadratiche tra punti, larghezza
  // variabile in funzione di pressione/velocità.
  // ────────────────────────────────────────────────────────────────────
  function distance(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx*dx + dy*dy);
  }

  // Renderizza una stroke "penna" o "freccia" usando quadratic curves
  // tra midpoint dei punti consecutivi (approssima una curva di Catmull-Rom).
  // Larghezza modulata per pressione (0..1) e velocità.
  function paintPenStroke(ctx, stroke) {
    var pts = stroke.points;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      // dot singolo
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calcoliamo la larghezza per ogni punto (smoothed pressure / velocity)
    var widths = computeWidths(pts, stroke.size, stroke.simulatePressure);

    // Disegniamo segmento per segmento per supportare width variabile
    // Trick: ogni "segmento" è un trapezio (poligono 4-vertici) tra
    // due punti con larghezza diversa. Sembra più liscio di line() perché
    // i bordi si raccordano con i cerchi pieni nei punti.
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i-1], p1 = pts[i];
      var w0 = widths[i-1], w1 = widths[i];
      drawWidthSegment(ctx, p0, p1, w0, w1);
      // cerchio pieno al punto p1 per coprire i giunti
      ctx.beginPath();
      ctx.arc(p1[0], p1[1], w1 / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // cerchio iniziale
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], widths[0] / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWidthSegment(ctx, p0, p1, w0, w1) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len < 0.001) return;
    var nx = -dy / len, ny = dx / len; // normale
    var hw0 = w0 / 2, hw1 = w1 / 2;
    ctx.beginPath();
    ctx.moveTo(p0[0] + nx*hw0, p0[1] + ny*hw0);
    ctx.lineTo(p1[0] + nx*hw1, p1[1] + ny*hw1);
    ctx.lineTo(p1[0] - nx*hw1, p1[1] - ny*hw1);
    ctx.lineTo(p0[0] - nx*hw0, p0[1] - ny*hw0);
    ctx.closePath();
    ctx.fill();
  }

  // Calcola larghezze per-punto in funzione di pressione/velocità
  function computeWidths(pts, baseSize, simulate) {
    var widths = new Array(pts.length);
    var minW = baseSize * 0.55;
    var maxW = baseSize * 1.15;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var w;
      if (simulate) {
        // Velocità tra punto corrente e precedente: più veloce = più sottile
        var v = 0;
        if (i > 0) v = distance(p, pts[i-1]);
        // mappiamo v in [0..1] con clamp
        var t = Math.min(1, v / 30);
        w = maxW - (maxW - minW) * t;
      } else {
        // Usa pressione reale
        var pr = (p[2] != null && p[2] > 0) ? p[2] : 0.5;
        w = minW + (maxW - minW) * pr;
      }
      widths[i] = w;
    }
    // Smoothing semplice delle larghezze (media a 3)
    var sm = widths.slice();
    for (var j = 1; j < widths.length - 1; j++) {
      sm[j] = (widths[j-1] + widths[j] + widths[j+1]) / 3;
    }
    return sm;
  }

  // ────────────────────────────────────────────────────────────────────
  // HIGHLIGHTER (compositing su scratch + multiply)
  // ────────────────────────────────────────────────────────────────────
  var _hlScratch = null;
  function getHlScratch(targetCanvas) {
    if (!_hlScratch || _hlScratch.width !== targetCanvas.width || _hlScratch.height !== targetCanvas.height) {
      _hlScratch = document.createElement('canvas');
      _hlScratch.width = targetCanvas.width;
      _hlScratch.height = targetCanvas.height;
    }
    return _hlScratch;
  }
  function paintHighlighterStroke(ctx, stroke) {
    var pts = stroke.points;
    if (pts.length === 0) return;
    var target = ctx.canvas;
    // Usa scratch dedicata solo per drawCtx; per export creiamo una canvas al volo
    var scratch = (ctx === drawCtx)
      ? getHlScratch(target)
      : (function() { var c = document.createElement('canvas'); c.width = target.width; c.height = target.height; return c; })();
    var sctx = scratch.getContext('2d');
    var t = ctx.getTransform();
    sctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
    sctx.clearRect(0, 0, PAPER_W, PAPER_H);
    sctx.strokeStyle = stroke.color;
    sctx.fillStyle = stroke.color;
    sctx.lineCap = 'butt';
    sctx.lineJoin = 'round';
    sctx.lineWidth = stroke.size;
    sctx.beginPath();
    sctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      // quadratic curves usando midpoint per smoothing
      var pp = pts[i-1], cp = pts[i];
      var mx = (pp[0] + cp[0]) / 2;
      var my = (pp[1] + cp[1]) / 2;
      sctx.quadraticCurveTo(pp[0], pp[1], mx, my);
    }
    sctx.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
    sctx.stroke();

    ctx.save();
    ctx.globalAlpha = stroke.alpha != null ? stroke.alpha : 0.38;
    ctx.globalCompositeOperation = 'multiply';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────────────
  // FRECCIA (penna + punta pulita al rilascio)
  // ────────────────────────────────────────────────────────────────────
  function paintArrow(ctx, stroke) {
    paintPenStroke(ctx, stroke);
    if (!stroke.done || stroke.points.length < 2) return;
    var head = computeArrowHead(stroke.points, stroke.size);
    if (!head) return;
    ctx.save();
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(head.tip[0], head.tip[1]);
    ctx.lineTo(head.left[0], head.left[1]);
    ctx.lineTo(head.right[0], head.right[1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function computeArrowHead(points, size) {
    if (points.length < 2) return null;
    var tip = points[points.length - 1];
    var lookback = Math.min(8, points.length - 1);
    var ref = points[points.length - 1 - lookback];
    var dx = tip[0] - ref[0], dy = tip[1] - ref[1];
    var len = Math.sqrt(dx*dx + dy*dy);
    if (len < 6) return null;
    var ux = dx / len, uy = dy / len;
    var headLen = Math.max(20, size * 5);
    var headAngle = Math.PI / 7;
    var cos = Math.cos(headAngle), sin = Math.sin(headAngle);
    var bx = -ux, by = -uy;
    return {
      tip: tip,
      left: [tip[0] + (bx*cos - by*sin) * headLen, tip[1] + (bx*sin + by*cos) * headLen],
      right: [tip[0] + (bx*cos + by*sin) * headLen, tip[1] + (-bx*sin + by*cos) * headLen]
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // ROUTER stroke painter
  // ────────────────────────────────────────────────────────────────────
  function paintStroke(ctx, s) {
    if (s.tool === 'highlighter') return paintHighlighterStroke(ctx, s);
    if (s.tool === 'arrow') return paintArrow(ctx, s);
    if (s.tool === 'eraser') {
      // gomma: disegna come pennello con destination-out
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.size;
      var pts = s.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], s.size/2, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) {
          var pp = pts[i-1], cp = pts[i];
          var mx = (pp[0]+cp[0])/2, my = (pp[1]+cp[1])/2;
          ctx.quadraticCurveTo(pp[0], pp[1], mx, my);
        }
        ctx.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // pen di default
    paintPenStroke(ctx, s);
  }

  // ────────────────────────────────────────────────────────────────────
  // RENDERING — funzioni pure (operano su ctx/canvas passati)
  // ────────────────────────────────────────────────────────────────────
  function renderStrokesOn(ctx, canvas) {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    var sX = canvas.width / PAPER_W;
    var sY = canvas.height / PAPER_H;
    ctx.setTransform(sX, 0, 0, sY, 0, 0);

    // Order: highlighter sotto, gli altri sopra
    var hl = strokes.filter(function(s) { return s.tool === 'highlighter'; });
    var others = strokes.filter(function(s) { return s.tool !== 'highlighter'; });
    hl.forEach(function(s) { paintStroke(ctx, s); });
    others.forEach(function(s) { paintStroke(ctx, s); });
  }

  function renderBackgroundOn(ctx, canvas) {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    var sX = canvas.width / PAPER_W;
    var sY = canvas.height / PAPER_H;
    ctx.setTransform(sX, 0, 0, sY, 0, 0);

    if (paperType === 'blank') return;

    ctx.save();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'butt';

    if (paperType === 'lined') {
      var startY = LINE_SPACING * 1.5;
      for (var y = startY; y < PAPER_H; y += LINE_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(PAPER_W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(193, 77, 92, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_LEFT, 0);
      ctx.lineTo(MARGIN_LEFT, PAPER_H);
      ctx.stroke();
    } else if (paperType === 'grid') {
      var ox = (PAPER_W % GRID_SPACING) / 2;
      var oy = (PAPER_H % GRID_SPACING) / 2;
      for (var x = ox; x < PAPER_W; x += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, PAPER_H);
        ctx.stroke();
      }
      for (var y2 = oy; y2 < PAPER_H; y2 += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y2);
        ctx.lineTo(PAPER_W, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Wrappers che operano sui canvas globali del fullscreen
  function redrawAll() {
    if (drawCtx && drawCanvas) renderStrokesOn(drawCtx, drawCanvas);
    if (widget.canvas && widget.visible) {
      renderStrokesOn(widget.drawCtx, widget.drawCanvas);
    }
  }
  function drawBackground() {
    if (bgCtx && bgCanvas) renderBackgroundOn(bgCtx, bgCanvas);
    if (widget.canvas && widget.visible) {
      renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // INPUT HANDLING
  // ────────────────────────────────────────────────────────────────────
  function pointerToPaperFor(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssX = e.clientX - rect.left;
    var cssY = e.clientY - rect.top;
    var x = (cssX / rect.width) * PAPER_W;
    var y = (cssY / rect.height) * PAPER_H;
    var pressure = (typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5;
    return [x, y, pressure];
  }
  function pointerToPaper(e) {
    return pointerToPaperFor(e, drawCanvas);
  }

  // ──── HANDLERS GENERICI: prendono il target canvas come parametro ────
  function startStrokeOn(e, targetCanvas) {
    if (e.button !== undefined && e.button !== 0) return;
    if (drawing) return;
    if (isArchivedSafe()) return;
    e.preventDefault();
    drawing = true;
    activePointerId = e.pointerId;
    try { targetCanvas.setPointerCapture(e.pointerId); } catch(_e) {}

    var sizeLogical;
    var strokeColor = color;
    var alpha = 1;
    if (tool === 'eraser') sizeLogical = strokeSize * 1.6 * 5;
    else if (tool === 'highlighter') {
      sizeLogical = strokeSize * 1.6 * 4;
      strokeColor = highlighterColor;
      alpha = 0.38;
    } else sizeLogical = strokeSize * 1.6;

    var isMouse = (e.pointerType === 'mouse');
    currentStroke = {
      tool: tool,
      color: strokeColor,
      alpha: alpha,
      size: sizeLogical,
      points: [pointerToPaperFor(e, targetCanvas)],
      simulatePressure: isMouse,
      done: false
    };
    strokes.push(currentStroke);
  }

  function moveStrokeOn(e, targetCanvas) {
    if (!drawing || !currentStroke || e.pointerId !== activePointerId) return;
    e.preventDefault();
    var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    for (var i = 0; i < events.length; i++) {
      currentStroke.points.push(pointerToPaperFor(events[i], targetCanvas));
    }
    redrawAll();
  }

  function endStrokeOn(e) {
    if (!drawing || !currentStroke) return;
    if (e && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
    if (e && e.preventDefault) e.preventDefault();
    currentStroke.done = true;
    drawing = false;
    activePointerId = null;
    redrawAll();
    currentStroke = null;
    markDirty();
  }

  // ──── Wrapper: stroke handlers che operano sul canvas fullscreen ────
  function startStroke(e) { startStrokeOn(e, drawCanvas); }
  function moveStroke(e) { moveStrokeOn(e, drawCanvas); }
  function endStroke(e) { endStrokeOn(e); }

  // ────────────────────────────────────────────────────────────────────
  // LAYOUT (dimensioni del foglio + canvases DPR-aware)
  // ────────────────────────────────────────────────────────────────────
  function fitPaper() {
    if (!stageEl || !paperEl) return;
    var stageW = stageEl.clientWidth;
    var cs = window.getComputedStyle(stageEl);
    var pad = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
    var available = stageW - pad;
    var maxW = Math.min(available, 980);
    paperEl.style.width = maxW + 'px';
    setupCanvases();
  }

  function setupCanvases() {
    if (!bgCanvas || !drawCanvas || !paperEl) return;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var cssW = paperEl.clientWidth;
    var cssH = paperEl.clientHeight;
    if (cssW < 10 || cssH < 10) return; // non ancora layoutato
    [bgCanvas, drawCanvas].forEach(function(c) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    });
    drawBackground();
    redrawAll();
  }

  var __resizeTimer = null;
  window.addEventListener('resize', function() {
    if (!modal || !modal.classList.contains('sp-visible')) return;
    clearTimeout(__resizeTimer);
    __resizeTimer = setTimeout(fitPaper, 100);
  });

  // ────────────────────────────────────────────────────────────────────
  // OPEN / CLOSE / RELOAD
  // ────────────────────────────────────────────────────────────────────
  function open() {
    var ctx = getCtx();
    if (!ctx) {
      if (typeof toast === 'function') toast('Seleziona un degustatore e un campione');
      else alert('Seleziona un degustatore e un campione');
      return;
    }
    ensureUI();
    openContextKey = ctx.key;
    loadCurrentSample();
    modal.classList.add('sp-visible');
    document.body.style.overflow = 'hidden';
    setTimeout(fitPaper, 30);
    startContextPoll();
    // Se il widget è montato, mostra overlay "aperto in fullscreen"
    setWidgetOverlay(true);
  }

  function close() {
    flushSaveSyncImmediate();
    if (modal) modal.classList.remove('sp-visible');
    document.body.style.overflow = '';
    // Se il widget è montato e ha un suo contesto attivo, mantieni quello
    // come "campione editing" così salvataggi successivi continuano a funzionare
    if (widget.canvas && widget.contextKey) {
      openContextKey = widget.contextKey;
    } else {
      openContextKey = null;
    }
    stopContextPoll();
    setWidgetOverlay(false);
    // Aggiorna widget con eventuali nuovi tratti dal fullscreen
    if (widget.canvas) {
      renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
      renderStrokesOn(widget.drawCtx, widget.drawCanvas);
    }
  }

  function loadCurrentSample() {
    var ctx = getCtx();
    if (!ctx) return;

    // 1. Carica subito dal locale (no flicker)
    var localData = loadFromEval(ctx);
    applyLoadedData(localData);

    var sampleLabel = document.getElementById('spSampleLabel');
    if (sampleLabel) {
      var s = ctx.tasting.samples ? ctx.tasting.samples.find(function(x) { return String(x.id) === String(ctx.sampleId); }) : null;
      sampleLabel.textContent = s ? ('Camp. ' + s.id + (s.name ? ' · ' + s.name : '')) : ('Campione ' + ctx.sampleId);
    }

    // 2. Pull cloud in background, applica solo se più recente
    cloudPull(ctx, function(remoteData) {
      // Verifica che il contesto sia ancora lo stesso (potrebbe essere cambiato
      // mentre era in volo la richiesta)
      var nowCtx = getCtx();
      if (!nowCtx || nowCtx.key !== ctx.key) {
        console.log('[SketchPad] context changed during pull, discarding result');
        return;
      }
      // Se nel frattempo l'utente ha disegnato (dirty=true), NON sovrascriviamo
      if (dirty) {
        console.log('[SketchPad] local edits in progress, skip remote apply');
        return;
      }
      if (!remoteData) return;
      // Last-write-wins: confronto timestamps
      var localTs = (localData && localData.updatedAt) ? Date.parse(localData.updatedAt) : 0;
      var remoteTs = remoteData.updatedAt ? Date.parse(remoteData.updatedAt) : 0;
      if (remoteTs > localTs) {
        console.log('[SketchPad] cloud newer (', new Date(remoteTs).toISOString(),
                    'vs local', localTs ? new Date(localTs).toISOString() : 'none',
                    '), applying remote');
        applyLoadedData(remoteData);
        // Salvo anche nel locale per coerenza (skipCloud per non rimbalzare)
        saveToEval(nowCtx, {
          version: remoteData.version || 1,
          strokes: remoteData.strokes,
          paperType: remoteData.paperType,
          updatedAt: remoteData.updatedAt
        });
      } else {
        console.log('[SketchPad] local is newer or same, keep local');
      }
    });
  }

  function applyLoadedData(data) {
    if (data) {
      strokes = Array.isArray(data.strokes) ? data.strokes : [];
      paperType = data.paperType || 'lined';
    } else {
      strokes = [];
      paperType = 'lined';
    }
    syncPaperButtons();
    drawBackground();
    redrawAll();
    dirty = false;
    var ind = document.getElementById('spDirtyDot');
    if (ind) ind.style.opacity = '0';
  }

  function reloadForCurrentSample() {
    openContextKey = (getCtx() || {}).key || null;
    loadCurrentSample();
    setTimeout(fitPaper, 20);
  }

  // ────────────────────────────────────────────────────────────────────
  // EXPORT PNG
  // ────────────────────────────────────────────────────────────────────
  function doExport(withBg) {
    var out = document.createElement('canvas');
    out.width = PAPER_W;
    out.height = PAPER_H;
    var octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, PAPER_W, PAPER_H);
    if (withBg && paperType !== 'blank') {
      octx.strokeStyle = LINE_COLOR;
      octx.lineWidth = LINE_WIDTH;
      if (paperType === 'lined') {
        var sy = LINE_SPACING * 1.5;
        for (var y = sy; y < PAPER_H; y += LINE_SPACING) {
          octx.beginPath(); octx.moveTo(0, y); octx.lineTo(PAPER_W, y); octx.stroke();
        }
        octx.strokeStyle = 'rgba(193,77,92,0.4)';
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.moveTo(MARGIN_LEFT, 0); octx.lineTo(MARGIN_LEFT, PAPER_H); octx.stroke();
      } else if (paperType === 'grid') {
        var ox = (PAPER_W % GRID_SPACING) / 2;
        var oy = (PAPER_H % GRID_SPACING) / 2;
        for (var x = ox; x < PAPER_W; x += GRID_SPACING) {
          octx.beginPath(); octx.moveTo(x, 0); octx.lineTo(x, PAPER_H); octx.stroke();
        }
        for (var y2 = oy; y2 < PAPER_H; y2 += GRID_SPACING) {
          octx.beginPath(); octx.moveTo(0, y2); octx.lineTo(PAPER_W, y2); octx.stroke();
        }
      }
    }
    var hl = strokes.filter(function(s) { return s.tool === 'highlighter'; });
    var others = strokes.filter(function(s) { return s.tool !== 'highlighter'; });
    hl.forEach(function(s) { paintStroke(octx, s); });
    others.forEach(function(s) { paintStroke(octx, s); });

    out.toBlob(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var ctx = getCtx();
      a.href = url;
      a.download = 'sketchpad_' + (ctx ? ctx.sampleId + '_' : '') + new Date().toISOString().slice(0,10) + '.png';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
      if (typeof toast === 'function') toast('PNG scaricato');
    }, 'image/png');
  }

  // ────────────────────────────────────────────────────────────────────
  // UI: crea modal, toolbar, modale export
  // ────────────────────────────────────────────────────────────────────
  function ensureUI() {
    if (modal) return;
    injectStyles();
    buildModal();
  }

  // CSS che si applica indipendentemente dall'apertura del fullscreen.
  // Iniettato al boot per: stili anteprima migliorati, nascondere elementi
  // ridondanti in replace mode, ecc.
  function injectGlobalStyles() {
    if (document.getElementById('sketchPadGlobalStyles')) return;
    var st = document.createElement('style');
    st.id = 'sketchPadGlobalStyles';
    st.textContent = ''
      // Anteprima: margine confortevole, max 90vh, scroll interno se serve
      + '#notesPreviewModal.modal-overlay{padding:32px 20px !important;align-items:center !important;}'
      + '#notesPreviewModal .modal{max-width:780px !important;width:auto !important;max-height:90vh !important;display:flex !important;flex-direction:column !important;overflow:hidden !important;}'
      + '#notesPreviewModal .pad{flex:1;min-height:0;overflow-y:auto;}'
      + '#notesPreviewTextPanel{max-height:none !important;}'
      + '@media (max-width:640px){#notesPreviewModal.modal-overlay{padding:16px 10px !important;}}'
      // In replace mode: nascondi il bottone "🔍 Espandi" esterno (duplicato di ⛶)
      + 'body.sp-replace-on .canvas-section h3 .canvas-tools button[onclick*="openNotesFullscreenV181"]{display:none !important;}'
      // In replace mode + widget montato: nascondi tutti i canvas Fabric
      // residui dentro #widgetCanvasWrap, lasciando visibili solo i miei (id sp*)
      + 'body.sp-replace-on #widgetCanvasWrap > canvas:not([id^="spWidget"]){display:none !important;}'
      + 'body.sp-replace-on #widgetCanvasWrap > .canvas-container{display:none !important;}'
      + 'body.sp-replace-on #widgetCanvasWrap > .upper-canvas,body.sp-replace-on #widgetCanvasWrap > .lower-canvas{display:none !important;}'
      ;
    document.head.appendChild(st);
  }

  function applyReplaceModeBodyClass() {
    if (isReplaceMode()) {
      document.body.classList.add('sp-replace-on');
    } else {
      document.body.classList.remove('sp-replace-on');
    }
  }

  function injectStyles() {
    if (document.getElementById('sketchPadStyles')) return;
    var st = document.createElement('style');
    st.id = 'sketchPadStyles';
    st.textContent = ''
      + '.sp-modal{position:fixed;inset:0;background:#2a2622;z-index:9999;display:none;flex-direction:column;color:white;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}'
      + '.sp-modal.sp-visible{display:flex;}'
      + '.sp-topbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;padding-top:max(12px,env(safe-area-inset-top));background:#2a2622;border-bottom:1px solid rgba(255,255,255,0.06);}'
      + '.sp-title{font-size:16px;font-weight:600;letter-spacing:0.01em;}'
      + '.sp-meta{font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.5);margin-top:2px;display:flex;align-items:center;gap:6px;}'
      + '.sp-dirty-dot{width:6px;height:6px;border-radius:50%;background:#b8924a;opacity:0;transition:opacity .2s;}'
      + '.sp-actions{display:flex;gap:8px;}'
      + '.sp-pill{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:white;padding:8px 14px;border-radius:999px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;letter-spacing:0.02em;}'
      + '.sp-pill:hover{background:rgba(255,255,255,0.12);}'
      + '.sp-pill:active{transform:scale(0.97);}'
      + '.sp-pill.sp-primary{background:#a13648;border-color:#a13648;}'
      + '.sp-pill.sp-primary:hover{background:#b94459;}'
      + '.sp-stage{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:24px 16px 110px;background:radial-gradient(ellipse at top,rgba(255,255,255,0.04),transparent 60%) #2a2622;touch-action:pan-y;}'
      + '.sp-paper{position:relative;margin:0 auto;background:#fdfbf7;border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,0.35),0 4px 12px rgba(0,0,0,0.2);aspect-ratio:1240/1754;overflow:hidden;touch-action:none;}'
      + '@supports not (aspect-ratio:1/1){.sp-paper{height:0;padding-top:141.45%;}}'
      + '.sp-paper canvas{position:absolute;top:0;left:0;width:100%;height:100%;display:block;}'
      + '#spBgCanvas{z-index:1;pointer-events:none;}'
      + '#spDrawCanvas{z-index:2;cursor:crosshair;}'
      + '.sp-paper-edge{position:absolute;inset:0;border-radius:6px;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04);}'
      + '.sp-toolbar{position:absolute;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:rgba(36,32,28,0.92);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:8px;display:flex;gap:4px;align-items:center;box-shadow:0 14px 40px rgba(0,0,0,0.5);max-width:calc(100vw - 24px);overflow-x:auto;z-index:20;-webkit-overflow-scrolling:touch;scrollbar-width:none;}'
      + '.sp-toolbar::-webkit-scrollbar{display:none;}'
      + '.sp-tg{display:flex;gap:2px;padding:0 4px;border-right:1px solid rgba(255,255,255,0.08);flex-shrink:0;}'
      + '.sp-tg:last-child{border-right:none;padding-right:0;}'
      + '.sp-tg:first-child{padding-left:0;}'
      + '.sp-tb{background:transparent;border:none;color:rgba(255,255,255,0.85);width:38px;height:38px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s,transform .1s;font:inherit;font-size:13px;flex-shrink:0;}'
      + '.sp-tb:hover{background:rgba(255,255,255,0.08);color:white;}'
      + '.sp-tb:active{transform:scale(0.92);}'
      + '.sp-tb.sp-active{background:#fff;color:#1a1410;}'
      + '.sp-tb svg{width:18px;height:18px;}'
      + '.sp-tb.sp-paper-btn{width:auto;padding:0 11px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;height:38px;}'
      + '.sp-stroke-dot{background:currentColor;border-radius:50%;}'
      + '.sp-color-row{display:flex;gap:4px;padding:0 4px;}'
      + '.sp-color-dot{width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid transparent;box-shadow:0 0 0 1px rgba(0,0,0,0.2);transition:transform .15s,border-color .15s;flex-shrink:0;}'
      + '.sp-color-dot:hover{transform:scale(1.12);}'
      + '.sp-color-dot.sp-active{border-color:white;transform:scale(1.08);}'
      + '.sp-export-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;}'
      + '.sp-export-bg.sp-visible{display:flex;}'
      + '.sp-export-modal{background:#1f1c19;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;width:100%;max-width:380px;color:white;box-shadow:0 20px 60px rgba(0,0,0,0.5);}'
      + '.sp-export-modal h3{font-weight:600;margin:0 0 6px;font-size:18px;}'
      + '.sp-export-modal p{margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.5;}'
      + '.sp-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;}'
      + '.sp-switch{position:relative;width:44px;height:26px;background:rgba(255,255,255,0.15);border-radius:999px;cursor:pointer;transition:background .2s;flex-shrink:0;}'
      + '.sp-switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;background:white;border-radius:50%;transition:transform .2s;}'
      + '.sp-switch.sp-on{background:#a13648;}'
      + '.sp-switch.sp-on::after{transform:translateX(18px);}'
      + '.sp-export-actions{display:flex;gap:10px;margin-top:18px;}'
      + '.sp-export-actions .sp-pill{flex:1;justify-content:center;}'
      + '@media (max-width:640px){.sp-topbar{padding:10px 14px;}.sp-title{font-size:14px;}.sp-actions .sp-pill{padding:7px 11px;font-size:11px;}.sp-stage{padding:14px 8px 110px;}.sp-tb{width:36px;height:36px;}.sp-color-dot{width:24px;height:24px;}}'
      ;
    document.head.appendChild(st);
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'sketchPadModal';
    modal.className = 'sp-modal';
    modal.innerHTML = ''
      + '<div class="sp-topbar">'
      +   '<div>'
      +     '<div class="sp-title">Quaderno A4 <span style="background:#a13648;color:white;padding:2px 6px;border-radius:4px;font-size:10px;letter-spacing:0.1em;margin-left:6px;text-transform:uppercase;">Beta</span></div>'
      +     '<div class="sp-meta"><span id="spSampleLabel">—</span><span class="sp-dirty-dot" id="spDirtyDot"></span></div>'
      +   '</div>'
      +   '<div class="sp-actions">'
      +     '<button class="sp-pill" id="spSettingsBtn" title="Impostazioni" style="padding:8px 12px;">⚙</button>'
      +     '<button class="sp-pill" id="spClearBtn">Pulisci</button>'
      +     '<button class="sp-pill" id="spExportBtn">⬇ Esporta</button>'
      +     '<button class="sp-pill sp-primary" id="spCloseBtn">Chiudi</button>'
      +   '</div>'
      + '</div>'
      + '<div class="sp-stage" id="spStage">'
      +   '<div class="sp-paper" id="spPaper">'
      +     '<canvas id="spBgCanvas"></canvas>'
      +     '<canvas id="spDrawCanvas"></canvas>'
      +     '<div class="sp-paper-edge"></div>'
      +   '</div>'
      + '</div>'
      + '<div class="sp-toolbar" id="spToolbar">'
      +   '<div class="sp-tg">'
      +     '<button class="sp-tb sp-active" id="spPenBtn" title="Penna"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg></button>'
      +     '<button class="sp-tb" id="spHlBtn" title="Evidenziatore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l-6 6v3h3l6-6"/><path d="M22 7l-3.5 3.5-9-9L13 -2"/><path d="M14.5 5.5l4 4"/><path d="M3 17l3 3"/></svg></button>'
      +     '<button class="sp-tb" id="spArrowBtn" title="Freccia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg></button>'
      +     '<button class="sp-tb" id="spEraserBtn" title="Gomma"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16a2 2 0 0 1 0-2.8L13.2 3a2 2 0 0 1 2.8 0L21 8a2 2 0 0 1 0 2.8L13 19"/><path d="M9 10l6 6"/></svg></button>'
      +   '</div>'
      +   '<div class="sp-tg">'
      +     '<button class="sp-tb" data-stroke="2" title="Sottile"><span class="sp-stroke-dot" style="width:5px;height:5px"></span></button>'
      +     '<button class="sp-tb sp-active" data-stroke="4" title="Medio"><span class="sp-stroke-dot" style="width:9px;height:9px"></span></button>'
      +     '<button class="sp-tb" data-stroke="8" title="Spesso"><span class="sp-stroke-dot" style="width:13px;height:13px"></span></button>'
      +   '</div>'
      +   '<div class="sp-tg" id="spPenColorGroup">'
      +     '<div class="sp-color-row">'
      +       '<div class="sp-color-dot sp-active" data-color="#1a1410" style="background:#1a1410"></div>'
      +       '<div class="sp-color-dot" data-color="#6b1e2e" style="background:#6b1e2e"></div>'
      +       '<div class="sp-color-dot" data-color="#1f4068" style="background:#1f4068"></div>'
      +       '<div class="sp-color-dot" data-color="#2a5a3a" style="background:#2a5a3a"></div>'
      +       '<div class="sp-color-dot" data-color="#b8924a" style="background:#b8924a"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="sp-tg" id="spHlColorGroup" style="display:none">'
      +     '<div class="sp-color-row">'
      +       '<div class="sp-color-dot sp-active" data-hl-color="#ffeb3b" style="background:#ffeb3b"></div>'
      +       '<div class="sp-color-dot" data-hl-color="#a5e887" style="background:#a5e887"></div>'
      +       '<div class="sp-color-dot" data-hl-color="#80d8ff" style="background:#80d8ff"></div>'
      +       '<div class="sp-color-dot" data-hl-color="#ff9bb3" style="background:#ff9bb3"></div>'
      +       '<div class="sp-color-dot" data-hl-color="#ffb74d" style="background:#ffb74d"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="sp-tg">'
      +     '<button class="sp-tb sp-paper-btn sp-active" data-paper="lined">Righe</button>'
      +     '<button class="sp-tb sp-paper-btn" data-paper="grid">Quadri</button>'
      +     '<button class="sp-tb sp-paper-btn" data-paper="blank">Bianco</button>'
      +   '</div>'
      +   '<div class="sp-tg">'
      +     '<button class="sp-tb" id="spUndoBtn" title="Annulla"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg></button>'
      +   '</div>'
      + '</div>'
      + '<div class="sp-export-bg" id="spExportBg">'
      +   '<div class="sp-export-modal">'
      +     '<h3>Esporta foglio</h3>'
      +     '<p>Scegli se includere lo sfondo (righe / quadretti) nel PNG.</p>'
      +     '<div class="sp-toggle-row"><label>Includi sfondo</label><div class="sp-switch" id="spIncludeBgSwitch"></div></div>'
      +     '<div class="sp-export-actions"><button class="sp-pill" id="spExportCancel">Annulla</button><button class="sp-pill sp-primary" id="spExportConfirm">Scarica PNG</button></div>'
      +   '</div>'
      + '</div>'
      ;
    document.body.appendChild(modal);

    bgCanvas = modal.querySelector('#spBgCanvas');
    drawCanvas = modal.querySelector('#spDrawCanvas');
    bgCtx = bgCanvas.getContext('2d');
    drawCtx = drawCanvas.getContext('2d');
    paperEl = modal.querySelector('#spPaper');
    stageEl = modal.querySelector('#spStage');

    // Pointer
    drawCanvas.addEventListener('pointerdown', startStroke);
    drawCanvas.addEventListener('pointermove', moveStroke);
    drawCanvas.addEventListener('pointerup', endStroke);
    drawCanvas.addEventListener('pointercancel', endStroke);
    drawCanvas.addEventListener('pointerleave', function(e) { if (drawing) endStroke(e); });

    // Toolbar handlers
    modal.querySelector('#spPenBtn').onclick = function() { setTool('pen'); };
    modal.querySelector('#spHlBtn').onclick = function() { setTool('highlighter'); };
    modal.querySelector('#spArrowBtn').onclick = function() { setTool('arrow'); };
    modal.querySelector('#spEraserBtn').onclick = function() { setTool('eraser'); };

    Array.prototype.forEach.call(modal.querySelectorAll('[data-stroke]'), function(b) {
      b.onclick = function() {
        strokeSize = parseInt(b.dataset.stroke);
        Array.prototype.forEach.call(modal.querySelectorAll('[data-stroke]'), function(x) { x.classList.remove('sp-active'); });
        b.classList.add('sp-active');
      };
    });
    Array.prototype.forEach.call(modal.querySelectorAll('[data-color]'), function(d) {
      d.onclick = function() {
        color = d.dataset.color;
        Array.prototype.forEach.call(modal.querySelectorAll('[data-color]'), function(x) { x.classList.remove('sp-active'); });
        d.classList.add('sp-active');
        if (tool !== 'pen' && tool !== 'arrow') setTool('pen');
      };
    });
    Array.prototype.forEach.call(modal.querySelectorAll('[data-hl-color]'), function(d) {
      d.onclick = function() {
        highlighterColor = d.dataset.hlColor;
        Array.prototype.forEach.call(modal.querySelectorAll('[data-hl-color]'), function(x) { x.classList.remove('sp-active'); });
        d.classList.add('sp-active');
        if (tool !== 'highlighter') setTool('highlighter');
      };
    });
    Array.prototype.forEach.call(modal.querySelectorAll('[data-paper]'), function(b) {
      b.onclick = function() {
        paperType = b.dataset.paper;
        Array.prototype.forEach.call(modal.querySelectorAll('[data-paper]'), function(x) { x.classList.remove('sp-active'); });
        b.classList.add('sp-active');
        drawBackground();
        markDirty();
      };
    });

    modal.querySelector('#spUndoBtn').onclick = function() {
      if (strokes.length === 0) return;
      strokes.pop();
      redrawAll();
      markDirty();
    };
    modal.querySelector('#spClearBtn').onclick = function() {
      if (strokes.length === 0) return;
      if (!confirm('Cancellare tutto il foglio?')) return;
      strokes = [];
      redrawAll();
      markDirty();
      flushSaveSyncImmediate();
    };
    modal.querySelector('#spCloseBtn').onclick = close;
    var settingsBtn = modal.querySelector('#spSettingsBtn');
    if (settingsBtn) {
      settingsBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSettingsPopover(settingsBtn);
      };
    }
    modal.querySelector('#spExportBtn').onclick = function() {
      modal.querySelector('#spExportBg').classList.add('sp-visible');
    };
    modal.querySelector('#spExportCancel').onclick = function() {
      modal.querySelector('#spExportBg').classList.remove('sp-visible');
    };
    var includeBg = false;
    modal.querySelector('#spIncludeBgSwitch').onclick = function() {
      includeBg = !includeBg;
      this.classList.toggle('sp-on', includeBg);
    };
    modal.querySelector('#spExportConfirm').onclick = function() {
      modal.querySelector('#spExportBg').classList.remove('sp-visible');
      doExport(includeBg);
    };

    // ESC chiude
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('sp-visible')) {
        close();
      }
    });
  }

  function setTool(t) {
    tool = t;
    var ids = { pen: 'spPenBtn', highlighter: 'spHlBtn', arrow: 'spArrowBtn', eraser: 'spEraserBtn' };
    Object.keys(ids).forEach(function(name) {
      var btn = modal && modal.querySelector('#' + ids[name]);
      if (btn) btn.classList.toggle('sp-active', t === name);
    });
    var pen = modal && modal.querySelector('#spPenColorGroup');
    var hl = modal && modal.querySelector('#spHlColorGroup');
    if (t === 'highlighter') {
      if (pen) pen.style.display = 'none';
      if (hl) hl.style.display = '';
    } else {
      if (pen) pen.style.display = '';
      if (hl) hl.style.display = 'none';
    }
    if (drawCanvas) drawCanvas.style.cursor = (t === 'eraser') ? 'cell' : 'crosshair';
  }

  function syncPaperButtons() {
    if (!modal) return;
    Array.prototype.forEach.call(modal.querySelectorAll('[data-paper]'), function(b) {
      b.classList.toggle('sp-active', b.dataset.paper === paperType);
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // BOTTONE TRIGGER nel widget delle note esistente
  // ────────────────────────────────────────────────────────────────────
  function addBetaButton() {
    var sw = document.querySelector('.widget-notes-switch');
    if (!sw) return false;
    var replace = isReplaceMode();

    // Bottone 🧪 — visibile SOLO se replace mode è OFF (in ON c'è già "Espandi")
    if (!sw.querySelector('.sp-beta-btn')) {
      var btn = document.createElement('button');
      btn.className = 'widget-notes-switch-btn sp-beta-btn';
      btn.title = 'Apri nuovo blocco appunti';
      btn.textContent = '🧪';
      btn.style.cssText = 'background:#a13648;color:white;font-weight:600;';
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        open();
      };
      sw.appendChild(btn);
    }
    // Visibilità coerente con la modalità corrente
    var betaBtn = sw.querySelector('.sp-beta-btn');
    if (betaBtn) betaBtn.style.display = replace ? 'none' : '';

    // Bottone ⚙️ — visibile SOLO in replace mode OFF (in ON sta nel topbar fullscreen)
    if (!sw.querySelector('.sp-settings-btn')) {
      var sbtn = document.createElement('button');
      sbtn.className = 'widget-notes-switch-btn sp-settings-btn';
      sbtn.title = 'Impostazioni blocco appunti';
      sbtn.textContent = '⚙️';
      sbtn.style.cssText = 'background:rgba(255,255,255,0.15);color:white;';
      sbtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSettingsPopover(sbtn);
      };
      sw.appendChild(sbtn);
    }
    var setBtn = sw.querySelector('.sp-settings-btn');
    if (setBtn) setBtn.style.display = replace ? 'none' : '';

    if (replace) {
      tryMountWidget();
    }
    return true;
  }

  function tryAddBetaButton() {
    if (addBetaButton()) return;
    var mo = new MutationObserver(function() {
      if (addBetaButton()) {
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { try { mo.disconnect(); } catch(e) {} }, 30000);
  }

  // ────────────────────────────────────────────────────────────────────
  // POPOVER IMPOSTAZIONI
  // ────────────────────────────────────────────────────────────────────
  function toggleSettingsPopover(anchor) {
    var existing = document.getElementById('spSettingsPop');
    if (existing) {
      existing.remove();
      return;
    }
    var pop = document.createElement('div');
    pop.id = 'spSettingsPop';
    pop.style.cssText = ''
      + 'position:fixed;background:#1f1c19;color:white;border-radius:12px;'
      + 'padding:14px 16px;box-shadow:0 12px 30px rgba(0,0,0,0.4);'
      + 'border:1px solid rgba(255,255,255,0.1);z-index:9998;'
      + 'font-family:system-ui,sans-serif;font-size:13px;min-width:260px;';
    var rect = anchor.getBoundingClientRect();
    pop.style.top = (rect.bottom + 6) + 'px';
    pop.style.left = Math.max(8, rect.right - 260) + 'px';
    pop.innerHTML = ''
      + '<div style="font-weight:600;margin-bottom:8px;font-size:14px;">Blocco appunti</div>'
      + '<label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;">'
      +   '<input type="checkbox" id="spReplaceToggle" ' + (isReplaceMode() ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;">'
      +   '<div style="flex:1;">'
      +     '<div style="font-weight:500;">Usa nuovo blocco (beta)</div>'
      +     '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;">Sostituisce Espandi, Stampa, Anteprima e widget editabile</div>'
      +   '</div>'
      + '</label>'
      + '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;">'
      +   'Il vecchio sistema resta attivo: i dati non vengono persi, sono storage separati.'
      + '</div>';
    document.body.appendChild(pop);

    var cb = pop.querySelector('#spReplaceToggle');
    cb.onchange = function() {
      setReplaceMode(cb.checked);
      pop.remove();
      if (typeof toast === 'function') {
        toast(cb.checked ? '✓ Nuovo blocco attivato — ricarica' : '✓ Vecchio blocco ripristinato — ricarica');
      }
      // Suggerisco un reload per applicare il routing pulito
      setTimeout(function() {
        if (confirm('Ricaricare ora per applicare la modifica?')) {
          location.reload();
        }
      }, 800);
    };

    // Chiudi cliccando fuori
    setTimeout(function() {
      var closeOnOutside = function(ev) {
        if (!pop.contains(ev.target) && ev.target !== anchor) {
          pop.remove();
          document.removeEventListener('click', closeOnOutside, true);
        }
      };
      document.addEventListener('click', closeOnOutside, true);
    }, 10);
  }

  // ────────────────────────────────────────────────────────────────────
  // WIDGET EDITABILE (replace mode)
  // Sostituisce il canvas Fabric esistente con due canvas SketchPad,
  // mantenendo l'array `strokes` come single source of truth.
  // ────────────────────────────────────────────────────────────────────
  function tryMountWidget() {
    if (mountWidget()) return;
    // Ritenta tramite osservazione DOM
    var mo = new MutationObserver(function() {
      if (mountWidget()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { try { mo.disconnect(); } catch(e) {} }, 30000);
  }

  function mountWidget() {
    var wrap = document.getElementById('widgetCanvasWrap');
    if (!wrap) return false;
    if (wrap.dataset.spMounted === '1') return true; // già montato

    // Nascondiamo il canvas Fabric originale (non lo rimuoviamo:
    // il sistema vecchio potrebbe ancora referenziarlo)
    var oldCanvas = wrap.querySelector('#widgetDrawCanvas');
    if (oldCanvas) oldCanvas.style.display = 'none';
    // Nascondiamo anche eventuali canvas Fabric extra (upper/lower-canvas)
    Array.prototype.forEach.call(wrap.querySelectorAll('canvas'), function(c) {
      c.style.display = 'none';
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.canvas-container'), function(c) {
      c.style.display = 'none';
    });

    // Stile contenitore: niente background CSS pattern (lo facciamo noi col canvas)
    wrap.classList.remove('paper-lined', 'paper-grid', 'paper-blank');
    wrap.style.background = '#fdfbf7';
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    // Fissiamo aspect ratio A4 per il widget
    wrap.style.aspectRatio = '1240 / 1754';
    // Per browser senza aspect-ratio: fallback height
    if (!CSS.supports('aspect-ratio: 1 / 1')) {
      wrap.style.height = (wrap.clientWidth * 1.4145) + 'px';
    }
    // Nessun width fisso: deve adattarsi al contenitore esterno
    wrap.style.width = '100%';
    wrap.style.maxWidth = '100%';
    wrap.style.transform = 'none'; // annulla eventuali scale del vecchio sistema
    wrap.style.transformOrigin = '';
    wrap.style.height = '';

    // Costruiamo i nostri canvas
    var bg = document.createElement('canvas');
    var dr = document.createElement('canvas');
    bg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1;';
    dr.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;cursor:crosshair;z-index:2;touch-action:none;';
    bg.id = 'spWidgetBgCanvas';
    dr.id = 'spWidgetDrawCanvas';
    wrap.appendChild(bg);
    wrap.appendChild(dr);

    // Overlay "aperto in fullscreen" (mostrato quando il fullscreen è attivo)
    var ov = document.createElement('div');
    ov.id = 'spWidgetOverlay';
    ov.style.cssText = ''
      + 'position:absolute;inset:0;background:rgba(36,32,28,0.8);'
      + 'display:none;align-items:center;justify-content:center;color:white;'
      + 'z-index:3;border-radius:inherit;font-family:system-ui;font-size:13px;'
      + 'text-align:center;padding:20px;';
    ov.textContent = 'Aperto in fullscreen';
    wrap.appendChild(ov);

    widget.canvas = wrap;
    widget.bgCanvas = bg;
    widget.bgCtx = bg.getContext('2d');
    widget.drawCanvas = dr;
    widget.drawCtx = dr.getContext('2d');
    widget.overlay = ov;
    widget.visible = true;
    wrap.dataset.spMounted = '1';

    // Pointer handlers
    dr.addEventListener('pointerdown', function(e) {
      if (modal && modal.classList.contains('sp-visible')) return; // fullscreen ha la priorità
      inputTarget = 'widget';
      startStrokeOn(e, dr);
    });
    dr.addEventListener('pointermove', function(e) {
      if (inputTarget === 'widget') moveStrokeOn(e, dr);
    });
    dr.addEventListener('pointerup', function(e) {
      if (inputTarget === 'widget') { endStrokeOn(e); inputTarget = null; }
    });
    dr.addEventListener('pointercancel', function(e) {
      if (inputTarget === 'widget') { endStrokeOn(e); inputTarget = null; }
    });
    dr.addEventListener('pointerleave', function(e) {
      if (drawing && inputTarget === 'widget') { endStrokeOn(e); inputTarget = null; }
    });

    // Ridimensiona quando il widget cambia dimensione
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function() { fitWidget(); });
      ro.observe(wrap);
    } else {
      window.addEventListener('resize', fitWidget);
    }

    // Carica per il campione corrente
    setTimeout(function() {
      fitWidget();
      loadWidgetForCurrentSample();
    }, 50);

    console.log('[SketchPad] Widget editabile montato');
    return true;
  }

  function fitWidget() {
    if (!widget.canvas) return;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var cssW = widget.canvas.clientWidth;
    var cssH = widget.canvas.clientHeight;
    if (cssW < 10 || cssH < 10) return;
    [widget.bgCanvas, widget.drawCanvas].forEach(function(c) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    });
    renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
    renderStrokesOn(widget.drawCtx, widget.drawCanvas);
  }

  function loadWidgetForCurrentSample() {
    if (!widget.canvas) return;
    var ctx = getCtx();
    if (!ctx) {
      // Niente campione: foglio vuoto
      strokes = [];
      paperType = 'lined';
      widget.contextKey = null;
      // Se il fullscreen non è aperto, niente da editare
      if (!modal || !modal.classList.contains('sp-visible')) {
        openContextKey = null;
      }
      renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
      renderStrokesOn(widget.drawCtx, widget.drawCanvas);
      return;
    }
    // Se siamo già caricati su questo campione e il fullscreen è chiuso, niente da fare
    if (widget.contextKey === ctx.key && (!modal || !modal.classList.contains('sp-visible'))) {
      // Il context è già giusto
      openContextKey = ctx.key;
      // Solo refresh visuale
      renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
      renderStrokesOn(widget.drawCtx, widget.drawCanvas);
      return;
    }
    widget.contextKey = ctx.key;
    // Se il fullscreen non è aperto, il widget è la fonte di editing
    if (!modal || !modal.classList.contains('sp-visible')) {
      openContextKey = ctx.key;
    }
    // Riusa la stessa logica del fullscreen: load locale + pull cloud LWW
    var localData = loadFromEval(ctx);
    applyLoadedData(localData);
    renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
    renderStrokesOn(widget.drawCtx, widget.drawCanvas);

    cloudPull(ctx, function(remoteData) {
      var nowCtx = getCtx();
      if (!nowCtx || nowCtx.key !== ctx.key) return;
      if (dirty) return;
      if (!remoteData) return;
      var lts = (localData && localData.updatedAt) ? Date.parse(localData.updatedAt) : 0;
      var rts = remoteData.updatedAt ? Date.parse(remoteData.updatedAt) : 0;
      if (rts > lts) {
        applyLoadedData(remoteData);
        saveToEval(nowCtx, remoteData);
        renderBackgroundOn(widget.bgCtx, widget.bgCanvas);
        renderStrokesOn(widget.drawCtx, widget.drawCanvas);
      }
    });
  }

  // Quando il widget è in replace mode, deve seguire il cambio campione
  // anche QUANDO il fullscreen è chiuso. Aggiungiamo un poll dedicato.
  var __widgetPollLast = null, __widgetPollTimer = null;
  function startWidgetSamplePoll() {
    stopWidgetSamplePoll();
    __widgetPollLast = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
    __widgetPollTimer = setInterval(function() {
      if (!widget.canvas || !isReplaceMode()) return;
      var cur = (typeof selectedSampleId !== 'undefined') ? selectedSampleId : null;
      if (cur !== __widgetPollLast) {
        // Salva il campione che stavamo editando, poi carica il nuovo
        if (dirty) flushSaveSyncImmediate();
        __widgetPollLast = cur;
        loadWidgetForCurrentSample();
      }
    }, 300);
  }
  function stopWidgetSamplePoll() {
    if (__widgetPollTimer) { clearInterval(__widgetPollTimer); __widgetPollTimer = null; }
  }

  // Mostra/nasconde overlay quando fullscreen apre/chiude
  function setWidgetOverlay(active) {
    if (!widget.overlay) return;
    widget.overlay.style.display = active ? 'flex' : 'none';
  }

  // ────────────────────────────────────────────────────────────────────
  // INTERCETTI: Espandi, Stampa, Anteprima
  // ────────────────────────────────────────────────────────────────────
  function installInterceptsIfReplaceMode() {
    if (!isReplaceMode()) return;

    // 1. openFabricNotes / openNotesFullscreenV181 → SketchPad.open
    if (typeof window.openFabricNotes === 'function' && !window.openFabricNotes.__spWrapped) {
      var origOpen = window.openFabricNotes;
      var wrapped = function() {
        try { open(); }
        catch(e) {
          console.error('[SketchPad] open failed, fallback to original', e);
          return origOpen.apply(this, arguments);
        }
      };
      wrapped.__spWrapped = true;
      window.openFabricNotes = wrapped;
      window.__spOrigOpenFabricNotes = origOpen;
    }
    if (typeof window.openNotesFullscreenV181 === 'function' && !window.openNotesFullscreenV181.__spWrapped) {
      var w2 = function() { open(); };
      w2.__spWrapped = true;
      window.openNotesFullscreenV181 = w2;
    }

    // 2. printNotes → printSketchPad (con fallback se vuoto)
    if (typeof window.printNotes === 'function' && !window.printNotes.__spWrapped) {
      var origPrint = window.printNotes;
      var pwrapped = function() {
        var ctx = getCtx();
        if (!ctx) return origPrint.apply(this, arguments);
        var data = loadFromEval(ctx);
        var hasContent = data && Array.isArray(data.strokes) && data.strokes.length > 0;
        if (hasContent) {
          return printSketchPad(ctx);
        }
        return origPrint.apply(this, arguments);
      };
      pwrapped.__spWrapped = true;
      window.printNotes = pwrapped;
      window.__spOrigPrintNotes = origPrint;
    }

    console.log('[SketchPad] Replace mode intercepts installed');
  }

  function printSketchPad(ctx) {
    // Genera PNG full-res e lo mette in una nuova finestra di stampa A4
    var t = (typeof getTasting === 'function') ? getTasting() : null;
    var sample = (t && t.samples) ? t.samples.find(function(s) { return String(s.id) === String(ctx.sampleId); }) : null;
    var sampleName = sample ? (sample.codice || sample.name || ('Campione ' + ctx.sampleId)) : ('Campione ' + ctx.sampleId);
    var tastingTitle = t ? (t.title || t.name || 'Degustazione') : 'Degustazione';
    var today = new Date().toLocaleDateString('it-IT');

    // Salviamo flag per stampare "con o senza sfondo": di default lo includiamo nella stampa
    var dataUrl = renderFullPng(true);

    var win = window.open('', '_blank');
    if (!win) {
      if (typeof toast === 'function') toast('Popup bloccato — abilita i popup per stampare');
      return;
    }
    var ct = '<' + '/';
    var html = ''
      + '<!DOCTYPE html><html><head><title>Note - ' + escapeHtml(sampleName) + ct + 'title>'
      + '<style>'
      + '@page{size:A4 portrait;margin:12mm;}'
      + '*{box-sizing:border-box;}'
      + 'body{font-family:Arial,sans-serif;margin:0;padding:0;}'
      + '.h{text-align:center;border-bottom:2px solid #722F37;padding:10px 0;margin-bottom:14px;}'
      + '.h h1{color:#722F37;margin:0 0 4px;font-size:22px;}'
      + '.h .sub{color:#666;font-size:13px;}'
      + '.img{text-align:center;}'
      + '.img img{max-width:100%;height:auto;}'
      + ct + 'style></head><body>'
      + '<div class="h"><h1>' + escapeHtml(sampleName) + ct + 'h1>'
      + '<div class="sub">' + escapeHtml(tastingTitle) + ' — ' + today + ct + 'div>' + ct + 'div>'
      + '<div class="img"><img src="' + dataUrl + '" />' + ct + 'div>'
      + ct + 'body>' + ct + 'html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(function() {
      try { win.print(); } catch(e) {}
    }, 600);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Genera PNG full-resolution dei tratti correnti
  function renderFullPng(withBg) {
    var out = document.createElement('canvas');
    out.width = PAPER_W;
    out.height = PAPER_H;
    var octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, PAPER_W, PAPER_H);
    if (withBg && paperType !== 'blank') {
      octx.strokeStyle = LINE_COLOR;
      octx.lineWidth = LINE_WIDTH;
      if (paperType === 'lined') {
        var sy = LINE_SPACING * 1.5;
        for (var y = sy; y < PAPER_H; y += LINE_SPACING) {
          octx.beginPath(); octx.moveTo(0, y); octx.lineTo(PAPER_W, y); octx.stroke();
        }
        octx.strokeStyle = 'rgba(193,77,92,0.4)';
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.moveTo(MARGIN_LEFT, 0); octx.lineTo(MARGIN_LEFT, PAPER_H); octx.stroke();
      } else if (paperType === 'grid') {
        var ox = (PAPER_W % GRID_SPACING) / 2;
        var oy = (PAPER_H % GRID_SPACING) / 2;
        for (var x = ox; x < PAPER_W; x += GRID_SPACING) {
          octx.beginPath(); octx.moveTo(x, 0); octx.lineTo(x, PAPER_H); octx.stroke();
        }
        for (var y2 = oy; y2 < PAPER_H; y2 += GRID_SPACING) {
          octx.beginPath(); octx.moveTo(0, y2); octx.lineTo(PAPER_W, y2); octx.stroke();
        }
      }
    }
    var hl = strokes.filter(function(s) { return s.tool === 'highlighter'; });
    var others = strokes.filter(function(s) { return s.tool !== 'highlighter'; });
    hl.forEach(function(s) { paintStroke(octx, s); });
    others.forEach(function(s) { paintStroke(octx, s); });
    return out.toDataURL('image/png');
  }

  // ────────────────────────────────────────────────────────────────────
  // INTERCETTO ANTEPRIMA NEL CONFRONTO (ⓘ button)
  //
  // L'app costruisce window.__notesPreviewData[key] e renderizza un bottone
  // <button data-note-preview-key="..."> visibile SE il campione ha vecchio
  // canvas Fabric o testo Quill. Click sul bottone → event delegation in
  // capture-phase chiama openNotesPreviewByKey(key) che è in scope IIFE
  // (NON intercettabile via window).
  //
  // Strategia in due passi:
  //  1) Click capture-phase con priorità ANCORA più alta: se il campione
  //     ha dati SketchPad, sostituiamo `data.canvas` nel preview-data con
  //     il PNG generato dai tratti SketchPad. La modale legge la mappa
  //     subito dopo, quindi vede già i dati arricchiti.
  //  2) DOM scan periodico della tabella di confronto: per le righe che
  //     hanno SOLO dati SketchPad e non hanno il bottone ⓘ (perché l'app
  //     non lo ha generato), iniettiamo il bottone manualmente.
  // ────────────────────────────────────────────────────────────────────

  // Cache PNG generati: rigenerare a ogni click sarebbe costoso
  var __spPreviewPngCache = {}; // key → { png, sig }
  function previewSig(sp) {
    return (sp.updatedAt || '') + ':' + (sp.strokes ? sp.strokes.length : 0);
  }

  // Indice cloud dei dati SketchPad: necessario perché lo state in memoria
  // dell'app non conserva ev.data.vista.sketchPadV1 (il sync cloud delle
  // evaluations non conosce questo campo e lo cancella ogni riallineo).
  // Mappa: tastingId|tasterId|sampleId → { strokes, paperType, updatedAt }
  var __spCloudIndex = {};
  // Quali tasting sono già stati prefetchati e quando
  var __spCloudFetched = {}; // tid → timestamp ms
  var SP_PREFETCH_TTL = 30000; // 30s, dopo richiede refresh

  function prefetchCloudIndexForTasting(tid, callback) {
    if (!tid) { callback && callback(); return; }
    var db = fbDb();
    if (!db) { callback && callback(); return; }
    var last = __spCloudFetched[tid];
    if (last && (Date.now() - last) < SP_PREFETCH_TTL) {
      callback && callback();
      return;
    }
    db.collection('tastings').doc(String(tid))
      .collection('sketchPadV1').get()
      .then(function(snap) {
        snap.forEach(function(d) {
          var data = d.data() || {};
          var docId = d.id; // formato tasterId_sampleId
          var underscoreIdx = docId.indexOf('_');
          if (underscoreIdx < 0) return;
          var tasterId = docId.slice(0, underscoreIdx);
          var sampleId = docId.slice(underscoreIdx + 1);
          var key = String(tid) + '|' + String(tasterId) + '|' + String(sampleId);
          var strokes;
          try {
            strokes = (typeof data.strokesJson === 'string')
              ? JSON.parse(data.strokesJson)
              : (Array.isArray(data.strokes) ? data.strokes : []);
          } catch(e) { strokes = []; }
          if (!strokes.length) return;
          __spCloudIndex[key] = {
            strokes: strokes,
            paperType: data.paperType || 'lined',
            updatedAt: data.updatedAt || null
          };
        });
        __spCloudFetched[tid] = Date.now();
        callback && callback();
      })
      .catch(function(err) {
        console.error('[SketchPad] prefetch cloud index error', err);
        callback && callback();
      });
  }

  // Restituisce dati SketchPad per una key, cercando in local store e cloud index
  function getSpDataForKey(key) {
    // Try local store first (modificato di recente in questa sessione)
    var local = __spLocalStore[key];
    if (local && Array.isArray(local.strokes) && local.strokes.length > 0) {
      return local;
    }
    // Fallback to cloud index
    var cloudData = __spCloudIndex[key];
    if (cloudData && cloudData.strokes && cloudData.strokes.length > 0) {
      return cloudData;
    }
    return null;
  }

  function getSketchPadPngForKey(key) {
    var sp = getSpDataForKey(key);
    if (!sp) return null;

    var sig = previewSig(sp);
    var cached = __spPreviewPngCache[key];
    if (cached && cached.sig === sig) return cached.png;

    var savedStrokes = strokes;
    var savedPaper = paperType;
    strokes = sp.strokes;
    paperType = sp.paperType || 'lined';
    var pngUrl = renderFullPng(true);
    strokes = savedStrokes;
    paperType = savedPaper;

    __spPreviewPngCache[key] = { png: pngUrl, sig: sig };
    return pngUrl;
  }

  function installPreviewIntercept() {
    if (!isReplaceMode()) return;

    // STEP 1 — click capture con priorità alta sui bottoni ⓘ
    // Usiamo capture:true e ci registriamo su `document` PRIMA del listener
    // dell'app (l'app si registra anche lei in capture, ma l'ordine di
    // registrazione conta: il primo registrato in capture è il primo a
    // ricevere — e arricchiamo prima che apra).
    document.addEventListener('click', function(ev) {
      if (!isReplaceMode()) return;
      var el = ev.target && ev.target.closest && ev.target.closest('[data-note-preview-key]');
      if (!el) return;
      var key = el.getAttribute('data-note-preview-key');
      if (!key) return;
      try {
        var png = getSketchPadPngForKey(key);
        // Cerca anche testo Quill dallo state (notesV187.text)
        var noteText = '';
        var hasText = false;
        var parts = String(key).split('|');
        if (parts.length >= 3 && typeof state !== 'undefined' && state) {
          var t = state.tastings && state.tastings.find(function(x) { return String(x.id) === String(parts[0]); });
          var ev2 = t && t.evaluations && t.evaluations[parts[1]] && t.evaluations[parts[1]][parts[2]];
          if (ev2 && ev2.data && ev2.data.vista && ev2.data.vista.notesV187 && ev2.data.vista.notesV187.text) {
            noteText = ev2.data.vista.notesV187.text;
            hasText = !!(noteText && String(noteText).replace(/<[^>]+>/g, '').trim().length > 0);
          }
        }
        if (png || hasText) {
          if (!window.__notesPreviewData) window.__notesPreviewData = {};
          var existing = window.__notesPreviewData[key] || {};
          window.__notesPreviewData[key] = {
            text: noteText || existing.text || '',
            canvas: png || existing.canvas || '',
            title: existing.title || '',
            hasText: hasText || !!existing.hasText,
            hasDraw: !!png || !!existing.hasDraw
          };
        }
      } catch(e) {
        console.error('[SketchPad] preview enrich error', e);
      }
      // NON chiamiamo preventDefault/stopPropagation:
      // lasciamo che l'event delegation dell'app prosegua e apra la modale.
    }, true); // capture phase

    // STEP 2 — DOM scan: aggiungi bottone ⓘ alle righe SketchPad-only
    // L'app rigenera la tabella ad ogni `Confronto` click. Useremo un
    // MutationObserver sulla pagina risultati per individuare le righe.
    installRowAugmentor();

    console.log('[SketchPad] Preview intercept installed (click + DOM augmenter)');
  }

  // Aggiunge bottoni ⓘ alle righe taster che hanno solo dati SketchPad
  function installRowAugmentor() {
    var augmentTimer = null;
    function scheduleAugment() {
      if (augmentTimer) return;
      augmentTimer = setTimeout(function() {
        augmentTimer = null;
        prefetchAllVisibleTastings(function() {
          augmentRows();
        });
      }, 200);
    }

    var mo = new MutationObserver(scheduleAugment);
    mo.observe(document.body, { childList: true, subtree: true });

    scheduleAugment();
    setTimeout(scheduleAugment, 1500);
    setTimeout(scheduleAugment, 3500);
  }

  // Trova tutti i tastingId presenti come righe nella pagina e fa prefetch
  function prefetchAllVisibleTastings(callback) {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.tastings)) {
      callback && callback();
      return;
    }
    // I tastingId disponibili sono in state.tastings, ma vogliamo prefetchare
    // solo quelli che appaiono effettivamente nella tabella di confronto.
    // La tabella usa data-sampleid sulle righe; troviamo i tasting che le contengono.
    var rows = document.querySelectorAll('tr[data-rowtype="taster"]');
    if (!rows.length) { callback && callback(); return; }
    var visibleTids = {};
    rows.forEach(function(tr) {
      var sid = tr.getAttribute('data-sampleid');
      if (!sid) return;
      var tasterCell = tr.querySelector('td');
      if (!tasterCell) return;
      var tasterName = tasterCell.textContent.trim();
      var match = findEvalForRow(sid, tasterName);
      if (match) visibleTids[match.tastingId] = true;
    });
    var tids = Object.keys(visibleTids);
    if (!tids.length) { callback && callback(); return; }
    var pending = tids.length;
    var done = function() { pending--; if (pending <= 0) callback && callback(); };
    tids.forEach(function(tid) { prefetchCloudIndexForTasting(tid, done); });
  }

  function normName(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function augmentRows() {
    if (!isReplaceMode()) return;
    var verbose = !!window.__SP_DEBUG_PREVIEW;

    var rows = document.querySelectorAll('tr[data-rowtype="taster"]');
    if (verbose) console.log('[SketchPad/augment] Found', rows.length, 'taster rows');
    if (!rows.length) return;

    var added = 0, skipped = 0, noMatch = 0, noSp = 0;

    rows.forEach(function(tr) {
      if (tr.dataset.spAugmented === '1') { skipped++; return; }

      var existingBtn = tr.querySelector('[data-note-preview-key]');
      if (existingBtn) {
        tr.dataset.spAugmented = '1';
        skipped++;
        return;
      }

      var sid = tr.getAttribute('data-sampleid');
      if (!sid) { skipped++; return; }

      var tasterCell = tr.querySelector('td');
      if (!tasterCell) { skipped++; return; }
      var tasterName = tasterCell.textContent.trim();

      var match = findEvalForRow(sid, tasterName);
      if (!match) {
        if (verbose) console.log('[SketchPad/augment] No state match for', { sid: sid, taster: tasterName });
        noMatch++;
        return;
      }

      var key = String(match.tastingId) + '|' + String(match.tasterId) + '|' + String(sid);
      // Cerca dati prima nello state, poi nel cloud index
      var sp = getSpDataForKey(key);
      if (!sp) {
        if (verbose) console.log('[SketchPad/augment] No SketchPad data (state+cloud) for', match.tastingId, match.tasterId, sid);
        noSp++;
        tr.dataset.spAugmented = '1';
        return;
      }

      if (!window.__notesPreviewData) window.__notesPreviewData = {};
      var existing = window.__notesPreviewData[key] || {};

      // Leggo testo Quill dallo state se disponibile (notesV187.text)
      // Lo state non conserva sketchPadV1 ma sì notesV187.
      var noteText = '';
      if (match && match.ev && match.ev.data && match.ev.data.vista
          && match.ev.data.vista.notesV187 && match.ev.data.vista.notesV187.text) {
        noteText = match.ev.data.vista.notesV187.text;
      }
      var hasText = !!(noteText && String(noteText).replace(/<[^>]+>/g, '').trim().length > 0);

      window.__notesPreviewData[key] = {
        text: existing.text || noteText,
        canvas: existing.canvas || '',
        title: existing.title || tasterName,
        hasText: existing.hasText || hasText,
        hasDraw: true
      };

      var cells = tr.querySelectorAll('td');
      var lastCell = cells[cells.length - 1];
      if (lastCell && !lastCell.querySelector('[data-note-preview-key]')) {
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.setAttribute('data-note-preview-key', key);
        btn.title = 'Apri anteprima note (SketchPad)';
        btn.style.cssText = 'padding:3px 10px;font-size:14px;line-height:1;font-weight:bold;';
        btn.textContent = 'ⓘ';
        lastCell.appendChild(btn);
        added++;
      }
      tr.dataset.spAugmented = '1';
    });

    if (verbose || added > 0) {
      console.log('[SketchPad/augment] added=' + added + ' skipped=' + skipped + ' noStateMatch=' + noMatch + ' noSketchPad=' + noSp);
    }
  }

  // Cerca evaluation per (sampleId, tasterName) tra tutti i tastings dello state.
  // Se trova solo tasting+taster ma non l'evaluation (perché stub o non caricata),
  // ritorna comunque il match con ev=null. Usato sia per cercare dati che per
  // identificare il tastingId corretto da prefetchare.
  function findEvalForRow(sampleId, tasterName) {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.tastings)) return null;
    var ts = state.tasters || [];
    var nName = normName(tasterName);
    var taster = ts.find(function(x) { return normName(x.name) === nName; });
    if (!taster) {
      taster = ts.find(function(x) {
        var n = normName(x.name);
        return n && (nName.indexOf(n) === 0 || n.indexOf(nName) === 0);
      });
    }
    if (!taster) return null;

    // Trovo il tasting che ha questo sample E include questo taster
    var fallback = null;
    for (var i = 0; i < state.tastings.length; i++) {
      var t = state.tastings[i];
      if (!t.samples || !t.samples.find(function(s) { return String(s.id) === String(sampleId); })) continue;
      var includes = (t.tasterIds && t.tasterIds.indexOf(taster.id) !== -1)
                  || (t.evaluations && t.evaluations[taster.id]);
      if (!includes) continue;
      var ev = t.evaluations && t.evaluations[taster.id] && t.evaluations[taster.id][sampleId];
      if (ev) {
        return { tastingId: t.id, tasterId: taster.id, ev: ev };
      }
      // Fallback: tasting+taster confermati ma evaluation non in state
      if (!fallback) fallback = { tastingId: t.id, tasterId: taster.id, ev: null };
    }
    return fallback;
  }

  // ────────────────────────────────────────────────────────────────────
  // BOOT
  // ────────────────────────────────────────────────────────────────────
  function boot() {
    injectGlobalStyles();
    applyReplaceModeBodyClass();
    installSelectSampleHook();
    tryAddBetaButton();

    // Migrazione e pulizia: appena lo state è disponibile, sposta gli
    // eventuali sketchPadV1 dentro ev.data.vista nel local store e rimuoveli
    // dalle evaluations (evita FirebaseError "Nested arrays").
    var cleanupAttempts = 0;
    var cleanupTimer = setInterval(function() {
      cleanupAttempts++;
      if (typeof state !== 'undefined' && state && Array.isArray(state.tastings) && state.tastings.length > 0) {
        migrateAndCleanLegacyContamination();
      }
      // Ripeti per i primi 30 secondi: i tasting possono caricarsi async
      if (cleanupAttempts > 60) clearInterval(cleanupTimer);
    }, 500);

    // Replace mode: installa intercept e widget poll
    if (isReplaceMode()) {
      setTimeout(function() {
        installInterceptsIfReplaceMode();
        installPreviewIntercept();
        startWidgetSamplePoll();
      }, 800);
      // Reinstalla dopo qualche secondo nel caso patch tardive abbiano
      // ridefinito openFabricNotes/printNotes (es. v202 caricato lazy)
      setTimeout(function() {
        installInterceptsIfReplaceMode();
      }, 3000);
    }
    // Espongo API per debug/console
    window.SketchPad = {
      open: open,
      close: close,
      forceSync: function() { flushSaveSyncImmediate(); },
      setReplaceMode: function(on) { setReplaceMode(on); },
      isReplaceMode: isReplaceMode,
      // Diagnostica anteprima nel confronto:
      scanRows: function(verbose) {
        if (verbose !== undefined) window.__SP_DEBUG_PREVIEW = !!verbose;
        // Reset del flag spAugmented così riprocessiamo le righe
        document.querySelectorAll('tr[data-rowtype="taster"]').forEach(function(tr) {
          delete tr.dataset.spAugmented;
        });
        // Invalida la cache del prefetch e ricarica
        __spCloudFetched = {};
        if (typeof prefetchAllVisibleTastings === 'function') {
          prefetchAllVisibleTastings(function() {
            if (typeof augmentRows === 'function') augmentRows();
          });
        } else if (typeof augmentRows === 'function') {
          augmentRows();
        }
      },
      _debugPreview: function() {
        var info = {
          replaceMode: isReplaceMode(),
          tasterRowsInDom: document.querySelectorAll('tr[data-rowtype="taster"]').length,
          tasterRowsAugmented: document.querySelectorAll('tr[data-rowtype="taster"][data-sp-augmented="1"]').length,
          previewBtns: document.querySelectorAll('[data-note-preview-key]').length,
          previewDataKeys: Object.keys(window.__notesPreviewData || {}).length,
          stateAvailable: typeof state !== 'undefined' && !!state,
          tastersInState: (typeof state !== 'undefined' && state && state.tasters) ? state.tasters.length : 0,
          tastingsInState: (typeof state !== 'undefined' && state && state.tastings) ? state.tastings.length : 0
        };
        // Conta entries con SketchPad nel local store
        var spCount = Object.keys(__spLocalStore).filter(function(k) {
          var v = __spLocalStore[k];
          return v && Array.isArray(v.strokes) && v.strokes.length > 0;
        }).length;
        info.localStoreEntries = spCount;
        info.cloudIndexEntries = Object.keys(__spCloudIndex).length;
        info.cloudFetchedTastings = Object.keys(__spCloudFetched).length;
        return info;
      },
      _state: function() {
        return {
          strokes: strokes.length,
          paperType: paperType,
          openContextKey: openContextKey,
          dirty: dirty,
          instanceId: __spInstanceId,
          cloudReady: cloudReadyOk(),
          dbAvailable: !!fbDb(),
          replaceMode: isReplaceMode(),
          widgetMounted: !!widget.canvas
        };
      },
      _dump: function() {
        return { strokes: strokes, paperType: paperType };
      }
    };
    console.log('✅ SketchPad Beta v2: ready (replaceMode=' + isReplaceMode() + ')');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 1);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
