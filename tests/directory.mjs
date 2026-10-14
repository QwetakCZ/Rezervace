// Requires isolated MariaDB :13316 with directory-schema.sql + migrace_directory.sql.
// No real mail: PHP mail() is replaced with a capture/controlled-failure stub.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const php=process.env.PHP_BINARY||'C:/xampp/php/php.exe';
const fixture=(...args)=>execFileSync(php,[resolve('tests/directory-fixture.php'),...args.map(String)],{encoding:'utf8'});
const f=JSON.parse(fixture('init'));
const temp=mkdtempSync(join(tmpdir(),'rezervace-directory-mail-'));
const mailFile=join(temp,'mails.jsonl');
const server=spawn(php,['-d','disable_functions=mail','-S','127.0.0.1:18083',resolve('tests/directory-router.php')],{env:{...process.env,REZERVACE_TEST_MAIL_FILE:mailFile},stdio:'ignore'});
const base='http://127.0.0.1:18083/api';
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const inspect=()=>JSON.parse(fixture('inspect',f.cid));
const mails=()=>existsSync(mailFile)?readFileSync(mailFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
async function req(path,method='GET',body,token=f.adminToken,status=200){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(path+' non JSON: '+raw.slice(0,100));}
    assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;
}
const send=(body,token=f.adminToken,status=200)=>req('/admin/directory/email','POST',body,token,status);
try {
    for(let i=0;i<50;i++){try{await req('/health');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
    await req('/admin/directory','GET',undefined,'',401);
    await req('/admin/directory','GET',undefined,f.playerToken,401);
    await req('/admin/directory','GET',undefined,f.superToken,403);
    check('directory requires a company admin, not guest/player/superadmin',()=>{});
    const data=await req('/admin/directory');const contacts=data.contacts;
    check('activated accounts separate from guests and pending activation',()=>{assert.equal(contacts.filter(c=>c.registered).length,1);assert.ok(!contacts.find(c=>c.firstName==='Pending').registered);assert.ok(contacts.every(c=>!['Admin','Coach','Super','Foreign','Internal'].includes(c.firstName)));});
    check('API does not expose passwords or other-company contacts',()=>{assert.ok(!JSON.stringify(data).includes('password'));assert.ok(!contacts.some(c=>c.email==='foreign@example.invalid'));});
    const father=contacts.find(c=>c.firstName==='Father');const brother=contacts.find(c=>c.firstName==='Brother');const player=contacts.find(c=>c.registered);const guest=contacts.find(c=>c.firstName==='Guest');
    check('reservation snapshots keep father and brother separate on same email',()=>{assert.equal(father.email,player.email);assert.equal(brother.email,player.email);assert.notEqual(father.id,brother.id);assert.equal(father.phone,'+420333333333');assert.equal(father.bookingCount,2);assert.equal(player.bookingCount,1);assert.equal(guest.bookingCount,1);});
    check('missing snapshot phone never falls back to a different old phone',()=>assert.equal(contacts.find(c=>c.firstName==='NoPhone').phone,''));
    const input={requestId:randomUUID(),contactIds:[player.id,father.id,brother.id,guest.id],subject:'Provoz klubu – změna času',message:'Ahoj,\nnové informace. <script>unsafe()</script>'};
    const foreign=await send({...input,requestId:randomUUID(),contactIds:['player:'+f.foreign]},f.adminToken,409);
    check('foreign contact is rejected before any delivery',()=>{assert.equal(foreign.deliveryStarted,false);assert.equal(mails().length,0);});
    await send({...input,requestId:randomUUID(),subject:'Subject\r\nBcc: attack@example.invalid'},f.adminToken,400);
    await send({...input,requestId:randomUUID(),contactIds:[contacts.find(c=>!c.canEmail).id]},f.adminToken,400);
    check('header injection and invalid emails rejected',()=>assert.equal(mails().length,0));
    const result=await send(input);
    check('four selected contacts produce two individual emails',()=>{assert.equal(result.total,2);assert.equal(result.sent,2);assert.equal(mails().length,2);assert.ok(mails().every(m=>m.to==='family@example.invalid'||m.to==='guest@example.invalid'));});
    check('messages escape HTML, preserve lines and use admin Reply-To privately',()=>{for(const m of mails()){assert.ok(m.headers.includes('Reply-To: admin@example.invalid'));assert.ok(!m.headers.match(/(^|\n)(Cc|Bcc):/i));assert.ok(!m.body.includes('<script>'));assert.ok(m.body.includes('&lt;script&gt;'));assert.ok(m.body.includes('<br'));}});
    const repeated=await send(input);
    check('same request cannot send emails twice',()=>{assert.equal(repeated.alreadyProcessed,true);assert.equal(mails().length,2);assert.equal(inspect().batches.length,1);assert.equal(inspect().logs.length,2);assert.ok(inspect().logs.every(l=>l.type==='directory_message'));});
    await send({...input,message:'different'},f.adminToken,409);
    await send(input,f.foreignToken,409);
    check('changed payload and other-company replay cannot reuse request',()=>assert.equal(mails().length,2));
    const partial={...input,requestId:randomUUID(),contactIds:[guest.id,contacts.find(c=>c.email==='fail@example.invalid').id]};
    const partialResult=await send(partial);
    check('partial delivery failure is visible and correctly logged',()=>{assert.equal(partialResult.sent,1);assert.equal(partialResult.failed,1);assert.deepEqual(partialResult.failures,['fail@example.invalid']);assert.ok(inspect().logs.some(l=>l.recipient_email==='fail@example.invalid'&&l.delivery_status==='failed'));});
    const oldCount=mails().length;await send(partial);
    check('partial-failure retry also avoids duplicates',()=>assert.equal(mails().length,oldCount));
    fixture('pending',f.cid,partial.requestId);await send(partial,f.adminToken,409);
    check('in-progress/interrupted batch refuses blind re-delivery',()=>assert.equal(mails().length,oldCount));
    fixture('many',f.cid);const many=(await req('/admin/directory')).contacts.filter(c=>c.firstName==='Many');
    await send({...input,requestId:randomUUID(),contactIds:many.map(c=>c.id)},f.adminToken,400);
    check('100 unique recipient limit enforced before any extra mail',()=>assert.equal(mails().length,oldCount));
    const logs=await req('/admin/email-logs');check('directory messages appear in regular company email logs',()=>assert.ok(logs.some(l=>l.type==='directory_message')));
    console.log(`${checks} directory integration checks passed; no real messages sent.`);
} finally {
    server.kill();await new Promise(r=>server.once('exit',r));
    fixture('cleanup',f.cid);fixture('cleanup',f.other);
    assert.ok(temp.startsWith(join(tmpdir(),'rezervace-directory-mail-')));rmSync(temp,{recursive:true,force:true});
    console.log('Synthetic contacts and mail captures removed.');
}
