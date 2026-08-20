const $=id=>document.getElementById(id);
const state={
  messages:JSON.parse(localStorage.getItem("messages")||"[]"),
  models:JSON.parse(localStorage.getItem("models")||"[]"),
  selected:localStorage.getItem("model")||"",
  base:localStorage.getItem("base")||"",
  key:localStorage.getItem("key")||"",
  summary:localStorage.getItem("summary")||"",
  settings:JSON.parse(localStorage.getItem("settings")||'{"input":128000,"output":6000,"auto":true,"threshold":80}'),
  attachments:[]
};

function save(){
  localStorage.setItem("messages",JSON.stringify(state.messages));
  localStorage.setItem("models",JSON.stringify(state.models));
  localStorage.setItem("model",state.selected);
  localStorage.setItem("base",state.base);
  localStorage.setItem("key",state.key);
  localStorage.setItem("summary",state.summary);
  localStorage.setItem("settings",JSON.stringify(state.settings));
}
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
  return `<section id="welcome" class="welcome">
    <div class="star"><svg><use href="#i-moon"/></svg></div>
    <h1>Hello, night owl</h1>
    <p>Your local AI coding workspace</p>
    <button class="quick" id="newChat">
      <span class="quick-ico"><svg><use href="#i-plus"/></svg></span>
      <span class="quick-text"><b>New chat</b><small>Start a fresh conversation</small></span>
      <span class="quick-arrow"><svg><use href="#i-arrow-r"/></svg></span>
    </button>
    <button class="quick">
      <span class="quick-ico"><svg><use href="#i-folder"/></svg></span>
      <span class="quick-text"><b>Open project</b><small>Continue coding</small></span>
      <span class="quick-arrow"><svg><use href="#i-arrow-r"/></svg></span>
    </button>
  </section>`;
}
function messageHtml(m){
  const files=(m.attachments||[]).map(a=>`<div class="file-card"><svg><use href="#i-file"/></svg><span class="file-name">${esc(a.name)}</span><small>${esc(a.mime||"file")}</small></div>`).join("");
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
function renderRecent(){
  $("recent").innerHTML='<div class="recent-empty"><svg><use href="#i-chat"/></svg>No saved chats yet</div>';
}
function newChat(){
  state.messages=[];state.summary="";state.attachments=[];save();render();renderAttachments();
}
function addMessage(role,text,attachments=[]){
  state.messages.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),role,text,attachments,ts:Date.now()});
  save();render();
}
function renderAttachments(){
  $("attachments").innerHTML=state.attachments.map((a,i)=>`<div class="attachment"><svg><use href="#i-file"/></svg><span>${esc(a.name)}</span><button onclick="removeAttachment(${i})" aria-label="Remove"><svg><use href="#i-close"/></svg></button></div>`).join("");
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
      ${sel?'<span class="row-arrow" style="margin-left:auto;color:#93a5ff"><svg><use href="#i-check"/></svg></span>':""}
    </button>`;
  }).join("");
}
function updateModelBtn(){$("modelBtn").textContent=state.selected||"Model"}
function selectModel(id){state.selected=decodeURIComponent(id);save();updateModelBtn();closeSheets()}
async function fetchModels(){
  $("settingsError").textContent="";
  if(!state.base){$("settingsError").textContent="Base URL is empty.";return}
  try{
    const r=await fetch(state.base.replace(/\/$/,"")+"/v1/models",{headers:{"x-api-key":state.key,"anthropic-version":"2023-06-01"}});
    const txt=await r.text(); if(!r.ok)throw Error(txt.slice(0,600));
    const data=JSON.parse(txt).data||[];
    state.models=data.map(x=>({id:x.id,name:x.display_name||x.id,provider:provider(x.id)}));
    if(!state.selected&&state.models[0])state.selected=state.models[0].id;
    save();renderModels();updateModelBtn();
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
    const messages=state.messages.map(m=>({role:m.role,content:String(m.text||"").replace(/<think\s*>[\s\S]*?<\/think\s*>/gi,"").replace(/<\/?think\s*>/gi,"").trim()})).filter(m=>m.content);
    const system=state.summary?`You are NightCode, a helpful AI coding assistant.\nConversation summary:\n${state.summary}\nContinue the same conversation.`:"You are NightCode, a helpful AI coding assistant. Maintain continuity with the supplied conversation.";
    let final="";const toolCalls=[];
    for(let turn=0;turn<6;turn++){
      const body={model:state.selected,max_tokens:Number(state.settings.output)||6000,system,messages};
      const r=await fetch(state.base.replace(/\/$/,"")+"/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":state.key,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)});
      const txt=await r.text();if(!r.ok)throw Error(txt.slice(0,1000));
      const data=JSON.parse(txt);
      const content=data.content||[];
      const toolUses=content.filter(x=>x.type==="tool_use");
      const text=content.filter(x=>x.type==="text").map(x=>x.text).join("\n");
      if(text)final+=(final?"\n\n":"")+text;
      if(!toolUses.length)break;
      messages.push({role:"assistant",content});
      const results=[];
      for(const u of toolUses){
        const activity=showToolActivity(u.name,u.input||{});
        const msg="Tool '"+u.name+"' is not available in NightCode WebView. Respond using the conversation instead.";
        activity.update(msg,true);
        toolCalls.push({name:u.name,input:u.input||{},result:msg,error:true});
        results.push({type:"tool_result",tool_use_id:u.id,is_error:true,content:msg});
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
$("modelBtn").onclick=()=>{openSheet("modelSheet");renderModels()}
$("moreBtn").onclick=()=>{openSheet("settingsSheet");$("baseUrl").value=state.base;$("apiKey").value=state.key}
$("saveSettings").onclick=()=>{state.base=$("baseUrl").value.trim();state.key=$("apiKey").value.trim();save();fetchModels()}
$("refreshModels").onclick=fetchModels
$("sheetScrim").onclick=closeSheets
$("contextBtn").onclick=()=>{openSheet("contextSheet");$("inputTokens").value=state.settings.input;$("outputTokens").value=state.settings.output;$("autoCompact").checked=state.settings.auto;$("threshold").value=state.settings.threshold}
$("saveContext").onclick=()=>{state.settings={input:Number($("inputTokens").value)||128000,output:Number($("outputTokens").value)||6000,auto:$("autoCompact").checked,threshold:Number($("threshold").value)||80};save();closeSheets()}
$("compactNow").onclick=()=>compactNow(true)
$("sendBtn").onclick=send
$("input").addEventListener("input",resizeInput)
$("input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}})
render();renderAttachments();resizeInput();updateModelBtn();renderRecent();
