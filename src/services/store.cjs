const fs = require('node:fs');
const path = require('node:path');
const {blankGrowth,sanitizeGrowth}=require('./memory.cjs');
const {DEFAULT_CONTEXT_BUDGET,contextBudget}=require('./context.cjs');
const defaults = {alwaysOnTop:true,scale:1,voiceEnabled:false,voiceName:'',voiceRate:1,voiceProvider:'system',ttsEndpoint:'http://127.0.0.1:9880',ttsReference:'',ttsPrompt:'',scanlines:true,aiEnabled:false,aiProvider:'qwen',aiEndpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1',aiModel:'qwen-plus',modelTemperature:0.7,modelVision:false,visionEnabled:false,visionScreen:'',visionAutoEnabled:false,visionAutoMinutes:15,proactiveEnabled:true,proactiveMinutes:10,quietStart:23,quietEnd:8,memoryEnabled:true,petPosition:null};
defaults.contextTokenBudget=DEFAULT_CONTEXT_BUDGET;
defaults.weeklyMemoryEnabled=true;
function sanitizeSettings(value={}) {
  const result={...defaults,contextTokenBudget:contextBudget(value.contextTokenBudget)};
  if(typeof value.weeklyMemoryEnabled==='boolean')result.weeklyMemoryEnabled=value.weeklyMemoryEnabled;
  for(const key of ['alwaysOnTop','voiceEnabled','scanlines','aiEnabled','modelVision','visionEnabled','visionAutoEnabled','proactiveEnabled','memoryEnabled'])if(typeof value[key]==='boolean')result[key]=value[key];
  for(const key of ['voiceName','voiceProvider','ttsEndpoint','ttsReference','ttsPrompt','aiProvider','aiEndpoint','aiModel','visionScreen'])if(typeof value[key]==='string')result[key]=value[key].slice(0,1000).trim();
  for(const [key,min,max]of[['visionAutoMinutes',2,240],['proactiveMinutes',2,120],['quietStart',0,23],['quietEnd',0,23]])if(Number.isFinite(value[key]))result[key]=Math.max(min,Math.min(max,Math.round(value[key])));
  if(Number.isFinite(value.modelTemperature))result.modelTemperature=Math.min(2,Math.max(0,Math.round(value.modelTemperature*10)/10));
  if(!['system','gptsovits'].includes(result.voiceProvider))result.voiceProvider='system';
  if(Number.isFinite(value.scale))result.scale=Math.min(1.3,Math.max(0.7,value.scale));
  if(Number.isFinite(value.voiceRate))result.voiceRate=Math.min(1.5,Math.max(0.6,value.voiceRate));
  if(value.petPosition&&Number.isFinite(value.petPosition.x)&&Number.isFinite(value.petPosition.y))result.petPosition={x:Math.round(value.petPosition.x),y:Math.round(value.petPosition.y)};
  return result;
}
function sanitizeTasks(tasks) {
  if(!Array.isArray(tasks))throw new Error('待办格式错误');
  return tasks.slice(0,200).filter(t=>t&&typeof t.id==='string'&&typeof t.text==='string'&&t.text.trim()).map(t=>({
    id:t.id.slice(0,80),title:typeof t.title==='string'?t.title.trim().slice(0,80):t.text.trim().slice(0,60),text:t.text.trim().slice(0,4000),workspaceId:typeof t.workspaceId==='string'?t.workspaceId:'default',contextMode:t.contextMode==='continue'?'continue':'fresh',done:!!t.done,
    enabled:t.enabled!==false,action:['auto','remind','discuss','weather'].includes(t.action)?t.action:'remind',city:typeof t.city==='string'?t.city.trim().slice(0,80):'',
    repeat:['daily','weekly'].includes(t.repeat)?t.repeat:'none',
    timing:t.timing==='next'?'next':'date',missed:!!t.missed,
    runAt:typeof t.runAt==='string'&&Number.isFinite(Date.parse(t.runAt))?new Date(t.runAt).toISOString():null,
    lastRunAt:typeof t.lastRunAt==='string'&&Number.isFinite(Date.parse(t.lastRunAt))?new Date(t.lastRunAt).toISOString():null
  }));
}
class Store {
  constructor(directory){this.directory=directory;this.file=path.join(directory,'state.json');this.state={settings:{...defaults},tasks:[],history:[],growth:blankGrowth(),encryptedKey:''};try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));const settings=saved.settings||{};if(!Object.hasOwn(settings,'aiEnabled'))settings.aiEnabled=!!(settings.aiEndpoint&&settings.aiModel);if(!settings.aiEndpoint){delete settings.aiEndpoint;delete settings.aiModel;}this.state.settings=sanitizeSettings(settings);this.state.tasks=sanitizeTasks(saved.tasks||[]);this.state.history=Array.isArray(saved.history)?saved.history.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-100).map(m=>({role:m.role,content:m.content.slice(0,20000),...(m.proactive?{proactive:true}:{})})):[];this.state.growth=sanitizeGrowth(saved.growth);this.state.encryptedKey=typeof saved.encryptedKey==='string'?saved.encryptedKey:'';}catch(error){if(error.code!=='ENOENT')console.warn('State load:',error.message);}}
  initializeMemory(){const {MemoryDatabase}=require('./memory-db.cjs');this.memory=new MemoryDatabase(this.directory,this.state.growth);this.state.growth=this.memory.growth();this.memory.initializeConversations(this.state.history,sanitizeTasks(this.state.tasks));this.workspaceId=this.memory.getMeta('activeWorkspace')||'default';if(!this.memory.workspaces().some(item=>item.id===this.workspaceId&&!item.archived))this.workspaceId='default';this.state.history=this.memory.history(this.workspaceId);this.state.tasks=sanitizeTasks(this.memory.getMeta('tasks')||[]);this.save();}
  save(){fs.mkdirSync(this.directory,{recursive:true});const temporary=this.file+'.tmp';const saved={...this.state};if(this.memory){delete saved.growth;delete saved.history;delete saved.tasks;}fs.writeFileSync(temporary,JSON.stringify(saved,null,2));fs.renameSync(temporary,this.file);}
  setSettings(settings){this.state.settings=sanitizeSettings({...this.state.settings,...settings});this.save();return this.state.settings;}
  setTasks(tasks){const value=sanitizeTasks(tasks);if(this.memory)this.memory.setMeta('tasks',value);this.state.tasks=value;if(!this.memory)this.save();return this.state.tasks;}
  appendHistory(messages,workspaceId=this.workspaceId||'default'){if(this.memory){this.memory.appendConversation(workspaceId,messages);if(workspaceId===this.workspaceId)this.state.history=this.memory.history(workspaceId);}else{this.state.history.push(...messages);this.state.history=this.state.history.slice(-100);this.save();}}
  clearHistory(){if(this.memory)this.memory.clearConversation(this.workspaceId);this.state.history=[];this.save();}
  switchWorkspace(id){const workspace=this.memory.workspace(id);if(workspace.archived)throw new Error('请先恢复这个工作区');this.memory.setMeta('activeWorkspace',id);this.workspaceId=id;this.state.history=this.memory.history(id);}
  setGrowth(value){if(this.memory)this.state.growth=this.memory.saveGrowth(value);else{this.state.growth=sanitizeGrowth(value);this.save();}}
  memoryGrowth(workspaceId=this.workspaceId||'default'){return {...this.state.growth,memories:this.state.growth.memories.filter(memory=>!memory.workspaceId||memory.workspaceId===workspaceId),reviews:(this.memory?.reviewState().reviews||[]).map(review=>({...review,summary:review.summary.filter(item=>item.evidence.some(ref=>(ref.workspaceId||'default')===workspaceId))}))};}
  publicState(){return {settings:this.state.settings,tasks:this.state.tasks,history:this.state.history,growth:this.memoryGrowth(),workspaces:this.memory?.workspaces()||[],activeWorkspaceId:this.workspaceId||'default',taskRuns:this.memory?.runs(this.workspaceId)||[],memoryReview:this.memory?.reviewState()||null,hasApiKey:!!this.state.encryptedKey};}
}
module.exports={Store,sanitizeSettings,sanitizeTasks,defaults};
