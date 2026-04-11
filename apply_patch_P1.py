import sys, re

def apply(src):
    results = []

    OLD1 = '<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>'
    NEW1 = '<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js"></script><!-- V198 -->'
    assert OLD1 in src, "MOD1 non trovato"
    src = src.replace(OLD1, NEW1, 1)
    results.append("MOD1 ok")

    OLD2 = '  let db = null;\n  try{\n    const app = initializeApp(firebaseConfig);\n    db = getFirestore(app);\n  }catch(e){\n    console.error(\'Firebase init error:\', e);\n    setLed(\'offline\');\n  }'
    NEW2 = '  let db = null;\n  let storage = null; // V198\n  try{\n    const app = initializeApp(firebaseConfig);\n    db = getFirestore(app);\n    try{ storage = firebase.storage(); }catch(se){ console.warn(\'Storage init failed:\', se); }\n  }catch(e){\n    console.error(\'Firebase init error:\', e);\n    setLed(\'offline\');\n  }'
    assert OLD2 in src, "MOD2 non trovato"
    src = src.replace(OLD2, NEW2, 1)
    results.append("MOD2 ok")

    OLD3 = '  // ====== ISOLATED CANVAS SYNC (non realtime UI refresh) ======\n  let __canvasSyncTimer = null;\n  let __canvasDirtyUntil = 0;\n\n  const queueCanvasSync = (tid, tasterId, sampleId, dataUrl) => {\n    if(!db || !tid || !tasterId || !sampleId) return;\n    __canvasDirtyUntil = Date.now() + 1500;\n    if(__canvasSyncTimer) clearTimeout(__canvasSyncTimer);\n    __canvasSyncTimer = setTimeout(async ()=>{\n      const payload = {\n        tastingId: String(tid),\n        tasterId: Number(tasterId),\n        sampleId: String(sampleId),\n        dataUrl: dataUrl || null,\n        updatedAt: new Date().toISOString()\n      };\n      beginWrite();\n      try{\n        await setDoc(doc(db,\'tastings\', String(tid), \'canvases\', String(tasterId) + \'_\' + String(sampleId)), payload, {merge:true});\n      } finally { endWrite(); }\n    }, 700);\n  };\n  window.queueCanvasSync = queueCanvasSync;'
    NEW3 = '  // ====== ISOLATED CANVAS SYNC — V198: Firebase Storage ======\n  let __canvasSyncTimer = null;\n  let __canvasDirtyUntil = 0;\n\n  const queueCanvasSync = (tid, tasterId, sampleId, dataUrl) => {\n    if(!db || !tid || !tasterId || !sampleId) return;\n    __canvasDirtyUntil = Date.now() + 1500;\n    if(__canvasSyncTimer) clearTimeout(__canvasSyncTimer);\n    __canvasSyncTimer = setTimeout(async ()=>{\n      const docKey = String(tasterId) + \'_\' + String(sampleId);\n      if(!dataUrl){\n        const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), storageUrl: null, dataUrl: null, updatedAt: new Date().toISOString() };\n        beginWrite();\n        try{ await setDoc(doc(db,\'tastings\', String(tid), \'canvases\', docKey), payload, {merge:true}); } finally { endWrite(); }\n        return;\n      }\n      if(storage){\n        try{\n          const res = await fetch(dataUrl);\n          const blob = await res.blob();\n          const path = \'canvases/\' + tid + \'/\' + docKey + \'.png\';\n          const storageRef = firebase.storage().ref(path);\n          beginWrite();\n          try{\n            await storageRef.put(blob, { contentType: \'image/png\' });\n            const storageUrl = await storageRef.getDownloadURL();\n            const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), storageUrl: storageUrl, dataUrl: null, updatedAt: new Date().toISOString() };\n            await setDoc(doc(db,\'tastings\', String(tid), \'canvases\', docKey), payload, {merge:true});\n            console.log(\'V198: Canvas to Storage:\', path);\n          } finally { endWrite(); }\n        } catch(e){\n          console.warn(\'V198: Storage fallback:\', e);\n          const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), dataUrl: dataUrl, updatedAt: new Date().toISOString() };\n          beginWrite();\n          try{ await setDoc(doc(db,\'tastings\', String(tid), \'canvases\', docKey), payload, {merge:true}); } finally { endWrite(); }\n        }\n      } else {\n        const payload = { tastingId: String(tid), tasterId: Number(tasterId), sampleId: String(sampleId), dataUrl: dataUrl, updatedAt: new Date().toISOString() };\n        beginWrite();\n        try{ await setDoc(doc(db,\'tastings\', String(tid), \'canvases\', docKey), payload, {merge:true}); } finally { endWrite(); }\n      }\n    }, 700);\n  };\n  window.queueCanvasSync = queueCanvasSync;'
    assert OLD3 in src, "MOD3 non trovato"
    src = src.replace(OLD3, NEW3, 1)
    results.append("MOD3 ok")

    OLD4 = '        ev.data.vista.canvas = d.dataUrl || null;'
    NEW4 = '        // V198: preferisci storageUrl, fallback dataUrl legacy\n        ev.data.vista.canvas = d.storageUrl || d.dataUrl || null;'
    assert OLD4 in src, "MOD4 non trovato"
    src = src.replace(OLD4, NEW4, 1)
    results.append("MOD4 ok")

    OLD5 = '      // Also sync legacy canvas dataUrl'
    NEW5 = '      // V198: Upload canvas PNG su Firebase Storage (via queueCanvasSync)'
    assert OLD5 in src, "MOD5 non trovato"
    src = src.replace(OLD5, NEW5, 1)
    results.append("MOD5 ok")

    for r in results:
        print("✅", r)
    return src

with open('index.html', 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Letto index.html: {len(src):,} caratteri")
patched = apply(src)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(patched)
print(f"\n🎉 Patch applicata! index.html aggiornato ({len(patched):,} caratteri)")
