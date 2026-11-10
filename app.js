/* Next Up application. No frontend libraries or external assets. */
(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DB_NAME = "next-up-db", DB_VERSION = 1, STORE = "app";
  const AUTH_STORAGE_KEY = "nextUpDemoAccounts", AUTH_SESSION_KEY = "nextUpDemoUser", AUTH_ITERATIONS = 120000;
  const todayISO = () => new Date().toISOString().slice(0,10);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const safe = value => String(value ?? "").trim();
  const datePlus = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
  const fmtDate = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "No date";
  const state = { tasks:[], packs:[], classes:[], plans:[], settings:{extensionDays:2,quietStart:"21:00",quietEnd:"07:00"}, wellbeing:[], weekOffset:0, showAll:false, filter:"", currentPack:null };
  let db = null, timerSeconds = 1500, timerDuration = 1500, timerInterval = null, installPrompt = null;

  // IndexedDB primary storage; localStorage is a resilient fallback.
  function openDB() {
    return new Promise((resolve,reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function loadState() {
    try {
      db = await openDB();
      const result = await new Promise((resolve,reject) => {
        const tx = db.transaction(STORE,"readonly"), req = tx.objectStore(STORE).get("state");
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      if (result) Object.assign(state, result);
    } catch (error) {
      try { const saved = localStorage.getItem("nextUpState"); if (saved) Object.assign(state, JSON.parse(saved)); }
      catch (_) { toast("Storage could not be opened. You can still use this tab; export a backup when possible."); }
    }
    if (!state.tasks.length && !state.packs.length && !state.classes.length) seedData();
    await saveState();
  }
  async function saveState() {
    const snapshot = JSON.parse(JSON.stringify(state));
    try {
      if (db) await new Promise((resolve,reject) => {
        const tx = db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(snapshot,"state");
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      else localStorage.setItem("nextUpState", JSON.stringify(snapshot));
    } catch (error) {
      try { localStorage.setItem("nextUpState", JSON.stringify(snapshot)); }
      catch (_) { toast("Could not save. Please export a backup and free some device storage."); }
    }
  }
  function seedData() {
    const d = todayISO();
    state.tasks = [
      {id:uid(),title:"Finish algebra practice",subject:"Mathematics",dueDate:datePlus(d,1),weight:"high",effort:"30 minutes",notes:"Complete questions 1–10. Ask for help with question 7 if needed.",status:"todo",milestones:[]},
      {id:uid(),title:"Read the next biology section",subject:"Life Sciences",dueDate:datePlus(d,2),weight:"medium",effort:"25 minutes",notes:"Read pages 42–48 and write down three key terms.",status:"todo",milestones:[]},
      {id:uid(),title:"Prepare history paragraph",subject:"History",dueDate:datePlus(d,4),weight:"medium",effort:"40 minutes",notes:"Use one fact from the class notes.",status:"progress",milestones:[{title:"Plan key points",date:datePlus(d,2),done:false},{title:"Write paragraph",date:datePlus(d,4),done:false}]}
    ];
    state.classes = [{id:uid(),title:"Mathematics",subject:"Mathematics",date:d,time:"09:00",kind:"class"}];
    state.packs=[]; state.plans=[]; state.wellbeing=[];
  }
  function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),3200); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function readDemoAccounts() {
    const saved=localStorage.getItem(AUTH_STORAGE_KEY);
    if(!saved)return [];
    const accounts=JSON.parse(saved);
    if(!Array.isArray(accounts))throw new Error("Local demo account data is invalid.");
    return accounts;
  }
  function hex(bytes) { return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join(""); }
  async function hashDemoPassword(password,salt) {
    if(!crypto.subtle)throw new Error("Password hashing is unavailable in this browser. Open the app on localhost or HTTPS.");
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
    const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new Uint8Array(salt.match(/.{2}/g).map(byte=>parseInt(byte,16))),iterations:AUTH_ITERATIONS},key,256);
    return hex(bits);
  }
  async function makeDemoAccount(username,password) {
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    return {username,salt,passwordHash:await hashDemoPassword(password,salt)};
  }
  function setAuthMode(mode) {
    const login=mode==="login";
    $("#loginForm").hidden=!login;$("#registerForm").hidden=login;
    $("#loginTab").classList.toggle("primary",login);$("#loginTab").classList.toggle("secondary",!login);
    $("#registerTab").classList.toggle("primary",!login);$("#registerTab").classList.toggle("secondary",login);
    $("#loginTab").setAttribute("aria-selected",String(login));$("#registerTab").setAttribute("aria-selected",String(!login));
    $("#authMessage").textContent="";
    (login?$("#loginForm"):$("#registerForm")).querySelector("input").focus();
  }
  function unlockDemo(username) {
    sessionStorage.setItem(AUTH_SESSION_KEY,username);
    document.body.classList.remove("auth-locked");
    $("#accountName").textContent=`Demo: ${username}`;
    $("#authMessage").textContent="";
  }
  function lockDemo() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    document.body.classList.add("auth-locked");
    $("#accountName").textContent="";
    if($("#assistantDialog").open)closeDialog("assistantDialog");
    setAuthMode("login");
  }
  async function initializeDemoAuth() {
    let accounts=readDemoAccounts();
    if(!accounts.some(account=>account.username.toLowerCase()==="john")){
      accounts.push(await makeDemoAccount("John","John123"));
      localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(accounts));
    }
    const signedIn=sessionStorage.getItem(AUTH_SESSION_KEY);
    const account=accounts.find(item=>item.username.toLowerCase()===String(signedIn||"").toLowerCase());
    if(account)unlockDemo(account.username);
    else document.body.classList.add("auth-locked");
  }
  let authReady;
  function subjectColor(subject) { const palette=["#2d4354","#73766a","#9e6752","#534145"]; let n=0; for(const c of subject) n=(n+c.charCodeAt(0))%palette.length; return palette[n]; }
  function priority(a,b) {
    const rank={high:0,medium:1,low:2}, ad=a.dueDate||"9999", bd=b.dueDate||"9999";
    return ad.localeCompare(bd) || rank[a.weight]-rank[b.weight] || a.title.localeCompare(b.title);
  }
  function renderTasks() {
    const filter=state.filter;
    let tasks=state.tasks.filter(t=>(!filter||t.subject===filter)).sort(priority);
    if(!state.showAll) tasks=tasks.filter(t=>t.status!=="done").slice(0,3);
    const list=$("#taskList");
    if(!tasks.length){
      const empty=state.tasks.length===0
        ?{icon:"✦",title:"Start with one small step",message:"Add a task and Next Up will help you keep it in view.",action:"add-task",label:"Add your first task"}
        :filter
          ?{icon:"⌕",title:"No tasks for this subject",message:"Try another subject or clear the filter to see more.",action:"clear-filter",label:"Clear subject filter"}
          :{icon:"✓",title:"You're all caught up",message:"Nice work. You can review completed tasks whenever you like.",action:"show-all",label:"Show completed tasks"};
      list.innerHTML=`<div class="empty-state" aria-live="polite"><span class="empty-state-icon" aria-hidden="true">${empty.icon}</span><h3>${empty.title}</h3><p>${empty.message}</p><button class="secondary" type="button" data-empty-action="${empty.action}">${empty.label}</button></div>`;
      return;
    }
    list.innerHTML=tasks.map(t=>`<article class="task-card" style="--subject:${subjectColor(t.subject)}">
      <div class="task-top"><div><h3>${escapeHTML(t.title)}</h3><div class="task-meta"><span class="tag">📘 ${escapeHTML(t.subject)}</span><span class="tag">Due ${fmtDate(t.dueDate)}</span><span class="tag weight-${t.weight}">${t.weight.toUpperCase()} priority</span><span class="tag">${escapeHTML(t.effort||"Effort not set")}</span></div></div>
      <label class="inline-label">Status <select data-status="${t.id}" aria-label="Status for ${escapeHTML(t.title)}"><option value="todo" ${t.status==="todo"?"selected":""}>To do</option><option value="progress" ${t.status==="progress"?"selected":""}>In progress</option><option value="done" ${t.status==="done"?"selected":""}>Done</option></select></label></div>
      ${t.notes?`<p>${escapeHTML(t.notes)}</p>`:""}${t.milestones?.length?`<details><summary>Project milestones (${t.milestones.filter(m=>m.done).length}/${t.milestones.length} complete)</summary><ul class="milestones">${t.milestones.map((m,i)=>`<li><label class="check-label"><input type="checkbox" data-milestone="${t.id}" data-index="${i}" ${m.done?"checked":""}> ${escapeHTML(m.title)} — ${fmtDate(m.date)}</label></li>`).join("")}</ul></details>`:""}
      <div class="task-actions"><button class="secondary" data-edit="${t.id}">Edit</button><button class="secondary" data-speak="${t.id}">Read aloud</button><button class="secondary" data-share="${t.id}">Share via WhatsApp</button></div></article>`).join("");
    $$("[data-status]",list).forEach(el=>el.addEventListener("change",()=>{const t=state.tasks.find(x=>x.id===el.dataset.status);if(t){t.status=el.value;saveState().then(renderAll);toast("Task updated.");}}));
    $$("[data-edit]",list).forEach(el=>el.addEventListener("click",()=>editTask(el.dataset.edit)));
    $$("[data-speak]",list).forEach(el=>el.addEventListener("click",()=>speakTask(el.dataset.speak)));
    $$("[data-share]",list).forEach(el=>el.addEventListener("click",()=>shareTask(el.dataset.share)));
    $$("[data-milestone]",list).forEach(el=>el.addEventListener("change",()=>{const t=state.tasks.find(x=>x.id===el.dataset.milestone);if(t?.milestones[Number(el.dataset.index)]){t.milestones[Number(el.dataset.index)].done=el.checked;saveState().then(renderAll);}}));
  }
  function renderFilters() {
    const subjects=[...new Set(state.tasks.map(t=>t.subject))].sort(), select=$("#subjectFilter"), old=state.filter;
    select.innerHTML='<option value="">All subjects</option>'+subjects.map(s=>`<option>${escapeHTML(s)}</option>`).join("");
    select.value=subjects.includes(old)?old:""; state.filter=select.value;
  }
  function renderCalendar() {
    const start=new Date(); start.setHours(12,0,0,0); start.setDate(start.getDate()-((start.getDay()+6)%7)+state.weekOffset*7);
    const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
    $("#weekRange").textContent=`${days[0].toLocaleDateString(undefined,{day:"numeric",month:"short"})} – ${days[6].toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}`;
    $("#weekCalendar").innerHTML=days.map(d=>{
      const iso=d.toISOString().slice(0,10), entries=[
        ...state.classes.filter(c=>c.date===iso).map(c=>({title:c.title,kind:"Class",time:c.time||""})),
        ...state.tasks.filter(t=>t.dueDate===iso).map(t=>({title:t.title,kind:"Due",time:""}))
      ];
      return `<div class="day-column ${iso===todayISO()?"today":""}"><div class="day-name">${d.toLocaleDateString(undefined,{weekday:"short"})}</div><div class="day-date">${d.toLocaleDateString(undefined,{day:"numeric",month:"short"})}</div>${entries.map(e=>`<div class="calendar-item"><b>${e.kind}</b>${escapeHTML(e.time?e.time+" · ":"")}${escapeHTML(e.title)}</div>`).join("")||'<span class="muted">—</span>'}</div>`;
    }).join("");
  }
  function renderPacks() {
    $("#catchupList").innerHTML=state.packs.length?state.packs.slice().reverse().map(p=>`<article class="pack-card"><div><h3>${escapeHTML(p.title)}</h3><p class="muted">${escapeHTML(p.subject)} · Missed ${fmtDate(p.date)} · ${escapeHTML(p.reason)}</p><p>${escapeHTML(p.summary||"No summary added yet.")}</p></div><div class="button-row"><button class="secondary" data-openpack="${p.id}">Open pack</button><button class="secondary" data-sharepack="${p.id}">Share</button></div></article>`).join(""):'<div class="empty-state" aria-live="polite"><span class="empty-state-icon" aria-hidden="true">↺</span><h3>Your catch-up space is ready</h3><p>Log a missed class to turn it into a clear, manageable plan.</p><button class="secondary" type="button" data-empty-action="missed-class">Log a missed class</button></div>';
    $$("[data-openpack]").forEach(b=>b.addEventListener("click",()=>openPack(b.dataset.openpack)));
    $$("[data-sharepack]").forEach(b=>b.addEventListener("click",()=>sharePack(b.dataset.sharepack)));
  }
  function renderSummary() {
    const since=datePlus(todayISO(),-6), done=state.tasks.filter(t=>t.status==="done").length, upcoming=state.tasks.filter(t=>t.status!=="done"&&t.dueDate>=todayISO()).sort(priority).slice(0,3);
    $("#weeklySummary").innerHTML=`<div class="summary-stat"><strong>${done}</strong><span>Tasks finished</span></div><div class="summary-stat"><strong>${state.packs.length}</strong><span>Catch-up packs</span></div><div class="summary-stat"><strong>${state.tasks.filter(t=>t.status!=="done"&&t.dueDate>=todayISO()).length}</strong><span>Still coming up</span></div><div class="summary-stat" style="grid-column:1/-1"><b>Coming next</b><ul>${upcoming.map(t=>`<li>${escapeHTML(t.title)} — ${fmtDate(t.dueDate)}</li>`).join("")||"<li>Nothing due soon. Take a breath.</li>"}</ul></div>`;
  }
  function renderStats() { $("#openCount").textContent=state.tasks.filter(t=>t.status!=="done").length; $("#doneCount").textContent=state.tasks.filter(t=>t.status==="done").length; }
  function renderAll(){renderFilters();renderTasks();renderCalendar();renderPacks();renderSummary();renderStats();renderReminders();}
  function renderReminders() {
    const due=state.tasks.filter(t=>t.status!=="done"&&t.dueDate).sort(priority), overdue=due.filter(t=>t.dueDate<todayISO()), soon=due.filter(t=>t.dueDate>=todayISO()&&t.dueDate<=datePlus(todayISO(),2));
    const notes=[]; if(overdue.length)notes.push(`${overdue.length} overdue task${overdue.length>1?"s":""}. Start with: ${overdue[0].title}.`); if(soon.length)notes.push(`${soon.length} task${soon.length>1?"s":""} due in the next two days.`);
    $("#reminderBanner").hidden=!notes.length; $("#reminderBanner").textContent=notes.join(" ");
  }
  function showDialog(id){const d=$("#"+id); if(d.showModal)d.showModal();else d.setAttribute("open","");}
  function closeDialog(id){const d=$("#"+id);if(d.close)d.close();else d.removeAttribute("open");}
  function editTask(id) {
    const t=state.tasks.find(x=>x.id===id); if(!t)return;
    const f=$("#taskForm"); for(const [k,v] of Object.entries({id:t.id,title:t.title,subject:t.subject,dueDate:t.dueDate,weight:t.weight,effort:t.effort,status:t.status,notes:t.notes,milestones:(t.milestones||[]).map(m=>`${m.title} | ${m.date}`).join("\n")})){if(f.elements[k])f.elements[k].value=v;}
    $("#taskDialogTitle").textContent="Edit task";showDialog("taskDialog");
  }
  function parseMilestones(raw) {
    return raw.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{const [title,date]=line.split("|").map(x=>x.trim());if(!title||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Each milestone must use: name | YYYY-MM-DD");return {title,date,done:false};});
  }
  $("#addTaskBtn").addEventListener("click",()=>{$("#taskForm").reset();$("#taskForm").elements.id.value="";$("#taskDialogTitle").textContent="Add a task";$("#taskForm").elements.dueDate.value=todayISO();showDialog("taskDialog");});
  document.addEventListener("click",event=>{
    const action=event.target.closest("[data-empty-action]")?.dataset.emptyAction;
    if(action==="add-task")$("#addTaskBtn").click();
    if(action==="missed-class")$("#missedClassBtn").click();
    if(action==="clear-filter"){state.filter="";$("#subjectFilter").value="";renderTasks();}
    if(action==="show-all"){state.showAll=true;$("#showAll").checked=true;renderTasks();}
  });
  $("#taskForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),title=safe(fd.get("title")),subject=safe(fd.get("subject")),dueDate=fd.get("dueDate");
    if(!title||!subject||!dueDate){toast("Please complete the title, subject and due date.");return;}
    let milestones;try{milestones=parseMilestones(fd.get("milestones")||"");}catch(err){toast(err.message);return;}
    const id=fd.get("id"), old=state.tasks.find(t=>t.id===id);
    const task={id:id||uid(),title,subject,dueDate,weight:fd.get("weight"),effort:safe(fd.get("effort")),status:fd.get("status"),notes:safe(fd.get("notes")),milestones:milestones.length?milestones:(old?.milestones||[])};
    if(old)Object.assign(old,task);else state.tasks.push(task);
    await saveState();closeDialog("taskDialog");renderAll();toast("Task saved.");
  });
  $("#missedClassBtn").addEventListener("click",()=>{$("#missedForm").reset();$("#missedForm").elements.date.value=todayISO();showDialog("missedDialog");});
  $("#missedForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),title=safe(fd.get("title")),subject=safe(fd.get("subject")),date=fd.get("date");
    if(!title||!subject||!date){toast("Please add a class name, subject and date.");return;}
    const extension=Math.max(0,Math.min(30,Number(state.settings.extensionDays)||0));
    const pack={id:uid(),title,subject,date,reason:fd.get("reason"),summary:safe(fd.get("summary")),links:safe(fd.get("links")),homework:safe(fd.get("homework")),notes:safe(fd.get("notes")),buddyNotes:safe(fd.get("buddyNotes")),checklist:safe(fd.get("checklist")).split("\n").map(x=>x.trim()).filter(Boolean).map(text=>({text,done:false})),createdAt:new Date().toISOString()};
    state.packs.push(pack);
    // Extend matching subject tasks that are due on/after the missed lesson.
    let extended=0; state.tasks.forEach(t=>{if(t.subject.toLowerCase()===subject.toLowerCase()&&t.status!=="done"&&t.dueDate>=date&&extension){t.dueDate=datePlus(t.dueDate,extension);extended++;}});
    state.classes.push({id:uid(),title,subject,date,kind:"missed"});
    await saveState();closeDialog("missedDialog");renderAll();toast(`Catch-up pack created. ${extended} related deadline(s) extended by ${extension} day(s).`);
  });
  function openPack(id) {
    const p=state.packs.find(x=>x.id===id);if(!p)return;state.currentPack=id;
    $("#packTitle").textContent=p.title;
    $("#packContent").innerHTML=`<p><b>${escapeHTML(p.subject)}</b> · ${fmtDate(p.date)} · Reason: ${escapeHTML(p.reason)}</p><h3>Summary</h3><p>${escapeHTML(p.summary||"No summary added.")}</p><h3>Slides / notes link</h3><p>${p.links?`<a href="${escapeHTML(p.links)}" target="_blank" rel="noopener noreferrer">${escapeHTML(p.links)}</a>`:"No link added."}</p><h3>Homework</h3><p>${escapeHTML(p.homework||"No homework listed.")}</p><h3>Your notes</h3><p>${escapeHTML(p.notes||"No personal notes yet.")}</p><h3>Buddy notes</h3><p>${escapeHTML(p.buddyNotes||"No buddy notes yet.")}</p><h3>What you missed</h3><ul>${p.checklist.map((c,i)=>`<li><label class="check-label"><input type="checkbox" data-packcheck="${i}" ${c.done?"checked":""}>${escapeHTML(c.text)}</label></li>`).join("")||"<li>No checklist items yet.</li>"}</ul>`;
    $$("[data-packcheck]").forEach(el=>el.addEventListener("change",()=>{p.checklist[Number(el.dataset.packcheck)].done=el.checked;saveState();}));
    showDialog("packDialog");
  }
  function shareText(text){const url="https://wa.me/?text="+encodeURIComponent(text);window.open(url,"_blank","noopener,noreferrer");}
  function shareTask(id){const t=state.tasks.find(x=>x.id===id);if(t)shareText(`Next Up task: ${t.title}\nSubject: ${t.subject}\nDue: ${fmtDate(t.dueDate)}\nPriority: ${t.weight}\nNotes: ${t.notes||"None"}`);}
  function sharePack(id){const p=state.packs.find(x=>x.id===id);if(p)shareText(`Catch-up pack: ${p.title}\nSubject: ${p.subject}\nMissed: ${fmtDate(p.date)}\nSummary: ${p.summary}\nHomework: ${p.homework}\nChecklist:\n${p.checklist.map(c=>"• "+c.text).join("\n")}`);}
  $("#sharePack").addEventListener("click",()=>{if(state.currentPack)sharePack(state.currentPack);});
  $("#showAll").addEventListener("change",e=>{state.showAll=e.target.checked;renderTasks();});
  $("#subjectFilter").addEventListener("change",e=>{state.filter=e.target.value;renderTasks();});
  $("#prevWeek").addEventListener("click",()=>{state.weekOffset--;renderCalendar();});
  $("#nextWeek").addEventListener("click",()=>{state.weekOffset++;renderCalendar();});
  $("#printBtn").addEventListener("click",()=>window.print());
  $$("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
  $$("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)closeDialog(d.id);}));
  $("#loginTab").addEventListener("click",()=>setAuthMode("login"));
  $("#registerTab").addEventListener("click",()=>setAuthMode("register"));
  $("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault();$("#authMessage").textContent="Checking local demo account…";
    try{
      await authReady;
      const form=new FormData(e.currentTarget),username=safe(form.get("username")),password=String(form.get("password")||"");
      const account=readDemoAccounts().find(item=>item.username.toLowerCase()===username.toLowerCase());
      if(!account||await hashDemoPassword(password,account.salt)!==account.passwordHash){$("#authMessage").textContent="Username or password is incorrect.";return;}
      unlockDemo(account.username);
    }catch(error){$("#authMessage").textContent=error.message||"Local demo sign-in failed.";}
  });
  $("#registerForm").addEventListener("submit",async e=>{
    e.preventDefault();$("#authMessage").textContent="Creating local demo account…";
    try{
      await authReady;
      const form=new FormData(e.currentTarget),username=safe(form.get("username")),password=String(form.get("password")||"");
      if(username.length<3||password.length<8){$("#authMessage").textContent="Use a username with at least 3 characters and a password with at least 8.";return;}
      const accounts=readDemoAccounts();
      if(accounts.some(account=>account.username.toLowerCase()===username.toLowerCase())){$("#authMessage").textContent="That username already exists on this browser.";return;}
      accounts.push(await makeDemoAccount(username,password));
      localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(accounts));
      unlockDemo(username);
    }catch(error){$("#authMessage").textContent=error.message||"Local demo registration failed.";}
  });
  $("#signOut").addEventListener("click",lockDemo);
  authReady=initializeDemoAuth().catch(error=>{$("#authMessage").textContent=error.message||"Local demo sign-in could not be initialized.";throw error;});

  // Speech support is feature-detected; unsupported browsers get a helpful message.
  function speak(text){if(!("speechSynthesis" in window)){toast("Text-to-speech is not available in this browser.");return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);speechSynthesis.speak(utterance);}
  function speakTask(id){const t=state.tasks.find(x=>x.id===id);if(t)speak(`${t.title}. Subject ${t.subject}. Due ${fmtDate(t.dueDate)}. ${t.notes||""}`);}
  function speakTopTasks(){speak(state.tasks.filter(t=>t.status!=="done").sort(priority).slice(0,3).map(t=>`${t.title}, ${t.subject}, due ${fmtDate(t.dueDate)}. ${t.notes}`).join(". ")||"You have no open tasks.");}
  $$("[data-dictate]").forEach(btn=>btn.addEventListener("click",()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){toast("Speech-to-text is not supported in this browser. You can type or paste notes.");return;}const rec=new Recognition();rec.lang=document.documentElement.lang==="zu"?"zu-ZA":document.documentElement.lang==="af"?"af-ZA":"en-ZA";rec.onresult=e=>{const field=$(`[name="${btn.dataset.dictate}"]`);field.value+=(field.value?" ":"")+e.results[0][0].transcript;};rec.onerror=()=>toast("Could not capture speech. Please try again or type your notes.");rec.start();toast("Listening…");}));
  const assistantHistory=[];
  function addAssistantMessage(text,kind) {
    const message=document.createElement("p");message.className=`assistant-message assistant-${kind}`;message.textContent=text;
    $("#assistantMessages").append(message);message.scrollIntoView({block:"nearest"});
  }
  function runAssistantCommand(text) {
    const command=text.toLowerCase().trim().replace(/[.!?]+$/,"");
    if(/^(start|begin|resume|continue)( the)?( focus)? timer$/.test(command)){$("#timerStart").click();return "Focus timer started.";}
    if(/^(pause|stop)( the)?( focus)? timer$/.test(command)){$("#timerPause").click();return "Focus timer paused.";}
    if(/^reset( the)?( focus)? timer$/.test(command)){$("#timerReset").click();return "Focus timer reset.";}
    if(/^(open|show)( the)? calendar$/.test(command)){$("#calendar").scrollIntoView({behavior:"smooth"});location.hash="calendar";return "Opening your calendar.";}
    if(/^(open|show)( the)? study tools?$/.test(command)){$("#study").scrollIntoView({behavior:"smooth"});location.hash="study";return "Opening your study tools.";}
    if(/^(add|create)( a)? task$/.test(command)){showDialog("taskDialog");return "Opening the add-task form.";}
    if(/^(log|add)( a)? missed class$/.test(command)){showDialog("missedDialog");return "Opening the missed-class form.";}
    if(/^(read|speak)( my)? tasks( aloud)?$/.test(command)){speakTopTasks();return "Reading your top tasks aloud.";}
    return "";
  }
  $("#assistantOpen").addEventListener("click",()=>showDialog("assistantDialog"));
  $("#assistantForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const input=$("#assistantInput"),question=safe(input.value);
    if(!question)return;
    input.value="";$("#assistantStatus").textContent="Working…";
    const voiceRequest=$("#assistantForm").dataset.voiceRequest==="true";
    $("#assistantForm").dataset.voiceRequest="false";
    addAssistantMessage(question,"user");
    const commandReply=runAssistantCommand(question);
    if(commandReply){
      addAssistantMessage(commandReply,"reply");$("#assistantStatus").textContent="";
      if(voiceRequest)speak(commandReply);
      return;
    }
    const submitButton=$("#assistantForm button[type=submit]");submitButton.disabled=true;
    try{
      const context={tasks:state.tasks.filter(task=>task.status!=="done").sort(priority).slice(0,12).map(task=>({title:task.title,subject:task.subject,dueDate:task.dueDate,status:task.status})),timer:$("#timerDisplay").textContent};
      const response=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:question,history:assistantHistory.slice(-8),context})});
      const result=await response.json().catch(()=>({error:"The assistant server returned an invalid response."}));
      if(!response.ok)throw new Error(result.error||`Assistant request failed (${response.status}).`);
      if(typeof result.reply!=="string"||!result.reply.trim())throw new Error("The assistant returned an empty reply.");
      const reply=result.reply.trim();assistantHistory.push({role:"user",content:question},{role:"assistant",content:reply});
      addAssistantMessage(reply,"reply");$("#assistantStatus").textContent="";
      if(voiceRequest)speak(reply);
    }catch(error){
      $("#assistantStatus").textContent=error.message||"The assistant could not respond. Check the local server and try again.";
      addAssistantMessage(error.message||"The assistant could not respond. Check the local server and try again.","reply");
    }finally{submitButton.disabled=false;}
  });
  $("#assistantVoice").addEventListener("click",()=>{
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){$("#assistantStatus").textContent="Voice input is not supported in this browser. You can type a question instead.";return;}
    const recognition=new Recognition();recognition.lang=document.documentElement.lang==="zu"?"zu-ZA":document.documentElement.lang==="af"?"af-ZA":"en-ZA";recognition.continuous=false;recognition.interimResults=false;
    recognition.onstart=()=>{$("#assistantStatus").textContent="Listening… Try “start timer” or ask a study question.";$("#assistantVoice").disabled=true;};
    recognition.onresult=event=>{$("#assistantInput").value=event.results[0][0].transcript;$("#assistantForm").dataset.voiceRequest="true";$("#assistantForm").requestSubmit();};
    recognition.onerror=event=>{$("#assistantStatus").textContent=event.error==="not-allowed"?"Microphone access was denied. Allow microphone access or type your question.":"Voice input failed. Please try again or type your question.";};
    recognition.onend=()=>{$("#assistantVoice").disabled=false;if($("#assistantStatus").textContent==="Listening… Try “start timer” or ask a study question.")$("#assistantStatus").textContent="";}
    try{recognition.start();}catch(error){$("#assistantStatus").textContent=`Could not start voice input: ${error.message}`;}
  });

  // Pomodoro timer.
  function showTimer(){const m=Math.floor(timerSeconds/60),s=timerSeconds%60,elapsed=timerDuration-timerSeconds;$("#timerDisplay").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;$("#timerClock").setAttribute("aria-label",`${m} minute${m===1?"":"s"} and ${s} second${s===1?"":"s"} remaining`);$("#timerClock").style.setProperty("--timer-angle",`${elapsed/timerDuration*360}deg`);$("#timerClock").style.setProperty("--timer-progress",`${elapsed/timerDuration*360}deg`);}
  $("#timerStart").addEventListener("click",()=>{if(timerInterval)return;timerInterval=setInterval(()=>{timerSeconds=Math.max(0,timerSeconds-1);showTimer();if(!timerSeconds){clearInterval(timerInterval);timerInterval=null;toast("Focus session complete. Take a short break.");}},1000);});
  $("#timerPause").addEventListener("click",()=>{clearInterval(timerInterval);timerInterval=null;});
  $("#timerReset").addEventListener("click",()=>{clearInterval(timerInterval);timerInterval=null;timerSeconds=Math.max(1,Math.min(90,Number($("#focusMinutes").value)||25))*60;timerDuration=timerSeconds;showTimer();});
  $("#focusMinutes").addEventListener("change",()=>$("#timerReset").click());
  $("#plannerForm").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),name=safe(fd.get("plan"));if(!name)return;state.plans.push({id:uid(),name,duration:Number(fd.get("duration")),date:todayISO(),done:false});await saveState();renderPlans();e.currentTarget.reset();});
  function renderPlans(){$("#studyPlan").innerHTML=state.plans.map(p=>`<li>${escapeHTML(p.name)} — ${p.duration} min <label class="check-label"><input type="checkbox" data-plan="${p.id}" ${p.done?"checked":""}> Done</label></li>`).join("");$$("[data-plan]").forEach(c=>c.addEventListener("change",()=>{const p=state.plans.find(x=>x.id===c.dataset.plan);p.done=c.checked;saveState();}));}
  function getYouTubeVideoId(rawUrl){
    let url;
    try{url=new URL(rawUrl);}catch{return "";}
    if(url.protocol!=="https:")return "";
    const host=url.hostname.toLowerCase();
    if(host==="youtu.be"||host==="www.youtu.be"){
      const id=url.pathname.split("/").filter(Boolean)[0]||"";
      return /^[A-Za-z0-9_-]{11}$/.test(id)?id:"";
    }
    if(!["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com"].includes(host))return "";
    const segments=url.pathname.split("/").filter(Boolean);
    const id=url.pathname==="/watch"?url.searchParams.get("v")||"":["embed","shorts","live"].includes(segments[0])?segments[1]||"":"";
    return /^[A-Za-z0-9_-]{11}$/.test(id)?id:"";
  }
  $("#videoForm").addEventListener("submit",event=>{
    event.preventDefault();
    const videoId=getYouTubeVideoId($("#youtubeUrl").value.trim());
    if(!videoId){
      $("#videoStatus").textContent="Enter a valid HTTPS link to a YouTube video.";
      $("#youtubeUrl").setAttribute("aria-invalid","true");
      $("#youtubeUrl").focus();
      return;
    }
    $("#youtubeUrl").removeAttribute("aria-invalid");
    $("#youtubeFrame").src=`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    $("#videoPlayer").hidden=false;
    $("#clearVideo").hidden=false;
    $("#videoStatus").textContent="Video ready. YouTube may receive data when playback starts.";
  });
  $("#videoForm").elements.youtubeUrl.addEventListener("input",event=>event.target.removeAttribute("aria-invalid"));
  $("#clearVideo").addEventListener("click",()=>{
    $("#youtubeFrame").src="";
    $("#videoPlayer").hidden=true;
    $("#clearVideo").hidden=true;
    $("#videoForm").reset();
    $("#videoStatus").textContent="YouTube videos load only after you submit a link. Playback uses YouTube's privacy-enhanced embed.";
    $("#videoForm").elements.youtubeUrl.focus();
  });

  // Settings and language strings. Add new language dictionaries here.
  const translations={
    en:{tagline:"Know what to do next.",navFeed:"Next Up",navCalendar:"Calendar",navCatchup:"Catch-up",navStudy:"Study tools",navSettings:"Settings"},
    zu:{tagline:"Yazi okufanele ukwenze ngokulandelayo.",navFeed:"Okulandelayo",navCalendar:"Ikhalenda",navCatchup:"Ukubamba ongekho",navStudy:"Amathuluzi okufunda",navSettings:"Izilungiselelo"},
    af:{tagline:"Weet wat om volgende te doen.",navFeed:"Volgende",navCalendar:"Kalender",navCatchup:"Inhaalwerk",navStudy:"Studiehulpmiddels",navSettings:"Instellings"}
  };
  function applySettings(){
    const s=state.settings;document.body.classList.toggle("high-contrast",!!s.highContrast);document.body.classList.toggle("dark-mode",!!s.darkMode);document.body.classList.toggle("dyslexia-font",!!s.dyslexiaFont);document.body.classList.toggle("low-data",!!s.lowData);document.body.classList.toggle("large-text",s.textSize==="large");document.body.classList.toggle("largest-text",s.textSize==="largest");
    $("#highContrast").checked=!!s.highContrast;$("#darkMode").checked=!!s.darkMode;$("#dyslexiaFont").checked=!!s.dyslexiaFont;$("#lowData").checked=!!s.lowData;$("#textSize").value=s.textSize||"normal";$("#extensionDays").value=s.extensionDays??2;$("#quietStart").value=s.quietStart||"21:00";$("#quietEnd").value=s.quietEnd||"07:00";$("#notifications").checked=!!s.notifications;
    $("#language").value=s.language||"en";document.documentElement.lang=s.language==="zu"?"zu":s.language==="af"?"af":"en";
    $$("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;el.textContent=translations[s.language||"en"][key]||translations.en[key];});
  }
  ["highContrast","darkMode","dyslexiaFont","lowData","textSize","language","extensionDays","quietStart","quietEnd","notifications"].forEach(id=>$("#"+id).addEventListener("change",async e=>{const key=id==="highContrast"?"highContrast":id==="darkMode"?"darkMode":id==="dyslexiaFont"?"dyslexiaFont":id==="lowData"?"lowData":id==="textSize"?"textSize":id==="language"?"language":id==="extensionDays"?"extensionDays":id==="quietStart"?"quietStart":id==="quietEnd"?"quietEnd":"notifications";state.settings[key]=e.target.type==="checkbox"?e.target.checked:e.target.type==="number"?Math.max(0,Math.min(30,Number(e.target.value)||0)):e.target.value;applySettings();await saveState();}));
  $("#wellbeingForm").addEventListener("submit",async e=>{e.preventDefault();state.wellbeing.push({date:todayISO(),level:Number($("#overwhelm").value)});await saveState();$("#wellbeingMessage").textContent="Thank you for checking in. If things feel too much, consider speaking with someone you trust.";});
  $("#saveContacts").addEventListener("click",async()=>{state.settings.counsellor=safe($("#counsellorLink").value);state.settings.tutor=safe($("#tutorLink").value);await saveState();toast("Support contacts saved on this device.");});
  $("#teacherToggle").addEventListener("click",()=>{$("#teacherPanel").hidden=!$("#teacherPanel").hidden;});
  $("#teacherForm").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),kind=fd.get("kind"),title=safe(fd.get("title")),subject=safe(fd.get("subject")),date=fd.get("date");if(!title||!subject||!date){toast("Complete all required fields.");return;}if(kind==="task")state.tasks.push({id:uid(),title,subject,dueDate:date,weight:"medium",effort:"",notes:safe(fd.get("notes")),status:"todo",milestones:[]});else state.classes.push({id:uid(),title,subject,date,kind:"class",notes:safe(fd.get("notes"))});await saveState();renderAll();toast("Entry added.");e.currentTarget.reset();});
  function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  $("#exportData").addEventListener("click",()=>downloadJSON({format:"next-up-backup",version:1,exportedAt:new Date().toISOString(),state},"next-up-backup.json"));
  $("#exportTeacher").addEventListener("click",()=>downloadJSON({format:"next-up-teacher-pack",version:1,tasks:state.tasks,classes:state.classes},"next-up-teacher-pack.json"));
  $("#importData").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(parsed.format==="next-up-backup"&&parsed.state){if(!confirm("Replace the data on this device with this backup? Export your current data first if you want to keep it."))return;Object.assign(state,parsed.state);}else if(parsed.format==="next-up-teacher-pack"){(parsed.tasks||[]).forEach(t=>state.tasks.push({...t,id:uid()}));(parsed.classes||[]).forEach(c=>state.classes.push({...c,id:uid()}));}else throw new Error("This file is not a Next Up backup or teacher pack.");await saveState();applySettings();renderAll();renderPlans();toast("Import complete.");}catch(err){toast(`Import failed: ${err.message}`);}finally{e.target.value="";}});
  // Notification permission is opt-in. In-app reminders remain available regardless.
  async function sendDeadlineNotifications(){
    if(!("Notification" in window)||Notification.permission!=="granted"||!state.settings.notifications)return;
    const now=new Date(),today=todayISO(),quiet=state.settings.quietStart||"21:00",end=state.settings.quietEnd||"07:00",clock=now.toTimeString().slice(0,5);
    const inQuiet=quiet>end?(clock>=quiet||clock<end):(clock>=quiet&&clock<end);if(inQuiet)return;
    const sent=JSON.parse(localStorage.getItem("nextUpNotified")||"{}");
    state.tasks.filter(t=>t.status!=="done"&&t.dueDate).forEach(t=>{
      const days=Math.round((new Date(`${t.dueDate}T12:00:00`)-new Date(`${today}T12:00:00`))/86400000);
      if([7,2,0].includes(days)){const key=`${t.id}-${days}-${today}`;if(!sent[key]){new Notification(`Next Up: ${t.title}`,{body:days===0?"Due today":`Due in ${days} days · ${t.subject}`});sent[key]=true;}}
    });
    localStorage.setItem("nextUpNotified",JSON.stringify(sent));
  }
  $("#notifications").addEventListener("change",async e=>{if(e.target.checked&&"Notification"in window){const permission=await Notification.requestPermission();if(permission!=="granted"){state.settings.notifications=false;e.target.checked=false;toast("Notifications were not allowed. In-app reminders will still appear.");await saveState();}}});
  // PWA install prompt.
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("#installBtn").hidden=false;});
  $("#installBtn").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("#installBtn").hidden=true;});
  const navLinks=$$(".nav-link");
  let navUpdateScheduled=false;
  function updateActiveNavigation(){
    const marker=window.innerHeight*.36;
    let activeSection=$("#feed");
    for(const link of navLinks){
      const section=$(link.hash);
      if(!section)continue;
      const bounds=section.getBoundingClientRect();
      if(bounds.top<=marker)activeSection=section;
      if(bounds.top<=marker&&bounds.bottom>marker){activeSection=section;break;}
    }
    navLinks.forEach(link=>{
      const active=link.hash===`#${activeSection.id}`;
      link.classList.toggle("active",active);
      if(active)link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    });
  }
  function scheduleNavigationUpdate(){
    if(navUpdateScheduled)return;
    navUpdateScheduled=true;
    requestAnimationFrame(()=>{navUpdateScheduled=false;updateActiveNavigation();});
  }
  window.addEventListener("scroll",scheduleNavigationUpdate,{passive:true});
  window.addEventListener("resize",scheduleNavigationUpdate);
  window.addEventListener("hashchange",scheduleNavigationUpdate);
  window.addEventListener("load",scheduleNavigationUpdate,{once:true});
  updateActiveNavigation();
  if("serviceWorker"in navigator && location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>toast("Offline caching could not be enabled in this browser.")));}
  if("IntersectionObserver"in window&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    const scrollMotionObserver=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle("is-visible",entry.isIntersecting)),{threshold:0.08,rootMargin:"0px 0px -4% 0px"});
    $$("#main > .welcome, #main > .section").forEach(section=>{section.classList.add("scroll-motion");scrollMotionObserver.observe(section);});
  }
  async function init(){
    await authReady;
    $("#todayLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
    await loadState();applySettings();renderAll();renderPlans();
    $("#counsellorLink").value=state.settings.counsellor||"";$("#tutorLink").value=state.settings.tutor||"";
    sendDeadlineNotifications();
  }
  init().catch(()=>toast("Next Up could not start fully. Please reload the page."));
})();