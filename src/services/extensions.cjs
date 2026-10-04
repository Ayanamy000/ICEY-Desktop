const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validatePackage}=require('./plugin-packages.cjs');
class ExtensionHost{
  constructor(){this.plugins=new Map();this.skills=new Map();this.listeners=new Map();this.installed=[];this.loadError='';}
  initialize(directory,runner){
    this.file=path.join(directory,'plugins.json');this.runner=runner;
    try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!Array.isArray(saved)||saved.length>100)throw new Error('插件列表格式错误');const ids=new Set();this.installed=saved.map(entry=>{const manifest=validatePackage(entry.manifest);if(ids.has(manifest.id)||this.plugins.has(manifest.id))throw new Error('插件标识重复');ids.add(manifest.id);return {manifest,enabled:entry.enabled!==false};});}
    catch(error){if(error.code!=='ENOENT'){this.loadError='插件列表未能载入：'+error.message;console.warn(this.loadError);}}
    this.refresh();
  }
  persist(next){
    if(this.loadError)throw new Error(this.loadError+'。请先修复数据文件，避免覆盖原有插件');
    fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.file+'.tmp',this.file);this.installed=next;this.refresh();
  }
  refresh(){
    for(const [id,item]of this.plugins)if(item.managed)this.plugins.delete(id);
    for(const [id,item]of this.skills)if(item.managed)this.skills.delete(id);
    for(const {manifest,enabled}of this.installed){
      const signature=crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      this.plugins.set(manifest.id,{id:manifest.id,name:manifest.name,description:manifest.description,version:manifest.version,enabled,managed:true,skillCount:manifest.skills.length,skillNames:manifest.skills.map(skill=>skill.name)});
      if(enabled)for(const skill of manifest.skills)this.skills.set(manifest.id+':'+skill.id,{...skill,id:manifest.id+':'+skill.id,pluginName:manifest.name,signature,managed:true,run:(input,context)=>this.runner(skill,input,context)});
    }
  }
  install(value){const manifest=validatePackage(value);if(this.plugins.has(manifest.id))throw new Error('已安装同名标识的插件，请先卸载旧版');if(this.installed.length>=100)throw new Error('最多安装 100 个插件');this.persist([...this.installed,{manifest,enabled:true}]);return manifest;}
  manage(id,operation){
    if(typeof id!=='string'||!this.installed.some(entry=>entry.manifest.id===id))throw new Error('插件不存在或不支持管理');
    if(!['enable','disable','remove'].includes(operation))throw new Error('插件操作无效');
    this.persist(operation==='remove'?this.installed.filter(entry=>entry.manifest.id!==id):this.installed.map(entry=>entry.manifest.id===id?{...entry,enabled:operation==='enable'}:entry));
  }
  manifest(id){const value=this.installed.find(entry=>entry.manifest.id===id)?.manifest;if(!value)throw new Error('插件不存在');return structuredClone(value);}
  getSkill(id){const skill=this.skills.get(id);if(!skill)throw new Error('技能已停用或卸载');return skill;}
  registerPlugin({id,name,setup}){
    if(!/^[a-z0-9][a-z0-9.-]{1,63}$/.test(id)||typeof name!=='string'||typeof setup!=='function'||this.plugins.has(id))throw new Error('插件标识或定义无效');
    const skills=[],events=[];
    const api={
      registerSkill:skill=>{if(!skill||!/^[a-z0-9][a-z0-9.-]{1,63}$/.test(skill.id)||typeof skill.name!=='string'||typeof skill.run!=='function')throw new Error('技能定义无效');const key=id+':'+skill.id;if(this.skills.has(key))throw new Error('技能已存在');this.skills.set(key,{id:key,name:skill.name,description:String(skill.description||''),run:skill.run});skills.push(key);},
      on:(event,handler)=>{if(!['task:due','chat:completed','vision:captured'].includes(event)||typeof handler!=='function')throw new Error('扩展事件无效');const entry={id,handler};if(!this.listeners.has(event))this.listeners.set(event,[]);this.listeners.get(event).push(entry);events.push({event,entry});}
    };
    try{setup(Object.freeze(api));this.plugins.set(id,{id,name});}
    catch(error){for(const key of skills)this.skills.delete(key);for(const {event,entry} of events)this.listeners.set(event,this.listeners.get(event).filter(item=>item!==entry));throw error;}
  }
  list(){return {plugins:[...this.plugins.values()],skills:[...this.skills.values()].map(({run,instructions,...metadata})=>metadata),error:this.loadError};}
  async invokeSkill(id,input,context={}){const skill=this.skills.get(id);if(!skill)throw new Error('技能不存在');return skill.run(input,Object.freeze({...context}));}
  emit(event,payload){for(const {handler} of this.listeners.get(event)||[])Promise.resolve().then(()=>handler(structuredClone(payload))).catch(error=>console.warn('Extension event:',error.message));}
}
module.exports={ExtensionHost};
