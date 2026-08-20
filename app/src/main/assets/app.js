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
function render(){
  const chat=$("chat");
  if(!state.messages.length){
    chat.innerHTML=`<section id="welcome" class="welcome"><div class="star">✳</div><h1>Hello, night owl</h1><p>Your local AI coding workspace</p><button class="quick" id="newChat"><b>＋ New chat</b><small>Start a fresh conversation</small></button><button class="quick"><b>▣ Open project</b><small>Continue coding</small></button></section>`;
    $("newChat").onclick=()=>newChat();
    return;
  }
  chat.innerHTML=state.messages.map(m=>`<div class="message ${m.role}">${(m.attachments||[]).map(a=>`<div class="file-card">📄 ${esc(a.name)}<br><small>${esc(a.mime||"file")}</small></div>`).join("")}<div class="bubble">${m.reasoning?`<div class="reasoning">› Reasoning · Thought for ${Math.max(1,Math.round(m.reasoning/1000))}s</div>`:""}${esc(m.text||"")}</div></div>`).join("");
  chat.scrollTop=chat.scrollHeight;
}
function newChat(){
  state.messages=[];state.summary="";state.attachments=[];save();render();renderAttachments();
}
function addMessage(role,text,attachments=[]){
  state.messages.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),role,text,attachments});
  save();render();
}
function renderAttachments(){
  $("attachments").innerHTML=state.attachments.map((a,i)=>`<div class="attachment">📄 ${esc(a.name)} <button onclick="removeAttachment(${i})">×</button></div>`).join("");
}
function removeAttachment(i){state.attachments.splice(i,1);renderAttachments()}
function openFiles(){
  if(window.Android&&Android.openFilePicker)Android.openFilePicker();
  else alert("File picker is available in the Android app.");
  closeSheets();
}
function openSheet(id){closeSheets();$(id).classList.remove("hidden")}
function closeSheets(){["addSheet","settingsSheet","modelSheet","contextSheet"].forEach(id=>$(id).classList.add("hidden"))}
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
  if(!state.models.length){box.innerHTML='<div class="empty-models">No models loaded. Add a Base URL and API key in Settings.</div>';return}
  box.innerHTML=state.models.map(m=>`<button class="model-item ${m.id===state.selected?"selected":""}" onclick="selectModel('${encodeURIComponent(m.id)}')"><div class="model-icon">${esc(provider(m.id)[0].toUpperCase())}</div><div><div class="model-name">${esc(m.name||m.id)}</div><div class="model-provider">${esc(m.provider||provider(m.id))}</div></div></button>`).join("");
}
function selectModel(id){state.selected=decodeURIComponent(id);save();closeSheets()}
async function fetchModels(){
  $("settingsError").textContent="";
  if(!state.base){$("settingsError").textContent="Base URL is empty.";return}
  try{
    const r=await fetch(state.base.replace(/\/$/,"")+"/v1/models",{headers:{"x-api-key":state.key,"anthropic-version":"2023-06-01"}});
    const txt=await r.text(); if(!r.ok)throw Error(txt.slice(0,600));
    const data=JSON.parse(txt).data||[];
    state.models=data.map(x=>({id:x.id,name:x.display_name||x.id,provider:provider(x.id)}));
    if(!state.selected&&state.models[0])state.selected=state.models[0].id;
    save();renderModels();
  }catch(e){$("settingsError").textContent=e.message||"Refresh failed"}
}
async function send(){
  const input=$("input");const prompt=input.value.trim();
  if(!prompt&&!state.attachments.length)return;
  if(!state.base||!state.key||!state.selected){alert("Configure connection and select a model first.");return}
  const at=[...state.attachments];
  input.value="";resizeInput();state.attachments=[];renderAttachments();
  addMessage("user",prompt,at);
  $("sendBtn").disabled=true;
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
    addMessage("assistant",text||"(empty response)",[]);
    state.messages[state.messages.length-1].reasoning=Date.now()-started;save();render();
  }catch(e){addMessage("assistant","Error: "+(e.message||e))}
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
$("contextBtn").onclick=()=>{openSheet("contextSheet");$("inputTokens").value=state.settings.input;$("outputTokens").value=state.settings.output;$("autoCompact").checked=state.settings.auto;$("threshold").value=state.settings.threshold}
$("saveContext").onclick=()=>{state.settings={input:Number($("inputTokens").value)||128000,output:Number($("outputTokens").value)||6000,auto:$("autoCompact").checked,threshold:Number($("threshold").value)||80};save();closeSheets()}
$("compactNow").onclick=()=>compactNow(true)
$("sendBtn").onclick=send
$("input").addEventListener("input",resizeInput)
$("input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}})
document.addEventListener("click",e=>{if(e.target.classList.contains("sheet"))return})
render();renderAttachments();resizeInput();
