function nextRunAt(task,now){
  if(!task.runAt||task.repeat==='none')return null;
  const next=new Date(task.runAt),step=task.repeat==='weekly'?7:1;
  if(!Number.isFinite(next.getTime()))return null;
  for(let i=0;i<10000&&next.getTime()<=now;i++)next.setDate(next.getDate()+step);
  return next.getTime()>now?next.toISOString():null;
}
function collectDue(tasks,now=Date.now()){
  const due=[];
  const updated=tasks.map(task=>{
    if(task.done||!task.enabled||!task.runAt||Date.parse(task.runAt)>now)return task;
    if(task.repeat==='none'&&task.timing==='date'){
      const at=new Date(task.runAt),today=new Date(now);
      if(at.getFullYear()!==today.getFullYear()||at.getMonth()!==today.getMonth()||at.getDate()!==today.getDate())return {...task,done:true,missed:true};
    }
    due.push(task);
    const next=nextRunAt(task,now);
    return {...task,done:!next,missed:false,runAt:next||task.runAt,lastRunAt:new Date(now).toISOString()};
  });
  return {due,updated};
}
module.exports={nextRunAt,collectDue};
