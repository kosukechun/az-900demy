/* Buildless and relative URLs: works on GitHub project Pages and from index.html. */
(() => {
  'use strict';
  const questions = window.AZ_QUESTIONS;
  const app = document.getElementById('app');
  if (!Array.isArray(questions)) { app.textContent = '問題データを読み込めませんでした。ページを再読み込みしてください。'; return; }
  const KEY = 'az900-study-v1';
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  if (!state.answers || typeof state.answers !== 'object' || Array.isArray(state.answers)) state.answers = {};
  const byId = new Map(questions.map(q => [q.id,q]));
  let selected = [];
  let current;
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Private browsing and full storage still allow a session. */ } };
  const list = group => questions.filter(q => q.group === group);
  const answer = q => {
    const a = state.answers[q.id];
    return a && Array.isArray(a.selected) && a.selected.every(i => Number.isInteger(i) && i >= 0 && i < q.choices.length) ? a : null;
  };
  const count = group => list(group).filter(q => answer(q)).length;
  const isCorrect = (q, values) => q.accepted.some(set => set.length === values.length && set.every(i => values.includes(i)));
  function route() {
    selected = [];
    const match = location.hash.match(/^#(Q[1-6])-(\d{2})$/);
    current = match ? byId.get(`${match[1]}-${match[2]}`) : null;
    if (current) {
      state.last = current.id; save(); renderQuestion();
    } else if (/^#done-Q[1-6]$/.test(location.hash)) renderDone(location.hash.slice(6));
    else renderHome();
    window.scrollTo(0,0);
  }
  function go(id) { if (location.hash === `#${id}`) route(); else location.hash = id; }
  function start(group) { const set = list(group); go((set.find(q => !answer(q)) || set[0]).id); }
  function restart(group) {
    const set = list(group);
    set.forEach(q => { delete state.answers[q.id]; });
    state.last = set[0].id;
    save();
    go(set[0].id);
  }
  function renderHome() {
    document.title = 'AZ-900 問題集';
    app.innerHTML = `<section class="hero"><div><p class="eyebrow">AZURE FUNDAMENTALS / PRACTICE</p><h1>一問ずつ、理解を深める。</h1><p>選択肢をタップして、すぐに答え合わせ。<br>正解と解説を確認しながら、自分のペースで進めましょう。</p></div><div class="total"><strong>${questions.length}</strong> 問収録</div></section>
      ${state.last && byId.has(state.last) ? `<div class="resume"><p>前回の続き <strong>${esc(state.last.split('-')[0])}・問題 ${Number(state.last.split('-')[1])}</strong></p><button class="text-button" id="resume">続きから解く →</button></div>` : ''}
      <div class="section-heading"><h2>問題セットを選ぶ</h2><span>6セット × 70問</span></div><div class="sets">${Array.from({length:6},(_,i) => {
        const group = `Q${i+1}`, n = count(group), total = list(group).length;
        return `<article class="set" aria-label="${group} 演習問題"><div class="set-top"><span class="set-number">${group}</span><span class="set-count">${total}問</span></div><p class="set-title">AZ-900 演習問題 ${String(i+1).padStart(2,'0')}</p><div class="meter"><span style="width:${n/total*100}%"></span></div><p class="set-bottom">${n} / ${total} 問回答</p><div class="set-actions"><button class="primary" data-start="${group}">最初から解く <span aria-hidden="true">→</span></button>${n ? `<button class="secondary" data-group="${group}">${n < total ? '続きから解く' : '解答を見直す'}</button>` : ''}</div>${n ? '<p class="set-reset-note">「最初から」でこのセットの回答をリセット</p>' : ''}</article>`;
      }).join('')}</div><p class="home-note">問題文・選択肢はスクリーンショットからテキストに転記しています。<br>正解・解説は学習用に作成したもので、教材の公式解答ではありません。進み具合はこのブラウザーに保存されます。</p>`;
    app.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click',() => start(b.dataset.group)));
    app.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click',() => restart(b.dataset.start)));
    document.getElementById('resume')?.addEventListener('click', () => go(state.last));
  }
  function renderQuestion() {
    const q = current, saved = answer(q), multi = q.multiple;
    const set = list(q.group);
    document.title = `${q.group}・問題${q.number} | AZ-900 問題集`;
    app.innerHTML = `<div class="quiz-top"><button class="back" id="home"><span aria-hidden="true">←</span>問題セット</button><select class="question-select" id="jump" aria-label="問題を選ぶ">${set.map(x => `<option value="${x.id}"${x.id === q.id ? ' selected' : ''}>問題 ${x.number}${answer(x) ? '　回答済み' : ''}</option>`).join('')}</select></div>
      <div class="quiz-meta"><h1><span class="pill">${q.group}</span> 問題 ${String(q.number).padStart(2,'0')}</h1><span class="count">${q.number} <span aria-hidden="true">/</span> ${set.length}</span></div><div class="quiz-progress" aria-label="${set.length}問中${q.number}問目"><span style="width:${q.number/set.length*100}%"></span></div>
      <section class="question-card" aria-label="問題と回答"><p class="question-label">QUESTION</p><div class="prompt-text">${esc(q.prompt)}</div>
      ${q.notice ? `<p class="notice">${esc(q.notice)}</p>` : ''}
      <p class="answer-hint">${q.ungraded ? 'この問題は解説を確認する形式です。' : multi ? '該当する選択肢を選び、「回答する」をタップ' : '選択肢をタップすると、答え合わせができます'}</p>
      <div class="choices" role="group" aria-label="回答の選択肢">${q.choices.map((c,i) => {
        let cls = 'choice' + (multi ? ' multiple' : '');
        let symbol = String.fromCharCode(65+i);
        const picked = saved?.selected.includes(i);
        if (saved && !q.ungraded && q.accepted.some(a => a.includes(i))) { cls += ' correct'; symbol = '✓'; }
        else if (picked && saved && !q.ungraded) { cls += ' incorrect'; symbol = '×'; }
        return `<button class="${cls}" data-choice="${i}" aria-label="${String.fromCharCode(65+i)}: ${esc(c.text)}" aria-pressed="${!!picked}"${saved || q.ungraded ? ' disabled' : ''}><span class="choice-label" aria-hidden="true">${symbol}</span><span class="choice-text">${esc(c.text)}</span></button>`;
      }).join('')}</div>${!saved && (multi || q.ungraded) ? `<div class="submit-row"><button class="primary" id="submit"${!q.ungraded ? ' disabled' : ''}>${q.ungraded ? '解説を見る' : '回答する'}</button></div>` : ''}
      <div id="feedback-slot">${saved ? feedback(q,saved) : ''}</div></section>
      <nav class="quiz-nav" aria-label="問題の移動"><button class="secondary" id="prev"${q.number===1 ? ' disabled' : ''}>← 前の問題</button><span class="nav-center">${count(q.group)} / ${set.length} 問回答済み</span><button class="primary" id="next">${q.number===set.length ? '結果を見る' : '次の問題 →'}</button></nav>`;
    document.getElementById('home').addEventListener('click', () => go(''));
    document.getElementById('jump').addEventListener('change', e => go(e.target.value));
    app.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click',() => {
      const i = Number(b.dataset.choice);
      if (!multi) { selected = [i]; submit(); return; }
      selected = selected.includes(i) ? selected.filter(v => v !== i) : [...selected,i];
      b.classList.toggle('chosen',selected.includes(i)); b.setAttribute('aria-pressed',String(selected.includes(i)));
      document.getElementById('submit').disabled = !selected.length;
    }));
    document.getElementById('submit')?.addEventListener('click',submit);
    document.getElementById('prev').addEventListener('click',() => go(set[q.number-2].id));
    document.getElementById('next').addEventListener('click',() => go(q.number===set.length ? `done-${q.group}` : set[q.number].id));
    bindRetry();
  }
  function feedback(q,a) {
    const correct = !q.ungraded && isCorrect(q,a.selected);
    return `<section class="feedback ${q.ungraded ? 'neutral' : correct ? '' : 'wrong'}" id="feedback" role="status" aria-live="polite"><h2 class="feedback-heading"><span aria-hidden="true">${q.ungraded ? 'ⓘ' : correct ? '✓' : '×'}</span>${q.ungraded ? '解説を確認' : correct ? '正解です' : '不正解です'}</h2>
      ${!q.ungraded ? `<p class="correct-answer">正解：${q.accepted.map(set => set.map(i => String.fromCharCode(65+i)).join('・')).join(' または ')}</p>` : ''}<h3>解説</h3><p>${esc(q.explanation)}</p>${q.sources?.length ? `<div class="sources">${q.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div>` : ''}
      ${!q.ungraded ? '<button class="text-button retry" id="retry">もう一度解く ↻</button>' : ''}</section>`;
  }
  function bindRetry() { document.getElementById('retry')?.addEventListener('click',() => { delete state.answers[current.id]; selected=[]; save(); renderQuestion(); }); }
  function submit() {
    if (answer(current) || (!current.ungraded && !selected.length)) return;
    state.answers[current.id] = {selected:[...selected].sort((a,b)=>a-b)};
    save(); renderQuestion();
    const fb = document.getElementById('feedback');
    if (fb && fb.getBoundingClientRect().bottom > window.innerHeight - 20) fb.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
  }
  function renderDone(group) {
    const set = list(group), scored = set.filter(q => answer(q) && !q.ungraded), correct = scored.filter(q => isCorrect(q,answer(q).selected)).length;
    app.innerHTML = `<section class="done-card"><p class="eyebrow">${group} / PRACTICE</p><h1>${count(group)===set.length ? 'おつかれさまでした。' : 'ここまでの結果'}</h1><p>${count(group)} / ${set.length} 問を回答しました。</p><div class="done-score">${correct}<span> / ${scored.length} 問正解</span></div><p>解説のみの問題は、正解数に含まれません。</p><div class="done-actions"><button class="secondary" id="done-home">問題セットへ</button><button class="secondary" id="restart">最初から解く</button><button class="primary" id="continue">${count(group)<set.length ? '未回答の問題へ' : '解答を見直す'}</button></div><p class="set-reset-note">「最初から」でこのセットの回答をリセットします。</p></section>`;
    document.getElementById('done-home').addEventListener('click', () => go(''));
    document.getElementById('restart').addEventListener('click',() => restart(group));
    document.getElementById('continue').addEventListener('click',() => start(group));
  }
  window.addEventListener('hashchange',route);
  route();
})();
