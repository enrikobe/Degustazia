#!/usr/bin/env python3
"""
apply_patch_P2.py
Separa index.html in moduli js/ + css/
Uso: python3 apply_patch_P2.py   (da dentro la cartella Degustazia)
"""
import os, re

SRC = 'index.html'

with open(SRC, 'r', encoding='utf-8') as f:
    src = f.read()

print(f'📄 Letto {SRC}: {len(src):,} caratteri')

os.makedirs('js/pages', exist_ok=True)
os.makedirs('js/components', exist_ok=True)
os.makedirs('css', exist_ok=True)

# ─────────────────────────────────────────────
# 1. ESTRAI CSS  →  css/style.css
# ─────────────────────────────────────────────
css_match = re.search(r'<style>(.*?)</style>', src, re.DOTALL)
if css_match:
    css_content = css_match.group(1).strip()
    with open('css/style.css', 'w', encoding='utf-8') as f:
        f.write('/* style.css — estratto da index.html P2 */\n\n')
        f.write(css_content)
    print(f'✅ css/style.css ({len(css_content):,} chars)')
else:
    print('❌ CSS non trovato')

# ─────────────────────────────────────────────
# 2. ESTRAI TUTTI I BLOCCHI <script>
# ─────────────────────────────────────────────
script_blocks = re.findall(r'<script(?:\s[^>]*)?>(?!.*?src=)(.*?)</script>', src, re.DOTALL)
all_js = '\n\n'.join(b.strip() for b in script_blocks if b.strip())
print(f'📦 Script totali estratti: {len(script_blocks)} blocchi, {len(all_js):,} chars')

# ─────────────────────────────────────────────
# HELPER: estrai una sezione per marker
# ─────────────────────────────────────────────
def extract_between(text, start_marker, end_marker):
    s = text.find(start_marker)
    e = text.find(end_marker, s + len(start_marker)) if s != -1 else -1
    if s == -1: return ''
    if e == -1: return text[s:].strip()
    return text[s:e].strip()

def extract_functions(text, func_names):
    """Estrae funzioni JS per nome dal testo"""
    result = []
    for name in func_names:
        # Cerca function name( o const name = o window.name
        patterns = [
            rf'(function {re.escape(name)}\s*\([^)]*\)\s*\{{)',
            rf'((?:const|let|var)\s+{re.escape(name)}\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)',
            rf'((?:const|let|var)\s+{re.escape(name)}\s*=\s*async\s+function)',
            rf'(window\.{re.escape(name)}\s*=)',
        ]
        for pat in patterns:
            m = re.search(pat, text)
            if m:
                start = m.start()
                # Trova la fine della funzione contando le parentesi graffe
                depth = 0
                i = start
                in_func = False
                while i < len(text):
                    if text[i] == '{':
                        depth += 1
                        in_func = True
                    elif text[i] == '}':
                        depth -= 1
                        if in_func and depth == 0:
                            result.append(text[start:i+1])
                            break
                    i += 1
                break
    return '\n\n'.join(result)

# ─────────────────────────────────────────────
# 3. js/state.js
# ─────────────────────────────────────────────
state_content = '''// state.js — state globale, helpers, migrate
// Estratto da index.html — P2

'''

# Estrai il blocco STORAGEKEY e state iniziale
storagekey_idx = all_js.find('const STORAGEKEY')
helpers_end = all_js.find('function blankEval')
if storagekey_idx != -1 and helpers_end != -1:
    # Trova fine di blankEval
    depth = 0
    i = helpers_end
    in_func = False
    while i < len(all_js):
        if all_js[i] == '{':
            depth += 1; in_func = True
        elif all_js[i] == '}':
            depth -= 1
            if in_func and depth == 0:
                helpers_end_pos = i + 1
                break
        i += 1
    
    # Cerca isBlankEval subito dopo
    isblank_idx = all_js.find('function isBlankEval', helpers_end_pos)
    if isblank_idx != -1:
        depth = 0; i = isblank_idx; in_func = False
        while i < len(all_js):
            if all_js[i] == '{': depth += 1; in_func = True
            elif all_js[i] == '}':
                depth -= 1
                if in_func and depth == 0:
                    helpers_end_pos = i + 1; break
            i += 1

    state_content += all_js[storagekey_idx:helpers_end_pos]

# Aggiungi migrate e saveState/loadState se presenti
for fname in ['migrate', 'saveState', 'loadState']:
    idx = all_js.find(f'function {fname}')
    if idx == -1:
        idx = all_js.find(f'const {fname}')
    if idx != -1:
        depth = 0; i = idx; in_func = False; found_end = -1
        while i < len(all_js):
            if all_js[i] == '{': depth += 1; in_func = True
            elif all_js[i] == '}':
                depth -= 1
                if in_func and depth == 0:
                    found_end = i + 1; break
            i += 1
        if found_end != -1:
            state_content += '\n\n' + all_js[idx:found_end]

with open('js/state.js', 'w', encoding='utf-8') as f:
    f.write(state_content)
print(f'✅ js/state.js ({len(state_content):,} chars)')

# ─────────────────────────────────────────────
# 4. js/firebase.js
# ─────────────────────────────────────────────
firebase_markers = [
    '// --- Firebase Compat loader',
    '// ====== CONFIGURAZIONE FIREBASE',
    '// ====== LED',
    '// ====== CLOUD READY GATE',
    '// ====== INIT FIREBASE',
    '// ====== DIFF-BASED CLOUD SYNC',
    '// ====== POLLING SYNC',
    '// ====== ISOLATED CANVAS SYNC',
    '// ====== V197: IMPROVED FABRIC NOTES',
]

firebase_content = '// firebase.js — init Firebase, sync, canvas/notes upload\n// Estratto da index.html — P2\n\n'

# Trova il blocco firebase nell'HTML originale (tra i tag script Firebase)
firebase_start = src.find('<!-- FIREBASE CLOUD-ONLY START -->')
firebase_end = src.find('// ====== FINE MODIFICHE ====')
if firebase_start != -1 and firebase_end != -1:
    # Estrai solo il contenuto JS dai tag script in quell'area
    fb_area = src[firebase_start:firebase_end]
    fb_scripts = re.findall(r'<script(?:\s[^>]*)?>(?!.*?src=)(.*?)</script>', fb_area, re.DOTALL)
    firebase_content += '\n\n'.join(s.strip() for s in fb_scripts if s.strip())
else:
    # Fallback: cerca i marker nel JS combinato
    for marker in firebase_markers:
        idx = all_js.find(marker)
        if idx != -1:
            firebase_content += all_js[idx:idx+200] + '\n// [CONTINUA...]\n'

with open('js/firebase.js', 'w', encoding='utf-8') as f:
    f.write(firebase_content)
print(f'✅ js/firebase.js ({len(firebase_content):,} chars)')

# ─────────────────────────────────────────────
# 5. js/router.js
# ─────────────────────────────────────────────
router_funcs = ['go', 'updateTopActions', 'disableInputs', 'toggleZen', 
                'setZenUI', 'closeFiltersPanel', 'toggleFiltersPanel']
router_content = '// router.js — navigazione tra pagine, zen mode\n// Estratto da index.html — P2\n\n'
router_content += extract_functions(all_js, router_funcs)

with open('js/router.js', 'w', encoding='utf-8') as f:
    f.write(router_content)
print(f'✅ js/router.js ({len(router_content):,} chars)')

# ─────────────────────────────────────────────
# 6. js/components/canvas.js
# ─────────────────────────────────────────────
canvas_funcs = ['initCanvas', 'loadCanvasFromEval', 'clearCanvas', 
                'clearCanvasVisualOnly', 'setTool', 'onCanvasDown',
                'onCanvasMove', 'onCanvasUp', 'isCanvasEmptyDataUrl',
                'initFSMaster', 'syncWidgetToFS', 'forceEnableClear']
canvas_content = '// canvas.js — gestione canvas di disegno\n// Estratto da index.html — P2\n\n'
canvas_content += extract_functions(all_js, canvas_funcs)

with open('js/components/canvas.js', 'w', encoding='utf-8') as f:
    f.write(canvas_content)
print(f'✅ js/components/canvas.js ({len(canvas_content):,} chars)')

# ─────────────────────────────────────────────
# 7. js/pages/anagrafiche.js
# ─────────────────────────────────────────────
ana_funcs = ['renderAnagrafiche', 'addTaster', 'deleteTaster',
             'addProfile', 'deleteProfile', 'addGroup', 'deleteGroup',
             'renderDescriptorPickers', 'addTastingDescriptor',
             'addTastingDescriptorQuick']
ana_content = '// anagrafiche.js — pagina Anagrafiche\n// Estratto da index.html — P2\n\n'
ana_content += extract_functions(all_js, ana_funcs)

with open('js/pages/anagrafiche.js', 'w', encoding='utf-8') as f:
    f.write(ana_content)
print(f'✅ js/pages/anagrafiche.js ({len(ana_content):,} chars)')

# ─────────────────────────────────────────────
# 8. js/pages/archivio.js
# ─────────────────────────────────────────────
arch_funcs = ['renderArchive', 'onArchiveSearch', 'exportJson',
              'exportSingleJson', 'triggerImportJson', 'openMultiComparison',
              'clearMultiSelection', 'updateMultiSelectUI']
arch_content = '// archivio.js — pagina Archivio\n// Estratto da index.html — P2\n\n'
arch_content += extract_functions(all_js, arch_funcs)

with open('js/pages/archivio.js', 'w', encoding='utf-8') as f:
    f.write(arch_content)
print(f'✅ js/pages/archivio.js ({len(arch_content):,} chars)')

# ─────────────────────────────────────────────
# 9. js/pages/risultati.js
# ─────────────────────────────────────────────
ris_funcs = ['renderResultsTable', 'renderResultsSelect', 'printResults',
             'onResultsSort', 'openResultsCanvas', 'exportTableCSV']
ris_content = '// risultati.js — pagina Confronto/Risultati\n// Estratto da index.html — P2\n\n'
ris_content += extract_functions(all_js, ris_funcs)

with open('js/pages/risultati.js', 'w', encoding='utf-8') as f:
    f.write(ris_content)
print(f'✅ js/pages/risultati.js ({len(ris_content):,} chars)')

# ─────────────────────────────────────────────
# 10. js/pages/preparazione.js
# ─────────────────────────────────────────────
prep_funcs = ['renderPreparation', 'addSample', 'deleteSample',
              'addProduct', 'deleteProduct', 'renderProductsStrip',
              'toggleBlindProduct', 'forceEnableClear']
prep_content = '// preparazione.js — pagina Preparazione\n// Estratto da index.html — P2\n\n'
prep_content += extract_functions(all_js, prep_funcs)

with open('js/pages/preparazione.js', 'w', encoding='utf-8') as f:
    f.write(prep_content)
print(f'✅ js/pages/preparazione.js ({len(prep_content):,} chars)')

# ─────────────────────────────────────────────
# 11. js/pages/degustazione.js
# ─────────────────────────────────────────────
deg_funcs = ['renderTastingPage', 'renderGrid', 'updateDetail', 
             'selectSample', 'renderSortButtons', 'renderGroupFilterBtns',
             'renderProfileFilterBtns', 'renderProfileOptions',
             'hydrateTasterSelect', 'toggleDesc', 'zenPlusToggleDesc',
             'renderZenPlusDescriptors', 'calcProgress', 'calcOverall',
             'evoDotsHTML', 'finishTasting']
deg_content = '// degustazione.js — pagina principale di degustazione\n// Estratto da index.html — P2\n\n'
deg_content += extract_functions(all_js, deg_funcs)

with open('js/pages/degustazione.js', 'w', encoding='utf-8') as f:
    f.write(deg_content)
print(f'✅ js/pages/degustazione.js ({len(deg_content):,} chars)')

# ─────────────────────────────────────────────
# 12. Genera nuovo index.html (shell)
# ─────────────────────────────────────────────
# Rimuovi il CSS inline e sostituisci con link
new_html = re.sub(r'<style>.*?</style>', 
                  '<link rel="stylesheet" href="css/style.css">', 
                  src, flags=re.DOTALL, count=1)

# Rimuovi tutti gli script inline (non src=) e aggiungi i moduli alla fine
new_html = re.sub(r'<script(?!\s[^>]*src=)[^>]*>.*?</script>', 
                  '', new_html, flags=re.DOTALL)

# Inserisci i moduli prima di </body>
modules = '''
  <!-- P2: moduli estratti da index.html -->
  <script src="js/state.js"></script>
  <script src="js/firebase.js"></script>
  <script src="js/components/canvas.js"></script>
  <script src="js/components/notes.js"></script>
  <script src="js/pages/preparazione.js"></script>
  <script src="js/pages/anagrafiche.js"></script>
  <script src="js/pages/degustazione.js"></script>
  <script src="js/pages/archivio.js"></script>
  <script src="js/pages/risultati.js"></script>
  <script src="js/router.js"></script>
'''
new_html = new_html.replace('</body>', modules + '</body>')

with open('index_P2_shell.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
print(f'\n✅ index_P2_shell.html generato ({len(new_html):,} chars)')

print('''
🎉 P2 struttura creata!

File generati:
  css/style.css
  js/state.js
  js/firebase.js
  js/router.js
  js/components/canvas.js
  js/pages/anagrafiche.js
  js/pages/archivio.js
  js/pages/risultati.js
  js/pages/preparazione.js
  js/pages/degustazione.js
  index_P2_shell.html  ← nuovo index senza codice inline

⚠️  NOTA: js/components/notes.js va estratto manualmente
    (il codice Fabric.js notes è molto intrecciato con lo stato)
    
Passo successivo:
  1. Verifica i file estratti
  2. Testa index_P2_shell.html in locale
  3. Se ok → rinomina in index.html e committa
''')
