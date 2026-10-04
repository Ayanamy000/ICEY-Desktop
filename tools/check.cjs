const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function check(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())check(file);else if(/\.(cjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}}}
check(path.join(__dirname,'../src'));console.log('All source JavaScript syntax checked.');
