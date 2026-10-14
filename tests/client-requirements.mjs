// node tests/client-requirements.mjs (local MySQL; no real emails or SMS)
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const fixturePath = resolve('tests/client-requirements-fixture.php');
const fixture = (...args) => execFileSync(php,[fixturePath,...args.map(String)],{encoding:'utf8'});
const f = JSON.parse(fixture('init'));
const temp = mkdtempSync(join(tmpdir(),'rezervace-qa-'));
const mailFile = join(temp,'mails.jsonl');
const server = spawn(php,['-d','disable_functions=mail','-S','127.0.0.1:18081',resolve('tests/client-requirements-router.php')],{env:{...process.env,REZERVACE_TEST_MAIL_FILE:mailFile},stdio:'ignore'});
const base='http://127.0.0.1:18081/api';
let passed=0;
function check(name,fn){fn(); passed++; console.log('PASS '+name);}
const inspect = () => JSON.parse(fixture('inspect',f.cid));
const mails = () => existsSync(mailFile) ? readFileSync(mailFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
async function request(path,method='GET',body,admin=false,expected=200,player=false){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+f.adminToken}:player?{Authorization:'Bearer '+f.playerToken}:{})},body:body?JSON.stringify(body):undefined});
    const raw=await response.text(); let value; try{value=JSON.parse(raw);}catch{throw new Error(path+' returned non-JSON: '+raw.slice(0,100));}
    assert.equal(response.status,expected,path+': '+JSON.stringify(value)); return value;
}
const date = offset => {const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);};
const dow = value => new Date(value+'T12:00:00').getDay()||7;
const booking = (day,start='09:00:00',player=false) => {
    const [h,m]=start.split(':').map(Number);const mins=h*60+m;
    const slotStarts=Array.from({length:3},(_,i)=>`${String(Math.floor((mins+i*30)/60)).padStart(2,'0')}:${String((mins+i*30)%60).padStart(2,'0')}:00`);
    return request('/reservations','POST',{companyId:f.cid,categoryId:f.cat,resourceId:f.resources[0],date:day,slotStarts,firstName:'Father',lastName:'QA',email:'guest@example.invalid',phone:'+420777123456',note:'QA'},false,201,player);
};
const tokens = () => {
    const adminMail=mails().filter(m=>m.to==='admin@example.invalid').at(-1);
    const matches=[...adminMail.body.matchAll(/adminActionToken=([^'"\s<]+)/g)].map(m=>decodeURIComponent(m[1]));
    assert.equal(matches.length,2);
    const customerMail=mails().filter(m=>m.to==='guest@example.invalid').at(-1);
    const cancel=decodeURIComponent(customerMail.body.match(/cancelToken=([^'"\s<]+)/)[1]);
    return {approve:matches[0],cancel:matches[1],customerCancel:cancel};
};
try {
    for(let i=0;i<50;i++){try{await request('/health');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
    check('whole time range merges adjacent, duplicate and 45-minute blocks; preserves gaps',()=>{
        const ranges=JSON.parse(fixture('times',f.cid));assert.equal(ranges[0].time,'09:00 - 10:30');assert.equal(ranges[0].timeFrom,'09:00');assert.equal(ranges[0].timeTo,'10:30');assert.equal(ranges[1].time,'09:00 - 10:30, 12:00 - 12:45');
    });
    for(const type of ['customer_cancellation','admin_customer_cancellation','confirmation']) await request('/admin/email-templates','PUT',{type,subject:type+' {{time}}',bodyHtml:'<p>'+type+' {{firstName}} {{weekday}} {{time}} {{timeFrom}}/{{timeTo}}</p>'},true);
    check('all new template types stored and returned',()=>assert.equal(inspect().templates.length,3));
    const recurringBody={categoryId:f.cat,allResources:true,startDate:date(20),startTime:'09:00',durationMinutes:90,repeatEveryWeeks:2,occurrences:2,label:'All tables QA'};
    const recurring=await request('/admin/reservations/recurring','POST',recurringBody,true,201);
    check('two internal occurrences each contain all four tables',()=>{const state=inspect();assert.equal(recurring.created.length,2);for(const entry of recurring.created){const slots=state.slots.filter(s=>+s.reservation_id===entry.reservationId);assert.equal(slots.length,12);assert.equal(new Set(slots.map(s=>s.resource_id)).size,4);}});
    const beforeConflict=inspect().reservations.length;
    await request('/admin/reservations/recurring','POST',{...recurringBody,startDate:date(6)},true,409);
    check('conflict in second occurrence rolls back entire series',()=>assert.equal(inspect().reservations.length,beforeConflict));
    const hallDate=date(22);
    const hall=await request('/admin/hall-blocks','POST',{categoryId:f.cat,label:'Private 16–19',mode:'single',singleDate:hallDate,allDay:false,timeFrom:'16:00',timeTo:'19:00'},true,201);
    check('private event creates only requested interval, on all tables',()=>{const slots=inspect().slots.filter(s=>+s.reservation_id===hall.created[0].reservationId);assert.equal(slots.length,24);assert.ok(slots.every(s=>s.time_start>='16:00:00'&&s.time_end<='19:00:00'));});
    const available=await request(`/availability?companyId=${f.cid}&categoryId=${f.cat}&date=${hallDate}`);
    check('availability before 16 and from 19 stays free',()=>{for(const r of available.resources){const at=t=>r.slots.find(s=>s.time_start===t);assert.equal(at('15:30:00').available,true);assert.equal(at('16:00:00').reserved,true);assert.equal(at('18:30:00').reserved,true);assert.equal(at('19:00:00').available,true);}});
    const afterHall=await booking(hallDate,'19:00:00'); const afterHallTokens=tokens();
    await request('/reservations/cancel','PATCH',{token:afterHallTokens.customerCancel});
    check('customer can book after private event and cancel; admin gets own template',()=>{const state=inspect();const logs=state.logs.filter(l=>+l.reservation_id===afterHall.reservationId);assert.equal(logs.filter(l=>l.type==='admin_customer_cancellation').length,1);assert.equal(logs.filter(l=>l.type==='customer_cancellation').length,1);assert.ok(mails().filter(m=>m.subject.startsWith('admin_customer_cancellation')).at(-1).body.includes('19:00 - 20:30'));assert.equal(mails().filter(m=>m.to==='muted@example.invalid').length,0);});
    const res=await booking(date(25));const links=tokens();
    check('admin email includes distinct signed approve and cancel links',()=>assert.notEqual(links.approve,links.cancel));
    const preview=await request('/reservation-action-info?token='+encodeURIComponent(links.approve));
    check('GET preview cannot approve a reservation',()=>{assert.equal(preview.action,'approve');assert.equal(inspect().reservations.find(r=>+r.id===res.reservationId).status,'pending');});
    await request('/reservation-action','POST',{token:links.approve});
    check('explicit POST approval confirms and sends full-range customer email',()=>{assert.equal(inspect().reservations.find(r=>+r.id===res.reservationId).status,'confirmed');assert.ok(mails().at(-1).body.includes('09:00 - 10:30'));assert.ok(mails().at(-1).body.includes('09:00/10:30'));});
    const mailCount=mails().length;await request('/reservation-action','POST',{token:links.approve},false,409);
    check('repeated approval cannot send duplicate messages',()=>assert.equal(mails().length,mailCount));
    await request('/reservation-action-info?token='+encodeURIComponent(links.cancel+'x'),'GET',undefined,false,410);
    const expired=fixture('token',f.cid,res.reservationId,f.users.admin,'cancel',Math.floor(Date.now()/1000)-1);
    await request('/reservation-action','POST',{token:expired},false,410);
    const wrong=fixture('token',f.cid,res.reservationId,f.users.muted,'cancel',Math.floor(Date.now()/1000)+3600);
    await request('/reservation-action','POST',{token:wrong},false,403);
    check('modified, expired and unauthorized admin links rejected',()=>{});
    await request('/reservation-action','POST',{token:links.cancel});
    check('email cancel releases slots and sends customer cancellation',()=>{assert.equal(inspect().reservations.find(r=>+r.id===res.reservationId).status,'cancelled');assert.equal(inspect().slots.filter(s=>+s.reservation_id===res.reservationId).length,0);});
    const pending=await booking(date(26));const pendingLinks=tokens();await request('/reservation-action','POST',{token:pendingLinks.cancel});
    check('admin can cancel pending reservation directly from email',()=>assert.equal(inspect().reservations.find(r=>+r.id===pending.reservationId).status,'cancelled'));
    const playerRes=await booking(date(27),'09:00:00',true);
    await request('/player/reservations/'+playerRes.reservationId+'/cancel','PATCH',{},false,200,true);
    check('signed-in customer cancellation also notifies company admin',()=>assert.ok(inspect().logs.some(l=>+l.reservation_id===playerRes.reservationId&&l.type==='admin_customer_cancellation')));
    const windowDay=dow(date(28));const source=f.windows[windowDay][0];
    fixture('vary',f.cid,windowDay);
    await request('/admin/pricing-windows/'+source,'PATCH',{categoryId:f.cat,resourceIds:f.resources,dayOfWeek:windowDay,timeFrom:'08:00',timeTo:'21:00',pricePerSlot:60},true);
    check('bulk pricing edit updates matching windows on all tables',()=>{const rows=inspect().windows.filter(w=>+w.day_of_week===windowDay);assert.equal(rows.length,4);assert.ok(rows.every(w=>w.time_to==='21:00:00'&&+w.price_per_slot===60));});
    await request('/admin/pricing-windows/'+source,'PATCH',{categoryId:f.cat,resourceIds:[f.resources[0],f.resources[1]],dayOfWeek:windowDay,timeFrom:'08:00',timeTo:'20:00',pricePerSlot:70},true);
    check('partial bulk edit preserves unselected tables',()=>{const rows=inspect().windows.filter(w=>+w.day_of_week===windowDay);assert.equal(rows.filter(w=>w.time_to==='20:00:00').length,2);assert.equal(rows.filter(w=>w.time_to==='21:00:00').length,2);});
    const sharedId=+fixture('shared',f.cid);
    await request('/admin/pricing-windows/'+sharedId,'PATCH',{categoryId:f.cat,resourceIds:[f.resources[0]],dayOfWeek:7,timeFrom:'06:00',timeTo:'07:00',pricePerSlot:30},true);
    check('shared window edit materializes unselected resources unchanged',()=>{const rows=inspect().windows.filter(w=>w.time_from==='06:00:00');assert.equal(rows.length,4);assert.equal(rows.filter(w=>+w.price_per_slot===20).length,3);assert.equal(rows.filter(w=>+w.price_per_slot===30).length,1);assert.ok(rows.every(w=>w.resource_id));});
    const edgeDate=date(30);
    await request('/admin/hall-blocks','POST',{categoryId:f.cat,label:'Off-grid private',mode:'single',singleDate:edgeDate,allDay:false,timeFrom:'16:15',timeTo:'18:45'},true,201);
    check('partial boundary blocks also protect off-grid private events',()=>{const rows=inspect().slots.filter(s=>s.date===edgeDate);assert.ok(rows.some(s=>s.time_start==='16:00:00'));assert.ok(rows.some(s=>s.time_start==='18:30:00'));assert.ok(!rows.some(s=>s.time_start==='19:00:00'));});
    const occupiedDate=recurring.created[0].date;
    const occupiedDay=dow(occupiedDate);
    const shiftedSource=inspect().windows.find(w=>+w.day_of_week===occupiedDay&&+w.resource_id===f.resources[0]&&w.time_from==='08:00:00');
    await request('/admin/pricing-windows/'+shiftedSource.id,'PATCH',{categoryId:f.cat,resourceIds:f.resources,dayOfWeek:occupiedDay,timeFrom:'08:15',timeTo:'21:15',pricePerSlot:50},true);
    const shifted=await request(`/availability?companyId=${f.cid}&categoryId=${f.cat}&date=${occupiedDate}`);
    check('editing window grid keeps existing overlapping bookings blocked',()=>{const rows=shifted.resources[0].slots;assert.equal(rows.find(s=>s.time_start==='08:45:00').reserved,true);assert.equal(rows.find(s=>s.time_start==='10:15:00').reserved,true);assert.equal(rows.find(s=>s.time_start==='10:45:00').available,true);});
    const beforeOverlap=inspect().reservations.length;
    const h=9,mm=15; const starts=[0,30,60].map(n=>`${String(h+Math.floor((mm+n)/60)).padStart(2,'0')}:${String((mm+n)%60).padStart(2,'0')}:00`);
    await request('/reservations','POST',{companyId:f.cid,categoryId:f.cat,resourceId:f.resources[0],date:occupiedDate,slotStarts:starts,firstName:'QA',lastName:'Overlap',email:'overlap@example.invalid'},false,400);
    await request('/admin/hall-blocks','POST',{categoryId:f.cat,label:'Overlap',mode:'single',singleDate:occupiedDate,allDay:false,timeFrom:'08:50',timeTo:'09:10'},true,409);
    check('booking and private event cannot overlap older grid; no orphan reservation',()=>assert.equal(inspect().reservations.length,beforeOverlap));
    await request('/admin/pricing-windows/'+shiftedSource.id,'PATCH',{categoryId:f.cat,resourceIds:[-1]},true,403);
    check('bulk window edits reject resources outside selected category',()=>{});
    console.log(`${passed} integration checks passed; no outbound messages.`);
} finally {
    server.kill(); await new Promise(resolve=>server.once('exit',resolve));
    fixture('cleanup',f.cid);
    assert.ok(temp.startsWith(join(tmpdir(),'rezervace-qa-')));rmSync(temp,{recursive:true,force:true});
    console.log('Synthetic company, reservations, templates and mail capture removed.');
}
