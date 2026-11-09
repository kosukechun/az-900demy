/* Buildless and relative URLs: works on GitHub project Pages and from index.html. */
(() => {
  'use strict';
  const questions = window.AZ_QUESTIONS;
  const app = document.getElementById('app');
  if (!Array.isArray(questions)) { app.textContent = '問題を読み込めませんでした。再読み込みしてください。'; return; }
  const KEY = 'az900-study-v1';
  const byId = new Map(questions.map(q => [q.id, q]));
  const groups = [...new Set(questions.map(q => q.group))];
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(state.answers)) state.answers = {};
  if (!object(state.mistakes)) state.mistakes = {};
  if (!object(state.orders)) state.orders = {};
  if (!object(state.choiceOrders)) state.choiceOrders = {};
  if (typeof state.last !== 'string') delete state.last;
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Keep working in memory when storage is unavailable. */ } };
  const list = group => questions.filter(q => q.group === group);
  // Fisher–Yates: every permutation has the same probability. Store canonical
  // choice indices separately so shuffling never changes grading or old answers.
  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const validOrder = (order, values) => Array.isArray(order) && order.length === values.length &&
    new Set(order).size === values.length && order.every(value => values.includes(value));
  function orderedList(group) {
    const ids = list(group).map(q => q.id);
    if (!validOrder(state.orders[group], ids)) { state.orders[group] = shuffle(ids); save(); }
    return state.orders[group].map(id => byId.get(id));
  }
  function choiceOrder(q) {
    const indices = q.choices.map((_, i) => i);
    if (q.choices.length === 2 && q.choices[0].text === 'はい' && q.choices[1].text === 'いいえ') return indices;
    const orders = reviewing ? state.review.choiceOrders : state.choiceOrders;
    if (!validOrder(orders[q.id], indices)) { orders[q.id] = shuffle(indices); save(); }
    return orders[q.id];
  }
  const validAnswer = (q, a) => object(a) && Array.isArray(a.selected) && a.selected.length > 0 &&
    new Set(a.selected).size === a.selected.length && a.selected.every(i => Number.isInteger(i) && i >= 0 && i < q.choices.length) &&
    (q.multiple || a.selected.length === 1) && (!q.revision || a.revision === q.revision);
  const answer = q => validAnswer(q, state.answers[q.id]) ? state.answers[q.id] : null;
  const isCorrect = (q, values) => q.accepted.some(set => set.length === values.length && set.every(i => values.includes(i)));
  const wrong = scope => questions.filter(q => (scope === 'all' || q.group === scope) && state.mistakes[q.id]);
  const count = group => list(group).filter(q => answer(q)).length;
  // Preserve old progress. Revised questions invalidate only their old answers.
  if (state.version !== 2) {
    for (const q of questions) {
      const a = answer(q);
      if (a && !isCorrect(q, a.selected)) state.mistakes[q.id] = true;
    }
    state.version = 2;
    save();
  }
  if (state.review !== undefined && (!object(state.review) || !Array.isArray(state.review.ids) || !object(state.review.answers) ||
      !['all', ...groups].includes(state.review.scope) || !state.review.ids.length ||
      new Set(state.review.ids).size !== state.review.ids.length || state.review.ids.some(id => !byId.has(id)))) delete state.review;
  if (state.review && !object(state.review.choiceOrders)) state.review.choiceOrders = {};
  let selected = [], current, reviewing = false;
  const reviewSet = () => (state.review?.ids || []).map(id => byId.get(id));
  const currentSet = () => reviewing ? reviewSet() : orderedList(current.group);
  const activeAnswer = q => reviewing ? (validAnswer(q, state.review.answers[q.id]) ? state.review.answers[q.id] : null) : answer(q);
  function go(id) { if (location.hash === `#${id}`) route(); else location.hash = id; }
  const questionRoute = id => `${reviewing ? 'review-' : ''}${id}`;
  function route() {
    selected = [];
    const match = location.hash.match(/^#(review-)?(Q\d+-\d{2})$/);
    current = match ? byId.get(match[2]) : null;
    reviewing = !!match?.[1];
    if (current && reviewing && !state.review?.ids.includes(current.id)) current = null;
    if (current) {
      state.last = questionRoute(current.id); save(); renderQuestion();
    } else if (location.hash === '#done-review' && state.review) renderDone(state.review.scope, true);
    else if (location.hash.startsWith('#done-') && groups.includes(location.hash.slice(6))) renderDone(location.hash.slice(6));
    else renderHome();
    window.scrollTo(0, 0);
  }
  function start(group) { const set = orderedList(group); go((set.find(q => !answer(q)) || set[0]).id); }
  function restart(group) {
    delete state.orders[group];
    const set = orderedList(group);
    set.forEach(q => { delete state.answers[q.id]; delete state.choiceOrders[q.id]; });
    // The mistake list is independent, so restarting never loses work to review.
    save(); go(set[0].id);
  }
  function startReview(scope) {
    const ids = shuffle(wrong(scope).map(q => q.id));
    if (!ids.length) { renderHome(); return; }
    state.review = {scope, ids, answers: {}, choiceOrders: {}};
    save(); go(`review-${ids[0]}`);
  }
  function renderHome() {
    document.title = 'AZ-900 問題集';
    const nWrong = wrong('all').length;
    const lastId = state.last?.replace(/^review-/, '');
    const canResume = byId.has(lastId) && (!state.last.startsWith('review-') || state.review?.ids.includes(lastId));
    app.innerHTML = `<section class="hero"><div><p class="eyebrow">AZURE FUNDAMENTALS / PRACTICE</p><h1>一問ずつ、理解を深める。</h1><p>答え合わせ、理由、用語の役割まで。<br>間違えた問題を繰り返して、理解を定着させましょう。</p></div><div class="total"><strong>${questions.length}</strong> 問収録</div></section>
      <section class="review-banner" aria-label="間違えた問題の復習"><div><p class="eyebrow">REVIEW</p><h2>間違えた問題だけ、もう一度。</h2><p>${nWrong ? `未克服の問題は ${nWrong} 問。正解すると復習リストから外れます。` : '間違えた問題はここにたまります。正解すると復習リストから外れます。'}</p></div><button class="primary" data-review="all"${nWrong ? '' : ' disabled'}>誤答のみ ${nWrong}問を演習 →</button></section>
      ${canResume ? `<div class="resume"><p>前回の続き <strong>${state.last.startsWith('review-') ? '誤答復習・' : ''}${esc(lastId)}</strong></p><button class="text-button" id="resume">続きから解く →</button></div>` : ''}
      <div class="section-heading"><h2>問題セットを選ぶ</h2><span>Q1〜Q6 各70問 / Q7 40問・ランダム出題</span></div><div class="sets">${groups.map((group, i) => {
        const n = count(group), total = list(group).length, mistakes = wrong(group).length;
        return `<article class="set" aria-label="${group} 演習問題"><div class="set-top"><span class="set-number">${group}</span><span class="set-count">${total}問</span></div><p class="set-title">${group === 'Q7' ? '総仕上げ / mogimondai.pdf' : `AZ-900 演習問題 ${String(i+1).padStart(2, '0')}`}</p><div class="meter"><span style="width:${n/total*100}%"></span></div><p class="set-bottom">${n} / ${total} 問回答 <span>・未克服 ${mistakes}問</span></p><div class="set-actions"><button class="primary" data-start="${group}">最初から解く <span aria-hidden="true">→</span></button>${n ? `<button class="secondary" data-group="${group}">${n < total ? '続きから解く' : '解答を見直す'}</button>` : ''}<button class="secondary review-button" data-review="${group}"${mistakes ? '' : ' disabled'}>間違えた問題のみ ${mistakes}問</button></div>${n ? '<p class="set-reset-note">「最初から」で回答をリセット。誤答リストは残ります。</p>' : ''}</article>`;
      }).join('')}</div><p class="home-note">Q7は提供された総仕上げ40問を基に、現行仕様と回答形式に合わせて再構成しています。<br>正解・解説は学習用です。回答・誤答履歴はこの端末の同じブラウザーに保存されます。</p>`;
    app.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => start(b.dataset.group)));
    app.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => restart(b.dataset.start)));
    bindReviews();
    document.getElementById('resume')?.addEventListener('click', () => go(state.last));
  }
  function bindReviews() { app.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => startReview(b.dataset.review))); }
  function renderQuestion() {
    const q = current, saved = activeAnswer(q), set = currentSet(), index = set.findIndex(x => x.id === q.id), order = choiceOrder(q);
    const answered = set.filter(x => activeAnswer(x)).length;
    document.title = `${reviewing ? '誤答復習・' : ''}${q.group}・問題${q.number} | AZ-900 問題集`;
    app.innerHTML = `<div class="quiz-top"><button class="back" id="home">← 問題セット</button><div class="quiz-tools"><button class="text-button" id="density" aria-pressed="${state.roomy === true}">${state.roomy ? 'ゆったり表示' : 'コンパクト表示'}</button><select class="question-select" id="jump" aria-label="問題を選ぶ">${set.map(x => `<option value="${x.id}"${x.id === q.id ? ' selected' : ''}>${reviewing ? `${x.group}・` : ''}問題 ${x.number}${activeAnswer(x) ? ' 回答済み' : ''}</option>`).join('')}</select></div></div>
      <div class="quiz-meta"><h1><span class="pill">${reviewing ? '誤答復習' : q.group}</span> ${reviewing ? `${q.group}・` : ''}問題 ${String(q.number).padStart(2, '0')}</h1><span class="count">${index+1} / ${set.length}</span></div><div class="quiz-progress" aria-label="${set.length}問中${index+1}問目"><span style="width:${(index+1)/set.length*100}%"></span></div>
      <div class="quiz-body${saved ? ' has-feedback' : ''}${state.roomy ? ' roomy' : ''}"><section class="question-card" aria-label="問題と回答"><div class="prompt-text">${esc(q.prompt)}</div>
      <p class="answer-hint">${q.multiple ? '複数選択：選んでから下の「回答する」をタップ' : '1つ選択：タップして答え合わせ'}</p><div class="choices" role="group" aria-label="回答の選択肢">${order.map((i, position) => {
        const c = q.choices[i];
        const picked = saved ? saved.selected.includes(i) : selected.includes(i);
        let cls = 'choice' + (q.multiple ? ' multiple' : ''), symbol = String.fromCharCode(65+position);
        if (!saved && picked) cls += ' chosen';
        if (saved && q.accepted.some(a => a.includes(i))) { cls += ' correct'; symbol = '✓'; }
        else if (picked && saved) { cls += ' incorrect'; symbol = '×'; }
        return `<button class="${cls}" data-choice="${i}" aria-label="${String.fromCharCode(65+position)}: ${esc(c.text)}" aria-pressed="${!!picked}"${saved ? ' disabled' : ''}><span class="choice-label" aria-hidden="true">${symbol}</span><span class="choice-text">${esc(c.text)}</span></button>`;
      }).join('')}</div></section><div id="feedback-slot">${saved ? feedback(q, saved) : ''}</div></div>
      <nav class="quiz-nav" aria-label="問題の移動"><div class="nav-inner"><button class="secondary" id="prev"${index === 0 ? ' disabled' : ''}>← 前へ</button><div class="nav-status">${saved ? `<strong class="${isCorrect(q, saved.selected) ? 'status-correct' : 'status-wrong'}">${isCorrect(q, saved.selected) ? '✓ 正解' : '× 不正解'}</strong>` : `<span>${answered} / ${set.length} 問回答</span>`}${!saved && q.multiple ? `<button class="primary" id="submit"${selected.length ? '' : ' disabled'}>回答する</button>` : ''}</div><button class="primary" id="next">${index === set.length-1 ? '結果を見る' : saved ? '次の問題 →' : '次へ →'}</button></div></nav>`;
    document.getElementById('home').addEventListener('click', () => go(''));
    document.getElementById('density').addEventListener('click', () => { state.roomy = !state.roomy; save(); renderQuestion(); });
    document.getElementById('jump').addEventListener('change', e => go(questionRoute(e.target.value)));
    app.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.choice);
      if (!q.multiple) { selected = [i]; submit(); return; }
      selected = selected.includes(i) ? selected.filter(v => v !== i) : [...selected, i];
      b.classList.toggle('chosen', selected.includes(i)); b.setAttribute('aria-pressed', String(selected.includes(i)));
      document.getElementById('submit').disabled = !selected.length;
    }));
    document.getElementById('submit')?.addEventListener('click', submit);
    document.getElementById('prev').addEventListener('click', () => go(questionRoute(set[index-1].id)));
    document.getElementById('next').addEventListener('click', () => go(index === set.length-1 ? reviewing ? 'done-review' : `done-${q.group}` : questionRoute(set[index+1].id)));
    document.getElementById('retry')?.addEventListener('click', () => {
      if (reviewing) delete state.review.answers[q.id]; else delete state.answers[q.id];
      selected = []; save(); renderQuestion();
    });
  }
  function feedback(q, a) {
    const correct = isCorrect(q, a.selected), order = choiceOrder(q);
    return `<section class="feedback${correct ? '' : ' wrong'}" id="feedback" aria-label="答えと解説"><h2 class="feedback-heading" role="status" aria-live="polite">${correct ? '✓ 正解です' : '× 不正解です'}</h2><p class="correct-answer">正解：${q.accepted.map(set => [...set].sort((a, b) => order.indexOf(a)-order.indexOf(b)).map(i => `${String.fromCharCode(65+order.indexOf(i))}：${esc(q.choices[i].text)}`).join(' ／ ')).join(' または ')}</p>
      <h3>問題のポイント</h3><p>${esc(q.focus)}</p><h3>なぜこの答え？</h3><p>${esc(q.explanation)}</p>${q.terms?.length ? `<h3>用語の意味と役割</h3><dl class="terms">${q.terms.map(t => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.role)}</dd></div>`).join('')}</dl>` : ''}
      ${q.sources?.length ? `<details class="references"><summary>公式資料${q.checkedAt ? `・${esc(q.checkedAt)} 確認` : ''}${q.origin ? ` / 原資料 問${q.origin.question}` : ''}</summary><div class="sources">${q.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div></details>` : ''}<button class="text-button retry" id="retry">もう一度解く ↻</button></section>`;
  }
  function submit() {
    if (activeAnswer(current) || !selected.length) return;
    const a = {selected: [...selected].sort((x, y) => x-y), revision: current.revision || 1};
    state.answers[current.id] = a;
    if (reviewing) state.review.answers[current.id] = a;
    if (isCorrect(current, selected)) delete state.mistakes[current.id]; else state.mistakes[current.id] = true;
    selected = []; save(); renderQuestion();
    const fb = document.getElementById('feedback');
    if (fb && fb.getBoundingClientRect().bottom > window.innerHeight-100 && !window.matchMedia('(min-width: 1000px)').matches) {
      fb.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
    }
  }
  function renderDone(group, review = false) {
    const set = review ? reviewSet() : orderedList(group);
    const getAnswer = q => review ? (validAnswer(q, state.review.answers[q.id]) ? state.review.answers[q.id] : null) : answer(q);
    const answered = set.filter(q => getAnswer(q)), correct = answered.filter(q => isCorrect(q, getAnswer(q).selected)).length;
    const mistakes = wrong(group).length;
    document.title = '演習結果 | AZ-900 問題集';
    app.innerHTML = `<section class="done-card"><p class="eyebrow">${review ? 'REVIEW' : esc(group)} / RESULT</p><h1>${answered.length === set.length ? 'おつかれさまでした。' : 'ここまでの結果'}</h1><p>${set.length}問中 ${answered.length}問を回答しました。</p><div class="done-score">${correct}<span> / ${answered.length} 問正解</span></div><p>${mistakes ? `この範囲の未克服は ${mistakes} 問。誤答のみの演習で確かめましょう。` : 'この範囲に未克服の問題はありません。'}</p><div class="done-actions"><button class="secondary" id="done-home">問題セットへ</button><button class="primary" data-review="${esc(group)}"${mistakes ? '' : ' disabled'}>間違えた問題のみ ${mistakes}問</button>${review ? '<button class="secondary" id="continue">復習の回答を見直す</button>' : `<button class="secondary" id="continue">${answered.length < set.length ? '未回答の問題へ' : '解答を見直す'}</button><button class="secondary" id="restart">最初から解く</button>`}</div></section>`;
    document.getElementById('done-home').addEventListener('click', () => go(''));
    document.getElementById('restart')?.addEventListener('click', () => restart(group));
    document.getElementById('continue').addEventListener('click', () => review ? go(`review-${set[0].id}`) : start(group));
    bindReviews();
  }
  window.addEventListener('hashchange', route);
  route();
})();
