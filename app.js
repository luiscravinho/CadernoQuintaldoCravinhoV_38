/* ===================== DADOS / PROJETO ===================== */
const APP_VERSION = "v1.0.38";
const BASE_INICIAL = {

"Asteráceas / Compostas":{
 "Alcachofra":{variedades:[],companheiras:[],antagonicas:[]},
 "Alface":{
  variedades:["4 Estações","Cerbiatta","Cocarde","Little Leprechaun",
  "Red Salad Bowl","Salad Bowl","Barlach roxa","Hawking RZ","Tralex RZ",
  "Blonde Amaroza","Bionda a foglia riccia","Expertise verde","Grego"],
  companheiras:["Cenoura","Rabanete","Cebolinho"],
  antagonicas:["Salsa"]
 },
 "Camomila":{variedades:[],companheiras:["Couve"],antagonicas:[]},
 "Canónigos / alface-cordeiro":{variedades:[],companheiras:["Cenoura"],antagonicas:[]},
 "Estragão":{variedades:[],companheiras:["Beringela"],antagonicas:[]}
},

"Boraginaceae":{
 "Borragem":{variedades:[],companheiras:["Morango","Tomate"],antagonicas:[]}
},

"Brássicas / Crucíferas":{
 "Brócolo":{variedades:[],companheiras:["Cebola","Alecrim"],antagonicas:["Morango"]},
 "Couve":{
  variedades:["Portuguesa","Toscana","Kale","Kale roxa","Frisada"],
  companheiras:["Alho","Cebola","Alecrim"],
  antagonicas:["Morango"]
 },
 "Rabanete":{
  variedades:["Roxo","Verde","Cores"],
  companheiras:["Alface","Cenoura"],
  antagonicas:["Hissopo"]
 }
},

"Solanáceas":{
 "Tomate":{
  variedades:["Coração de boi","Moneymaker"],
  companheiras:["Manjericão","Cenoura","Alface"],
  antagonicas:["Batata","Funcho"]
 },
 "Batata":{
  variedades:["Branca","Electra"],
  companheiras:["Feijão","Couve"],
  antagonicas:["Tomate","Pepino"]
 },
 "Pimento":{
  variedades:["d'Asti rosso","d'Asti giallo"],
  companheiras:["Manjericão","Cenoura"],
  antagonicas:["Funcho"]
 }
},

"Leguminosas":{
 "Feijão":{
  variedades:["Verde","Verde amarelo","Verde vermelho","Catarino","Preto","Vermelho"],
  companheiras:["Milho","Abóbora"],
  antagonicas:["Alho"]
 },
 "Ervilha":{
  variedades:["Ervilhas","Ervilhas quebra"],
  companheiras:["Cenoura","Rabanete"],
  antagonicas:["Cebola"]
 }
}

};

function deepClone(obj){
  if(typeof structuredClone==="function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}
function nowISO(){ return new Date().toISOString(); }
function fmtDatePT(iso){
  const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(iso||"");
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function norm(s){ return String(s||"").trim().replace(/\s+/g," "); }
function cmp(s){ return norm(s).toLowerCase(); }
function uniqList(arr){
  const seen=new Set(); const out=[];
  for(const x of arr){
    const t=norm(x);
    if(!t) continue;
    const k=cmp(t);
    if(seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  return out;
}
function parseLista(csv){ return uniqList(String(csv||"").split(",").map(s=>s.trim())); }
function hasText(v){ return v!==undefined && v!==null && String(v).trim()!==""; }
const gerarID = ()=> (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2));

let data = {
  app:"bio_suite",
  version: APP_VERSION,
  meta:{created_at: nowISO(), updated_at: nowISO()},
  base: deepClone(BASE_INICIAL),
  culturas: [],      // {id,familia,especie,variedade, ops:[...]}
  rotacaoHistorico: [], // histórico anual manual, sem alterar operações existentes
  tratamentos: [],  // {id, culturaIds:[], ... , fotos:[ref,...]}
  calendar: null,  // {name, ref, inline}
  ops_tasks: [],    // {id, categoria, tipo[], data, parcela[], culturaId[], ...}
  notas: [],
  fin: { compras: [], vendas: [] }
};

let projectDirHandle = null;
let projectFileName = "bio_suite.json";
let pendingProjectDirHandle = null; // pasta lembrada mas ainda sem permissão (precisa gesto do utilizador)

let dirty = false;
let autosaveTimer = null;
let autosaveEnabled = true;
let lastSavedAt = null; // Date
const LOCAL_DRAFT_KEY = "bio_suite_local_draft_v1";
const LOCAL_DRAFT_META_KEY = "bio_suite_local_draft_meta_v1";

// Base de dados local (IndexedDB) para rascunho + fotos (modo telemóvel/offline)
const LOCAL_DB_NAME = "bio_suite_localdb_v1";
const LOCAL_KV_STORE = "kv";
const LOCAL_PHOTO_STORE = "photos";
const LOCAL_DRAFT_ID = "draft";

const ORIGIN_KEY = "bio_suite_origin_v1";
let originWarning = "";
// guardar "handle" da pasta do projeto (só a referência/permissão; os dados continuam no bio_suite.json)
const HANDLE_DB_NAME = "bio_suite_handles_v1";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "project_dir";

function idbOpenHandleDB(){
  return new Promise((resolve,reject)=>{
    try{
      const req = indexedDB.open(HANDLE_DB_NAME, 1);
      req.onupgradeneeded = ()=> {
        const db = req.result;
        if(!db.objectStoreNames.contains(HANDLE_STORE)){
          db.createObjectStore(HANDLE_STORE, {keyPath:"id"});
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error || new Error("Falha ao abrir DB de handles."));
    }catch(err){ reject(err); }
  });
}

async function rememberProjectDir(handle){
  if(!("indexedDB" in window)) return;
  try{
    const db = await idbOpenHandleDB();
    await new Promise((resolve,reject)=>{
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=> reject(tx.error || new Error("Falha ao gravar handle."));
      tx.objectStore(HANDLE_STORE).put({id: HANDLE_KEY, handle});
    });
    db.close();
  }catch(err){
    console.warn("Não foi possível lembrar a pasta (ignorado):", err);
  }
}

async function loadRememberedProjectDir(){
  if(!("indexedDB" in window)) return null;
  try{
    const db = await idbOpenHandleDB();
    const rec = await new Promise((resolve,reject)=>{
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = ()=> resolve(req.result || null);
      req.onerror = ()=> reject(req.error || new Error("Falha ao ler handle."));
    });
    db.close();
    return rec?.handle || null;
  }catch(err){
    console.warn("Não foi possível ler pasta lembrada (ignorado):", err);
    return null;
  }
}

async function clearRememberedProjectDir(){
  if(!("indexedDB" in window)) return;
  try{
    const db = await idbOpenHandleDB();
    await new Promise((resolve,reject)=>{
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=> reject(tx.error || new Error("Falha ao limpar handle."));
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
    });
    db.close();
  }catch(err){
    console.warn("Não foi possível limpar pasta lembrada (ignorado):", err);
  }
}


/* ===================== ARMAZENAMENTO LOCAL (IndexedDB) ===================== */
function idbOpenLocalDB(){
  return new Promise((resolve,reject)=>{
    try{
      const req = indexedDB.open(LOCAL_DB_NAME, 1);
      req.onupgradeneeded = ()=> {
        const db = req.result;
        if(!db.objectStoreNames.contains(LOCAL_KV_STORE)){
          db.createObjectStore(LOCAL_KV_STORE, {keyPath:"id"});
        }
        if(!db.objectStoreNames.contains(LOCAL_PHOTO_STORE)){
          db.createObjectStore(LOCAL_PHOTO_STORE, {keyPath:"id"});
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error || new Error("Falha ao abrir DB local."));
    }catch(err){ reject(err); }
  });
}

async function idbKvPut(id, value){
  if(!("indexedDB" in window)) return false;
  const db = await idbOpenLocalDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_KV_STORE, "readwrite");
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error || new Error("Falha ao gravar KV."));
    tx.objectStore(LOCAL_KV_STORE).put({id, value});
  });
  db.close();
  return true;
}

async function idbKvGet(id){
  if(!("indexedDB" in window)) return null;
  const db = await idbOpenLocalDB();
  const rec = await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_KV_STORE, "readonly");
    const req = tx.objectStore(LOCAL_KV_STORE).get(id);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error || new Error("Falha ao ler KV."));
  });
  db.close();
  return rec?.value ?? null;
}

async function idbKvDel(id){
  if(!("indexedDB" in window)) return false;
  const db = await idbOpenLocalDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_KV_STORE, "readwrite");
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error || new Error("Falha ao apagar KV."));
    tx.objectStore(LOCAL_KV_STORE).delete(id);
  });
  db.close();
  return true;
}

async function idbPhotoPut(id, blob, meta){
  if(!("indexedDB" in window)) return false;
  const db = await idbOpenLocalDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_PHOTO_STORE, "readwrite");
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error || new Error("Falha ao gravar foto."));
    tx.objectStore(LOCAL_PHOTO_STORE).put({id, blob, meta: meta||null});
  });
  db.close();
  return true;
}

async function idbPhotoGet(id){
  if(!("indexedDB" in window)) return null;
  const db = await idbOpenLocalDB();
  const rec = await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_PHOTO_STORE, "readonly");
    const req = tx.objectStore(LOCAL_PHOTO_STORE).get(id);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error || new Error("Falha ao ler foto."));
  });
  db.close();
  return rec || null;
}

async function idbPhotoDel(id){
  if(!("indexedDB" in window)) return false;
  const db = await idbOpenLocalDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_PHOTO_STORE, "readwrite");
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error || new Error("Falha ao apagar foto."));
    tx.objectStore(LOCAL_PHOTO_STORE).delete(id);
  });
  db.close();
  return true;
}

function setLocalDraftMeta(ts){
  try{ localStorage.setItem(LOCAL_DRAFT_META_KEY, JSON.stringify({saved_at: ts})); }catch(_e){}
}
function clearLocalDraftMeta(){
  try{ localStorage.removeItem(LOCAL_DRAFT_META_KEY); }catch(_e){}
}

async function syncDraftMetaFromIDB(){
  // Mantém um "sinal" pequeno em localStorage para o UI conseguir mostrar o botão de restaurar.
  try{
    const payload = await idbKvGet(LOCAL_DRAFT_ID);
    if(payload?.saved_at) setLocalDraftMeta(payload.saved_at);
  }catch(_e){}
}



async function reauthorizeProjectDir(){
  if(projectDirHandle) return;
  try{
    let remembered = pendingProjectDirHandle;
    if(!remembered && window.showDirectoryPicker){
      remembered = await loadRememberedProjectDir();
    }
    if(!remembered) return alert("Não há pasta lembrada. Use 📁 Abrir / criar projeto (pasta).");

    const ok = await ensurePermission(remembered, "readwrite"); // precisa de gesto do utilizador
    if(!ok) return alert("Permissão não concedida para a pasta.");

    projectDirHandle = remembered;
    pendingProjectDirHandle = null;
    await rememberProjectDir(remembered);

    revokeAllPhotoUrls();
    await ensureDir(projectDirHandle, ["photos","campo"]);
    await ensureDir(projectDirHandle, ["photos","fito"]);
    await ensureDir(projectDirHandle, ["photos","ops"]);
    await ensureDir(projectDirHandle, ["photos","notas"]);
    await ensureDir(projectDirHandle, ["photos","fin"]);
    await ensureDir(projectDirHandle, ["calendar"]);

    const loaded = await safeLoadProjectFromDir(projectDirHandle);
    if(!loaded){
      // iniciar novo projeto
      data = {
        app:"bio_suite",
        version: APP_VERSION,
        meta:{created_at: nowISO(), updated_at: nowISO()},
        base: deepClone(BASE_INICIAL),
        culturas: [],
        rotacaoHistorico: [],
        tratamentos: [],
        calendar: null,
        ops_tasks: [],
        notas: [],
        fin: { compras: [], vendas: [] }
      };
      dirty = true;
      await saveProject(true);
    } else {
      dirty = false;
    }
    refreshAllUI();
    updateStatus();
  }catch(err){
    console.error(err);
    alert("Falha ao reautorizar pasta: " + (err?.message||err));
  }
}

function stampForFile(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  const hh=String(d.getHours()).padStart(2,"0");
  const mm=String(d.getMinutes()).padStart(2,"0");
  const ss=String(d.getSeconds()).padStart(2,"0");
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}


// cache de objectURLs para fotos
const photoUrlCache = new Map(); // ref -> objectURL

function setStatus(msg){ document.getElementById("status").textContent = msg; }
function fmtTime(d){
  try{
    const hh=String(d.getHours()).padStart(2,"0");
    const mm=String(d.getMinutes()).padStart(2,"0");
    const ss=String(d.getSeconds()).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  }catch(_e){ return ""; }
}
function hasLocalDraft(){
  try{ return !!localStorage.getItem(LOCAL_DRAFT_META_KEY) || !!localStorage.getItem(LOCAL_DRAFT_KEY); }catch(_e){ return false; }
}
function updateStatus(){
  // Status simples e compatível com a versão "sem instalar"
  const parts = [];
  parts.push(APP_VERSION);

  if(projectDirHandle){
    parts.push("📁 pasta/projeto");
  } else {
    parts.push("📱/💻 modo local");
  }

  if(dirty) parts.push("✏️ alterações por guardar");
  if(lastSavedAt) parts.push("✅ guardado " + fmtTime(lastSavedAt));

  if(autosaveEnabled) parts.push("Auto‑guardar: ON");
  else parts.push("Auto‑guardar: OFF");

  setStatus(parts.join(" | "));

  // refletir toggle (se existir)
  const tgl = document.getElementById("autosaveToggle");
  if(tgl) tgl.checked = !!autosaveEnabled;
}

function setAutosave(enabled){
  autosaveEnabled = !!enabled;
  updateStatus();
  if(autosaveEnabled && dirty) scheduleAutosave();
}


async function saveLocalDraft(silent=true){
  const ts = nowISO();
  const payload = { saved_at: ts, data };

  // 1) Preferir IndexedDB (mais robusto e com muito mais quota no telemóvel)
  try{
    if("indexedDB" in window){
      await idbKvPut(LOCAL_DRAFT_ID, payload);
      setLocalDraftMeta(ts);
      return ts;
    }
  }catch(err){
    console.warn("Falha ao gravar rascunho em IndexedDB (fallback para localStorage):", err);
  }

  // 2) Fallback localStorage (pode falhar se houver muitas fotos/base64)
  try{
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
    setLocalDraftMeta(ts);
    return ts;
  }catch(err){
    console.error(err);
    if(!silent) alert("Não foi possível guardar rascunho local (sem espaço).");
    return null;
  }
}



async function restoreLocalDraft(){
  try{
    let payload = null;

    // 1) Tenta IndexedDB
    try{
      payload = await idbKvGet(LOCAL_DRAFT_ID);
    }catch(_e){ payload = null; }

    // 2) Fallback (rascunho antigo em localStorage)
    if(!payload){
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if(raw) payload = JSON.parse(raw);
    }

    if(!payload || !payload.data) return alert("Não há rascunho para restaurar.");
    if(!confirm("Restaurar o rascunho local? Isto substitui os dados atuais no ecrã.")) return;
    loadFromObject(payload.data);
    dirty = true;
    refreshAllUI();
    updateStatus();
  }catch(err){
    console.error(err);
    alert("Falha ao restaurar rascunho.");
  }
}



async function clearLocalDraft(silent=true){
  try{ await idbKvDel(LOCAL_DRAFT_ID); }catch(_e){}
  try{ localStorage.removeItem(LOCAL_DRAFT_KEY); }catch(_e){}
  clearLocalDraftMeta();
  if(!silent) alert("Rascunho removido.");
  updateStatus();
}



async function autoRestoreLocalDraftIfAny(){
  if(projectDirHandle) return false;

  let payload = null;
  try{ payload = await idbKvGet(LOCAL_DRAFT_ID); }catch(_e){ payload = null; }

  if(!payload){
    let raw=null;
    try{ raw = localStorage.getItem(LOCAL_DRAFT_KEY); }catch(_e){ raw=null; }
    if(raw){
      try{ payload = JSON.parse(raw); }catch(_e){ payload = null; }
    }
  }

  if(!payload || !payload.data) return false;

  try{
    const emptyNow =
      (!Array.isArray(data.culturas) || data.culturas.length===0) &&
      (!Array.isArray(data.tratamentos) || data.tratamentos.length===0) &&
      (!Array.isArray(data.ops_tasks) || data.ops_tasks.length===0) &&
      (!data.calendar);

    if(!emptyNow) return false;

    loadFromObject(payload.data);
    dirty = false;
    if(payload.saved_at){
      try{ lastSavedAt = new Date(payload.saved_at); }catch(_e){ lastSavedAt = new Date(); }
    } else {
      lastSavedAt = new Date();
    }
    updateStatus();
    return true;
  }catch(err){
    console.warn("Rascunho local inválido (ignorado):", err);
    return false;
  }
}



function scheduleAutosave(){
  if(!autosaveEnabled) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async ()=>{
    if(!dirty) return;

    // 1) salva sempre um rascunho local como rede de segurança
    const ts = await saveLocalDraft(true);

    // 2) se não há pasta, consideramos o rascunho como "guardado"
    if(!projectDirHandle){
      if(ts){
        dirty = false;
        lastSavedAt = new Date(ts);
      }
      updateStatus();
      return;
    }

    // 3) se há pasta, tenta guardar no bio_suite.json
    await saveProject(true);
  }, 250);
}

async function flushAutosaveNow(){
  if(!dirty) return;
  // salva sempre um rascunho local como rede de segurança
  const ts = await saveLocalDraft(true);

  if(!projectDirHandle){
    if(ts){
      dirty = false;
      lastSavedAt = new Date(ts);
    }
    updateStatus();
    return;
  }

  await saveProject(true);
}

function autosaveNowSoon(){
  if(!autosaveEnabled) return;
  clearTimeout(autosaveTimer);
  // tenta guardar já (útil no telemóvel quando o utilizador fecha logo a seguir)
  autosaveTimer = setTimeout(()=>{ flushAutosaveNow().catch(()=>{}); }, 10);
}



function markDirty(){
  dirty = true;
  data.meta.updated_at = nowISO();
  updateStatus();
  scheduleAutosave();
}

function showTab(name){
  // Compatibilidade com ligações/botões de versões anteriores.
  if(name==='sementeiras') name='campo';
  const tabs=["campo","plantacoes","colheitas","especies","fito","ops","notas","fin","rot","cal","rel","cfg"];
  tabs.forEach(t=>{
    const v=document.getElementById("view_"+t);
    const b=document.getElementById("tab_"+t);
    if(v) v.classList.toggle("hidden", t!==name);
    if(b) b.classList.toggle("active", t===name);
  });
  if(name==='especies')e_prepararSeletores();
  if(name==="campo") s_refresh();
  if(name==="plantacoes") p_refresh();
  if(name==="colheitas") h_refreshCulturas();
  if(name==="rot") rot_atualizar();
  if(name==="cal") calm_render();
  if(name==="rel") rel_atualizarParcelas();
  try{window.dispatchEvent(new CustomEvent("qc:tab-change",{detail:{name}}));}catch(_e){}
}

/* ===================== FILTROS / AGRUPAMENTOS v1.0.35 ===================== */
function qc_normalizarPesquisa(valor){
  return String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function qc_filtroTexto(sec){return qc_normalizarPesquisa(document.getElementById('qc_search_'+sec)?.value||'');}
function qc_filtroMes(sec){return String(document.getElementById('qc_month_'+sec)?.value||'');}
function qc_temTexto(sec,...campos){
  const termo=qc_filtroTexto(sec);
  if(!termo)return true;
  return qc_normalizarPesquisa(campos.flat(Infinity).filter(x=>x!==null&&x!==undefined).join(' ')).includes(termo);
}
function qc_mesCombina(sec,dataISO){
  const mes=qc_filtroMes(sec);
  return !mes || String(dataISO||'').slice(0,7)===mes;
}
function qc_limparFiltros(sec,atualizar){
  const pesquisa=document.getElementById('qc_search_'+sec);
  const mes=document.getElementById('qc_month_'+sec);
  if(pesquisa)pesquisa.value='';if(mes)mes.value='';
  if(typeof atualizar==='function')atualizar();
}
function qc_nomeMes(mes){
  if(!/^\d{4}-\d{2}$/.test(mes))return 'Sem data';
  const [ano,m]=mes.split('-').map(Number);
  if(m<1||m>12)return 'Sem data';
  const nome=new Intl.DateTimeFormat('pt-PT',{month:'long'}).format(new Date(Date.UTC(ano,m-1,15)));
  return nome.charAt(0).toUpperCase()+nome.slice(1)+' de '+ano;
}
function qc_grupoMes(destino,dataISO,grupos){
  const chave=String(dataISO||'').slice(0,7);
  const mes=/^\d{4}-\d{2}$/.test(chave)?chave:'';
  if(grupos.has(mes))return grupos.get(mes);
  const section=document.createElement('section');section.className='qc-month-group';
  const titulo=document.createElement('h4');titulo.textContent='📅 '+qc_nomeMes(mes);
  const conteudo=document.createElement('div');conteudo.className='qc-month-content';
  section.append(titulo,conteudo);destino.appendChild(section);grupos.set(mes,conteudo);
  return conteudo;
}
function qc_semResultados(destino){
  const el=document.createElement('div');el.className='qc-filter-empty';
  el.textContent='Não foram encontrados registos com estes filtros. Pode alterar o mês ou limpar a pesquisa.';
  destino.appendChild(el);
}

/* ===================== CONFIGURAÇÃO (listas editáveis) ===================== */
let CFG_DEFAULTS = null;

function cfg_extractSelectValues(sel){
  if(!sel) return [];
  return [...sel.options].map(o=>String(o.value||o.textContent||"").trim()).filter(s=>s && s!=="—");
}
function cfg_extractDatalistValues(dl){
  if(!dl) return [];
  return [...dl.querySelectorAll("option")].map(o=>String(o.value||"").trim()).filter(Boolean);
}
function cfg_bootstrapDefaults(){
  if(CFG_DEFAULTS) return;
  // Lê os defaults "de fábrica" a partir do HTML original + OPS_TIPOS
  const parcelas = cfg_extractSelectValues(document.getElementById("c_parcelasSel")) 
                || cfg_extractSelectValues(document.getElementById("f_parcelasSel")) 
                || cfg_extractSelectValues(document.getElementById("o_parcela"));
  const observacoes = cfg_extractDatalistValues(document.getElementById("c_obsSug_list"));
  const tiposFitofarm = cfg_extractSelectValues(document.getElementById("f_tipoProd"));
  const motivosFitofarm = cfg_extractSelectValues(document.getElementById("f_motivo"));
  const observacoesSementeiras=cfg_extractDatalistValues(document.getElementById('s_obsSug_list'));
  const observacoesPlantacoes=cfg_extractDatalistValues(document.getElementById('p_obsSug_list'));
  const opsTipos = deepClone(OPS_TIPOS);
  CFG_DEFAULTS = { parcelas, observacoes, observacoesSementeiras, observacoesPlantacoes, tiposFitofarm, motivosFitofarm, opsTipos };
}

function cfg_ensure(){
  cfg_bootstrapDefaults();
  data.config = data.config || {};
  if(!Array.isArray(data.config.parcelas)) data.config.parcelas = deepClone(CFG_DEFAULTS.parcelas);
  if(!Array.isArray(data.config.observacoes)) data.config.observacoes = deepClone(CFG_DEFAULTS.observacoes);
  if(!Array.isArray(data.config.observacoesSementeiras))data.config.observacoesSementeiras=deepClone(CFG_DEFAULTS.observacoesSementeiras);
  if(!Array.isArray(data.config.observacoesPlantacoes))data.config.observacoesPlantacoes=deepClone(CFG_DEFAULTS.observacoesPlantacoes);
  if(!Array.isArray(data.config.tiposFitofarm)) data.config.tiposFitofarm = deepClone(CFG_DEFAULTS.tiposFitofarm);
  if(!Array.isArray(data.config.motivosFitofarm)) data.config.motivosFitofarm = deepClone(CFG_DEFAULTS.motivosFitofarm);

  if(!data.config.opsTipos || !Array.isArray(data.config.opsTipos.operacao) || !Array.isArray(data.config.opsTipos.prot_fert)){
    data.config.opsTipos = deepClone(CFG_DEFAULTS.opsTipos);
  }

  // manter compat: se alguém gravou como "tiposOperacoes" (array), tenta converter
  if(Array.isArray(data.config.tiposOperacoes) && !data.config.opsTipos){
    const oper=data.config.tiposOperacoes.filter(x=>x.categoria==="operacao").map(x=>x.nome);
    const prot=data.config.tiposOperacoes.filter(x=>x.categoria==="prot_fert").map(x=>x.nome);
    data.config.opsTipos = { operacao: oper, prot_fert: prot };
  }

  // manter OPS_TIPOS em sintonia (fallback para código antigo)
  OPS_TIPOS = deepClone(data.config.opsTipos || OPS_TIPOS);
}

function cfg_fillSelect(sel, values, {includeEmpty=false}={}){
  if(!sel) return;
  const prev = new Set([...sel.selectedOptions].map(o=>o.value));
  sel.replaceChildren();
  if(includeEmpty) sel.appendChild(new Option("—",""));
  (values||[]).forEach(v=> sel.appendChild(new Option(v,v)));
  [...sel.options].forEach(o=>{ if(prev.has(o.value)) o.selected=true; });
}

function cfg_fillDatalist(dl, values){
  if(!dl) return;
  dl.replaceChildren();
  (values||[]).forEach(v=>{
    const opt=document.createElement("option");
    opt.value=v;
    dl.appendChild(opt);
  });
}

function cfg_apply(){
  if(!data.config) return;
  // Parcelas / Locais
  cfg_fillSelect(document.getElementById("c_parcelasSel"), data.config.parcelas);
  // Atualizar os formulários novos sem perder as parcelas marcadas.
  try{sp_parcelas(document.getElementById('s_parcelas'));sp_parcelas(document.getElementById('p_parcelas'));}catch(_e){}
  cfg_fillSelect(document.getElementById("f_parcelasSel"), data.config.parcelas);
  cfg_fillSelect(document.getElementById("o_parcela"), data.config.parcelas, {includeEmpty:true});

  // Observações sugeridas
  cfg_fillDatalist(document.getElementById("c_obsSug_list"), data.config.observacoes);
  cfg_fillDatalist(document.getElementById('s_obsSug_list'),data.config.observacoesSementeiras);
  cfg_fillDatalist(document.getElementById('p_obsSug_list'),data.config.observacoesPlantacoes);

  // Fitofarm
  cfg_fillSelect(document.getElementById("f_tipoProd"), data.config.tiposFitofarm);
  cfg_fillSelect(document.getElementById("f_motivo"), data.config.motivosFitofarm);

  // Tipos Ops
  OPS_TIPOS = deepClone(data.config.opsTipos || OPS_TIPOS);
  try{ o_syncSubtipos(); }catch(_e){}
}

function cfg_normalizeArr(arr){
  const out=[];
  const seen=new Set();
  (arr||[]).forEach(v=>{
    const s=String(v||"").trim();
    if(!s) return;
    if(seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function cfg_replaceTokenList(val, oldV, newV){
  oldV = String(oldV||"").trim();
  newV = String(newV||"").trim();
  if(!oldV || !newV) return {value: val, changed:false};

  if(Array.isArray(val)){
    let changed=false;
    const out = val.map(x=>{
      const s=String(x||"").trim();
      if(s===oldV){ changed=true; return newV; }
      return x;
    });
    return {value: out, changed};
  }

  if(typeof val === "string"){
    const s = val.trim();
    if(!s) return {value: val, changed:false};

    // tenta lista separada por vírgulas/;  (compat)
    const parts = s.split(/[,;]\s*/).map(t=>t.trim()).filter(Boolean);
    if(parts.length>1){
      let changed=false;
      const out = parts.map(t=>{
        if(t===oldV){ changed=true; return newV; }
        return t;
      });
      return {value: changed ? out : val, changed};
    }

    if(s===oldV) return {value: newV, changed:true};
  }

  return {value: val, changed:false};
}

function cfg_applyRename(key, oldVal, newVal){
  oldVal = String(oldVal||"").trim();
  newVal = String(newVal||"").trim();
  if(!oldVal || !newVal || oldVal===newVal) return false;

  let changed=false;

  // Parcelas / Locais
  if(key==="parcelas"){
    // Caderno de campo: operações por cultura
    for(const c of (data.culturas||[])){
      for(const op of (c.ops||[])){
        if(!Array.isArray(op.parcelas)) continue;
        const before = op.parcelas.join("\u0000");
        op.parcelas = op.parcelas.map(p=>{
          const s=String(p||"").trim();
          return (s===oldVal) ? newVal : p;
        });
        if(op.parcelas.join("\u0000") !== before) changed=true;
      }
    }

    // Fitofarm (compat: parcelas pode ser array ou string)
    for(const t of (data.tratamentos||[])){
      if(t.parcelas !== undefined){
        const r = cfg_replaceTokenList(t.parcelas, oldVal, newVal);
        if(r.changed){ t.parcelas = r.value; changed=true; }
      }
      if(typeof t.local==="string" && t.local.trim()===oldVal){
        t.local = newVal; changed=true;
      }
    }

    // Operações & Tarefas
    for(const o of (data.ops_tasks||[])){
      if(o.parcela !== undefined){
        const r = cfg_replaceTokenList(o.parcela, oldVal, newVal);
        if(r.changed){ o.parcela = r.value; changed=true; }
      }
      if(o.parcelas !== undefined){
        const r = cfg_replaceTokenList(o.parcelas, oldVal, newVal);
        if(r.changed){ o.parcelas = r.value; changed=true; }
      }
    }

    // Notas
    for(const n of (data.notas||[])){
      if(Array.isArray(n.parcelas)){
        const before = n.parcelas.join("\u0000");
        n.parcelas = n.parcelas.map(p=>{
          const s=String(p||"").trim();
          return (s===oldVal) ? newVal : p;
        });
        if(n.parcelas.join("\u0000") !== before) changed=true;
      }
    }
  }

  // Fitofarm: tipos / motivos
  if(key==="tiposFitofarm"){
    for(const t of (data.tratamentos||[])){
      const r = cfg_replaceTokenList(t.tipoProd, oldVal, newVal);
      if(r.changed){ t.tipoProd = r.value; changed=true; }
    }
  }
  if(key==="motivosFitofarm"){
    for(const t of (data.tratamentos||[])){
      const r = cfg_replaceTokenList(t.motivo, oldVal, newVal);
      if(r.changed){ t.motivo = r.value; changed=true; }
    }
  }

  // Operações & Tarefas: tipos
  if(key==="ops_operacao" || key==="ops_prot_fert"){
    for(const o of (data.ops_tasks||[])){
      const r = cfg_replaceTokenList(o.tipo, oldVal, newVal);
      if(r.changed){ o.tipo = r.value; changed=true; }
      const r2 = cfg_replaceTokenList(o.tipos, oldVal, newVal);
      if(r2.changed){ o.tipos = r2.value; changed=true; }
    }
  }

  return changed;
}


function cfg_commit(){
  cfg_ensure();
  data.config.parcelas = cfg_normalizeArr(data.config.parcelas);
  data.config.observacoes = cfg_normalizeArr(data.config.observacoes);
  data.config.observacoesSementeiras=cfg_normalizeArr(data.config.observacoesSementeiras);
  data.config.observacoesPlantacoes=cfg_normalizeArr(data.config.observacoesPlantacoes);
  data.config.tiposFitofarm = cfg_normalizeArr(data.config.tiposFitofarm);
  data.config.motivosFitofarm = cfg_normalizeArr(data.config.motivosFitofarm);
  data.config.opsTipos.operacao = cfg_normalizeArr(data.config.opsTipos.operacao);
  data.config.opsTipos.prot_fert = cfg_normalizeArr(data.config.opsTipos.prot_fert);

  cfg_apply();
  cfg_render();

  markDirty();
  autosaveNowSoon();
}

function cfg_getListRef(key){
  cfg_ensure();
  if(key==="parcelas") return data.config.parcelas;
  if(key==="observacoes") return data.config.observacoes;
  if(key==="observacoesSementeiras")return data.config.observacoesSementeiras;
  if(key==="observacoesPlantacoes")return data.config.observacoesPlantacoes;
  if(key==="tiposFitofarm") return data.config.tiposFitofarm;
  if(key==="motivosFitofarm") return data.config.motivosFitofarm;
  if(key==="ops_operacao") return data.config.opsTipos.operacao;
  if(key==="ops_prot_fert") return data.config.opsTipos.prot_fert;
  return null;
}

function cfg_addItem(key){
  const arr = cfg_getListRef(key);
  if(!arr) return;
  const s = prompt("Novo item:");
  if(s===null) return;
  const v = String(s).trim();
  if(!v) return;
  arr.push(v);
  cfg_commit();
}

function cfg_reset(key){
  cfg_bootstrapDefaults();
  if(!confirm("Repor esta lista para os valores base?")) return;

  cfg_ensure();
  if(key==="parcelas") data.config.parcelas = deepClone(CFG_DEFAULTS.parcelas);
  else if(key==="observacoes") data.config.observacoes = deepClone(CFG_DEFAULTS.observacoes);
  else if(key==="observacoesSementeiras")data.config.observacoesSementeiras=deepClone(CFG_DEFAULTS.observacoesSementeiras);
  else if(key==="observacoesPlantacoes")data.config.observacoesPlantacoes=deepClone(CFG_DEFAULTS.observacoesPlantacoes);
  else if(key==="tiposFitofarm") data.config.tiposFitofarm = deepClone(CFG_DEFAULTS.tiposFitofarm);
  else if(key==="motivosFitofarm") data.config.motivosFitofarm = deepClone(CFG_DEFAULTS.motivosFitofarm);
  else if(key==="ops_operacao") data.config.opsTipos.operacao = deepClone(CFG_DEFAULTS.opsTipos.operacao);
  else if(key==="ops_prot_fert") data.config.opsTipos.prot_fert = deepClone(CFG_DEFAULTS.opsTipos.prot_fert);

  cfg_commit();
}

function cfg_renderList(mount, key){
  const arr = cfg_getListRef(key);
  if(!mount || !arr) return;
  mount.replaceChildren();

  if(!arr.length){
    const d=document.createElement("div");
    d.className="item small";
    d.textContent="Lista vazia.";
    mount.appendChild(d);
    return;
  }

  arr.forEach((val, idx)=>{
    const row=document.createElement("div");
    row.className="item cfgitem";

    const input=document.createElement("input");
    input.value=val;
    input.onchange=()=>{
      const oldVal = arr[idx];
      const newVal = String(input.value||"").trim();
      arr[idx]=newVal;
      try{ cfg_applyRename(key, oldVal, newVal); }catch(_e){}
      cfg_commit();
    };

    const del=document.createElement("button");
    del.className="warn miniBtn";
    del.textContent="🗑️";
    del.onclick=()=>{
      if(!confirm("Apagar este item?")) return;
      arr.splice(idx,1);
      cfg_commit();
    };

    row.appendChild(input);
    row.appendChild(del);
    mount.appendChild(row);
  });
}

function cfg_render(){
  const p=document.getElementById("cfg_parcelasList");
  if(!p) return; // tab não existe (por segurança)
  cfg_renderList(p, "parcelas");
  cfg_renderList(document.getElementById("cfg_obsList"), "observacoes");
  cfg_renderList(document.getElementById('cfg_obsSementeirasList'),'observacoesSementeiras');
  cfg_renderList(document.getElementById('cfg_obsPlantacoesList'),'observacoesPlantacoes');
  cfg_renderList(document.getElementById("cfg_tiposFitList"), "tiposFitofarm");
  cfg_renderList(document.getElementById("cfg_motivosFitList"), "motivosFitofarm");
  cfg_renderList(document.getElementById("cfg_opsOperacaoList"), "ops_operacao");
  cfg_renderList(document.getElementById("cfg_opsProtFertList"), "ops_prot_fert");
}




 // tenta guardar quando a aba fica em segundo plano
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="hidden" && dirty && autosaveEnabled){
    // Não dá para "await" aqui. Fazemos best‑effort (rascunho local + tentativa de guardar em pasta).
    saveLocalDraft(true).then((ts)=>{
      try{
        if(!projectDirHandle){
          if(ts){
            dirty = false;
            lastSavedAt = new Date(ts);
          }
          updateStatus();
        } else {
          saveProject(true);
        }
      }catch(_e){}
    }).catch(()=>{});
  }
});

function revokeAllPhotoUrls(){
  for(const url of photoUrlCache.values()){ try{ URL.revokeObjectURL(url); }catch(_e){} }
  photoUrlCache.clear();
}

async function ensurePermission(handle, mode="readwrite"){
  if(!handle?.queryPermission) return true;
  let perm = await handle.queryPermission({mode});
  if(perm==="granted") return true;
  perm = await handle.requestPermission({mode});
  return perm==="granted";
}

async function ensureDir(baseDir, parts){
  let cur = baseDir;
  for(const p of parts){
    cur = await cur.getDirectoryHandle(p, {create:true});
  }
  return cur;
}


async function ensureWritableFile(fileHandle){
  // Em alguns dispositivos (sobretudo Android), o createWritable pode falhar se a permissão não estiver bem atribuída ao ficheiro.
  try{
    if(fileHandle?.queryPermission){
      let perm = await fileHandle.queryPermission({mode:"readwrite"});
      if(perm!=="granted") perm = await fileHandle.requestPermission({mode:"readwrite"});
    }
  }catch(_e){}
  return true;
}

async function getFileHandleFromRef(ref){
  // ref tipo "photos/campo/abc.jpg"
  const clean = String(ref||"").replace(/\\/g,"/").replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if(!parts.length) throw new Error("Referência inválida");
  let dir = projectDirHandle;
  for(let i=0;i<parts.length-1;i++) dir = await dir.getDirectoryHandle(parts[i], {create:false});
  const fh = await dir.getFileHandle(parts[parts.length-1], {create:false});
  return fh;
}

async function loadPhotoUrl(ref){
  if(!ref) return null;
  if(String(ref).startsWith("data:")) return ref;

  // Fotos guardadas em IndexedDB (modo telemóvel/offline)
  if(String(ref).startsWith("idbphoto:")){
    if(photoUrlCache.has(ref)) return photoUrlCache.get(ref);
    try{
      const key = String(ref).slice("idbphoto:".length);
      const rec = await idbPhotoGet(key);
      const blob = rec?.blob || null;
      if(!blob) return null;
      const url = URL.createObjectURL(blob);
      photoUrlCache.set(ref, url);
      return url;
    }catch(err){
      console.warn("Foto (IndexedDB) em falta:", ref, err);
      return null;
    }
  }

  if(!projectDirHandle) return null;
  if(photoUrlCache.has(ref)) return photoUrlCache.get(ref);

  try{
    const fh = await getFileHandleFromRef(ref);
    const file = await fh.getFile();
    const url = URL.createObjectURL(file);
    photoUrlCache.set(ref, url);
    return url;
  }catch(err){
    console.warn("Foto em falta:", ref, err);
    return null;
  }
}

// Compatibilidade: algumas secções chamam resolvePhotoRef()
async function resolvePhotoRef(ref){
  return await loadPhotoUrl(ref);
}


async function removePhotoFile(ref){
  try{
    if(!ref || String(ref).startsWith("data:")) return;

    // IndexedDB
    if(String(ref).startsWith("idbphoto:")){
      const key = String(ref).slice("idbphoto:".length);
      try{ await idbPhotoDel(key); }catch(_e){}
      const url = photoUrlCache.get(ref);
      if(url){ try{URL.revokeObjectURL(url);}catch(_e){} }
      photoUrlCache.delete(ref);
      return;
    }

    if(!projectDirHandle) return;
    const clean = String(ref||"").replace(/\\/g,"/").replace(/^\/+/, "");
    const parts = clean.split("/").filter(Boolean);
    if(parts.length<2) return;

    // navegar até ao diretório pai
    let dir = projectDirHandle;
    for(let i=0;i<parts.length-1;i++) dir = await dir.getDirectoryHandle(parts[i], {create:false});
    const name = parts[parts.length-1];
    if(dir.removeEntry) {
      try{ await dir.removeEntry(name); }catch(_e){}
    }

    // limpar cache
    const url = photoUrlCache.get(ref);
    if(url){ try{URL.revokeObjectURL(url);}catch(_e){} }
    photoUrlCache.delete(ref);
  }catch(_e){
    // não falhar o resto da app se a foto/pasta já não existir
  }
}

// Apaga fotografias substituídas apenas depois de a nova versão estar guardada.
// Se o armazenamento falhar, conserva os ficheiros antigos (evita referências partidas).
async function removerFotosObsoletasDepoisDeGuardar(anteriores, atuais){
  const manter = new Set(atuais || []);
  const obsoletas = [...new Set(anteriores || [])].filter(ref => ref && !manter.has(ref));
  if(!obsoletas.length) return;
  try{
    const ts = await saveLocalDraft(true);
    if(!ts) return;
    if(projectDirHandle){
      await saveProject(true);
      // Na pasta, conservam-se os ficheiros antigos porque podem constar dos backups históricos.
      // A remoção já foi feita nos registos da versão atual do projeto.
      return;
    }
    for(const ref of obsoletas) await removePhotoFile(ref);
  }catch(err){
    console.warn("Fotografias antigas conservadas por segurança:", err);
  }
}

async function compressToJpeg(file, maxW=1200, maxH=1200, quality=0.85){
  const dataUrl = await new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(fr.result);
    fr.onerror=()=>rej(new Error("Falha ao ler ficheiro"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res,rej)=>{
    const im=new Image();
    im.onload=()=>res(im);
    im.onerror=()=>rej(new Error("Imagem inválida"));
    im.src=dataUrl;
  });
  let w=img.width, h=img.height;
  const r=Math.min(maxW/w, maxH/h, 1);
  w=Math.round(w*r); h=Math.round(h*r);
  const c=document.createElement("canvas");
  c.width=w; c.height=h;
  const ctx=c.getContext("2d");
  ctx.drawImage(img,0,0,w,h);
  const blob = await new Promise(res=>c.toBlob(res,"image/jpeg",quality));
  return blob;
}


async function compressImageToWebpOrJpeg(fileOrBlob, maxW=960, maxH=960, quality=0.55, maxBytes=180*1024){
  // devolve {blob, ext} — fotos reduzidas (mais leves para telemóvel e ficheiro JSON)
  const inBlob = (fileOrBlob instanceof Blob) ? fileOrBlob : new Blob([fileOrBlob]);
  const url = URL.createObjectURL(inBlob);
  const toBlob = (canvas, type, q)=> new Promise(res=>canvas.toBlob(res, type, q));

  try{
    const img = await new Promise((res,rej)=>{
      const im = new Image();
      im.onload = ()=>res(im);
      im.onerror = ()=>rej(new Error("Imagem inválida"));
      im.src = url;
    });

    let w = img.width, h = img.height;
    const r = Math.min(maxW / w, maxH / h, 1);
    w = Math.max(1, Math.round(w * r));
    h = Math.max(1, Math.round(h * r));

    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    // tentar WEBP (se suportado)
    let type = "image/webp";
    let ext = "webp";
    let q = quality;
    let outBlob = await toBlob(c, type, q);

    if(!outBlob){
      // fallback JPEG
      type = "image/jpeg";
      ext = "jpg";
      q = Math.min(0.75, quality + 0.10);
      outBlob = await toBlob(c, type, q);
    }

    const minQ = (type === "image/webp") ? 0.38 : 0.45;
    while(outBlob && outBlob.size > maxBytes && q > minQ){
      q = Math.max(minQ, q - 0.07);
      outBlob = await toBlob(c, type, q);
    }

    return {blob: outBlob, ext};
  } finally {
    try{ URL.revokeObjectURL(url); }catch(_e){}
  }
}

async function blobToDataURL(blob){
  return await new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(fr.result);
    fr.onerror=()=>rej(new Error("Falha a converter foto"));
    fr.readAsDataURL(blob);
  });
}


async function storePhoto(section, recordId, index, file){
  // devolve ref (path relativo) / idbphoto:KEY / dataURL (fallback)
  const {blob, ext} = await compressImageToWebpOrJpeg(file, 960, 960, 0.55, 180*1024);

  if(projectDirHandle && window.showDirectoryPicker){
    const ok = await ensurePermission(projectDirHandle,"readwrite");
    if(!ok) throw new Error("Sem permissão para escrever na pasta.");
    const photosDir = await ensureDir(projectDirHandle, ["photos", section]);
    const stamp = Date.now();
    const fname = `${section}_${recordId}_${index+1}_${stamp}.${ext}`;
    const fh = await photosDir.getFileHandle(fname, {create:true});
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return `photos/${section}/${fname}`;
  }

  // modo telemóvel/offline: guardar blob em IndexedDB e devolver referência leve
  try{
    if("indexedDB" in window){
      const key = `p_${section}_${recordId}_${index+1}_${Date.now()}`;
      await idbPhotoPut(key, blob, {section, recordId, index, created_at: nowISO()});
      return `idbphoto:${key}`;
    }
  }catch(err){
    console.warn("Falha ao guardar foto em IndexedDB (fallback base64):", err);
  }

  const dataUrl = await blobToDataURL(blob);
  return dataUrl;
}



async function safeLoadProjectFromDir(dir){
  // tenta carregar: bio_suite.json -> bio_suite.tmp.json -> backup mais recente
  const main = projectFileName;
  const tmp = projectFileName.replace(/\.json$/i, ".tmp.json");
  async function tryRead(name){
    const fh = await dir.getFileHandle(name, {create:false});
    const f = await fh.getFile();
    const txt = await f.text();
    return {txt, lastModified: f.lastModified};
  }

  // 1) main
  try{
    const r = await tryRead(main);
    const parsed = JSON.parse(r.txt);
    loadFromObject(parsed);
    lastSavedAt = new Date(r.lastModified);
    return true;
  }catch(eMain){}

  // 2) tmp
  try{
    const r = await tryRead(tmp);
    const parsed = JSON.parse(r.txt);
    loadFromObject(parsed);
    lastSavedAt = new Date(r.lastModified);
    return true;
  }catch(eTmp){}

  // 3) backups (mais recente)
  try{
    const bdir = await dir.getDirectoryHandle("backups", {create:false});
    const files = [];
    for await (const [name, handle] of bdir.entries()){
      if(handle.kind==="file" && /\.json$/i.test(name)) files.push(name);
    }
    files.sort(); // nomes têm timestamp, logo sort dá o mais recente no fim
    const last = files[files.length-1];
    if(!last) return false;
    const fh = await bdir.getFileHandle(last, {create:false});
    const f = await fh.getFile();
    const txt = await f.text();
    const parsed = JSON.parse(txt);
    loadFromObject(parsed);
    lastSavedAt = new Date(f.lastModified);
    return true;
  }catch(_eBackup){}
  return false;
}

async function writeProjectAtomically(dir){
  // escreve em tmp, faz backup do anterior, depois escreve o ficheiro principal
  const ok = await ensurePermission(dir, "readwrite");
  if(!ok) throw new Error("Sem permissão para escrever na pasta.");

  const main = projectFileName;
  const tmp = projectFileName.replace(/\.json$/i, ".tmp.json");

  // backup do principal (se existir)
  try{
    const fhOld = await dir.getFileHandle(main, {create:false});
    const fOld = await fhOld.getFile();
    const oldTxt = await fOld.text();

    const bdir = await ensureDir(dir, ["backups"]);
    const bname = `bio_suite_${stampForFile()}.json`;
    const fhB = await bdir.getFileHandle(bname, {create:true});
    await ensureWritableFile(fhB);
    const wB = await fhB.createWritable();
    await wB.write(new Blob([oldTxt], {type:"application/json"}));
    await wB.close();
  }catch(_eOld){ /* se não existir, ignora */ }

  // escreve tmp
  {
    const fhT = await dir.getFileHandle(tmp, {create:true});
    await ensureWritableFile(fhT);
    const wT = await fhT.createWritable();
    await wT.write(new Blob([JSON.stringify(data,null,2)], {type:"application/json"}));
    await wT.close();
  }

  // escreve principal
  {
    const fh = await dir.getFileHandle(main, {create:true});
    await ensureWritableFile(fh);
    const w = await fh.createWritable();
    await w.write(new Blob([JSON.stringify(data,null,2)], {type:"application/json"}));
    await w.close();
  }
}

async function openProject(){
  if(!window.showDirectoryPicker){
    alert("O seu browser não permite escolher uma pasta. Para guardar fotos fora do JSON, use um browser compatível (ex.: Chrome/Edge) e abra a app através de um servidor local (localhost). Em alternativa, use Exportar/Importar pacote (ZIP) ou JSON.");
    return;
  }
  try{
    const dir = await window.showDirectoryPicker({mode:"readwrite", id:"qc-bio-suite", startIn:"documents"});
    const ok = await ensurePermission(dir, "readwrite");
    if(!ok) return alert("Sem permissão para aceder à pasta.");
    projectDirHandle = dir;
    await rememberProjectDir(dir);
    revokeAllPhotoUrls();
    await ensureDir(projectDirHandle, ["photos","campo"]);
    await ensureDir(projectDirHandle, ["photos","fito"]);
    await ensureDir(projectDirHandle, ["photos","ops"]);
    await ensureDir(projectDirHandle, ["photos","notas"]);
    await ensureDir(projectDirHandle, ["photos","fin"]);
    await ensureDir(projectDirHandle, ["calendar"]);

    // carregar bio_suite.json se existir
    let loaded=false;
    try{
      const fh = await projectDirHandle.getFileHandle(projectFileName, {create:false});
      const f = await fh.getFile();
      lastSavedAt = new Date(f.lastModified);
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      loadFromObject(parsed);
      loaded=true;
    }catch(_e){ /* não existe */ }

    if(!loaded){
      // inicializar novo projeto e guardar já
      data = {
        app:"bio_suite",
        version: APP_VERSION,
        meta:{created_at: nowISO(), updated_at: nowISO()},
        base: deepClone(BASE_INICIAL),
        culturas: [],
        rotacaoHistorico: [],
        tratamentos: [],
        calendar: null,
        ops_tasks: [],
        notas: [],
        fin: { compras: [], vendas: [] }
      };
      dirty = true;
      await saveProject(true);
    } else {
      dirty = false;
    }
    refreshAllUI();
    updateStatus();
  }catch(err){
    console.error(err);
    alert("Não foi possível abrir/criar projeto: " + (err?.message||err));
  }
}

async function saveProject(silent=false){
  try{
    // Se houver uma pasta lembrada mas ainda não ativa (Android costuma perder a permissão ao refrescar),
    // tenta reautorizar automaticamente quando o utilizador carrega em "Guardar".
    if(!projectDirHandle && !silent && window.showDirectoryPicker){
      try{
        if(!pendingProjectDirHandle){
          const remembered = await loadRememberedProjectDir();
          if(remembered) pendingProjectDirHandle = remembered;
        }
        if(pendingProjectDirHandle) await reauthorizeProjectDir();
      }catch(_e){}
    }
    if(projectDirHandle && window.showDirectoryPicker){
      const ok = await ensurePermission(projectDirHandle,"readwrite");
      if(!ok){
        // Mesmo sem permissão, mantemos um rascunho local para não perder trabalho
        saveLocalDraft(true);
        updateStatus();
        if(!silent) alert("Sem permissão para guardar na pasta. Mantive um rascunho local.");
        return;
      }
      await writeProjectAtomically(projectDirHandle);
      dirty=false;
      lastSavedAt = new Date();
      updateStatus();
      if(!silent) alert("Projeto guardado (bio_suite.json).");
    } else {
      // Sem pasta: não dá para gravar ficheiro automaticamente. Mantemos rascunho local e oferecemos export.
      saveLocalDraft(true);
      updateStatus();
      if(!silent) alert("Sem pasta associada: os dados ficam guardados como rascunho local. Para ter um ficheiro, use Exportar JSON.");
    }
  }catch(err){
    console.error(err);
    // fallback: rascunho local
    saveLocalDraft(true);
    updateStatus();
    const msg = String(err?.message||err);
    if(!silent){
      if(msg.toLowerCase().includes("read-only")){
        alert("A pasta/ficheiro selecionado parece estar só de leitura.\n\nEscolha uma pasta no Armazenamento interno (Downloads/Documentos) e confirme \"Usar esta pasta\" + \"Permitir\".\n\nDepois carregue em 📁 Abrir / criar projeto (pasta) novamente.");
      } else {
        alert("Erro ao guardar na pasta. Mantive um rascunho local. Erro: " + msg);
      }
    }
  }
}




/* ===================== PACOTE (ZIP) — 1 ficheiro (data.json + fotos reduzidas) ===================== */
// Objetivo: modo fiável (telemóvel + PC) com 1 ficheiro para copiar/arquivar.
// ZIP "STORE" (sem compressão). As fotos já seguem compactas (WEBP quando possível).

const _zipEnc = new TextEncoder();
const _zipDec = new TextDecoder();

// CRC32 (necessário para ZIP)
const _crcTable = (()=>{
  const t = new Uint32Array(256);
  for(let i=0;i<256;i++){
    let c=i;
    for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i]=c>>>0;
  }
  return t;
})();
function _crc32(u8){
  let c = 0xFFFFFFFF;
  for(let i=0;i<u8.length;i++) c = _crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _dosTimeDate(d){
  const dt = d || new Date();
  const time = ((dt.getHours() & 31) << 11) | ((dt.getMinutes() & 63) << 5) | ((Math.floor(dt.getSeconds()/2)) & 31);
  const date = (((dt.getFullYear() - 1980) & 127) << 9) | (((dt.getMonth()+1) & 15) << 5) | (dt.getDate() & 31);
  return {time, date};
}

function _concatU8(chunks){
  let total = 0;
  for(const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for(const c of chunks){ out.set(c, off); off += c.length; }
  return out;
}

function zipStore(fileEntries){
  // fileEntries: [{name, data:Uint8Array, mtime?:Date}]
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();

  for(const f of fileEntries){
    const nameBytes = _zipEnc.encode(f.name);
    const data = f.data;
    const crc = _crc32(data);
    const size = data.length;
    const {time, date} = _dosTimeDate(f.mtime || now);

    const lh = new Uint8Array(30);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); // STORE
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);

    chunks.push(lh, nameBytes, data);

    const ch = new Uint8Array(46);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true); // STORE
    cdv.setUint16(12, time, true);
    cdv.setUint16(14, date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);

    central.push(ch, nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralOffset = offset;
  const centralBytes = _concatU8(central);

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, fileEntries.length, true);
  edv.setUint16(10, fileEntries.length, true);
  edv.setUint32(12, centralBytes.length, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);

  return new Blob([...chunks, centralBytes, eocd], {type:"application/zip"});
}

function unzipStore(arrayBuffer){
  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // localizar EOCD (até 64k do fim)
  let eocd = -1;
  const start = Math.max(0, u8.length - 65536);
  for(let i=u8.length-22; i>=start; i--){
    if(u8[i]===0x50 && u8[i+1]===0x4b && u8[i+2]===0x05 && u8[i+3]===0x06){ eocd=i; break; }
  }
  if(eocd < 0) throw new Error("ZIP inválido (fim de diretório não encontrado).");

  const cdCount = dv.getUint16(eocd+10, true);
  const cdOffset = dv.getUint32(eocd+16, true);

  const files = new Map();
  let p = cdOffset;

  for(let i=0;i<cdCount;i++){
    if(dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP inválido (central directory).");
    const method = dv.getUint16(p+10, true);
    const csize = dv.getUint32(p+20, true);
    const nlen = dv.getUint16(p+28, true);
    const xlen = dv.getUint16(p+30, true);
    const clen = dv.getUint16(p+32, true);
    const lhoff = dv.getUint32(p+42, true);

    const name = _zipDec.decode(u8.slice(p+46, p+46+nlen));

    if(method !== 0) throw new Error("ZIP: método de compressão não suportado (use pacote exportado pela app).");

    if(dv.getUint32(lhoff, true) !== 0x04034b50) throw new Error("ZIP inválido (local header).");
    const lnlen = dv.getUint16(lhoff+26, true);
    const lxlen = dv.getUint16(lhoff+28, true);
    const dataStart = lhoff + 30 + lnlen + lxlen;

    files.set(name, u8.slice(dataStart, dataStart + csize));
    p = p + 46 + nlen + xlen + clen;
  }

  return files;
}

function _downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(_e){} }, 2000);
}

async function _blobFromDataUrl(dataUrl){
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function getPhotoBlob(ref){
  if(!ref) return null;
  const r = String(ref);
  if(r.startsWith('data:')) return await _blobFromDataUrl(r);
  if(r.startsWith('idbphoto:')){
    try{
      const key = r.slice('idbphoto:'.length);
      const rec = await idbPhotoGet(key);
      return rec?.blob || null;
    }catch(_e){ return null; }
  }
  if(projectDirHandle){
    try{
      const fh = await getFileHandleFromRef(r);
      const f = await fh.getFile();
      return f;
    }catch(_e){ return null; }
  }
  return null;
}


function stampForFileCompact(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function exportPackage(){
  try{
    // garantir rascunho recente
    try{ await saveLocalDraft(true); }catch(_e){}

    const out = deepClone(data);
    const files = new Map();

    async function handlePhotosArray(arr, section, recId){
      if(!Array.isArray(arr)) return;
      for(let i=0;i<arr.length;i++){
        const ref = arr[i];
        const b = await getPhotoBlob(ref);
        if(!b) continue;

        // reduzir para pacote
        const {blob: rb, ext} = await compressImageToWebpOrJpeg(b, 960, 960, 0.55, 180*1024);
        const fname = `${section}_${recId}_${i+1}.${ext}`;
        const path = `photos/${section}/${fname}`;
        if(!files.has(path)){
          files.set(path, new Uint8Array(await rb.arrayBuffer()));
        }
        arr[i] = path;
      }
    }

    for(const c of (out.culturas||[])){
      for(const op of (c.ops||[])){
        await handlePhotosArray(op.fotos||[], 'campo', op.id || gerarID());
      }
    }
    for(const t of (out.tratamentos||[])){
      await handlePhotosArray(t.fotos||[], 'fito', t.id || gerarID());
    }
    for(const it of (out.ops_tasks||[])){
      await handlePhotosArray(it.fotos||[], 'ops', it.id || gerarID());
    }

    // Notas
    for(const n of (out.notas||[])){
      if(!n) continue;
      if(!n.id) n.id = gerarID();
      await handlePhotosArray(n.fotos||[], 'notas', n.id);
    }

    // Gestão €
    if(out.fin){
      for(const reg of (out.fin.compras||[])){
        if(!reg) continue;
        if(!reg.id) reg.id = gerarID();
        if(reg.foto){
          const arr=[reg.foto];
          await handlePhotosArray(arr, 'fin', reg.id);
          reg.foto=arr[0];
        }
      }
      for(const reg of (out.fin.vendas||[])){
        if(!reg) continue;
        if(!reg.id) reg.id = gerarID();
        if(reg.foto){
          const arr=[reg.foto];
          await handlePhotosArray(arr, 'fin', reg.id);
          reg.foto=arr[0];
        }
      }
    }

    const meta = {
      app: 'bio_suite',
      version: APP_VERSION,
      exported_at: nowISO(),
      note: 'Pacote gerado pela app (data.json + fotos reduzidas).'
    };

    out.version = APP_VERSION;
    out.meta = out.meta || {};
    out.meta.exported_at = meta.exported_at;

    files.set('data.json', _zipEnc.encode(JSON.stringify(out, null, 2)));
    files.set('meta.json', _zipEnc.encode(JSON.stringify(meta, null, 2)));
    files.set('README.txt', _zipEnc.encode(
      'Caderno QC — Pacote (ZIP)\n\nConteúdo:\n- data.json (dados)\n- photos/* (fotos reduzidas)\n- meta.json\n\nPara abrir: na app use "Importar pacote (ZIP)".\n\nDica: guarde o ZIP num local seguro (Drive/OneDrive/PC).\n'
    ));

    const entries = [];
    for(const [name, u8] of files.entries()) entries.push({name, data:u8});

    const zipBlob = zipStore(entries);
    const filename = `caderno_qc_${stampForFileCompact()}.zip`;
    _downloadBlob(zipBlob, filename);

    lastSavedAt = new Date();
    dirty = false;
    updateStatus();
  }catch(err){
    console.error(err);
    alert('Falha ao exportar pacote: ' + (err?.message || err));
  }
}

async function importPackage(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.onchange = async ()=>{
    const file = input.files && input.files[0];
    if(!file) return;

    try{
      const ab = await file.arrayBuffer();
      const z = unzipStore(ab);

      const dataBytes = z.get('data.json') || z.get('bio_suite.json');
      if(!dataBytes) throw new Error('ZIP sem data.json.');

      const txt = _zipDec.decode(dataBytes);
      const obj = JSON.parse(txt);

      loadFromObject(obj);

      // reimportar fotos para o armazenamento atual (pasta do projeto se disponível; caso contrário IndexedDB)
      async function storeImportedPhoto(path, bytes){
        const ext = (path.split('.').pop() || '').toLowerCase();
        const mime = ext==='webp' ? 'image/webp' : (ext==='png' ? 'image/png' : 'image/jpeg');
        const blob = new Blob([bytes], {type:mime});

        if(projectDirHandle && window.showDirectoryPicker){
          const ok = await ensurePermission(projectDirHandle,'readwrite');
          if(ok){
            const clean = String(path).replace(/\\/g,'/');
            const parts = clean.split('/').filter(Boolean);
            const fname = parts.pop();
            const dir = await ensureDir(projectDirHandle, parts);
            const fh = await dir.getFileHandle(fname, {create:true});
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
            return clean;
          }
        }

        const key = `p_import_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        await idbPhotoPut(key, blob, {imported_from:path, created_at: nowISO()});
        return `idbphoto:${key}`;
      }

      async function fixArray(arr){
        if(!Array.isArray(arr)) return;
        for(let i=0;i<arr.length;i++){
          const ref = arr[i];
          if(ref && String(ref).startsWith('photos/')){
            const bytes = z.get(String(ref));
            if(bytes){
              arr[i] = await storeImportedPhoto(String(ref), bytes);
            }
          }
        }
      }

      for(const c of (data.culturas||[])){
        for(const op of (c.ops||[])) await fixArray(op.fotos||[]);
      }
      for(const t of (data.tratamentos||[])) await fixArray(t.fotos||[]);
      for(const it of (data.ops_tasks||[])) await fixArray(it.fotos||[]);
      for(const n of (data.notas||[])) await fixArray(n.fotos||[]);
      if(data.fin){
        for(const reg of (data.fin.compras||[])){
          if(reg && reg.foto && String(reg.foto).startsWith('photos/')){
            const bytes = z.get(String(reg.foto));
            if(bytes) reg.foto = await storeImportedPhoto(String(reg.foto), bytes);
          }
        }
        for(const reg of (data.fin.vendas||[])){
          if(reg && reg.foto && String(reg.foto).startsWith('photos/')){
            const bytes = z.get(String(reg.foto));
            if(bytes) reg.foto = await storeImportedPhoto(String(reg.foto), bytes);
          }
        }
      }

      revokeAllPhotoUrls();
      refreshAllUI();
      markDirty();
      await saveLocalDraft(true);

      alert('Importação do pacote concluída.');
    }catch(err){
      console.error(err);
      alert('Falha ao importar pacote: ' + (err?.message || err));
    }
  };
  input.click();
}

/* ===================== MODELO UNIFICADO DE RELATÓRIOS (v1.0.31) ===================== */
// Apenas apresentação. Não altera dados, filtros, fotografias ou estrutura de backups.
function rel_prepararDocumento(html, titulo){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.title='Quintal do Cravinho — '+titulo;
  doc.body.classList.add('qc-print');
  const style=doc.createElement('style');
  style.textContent=`
    @page{size:A4; margin:14mm 11mm 16mm}
    body.qc-print{font-family:Arial,Helvetica,sans-serif;color:#25372c;background:#fff;padding:0;margin:0;font-size:11px;line-height:1.42}
    .qc-brand{display:flex;align-items:center;gap:12px;border-bottom:3px solid #2e7d32;padding:0 0 12px;margin:0 0 15px}
    .qc-logo{width:52px;height:52px;object-fit:contain}
    .qc-brand-text{display:flex;flex-direction:column;gap:2px}
    .qc-brand-text strong{font-size:19px;color:#1b5e20;line-height:1.1}
    .qc-brand-text small{font-size:10px;color:#607369}
    .qc-report-type{margin-left:auto;text-align:right;font-size:11px;color:#50665b;font-weight:bold;max-width:32%}
    body.qc-print h1{font-size:21px!important;color:#1b5e20!important;margin:3px 0 8px!important}
    body.qc-print h2{font-size:14px!important;color:#1b5e20!important;padding:5px 0 4px;margin:22px 0 8px!important;border-bottom:1px solid #cce2d0;break-after:avoid}
    body.qc-print .qc-month-report td:not(:first-child),body.qc-print .qc-month-report th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
    body.qc-print .qc-month-report{max-width:100%;margin:10px 0 16px!important}
    body.qc-print .qc-month-report tbody tr:nth-child(even){background:#edf5ee}
    body.qc-print .qc-report-type{font-weight:700}
    body.qc-print .qc-brand{break-inside:avoid}
    body.qc-print table tr{page-break-inside:avoid}
    body.qc-print h3{font-size:12px!important;color:#1b5e20!important;margin:12px 0 6px;break-after:avoid}
    body.qc-print .meta{border-radius:5px;background:#f2f7f3;padding:9px 11px;color:#4b6054;margin-bottom:13px;font-size:11px}
    body.qc-print .small{color:#516457!important;font-size:10px}
    body.qc-print table{width:100%!important;border-collapse:collapse!important;margin:10px 0 17px!important;table-layout:auto}
    body.qc-print thead{display:table-header-group}
    body.qc-print th,body.qc-print td{font-size:9px!important;border:1px solid #d4e2d7!important;padding:6px 7px!important;vertical-align:top;overflow-wrap:anywhere;word-break:normal}
    body.qc-print th{background:#e7f2e9!important;color:#1c502b!important;font-weight:bold;text-align:left}
    body.qc-print tbody tr:nth-child(even){background:#f7faf8}
    body.qc-print tbody tr,body.qc-print .photos,body.qc-print .qc-summary-item{break-inside:avoid;page-break-inside:avoid}
    body.qc-print .photos{display:flex;gap:4px;flex-wrap:wrap}
    body.qc-print .photos img{max-width:95px!important;max-height:95px!important;object-fit:cover}
    .qc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 20px}
    .qc-summary-item{padding:9px;background:#f2f7f3;border:1px solid #dcebe0;border-radius:7px}
    .qc-summary-item strong{display:block;color:#1b5e20;font-size:19px;line-height:1.1}
    .qc-summary-item span{display:block;font-size:10px;color:#546d5b;margin-top:4px}
    .qc-empty{text-align:center;color:#84948a;font-style:italic;padding:12px 6px!important}
    .qc-footer{font-size:9px;color:#6d8072;border-top:1px solid #dae6dd;padding-top:10px;margin-top:23px;break-inside:avoid}
    body.qc-print .day{width:100px!important;white-space:normal!important}
    body.qc-print .noprint{display:none!important}
    @media screen{body.qc-print{max-width:1080px;margin:0 auto;padding:25px 18px;box-shadow:0 0 12px #ddd}}
    @media print{body.qc-print{padding:0!important;box-shadow:none!important}body.qc-print a{color:#245a35;text-decoration:none}button{display:none!important}}
  `;
  if(titulo==='Relatório geral' || titulo==='fitofarm'){
    // Muitas colunas nos tratamentos: o formato paisagem evita cortes laterais.
    style.textContent+='\n@page{size:A4 landscape; margin:12mm 10mm 14mm}';
  }
  doc.head.appendChild(style);
  const branding=doc.createElement('div');branding.className='qc-brand';
  const image=doc.createElement('img');image.className='qc-logo';image.alt='Quintal do Cravinho';
  try{image.src=new URL('./logo_quintal.png',location.href).href;}catch(_){image.src='logo_quintal.png';}
  const textos=doc.createElement('div');textos.className='qc-brand-text';
  const nome=doc.createElement('strong');nome.textContent='Quintal do Cravinho';
  const subt=doc.createElement('small');subt.textContent='Caderno de Campo · Produção biológica · Ilha das Flores, Açores';
  textos.append(nome,subt);
  const tipo=doc.createElement('div');tipo.className='qc-report-type';tipo.textContent=titulo;
  branding.append(image,textos,tipo);
  doc.body.insertBefore(branding,doc.body.firstChild);
  // Tornar visível que um bloco não contém registos, sem alterar o seu conteúdo.
  for(const tb of doc.querySelectorAll('table tbody')){
    if(tb.children.length!==0) continue;
    const tr=doc.createElement('tr');const td=doc.createElement('td');
    td.colSpan=tb.closest('table')?.querySelectorAll('thead tr:first-child th').length||1;
    td.className='qc-empty';td.textContent='Sem registos para o período selecionado.';
    tr.appendChild(td);tb.appendChild(tr);
  }
  const footer=doc.createElement('div');footer.className='qc-footer';
  const gerado=new Intl.DateTimeFormat('pt-PT',{timeZone:'Atlantic/Azores',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  footer.textContent=`Quintal do Cravinho • Documento gerado em ${gerado} (hora dos Açores) • Caderno de Campo BIO ${APP_VERSION}`;
  doc.body.appendChild(footer);
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
function rel_abrirDocumento(html,titulo,janelaAberta=null){
  const win=janelaAberta || window.open('','_blank');
  if(!win){alert('O browser bloqueou a janela. Autoriza as janelas deste endereço para imprimir ou guardar PDF.');return;}
  win.document.open();win.document.write(rel_prepararDocumento(html,titulo));win.document.close();
  win.focus();
  // Esperar pelos logótipos/fotografias para evitar impressão com imagens em branco.
  const imgs=[...win.document.images];
  const settled=Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
    img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});
  })));
  Promise.race([settled,new Promise(resolve=>setTimeout(resolve,2800))])
    .then(()=>{try{win.print();}catch(err){console.warn('Impressão:',err);}});
}

/* v1.0.36 — relatórios por secção e histórico por parcela */
const REL_SECCOES=['campo','sementeiras','plantacoes','colheitas','fito','ops','notas','fin','rot'];
function rel_seccoesSelecionadas(){
  return new Set([...document.querySelectorAll('#r_seccoes input[type=checkbox]:checked')].map(el=>el.value));
}
function rel_marcarSeccoes(valor){
  document.querySelectorAll('#r_seccoes input[type=checkbox]').forEach(el=>{el.checked=!!valor;});
}
function rel_atualizarParcelas(){
  const sel=document.getElementById('r_parcela');if(!sel)return;
  const current=sel.value;sel.replaceChildren(new Option('Todas as parcelas',''));
  const parcels=new Set([...(rot_parcelas()||[]),...(data.rotacaoHistorico||[]).map(x=>x.parcela)]);
  for(const parcela of [...parcels].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt')))
    sel.appendChild(new Option(parcela,parcela));
  if([...sel.options].some(x=>x.value===current))sel.value=current;
}
function rel_esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
/* ===================== RELATÓRIO (Imprimir/PDF) ===================== */
function rel_setDefaults(){
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate()-30);
  const fmt = (d)=> d.toISOString().slice(0,10);
  const elFrom = document.getElementById('r_from');
  const elTo = document.getElementById('r_to');
  if(elFrom) elFrom.value = fmt(from);
  if(elTo) elTo.value = fmt(to);
  const hint = document.getElementById('r_hint');
  if(hint) hint.textContent = 'Dica: exporta o pacote (ZIP) regularmente para ter cópia/backup.';
  const elMonth = document.getElementById('r_month');
  if(elMonth) elMonth.value = to.toISOString().slice(0,7);
}

document.addEventListener('DOMContentLoaded', ()=>{ try{ rel_setDefaults(); }catch(_e){} });

function _parseDateInput(v){
  if(!v) return null;
  const d = new Date(v + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

async function _photoRefToDataUrl(ref){
  if(!ref) return null;
  const r = String(ref);
  if(r.startsWith('data:')) return r;
  try{
    const b = await getPhotoBlob(r);
    if(!b) return null;
    return await blobToDataURL(b);
  }catch(_e){ return null; }
}

async function rel_print(){
  const dtIni=document.getElementById('r_from')?.value||'';
  const dtFim=document.getElementById('r_to')?.value||'';
  if(!/^\d{4}-\d\d-\d\d$/.test(dtIni)||!/^\d{4}-\d\d-\d\d$/.test(dtFim)||dtFim<dtIni)
    return alert('Escolha um intervalo de datas válido.');
  const sec=rel_seccoesSelecionadas();
  if(!sec.size)return alert('Escolha pelo menos uma categoria de informação.');
  const incluirFotos=document.getElementById('r_photos')?.value==='yes';
  const janela=window.open('','_blank');
  if(!janela)return alert('Autorize pop-ups para imprimir o relatório.');
  janela.document.body.textContent='A preparar o relatório…';
  const inRange=d=>String(d||'')>=dtIni && String(d||'')<=dtFim;
  const esc=rel_esc;
  const str=v=>Array.isArray(v)?v.filter(Boolean).join(', '):String(v??'');
  const q=v=>esc(v||'—');
  const nome=c=>[c.familia,c.especie,c.variedade].filter(Boolean).join(' — ');
  const byId=id=>{const c=(data.culturas||[]).find(c=>String(c.id)===String(id));return c?nome(c):'Cultura não encontrada';};
  const operations=(data.culturas||[]).flatMap(c=>(c.ops||[]).map(o=>({c,o}))).filter(x=>inRange(x.o.data));
  const getOps=tipo=>operations.filter(x=>x.o.tipo===tipo);
  const seed=getOps('Sementeira'), plant=getOps('Plantação'), harvest=getOps('Colheita');
  const fit=(data.tratamentos||[]).filter(t=>inRange(t.data));
  const ops=(data.ops_tasks||[]).filter(o=>inRange(o.data));
  const notes=(data.notas||[]).filter(n=>inRange(n.data));
  const buys=(data.fin?.compras||[]).filter(r=>inRange(r.data));
  const sales=(data.fin?.vendas||[]).filter(r=>inRange(r.data));
  const parcel=document.getElementById('r_parcela')?.value||'';
  // Histórico manual é anual: o filtro de datas aplica-se por ano.
  const aIni=Number(dtIni.slice(0,4)),aFim=Number(dtFim.slice(0,4));
  const rota=(typeof rot_todasEntradas==='function'?rot_todasEntradas():[])
    .filter(x=>x.ano>=aIni&&x.ano<=aFim&&(!parcel||x.parcela===parcel))
    .sort((a,b)=>String(a.parcela).localeCompare(String(b.parcela),'pt')||a.ano-b.ano);
  let html=`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Relatório BIO</title></head><body>
    <h1>Relatório de atividade agrícola</h1>
    <div class="meta"><b>Período:</b> ${esc(fmtDatePT(dtIni))} a ${esc(fmtDatePT(dtFim))} · <b>Exploração:</b> Quintal do Cravinho · Ilha das Flores, Açores</div>`;
  const secao=(titulo,headers,rows)=>{
    html+=`<h2>${esc(titulo)}</h2><table><thead><tr>${headers.map(v=>'<th>'+esc(v)+'</th>').join('')}</tr></thead><tbody>`;
    for(const r of rows)html+='<tr>'+r.map(v=>'<td>'+String(v??'—')+'</td>').join('')+'</tr>';
    html+='</tbody></table>';
  };
  const photos=async refs=>{
    if(!incluirFotos||!Array.isArray(refs)||!refs.length)return '—';
    const links=[];for(const ref of refs){const url=await _photoRefToDataUrl(ref);if(url)links.push(`<img alt="Fotografia" src="${url}">`);}
    return links.length?`<div class="photos">${links.join('')}</div>`:'—';
  };
  try{
    // O resumo e o mapa contam somente as categorias selecionadas.
    const counts=[];
    if(sec.has('campo'))counts.push([data.culturas.length,'Culturas registadas']);
    if(sec.has('sementeiras'))counts.push([seed.length,'Sementeiras']);
    if(sec.has('plantacoes'))counts.push([plant.length,'Plantações']);
    if(sec.has('colheitas'))counts.push([harvest.length,'Colheitas']);
    if(sec.has('fito'))counts.push([fit.length,'Tratamentos']);
    if(sec.has('ops'))counts.push([ops.length,'Operações e tarefas']);
    if(sec.has('notas'))counts.push([notes.length,'Notas']);
    if(sec.has('fin'))counts.push([buys.length+sales.length,'Movimentos financeiros']);
    if(sec.has('rot'))counts.push([rota.length,'Culturas no histórico de rotação']);
    html+='<div class="qc-summary">'+counts.map(([v,l])=>`<div class="qc-summary-item"><strong>${v}</strong><span>${esc(l)}</span></div>`).join('')+'</div>';
    const meses=new Map();
    const reg=(d,k,n=1)=>{const m=String(d||'').slice(0,7);if(!/^\d{4}-\d\d$/.test(m))return;
      if(!meses.has(m))meses.set(m,{seed:0,plant:0,harvest:0,grams:0,fito:0,ops:0,notes:0,fin:0});meses.get(m)[k]+=n;};
    if(sec.has('sementeiras'))seed.forEach(x=>reg(x.o.data,'seed'));
    if(sec.has('plantacoes'))plant.forEach(x=>reg(x.o.data,'plant'));
    if(sec.has('colheitas'))harvest.forEach(x=>{reg(x.o.data,'harvest');reg(x.o.data,'grams',Number(h_gramasRegisto(x.o))||0);});
    if(sec.has('fito'))fit.forEach(x=>reg(x.data,'fito'));
    if(sec.has('ops'))ops.forEach(x=>reg(x.data,'ops'));
    if(sec.has('notas'))notes.filter(x=>x.data).forEach(x=>reg(x.data,'notes'));
    if(sec.has('fin'))[...buys,...sales].forEach(x=>reg(x.data,'fin'));
    const fields=[['seed','Sementeiras','sementeiras'],['plant','Plantações','plantacoes'],['harvest','Colheitas','colheitas'],['grams','Peso (g)','colheitas'],['fito','Tratamentos','fito'],['ops','Tarefas','ops'],['notes','Notas','notas'],['fin','Gestão €','fin']].filter(x=>sec.has(x[2]));
    if(fields.length){
      secao('Resumo mensal', ['Mês',...fields.map(x=>x[1])], [...meses.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([m,reg])=>[
        esc(qc_nomeMes(m)),...fields.map(([key])=>key==='grams'?Number(reg[key]).toLocaleString('pt-PT',{maximumFractionDigits:2}):reg[key])
      ]));
    }
    if(sec.has('campo')){
      secao('Culturas existentes', ['N.º','Família','Espécie','Variedade','Sementeiras','Plantações','Colheitas','Datas das colheitas'],
        (data.culturas||[]).map((c,i)=>[esc(c.ordem||i+1),q(c.familia),q(c.especie),q(c.variedade),
          (c.ops||[]).filter(o=>o.tipo==='Sementeira').length,(c.ops||[]).filter(o=>o.tipo==='Plantação').length,(c.ops||[]).filter(o=>o.tipo==='Colheita').length,
          q((c.ops||[]).filter(o=>o.tipo==='Colheita'&&o.data&&inRange(o.data)).map(o=>o.data).sort().map(fmtDatePT).join(', '))]));
    }
    if(sec.has('colheitas')){
      const agrupadas=new Map();
      for(const {c,o} of harvest){
        const key=String(c.id);
        if(!agrupadas.has(key))agrupadas.set(key,{c,registos:[]});
        agrupadas.get(key).registos.push(o);
      }
      const rows=[...agrupadas.values()].sort((a,b)=>c_numeroCultura(a.c)-c_numeroCultura(b.c)).map(({c,registos})=>{
        const datas=registos.map(o=>o.data).filter(Boolean).sort();
        const total=registos.reduce((s,o)=>s+(h_gramasRegisto(o)||0),0);
        return [q(c_numeroCultura(c)),q(nome(c)),q(datas.map(fmtDatePT).join(', ')),registos.length,
          q(total.toLocaleString('pt-PT',{maximumFractionDigits:2})+' g'),q(datas.length?fmtDatePT(datas[datas.length-1]):'—')];
      });
      secao('Colheitas por cultura e datas', ['N.º','Cultura','Datas de colheita','Registos','Total (g)','Última colheita'],rows);
    }
    for(const [key,titulo,list] of [['sementeiras','Sementeiras',seed],['plantacoes','Plantações',plant],['colheitas','Colheitas',harvest]]){
      if(!sec.has(key))continue;
      const rows=[];for(const {c,o} of list.sort((a,b)=>String(a.o.data).localeCompare(String(b.o.data)))){
        const qty=key==='colheitas'?`${(h_gramasRegisto(o)||0).toLocaleString('pt-PT',{maximumFractionDigits:2})} g`:str(o.qtd);
        let origin='—';if(key==='plantacoes'&&o.sementeiraId){const ref=sp_sementeiraPeloId(o.sementeiraId);origin=ref?fmtDatePT(ref.op.data):'Ligação indisponível';}
        rows.push([q(fmtDatePT(o.data)),esc(nome(c)),q(qty),q(str(o.parcelas)),q(origin),q(o.obs),await photos(o.fotos)]);
      }
      secao(titulo,['Data','Cultura','Quantidade','Local','Sementeira de origem','Observações','Fotos'],rows);
    }
    if(sec.has('fito')){
      const rows=[];for(const t of fit){rows.push([q(fmtDatePT(t.data)),q((t.culturaIds||[]).map(byId).join('; ')),q(str(t.parcelas)||t.local),q(t.tipoInt||t.tipo),q(str(t.tipoProd)),q(t.produto),q(t.dose),q(str(t.motivo)),q(t.obs),await photos(t.fotos)]);}
      secao('Fitofarmacêuticos',['Data','Culturas','Parcelas','Intervenção','Tipo','Produto','Dose','Motivo','Observações','Fotos'],rows);
    }
    if(sec.has('ops')){
      const rows=[];for(const o of ops){const ids=Array.isArray(o.culturaIds)?o.culturaIds:o.culturaId?[o.culturaId]:[];
        rows.push([q(fmtDatePT(o.data)),q(str(o.tipo||o.tipos)),q(str(o.parcela||o.parcelas)),q(ids.map(byId).join('; ')),q(o.medida),q(o.metodo),q(o.obs),await photos(o.fotos)]);}
      secao('Operações e Tarefas',['Data','Tipo','Local','Culturas','Quantidade / Duração','Método','Observações','Fotos'],rows);
    }
    if(sec.has('notas')){
      const rows=[];for(const n of notes){rows.push([q(fmtDatePT(n.data)),q(n.assunto),q(str(n.parcelas)),q(n.texto).replace(/\n/g,'<br>'),await photos(n.fotos)]);}
      secao('Notas',['Data','Assunto','Parcelas','Texto','Fotos'],rows);
    }
    if(sec.has('fin')){
      const total=a=>a.reduce((t,x)=>t+(Number(x.valor)||0),0);
      html+=`<h2>Gestão financeira</h2><div class="meta"><b>Compras:</b> ${total(buys).toFixed(2)} € &nbsp; <b>Vendas:</b> ${total(sales).toFixed(2)} € &nbsp; <b>Saldo:</b> ${(total(sales)-total(buys)).toFixed(2)} €</div>`;
      const rows=[];for(const [lbl,arr] of [['Compra',buys],['Venda',sales]])for(const r of arr)rows.push([q(fmtDatePT(r.data)),esc(lbl),q(r.desc||r.descricao),q(r.valor),await photos(r.foto?[r.foto]:[])]);
      secao('Movimentos de compras e vendas',['Data','Tipo','Descrição','Valor (€)','Foto'],rows);
    }
    if(sec.has('rot')){
      html+=`<h2>Rotação de culturas por parcela</h2><div class="small">Histórico anual obtido de operações de sementeira e plantação, complementado com registos manuais. A mesma espécie repetida numa parcela e ano é apresentada uma vez. ${parcel?'Parcela: '+esc(parcel):'Todas as parcelas.'}</div>`;
      secao('Histórico anual', ['Parcela','Ano','Família','Espécie','Variedade','Origem','Observações'], rota.map(x=>[
        q(x.parcela),esc(x.ano),q(x.familia),q(x.especie),q(x.variedade),q((x.origens||[x.origem]).join(', ')),q(x.obs)
      ]));
    }
    html+='</body></html>';
    rel_abrirDocumento(html,'Relatório geral',janela);
  }catch(err){console.error(err);janela.document.body.textContent='Não foi possível preparar o relatório: '+(err?.message||err);}
}async function rel_monthMap(){
  const ym=document.getElementById('r_month')?.value||'';
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(ym))return alert('Escolha um mês válido.');
  const sec=rel_seccoesSelecionadas();
  if(!sec.size)return alert('Escolha pelo menos um módulo a incluir no mapa mensal.');
  const [ano,mes]=ym.split('-').map(Number);
  const days=new Date(ano,mes,0).getDate();
  const inicio=ym+'-01',fim=ym+'-'+String(days).padStart(2,'0');
  const foto=document.getElementById('r_photos')?.value==='yes';
  const win=window.open('','_blank');
  if(!win)return alert('Autorize pop-ups para imprimir o mapa mensal.');
  win.document.body.textContent='A preparar o mapa mensal…';
  const esc=rel_esc, join=v=>Array.isArray(v)?v.join(', '):String(v??'');
  const nome=id=>{const c=(data.culturas||[]).find(c=>String(c.id)===String(id));return c?[c.especie,c.variedade].filter(Boolean).join(' / '):'—';};
  const pack=new Map();
  const add=(date,key,txt)=>{if(!String(date||'').startsWith(ym))return;
    if(!pack.has(date))pack.set(date,[]);pack.get(date).push({key,txt});};
  const ph=async refs=>{
    if(!foto||!Array.isArray(refs)||!refs.length)return '';
    const arr=[];for(const ref of refs){const u=await _photoRefToDataUrl(ref);if(u)arr.push(`<img alt="Foto" src="${u}">`);}
    return arr.length?`<div class="photos">${arr.join('')}</div>`:'';
  };
  try{
    for(const c of (data.culturas||[]))for(const o of (c.ops||[])){
      const key={Sementeira:'sementeiras',Plantação:'plantacoes',Colheita:'colheitas'}[o.tipo];
      if(!key||!sec.has(key)||!String(o.data||'').startsWith(ym))continue;
      add(o.data,key,`<b>${esc(o.tipo)} — ${esc(nome(c.id))}</b> · ${esc(join(o.qtd))} · ${esc(join(o.parcelas))}<div class="small">${esc(o.obs)}</div>${await ph(o.fotos)}`);
    }
    if(sec.has('fito'))for(const t of (data.tratamentos||[])){
      if(!String(t.data||'').startsWith(ym))continue;
      add(t.data,'fito',`<b>${esc(t.produto||'Tratamento')}</b> · ${esc((t.culturaIds||[]).map(nome).join(', '))} · ${esc(join(t.parcelas)||t.local)} <div class="small">${esc(t.dose)} · ${esc(t.obs)}</div>${await ph(t.fotos)}`);
    }
    if(sec.has('ops'))for(const o of (data.ops_tasks||[])){
      if(!String(o.data||'').startsWith(ym))continue;
      add(o.data,'ops',`<b>${esc(join(o.tipo||o.tipos)||'Operação')}</b> · ${esc(join(o.parcela||o.parcelas))} <div class="small">${esc(o.medida)} ${esc(o.obs)}</div>${await ph(o.fotos)}`);
    }
    if(sec.has('notas'))for(const n of (data.notas||[])){
      if(!String(n.data||'').startsWith(ym))continue;
      add(n.data,'notas',`<b>${esc(n.assunto||'Nota')}</b> <div class="small">${esc(n.texto).replace(/\n/g,'<br>')}</div>${await ph(n.fotos)}`);
    }
    if(sec.has('fin'))for(const [tipo,arr] of [['Compra',data.fin?.compras||[]],['Venda',data.fin?.vendas||[]]])for(const r of arr){
      if(!String(r.data||'').startsWith(ym))continue;
      add(r.data,'fin',`<b>${esc(tipo)}:</b> ${esc(r.desc||r.descricao)} · ${esc(r.valor)} €`);
    }
    const labels={sementeiras:'🌱 Sementeiras',plantacoes:'🪴 Plantações',colheitas:'🥕 Colheitas',fito:'🧪 Tratamentos',ops:'🛠️ Tarefas',notas:'📝 Notas',fin:'💶 Gestão €'};
    let html=`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Mapa mensal</title></head><body>
      <h1>Mapa mensal — ${esc(qc_nomeMes(ym))}</h1><div class="meta">Período: ${esc(inicio)} a ${esc(fim)} · Ilha das Flores, Açores</div>
      <table><thead><tr><th style="width:105px">Dia</th><th>Atividades registadas</th></tr></thead><tbody>`;
    for(let d=1;d<=days;d++){
      const key=ym+'-'+String(d).padStart(2,'0');
      const day=new Date(Date.UTC(ano,mes-1,d));
      const dow=new Intl.DateTimeFormat('pt-PT',{weekday:'short',timeZone:'UTC'}).format(day);
      const entries=pack.get(key)||[];
      let cell=entries.map(({key,txt})=>`<div style="margin:0 0 7px"><div class="small">${esc(labels[key]||key)}</div>${txt}</div>`).join('');
      if(!cell)cell='<span class="small">Sem registos nas categorias selecionadas.</span>';
      html+=`<tr><td><b>${d}</b> · ${esc(dow)}</td><td>${cell}</td></tr>`;
    }
    html+='</tbody></table>';
    if(sec.has('rot')){
      const parcel=document.getElementById('r_parcela')?.value||'';
      const rota=rot_todasEntradas().filter(x=>x.ano===ano&&(!parcel||x.parcela===parcel));
      html+='<h2>Rotação de culturas — histórico do ano</h2><p class="small">'+(parcel?'Parcela: '+esc(parcel):'Todas as parcelas')+'</p>';
      html+='<table><thead><tr><th>Parcela</th><th>Ano</th><th>Família</th><th>Espécie</th><th>Origem</th></tr></thead><tbody>';
      for(const e of rota)html+=`<tr><td>${esc(e.parcela)}</td><td>${e.ano}</td><td>${esc(e.familia)}</td><td>${esc(e.especie)}</td><td>${esc((e.origens||[]).join(', '))}</td></tr>`;
      html+='</tbody></table>';
    }
    html+='</body></html>';
    rel_abrirDocumento(html,'Mapa mensal',win);
  }catch(err){console.error(err);win.document.body.textContent='Erro ao criar o mapa mensal: '+(err?.message||err);}
}

/* ===================== PDF por impressão (fallback para botões existentes) ===================== */
function _printHtmlNode(title, node){
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  </head><body><h1>${title}</h1>${node.outerHTML}</body></html>`;
  rel_abrirDocumento(html,title);
}

async function exportJSON(){
  // Export portável: se houver refs idbphoto:, converte para dataURL no ficheiro exportado
  const stamp = new Date().toISOString().slice(0,10);
  const filename = "bio_suite_"+stamp+".json";

  const out = deepClone(data);

  async function convertArray(arr){
    if(!Array.isArray(arr)) return;
    for(let i=0;i<arr.length;i++){
      const ref = arr[i];
      if(!ref) continue;
      try{
        const b = await getPhotoBlob(ref);
        if(!b) continue;
        const {blob: rb, ext} = await compressImageToWebpOrJpeg(b, 960, 960, 0.55, 180*1024);
        const dataUrl = await blobToDataURL(rb || b);
        arr[i] = dataUrl;
      }catch(_e){}
    }
  }

  for(const c of (out.culturas||[])){
    for(const op of (c.ops||[])){
      await convertArray(op.fotos||[]);
    }
  }
  for(const t of (out.tratamentos||[])){
    await convertArray(t.fotos||[]);
  }
  for(const it of (out.ops_tasks||[])){
    await convertArray(it.fotos||[]);
  }


  // Notas (fotos)
  for(const n of (out.notas||[])){
    await convertArray(n.fotos||[]);
  }
  // Gestão € (foto por registo)
  if(out.fin){
    for(const r of (out.fin.compras||[])){
      if(r && r.foto){ const arr=[r.foto]; await convertArray(arr); r.foto=arr[0]; }
    }
    for(const r of (out.fin.vendas||[])){
      if(r && r.foto){ const arr=[r.foto]; await convertArray(arr); r.foto=arr[0]; }
    }
  }

  const blob = new Blob([JSON.stringify(out,null,2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  lastSavedAt = new Date();
  dirty = false;
  updateStatus();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}


function loadFromObject(obj){
  // valida minimamente e completa faltas
  if(!obj || typeof obj!=="object") throw new Error("JSON inválido.");
  const base = obj.base || obj.data || obj.base_especies || null;
  data = {
    app:"bio_suite",
    version: APP_VERSION,
    meta: obj.meta || {created_at: nowISO(), updated_at: nowISO()},
    base: base ? base : deepClone(BASE_INICIAL),
    config: (obj.config && typeof obj.config==="object") ? obj.config : undefined,
    culturas: Array.isArray(obj.culturas) ? obj.culturas : (obj.campo?.culturas || []),
    rotacaoHistorico: Array.isArray(obj.rotacaoHistorico) ? obj.rotacaoHistorico : [],
    tratamentos: Array.isArray(obj.tratamentos) ? obj.tratamentos : (obj.fitofarm?.tratamentos || []),
    calendar: obj.calendar || null,
    ops_tasks: Array.isArray(obj.ops_tasks) ? obj.ops_tasks : (obj.ops?.items || []),
    notas: Array.isArray(obj.notas) ? obj.notas : (obj.notas?.items || []),
    fin: (obj.fin && typeof obj.fin==="object") ? obj.fin : (obj.gestao && typeof obj.gestao==="object" ? obj.gestao : {compras:[], vendas:[]})
  };
  // normalizações
  if(!data.meta.created_at) data.meta.created_at = nowISO();
  if(!data.meta.updated_at) data.meta.updated_at = nowISO();
  if(!data.base || typeof data.base!=="object") data.base = deepClone(BASE_INICIAL);
  if(!Array.isArray(data.culturas)) data.culturas=[];
  if(!Array.isArray(data.rotacaoHistorico)) data.rotacaoHistorico=[];
  if(!Array.isArray(data.tratamentos)) data.tratamentos=[];
  if(!Array.isArray(data.ops_tasks)) data.ops_tasks=[];
  if(!Array.isArray(data.notas)) data.notas=[];
  if(!data.fin || typeof data.fin!=="object") data.fin={compras:[],vendas:[]};
  if(!Array.isArray(data.fin.compras)) data.fin.compras=[];
  if(!Array.isArray(data.fin.vendas)) data.fin.vendas=[];

  // normalizar categorias antigas e garantir arrays de fotos
  for(const it of data.ops_tasks){
    if(!it) continue;
    if(it.categoria==="solo" || it.categoria==="protecao" || it.categoria==="protecao_fert") it.categoria="prot_fert";
    if(!Array.isArray(it.fotos)) it.fotos=[];
  }
  for(const c of data.culturas){
    for(const op of (c?.ops||[])){
      if(!Array.isArray(op.fotos)) op.fotos=[];
    }
  }
  for(const t of data.tratamentos){
    if(!t) continue;
    if(!Array.isArray(t.fotos)) t.fotos=[];

    // normalizar multi-seleções (compatibilidade com versões antigas)
    if(t.tipoInt===undefined && t.tipo!==undefined) t.tipoInt = t.tipo;
    if(t.tipo===undefined && t.tipoInt!==undefined) t.tipo = t.tipoInt;

    if(!Array.isArray(t.tipoProd)){
      const s = String(t.tipoProd||"").trim();
      t.tipoProd = s ? s.split(",").map(x=>x.trim()).filter(Boolean) : [];
    }
    if(!Array.isArray(t.motivo)){
      const s = String(t.motivo||"").trim();
      t.motivo = s ? s.split(",").map(x=>x.trim()).filter(Boolean) : [];
    }
    if(!Array.isArray(t.parcelas)){
      const s = String(t.parcelas||t.local||"").trim();
      t.parcelas = s ? s.split(",").map(x=>x.trim()).filter(Boolean) : [];
    }
  }
  for(const n of (data.notas||[])){
    if(!n) continue;
    if(!Array.isArray(n.fotos)) n.fotos=[];
    if(!Array.isArray(n.parcelas)) n.parcelas=[];
    if(!Array.isArray(n.culturaIds)) n.culturaIds=[];
    if(!Array.isArray(n.especies)) n.especies=[];
  }
  // fin: garantir estrutura
  if(!data.fin) data.fin={compras:[], vendas:[]};
  for(const arr of [data.fin.compras||[], data.fin.vendas||[]]){
    for(const r of arr){
      if(!r) continue;
      if(r.foto===undefined) r.foto=null;
    }
  }
}

function importMenu(){
  const input=document.createElement("input");
  input.type="file";
  input.accept=".json,application/json";
  input.onchange=()=>{
    const file=input.files && input.files[0];
    if(!file) return;
    const fr=new FileReader();
    fr.onload=()=>{
      try{
        const obj=JSON.parse(String(fr.result||""));
        // menu simples: detectar tipo e importar
        if(obj.app==="fitofarm_bio") importFitState(obj);
        else if(obj.app==="caderno_bio" || obj.culturas || obj.base) importCampoOrSuite(obj);
        else if(obj.data && obj.meta) importEspecies(obj);
        else importCampoOrSuite(obj);
        refreshAllUI();
        markDirty();
        alert("Importação concluída (dados mesclados).");
      }catch(e){ console.error(e); alert("JSON inválido."); }
    };
    fr.readAsText(file);
  };
  input.click();
}

function importEspecies(obj){
  // Espera {meta, data:base}
  const b=obj.data || obj.base || obj.base_especies;
  if(b && typeof b==="object") data.base = b;
}
function importCampoOrSuite(obj){
  // pode ser suite completa {base,culturas,tratamentos,ops_tasks} ou caderno {meta,culturas,base}
  const b=obj.base || obj.data || obj.base_especies || null;
  if(b && typeof b==="object") data.base = b;

  const cults = obj.culturas || obj.campo?.culturas || [];
  mergeCulturas(cults);

  const tr = obj.tratamentos || obj.fitofarm?.tratamentos || [];
  mergeTratamentos(tr);

  const ops = obj.ops_tasks || obj.ops?.items || [];
  mergeOpsTasks(ops);

  const notas = obj.notas || obj.notas?.items || [];
  mergeNotas(notas);

  const fin = obj.fin || obj.gestao || null;
  mergeFin(fin);

  if(obj.calendar) data.calendar = obj.calendar;
  if(Array.isArray(obj.rotacaoHistorico)){
    data.rotacaoHistorico = Array.isArray(data.rotacaoHistorico) ? data.rotacaoHistorico : [];
    const ids = new Set(data.rotacaoHistorico.map(x=>x.id));
    obj.rotacaoHistorico.forEach(x=>{if(x && x.id && !ids.has(x.id)){data.rotacaoHistorico.push({...x});ids.add(x.id);}});
  }
}
function importFitState(obj){
  // obj = {culturas, tratamentos}
  mergeCulturas(obj.culturas||[]);
  mergeTratamentos(obj.tratamentos||[]);
}
function mergeCulturas(cults){
  if(!Array.isArray(cults)) return;
  const map=new Map(data.culturas.map(c=>[c.id,c]));
  for(const c of cults){
    if(!c || !c.id) continue;
    if(map.has(c.id)){
      const cur=map.get(c.id);
      cur.familia = cur.familia || c.familia;
      cur.especie = cur.especie || c.especie;
      cur.variedade = cur.variedade || c.variedade;
      if(Array.isArray(c.ops) && (!Array.isArray(cur.ops) || !cur.ops.length)) cur.ops = c.ops;
    } else {
      data.culturas.push({id:c.id, familia:c.familia, especie:c.especie, variedade:c.variedade||"", ops:Array.isArray(c.ops)?c.ops:[] });
      map.set(c.id, data.culturas[data.culturas.length-1]);
    }
  }
}
function mergeTratamentos(trats){
  if(!Array.isArray(trats)) return;
  const ids=new Set(data.tratamentos.map(t=>t.id));
  for(const t of trats){
    if(!t) continue;
    let id=t.id || gerarID();
    if(ids.has(id)) id=gerarID();
    ids.add(id);
    data.tratamentos.push({...t, id});
  }
}


function mergeOpsTasks(items){
  if(!Array.isArray(items)) return;
  const ids=new Set((data.ops_tasks||[]).map(x=>x.id));
  for(const it of items){
    if(!it) continue;
    let id=it.id || gerarID();
    if(ids.has(id)) id=gerarID();
    ids.add(id);
    (data.ops_tasks||[]).push({...it, id});
  }
}

function mergeNotas(items){
  if(!Array.isArray(items)) return;
  if(!Array.isArray(data.notas)) data.notas=[];
  const ids=new Set((data.notas||[]).map(x=>x.id));
  for(const n of items){
    if(!n) continue;
    let id=n.id || gerarID();
    if(ids.has(id)) id=gerarID();
    ids.add(id);
    const rec={...n, id};
    if(!Array.isArray(rec.fotos)) rec.fotos=[];
    if(!Array.isArray(rec.parcelas)) rec.parcelas=[];
    if(!Array.isArray(rec.culturaIds)) rec.culturaIds=[];
    if(!Array.isArray(rec.especies)) rec.especies=[];
    data.notas.push(rec);
  }
}

function mergeFin(finObj){
  if(!finObj || typeof finObj!=="object") return;
  if(!data.fin || typeof data.fin!=="object") data.fin={compras:[],vendas:[]};
  const pushUnique=(arr, incoming)=>{
    const ids=new Set(arr.map(x=>x.id));
    for(const r of (incoming||[])){
      if(!r) continue;
      let id=r.id || gerarID();
      if(ids.has(id)) id=gerarID();
      ids.add(id);
      const rec={...r, id};
      if(rec.foto===undefined) rec.foto=null;
      arr.push(rec);
    }
  };
  pushUnique(data.fin.compras, finObj.compras);
  pushUnique(data.fin.vendas, finObj.vendas);
}

/* ===================== MODAL IMAGENS ===================== */
const imgModal = document.getElementById("imgModal");
const imgModalImg = document.getElementById("imgModalImg");
function openModal(url){ if(!url) return; imgModal.style.display="flex"; imgModalImg.src=url; }

/* ===================== ESPÉCIES ===================== */
const e_famSel = document.getElementById("e_famSel");
const e_espSel = document.getElementById("e_espSel");
const e_varSel = document.getElementById("e_varSel");
const e_famInput = document.getElementById("e_famInput");
const e_espInput = document.getElementById("e_espInput");
const e_varInput = document.getElementById("e_varInput");
const e_compInput = document.getElementById("e_compInput");
const e_antInput = document.getElementById("e_antInput");

function e_refreshFamilias(preserve=true){
  const prev={f:e_famSel.value,e:e_espSel.value,v:e_varSel.value};
  e_famSel.replaceChildren();
  const fams=Object.keys(data.base||{}).sort();
  if(!fams.length) {
    const opt=document.createElement("option"); opt.value=""; opt.textContent="— (sem dados)"; e_famSel.appendChild(opt);
    e_espSel.replaceChildren(); e_espSel.appendChild(new Option("—",""));
    e_varSel.replaceChildren(); e_varSel.appendChild(new Option("—",""));
    return;
  }
  fams.forEach(f=>e_famSel.appendChild(new Option(f,f)));
  if(preserve && prev.f && fams.includes(prev.f)) e_famSel.value=prev.f;
  e_refreshEspecies(preserve?prev.e:null, preserve?prev.v:null);
}
function e_refreshEspecies(preferEsp=null, preferVar=null){
  e_espSel.replaceChildren();
  const f=e_famSel.value;
  const fam=data.base?.[f];
  if(!fam) {
    e_espSel.appendChild(new Option("—",""));
    e_varSel.replaceChildren(); e_varSel.appendChild(new Option("—",""));
    return;
  }
  const especies=Object.keys(fam).sort();
  if(!especies.length) e_espSel.appendChild(new Option("—",""));
  else especies.forEach(e=>e_espSel.appendChild(new Option(e,e)));
  if(preferEsp && especies.includes(preferEsp)) e_espSel.value=preferEsp;
  e_refreshVariedades(preferVar);
}
function e_refreshVariedades(preferVar=null){
  e_varSel.replaceChildren();
  const f=e_famSel.value, e=e_espSel.value;
  const node=data.base?.[f]?.[e];
  const vars = Array.isArray(node?.variedades) ? node.variedades : [];
  if(!vars.length) {
    e_varSel.appendChild(new Option("—",""));
    return;
  }
  vars.forEach(v=>e_varSel.appendChild(new Option(v,v)));
  if(preferVar && vars.includes(preferVar)) e_varSel.value=preferVar;
}
e_famSel.onchange=()=>e_refreshEspecies();
e_espSel.onchange=()=>e_refreshVariedades();

function e_prepararSeletores(){
  const famSel=document.getElementById('e_famExistente');
  const espSel=document.getElementById('e_espExistente');
  if(!famSel||!espSel)return;
  const antiga=famSel.value;
  famSel.replaceChildren(new Option('— Nova família / escrever —',''));
  const sugestoes=document.getElementById('e_famSugestoes');
  if(sugestoes)sugestoes.replaceChildren();
  Object.keys(data.base||{}).sort().forEach(f=>{
    famSel.add(new Option(f,f));if(sugestoes)sugestoes.appendChild(new Option(f,f));
  });
  if([...famSel.options].some(o=>o.value===antiga))famSel.value=antiga;
  e_prepararEspeciesDaFamilia();
}
function e_prepararEspeciesDaFamilia(){
  const espSel=document.getElementById('e_espExistente');
  if(!espSel)return;
  const antiga=espSel.value;
  const fam=document.getElementById('e_famExistente')?.value || e_famInput.value.trim();
  espSel.replaceChildren(new Option('— Nova espécie / escrever —',''));
  const sugestoes=document.getElementById('e_espSugestoes');
  if(sugestoes)sugestoes.replaceChildren();
  for(const esp of Object.keys(data.base?.[fam]||{}).sort()){
    espSel.add(new Option(esp,esp));if(sugestoes)sugestoes.appendChild(new Option(esp,esp));
  }
  if([...espSel.options].some(o=>o.value===antiga))espSel.value=antiga;
}
function e_escolherFamiliaExistente(){
  const familia=document.getElementById('e_famExistente')?.value||'';
  e_famInput.value=familia;
  e_espInput.value='';e_varInput.value='';e_compInput.value='';e_antInput.value='';
  e_prepararEspeciesDaFamilia();
}
function e_escolherEspecieExistente(){
  const especie=document.getElementById('e_espExistente')?.value||'';
  e_espInput.value=especie;
  e_varInput.value='';
  const node=data.base?.[e_famInput.value]?.[especie];
  e_compInput.value=(node?.companheiras||[]).join(', ');
  e_antInput.value=(node?.antagonicas||[]).join(', ');
}

function e_limpar(){ e_famInput.value=""; e_espInput.value=""; e_varInput.value=""; e_compInput.value=""; e_antInput.value=""; }


function e_editar(){
  const f=e_famSel.value, e=e_espSel.value;
  const node=data.base?.[f]?.[e];
  if(!node) return alert("Selecione uma espécie válida.");
  const v=e_varSel.value;
  e_famInput.value=f||"";
  e_espInput.value=e||"";
  e_varInput.value=(v && v!=="—")?v:"";
  e_compInput.value=(node.companheiras||[]).join(", ");
  e_antInput.value=(node.antagonicas||[]).join(", ");
  e_prepararSeletores();
  const famExistente=document.getElementById('e_famExistente');
  if(famExistente){famExistente.value=f;e_prepararEspeciesDaFamilia();}
  const espExistente=document.getElementById('e_espExistente');
  if(espExistente)espExistente.value=e;
}

function e_guardar(){
  const f=norm(e_famInput.value);
  const e=norm(e_espInput.value);
  const v=norm(e_varInput.value);
  if(!f||!e) return alert("Família e Espécie obrigatórias.");

  if(!data.base[f]) data.base[f]={};
  if(!data.base[f][e]) data.base[f][e]={variedades:[],companheiras:[],antagonicas:[]};
  if(v && !(data.base[f][e].variedades||[]).some(x=>cmp(x)===cmp(v))) data.base[f][e].variedades.push(v);

  data.base[f][e].companheiras = parseLista(e_compInput.value);
  data.base[f][e].antagonicas  = parseLista(e_antInput.value);

  e_refreshFamilias(false);
  e_famSel.value=f;
  e_refreshEspecies(e, v);
  e_limpar();
  e_prepararSeletores();
  markDirty();
  autosaveNowSoon();
  // refrescar dropdowns do Campo (porque dependem da base)
  c_refreshFamilias();
}

function e_apagarVar(){ 
  const f=e_famSel.value, e=e_espSel.value, v=e_varSel.value;
  if(!f||!e) return alert("Selecione família e espécie.");
  if(!v || v==="—") return alert("Selecione uma variedade.");
  if(!confirm(`Apagar a variedade "${v}" de "${e}"?`)) return;
  const node=data.base?.[f]?.[e];
  node.variedades = (node.variedades||[]).filter(x=>cmp(x)!==cmp(v));
  e_refreshFamilias();
  markDirty();
}
function e_apagarEsp(){
  const f=e_famSel.value, e=e_espSel.value;
  if(!f||!e) return alert("Selecione família e espécie.");
  if(!confirm(`Apagar a espécie "${e}" (família "${f}")?`)) return;
  delete data.base[f][e];
  if(Object.keys(data.base[f]).length===0) delete data.base[f];
  e_refreshFamilias(false);
  markDirty();
  c_refreshFamilias();
}
function e_apagarFam(){
  const f=e_famSel.value;
  if(!f) return alert("Selecione uma família.");
  if(!confirm(`Apagar a família "${f}" inteira?`)) return;
  delete data.base[f];
  e_refreshFamilias(false);
  markDirty();
  c_refreshFamilias();
}

function resetToInitial(){
  if(!confirm("Repor base inicial? Isto substitui a base atual.")) return;
  data.base = deepClone(BASE_INICIAL);
  e_refreshFamilias(false);
  c_refreshFamilias();
  markDirty();
}

/* ===================== CAMPO ===================== */
const c_famSel=document.getElementById("c_famSel");
const c_espSel=document.getElementById("c_espSel");
const c_varSel=document.getElementById("c_varSel");
const c_varManual=document.getElementById("c_varManual");

const c_tipoOp=document.getElementById("c_tipoOp");
const c_parcelasSel=document.getElementById("c_parcelasSel");
const c_mesesSel=document.getElementById("c_mesesSel");
const c_dataOp=document.getElementById("c_dataOp");
const c_qtdOp=document.getElementById("c_qtdOp");
const c_qtdColheitaWrap=document.getElementById("c_qtdColheitaWrap");
const c_qtdColVal=document.getElementById("c_qtdColVal");
const c_qtdColUnit=document.getElementById("c_qtdColUnit");
const c_obsSug=document.getElementById("c_obsSug");
const c_obsOp=document.getElementById("c_obsOp");
const c_fotoInput=document.getElementById("c_fotoInput");
const c_fotosEdicao=document.getElementById("c_fotosEdicao");
const c_estadoEdicao=document.getElementById("c_estadoEdicao");
const c_lista=document.getElementById("c_lista");

let c_culturaSel=null;
let c_expanded=new Set(); // culturas expandidas na lista
let c_checked=new Set(); // culturas marcadas para apagar
let c_opSel=null;
let c_editMode=false;
let c_fotosBuffer=[]; // refs atuais da operação em edição (paths ou dataURL)

// A numeração de cada cultura mantém-se fixa mesmo quando é movida na listagem.
// É guardada no metadado do projeto, sem alterar os IDs nem os registos agrícolas.
function c_garantirNumeracao(){
  if(!data.meta || typeof data.meta!=="object") data.meta={created_at:nowISO(),updated_at:nowISO()};
  if(!data.meta.numeracaoCulturas || typeof data.meta.numeracaoCulturas!=="object" || Array.isArray(data.meta.numeracaoCulturas)){
    data.meta.numeracaoCulturas={};
  }
  const mapa=data.meta.numeracaoCulturas;
  const nums=Object.values(mapa).map(Number).filter(x=>Number.isInteger(x)&&x>0);
  const tinhaNumeracao=nums.length>0;
  let proximo=Math.max(0,...nums);
  const usados=new Set(nums);
  (data.culturas||[]).forEach((c,i)=>{
    const key=String(c.id);
    if(Number.isInteger(Number(mapa[key])) && Number(mapa[key])>0) return;
    const herdado=Number(c.ordem);
    let n;
    if(Number.isInteger(herdado)&&herdado>0&&!usados.has(herdado)) n=herdado;
    else if(!tinhaNumeracao && !usados.has(i+1)) n=i+1;
    else n=proximo+1;
    mapa[key]=n;
    usados.add(n);
    proximo=Math.max(proximo,n);
  });
}
function c_numeroCultura(c){
  c_garantirNumeracao();
  return data.meta.numeracaoCulturas[String(c.id)];
}
function c_rotuloCultura(c){
  return `#${c_numeroCultura(c)} — ${c.familia} — ${c.especie}${c.variedade?" / "+c.variedade:""}`;
}
function c_atualizarAlvo(){
  const el=document.getElementById("c_culturaAtiva");
  if(!el) return;
  el.textContent=c_culturaSel
    ? `✓ Cultura selecionada para criar/editar operações: ${c_rotuloCultura(c_culturaSel)}`
    : "Selecione uma cultura na lista de culturas e operações.";
}
function c_moverParaTopo(c){
  const i=data.culturas.indexOf(c);
  if(i>0){
    c_garantirNumeracao();
    data.culturas.splice(i,1);
    data.culturas.unshift(c);
    markDirty();
    // Atualiza os nomes noutras áreas sem perder as seleções já efetuadas.
    const selecoes=["f_culturaSel","o_cultura","n_culturas"].map(id=>{
      const el=document.getElementById(id);
      return {el, ids:new Set(el?[...el.selectedOptions].map(o=>o.value):[])};
    });
    refreshCulturasSelects();
    for(const {el,ids} of selecoes){
      if(el) [...el.options].forEach(o=>o.selected=ids.has(o.value));
    }
    h_refreshCulturas();
  }
}
function c_prepararNovaSementeira(c){
  if(!c)return;
  c_moverParaTopo(c);c_culturaSel=c;c_expanded.add(c.id);
  c_atualizar();
  s_limpar();
  [...s_culturas.options].forEach(o=>o.selected=String(o.value)===String(c.id));
  s_atualizarSelecao();
  document.getElementById('qc_sementeiras_area')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function c_selecionarParaOperacao(c, opId=null){
  if(!c) return;
  const jaSelecionada=c_culturaSel===c;
  c_moverParaTopo(c);
  c_culturaSel=c;
  c_limparFormulario();
  c_opSel=opId;
  if(opId || !jaSelecionada) c_expanded.add(c.id);
  else if(c_expanded.has(c.id)) c_expanded.delete(c.id);
  else c_expanded.add(c.id);
  c_atualizar();
}

function c_refreshFamilias(){
  c_famSel.replaceChildren();
  const fams=Object.keys(data.base||{}).sort();
  if(!fams.length) {
    c_famSel.appendChild(new Option("—",""));
    c_espSel.replaceChildren(); c_espSel.appendChild(new Option("—",""));
    c_varSel.replaceChildren(); c_varSel.appendChild(new Option("—",""));
    return;
  }
  fams.forEach(f=>c_famSel.appendChild(new Option(f,f)));
  c_refreshEspecies();
  c_refreshVariedades();
}
function c_refreshEspecies(){
  const f=c_famSel.value;
  c_espSel.replaceChildren();
  const fam=data.base?.[f];
  const especies=fam?Object.keys(fam).sort():[];
  if(!especies.length) c_espSel.appendChild(new Option("—",""));
  else especies.forEach(e=>c_espSel.appendChild(new Option(e,e)));
  c_refreshVariedades();
}
function c_refreshVariedades(){
  const f=c_famSel.value, e=c_espSel.value;
  c_varSel.replaceChildren();
  const node=data.base?.[f]?.[e];
  const vars = Array.isArray(node?.variedades) ? node.variedades : [];
  if(!vars.length) c_varSel.appendChild(new Option("—",""));
  else vars.forEach(v=>c_varSel.appendChild(new Option(v,v)));
}
c_famSel.onchange=()=>c_refreshEspecies();
c_espSel.onchange=()=>c_refreshVariedades();

function c_ajustarCampos(){
  const colheita = c_tipoOp.value==="Colheita";
  document.getElementById("c_boxParcelas").classList.toggle("hidden", colheita);
  document.getElementById("c_boxMeses").classList.toggle("hidden", !colheita);
  const planta = c_tipoOp.value==="Plantação";
  document.getElementById("c_boxSementeiraOrigem").classList.toggle("hidden", !planta);
  if(planta) c_refreshSementeirasOrigem();
  if(colheita) [...c_parcelasSel.options].forEach(o=>o.selected=false);
  else [...c_mesesSel.options].forEach(o=>o.selected=false);
}
function c_refreshSementeirasOrigem(preferida=null){
  const select=document.getElementById("c_sementeiraOrigem");
  const anterior=preferida===null?select.value:String(preferida);
  select.replaceChildren(new Option("— Escolha uma sementeira —",""));
  if(!c_culturaSel) return;
  for(const o of (c_culturaSel.ops||[]).filter(x=>x.tipo==="Sementeira")){
    select.appendChild(new Option(`${fmtDatePT(o.data)} — ${o.qtd||"sem quantidade"} — ${(o.parcelas||[]).join(", ")}`,String(o.id)));
  }
  if([...select.options].some(o=>o.value===anterior)) select.value=anterior;
}

function c_renderFotosEdicao(){
  c_fotosEdicao.replaceChildren();
  if(!c_fotosBuffer.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem fotos nesta operação.";
    c_fotosEdicao.appendChild(d);
    return;
  }
  c_fotosBuffer.forEach((ref, idx)=>{
    const wrap=document.createElement("span"); wrap.className="imgwrap";
    const img=document.createElement("img"); img.className="thumb";
    img.alt="foto";
    img.onclick=async()=>{ const url=await loadPhotoUrl(ref); if(url) openModal(url); };
    (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
    const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
    del.onclick=async(e)=>{
      e.stopPropagation();
      if(!confirm("Remover esta foto (não guarda até gravar)?")) return;
      // Remoção pendente: só é aplicada ao guardar a operação.
      c_fotosBuffer.splice(idx,1);
      c_renderFotosEdicao();
    };
    wrap.appendChild(img); wrap.appendChild(del);
    c_fotosEdicao.appendChild(wrap);
  });
}

async function c_criarCultura(){
  const familia=c_famSel.value, especie=c_espSel.value;
  let variedade=(c_varSel.value||"").trim();
  if(!familia || !especie || familia==="—" || especie==="—") return alert("Escolha Família e Espécie.");
  if(variedade==="—") variedade="";
  const manual=norm(c_varManual.value);
  if(manual) variedade=manual;

  c_garantirNumeracao();
  const nova={id:gerarID(), familia, especie, variedade, ops:[]};
  data.culturas.unshift(nova);
  c_garantirNumeracao();
  c_culturaSel=nova;
  c_expanded.add(nova.id);
  c_opSel=null; c_editMode=false;
  c_fotosBuffer=[]; c_renderFotosEdicao();
  c_estadoEdicao.textContent="";
  c_varManual.value="";
  markDirty();
  refreshCulturasSelects();
  c_atualizar();
  s_refresh(); p_refresh();
}

function c_apagarCultura(){
  if(!c_culturaSel) return alert("Selecione uma cultura na lista abaixo.");
  if(!confirm("Apagar a cultura selecionada e todas as operações?")) return;
  (c_culturaSel.ops||[]).forEach(op=>{
    (op.fotos||[]).forEach(ref=>removePhotoFile(ref));
  });
  const id=c_culturaSel.id;
  c_expanded.delete(id);
  data.tratamentos = data.tratamentos.filter(t=>!(t.culturaIds||[]).includes(id));
  data.culturas = data.culturas.filter(c=>c!==c_culturaSel);
  c_culturaSel=null; c_opSel=null;
  c_editMode=false; c_fotosBuffer=[]; c_renderFotosEdicao();
  c_estadoEdicao.textContent="";
  markDirty();
  refreshCulturasSelects();
  c_atualizar();
  f_atualizar();
  s_refresh(); p_refresh();
}

function c_apagarTodasCulturas(){
  if(!data.culturas.length) return alert("Não há culturas.");
  if(!confirm("Apagar TODAS as culturas, operações e tratamentos associados?")) return;
  for(const c of data.culturas) {
    (c.ops||[]).forEach(op=> (op.fotos||[]).forEach(ref=>removePhotoFile(ref)));
  }
  for(const t of data.tratamentos) {
    (t.fotos||[]).forEach(ref=>removePhotoFile(ref));
  }
  data.culturas=[];
  data.tratamentos=[];
  c_expanded.clear();
  c_culturaSel=null; c_opSel=null; c_editMode=false;
  c_fotosBuffer=[]; c_renderFotosEdicao();
  c_estadoEdicao.textContent="";
  markDirty();
  refreshCulturasSelects();
  c_atualizar();
  f_atualizar();
  s_refresh(); p_refresh();
}

function c_limparFormulario(){
  c_tipoOp.value="Sementeira"; c_ajustarCampos();
  c_dataOp.value=""; c_qtdOp.value=""; c_qtdColVal.value=""; c_qtdColUnit.value="kg"; c_obsSug.value=""; c_obsOp.value="";
  c_fotoInput.value="";
  c_opSel=null; c_editMode=false;
  c_fotosBuffer=[]; c_renderFotosEdicao();
  c_estadoEdicao.textContent="";
}

function c_editarOpSel(){
  if(!c_culturaSel) return alert("Selecione uma cultura.");
  if(!c_opSel) return alert("Clique numa operação na lista.");
  const op = (c_culturaSel.ops||[]).find(x=>x.id===c_opSel);
  if(!op) return alert("Operação não encontrada.");
  if(op.tipo==="Colheita"){
    showTab("colheitas");
    h_editarColheita(c_culturaSel.id,op.id);
    return;
  }
  c_moverParaTopo(c_culturaSel);
  c_expanded.add(c_culturaSel.id);
  c_editMode=true;
  c_estadoEdicao.textContent = `✏️ A editar: ${op.tipo} — ${op.data}`;
  c_tipoOp.value=op.tipo||"Sementeira";
  c_ajustarCampos();
  if(op.tipo==="Plantação") c_refreshSementeirasOrigem(op.sementeiraId||"");
  [...c_parcelasSel.options].forEach(o=>o.selected=(op.parcelas||[]).includes(o.value));
  [...c_mesesSel.options].forEach(o=>o.selected=(op.meses||[]).includes(o.value));
  c_dataOp.value=op.data||"";
  c_qtdOp.value=(op.qtd ?? "");
  c_obsSug.value="";
  c_obsOp.value=op.obs||"";
  c_fotoInput.value="";
  c_fotosBuffer=[...(op.fotos||[])];
  c_renderFotosEdicao();
}

async function c_guardarOperacao(){
  if(!c_culturaSel) return alert("Selecione uma cultura.");
  if(!c_dataOp.value) return alert("Indique a data.");

  const tipo=c_tipoOp.value;
  if(tipo!=="Sementeira") return alert("As plantações são registadas no separador Plantações e as colheitas no separador Colheitas.");
  const originalTipo=c_editMode?(c_culturaSel.ops||[]).find(o=>String(o.id)===String(c_opSel))?.tipo:null;
  if(originalTipo && originalTipo!==tipo) return alert("Não altere o tipo de uma operação existente. Edite-a no separador correspondente.");
  let sementeiraId=null;
  if(tipo==="Plantação"){
    const id=document.getElementById("c_sementeiraOrigem").value;
    const origem=(c_culturaSel.ops||[]).find(x=>String(x.id)===id&&x.tipo==="Sementeira");
    if(!origem) return alert("Para registar uma plantação é obrigatório escolher uma sementeira previamente guardada.");
    if(origem.data && c_dataOp.value<origem.data) return alert("A plantação não pode ser anterior à sementeira.");
    sementeiraId=origem.id;
  }else if(c_editMode){
    const descendentes=sp_plantacoesLigadas(c_opSel);
    if(descendentes.some(x=>x.op.data && c_dataOp.value > x.op.data))
      return alert("Não pode alterar a sementeira para uma data posterior à plantação associada.");
  }
  const parcelas = [...c_parcelasSel.selectedOptions].map(o=>o.value);
  const meses = [];
  const qtd = String(c_qtdOp.value ?? "").trim();
  const obs = (c_obsSug.value+" "+c_obsOp.value).trim();

  const files=[...c_fotoInput.files||[]];
  if(files.length>2) return alert("Máximo 2 fotos.");
  let fotosFinal=[];
  let id = c_opSel || gerarID();
  const antigasFotos = c_editMode ? [...((c_culturaSel.ops||[]).find(x=>x.id===id)?.fotos||[])] : [];

  if(c_editMode){
    if(files.length===0) fotosFinal=[...c_fotosBuffer];
    else {
      fotosFinal=[];
      for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("campo", id, i, files[i]));
    }
  } else {
    for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("campo", id, i, files[i]));
  }

  const novo={id, tipo, parcelas, meses, data:c_dataOp.value, qtd, obs, fotos:fotosFinal};
  if(tipo==="Plantação") novo.sementeiraId=sementeiraId;

  if(c_editMode){
    const alvo = (c_culturaSel.ops||[]).find(x=>x.id===id);
    if(alvo) Object.assign(alvo, novo);
  } else {
    c_culturaSel.ops = c_culturaSel.ops || [];
    c_culturaSel.ops.unshift(novo);
  }

  // garantir que a cultura fica visível (expandida) na lista
  c_expanded.add(c_culturaSel.id);

  c_limparFormulario();
  markDirty();
  autosaveNowSoon();
  c_atualizar();
  s_refresh(); p_refresh();
  if(c_editMode || antigasFotos.length) await removerFotosObsoletasDepoisDeGuardar(antigasFotos, fotosFinal);
}

function c_apagarOpSel(){
  if(!c_culturaSel) return alert("Selecione uma cultura.");
  if(!c_opSel) return alert("Selecione uma operação (clique).");
  if(!confirm("Apagar a operação selecionada?")) return;
  const op = (c_culturaSel.ops||[]).find(x=>x.id===c_opSel);
  if(op?.tipo==="Sementeira" && sp_plantacoesLigadas(op.id).length) return alert("Esta sementeira tem plantações associadas. Apague ou reassocie primeiro essas plantações.");
  if(op) (op.fotos||[]).forEach(ref=>removePhotoFile(ref));
  c_culturaSel.ops = (c_culturaSel.ops||[]).filter(o=>o.id!==c_opSel);
  c_opSel=null;
  c_editMode=false;
  c_fotosBuffer=[]; c_renderFotosEdicao();
  c_estadoEdicao.textContent="";
  markDirty();
  c_atualizar();
  s_refresh(); p_refresh();
}

function appendMultiline(el, text){
  el.replaceChildren();
  const lines=String(text||"").split(/\n/);
  lines.forEach((line,i)=>{
    el.appendChild(document.createTextNode(line));
    if(i<lines.length-1) el.appendChild(document.createElement("br"));
  });
}

function c_atualizar(){
  c_garantirNumeracao();
  c_atualizarAlvo();
  if(c_tipoOp.value==="Plantação") c_refreshSementeirasOrigem();
  c_lista.replaceChildren();
  if(!Array.isArray(data.culturas) || !data.culturas.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem culturas ainda. Use “Criar cultura”.";
    c_lista.appendChild(d);
    return;
  }

  const culturasVisiveis=data.culturas.filter(c=>{
    const ops=(c.ops||[]).filter(o=>o.tipo==="Sementeira");
    return qc_temTexto('c',c.familia,c.especie,c.variedade, ...ops.map(o=>[o.obs,o.tipo,(o.parcelas||[]).join(' ')]))
      && (!qc_filtroMes('c')||ops.some(o=>qc_mesCombina('c',o.data)));
  });
  if(!culturasVisiveis.length)qc_semResultados(c_lista);
  culturasVisiveis.forEach((c,ci)=>{
    const d=document.createElement("div");
    const isSel = (c===c_culturaSel);
    const isOpen = c_expanded.has(c.id);
    d.className="list"+(isSel?" active":"");

    const cab=document.createElement("div");
    cab.className="cabecalho";

    const titulo=document.createElement("span");
    const chk=document.createElement("input");
    chk.type="checkbox";
    chk.style.marginRight="8px";
    chk.checked = c_checked.has(c.id);
    chk.onclick=(ev)=>{ ev.stopPropagation(); if(chk.checked) c_checked.add(c.id); else c_checked.delete(c.id); }; 

    const arrow = document.createElement("span");
    arrow.textContent = isOpen ? "▾" : "▸";
    arrow.style.marginRight="8px";
    titulo.appendChild(chk);
    titulo.appendChild(arrow);

    const nameSpan=document.createElement("span");
    nameSpan.textContent = `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
    titulo.appendChild(nameSpan);

    const count=document.createElement("span");
    count.className="small";
    const opsCampo=(c.ops||[]).filter(o=>o.tipo==="Sementeira");
    count.textContent=`${opsCampo.length} operação(ões)`;

    cab.appendChild(titulo);
    cab.appendChild(count);

    cab.onclick=()=>{
      c_selecionarParaOperacao(c);
      [...s_culturas.options].forEach(o=>o.selected=String(o.value)===String(c.id));
      s_atualizarSelecao();
    };

    d.appendChild(cab);

    if(isOpen){
      const btnNovaOp=document.createElement("button");
      btnNovaOp.textContent="🌱 Registar sementeira";
      btnNovaOp.style.margin="8px 10px";
      btnNovaOp.type="button";
      btnNovaOp.onclick=(ev)=>{
        ev.stopPropagation();
        c_prepararNovaSementeira(c);
      };
      d.appendChild(btnNovaOp);
      const ops = opsCampo.filter(o=>qc_mesCombina('c',o.data))
        .sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));
      const gruposOp=new Map();
      if(!ops.length){
        const none=document.createElement("div");
        none.className="item small";
        none.textContent="(sem operações)";
        d.appendChild(none);
      } else {
        ops.forEach((o,oi)=>{
          const op=document.createElement("div");
          op.className="item"+(o.id===c_opSel?" selected":"");

          const head=document.createElement("div");
          head.className="row";
          head.style.alignItems="center";

          const left=document.createElement("div");
          left.style.flex="3";

          const b=document.createElement("b");
          b.textContent = `${sp_referenciaSementeira(c,o)}. ${o.tipo || "Operação"}`;
          left.appendChild(b);

          const parts=[];
          if(o.data) parts.push(`data: ${fmtDatePT(o.data)}`);
          if(hasText(o.qtd)) parts.push(`Quantidade: ${o.qtd}`);
          if((o.parcelas||[]).length){
            const lbl = (o.parcelas||[]).length===1 ? "Parcela" : "Parcelas";
            parts.push(`${lbl}: ${(o.parcelas||[]).join(", ")}`);
          }
          if((o.meses||[]).length) parts.push(`Meses: ${(o.meses||[]).join(", ")}`);

          if(parts.length){
            const meta=document.createElement("div");
            meta.className="small";
            meta.textContent = parts.join(" • ");
            left.appendChild(document.createElement("br"));
            left.appendChild(meta);
          }

          head.appendChild(left);

          const right=document.createElement("div");
          right.style.flex="2";
          right.style.display="flex";
          right.style.justifyContent="flex-end";
          right.style.gap="6px";

          const btnP=document.createElement("button");
          btnP.type="button";
          btnP.className="qc-plantar-btn";
          btnP.textContent="🪴 Plantar";
          btnP.onclick=e=>{
            e.stopPropagation();showTab("plantacoes");p_limpar();p_refresh(String(o.id));
            document.getElementById("p_sementeira")?.scrollIntoView({block:"center",behavior:"smooth"});
          };
          const btnE=document.createElement("button");
          btnE.type="button";
          btnE.className="purp";
          btnE.textContent="✏️ Editar sementeira";
          btnE.onclick=e=>{e.stopPropagation();s_editar(c.id,o.id);};

          const btnD=document.createElement("button");
          btnD.className="warn";
          btnD.textContent="Apagar";
          btnD.onclick=e=>{e.stopPropagation();void s_apagar(c.id,o.id);};

          right.appendChild(btnP);
          right.appendChild(btnE);
          right.appendChild(btnD);
          head.appendChild(right);

          op.appendChild(head);

          if(hasText(o.obs)){
            const obs=document.createElement("div");
            appendMultiline(obs, o.obs);
            op.appendChild(obs);
          }

          if((o.fotos||[]).length){
            const fotosDiv=document.createElement("div");
            (o.fotos||[]).forEach((ref,idx)=>{
              const wrap=document.createElement("span"); wrap.className="imgwrap";
              const img=document.createElement("img"); img.className="thumb";
              (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
              img.onclick=async(e)=>{e.stopPropagation(); const url=await loadPhotoUrl(ref); if(url) openModal(url);};
              const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
              del.onclick=async(e)=>{
                e.stopPropagation();
                if(!confirm("Remover esta foto da operação?")) return;
                o.fotos.splice(idx,1);
                markDirty();
                c_atualizar();
                await removerFotosObsoletasDepoisDeGuardar([ref], o.fotos);
              };
              wrap.appendChild(img); wrap.appendChild(del);
              fotosDiv.appendChild(wrap);
            });
            op.appendChild(fotosDiv);
          }

          op.style.cursor="default"; // ações nos botões, sem abrir acidentalmente
          qc_grupoMes(d,o.data,gruposOp).appendChild(op);
        });
      }
    }

    c_lista.appendChild(d);
  });
}

function c_buildPdfNode(){
  const wrap=document.createElement("div");
  wrap.style.fontFamily="Arial, sans-serif";
  const h2=document.createElement("h2");
  h2.style.textAlign="center";
  h2.style.color="#1b5e20";
  h2.textContent="Culturas e sementeiras — Quintal do Cravinho";
  wrap.appendChild(h2);

  data.culturas.forEach((c,ci)=>{
    const cTitle = `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
    const block=document.createElement("div");
    block.style.border="1px solid #ddd";
    block.style.borderRadius="8px";
    block.style.padding="10px";
    block.style.margin="10px 0";
    const t=document.createElement("div");
    t.style.fontWeight="bold";
    t.style.marginBottom="6px";
    t.textContent=cTitle;
    block.appendChild(t);

    (c.ops||[]).filter(o=>o.tipo==="Sementeira").forEach((o,oi)=>{
      const line=document.createElement("div");
      line.style.borderTop="1px solid #eee";
      line.style.padding="8px";

      const b=document.createElement("b");
      b.textContent=`${sp_referenciaSementeira(c,o)} ${o.tipo}`;
      line.appendChild(b);
      line.appendChild(document.createElement("br"));
      line.appendChild(document.createTextNode("Data: "+(o.data||"—")+" | Quantidade: "+(hasText(o.qtd)?o.qtd:"—")));
      line.appendChild(document.createElement("br"));
      line.appendChild(document.createTextNode("Parcelas: "+((o.parcelas||[]).length?o.parcelas.join(", "):"—")));
      line.appendChild(document.createElement("br"));
      line.appendChild(document.createTextNode("Meses: "+((o.meses||[]).length?o.meses.join(", "):"—")));
      line.appendChild(document.createElement("br"));
      const obs = hasText(o.obs)?o.obs:"—";
      line.appendChild(document.createTextNode("Obs: "+obs));
      block.appendChild(line);
    });

    wrap.appendChild(block);
  });
  return wrap;
}

function c_exportarPDF(){
  const node=c_buildPdfNode();
  _printHtmlNode("caderno_campo", node);
}

/* ===================== SEMENTEIRAS / PLANTAÇÕES (BIO v1.0.34) ===================== */
/* Os registos continuam em data.culturas[].ops; não é necessário migrar a base.
   Plantação.sementeiraId guarda o ID exato da sementeira que lhe deu origem. */
function sp_hojeAzores(){
  const fmt = new Intl.DateTimeFormat("en-GB",{timeZone:"Atlantic/Azores",year:"numeric",month:"2-digit",day:"2-digit"});
  const p=Object.fromEntries(fmt.formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function sp_nome(c){return c_rotuloCultura(c);}
function sp_todasSementeiras(){
  const out=[];
  for(const c of (data.culturas||[])) for(const op of (c.ops||[]))
    if(op.tipo==="Sementeira") out.push({c,op});
  return out.sort((a,b)=>String(b.op.data||"").localeCompare(String(a.op.data||"")));
}
/* A referência da sementeira mantém-se fixa por cultura (ex.: 10.2).
   A numeração é conservada em meta e não altera os IDs dos registos. */
function sp_garantirNumeracaoSementeiras(){
  c_garantirNumeracao();
  if(!data.meta || typeof data.meta!=="object") data.meta={};
  if(!data.meta.numeracaoSementeiras || typeof data.meta.numeracaoSementeiras!=="object" || Array.isArray(data.meta.numeracaoSementeiras))
    data.meta.numeracaoSementeiras={};
  const mapa=data.meta.numeracaoSementeiras;
  for(const c of (data.culturas||[])){
    const prefix=String(c.id)+"::";
    const entradas=(c.ops||[]).filter(o=>o.tipo==="Sementeira"&&o.id!==undefined&&o.id!==null)
      .slice().sort((a,b)=>String(a.data||"").localeCompare(String(b.data||""))||String(a.id).localeCompare(String(b.id)));
    // Mesmo uma sementeira apagada não faz reutilizar um número já atribuído.
    let proximo=Math.max(0,...Object.keys(mapa).filter(k=>k.startsWith(prefix))
      .map(k=>Number(mapa[k])).filter(n=>Number.isInteger(n)&&n>0));
    for(const op of entradas){
      const key=prefix+String(op.id);
      if(Number.isInteger(Number(mapa[key]))&&Number(mapa[key])>0)continue;
      mapa[key]=++proximo;
    }
  }
}
function sp_numeroSementeira(c,op){
  if(!c||!op||op.tipo!=="Sementeira") return null;
  sp_garantirNumeracaoSementeiras();
  return data.meta.numeracaoSementeiras[String(c.id)+"::"+String(op.id)]||null;
}
function sp_referenciaSementeira(c,op){
  const n=sp_numeroSementeira(c,op);
  return `${c_numeroCultura(c)}.${n===null?"—":n}`;
}
function sp_todasPlantacoes(){
  const out=[];
  for(const c of (data.culturas||[])) for(const op of (c.ops||[]))
    if(op.tipo==="Plantação") out.push({c,op});
  return out.sort((a,b)=>String(b.op.data||"").localeCompare(String(a.op.data||"")));
}
function sp_sementeiraPeloId(id){return sp_todasSementeiras().find(x=>String(x.op.id)===String(id))||null;}
function sp_plantacoesLigadas(id){return sp_todasPlantacoes().filter(x=>String(x.op.sementeiraId||"")===String(id));}
function sp_parcelas(select, previous=null){
  if(!select) return;
  const keep=previous===null?new Set([...select.selectedOptions].map(o=>o.value)):new Set(previous||[]);
  const all=Array.isArray(data.config?.parcelas)&&data.config.parcelas.length?data.config.parcelas:
    [...document.getElementById("c_parcelasSel").options].map(o=>o.value);
  select.replaceChildren();
  for(const value of all){const option=new Option(value,value);option.selected=keep.has(value);select.appendChild(option);}
  try{window.qcSyncMobileSelections?.();}catch(_e){}
}
function sp_escolhidas(sel){return [...sel.selectedOptions].map(o=>o.value);}
function sp_fotoPreview(mount,buffer,onRemove){
  mount.replaceChildren();
  if(!buffer.length){const d=document.createElement("div");d.className="small";d.textContent="Sem fotografias anexadas.";mount.appendChild(d);return;}
  buffer.forEach((ref,i)=>{
    const wrap=document.createElement("span");wrap.className="imgwrap";
    const img=document.createElement("img");img.className="thumb";img.alt="Fotografia";
    img.onclick=async()=>{const u=await loadPhotoUrl(ref);if(u)openModal(u);};
    loadPhotoUrl(ref).then(u=>{if(u)img.src=u;});
    const del=document.createElement("button");del.type="button";del.className="delimg";del.textContent="×";del.title="Remover foto da edição";
    del.onclick=()=>{if(confirm("Remover a fotografia desta edição?"))onRemove(i);};
    wrap.append(img,del);mount.appendChild(wrap);
  });
}
function sp_blocoHistorico(titulo,meta,obs,buttons){
  const row=document.createElement("div");row.className="item";
  const h=document.createElement("b");h.textContent=titulo;
  const m=document.createElement("div");m.className="small";m.textContent=meta;
  row.append(h,m);
  if(obs){const d=document.createElement("div");d.style.marginTop="5px";d.textContent=obs;row.appendChild(d);}
  const bar=document.createElement("div");bar.className="row";bar.style.marginTop="8px";
  for(const b of buttons){const btn=document.createElement("button");btn.textContent=b.text;btn.className=b.warn?"warn":(b.secondary?"sec":"");btn.onclick=b.click;bar.appendChild(btn);}
  row.appendChild(bar);return row;
}
const s_culturas=document.getElementById("s_culturas");
const s_data=document.getElementById("s_data");
const s_parcelas=document.getElementById("s_parcelas");
const s_qtdUnica=document.getElementById("s_qtdUnica");
const s_qtdMultiplas=document.getElementById("s_qtdMultiplas");
const s_obs=document.getElementById("s_obs");
const s_obsSug=document.getElementById("s_obsSug");
const s_fotos=document.getElementById("s_fotos");
const s_fotosEdicao=document.getElementById("s_fotosEdicao");
const s_estado=document.getElementById("s_estado");
const s_historico=document.getElementById("s_historico");
const s_resumo=document.getElementById("s_resumo");
let s_edit=null,s_fotoRefs=[],s_qtdBuffer={},s_busy=false;
function s_ids(){return sp_escolhidas(s_culturas);}
function s_quantidadesNoEcra(){
  for(const input of s_qtdMultiplas.querySelectorAll("input[data-cultura]"))s_qtdBuffer[input.dataset.cultura]=input.value;
}
function s_atualizarSelecao(){
  s_quantidadesNoEcra();
  const ids=s_ids();const multi=ids.length>1;
  document.getElementById("s_qtdUnicaBox").classList.toggle("hidden",multi);
  s_qtdMultiplas.classList.toggle("hidden",!multi);
  s_qtdMultiplas.replaceChildren();
  if(!multi)return;
  for(const id of ids){
    const c=(data.culturas||[]).find(x=>String(x.id)===id);if(!c)continue;
    const box=document.createElement("div");box.style.margin="7px 0";
    const l=document.createElement("label");l.textContent=`${sp_nome(c)} — quantidade (opcional)`;
    const input=document.createElement("input");input.type="text";input.dataset.cultura=id;
    input.value=s_qtdBuffer[id]||"";input.placeholder="ex.: 50 sementes / 1 tabuleiro";
    input.oninput=()=>{s_qtdBuffer[id]=input.value;};
    box.append(l,input);s_qtdMultiplas.appendChild(box);
  }
}
function s_refresh(){
  const old=s_ids();s_culturas.replaceChildren();
  for(const c of (data.culturas||[])){
    const opt=new Option(sp_nome(c),String(c.id));opt.selected=old.includes(String(c.id));s_culturas.appendChild(opt);
  }
  if(!old.length&&s_culturas.options.length)s_culturas.options[0].selected=true;
  if(!s_data.value)s_data.value=sp_hojeAzores();
  sp_parcelas(s_parcelas);
  s_atualizarSelecao();
  s_historico.replaceChildren();
  const list=sp_todasSementeiras().filter(({c,op})=>qc_mesCombina('s',op.data)&&qc_temTexto('s',sp_nome(c),c.familia,c.especie,c.variedade,op.obs,op.qtd,(op.parcelas||[]).join(' ')));
  const gruposMes=new Map();
  s_resumo.textContent=`${list.length} sementeira(s) visíveis de ${sp_todasSementeiras().length} no total. Os registos anteriores estão incluídos automaticamente.`;
  if(!list.length)qc_semResultados(s_historico);
  for(const {c,op} of list){
    const assoc=sp_plantacoesLigadas(op.id).length;
    const info=`Sementeira ${sp_referenciaSementeira(c,op)} · ${fmtDatePT(op.data)||"—"} · ${op.qtd||"Quantidade não indicada"} · ${(op.parcelas||[]).join(", ")||"Local não indicado"} · ${assoc} plantação(ões) associada(s)`;
    const row=sp_blocoHistorico(sp_nome(c),info,op.obs, [
      {text:"🪴 Plantar",click:()=>{showTab("plantacoes");p_limpar();p_refresh(String(op.id));}},
      {text:"✏️ Editar",secondary:true,click:()=>s_editar(c.id,op.id)},
      {text:"🗑️ Apagar",warn:true,click:()=>s_apagar(c.id,op.id)}
    ]);
    qc_grupoMes(s_historico,op.data,gruposMes).appendChild(row);
  }
  try{window.qcSyncMobileSelections?.();}catch(_e){}
}
function s_renderFotosEdicao(){
  sp_fotoPreview(s_fotosEdicao,s_fotoRefs,i=>{s_fotoRefs.splice(i,1);s_renderFotosEdicao();});
}
function s_limpar(){
  s_edit=null;s_fotoRefs=[];s_qtdBuffer={};s_qtdUnica.value="";s_obs.value="";s_obsSug.value="";s_fotos.value="";
  s_data.value=sp_hojeAzores();s_estado.textContent="";
  document.getElementById("s_guardarBtn").textContent="🌱 Guardar sementeira";
  sp_fotoPreview(s_fotosEdicao,s_fotoRefs,()=>{});
  s_refresh();
}
function s_editar(cId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(cId));
  const op=(c?.ops||[]).find(x=>String(x.id)===String(opId)&&x.tipo==="Sementeira");
  if(!op)return alert("Sementeira não encontrada.");
  s_edit={cId:String(c.id),opId:String(op.id)};
  [...s_culturas.options].forEach(o=>o.selected=o.value===String(c.id));
  s_data.value=op.data||sp_hojeAzores();s_qtdUnica.value=op.qtd||"";s_obs.value=op.obs||"";s_obsSug.value="";
  sp_parcelas(s_parcelas,op.parcelas||[]);
  s_fotoRefs=[...(op.fotos||[])];s_fotos.value="";
  s_renderFotosEdicao();
  s_estado.textContent=`A editar a sementeira de ${sp_nome(c)}; os registos de plantação associados serão preservados.`;
  document.getElementById("s_guardarBtn").textContent="💾 Guardar edição";
  s_atualizarSelecao();showTab('campo');
  document.getElementById('qc_sementeiras_area')?.scrollIntoView({block:'start',behavior:'smooth'});
}
async function s_guardar(){
  if(s_busy)return;
  const selected=s_ids();if(!selected.length)return alert("Selecione pelo menos uma cultura.");
  if(s_edit && (selected.length!==1 || selected[0]!==s_edit.cId))return alert("Na edição só pode estar selecionada a cultura do registo.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s_data.value))return alert("Indique a data da sementeira.");
  const files=[...s_fotos.files];if(files.length>2)return alert("Pode anexar no máximo 2 fotografias.");
  const original=s_edit?sp_sementeiraPeloId(s_edit.opId):null;
  if(s_edit){
    if(!original || String(original.c.id)!==s_edit.cId)return alert("A sementeira original já não existe.");
    if(sp_plantacoesLigadas(s_edit.opId).some(x=>x.op.data<s_data.value))
      return alert("Já existem plantações anteriores à nova data da sementeira. Corrija primeiro as datas.");
  }
  s_quantidadesNoEcra();
  const parcelas=sp_escolhidas(s_parcelas);const obs=[norm(s_obsSug.value),norm(s_obs.value)].filter(Boolean).join(" — ");
  const updates=[];const newRefs=[];
  s_busy=true;document.getElementById("s_guardarBtn").disabled=true;
  try{
    for(const id of selected){
      const c=(data.culturas||[]).find(x=>String(x.id)===id);if(!c)continue;
      const op=s_edit?original.op:null;
      const opId=op?.id||gerarID();
      const qtd=selected.length===1?s_qtdUnica.value.trim():(s_qtdBuffer[id]||"").trim();
      let fotos=s_edit?[...s_fotoRefs]:[];
      if(files.length){
        fotos=[];
        for(let i=0;i<files.length;i++){
          const ref=await storePhoto("campo",opId,i,files[i]);fotos.push(ref);newRefs.push(ref);
        }
      }
      updates.push({c,op,novo:{id:opId,tipo:"Sementeira",data:s_data.value,qtd,parcelas:[...parcelas],meses:[],obs,fotos}});
    }
  }catch(e){
    for(const ref of newRefs)await removePhotoFile(ref);
    s_busy=false;document.getElementById("s_guardarBtn").disabled=false;
    return alert("Erro ao guardar fotografias: "+(e?.message||e));
  }
  for(const x of updates){
    const old=x.op?[...(x.op.fotos||[])]:[];
    if(x.op)Object.assign(x.op,x.novo);
    else{x.c.ops=x.c.ops||[];x.c.ops.unshift(x.novo);}
    if(x.op)removerFotosObsoletasDepoisDeGuardar(old,x.novo.fotos).catch(console.warn);
  }
  markDirty();autosaveNowSoon();s_limpar();p_refresh();c_atualizar();
  s_busy=false;document.getElementById("s_guardarBtn").disabled=false;
}
async function s_apagar(cId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(cId));
  const op=(c?.ops||[]).find(x=>String(x.id)===String(opId)&&x.tipo==="Sementeira");
  if(!op)return;
  if(sp_plantacoesLigadas(op.id).length)return alert("Esta sementeira tem plantações associadas. Apague ou reassocie primeiro as plantações.");
  if(!confirm(`Apagar a sementeira de ${sp_nome(c)} de ${fmtDatePT(op.data)}?`))return;
  c.ops=c.ops.filter(x=>x!==op);markDirty();autosaveNowSoon();s_refresh();p_refresh();c_atualizar();
  for(const ref of op.fotos||[])await removerFotosObsoletasDepoisDeGuardar([ref],[]);
}
const p_sementeira=document.getElementById("p_sementeira");
const p_origemResumo=document.getElementById("p_origemResumo");
const p_data=document.getElementById("p_data");
const p_quantidade=document.getElementById("p_quantidade");
const p_parcelas=document.getElementById("p_parcelas");
const p_obs=document.getElementById("p_obs");
const p_obsSug=document.getElementById("p_obsSug");
const p_fotos=document.getElementById("p_fotos");
const p_fotosEdicao=document.getElementById("p_fotosEdicao");
const p_estado=document.getElementById("p_estado");
const p_historico=document.getElementById("p_historico");
const p_resumo=document.getElementById("p_resumo");
let p_edit=null,p_fotoRefs=[],p_busy=false;
const p_culturasAbertas=new Set(); // inicialmente recolhidas
function p_atualizarSelecao(){
  const seed=sp_sementeiraPeloId(p_sementeira.value);
  p_origemResumo.textContent=seed ? `${sp_referenciaSementeira(seed.c,seed.op)} · ${sp_nome(seed.c)} · Sementeira de ${fmtDatePT(seed.op.data)} · ${seed.op.qtd||"Quantidade não indicada"} · ${(seed.op.parcelas||[]).join(", ")||"Local não indicado"}` : "Escolha uma sementeira para registar a plantação.";
}
function p_refresh(preferida=null){
  // Preserva as referências das sementeiras e os dados dos registos anteriores.
  const id=preferida!==null?String(preferida):p_sementeira.value;
  p_sementeira.replaceChildren(new Option("— Selecione uma sementeira —",""));
  for(const {c,op} of sp_todasSementeiras()){
    p_sementeira.appendChild(new Option(`${sp_referenciaSementeira(c,op)} · ${sp_nome(c)} · ${fmtDatePT(op.data)} · ${op.qtd||"sem quantidade"}`,String(op.id)));
  }
  if([...p_sementeira.options].some(o=>o.value===id))p_sementeira.value=id;
  p_atualizarSelecao();
  sp_parcelas(p_parcelas);
  if(!p_data.value)p_data.value=sp_hojeAzores();
  p_historico.replaceChildren();

  const todas=sp_todasPlantacoes();
  const list=todas.filter(({c,op})=>qc_mesCombina('p',op.data)
    && qc_temTexto('p',sp_nome(c),c.familia,c.especie,c.variedade,op.obs,op.qtd,(op.parcelas||[]).join(' ')));
  const linked=list.filter(({op})=>sp_sementeiraPeloId(op.sementeiraId)).length;
  p_resumo.textContent=`${list.length} plantação(ões) visíveis de ${todas.length} no total · ${linked} com sementeira associada. Toque numa cultura para mostrar/esconder as plantações. Os registos antigos sem origem ficam preservados.`;
  if(!list.length){qc_semResultados(p_historico);return;}

  // Mesmo visual da lista de Culturas e Sementeiras: cultura -> mês -> plantações.
  const grupos=new Map();
  for(const {c,op} of list){
    const key=String(c.id);
    if(!grupos.has(key))grupos.set(key,[]);
    grupos.get(key).push(op);
  }
  for(const c of (data.culturas||[])){
    const ops=grupos.get(String(c.id));
    if(!ops?.length)continue;
    const aberta=p_culturasAbertas.has(String(c.id));
    const d=document.createElement("div");d.className="list qc-plantacoes-cultura";
    const cab=document.createElement("div");cab.className="cabecalho";
    cab.setAttribute("role","button");cab.tabIndex=0;
    cab.setAttribute("aria-expanded",String(aberta));
    const titulo=document.createElement("span");
    titulo.textContent=`${aberta?"▾":"▸"} ${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?" / "+c.variedade:""}`;
    const count=document.createElement("span");count.className="small";
    count.textContent=`${ops.length} plantação(ões)`;
    cab.append(titulo,count);
    const alternar=()=>{
      const key=String(c.id);
      if(p_culturasAbertas.has(key))p_culturasAbertas.delete(key);
      else p_culturasAbertas.add(key);
      p_refresh();
    };
    cab.onclick=alternar;
    cab.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();alternar();}};
    d.appendChild(cab);
    if(aberta){
      const content=document.createElement("div");content.className="qc-plantacoes-conteudo";
      const meses=new Map();
      const ordenadas=ops.slice().sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));
      ordenadas.forEach((op,i)=>{
        const seed=sp_sementeiraPeloId(op.sementeiraId);
        const info=[`Data: ${fmtDatePT(op.data)||"—"}`,
          `Quantidade: ${op.qtd||"não indicada"}`,
          `Parcelas: ${(op.parcelas||[]).join(", ")||"—"}`,
          seed?`Origem: sementeira ${sp_referenciaSementeira(seed.c,seed.op)} de ${fmtDatePT(seed.op.data)}`:"Registo anterior sem sementeira associada"
        ].join(" · ");
        const ref=seed?sp_referenciaSementeira(seed.c,seed.op):`${c_numeroCultura(c)}.—`;
        const item=sp_blocoHistorico(`🪴 ${ref} · Plantação`,info,op.obs,[
          {text:"✏️ Editar plantação",secondary:true,click:()=>p_editar(c.id,op.id)},
          {text:"🗑️ Apagar",warn:true,click:()=>{void p_apagar(c.id,op.id);}}
        ]);
        if((op.fotos||[]).length){
          const gal=document.createElement("div");gal.className="qc-plantacoes-fotos";
          for(const ref of op.fotos){
            const img=document.createElement("img");img.className="thumb";img.alt="Fotografia da plantação";
            img.onclick=async()=>{const url=await loadPhotoUrl(ref);if(url)openModal(url);};
            loadPhotoUrl(ref).then(url=>{if(url)img.src=url;else img.title="Foto não encontrada";});
            gal.appendChild(img);
          }
          item.appendChild(gal);
        }
        qc_grupoMes(content,op.data,meses).appendChild(item);
      });
      d.appendChild(content);
    }
    p_historico.appendChild(d);
  }
}

function p_renderFotosEdicao(){
  sp_fotoPreview(p_fotosEdicao,p_fotoRefs,i=>{p_fotoRefs.splice(i,1);p_renderFotosEdicao();});
}
function p_limpar(){
  p_edit=null;p_fotoRefs=[];p_quantidade.value="";p_obs.value="";p_obsSug.value="";p_fotos.value="";
  p_data.value=sp_hojeAzores();p_estado.textContent="";
  document.getElementById("p_guardarBtn").textContent="🪴 Guardar plantação";
  sp_fotoPreview(p_fotosEdicao,p_fotoRefs,()=>{});
  p_refresh();
}
function p_editar(cId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(cId));
  const op=(c?.ops||[]).find(x=>String(x.id)===String(opId)&&x.tipo==="Plantação");
  if(!op)return alert("Plantação não encontrada.");
  p_edit={cId:String(c.id),opId:String(op.id)};
  p_refresh(op.sementeiraId||"");
  p_data.value=op.data||sp_hojeAzores();
  const qty=String(op.qtd||"");p_quantidade.value=/^\s*\d+\s*(?:plantas?)?\s*$/i.test(qty)?qty.replace(/\D/g,""):"";
  sp_parcelas(p_parcelas,op.parcelas||[]);p_obs.value=op.obs||"";p_obsSug.value="";
  p_fotoRefs=[...(op.fotos||[])];p_fotos.value="";
  p_renderFotosEdicao();
  p_estado.textContent=op.sementeiraId?`A editar a plantação de ${sp_nome(c)}.`:
    `Registo anterior sem origem: selecione uma sementeira de ${sp_nome(c)} para o associar antes de guardar.`;
  document.getElementById("p_guardarBtn").textContent="💾 Guardar edição";
  showTab("plantacoes");document.getElementById("view_plantacoes")?.scrollIntoView({block:"start",behavior:"smooth"});
}
async function p_guardar(){
  if(p_busy)return;
  const seed=sp_sementeiraPeloId(p_sementeira.value);
  if(!seed)return alert("Selecione primeiro uma sementeira registada no separador Sementeiras.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p_data.value))return alert("Indique a data da plantação.");
  if(seed.op.data && p_data.value<seed.op.data)return alert("A data da plantação não pode ser anterior à data da sementeira.");
  const q=Number(p_quantidade.value);
  if(!Number.isSafeInteger(q)||q<=0)return alert("Indique a quantidade de plantas como número inteiro positivo.");
  const files=[...p_fotos.files];if(files.length>2)return alert("Máximo 2 fotografias.");
  const original=p_edit?sp_todasPlantacoes().find(x=>String(x.op.id)===p_edit.opId&&String(x.c.id)===p_edit.cId):null;
  if(p_edit&&!original)return alert("A plantação em edição não existe.");
  // Registos antigos podem ser ligados a qualquer sementeira válida da MESMA cultura.
  if(p_edit&&String(original.c.id)!==String(seed.c.id))return alert("Na edição, escolha uma sementeira da mesma cultura da plantação.");
  const id=original?.op.id||gerarID();let fotos=original?[...p_fotoRefs]:[];
  const newRefs=[];
  p_busy=true;document.getElementById("p_guardarBtn").disabled=true;
  try{
    if(files.length){
      fotos=[];
      for(let i=0;i<files.length;i++){
        const ref=await storePhoto("campo",id,i,files[i]);fotos.push(ref);newRefs.push(ref);
      }
    }
  }catch(e){
    for(const ref of newRefs)await removePhotoFile(ref);
    p_busy=false;document.getElementById("p_guardarBtn").disabled=false;
    return alert("Falha ao guardar fotografias: "+(e?.message||e));
  }
  const novo={id,tipo:"Plantação",data:p_data.value,qtd:`${q} plantas`,parcelas:sp_escolhidas(p_parcelas),
    meses:[],obs:[norm(p_obsSug.value),norm(p_obs.value)].filter(Boolean).join(" — "),fotos,sementeiraId:seed.op.id};
  if(original){
    const old=[...(original.op.fotos||[])];Object.assign(original.op,novo);
    removerFotosObsoletasDepoisDeGuardar(old,novo.fotos).catch(console.warn);
  }else{
    seed.c.ops=seed.c.ops||[];seed.c.ops.unshift(novo);
  }
  markDirty();autosaveNowSoon();p_limpar();s_refresh();c_atualizar();
  p_busy=false;document.getElementById("p_guardarBtn").disabled=false;
}
async function p_apagar(cId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(cId));
  const op=(c?.ops||[]).find(x=>String(x.id)===String(opId)&&x.tipo==="Plantação");
  if(!op)return;
  if(!confirm(`Apagar a plantação de ${sp_nome(c)} de ${fmtDatePT(op.data)}?`))return;
  c.ops=c.ops.filter(x=>x!==op);markDirty();autosaveNowSoon();p_refresh();s_refresh();c_atualizar();
  await removerFotosObsoletasDepoisDeGuardar(op.fotos||[],[]);
}

/* ===================== COLHEITAS — seleção múltipla, quantidades individuais ===================== */
const h_cultura=document.getElementById("h_cultura");
const h_data=document.getElementById("h_data");
const h_gramas=document.getElementById("h_gramas");
const h_obs=document.getElementById("h_obs");
const h_totalCultura=document.getElementById("h_totalCultura");
const h_totalGeral=document.getElementById("h_totalGeral");
const h_resumo=document.getElementById("h_resumo");
const h_totaisLista=document.getElementById("h_totaisLista");
const h_historico=document.getElementById("h_historico");
const h_pesquisa=document.getElementById("h_pesquisa");
const h_mes=document.getElementById("h_mes");
const h_totalFiltrado=document.getElementById("h_totalFiltrado");
const h_registosFiltrados=document.getElementById("h_registosFiltrados");
const h_quantidadeUnica=document.getElementById("h_quantidadeUnica");
const h_quantidadesMultiplas=document.getElementById("h_quantidadesMultiplas");
const h_estadoEdicao=document.getElementById("h_estadoEdicao");
const h_botaoGuardar=document.getElementById("h_botaoGuardar");
const h_botaoCancelar=document.getElementById("h_botaoCancelar");
let h_edicao=null; // {culturaId, opId}
let h_quantidadesBuffer={}; // preserva as quantidades digitadas ao alterar seleção

function h_dataLocalHoje(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
if(h_data && !h_data.value) h_data.value=h_dataLocalHoje();

// Aceita colheitas antigas em g/kg e os novos registos por cultura.
function h_gramasRegisto(op){
  if(!op || op.tipo!=="Colheita") return null;
  let valor=NaN, unidade="";
  if(hasText(op.qtd_val)){
    valor=Number(String(op.qtd_val).replace(",","."));
    unidade=String(op.qtd_unit||"kg").trim().toLowerCase();
  }else{
    const m=String(op.qtd||"").trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g)$/i);
    if(m){ valor=Number(m[1].replace(",",".")); unidade=m[2].toLowerCase(); }
  }
  if(!Number.isFinite(valor) || valor<0 || !["g","kg"].includes(unidade)) return null;
  return Math.round((unidade==="kg"?valor*1000:valor)*100)/100;
}
function h_totalGramas(c){
  return Math.round((c.ops||[]).reduce((sum,op)=>sum+(h_gramasRegisto(op)??0),0)*100)/100;
}
function h_formatarGramas(gramas){
  return new Intl.NumberFormat("pt-PT",{maximumFractionDigits:2}).format(gramas)+" g";
}
function h_nomeCultura(c){
  return `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?" / "+c.variedade:""}`;
}
function h_idsSelecionados(){
  return [...h_cultura.selectedOptions].map(o=>o.value);
}
function h_culturasSelecionadas(){
  const ids=new Set(h_idsSelecionados());
  return (data.culturas||[]).filter(c=>ids.has(String(c.id)));
}
function h_guardarValoresDigitados(){
  h_quantidadesMultiplas?.querySelectorAll("input[data-cultura]").forEach(input=>{
    h_quantidadesBuffer[input.dataset.cultura]=input.value;
  });
}
function h_atualizarInputs(){
  h_guardarValoresDigitados();
  const selecionadas=h_culturasSelecionadas();
  const multi=selecionadas.length>1;
  h_quantidadeUnica.classList.toggle("hidden",multi);
  h_quantidadesMultiplas.classList.toggle("hidden",!multi);
  h_quantidadesMultiplas.replaceChildren();
  if(!multi) return;
  for(const c of selecionadas){
    const wrap=document.createElement("div");
    wrap.style.margin="7px 0";
    const id="h_g_"+String(c.id).replace(/[^a-zA-Z0-9_-]/g,"_");
    const label=document.createElement("label");
    label.htmlFor=id;
    label.textContent=h_nomeCultura(c)+" — quantidade (g)";
    const input=document.createElement("input");
    input.type="number"; input.inputMode="decimal"; input.min="0.01";input.step="0.01";
    input.id=id;input.dataset.cultura=String(c.id);
    input.placeholder="ex.: 350";
    input.value=h_quantidadesBuffer[String(c.id)]||"";
    input.oninput=()=>{h_quantidadesBuffer[String(c.id)]=input.value;};
    wrap.append(label,input);
    h_quantidadesMultiplas.appendChild(wrap);
  }
}
function h_refreshCulturas(){
  if(!h_cultura) return;
  const previously=h_idsSelecionados();
  h_cultura.replaceChildren();
  (data.culturas||[]).forEach(c=>{
    const o=new Option(h_nomeCultura(c),String(c.id));
    o.selected=previously.includes(String(c.id));
    h_cultura.appendChild(o);
  });
  if(!previously.length && h_cultura.options.length) h_cultura.options[0].selected=true;
  h_atualizar();
}
function h_atualizar(){
  if(!h_cultura) return;
  const atuais=Array.isArray(data.culturas)?data.culturas:[];
  const selecionadas=h_culturasSelecionadas();
  h_atualizarInputs();
  const totalSel=selecionadas.reduce((s,c)=>s+h_totalGramas(c),0);
  h_totalCultura.textContent=h_formatarGramas(totalSel);
  h_totalGeral.textContent=h_formatarGramas(atuais.reduce((s,c)=>s+h_totalGramas(c),0));
  const totalRegistos=atuais.reduce((sum,c)=>sum+(c.ops||[]).filter(o=>o.tipo==="Colheita").length,0);
  h_resumo.textContent=`${selecionadas.length} cultura(s) selecionada(s) • ${totalRegistos} registo(s) de colheita. Quantidades sem unidade identificada não entram nos totais.`;
  h_totaisLista.replaceChildren();
  for(const c of atuais){
    const row=document.createElement("div");
    row.className="item";
    row.style.display="flex";row.style.justifyContent="space-between";row.style.gap="8px";
    const label=document.createElement("span");
    label.textContent=h_nomeCultura(c);
    const value=document.createElement("b");
    value.textContent=h_formatarGramas(h_totalGramas(c));
    row.append(label,value);
    row.onclick=()=>{
      [...h_cultura.options].forEach(o=>o.selected=o.value===String(c.id));
      h_atualizar();
    };
    h_totaisLista.appendChild(row);
  }
  h_historico.replaceChildren();
  if(!atuais.length){
    h_historico.textContent="Ainda não há culturas criadas. Crie uma cultura no separador Caderno de Campo.";
    return;
  }
  const pesquisa=qc_normalizarPesquisa(h_pesquisa?.value||"");
  const mes=String(h_mes?.value||"");
  const filtrosAtivos=!!(pesquisa||mes);
  // Com filtro por nome ou mês, consulta TODAS as culturas. Sem filtros mantém
  // a seleção múltipla habitual para registar e consultar colheitas.
  if(!filtrosAtivos && !selecionadas.length){
    h_historico.textContent="Selecione uma ou várias culturas para consultar as colheitas.";
    if(h_totalFiltrado)h_totalFiltrado.textContent="0 g";
    if(h_registosFiltrados)h_registosFiltrados.textContent="0 colheitas";
    return;
  }
  const registos=[];
  for(const c of (filtrosAtivos?atuais:selecionadas)){
    const nome=qc_normalizarPesquisa(h_nomeCultura(c));
    if(pesquisa&&!nome.includes(pesquisa))continue;
    for(const op of (c.ops||[])){
      if(op.tipo!=="Colheita")continue;
      if(mes&&String(op.data||"").slice(0,7)!==mes)continue;
      registos.push({c,op});
    }
  }
  registos.sort((a,b)=>String(b.op.data||"").localeCompare(String(a.op.data||"")));
  const totalFiltrado=registos.reduce((s,x)=>s+(h_gramasRegisto(x.op)||0),0);
  if(h_totalFiltrado)h_totalFiltrado.textContent=h_formatarGramas(totalFiltrado);
  if(h_registosFiltrados)h_registosFiltrados.textContent=`${registos.length} colheita(s) encontradas`;
  if(!registos.length){
    h_historico.textContent="Nenhuma colheita corresponde aos filtros indicados.";
    return;
  }
  const gruposMes=new Map();
  for(const {c,op} of registos){
    const row=document.createElement("div");
    row.className="item";
    const titulo=document.createElement("b");
    titulo.textContent=h_nomeCultura(c);
    const info=document.createElement("div");
    const peso=h_gramasRegisto(op);
    info.textContent=`${fmtDatePT(op.data)||"—"} — ${peso!==null?h_formatarGramas(peso):(op.qtd||"Quantidade sem unidade")} ${peso===null?"(não somada)":""}`;
    const obs=document.createElement("div");obs.className="small";obs.textContent=op.obs||"";
    const actions=document.createElement("div");actions.className="row";actions.style.marginTop="7px";
    const editar=document.createElement("button");
    editar.className="sec";editar.textContent="✏️ Editar";
    editar.onclick=()=>h_editarColheita(c.id,op.id);
    const apagar=document.createElement("button");
    apagar.className="warn";apagar.textContent="🗑️ Apagar";
    apagar.onclick=()=>h_apagarColheita(c.id,op.id);
    actions.append(editar,apagar);
    row.append(titulo,info);
    if(op.obs) row.append(obs);
    row.append(actions);
    qc_grupoMes(h_historico,op.data,gruposMes).appendChild(row);
  }
}
function h_limparFiltros(){
  if(h_pesquisa)h_pesquisa.value="";
  if(h_mes)h_mes.value="";
  h_atualizar();
}
function h_cancelarEdicao(){
  h_edicao=null;
  h_estadoEdicao.textContent="";
  h_botaoGuardar.textContent="➕ Somar colheita";
  h_botaoCancelar.classList.add("hidden");
  h_gramas.value="";
  h_quantidadesBuffer={};
  h_atualizar();
}
function h_editarColheita(culturaId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(culturaId));
  const op=(c?.ops||[]).find(o=>String(o.id)===String(opId)&&o.tipo==="Colheita");
  if(!c || !op) return alert("Colheita não encontrada.");
  h_edicao={culturaId:String(c.id),opId:String(op.id)};
  [...h_cultura.options].forEach(o=>o.selected=o.value===String(c.id));
  h_data.value=op.data||h_dataLocalHoje();
  const peso=h_gramasRegisto(op);
  h_gramas.value=peso===null?"":String(peso);
  h_obs.value=op.obs||"";
  h_estadoEdicao.textContent=`✏️ A editar colheita de ${h_nomeCultura(c)}. Guardar substitui a quantidade anterior; não soma novamente.`;
  h_botaoGuardar.textContent="💾 Guardar edição";
  h_botaoCancelar.classList.remove("hidden");
  h_atualizar();
  document.getElementById("view_colheitas")?.scrollIntoView({block:"start",behavior:"smooth"});
}
async function h_apagarColheita(culturaId,opId){
  const c=(data.culturas||[]).find(x=>String(x.id)===String(culturaId));
  const op=(c?.ops||[]).find(o=>String(o.id)===String(opId)&&o.tipo==="Colheita");
  if(!c || !op) return alert("Colheita não encontrada.");
  if(!confirm(`Apagar a colheita de ${h_nomeCultura(c)} (${fmtDatePT(op.data)})?`)) return;
  c.ops=c.ops.filter(x=>x!==op);
  if(h_edicao?.opId===String(opId)) h_cancelarEdicao();
  markDirty();
  autosaveNowSoon();
  h_atualizar();
  c_atualizar();
  if((op.fotos||[]).length) await removerFotosObsoletasDepoisDeGuardar(op.fotos,[]);
}
function h_guardar(){
  const selecionadas=h_culturasSelecionadas();
  if(!selecionadas.length) return alert("Selecione pelo menos uma cultura criada no Caderno de Campo.");
  if(!h_data.value || !/^\d{4}-\d{2}-\d{2}$/.test(h_data.value)) return alert("Indique uma data válida.");
  const quantidades=[];
  if(h_edicao){
    if(selecionadas.length!==1 || String(selecionadas[0].id)!==h_edicao.culturaId)
      return alert("Para editar, selecione apenas a cultura associada ao registo.");
  }
  if(selecionadas.length===1){
    quantidades.push({c:selecionadas[0],valor:h_gramas.value});
  }else{
    h_guardarValoresDigitados();
    for(const c of selecionadas) quantidades.push({c,valor:h_quantidadesBuffer[String(c.id)]||""});
  }
  for(const it of quantidades){
    if(String(it.valor).trim()==="") return alert(`Indique a quantidade para ${h_nomeCultura(it.c)}.`);
    const n=Number(it.valor);
    if(!Number.isFinite(n) || n<=0 || Math.round(n*100)/100<=0)
      return alert(`A quantidade de ${h_nomeCultura(it.c)} deve ser positiva.`);
  }
  const obs=norm(h_obs.value);
  for(const it of quantidades){
    const gramas=Math.round(Number(it.valor)*100)/100;
    if(h_edicao){
      const op=(it.c.ops||[]).find(o=>String(o.id)===h_edicao.opId&&o.tipo==="Colheita");
      if(!op) return alert("O registo em edição já não existe.");
      Object.assign(op,{data:h_data.value,qtd:`${gramas} g`,qtd_val:gramas,qtd_unit:"g",obs});
    }else{
      const op={id:gerarID(),tipo:"Colheita",parcelas:[],meses:[],data:h_data.value,
        qtd:`${gramas} g`,qtd_val:gramas,qtd_unit:"g",obs,fotos:[]};
      if(!Array.isArray(it.c.ops)) it.c.ops=[];
      it.c.ops.unshift(op);
    }
  }
  markDirty();
  autosaveNowSoon();
  h_edicao=null;h_estadoEdicao.textContent="";
  h_botaoGuardar.textContent="➕ Somar colheita";
  h_botaoCancelar.classList.add("hidden");
  h_gramas.value="";
  h_obs.value="";
  h_quantidadesBuffer={};
  h_atualizar();
  c_atualizar();
}

/* ===================== FITO ===================== */
const f_culturaSel=document.getElementById("f_culturaSel");
const f_tipoInt=document.getElementById("f_tipoInt");
const f_tipoProd=document.getElementById("f_tipoProd");
const f_produto=document.getElementById("f_produto");
const f_local=document.getElementById("f_local");
const f_parcelasSel=document.getElementById("f_parcelasSel");
const f_dataOp=document.getElementById("f_dataOp");
const f_dose=document.getElementById("f_dose");
const f_modo=document.getElementById("f_modo");
const f_motivo=document.getElementById("f_motivo");
const f_obs=document.getElementById("f_obs");
const f_fotoInput=document.getElementById("f_fotoInput");
const f_fotosEdicao=document.getElementById("f_fotosEdicao");
const f_estadoEdicao=document.getElementById("f_estadoEdicao");
const f_lista=document.getElementById("f_lista");

let f_editId=null;
let f_fotosBuffer=[]; // refs atuais em edição (paths ou dataURL)
let f_checks=new Set();

function refreshCulturasSelects(){
  // Fitofarmacêuticos
  f_culturaSel.replaceChildren();
  data.culturas.forEach((c,i)=>{
    const nome = `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
    const opt=new Option(nome, c.id);
    f_culturaSel.appendChild(opt);
  });

  // Operações & Tarefas (opcional)
  o_culturaSel.replaceChildren();
  o_culturaSel.appendChild(new Option("—", ""));
  data.culturas.forEach((c,i)=>{
    const nome = `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
    const opt=new Option(nome, c.id);
    o_culturaSel.appendChild(opt);
  });

  // Notas
  try{ n_refreshCulturasSelect(); }catch(_e){}
}

function f_limparSelecao(){ [...f_culturaSel.options].forEach(o=>o.selected=false); }
function f_resetar(){ if(!confirm("Apagar todos os tratamentos?")) return; data.tratamentos.forEach(t=> (t.fotos||[]).forEach(ref=>removePhotoFile(ref))); data.tratamentos=[]; f_checks.clear(); f_editId=null; f_fotosBuffer=[]; f_renderFotos(); f_estadoEdicao.textContent=""; markDirty(); f_atualizar(); }

function f_renderFotos(){
  f_fotosEdicao.replaceChildren();
  if(!f_fotosBuffer.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem fotos neste tratamento.";
    f_fotosEdicao.appendChild(d);
    return;
  }
  f_fotosBuffer.forEach((ref, idx)=>{
    const wrap=document.createElement("span"); wrap.className="imgwrap";
    const img=document.createElement("img"); img.className="thumb";
    (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
    img.onclick=async()=>{ const url=await loadPhotoUrl(ref); if(url) openModal(url); };
    const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
    del.onclick=async(e)=>{
      e.stopPropagation();
      if(!confirm("Remover esta foto (não guarda até gravar)?")) return;
      // Remoção pendente: não apaga o ficheiro enquanto a edição não for guardada.
      f_fotosBuffer.splice(idx,1);
      f_renderFotos();
    };
    wrap.appendChild(img); wrap.appendChild(del);
    f_fotosEdicao.appendChild(wrap);
  });
}

function f_limparForm(){
  f_tipoInt.value="Prevenção";

  // Tipo produto (multi)
  if(f_tipoProd){
    [...f_tipoProd.options].forEach(o=>o.selected=false);
    const def = [...f_tipoProd.options].find(o=>o.value==="Calda bordalesa") || f_tipoProd.options[0];
    if(def) def.selected=true;
  }

  f_produto.value="";
  if(f_parcelasSel) [...f_parcelasSel.options].forEach(o=>o.selected=false);

  f_dataOp.value="";
  f_dose.value="";
  f_modo.value="Pulverização";

  // Motivo (multi)
  if(f_motivo){
    [...f_motivo.options].forEach(o=>o.selected=false);
    const def = [...f_motivo.options].find(o=>o.value==="Míldio") || f_motivo.options[0];
    if(def) def.selected=true;
  }

  f_obs.value="";
  f_fotoInput.value="";
  f_editId=null;
  f_fotosBuffer=[];
  f_renderFotos();
  cal_render();
  o_syncSubtipos();
  o_render();
  f_estadoEdicao.textContent="";
}

function f_getSelectedCulturaIds(){
  return [...f_culturaSel.selectedOptions].map(o=>String(o.value));
}

async function f_guardar(){
  const culturaIds = f_getSelectedCulturaIds();
  if(!culturaIds.length) return alert("Selecione pelo menos 1 cultura.");
  if(!f_dataOp.value) return alert("Indique a data.");

  const files=[...f_fotoInput.files||[]];
  if(files.length>2) return alert("Máximo 2 fotos.");

  const recordId = f_editId || gerarID();
  const antigasFotos = f_editId ? [...(data.tratamentos.find(x=>x.id===recordId)?.fotos||[])] : [];

  // Fotos (máx 2) — mantém as existentes se não escolher novas
  let fotosFinal=[];
  if(f_editId){
    if(files.length===0) fotosFinal=[...f_fotosBuffer];
    else {
      for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("fito", recordId, i, files[i]));
    }
  } else {
    for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("fito", recordId, i, files[i]));
  }

  const tipoInt = f_tipoInt.value || "Prevenção";
  const tipoProd = Array.from(f_tipoProd?.selectedOptions||[]).map(o=>o.value).filter(hasText);
  const motivo = Array.from(f_motivo?.selectedOptions||[]).map(o=>o.value).filter(hasText);
  const parcelas = Array.from(f_parcelasSel?.selectedOptions||[]).map(o=>o.value).filter(hasText);

  const t={
    id: recordId,
    culturaIds,
    tipoInt,
    tipo: tipoInt, // compat com dados antigos
    tipoProd,
    produto: norm(f_produto.value),
    parcelas,
    data: f_dataOp.value,
    dose: norm(f_dose.value),
    modo: f_modo.value,
    motivo,
    obs: String(f_obs.value||"").trim(),
    fotos: fotosFinal
  };

  if(f_editId){
    const alvo = data.tratamentos.find(x=>x.id===recordId);
    if(alvo) Object.assign(alvo, t);
  } else {
    data.tratamentos.unshift(t);
  }

  f_limparForm();
  markDirty();
  autosaveNowSoon();
  f_atualizar();
  await removerFotosObsoletasDepoisDeGuardar(antigasFotos, fotosFinal);
}

function f_findNomeCultura(id){
  const c = data.culturas.find(x=>String(x.id)===String(id));
  if(!c) return "(cultura removida)";
  return `${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
}

function f_editarSel(){
  if(!f_editId) return alert("Selecione um tratamento (clique na lista).");
  const t=data.tratamentos.find(x=>x.id===f_editId);
  if(!t) return alert("Tratamento não encontrado.");

  [...f_culturaSel.options].forEach(o=>o.selected=(t.culturaIds||[]).includes(String(o.value)));
  f_tipoInt.value = t.tipoInt || t.tipo || "Prevenção";

  const tpArr = Array.isArray(t.tipoProd) ? t.tipoProd :
    String(t.tipoProd||"").split(",").map(s=>s.trim()).filter(Boolean);
  [...f_tipoProd.options].forEach(o=>o.selected=tpArr.includes(o.value));

  f_produto.value = t.produto || "";

  const parcelasArr = Array.isArray(t.parcelas) ? t.parcelas :
    String(t.parcelas||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(f_parcelasSel) [...f_parcelasSel.options].forEach(o=>o.selected=parcelasArr.includes(o.value));

  f_dataOp.value = t.data || "";
  f_dose.value = t.dose || "";
  f_modo.value = t.modo || "Pulverização";

  const mvArr = Array.isArray(t.motivo) ? t.motivo :
    String(t.motivo||"").split(",").map(s=>s.trim()).filter(Boolean);
  [...f_motivo.options].forEach(o=>o.selected=mvArr.includes(o.value));

  f_obs.value = t.obs || "";
  f_fotoInput.value="";
  f_fotosBuffer=[...(t.fotos||[])];
  f_renderFotos();
  f_estadoEdicao.textContent="✏️ A editar: " + (t.produto||"tratamento");
}

function f_apagarSel(){
  // compatibilidade: mantém o botão antigo (se existir). Agora apaga a seleção (marcados ou selecionado).
  f_apagarSelecao();
}

function f_apagarSelecao(){
  const ids = f_checks.size ? Array.from(f_checks) : (f_editId ? [f_editId] : []);
  if(!ids.length) return alert("Selecione (ou marque) um tratamento.");
  if(!confirm(ids.length>1?`Apagar ${ids.length} tratamentos?`:"Apagar o tratamento selecionado?")) return;
  const delIds=new Set(ids);
  data.tratamentos.forEach(t=>{ if(delIds.has(t.id)) (t.fotos||[]).forEach(ref=>removePhotoFile(ref)); });
  data.tratamentos = data.tratamentos.filter(t=>!delIds.has(t.id));
  f_checks.clear();
  f_editId=null;
  f_fotosBuffer=[]; f_renderFotos(); f_estadoEdicao.textContent="";
  markDirty();
  f_atualizar();
}

function f_apagarSelecionados(){
  if(!f_checks.size) return alert("Nenhum marcado.");
  if(!confirm("Apagar todos os tratamentos marcados?")) return;
  const delIds=new Set(f_checks);
  data.tratamentos.forEach(t=>{ if(delIds.has(t.id)) (t.fotos||[]).forEach(ref=>removePhotoFile(ref)); });
  data.tratamentos = data.tratamentos.filter(t=>!delIds.has(t.id));
  f_checks.clear();
  f_editId=null;
  f_fotosBuffer=[]; f_renderFotos(); f_estadoEdicao.textContent="";
  markDirty();
  f_atualizar();
}

function f_atualizar(){
  f_lista.replaceChildren();
  const list=[...data.tratamentos].filter(t=>qc_mesCombina('f',t.data)&&qc_temTexto('f',
    (t.culturaIds||[]).map(id=>f_findNomeCultura(id)),t.produto,t.tipo,t.tipoProd,t.parcelas,t.local,t.motivo,t.obs,t.modo,t.dose))
    .sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));
  const gruposMes=new Map();
  if(!list.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem tratamentos ainda.";
    f_lista.appendChild(d);
    return;
  }

  list.forEach((t, idx)=>{
    const card=document.createElement("div");
    card.className="item"+(t.id===f_editId?" selected":"");

    const top=document.createElement("div");
    top.className="row";
    top.style.alignItems="center";

    const left=document.createElement("div");
    left.style.flex="3";

    const chk=document.createElement("input");
    chk.type="checkbox";
    chk.className="chk";
    chk.checked=f_checks.has(t.id);
    chk.onchange=(e)=>{ if(e.target.checked) f_checks.add(t.id); else f_checks.delete(t.id); };
    left.appendChild(chk);

    const b=document.createElement("b");
    const tipoInt = t.tipo || "Tratamento";
    const tp = Array.isArray(t.tipoProd) ? t.tipoProd.join(", ") : (t.tipoProd||"");
    const tipoProd = hasText(tp) ? ` (${tp})` : "";
    b.textContent = `${idx+1}. ${tipoInt}${tipoProd}`;
    left.appendChild(b);

    if(t.data) left.appendChild(document.createTextNode(` — data: ${fmtDatePT(t.data)}`));
    top.appendChild(left);

    const right=document.createElement("div");
    right.style.flex="2";
    right.style.display="flex";
    right.style.justifyContent="flex-end";
    right.style.gap="6px";

    const btnE=document.createElement("button");
    btnE.className="purp";
    btnE.textContent="Editar";
    btnE.onclick=(e)=>{ e.stopPropagation(); f_editId=t.id; f_editarSel(); };

    const btnD=document.createElement("button");
    btnD.className="warn";
    btnD.textContent="Apagar";
    btnD.onclick=(e)=>{ e.stopPropagation(); f_editId=t.id; f_apagarSel(); };

    right.appendChild(btnE); right.appendChild(btnD);
    top.appendChild(right);
    card.appendChild(top);

    const nomes=(t.culturaIds||[]).map(id=>f_findNomeCultura(id)).join("; ");
    const cult=document.createElement("div");
    cult.className="small";
    cult.textContent = "Culturas: " + (nomes||"—");
    card.appendChild(cult);

    const parts=[];
    if(hasText(t.produto)) parts.push("Produto: "+t.produto);
    const pr = Array.isArray(t.parcelas) ? t.parcelas.join(", ") : (t.parcelas||"");
    if(hasText(pr)) parts.push("Parcelas: "+pr);
    if(hasText(t.local)) parts.push("Local: "+t.local);
    if(hasText(t.dose)) parts.push("Dose: "+t.dose);
    if(hasText(t.modo)) parts.push("Modo: "+t.modo);
    const mv = Array.isArray(t.motivo) ? t.motivo.join(", ") : (t.motivo||"");
    if(hasText(mv)) parts.push("Motivo: "+mv);
    if(parts.length){
      const meta=document.createElement("div");
      meta.className="small";
      meta.textContent = parts.join(" • ");
      card.appendChild(meta);
    }

    if(hasText(t.obs)){
      const obs=document.createElement("div");
      appendMultiline(obs, t.obs);
      card.appendChild(obs);
    }

    if((t.fotos||[]).length){
      const fotosDiv=document.createElement("div");
      (t.fotos||[]).forEach((ref, i)=>{
        const wrap=document.createElement("span"); wrap.className="imgwrap";
        const img=document.createElement("img"); img.className="thumb";
        (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
        img.onclick=async(e)=>{e.stopPropagation(); const url=await loadPhotoUrl(ref); if(url) openModal(url); };
        const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
        del.onclick=async(e)=>{
          e.stopPropagation();
          if(!confirm("Remover esta foto do tratamento?")) return;
          t.fotos.splice(i,1);
          markDirty();
          f_atualizar();
          await removerFotosObsoletasDepoisDeGuardar([ref], t.fotos);
        };
        wrap.appendChild(img); wrap.appendChild(del);
        fotosDiv.appendChild(wrap);
      });
      card.appendChild(fotosDiv);
    }

    card.onclick=()=>{ f_editId=t.id; f_atualizar(); };
    qc_grupoMes(f_lista,t.data,gruposMes).appendChild(card);
  });
}

function f_buildPdfNode(){
  const wrap=document.createElement("div");
  wrap.style.fontFamily="Arial, sans-serif";
  const h2=document.createElement("h2");
  h2.style.textAlign="center";
  h2.style.color="#1b5e20";
  h2.textContent="Fitofarmacêuticos & Combate Natural — BIO";
  wrap.appendChild(h2);

  const list=[...data.tratamentos].sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));
  list.forEach((t, idx)=>{
    const block=document.createElement("div");
    block.style.border="1px solid #ddd";
    block.style.borderRadius="8px";
    block.style.padding="10px";
    block.style.margin="10px 0";

    const title=document.createElement("div");
    title.style.fontWeight="bold";
    title.textContent = `${idx+1}. ${t.tipo||"Tratamento"} — ${t.data||""}`;
    block.appendChild(title);

    const cult=document.createElement("div");
    cult.textContent="Culturas: " + ((t.culturaIds||[]).map(id=>f_findNomeCultura(id)).join("; ")||"—");
    block.appendChild(cult);

    const prod=document.createElement("div");
    prod.textContent="Produto: " + (t.produto||"—") + " | Tipo: " + (t.tipoProd||"—");
    block.appendChild(prod);

    const meta=document.createElement("div");
    const local = hasText(t.local) ? t.local : ((t.parcelas||[]).length?t.parcelas.join(", "):"—");
    meta.textContent="Local: " + local + " | Dose: " + (hasText(t.dose)?t.dose:"—");
    block.appendChild(meta);

    const obs=document.createElement("div");
    obs.textContent="Obs: " + (hasText(t.obs)?t.obs:"—");
    block.appendChild(obs);

    wrap.appendChild(block);
  });
  return wrap;
}

function f_exportarPDF(){
  const node=f_buildPdfNode();
  _printHtmlNode("fitofarm", node);
}



// Operações & Tarefas
const o_categoriaSel=document.getElementById("o_categoria");
const o_tipoSel=document.getElementById("o_tipo");
const o_data=document.getElementById("o_data");
const o_parcela=document.getElementById("o_parcela");
const o_culturaSel=document.getElementById("o_cultura");
const o_medida=document.getElementById("o_medida");
const o_metodo=document.getElementById("o_metodo");
const o_obs=document.getElementById("o_obs");
const o_fotoInput=document.getElementById("o_fotoInput");
const o_fotosEdicao=document.getElementById("o_fotosEdicao");
const o_estado=document.getElementById("o_estado");
const o_lista=document.getElementById("o_lista");
let o_editId=null;
let o_checks=new Set();
let o_fotosBuffer=[]; // refs atuais em edição (ops_tasks)


/* ===================== OPERAÇÕES & TAREFAS ===================== */
let OPS_TIPOS = {
  operacao: [
    "Retancha","Poda","Monda","Mobilização","Sacha","Trituração de resíduos",
    "Tutoramento","Desbaste","Rega","Outro"
  ],
  prot_fert: [
    "Fertilização (composto/estrume)","Fertilização foliar","Corretivo (calcário/gesso)",
    "Mulching","Cobertura vegetal","Monda térmica","Armadilhas","Largada de auxiliares",
    "Barreiras físicas","Outro"
  ]
};

function o_syncSubtipos(){
  let cat = o_categoriaSel.value || "operacao";
  if(cat==="solo" || cat==="protecao" || cat==="protecao_fert") cat="prot_fert";
  if(o_categoriaSel.value!==cat) o_categoriaSel.value=cat;

  const prevSel = new Set([...o_tipoSel.selectedOptions].map(o=>o.value));
  const arr = (data.config && data.config.opsTipos && data.config.opsTipos[cat]) ? data.config.opsTipos[cat] : (OPS_TIPOS[cat] || OPS_TIPOS.operacao);

  o_tipoSel.replaceChildren();
  arr.forEach(t=>{
    const opt = new Option(t,t);
    if(prevSel.has(t)) opt.selected = true;
    o_tipoSel.appendChild(opt);
  });
}

function o_renderFotosEdicao(){
  if(!o_fotosEdicao) return;
  o_fotosEdicao.replaceChildren();
  if(!o_fotosBuffer.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem fotos neste registo.";
    o_fotosEdicao.appendChild(d);
    return;
  }
  o_fotosBuffer.forEach((ref, idx)=>{
    const wrap=document.createElement("span"); wrap.className="imgwrap";
    const img=document.createElement("img"); img.className="thumb";
    (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
    img.onclick=async()=>{ const url=await loadPhotoUrl(ref); if(url) openModal(url); };
    const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
    del.onclick=async(e)=>{
      e.stopPropagation();
      if(!confirm("Remover esta foto (não guarda até gravar)?")) return;
      // Remoção pendente: não apaga o ficheiro enquanto a edição não for guardada.
      o_fotosBuffer.splice(idx,1);
      o_renderFotosEdicao();
    };
    wrap.appendChild(img); wrap.appendChild(del);
    o_fotosEdicao.appendChild(wrap);
  });
}

function o_limpar(){
  o_editId=null;
  o_categoriaSel.value="operacao";
  o_syncSubtipos();
  o_data.value="";
  [...o_parcela.options].forEach(o=>o.selected=false);
  [...o_culturaSel.options].forEach(o=>o.selected=false);
  o_medida.value="";
  o_metodo.value="";
  o_obs.value="";
  if(o_fotoInput) o_fotoInput.value="";
  o_fotosBuffer=[];
  o_renderFotosEdicao();
  o_estado.textContent="";
}

async function o_guardar(){
  if(!o_data.value) return alert("Indique a data.");
  const files=[...((o_fotoInput && o_fotoInput.files) ? o_fotoInput.files : [])];
  if(files.length>2) return alert("Máximo 2 fotos.");

  const recordId = o_editId || gerarID();
  const antigasFotos = o_editId ? [...(data.ops_tasks.find(x=>x.id===recordId)?.fotos||[])] : [];

  let fotosFinal=[];
  if(o_editId){
    if(files.length===0) fotosFinal=[...o_fotosBuffer];
    else {
      for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("ops", recordId, i, files[i]));
    }
  } else {
    for(let i=0;i<files.length;i++) fotosFinal.push(await storePhoto("ops", recordId, i, files[i]));
  }

  const item = {
    id: recordId,
    categoria: o_categoriaSel.value || "operacao",
    tipo: [...o_tipoSel.selectedOptions].map(o=>o.value).filter(Boolean),
    data: o_data.value,
    parcela: [...o_parcela.selectedOptions].map(o=>o.value).filter(Boolean),
    culturaId: [...o_culturaSel.selectedOptions].map(o=>o.value).filter(Boolean),
    medida: (o_medida.value||"").trim(),
    metodo: (o_metodo.value||"").trim(),
    obs: (o_obs.value||"").trim(),
    fotos: fotosFinal
  };

  // migrar categorias antigas (se vierem de importações)
  if(item.categoria==="solo" || item.categoria==="protecao" || item.categoria==="protecao_fert") item.categoria="prot_fert";

  if(o_editId){
    const idx = data.ops_tasks.findIndex(x=>x.id===o_editId);
    if(idx>=0) data.ops_tasks[idx]=item;
  } else {
    data.ops_tasks.unshift(item);
  }

  o_editId=null;
  o_checks.clear();
  markDirty();
  autosaveNowSoon();
  o_render();
  o_limpar();
  await removerFotosObsoletasDepoisDeGuardar(antigasFotos, fotosFinal);
}

async function o_apagarSelecionados(){
  if(!o_checks.size) return alert("Nenhum registo marcado.");
  if(!confirm("Apagar os registos marcados?")) return;

  const delIds = new Set(o_checks);
  for(const it of (data.ops_tasks||[])){
    if(delIds.has(it.id)){
      for(const ref of (it.fotos||[])) await removePhotoFile(ref);
    }
  }
  data.ops_tasks = (data.ops_tasks||[]).filter(x=>!delIds.has(x.id));
  o_checks.clear();
  markDirty();
  o_render();
}

function o_findCulturaName(id){
  if(!id) return "";
  const idx = data.culturas.findIndex(c=>String(c.id)===String(id));
  if(idx<0) return "";
  const c=data.culturas[idx];
  return `${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
}

function o_render(){
  if(!o_lista) return;

  // garantir tipos no dropdown
  if(!o_tipoSel.options.length) o_syncSubtipos();

  o_lista.replaceChildren();
  const items = (Array.isArray(data.ops_tasks) ? [...data.ops_tasks] : []).filter(it=>{
    const cids=Array.isArray(it.culturaId)?it.culturaId:(it.culturaId?[it.culturaId]:[]);
    return qc_mesCombina('o',it.data)&&qc_temTexto('o',cids.map(id=>o_findCulturaName(id)),
      it.tipo,it.parcela,it.parcelas,it.obs,it.metodo,it.medida,it.categoria);
  });
  const gruposMes=new Map();
  items.sort((a,b)=> String(b.data||"").localeCompare(String(a.data||"")));

  if(!items.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Sem registos ainda.";
    o_lista.appendChild(d);
    return;
  }

  const wrap=document.createElement("div");
  wrap.className="list";

  const catsLbl = {
    operacao:"Operações culturais",
    prot_fert:"Medidas de proteção e fertilização",
    solo:"Medidas de proteção e fertilização",
    protecao:"Medidas de proteção e fertilização"
  };

  items.forEach((it,i)=>{
    // migração em memória (para dados antigos)
    let cat = it.categoria || "operacao";
    if(cat==="solo" || cat==="protecao" || cat==="protecao_fert") cat="prot_fert";
    it.categoria = cat;

    const row=document.createElement("div");
    row.className="item";

    const head=document.createElement("div");
    head.className="row";
    head.style.alignItems="center";
    head.style.justifyContent="space-between";

    const left=document.createElement("div");
    left.style.flex="1";
    left.style.minWidth="240px";

    const chk=document.createElement("input");
    chk.type="checkbox";
    chk.className="chk";
    chk.checked=o_checks.has(it.id);
    chk.onchange=(e)=>{
      if(e.target.checked) o_checks.add(it.id);
      else o_checks.delete(it.id);
    };
    left.appendChild(chk);

    const title=document.createElement("span");
    const b=document.createElement("b");
    const tipoTxt = Array.isArray(it.tipo) ? it.tipo.join(", ") : (it.tipo || "");
    b.textContent = `${i+1}. ${tipoTxt}`;
    title.appendChild(b);
    if(it.data) title.appendChild(document.createTextNode(` — data: ${fmtDatePT(it.data)}`));
    left.appendChild(title);

    const right=document.createElement("div");
    right.style.display="flex";
    right.style.gap="8px";

    const btnE=document.createElement("button");
    btnE.className="purp";
    btnE.textContent="Editar";
    btnE.onclick=(e)=>{e.stopPropagation(); o_carregarEditar(it.id);};

    const btnD=document.createElement("button");
    btnD.className="warn";
    btnD.textContent="Apagar";
    btnD.onclick=(e)=>{e.stopPropagation(); o_checks=new Set([it.id]); o_apagarSelecionados();};

    right.appendChild(btnE);
    right.appendChild(btnD);

    head.appendChild(left);
    head.appendChild(right);
    row.appendChild(head);

    // legenda completa
    const parts1=[];
    parts1.push("Categoria: " + (catsLbl[it.categoria] || it.categoria || "—"));
    const parcTxt = Array.isArray(it.parcela) ? it.parcela.join(", ") : it.parcela;
    if(parcTxt) parts1.push("Parcela: " + parcTxt);
    const cultIds = Array.isArray(it.culturaId) ? it.culturaId : (it.culturaId ? [it.culturaId] : []);
    const cultNames = cultIds.map(id=>o_findCulturaName(id)).filter(Boolean);
    if(cultNames.length) parts1.push("Cultura: " + cultNames.join(", "));
    if(parts1.length){
      const meta=document.createElement("div");
      meta.className="small";
      meta.textContent = parts1.join(" • ");
      row.appendChild(meta);
    }

    const parts2=[];
    if(it.medida) parts2.push("Medida: "+it.medida);
    if(it.metodo) parts2.push("Método: "+it.metodo);
    if(parts2.length){
      const d=document.createElement("div");
      d.className="small";
      d.textContent = parts2.join(" • ");
      row.appendChild(d);
    }

    if(it.obs){
      const d=document.createElement("div");
      appendMultiline(d, it.obs);
      row.appendChild(d);
    }

    if((it.fotos||[]).length){
      const fotosDiv=document.createElement("div");
      (it.fotos||[]).forEach((ref,idx)=>{
        const wrapImg=document.createElement("span"); wrapImg.className="imgwrap";
        const img=document.createElement("img"); img.className="thumb";
        (async()=>{ const url=await loadPhotoUrl(ref); if(url) img.src=url; else img.title="Foto não encontrada"; })();
        img.onclick=async(e)=>{e.stopPropagation(); const url=await loadPhotoUrl(ref); if(url) openModal(url);};
        const del=document.createElement("span"); del.className="delimg"; del.textContent="×";
        del.onclick=async(e)=>{
          e.stopPropagation();
          if(!confirm("Remover esta foto do registo?")) return;
          it.fotos.splice(idx,1);
          markDirty();
          o_render();
          await removerFotosObsoletasDepoisDeGuardar([ref], it.fotos);
        };
        wrapImg.appendChild(img); wrapImg.appendChild(del);
        fotosDiv.appendChild(wrapImg);
      });
      row.appendChild(fotosDiv);
    }

    qc_grupoMes(wrap,it.data,gruposMes).appendChild(row);
  });

  o_lista.appendChild(wrap);
}

function o_carregarEditar(id){
  const it = data.ops_tasks.find(x=>x.id===id);
  if(!it) return;
  o_editId=id;
  {
    let cat = it.categoria || "operacao";
    if(cat==="solo" || cat==="protecao" || cat==="protecao_fert") cat="prot_fert";
    o_categoriaSel.value=cat;
  }
  o_syncSubtipos();
  const tipoArr = Array.isArray(it.tipo) ? it.tipo : String(it.tipo||"").split(",").map(s=>s.trim()).filter(Boolean);
  [...o_tipoSel.options].forEach(o=>o.selected=tipoArr.includes(o.value));
  o_data.value=it.data||"";
  const parArr = Array.isArray(it.parcela) ? it.parcela : String(it.parcela||"").split(",").map(s=>s.trim()).filter(Boolean);
  [...o_parcela.options].forEach(o=>o.selected=parArr.includes(o.value));
  const cultArr = Array.isArray(it.culturaId) ? it.culturaId : String(it.culturaId||"").split(",").map(s=>s.trim()).filter(Boolean);
  [...o_culturaSel.options].forEach(o=>o.selected=cultArr.includes(o.value));
  o_medida.value=it.medida||"";
  o_metodo.value=it.metodo||"";
  o_obs.value=it.obs||"";
  if(o_fotoInput) o_fotoInput.value="";
  o_fotosBuffer=[...(it.fotos||[])];
  o_renderFotosEdicao();
  o_estado.textContent="✏️ A editar registo (guardar para aplicar alterações).";
  showTab("ops");
}

/* ===================== CALENDÁRIO (.ics) ===================== */
const cal_icsInput = document.getElementById("cal_icsInput");
const cal_status = document.getElementById("cal_status");
const cal_list = document.getElementById("cal_list");

function cal_setStatus(msg){ if(cal_status) cal_status.textContent = msg || ""; }

function icsUnfold(text){
  const raw = String(text||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  const out=[];
  for(const line of raw){
    if(!line) { out.push(""); continue; }
    if((line.startsWith(" ") || line.startsWith("\t")) && out.length){
      out[out.length-1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function parseIcsDate(val){
  const s=String(val||"").trim();
  if(!s) return null;
  if(/^\d{8}$/.test(s)){
    const y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8);
    return new Date(y, m-1, d);
  }
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if(m){
    const y=+m[1], mo=+m[2], d=+m[3], hh=+m[4], mm=+m[5], ss=+m[6];
    if(m[7]) return new Date(Date.UTC(y, mo-1, d, hh, mm, ss));
    return new Date(y, mo-1, d, hh, mm, ss);
  }
  return null;
}

function fmtDate(dt, raw){
  if(!(dt instanceof Date) || isNaN(dt)) return raw || "—";
  const pad=n=>String(n).padStart(2,"0");
  const d = pad(dt.getDate())+"/"+pad(dt.getMonth()+1)+"/"+dt.getFullYear();
  const t = (dt.getHours()||dt.getMinutes()||dt.getSeconds()) ? (" "+pad(dt.getHours())+":"+pad(dt.getMinutes())) : "";
  return d+t;
}

function parseICS(text){
  const unfolded = icsUnfold(text);
  const lines = unfolded.split("\n");
  const events=[];
  let cur=null;

  for(const line of lines){
    const ln = line.trimEnd();
    if(ln==="BEGIN:VEVENT"){ cur={}; continue; }
    if(ln==="END:VEVENT"){
      if(cur){
        const start = parseIcsDate(cur.DTSTART_raw);
        const end = parseIcsDate(cur.DTEND_raw);
        events.push({
          start, end,
          startRaw: cur.DTSTART_raw||"",
          endRaw: cur.DTEND_raw||"",
          summary: cur.SUMMARY||"",
          location: cur.LOCATION||"",
          description: cur.DESCRIPTION||""
        });
      }
      cur=null;
      continue;
    }
    if(!cur) continue;
    const idx = ln.indexOf(":");
    if(idx<0) continue;
    const left = ln.slice(0,idx);
    const value = ln.slice(idx+1);
    const key = left.split(";")[0].toUpperCase();
    if(key==="DTSTART") cur.DTSTART_raw=value;
    else if(key==="DTEND") cur.DTEND_raw=value;
    else if(key==="SUMMARY") cur.SUMMARY=value;
    else if(key==="LOCATION") cur.LOCATION=value;
    else if(key==="DESCRIPTION") cur.DESCRIPTION=value.replace(/\\n/g,"\n");
  }

  events.sort((a,b)=>{
    const ta = a.start ? a.start.getTime() : 0;
    const tb = b.start ? b.start.getTime() : 0;
    return ta - tb;
  });
  return events;
}

async function cal_getText(){
  if(!data.calendar) return null;
  if(data.calendar.inline) return data.calendar.inline;
  if(data.calendar.ref && projectDirHandle){
    try{
      const fh = await getFileHandleFromRef(data.calendar.ref);
      const f = await fh.getFile();
      return await f.text();
    }catch(e){ console.warn(e); return null; }
  }
  return null;
}

async function cal_render(){
  if(!cal_list) return;
  cal_list.replaceChildren();

  if(!data.calendar){
    cal_setStatus("Sem calendário importado.");
    return;
  }
  const txt = await cal_getText();
  if(!txt){
    cal_setStatus("Calendário referenciado mas não foi possível ler o ficheiro.");
    return;
  }

  const events = parseICS(txt);
  cal_setStatus(`${data.calendar.name||"calendário.ics"} • ${events.length} evento(s)`);

  if(!events.length){
    const d=document.createElement("div");
    d.className="small";
    d.textContent="Nenhum evento encontrado.";
    cal_list.appendChild(d);
    return;
  }

  const groups=new Map();
  for(const ev of events){
    const dt = ev.start;
    const key = (dt instanceof Date && !isNaN(dt)) ? (dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")) : "sem_data";
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  const keys=[...groups.keys()].sort();
  keys.forEach(k=>{
    const title=document.createElement("div");
    title.style.fontWeight="bold";
    title.style.margin="10px 0 6px";
    if(k==="sem_data") title.textContent="Sem data";
    else {
      const [y,m]=k.split("-");
      const nomes=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      title.textContent = `${nomes[Number(m)-1]} ${y}`;
    }
    cal_list.appendChild(title);

    const box=document.createElement("div");
    box.className="list";
    groups.get(k).forEach(ev=>{
      const item=document.createElement("div");
      item.className="item";
      const line1=document.createElement("div");
      const b=document.createElement("b");
      b.textContent = ev.summary || "(sem título)";
      line1.appendChild(b);
      item.appendChild(line1);

      const line2=document.createElement("div");
      line2.className="small";
      line2.textContent = `Início: ${fmtDate(ev.start, ev.startRaw)}${ev.endRaw?(" • Fim: "+fmtDate(ev.end, ev.endRaw)):""}`;
      item.appendChild(line2);

      if(ev.location){
        const l=document.createElement("div");
        l.className="small";
        l.textContent = "Local: "+ev.location;
        item.appendChild(l);
      }
      if(ev.description){
        const d=document.createElement("div");
        d.className="small";
        appendMultiline(d, ev.description);
        item.appendChild(d);
      }
      box.appendChild(item);
    });
    cal_list.appendChild(box);
  });
}

async function cal_import(){
  const file = cal_icsInput && cal_icsInput.files && cal_icsInput.files[0];
  if(!file) return alert("Escolha um ficheiro .ics.");
  const nameRaw = file.name || "calendario.ics";
  const safeName = nameRaw.replace(/[^a-zA-Z0-9._-]+/g,"_");
  const text = await file.text();

  if(projectDirHandle && window.showDirectoryPicker){
    const ok = await ensurePermission(projectDirHandle,"readwrite");
    if(!ok) return alert("Sem permissão para guardar na pasta.");
    const calDir = await ensureDir(projectDirHandle, ["calendar"]);
    const fh = await calDir.getFileHandle(safeName, {create:true});
    const w = await fh.createWritable();
    await w.write(new Blob([text], {type:"text/calendar"}));
    await w.close();
    data.calendar = {name: safeName, ref: `calendar/${safeName}`, inline: null};
  } else {
    data.calendar = {name: safeName, ref: null, inline: text};
  }

  if(cal_icsInput) cal_icsInput.value="";
  markDirty();
  await cal_render();
  await calm_render();
  alert("Calendário importado.");
}

async function cal_export(){
  if(!data.calendar) return alert("Sem calendário para exportar.");
  const txt = await cal_getText();
  if(!txt) return alert("Não foi possível obter o conteúdo do calendário.");
  const name = data.calendar.name || "calendario.ics";
  const blob = new Blob([txt], {type:"text/calendar"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

async function cal_clear(){
  if(!data.calendar) return;
  if(!confirm("Remover o calendário da app? (não apaga o ficheiro da pasta)")) return;
  data.calendar=null;
  markDirty();
  await cal_render();
  await calm_render();
}


/* ===================== ROTAÇÃO DE CULTURAS (v1.0.30) ===================== */
// Histórico automático a partir das operações existentes + registos anuais manuais.
// A recomendação é indicativa: a família botânica, o solo, a sanidade e o clima prevalecem.
const rot_parcela = document.getElementById('rot_parcela');
const rot_ano = document.getElementById('rot_ano');
const rot_mesPlano = document.getElementById('rot_mesPlano');
const rot_resumo = document.getElementById('rot_resumo');
const rot_sugestoes = document.getElementById('rot_sugestoes');
const rot_historico = document.getElementById('rot_historico');
const rot_anoMapa = document.getElementById('rot_anoMapa');
const rot_mapaAnual = document.getElementById('rot_mapaAnual');
const rot_anoManual = document.getElementById('rot_anoManual');
const rot_parcelaManual = document.getElementById('rot_parcelaManual');
const rot_familia = document.getElementById('rot_familia');
const rot_especie = document.getElementById('rot_especie');
const rot_variedade = document.getElementById('rot_variedade');
const rot_obs = document.getElementById('rot_obs');
const rot_estadoEdicao = document.getElementById('rot_estadoEdicao');
let rot_edicaoId = null;
// A escolha é feita POR FAMÍLIAS e histórico de fitossanidade/solo, nunca por uma sequência fixa.
// Apenas famílias hortícolas anuais/tipicamente usadas em rotação são candidatas.
const ROT_PERFIS={
  brassicaceae:{nome:'Brássicas',exigencia:'alta',descricao:'Couve, brócolo, nabo e rúcula; vigiar doenças próprias das crucíferas.'},
  fabaceae:{nome:'Leguminosas',exigencia:'baixa',descricao:'Feijão, ervilha e fava; a fixação de azoto depende de nodulação e manejo dos resíduos.'},
  solanaceae:{nome:'Solanáceas',exigencia:'alta',descricao:'Tomate, pimento e batata; vigiar doenças do solo e alternar famílias.'},
  cucurbitaceae:{nome:'Cucurbitáceas',exigencia:'alta',descricao:'Pepino, curgete e abóbora; avaliar fertilidade e pressão de míldio/oídio.'},
  asteraceae:{nome:'Asteráceas',exigencia:'media',descricao:'Alface e outras folhosas; útil para diversificar famílias.'},
  apiaceae:{nome:'Apiáceas',exigencia:'media',descricao:'Cenoura, aipo, funcho e salsa; controlar drenagem e estrutura do solo.'},
  amaranthaceae:{nome:'Amarantáceas',exigencia:'media',descricao:'Beterraba, acelga e espinafre; rotação independente das brássicas.'},
  allium:{nome:'Alhos e cebolas',exigencia:'media',descricao:'Cebola, alho e alho-francês; considerar doenças da raiz.'},
  poaceae:{nome:'Gramíneas',exigencia:'media',descricao:'Milho e outras gramíneas; diversificam a rotação botânica.'}
};
const ROT_HORTICOLAS={
  brassicaceae:['Brócolo','Couve','Couve-flor','Couve-rábano','Repolho','Nabiça','Nabo','Rabanete','Rúcula','Mostardas','Verduras Asiáticas','Pak-choi','Kale'],
  fabaceae:['Feijão','Ervilha','Fava','Chícharo','Tremocilha','Feijão-verde'],
  solanaceae:['Tomate','Batata','Pimento','Beringela','Pimenta picante'],
  cucurbitaceae:['Pepino','Curgete','Courgette','Abóbora','Melão','Melancia'],
  asteraceae:['Alface','Endívia','Chicória','Canónigos / alface-cordeiro'],
  apiaceae:['Cenoura','Aipo','Coentro','Funcho','Endro','Salsa','Pastinaca'],
  amaranthaceae:['Acelga','Espinafre','Beterraba'],
  allium:['Cebola','Alho','Alho-francês','Cebolinho'],
  poaceae:['Milho','Trigo','Aveia']
};
// Janela sazonal orientadora (mês do início do cultivo): requer confirmação para
// cada variedade e para cultivo sob cobertura nas condições oceânicas das Flores.
const ROT_EPOCAS={
  'tomate':[4,5,6,7,8], 'pimento':[4,5,6,7,8], 'beringela':[4,5,6,7,8],
  'pepino':[4,5,6,7,8,9], 'curgete':[4,5,6,7,8,9], 'courgette':[4,5,6,7,8,9],
  'abobora':[4,5,6,7,8,9], 'melao':[5,6,7,8], 'melancia':[5,6,7,8],
  'milho':[4,5,6,7,8], 'feijao':[4,5,6,7,8,9],
  'ervilha':[1,2,3,4,9,10,11,12], 'fava':[1,2,3,9,10,11,12],
  'batata':[2,3,4,5,9,10], 'couve':[1,2,3,4,5,9,10,11,12],
  'alface':[1,2,3,4,5,6,9,10,11,12], 'espinafre':[1,2,3,4,9,10,11,12],
  'nabo':[1,2,3,4,9,10,11,12], 'rabanete':[1,2,3,4,9,10,11,12]
};
function rot_textoKey(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function rot_mesAdequado(especie, mes, protegida){
  if(!mes) return {ok:true,precisao:'Época ainda não selecionada.'};
  const meses=ROT_EPOCAS[rot_textoKey(especie)];
  if(!meses) return {ok:true,precisao:'Confirmar época da espécie/variedade.'};
  if(meses.includes(mes)) return {ok:true,precisao:'Janela sazonal indicativa compatível.'};
  return {ok:!!protegida,precisao:protegida?'Fora da época típica exterior; confirmar condições na estufa.':'Fora da janela sazonal exterior habitual.'};
}
function rot_parcelas(){
  const arr = Array.isArray(data.config?.parcelas) && data.config.parcelas.length ? data.config.parcelas : [...document.getElementById('c_parcelasSel').options].map(o=>o.value);
  return uniqList(arr);
}
function rot_familiaKey(s){
  const v = String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/brassic|crucifer/.test(v)) return 'brassicaceae';
  if(/legumin|fabace|fabac/.test(v)) return 'fabaceae';
  if(/solanac/.test(v)) return 'solanaceae';
  if(/aster|compost/.test(v)) return 'asteraceae';
  if(/cucurbit/.test(v)) return 'cucurbitaceae';
  if(/umbelif|apiace/.test(v)) return 'apiaceae';
  if(/liliac|alliace|amaril/.test(v)) return 'allium';
  if(/quenopod|amaranth/.test(v)) return 'amaranthaceae';
  if(/poace|gramin/.test(v)) return 'poaceae';
  return v;
}
function rot_todasEntradas(){
  const out=[];
  for(const c of (data.culturas||[])){
    for(const op of (c.ops||[])){
      if(!['Sementeira','Plantação'].includes(op.tipo) || !/^\d{4}-\d\d-\d\d/.test(op.data||'')) continue;
      const ano = Number(op.data.slice(0,4));
      for(const parcela of (Array.isArray(op.parcelas)?op.parcelas:[])){
        if(!parcela) continue;
        out.push({id:null,ano,parcela,familia:c.familia,especie:c.especie,variedade:c.variedade||'',data:op.data,origem:'Caderno de Campo',obs:''});
      }
    }
  }
  for(const m of (data.rotacaoHistorico||[])){
    if(!m || !m.parcela || !m.familia || !m.especie || !Number.isInteger(+m.ano)) continue;
    out.push({...m,ano:Number(m.ano),origem:'Histórico manual'});
  }
  // Uma cultura no mesmo ano e parcela pode ter várias sementeiras e transplantes.
  // Agregar apenas para consulta, sem alterar ou eliminar os registos originais.
  const unique = new Map();
  for(const item of out){
    const k=[item.ano,cmp(item.parcela),rot_familiaKey(item.familia),cmp(item.especie),cmp(item.variedade)].join('|');
    if(!unique.has(k)) unique.set(k,{...item,origens:[item.origem],idsManuais:item.id?[item.id]:[]});
    else{
      const old=unique.get(k);
      if(item.origem && !old.origens.includes(item.origem)) old.origens.push(item.origem);
      if(item.id) old.idsManuais.push(item.id);
      if(String(item.data||'')>String(old.data||'')) old.data=item.data;
      if(item.obs) old.obs=item.obs;
    }
  }
  return [...unique.values()].sort((a,b)=>b.ano-a.ano || String(b.data||'').localeCompare(String(a.data||'')) || a.especie.localeCompare(b.especie,'pt'));
}
function rot_candidatas(){
  const familias=[];
  for(const [familia,especies] of Object.entries(data.base||{})){
    const key=rot_familiaKey(familia), perfil=ROT_PERFIS[key];
    if(!perfil) continue;
    const disponiveis=Object.keys(especies||{}).filter(e=>ROT_HORTICOLAS[key].some(x=>cmp(x)===cmp(e)));
    if(disponiveis.length) familias.push({familia,familiaKey:key,perfil,especies:disponiveis});
  }
  return familias;
}
function rot_recomendar(entradas, parcela, ano, mes=0){
  const antes=entradas.filter(e=>e.parcela===parcela && e.ano<ano).sort((a,b)=>b.ano-a.ano);
  const recentes=antes.filter(e=>e.ano>=ano-3);
  const ultima=antes[0]||null;
  const usados=new Set(recentes.map(e=>rot_familiaKey(e.familia)));
  const ultimaFam=ultima?rot_familiaKey(ultima.familia):null;
  const ultimaExig=ROT_PERFIS[ultimaFam]?.exigencia||null;
  const historicoCompleto=antes.length>0;
  const protegida=/estufa|estufinho|germinac/i.test(parcela||'');
  const familias=rot_candidatas().map(c=>{
    const repetida=usados.has(c.familiaKey);
    const anosFam=antes.filter(e=>rot_familiaKey(e.familia)===c.familiaKey).map(e=>e.ano);
    const anosDesdeUltima=anosFam.length?ano-Math.max(...anosFam):null;
    const possibilidades=c.especies.map(especie=>({especie,...rot_mesAdequado(especie,mes,protegida)}));
    const adequadas=possibilidades.filter(x=>x.ok);
    const lista=(adequadas.length?adequadas:possibilidades).slice(0,3);
    let score=repetida?-90:80;
    if(anosDesdeUltima===null) score+=12;
    else if(anosDesdeUltima>=4) score+=Math.min(anosDesdeUltima,12);
    if(ultimaExig==='alta' && c.familiaKey==='fabaceae') score+=8;
    if(ultimaFam==='fabaceae' && c.perfil.exigencia==='alta') score+=6;
    if(mes) score+=adequadas.length?10:-20;
    const motivos=[];
    if(repetida) motivos.push('Família registada nos 3 anos anteriores: evitar, salvo planeamento específico.');
    else motivos.push('Não consta desta família nos 3 anos anteriores ao plano.');
    if(ultimaExig==='alta' && c.familiaKey==='fabaceae') motivos.push('Pode integrar uma sucessão após culturas exigentes; não dispensa avaliação do azoto do solo.');
    if(ultimaFam==='fabaceae' && c.perfil.exigencia==='alta') motivos.push('Pode aproveitar a rotação após leguminosas, conforme nodulação, resíduos e análise do solo.');
    if(!historicoCompleto) motivos.push('Sem histórico de campo suficiente: sugestão provisória.');
    if(mes && !adequadas.length) motivos.push('Época exterior pouco indicada; confirmar proteção e variedade.');
    return {...c,repetida,score,anosDesdeUltima,epocaCompativel:!mes||adequadas.length>0,especiesSugeridas:lista,motivos};
  }).sort((a,b)=>b.score-a.score || a.familia.localeCompare(b.familia,'pt'));
  return {ultima,recentes,usados,propostas:familias.filter(x=>!x.repetida&&x.epocaCompativel).slice(0,7),foraDeEpoca:familias.filter(x=>!x.repetida&&!x.epocaCompativel),alternativas:familias.filter(x=>x.repetida).slice(0,5),historicoCompleto};
}
function rot_substituirOpcoes(sel, valores, prev){
  if(!sel) return;
  sel.replaceChildren();
  valores.forEach(v=>sel.appendChild(new Option(v,v)));
  if(prev && valores.includes(prev)) sel.value=prev;
}
function rot_atualizarEspecies(){
  const prev=rot_especie.value;
  const especies=Object.keys(data.base?.[rot_familia.value]||{}).sort((a,b)=>a.localeCompare(b,'pt'));
  rot_substituirOpcoes(rot_especie,especies,prev);
}
function rot_limparManual(){
  rot_edicaoId=null;
  rot_anoManual.value=String(new Date().getFullYear());
  rot_obs.value='';rot_variedade.value='';
  rot_estadoEdicao.textContent='';
}
function rot_guardarHistorico(){
  const ano=Number(rot_anoManual.value);
  const parcela=rot_parcelaManual.value;
  const familia=rot_familia.value,especie=rot_especie.value;
  if(!Number.isInteger(ano) || ano<1950 || ano>2100) return alert('Indique um ano válido.');
  if(!parcela||!familia||!especie) return alert('Indique parcela, família e espécie.');
  if(!Array.isArray(data.rotacaoHistorico)) data.rotacaoHistorico=[];
  const novo={id:rot_edicaoId||gerarID(),ano,parcela,familia,especie,variedade:norm(rot_variedade.value),obs:norm(rot_obs.value)};
  if(rot_edicaoId){
    const idx=data.rotacaoHistorico.findIndex(x=>x.id===rot_edicaoId);
    if(idx<0) return alert('Registo histórico não encontrado.');
    data.rotacaoHistorico[idx]=novo;
  }else data.rotacaoHistorico.push(novo);
  rot_limparManual();markDirty();autosaveNowSoon();rot_atualizar();
}
function rot_editarHistorico(id){
  const r=(data.rotacaoHistorico||[]).find(x=>x.id===id);
  if(!r) return;
  rot_edicaoId=id;
  rot_anoManual.value=r.ano;
  rot_parcelaManual.value=r.parcela;
  rot_familia.value=r.familia;
  rot_atualizarEspecies();
  rot_especie.value=r.especie;
  rot_variedade.value=r.variedade||'';
  rot_obs.value=r.obs||'';
  rot_estadoEdicao.textContent=`✏️ A editar: ${r.especie}, ${r.parcela}, ${r.ano}`;
  document.getElementById('rot_editor')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function rot_apagarHistorico(id){
  if(!confirm('Apagar este registo manual de histórico? As operações do Caderno de Campo não serão apagadas.')) return;
  data.rotacaoHistorico=(data.rotacaoHistorico||[]).filter(x=>x.id!==id);
  if(rot_edicaoId===id) rot_limparManual();
  markDirty();rot_atualizar();
}
function rot_linha(...cells){
  const row=document.createElement('tr');
  for(const cell of cells){const td=document.createElement('td');td.textContent=String(cell??'');row.appendChild(td);}
  return row;
}
function rot_renderMapaAnual(entradas){
  if(!rot_mapaAnual || !rot_anoMapa) return;
  if(!rot_anoMapa.value) rot_anoMapa.value=String(new Date().getFullYear());
  const ano=Number(rot_anoMapa.value);
  rot_mapaAnual.replaceChildren();
  const anoEntradas=entradas.filter(e=>e.ano===ano);
  if(!anoEntradas.length){rot_mapaAnual.textContent=`Sem sementeiras/plantações identificadas em ${ano}. Se houver cultivos anteriores, adicione-os no histórico manual.`;return;}
  const table=document.createElement('table');table.className='rot-tabela';
  const head=document.createElement('thead');head.innerHTML='<tr><th>Parcela</th><th>Famílias</th><th>Culturas do ano</th><th>Origem</th></tr>';
  table.appendChild(head);const tb=document.createElement('tbody');
  for(const parcela of uniqList(anoEntradas.map(x=>x.parcela)).sort((a,b)=>a.localeCompare(b,'pt'))){
    const items=anoEntradas.filter(x=>x.parcela===parcela);
    tb.appendChild(rot_linha(parcela,uniqList(items.map(x=>x.familia)).join(', '),items.map(x=>x.especie+(x.variedade?' / '+x.variedade:'')).join('; '),uniqList(items.flatMap(x=>x.origens)).join(' + ')));
  }
  table.appendChild(tb);rot_mapaAnual.appendChild(table);
}
function rot_atualizar(){
  if(!rot_parcela) return;
  const prevP=rot_parcela.value;
  const prevPM=rot_parcelaManual.value;
  const parcelas=rot_parcelas();
  rot_substituirOpcoes(rot_parcela,parcelas,prevP);
  rot_substituirOpcoes(rot_parcelaManual,parcelas,prevPM);
  const familias=Object.keys(data.base||{}).sort((a,b)=>a.localeCompare(b,'pt'));
  rot_substituirOpcoes(rot_familia,familias,rot_familia.value);
  rot_atualizarEspecies();
  if(!rot_ano.value) rot_ano.value=String(new Date().getFullYear()+1);
  if(!rot_anoManual.value) rot_anoManual.value=String(new Date().getFullYear());
  const ano=Number(rot_ano.value),parcela=rot_parcela.value;
  const entradas=rot_todasEntradas();
  rot_renderMapaAnual(entradas);
  const daParcela=entradas.filter(e=>e.parcela===parcela);
  const antes=daParcela.filter(e=>e.ano<ano);
  const mes=Number(rot_mesPlano?.value||0);
  const reg=rot_recomendar(entradas,parcela,ano,mes);
  rot_resumo.textContent=!parcela?'Escolha uma parcela.':
    (antes.length?`Em ${parcela}, existem ${antes.length} registos anuais anteriores a ${ano}. Última família: ${reg.ultima.familia} (${reg.ultima.ano}).`:
    `Sem histórico anterior a ${ano} para ${parcela}: sugestões preliminares baseadas na diversidade botânica.`);
  rot_sugestoes.replaceChildren();
  const nota=document.createElement('p');nota.className='small';
  nota.textContent='As famílias são avaliadas individualmente pela repetição nos últimos 3 anos, necessidades culturais e, se indicado, mês de plantação. Não existe qualquer sequência obrigatória Folhas/Frutos/Raízes/Leguminosas/Brássicas.';
  rot_sugestoes.appendChild(nota);
  if(!reg.propostas.length){
    const p=document.createElement('p');p.textContent='Não há famílias disponíveis sem repetição recente na base atual. Recomenda-se rever a divisão em canteiros, avaliar adubos verdes/pousio ou acrescentar espécies de outras famílias.';rot_sugestoes.appendChild(p);
  }
  const list=document.createElement('div');list.className='rot-recomendacoes';
  reg.propostas.forEach(c=>{
    const card=document.createElement('div');card.className='rot-sugestao';
    const b=document.createElement('b');b.textContent=`${c.familia} — ${c.perfil.nome}`;
    const esp=document.createElement('p');esp.textContent=`Culturas possíveis: ${c.especiesSugeridas.map(x=>x.especie).join(', ')}.`;
    const detalhes=document.createElement('p');detalhes.className='small';detalhes.textContent=c.perfil.descricao;
    const motivos=document.createElement('p');motivos.className='small';motivos.textContent=c.motivos.join(' ');
    const sazonal=document.createElement('p');sazonal.className='small';
    if(mes) sazonal.textContent=`Época: ${c.especiesSugeridas.map(x=>x.especie+' — '+x.precisao).join(' | ')}`;
    card.append(b,esp,detalhes,motivos);
    if(mes) card.appendChild(sazonal);
    list.appendChild(card);
  });
  rot_sugestoes.appendChild(list);
  if(reg.foraDeEpoca.length){
    const aviso=document.createElement('p');aviso.className='small';
    aviso.textContent=`Fora da época exterior indicativa para o mês escolhido: ${reg.foraDeEpoca.map(x=>x.familia).join(', ')}. Não recomendado sem rever a espécie, o microclima e a proteção.`;
    rot_sugestoes.appendChild(aviso);
  }
  if(reg.alternativas.length){
    const aviso=document.createElement('p');aviso.className='small';
    aviso.textContent=`Famílias a evitar por repetição recente: ${reg.alternativas.map(x=>x.familia).join(', ')}.`;
    rot_sugestoes.appendChild(aviso);
  }
  const warn=document.createElement('p');warn.className='small';
  warn.textContent='Sugestões técnicas de planeamento, não garantias de produção. Verificar doenças, drenagem, fertilidade, exposição, época, viveiro e ocupação real de cada canteiro. Mesma família botânica pode incluir culturas de órgãos diferentes.';
  rot_sugestoes.appendChild(warn);
  // Histórico anual, visível para a parcela e anos (incluindo o futuro, se houver registos)
  rot_historico.replaceChildren();
  if(!daParcela.length){rot_historico.textContent='Ainda não existem registos para esta parcela. Pode adicionar históricos antigos abaixo.';return;}
  const table=document.createElement('table');table.className='rot-tabela';
  const thead=document.createElement('thead');thead.innerHTML='<tr><th>Ano</th><th>Família</th><th>Espécie / Variedade</th><th>Tipo</th><th>Registo manual</th></tr>';table.appendChild(thead);
  const tbody=document.createElement('tbody');
  daParcela.forEach(e=>{
    const tr=rot_linha(e.ano,e.familia,e.especie+(e.variedade?' / '+e.variedade:''),e.origens.join(' + '),'');
    const td=tr.lastElementChild;
    for(const id of e.idsManuais){
      const ed=document.createElement('button');ed.className='purp rot-mini';ed.textContent='Editar';ed.onclick=()=>rot_editarHistorico(id);
      const del=document.createElement('button');del.className='warn rot-mini';del.textContent='Apagar';del.onclick=()=>rot_apagarHistorico(id);
      td.append(ed,del);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);rot_historico.appendChild(table);
}

/* ===================== CALENDÁRIO LUNAR MENSAL (v1.0.30) ===================== */
// Calculado em cada mês/data para uso offline; NÃO é uma cópia nem sincronização
// dos dados diários do RhythmOfNature. Posicionamento da Lua e fases aproximados.
const calm_mes=document.getElementById('calm_mes');
const calm_dias=document.getElementById('calm_dias');
const calm_detalhe=document.getElementById('calm_detalhe');
const calm_estado=document.getElementById('calm_estado');
let calm_dataSelecionada=null;
let calm_eventos=[];
const CALM_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const CALM_DIAS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
// Categorias tradicionais inspiradas em calendários lunares: não implicam prova científica.
const CALM_GRUPOS=['fruto','raiz','flor','folha','fruto','raiz','flor','folha','fruto','raiz','flor','folha'];
const CALM_EMOJI={fruto:'🍅',raiz:'🥕',flor:'🌼',folha:'🥬'};
const CALM_DESC={
  fruto:'Categoria tradicional: plantas cultivadas pelo fruto/semente (tomate, pepino e feijão).',
  raiz:'Categoria tradicional: raízes, tubérculos e bolbos (cenoura, beterraba e cebola).',
  flor:'Categoria tradicional: flores e plantas cultivadas pela floração.',
  folha:'Categoria tradicional: folhas e caules (alface, couves e espinafres).'
};
const CALM_TRABALHOS={
  folha:'Horta: avaliar sementeira de folhosas, transplantação, rega conforme humidade do solo e controlo de doenças das folhas.',
  fruto:'Horta: avaliar fruteiras e culturas de fruto na época adequada; verificar floração, polinização e tutoragem.',
  raiz:'Horta: avaliar sementeira de raízes, transplantação de cebolas, drenagem e preparação de canteiros.',
  flor:'Horta: avaliar plantas de flor e aromáticas; observar insetos polinizadores e formação de gomos florais.'
};
// Janelas técnicas sazonais gerais para as Flores. Dependem da espécie,
// de a planta ser caducifólia/persistente, estado fenológico e meteorologia.
const CALM_FRUTICULTURA=[
 {id:'poda_dormencia',ico:'✂️',nome:'Poda de inverno — fruteiras caducifólias',meses:[1,2,3],detalhe:'Preferir repouso vegetativo e tempo seco; sobretudo macieira, pereira e outras caducifólias. Evitar chuva persistente e ventos fortes.'},
 {id:'poda_verde',ico:'🌿',nome:'Poda em verde e desponta ligeira',meses:[5,6,7,8],detalhe:'Ajustar vigor e arejamento; não efetuar cortes excessivos durante ondas de calor ou antes de temporais.'},
 {id:'estaca_lenhosa',ico:'🌱',nome:'Estaquia lenhosa',meses:[11,12,1,2],detalhe:'Recolher estacas de espécies caducifólias no repouso; usar material saudável, substrato drenante e humidade controlada.'},
 {id:'estaca_semilenhosa',ico:'🌱',nome:'Estaquia semilenhosa (ex.: camélia)',meses:[6,7,8,9],detalhe:'Utilizar ramos maturados da estação, abrigo do vento e humidade ambiental elevada sem encharcamento.'},
 {id:'alporquia',ico:'🌳',nome:'Alporquia aérea',meses:[4,5,6,7,8,9],detalhe:'Preferir fase ativa de crescimento; usar esfagno/substrato húmido, selagem e acompanhamento das raízes.'},
 {id:'enxertia_garfo',ico:'🔗',nome:'Enxertia de garfo',meses:[2,3,4],detalhe:'Para muitas caducifólias, enxertar na transição do repouso para atividade; escolher garfo viável e compatibilidade com porta-enxerto.'},
 {id:'enxertia_borbulha',ico:'🔗',nome:'Enxertia de borbulha',meses:[6,7,8,9],detalhe:'Preferir porta-enxerto ativo e casca que se desprenda bem; método/época dependem da espécie, incluindo citrinos.'},
 {id:'plantar_fruteiras',ico:'🪴',nome:'Plantação de fruteiras de raiz nua',meses:[11,12,1,2,3],detalhe:'Para caducifólias em repouso, quando o solo não está saturado; espécies de folha persistente exigem abordagem diferente.'},
 {id:'desbaste_frutos',ico:'🍏',nome:'Desbaste de frutos',meses:[4,5,6,7],detalhe:'Após o vingamento dos frutos, ajustar a carga consoante espécie e variedade; evitar perdas de flores/frutos ainda em formação.'},
 {id:'conducao',ico:'🧵',nome:'Condução, tutores e orientação de ramos',meses:[3,4,5,6,7,8,9],detalhe:'Corrigir ângulos de ramos jovens e apoios, sem estrangular o crescimento; verificar a proteção contra o vento.'}
];
// Preferência por fase ILUMINADA da Lua (tradição, sem comprovação agronómica).
// Não confundir Lua crescente/minguante com Lua ascendente/descendente.
const CALM_PREFERENCIAS_LUA={
  poda_dormencia:{fase:'minguante',nota:'Poda de formação ou manutenção tradicionalmente associada à minguante.'},
  poda_verde:{fase:'minguante',nota:'Para conter vigor, a tradição prefere a minguante.'},
  estaca_lenhosa:{fase:'minguante',nota:'Na tradição, recolher estacas de madeira em minguante.'},
  estaca_semilenhosa:{fase:'minguante',nota:'Preferência tradicional de enraizamento; a humidade e maturação dos ramos são decisivas.'},
  alporquia:{fase:'crescente',nota:'Tradição favorável ao crescimento; no campo, a atividade vegetativa é o principal critério.'},
  enxertia_garfo:{fase:'crescente',nota:'Tradicionalmente crescente; usar porta-enxerto compatível e material saudável.'},
  enxertia_borbulha:{fase:'crescente',nota:'Tradicionalmente crescente; essencial confirmar que a casca desprende bem.'},
  plantar_fruteiras:{fase:'minguante',nota:'Associação popular ao enraizamento; evitar solos encharcados.'},
  desbaste_frutos:{fase:'minguante',nota:'Preferência popular para reduzir carga; fazer quando os frutos atingirem fase adequada.'},
  conducao:{fase:'minguante',nota:'Preferência tradicional para conter crescimento; as correções de tutoragem podem ser feitas quando necessário.'}
};
function calm_luaPeriodo(info){
  // Uma lunação tem aprox. 29,53 dias. Nova/cheia são assinaladas como transições.
  const x=info.faseProgresso;
  if(x<0.025 || x>0.975) return 'nova';
  if(Math.abs(x-0.5)<0.025) return 'cheia';
  return x<0.5?'crescente':'minguante';
}
function calm_preferenciaTrabalho(t,info){
  const preferencia=CALM_PREFERENCIAS_LUA[t.id]||null;
  const periodo=calm_luaPeriodo(info);
  return {fase:preferencia?.fase||'sem preferência',nota:preferencia?.nota||'',periodo,
          adequada:!!preferencia && preferencia.fase===periodo};
}
function calm_labelFase(s){return s==='crescente'?'🌒 Lua crescente':s==='minguante'?'🌘 Lua minguante':s==='nova'?'🌑 Lua nova':s==='cheia'?'🌕 Lua cheia':s;}
function calm_renderGuiaTecnicas(){
  const holder=document.getElementById('calm_guiaTecnicas');
  if(!holder) return;
  holder.replaceChildren();
  const tabela=document.createElement('table');tabela.className='calm-guide-table';
  const cab=document.createElement('thead');
  const cabTr=document.createElement('tr');
  ['Trabalho','Meses indicativos','Lua tradicional preferida'].forEach(txt=>{const th=document.createElement('th');th.textContent=txt;cabTr.appendChild(th);});
  cab.appendChild(cabTr);tabela.appendChild(cab);
  const tbody=document.createElement('tbody');
  CALM_FRUTICULTURA.forEach(t=>{
    const tr=document.createElement('tr');
    const campos=[t.ico+' '+t.nome,t.meses.map(m=>CALM_MESES[m-1].slice(0,3)).join(' · '),calm_labelFase(CALM_PREFERENCIAS_LUA[t.id]?.fase||'—')];
    campos.forEach(txt=>{const td=document.createElement('td');td.textContent=txt;tr.appendChild(td);});
    tbody.appendChild(tr);
  });
  tabela.appendChild(tbody);holder.appendChild(tabela);
}
const CALM_FASES_TRAD={
  minguante:'Algumas tradições preferem a Lua minguante para podas e recolha de estacas; não há evidência agronómica suficiente para transformar isto numa obrigação.',
  crescente:'Algumas tradições preferem a Lua crescente para enxertia e alporquia; época, estado do porta-enxerto e técnica são determinantes.',
  neutra:'Não existe uma restrição técnica geral baseada na fase lunar para estes trabalhos.'
};
function calm_trabalhosMes(mes){return CALM_FRUTICULTURA.filter(t=>t.meses.includes(mes));}
function calm_faseTradicional(info){
  if(info.faseNome.toLowerCase().includes('minguante')) return CALM_FASES_TRAD.minguante;
  if(info.faseNome.toLowerCase().includes('crescente')) return CALM_FASES_TRAD.crescente;
  return CALM_FASES_TRAD.neutra;
}
const CALM_TZ='Atlantic/Azores';
const CALM_FMT_AZ=new Intl.DateTimeFormat('en-GB',{timeZone:CALM_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
function calm_partesAzores(instant){
  const parts={};for(const p of CALM_FMT_AZ.formatToParts(instant)){if(p.type!=='literal') parts[p.type]=Number(p.value);}
  return parts;
}
function calm_utcMeioDiaAzores(y,m,d){
  // Ajuste iterativo do instante UTC para o meio-dia civil de Atlantic/Azores,
  // incluindo mudanças automáticas entre hora de inverno e verão.
  let ms=Date.UTC(y,m-1,d,13);
  for(let i=0;i<3;i++){
    const p=calm_partesAzores(new Date(ms));
    const observado=Date.UTC(p.year,p.month-1,p.day,p.hour);
    const alvo=Date.UTC(y,m-1,d,12);
    ms+=alvo-observado;
  }
  return ms;
}
function calm_chaveAzores(instant){const p=calm_partesAzores(instant);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
function calm_rad(deg){return deg*Math.PI/180;}
function calm_norm(deg){return ((deg%360)+360)%360;}
function calm_lua(d){
  const utc=calm_utcMeioDiaAzores(d.getFullYear(),d.getMonth()+1,d.getDate());
  const jd=utc/86400000+2440587.5;
  const dias=jd-2451543.5;
  const N=calm_norm(125.1228-0.0529538083*dias), i=5.1454, w=calm_norm(318.0634+0.1643573223*dias);
  const M=calm_norm(115.3654+13.0649929509*dias), e=0.054900;
  const E=M+(180/Math.PI)*e*Math.sin(calm_rad(M))*(1+e*Math.cos(calm_rad(M)));
  const xv=60.2666*(Math.cos(calm_rad(E))-e), yv=60.2666*Math.sqrt(1-e*e)*Math.sin(calm_rad(E));
  const v=Math.atan2(yv,xv)*180/Math.PI;
  const r=Math.hypot(xv,yv);
  const xh=r*(Math.cos(calm_rad(N))*Math.cos(calm_rad(v+w))-Math.sin(calm_rad(N))*Math.sin(calm_rad(v+w))*Math.cos(calm_rad(i)));
  const yh=r*(Math.sin(calm_rad(N))*Math.cos(calm_rad(v+w))+Math.cos(calm_rad(N))*Math.sin(calm_rad(v+w))*Math.cos(calm_rad(i)));
  const Ms=calm_norm(356.0470+0.9856002585*dias);
  const Lm=calm_norm(M+w+N), Ls=calm_norm(Ms+282.9404+0.0000470935*dias);
  const D=calm_norm(Lm-Ls),F=calm_norm(Lm-N);
  const longitude=calm_norm(Math.atan2(yh,xh)*180/Math.PI-1.274*Math.sin(calm_rad(M-2*D))+0.658*Math.sin(calm_rad(2*D))-0.186*Math.sin(calm_rad(Ms))-0.059*Math.sin(calm_rad(2*M-2*D))-0.057*Math.sin(calm_rad(M-2*D+Ms))+0.053*Math.sin(calm_rad(M+2*D))+0.046*Math.sin(calm_rad(2*D-Ms))+0.041*Math.sin(calm_rad(M-Ms))-0.035*Math.sin(calm_rad(D))-0.031*Math.sin(calm_rad(M+Ms)));
  const setor=Math.floor(longitude/30)%12;
  // Idade sinódica lunar — suficientes para indicação de fase, não para horários exatos.
  const lunacao=((jd-2451550.26)/29.530588853)%1;
  const fase=(lunacao+1)%1;
  const fases=['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  const nomes=['Lua nova','Lua crescente','Quarto crescente','Gibosa crescente','Lua cheia','Gibosa minguante','Quarto minguante','Lua minguante'];
  const idx=Math.floor(((fase+0.0625)%1)*8);
  return {grupo:CALM_GRUPOS[setor],fase:fases[idx],faseNome:nomes[idx],lon:longitude,faseProgresso:fase};
}
function calm_chave(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function calm_mesAtual(){
  const p=calm_partesAzores(new Date());return `${p.year}-${String(p.month).padStart(2,'0')}`;
}
function calm_hoje(){
  calm_mes.value=calm_mesAtual();calm_dataSelecionada=calm_chaveAzores(new Date());calm_render();
}
function calm_navegar(m){
  const ym=calm_mes.value||calm_mesAtual();
  const [y,mo]=ym.split('-').map(Number);const d=new Date(y,mo-1+m,1,12);
  calm_mes.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  calm_dataSelecionada=null;calm_render();
}
function calm_abrirMes(){calm_dataSelecionada=null;calm_render();}
function calm_selecionarDia(key){calm_dataSelecionada=key;calm_render();}
function calm_eventosDoDia(d){
  const key=calm_chave(d);
  return calm_eventos.filter(e=>{if(!(e.start instanceof Date)||Number.isNaN(e.start.getTime()))return false;const raw=String(e.startRaw||'');const ymd=/^(\d{4})(\d{2})(\d{2})$/.exec(raw);return (ymd?ymd[1]+'-'+ymd[2]+'-'+ymd[3]:calm_chaveAzores(e.start))===key;});
}
async function calm_render(){
  if(!calm_mes||!calm_dias) return;
  if(!calm_mes.value) calm_mes.value=calm_mesAtual();
  const ym=calm_mes.value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return;
  const [ano,mes]=ym.split('-').map(Number);
  const dias=new Date(ano,mes,0).getDate();
  const primeiro=(new Date(ano,mes-1,1).getDay()+6)%7;
  const hoje=calm_chaveAzores(new Date());
  if(!calm_dataSelecionada || !calm_dataSelecionada.startsWith(ym)) calm_dataSelecionada=ym+'-'+String(Math.min(dias,hoje.startsWith(ym)?Number(hoje.slice(-2)):1)).padStart(2,'0');
  const resultados=[];
  try{const txt=await cal_getText();calm_eventos=txt?parseICS(txt):[];}catch(_){calm_eventos=[];}
  calm_dias.replaceChildren();
  const grid=document.createElement('div');grid.className='calm-grid';
  CALM_DIAS.forEach(txt=>{const h=document.createElement('div');h.className='calm-semana';h.textContent=txt;grid.appendChild(h);});
  for(let n=0;n<primeiro;n++){const v=document.createElement('div');v.className='calm-vazio';grid.appendChild(v);}
  for(let n=1;n<=dias;n++){
    const d=new Date(ano,mes-1,n,12),key=calm_chave(d),info=calm_lua(d);
    const b=document.createElement('button');b.type='button';b.className='calm-dia';
    if(key===hoje) b.classList.add('calm-hoje');
    if(key===calm_dataSelecionada) b.classList.add('calm-selecionado');
    b.title=`${n} de ${CALM_MESES[mes-1]}: ${info.faseNome}, categoria tradicional ${info.grupo}. Hora dos Açores.`;
    const numero=document.createElement('b');numero.textContent=String(n);
    const lua=document.createElement('span');lua.className='calm-lua';lua.textContent=info.fase;
    const grupo=document.createElement('span');grupo.className='calm-grupo';grupo.textContent=CALM_EMOJI[info.grupo]+' '+info.grupo;
    b.append(numero,lua,grupo);
    const tecnicos=calm_trabalhosMes(mes);
    if(tecnicos.length){
      const favoraveis=tecnicos.filter(t=>calm_preferenciaTrabalho(t,info).adequada);
      if(favoraveis.length) b.classList.add('calm-favoravel');
      const trabalho=document.createElement('span');trabalho.className='calm-evento';
      trabalho.textContent=(favoraveis.length?'✅ ':'')+(favoraveis.length?favoraveis:tecnicos).slice(0,3).map(t=>t.ico).join(' ');
      trabalho.title=favoraveis.length?'Lua tradicional favorável a: '+favoraveis.map(t=>t.nome).join(', '):'Trabalhos sazonais de fruticultura — verificar Lua no detalhe';
      b.appendChild(trabalho);
    }
    if(calm_eventosDoDia(d).length){const evento=document.createElement('span');evento.className='calm-evento';evento.textContent='📌 '+calm_eventosDoDia(d).length+' evento(s)';b.appendChild(evento);}
    b.onclick=()=>calm_selecionarDia(key);grid.appendChild(b);
  }
  calm_dias.appendChild(grid);
  const selected=calm_dataSelecionada.split('-').map(Number);
  const date=new Date(selected[0],selected[1]-1,selected[2],12),info=calm_lua(date);
  calm_detalhe.replaceChildren();
  const title=document.createElement('h4');title.textContent=`${selected[2]} de ${CALM_MESES[selected[1]-1]} de ${selected[0]} · ${info.fase} ${info.faseNome}`;
  const summary=document.createElement('p');summary.textContent=`${CALM_EMOJI[info.grupo]} Categoria tradicional: ${info.grupo.toUpperCase()} · posição lunar estimada às 12:00 da hora legal dos Açores (${CALM_TZ}).`;
  const note=document.createElement('p');note.textContent=CALM_DESC[info.grupo];
  const tarefas=document.createElement('p');tarefas.textContent=CALM_TRABALHOS[info.grupo];
  const lunar=document.createElement('p');lunar.className='small';
  lunar.textContent='Período lunar aproximado: '+calm_labelFase(calm_luaPeriodo(info))+'. '+calm_faseTradicional(info);
  const heads=document.createElement('h4');heads.textContent='🌳 Fruticultura — trabalhos nesta época';
  const trabalhos=document.createElement('div');trabalhos.className='calm-trabalhos';
  const tecnicos=calm_trabalhosMes(mes);
  if(!tecnicos.length){const x=document.createElement('p');x.textContent='Sem janelas sazonais gerais assinaladas. Acompanhe poda sanitária, vento e drenagem conforme a necessidade.';trabalhos.appendChild(x);}
  tecnicos.forEach(t=>{
    const row=document.createElement('div');row.className='calm-trabalho';
    const b=document.createElement('b');b.textContent=t.ico+' '+t.nome;
    const pref=calm_preferenciaTrabalho(t,info);
    const chip=document.createElement('span');chip.className='calm-lua-chip'+(pref.adequada?' ok':'');
    chip.textContent=(pref.adequada?'✅ Favorável na tradição · ':'Tradicionalmente: ')+calm_labelFase(pref.fase);
    const p=document.createElement('p');p.className='small';p.textContent=t.detalhe+' '+pref.nota;
    row.append(b,chip,p);trabalhos.appendChild(row);
  });
  const gestao=document.createElement('p');gestao.className='small';
  gestao.textContent='Outros cuidados: regar conforme a humidade do solo, mondar, observar pragas, aplicar composto segundo a fertilidade e colher em boas condições de higiene. Nas Flores, evitar enxertia/poda/estaquia com vento forte e chuva persistente.';
  const disclaim=document.createElement('p');disclaim.className='small';
  disclaim.textContent='Épocas técnicas gerais para fruteiras e clima oceânico, não datas universais: confirmar espécie, variedade, idade, floração, desenvolvimento e previsão meteorológica. As categorias lunares são tradicionais, aproximadas e não demonstram maior produtividade.';
  calm_detalhe.append(title,summary,note,tarefas,lunar,heads,trabalhos,gestao,disclaim);
  const eventos=calm_eventosDoDia(date);
  if(eventos.length){
    const evt=document.createElement('div');evt.className='small';
    const eb=document.createElement('b');eb.textContent='Eventos do calendário .ics: ';evt.appendChild(eb);
    evt.appendChild(document.createTextNode(eventos.map(e=>e.summary||'(sem título)').join(' · ')));
    calm_detalhe.appendChild(evt);
  }
  calm_renderGuiaTecnicas();
  calm_estado.textContent=`${CALM_MESES[mes-1][0].toUpperCase()+CALM_MESES[mes-1].slice(1)} ${ano} • Referência: 12:00 hora dos Açores (Atlantic/Azores, verão/inverno automático) • Cálculo local aproximado e offline, sem sincronização direta com o calendário do RhythmOfNature — Açores.`;
}
window.addEventListener('focus',()=>{if(calm_mes?.value===calm_mesAtual() && document.getElementById('tab_cal')?.classList.contains('active')) calm_render();});
setInterval(()=>{if(calm_mes?.value===calm_mesAtual() && document.getElementById('tab_cal')?.classList.contains('active')) calm_render();},6*60*60*1000);

/* ===================== INIT / REFRESH ===================== */

async function autoOpenRememberedProject(){
  if(projectDirHandle) return false;
  if(!window.showDirectoryPicker) return false; // sem suporte
  const remembered = await loadRememberedProjectDir();
  if(!remembered) return false;

  // tenta reabrir automaticamente apenas se já tiver permissão (sem pedir pop‑ups no arranque)
  let perm = "granted";
  try{ perm = await remembered.queryPermission({mode:"readwrite"}); }catch(_e){ perm = "granted"; }
  if(perm!=="granted"){
    // precisa de gesto do utilizador para pedir permissão (botão "Reautorizar pasta")
    pendingProjectDirHandle = remembered;
    updateStatus();
    return false;
  }

  projectDirHandle = remembered;
  pendingProjectDirHandle = null;
  revokeAllPhotoUrls();
  await ensureDir(projectDirHandle, ["photos","campo"]);
  await ensureDir(projectDirHandle, ["photos","fito"]);
  await ensureDir(projectDirHandle, ["photos","ops"]);
  await ensureDir(projectDirHandle, ["photos","notas"]);
  await ensureDir(projectDirHandle, ["photos","fin"]);
  await ensureDir(projectDirHandle, ["calendar"]);

  const loaded = await safeLoadProjectFromDir(projectDirHandle);
  if(!loaded){
    // iniciar novo projeto
    data = {
      app:"bio_suite",
      version: APP_VERSION,
      meta:{created_at: nowISO(), updated_at: nowISO()},
      base: deepClone(BASE_INICIAL),
      culturas: [],
      rotacaoHistorico: [],
      tratamentos: [],
      calendar: null,
      ops_tasks: []
    };
    dirty = true;
    await saveProject(true);
  } else {
    dirty = false;
  }
  return true;
}

function refreshAllUI(){
  c_garantirNumeracao();
  sp_garantirNumeracaoSementeiras();
  try{ cfg_ensure(); cfg_apply(); cfg_render(); }catch(_e){}
  e_refreshFamilias(false);
  c_refreshFamilias();
  refreshCulturasSelects();
  c_atualizar();
  f_atualizar();
  h_refreshCulturas();
  s_refresh();
  p_refresh();
  c_ajustarCampos();
  c_renderFotosEdicao();
  f_renderFotos();
  cal_render();
  rot_atualizar();
  calm_render();
  o_syncSubtipos();
  o_render();
  o_renderFotosEdicao();

  // Notas / Gestão €
  try{ n_refreshCulturasSelect(); }catch(_e){}
  try{ n_refreshEspeciesSelect(); }catch(_e){}
  try{ n_atualizar(); }catch(_e){}
  try{ if(typeof n_renderFotos==='function') n_renderFotos(); }catch(_e){}
  try{ g_atualizar(); }catch(_e){}
  try{ if(typeof g_renderFoto==='function') g_renderFoto(); }catch(_e){}
}

(async function init(){

  // Aviso de origem: dados/permissões são por endereço (host+porta).
  try{
    const cur = location.origin;
    const prev = localStorage.getItem(ORIGIN_KEY);
    if(!prev) localStorage.setItem(ORIGIN_KEY, cur);
    else if(prev !== cur) originWarning = `⚠️ Endereço diferente (${cur}). Use o mesmo onde instalou (${prev}) para ver os mesmos dados/permissões.`;
  }catch(_e){}
  try{ if(originWarning){ alert(originWarning + "\n\nDica: use sempre o MESMO endereço (mesma porta) para manter permissões e dados."); } }catch(_e){}
  try{ loadUiPrefs(); }catch(_e){}
  try{
    await syncDraftMetaFromIDB();
  }catch(_e){}
  try{
    await autoOpenRememberedProject();
  }catch(err){
    console.warn("Auto‑abrir projeto falhou (ignorado):", err);
  }

  // Se não há pasta/projeto, tenta restaurar automaticamente o rascunho local
  try{
    await autoRestoreLocalDraftIfAny();
  }catch(_e){}

  refreshAllUI();
  updateStatus();
})();

// ===================== NOTAS =====================
const n_data=document.getElementById("n_data");
const n_assunto=document.getElementById("n_assunto");
const n_texto=document.getElementById("n_texto");
const n_parcelas=document.getElementById("n_parcelas");
const n_culturas=document.getElementById("n_culturas");
const n_especies=document.getElementById("n_especies");
const n_fotoInput=document.getElementById("n_fotoInput");
const n_fotosEdicao=document.getElementById("n_fotosEdicao");
const n_estadoEdicao=document.getElementById("n_estadoEdicao");
const n_lista=document.getElementById("n_lista");
let n_sel=null;
let n_workId=null;
let n_checked=new Set();
let n_fotosBuffer=[];

function n_refreshCulturasSelect(){
  if(!n_culturas) return;
  n_culturas.replaceChildren();
  (data.culturas||[]).forEach((c,idx)=>{
    const opt=document.createElement("option");
    opt.value=c.id;
    opt.textContent=`${c_numeroCultura(c)}. ${c.familia} — ${c.especie}${c.variedade?(" / "+c.variedade):""}`;
    n_culturas.appendChild(opt);
  });
}

function n_refreshEspeciesSelect(){
  if(!n_especies) return;
  n_especies.replaceChildren();
  const base = data.base || {};
  const fams = Object.keys(base).sort();
  for(const fam of fams){
    const obj = base[fam] || {};
    const especies = Object.keys(obj).sort();
    for(const esp of especies){
      const opt = document.createElement("option");
      opt.value = `${fam}||${esp}`;
      opt.textContent = `${fam} — ${esp}`;
      n_especies.appendChild(opt);
    }
  }
}


async function n_renderFotos(){
  n_fotosEdicao.replaceChildren();
  if(!n_fotosBuffer.length){ const d=document.createElement("div"); d.className="small"; d.textContent="Sem fotos"; n_fotosEdicao.appendChild(d); return; }
  for(let i=0;i<n_fotosBuffer.length;i++){
    const ref=n_fotosBuffer[i];
    const wrap=document.createElement("div"); wrap.className="thumb";
    const img=document.createElement("img"); img.src=await resolvePhotoRef(ref); img.style.maxWidth="140px"; img.style.maxHeight="110px";
    const del=document.createElement("button"); del.className="warn"; del.textContent="✖"; del.onclick=async (ev)=>{ ev.preventDefault(); ev.stopPropagation(); if(!confirm("Remover foto?")) return; n_fotosBuffer.splice(i,1); await n_renderFotos(); };
    wrap.appendChild(img); wrap.appendChild(del);
    n_fotosEdicao.appendChild(wrap);
  }
}

n_fotoInput && n_fotoInput.addEventListener("change", async ()=>{
  const files=[...n_fotoInput.files||[]];
  if(!files.length) return;
  const max=2-n_fotosBuffer.length;
  if(max<=0) return alert("Máximo 2 fotos por nota.");

  const workId = n_sel || n_workId || gerarID();
  n_workId = workId;

  const slice = files.slice(0,max);
  const refs = [];
  for(let i=0;i<slice.length;i++){
    refs.push(await storePhoto("notas", workId, n_fotosBuffer.length + i, slice[i]));
  }
  n_fotosBuffer.push(...refs);

  n_fotoInput.value="";
  await n_renderFotos();
  markDirty();
});


function n_limpar(){
  n_data.value=""; n_assunto.value=""; n_assunto.readOnly=false; n_texto.value="";
  if(n_parcelas) [...n_parcelas.options].forEach(o=>o.selected=false);
  if(n_culturas) [...n_culturas.options].forEach(o=>o.selected=false);
  if(n_especies) [...n_especies.options].forEach(o=>o.selected=false);
  n_fotosBuffer=[]; n_sel=null; n_workId=null; n_checked.clear();
  n_estadoEdicao.textContent="";
  n_renderFotos();
  n_atualizar();
}

function n_guardar(){
  const assunto=(n_assunto.value||"").trim();
  if(!assunto) return alert("Indique um assunto.");
  const nota={
    id: n_sel || n_workId || gerarID(),
    data: n_data.value||"",
    assunto: assunto,
    texto: (n_texto.value||"").trim(),
    parcelas: n_parcelas ? Array.from(n_parcelas.selectedOptions).map(o=>o.value).filter(hasText) : [],
    culturaIds: n_culturas ? Array.from(n_culturas.selectedOptions).map(o=>o.value).filter(hasText) : [],
    especies: n_especies ? Array.from(n_especies.selectedOptions).map(o=>o.value).filter(hasText) : [],
    fotos: [...n_fotosBuffer]
  };
  const arr=data.notas||[];
  const idx=arr.findIndex(x=>x.id===nota.id);
  const antigasFotos=idx>=0 ? [...(arr[idx].fotos||[])] : [];
  if(idx>=0) arr[idx]=nota; else arr.unshift(nota);
  data.notas=arr;
  n_sel=nota.id;
  n_workId=nota.id;
  n_estadoEdicao.textContent="✅ Nota guardada.";
  markDirty();
  n_atualizar();
  void removerFotosObsoletasDepoisDeGuardar(antigasFotos, nota.fotos);
}

/* As Ajudas Avelino são uma biblioteca visual, não notas automáticas.
   Uma eventual nota com texto já existente permanece editável e apagável. */
function n_editarNota(id){
  const n=(data.notas||[]).find(x=>String(x.id)===String(id));
  if(!n)return;
  n_sel=n.id;
  n_estadoEdicao.textContent=`✏️ A editar: ${n.assunto}`;
  n_data.value=n.data||'';n_assunto.value=n.assunto||'';n_assunto.readOnly=false;n_texto.value=n.texto||'';
  if(n_parcelas)[...n_parcelas.options].forEach(o=>o.selected=(n.parcelas||[]).includes(o.value));
  if(n_culturas)[...n_culturas.options].forEach(o=>o.selected=(n.culturaIds||[]).some(id=>String(id)===String(o.value)));
  if(n_especies)[...n_especies.options].forEach(o=>o.selected=(n.especies||[]).includes(o.value));
  n_fotosBuffer=[...(n.fotos||[])];void n_renderFotos();n_atualizar();
  document.getElementById('n_texto')?.scrollIntoView({block:'center',behavior:'smooth'});
}

function n_atualizar(){
  if(!n_lista) return;
  n_lista.replaceChildren();
  const arr=[...(data.notas||[])].filter(n=>!(String(n.id)==='qc-nota-fixa-avelino-apresentacao'
    && !(n.texto||'').trim() && !(n.fotos||[]).length && !(n.parcelas||[]).length && !(n.culturaIds||[]).length && !(n.especies||[]).length))
    .filter(n=>qc_mesCombina('n',n.data)
    && qc_temTexto('n',n.assunto,n.texto,n.parcelas,n.especies));
  arr.sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));
  if(!arr.length){ qc_semResultados(n_lista); return; }
  arr.forEach((n,idx)=>{
    const row=document.createElement("div"); row.className="list"+(n.id===n_sel?" active":"");
    const cab=document.createElement("div"); cab.className="cabecalho";
    const left=document.createElement("div");
    const chk=document.createElement("input"); chk.type="checkbox"; chk.checked=n_checked.has(n.id); chk.onclick=(ev)=>{ev.stopPropagation(); if(chk.checked) n_checked.add(n.id); else n_checked.delete(n.id);};
    left.appendChild(chk);
    const b=document.createElement("b"); b.textContent=`${idx+1}. ${n.assunto}`;
    left.appendChild(b);
    const meta=[];
    if(n.data) meta.push(`data: ${fmtDatePT(n.data)}`);
    if((n.parcelas||[]).length) meta.push(`parcelas: ${(n.parcelas||[]).join(", ")}`);
    if((n.culturaIds||[]).length){
      const names=(data.culturas||[]).filter(c=>(n.culturaIds||[]).includes(c.id)).map(c=>c.especie+(c.variedade?(" / "+c.variedade):""));
      if(names.length) meta.push(`culturas: ${names.join(", ")}`);
    }
    if((n.especies||[]).length){
      const names=(n.especies||[]).map(v=>{
        const [fam,esp]=String(v).split('||');
        return esp ? `${fam} — ${esp}` : String(v);
      });
      if(names.length) meta.push(`espécies: ${names.join(", ")}`);
    }
    if(meta.length){ const sm=document.createElement("div"); sm.className="small"; sm.textContent=meta.join(" • "); left.appendChild(document.createElement("br")); left.appendChild(sm); }
    if(n.texto){
      const resumo=document.createElement('p');resumo.className='small';resumo.style.margin='7px 0 0';
      resumo.textContent=n.texto.length>200?n.texto.slice(0,200)+'…':n.texto;
      left.appendChild(resumo);
    }
    cab.appendChild(left);
    cab.onclick=()=>n_editarNota(n.id);
    row.appendChild(cab);
    n_lista.appendChild(row);
  });
}

function n_apagarSelecionadas(){
  const ids = n_checked.size ? Array.from(n_checked) : (n_sel ? [n_sel] : []);
  if(!ids.length) return alert("Selecione (ou marque) uma nota.");
  if(!confirm(ids.length>1?`Apagar ${ids.length} notas?`:"Apagar a nota selecionada?")) return;
  data.notas=(data.notas||[]).filter(n=>!ids.includes(n.id));
  n_checked.clear(); n_sel=null;
  markDirty();
  n_limpar();
}

// ===================== GESTÃO € =====================
const g_tipo=document.getElementById("g_tipo");
const g_data=document.getElementById("g_data");
const g_desc=document.getElementById("g_desc");
const g_valor=document.getElementById("g_valor");
const g_fotoInput=document.getElementById("g_fotoInput");
const g_fotoPreview=document.getElementById("g_fotoPreview");
const g_estadoEdicao=document.getElementById("g_estadoEdicao");
const g_totais=document.getElementById("g_totais");
const g_lista_compras=document.getElementById("g_lista_compras");
const g_lista_vendas=document.getElementById("g_lista_vendas");
let g_sel=null;
let g_workId=null;
let g_checked=new Set();
let g_fotoRef=null;

g_fotoInput && g_fotoInput.addEventListener("change", async ()=>{
  const f=(g_fotoInput.files||[])[0];
  if(!f) return;

  const rid = g_sel || g_workId || gerarID();
  g_workId = rid;

  // Conserva a foto anterior até o registo editado ser guardado.
  g_fotoRef = await storePhoto("fin", rid, 0, f);

  g_fotoInput.value="";
  await g_renderFoto();
  markDirty();
});


async function g_renderFoto(){
  g_fotoPreview.replaceChildren();
  if(!g_fotoRef){ const d=document.createElement("div"); d.className="small"; d.textContent="Sem foto."; g_fotoPreview.appendChild(d); return; }
  const img=document.createElement("img"); img.src=await resolvePhotoRef(g_fotoRef); img.style.maxWidth="160px"; img.style.maxHeight="120px";
  const del=document.createElement("button"); del.className="warn"; del.textContent="✖"; del.onclick=async ()=>{ if(!confirm("Remover foto?")) return; g_fotoRef=null; await g_renderFoto(); };
  g_fotoPreview.appendChild(img); g_fotoPreview.appendChild(del);
}

function g_limpar(){
  g_tipo.value="compra"; g_data.value=""; g_desc.value=""; g_valor.value="";
  g_sel=null; g_workId=null; g_checked.clear();
  g_estadoEdicao.textContent="";
  g_fotoRef=null;
  g_renderFoto();
  g_atualizar();
}

function g_guardar(){
  const tipo=g_tipo.value;
  const valor=parseFloat(String(g_valor.value||"").replace(",", "."));
  if(!isFinite(valor)) return alert("Indique o valor (€).");
  const reg={
    id: g_sel || g_workId || gerarID(),
    tipo,
    data: g_data.value||"",
    desc: (g_desc.value||"").trim(),
    valor: valor,
    foto: g_fotoRef || null
  };
  if(!data.fin) data.fin={compras:[],vendas:[]};
  const arr = (tipo==="venda") ? data.fin.vendas : data.fin.compras;
  const idx=arr.findIndex(x=>x.id===reg.id);
  const antigaFoto=idx>=0 ? arr[idx].foto : null;
  if(idx>=0) arr[idx]=reg; else arr.unshift(reg);
  g_sel=reg.id;
  g_workId=reg.id;
  g_estadoEdicao.textContent="✅ Registo guardado.";
  markDirty();
  g_atualizar();
  void removerFotosObsoletasDepoisDeGuardar(antigaFoto?[antigaFoto]:[], reg.foto?[reg.foto]:[]);
}

function g_atualizar(){
  if(!g_totais) return;
  const compras=data.fin?.compras||[];
  const vendas=data.fin?.vendas||[];
  const sumC=compras.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const sumV=vendas.reduce((s,r)=>s+(Number(r.valor)||0),0);
  g_totais.textContent = `Total compras: €${sumC.toFixed(2)} • Total vendas: €${sumV.toFixed(2)} • Saldo: €${(sumV-sumC).toFixed(2)}`;
  g_lista_compras.replaceChildren();
  g_lista_vendas.replaceChildren();

  const render=(arr,root)=>{
    if(!arr.length){ const d=document.createElement("div"); d.className="small"; d.textContent="Sem registos."; root.appendChild(d); return; }
    arr.forEach((r,idx)=>{
      const row=document.createElement("div"); row.className="list"+(r.id===g_sel?" active":"");
      const cab=document.createElement("div"); cab.className="cabecalho";
      const left=document.createElement("div");
      const chk=document.createElement("input"); chk.type="checkbox"; chk.checked=g_checked.has(r.id); chk.onclick=(ev)=>{ev.stopPropagation(); if(chk.checked) g_checked.add(r.id); else g_checked.delete(r.id);};
      left.appendChild(chk);
      const b=document.createElement("b"); b.textContent=`${idx+1}. €${Number(r.valor||0).toFixed(2)} — ${r.desc||"(sem descrição)"}`;
      left.appendChild(b);
      const meta=[];
      if(r.data) meta.push(`data: ${fmtDatePT(r.data)}`);
      if(r.foto) meta.push("📷");
      if(meta.length){ const sm=document.createElement("div"); sm.className="small"; sm.textContent=meta.join(" • "); left.appendChild(document.createElement("br")); left.appendChild(sm); }
      cab.appendChild(left);
      cab.onclick=async ()=>{
        g_sel=r.id;
        g_tipo.value=r.tipo||"compra";
        g_data.value=r.data||"";
        g_desc.value=r.desc||"";
        g_valor.value=(r.valor!=null)?String(r.valor):"";
        g_fotoRef=r.foto||null;
        await g_renderFoto();
        g_atualizar();
      };
      row.appendChild(cab);
      root.appendChild(row);
    });
  };
  render(compras,g_lista_compras);
  render(vendas,g_lista_vendas);
}

function g_apagarSelecionados(){
  const ids = g_checked.size ? Array.from(g_checked) : (g_sel ? [g_sel] : []);
  if(!ids.length) return alert("Selecione (ou marque) um registo.");
  if(!confirm(ids.length>1?`Apagar ${ids.length} registos?`:"Apagar o registo selecionado?")) return;
  if(!data.fin) data.fin={compras:[],vendas:[]};
  data.fin.compras=(data.fin.compras||[]).filter(r=>!ids.includes(r.id));
  data.fin.vendas=(data.fin.vendas||[]).filter(r=>!ids.includes(r.id));
  g_checked.clear(); g_sel=null;
  markDirty();
  g_limpar();
}




// ===================== PDF rápido por separador =====================
async function n_printPDF(){
  const includePhotos = (document.getElementById('n_pdf_photos')?.value || 'no') === 'yes';
  const janelaRel=window.open('','_blank');
  if(!janelaRel) return alert('O browser bloqueou o relatório. Permita pop-ups para esta aplicação.');
  janelaRel.document.body.textContent='A preparar notas…';
  const esc = (s)=> String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const nl2br = (s)=> esc(s).replace(/\n/g,"<br>");

  const culturaNome = (cid)=>{
    const c = (data.culturas||[]).find(x=>x.id===cid);
    if(!c) return '—';
    return `${c.familia} — ${c.especie}${c.variedade?(' / '+c.variedade):''}`;
  };

  const joinMaybe = (v)=>{
    if(Array.isArray(v)) return v.filter(hasText).join(", ");
    return hasText(v) ? String(v) : "";
  };

  const list = Array.isArray(data.notas) ? [...data.notas] : [];
  list.sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));

  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Notas</title>
  <style>
    body{font-family:Arial, sans-serif; padding:18px;}
    h1{margin:0 0 8px; color:#1b5e20;}
    table{width:100%; border-collapse:collapse; margin-top:8px;}
    th,td{border:1px solid #ddd; padding:6px; vertical-align:top; font-size:12px;}
    th{background:#f4f6f4;}
    .photos img{width:120px; height:120px; object-fit:cover; margin:4px; border:1px solid #ddd; border-radius:8px;}
    .small{color:#444; font-size:12px;}
    @media print{ button{display:none;} }
  </style>
  </head><body>
  <h1>📝 Notas</h1>
  <div class="small">Gerado em ${new Date().toLocaleString()}</div>
  `;

  html += `<table><thead><tr>
    <th>Data</th><th>Assunto</th><th>Parcelas</th><th>Culturas</th><th>Espécies</th><th>Texto</th><th>Fotos</th>
  </tr></thead><tbody>`;

  for(const n of list){
    const parcelas = joinMaybe(n.parcelas) || '—';
    const cults = (n.culturaIds||[]).map(culturaNome).join("; ") || '—';
    const especies = Array.isArray(n.especies) ? n.especies.map(x=>{
      const [fam,esp] = String(x).split("||");
      return fam && esp ? `${fam} — ${esp}` : String(x);
    }).join("; ") : (n.especies||"—");

    let photosHtml = '—';
    if(includePhotos && Array.isArray(n.fotos) && n.fotos.length){
      const imgs=[];
      for(const ref of n.fotos){
        const durl = await _photoRefToDataUrl(ref);
        if(durl) imgs.push(`<img src="${durl}">`);
      }
      if(imgs.length) photosHtml = `<div class="photos">${imgs.join('')}</div>`;
    }

    html += `<tr>
      <td>${esc(n.data||'—')}</td>
      <td>${esc(n.assunto||'—')}</td>
      <td>${esc(parcelas)}</td>
      <td>${esc(cults)}</td>
      <td>${esc(especies||'—')}</td>
      <td>${hasText(n.texto)?nl2br(n.texto):'—'}</td>
      <td>${photosHtml}</td>
    </tr>`;
  }
  html += `</tbody></table></body></html>`;

  rel_abrirDocumento(html, 'Notas', janelaRel);
}

async function g_printPDF(){
  const includePhotos = (document.getElementById('g_pdf_photos')?.value || 'no') === 'yes';
  const janelaRel=window.open('','_blank');
  if(!janelaRel) return alert('O browser bloqueou o relatório. Permita pop-ups para esta aplicação.');
  janelaRel.document.body.textContent='A preparar gestão financeira…';
  const esc = (s)=> String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const compras = Array.isArray(data.fin?.compras) ? [...data.fin.compras] : [];
  const vendas = Array.isArray(data.fin?.vendas) ? [...data.fin.vendas] : [];
  compras.sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));
  vendas.sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));

  const total = (arr)=> arr.reduce((s,r)=> s + (parseFloat(r.valor)||0), 0);
  const totC = total(compras);
  const totV = total(vendas);
  const saldo = totV - totC;

  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Gestão €</title>
  <style>
    body{font-family:Arial, sans-serif; padding:18px;}
    h1{margin:0 0 8px; color:#1b5e20;}
    table{width:100%; border-collapse:collapse; margin-top:8px;}
    th,td{border:1px solid #ddd; padding:6px; vertical-align:top; font-size:12px;}
    th{background:#f4f6f4;}
    .photos img{width:120px; height:120px; object-fit:cover; margin:4px; border:1px solid #ddd; border-radius:8px;}
    .small{color:#444; font-size:12px;}
    @media print{ button{display:none;} }
  </style>
  </head><body>
  <h1>💶 Gestão €</h1>
  <div class="small">Gerado em ${new Date().toLocaleString()}</div>
  <div class="small" style="margin-top:6px"><b>Total compras:</b> ${totC.toFixed(2)} € • <b>Total vendas:</b> ${totV.toFixed(2)} € • <b>Saldo:</b> ${saldo.toFixed(2)} €</div>
  `;

  const renderTable = async (title, arr)=>{
    let out = `<h2 style="margin:18px 0 6px">${title}</h2>`;
    out += `<table><thead><tr><th>Data</th><th>Descrição</th><th>Valor (€)</th><th>Foto</th></tr></thead><tbody>`;
    for(const r of arr){
      let photoHtml = '—';
      if(includePhotos && r.foto){
        const durl = await _photoRefToDataUrl(r.foto);
        if(durl) photoHtml = `<div class="photos"><img src="${durl}"></div>`;
      }
      out += `<tr><td>${esc(r.data||'—')}</td><td>${esc(r.desc||'—')}</td><td>${esc((r.valor!=null)?String(r.valor):'—')}</td><td>${photoHtml}</td></tr>`;
    }
    out += `</tbody></table>`;
    return out;
  };

  html += await renderTable("Compras", compras);
  html += await renderTable("Vendas", vendas);
  html += `</body></html>`;

  rel_abrirDocumento(html, 'Gestão financeira', janelaRel);
}

// Garantir que selects/listas de Notas e Gestão € ficam preenchidos após o init (evita "select vazio" em alguns browsers)
setTimeout(()=>{
  try{ n_refreshCulturasSelect(); n_refreshEspeciesSelect(); n_atualizar(); }catch(_e){}
  try{ g_atualizar(); }catch(_e){}
}, 0);
