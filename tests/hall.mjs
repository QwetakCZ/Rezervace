// Isolated MariaDB :13316 only. Router replaces mail(); no real deliveries.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const php=process.env.PHP_BINARY||'C:/xampp/php/php.exe';
const fixture=(...args)=>execFileSync(php,[resolve('tests/hall-fixture.php'),...args.map(String)],{encoding:'utf8'});
const f=JSON.parse(fixture('init'));
const server=spawn(php,['-d','disable_functions=mail','-S','127.0.0.1:18084',resolve('tests/hall-router.php')],{stdio:'ignore'});
const date=(offset)=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const base={wholeHall:true,categoryId:f.foreign,label:'Whole hall QA',mode:'single',singleDate:date(10),allDay:false,timeFrom:'16:00',timeTo:'19:00'};
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const inspect=()=>JSON.parse(fixture('inspect',f.cid));
async function req(path,method='GET',body,token=f.adminToken,status=200){
 const r=await fetch('http://127.0.0.1:18084/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(path+' non JSON: '+raw.slice(0,300));}
 assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;
}
const block=(body=base,token=f.adminToken,status=201)=>req('/admin/hall-blocks','POST',body,token,status);
const availability=(cat,d=base.singleDate)=>req(`/availability?companyId=${f.cid}&categoryId=${cat}&date=${d}`);
const book=(cat,resource,start,d=base.singleDate,status=201)=>req('/reservations','POST',{companyId:f.cid,categoryId:cat,resourceId:resource,date:d,slotStarts:[start],firstName:'Guest',lastName:'QA',email:'guest@example.invalid'},'',status);
try{
 for(let i=0;i<50;i++){try{await req('/health');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
 await block(base,'',401);await block(base,f.playerToken,401);
 await block({...base,wholeHall:false,categoryId:f.foreign},f.adminToken,404);
 check('only own-company admin can block resources',()=>assert.equal(inspect().slots.length,0));
 for(const times of [['25:00','26:00'],['16:99','19:00'],['19:00','16:00'],['16:00:30','19:00']])await block({...base,timeFrom:times[0],timeTo:times[1]},f.adminToken,400);
 check('invalid and reversed times rejected',()=>assert.equal(inspect().slots.length,0));
 const result=await block();const state=inspect();
 check('entire hall is one cancellable event, not one event per category',()=>{assert.equal(result.created.length,1);assert.equal(result.occurrences,1);assert.equal(state.reservations.length,1);assert.equal(state.reservations[0].booking_type,'internal');});
 check('all tables and coaches included even without coach windows',()=>{assert.deepEqual(state.slots.map(s=>s.resource_id).sort(),[f.table,f.table2,f.coach].sort());assert.ok(state.slots.every(s=>s.time_start==='16:00:00'&&s.time_end==='19:00:00'));});
 check('inactive and foreign-company resources excluded',()=>assert.ok(!state.slots.some(s=>[f.inactive,f.outsider].includes(s.resource_id))));
 let av=await availability(f.tables);
 check('public availability blocks interval and keeps adjacent slots free',()=>{const s=av.resources[0].slots;assert.equal(s.find(s=>s.time_start==='15:30:00').reserved,false);assert.equal(s.find(s=>s.time_start==='16:00:00').reserved,true);assert.equal(s.find(s=>s.time_start==='18:30:00').reserved,true);assert.equal(s.find(s=>s.time_start==='19:00:00').reserved,false);});
 fixture('coachWindows',f.cid);av=await availability(f.coaches);
 check('new coach windows cannot bypass existing whole-hall block',()=>assert.equal(av.resources[0].slots.find(s=>s.time_start==='17:00:00').reserved,true));
 await book(f.tables,f.table,'16:00:00',base.singleDate,400);await book(f.coaches,f.coach,'17:00:00',base.singleDate,400);
 check('public reservation submit also rejects overlaps in both categories',()=>assert.equal(inspect().reservations.length,1));
 await book(f.tables,f.table,'15:30:00');await book(f.coaches,f.coach,'19:00:00');
 check('customer can reserve immediately before and after whole-hall event',()=>assert.equal(inspect().reservations.length,3));
 await req(`/admin/reservations/${result.created[0].reservationId}/cancel`,'PATCH',{});
 check('one cancellation releases the entire hall in all categories',()=>assert.ok(!inspect().slots.some(s=>s.reservation_id===result.created[0].reservationId)));
 const next=date(20);fixture('busy',f.cid,f.coach,next,'17:00','18:00');const before=inspect();
 const conflict=await block({...base,singleDate:next},f.adminToken,409);
 check('coach conflict rolls back all tables and identifies occupied resource',()=>{assert.deepEqual(inspect(),before);assert.ok(conflict.error.includes('Coach 1'));});
 const start=date(30),end=date(37);fixture('busy',f.cid,f.coach,end,'17:00','18:00');const beforeSeries=inspect();const weekday=new Date(start+'T12:00').getDay()||7;
 await block({...base,mode:'recurring',dateFrom:start,dateTo:end,weekdays:[weekday],repeatEveryWeeks:1},f.adminToken,409);
 check('later recurring collision rolls back earlier dates too',()=>assert.deepEqual(inspect(),beforeSeries));
 const series=await block({...base,mode:'recurring',dateFrom:date(40),dateTo:date(47),weekdays:[new Date(date(40)+'T12:00').getDay()||7],repeatEveryWeeks:1});
 check('recurring whole-hall events block every resource on both dates',()=>{assert.equal(series.occurrences,2);assert.equal(series.created.length,2);assert.ok(series.created.every(c=>c.blockedSlots===3));});
 const legacy=await block({...base,wholeHall:false,categoryId:f.tables,singleDate:date(50),timeFrom:'16:15',timeTo:'18:45'});
 check('existing category-only mode still rounds to touched window slots',()=>{const s=inspect().slots.filter(s=>s.reservation_id===legacy.created[0].reservationId);assert.equal(s.length,12);assert.ok(s.every(s=>[f.table,f.table2].includes(s.resource_id)));});
 const fullDay=await block({...base,categoryId:0,singleDate:date(60),allDay:true});
 check('all-day whole hall blocks 00:00–24:00 including window changes',()=>assert.ok(inspect().slots.filter(s=>s.reservation_id===fullDay.created[0].reservationId).every(s=>s.time_start==='00:00:00'&&s.time_end==='24:00:00')));
 const partial=await block({...base,singleDate:date(70),timeFrom:'16:15',timeTo:'18:45'});av=await availability(f.tables,date(70));
 check('partial boundary slots cannot be sold across hall closure',()=>{assert.equal(partial.created[0].blockedSlots,3);const s=av.resources[0].slots;assert.equal(s.find(s=>s.time_start==='16:00:00').reserved,true);assert.equal(s.find(s=>s.time_start==='18:30:00').reserved,true);assert.equal(s.find(s=>s.time_start==='19:00:00').reserved,false);});
 console.log(`${checks} hall integration checks passed; no real messages sent.`);
}finally{
 server.kill();await new Promise(r=>server.once('exit',r));fixture('cleanup',f.cid);fixture('cleanup',f.other);console.log('Synthetic QA data removed.');
}
