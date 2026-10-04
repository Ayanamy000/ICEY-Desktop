const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {blankGrowth,sanitizeGrowth,privateText}=require('./memory.cjs');
const DAY=86400000,OFFSET=8*3600000;
function dayKey(at=Date.now()){return new Date(Number(at)+OFFSET).toISOString().slice(0,10);}
function weekStart(at=Date.now()){const d=new Date(Number(at)+OFFSET);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.getTime()-OFFSET;}
function fingerprint(text){return crypto.createHash('sha256').update(String(text).replace(/\s+/g,'').toLowerCase()).digest('hex');}
class MemoryDatabase{
  constructor(directory,legacy){
    const {DatabaseSync}=require('node:sqlite');
    fs.mkdirSync(directory,{recursive:true});this.file=path.join(directory,'memory.sqlite');
    this.db=new DatabaseSync(this.file,{timeout:5000});
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
      CREATE TABLE IF NOT EXISTS reviews(week INTEGER PRIMARY KEY,created_at INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS review_parts(week INTEGER NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(week,hash));
      CREATE TABLE IF NOT EXISTS forgotten(hash TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id TEXT NOT NULL,at INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS conversations_workspace ON conversations(workspace_id,id);
      CREATE TABLE IF NOT EXISTS task_runs(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,workspace_id TEXT NOT NULL,started_at INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS task_runs_workspace ON task_runs(workspace_id,started_at);
    `);
    if(!this.db.prepare('PRAGMA table_info(events)').all().some(column=>column.name==='workspace_id'))this.db.exec("ALTER TABLE events ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
    if(!this.db.prepare('PRAGMA table_info(workspaces)').all().some(column=>column.name==='root_path'))this.db.exec("ALTER TABLE workspaces ADD COLUMN root_path TEXT NOT NULL DEFAULT ''");
    this.db.prepare('INSERT OR IGNORE INTO workspaces(id,name,description,created_at) VALUES(?,?,?,?)').run('default','日常','陪伴、日常安排与通用事项',Date.now());
    if(!this.getMeta('migrated'))this.transaction(()=>{this.writeGrowth(sanitizeGrowth(legacy));this.setMeta('cursor',weekStart());this.setMeta('migrated',true);this.setMeta('schema',1);});
    this.prune();
  }
  prune(){this.db.prepare('DELETE FROM events WHERE at < ?').run(Date.now()-180*DAY);this.db.prepare('DELETE FROM review_parts WHERE week < ?').run(weekStart()-180*DAY);}
  transaction(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  getMeta(key){const row=this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
  setMeta(key,value){this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  growth(){const profile=this.getMeta('growth')||blankGrowth();profile.memories=this.db.prepare('SELECT payload FROM memories ORDER BY rowid').all().map(row=>JSON.parse(row.payload));return sanitizeGrowth(profile);}
  writeGrowth(value){
    const g=sanitizeGrowth(value),{memories,...profile}=g;this.setMeta('growth',profile);
    const ids=new Set(memories.map(item=>item.id)),put=this.db.prepare('INSERT INTO memories(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
    for(const row of this.db.prepare('SELECT id FROM memories').all())if(!ids.has(row.id))this.db.prepare('DELETE FROM memories WHERE id=?').run(row.id);
    for(const memory of memories)put.run(memory.id,JSON.stringify(memory));return g;
  }
  saveGrowth(value){return this.transaction(()=>this.writeGrowth(value));}
  record(kind,text,workspaceId='default'){
    if(typeof text!=='string'||!text.trim()||privateText(text))return null;
    const event={id:crypto.randomUUID(),at:Date.now(),kind,text:text.trim().slice(0,4000),workspaceId};
    this.db.prepare('INSERT INTO events(id,at,kind,text,workspace_id) VALUES(?,?,?,?,?)').run(event.id,event.at,event.kind,event.text,workspaceId);return event;
  }
  events(start,end){return this.db.prepare('SELECT id,at,kind,text,workspace_id AS workspaceId FROM events WHERE at>=? AND at<? ORDER BY at,id').all(start,end);}
  workspaces(){return this.db.prepare('SELECT id,name,description,archived,root_path AS rootPath FROM workspaces ORDER BY created_at,id').all().map(row=>({...row,archived:!!row.archived}));}
  workspace(id){const item=this.workspaces().find(item=>item.id===id);if(!item)throw new Error('工作区不存在');return item;}
  saveWorkspace(id,name,description,rootPath=''){
    if(typeof name!=='string'||!name.trim()||name.length>40||typeof description!=='string'||description.length>1000)throw new Error('工作区名称限 40 字，说明限 1000 字');
    if(id){this.workspace(id);this.db.prepare('UPDATE workspaces SET name=?,description=?,root_path=? WHERE id=?').run(name.trim(),description.trim(),rootPath,id);}
    else{if(this.workspaces().length>=50)throw new Error('最多保留 50 个工作区');id=crypto.randomUUID();this.db.prepare('INSERT INTO workspaces(id,name,description,root_path,created_at) VALUES(?,?,?,?,?)').run(id,name.trim(),description.trim(),rootPath,Date.now());}return id;
  }
  archiveWorkspace(id,archived){this.workspace(id);if(id==='default')throw new Error('日常工作区不能归档');this.db.prepare('UPDATE workspaces SET archived=? WHERE id=?').run(archived?1:0,id);}
  initializeConversations(history,tasks){
    if(!this.getMeta('groupsMigrated'))this.transaction(()=>{this.appendConversation('default',history);this.setMeta('tasks',tasks);this.setMeta('activeWorkspace','default');this.setMeta('groupsMigrated',true);});
    for(const run of this.runs(null,10000).filter(run=>run.status==='running'))this.finishRun(run.id,'failed','上次运行被程序退出打断。已完成的操作不会撤销，请核对下列记录后决定是否重试。\n\n'+run.output);
  }
  history(workspaceId){return this.db.prepare('SELECT payload FROM conversations WHERE workspace_id=? ORDER BY id DESC LIMIT 100').all(workspaceId).reverse().map(row=>JSON.parse(row.payload));}
  appendConversation(workspaceId,messages){const put=this.db.prepare('INSERT INTO conversations(workspace_id,at,payload) VALUES(?,?,?)');for(const message of messages)put.run(workspaceId,Date.now(),JSON.stringify(message));this.db.prepare('DELETE FROM conversations WHERE workspace_id=? AND id NOT IN (SELECT id FROM conversations WHERE workspace_id=? ORDER BY id DESC LIMIT 100)').run(workspaceId,workspaceId);}
  clearConversation(workspaceId){this.db.prepare('DELETE FROM conversations WHERE workspace_id=?').run(workspaceId);}
  createRun(task,trigger='scheduled'){
    const run={id:crypto.randomUUID(),taskId:task.id,workspaceId:task.workspaceId||'default',title:task.title||task.text.slice(0,60),prompt:task.text,task,status:'queued',output:'等待执行',startedAt:Date.now(),finishedAt:null,unread:false,trigger};
    this.db.prepare('INSERT INTO task_runs(id,task_id,workspace_id,started_at,payload) VALUES(?,?,?,?,?)').run(run.id,run.taskId,run.workspaceId,run.startedAt,JSON.stringify(run));return run;
  }
  runs(workspaceId=null,limit=100){const rows=workspaceId?this.db.prepare('SELECT payload FROM task_runs WHERE workspace_id=? ORDER BY started_at DESC LIMIT ?').all(workspaceId,limit):this.db.prepare('SELECT payload FROM task_runs ORDER BY started_at DESC LIMIT ?').all(limit);return rows.map(row=>JSON.parse(row.payload));}
  run(id){const row=this.db.prepare('SELECT payload FROM task_runs WHERE id=?').get(id);if(!row)throw new Error('运行记录不存在');return JSON.parse(row.payload);}
  updateRun(run){this.db.prepare('UPDATE task_runs SET payload=? WHERE id=?').run(JSON.stringify(run),run.id);return run;}
  finishRun(id,status,output){return this.updateRun({...this.run(id),status,output:String(output).slice(0,20000),finishedAt:Date.now(),unread:true});}
  markRunRead(id){return this.updateRun({...this.run(id),unread:false});}
  previousRun(taskId){const rows=this.db.prepare('SELECT payload FROM task_runs WHERE task_id=? ORDER BY started_at DESC LIMIT 20').all(taskId);return rows.map(row=>JSON.parse(row.payload)).find(run=>run.status==='succeeded')||null;}
  part(week,hash){const row=this.db.prepare('SELECT payload FROM review_parts WHERE week=? AND hash=?').get(week,hash);return row?JSON.parse(row.payload):null;}
  savePart(week,hash,value){this.db.prepare('INSERT OR REPLACE INTO review_parts(week,hash,payload) VALUES(?,?,?)').run(week,hash,JSON.stringify(value));}
  isForgotten(text){return !!this.db.prepare('SELECT hash FROM forgotten WHERE hash=?').get(fingerprint(text));}
  reviewState(){
    const cursor=this.getMeta('cursor')??weekStart();
    return {engine:'SQLite',nextAt:cursor+7*DAY+9*3600000,eventCount:this.db.prepare('SELECT count(*) AS n FROM events').get().n,reviews:this.db.prepare('SELECT payload FROM reviews ORDER BY week DESC LIMIT 16').all().map(row=>JSON.parse(row.payload))};
  }
  commitReview(week,review,growth,advance){return this.transaction(()=>{
    const saved=this.writeGrowth(growth);this.db.prepare('INSERT OR REPLACE INTO reviews(week,created_at,payload) VALUES(?,?,?)').run(week,Date.now(),JSON.stringify(review));
    if(advance)this.setMeta('cursor',week+7*DAY);this.setMeta('lastAttempt',0);return saved;
  });}
  invalidateSources(memory){
    this.db.prepare('INSERT OR IGNORE INTO forgotten(hash) VALUES(?)').run(fingerprint(memory.text));
    const ids=new Set(memory.eventIds||[]);
    for(const id of ids)this.db.prepare('DELETE FROM events WHERE id=?').run(id);
    // Remove derived summaries and cached proposals that could reintroduce a correction.
    for(const row of this.db.prepare('SELECT week,payload FROM reviews').all())if(JSON.parse(row.payload).eventIds?.some(id=>ids.has(id)))this.db.prepare('DELETE FROM reviews WHERE week=?').run(row.week);
    this.db.exec('DELETE FROM review_parts');
  }
  editMemory(id,text){return this.transaction(()=>{
    if(typeof text!=='string'||!text.trim()||text.length>200||privateText(text))throw new Error('请填写 1–200 字的非敏感记忆');
    const g=this.growth(),item=g.memories.find(m=>m.id===id);if(!item)throw new Error('记忆已不存在');
    const related=g.memories.filter(m=>m.id!==id&&m.source==='weekly'&&m.workspaceId===item.workspaceId&&(m.text===item.text||item.topic&&m.topic===item.topic||m.eventIds.some(eventId=>item.eventIds.includes(eventId))));
    for(const memory of [item,...related])this.invalidateSources(memory);g.memories=g.memories.filter(m=>!related.includes(m));Object.assign(item,{text:text.trim(),source:'manual',at:new Date().toISOString(),evidence:'用户在记忆面板中修正',eventIds:[],confidence:'confirmed',expiresAt:null});return this.writeGrowth(g);
  });}
  forget(id){return this.transaction(()=>{const g=this.growth(),item=g.memories.find(m=>m.id===id);if(!item)throw new Error('记忆已不存在');const forgotten=g.memories.filter(m=>m.id===id||m.source==='weekly'&&m.workspaceId===item.workspaceId&&(m.text===item.text||item.topic&&m.topic===item.topic||m.eventIds.some(eventId=>item.eventIds.includes(eventId))));for(const memory of forgotten)this.invalidateSources(memory);g.memories=g.memories.filter(m=>!forgotten.includes(m));g.journal=[];return this.writeGrowth(g);});}
  deleteReview(week){this.transaction(()=>{this.db.prepare('DELETE FROM reviews WHERE week=?').run(week);this.db.prepare('DELETE FROM review_parts WHERE week=?').run(week);this.db.prepare('DELETE FROM events WHERE at>=? AND at<?').run(week,week+7*DAY);});}
  reset(){return this.transaction(()=>{this.db.exec('DELETE FROM memories; DELETE FROM events; DELETE FROM reviews; DELETE FROM review_parts; DELETE FROM forgotten;');this.setMeta('cursor',weekStart());this.setMeta('lastAttempt',0);return this.writeGrowth(blankGrowth());});}
  close(){this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.db.close();}
}
module.exports={MemoryDatabase,dayKey,weekStart,fingerprint,DAY};
