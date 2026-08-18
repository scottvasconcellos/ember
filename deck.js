/* Ember — the deck player.
 *
 * A lesson is 6-7 vertical cards, one screen each, rather than a wall of text.
 * Art is generated procedurally from a seed: no image files, no network, no API,
 * sharp at any size, and it cannot fail to load.
 */
'use strict';

/* ── seeded art ──────────────────────────────────────────────────────────── */
function seeded(str){
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

/* Four generators. Which one you get depends on the seed, so each day looks
   different but the same day always looks the same. */
function art(seed, h = 150){
  const r = seeded(seed), W = 400, H = h;
  const pick = Math.floor(r() * 4);
  const warm = ['var(--accent)', '#e0834a', '#d9a05b', '#c96a2c'];
  const c = () => warm[Math.floor(r() * warm.length)];
  let s = '';

  if (pick === 0) {                                   // concentric arcs — an ember
    const cx = W * (.3 + r() * .4), cy = H * (.5 + r() * .3);
    for (let i = 7; i > 0; i--)
      s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(i*13+r()*7).toFixed(0)}"
             fill="none" stroke="${c()}" stroke-width="${(.6+r()*1.4).toFixed(1)}"
             opacity="${(.10+i*.045).toFixed(2)}"/>`;
  } else if (pick === 1) {                            // horizon lines
    for (let i = 0; i < 16; i++){
      const y = (i/16)*H + r()*5;
      s += `<path d="M0 ${y.toFixed(0)} Q ${(W*.3).toFixed(0)} ${(y-8-r()*16).toFixed(0)}
             ${W} ${(y+r()*8).toFixed(0)}" fill="none" stroke="${c()}"
             stroke-width="${(.5+r()).toFixed(1)}" opacity="${(.07+r()*.22).toFixed(2)}"/>`;
    }
  } else if (pick === 2) {                            // scattered embers
    for (let i = 0; i < 46; i++)
      s += `<circle cx="${(r()*W).toFixed(0)}" cy="${(r()*H).toFixed(0)}"
             r="${(.7+r()*4.5).toFixed(1)}" fill="${c()}" opacity="${(.10+r()*.42).toFixed(2)}"/>`;
  } else {                                            // vertical reeds
    for (let i = 0; i < 26; i++){
      const x = (i/26)*W + r()*9, hh = H*(.25+r()*.7);
      s += `<line x1="${x.toFixed(0)}" y1="${H}" x2="${(x+(r()-.5)*18).toFixed(0)}"
             y2="${(H-hh).toFixed(0)}" stroke="${c()}"
             stroke-width="${(.6+r()*1.8).toFixed(1)}" opacity="${(.10+r()*.30).toFixed(2)}"
             stroke-linecap="round"/>`;
    }
  }
  return `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${s}</svg>`;
}

/* ── how many lessons today ──────────────────────────────────────────────────
 * Up to five lessons a day, offered — never asked for. The count is stored as
 * {date, count} and is read through a date check, so a new day always starts at
 * zero without anything having to run at midnight.
 *
 * This is deliberately NOT surfaced as a counter anywhere: a number that resets
 * is the streak anti-pattern in CONTEXT.md wearing a different hat. It only ever
 * chooses which words the break screen uses.
 */
const MAX_LESSONS_PER_DAY = 5;

const dayStamp = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local

function lessonsToday(){
  const v = window.emberLocal.get('lessonsToday', null);
  if (!v || typeof v !== 'object' || v.date !== dayStamp())
    return { date: dayStamp(), count: 0 };                        // the date reset
  return { date: v.date, count: Number(v.count) || 0 };
}

async function bumpLessonsToday(){
  const next = { date: dayStamp(), count: lessonsToday().count + 1 };
  window.emberLocal.set('lessonsToday', next);                    // instant, even offline
  try { await window.emberSave('lessonsToday', next); } catch { /* local copy stands */ }
  return next;
}

/* ── player ──────────────────────────────────────────────────────────────── */
const Deck = {
  data: null, i: 0, answers: {}, pending: null,

  async open(day){
    const d = await this.loadDeck(day);
    if (!d){ alert('That lesson has not been loaded into your backend yet.'); return; }
    this.mount(d);
  },

  async loadDeck(day){
    try { return await window.emberLoad('deck:' + String(day).padStart(2,'0')); }
    catch { return null; }
  },

  /* Put a loaded deck on screen at card one. Shared by open() and "do another". */
  mount(d){
    this.data = d; this.i = 0; this.answers = {}; this.pending = null;
    document.body.classList.add('deck-open');
    document.body.classList.remove('deck-break');
    $('#deckLayer').hidden = false;
    this.render();
  },

  close(){
    document.body.classList.remove('deck-open', 'deck-break');
    $('#deckLayer').hidden = true;
    $('#deckStage').innerHTML = '';
    this.data = null; this.pending = null;
  },

  next(){ if (this.i < this.data.cards.length - 1){ this.i++; this.render(); } },
  prev(){ if (this.i > 0){ this.i--; this.render(); } },

  render(){
    const c = this.data.cards[this.i];
    const n = this.data.cards.length;
    $('#deckDots').innerHTML = this.data.cards
      .map((_, k) => `<i class="${k===this.i?'on':k<this.i?'past':''}"></i>`).join('');
    $('#deckStage').innerHTML = this['card_'+c.type] ? this['card_'+c.type](c) : '';
    $('#deckStage').scrollTop = 0;
    this.wire(c);
    $('#deckBack').style.visibility = this.i ? 'visible' : 'hidden';
    $('#deckNext').hidden = (c.type === 'close');
    $('#deckNext').textContent = this.i === n-2 ? 'Last one' : 'Next';
  },

  /* card renderers */
  card_cover(c){
    return `${art('c'+c.art, 210)}
      <div class="dcard cover">
        <p class="deyebrow">${esc(c.arc)}</p>
        <h1>${esc(c.heading)}</h1>
        <p class="dnote">Day ${c.day} · about two minutes</p>
      </div>`;
  },
  card_prose(c){
    return `${c.art ? art('m'+c.art, 92) : ''}
      <div class="dcard"><p class="dprose">${inline(c.text)}</p></div>`;
  },
  card_quote(c){
    return `<div class="dcard quote">
        <div class="qmark">&ldquo;</div>
        <blockquote>${esc(c.text)}</blockquote>
        <p class="dattrib">${esc(c.attrib || '')}</p>
      </div>`;
  },
  card_choice(c){
    return `<div class="dcard">
        <p class="deyebrow">A question, not a test</p>
        <h2>${esc(c.q)}</h2>
        <div class="opts">${c.options.map((o,k)=>
          `<button class="opt" data-opt="${k}">${esc(o.label)}</button>`).join('')}</div>
        <div class="optreply" id="optReply" hidden></div>
      </div>`;
  },
  card_sort(c){
    return `<div class="dcard">
        <p class="deyebrow">Tap one, then tap where it goes</p>
        <h2>${esc(c.prompt)}</h2>
        <div class="sortItems" id="sortItems">${c.items.map((it,k)=>
          `<button class="sitem" data-item="${k}" data-bucket="${esc(it.bucket)}">${esc(it.text)}</button>`).join('')}</div>
        <div class="buckets">${c.buckets.map(b=>
          `<button class="bucket" data-bucket="${esc(b.id)}">
             <b>${esc(b.label)}</b><span>${esc(b.hint)}</span>
             <div class="drops" data-drop="${esc(b.id)}"></div></button>`).join('')}</div>
        <p class="dnote" id="sortNote" hidden>${esc(c.note)}</p>
      </div>`;
  },
  card_journal(c){
    const prev = window.emberLocal.get(c.key, '');
    return `<div class="dcard">
        <p class="deyebrow">Optional — skip freely</p>
        <h2>${esc(c.prompt)}</h2>
        <textarea id="jText" placeholder="Only if you want to.">${esc(prev)}</textarea>
        <label class="mini"><input type="checkbox" id="jDeviceOnly">
          Keep this one off my other devices</label>
        <p class="dnote" style="font-size:12.5px;margin-top:-2px">Private to you either way.</p>
        <p class="dnote" id="jSaved" hidden>Saved.</p>
      </div>`;
  },
  card_close(c){
    return `${art('z'+c.art, 130)}
      <div class="dcard close">
        ${c.today ? `<div class="today"><b>Today:</b> ${inline(c.today)}</div>` : ''}
        <blockquote class="closing">${esc(c.line)}</blockquote>
        <p class="dattrib">${esc(c.cite || '')}</p>
        <button class="primary" id="deckDone">Done</button>
        <p class="dnote" style="text-align:center">You can reread this any time in the library.</p>
      </div>`;
  },

  /* per-card behaviour */
  wire(c){
    if (c.type === 'choice'){
      $$('#deckStage .opt').forEach(b => b.onclick = () => {
        $$('#deckStage .opt').forEach(x => x.classList.remove('picked'));
        b.classList.add('picked');
        const o = c.options[+b.dataset.opt];
        const r = $('#optReply'); r.hidden = false; r.textContent = o.response;
        this.answers['choice'] = o.label;
      });
    }
    if (c.type === 'sort'){
      let sel = null;
      $$('#deckStage .sitem').forEach(b => b.onclick = () => {
        $$('#deckStage .sitem').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); sel = b;
      });
      $$('#deckStage .bucket').forEach(bk => bk.onclick = () => {
        if (!sel) return;
        const right = sel.dataset.bucket === bk.dataset.bucket;
        const chip = document.createElement('span');
        chip.className = 'chip ' + (right ? 'ok' : 'off');
        chip.textContent = sel.textContent;
        bk.querySelector('.drops').appendChild(chip);
        sel.remove(); sel = null;
        if (!$$('#deckStage .sitem').length) $('#sortNote').hidden = false;
      });
    }
    if (c.type === 'journal'){
      const t = $('#jText');
      t.oninput = () => {
        window.emberLocal.set(c.key, t.value);
        // Private by default: it syncs to your own Drive and informs your weekly note.
        if (!$('#jDeviceOnly').checked) window.emberSave(c.key, t.value);
        $('#jSaved').hidden = !t.value.trim();
      };
    }
    if (c.type === 'close'){
      $('#deckDone').onclick = () => this.finish();
    }
  },

  async finish(){
    const day = this.data.day;
    const done = window.emberLocal.get('lessonsDone', []);
    const reread = done.includes(day);

    if (!reread){
      done.push(day);
      window.emberLocal.set('lessonsDone', done);
      await window.emberSave('lessonsDone', done);
      await bumpLessonsToday();          // rereads never count toward the five
    }
    if (this.answers.choice)
      await window.emberSave(`answer:D${String(day).padStart(2,'0')}`, this.answers);

    // Refresh the page underneath while the break screen is up, so closing lands
    // on something current. (This used to run after close() with this.data already
    // nulled, which threw and quietly skipped the refresh.)
    if (window.afterLessonDone) window.afterLessonDone(day);

    this.showBreak(reread ? 'reread' : 'done');
  },

  /* ── the break between lessons ─────────────────────────────────────────────
   * A whole screen, not a footer on the last card: the deck goes away, the
   * chrome empties, and this is what is left. The words get warmer and shorter
   * as the day goes on, and at five there is no onward button at all.
   */
  showBreak(mode){
    const count = lessonsToday().count;
    const tier  = Math.min(Math.max(count, 1), MAX_LESSONS_PER_DAY);
    const capped = count >= MAX_LESSONS_PER_DAY;
    const t = BREAK_COPY[tier];

    document.body.classList.add('deck-break');
    $('#deckDots').innerHTML = '';
    $('#deckBack').style.visibility = 'hidden';
    $('#deckNext').hidden = true;

    const head = mode === 'reread' ? REREAD_COPY.head : t.head;
    const body = mode === 'reread' ? REREAD_COPY.body : t.body;

    $('#deckStage').innerHTML = `
      <section class="brk">
        <div class="brkbloom" aria-hidden="true"></div>
        <div class="brksparks" id="brkSparks" aria-hidden="true"></div>
        <div class="brkinner">
          <div class="brkmark" aria-hidden="true"><span></span></div>
          <p class="brkeyebrow">${esc(mode === 'reread' ? 'Read again' : 'Lesson done')}</p>
          <h1 class="brkhead" id="brkHead" tabindex="-1">${esc(head)}</h1>
          <p class="brkbody">${esc(body)}</p>
          <div class="brkactions" id="brkActions">
            <button class="${capped ? 'primary brkgo' : 'brkghost'}"
                    id="brkClose">${esc(capped ? t.cta : t.stop)}</button>
          </div>
        </div>
      </section>`;
    $('#deckStage').scrollTop = 0;
    this.sparks();
    const h = $('#brkHead'); if (h) h.focus({ preventScroll:true });
    $('#brkClose').onclick = () => this.close();

    if (!capped) this.offerAnother();
  },

  /* The next lesson the user has not read yet. Not gated on the calendar — the
     whole point of this screen is that a day can hold more than one. */
  nextUnreadDay(){
    const done = window.emberLocal.get('lessonsDone', []);
    const total = (window.EMBER_CONFIG && window.EMBER_CONFIG.days) || 60;
    for (let d = 1; d <= total; d++) if (!done.includes(d)) return d;
    return null;
  },

  /* Only offer what actually exists. Not all sixty are written yet, so the deck
     is fetched before the button appears — never a button that dead-ends. */
  async offerAnother(){
    const day = this.nextUnreadDay();
    const box = $('#brkActions');
    if (!box) return;

    if (day === null){ this.softNote(ALL_READ_NOTE); return; }

    const d = await this.loadDeck(day);
    if (!$("#brkActions") || !document.body.classList.contains('deck-break')) return;
    if (!d){ this.softNote(NOT_WRITTEN_NOTE); return; }

    this.pending = d;
    const count = lessonsToday().count;
    const t = BREAK_COPY[Math.min(Math.max(count, 1), MAX_LESSONS_PER_DAY)];
    const btn = document.createElement('button');
    btn.className = 'primary brkgo';
    btn.id = 'brkAnother';
    btn.textContent = t.cta;
    const ask = document.createElement('p');
    ask.className = 'brkoffer';
    ask.textContent = t.offer;
    $('#brkActions').prepend(btn);
    $('#brkActions').before(ask);
    btn.onclick = () => { const nd = this.pending; if (nd) this.mount(nd); };
  },

  /* Used when there is nothing to move on to. Warm, and then the door. */
  softNote(text){
    const box = $('#brkActions');
    if (!box) return;
    const p = document.createElement('p');
    p.className = 'brknote';
    p.textContent = text;
    box.before(p);
  },

  /* Ember burst — plain spans on CSS transforms, no canvas loop and no library.
     Sits still for anyone who has asked for reduced motion (see style.css). */
  sparks(){
    const host = $('#brkSparks');
    if (!host) return;
    const n = 26;
    let html = '';
    for (let k = 0; k < n; k++){
      const a  = (k / n) * Math.PI * 2 + Math.random() * .34;
      const r  = 74 + Math.random() * 190;
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r * .82 - 40 - Math.random() * 60;   // drift upward
      html += `<i style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;
                 --s:${(.35 + Math.random() * .9).toFixed(2)};
                 --d:${(Math.random() * .34).toFixed(2)}s;
                 --t:${(1.1 + Math.random() * .9).toFixed(2)}s"></i>`;
    }
    host.innerHTML = html;
  },
};

/* ── the words ───────────────────────────────────────────────────────────────
 * Read CONTEXT.md before touching these. No guilt, no streaks, no "you should",
 * nothing that implies being behind. Every tier has to read as fine to stop at.
 */
const BREAK_COPY = {
  1: {
    head:  "You're done for the day. Nice.",
    body:  "One a day is genuinely good. It isn't about volume — one a day gives you a pattern, and that's the part that does the work.",
    offer: 'Want to do another?',
    cta:   'Yes, one more',
    stop:  "That's me for today",
  },
  2: {
    head:  "That's two. Lovely.",
    body:  "More than enough for one day. If you're enjoying it there's another one there, and if you'd rather stop, this is a good place to stop.",
    offer: 'Want another?',
    cta:   'Another one',
    stop:  "I'm good for today",
  },
  3: {
    head:  'Wow, you did a lot.',
    body:  'You could absolutely put it down here — or do up to two more. Both are good; go with whichever you actually feel like.',
    offer: 'Still in the mood?',
    cta:   'One more',
    stop:  'Putting it down here',
  },
  4: {
    head:  "Four. That's a proper stretch of it.",
    body:  "Okay — one more today, then that's a wrap.",
    offer: 'Last one?',
    cta:   'Go on then',
    stop:  'Stopping here',
  },
  5: {
    head:  "Five. That's a wrap.",
    body:  "That's everything Ember has for one day. Nothing expires and nothing is waiting on you — the next one will be here whenever you next open this.",
    offer: '',
    cta:   'Done for today',
    stop:  'Done for today',
  },
};

const REREAD_COPY = {
  head: 'Good to come back to.',
  body: "You'd already finished this one, so nothing changed — it just stays in the library for whenever you want it again.",
};

const NOT_WRITTEN_NOTE =
  "That's as far as it's written for now. The next lesson isn't there yet — nothing to do with you. Today's is done, and it'll be in the library whenever you want to look at it again.";

const ALL_READ_NOTE =
  "That's every lesson there is so far. They all stay in the library — reread any of them, any time.";

window.Deck = Deck;
window.emberArt = art;
