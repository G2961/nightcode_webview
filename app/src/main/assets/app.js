const $=id=>document.getElementById(id);
const state={
  messages:JSON.parse(localStorage.getItem("messages")||"[]"),
  models:JSON.parse(localStorage.getItem("models")||"[]"),
  selected:localStorage.getItem("model")||"",
  base:localStorage.getItem("base")||"",
  key:localStorage.getItem("key")||"",
  summary:localStorage.getItem("summary")||"",
  settings:JSON.parse(localStorage.getItem("settings")||'{"input":128000,"output":6000,"auto":true,"threshold":80}'),
  attachments:[],
  projectName:"",
  wsEnabled:localStorage.getItem("wsEnabled")==="1",
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
  localStorage.setItem("wsEnabled",state.wsEnabled?"1":"0");
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
  // Models sometimes return reasoning as literal <think>…</think> text —
  // extract before escaping so raw tags never leak into the bubble.
  t=t.replace(/<think\s*>\s*([\s\S]*?)\s*<\/think\s*>/gi,(_,thought)=>
    placeholder(`<details class="reasoning-block"><summary><span class="reasoning-label">Reasoning</span><span class="reasoning-time">Thought for ${formatReasoningTime(opts.reasoningDurationMs)}</span></summary><pre>${esc(thought.trim())}</pre></details>`));
  t=t.replace(/<think\s*>/gi,"").replace(/<\/think\s*>/gi,"");
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
  const tools=(m.tools||[]).map(t=>`<div class="tool-activity"><div class="tool-activity-head"><div class="tool-activity-icon"${t.error?' style="color:#ff7279"':""}>${toolIcon(t.name)}</div><div class="tool-activity-text"><div class="tool-activity-title">${esc(toolLabel(t.name))}</div><div class="tool-activity-sub">${esc(toolTarget(t.input)||"")}</div></div><div class="tool-activity-status ${t.error?"error":"done"}"><span>${t.error?"Failed":"Done"}</span></div></div><div class="tool-preview">${toolPreview(t.name,t.input,t.result)}</div></div>`).join("");
  const time=m.ts?`<div class="msg-time">${new Date(m.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>`:"";
  const hadThink=/<think[\s>]/i.test(String(m.text||""));
  const reasoning=m.reasoning&&!hadThink?`<div class="reasoning">Reasoning · ${formatReasoningTime(m.reasoning)}</div>`:"";
  return `<div class="message ${m.role}">${files}${tools}<div class="bubble">${reasoning}${m.role==="assistant"?md(m.text,{reasoningDurationMs:m.reasoning}):esc(m.text||"")}</div>${time}</div>`;
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
function renderRecent(){
  $("recent").innerHTML='<div class="recent-empty"><svg><use href="#i-chat"/></svg>No saved chats yet</div>';
}
// newChat lives with the sessions/projects code below.
function addMessage(role,text,attachments=[]){
  state.messages.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),role,text,attachments,ts:Date.now()});
  save();render();
}
function renderAttachments(){
  $("attachments").innerHTML=state.attachments.map((a,i)=>{
    const thumb=a.kind==="image"&&a.dataUrl?`<img src="${a.dataUrl}">`:'<svg><use href="#i-file"/></svg>';
    return `<div class="attachment">${thumb}<span>${esc(a.name)}</span><button onclick="removeAttachment(${i})" aria-label="Remove"><svg><use href="#i-close"/></svg></button></div>`;
  }).join("");
  syncChatInset();
}
function syncChatInset(){
  // Keep the chat scrollable past the composer: measure its real height
  // (it changes with keyboard, attachments and textarea growth).
  const wrap=document.querySelector(".composer-wrap");
  const chat=$("chat");
  if(!wrap||!chat)return;
  chat.style.paddingBottom=(wrap.offsetHeight+24)+"px";
}
new ResizeObserver(syncChatInset).observe(document.querySelector(".composer-wrap"));
window.addEventListener("resize",syncChatInset);
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
      ${sel?'<span class="row-arrow" style="margin-left:auto;color:#93a5ff"><svg><use href="#i-check"/></svg></span>':""}
    </button>`;
  }).join("");
}
function updateModelBtn(){$("modelBtn").textContent=state.selected||"Model"}
function selectModel(id){state.selected=decodeURIComponent(id);save();updateModelBtn();closeSheets()}
async function fetchModels(closeOnSuccess=false){
  $("settingsError").textContent="";
  if(!state.base){$("settingsError").textContent="Base URL is empty.";return}
  try{
    const r=await fetch(state.base.replace(/\/$/,"")+"/v1/models",{headers:{"x-api-key":state.key,"anthropic-version":"2023-06-01"}});
    const txt=await r.text(); if(!r.ok)throw Error(txt.slice(0,600));
    const data=JSON.parse(txt).data||[];
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
    // History must never contain <think> blocks — models reject foreign tags on the way back.
    const strip=t=>String(t||"").replace(/<think\s*>[\s\S]*?<\/think\s*>/gi,"").replace(/<\/?think\s*>/gi,"").trim();
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
      ?"You are NightCode, a local AI coding agent. You work on the user's selected project through tools. Be concise. Inspect files before changing them. Use write_file for actual edits. Do not claim a change was made unless the tool succeeded."
      :"You are NightCode, a helpful AI coding assistant. There is no project folder connected, so answer normally without assuming access to local files or tools.")
      +(state.summary?`\nConversation summary:\n${state.summary}\nContinue the same conversation.`:"");
    let final="";const toolCalls=[];
    for(let turn=0;turn<8;turn++){
      const body={model:state.selected,max_tokens:Number(state.settings.output)||6000,system,messages};
      if(proj)body.tools=TOOLS;
      const r=await fetch(state.base.replace(/\/$/,"")+"/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":state.key,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)});
      const txt=await r.text();if(!r.ok)throw Error(txt.slice(0,1000));
      const data=JSON.parse(txt);
      const content=data.content||[];
      const toolUses=proj?content.filter(x=>x.type==="tool_use"):[];
      const text=content.filter(x=>x.type==="text").map(x=>x.text).join("\n");
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
    addMessage("assistant",final.trim()||"(empty response)",[]);
    const last=state.messages[state.messages.length-1];
    last.reasoning=Date.now()-started;if(toolCalls.length)last.tools=toolCalls;
    save();render();
  }catch(e){removeTyping();addMessage("assistant","Error: "+(e.message||e))}
  finally{$("sendBtn").disabled=false}
}
function compactIfNeeded(){
  if(!state.settings.auto)return;
  const estimate=state.messages.reduce((n,m)=>n+(m.text||"").length,0)/4;
  if(estimate>Number(state.settings.input)*Number(state.settings.threshold)/100)compactNow(false);
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
const TOOLS=[
  {name:"list_files",description:"List files in the connected project folder.",input_schema:{type:"object",properties:{},required:[]}},
  {name:"read_file",description:"Read a text file from the project.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}},
  {name:"search_files",description:"Search text inside project files. Use this before editing to find symbols or references.",input_schema:{type:"object",properties:{query:{type:"string"},path:{type:"string"}},required:["query"]}},
  {name:"write_file",description:"Create or replace a text file in the project.",input_schema:{type:"object",properties:{path:{type:"string"},content:{type:"string"}},required:["path","content"]}},
  {name:"create_directory",description:"Create a directory in the project.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}},
  {name:"rename_file",description:"Rename or move a file within the project.",input_schema:{type:"object",properties:{from:{type:"string"},to:{type:"string"}},required:["from","to"]}},
  {name:"delete_file",description:"Delete a file from the project. Only use when the user explicitly asks for deletion.",input_schema:{type:"object",properties:{path:{type:"string"}},required:["path"]}}
];
async function runTool(name,input){
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
  state.messages=[];state.summary="";state.attachments=[];save();render();renderAttachments();
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
    web_search:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5S14.6 18.2 12 20.5c-2.6-2.3-3.9-5.2-3.9-8.5S9.4 5.8 12 3.5z"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.get_file_info)+'</svg>';
}
function toolLabel(name){return ({list_files:'Inspecting project files',read_file:'Reading file',search_files:'Searching project',get_file_info:'Inspecting file',write_file:'Writing file',create_directory:'Creating folder',rename_file:'Renaming file',delete_file:'Deleting file',web_search:'Searching the web'}[name]||String(name||'').replace(/_/g,' '))}
function toolTarget(input){return input?.path||input?.to||input?.query||input?.url||''}
function makeTree(text){
  const lines=String(text||"").split("\n").filter(Boolean).slice(0,80);
  return lines.map((x,i)=>((i===lines.length-1?"└── ":"├── ")+x)).join("\n")||"No results.";
}
function toolPreview(name,input,result){
  const out=String(result||"");
  if(name==="list_files"||name==="search_files")return '<div class="tree-title">'+(name==="list_files"?"PROJECT":"MATCHES")+'</div><div class="tree">'+esc(makeTree(out))+'</div>';
  if(input?.path||input?.url)return '<div class="tool-file-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><use href="#i-file"/></svg><span>'+esc(input.path||input.url)+"</span></div><pre>"+esc(out.slice(0,5000))+"</pre>";
  return '<pre>'+esc(out.slice(0,5000))+"</pre>";
}
function showToolActivity(name,input){
  const chat=$("chat");
  removeTyping();
  const wrap=document.createElement("div");wrap.className="message assistant";
  const card=document.createElement("div");card.className="tool-activity";
  card.innerHTML='<div class="tool-activity-head"><div class="tool-activity-icon">'+toolIcon(name)+'</div><div class="tool-activity-text"><div class="tool-activity-title">'+esc(toolLabel(name))+'</div><div class="tool-activity-sub">'+esc(toolTarget(input)||"Working")+'</div></div><div class="tool-activity-status"><span class="tool-spinner"></span><span>Working</span></div></div><div class="tool-preview"></div>';
  wrap.appendChild(card);chat.appendChild(wrap);chat.scrollTop=chat.scrollHeight;
  return {update(result,error=false){
    card.querySelector(".tool-preview").innerHTML=toolPreview(name,input,result);
    const st=card.querySelector(".tool-activity-status");
    st.className="tool-activity-status "+(error?"error":"done");
    st.innerHTML="<span>"+(error?"Failed":"Done")+"</span>";
    if(error)card.querySelector(".tool-activity-icon").style.color="#ff7279";
    chat.scrollTop=chat.scrollHeight;
  }};
}

$("menuBtn").onclick=()=>{$("drawer").classList.add("open");$("scrim").classList.add("open")}
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
$("moreBtn").onclick=()=>{openSheet("settingsSheet");$("baseUrl").value=state.base;$("apiKey").value=state.key;updateWorkspaceUI()}
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
$("contextBtn").onclick=()=>{openSheet("contextSheet");$("inputTokens").value=state.settings.input;$("outputTokens").value=state.settings.output;$("autoCompact").checked=state.settings.auto;$("threshold").value=state.settings.threshold}
$("saveContext").onclick=()=>{state.settings={input:Number($("inputTokens").value)||128000,output:Number($("outputTokens").value)||6000,auto:$("autoCompact").checked,threshold:Number($("threshold").value)||80};save();closeSheets()}
$("compactNow").onclick=()=>compactNow(true)
$("sendBtn").onclick=send
$("input").addEventListener("input",resizeInput)
$("input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}})
initProjectState();render();renderAttachments();resizeInput();updateModelBtn();renderRecent();

/* ── Keyboard-aware layout ──────────── */
function syncKeyboard(){
  // interactive-widget=resizes-content + adjustResize resize the layout viewport,
  // so the app naturally compresses. We only pin the composer above the keyboard
  // and keep the chat pinned to the latest message.
  const vv=window.visualViewport;
  const kb=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
  document.documentElement.style.setProperty("--kb",kb+"px");
  const chat=$("chat");
  if(chat)chat.scrollTop=chat.scrollHeight;
}
window.visualViewport&&window.visualViewport.addEventListener("resize",syncKeyboard);
window.addEventListener("resize",syncKeyboard);
// Lock the page pan dead. The browser's native scrolling is allowed ONLY when the
// touch started inside an element that can actually scroll right now (chat feed,
// sheets, code blocks, an overflowing textarea). Everything else — especially
// the composer and its textarea — stays glued in place.
const SCROLLABLE=".chat,.sheet,#recent,textarea,pre";
document.addEventListener("touchmove",e=>{
  let el=e.target;
  while(el&&el!==document.body){
    if(el.matches&&el.matches(SCROLLABLE)&&el.scrollHeight>el.clientHeight+4)return;
    el=el.parentElement;
  }
  e.preventDefault();
},{passive:false});
