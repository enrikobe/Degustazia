// ui_prefs.js — P2c

function fmtDateIT(iso){
  try{
    if(!iso) return '';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const wd = ['dom','lun','mar','mer','gio','ven','sab'][d.getDay()] || '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${wd} ${dd}/${mm}/${yyyy}`;
  }catch(e){ return ''; }
}

    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function esc(s){
      return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }
    function fmtSampleId(id){
      const s = String(id ?? "").trim();
      if(/^\d+$/.test(s)) return s.padStart(2,"0");
      return s;
    }
    function cmpSampleId(a,b){
      return String(a ?? "").localeCompare(String(b ?? ""), "it", {numeric:true, sensitivity:"base"});
    }
    function toast(msg){
      const t = document.getElementById("toast");
      if(!t) return;
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 1600);
    }
    function parseIntSafe(v, def=0){
      const n = parseInt(String(v ?? "").trim(), 10);
      return Number.isFinite(n) ? n : def;
    }
    function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
    function slugify(s){
      return String(s ?? "").trim().toLowerCase()
        .replace(/\s+/g,"-")
        .replace(/[^a-z0-9-]/g,"")
        .replace(/-+/g,"-");
    }
    function safeCssEscape(s){
      try{ return CSS.escape(String(s)); }catch{ return String(s).replaceAll('"','\"'); }
    }
    function hexToRgba(hex, alpha){
      const h = String(hex).trim().replace("#","");
      if(!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(0,0,0,${alpha})`;
      const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    function hexToRgbParts(hex){
      const h = String(hex).trim().replace("#","");
      if(!/^[0-9a-fA-F]{6}$/.test(h)) return {r:0,g:0,b:0};
      return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)};
    }
    function downloadBlob(filename, text, mime="text/plain"){
      const blob = new Blob([text], {type:mime});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=filename;
      document.body.appendChild(a);
      a.click(); a.remove();
      URL.revokeObjectURL(url);
    }

    function blankEval(){
      return {
        profileKey:null,
        evolution:0,
        favourite:false,
        overall:0,
        progress:0,
        data:{
          vista:{intensita:0, limpidezza:0, desc:[], canvas:null},
          olfatto:{intensita:0, complessita:0, desc:[]},
          gusto:{corpo:0, acidita:0, persistenza:0, desc:[]},
        }
      };
    }

    // V148: una evaluation vuota creata automaticamente per la UI NON deve essere sincronizzata,
    // altrimenti una nuova istanza puo' sovrascrivere dati reali presenti su cloud.
    function isBlankEval(ev){
      try{
        if(!ev) return true;
        // V150: se ha updatedAt, è stata modificata intenzionalmente, NON è blank
        if(ev.updatedAt) return false;
        if(ev.profileKey) return false;
        if((parseInt(ev.evolution||0,10)||0) > 0) return false;
        if(!!ev.favourite) return false;

        const v = ev.data?.vista || {};
        const o = ev.data?.olfatto || {};
        const g = ev.data?.gusto || {};

        const sliders = [v.intensita, v.limpidezza, o.intensita, o.complessita, g.corpo, g.acidita, g.persistenza];
        if(sliders.some(x => (parseInt(x||0,10)||0) > 0)) return false;

        if((v.desc||[]).length) return false;
        if((o.desc||[]).length) return false;
        if((g.desc||[]).length) return false;

        return true;
      }catch(e){ return false; }
    }

    function defaultProfiles(){
      return [
        {key:"floreale", label:"Floreale", color:"5a8e3a"},
        {key:"agrumato", label:"Agrumato", color:"d4a938"},
        {key:"fruttato", label:"Fruttato", color:"c84343"},
        {key:"maturo", label:"Maturo", color:"8b5a3c"},
      ];
    }
    function defaultGroups(){
      return [
        {key:"gruppo-a", label:"Gruppo A", color:"6b8fd6"},
        {key:"gruppo-b", label:"Gruppo B", color:"72b37e"},
        {key:"gruppo-c", label:"Gruppo C", color:"d6a26b"},
        {key:"gruppo-d", label:"Gruppo D", color:"b56bd6"},
      ];
    }
    function defaultDescriptors(){
      return {
        vista:{white:["Paglierino","Dorato"], red:["Ambrato"]},
        olfatto:{white:["Agrumi","Fiori bianchi"], red:["Tostato"]},
        gusto:{white:["Fresco","Sapido"], red:["Morbido","Caldo"]},
      };
    }

    function demoTasting(){
      const cols = ["Col1","Col2","Col3","Col4"];
      const rows = [
        ["Cuvée Prestige","2021","Franciacorta",""],
        ["Cuvée Prestige","2020","Franciacorta",""],
        ["Cuvée Prestige","2019","Franciacorta",""],
        ["Satèn","2021","Franciacorta",""],
        ["Satèn","2020","Franciacorta",""],
        ["Rosé","2021","Franciacorta",""],
        ["Annamaria Clementi","2015","Franciacorta",""],
        ["Riserva Dosage Zéro","2016","Franciacorta",""],
      ];

      return {
        id: uid(),
        title: "Panel Demo 2025",
        status: "attiva",
        mode: "scoperta",
        createdAt: nowIso(),
        finishedAt: null,
        columns: cols.slice(0,4),
        groups: clone(defaultGroups()),
        samples: rows.map((r,i)=>({id:String(i+1).padStart(2,"0"), cols:r.slice(0,4), groupKey:null})),
        products: null,
        blindMap: {},
        tasterIds: [1,2,3,4],
        evaluations: {}
      };
    }

    function defaultState(){
      return {
        tasters:[
          {id:1, name:"Stefano", email:"s.capelli@cadelbosco.com"},
          {id:2, name:"Guido", email:"g.gandossi@cadelbosco.com"},
          {id:3, name:"Leonardo", email:"l.sora@cadelbosco.com"},
          {id:4, name:"Enrico", email:"e.bettinzoli@cadelbosco.com"},
        ],
        profiles: defaultProfiles(),
        groups: defaultGroups(),
        descriptors: defaultDescriptors(),
        tastings:[],
        currentTastingId: null,
        currentTaster: null,
        ui:{
          prepTab:"attive",
          filterProfile:"tutti",
          filterGroup:"tutti",
          sort:"custom",
          archiveSearch:"",
          resultsSearch:"",
          zen:false,
        }
      };
    }

    let state = defaultState();

    function loadState(){
      // Cloud-only: lo stato viene mantenuto da Firestore (listener realtime).
      return null;
    }


    
// V114: preferenze UI locali (NON sincronizzate)
const LOCAL_UI_PREFS_KEY = 'degustapp_local_ui_prefs_v3';

function getLocalCardUiPrefs(){
  try{ return JSON.parse(localStorage.getItem(LOCAL_UI_PREFS_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function setLocalCardUiPrefs(patch){
  const cur = getLocalCardUiPrefs();
  const next = Object.assign({}, cur, patch||{});
  try{ localStorage.setItem(LOCAL_UI_PREFS_KEY, JSON.stringify(next)); }catch(e){}
  return next;
}

function applyLocalCardUiPrefs(){
  const p = getLocalCardUiPrefs();
  const delta = (typeof p.cardColsDelta === 'number' && isFinite(p.cardColsDelta)) ? Math.round(p.cardColsDelta) : 0;
  const d = Math.max(-3, Math.min(3, delta));
  const ts = (typeof p.cardTextScale === 'number' && isFinite(p.cardTextScale)) ? p.cardTextScale : 1;

  // Base colonne (default): in ZEN+ leggermente più grandi (tablet-friendly)
  const baseCols = {
    normal: { landscape: 6, portrait: 4 },
    zenplus: { landscape: 6, portrait: 4 }
  };

  const cols = {
    normal: {
      landscape: Math.max(1, baseCols.normal.landscape + d),
      portrait: Math.max(1, baseCols.normal.portrait + d)
    },
    zenplus: {
      landscape: Math.max(1, baseCols.zenplus.landscape + d),
      portrait: Math.max(1, baseCols.zenplus.portrait + d)
    }
  };

  // Applica colonne via CSS vars
  document.documentElement.style.setProperty('--grid-cols', String(cols.normal.landscape));
  document.documentElement.style.setProperty('--grid-cols-portrait', String(cols.normal.portrait));
  document.documentElement.style.setProperty('--grid-cols-zenplus', String(cols.zenplus.landscape));
  document.documentElement.style.setProperty('--grid-cols-zenplus-portrait', String(cols.zenplus.portrait));

  // Scala spaziature/min-height coerentemente al numero colonne della vista corrente
  const isZenp = document.body.classList.contains('zenplus');
  const isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
  const curBase = isZenp ? (isPortrait ? baseCols.zenplus.portrait : baseCols.zenplus.landscape)
                         : (isPortrait ? baseCols.normal.portrait : baseCols.normal.landscape);
  const curCols = isZenp ? (isPortrait ? cols.zenplus.portrait : cols.zenplus.landscape)
                         : (isPortrait ? cols.normal.portrait : cols.normal.landscape);
  const cs = Math.max(0.6, Math.min(1.8, curBase / Math.max(1, curCols)));

  // Base px -> scalate via JS
  const base = {
    gridGap: 8,
    gridGapZenplus: 7,
    cardPadding: 9,
    cardGap: 8,
    cardRadius: 12,
    cardMinHeight: 126,
    cardFont: 13
  };

  document.documentElement.style.setProperty('--grid-gap', (base.gridGap * cs) + 'px');
  document.documentElement.style.setProperty('--grid-gap-zenplus', (base.gridGapZenplus * cs) + 'px');
  document.documentElement.style.setProperty('--card-padding', (base.cardPadding * cs) + 'px');
  document.documentElement.style.setProperty('--card-gap', (base.cardGap * cs) + 'px');
  document.documentElement.style.setProperty('--card-radius', (base.cardRadius * cs) + 'px');
  document.documentElement.style.setProperty('--card-min-height', (base.cardMinHeight * cs) + 'px');

  // Testo: scala tutto
  document.documentElement.style.setProperty('--card-font-size', (base.cardFont * ts) + 'px');

  const r1 = document.getElementById('rngCardScale');
  const l1 = document.getElementById('lblCardScale');
  if(r1){ r1.value = String(d); }
  if(l1){ l1.textContent = 'Colonne: ' + String(curCols); }

  const r2 = document.getElementById('rngCardTextScale');
  const l2 = document.getElementById('lblCardTextScale');
  if(r2){ r2.value = String(Math.round(ts*100)); }
  if(l2){ l2.textContent = String(Math.round(ts*100)) + '%'; }
}

// V144: preferenza colore card per degustatore+degustazione (LOCALE, no cloud)
const LOCAL_COLOR_MODE_KEY = 'degustapp_color_mode_by_taster_v1';
function __getLocalColorModeMap(){
  try{
    if(window.__localColorModeMap) return window.__localColorModeMap;
    window.__localColorModeMap = JSON.parse(localStorage.getItem(LOCAL_COLOR_MODE_KEY) || '{}') || {};
    return window.__localColorModeMap;
  }catch(e){ window.__localColorModeMap = {}; return window.__localColorModeMap; }
}
function __saveLocalColorModeMap(){
  try{ localStorage.setItem(LOCAL_COLOR_MODE_KEY, JSON.stringify(window.__localColorModeMap || {})); }catch(e){}
}
function __getLocalCardColorMode(tastingId, tasterId){
  const map = __getLocalColorModeMap();
  const key = String(tastingId||'') + '|' + String(tasterId||'');
  const v = String(map[key] || '');
  return (v === 'group') ? 'group' : (v === 'profile') ? 'profile' : '';
}
function __setLocalCardColorMode(tastingId, tasterId, mode){
  try{
    const map = __getLocalColorModeMap();
    const key = String(tastingId||'') + '|' + String(tasterId||'');
    map[key] = (String(mode)==='group') ? 'group' : 'profile';
    __saveLocalColorModeMap();
  }catch(e){}
}


function onCardScaleInput(v){
  const num = Math.max(-3, Math.min(3, parseInt(String(v),10) || 0));
  setLocalCardUiPrefs({ cardColsDelta: num });
  applyLocalCardUiPrefs();
  try{ renderGrid(); }catch(e){}
}

function onCardTextScaleInput(v){
  const num = Math.max(50, Math.min(180, parseInt(String(v),10) || 100));
  setLocalCardUiPrefs({ cardTextScale: num/100 });
  applyLocalCardUiPrefs();
  try{ renderGrid(); }catch(e){}
}

