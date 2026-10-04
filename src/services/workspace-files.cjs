const fs=require('node:fs/promises');
const path=require('node:path');
const inside=(root,target)=>{const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
async function noLinks(target){
  const parsed=path.parse(target);let current=parsed.root;
  for(const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);const stat=await fs.lstat(current);
    if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1)throw new Error('工作区不操作符号链接、目录联接或硬链接文件');
  }
}
async function validateRoot(value,protectedPaths=[]){
  if(typeof value!=='string'||!path.isAbsolute(value)||value.startsWith('\\\\'))throw new Error('请选择本机文件夹');
  const root=path.resolve(value);await noLinks(root);
  if(!(await fs.stat(root)).isDirectory())throw new Error('工作区必须是文件夹');
  if(root===path.parse(root).root)throw new Error('请选择具体的工作文件夹，不能授权整个磁盘');
  for(const entry of protectedPaths){const item=typeof entry==='string'?{path:entry,subtree:true}:entry;if(!item.path)continue;const protectedPath=path.resolve(item.path);if(inside(root,protectedPath)||item.subtree&&inside(protectedPath,root))throw new Error('请选择专用工作文件夹，不能授权系统、程序或用户主目录');}
  return root;
}
async function resolveWithin(root,value,{missing=false,allowRoot=false}={}){
  if(typeof value!=='string'||!value.trim()||value.length>1000||/[\x00-\x1f]/.test(value)||value.startsWith('\\\\'))throw new Error('工作区路径无效');
  const target=path.resolve(root,value),relative=path.relative(root,target);
  if(!inside(root,target)||!allowRoot&&!relative)throw new Error('只能操作工作区内的内容，不能操作工作区文件夹本身');
  if(relative.split(path.sep).some(part=>part==='..'||/[<>:"|?*]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw new Error('文件名包含不支持的字符');
  await noLinks(root);
  if(missing){await noLinks(path.dirname(target));try{await fs.lstat(target);throw new Error('目标已经存在，请使用其他名称');}catch(error){if(error.code!=='ENOENT')throw error;}}
  else await noLinks(target);
  return target;
}
async function inspectTree(target,budget={left:5000}){
  if(--budget.left<0)throw new Error('目录内容过多，请拆分处理');
  const stat=await fs.lstat(target);if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1)throw new Error('目录包含链接，不能整体操作');
  if(stat.isDirectory())for(const item of await fs.readdir(target))await inspectTree(path.join(target,item),budget);
}
async function workspaceFile(root,action,{trash,onTrash,authorize,protectedPaths=[]}){
  await authorize();root=await validateRoot(root,protectedPaths);
  const kind=action.kind,kinds=['list','read','mkdir','create_text','append_text','replace_text','copy','move','trash'];
  if(!kinds.includes(kind))throw new Error('不支持这个工作区操作');
  const source=await resolveWithin(root,action.source,{missing:['mkdir','create_text'].includes(kind),allowRoot:kind==='list'});
  if(kind==='list'){const entries=await fs.readdir(source,{withFileTypes:true});return JSON.stringify({path:source,entries:entries.slice(0,200).map(item=>({name:item.name,type:item.isSymbolicLink()?'link':item.isDirectory()?'directory':'file'})),truncated:entries.length>200});}
  if(kind==='read'){const stat=await fs.stat(source);if(!stat.isFile()||stat.size>256*1024)throw new Error('只能读取不超过 256 KB 的文本文件');const text=await fs.readFile(source,'utf8');if(text.includes('\0'))throw new Error('不能将二进制文件作为文本读取');return JSON.stringify({path:source,text:text.slice(0,16000),truncated:text.length>16000});}
  let destination;
  if(['copy','move'].includes(kind)){destination=await resolveWithin(root,action.destination,{missing:true});if(inside(source,destination))throw new Error('目标不能放在源目录里面');}
  if(['trash','copy','move'].includes(kind))await inspectTree(source);
  if(['create_text','append_text','replace_text'].includes(kind)&& (typeof action.content!=='string'||action.content.length>64000))throw new Error('文本内容限 64000 字');
  await authorize();await resolveWithin(root,action.source,{missing:['mkdir','create_text'].includes(kind)});
  if(destination)await resolveWithin(root,action.destination,{missing:true});
  if(kind==='mkdir')await fs.mkdir(source);
  else if(kind==='create_text')await fs.writeFile(source,action.content,{encoding:'utf8',flag:'wx'});
  else if(['append_text','replace_text'].includes(kind)){
    if(!(await fs.stat(source)).isFile())throw new Error('只能修改普通文本文件');
    const handle=await fs.open(source,'r+');
    try{const buffer=Buffer.from(action.content),start=kind==='append_text'?(await handle.stat()).size:0;let offset=0;
      while(offset<buffer.length){const {bytesWritten}=await handle.write(buffer,offset,buffer.length-offset,start+offset);if(!bytesWritten)throw new Error('文件写入未完成');offset+=bytesWritten;}
      if(kind==='replace_text')await handle.truncate(buffer.length);
    }finally{await handle.close();}
  }
  else if(kind==='copy')await fs.cp(source,destination,{recursive:true,force:false,errorOnExist:true});
  else if(kind==='move')await fs.rename(source,destination);
  else if(kind==='trash'){await trash(source);onTrash?.(source);}
  return JSON.stringify({success:true,operation:kind,source,...(destination?{destination}:{})});
}
module.exports={workspaceFile,validateRoot};
