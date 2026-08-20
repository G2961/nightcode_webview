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
function md(s){
  const t=esc(s||"");
  return t
    .replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>`<pre class="code-block">${lang?`<div class="code-lang">${lang}</div>`:""}<code>${code.replace(/\n$/,"")}</code></pre>`)
    .replace(/`([^`\n]+)`/g,'<code class="inline-code">$1</code>');
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
  const time=m.ts?`<div class="msg-time">${new Date(m.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>`:"";
  const reasoning=m.reasoning?`<div class="reasoning">Reasoning · ${Math.max(1,Math.round(m.reasoning/1000))}s</div>`:"";
  return `<div class="message ${m.role}">${files}<div class="bubble">${reasoning}${m.role==="assistant"?md(m.text):esc(m.text||"")}</div>${time}</div>`;
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
  chat.insertAdjacentHTML("beforeend",'<div class="message assistant" id="typing"><div class="bubble thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>');
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
    const messages=state.messages.map(m=>({role:m.role,content:m.text})).filter(m=>m.content!==undefined);
    const system=state.summary?`You are NightCode, a helpful AI coding assistant.\nConversation summary:\n${state.summary}\nContinue the same conversation.`:"You are NightCode, a helpful AI coding assistant. Maintain continuity with the supplied conversation.";
    const body={model:state.selected,max_tokens:Number(state.settings.output)||6000,system,messages};
    const r=await fetch(state.base.replace(/\/$/,"")+"/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":state.key,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)});
    const txt=await r.text();if(!r.ok)throw Error(txt.slice(0,1000));
    const data=JSON.parse(txt);
    const text=(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n").replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
    removeTyping();
    addMessage("assistant",text||"(empty response)",[]);
    state.messages[state.messages.length-1].reasoning=Date.now()-started;save();render();
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
