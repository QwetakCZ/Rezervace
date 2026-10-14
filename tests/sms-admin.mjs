// Isolated DB :13316. Real PHP mail/cURL are disabled and replaced with local captures.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const php='C:/xampp/php/php.exe';const fixture=(file,...args)=>execFileSync(php,[resolve('tests/'+file+'-fixture.php'),...args.map(String)],{encoding:'utf8'});
const f=JSON.parse(fixture('hall','init'));fixture('sms-admin','schema');const users=JSON.parse(fixture('sms-admin','users',f.cid));const foreign=JSON.parse(fixture('sms-admin','users',f.other));
const temp=mkdtempSync(join(tmpdir(),'rezervace-sms-capture-')),capture=join(temp,'sms.jsonl');
let server;function start(fail=false){server=spawn(php,['-d','disable_functions=mail,curl_init,curl_setopt_array,curl_exec,curl_error,curl_getinfo,curl_close','-S','127.0.0.1:18086',resolve('tests/sms-admin-router.php')],{env:{...process.env,REZERVACE_SMS_CAPTURE:capture,REZERVACE_SMS_FAIL:fail?'1':'0'},stdio:'ignore'});}
async function stop(){server.kill();await new Promise(r=>server.once('exit',r));}
start();let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const inspect=()=>JSON.parse(fixture('sms-admin','inspect',f.cid));const sends=()=>existsSync(capture)?readFileSync(capture,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
async function req(path,method='GET',body,token=f.adminToken,status=200){const r=await fetch('http://127.0.0.1:18086/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(path+' nonJSON '+raw.slice(0,300));}assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;}
async function ready(){for(let i=0;i<50;i++){try{await req('/health');return;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}}
const settings=body=>req('/admin/booking-settings','PATCH',body);
const template='{{firstName}} {{lastName}} {{date}} {{weekday}} {{time}} {{timeFrom}} {{timeTo}} {{resource}} {{reservationId}} {{totalPrice}} {{email}} {{phone}}';
const configured={minAdvanceMinutes:0,smsEnabled:false,smsApiKey:'qa-fake-key-only',smsAdminNotificationEnabled:true,smsAdminRecipientIds:[f.admin,users.second,users.duplicate],smsAdminNotificationTemplate:template};
const d=new Date();d.setDate(d.getDate()+20);const date=d.toISOString().slice(0,10);
const booking=(start,status=201)=>req('/reservations','POST',{companyId:f.cid,categoryId:f.tables,resourceId:f.table,date,slotStarts:[start],firstName:'Father',lastName:'Snapshot',email:'guest@example.invalid',phone:'999999999'},'',status);
try{
 await ready();await req('/admin/booking-settings','GET',undefined,'',401);await req('/admin/booking-settings','GET',undefined,f.playerToken,401);
 const initial=await req('/admin/booking-settings');
 check('default disabled with no recipients; own admins only and no secrets',()=>{assert.equal(initial.smsAdminNotificationEnabled,false);assert.deepEqual(initial.smsAdminRecipientIds,[]);assert.equal(initial.smsAdminRecipients.length,4);assert.equal(initial.smsAdminRecipients.find(a=>a.id===users.invalid).canReceiveSms,false);assert.ok(!initial.smsAdminRecipients.some(a=>a.id===foreign.second));assert.ok(!JSON.stringify(initial).includes('encrypted'));});
 await booking('08:00:00');check('disabled notifications never call the SMS gateway',()=>assert.equal(sends().length,0));
 for(const ids of [[foreign.second],[users.coach],[users.player],[999999],[0],['bad']])await req('/admin/booking-settings','PATCH',{...configured,smsAdminRecipientIds:ids},f.adminToken,400);
 await req('/admin/booking-settings','PATCH',{...configured,smsAdminRecipientIds:[]},f.adminToken,400);
 await req('/admin/booking-settings','PATCH',{...configured,smsAdminRecipientIds:[users.invalid]},f.adminToken,400);
 await req('/admin/booking-settings','PATCH',{...configured,smsApiKey:''},f.adminToken,400);
 await req('/admin/booking-settings','PATCH',{...configured,smsAdminNotificationTemplate:'x'.repeat(601)},f.adminToken,400);
 check('invalid/foreign/non-admin/missing phone/empty recipients/missing key rejected',()=>assert.equal(sends().length,0));
 const saved=await settings(configured);
 check('settings save does not send SMS; API key is encrypted and never returned',()=>{assert.equal(sends().length,0);assert.equal(saved.smsAdminNotificationEnabled,true);assert.deepEqual(saved.smsAdminRecipientIds,[f.admin,users.second,users.duplicate]);assert.ok(inspect().settings.sms_api_key_encrypted.startsWith('v1.'));assert.ok(!JSON.stringify(saved).includes('qa-fake-key-only'));});
 const reread=await req('/admin/booking-settings');check('template and recipient choice survive reload',()=>{assert.equal(reread.smsAdminNotificationTemplate,template);assert.deepEqual(reread.smsAdminRecipientIds,saved.smsAdminRecipientIds);});
 const b=await booking('09:00:00');
 check('new customer booking notifies selected admins even when customer SMS and email preferences are off',()=>{assert.equal(sends().length,2);assert.deepEqual(sends().map(s=>s.payload.to[0].phone_number),['420111111111','420222222222']);assert.equal(b.status,'pending');});
 check('same normalized admin phone is deduplicated and customer phone is not a recipient',()=>{assert.ok(sends().every(s=>s.payload.to.length===1));assert.ok(!sends().some(s=>s.payload.to[0].phone_number==='420999999999'));});
 check('template uses reservation snapshots, weekday and full time range',()=>{const msg=sends()[0].payload.body;assert.ok(msg.includes('Father Snapshot'));assert.ok(msg.includes('09:00 - 09:30'));assert.ok(msg.includes('Table 1'));assert.ok(msg.includes('guest@example.invalid'));assert.ok(msg.includes('999999999'));assert.ok(msg.includes(String(b.reservationId)));assert.ok(!msg.includes('{{'));});
 check('notification is recorded with dedicated type in company SMS logs',()=>{assert.equal(inspect().logs.length,2);assert.ok(inspect().logs.every(l=>l.type==='admin_new_reservation'&&l.delivery_status==='accepted'));});
 await booking('09:00:00',400);check('failed booking produces no notification',()=>assert.equal(sends().length,2));
 await req('/admin/hall-blocks','POST',{wholeHall:true,label:'QA internal',mode:'single',singleDate:date,allDay:false,timeFrom:'20:00',timeTo:'21:00'},f.adminToken,201);
 check('internal hall block does not send admin SMS',()=>assert.equal(sends().length,2));
 await settings({minAdvanceMinutes:0,smsEnabled:false,smsApiKey:'',smsConfirmationTemplate:'Customer unchanged'});
 check('older settings payload preserves new admin notification preferences',()=>{const s=inspect().settings;assert.equal(s.sms_admin_notification_enabled,1);assert.equal(s.sms_admin_notification_template,template);});
 await settings({...configured,smsApiKey:'',smsAdminNotificationEnabled:false});await booking('10:00:00');
 check('explicit disable stops future notifications',()=>assert.equal(sends().length,2));
 await settings({...configured,smsApiKey:''});fixture('sms-admin','changeRole',f.cid,users.second);fixture('sms-admin','poisonIds',f.cid,JSON.stringify([f.admin,users.second,foreign.second]));await booking('11:00:00');
 check('delivery rechecks current admin role and company even for tampered stored ids',()=>assert.equal(sends().length,3));
 fixture('sms-admin','clearPhone',f.cid,f.admin);await booking('12:00:00');
 check('phone removed after setup is skipped and logged without gateway traffic',()=>{assert.equal(sends().length,3);assert.equal(inspect().logs.at(-1).delivery_status,'skipped');});
 await settings({...configured,smsApiKey:'',smsAdminRecipientIds:[users.duplicate]});await stop();start(true);await ready();const fail=await booking('13:00:00');
 check('provider failure keeps reservation saved and is logged',()=>{assert.equal(fail.status,'pending');assert.equal(inspect().logs.at(-1).delivery_status,'failed');assert.ok(inspect().bookings.some(r=>r.id===fail.reservationId));});
 console.log(`${checks} SMS admin checks passed. Real mail and cURL disabled; zero real SMS.`);
}finally{await stop();fixture('hall','cleanup',f.cid);fixture('hall','cleanup',f.other);assert.ok(temp.startsWith(join(tmpdir(),'rezervace-sms-capture-')));rmSync(temp,{recursive:true,force:true});console.log('Synthetic fixtures and fake SMS captures removed.');}
