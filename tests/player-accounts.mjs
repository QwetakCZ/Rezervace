// Isolated :13316 DB + captured mail. Includes frontend completion and legacy links.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const php=process.env.PHP_BINARY||'C:/xampp/php/php.exe';
const fixture=(file,...args)=>execFileSync(php,[resolve('tests/'+file+'-fixture.php'),...args.map(String)],{encoding:'utf8'});
const f=JSON.parse(fixture('hall','init'));fixture('player-accounts','schema');
const temp=mkdtempSync(join(tmpdir(),'rezervace-player-qa-'));const mailFile=join(temp,'mail.jsonl');
const server=spawn(php,['-d','disable_functions=mail','-S','127.0.0.1:18085',resolve('tests/player-accounts-router.php')],{env:{...process.env,REZERVACE_TEST_MAIL_FILE:mailFile},stdio:'ignore'});
const source=readFileSync(resolve('frontend/src/api.js'),'utf8').replace('import.meta.env.VITE_API_URL',JSON.stringify('http://127.0.0.1:18085'));
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let checks=0,imports=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
async function req(path,body,status=200){const r=await fetch('http://127.0.0.1:18085/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;}
const mails=()=>readFileSync(mailFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const mailUrl=()=>new URL(mails().at(-1).body.match(/href='([^']+)'/)[1].replaceAll('&amp;','&'));
async function client(href) {
 const initial=new URL(href);const navigation={reload:null,history:null};
 globalThis.window={location:{href:initial.href,pathname:initial.pathname,search:initial.search,replace:url=>navigation.reload=url},history:{replaceState:(_state,_title,url)=>navigation.history=url}};
 const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// instance '+(++imports)).toString('base64'));
 return {...module,navigation};
}
const register=(cid,email)=>req('/player/register',{companyId:cid,firstName:'Player',lastName:'QA',email,phone:'',password:'Synthetic-QA-password'},201);
try{
 for(let i=0;i<50;i++){try{await req('/health');break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
 await register(f.cid,'shared@example.invalid');const firstUrl=mailUrl(),firstToken=firstUrl.searchParams.get('activatePlayerToken');
 check('activation email includes the registration company and valid token',()=>{assert.equal(Number(firstUrl.searchParams.get('companyId')),f.cid);assert.match(firstToken,/^[a-f0-9]{64}$/);assert.notEqual(f.cid,1);});
 await req('/player/login',{companyId:f.cid,email:'shared@example.invalid',password:'Synthetic-QA-password'},401);
 check('account cannot log in before activation',()=>{});
 const normal=await client(firstUrl.href);const activated=await normal.api.activatePlayer(firstToken);
 const reload=normal.finishPlayerAccountAction(activated.user,'activatePlayerToken');
 check('new email keeps the correct company without a page reload',()=>{assert.equal(reload,false);assert.equal(normal.navigation.reload,null);assert.ok(normal.navigation.history.includes('companyId='+f.cid));assert.ok(!normal.navigation.history.includes('activatePlayerToken'));assert.equal(activated.user.companyId,f.cid);assert.ok(storage.get('rezervace_player_token'));});
 await req('/player/activate',{token:firstToken},410);
 check('activation remains single-use',()=>{});
 await register(f.other,'shared@example.invalid');const otherUrl=mailUrl(),otherToken=otherUrl.searchParams.get('activatePlayerToken');
 check('same email in another club gets that club in its link',()=>assert.equal(Number(otherUrl.searchParams.get('companyId')),f.other));
 const legacy=await client('https://rezervace.tt-denik.cz/?activatePlayerToken='+otherToken+'&embed=1#account');
 const oldResult=await legacy.api.activatePlayer(otherToken);legacy.finishPlayerAccountAction(oldResult.user,'activatePlayerToken');
 check('legacy activation link without company redirects using verified account',()=>{const u=new URL(legacy.navigation.reload);assert.equal(Number(u.searchParams.get('companyId')),f.other);assert.equal(u.searchParams.has('activatePlayerToken'),false);assert.equal(u.searchParams.get('embed'),'1');assert.equal(u.hash,'#account');assert.equal(u.origin,'https://rezervace.tt-denik.cz');assert.equal(storage.get('rezervace_player_token'),oldResult.token);});
 await register(f.cid,'wrong-param@example.invalid');const wrongToken=mailUrl().searchParams.get('activatePlayerToken');
 const wrong=await client('http://localhost/Rezervace/?companyId=1&activatePlayerToken='+wrongToken);
 const correct=await wrong.api.activatePlayer(wrongToken);wrong.finishPlayerAccountAction(correct.user,'activatePlayerToken');
 check('incorrect company parameter cannot move an activated account to another club',()=>{const u=new URL(wrong.navigation.reload);assert.equal(u.pathname,'/Rezervace/');assert.equal(Number(u.searchParams.get('companyId')),f.cid);assert.equal(correct.user.companyId,f.cid);});
 const login=await req('/player/login',{companyId:f.cid,email:'shared@example.invalid',password:'Synthetic-QA-password'});
 check('login after activation remains scoped to the registered club',()=>assert.equal(login.user.companyId,f.cid));
 await req('/player/password-reset/request',{companyId:f.other,email:'shared@example.invalid'});const resetUrl=mailUrl(),resetToken=resetUrl.searchParams.get('resetPlayerToken');
 check('password reset mail also includes the correct company',()=>{assert.equal(Number(resetUrl.searchParams.get('companyId')),f.other);assert.match(resetToken,/^[a-f0-9]{64}$/);});
 const oldReset=await client('https://rezervace.tt-denik.cz/?resetPlayerToken='+resetToken);
 const reset=await oldReset.api.confirmPlayerPasswordReset(resetToken,'New-synthetic-QA-password');oldReset.finishPlayerAccountAction(reset.user,'resetPlayerToken');
 check('legacy password reset returns to the verified club and removes used token',()=>{const u=new URL(oldReset.navigation.reload);assert.equal(Number(u.searchParams.get('companyId')),f.other);assert.equal(u.searchParams.has('resetPlayerToken'),false);assert.equal(storage.get('rezervace_player_token'),reset.token);});
 await req('/player/password-reset/confirm',{token:resetToken,password:'Different-QA-password'},410);
 check('reset token remains single-use',()=>{});
 await req('/player/login',{companyId:f.cid,email:'shared@example.invalid',password:'Synthetic-QA-password'});
 await req('/player/login',{companyId:f.other,email:'shared@example.invalid',password:'New-synthetic-QA-password'});
 check('reset changes only the account in the correct club',()=>{});
 await register(f.cid,'expired@example.invalid');const expiredToken=mailUrl().searchParams.get('activatePlayerToken');fixture('player-accounts','expire',f.cid,expiredToken);
 await req('/player/activate',{token:expiredToken},410);
 check('expired activation is still rejected',()=>{});
 check('invalid company in API response cannot redirect the player',()=>assert.throws(()=>oldReset.finishPlayerAccountAction({companyId:'//evil.invalid'},'resetPlayerToken')));
 console.log(`${checks} player account checks passed; no real mail sent.`);
}finally{
 server.kill();await new Promise(r=>server.once('exit',r));fixture('hall','cleanup',f.cid);fixture('hall','cleanup',f.other);
 assert.ok(temp.startsWith(join(tmpdir(),'rezervace-player-qa-')));rmSync(temp,{recursive:true,force:true});console.log('Synthetic accounts and captured mail removed.');
}
