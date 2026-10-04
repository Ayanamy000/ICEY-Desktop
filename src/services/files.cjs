const fs=require('node:fs/promises');
const path=require('node:path');
async function inspectFile(filePath){
  const stat=await fs.lstat(filePath);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('当前仅支持普通文件，不支持目录或链接');
  return {name:path.basename(filePath),path:filePath,size:stat.size,mtimeMs:stat.mtimeMs,birthtimeMs:stat.birthtimeMs};
}
function sameFile(selected,current){return selected.path===current.path&&selected.size===current.size&&selected.mtimeMs===current.mtimeMs&&selected.birthtimeMs===current.birthtimeMs;}
async function trashSelected(entries,trashItem){
  const results=[];
  for(const entry of entries){
    try{const current=await inspectFile(entry.path);if(!sameFile(entry,current))throw new Error('文件已变化，请重新选择后再确认');await trashItem(entry.path);results.push({id:entry.id,name:entry.name,ok:true});}
    catch(error){results.push({id:entry.id,name:entry.name,ok:false,error:error.message});}
  }
  return results;
}
module.exports={inspectFile,sameFile,trashSelected};
