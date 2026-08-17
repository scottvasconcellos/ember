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

/* ── player ──────────────────────────────────────────────────────────────── */
const Deck = {
  data: null, i: 0, answers: {},

  async open(day){
    const d = await window.emberLoad('deck:' + String(day).padStart(2,'0'));
    if (!d){ alert('That lesson has not been loaded into your backend yet.'); return; }
    this.data = d; this.i = 0; this.answers = {};
    document.body.classList.add('deck-open');
    $('#deckLayer').hidden = false;
    this.render();
  },

  close(){
    document.body.classList.remove('deck-open');
    $('#deckLayer').hidden = true;
    this.data = null;
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
    const done = window.emberLocal.get('lessonsDone', []);
    if (!done.includes(this.data.day)){
      done.push(this.data.day);
      window.emberLocal.set('lessonsDone', done);
      await window.emberSave('lessonsDone', done);
    }
    if (this.answers.choice)
      await window.emberSave(`answer:D${String(this.data.day).padStart(2,'0')}`, this.answers);
    this.close();
    if (window.afterLessonDone) window.afterLessonDone(this.data.day);
  },
};

window.Deck = Deck;
window.emberArt = art;
