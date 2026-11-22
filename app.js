(function(){
'use strict';

/* ---------- config ---------- */
var AC=window.APP_CONFIG||{};
function bd(v){var q=String(v).split('-');return [+q[0],+q[1]]}
var CFG={
  names:AC.names||['Vincent','Janice'],
  start:String(AC.startDate||'2026-10-16').split('-').map(Number),
  bday:{Vincent:bd((AC.birthdays||{}).Vincent||'02-01'),Janice:bd((AC.birthdays||{}).Janice||'04-23')},
  arrive:Date.parse((AC.trip||{}).arrive||'2026-12-03T12:25:00+07:00'),
  leave:Date.parse((AC.trip||{}).leave||'2026-12-22T14:15:00+07:00'),
  tz:AC.timezones||{Vincent:'Asia/Singapore',Janice:'Asia/Jakarta'},
  tzOff:{SG:'+08:00',JKT:'+07:00'}
};
CFG.tripDays=Math.round((CFG.leave-CFG.arrive)/86400000);
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var EMOJIS=['🎂','✈️','🏠','🎉','💌','🎬','🍜','🌸','🐱','🎁','📅','🏖️','⛰️','🎤','🧋','❤️'];

/* ---------- helpers ---------- */
var store={
  get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},
  set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}},
  del:function(k){try{localStorage.removeItem(k)}catch(e){}}
};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function $(sel,root){return (root||document).querySelector(sel)}
function $$(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel))}
function dayIdx(y,m,d){return Math.round(Date.UTC(y,m-1,d)/86400000)}
var fmtCache={};
function ymd(ts,tz){
  var f=fmtCache['d'+tz]||(fmtCache['d'+tz]=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}));
  var o={};f.formatToParts(ts).forEach(function(p){o[p.type]=p.value});
  return [+o.year,+o.month,+o.day];
}
function clock(ts,tz){
  var f=fmtCache['c'+tz]||(fmtCache['c'+tz]=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  return f.format(ts);
}
function parts(ms){ms=Math.max(0,ms);var s=Math.floor(ms/1000);return {d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60}}
function plural(n,w){return n+' '+w+(n===1?'':'s')}
function rel(target){
  var ms=target-Date.now();
  if(ms<=0)return 'It happened';
  var p=parts(ms);
  if(p.d>0)return plural(p.d,'day')+' '+plural(p.h,'hr');
  if(p.h>0)return plural(p.h,'hr')+' '+plural(p.m,'min');
  return plural(p.m,'min')+' '+plural(p.s,'sec');
}
function ago(ts){
  var m=Math.floor((Date.now()-ts)/60000);
  if(m<1)return 'just now';
  if(m<60)return m+'m ago';
  if(m<1440)return Math.floor(m/60)+'h ago';
  return Math.floor(m/1440)+'d ago';
}
function shortDate(ts){return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'})}
function reduced(){return document.documentElement.dataset.motion==='reduced'}
function motionOff(){return reduced()||!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)}

/* ---------- state ---------- */
var S={
  db:null,dbState:'loading',booted:false,
  countdowns:[],plans:[],notes:[],game:null,gameFx:0,play:'menu',cq:[],pushOn:false,pushWho:'',pingAt:0,prefs:(function(){try{return JSON.parse(store.get('vj_prefs')||'{}')||{}}catch(e){return {}}})(),notesLoaded:false,letters:[],lettersLoaded:false,checkins:[],ciLoaded:false,ciBusy:false,ciFailed:'',ciAsked:'',mood:null,
  pending:'',authChecked:false,signing:false,loginErr:'',uid:null,sessionOn:false,
  me:null,
  tab:'home',editList:false,entered:'',
  rendered:'',confettiDone:{},dayAnimated:false,
  introDone:false,introAt:0,pingSeen:0,lastView:'',enterAt:0,c4Seen:null,c4Fx:null,tickFx:null
};
if(store.get('vj_motion')==='reduced')document.documentElement.dataset.motion='reduced';
function curTheme(){return store.get('vj_theme')||'light'}
function applyTheme(){
  var v=curTheme(),r=document.documentElement;
  if(v==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',v);
}
applyTheme();

/* Identity comes from the Supabase login (profiles table), never from this phone's storage. */
var PIN_LEN=6;
function isUnlocked(){return !!S.me&&!!S.uid}
store.del('vj_pc');store.del('vj_me'); /* old passcode-era keys */
function myTz(){return CFG.tz[S.me]||'Asia/Singapore'}
function other(){return S.me==='Vincent'?'Janice':'Vincent'}

/* ---------- derived dates ---------- */
function today(){return ymd(Date.now(),'Asia/Jakarta')}
function todayIdx(){var t=today();return dayIdx(t[0],t[1],t[2])}
function startIdx(){return dayIdx(CFG.start[0],CFG.start[1],CFG.start[2])}
function dayNumber(){return todayIdx()-startIdx()+1}
function phase(){
  var n=Date.now();
  return n<CFG.arrive?'before':(n<CFG.leave?'during':'after');
}
function nextBirthday(name){
  var b=CFG.bday[name],t=today(),ti=todayIdx();
  var y=t[0],idx=dayIdx(y,b[0],b[1]);
  if(idx<ti){y+=1;idx=dayIdx(y,b[0],b[1])}
  return {diff:idx-ti,month:b[0],day:b[1],year:y};
}
function milestones(){
  var s=startIdx();
  return [
    {label:'1 month',idx:dayIdx(2026,11,16)},
    {label:'Day 50',idx:s+49},
    {label:'Day 100',idx:s+99},
    {label:'6 months',idx:dayIdx(2027,4,16)},
    {label:'1 year',idx:dayIdx(2027,10,16)}
  ];
}
function nextMilestone(){
  var ti=todayIdx(),m=milestones();
  for(var i=0;i<m.length;i++){if(m[i].idx>=ti)return {label:m[i].label,diff:m[i].idx-ti}}
  return null;
}
function upcoming(){
  var now=Date.now();
  return S.countdowns.filter(function(c){return c.ts>now}).sort(function(a,b){return a.ts-b.ts});
}
function pastCountdowns(){
  var now=Date.now();
  return S.countdowns.filter(function(c){return c.ts<=now}).sort(function(a,b){return b.ts-a.ts});
}

/* ---------- feedback ---------- */
function toast(msg){
  var t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;
  document.body.appendChild(t);setTimeout(function(){t.remove()},2600);
}
function burst(symbols,n,ox,oy){
  if(motionOff())return;
  var fx=$('#fx');
  for(var i=0;i<n;i++){
    var e=document.createElement('span');e.className='bit';
    e.textContent=symbols[i%symbols.length];
    var a=Math.random()*Math.PI*2,d=80+Math.random()*180;
    e.style.cssText='--x:'+(ox==null?Math.random()*100+'%':ox+'px')+';--y:'+(oy==null?'-10px':oy+'px')+
      ';--s:'+(16+Math.random()*16)+'px;--t:'+(1.4+Math.random()*1.2)+'s;--dx:'+(Math.cos(a)*d)+'px;--dy:'+(oy==null?(300+Math.random()*500):Math.sin(a)*d-60)+'px;--r:'+(Math.random()*360)+'deg';
    fx.appendChild(e);
    setTimeout(function(el){return function(){el.remove()}}(e),2800);
  }
}
function confetti(){burst(['🎉','💖','✨','🌸','🎊','🩷'],42)}
function fxAdd(cls,text,ms,style){
  var fx=$('#fx');if(!fx)return;
  var e=document.createElement('span');e.className=cls;e.textContent=text;
  if(style)e.style.cssText=style;
  fx.appendChild(e);setTimeout(function(){e.remove()},ms);
}
function floatHearts(x,y){
  if(motionOff())return;
  [['💗',0,-22],['🩷',.15,18],['💖',.3,-4]].forEach(function(h){
    fxAdd('floatup',h[0],2300,'--x:'+x+'px;--y:'+y+'px;--w:'+h[1]+'s;--sx:'+h[2]+'px');
  });
}
var FLOWER_COLORS=['#FF4F93','#D90F5C','#FF77AD','#E8326E','#FF9CC2','#C2185B','#FF5C8D'];
var FLOWER_SVG='<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="currentColor"><circle cx="50" cy="24" r="19"/><circle cx="75" cy="42" r="19"/><circle cx="66" cy="72" r="19"/><circle cx="34" cy="72" r="19"/><circle cx="25" cy="42" r="19"/></g><circle cx="50" cy="50" r="11" fill="#FFF0F6"/><circle cx="50" cy="50" r="5" fill="#FFB703"/></svg>';
var INTRO_FADE_MS=2000,INTRO_TOTAL_MS=2700;
function startIntro(){
  if(motionOff()||$('.intro'))return;
  var cols=5,rows=7,html='';
  for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
    var x=(c+.5)/cols*100+(Math.random()-.5)*14,y=(r+.5)/rows*100+(Math.random()-.5)*10,s=56+Math.random()*64;
    html+='<span class="fl" style="--x:'+x.toFixed(1)+'%;--y:'+y.toFixed(1)+'%;--s:'+s.toFixed(0)+'px;--d:'+(Math.random()*1).toFixed(2)+'s;--r:'+Math.round(Math.random()*72)+'deg;color:'+FLOWER_COLORS[Math.floor(Math.random()*FLOWER_COLORS.length)]+'">'+FLOWER_SVG+'</span>';
  }
  html+='<div class="hi">Welcome, '+esc(S.me)+' 💗</div>';
  var el=document.createElement('div');
  el.className='intro';el.setAttribute('aria-hidden','true');el.innerHTML=html;
  el.addEventListener('click',function(){el.remove();S.enterAt=Date.now();render()});
  document.body.appendChild(el);
  S.introAt=Date.now()+INTRO_FADE_MS;
  setTimeout(function(){el.remove()},INTRO_TOTAL_MS);
}
function pingArrived(from){
  toast(from+' sent you a ping 💗');
  if(motionOff())return;
  fxAdd('pingpulse','',2000);
  fxAdd('bigheart','💗',2000);
}
function checkPings(){
  if(!sb||!S.me||!isUnlocked()||CFG.names.indexOf(S.me)<0||document.hidden)return;
  if(!S.pingSeen)S.pingSeen=Date.now()-60000;
  Promise.resolve(sb.from('pings').select('from_name,created_at').eq('kind','ping').neq('from_name',S.me).gt('created_at',S.pingSeen).order('created_at',{ascending:true})).then(function(res){
    if(!res||res.error||!res.data||!res.data.length)return;
    var last=res.data[res.data.length-1];
    S.pingSeen=last.created_at;
    pingArrived(last.from_name);
  }).catch(function(){});
}

/* ---------- data (Supabase) ---------- */
var sb=null;
function uid(){try{return crypto.randomUUID()}catch(e){return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}}
function guard(p,msg,table){
  var fail=function(){toast(msg||'Could not save. Check your connection and try again.');return null};
  return Promise.resolve(p).then(function(r){
    if(r&&r.error)return fail();
    if(table)load(table);
    return true;
  }).catch(fail);
}
var MAP={
  countdowns:function(r){return {id:r.id,title:r.title,emoji:r.emoji,datetime:r.datetime,date:r.date,time:r.time,tz:r.tz,addedBy:r.added_by,createdAt:r.created_at,ts:Date.parse(r.datetime)}},
  plans:function(r){return {id:r.id,title:r.title,emoji:r.emoji,done:r.done,doneBy:r.done_by,doneAt:r.done_at,addedBy:r.added_by,note:r.note,order:r.sort_order}},
  notes:function(r){return {id:r.id,text:r.body,from:r.from_name,createdAt:r.created_at,userId:r.user_id,deleted:!!r.deleted_at}},
  custom_questions:function(r){return {id:r.id,mode:r.mode,cat:r.cat,q:r.q,at:r.created_at||0}},
  game:function(r){return {id:r.id,board:r.board,turn:r.turn,winner:r.winner,starter:r.starter,vw:r.vincent_wins||0,jw:r.janice_wins||0,draws:r.draws||0,upd:r.updated_at||0}},
  checkins:function(r){return {id:r.id,who:r.who,day:r.day,mood:r.mood,note:r.mood_note,at:r.created_at}},
  /* an Open When envelope: label, type, colour and dates only. The letter text never comes with the list. */
  letters:function(r){return {id:r.id,mine:!!r.is_mine,from:r.is_mine?S.me:other(),type:r.type,label:r.label,colour:r.envelope_colour,
    unlock:r.unlock_at?Date.parse(r.unlock_at):null,openedAt:r.opened_at?Date.parse(r.opened_at):null,createdAt:Date.parse(r.created_at)}}
};
function loadLetters(){
  if(!sb||!S.sessionOn)return Promise.resolve();
  return Promise.resolve(sb.from('letters').select('*').order('created_at',{ascending:false})).then(function(res){
    if(res.error)throw res.error;
    S.letters=(res.data||[]).map(MAP.letters);S.lettersLoaded=true;
    if(S.tab==='letters')render();
  }).catch(function(){S.lettersLoaded=true});
}
function applyRows(table,rows){
  if(table==='countdowns')S.countdowns=rows.map(MAP.countdowns).filter(function(c){return !isNaN(c.ts)});
  if(table==='plans')S.plans=rows.map(MAP.plans).sort(function(a,b){return (a.order||0)-(b.order||0)});
  if(table==='checkins'){S.checkins=rows.map(MAP.checkins);S.ciLoaded=true}
  if(table==='custom_questions'){S.cq=rows.map(MAP.custom_questions);return}
  if(table==='game'){S.game=rows.length?MAP.game(rows[0]):null;return}
  if(table==='notes')S.notesLoaded=true;
  /* soft-deleted notes stay in the database but are hidden here */
  if(table==='notes')S.notes=rows.map(MAP.notes).filter(function(n){return !n.deleted}).sort(function(a,b){return b.createdAt-a.createdAt});
}
function load(table){
  return sb.from(table).select('*').then(function(res){
    if(res.error)throw res.error;
    applyRows(table,res.data||[]);
    S.dbState='ready';S.booted=true;render();
  }).catch(function(){
    if(S.dbState!=='ready')S.dbState='error';
    S.booted=true;render();
  });
}
var TABLES=['countdowns','plans','notes','checkins','game','custom_questions'];
var sessionTimers=[];
/* The two accounts use placeholder addresses; nothing is ever emailed. Janice only sees her name and a PIN. */
function emailFor(name){return name.toLowerCase()+'@example.com'}
function startSession(){
  if(S.sessionOn)return;
  S.sessionOn=true;S.dbState='loading';S.booted=false;
  var slow=setTimeout(function(){if(S.dbState==='loading'){S.dbState='slow';render()}},10000);
  Promise.all(TABLES.map(load)).then(function(){clearTimeout(slow)});
  loadLetters();
  TABLES.forEach(function(t){
    sb.channel('rt-'+t).on('postgres_changes',{event:'*',schema:'public',table:t},function(){load(t)}).subscribe();
  });
  sb.channel('rt-pings').on('postgres_changes',{event:'INSERT',schema:'public',table:'pings'},function(){checkPings()}).subscribe();
  sessionTimers.push(setInterval(function(){if(!document.hidden&&S.sessionOn){TABLES.forEach(load);loadLetters()}},30000));
  sessionTimers.push(setInterval(checkPings,10000));
}
function stopSession(){
  S.sessionOn=false;
  sessionTimers.forEach(clearInterval);sessionTimers=[];
  try{if(sb)sb.removeAllChannels()}catch(e){}
  S.uid=null;S.me=null;S.booted=false;S.dbState='loading';
  S.countdowns=[];S.plans=[];S.notes=[];S.letters=[];S.lettersLoaded=false;S.checkins=[];S.cq=[];S.game=null;S.notesLoaded=false;S.ciLoaded=false;
  S.pushOn=false;S.pushWho='';S.pingSeen=0;S.introDone=false;S.tab='home';S.editList=false;
}
/* Who is this account? Ask the profiles table (only the two allowed people have a row). */
function enterAs(user){
  return Promise.resolve(sb.from('profiles').select('display_name').eq('user_id',user.id).maybeSingle()).then(function(res){
    var name=res&&res.data&&res.data.display_name;
    if(!name||CFG.names.indexOf(name)<0){
      S.loginErr='This account is not allowed here.';S.signing=false;
      return Promise.resolve(sb.auth.signOut()).then(function(){stopSession();render()});
    }
    S.uid=user.id;S.me=name;S.pending='';S.entered='';S.loginErr='';S.signing=false;
    startSession();checkPushState();markRead(true);render();
  }).catch(function(){
    S.loginErr='We can’t reach the app right now. Check your connection and try again 🤍';S.signing=false;S.entered='';render();
  });
}
function signIn(name,pin){
  if(!sb||S.signing)return;
  S.signing=true;S.loginErr='';render();
  Promise.resolve(sb.auth.signInWithPassword({email:emailFor(name),password:pin})).then(function(res){
    if(res&&res.error){
      S.signing=false;S.entered='';
      S.loginErr=res.error.status===429?'That was a few tries. Take a little break and try again in a few minutes 🤍':'That PIN doesn’t match. Try again 🤍';
      render();var d=$('#dots');if(d){d.classList.add('shake');setTimeout(function(){d.classList.remove('shake')},400)}
      return;
    }
    return enterAs(res.data.user);
  }).catch(function(){S.signing=false;S.entered='';S.loginErr='We can’t reach the app right now. Check your connection and try again 🤍';render()});
}
function signOut(){
  var done=function(){stopSession();render();window.scrollTo(0,0)};
  Promise.resolve(pushOff()).then(function(){return sb.auth.signOut()}).then(done,done);
}
function connect(){
  var url=AC.supabaseUrl,key=AC.supabaseAnonKey;
  if(!window.supabase||!url||!key||/YOUR-/.test(key)){S.dbState='none';S.authChecked=true;render();return}
  sb=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  S.db=true;
  /* a session that ends elsewhere (expired, signed out) sends us back to the sign-in screen */
  sb.auth.onAuthStateChange(function(ev){
    if(ev==='SIGNED_OUT')setTimeout(function(){if(S.me||S.sessionOn){stopSession();render()}},0);
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&S.sessionOn){TABLES.forEach(load);loadLetters();checkPings();markRead()}});
  window.addEventListener('focus',function(){if(S.sessionOn)markRead()});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){if(e.data&&e.data.type==='vj-read'&&S.sessionOn)markRead(true)});
  Promise.resolve(sb.auth.getSession()).then(function(r){
    var s=r&&r.data&&r.data.session;
    if(s&&s.user)return enterAs(s.user);
  }).catch(function(){}).then(function(){S.authChecked=true;render()});
}

/* ---------- svg bits ---------- */
var CHECK='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';
var CAT='<svg class="cat" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Luna the cat" role="img"><path d="M8 17V6l8 5h8l8-5v11c0 9-5 15-12 15S8 26 8 17Z"/><circle cx="15" cy="19" r="1.2" fill="currentColor"/><circle cx="25" cy="19" r="1.2" fill="currentColor"/><path d="M18 24l2 1.5 2-1.5"/></svg>';
var FLOWER='<svg class="doodle" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><circle cx="50" cy="26" r="16"/><circle cx="74" cy="44" r="16"/><circle cx="65" cy="72" r="16"/><circle cx="35" cy="72" r="16"/><circle cx="26" cy="44" r="16"/><circle cx="50" cy="50" r="10" fill="var(--hero)"/></svg>';

/* ---------- views ---------- */
function dhmsTiles(target){
  return '<div class="tiles" data-target="'+target+'">'+
    ['d:days','h:hrs','m:mins','s:secs'].map(function(u){var k=u.split(':');return '<div class="tile"><b data-unit="'+k[0]+'">0</b><span>'+k[1]+'</span></div>'}).join('')+'</div>';
}
function heroCard(){
  var ph=phase();
  if(ph==='before'){
    return '<section class="hero" aria-label="Countdown to meeting">'+FLOWER+'<p class="label">3 Dec · 12:25 WIB · CGK</p><h2>Until Vincent meets Janice</h2>'+dhmsTiles(CFG.arrive)+'<p class="sub">Flight 8B 152 leaves Singapore at 11:40.</p></section>';
  }
  if(ph==='during'){
    var d=Math.min(CFG.tripDays,Math.floor((Date.now()-CFG.arrive)/86400000)+1);
    return '<section class="hero" aria-label="Together now">'+FLOWER+'<p class="label">Day '+d+' of '+CFG.tripDays+'</p><h2>Together now 🤍</h2><p class="label" style="margin-bottom:8px">Time left before he flies back</p>'+dhmsTiles(CFG.leave)+'<p class="sub">TR 309 departs CGK 22 Dec, 14:15.</p></section>';
  }
  var n=upcoming()[0];
  return '<section class="hero" aria-label="Until next time">'+FLOWER+'<h2>Until next time</h2>'+
    (n?'<p class="label">'+esc(n.emoji)+' '+esc(n.title)+'</p>'+dhmsTiles(n.ts):'<p class="sub">No countdown yet.</p><p style="margin-top:10px"><button class="btn" data-act="tab" data-v="countdowns">Add one</button></p>')+'</section>';
}
function dayCard(){
  var n=dayNumber();
  var big=n>=1?'<span class="daynum" id="daynum" data-n="'+n+'">'+n+'</span>':'<span class="daynum">'+Math.abs(n-1)+'</span>';
  var txt=n>=1?'<b>Day '+n+' of us</b><span class="muted">since “have we met before?”</span>':'<b>days until Day 1</b><span class="muted">16 Oct 2026</span>';
  return '<button class="card daycard" data-act="hearts" aria-label="Day counter, tap for hearts">'+big+'<span class="txt">'+txt+'</span></button>';
}
function bdayCards(){
  return '<div class="grid2">'+CFG.names.map(function(name){
    var b=nextBirthday(name);
    if(b.diff===0){
      return '<div class="bday today" data-bday="'+name+'"><p class="n hand">Happy Birthday '+name+'! 🎂</p></div>';
    }
    return '<div class="bday"><p class="label">'+name+'</p><p class="n">'+b.day+' '+MONTHS[b.month-1]+'</p><p class="big">'+b.diff+'</p><p class="muted" style="font-weight:700">'+(b.diff===1?'day':'days')+' to go</p></div>';
  }).join('')+'</div>';
}
function milestoneCard(){
  var m=nextMilestone();
  if(!m)return '';
  if(m.diff===0)return '<div class="banner">Happy '+esc(m.label)+' since “have we met before?” 🤍</div>';
  return '<div class="card"><p class="label">Next milestone</p><p style="font-size:20px;font-weight:800;margin-top:2px">'+esc(m.label)+' is in <span style="color:var(--red)">'+plural(m.diff,'day')+'</span></p></div>';
}
function clocksCard(){
  return '<div class="clocks">'+[['Singapore','Asia/Singapore','Vincent'],['Jakarta','Asia/Jakarta','Janice']].map(function(c){
    return '<div class="clock'+(S.me===c[2]?' me':'')+'"><span class="label">'+c[0]+(S.me===c[2]?' · you':'')+'</span><b data-clock="'+c[1]+'">'+clock(Date.now(),c[1])+'</b></div>';
  }).join('')+'</div>';
}
function latestNote(from){
  for(var i=0;i<S.notes.length;i++){if(S.notes[i].from===from)return S.notes[i]}
  return null;
}
function pad2(n){return (n<10?'0':'')+n}
function dayKey(ix){var d=new Date(ix*86400000);return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())}
function todayKeyFor(who){var t=ymd(Date.now(),CFG.tz[who]);return {key:t[0]+'-'+pad2(t[1])+'-'+pad2(t[2]),idx:dayIdx(t[0],t[1],t[2])}}
var MOODS=['😞','😕','😐','🙂','😊'];
function moodFace(n){var level=n>5?Math.ceil(n/2):n;return MOODS[Math.min(5,Math.max(1,level))-1]}
function checkinCard(){
  if(!S.ciLoaded)return '';
  var rows=CFG.names.map(function(who){
    var t=todayKeyFor(who);
    var c=S.checkins.filter(function(x){return x.who===who&&x.day===t.key&&(x.mood||x.note)})[0];
    if(!c)return '';
    return '<div class="ci-row"><div class="ci-top"><b>'+esc(who)+'</b><span style="font-size:26px">'+(c.mood?moodFace(c.mood):'💬')+'</span></div>'+(c.note?'<p class="ci-note">“'+esc(c.note)+'”</p>':'')+'</div>';
  }).filter(Boolean);
  if(!rows.length)return '';
  return '<div class="card"><div class="sec-title"><h2>Today</h2><span class="pill">shared if you feel like it</span></div><div class="stack">'+rows.join('')+'</div></div>';
}
function seenKey(){return 'vj_seen_'+S.me}
function closePop(){var el=$('#pop');if(el){el.innerHTML='';delete el.dataset.id}}
function showPop(id,html){var el=$('#pop');if(!el||el.dataset.id)return false;el.dataset.id=id;el.innerHTML='<div class="pop-back"><div class="pop" role="dialog">'+html+'</div></div>';return true}
function markCiDone(){store.set('vj_ciskip_'+S.me,todayKeyFor(S.me).key)}
function saveCheckin(mood,text){
  var t=todayKeyFor(S.me),id=S.me+'-'+t.key;
  closePop();
  guard(sb.from('checkins').upsert({id:id,who:S.me,user_id:S.uid,day:t.key,created_at:Date.now(),mood:mood,mood_note:text||null}),'Could not save that.','checkins').then(function(r){if(r===null)S.ciFailed=id});
}
var GREET_LINES={
  morning:['May your day bloom the way you bloom my heart 🌸','Hope today is gentle with you and full of little good things ☀️','Wake up slowly. The world is a bit brighter with you in it 🌼'],
  afternoon:['Hope your afternoon is as warm as you make me feel ☀️','Take a breath, drink some water, and know I am proud of you 💗','Sending a little sunshine for the rest of your day 🌼'],
  evening:['Hope your evening is soft and your heart feels held 🌷','You made it through the day. I am proud of you 💗','Wind down slowly tonight. I am right here 🌙'],
  night:['Sleep softly tonight. My heart is with you 🌙','Close your eyes, you did well today. Sweet dreams 💫','Goodnight, my favourite person. Dream of December ✈️']
};
function dayPart(who){
  var h=parseInt(clock(Date.now(),CFG.tz[who]).slice(0,2),10);
  if(h>=5&&h<12)return 'morning';
  if(h>=12&&h<17)return 'afternoon';
  if(h>=17&&h<21)return 'evening';
  return 'night';
}
function greetHtml(){
  var part=dayPart(S.me),lines=GREET_LINES[part],t=todayKeyFor(S.me);
  var line=lines[t.idx%lines.length];
  return '<h2>Good '+part+', '+esc(S.me)+' 🌸</h2><p style="font-weight:700;font-size:18px">'+esc(line)+'</p>'+
    '<div class="field" style="text-align:left"><label for="greet-note" class="muted">Leave '+esc(other())+' a little note 💌</label><textarea id="greet-note" maxlength="280" placeholder="A note for '+esc(other())+' (optional)"></textarea></div>'+
    '<div class="btns"><button class="btn" data-act="greet-send">Continue 💗</button><button class="btn ghost" data-act="greet-skip">Skip note</button></div>';
}
function moodHtml(){
  var btns=MOODS.map(function(f,i){return '<button type="button" data-act="mood-pick" data-v="'+(i+1)+'" aria-pressed="false" aria-label="Mood '+(i+1)+' of 5">'+f+'</button>'}).join('');
  return '<h2>How are you today? 🌸</h2><p class="muted" style="font-weight:700">Only if you feel like sharing</p><div class="mood" role="group" aria-label="Mood">'+btns+'</div>'+
    '<input id="mood-note" maxlength="120" placeholder="A few words, if you like (optional)" aria-label="Optional message">'+
    '<div class="btns"><button class="btn" data-act="mood-save">Share 💗</button><button class="btn ghost" data-act="mood-skip">Not today</button></div>';
}
function showMood(){closePop();S.mood=null;showPop('mood',moodHtml())}
function maybeCheckIn(){
  if(!sb||!S.ciLoaded||CFG.names.indexOf(S.me)<0)return;
  var t=todayKeyFor(S.me),id=S.me+'-'+t.key;
  if(S.ciFailed===id||S.ciAsked===id||store.get('vj_ciskip_'+S.me)===t.key||S.checkins.some(function(c){return c.id===id}))return;
  if(showPop('greet',greetHtml()))S.ciAsked=id;
}
function latestMoodOf(who){
  var best=null;
  S.checkins.forEach(function(c){if(c.who===who&&(c.mood||c.note)&&(!best||c.day>best.day))best=c});
  return best;
}
function checkOtherMood(){
  if(!S.ciLoaded||CFG.names.indexOf(S.me)<0)return;
  var c=latestMoodOf(other());
  if(!c||c.day!==todayKeyFor(other()).key||store.get('vj_seenci_'+S.me)===c.id)return;
  var shown=showPop('ci-'+c.id,'<h2>'+esc(c.who)+' shared today’s mood 💗</h2><div class="bigmood">'+(c.mood?moodFace(c.mood):'💬')+'</div>'+
    (c.note?'<div class="note"><p>'+esc(c.note)+'</p></div>':'')+
    '<div class="btns"><button class="btn" data-act="cio-ok" data-id="'+esc(c.id)+'">Got it 💗</button><button class="btn ghost" data-act="cio-note" data-id="'+esc(c.id)+'">Send a note</button></div>');
  if(shown)burst(['💗','🩷'],10);
}
function checkNewNote(){
  if(!S.notesLoaded||CFG.names.indexOf(S.me)<0)return;
  var n=latestNote(other());
  if(!n||n.createdAt<=(+store.get(seenKey())||0))return;
  var shown=showPop(n.id,'<h2>A note for you 💌</h2><p class="label">'+esc(n.from)+' · '+ago(n.createdAt)+'</p><div class="note"><p>'+esc(n.text)+'</p></div><div class="btns"><button class="btn" data-act="pop-ok" data-ts="'+n.createdAt+'">Got it 💗</button><button class="btn ghost" data-act="pop-reply" data-ts="'+n.createdAt+'">Reply</button></div>');
  if(shown)burst(['💌','💗','🩷'],14);
}
function noteActs(n){
  /* only the author sees edit/delete (the database enforces this too) */
  if(!n||!S.uid||n.userId!==S.uid)return '';
  return'<span class="acts"><button class="icon-btn" data-act="edit-note" data-id="'+esc(n.id)+'" aria-label="Edit note">✏️</button><button class="icon-btn" data-act="del" data-col="notes" data-id="'+esc(n.id)+'" aria-label="Delete note">🗑️</button></span>';
}
function noteBlock(from){
  var n=latestNote(from),mine=from===S.me;
  if(!n)return '<div class="note mine"><span class="label">'+(mine?'You':esc(from))+'</span><p class="muted">'+(mine?'Nothing yet. Leave '+esc(other())+' a note.':esc(from)+' has not left a note yet.')+'</p></div>';
  return '<div class="note'+(mine?' mine':'')+'"><div class="note-head"><span class="label">'+(mine?'You left a note':esc(from)+' left you a note')+' · '+ago(n.createdAt)+'</span>'+noteActs(n)+'</div><p>'+esc(n.text)+'</p></div>';
}
function notesCard(){
  var hist=S.notes.filter(function(n){return n!==latestNote(n.from)});
  var canWrite=!!S.db;
  return '<div class="card"><div class="sec-title"><h2>Notes</h2><div style="display:flex;gap:8px"><button class="btn ghost small" data-act="ping"'+(canWrite?'':' disabled')+'>Ping 💗</button><button class="btn small" data-act="note"'+(canWrite?'':' disabled')+'>Write a note</button></div></div><div class="stack">'+
    noteBlock(other())+noteBlock(S.me)+'</div>'+
    (hist.length?'<details style="margin-top:8px"><summary>Older notes ('+hist.length+')</summary><div class="stack">'+hist.map(function(n){
      return '<div class="note"><div class="note-head"><span class="label">'+esc(n.from)+' · '+ago(n.createdAt)+'</span>'+noteActs(n)+'</div><p>'+esc(n.text)+'</p></div>'}).join('')+'</div></details>':'')+'</div>';
}
function miniCountdowns(){
  var up=upcoming().slice(0,3);
  return '<div class="card"><div class="sec-title"><h2>Coming up</h2><button class="btn ghost small" data-act="tab" data-v="countdowns">All</button></div>'+
    (up.length?'<div class="stack">'+up.map(function(c){return cdRow(c,false)}).join('')+'</div>':'<p class="empty">Nothing counting down yet. Add something to look forward to.</p>')+'</div>';
}
function syncBanner(){
  if(S.dbState==='none')return '<div class="card flat"><b>Not syncing.</b> <span class="muted">The shared data is not connected yet. Check config.js.</span></div>';
  if(S.dbState==='slow')return '<div class="card flat muted">Still trying to reach the shared data. What you see may be out of date.</div>';
  if(S.dbState==='error')return '<div class="card flat muted">Could not load the shared data. Try refreshing.</div>';
  return '';
}
function homeView(){
  return syncBanner()+milestoneCard()+heroCard()+dayCard()+bdayCards()+clocksCard()+gameNudge()+checkinCard()+notesCard()+miniCountdowns();
}
function cdRow(c,controls){
  return '<div class="row"><span class="em">'+esc(c.emoji)+'</span><div class="mid"><b>'+esc(c.title)+'</b><small>added by '+esc(c.addedBy)+' · '+new Date(c.ts).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:c.tz==='JKT'?'Asia/Jakarta':'Asia/Singapore',hour:c.time?'2-digit':undefined,minute:c.time?'2-digit':undefined})+(c.time?' '+esc(c.tz):'')+'</small></div>'+
    '<span class="when" data-rel="'+c.ts+'">'+rel(c.ts)+'</span>'+
    (controls?'<span class="acts"><button class="icon-btn" data-act="edit-cd" data-id="'+esc(c.id)+'" aria-label="Edit '+esc(c.title)+'">✏️</button><button class="icon-btn" data-act="del" data-col="countdowns" data-id="'+esc(c.id)+'" aria-label="Delete '+esc(c.title)+'">🗑️</button></span>':'')+'</div>';
}
function countdownsView(){
  var up=upcoming(),past=pastCountdowns();
  return syncBanner()+'<div class="sec-title"><h2 class="hand" style="font-size:38px">Countdowns</h2><button class="btn" data-act="add-cd"'+(S.db?'':' disabled')+'>+ Add countdown</button></div>'+
    (up.length?'<div class="stack">'+up.map(function(c){return cdRow(c,true)}).join('')+'</div>':'<div class="card"><p class="empty">No countdowns yet. Add the next thing you are waiting for together.</p></div>')+
    (past.length?'<details class="card"><summary>It happened ✨ ('+past.length+')</summary><div class="stack" style="margin-top:8px">'+past.map(function(c){return cdRow(c,true)}).join('')+'</div></details>':'');
}
function planRow(p,i,n){
  var ctl=S.editList?'<span class="acts"><button class="icon-btn" data-act="up" data-id="'+esc(p.id)+'" aria-label="Move up"'+(i===0?' disabled':'')+'>↑</button><button class="icon-btn" data-act="down" data-id="'+esc(p.id)+'" aria-label="Move down"'+(i===n-1?' disabled':'')+'>↓</button><button class="icon-btn" data-act="edit-plan" data-id="'+esc(p.id)+'" aria-label="Edit">✏️</button><button class="icon-btn" data-act="del" data-col="plans" data-id="'+esc(p.id)+'" aria-label="Delete">🗑️</button></span>':'';
  var pop=!!(p.done&&S.tickFx&&S.tickFx.id===p.id&&Date.now()-S.tickFx.at<2000);
  return '<div class="row'+(p.done?' done':'')+'"><button class="check'+(pop?' pop':'')+'" role="checkbox" aria-checked="'+(!!p.done)+'" aria-label="'+esc(p.title)+'" data-act="tick" data-id="'+esc(p.id)+'">'+(p.done?CHECK:'')+'</button>'+
    '<span class="em">'+esc(p.emoji)+'</span><div class="mid"><b>'+esc(p.title)+'</b>'+
    (p.done?'<small>done by '+esc(p.doneBy)+' · '+shortDate(p.doneAt)+'</small>':(p.note?'<small>'+esc(p.note)+'</small>':''))+'</div>'+ctl+'</div>';
}
function listView(){
  var done=S.plans.filter(function(p){return p.done}).length,n=S.plans.length;
  return syncBanner()+'<div class="sec-title"><h2 class="hand" style="font-size:38px">Our list</h2><span class="pill">December</span></div>'+
    '<div class="card"><p style="font-weight:800;margin-bottom:6px">'+done+' of '+n+' done together</p><div class="bar"><i style="transform:scaleX('+(n?done/n:0)+')"></i></div></div>'+
    '<div class="stack">'+(n?S.plans.map(function(p,i){return planRow(p,i,n)}).join(''):'<div class="card"><p class="empty">The list is empty. Add the first thing you want to do in December.</p></div>')+'</div>'+
    '<div class="btns" style="justify-content:space-between"><button class="btn ghost small" data-act="toggle-edit">'+(S.editList?'Done editing':'Edit list')+'</button><button class="btn" data-act="add-plan"'+(S.db?'':' disabled')+'>+ Add</button></div>';
}
function pushSupport(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window}
function b64ToBytes(str){
  var pad='='.repeat((4-str.length%4)%4),b64=(str+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(b64),out=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function savePushSub(sub){
  var j=sub.toJSON();
  var row={endpoint:j.endpoint,who:S.me,user_id:S.uid,p256dh:j.keys.p256dh,auth:j.keys.auth,created_at:Date.now(),prefs:S.prefs};
  return sb.from('push_subs').upsert(row).then(function(res){
    if(res&&res.error){delete row.prefs;return sb.from('push_subs').upsert(row)}
    return res;
  });
}
/* third value 1 = on by default (you switch it off); otherwise off by default (you switch it on) */
var PREF_OPTS=[['notes','New notes',1],['pings','Pings and game invites',1],['turn','Connect Four turns',1],['list','List and countdown changes'],['questions','New game questions'],['reminders','Countdown reminders']];
PREF_OPTS.splice(3,0,['letters','Open When letters',1]);
function prefOn(o){var v=S.prefs[o[0]];return o[2]?v!==false:!!v}
/* ---------- one-time onboarding (each guide shows once, then never again) ---------- */
function isIos(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function maybeOnboard(){
  var pop=$('#pop');
  if(!S.me||!S.booted||(pop&&pop.dataset.id)||$('.sheet-back')||$('.intro'))return;
  if(!isInstalled()){
    /* iPhone in Safari: explain how to install, once */
    if(isIos()&&store.get('vj_onb_install')!=='1')
      showPop('onb-install','<h2>Add us to your Home Screen 🤍</h2><p style="font-weight:700;font-size:18px">Tap <b>Share</b>, then <b>Add to Home Screen</b>. After that, open the app from your Home Screen.</p><div class="btns"><button class="btn" data-act="onb-install-ok">Got it 💗</button></div>');
    return;
  }
  /* opened from the Home Screen: ask about notifications once, only if the phone has not been asked yet */
  if(!pushSupport()||!AC.vapidPublicKey||S.pushOn||Notification.permission!=='default')return;
  if(store.get('vj_onb_notif_'+S.me)==='1')return;
  showPop('onb-notif','<h2>Stay close 🤍</h2><p style="font-weight:700;font-size:18px">Turn on notifications so you know when '+esc(other())+' leaves you something 🤍</p><div class="btns"><button class="btn" data-act="onb-notif-on">Turn on notifications</button><button class="btn ghost" data-act="onb-notif-later">Not now</button></div>');
}
var lastRead=0;
/* You opened the app: clear the number on the icon and reset your unread count on the server. */
function markRead(force){
  try{if(navigator.clearAppBadge)Promise.resolve(navigator.clearAppBadge()).catch(function(){})}catch(e){}
  if(!sb||!S.uid)return;
  var now=Date.now();
  if(!force&&now-lastRead<3000)return;
  lastRead=now;
  Promise.resolve(sb.rpc('mark_read')).catch(function(){});
}
function enablePush(){
  if(!sb||!AC.vapidPublicKey||CFG.names.indexOf(S.me)<0){toast('Log in as Vincent or Janice first.');return}
  Notification.requestPermission().then(function(perm){
    if(perm!=='granted'){toast('Notifications stay off.');render();return}
    return navigator.serviceWorker.ready.then(function(reg){
      return reg.pushManager.getSubscription().then(function(sub){
        return sub||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(AC.vapidPublicKey)});
      });
    }).then(function(sub){return savePushSub(sub)}).then(function(res){
      if(res&&res.error)throw res.error;
      S.pushOn=true;S.pushWho=S.me;toast('Notifications on 💗');render();
    });
  }).catch(function(){toast('Could not turn on notifications.')});
}
function syncPush(){
  if(!sb||!S.pushOn||CFG.names.indexOf(S.me)<0||S.pushWho===S.me)return;
  S.pushWho=S.me;
  navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){
    if(sub)return savePushSub(sub);
  }).catch(function(){S.pushWho=''});
}
function pushOff(){
  if(!sb||!S.pushOn||!pushSupport())return Promise.resolve();
  S.pushWho='';
  return navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){
    if(sub)return sb.from('push_subs').delete().eq('endpoint',sub.endpoint);
  }).catch(function(){});
}
function checkPushState(){
  if(!pushSupport())return;
  navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){
    S.pushOn=!!sub&&Notification.permission==='granted';render();
  }).catch(function(){});
}
function notifBlock(){
  if(!AC.vapidPublicKey)return '<p class="muted" style="font-weight:700">Notifications are not set up yet.</p>';
  if(!pushSupport())return '<p class="muted" style="font-weight:700">On iPhone: add the app to your Home Screen first (Share, then Add to Home Screen), then open it from there.</p>';
  if(Notification.permission==='denied')return '<p class="muted" style="font-weight:700">Notifications are blocked. Turn them on in your phone Settings, Notifications, V&amp;J.</p>';
  if(S.pushOn)return '<p class="muted" style="font-weight:700">On ✓ Birthdays, milestones and trip days always come through. Choose the rest:</p>'+
    '<p class="label">Notify me about</p><div class="chips">'+PREF_OPTS.map(function(o){return '<button type="button" data-act="pref" data-v="'+o[0]+'" aria-pressed="'+prefOn(o)+'">'+o[1]+'</button>'}).join('')+'</div>'+
    '<div><button class="btn ghost small" data-act="push-test">Send a test</button></div>';
  return '<p class="muted" style="font-weight:700">Get a ping on this phone for notes, Ping 💗, game invites, birthdays and milestones. You can add more later.</p><div><button class="btn small" data-act="push-on">Turn on notifications</button></div>';
}
function isInstalled(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true}
function installBlock(){
  if(isInstalled())return '<p class="muted" style="font-weight:700">Installed ✓ You are using the app.</p>';
  if(installEvt)return '<p class="muted" style="font-weight:700">Add it to your home screen like a normal app.</p><div><button class="btn small" data-act="install">Install</button></div>';
  return '<p class="muted" style="font-weight:700">iPhone: tap Share, then Add to Home Screen. Android: tap ⋮, then Install app.</p>';
}
function settingsView(){
  return '<h2 class="hand" style="font-size:38px">Settings</h2>'+
    '<div class="card stack"><p>You are <b>'+esc(S.me)+'</b> · '+(S.me==='Vincent'?'Singapore':'Jakarta')+' time.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="logout">Log out</button></div></div>'+
    (isInstalled()&&S.pushOn?'':'<div class="card stack"><b>Number on the app icon</b><p class="muted" style="font-weight:700">1. Add the app to your Home Screen (iPhone: Share, then Add to Home Screen). 2. Open it from the new icon. 3. Turn on notifications below and tap Allow. Then unread notes, pings and game turns show as a number on the icon, and it clears when you open the app.</p></div>')+
    '<div class="card stack"><b>Notifications</b>'+notifBlock()+'</div>'+
    '<div class="card stack"><b>Install the app</b>'+installBlock()+'</div>'+
    '<div class="card stack"><b>Theme</b><div class="seg" role="group" aria-label="Theme">'+[['light','Pink'],['dark','Night'],['auto','Match phone']].map(function(t){return '<button data-act="theme" data-v="'+t[0]+'" aria-pressed="'+(curTheme()===t[0])+'">'+t[1]+'</button>'}).join('')+'</div></div>'+
    '<div class="card"><div class="seg"><button data-act="motion" aria-pressed="'+reduced()+'">Reduced motion: '+(reduced()?'on':'off')+'</button></div></div>'+
    '<p class="muted" style="font-size:13px;text-align:center">Signed in on this phone. Only the two of you can open this app.</p>';
}
/* ---------- Open When letters ---------- */
var LETTER_COLOURS=['pink','red','blue','white'];
var ENV_CLOSED='<svg viewBox="0 0 64 48" aria-hidden="true"><rect class="e-body" x="2" y="6" width="60" height="40" rx="6"/><path class="e-flap" d="M2 10 L32 31 L62 10 Z" stroke-linejoin="round"/></svg>';
var ENV_OPEN='<svg viewBox="0 0 64 52" aria-hidden="true"><path class="e-flap" d="M2 20 L32 2 L62 20 Z" stroke-linejoin="round"/><rect class="e-paper" x="10" y="10" width="44" height="26" rx="3"/><rect class="e-body" x="2" y="20" width="60" height="30" rx="6"/><path class="e-line" d="M2 24 L32 42 L62 24" fill="none" stroke-width="2.5" stroke-linejoin="round"/></svg>';
var MOMENT_LABELS=['Open when you miss me','Open when you can’t sleep','Open when you’re sad','Open when you need a laugh','Open when you’re stressed','Open when you feel lost','Open when you need a hug'];
var ltSugg=[];
function fmtDay(ms){return new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:myTz()})}
function fmtFull(ms){return new Date(ms).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:myTz()})}
function safeColour(c){return LETTER_COLOURS.indexOf(c)>=0?c:'pink'}
function envelopeCard(l){
  var locked=l.type==='date'&&!l.openedAt&&l.unlock>Date.now(),sub;
  if(l.mine)sub=l.openedAt?'opened':'not opened yet';
  else if(l.openedAt)sub='opened '+esc(fmtDay(l.openedAt));
  else if(locked)sub='🔒 Opens in <span data-rel="'+l.unlock+'">'+rel(l.unlock)+'</span>';
  else sub=l.type==='moment'?'Tap to open':'Ready to open 💌';
  var acts=(l.mine&&!l.openedAt)?'<span class="acts"><button class="icon-btn" data-act="letter-edit" data-id="'+esc(l.id)+'" aria-label="Edit letter">✏️</button><button class="icon-btn" data-act="del" data-col="letters" data-id="'+esc(l.id)+'" aria-label="Delete letter">🗑️</button></span>':'';
  return '<div class="env-wrap"><button class="env env-'+safeColour(l.colour)+(locked?' locked':'')+'" data-act="letter-tap" data-id="'+esc(l.id)+'" aria-label="'+esc(l.label)+'"><span class="env-art">'+(l.openedAt?ENV_OPEN:ENV_CLOSED)+'</span><b class="env-label">'+esc(l.label)+'</b><small class="env-sub">'+sub+'</small></button>'+acts+'</div>';
}
function lettersView(){
  var forMe=S.letters.filter(function(l){return !l.mine}),fromMe=S.letters.filter(function(l){return l.mine});
  var shelf=function(list,empty){return list.length?'<div class="shelf">'+list.map(envelopeCard).join('')+'</div>':'<p class="empty">'+(S.lettersLoaded?empty:'Opening…')+'</p>'};
  return syncBanner()+'<div class="sec-title"><h2 class="hand" style="font-size:38px">Open When 💌</h2><button class="btn" data-act="letter-new"'+(S.db?'':' disabled')+'>+ Write a letter</button></div>'+
    '<div class="card"><div class="sec-title"><h2>For you</h2></div>'+shelf(forMe,'Nothing here yet. When '+esc(other())+' writes you one, it waits here, sealed.')+'</div>'+
    '<div class="card"><div class="sec-title"><h2>From you</h2></div>'+shelf(fromMe,'Write '+esc(other())+' a letter for the day they need it 🤍')+'</div>';
}
function letterHtml(l,d,animate){
  var who=l.mine?'You wrote this for '+esc(other()):esc(l.from)+' wrote this for you';
  return '<div class="reveal env-'+safeColour(l.colour)+(animate?' anim':'')+'"><span class="rv-env">'+ENV_OPEN+'</span><div class="paper"><p class="label">'+who+'</p><h2>'+esc(d.label)+'</h2><div class="note"><p>'+esc(d.body)+'</p></div></div></div>'+
    '<div class="btns"><button class="btn" data-act="letter-close">Close 💗</button></div>';
}
function readLetter(l,fn,args){
  Promise.resolve(sb.rpc(fn,args)).then(function(r){
    closePop();
    if(r.error||!r.data){toast(fn==='open_letter'?'That one is not ready to open yet.':'Could not open that letter.');loadLetters();return}
    var first=!l.mine&&!l.openedAt;
    showPop('letter',letterHtml(l,r.data,first));
    if(first)burst(['💌','💗','🩷'],14);
    loadLetters();
  }).catch(function(){closePop();toast('Could not open that letter.')});
}
function letterSuggestions(type){
  if(type==='moment')return MOMENT_LABELS.map(function(t){return {label:t}});
  var a=ymd(CFG.arrive,'Asia/Jakarta'),nb=nextBirthday(other()),by=nb.diff===0?nb.year+1:nb.year;
  return [
    {label:'Open on 3 Dec (the day we meet)',date:a[0]+'-'+pad2(a[1])+'-'+pad2(a[2])},
    {label:'Open on your birthday',date:by+'-'+pad2(nb.month)+'-'+pad2(nb.day)},
    {label:'Open on our Day 100',date:dayKey(startIdx()+99)}
  ];
}
function renderLetterChips(w){
  ltSugg=letterSuggestions(w.dataset.type);
  $('#lt-chips',w).innerHTML=ltSugg.map(function(s,i){return '<button type="button" data-act="lt-suggest" data-i="'+i+'">'+esc(s.label)+'</button>'}).join('');
}
function letterSheet(ex){
  var edit=!!ex,type=edit?ex.type:'moment',colour=safeColour(edit?ex.colour:'pink'),dt='',tm='',tz=CFG.tz[other()];
  if(edit&&ex.unlock){var ms=Date.parse(ex.unlock),p=ymd(ms,tz);dt=p[0]+'-'+pad2(p[1])+'-'+pad2(p[2]);tm=clock(ms,tz)}
  var body=edit?ex.body:'';
  var w=openSheet('<h2>'+(edit?'Edit letter':'A letter for '+esc(other()))+'</h2>'+
    '<div class="seg" role="group" aria-label="Type"><button type="button" data-act="lt-type" data-v="moment" aria-pressed="'+(type==='moment')+'"'+(edit?' disabled':'')+'>Open when…</button><button type="button" data-act="lt-type" data-v="date" aria-pressed="'+(type==='date')+'"'+(edit?' disabled':'')+'>Open on a date</button></div>'+
    '<div class="field"><label for="f-label" class="muted">On the envelope (up to 60 characters)</label><input id="f-label" maxlength="60" value="'+esc(edit?ex.label:'')+'"></div>'+
    '<div class="chips" id="lt-chips"></div>'+
    '<div id="lt-when"'+(type==='date'?'':' hidden')+'><div class="two"><div class="field"><label for="f-date">Opens on</label><input id="f-date" type="date" value="'+esc(dt)+'"></div><div class="field"><label for="f-time">Time (optional)</label><input id="f-time" type="time" value="'+esc(tm)+'"></div></div><p class="muted" style="font-size:13px">In '+esc(other())+'’s time ('+(other()==='Janice'?'Jakarta':'Singapore')+'). It stays sealed until then.</p></div>'+
    '<div class="swatches" id="lt-colours" role="group" aria-label="Envelope colour">'+LETTER_COLOURS.map(function(c){return '<button type="button" class="sw sw-'+c+'" data-act="lt-colour" data-v="'+c+'" aria-pressed="'+(c===colour)+'" aria-label="'+c+' envelope"></button>'}).join('')+'</div>'+
    '<div class="field"><label for="f-body" class="muted">Your letter (up to 2000 characters)</label><textarea id="f-body" maxlength="2000" style="min-height:160px">'+esc(body)+'</textarea><span class="muted" id="cnt" style="text-align:right">'+body.length+' / 2000</span></div>'+
    '<div class="btns"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="lt-save" data-id="'+(edit?esc(ex.id):'')+'">'+(edit?'Save':'Seal it 💌')+'</button></div>');
  w.dataset.type=type;w.dataset.colour=colour;
  renderLetterChips(w);
  $('#f-body',w).addEventListener('input',function(e){$('#cnt',w).textContent=e.target.value.length+' / 2000'});
}
function appView(){
  var body={home:homeView,countdowns:countdownsView,list:listView,letters:lettersView,games:gamesView,settings:settingsView}[S.tab]();
  var tabs=[['home','🏠','Home'],['countdowns','⏳','Countdowns'],['list','📝','Our list'],['letters','💌','Open When'],['games','🎲','Games'],['settings','⚙️','Settings']];
  return (S.tab==='home'?'<header class="top"><h1>Vincent <span class="amp">&amp;</span> Janice</h1><div class="top-end">'+CAT+'<button class="btn ghost small" data-act="logout">Log out</button></div></header>':'')+body+
    '<nav class="tabs" aria-label="Sections"><div>'+tabs.map(function(t){
      return '<button data-act="tab" data-v="'+t[0]+'"'+(S.tab===t[0]?' aria-current="page"':'')+'><span aria-hidden="true">'+t[1]+'</span>'+t[2]+'</button>'}).join('')+'</div></nav>';
}
/* ---------- connect four ---------- */
var C4_ROWS=6,C4_COLS=7;
function c4Win(b){
  var dirs=[[1,0],[0,1],[1,1],[1,-1]];
  for(var r=0;r<C4_ROWS;r++)for(var c=0;c<C4_COLS;c++){
    var ch=b[r*C4_COLS+c];
    if(ch==='.')continue;
    for(var d=0;d<dirs.length;d++){
      var cells=[];
      for(var k=0;k<4;k++){
        var rr=r+dirs[d][1]*k,cc=c+dirs[d][0]*k;
        if(rr<0||rr>=C4_ROWS||cc<0||cc>=C4_COLS||b[rr*C4_COLS+cc]!==ch)break;
        cells.push(rr*C4_COLS+cc);
      }
      if(cells.length===4)return {piece:ch,cells:cells};
    }
  }
  return null;
}
function c4Piece(name){return name==='Vincent'?'V':'J'}
function c4Move(col){
  var g=S.game;
  if(!g||g.winner||g.turn!==S.me||!sb)return;
  var b=g.board.split(''),row=-1;
  for(var r=C4_ROWS-1;r>=0;r--){if(b[r*C4_COLS+col]==='.'){row=r;break}}
  if(row<0)return;
  b[row*C4_COLS+col]=c4Piece(S.me);
  var upd={board:b.join(''),turn:other(),last_by:S.me,updated_at:Date.now()};
  if(c4Win(b)){
    upd.winner=S.me;
    if(S.me==='Vincent')upd.vincent_wins=g.vw+1;else upd.janice_wins=g.jw+1;
  }else if(b.indexOf('.')<0){upd.winner='draw';upd.draws=g.draws+1}
  Promise.resolve(sb.from('game').update(upd).eq('id','c4').eq('board',g.board).select()).then(function(res){
    if(res.error)toast('Could not save your move.');
    else if(!res.data||!res.data.length)toast('The board changed. Try again.');
    load('game');
  }).catch(function(){toast('Could not save your move.');load('game')});
}
function c4NewGame(){
  var g=S.game;if(!g||!sb)return;
  var next=g.starter==='Vincent'?'Janice':'Vincent';
  guard(sb.from('game').update({board:new Array(C4_ROWS*C4_COLS+1).join('.'),turn:next,starter:next,winner:null,last_by:S.me,updated_at:Date.now()}).eq('id','c4'),null,'game');
}
function gameStatus(g){
  if(g.winner==='draw')return 'A draw. Rematch?';
  if(g.winner)return g.winner===S.me?'You won! 🎉':esc(g.winner)+' won this one';
  return g.turn===S.me?'Your move':'Waiting for '+esc(g.turn)+'…';
}
function c4View(){
  var g=S.game;
  if(!g)return syncBanner()+'<h2 class="hand" style="font-size:38px">Play</h2><div class="card"><p class="empty">The game is not set up yet. Run the game SQL in Supabase.</p></div>';
  var b=g.board.split(''),res=g.winner&&g.winner!=='draw'?c4Win(b):null,win=res?res.cells:[];
  var mine=!g.winner&&g.turn===S.me,cols='';
  var cur=g.board,drops=[],pulse=!!res&&Date.now()-g.upd<8000;
  if(S.c4Fx&&S.c4Fx.board===cur&&Date.now()-S.c4Fx.at<1200)drops=S.c4Fx.idx;
  else if(S.c4Seen&&S.c4Seen!==cur){
    for(var i=0;i<cur.length;i++){if(cur.charAt(i)!=='.'&&S.c4Seen.charAt(i)==='.')drops.push(i)}
    if(drops.length>2)drops=[];
    S.c4Fx={board:cur,idx:drops,at:Date.now()};
  }
  S.c4Seen=cur;
  for(var c=0;c<C4_COLS;c++){
    var cells='',full=b[c]!=='.';
    for(var r=0;r<C4_ROWS;r++){
      var ix=r*C4_COLS+c,ch=b[ix],isDrop=drops.indexOf(ix)>=0;
      cells+='<i class="disc'+(ch==='V'?' v':ch==='J'?' j':'')+(win.indexOf(ix)>=0?' win'+(pulse?' pulse':''):'')+(isDrop?' drop':'')+'"'+(isDrop?' style="--n:'+(r+1)+'"':'')+'></i>';
    }
    cols+='<button class="col" data-act="col" data-v="'+c+'" aria-label="Drop in column '+(c+1)+'"'+(mine&&!full?'':' disabled')+'>'+cells+'</button>';
  }
  return syncBanner()+'<div class="sec-title"><h2 class="hand" style="font-size:38px">Connect Four</h2><button class="btn ghost small" data-act="play-menu">Games</button></div>'+
    '<div class="score"><div class="box"><span class="label"><i class="key disc v"></i>Vincent</span><b>'+g.vw+'</b></div><div class="box"><span class="label">Draws</span><b>'+g.draws+'</b></div><div class="box"><span class="label"><i class="key disc j"></i>Janice</span><b>'+g.jw+'</b></div></div>'+
    '<p class="status" role="status">'+gameStatus(g)+'</p>'+
    '<div class="c4" role="group" aria-label="Connect Four board">'+cols+'</div>'+
    '<div class="btns" style="justify-content:center">'+
      (g.winner?'<button class="btn" data-act="game-new">New game</button>':'<button class="btn ghost small" data-act="game-new">Restart</button>')+'</div>'+
    '<p class="muted" style="text-align:center;font-size:13px">Four in a row wins. Take your turn any time, the board waits for you.</p>';
}
function gameNudge(){
  var g=S.game;
  if(!g||g.winner||g.turn!==S.me||CFG.names.indexOf(S.me)<0)return '';
  return '<div class="card"><div class="sec-title" style="margin:0"><h2>Your move 🎮</h2><button class="btn small" data-act="goc4">Play</button></div><p class="muted" style="font-weight:700">'+esc(other())+' is waiting in Connect Four.</p></div>';
}

function menuCard(act,v,emoji,title,desc,wide,badge){
  return '<button data-act="'+act+'" data-v="'+v+'"'+(wide?' class="wide"':'')+'><span class="e" aria-hidden="true">'+emoji+'</span><b>'+title+'</b><span class="d">'+desc+'</span>'+(badge?'<span class="pill">'+badge+'</span>':'')+'</button>';
}
function playMenu(){
  var g=S.game,yourMove=g&&!g.winner&&g.turn===S.me;
  var call=function(m,e,t,d){return menuCard('cg-open',m,e,t,d,false,CG&&CG.resume(m)?'Resume':'')};
  return syncBanner()+'<h2 class="hand" style="font-size:38px">Games</h2><div class="menu">'+
    menuCard('play-open','c4','🔴','Connect Four','Take turns any time. The board waits for you.',true,yourMove?'Your move':'')+
    (CG?call('guess','🔮','Guess Me','Guess what the other says about themselves.')+
      call('tt','⚖️','This or That','Pick secretly, reveal together.')+
      call('wyr','🤔','Would You Rather','Answer out loud and explain.')+
      call('deep','🌙','Deep Talk','Gentle questions for late nights.'):'')+
    '</div><p class="muted" style="text-align:center;font-size:13px">The call games are made for a video call. Enter the same room code on both phones.</p>';
}
function gamesView(){
  if(S.play==='c4')return c4View();
  if(S.play==='call'&&CG)return CG.view();
  return playMenu();
}
function gateView(){
  var dots='',off=S.signing?' disabled':'';
  for(var i=0;i<PIN_LEN;i++)dots+='<i class="'+(i<S.entered.length?'on':'')+'"></i>';
  var keys='123456789'.split('').concat(['','0','⌫']).map(function(k){
    return k===''?'<span></span>':'<button data-act="key" data-v="'+k+'" aria-label="'+(k==='⌫'?'Delete':k)+'"'+off+'>'+k+'</button>'}).join('');
  return '<div class="gate"><h1>Hi, '+esc(S.pending)+' 💗</h1><p class="muted" style="font-weight:700">'+(S.signing?'Opening…':'Your PIN, please')+'</p><div class="dots" id="dots" aria-hidden="true">'+dots+'</div>'+
    (S.loginErr?'<p class="muted who-note" role="alert">'+esc(S.loginErr)+'</p>':'')+
    '<div class="pad">'+keys+'</div><button class="btn ghost small" data-act="gate-back"'+off+'>Not you?</button></div>';
}
function whoView(){
  return '<div class="gate"><h1>Who are you?</h1>'+(S.loginErr?'<p class="muted who-note" role="alert">'+esc(S.loginErr)+'</p>':'')+
    '<div class="who"><button data-act="who" data-v="Vincent">Vincent</button><button data-act="who" data-v="Janice">Janice</button></div></div>';
}
function hereOverlay(){
  if(phase()!=='during'||store.get('vj_here')==='1'||!S.me)return '';
  return '<div class="here" role="dialog" aria-label="He is here"><h2>He’s here!!</h2><p style="font-size:20px;font-weight:800">Vincent landed in Jakarta 🤍</p><button class="btn" data-act="here">Together now</button></div>';
}

/* ---------- render ---------- */
function renderKey(){
  var now=Date.now(),unlockedNow=S.letters.filter(function(l){return l.type==='date'&&!l.openedAt&&l.unlock&&l.unlock<=now}).length;
  return [S.booted,isUnlocked(),S.me,phase(),dayNumber(),pastCountdowns().length,upcoming().length,unlockedNow].join('|');
}
function render(){
  var app=$('#app');
  var ae=document.activeElement,keepId=ae&&ae.id&&app.contains(ae)?ae.id:null,keepVal=keepId?ae.value:null;
  if(!S.authChecked){app.innerHTML='<div class="gate"><h1>Vincent &amp; Janice</h1><p class="muted">Opening…</p></div>';return}
  if(S.dbState==='none'&&!S.me){app.innerHTML='<div class="gate"><h1>Vincent &amp; Janice</h1><p class="muted">Can’t reach the shared data. Check your connection and refresh.</p></div>';return}
  if(!S.me){S.lastView='';app.classList.remove('enter');app.innerHTML=S.pending?gateView():whoView();return}
  if(!S.booted){app.innerHTML='<div class="gate"><h1>Hi, '+esc(S.me)+' 💗</h1><p class="muted">Opening…</p></div>';return}
  app.innerHTML=appView();
  if(!S.introDone){S.introDone=true;startIntro()}
  var viewKey=S.tab+'|'+S.play,nowMs=Date.now();
  if(S.lastView!==viewKey){S.lastView=viewKey;S.enterAt=Math.max(nowMs,S.introAt)}
  var sinceEnter=nowMs-S.enterAt;
  if(!motionOff()&&sinceEnter<1200){app.classList.add('enter');app.style.setProperty('--el',(sinceEnter/1000)+'s')}
  else app.classList.remove('enter');
  if(!(S.tab==='games'&&S.play==='c4'))S.c4Seen=null;
  $('#layer').innerHTML=hereOverlay();
  S.rendered=renderKey();
  tick();
  var n=$('#daynum');
  if(n&&!S.dayAnimated&&!reduced()){
    S.dayAnimated=true;var target=+n.dataset.n,t0=performance.now();
    (function step(t){var k=Math.min(1,(t-t0)/700);n.textContent=Math.round(target*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step)})(t0);
  }else S.dayAnimated=true;
  if(keepId){var el=document.getElementById(keepId);if(el){el.value=keepVal;el.focus()}}
  $$('[data-bday]').forEach(function(b){
    if(!S.confettiDone[b.dataset.bday]){S.confettiDone[b.dataset.bday]=1;confetti()}
  });
  if($('.banner')&&!S.confettiDone.ms){S.confettiDone.ms=1;confetti()}
  if($('.here')&&!S.confettiDone.here){S.confettiDone.here=1;confetti()}
  if(S.tab==='games'&&S.game&&S.game.winner===S.me&&S.gameFx!==S.game.upd){S.gameFx=S.game.upd;confetti()}
  maybeCheckIn();
  checkOtherMood();
  checkNewNote();
  maybeOnboard();
  syncPush();
}
function tick(){
  if(!S.booted||!isUnlocked()||!S.me)return;
  if(renderKey()!==S.rendered){render();return}
  maybeOnboard();
  var now=Date.now();
  $$('.tiles[data-target]').forEach(function(t){
    var p=parts(+t.dataset.target-now);
    ['d','h','m','s'].forEach(function(u){
      var el=t.querySelector('[data-unit="'+u+'"]'),v=String(p[u]),had=el.dataset.set;
      el.dataset.set='1';
      if(el.textContent===v)return;
      el.textContent=v;
      if(had&&u!=='s'&&!motionOff()){el.classList.remove('flip');void el.offsetWidth;el.classList.add('flip')}
    });
  });
  $$('[data-rel]').forEach(function(e){e.textContent=rel(+e.dataset.rel)});
  $$('[data-clock]').forEach(function(e){e.textContent=clock(now,e.dataset.clock)});
}

/* ---------- sheets ---------- */
function closeSheet(){var s=$('.sheet-back');if(s)s.remove()}
function openSheet(html){
  closeSheet();
  var w=document.createElement('div');w.className='sheet-back';
  w.innerHTML='<div class="sheet" role="dialog" aria-modal="true">'+html+'</div>';
  w.addEventListener('click',function(e){if(e.target===w)closeSheet()});
  document.body.appendChild(w);
  var f=$('input,textarea',w);if(f)f.focus();
  return w;
}
function emojiGrid(sel){
  return '<div class="emojis" id="emojis" role="group" aria-label="Emoji">'+EMOJIS.map(function(e){return '<button type="button" data-act="pick-emoji" data-v="'+e+'" aria-pressed="'+(e===sel)+'">'+e+'</button>'}).join('')+'</div>';
}
function cdSheet(c){
  var edit=!!c,tz=edit?c.tz:(S.me==='Janice'?'JKT':'SG');
  var w=openSheet('<h2>'+(edit?'Edit countdown':'New countdown')+'</h2>'+
    '<div class="field"><label for="f-title">What are you counting down to?</label><input id="f-title" maxlength="60" value="'+esc(edit?c.title:'')+'"></div>'+
    emojiGrid(edit?c.emoji:'🎉')+
    '<div class="two"><div class="field"><label for="f-date">Date</label><input id="f-date" type="date" value="'+esc(edit?c.date:'')+'"></div><div class="field"><label for="f-time">Time (optional)</label><input id="f-time" type="time" value="'+esc(edit?c.time:'')+'"></div></div>'+
    '<div class="seg" role="group" aria-label="Timezone"><button type="button" data-act="pick-tz" data-v="SG" aria-pressed="'+(tz==='SG')+'">Singapore</button><button type="button" data-act="pick-tz" data-v="JKT" aria-pressed="'+(tz==='JKT')+'">Jakarta</button></div>'+
    '<div class="btns"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="save-cd" data-id="'+(edit?esc(c.id):'')+'">Save</button></div>');
  w.dataset.emoji=edit?c.emoji:'🎉';w.dataset.tz=tz;
}
function planSheet(p){
  var edit=!!p;
  var w=openSheet('<h2>'+(edit?'Edit item':'New item')+'</h2>'+
    '<div class="field"><label for="f-title">What do you want to do?</label><input id="f-title" maxlength="80" value="'+esc(edit?p.title:'')+'"></div>'+emojiGrid(edit?p.emoji:'💖')+
    '<div class="field"><label for="f-note">Note (optional)</label><input id="f-note" maxlength="120" value="'+esc(edit&&p.note?p.note:'')+'"></div>'+
    '<div class="btns"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="save-plan" data-id="'+(edit?esc(p.id):'')+'">Save</button></div>');
  w.dataset.emoji=edit?p.emoji:'💖';
}
function noteSheet(n){
  var edit=!!n,txt=edit?n.text:'';
  var w=openSheet('<h2>'+(edit?'Edit note':'Note for '+esc(other()))+'</h2><div class="field"><label for="f-note" class="muted">Up to 280 characters</label><textarea id="f-note" maxlength="280">'+esc(txt)+'</textarea><span class="muted" id="cnt" style="text-align:right">'+txt.length+' / 280</span></div>'+
    '<div class="btns"><button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="save-note" data-id="'+(edit?esc(n.id):'')+'">'+(edit?'Save':'Send')+'</button></div>');
  $('#f-note',w).addEventListener('input',function(e){$('#cnt',w).textContent=e.target.value.length+' / 280'});
}

/* ---------- actions ---------- */
function savePlanOrder(a,b){
  if(!a||!b)return Promise.resolve();
  return guard(sb.from('plans').update({sort_order:b.order}).eq('id',a.id)).then(function(){return guard(sb.from('plans').update({sort_order:a.order}).eq('id',b.id),null,'plans')});
}
function getById(list,id){return list.filter(function(x){return x.id===id})[0]}
var confirmTimers={};
var actions={
  tab:function(el){S.tab=el.dataset.v;S.editList=false;render();window.scrollTo(0,0);if(S.tab==='letters')loadLetters()},
  hearts:function(el){var r=el.getBoundingClientRect();burst(['💖','🩷','❤️','💗'],10,r.left+60,r.top+30)},
  key:function(el){
    var k=el.dataset.v;
    if(!S.pending||S.signing)return;
    S.loginErr='';
    if(k==='⌫')S.entered=S.entered.slice(0,-1);else if(S.entered.length<PIN_LEN)S.entered+=k;
    if(S.entered.length>=PIN_LEN)signIn(S.pending,S.entered);   /* the server checks the PIN */
    else render();
  },
  'gate-back':function(){S.pending='';S.entered='';S.loginErr='';render()},
  who:function(el){S.pending=el.dataset.v;S.entered='';S.loginErr='';render()},
  theme:function(el){store.set('vj_theme',el.dataset.v);applyTheme();render()},
  ping:function(el){
    if(!sb)return;
    var now=Date.now(),r=el.getBoundingClientRect(),px=r.left+r.width/2,py=r.top;
    if(now-S.pingAt<8000){toast('One ping at a time 💗');return}
    S.pingAt=now;
    guard(sb.from('pings').insert({id:uid(),from_name:S.me,user_id:S.uid,kind:'ping',text:'',created_at:now}),'Could not send the ping.').then(function(ok){
      if(ok){toast('Ping sent 💗');floatHearts(px,py)}
    });
  },
  pref:function(el){
    var k=el.dataset.v,isCore=PREF_OPTS.some(function(o){return o[0]===k&&o[2]});
    S.prefs[k]=isCore?(S.prefs[k]===false):!S.prefs[k];
    store.set('vj_prefs',JSON.stringify(S.prefs));
    if(sb&&S.pushOn)navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){if(sub)return savePushSub(sub)}).catch(function(){});
    render();
  },
  'push-on':function(){enablePush()},
  'push-test':function(){
    navigator.serviceWorker.ready.then(function(reg){return reg.showNotification('Test ping 💗',{body:'Notifications are working.',icon:'icons/icon-192.png',badge:'icons/icon-192.png'})}).catch(function(){toast('Could not show a test.')});
  },
  install:function(){if(installEvt){installEvt.prompt();installEvt=null;render()}},
  'play-menu':function(){S.play='menu';render();window.scrollTo(0,0)},
  'play-open':function(el){S.play=el.dataset.v;render();window.scrollTo(0,0)},
  goc4:function(){S.tab='games';S.play='c4';S.editList=false;render();window.scrollTo(0,0)},
  col:function(el){c4Move(+el.dataset.v)},
  'game-new':function(el){
    if(S.game&&S.game.winner){c4NewGame();return}
    if(el.dataset.armed){c4NewGame();return}
    el.dataset.armed='1';el.textContent='Tap again to restart';setTimeout(render,3000);
  },
  'greet-send':function(){
    var i=$('#greet-note'),t=i?i.value.trim().slice(0,280):'';
    if(t&&sb)guard(sb.from('notes').insert({id:uid(),body:t,from_name:S.me,user_id:S.uid,created_at:Date.now()}),'Could not send your note.','notes');
    showMood();
  },
  'greet-skip':function(){showMood()},
  'mood-pick':function(el){S.mood=+el.dataset.v;$$('.mood button').forEach(function(b){b.setAttribute('aria-pressed',String(b===el))})},
  'mood-save':function(el){
    var i=$('#mood-note'),text=i?i.value.trim().slice(0,120):'',r=el.getBoundingClientRect();
    markCiDone();
    if(!S.mood&&!text){closePop();return}
    saveCheckin(S.mood||null,text);
    burst(['💗','🩷','💖'],14,r.left+r.width/2,r.top);
  },
  'mood-skip':function(){markCiDone();closePop()},
  'cio-ok':function(el){store.set('vj_seenci_'+S.me,el.dataset.id);closePop();render()},
  'cio-note':function(el){store.set('vj_seenci_'+S.me,el.dataset.id);closePop();noteSheet()},
  'onb-install-ok':function(){store.set('vj_onb_install','1');closePop()},
  'onb-notif-on':function(){store.set('vj_onb_notif_'+S.me,'1');closePop();enablePush()},
  'onb-notif-later':function(){store.set('vj_onb_notif_'+S.me,'1');closePop();toast('You can turn them on any time in Settings 💗')},
  'letter-new':function(){letterSheet(null)},
  'letter-edit':function(el){
    Promise.resolve(sb.rpc('read_own_letter',{p_id:el.dataset.id})).then(function(r){
      if(r.error||!r.data){toast('Could not open that letter.');return}
      letterSheet({id:el.dataset.id,label:r.data.label,body:r.data.body,type:r.data.type,unlock:r.data.unlock_at,colour:r.data.envelope_colour});
    }).catch(function(){toast('Could not open that letter.')});
  },
  'letter-tap':function(el){
    var l=getById(S.letters,el.dataset.id);if(!l||!sb)return;
    if(l.mine){readLetter(l,'read_own_letter',{p_id:l.id});return}
    if(l.openedAt){readLetter(l,'open_letter',{p_id:l.id,p_confirmed:true});return}
    if(l.type==='date'&&l.unlock>Date.now()){
      showPop('letter-lock','<h2>Not yet 🤍</h2><p style="font-weight:700;font-size:18px">This one opens on '+esc(fmtFull(l.unlock))+'.</p><div class="btns"><button class="btn" data-act="letter-close">Okay</button></div>');return;
    }
    if(l.type==='moment'){
      showPop('letter-confirm','<h2>Are you sure?</h2><p style="font-weight:700;font-size:18px">Only open it when you really need it 🤍</p><div class="btns"><button class="btn" data-act="letter-open" data-id="'+esc(l.id)+'">Open it</button><button class="btn ghost" data-act="letter-close">Not yet</button></div>');return;
    }
    readLetter(l,'open_letter',{p_id:l.id,p_confirmed:false});
  },
  'letter-open':function(el){var l=getById(S.letters,el.dataset.id);if(l)readLetter(l,'open_letter',{p_id:l.id,p_confirmed:true})},
  'letter-close':function(){closePop();loadLetters()},
  'lt-type':function(el){
    var w=$('.sheet-back');if(!w)return;
    w.dataset.type=el.dataset.v;
    $$('[data-act="lt-type"]',w).forEach(function(b){b.setAttribute('aria-pressed',String(b===el))});
    $('#lt-when',w).hidden=el.dataset.v!=='date';
    renderLetterChips(w);
  },
  'lt-colour':function(el){
    var w=$('.sheet-back');if(!w)return;
    w.dataset.colour=el.dataset.v;
    $$('[data-act="lt-colour"]',w).forEach(function(b){b.setAttribute('aria-pressed',String(b===el))});
  },
  'lt-suggest':function(el){
    var s=ltSugg[+el.dataset.i],w=$('.sheet-back');if(!s||!w)return;
    $('#f-label',w).value=s.label;
    if(s.date)$('#f-date',w).value=s.date;
  },
  'lt-save':function(el){
    var w=$('.sheet-back'),label=$('#f-label').value.trim(),text=$('#f-body').value.trim(),type=w.dataset.type,colour=safeColour(w.dataset.colour),unlock=null;
    if(!label){toast('Give the envelope a label.');return}
    if(!text){toast('Write your letter first.');return}
    if(type==='date'){
      var d=$('#f-date').value,t=$('#f-time').value||'00:00',off=other()==='Janice'?CFG.tzOff.JKT:CFG.tzOff.SG;
      if(!d){toast('Pick the day it opens.');return}
      unlock=d+'T'+t+':00'+off;
      if(isNaN(Date.parse(unlock))||Date.parse(unlock)<=Date.now()){toast('Pick a day in the future.');return}
    }
    var id=el.dataset.id;
    var q=id?sb.rpc('update_letter',{p_id:id,p_label:label,p_body:text,p_colour:colour,p_unlock_at:unlock}):sb.rpc('create_letter',{p_label:label,p_body:text,p_type:type,p_unlock_at:unlock,p_colour:colour});
    guard(q,'Could not save the letter.').then(function(ok){if(ok){closeSheet();toast(id?'Letter updated':'Letter sealed 💌');loadLetters()}});
  },
  'pop-ok':function(el){store.set(seenKey(),el.dataset.ts);closePop()},
  'pop-reply':function(el){store.set(seenKey(),el.dataset.ts);closePop();noteSheet()},
  logout:function(){closePop();S.pending='';S.entered='';signOut()},
  motion:function(){
    if(reduced()){delete document.documentElement.dataset.motion;store.set('vj_motion','')}
    else{document.documentElement.dataset.motion='reduced';store.set('vj_motion','reduced')}
    render();
  },
  here:function(){store.set('vj_here','1');$('#layer').innerHTML=''},
  close:closeSheet,
  'pick-emoji':function(el){
    var w=$('.sheet-back');w.dataset.emoji=el.dataset.v;
    $$('#emojis button').forEach(function(b){b.setAttribute('aria-pressed',String(b===el))});
  },
  'pick-tz':function(el){
    var w=$('.sheet-back');w.dataset.tz=el.dataset.v;
    $$('[data-act="pick-tz"]').forEach(function(b){b.setAttribute('aria-pressed',String(b===el))});
  },
  'add-cd':function(){cdSheet(null)},
  'edit-cd':function(el){cdSheet(getById(S.countdowns,el.dataset.id))},
  'save-cd':function(el){
    var w=$('.sheet-back'),title=$('#f-title').value.trim(),date=$('#f-date').value,time=$('#f-time').value;
    if(!title||!date){toast('Add a title and a date.');return}
    var tz=w.dataset.tz,iso=date+'T'+(time||'00:00')+':00'+CFG.tzOff[tz];
    if(isNaN(Date.parse(iso))){toast('That date does not look right.');return}
    var id=el.dataset.id,old=id?getById(S.countdowns,id):null;
    guard(sb.from('countdowns').upsert({id:id||uid(),title:title,emoji:w.dataset.emoji,datetime:iso,date:date,time:time,tz:tz,added_by:old?old.addedBy:S.me,created_at:old?old.createdAt:Date.now()}),null,'countdowns').then(function(r){if(r!==null)closeSheet()});
  },
  'add-plan':function(){planSheet(null)},
  'edit-plan':function(el){planSheet(getById(S.plans,el.dataset.id))},
  'save-plan':function(el){
    var w=$('.sheet-back'),title=$('#f-title').value.trim(),note=$('#f-note').value.trim();
    if(!title){toast('Give it a title.');return}
    var id=el.dataset.id,old=id?getById(S.plans,id):null;
    var maxOrder=S.plans.reduce(function(m,p){return Math.max(m,p.order||0)},0);
    var body=old?old:{done:false,doneBy:null,doneAt:null,addedBy:S.me,order:maxOrder+1};
    guard(sb.from('plans').upsert({id:id||uid(),title:title,emoji:w.dataset.emoji,note:note,done:!!body.done,done_by:body.doneBy,done_at:body.doneAt,added_by:body.addedBy,sort_order:body.order}),null,'plans').then(function(r){if(r!==null)closeSheet()});
  },
  tick:function(el){
    var p=getById(S.plans,el.dataset.id);if(!p||!S.db)return;
    var done=!p.done,r=el.getBoundingClientRect();
    guard(sb.from('plans').update({done:done,done_by:done?S.me:null,done_at:done?Date.now():null}).eq('id',p.id),null,'plans').then(function(ok){
      if(done&&ok){S.tickFx={id:p.id,at:Date.now()};burst(['💖','✨'],8,r.left+17,r.top)}
    });
  },
  'toggle-edit':function(){S.editList=!S.editList;render()},
  up:function(el){var i=S.plans.findIndex(function(p){return p.id===el.dataset.id});if(i>0)savePlanOrder(S.plans[i],S.plans[i-1])},
  down:function(el){var i=S.plans.findIndex(function(p){return p.id===el.dataset.id});if(i>=0&&i<S.plans.length-1)savePlanOrder(S.plans[i],S.plans[i+1])},
  del:function(el){
    var key=el.dataset.col+el.dataset.id;
    if(!el.classList.contains('warn')){
      el.classList.add('warn');el.textContent='Delete?';
      clearTimeout(confirmTimers[key]);confirmTimers[key]=setTimeout(function(){render()},3000);
      return;
    }
    clearTimeout(confirmTimers[key]);
    /* notes are never really deleted: they are hidden, so nothing is lost by accident */
    if(el.dataset.col==='letters'){
      /* soft delete: the letter is hidden, never removed */
      guard(sb.rpc('delete_letter',{p_id:el.dataset.id}),'Could not delete the letter.').then(function(ok){if(ok)loadLetters()});
      return;
    }
    if(el.dataset.col==='notes'){
      guard(sb.from('notes').update({deleted_at:Date.now()}).eq('id',el.dataset.id).eq('user_id',S.uid),'Could not delete the note.','notes');
      return;
    }
    guard(sb.from(el.dataset.col).delete().eq('id',el.dataset.id),null,el.dataset.col);
  },
  note:function(){noteSheet()},
  'edit-note':function(el){noteSheet(getById(S.notes,el.dataset.id))},
  'save-note':function(el){
    var t=$('#f-note').value.trim();
    if(!t){toast('Write something first.');return}
    var nid=el.dataset.id;
    var q=nid?sb.from('notes').update({body:t.slice(0,280)}).eq('id',nid).eq('user_id',S.uid):sb.from('notes').insert({id:uid(),body:t.slice(0,280),from_name:S.me,user_id:S.uid,created_at:Date.now()});
    guard(q,null,'notes').then(function(r){if(r){closeSheet();toast(nid?'Note updated':'Note sent 💌')}});
  }
};
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');
  if(!el||el.disabled)return;
  var fn=actions[el.dataset.act];
  if(fn)fn(el);
  else if(CG&&el.dataset.act.indexOf('cg-')===0)CG.act(el.dataset.act,el);
});
document.addEventListener('input',function(e){
  var t=e.target;
  if(CG&&t&&t.id&&t.id.indexOf('cg-')===0)CG.input(t);
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});

/* ---------- boot ---------- */
var installEvt=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installEvt=e;if(S.tab==='settings'&&S.me)render()});
window.addEventListener('appinstalled',function(){installEvt=null;render()});
if('serviceWorker' in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
var CG=window.VJ_GAMES?window.VJ_GAMES.create({S:S,esc:esc,store:store,toast:toast,burst:burst,uid:uid,render:function(){render()},invite:function(text){return sb?guard(sb.from('pings').insert({id:uid(),from_name:S.me,user_id:S.uid,kind:'invite',text:text,created_at:Date.now()}),'Could not send the invite.'):Promise.resolve(null)},custom:function(){return S.cq},addQ:function(row){return sb?guard(sb.from('custom_questions').insert(row),'Could not save the question.','custom_questions'):Promise.resolve(null)},delQ:function(id){if(sb)guard(sb.from('custom_questions').delete().eq('id',id),null,'custom_questions')}}):null;
render();
setInterval(tick,1000);
connect();
checkPushState();
})();
