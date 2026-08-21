const $=id=>document.getElementById(id);
const state={
  // A fresh app launch always starts a NEW chat; the previous one is already
  // persisted in the Recent list. Restoring the old session here made the app
  // reopen the last chat instead of a fresh one.
  messages:[],
  models:JSON.parse(localStorage.getItem("models")||"[]"),
  selected:localStorage.getItem("model")||"",
  base:localStorage.getItem("base")||"",
  key:localStorage.getItem("key")||"",
  summary:localStorage.getItem("summary")||"",
  settings:JSON.parse(localStorage.getItem("settings")||'{"input":128000,"output":6000,"auto":true,"threshold":80}'),
  modelContext:JSON.parse(localStorage.getItem("modelContext")||"{}"),
  attachments:[],
  projectName:"",
  wsEnabled:localStorage.getItem("wsEnabled")==="1",
  searchOllama:localStorage.getItem("searchOllama")==="1",
  searchProvider:localStorage.getItem("searchProvider")||"auto",
  ollamaKey:localStorage.getItem("ollamaKey")||"",
  sessions:JSON.parse(localStorage.getItem("sessions")||"[]"),
  projects:JSON.parse(localStorage.getItem("projects")||"[]")
};

function save(){
  try{
    localStorage.setItem("messages",JSON.stringify(state.messages));
  }catch(e){
    // Images blow past the ~5MB localStorage quota. Degrade gracefully:
    // newest messages keep images, older ones keep only names, so history survives.
    let msgs=state.messages.slice();
    let ok=false;
    for(let drop=0;drop<msgs.length&&!ok;drop++){
      const attempt=msgs.map((m,i)=>i<msgs.length-1-drop?{...m,attachments:(m.attachments||[]).map(a=>({name:a.name,kind:a.kind}))}:m);
      try{localStorage.setItem("messages",JSON.stringify(attempt));ok=true}catch(_){}
    }
    if(!ok){
      try{localStorage.setItem("messages","[]")}catch(_){}
    }
  }
  localStorage.setItem("models",JSON.stringify(state.models));
  localStorage.setItem("model",state.selected);
  localStorage.setItem("base",state.base);
  localStorage.setItem("key",state.key);
  localStorage.setItem("summary",state.summary);
  localStorage.setItem("settings",JSON.stringify(state.settings));
  localStorage.setItem("modelContext",JSON.stringify(state.modelContext));
  localStorage.setItem("wsEnabled",state.wsEnabled?"1":"0");
  localStorage.setItem("searchOllama",state.searchOllama?"1":"0");
  localStorage.setItem("searchProvider",state.searchProvider);
  localStorage.setItem("ollamaKey",state.ollamaKey);
  localStorage.setItem("sessions",JSON.stringify(state.sessions));
  localStorage.setItem("projects",JSON.stringify(state.projects));
}

/* ── System banner (non-chat status messages) ── */
function showBanner(text){
  hideBanner();
  const chat=$("chat");
  chat.insertAdjacentHTML("beforeend",`<div class="sys-banner" id="sysBanner"><svg><use href="#i-check"/></svg><span>${esc(text)}</span></div>`);
  chat.scrollTop=chat.scrollHeight;
}
function hideBanner(){const b=$("sysBanner");if(b)b.remove()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function md(s,opts={}){
  const blocks=[];
  const placeholder=html=>{const i=blocks.length;blocks.push(html);return `\u0000${i}\u0000`};
  let t=String(s||"");
  // Extract reasoning BEFORE escaping so raw tags never leak into the bubble.
  // Known thinking-tag pairs: extend this list as new models appear.
  const THINK_TAGS=[["think","think"],["thinking","thinking"],["reasoning","reasoning"],["thought","thought"]];
  for(const [open,close] of THINK_TAGS){
    const re=new RegExp(`<${open}(\\s[^>]*)?>\s*([\s\S]*?)\s*</${close}(\s[^>]*)?>`,"gi");
    t=t.replace(re,(_,__,thought)=>
      placeholder(`<details class="reasoning-block"><summary><span class="reasoning-label">Reasoning</span><span class="reasoning-time">Thought for ${formatReasoningTime(opts.reasoningDurationMs)}</span></summary><pre>${esc(thought.trim())}</pre></details>`));
    // Truncated/dangling tag: strip the tag itself, keep the text out of the UI.
    t=t.replace(new RegExp(`</?${open}(\\s[^>]*)?>`,"gi"),"");
  }
  let x=esc(t);
  x=x.replace(/```([\w+-]*)\n?([\s\S]*?)```/g,(_,lang,code)=>placeholder(`<pre class="code-block">${lang?`<div class="code-lang">${esc(lang)}</div>`:""}<code>${code.replace(/\n$/,"")}</code></pre>`));
  x=x.replace(/`([^`\n]+)`/g,(_,code)=>placeholder(`<code class="inline-code">${code}</code>`));
  const lines=x.split("\n");let out=[],inUl=false,inOl=false;
  const closeLists=()=>{if(inUl){out.push("</ul>");inUl=false}if(inOl){out.push("</ol>");inOl=false}};
  for(const line of lines){
    if(!line.trim()){closeLists();continue}
    let m=line.match(/^\s*[-*+]\s+(.+)$/);if(m){if(!inUl){closeLists();out.push("<ul>");inUl=true}out.push("<li>"+m[1]+"</li>");continue}
    m=line.match(/^\s*\d+[.)]\s+(.+)$/);if(m){if(!inOl){closeLists();out.push("<ol>");inOl=true}out.push("<li>"+m[1]+"</li>");continue}
    closeLists();
    if(/^###\s+/.test(line)){out.push("<h3>"+line.replace(/^###\s+/,"")+"</h3>");continue}
    if(/^##\s+/.test(line)){out.push("<h2>"+line.replace(/^##\s+/,"")+"</h2>");continue}
    if(/^#\s+/.test(line)){out.push("<h1>"+line.replace(/^#\s+/,"")+"</h1>");continue}
    if(/^>\s?/.test(line)){out.push("<blockquote>"+line.replace(/^>\s?/,"")+"</blockquote>");continue}
    out.push("<p>"+line+"</p>");
  }
  closeLists();
  let html=out.join("");
  html=html.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>").replace(/__([^_\n]+)__/g,"<strong>$1</strong>");
  html=html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,"<em>$1</em>").replace(/(?<!_)_([^_\n]+)_(?!_)/g,"<em>$1</em>");
  html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  html=html.replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[Number(i)]);
  return '<div class="markdown">'+html+"</div>";
}
function formatReasoningTime(ms){
  const sec=Math.max(1,Math.round((Number(ms)||0)/1000));
  return sec+"s";
}
/* Splits hidden reasoning out of a raw model response. Same tag list as md()/strip(). */
function extractReasoning(text){
  const TAGS=[["think","think"],["thinking","thinking"],["reasoning","reasoning"],["thought","thought"]];
  let thinking="";
  let rest=String(text||"");
  for(const [open,close] of TAGS){
    const re=new RegExp(`<${open}(\\s[^>]*)?>\s*([\s\S]*?)\s*</${close}(\s[^>]*)?>`,"gi");
    rest=rest.replace(re,(_,__,thought)=>{thinking+=thought.trim()+"\n";return ""});
    rest=rest.replace(new RegExp(`</?${open}(\\s[^>]*)?>`,"gi"),"");
  }
  return {thinking:thinking.trim(),rest:rest.trim()};
}
function welcomeHtml(){
  const projectSub=state.projectName?"Connected: "+esc(state.projectName):"Continue coding";
  return `<section id="welcome" class="welcome">
    <div class="star"><svg><use href="#i-moon"/></svg></div>
    <h1>Hello, night owl</h1>
    <p>Your local AI coding workspace</p>
    <button class="quick" id="newChat">
      <span class="quick-ico"><svg><use href="#i-plus"/></svg></span>
      <span class="quick-text"><b>New chat</b><small>Start a fresh conversation</small></span>
      <span class="quick-arrow"><svg><use href="#i-arrow-r"/></svg></span>
    </button>
    <button class="quick" id="openProjectCard">
      <span class="quick-ico"><svg><use href="#i-folder"/></svg></span>
      <span class="quick-text"><b>Open project</b><small id="openProjectSub">${projectSub}</small></span>
      <span class="quick-arrow"><svg><use href="#i-arrow-r"/></svg></span>
    </button>
  </section>`;
}
function messageHtml(m){
  const files=(m.attachments||[]).map(a=>{
    if(a.kind==="image"&&a.dataUrl)return `<div class="file-card image-card"><img src="${a.dataUrl}"><span class="file-name">${esc(a.name)}</span></div>`;
    const meta=a.kind==="image"?"image":(a.mime||"file");
    return `<div class="file-card"><svg><use href="#i-file"/></svg><span class="file-name">${esc(a.name)}</span><small>${esc(meta)}</small></div>`;
  }).join("");
  const showBubble=m.text||m.role!=="user";
  if(!showBubble)return `<div class="message ${m.role}">${files}</div>`;
  const tools=(m.tools||[]).map(t=>`<details class="tool-activity compact"><summary class="tool-activity-head"><div class="tool-activity-icon sm">${toolIcon(t.name)}</div><div class="tool-activity-text"><div class="tool-activity-title">${esc(toolCompactLabel(t))}</div></div><div class="reasoning-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></div></summary><div class="tool-preview">${toolPreview(t.name,t.input,t.result)}</div></details>`).join("");
  const time=m.ts?`<div class="msg-time">${new Date(m.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>`:"";
  // Thinking arrives as its own field (collected from the API's thinking blocks) —
  // rendered as an agent-style collapsible card ABOVE the bubble. Never merged
  // into m.text, never regex-split. Legacy chats (saved before this field existed)
  // still carry <think>…</think> inside m.text — fallback extracts it once.
  let reasoningHtml="";
  if(m.role==="assistant"){
    let thinking=m.thinking;
    if(!thinking){
      const legacy=extractReasoning(m.text);
      if(legacy.thinking)thinking=legacy.thinking;
    }
    if(thinking){
      const dur=m.reasoning?formatReasoningTime(m.reasoning):null;
      reasoningHtml=`<details class="tool-activity reasoning-card"><summary class="tool-activity-head"><div class="tool-activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a4.5 4.5 0 0 0-4.5 4.5c0 .7.2 1.4.5 2A4 4 0 0 0 5 13.5 4 4 0 0 0 9 17.5h.5A3.5 3.5 0 0 0 12 20a3.5 3.5 0 0 0 2.5-2.5H15a4 4 0 0 0 4-4 4 4 0 0 0-3-3.8c.3-.6.5-1.3.5-2A4.5 4.5 0 0 0 12 3z"/></svg></div><div class="tool-activity-text"><div class="tool-activity-title">Thinking</div><div class="tool-activity-sub">Thought for ${dur||"a moment"}</div></div><div class="reasoning-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></div></summary><div class="tool-preview"><pre>${esc(thinking)}</pre></div></details>`;
    }
  }
  const bodyText=m.text;
  const bubbleHtml=m.role==="assistant"?md(bodyText,{reasoningDurationMs:m.reasoning}):esc(m.text||"");
  if(m.role==="assistant"){
    console.log("[NightCode] rendered assistant msg html "+JSON.stringify({hasReasoningCard:reasoningHtml.length>0,reasoningHtmlPrefix:reasoningHtml.slice(0,120),bubbleHtml:bubbleHtml.slice(0,120),mText:m.text.slice(0,200)}));
  }
  return `<div class="message ${m.role}">${files}${tools}${reasoningHtml}<div class="bubble">${bubbleHtml}</div>${time}</div>`;
}
function render(){
  const chat=$("chat");
  if(!state.messages.length){
    chat.innerHTML=welcomeHtml();
    $("newChat").onclick=()=>newChat();
    return;
  }
  chat.innerHTML=state.messages.map(messageHtml).join("");
  chat.scrollTop=chat.scrollHeight;
}
function showTyping(){
  removeTyping();
  const chat=$("chat");
  chat.insertAdjacentHTML("beforeend",'<div class="message assistant" id="typing"><div class="assistant-activity"><span class="activity-dots"><i></i><i></i><i></i></span><span>Reasoning…</span></div></div>');
  chat.scrollTop=chat.scrollHeight;
}
function removeTyping(){const t=$("typing");if(t)t.remove()}

/* ── Native HTTP bridge (bypasses CORS entirely: no origin, no preflight) ── */
const httpCbs={};let httpCbId=0;
window.__httpResult=function(cbId,status,body,error){
  const cb=httpCbs[cbId];if(!cb)return;
  delete httpCbs[cbId];
  cb({status,body,error:!!error});
};
function httpFetch(method,url,headers={},body){
  return new Promise(resolve=>{
    if(!window.Android||!Android.httpRequest){
      // Browser fallback (dev in a normal browser): plain fetch with full error detail.
      fetch(url,{method,headers,body:body||undefined})
        .then(async r=>resolve({status:r.status,body:await r.text(),error:false}))
        .catch(e=>resolve({status:0,body:String(e&&e.message||e),error:true}));
      return;
    }
    const cbId="http"+(++httpCbId);
    httpCbs[cbId]=resolve;
    try{Android.httpRequest(method,url,JSON.stringify(headers),body||"",cbId)}
    catch(e){delete httpCbs[cbId];resolve({status:0,body:String(e&&e.message||e),error:true})}
  });
}

/* ── Android filesystem bridge ─────── */
const fsCbs={};let fsCbId=0;
window.__fsResult=function(cbId,result,error){
  const cb=fsCbs[cbId];if(!cb)return;
  delete fsCbs[cbId];
  cb(result,error);
};
function fsCall(method,...args){
  return new Promise(resolve=>{
    if(!window.Android||!Android[method]){resolve("NO_BRIDGE",true);return}
    const cbId="fs"+(++fsCbId);
    fsCbs[cbId]=(result,error)=>resolve({result,error:!!error});
    try{Android[method](...args,cbId)}catch(e){delete fsCbs[cbId];resolve({result:String(e),error:true})}
  });
}
async function openProject(){
  if(window.Android&&Android.openProjectPicker){Android.openProjectPicker()}
  else alert("Project folders are available in the Android app.");
}
window.__onProjectPicked=function(name){
  if(name){
    state.projectName=name;
    showBanner("Connected to project: "+name);
  }else{
    // User cancelled the picker: keep previous state, no fake "connected" notice.
  }
  render();
};
window.__onWorkspacePicked=function(name){
  if(name){
    state.wsEnabled=true;
    showBanner("Workspace: "+name);
  }
  updateWorkspaceUI();
  save();
};
function updateWorkspaceUI(){
  const st=$("workspaceStatus");if(!st)return;
  const has=window.Android&&Android.hasWorkspace&&Android.hasWorkspace();
  st.innerHTML=has?"📁 "+esc(Android.getWorkspaceName()):"Not set";
  st.classList.toggle("on",!!has);
  $("wsEnabled").checked=state.wsEnabled;
  $("wsPick").style.display=state.wsEnabled?"":"none";
  $("wsClear").style.display=has?"":"none";
}
window.__onFilesPicked=function(files){
  if(!files||!files.length)return;
  for(const f of files){
    const isImage=/\.(png|jpe?g|webp|gif)$/i.test(f.name);
    if(isImage){
      const mime=guessMime(f.name);
      state.attachments.push({name:f.name,kind:"image",data:f.b64,dataUrl:`data:${mime};base64,${f.b64}`});
    }else{
      state.attachments.push({name:f.name,kind:"text",data:f.b64});
    }
  }
  renderAttachments();
};
function initProjectState(){
  if(window.Android&&Android.hasProject&&Android.hasProject()){
    state.projectName=Android.getProjectName?Android.getProjectName():"project";
  }else{
    state.projectName=localStorage.getItem("projectName")||"";
  }
}
/* ── Recent chats: persisted per session ── */
function getChats(){try{return JSON.parse(localStorage.getItem("chats")||"[]")}catch(e){return[]}}
function setChats(chats){
  try{localStorage.setItem("chats",JSON.stringify(chats))}
  catch(e){
    // Quota: drop oldest chats until it fits (attachments are already stripped).
    while(chats.length>1){chats.pop();try{localStorage.setItem("chats",JSON.stringify(chats));return}catch(_){}}
  }
}
function saveCurrentChat(){
  if(!state.messages.length)return;
  const chats=getChats();
  const sid=currentSessionId();
  const firstUser=(state.messages.find(m=>m.role==="user")||{}).text||"Chat";
  const record={
    id:sid,
    title:String(firstUser).replace(/[\n\r]+/g," ").slice(0,48),
    updatedAt:Date.now(),
    summary:state.summary,
    // Strip base64/dataUrl payloads — only names/kinds survive in the list.
    messages:state.messages.map(m=>({...m,attachments:(m.attachments||[]).map(a=>({name:a.name,kind:a.kind}))}))
  };
  const idx=chats.findIndex(c=>c.id===sid);
  if(idx>=0)chats[idx]=record;else chats.unshift(record);
  setChats(chats);
}
function formatChatTime(ts){
  const d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString([],{day:"numeric",month:"short"});
}
function loadChat(id){
  const c=getChats().find(x=>x.id===id);if(!c)return;
  state.messages=c.messages||[];state.summary=c.summary||"";state.attachments=[];
  localStorage.setItem("currentSession",id);
  save();render();renderAttachments();
  $("closeDrawer").click();
}
function renderRecent(){
  const box=$("recent");if(!box)return;
  const chats=getChats().sort((a,b)=>b.updatedAt-a.updatedAt);
  if(!chats.length){
    box.innerHTML='<div class="recent-empty"><svg><use href="#i-chat"/></svg>No saved chats yet</div>';
    return;
  }
  box.innerHTML=chats.map(c=>`<button class="recent-chat" onclick="loadChat('${c.id}')"><span class="chat-dot"></span><span class="recent-chat-main"><span class="recent-chat-title">${esc(c.title)}</span><span class="recent-chat-time">${formatChatTime(c.updatedAt)}</span></span></button>`).join("");
}
function addMessage(role,text,attachments=[]){
  state.messages.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),role,text,attachments,ts:Date.now()});
  save();saveCurrentChat();render();
}
function renderAttachments(){
  $("attachments").innerHTML=state.attachments.map((a,i)=>{
    const thumb=a.kind==="image"&&a.dataUrl?`<img src="${a.dataUrl}">`:'<svg><use href="#i-file"/></svg>';
    return `<div class="attachment">${thumb}<span>${esc(a.name)}</span><button onclick="removeAttachment(${i})" aria-label="Remove"><svg><use href="#i-close"/></svg></button></div>`;
  }).join("");
}
function removeAttachment(i){state.attachments.splice(i,1);renderAttachments()}
function openFiles(){
  if(window.Android&&Android.openFilePicker)Android.openFilePicker();
  else alert("File picker is available in the Android app.");
  closeSheets();
}
function openSheet(id){
  closeSheets();
  $(id).classList.add("open");
  $("sheetScrim").classList.add("open");
}
function closeSheets(){
  document.querySelectorAll(".sheet").forEach(s=>s.classList.remove("open"));
  $("sheetScrim").classList.remove("open");
}
function provider(id){
  id=id.toLowerCase();
  if(id.includes("claude")||id.includes("anthropic"))return"anthropic";
  if(id.includes("gpt")||id.includes("openai"))return"openai";
  if(id.includes("gemini"))return"google";
  if(id.includes("qwen"))return"qwen";
  if(id.includes("glm")||id.includes("zai"))return"zai";
  if(id.includes("deepseek"))return"deepseek";
  if(id.includes("llama"))return"meta";
  if(id.includes("mistral"))return"mistral";
  if(id.includes("grok"))return"xai";
  return"custom";
}
function renderModels(){
  const box=$("models");
  if(!state.models.length){box.innerHTML='<div class="empty-models">No models loaded.<br>Add a Base URL and API key in Settings.</div>';return}
  box.innerHTML=state.models.map(m=>{
    const p=m.provider||provider(m.id);
    const sel=m.id===state.selected;
    return `<button class="model-item ${sel?"selected":""}" onclick="selectModel('${encodeURIComponent(m.id)}')">
      <div class="model-icon p-${p}">${esc(p[0].toUpperCase())}</div>
      <div><div class="model-name">${esc(m.name||m.id)}</div><div class="model-provider">${esc(p)}</div></div>
      ${state.modelContext&&state.modelContext[m.id]?`<span class="ctx-badge" title="Custom context settings">${fmtTokens(state.modelContext[m.id].input)}/${fmtTokens(state.modelContext[m.id].output)}</span>`:""}
      ${sel?'<span class="row-arrow" style="margin-left:auto;color:#93a5ff"><svg><use href="#i-check"/></svg></span>':""}
    </button>`;
  }).join("");
}
function updateModelBtn(){$("modelBtn").textContent=state.selected||"Model"}
function fmtTokens(n){
  n=Number(n)||0;
  if(n>=1000)return Math.round(n/1000)+"k";
  return String(n);
}
/* Effective context/output limits: per-model override wins, global defaults otherwise. */
function getCtxLimits(){
  const ov=state.modelContext&&state.selected?state.modelContext[state.selected]:null;
  return ov?{input:ov.input,output:ov.output}:state.settings;
}
function isModelOverridden(){
  return !!(state.modelContext&&state.selected&&state.modelContext[state.selected]);
}
function selectModel(id){state.selected=decodeURIComponent(id);save();updateModelBtn();closeSheets()}
async function fetchModels(closeOnSuccess=false){
  $("settingsError").textContent="";
  if(!state.base){$("settingsError").textContent="Base URL is empty.";return}
  try{
    const r=await httpFetch("GET",state.base.replace(/\/$/,"")+"/v1/models",{"x-api-key":state.key,"anthropic-version":"2023-06-01"});
    if(r.error)throw Error("Network: "+r.body.slice(0,300));
    if(r.status<200||r.status>=300)throw Error(r.body.slice(0,600));
    const data=JSON.parse(r.body).data||[];
    state.models=data.map(x=>({id:x.id,name:x.display_name||x.id,provider:provider(x.id)}));
    if(!state.selected&&state.models[0])state.selected=state.models[0].id;
    save();renderModels();updateModelBtn();
    if(closeOnSuccess)closeSheets();
  }catch(e){$("settingsError").textContent=e.message||"Refresh failed"}
}
async function send(){
  const input=$("input");const prompt=input.value.trim();
  if(!prompt&&!state.attachments.length)return;
  if(!state.base||!state.key||!state.selected){openSheet("settingsSheet");$("baseUrl").value=state.base;$("apiKey").value=state.key;return}
  const at=[...state.attachments];
  input.value="";resizeInput();state.attachments=[];renderAttachments();
  addMessage("user",prompt,at);
  $("sendBtn").disabled=true;
  showTyping();
  const started=Date.now();
  try{
    compactIfNeeded();
    // History must never contain thinking blocks — models reject foreign tags on the way back.
    const THINK_STRIP=[["think","think"],["thinking","thinking"],["reasoning","reasoning"],["thought","thought"]];
    const strip=t=>{
      let s=String(t||"");
      for(const [open,close] of THINK_STRIP){
        s=s.replace(new RegExp(`<${open}(\\s[^>]*)?>[\s\S]*?</${close}(\s[^>]*)?>`,"gi"),"");
        s=s.replace(new RegExp(`</?${open}(\\s[^>]*)?>`,"gi"),"");
      }
      return s.trim();
    };
    // History: everything before the current turn, text-only (attachments were sent in their own turns).
    const history=state.messages.slice(0,-1)
      .map(m=>({role:m.role,content:strip(m.text)}))
      .filter(m=>m.content);
    const messages=[];
    for(const m of history){
      const prev=messages[messages.length-1];
      if(prev&&prev.role===m.role){prev.content+="\n\n"+m.content}  // merge adjacent same-role turns
      else messages.push(m);
    }
    messages.push({role:"user",content:buildUserContent(prompt,at)});
    const proj=hasProject();
    const system=(proj
      ?"You are NightCode, a local AI coding agent. You work on the user's selected project through tools. Be concise. Inspect files before changing them. Use write_file for actual edits. Do not claim a change was made unless the tool succeeded. Use web_search whenever fresh information would help (docs, versions, errors)."
      :"You are NightCode, a helpful AI assistant. There is no project folder connected, so do not assume access to local files. You have the web_search tool — use it whenever the question benefits from current information (documentation, news, library APIs, recent releases) and cite source URLs in your answer.")
      +(state.summary?`\nConversation summary:\n${state.summary}\nContinue the same conversation.`:"");
    let final="";const toolCalls=[];let allThinking="";
    for(let turn=0;turn<8;turn++){
      const lim=getCtxLimits();
      const body={model:state.selected,max_tokens:Number(lim.output)||6000,system,messages};
      // Web tools always available; file tools only with a connected project.
      const webTools=(state.searchProvider!=="free"&&state.ollamaKey)?[WEB_SEARCH_TOOL,WEB_FETCH_TOOL]:[WEB_SEARCH_TOOL];
      body.tools=proj?[...FILE_TOOLS,...webTools]:webTools;
      const reqUrl=state.base.replace(/\/$/,"")+"/v1/messages";
      let r;
      r=await httpFetch("POST",reqUrl,{"content-type":"application/json","x-api-key":state.key,"anthropic-version":"2023-06-01"},JSON.stringify(body));
      if(r.error)throw Error("Network: "+r.body.slice(0,1000));
      const txt=r.body;
      console.log("[NightCode] /v1/messages response "+JSON.stringify({
        url:reqUrl,model:state.selected,modelInBody:body.model,
        status:r.status,statusText:"",
        contentType:"",
        bodyLength:txt.length,bodyPreview:txt.slice(0,2000)
      }));
      if(r.status<200||r.status>=300)throw Error(txt.slice(0,1000));
      const data=JSON.parse(txt);
      console.log("[NightCode] response content blocks "+JSON.stringify((data.content||[]).map(x=>({type:x.type,hasText:!!x.text,hasThinking:!!(x.thinking||x.reasoning_content)}))));
      const content=data.content||[];
      const toolUses=content.filter(x=>x.type==="tool_use");
      // Hidden reasoning arrives in different shapes depending on the backend:
      // Anthropic-style content blocks of type "thinking", or OpenAI-style
      // choices[0].message.reasoning_content. Collect it and wrap in <think> so
      // md() renders the collapsible reasoning block.
      let reasoning="";
      for(const item of content){
        if(item.type==="thinking")reasoning+=(item.thinking||item.text||"")+"\n";
        if(item.reasoning_content)reasoning+=item.reasoning_content+"\n";
      }
      const altMsg=data.choices&&data.choices[0]&&data.choices[0].message;
      if(!reasoning&&altMsg&&altMsg.reasoning_content)reasoning=altMsg.reasoning_content;
      // Keep thinking and answer SEPARATE: no <think>-wrapping into one string.
      // Re-merging and re-splitting breaks whenever the reasoning itself contains
      // angle brackets or quotes — the reason thinking kept leaking into bubbles.
      const text=content.filter(x=>x.type==="text").map(x=>x.text).join("\n");
      if(reasoning)allThinking+=(allThinking?"\n\n":"")+reasoning.trim();
      if(text)final+=(final?"\n\n":"")+text;
      if(!toolUses.length)break;
      messages.push({role:"assistant",content});
      const results=[];
      for(const u of toolUses){
        const activity=showToolActivity(u.name,u.input||{});
        let out,err=false;
        try{
          const res=await runTool(u.name,u.input||{});
          out=res.result;err=res.error;
          activity.update(out,err);
        }catch(e){out=String(e.message||e);err=true;activity.update(out,true)}
        toolCalls.push({name:u.name,input:u.input||{},result:String(out),error:err});
        results.push({type:"tool_result",tool_use_id:u.id,is_error:err,content:String(out)});
      }
      messages.push({role:"user",content:results});
      showTyping();
    }
    removeTyping();
    // When the model burns its whole budget on thinking and returns no text,
    // surface an honest explanation instead of a dead "(empty response)" bubble.
    const finalText=final.trim()||"Модель не дала текстового ответа — возможно, лимит токенов исчерпан на размышления или тулах. Попробуй ещё раз или упрости запрос.";
    addMessage("assistant",finalText,[]);
    const last=state.messages[state.messages.length-1];
    last.reasoning=Date.now()-started;
    if(allThinking.trim())last.thinking=allThinking.trim();
    if(toolCalls.length)last.tools=toolCalls;
    save();render();
  }catch(e){
    removeTyping();
    console.error("[NightCode] send failed "+JSON.stringify({name:e&&e.name,message:String(e&&e.message||e).slice(0,1500),stack:String(e&&e.stack||"").slice(0,800)}));
    addMessage("assistant","Error: "+(e.message||e));
  }
  finally{$("sendBtn").disabled=false}
}
function compactIfNeeded(){
  if(!state.settings.auto)return;
  const lim=getCtxLimits();
  const estimate=state.messages.reduce((n,m)=>n+(m.text||"").length,0)/4;
  if(estimate>Number(lim.input)*Number(state.settings.threshold)/100)compactNow(false);
}
function compactNow(show=true){
  if(state.messages.length<8){if(show)alert("Not enough messages to compact.");return}
  const old=state.messages.slice(0,-4).map(m=>`${m.role}: ${(m.text||"").slice(0,900)}`).join("\n");
  state.summary=(state.summary+"\n"+old).slice(-12000);
  state.messages=state.messages.slice(-4);save();render();if(show)closeSheets();
}
function b64ToText(b64){
  try{
    const bin=atob(b64);
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    return new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  }catch(e){return ""}
}
function guessMime(name){
  const ext=(name.split(".").pop()||"").toLowerCase();
  return ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"}[ext])||"image/png";
}
function buildUserContent(prompt,attachments){
  const content=[];
  if(prompt)content.push({type:"text",text:prompt});
  for(const a of attachments||[]){
    if(a.kind==="image"&&a.data){
      content.push({type:"image",source:{type:"base64",media_type:guessMime(a.name),data:a.data}});
    }else if(a.data){
      content.push({type:"text",text:"Attached file: "+a.name+"\n\n"+b64ToText(a.data).slice(0,50000)});
    }else{
      content.push({type:"text",text:"Attached file: "+a.name});
    }
  }
  return content;
}

/* ── Agent tool execution via Android FS bridge ── */
const FILE_TOOLS=[
  {name:"list_files",description:"List files in the connected project folder.",input_schema:{type:"object",properties:{},required:[]}},
  {name:"read_file",description:"Read a text file from the project.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}},
  {name:"search_files",description:"Search text inside project files. Use this before editing to find symbols or references.",input_schema:{type:"object",properties:{query:{type:"string"},path:{type:"string"}},required:["query"]}},
  {name:"write_file",description:"Create or replace a text file in the project.",input_schema:{type:"object",properties:{path:{type:"string"},content:{type:"string"}},required:["path","content"]}},
  {name:"create_directory",description:"Create a directory in the project.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}},
  {name:"rename_file",description:"Rename or move a file within the project.",input_schema:{type:"object",properties:{from:{type:"string"},to:{type:"string"}},required:["from","to"]}},
  {name:"delete_file",description:"Delete a file from the project. Only use when the user explicitly asks for deletion.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}}
];
const WEB_SEARCH_TOOL={name:"web_search",description:"Search the web for current information: documentation, recent events, library APIs, error messages. Returns titles, snippets and URLs.",input_schema:{type:"object",properties:{query:{type:"string",description:"Search query"}},required:["query"]}};
const WEB_FETCH_TOOL={name:"web_fetch",description:"Fetch a web page by URL and return its main text content. Use after web_search to read a promising result in full before answering.",input_schema:{type:"object",properties:{url:{type:"string",description:"Full URL including https://"}},required:["url"]}};

/* Web search router: news-type queries go to Google News RSS (excellent Russian
   coverage, machine-readable), everything else to Bing RSS (stable, no captcha).
   httpFetch (native bridge) has no CORS limits. DDG Instant Answers is the
   last-resort fallback. */
function isNewsQuery(q){
  return /новост|событ|сегодня|свеж|последн|latest|news|today|this week|breaking|войн|выбор|election|war/i.test(q);
}
/* ── Ollama web search/fetch (https://docs.ollama.com/web-search) ── */
async function ollamaApi(path,payload){
  const key=state.ollamaKey;
  if(!key)return {error:true,body:"No Ollama API key set (Settings → Web search)"};
  const r=await httpFetch("POST","https://ollama.com/api/"+path,{"Authorization":"Bearer "+key,"content-type":"application/json"},JSON.stringify(payload));
  console.log("[NightCode] Ollama "+path+" "+JSON.stringify({status:r.status,error:r.error,bodyStart:(r.body||"").slice(0,300)}));
  return r;
}
/* Quick key check: a 1-result search. Called when the user saves the key. */
// verifyOllamaKey (UI version) lives with the settings handlers below.
async function searchOllama(q){
  const r=await ollamaApi("web_search",{query:q,max_results:8});
  if(r.error||r.status<200||r.status>=300)return null;
  try{
    const d=JSON.parse(r.body);
    const out=(d.results||[]).map((x,i)=>(i+1)+". "+(x.title||"")+(x.url?"\n   URL: "+x.url:"")+(x.content?"\n   "+String(x.content).replace(/\s+/g," ").trim():""));
    return out.length?out.join("\n\n").slice(0,6000):null;
  }catch(e){return null}
}
/* Heuristic: Bing RSS pads thin/irrelevant queries with unrelated sponsored noise
   (calculators, e-commerce). If query terms barely appear in the results, the
   result set is garbage — say so instead of feeding the model junk. */
function resultsRelevant(q,resultsText){
  const norm=s=>String(s||"").toLowerCase().replace(/ё/g,"е");
  const terms=norm(q).split(/[\s\"«»'’`?!,.()]+/).filter(t=>t.length>2);
  if(!terms.length)return true;
  const hay=norm(resultsText);
  let hits=0;
  for(const t of terms)if(hay.includes(t))hits++;
  return hits>=Math.max(1,Math.ceil(terms.length*0.4));
}
async function fetchOllama(url){
  const r=await ollamaApi("web_fetch",{url});
  if(r.error||r.status<200||r.status>=300)return {result:"FETCH_FAILED: "+r.body.slice(0,200),error:true};
  try{
    const d=JSON.parse(r.body);
    const text=(d.title?"# "+d.title+"\n\n":"")+(d.content||"");
    return {result:text.slice(0,12000)||"(empty page)",error:false};
  }catch(e){return {result:"FETCH_FAILED: bad response",error:true}}
}
async function searchGoogleNews(q){
  const strip=s=>String(s).replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
  const r=await httpFetch("GET","https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=ru&gl=UA&ceid=UA:ru",{"User-Agent":"Mozilla/5.0 (Android 14; Mobile) Safari/537.3"});
  console.log("[NightCode] Google News "+JSON.stringify({status:r.status,error:r.error,bodyLength:(r.body||"").length}));
  if(r.error||r.status<200||r.status>=300||!r.body)return null;
  const items=[...r.body.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out=[];
  for(const m of items){
    const title=(m[1].match(/<title>([\s\S]*?)<\/title>/)||[])[1]||"";
    const link=(m[1].match(/<link>([\s\S]*?)<\/link>/)||[])[1]||"";
    const date=(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||"";
    const src=(m[1].match(/<source[^>]*>([\s\S]*?)<\/source>/)||[])[1]||"";
    if(title)out.push((out.length+1)+". "+strip(title)+(src?" — "+strip(src):"")+(date?" ("+strip(date)+")":"")+(link?"\n   URL: "+strip(link):""));
    if(out.length>=8)break;
  }
  return out.length?out.join("\n\n").slice(0,6000):null;
}
async function searchBing(q){
  const strip=s=>String(s).replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
  const r=await httpFetch("GET","https://www.bing.com/search?q="+encodeURIComponent(q)+"&format=rss&count=8&setlang=ru",{"User-Agent":"Mozilla/5.0 (Android 14; Mobile) Safari/537.3","Accept-Language":"ru-RU,ru;q=0.9,en;q=0.8"});
  console.log("[NightCode] Bing RSS "+JSON.stringify({status:r.status,error:r.error,bodyLength:(r.body||"").length}));
  if(r.error||r.status<200||r.status>=300||!r.body)return null;
  const items=[...r.body.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out=[];
  for(const m of items){
    const title=(m[1].match(/<title>([\s\S]*?)<\/title>/)||[])[1]||"";
    const link=(m[1].match(/<link>([\s\S]*?)<\/link>/)||[])[1]||"";
    const desc=(m[1].match(/<description>([\s\S]*?)<\/description>/)||[])[1]||"";
    if(title||link)out.push((out.length+1)+". "+strip(title)+(link?"\n   URL: "+strip(link):"")+(desc?"\n   "+strip(desc):""));
    if(out.length>=8)break;
  }
  return out.length?out.join("\n\n").slice(0,6000):null;
}
async function runWebSearch(query){
  const q=String(query||"").trim();
  if(!q)return {result:"EMPTY_QUERY",error:true};
  // Provider routing: explicit choice wins, auto = Ollama first when key exists.
  const prov=state.searchProvider||"auto";
  if(prov!=="free"&&state.ollamaKey){
    const o=await searchOllama(q);
    if(o)return {result:o,error:false};
    console.log("[NightCode] Ollama search empty, provider="+prov);
    if(prov==="ollama")return {result:"SEARCH_FAILED: Ollama returned no results",error:true};
  }
  const news=isNewsQuery(q);
  try{
    if(news){
      const g=await searchGoogleNews(q);
      if(g)return {result:g,error:false};
    }
    const b=await searchBing(q);
    if(b&&resultsRelevant(q,b))return {result:b,error:false};
    console.log("[NightCode] Bing results irrelevant for query, falling through");
    if(!news){
      const g=await searchGoogleNews(q);
      if(g)return {result:g,error:false};
    }
  }catch(e){console.log("[NightCode] web search fail "+String(e&&e.message||e))}
  try{
    const r=await httpFetch("GET","https://api.duckduckgo.com/?q="+encodeURIComponent(q)+"&format=json&no_html=1&skip_disambig=1",{"User-Agent":"Mozilla/5.0"});
    if(!r.error&&r.body){
      const strip=s=>String(s).replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
      const d=JSON.parse(r.body);
      const parts=[];
      if(d.Answer)parts.push("Answer: "+strip(d.Answer));
      if(d.AbstractText)parts.push(d.AbstractText+(d.AbstractURL?"\nSource: "+d.AbstractURL:""));
      for(const t of (d.RelatedTopics||[])){
        if(t.Text&&parts.length<8)parts.push(t.Text+(t.FirstURL?"\nURL: "+t.FirstURL:""));
      }
      if(parts.length)return {result:parts.join("\n\n").slice(0,6000),error:false};
    }
  }catch(e){}
  return {result:"SEARCH_FAILED: no results (network or parsing error)",error:true};
}
async function runTool(name,input){
  if(name==="web_search")return runWebSearch(input.query);
  if(name==="web_fetch"){
    let url=String(input.url||"").trim();
    if(!/^https?:\/\//i.test(url))url="https://"+url.replace(/^\/+/,"");
    // MediaWiki sites (Fandom, Wikipedia, Miraheze): use the official API instead
    // of scraping HTML — ?action=raw redirects to 404 on Fandom, but api.php
    // serves clean wikitext. If the URL points at a /wiki/ page, parse it;
    // otherwise treat the query as a search across the wiki.
    try{
      const u=new URL(url);
      if(/(^|\.)fandom\.com$/.test(u.hostname)||/(^|\.)wikipedia\.org$/.test(u.hostname)||/(^|\.)miraheze\.org$/.test(u.hostname)){
        const api=u.origin+"/api.php";
        const wikiTitle=u.pathname.startsWith("/wiki/")?decodeURIComponent(u.pathname.slice(6)):"";
        if(wikiTitle){
          const pr=await httpFetch("GET",api+"?action=parse&page="+encodeURIComponent(wikiTitle)+"&prop=wikitext&format=json",{"User-Agent":"Mozilla/5.0 (Android 14; Mobile) Chrome/127"});
          if(!pr.error&&pr.body){
            try{
              const d=JSON.parse(pr.body);
              if(d.parse&&d.parse.wikitext){
                return {result:("URL: "+url+"\n\n"+d.parse.wikitext["*"]).slice(0,12000),error:false};
              }
              if(d.error&&d.error.code==="missingtitle"){
                return {result:"PAGE_NOT_FOUND: "+wikiTitle+" doesn't exist on this wiki. Search the wiki instead.",error:true};
              }
            }catch(e){}
          }
        }
        // Search the wiki by hostname prefix (e.g. geometry-dash-fan.fandom.com G2961)
        const mQuery=wikiTitle||u.searchParams.get("q")||"";
        const term=mQuery.split(/\s+/).filter(w=>!/fandom|wikipedia|miraheze|wiki|https?/i.test(w)).join(" ").trim();
        if(term){
          const sr=await httpFetch("GET",api+"?action=query&list=search&srsearch="+encodeURIComponent(term)+"&srlimit=8&format=json",{"User-Agent":"Mozilla/5.0 (Android 14; Mobile) Chrome/127"});
          if(!sr.error&&sr.body){
            try{
              const d=JSON.parse(sr.body);
              const hits=(d.query&&d.query.search)||[];
              if(hits.length){
                const lines=hits.map((h,i)=>(i+1)+". "+h.title+(h.wordcount?" ("+h.wordcount+" words)":"")+"\n   "+u.origin+"/wiki/"+encodeURIComponent(h.title));
                return {result:("WIKI SEARCH: "+term+"\n\n"+lines.join("\n")+"\n\nUse web_fetch on any /wiki/ URL to read the article.").slice(0,6000),error:false};
              }
            }catch(e){}
          }
        }
      }
    }catch(e){}
    if(state.searchProvider!=="free"&&state.ollamaKey){
      const of=await fetchOllama(url);
      if(!of.error)return of;
    }
    // Last resort: fetch raw HTML natively and strip tags.
    const r=await httpFetch("GET",url,{"User-Agent":"Mozilla/5.0 (Android 14; Mobile) Gecko/537.36 Chrome/127.0.0.0 Mobile Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"ru-RU,ru;q=0.9,en;q=0.8"});
    if(r.error||r.status<200||r.status>=300)return {result:"FETCH_FAILED: "+r.body.slice(0,200),error:true};
    const text=r.body
      .replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"")
      .replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
    return {result:("URL: "+url+"\n\n"+text).slice(0,12000),error:false};
  }
  if(name==="list_files")return fsCall("fsList");
  if(name==="read_file")return fsCall("fsRead",input.path);
  if(name==="search_files")return fsCall("fsSearch",input.query);
  if(name==="write_file")return fsCall("fsWrite",input.path,btoa(unescape(encodeURIComponent(String(input.content||"")))));
  if(name==="create_directory")return fsCall("fsMkdir",input.path);
  if(name==="rename_file")return fsCall("fsRename",input.from,input.to);
  if(name==="delete_file")return fsCall("fsDelete",input.path);
  return {result:"UNKNOWN_TOOL",error:true};
}
function hasProject(){
  return !!(window.Android&&Android.hasProject&&Android.hasProject());
}

/* ── Chat sessions & projects (grouping) ── */
function currentSessionId(){
  // Simple stable id: bump when a chat is cleared, reuse otherwise.
  let id=localStorage.getItem("currentSession");
  if(!id){id="s"+Date.now();localStorage.setItem("currentSession",id)}
  return id;
}
function newChat(){
  saveCurrentChat();
  state.messages=[];state.summary="";state.attachments=[];save();render();renderAttachments();renderRecent();
  localStorage.removeItem("currentSession");
  currentSessionId();
}
function addToProject(){
  if(!state.projects.length){
    const name=prompt("Project name:");
    if(!name)return;
    state.projects.push({id:"p"+Date.now(),name,sessionIds:[]});
  }
  const p=state.projects[0];
  const sid=currentSessionId();
  if(!p.sessionIds.includes(sid))p.sessionIds.push(sid);
  save();
  showBanner("Chat added to project: "+p.name);
}

function resizeInput(){$("input").style.height="auto";$("input").style.height=Math.min($("input").scrollHeight,150)+"px"}

/* ── Tool activity cards ────────────── */
function toolIcon(name){
  const paths={
    list_files:'<path d="M4 6h16v13H4z"/><path d="M7 10h10M7 14h7"/>',
    read_file:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6M9 16h5"/>',
    search_files:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
    get_file_info:'<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    write_file:'<path d="M5 4h14v16H5z"/><path d="m8 16 8-8M13 7l4 4"/>',
    create_directory:'<path d="M3 6h7l2 2h9v11H3z"/><path d="M12 11v5M9.5 13.5h5"/>',
    rename_file:'<path d="M5 5h14v14H5z"/><path d="m8 15 7-7M13 8h2v2"/>',
    delete_file:'<path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 13h10l1-13"/>',
    web_search:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5S14.6 18.2 12 20.5c-2.6-2.3-3.9-5.2-3.9-8.5S9.4 5.8 12 3.5z"/>',
    web_fetch:'<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.get_file_info)+'</svg>';
}
function toolLabel(name){return ({list_files:'Inspecting project files',read_file:'Reading file',search_files:'Searching project',get_file_info:'Inspecting file',write_file:'Writing file',create_directory:'Creating folder',rename_file:'Renaming file',delete_file:'Deleting file',web_search:'Searching the web',web_fetch:'Reading web page'}[name]||String(name||'').replace(/_/g,' '))}
/* Claude-style one-line labels: past tense + target, e.g. Searched "query" */
function toolCompactLabel(t){
  const target=toolTarget(t.input)||"";
  const short=target.length>40?target.slice(0,37)+"…":target;
  const map={
    web_search:'Searched "'+short+'"',
    web_fetch:'Read '+short,
    read_file:'Read '+short,
    write_file:'Edited '+short,
    list_files:'Listed project files',
    search_files:'Searched project for "'+short+'"',
    create_directory:'Created '+short,
    rename_file:'Renamed to '+short,
    delete_file:'Deleted '+short,
    get_file_info:'Inspected '+short
  };
  let label=map[t.name]||toolLabel(t.name);
  if(t.error)label+=" — failed";
  return label;
}
function toolTarget(input){return input?.path||input?.to||input?.query||input?.url||input?.url||''}
function makeTree(text){
  // Root-level view only: directories first, then files. No recursive branches.
  const lines=String(text||"").split("\n").filter(Boolean);
  const dirs=[];const files=[];
  for(const line of lines){
    const isDir=line.endsWith("/");
    const clean=isDir?line.slice(0,-1):line;
    if(clean.includes("/"))continue;  // nested — model still sees it, UI doesn't
    (isDir?dirs:files).push(clean);
  }
  const out=[];
  for(const d of dirs.slice(0,30))out.push("📁 "+d+"/");
  for(const f of files.slice(0,30))out.push("📄 "+f);
  if(!out.length)return "Empty folder";
  if(dirs.length+files.length>out.length)out.push("… +"+(dirs.length+files.length-out.length)+" more");
  return out.join("\n");
}
function toolPreview(name,input,result){
  const out=String(result||"");
  if(name==="list_files")return '<div class="tree-title">PROJECT ROOT</div><div class="tree">'+esc(makeTree(out))+'</div>';
  if(name==="search_files")return '<div class="tree-title">MATCHES</div><div class="tree">'+esc(out.split("\n").slice(0,20).join("\n")||"No matches")+'</div>';
  if(name==="web_search")return '<div class="tree-title">RESULTS</div><div class="tree">'+esc(out.split("\n\n").slice(0,8).join("\n\n")||"No results")+'</div>';
  // The file path is already in the card subtitle (.tool-activity-sub) — no badge.
  return '<pre>'+esc(out.slice(0,5000))+"</pre>";
}
function showToolActivity(name,input){
  const chat=$("chat");
  removeTyping();
  const wrap=document.createElement("div");wrap.className="message assistant";
  const card=document.createElement("div");card.className="tool-activity compact";
  card.innerHTML='<div class="tool-activity-head"><div class="tool-activity-icon sm">'+toolIcon(name)+'</div><div class="tool-activity-text"><div class="tool-activity-title">'+esc(toolCompactLabel({name,input}))+'</div></div><div class="tool-activity-status"><span class="tool-spinner"></span></div></div><div class="tool-preview" style="display:none"></div>';
  wrap.appendChild(card);chat.appendChild(wrap);chat.scrollTop=chat.scrollHeight;
  return {update(result,error=false){
    card.querySelector(".tool-preview").innerHTML=toolPreview(name,input,result);
    card.querySelector(".tool-preview").style.display="";
    card.classList.add("done");
    const st=card.querySelector(".tool-activity-status");
    st.innerHTML=error?'<span style="color:#ff7279">✕</span>':'<svg style="width:14px;height:14px;color:#7fd6a2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#i-check"/></svg>';
    if(error)card.querySelector(".tool-activity-icon").style.color="#ff7279";
    chat.scrollTop=chat.scrollHeight;
  }};
}

$("menuBtn").onclick=()=>{renderRecent();$("drawer").classList.add("open");$("scrim").classList.add("open")}
$("closeDrawer").onclick=()=>{$("drawer").classList.remove("open");$("scrim").classList.remove("open")}
$("scrim").onclick=()=>{$("drawer").classList.remove("open");$("scrim").classList.remove("open")}
$("drawerNew").onclick=()=>{newChat();$("closeDrawer").click()}
$("addBtn").onclick=()=>openSheet("addSheet")
$("rowProjectFolder").onclick=()=>{closeSheets();openProject()}
$("rowWebSearch").onclick=()=>{closeSheets();$("input").focus()}
$("rowAddToProject").onclick=()=>{closeSheets();addToProject()}
$("rowToolAccess").onclick=()=>{closeSheets();openSheet("contextSheet")}
document.addEventListener("click",e=>{const card=e.target.closest("#openProjectCard");if(card)openProject()});
$("modelBtn").onclick=()=>{openSheet("modelSheet");renderModels()}
$("moreBtn").onclick=()=>{openSheet("settingsSheet");$("baseUrl").value=state.base;$("apiKey").value=state.key;updateSearchUI();updateWorkspaceUI()}
function updateSearchUI(){
  const sel=$("searchProviderSel");if(!sel)return;
  sel.value=state.searchProvider;
  const st=$("keyStatus");if(!st)return;
  st.className="key-status";
  const ollamaOn=state.searchProvider==="ollama"||(state.searchProvider==="auto"&&state.ollamaKey);
  if(state.searchProvider==="free")st.textContent="Free search (Bing / Google News)";
  else if(!state.ollamaKey)st.textContent="Enter your Ollama API key";
  else if(state._ollamaVerified){st.className="key-status ok";st.textContent="Ollama search ✓ active"}
  else st.textContent="Key saved — press Check key";
}
/* Quick key check: a 1-result search. Auto-runs on toggle/entry, manual button too. */
async function verifyOllamaKey(){
  const st=$("keyStatus");
  if(!st)return;
  if(!state.ollamaKey){st.className="key-status";st.textContent="Enter your Ollama API key";return}
  st.className="key-status checking";st.textContent="Checking key…";
  const btn=$("verifyOllamaBtn");if(btn)btn.disabled=true;
  const r=await ollamaApi("web_search",{query:"test",max_results:1});
  if(btn)btn.disabled=false;
  state._ollamaVerified=false;
  if(!r.error&&r.status>=200&&r.status<300){
    state._ollamaVerified=true;
    st.className="key-status ok";st.textContent="Ollama search ✓ active";
  }else if(r.status===401||r.status===403){
    st.className="key-status bad";st.textContent="Key invalid — get one at ollama.com/settings/keys";
  }else if(r.error){
    st.className="key-status bad";st.textContent="Network error: "+String(r.body||"").slice(0,80);
  }else{
    st.className="key-status bad";st.textContent="Key check failed (HTTP "+r.status+")";
  }
}
$("searchProviderSel").onchange=e=>{state.searchProvider=e.target.value;save();updateSearchUI()}
$("ollamaKeyInput").addEventListener("input",e=>{
  state.ollamaKey=e.target.value.trim();save();
});
$("ollamaKeyInput").addEventListener("change",e=>{
  if(state.ollamaKey)verifyOllamaKey();else updateSearchUI();
});
$("saveKeyBtn").onclick=()=>{
  // Save only — no network check. For when the tester/API is flaky.
  state.ollamaKey=$("ollamaKeyInput").value.trim();save();
  state._ollamaVerified=false;
  const st=$("keyStatus");
  if(st){
    st.className="key-status ok";
    st.textContent=state.ollamaKey?"Key saved ✓":(state.searchProvider==="free"?"Free search (Bing / Google News)":"No key — free search");
  }
};
$("verifyOllamaBtn").onclick=verifyOllamaKey;
$("wsEnabled").onchange=e=>{state.wsEnabled=e.target.checked;save();updateWorkspaceUI()}
$("wsPick").onclick=()=>{if(window.Android&&Android.openWorkspacePicker)Android.openWorkspacePicker();else alert("Available in the Android app.")}
$("wsClear").onclick=()=>{if(window.Android&&Android.clearWorkspace){Android.clearWorkspace()}state.wsEnabled=false;save();updateWorkspaceUI()}
$("saveSettings").onclick=async()=>{
  state.base=$("baseUrl").value.trim();state.key=$("apiKey").value.trim();save();
  const btn=$("saveSettings");btn.disabled=true;const label=btn.textContent;btn.textContent="Saving…";
  try{await fetchModels(true)}finally{btn.disabled=false;btn.textContent=label}
}
$("refreshModels").onclick=()=>fetchModels()
$("sheetScrim").onclick=closeSheets
$("contextBtn").onclick=()=>{
  openSheet("contextSheet");
  const lim=getCtxLimits();
  $("inputTokens").value=lim.input;$("outputTokens").value=lim.output;
  $("autoCompact").checked=state.settings.auto;$("threshold").value=state.settings.threshold;
  $("perModelCtx").checked=isModelOverridden();
  const note=$("ctxModelNote");
  if(note){
    note.textContent=isModelOverridden()
      ?"Per-model settings: "+(state.selected||"unknown")
      :"Global defaults (all models) — "+(state.selected?"current: "+state.selected:"no model selected");
    note.classList.toggle("on",isModelOverridden());
  }
}
$("perModelCtx").onchange=e=>{
  const note=$("ctxModelNote");
  if(note){
    note.textContent=e.target.checked
      ?"Per-model settings: "+(state.selected||"unknown")
      :"Global defaults (all models) — "+(state.selected?"current: "+state.selected:"no model selected");
    note.classList.toggle("on",e.target.checked);
  }
}
$("saveContext").onclick=()=>{
  const input=Number($("inputTokens").value)||128000;
  const output=Number($("outputTokens").value)||6000;
  if($("perModelCtx").checked&&state.selected){
    if(!state.modelContext)state.modelContext={};
    state.modelContext[state.selected]={input,output};
  }else{
    state.settings.input=input;
    state.settings.output=output;
    if(state.selected&&state.modelContext&&state.modelContext[state.selected])delete state.modelContext[state.selected];
  }
  state.settings.auto=$("autoCompact").checked;
  state.settings.threshold=Number($("threshold").value)||80;
  save();closeSheets();
}
$("compactNow").onclick=()=>compactNow(true)
$("sendBtn").onclick=send
$("input").addEventListener("input",resizeInput)
$("input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}})
initProjectState();render();renderAttachments();resizeInput();updateModelBtn();renderRecent();

/* ── Keyboard-aware scrolling ───────── */
// The native WebView padding handles the layout resize; we only keep the chat
// pinned to the latest message when the viewport shrinks (keyboard opening).
function syncKeyboard(){
  const chat=$("chat");
  if(chat)chat.scrollTop=chat.scrollHeight;
}
window.visualViewport&&window.visualViewport.addEventListener("resize",syncKeyboard);
window.addEventListener("resize",syncKeyboard);
// Lock the page pan dead. Native scrolling is allowed ONLY when the touch
// started inside an element that can actually scroll right now (chat feed,
// sheets, code blocks, an overflowing textarea). Everything else — especially
// the composer and its textarea — stays glued in place.
const SCROLLABLE=".chat,.sheet,#recent,textarea,pre";
document.addEventListener("touchmove",e=>{
  let el=e.target;
  while(el&&el!==document.body){
    if(el.matches&&el.matches(SCROLLABLE)){
      const cs=getComputedStyle(el);
      if(cs.overflowY==="auto"||cs.overflowY==="scroll"){
        if(el.scrollHeight>el.clientHeight+4)return;  // it really can scroll
      }
    }
    el=el.parentElement;
  }
  e.preventDefault();
},{passive:false});
