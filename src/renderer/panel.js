const $=selector=>document.querySelector(selector);
let state={settings:{},tasks:[],history:[]},files=[],fileBusy=false,chatBusy=false,settingsDirty=false,previewTimer,previewVersion=0;
function status(text,error=false){$('#system-message').textContent=text;$('#system-message').classList.toggle('error',error);}
function report(error){status(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true);}
function tab(name){if(name!=='settings')clearPreview();document.querySelectorAll('.module').forEach(section=>section.hidden=section.id!==name);document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===(name==='memory'?'chat':name);button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>tab(button.dataset.tab));
document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>tab(button.dataset.open));
document.querySelectorAll('[data-setting-link]').forEach(button=>button.onclick=()=>$('#'+button.dataset.settingLink).scrollIntoView({block:'start'}));
window.icey.onTab(tab);tab('status');
$('#manage-memory').onclick=()=>tab('memory');$('#back-chat').onclick=()=>tab('chat');
$('#manage-workspaces').onclick=()=>tab('workspaces');
let editingWorkspaceId=null,workspaceBusy=false;
function resetWorkspaceForm(){editingWorkspaceId=null;$('#workspace-form').reset();$('#workspace-save').textContent='新建工作区';$('#workspace-cancel').hidden=true;}
$('#workspace-choose-folder').onclick=async()=>{try{const root=await window.icey.chooseWorkspaceFolder();if(root)$('#workspace-folder').value=root;}catch(error){report(error);}};
$('#workspace-clear-folder').onclick=()=>{$('#workspace-folder').value='';};
async function selectWorkspace(id){if(workspaceBusy)return;workspaceBusy=true;try{state=await window.icey.switchWorkspace(id);resetTaskForm();$('#chat-input').value='';applyState();status('已切换工作区');}catch(error){report(error);}finally{workspaceBusy=false;renderWorkspaces();}}
$('#workspace-select').onchange=()=>selectWorkspace($('#workspace-select').value);
$('#workspace-cancel').onclick=resetWorkspaceForm;
$('#workspace-form').onsubmit=async event=>{event.preventDefault();if(workspaceBusy)return;workspaceBusy=true;$('#workspace-save').disabled=true;try{state=await window.icey.saveWorkspace({id:editingWorkspaceId,name:$('#workspace-name').value.trim(),description:$('#workspace-description').value.trim(),rootPath:$('#workspace-folder').value});resetWorkspaceForm();resetTaskForm();applyState();status('工作区与文件夹授权已保存');}catch(error){report(error);}finally{workspaceBusy=false;$('#workspace-save').disabled=false;renderWorkspaces();}};
function renderWorkspaces(){
  const groups=state.workspaces||[],active=state.activeWorkspaceId||'default',selector=$('#workspace-select');selector.replaceChildren(...groups.filter(group=>!group.archived).map(group=>new Option(group.name,group.id)));selector.value=active;selector.disabled=workspaceBusy;
  const taskSelect=$('#task-workspace'),chosen=taskSelect.value;taskSelect.replaceChildren(...groups.filter(group=>!group.archived).map(group=>new Option(group.name,group.id)));taskSelect.value=groups.some(group=>group.id===chosen&&!group.archived)?chosen:active;
  $('#workspace-count').textContent=groups.length+' 个分组';const list=$('#workspace-list');list.replaceChildren();
  for(const group of groups){const row=element('article','plugin-card'),heading=element('div','plugin-card-heading');heading.append(element('h2','',group.name),element('span','badge',group.archived?'已归档':group.id===active?'当前':'可使用'));row.append(heading,element('p','plugin-description',group.description||'暂无项目说明'));
    row.append(element('p','field-help',group.rootPath?'已授权读写：'+group.rootPath:'未授权文件夹 · 仅对话与文字任务'));
    const actions=element('div','workspace-actions'),edit=element('button','','编辑');edit.onclick=()=>{editingWorkspaceId=group.id;$('#workspace-name').value=group.name;$('#workspace-description').value=group.description;$('#workspace-folder').value=group.rootPath||'';$('#workspace-save').textContent='保存工作区';$('#workspace-cancel').hidden=false;$('#workspace-name').focus();};actions.append(edit);
    if(!group.archived){const open=element('button','','进入');open.onclick=async()=>{await selectWorkspace(group.id);tab('chat');};actions.append(open);}
    if(group.id!=='default'){const archive=element('button','',group.archived?'恢复':'归档');archive.onclick=async()=>{try{state=await window.icey.archiveWorkspace(group.id,!group.archived);resetTaskForm();applyState();status(group.archived?'工作区已恢复，任务仍保持暂停':'工作区已归档，相关任务已暂停');}catch(error){report(error);}};actions.append(archive);}
    row.append(actions);list.append(row);
  }
}
$('#close').onclick=()=>window.icey.windowAction('close');$('#minimize').onclick=()=>window.icey.windowAction('minimize');$('#quit').onclick=()=>window.icey.windowAction('quit');$('#show-pet').onclick=()=>window.icey.windowAction('pet');
function renderChat(){const list=$('#messages');list.replaceChildren();if(!state.history.length){list.append($('#chat-empty-template').content.cloneNode(true));list.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('#chat-input').value=button.dataset.prompt;$('#chat-input').focus();});}for(const message of state.history){const row=document.createElement('div');row.className='message '+message.role;const speaker=document.createElement('div');speaker.className='speaker';speaker.textContent=message.role==='user'?'你':message.proactive?'艾希 · 主动':'艾希';const content=document.createElement('div');content.className='content';content.textContent=message.content;row.append(speaker,content);list.append(row);}list.scrollTop=list.scrollHeight;}
let pluginWorking=false;
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function pluginButton(text,callback){const button=element('button','',text);button.type='button';button.disabled=pluginWorking;button.onclick=callback;return button;}
function renderExtensions(){
  const extension=state.extensions||{},plugins=extension.plugins||[],skills=extension.skills||[],query=$('#plugin-search').value.trim().toLowerCase();
  $('#plugin-count').textContent=plugins.length;$('#skill-count').textContent=skills.length;
  $('#plugin-load-error').hidden=!extension.error;$('#plugin-load-error').textContent=extension.error||'';
  const list=$('#plugin-list');list.replaceChildren();
  const visible=plugins.filter(item=>[item.name,item.description,...(item.skillNames||[]),...skills.filter(skill=>skill.id.startsWith(item.id+':')).map(skill=>skill.name)].join(' ').toLowerCase().includes(query));
  if(!visible.length)list.append(element('p','extension-empty',query?'没有匹配的插件。':'还没有安装插件。从上面的示例开始，或者请艾希为你制作一个。'));
  for(const plugin of visible){
    const row=element('article','plugin-card'),heading=element('div','plugin-card-heading'),title=element('div'),badge=element('span','badge'+(plugin.enabled!==false?' good':''),plugin.enabled===false?'已停用':'已启用');
    title.append(element('h2','',plugin.name),element('p','field-help',(plugin.version?'v'+plugin.version+' · ':'')+(plugin.skillCount??skills.filter(skill=>skill.id.startsWith(plugin.id+':')).length)+' 项技能'));
    heading.append(title,badge);row.append(heading,element('p','plugin-description',plugin.description||'本机扩展'));
    const actions=element('div','plugin-card-actions');
    if(plugin.managed){
      actions.append(pluginButton(plugin.enabled===false?'启用':'停用',()=>pluginJob(()=>window.icey.managePlugin(plugin.id,plugin.enabled===false?'enable':'disable'),'正在更新插件…','插件状态已更新')));
      actions.append(pluginButton('查看内容',async()=>{try{const manifest=await window.icey.inspectPlugin(plugin.id);$('#plugin-inspector-json').textContent=JSON.stringify(manifest,null,2);$('#plugin-inspector').hidden=false;$('#plugin-inspector').open=true;$('#plugin-inspector').scrollIntoView({block:'nearest',behavior:'smooth'});}catch(error){report(error);}}));
      actions.append(pluginButton('导出',()=>pluginJob(async()=>{const saved=await window.icey.exportPlugin(plugin.id);return {notice:saved?'插件已导出':'已取消导出'};},'选择插件保存位置…','')));
      actions.append(pluginButton('卸载',()=>pluginJob(()=>window.icey.managePlugin(plugin.id,'remove'),'正在处理…','插件列表已更新')));
    }
    row.append(actions);
    const pluginSkills=skills.filter(skill=>skill.id.startsWith(plugin.id+':'));
    if(pluginSkills.length){const group=element('div','plugin-skill-list');for(const skill of pluginSkills){const item=element('div','plugin-skill'),description=element('div');description.append(element('strong','',skill.name),element('p','',skill.description));item.append(description,pluginButton('使用 ↗',()=>{tab('chat');$('#chat-input').value=`请使用「${skill.name}」技能，${skill.type==='file'?'文件完整路径：':skill.type==='weather'?'城市：':'处理以下内容：\n'}`;$('#chat-input').focus();}));group.append(item);}row.append(group);}
    list.append(row);
  }
  const templateList=$('#plugin-templates');templateList.replaceChildren();
  for(const template of extension.templates||[]){const card=element('div','template-card');card.append(element('strong','',template.name),element('p','',template.description));const installed=plugins.some(item=>item.id===template.id);const button=pluginButton(installed?'已安装':'查看并安装',()=>pluginJob(()=>window.icey.preparePlugin('template',template.id),'正在准备插件…','核对后即可安装'));button.disabled=pluginWorking||installed;card.append(button);templateList.append(card);}
  const draft=extension.draft;$('#plugin-preview').hidden=!draft;
  if(draft){$('#plugin-preview-summary').textContent=draft.description;$('#plugin-preview-origin').textContent='来源：'+draft.source;$('#plugin-preview-json').textContent=JSON.stringify(draft.manifest,null,2);}
}
async function pluginJob(work,progress,success){
  if(pluginWorking)return;pluginWorking=true;
  const buttons=[...document.querySelectorAll('.extension-launchpad button,#plugin-import-form button,#plugin-create-form button,#plugin-preview button')];buttons.forEach(button=>button.disabled=true);renderExtensions();
  $('#plugin-feedback').classList.remove('error');$('#plugin-feedback').textContent=progress;status(progress);
  try{const next=await work();if(next?.settings){state=next;applyState();}const text=next?.notice||success||'已完成';$('#plugin-feedback').textContent=text;status(text);if(state.extensions?.draft)$('#plugin-preview').scrollIntoView({block:'nearest',behavior:'smooth'});}
  catch(error){report(error);$('#plugin-feedback').classList.add('error');$('#plugin-feedback').textContent=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}
  finally{pluginWorking=false;buttons.forEach(button=>button.disabled=false);renderExtensions();}
}
$('#choose-plugin').onclick=()=>pluginJob(()=>window.icey.choosePlugin(),'请选择插件文件…','已读取，确认后即可安装');
$('#toggle-plugin-import').onclick=()=>{const form=$('#plugin-import-form');form.hidden=!form.hidden;$('#toggle-plugin-import').setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)$('#plugin-source').focus();};
$('#focus-plugin-request').onclick=()=>$('#plugin-request').focus();
$('#plugin-import-form').onsubmit=event=>{event.preventDefault();const source=$('#plugin-source').value.trim();if(source)pluginJob(()=>window.icey.preparePlugin(source.startsWith('{')?'json':'source',source),'正在读取插件…','已读取，确认后即可安装');};
$('#plugin-create-form').onsubmit=event=>{event.preventDefault();const request=$('#plugin-request').value.trim();if(request)pluginJob(()=>window.icey.preparePlugin('generate',request),'艾希正在制作插件…','插件已准备好，请核对内容');};
$('#install-plugin').onclick=()=>{const draft=state.extensions?.draft;if(draft)pluginJob(()=>window.icey.installPlugin(draft.id),'正在安装…','插件已启用，可以在对话中使用');};
$('#discard-plugin').onclick=()=>{const draft=state.extensions?.draft;if(draft)pluginJob(()=>window.icey.discardPlugin(draft.id),'正在放弃草稿…','草稿已放弃');};
$('#plugin-search').oninput=renderExtensions;
$('#open-extension-guide').onclick=async()=>{try{await window.icey.openExtensionGuide();status('已打开扩展说明');}catch(error){report(error);}};
function renderAction(){const action=state.pendingAction;$('#action-card').hidden=!action;if(!action)return;$('#action-label').textContent=action.label;$('#action-confirm').textContent=action.kind==='read'||action.kind==='list'?'确认读取并发送':'确认执行';}
async function resolveAction(approve){const action=state.pendingAction;if(!action||chatBusy)return;chatBusy=true;$('#action-confirm').disabled=true;$('#action-cancel').disabled=true;status(approve?'正在执行已授权操作…':'正在取消操作…');try{const result=await window.icey.resolveAction(action.id,approve);state=await window.icey.getState();applyState();status(result.text);}catch(error){state=await window.icey.getState().catch(()=>state);applyState();report(error);}finally{chatBusy=false;$('#action-confirm').disabled=false;$('#action-cancel').disabled=false;}}
$('#action-confirm').onclick=()=>resolveAction(true);$('#action-cancel').onclick=()=>resolveAction(false);
$('#chat-form').onsubmit=async event=>{event.preventDefault();const input=$('#chat-input'),message=input.value.trim();if(!message||chatBusy)return;chatBusy=true;$('#send-chat').disabled=true;input.value='';state.history.push({role:'user',content:message});renderChat();status('艾希正在回复…');try{const result=await window.icey.chat(message);state=await window.icey.getState();applyState();status(result.mode==='local'?'连接对话服务后，可以和艾希自由交流':result.mode==='action'?'请求已处理，请核对结果':'艾希已回复');}catch(error){state=await window.icey.getState().catch(()=>state);renderChat();report(error);}finally{chatBusy=false;$('#send-chat').disabled=false;input.focus();}};
$('#chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('#chat-form').requestSubmit();}});
$('#clear-chat').onclick=async()=>{if(chatBusy)return;try{await window.icey.clearChat();state.history=[];renderChat();status('对话已清空');}catch(error){report(error);}};
let editingTaskId=null,taskFilter='active',taskSaving=false;
function localInputTime(value){const date=new Date(value),pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
function taskTime(task){if(!task.runAt)return '尚未设置时间';const repeat=task.repeat==='none'?(task.timing==='date'?'仅这一天':'不重复'):task.repeat==='weekly'?'每周'+['日','一','二','三','四','五','六'][new Date(task.runAt).getDay()]:'每天';return `${new Date(task.runAt).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${repeat} · ${task.action==='remind'?'仅提醒':'艾希处理'}`;}
function taskSchedule(now=new Date()){
  const time=$('#task-at').value,repeat=$('#task-repeat').value;
  if(!/^\d{2}:\d{2}$/.test(time))throw new Error('请选择执行时间');
  const [hours,minutes]=time.split(':').map(Number);if(hours>23||minutes>59)throw new Error('执行时间无效');
  let runAt=new Date(now);runAt.setHours(hours,minutes,0,0);
  if(repeat==='date'){
    const value=$('#task-date').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请选择执行日期');
    const [year,month,day]=value.split('-').map(Number);runAt=new Date(year,month-1,day,hours,minutes,0,0);
    if(runAt.getFullYear()!==year||runAt.getMonth()!==month-1||runAt.getDate()!==day||runAt.getHours()!==hours||runAt.getMinutes()!==minutes)throw new Error('所选日期或时间无效');
    if(runAt<=now)throw new Error('所选日期的这个时间已过去，请选择未来时间');
  }else if(repeat==='weekly'){
    const weekday=Number($('#task-weekday').value);if(!Number.isInteger(weekday)||weekday<0||weekday>6)throw new Error('请选择每周几执行');
    runAt.setDate(runAt.getDate()+(weekday-runAt.getDay()+7)%7);if(runAt<=now)runAt.setDate(runAt.getDate()+7);
  }else if(runAt<=now)runAt.setDate(runAt.getDate()+1);
  return {runAt:runAt.toISOString(),repeat:repeat==='date'?'none':repeat,timing:repeat==='date'?'date':'next'};
}
function updateTaskTiming(){
  const mode=$('#task-repeat').value;$('#task-date-field').hidden=mode!=='date';$('#task-date').required=mode==='date';$('#task-date').disabled=mode!=='date';$('#task-weekday-field').hidden=mode!=='weekly';$('#task-weekday').disabled=mode!=='weekly';$('#task-date').min=localInputTime(Date.now()).split('T')[0];
  try{const schedule=taskSchedule();$('#task-next-run').textContent=(mode==='date'?'仅在：':'下次执行：')+new Date(schedule.runAt).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});$('#task-next-run').classList.remove('error');}
  catch(error){$('#task-next-run').textContent=error.message;$('#task-next-run').classList.add('error');}
}
function resetTaskForm(){editingTaskId=null;$('#task-form').reset();$('#task-workspace').value=state.activeWorkspaceId||'default';const [date,time]=localInputTime(Date.now()+3600000).split('T');$('#task-at').value=time;$('#task-date').value=date;$('#task-weekday').value=String(new Date().getDay());$('#task-submit').textContent='安排任务';$('#task-cancel').hidden=true;updateTaskTiming();}
function editTask(task){
  editingTaskId=task.id;const at=task.runAt&&!task.done?new Date(task.runAt):new Date(Date.now()+3600000),[date,time]=localInputTime(at).split('T');
  $('#task-title').value=task.title||'';$('#task-workspace').value=task.workspaceId||'default';$('#task-context').value=task.contextMode||'fresh';
  $('#task-input').value=task.text;$('#task-at').value=time;$('#task-date').value=date;$('#task-weekday').value=String(new Date(task.runAt||at).getDay());$('#task-repeat').value=task.repeat==='none'?(task.timing==='next'?'none':'date'):task.repeat||'none';$('#task-reminder-only').checked=task.action==='remind';$('#task-submit').textContent=task.done?'重新安排':'保存任务';$('#task-cancel').hidden=false;updateTaskTiming();$('#tasks').scrollTo({top:0,behavior:'smooth'});$('#task-input').focus();
}
function renderTasks(){
  const list=$('#task-list');list.replaceChildren();
  const scoped=state.tasks.filter(task=>(task.workspaceId||'default')===(state.activeWorkspaceId||'default'));
  const remaining=scoped.filter(t=>!t.done&&t.enabled).length,paused=scoped.filter(t=>!t.done&&!t.enabled).length,done=scoped.filter(t=>t.done).length;
  $('#task-count').textContent=remaining;$('#task-summary').textContent=scoped.length?`${remaining} 待执行 · ${paused} 已暂停 · ${done} 已结束`:'暂无任务';$('#clear-done-tasks').hidden=!done;
  const tasks=scoped.filter(task=>taskFilter==='all'||(taskFilter==='done'?task.done:!task.done)).sort((a,b)=>Number(a.done)-Number(b.done)||(Date.parse(a.runAt)||Infinity)-(Date.parse(b.runAt)||Infinity));
  $('#task-empty').hidden=tasks.length>0;$('#task-empty-title').textContent=taskFilter==='done'?'还没有结束的任务':state.tasks.length?'这里暂时没有任务':'还没有安排任务';
  document.querySelectorAll('[data-task-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskFilter===taskFilter)));
  for(const task of tasks){
    const row=element('div','task'),content=element('div','task-content'),label=element('strong',task.done?'done':'',task.title||task.text),detail=element('small','',(task.missed?'已错过 · ':task.done?'本次计划已结束 · ':task.enabled?'':'已暂停 · ')+taskTime(task));content.append(label,element('p','task-prompt',task.text.slice(0,160)),detail);
    const actions=element('div','task-actions'),edit=element('button','',task.done?'重新安排':'编辑');edit.onclick=()=>editTask(task);edit.setAttribute('aria-label',`编辑任务 ${task.text}`);actions.append(edit);
    if(!task.done){const toggle=element('button','',task.runAt?(task.enabled?'暂停':'继续'):'完成');toggle.onclick=()=>saveTasks(state.tasks.map(t=>t.id===task.id?t.runAt?{...t,enabled:!t.enabled}:{...t,done:true}:t));actions.append(toggle);}
    const run=element('button','','立即运行');run.disabled=(state.taskRuns||[]).some(item=>item.taskId===task.id&&['queued','running'].includes(item.status));run.onclick=async()=>{try{state=await window.icey.runTaskNow(task.id);applyState();status('已加入执行队列，不改变原定时间');}catch(error){report(error);}};actions.append(run);
    const remove=element('button','','删除');remove.setAttribute('aria-label',`删除任务 ${task.text}`);remove.onclick=async()=>{if(await saveTasks(state.tasks.filter(t=>t.id!==task.id))&&editingTaskId===task.id)resetTaskForm();};actions.append(remove);row.append(content,actions);list.append(row);
  }
  renderTaskRuns();
}
const openedRuns=new Set();
function renderTaskRuns(){
  const runs=state.taskRuns||[],list=$('#task-run-list');$('#task-run-summary').textContent=runs.filter(run=>run.unread).length+' 条待查看 · 最近 100 次';
  list.replaceChildren();if(!runs.length){list.append(element('p','extension-empty','任务执行后，完整结果会保存在这里。'));return;}
  const labels={queued:'等待执行',running:'正在处理',succeeded:'已完成',failed:'失败',needs_attention:'需要处理'};
  for(const run of runs){const card=element('details','task-run-card');card.open=openedRuns.has(run.id);card.append(element('summary','',`${run.unread?'● ':''}${run.title} · ${labels[run.status]||run.status}`),element('p','field-help',new Date(run.startedAt).toLocaleString('zh-CN',{hour12:false})+' · '+(run.trigger==='manual'?'手动运行':'定时执行')),element('pre','task-run-output',run.output));
    card.ontoggle=async()=>{if(card.open){openedRuns.add(run.id);if(run.unread){try{await window.icey.readTaskResult(run.id);}catch(error){report(error);}}}else openedRuns.delete(run.id);};
    const continueButton=element('button','','继续处理 ↗');continueButton.onclick=()=>{tab('chat');$('#chat-input').value=run.prompt.slice(0,4000);$('#chat-input').focus();};card.append(continueButton);list.append(card);
  }
}
async function saveTasks(next){if(taskSaving)return false;taskSaving=true;$('#task-submit').disabled=true;try{state.tasks=await window.icey.saveTasks(next);renderTasks();status('安排已保存');return true;}catch(error){report(error);renderTasks();return false;}finally{taskSaving=false;$('#task-submit').disabled=false;}}
$('#task-cancel').onclick=resetTaskForm;
for(const id of ['task-at','task-date','task-weekday'])$('#'+id).addEventListener('input',updateTaskTiming);
$('#task-repeat').onchange=()=>{updateTaskTiming();if($('#task-repeat').value==='date'){try{$('#task-date').showPicker();}catch{$('#task-date').focus();}}};
document.querySelectorAll('[data-task-filter]').forEach(button=>button.onclick=()=>{taskFilter=button.dataset.taskFilter;renderTasks();});
let clearTasksArmed=false;
$('#clear-done-tasks').onclick=async()=>{if(!clearTasksArmed){clearTasksArmed=true;$('#clear-done-tasks').textContent='再次点击确认清理';setTimeout(()=>{clearTasksArmed=false;$('#clear-done-tasks').textContent='清理已结束';},5000);return;}if(await saveTasks(state.tasks.filter(task=>task.workspaceId!==(state.activeWorkspaceId||'default')||!task.done))){if(editingTaskId&&!state.tasks.some(task=>task.id===editingTaskId))resetTaskForm();clearTasksArmed=false;$('#clear-done-tasks').textContent='清理已结束';}};
$('#task-form').onsubmit=async event=>{
  event.preventDefault();const text=$('#task-input').value.trim();let schedule;
  if(!text)return;try{schedule=taskSchedule();}catch(error){return status(error.message,true);}if(!editingTaskId&&state.tasks.length>=200)return status('最多保留 200 项安排，请先清理已结束的任务',true);
  const previous=state.tasks.find(task=>task.id===editingTaskId),reminder=$('#task-reminder-only').checked;
  const keepWeather=!reminder&&previous?.action==='weather'&&previous.text===text;
  const task={id:editingTaskId||crypto.randomUUID(),title:$('#task-title').value.trim()||text.slice(0,60),text,workspaceId:$('#task-workspace').value||state.activeWorkspaceId||'default',contextMode:$('#task-context').value,done:false,missed:false,enabled:true,...schedule,action:reminder?'remind':keepWeather?'weather':'auto',city:keepWeather?previous.city:'',lastRunAt:null};
  if(await saveTasks(editingTaskId?state.tasks.map(t=>t.id===editingTaskId?task:t):[...state.tasks,task])){resetTaskForm();taskFilter='active';renderTasks();}
};
resetTaskForm();
function updateVoices(){const select=$('#voice-name'),current=select.value||state.settings.voiceName;select.replaceChildren(new Option('系统默认',''));for(const voice of window.speechSynthesis?.getVoices()||[])select.add(new Option(`${voice.name} / ${voice.lang}`,voice.name));select.value=current||'';}
window.speechSynthesis?.addEventListener('voiceschanged',updateVoices);
function renderSettings(){const s=state.settings;$('#always-on-top').checked=s.alwaysOnTop;$('#scale').value=s.scale;$('#scanlines').checked=s.scanlines;$('#voice-enabled').checked=s.voiceEnabled;$('#voice-rate').value=s.voiceRate;$('#model-temperature').value=s.modelTemperature;$('#ai-endpoint').value=s.aiEndpoint;$('#ai-model').value=s.aiModel;$('#api-key').value='';$('#clear-key').checked=false;renderExtraSettings();$('#scale-label').textContent=Math.round(s.scale*100)+'%';$('#rate-label').textContent=s.voiceRate.toFixed(1);$('#temperature-label').textContent=Number(s.modelTemperature).toFixed(1);updateVoices();$('#key-status').textContent=state.hasApiKey?'密钥已加密保存在当前设备':'当前未保存 API 密钥';}
$('#scale').oninput=()=>{$('#scale-label').textContent=Math.round(Number($('#scale').value)*100)+'%';};$('#voice-rate').oninput=()=>{$('#rate-label').textContent=Number($('#voice-rate').value).toFixed(1);};$('#model-temperature').oninput=()=>{$('#temperature-label').textContent=Number($('#model-temperature').value).toFixed(1);};
function markSettingsDirty(){settingsDirty=true;$('#settings-result').textContent='有未保存的更改';}
$('#settings-form').addEventListener('input',markSettingsDirty);
$('#settings-form').onsubmit=async event=>{event.preventDefault();try{const apiKey=$('#api-key').value.trim();state=await window.icey.saveSettings({alwaysOnTop:$('#always-on-top').checked,scale:Number($('#scale').value),scanlines:$('#scanlines').checked,voiceEnabled:$('#voice-enabled').checked,voiceName:$('#voice-name').value,voiceRate:Number($('#voice-rate').value),modelTemperature:Number($('#model-temperature').value),aiEndpoint:$('#ai-endpoint').value.trim(),aiModel:$('#ai-model').value.trim(),apiKey,clearApiKey:!apiKey&&$('#clear-key').checked,...extraSettings()});settingsDirty=false;applyState();renderSettings();$('#settings-result').textContent=state.hasApiKey?'设置已保存 / 密钥已保存':'设置已保存 / 未设置密钥';status('设置已保存');}catch(error){report(error);$('#settings-result').textContent='保存失败，请查看下方提示';}};
function renderFiles(){const list=$('#file-list');list.replaceChildren();$('#file-empty').hidden=files.length>0;$('#file-actions').hidden=!files.length;for(const file of files){const row=document.createElement('div');row.className='file-entry';const title=document.createElement('strong');title.textContent='▤ '+file.name;const details=document.createElement('small');details.textContent=file.path+'\n'+(file.size/1024).toFixed(1)+' KB';row.append(title,details);list.append(row);}}
function lockFiles(value){fileBusy=value;for(const id of['select-files','clear-files','trash-files'])$('#'+id).disabled=value;}
$('#select-files').onclick=async()=>{if(fileBusy)return;lockFiles(true);try{const result=await window.icey.selectFiles();files=result.files;renderFiles();if(!result.canceled){$('#file-result').textContent='';status(`已锁定 ${files.length} 个文件，等待确认`);}}catch(error){report(error);}finally{lockFiles(false);}};
$('#clear-files').onclick=async()=>{try{await window.icey.clearFiles();files=[];renderFiles();status('已取消选择');}catch(error){report(error);}};
$('#trash-files').onclick=async()=>{if(fileBusy||!files.length)return;lockFiles(true);try{status('等待文件处理确认');const response=await window.icey.trashFiles(files.map(f=>f.id));if(response.canceled){status('已取消，文件保留');return;}const successful=new Set(response.results.filter(r=>r.ok).map(r=>r.id));files=files.filter(f=>!successful.has(f.id));renderFiles();$('#file-result').textContent=response.results.map(r=>r.ok?`[ 完成 ] ${r.name} → 回收站`:`[ 失败 ] ${r.name}：${r.error}`).join('\n');status(`处理完成 / ${successful.size} 个成功，${response.results.length-successful.size} 个失败`);}catch(error){report(error);}finally{lockFiles(false);}};
async function demo(){try{await window.icey.demoShred();status('动作预览中，不会删除文件');}catch(error){report(error);}}
$('#demo-shred').onclick=demo;$('#status-demo').onclick=demo;
document.querySelectorAll('[data-folder]').forEach(button=>button.onclick=async()=>{try{await window.icey.openFolder(button.dataset.folder);status('目录已打开');}catch(error){report(error);}});
function statusRow(id,label,value){const name=document.createElement('span'),detail=document.createElement('b');name.textContent=label;detail.textContent=value;$(id).replaceChildren(name,detail);}
function applyState(){renderWorkspaces();const enabled=state.settings.aiEnabled&&state.settings.aiEndpoint&&state.settings.aiModel;document.body.classList.toggle('scanlines',state.settings.scanlines);$('#chat-mode').textContent=enabled?`当前模型 · ${state.settings.aiModel}`:'对话服务未启用 · 连接后可自由交流';statusRow('#ai-status','对话服务',enabled?'已配置':'未启用');renderTasks();renderChat();renderAction();renderExtensions();renderGrowth();renderRuntime();}
window.icey.onState(next=>{state=next;applyState();if(!settingsDirty)renderSettings();});window.icey.getState().then(next=>{state=next;applyState();renderSettings();}).catch(report);
let scheduleMinute=-1;
function clock(){$('#clock').textContent=new Date().toLocaleString('zh-CN',{hour12:false});const minute=Math.floor(Date.now()/60000);if(minute!==scheduleMinute){scheduleMinute=minute;updateTaskTiming();}}clock();setInterval(clock,1000);
const settingFields={contextTokenBudget:'context-token-budget',aiEnabled:'ai-enabled',aiProvider:'ai-provider',modelVision:'model-vision',visionEnabled:'vision-enabled',visionScreen:'vision-screen',visionAutoEnabled:'vision-auto-enabled',visionAutoMinutes:'vision-auto-minutes',proactiveEnabled:'proactive-enabled',proactiveMinutes:'proactive-minutes',quietStart:'quiet-start',quietEnd:'quiet-end',memoryEnabled:'memory-enabled',weeklyMemoryEnabled:'weekly-memory-enabled',voiceProvider:'voice-provider',ttsEndpoint:'tts-endpoint',ttsReference:'tts-reference',ttsPrompt:'tts-prompt'};
function extraSettings(){const values={};for(const [key,id]of Object.entries(settingFields)){const el=$('#'+id);values[key]=el.type==='checkbox'?el.checked:el.type==='number'||key==='contextTokenBudget'?Number(el.value):el.value.trim();}return values;}
function renderExtraSettings(){
  const provider=$('#ai-provider');provider.replaceChildren(...(state.providers||[]).map(p=>new Option(p.name,p.id)));
  for(const [key,id]of Object.entries(settingFields)){const el=$('#'+id);if(el.type==='checkbox')el.checked=!!state.settings[key];else el.value=state.settings[key]??'';}
  $('#tts-fields').hidden=state.settings.voiceProvider!=='gptsovits';
}
function clearPreview(){previewVersion++;clearTimeout(previewTimer);$('#screen-preview').hidden=true;$('#preview-image').removeAttribute('src');}
async function refreshScreens(){try{clearPreview();const value=$('#vision-screen').value||state.settings.visionScreen||'';const screens=await window.icey.listScreens();$('#vision-screen').replaceChildren(new Option('跟随系统主屏幕',''),...screens.map(s=>new Option(s.name,s.id)));if(value&&!screens.some(s=>s.id===value))$('#vision-screen').add(new Option('已断开的屏幕 / '+value,value));$('#vision-screen').value=value;}catch(error){report(error);}}
$('#refresh-screens').onclick=refreshScreens;$('#vision-screen').addEventListener('change',clearPreview);$('#close-preview').onclick=clearPreview;
$('#preview-screen').onclick=async()=>{const id=$('#vision-screen').value,version=++previewVersion;clearTimeout(previewTimer);$('#preview-screen').disabled=true;status('正在获取本机屏幕预览…');try{const preview=await window.icey.previewScreen(id);if(version!==previewVersion)return;$('#preview-image').src=preview.dataUrl;$('#preview-label').textContent=`${$('#vision-screen').selectedOptions[0]?.textContent||'主屏幕'} · 本机预览`;$('#screen-preview').hidden=false;status(`已获取屏幕预览 · ${preview.size.width}×${preview.size.height} · 未上传`);previewTimer=setTimeout(clearPreview,45000);}catch(error){if(version===previewVersion)report(error);}finally{$('#preview-screen').disabled=false;}};
refreshScreens();
$('#ai-provider').onchange=()=>{const p=state.providers.find(p=>p.id===$('#ai-provider').value);if(!p)return;$('#ai-endpoint').value=p.endpoint;$('#ai-model').value=p.model;$('#api-key').value='';$('#clear-key').checked=false;$('#model-vision').checked=false;$('#vision-enabled').checked=false;markSettingsDirty();status('已选择服务商，请填写模型与密钥');};
$('#api-key').oninput=()=>{if($('#api-key').value)$('#clear-key').checked=false;};
$('#vision-model').onclick=()=>{const p=state.providers.find(p=>p.id===$('#ai-provider').value);if(!p?.visionModel)return status('请填写支持图片的模型名称');$('#ai-model').value=p.visionModel;$('#model-vision').checked=true;markSettingsDirty();status('已填入图片模型，请确认账号支持后保存');};
$('#voice-provider').onchange=()=>{$('#tts-fields').hidden=$('#voice-provider').value!=='gptsovits';};
$('#test-voice').onclick=async()=>{if(!state.settings.voiceEnabled)return status('请先开启朗读并保存设置');try{await window.icey.testVoice();status('正在试听');}catch(error){report(error);}};
$('#pause-awareness').onclick=async()=>{try{await window.icey.pauseAwareness();status('屏幕共享与主动交流已暂停');}catch(error){report(error);}};
$('#look-screen').onclick=async()=>{if(chatBusy)return;const s=state.settings;if(!(s.aiEnabled&&s.modelVision&&s.visionEnabled)){tab('settings');$('#awareness-settings').scrollIntoView({block:'start'});return status('请先连接图片模型并开启屏幕共享',true);}const before=state.runtime?.lastCaptureAt||0;chatBusy=true;$('#send-chat').disabled=true;$('#look-screen').disabled=true;status('正在把当前屏幕分享给艾希…');try{await window.icey.chat('看看我当前的桌面，有什么你想告诉我的吗？',{withScreen:true});status('艾希看过桌面了');}catch(error){const next=await window.icey.getState().catch(()=>null);if((next?.runtime?.lastCaptureAt||0)>before){status('截图已获取，但模型回复失败：'+error.message.replace(/^Error invoking remote method '[^']+': Error: /,''),true);}else report(error);}finally{chatBusy=false;$('#send-chat').disabled=false;renderRuntime();}};
function renderRuntime(){const s=state.settings,r=state.runtime||{};const enabled=s.aiEnabled&&s.modelVision&&s.visionEnabled;$('#awareness-state').textContent=r.capturing?'正在查看桌面…':enabled?'屏幕共享已开启'+(r.lastCapture?' · '+r.lastCapture:''):'屏幕共享关闭';$('#vision-auto-status').textContent=s.visionAutoEnabled?enabled?`每 ${s.visionAutoMinutes} 分钟查看一次 · ${r.autoVision||'等待下次查看'}`:'定时查看已设定，请先连接图片模型并开启屏幕共享':'未开启定时查看';$('#look-screen').disabled=chatBusy;$('#look-screen').title=enabled?'发送当前屏幕给艾希':'先连接图片模型并开启屏幕共享';statusRow('#runtime-status','主动交流',s.proactiveEnabled?r.error?'暂不可用':r.proactive||'等待合适时机':'已暂停');statusRow('#voice-status','声音输出',s.voiceEnabled?s.voiceProvider==='gptsovits'?'自定义语音':'系统声音':'已关闭');}
function renderGrowth(){
  const g=state.growth;if(!g)return;$('#growth-status').textContent=`${g.memories.length} 条记忆 · ${g.turns} 次交流 · 本机保存 · ${state.settings.memoryEnabled?'正在积累新的记忆':'记忆已暂停'}`;
  renderWeeklyMemory();
  const traits=$('#traits');traits.replaceChildren();for(const [key,value]of Object.entries(g.traits)){const row=document.createElement('label');row.className='trait-row';const label=document.createElement('span');label.textContent=state.traitLabels?.[key]||key;const meter=document.createElement('meter');meter.min=0;meter.max=100;meter.value=value;meter.setAttribute('aria-label',label.textContent);const output=document.createElement('span');output.textContent=({warmth:['克制','温和','亲近'],curiosity:['平稳','好奇','善于探索'],humor:['认真','轻松','风趣'],conciseness:['细致','适中','简练']}[key]||['含蓄','适中','鲜明'])[value>=65?2:value>=40?1:0];row.append(label,meter,output);traits.append(row);}
  const list=$('#memory-list');if(!list.contains(document.activeElement)){
    list.replaceChildren();const search=$('#memory-search').value.trim().toLowerCase(),filter=$('#memory-filter').value;
    const memories=[...g.memories].reverse().filter(m=>(filter==='all'||m.kind===filter)&&[m.text,m.topic].join(' ').toLowerCase().includes(search));
    if(!memories.length)list.append(element('p','empty',g.memories.length?'没有匹配的记忆。':'还没有共同记忆。可以试着告诉艾希“请叫我……”或“我喜欢……”。'));
    for(const m of memories){
      const row=element('div','memory-entry'),input=element('textarea');input.value=m.text;input.maxLength=200;input.rows=2;input.setAttribute('aria-label','记忆内容');
      const type={habit:'习惯',preference:'偏好',interest:'兴趣',boundary:'相处边界',experience:'共同经历'}[m.kind]||'记忆';
      const label=element('p','memory-label',type+' · '+(m.source==='manual'?'你已修正':m.confidence==='observed'?'跨天观察':'明确表达')+(m.expiresAt&&m.expiresAt<=Date.now()?' · 已过期':''));
      const evidence=element('p','subtle',(m.source==='weekly'?'回顾依据':m.source==='manual'?'手动修正':'对话依据')+'：'+m.evidence);
      const save=element('button','','保存修正');save.onclick=async()=>{try{await window.icey.editMemory(m.id,input.value);document.activeElement?.blur();state=await window.icey.getState();renderGrowth();status('记忆已修正，相关旧回顾已清理');}catch(error){report(error);}};
      const remove=element('button','','忘记此条');remove.onclick=async()=>{try{await window.icey.deleteMemory(m.id);document.activeElement?.blur();state=await window.icey.getState();renderGrowth();status('记忆及相关回顾依据已删除，对话仍保留');}catch(error){report(error);}};
      row.append(label,input,evidence,save,remove);list.append(row);
    }
  }
}
let reviewBusy=false;
function renderWeeklyMemory(){
  const memory=state.memoryReview,s=state.settings,r=state.runtime||{};
  $('#weekly-memory-state').textContent=!s.memoryEnabled?'记忆已暂停':r.weeklyBusy?r.weekly:!s.weeklyMemoryEnabled?'自动回顾已暂停':r.weekly||'等待每周回顾';
  $('#weekly-memory-next').textContent=memory?`${memory.eventCount} 条可回顾记录 · ${s.weeklyMemoryEnabled?'下次安排：'+new Date(memory.nextAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'可以随时手动整理'}`:'';
  $('#review-memory').disabled=reviewBusy||r.weeklyBusy||!s.memoryEnabled;$('#review-memory').textContent=reviewBusy||r.weeklyBusy?'整理中…':'现在整理';
  const list=$('#weekly-memory-list');if(list.contains(document.activeElement))return;
  const opened=new Set([...list.querySelectorAll('details[open]')].map(item=>item.dataset.week));list.replaceChildren();
  if(!memory?.reviews.length){list.append(element('p','extension-empty','回顾会从现在的相处开始积累。你也可以点击“现在整理”。'));return;}
  for(const review of memory.reviews){
    const card=element('details','weekly-memory-card');card.dataset.week=String(review.week);card.open=opened.has(String(review.week));card.append(element('summary','',review.label+(review.partial?' · 阶段回顾':'')));
    card.append(element('p','field-help',`${review.eventCount} 条记录 · 本次更新 ${review.learned} 条记忆${review.truncatedEvents?' · 部分长消息已截短':''}`));
    if(!review.summary.length)card.append(element('p','subtle','这一周暂时没有足够的记录形成回顾。'));
    for(const item of review.summary){const block=element('div','weekly-memory-fact');block.append(element('p','',item.text));const source=element('details');source.append(element('summary','','查看依据'));for(const ref of item.evidence||[])source.append(element('p','field-help',ref.quote));block.append(source);card.append(block);}
    const remove=element('button','','删除这份回顾');let armed=false;remove.onclick=async()=>{if(!armed){armed=true;remove.textContent='再次点击确认删除';setTimeout(()=>{armed=false;remove.textContent='删除这份回顾';},5000);return;}try{state=await window.icey.deleteMemoryReview(review.week);renderGrowth();status('回顾及当周原始依据已删除，已提取的记忆仍保留');}catch(error){report(error);}};
    card.append(element('p','field-help','删除回顾会清理所有工作区当周的原始依据；已提取的记忆可在下方单独删除。'),remove);list.append(card);
  }
}
$('#review-memory').onclick=async()=>{if(reviewBusy)return;reviewBusy=true;renderWeeklyMemory();try{state=await window.icey.reviewMemory();renderGrowth();status(state.runtime?.weekly||'回顾已更新');}catch(error){report(error);}finally{reviewBusy=false;renderWeeklyMemory();}};
$('#memory-search').oninput=renderGrowth;$('#memory-filter').onchange=renderGrowth;
let resetPending=false;
$('#reset-memory').onclick=async()=>{if(!resetPending){resetPending=true;$('#reset-memory').textContent='确认清空所有记忆';setTimeout(()=>{resetPending=false;$('#reset-memory').textContent='重置记忆';},5000);return;}try{await window.icey.resetMemory();resetPending=false;$('#reset-memory').textContent='重置记忆';status('共同记忆已重置，对话仍保留');}catch(error){report(error);}};
