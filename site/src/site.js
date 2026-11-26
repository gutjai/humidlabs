'use strict';

const { page, root, goat, brand } = document.body.dataset;
const canonical = new URL(document.querySelector('link[rel="canonical"]').href);
const dialog = document.getElementById('reveal-dialog');
const direct = document.querySelector('[data-direct-reveal]');
const goatOrigin = goat ? 'https://' + goat + '.goatcounter.com' : '';
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const campaignKey = root + 'campaign';
const query = new URLSearchParams(location.search);
const cleanCampaign = value => /^[a-z0-9-]{1,32}$/i.test(value ?? '') ? value.toLowerCase() : '';
let campaign = cleanCampaign(query.get('ref')) || cleanCampaign(query.get('utm_source'));
try {
  if (campaign) sessionStorage.setItem(campaignKey, campaign);
  else campaign = cleanCampaign(sessionStorage.getItem(campaignKey));
} catch {}

const analyticsEnabled = Boolean(goat && location.origin === canonical.origin &&
  navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl && !navigator.webdriver);

function count(path, event = false) {
  if (!analyticsEnabled) return;
  const params = new URLSearchParams({ p: path, rnd: String(Math.random()) });
  if (event) params.set('e', '1');
  else { if (document.referrer) params.set('r', new URL(document.referrer).origin); if (campaign) params.set('q', 'ref=' + campaign); }
  fetch(goatOrigin + '/count?' + params, {
    mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true
  }).catch(() => {});
}

if (analyticsEnabled) {
  count(root + page.slice(1));
  if (campaign && query.has('ref')) count('ref/' + campaign, true);
  const checkDepth = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY / max >= .75 && !dialog?.open) {
      count('scroll-75', true);
      window.removeEventListener('scroll', checkDepth);
    }
  };
  window.addEventListener('scroll', checkDepth, { passive: true });
  checkDepth();
}

let opener;
let revealTimer;
let completed = false;

function scheduleCompletion() {
  clearTimeout(revealTimer);
  if (!analyticsEnabled || completed || document.hidden || (!dialog?.open && !direct)) return;
  revealTimer = setTimeout(() => {
    completed = true;
    count('reveal-complete', true);
    if (campaign) count('ref/' + campaign + '/reveal', true);
  }, 1000);
}

document.addEventListener('visibilitychange', scheduleCompletion);
if (direct) scheduleCompletion();

if (dialog) {
  const content = dialog.querySelector('.dialog-content');
  const template = dialog.querySelector('template');
  const closeButton = dialog.querySelector('[data-close]');

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(revealTimer);
    content.replaceChildren();
    opener?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button, video[controls]')].filter(control => !control.disabled && control.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  for (const link of document.querySelectorAll('[data-audit]')) {
    link.addEventListener('click', event => {
      track('audit-click/' + link.dataset.audit);
      count('audit-click', true);
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
          typeof dialog.showModal !== 'function') return;
      event.preventDefault();
      if (dialog.open) return;
      opener = link;
      content.replaceChildren(template.content.cloneNode(true));
      if (link.dataset.audit === 'tool-readiness' && recommendations.length) {
        const report = content.querySelector('[data-reveal-recommendations]');
        const heading = document.createElement('h3');
        heading.textContent = 'Your assessment recommendations';
        const list = document.createElement('ol');
        fillRecommendations(list);
        report.append(heading, list);
      }
      initParty(content);
      completed = false;
      dialog.showModal();
      closeButton.focus();
      scheduleCompletion();
    });
  }
}

async function share(button) {
  count('share-click', true);
  const copy = button.closest('.share-control');
  const status = copy.querySelector('.share-status');
  const manual = copy.querySelector('.manual-share');
  const shareUrl = manual.querySelector('a').href;
  const shareData = { title: brand, text: button.dataset.shareText || '', url: shareUrl };
  manual.hidden = true;
  status.textContent = '';
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText((shareData.text ? shareData.text + ' ' : '') + shareUrl);
    status.textContent = 'Link copied — send it to a friend.';
  } catch {
    status.textContent = 'Open the site and copy its link from the address bar.';
    manual.hidden = false;
    manual.querySelector('a').focus();
  }
}

const reactionKey = root + 'reaction';
let reaction = '';
try { reaction = localStorage.getItem(reactionKey) || ''; } catch {}

function renderReaction(scope) {
  for (const button of scope.querySelectorAll('[data-react]')) {
    button.disabled = false;
    button.setAttribute('aria-pressed', String(button.dataset.react === reaction));
    button.setAttribute('aria-disabled', String(Boolean(reaction)));
  }
  for (const status of scope.querySelectorAll('.reaction-status')) {
    status.textContent = reaction ? 'Reaction locked in!' : '';
  }
}

async function publicCount(element, url) {
  try {
    const response = await fetch(url, {
      credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    if (!response.ok) return;
    const { count } = await response.json();
    if (typeof count !== 'string' || !/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(count)) return;
    element.textContent = count;
    element.hidden = false;
    if (element.parentElement.matches('.party-counts p')) {
      element.parentElement.hidden = false;
      element.closest('.party-counts').querySelector('[data-no-counts]').hidden = true;
    }
  } catch {}
}

function initParty(scope) {
  for (const button of scope.querySelectorAll('[data-share]')) button.hidden = false;
  renderReaction(scope);
  if (goatOrigin) {
    for (const element of scope.querySelectorAll('[data-total]')) void publicCount(element, goatOrigin + '/counter/' + encodeURIComponent(element.dataset.total) + '.json');
  }
}

function celebrate(button) {
  if (motion.matches) return;
  button.animate([{ scale: '1' }, { scale: '1.13', offset: .38 }, { scale: '1' }], 360);
  const burst = document.createElement('span');
  burst.className = 'confetti';
  burst.setAttribute('aria-hidden', 'true');
  button.append(burst);
  for (let i = 0; i < 12; i++) {
    const piece = document.createElement('i');
    const angle = i * Math.PI / 6;
    piece.style.setProperty('--x', Math.round(Math.cos(angle) * 66) + 'px');
    piece.style.setProperty('--y', Math.round(Math.sin(angle) * 66) + 'px');
    piece.style.setProperty('--hue', String(i * 31));
    burst.append(piece);
  }
  setTimeout(() => burst.remove(), 700);
}

initParty(document);
window.addEventListener('storage', event => {
  if (event.key !== reactionKey) return;
  reaction = event.newValue || '';
  renderReaction(document);
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-share]');
  if (button) void share(button);
  if (event.target.closest('[data-portfolio]')) count('portfolio-click', true);
  const reactionButton = event.target.closest('[data-react]');
  if (!reactionButton || reaction) return;
  try { reaction = localStorage.getItem(reactionKey) || ''; } catch {}
  if (!reaction) {
    reaction = reactionButton.dataset.react;
    try { localStorage.setItem(reactionKey, reaction); } catch {}
    count('react/' + reaction, true);
    celebrate(reactionButton);
  }
  renderReaction(document);
});



const quiz = document.querySelector('[data-quiz]');
let recommendations = [];
function fillRecommendations(list) {
  list.replaceChildren(...recommendations.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}
if (quiz) {
  const copy = JSON.parse(document.getElementById('quiz-data').textContent);
  const start = quiz.querySelector('[data-start]');
  const form = quiz.querySelector('form');
  const result = quiz.querySelector('[data-result]');
  const answers = form.querySelector('[data-answers]');
  const next = form.querySelector('[type=submit]');
  const back = form.querySelector('[data-back]');
  const legend = form.querySelector('legend');
  const values = [];
  let step = 0;
  function showQuestion() {
    legend.textContent = copy.questions[step][0];
    form.querySelector('.progress-label').textContent = 'Question ' + (step + 1) + ' of ' + copy.questions.length;
    form.querySelector('progress').value = step + 1;
    form.querySelector('progress').setAttribute('aria-label', 'Assessment progress');
    back.disabled = step === 0;
    next.disabled = values[step] === undefined;
    answers.replaceChildren(...copy.options.map((label, index) => {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'answer';
      input.value = index;
      input.checked = values[step] === index;
      option.append(input, label);
      return option;
    }));
    legend.tabIndex = -1;
    legend.focus();
  }
  function beginQuiz() {
    step = 0;
    values.length = 0;
    recommendations = [];
    start.hidden = result.hidden = true;
    form.hidden = false;
    track('tool-start');
    showQuestion();
  }
  start.addEventListener('click', beginQuiz);
  quiz.querySelector('[data-restart]').addEventListener('click', beginQuiz);
  form.addEventListener('change', event => {
    if (event.target.name !== 'answer') return;
    values[step] = Number(event.target.value);
    next.disabled = false;
  });
  back.addEventListener('click', () => { step--; showQuestion(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (values[step] === undefined) return;
    if (step + 1 < copy.questions.length) {
      step++;
      showQuestion();
      return;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    const score = Math.round(total / (2 * copy.questions.length) * 100);
    const heading = result.querySelector('h2');
    heading.textContent = copy.bands[score < 45 ? 0 : score < 80 ? 1 : 2];
    result.querySelector('[data-score]').textContent = score + '% readiness · ' + total + ' of ' + 2 * copy.questions.length + ' points';
    recommendations = copy.questions.map(([, action], index) => ({ action, value: values[index] }))
      .sort((a, b) => a.value - b.value).slice(0, 3).map(item => item.action);
    fillRecommendations(result.querySelector('ol'));
    form.hidden = true;
    result.hidden = false;
    heading.focus();
    track('tool-complete');
  });
}
function track(name) {
  count(name, true);
  if (campaign) count('ref/' + campaign + '/' + name, true);
}
for (const slot of document.querySelectorAll('[data-public-counter]')) {
  const counterUrl = slot.dataset.publicCounter;
  if (/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/counter\//.test(counterUrl)) void publicCount(slot, counterUrl);
}
const mobileAudit = document.querySelector('.mobile-audit');
const heroAudit = document.querySelector('[data-audit=hero]');
if (mobileAudit && heroAudit) {
  new IntersectionObserver(([entry]) => {
    const hidden = entry.isIntersecting || entry.boundingClientRect.top >= 0;
    if (hidden && mobileAudit.contains(document.activeElement)) heroAudit.focus({ preventScroll:true });
    mobileAudit.hidden = hidden;
  }).observe(heroAudit);
}

