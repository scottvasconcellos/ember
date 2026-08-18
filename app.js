/* Ember — the whole app. No framework, no build step, on purpose.
 *
 * Data model, one shape everywhere:  (appId, key) -> JSON + updated_at
 *   profile              the user's rhythm, watches, avoid-list
 *   checkin:YYYY-MM-DD   { watches:{id:bool}, weight, note, ts }
 *   progress             { started, daysShown, returns, lastDay, lessonsRead[] }
 *   lesson:NN            course text — lives in the backend, never in the public repo
 */
'use strict';

const CFG = window.EMBER_CONFIG;
const CONFIGURED = !String(CFG.endpoint).startsWith('PASTE_') &&
                   !String(CFG.clientId).startsWith('PASTE_');

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const today = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local
const daysBetween = (a,b) => Math.round((new Date(b) - new Date(a)) / 864e5);

/* ── storage ─────────────────────────────────────────────────────────────── */
const local = {
  get(k, d=null){ try { return JSON.parse(localStorage.getItem('ember:'+k)) ?? d; }
                  catch { return d; } },
  set(k, v){ localStorage.setItem('ember:'+k, JSON.stringify(v)); },
};

let idToken = local.get('idToken');
let account = local.get('account');

async function remote(method, key, value){
  if (!CONFIGURED || !idToken) return null;
  try {
    if (method === 'GET') {
      const u = `${CFG.endpoint}?app=${CFG.appId}&key=${encodeURIComponent(key)}&id_token=${idToken}`;
      const r = await fetch(u);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return j.value ?? null;
    }
    // text/plain keeps this a "simple request" so Apps Script never sees a preflight.
    const r = await fetch(CFG.endpoint, {
      method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({app:CFG.appId, key, value, id_token:idToken, updated_at:new Date().toISOString()}),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  } catch (e) {
    console.warn('[ember] sync failed:', key, e.message);
    setSync('offline — saved on this device');
    return null;
  }
}

async function load(key, fallback=null){
  const r = await remote('GET', key);
  if (r !== null) { local.set(key, r); return r; }
  return local.get(key, fallback);
}
async function save(key, value){
  local.set(key, value);
  const r = await remote('POST', key, value);
  if (r) setSync('synced');
  return value;
}
const setSync = m => { $('#syncStatus').textContent = m; };

/* The deck player is a separate script; give it the storage layer. */
window.emberLoad = load; window.emberSave = save; window.emberLocal = local;

/* ── profile ─────────────────────────────────────────────────────────────── */
const DEFAULT_PROFILE = {
  name:'', window:{eat_until:'16:00'}, bedtime:'22:00',
  watches:[
    {id:'window', label:'Window', prompt:'Did I close on time?'},
    {id:'enough', label:'Enough', prompt:"Did I stop when I'd had enough?"},
    {id:'quality',label:'Whole',  prompt:'Was it real food?'},
  ],
  avoid:['calorie counting','portion measuring','macro tracking'],
  liturgical:'aware', screen:{last_taken:null, result:null},
};
let profile = local.get('profile', DEFAULT_PROFILE);

/* The three-watch rule is structural. Guard it in code, not in a comment. */
function assertThreeWatches(p){
  if (!Array.isArray(p.watches) || p.watches.length !== 3)
    throw new Error(`Ember invariant: exactly 3 watches required, got ${p.watches?.length}`);
  return p;
}

/* ── progress and the return counter ─────────────────────────────────────── */
let progress = local.get('progress', {started:today(), daysShown:0, returns:0,
                                      lastDate:null, lessonsRead:[]});

function currentDay(){
  const n = daysBetween(progress.started, today()) + 1;
  return Math.max(1, Math.min(CFG.days, n));
}

/* A save on a new date always increments daysShown. If the previous save was 2+ days
   ago, it also counts as a return — the event this app is built to celebrate. */
function recordShowUp(){
  const d = today();
  if (progress.lastDate === d) return {isReturn:false, gap:0};
  const gap = progress.lastDate ? daysBetween(progress.lastDate, d) : 0;
  const isReturn = gap >= 2;
  progress.daysShown += 1;
  if (isReturn) progress.returns += 1;
  progress.lastDate = d;
  return {isReturn, gap};
}

/* ── the check-in ────────────────────────────────────────────────────────── */
function renderWatches(){
  assertThreeWatches(profile);
  const w0 = local.get('checkin:'+today(), {}).weight;
  $('#weight').value = (w0 != null) ? w0 : '';
  const saved = local.get('checkin:'+today(), null);
  $('#watches').innerHTML = profile.watches.map(w => `
    <button class="watch" data-watch="${w.id}" aria-pressed="false">
      <span class="dot">✓</span>
      <span><span class="label">${w.label}</span><br><span class="prompt">${w.prompt}</span></span>
    </button>`).join('');

  $$('.watch').forEach(b => {
    if (saved && saved.watches && b.dataset.watch in saved.watches){
      b.setAttribute('aria-pressed', String(!!saved.watches[b.dataset.watch]));
      b.classList.add('touched');
    }
    b.onclick = () => {
      b.classList.add('touched');
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    };
  });
  if (saved){
    $('#note').value = saved.note ?? local.get('devicenote:'+today(), '') ?? '';
    $('#noteDeviceOnly').checked = saved.visibility === 'deviceOnly';
    $('#saveStatus').textContent = 'Saved today. Tap again to change anything.';
  }
}

async function saveCheckin(){
  const watches = {};
  $$('.watch').forEach(b => { watches[b.dataset.watch] = b.getAttribute('aria-pressed') === 'true'; });

  const deviceOnly = $('#noteDeviceOnly').checked;
  const noteText   = $('#note').value.trim();
  const prior = local.get('checkin:'+today(), {});
  const entry = {
    watches,
    weight: prior.weight ?? null,
    note: deviceOnly ? null : (noteText || null),
    visibility: deviceOnly ? 'deviceOnly' : 'private',
    ts: new Date().toISOString(),
  };
  if (deviceOnly && noteText) local.set('devicenote:'+today(), noteText);

  const {isReturn, gap} = recordShowUp();
  await save('checkin:'+today(), entry);
  await save('progress', progress);

  $('#saveStatus').textContent = 'Saved. That is the whole thing.';
  renderProgress(); renderDayDots();
  if (isReturn) showWelcomeBack(gap);
}

async function saveWeightOnly(){
  const w = $('#weight').value;
  const entry = local.get('checkin:'+today(), {watches:{}, note:null});
  entry.weight = w ? Number(w) : null;
  entry.ts = new Date().toISOString();
  await save('checkin:'+today(), entry);
  $('#btnSaveWeight').textContent = 'Logged';
  setTimeout(() => { $('#btnSaveWeight').textContent = 'Log it'; }, 1500);
}

function renderDayDots(){
  const days = [];
  for (let i = 13; i >= 0; i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString('en-CA');
    days.push({iso, entry: local.get('checkin:'+iso, null)});
  }
  const any = days.some(d => d.entry);
  $('#dayDots').innerHTML = any ? days.map(d => {
    const w = (d.entry && d.entry.watches) || {};
    const label = new Date(d.iso+'T00:00').toLocaleDateString(undefined,{weekday:'short'});
    const dots = profile.watches.map(w0 =>
      `<i class="${w[w0.id] ? 'lit':''}"></i>`).join('');
    return `<div class="dayRow"><span class="dayLabel">${label}</span>
      <span class="dayDots3">${dots}</span></div>`;
  }).join('') : '<p class="dayEmpty">Your first evening will show up here.</p>';
}

function renderProgress(){
  $('#daysShown').textContent = progress.daysShown;
  $('#returnsCount').textContent = progress.returns;
}

function showWelcomeBack(gap){
  $('#welcomeBack').hidden = false;
  $('#welcomeBackText').innerHTML =
    `<p style="margin:0 0 8px">It has been ${gap} days. You came back — that is the part that
     actually matters, and it is the part most people skip.</p>
     <p class="note" style="margin:0">Nothing reset. Nothing was lost. Pick up here.</p>`;
}

/* ── lessons ─────────────────────────────────────────────────────────────── */
function mdToHtml(md){
  const body = md.replace(/^---[\s\S]*?---\s*/, '');            // drop front matter
  return body.split(/\n{2,}/).map(block => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('>'))
      return `<blockquote>${esc(b.replace(/^>\s?/gm,''))}</blockquote>`;
    if (b.startsWith('**Today:**'))
      return `<div class="today">${inline(b)}</div>`;
    if (/^\*[^*]/.test(b) && b.endsWith('*'))
      return `<p class="cite">${esc(b.slice(1,-1))}</p>`;
    return `<p>${inline(b)}</p>`;
  }).join('');
}
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>');

async function renderLesson(){
  const day = currentDay();
  $('#sub').textContent =
    new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  $('#progressLabel').textContent = `Day ${day} / ${CFG.days}`;
  $('#progressFill').style.width = `${Math.round(day/CFG.days*100)}%`;

  const deck = await load('deck:'+String(day).padStart(2,'0'));
  const done = local.get('lessonsDone', []).includes(day);

  if (!deck){
    const signedIn = !!account;
    $('#lessonArc').textContent = 'Almost there';
    if (!CONFIGURED){
      $('#lessonTitle').textContent = 'One step left';
      $('#lessonBody').innerHTML =
        `<p class="note">Your sixty lessons are already published to your private backend.
          This page just cannot sign in yet, so it cannot fetch them.</p>
         <p class="note">Create a Google OAuth <b>Web application</b> client ID and paste it
          into <code>app/config.js</code>. Authorized origin:
          <code>https://scottvasconcellos.github.io</code></p>
         <p class="note">Everything below works right now, offline.</p>`;
    } else if (!signedIn){
      $('#lessonTitle').textContent = 'Sign in to load your course';
      $('#lessonBody').innerHTML =
        `<p class="note">Your lessons are waiting in your own private backend. Sign in on the
          <b>You</b> tab and they will appear here.</p>
         <p class="note">The check-in and Right now work without signing in.</p>`;
    } else {
      $('#lessonTitle').textContent = 'Today has no lesson yet';
      $('#lessonBody').innerHTML =
        `<p class="note">Signed in as ${esc(account.email)}, but day ${day} has not been
          written yet. The library shows what is ready.</p>`;
    }
    $('#btnStart').hidden = true; $('#btnLater').hidden = true;
    return;
  }

  $('#lessonArc').textContent   = done ? 'Finished today' : deck.arc;
  $('#lessonTitle').textContent = deck.title;
  $('#lessonBody').innerHTML =
    `<p class="note" style="margin:0 0 4px">${deck.cards.length} short pages · about two minutes</p>
     <p class="note" style="margin:0">${esc(deck.source||'')}</p>`;
  $('#btnStart').hidden = false; $('#btnLater').hidden = false;
  $('#btnStart').textContent = done ? 'Read again' : 'Start';
}

/* ── rescue deck (bundled: original writing, no book text) ───────────────── */
let deck = [];
async function initRescue(){
  try { deck = await (await fetch('rescue.json')).json(); } catch { deck = []; }
  $('#rescueList').innerHTML = deck.map((c,i) =>
    `<button data-card="${i}">${esc(c.thought)}</button>`).join('');
  $$('#rescueList button').forEach(b => b.onclick = () => showCard(deck[+b.dataset.card]));
}
function showCard(c){
  $('#rescuePicker').hidden = true;
  $('#rescueCard').hidden = false;
  $('#rescueBody').innerHTML = `
    <p style="font-size:15px;color:var(--muted);margin:0 0 4px">You're thinking:</p>
    <p style="margin:0 0 16px"><b>${esc(c.thought)}</b></p>
    <p>${esc(c.body)}</p>
    <div class="move"><b>The move:</b> ${esc(c.move)}</div>
    <div class="line">${esc(c.line)}</div>`;
  $('#landingReply').hidden = true;
  $$('#landing .opt').forEach(b => b.classList.remove('picked'));
  const rn = $('#v-rescue');
  (rn.classList.contains('on') ? rn : window).scrollTo({top:0,behavior:'smooth'});
}

/* Not scored, nothing sent anywhere. Just a soft close on the moment. */
const LANDING_REPLY = {
  notquite: "Okay. That one didn't fit — pick another, or just sit with it a minute.",
  try:      "That's the whole ask. Not a promise, just a try.",
};
$$('#landing .opt').forEach(b => b.onclick = () => {
  $$('#landing .opt').forEach(x => x.classList.remove('picked'));
  b.classList.add('picked');
  const r = $('#landingReply');
  r.hidden = false; r.textContent = LANDING_REPLY[b.dataset.land];
});
$('#btnRescueBack').onclick = () => { $('#rescueCard').hidden = true; $('#rescuePicker').hidden = false; };

/* ── library ─────────────────────────────────────────────────────────────── */
async function renderCourse(){
  const syl  = await load('syllabus');
  const done = local.get('lessonsDone', []);
  const day  = currentDay();
  if (!syl){
    // No syllabus yet — list whatever decks this device has actually cached.
    const cached = Object.keys(localStorage)
      .filter(k => k.startsWith('ember:deck:'))
      .map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })
      .filter(Boolean).sort((a,b) => a.day - b.day);
    $('#courseList').innerHTML = cached.length
      ? cached.map(d => `<button class="libitem${d.day===day?' today':''}" data-day="${d.day}">
           <span class="n">${d.day}</span><span>${esc(d.title)}</span>
           ${done.includes(d.day)?'<span class="tick">✓</span>':''}</button>`).join('')
      : '<p class="note">Your lessons appear here once the backend is connected.</p>';
    $$('#courseList .libitem').forEach(b => b.onclick = () => Deck.open(+b.dataset.day));
    return;
  }

  $('#courseList').innerHTML = (syl.arcs||[]).map(a => `
    <p class="libarc"><span class="pill">${esc(a.title)}</span></p>
    ${a.days.map(d => {
      const l   = syl.lessons.find(x => x.day === d) || {};
      const has = done.includes(d);
      const open = d <= day;                       // never gate what has been reached
      return `<button class="libitem${d===day?' today':''}" data-day="${d}" ${open?'':'disabled'}>
        <span class="n">${d}</span><span>${esc(l.title||'')}</span>
        ${has?'<span class="tick">✓</span>':''}</button>`;
    }).join('')}`).join('');

  $$('#courseList .libitem').forEach(b =>
    b.onclick = () => Deck.open(+b.dataset.day));
}

/* ── SCOFF ───────────────────────────────────────────────────────────────── */
const SCOFF = [
  'Do you make yourself sick because you feel uncomfortably full?',
  'Do you worry you have lost control over how much you eat?',
  'Have you recently lost more than about 14 lb in a three-month period?',
  'Do you believe yourself to be fat when others say you are too thin?',
  'Would you say that food dominates your life?',
];
function renderScoff(){
  const s = profile.screen || {};
  const due = !s.last_taken || daysBetween(s.last_taken, today()) > 42;
  if (!due){
    $('#scoffBox').innerHTML = `<p class="note">Taken ${s.last_taken}. Next check in
      ${42 - daysBetween(s.last_taken, today())} days.</p>`;
    return;
  }
  $('#scoffBox').innerHTML = SCOFF.map((q,i)=>
    `<label class="mini" style="align-items:flex-start;margin-bottom:9px">
       <input type="checkbox" data-scoff="${i}" style="margin-top:4px">
       <span style="color:var(--ink)">${q}</span></label>`).join('')
    + `<button class="ghost" id="btnScoff" style="margin-top:8px">Record</button>`;
  $('#btnScoff').onclick = async () => {
    const score = $$('[data-scoff]').filter(x=>x.checked).length;
    profile.screen = {last_taken: today(), result: score >= 2 ? 'positive' : 'negative', score};
    await save('profile', profile);
    $('#scoffBox').innerHTML = score >= 2
      ? `<p style="color:var(--accent)"><b>Worth talking to someone about.</b></p>
         <p class="note">Two or more here means a conversation with a doctor or counsellor is
         the right next step. This is a screen, not a diagnosis, and it is not a verdict on
         you. Fasting content and weight targets are switched off here for now — not as a
         punishment, just because they are the wrong tools if this is what is going on.</p>`
      : `<p class="note">Recorded. Next check in six weeks.</p>`;
  };
}

/* ── profile box ─────────────────────────────────────────────────────────── */
function renderProfileBox(){
  const p = profile;
  $('#profileBox').innerHTML = `
    <div>Eating window closes at <b>${p.window?.eat_until ?? '—'}</b></div>
    <div>Bed at <b>${p.bedtime ?? '—'}</b></div>
    <div style="margin-top:10px">Your three watches:</div>
    ${p.watches.map(w=>`<div>· <b>${esc(w.label)}</b> — ${esc(w.prompt)}</div>`).join('')}
    ${p.experiment ? `<div style="margin-top:10px" class="note">Current experiment ends
      <b>${p.experiment.until}</b>, then back to baseline.</div>` : ''}`;
}

/* ── auth ────────────────────────────────────────────────────────────────── */
function renderAccount(){
  if (account){
    $('#acctTitle').textContent = account.email;
    $('#acctNote').textContent = 'Your journal syncs to your own Google Drive. Only you can read it.';
    $('#btnSignOut').hidden = false;
  } else if (!CONFIGURED){
    $('#acctTitle').textContent = 'Local only';
    $('#acctNote').textContent =
      'Sign-in is not configured yet. Everything you enter stays on this device — which works, ' +
      'it just will not follow you to another one.';
  } else {
    $('#acctTitle').textContent = 'Not signed in';
    $('#acctNote').textContent = 'Sign in with Google to load your course and sync your journal.';
  }
}
$('#btnSignOut').onclick = () => {
  idToken = account = null;
  local.set('idToken', null); local.set('account', null);
  location.reload();
};

function initAuth(){
  if (!CONFIGURED) return;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: CFG.clientId,
      callback: async res => {
        idToken = res.credential;
        const p = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        account = {email:p.email, name:p.name};
        local.set('idToken', idToken); local.set('account', account);
        location.reload();
      },
    });
    google.accounts.id.renderButton($('#gsiButton'), {theme:'outline', size:'large', width:280});
  };
  document.head.appendChild(s);
}

/* ── export / import — data is never trapped on one device ───────────────── */
function exportAll(){
  const out = {};
  Object.keys(localStorage).filter(k => k.startsWith('ember:'))
    .forEach(k => { try { out[k.slice(6)] = JSON.parse(localStorage.getItem(k)); }
                    catch { out[k.slice(6)] = localStorage.getItem(k); } });
  const blob = new Blob([JSON.stringify({exported:new Date().toISOString(), data:out}, null, 1)],
                        {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ember-${today()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
function importAll(file){
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      const d = j.data || j;
      Object.entries(d).forEach(([k,v]) => local.set(k, v));
      alert('Imported. Reloading.'); location.reload();
    } catch { alert('That file could not be read.'); }
  };
  r.readAsText(file);
}


/* ── voice note — real Web Speech API, feature-detected, never faked ────────── */
function initMic(){
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec){ return; }                       // no silent fake button — just hide it
  const btn = $('#btnMic'); btn.hidden = false;
  const rec = new Rec();
  rec.continuous = true; rec.interimResults = false;
  rec.lang = (navigator.language || 'en-US');
  let on = false;
  rec.onresult = e => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    const t = $('#note');
    t.value = (t.value ? t.value.trim() + ' ' : '') + text.trim();
  };
  rec.onend = () => { if (on){ try { rec.start(); } catch {} } };  // keep listening until toggled off
  rec.onerror = () => { on = false; btn.classList.remove('recording'); };
  btn.onclick = () => {
    on = !on;
    btn.classList.toggle('recording', on);
    try { on ? rec.start() : rec.stop(); } catch {}
  };
}

/* ── "ask" field on Right Now ─────────────────────────────────────────────────
   Not a live model call — nothing on the phone can reach one. This searches your
   own rescue deck by keyword overlap and surfaces the closest card. Honest about
   what it is: a search, not a conversation. */
function askRescue(){
  const q = $('#askInput').value.trim();
  const box = $('#askResult');
  if (!q){ box.hidden = true; return; }
  const words = q.toLowerCase().match(/[a-z']+/g) || [];
  const stop = new Set(['i','a','the','to','and','of','is','it','my','me','im',"i'm",'am','on','in','at']);
  const terms = words.filter(w => w.length > 2 && !stop.has(w));

  let best = null, bestScore = 0;
  deck.forEach(c => {
    const hay = (c.thought + ' ' + c.body).toLowerCase();
    const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    if (score > bestScore){ bestScore = score; best = c; }
  });

  box.hidden = false;
  if (best && bestScore > 0){
    box.innerHTML = `<p style="margin:0 0 6px"><b>${esc(best.thought)}</b></p>
      <p style="margin:0">${esc(best.move)}</p>
      <p class="askNote">Closest match from your own cards — not a live answer.</p>`;
  } else {
    box.innerHTML = `<p style="margin:0">Nothing matched closely. Try the list below —
      one of these is probably close enough.</p>`;
  }
}

/* ── nav ─────────────────────────────────────────────────────────────────── */
/* Five positions: Journey · Journal · [logo] · Evening · Settings.
   The four data-view buttons swap the section underneath. The centre logo is not a
   tab — it lifts Right Now over whatever tab is showing, and the ✕ puts it back. */
const closeRightNow = () => {
  $('#v-rescue').classList.remove('on');
  document.body.classList.remove('rightnow-open');
};
$$('nav button[data-view]').forEach(b => b.onclick = () => {
  closeRightNow();
  $$('nav button[data-view]').forEach(x => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current','page');
  $$('.view').forEach(v => v.classList.remove('on'));
  $('#v-'+b.dataset.view).classList.add('on');
  window.scrollTo(0,0);
});
$('#btnRightNow').onclick = () => {
  $('#v-rescue').classList.add('on');
  document.body.classList.add('rightnow-open');
  $('#v-rescue').scrollTop = 0;
};
$('#btnRightNowClose').onclick = closeRightNow;
$('#btnSave').onclick = saveCheckin;
$('#btnSaveWeight').onclick = saveWeightOnly;
$('#btnExport').onclick = exportAll;
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = e => { if (e.target.files[0]) importAll(e.target.files[0]); };
initMic();
$('#btnAsk').onclick = () => askRescue();
$('#askInput').onkeydown = e => { if (e.key === 'Enter') askRescue(); };
$('#panicBtn').onclick = () => $('#askInput').focus();
$('#btnLater').onclick = () => { $('#lessonCard').style.opacity = .45;
  $('#btnLater').textContent = 'Still here when you want it'; };
$('#btnStart').onclick  = () => Deck.open(currentDay());
$('#deckClose').onclick = () => Deck.close();
$('#deckNext').onclick  = () => Deck.next();
$('#deckBack').onclick  = () => Deck.prev();

/* Called by the deck when a lesson is finished. */
window.afterLessonDone = () => { renderLesson(); renderCourse(); renderDayDots(); };

/* ── boot ────────────────────────────────────────────────────────────────── */
(async function boot(){
  setSync(CONFIGURED ? '' : 'local only — not synced');
  profile = assertThreeWatches(await load('profile', profile));
  progress = await load('progress', progress);
  renderWatches(); renderProgress(); renderDayDots(); renderProfileBox(); renderAccount(); renderScoff();
  initAuth(); await initRescue(); await renderLesson();

  // A gap is noticed on open, not only on save, so the welcome lands before the ask.
  if (progress.lastDate && daysBetween(progress.lastDate, today()) >= 2)
    showWelcomeBack(daysBetween(progress.lastDate, today()));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
