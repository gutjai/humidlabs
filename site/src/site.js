'use strict';

document.documentElement.classList.remove('pre');

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
    document.dispatchEvent(new CustomEvent('dewpoint-reveal', { detail: false }));
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
      document.dispatchEvent(new CustomEvent('dewpoint-reveal', { detail: true }));
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
    const scoreValue = document.createElement('strong');
    scoreValue.textContent = score + '%';
    result.querySelector('[data-score]').replaceChildren(scoreValue, ' readiness · ' + total + ' of ' + 2 * copy.questions.length + ' points');
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

const menuButton = document.querySelector('.menu-toggle');
const mobileNavigation = document.getElementById('mobile-navigation');
const tablet = matchMedia('(max-width:899px)');
function toggleMenu(open, returnFocus = false) {
  mobileNavigation.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (returnFocus) menuButton.focus();
}
menuButton.hidden = !tablet.matches;
tablet.addEventListener('change', () => { menuButton.hidden = !tablet.matches; toggleMenu(false); });
menuButton.addEventListener('click', () => toggleMenu(mobileNavigation.hidden));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mobileNavigation.hidden) toggleMenu(false, true);
});
document.addEventListener('click', event => {
  if (!mobileNavigation.hidden && !event.target.closest('.site-header')) toggleMenu(false);
});

const header = document.querySelector('.site-header');
const services = document.querySelector('.services');
const trackElement = services?.querySelector('.service-track');
const panels = [...(trackElement?.children ?? [])];
const scrollTimeline = CSS.supports('animation-timeline: view()');
const pinned = matchMedia('(min-width:900px) and (prefers-reduced-motion:no-preference)');
const progressLabel = services?.querySelector('.service-progress');
let scrollFrame;
function updateScroll() {
  scrollFrame = 0;
  header.classList.toggle('is-scrolled', scrollY > 80);
  if (!services || !pinned.matches || !scrollTimeline) return;
  const pin = services.firstElementChild;
  const length = services.offsetHeight - pin.offsetHeight;
  const progress = Math.min(1, Math.max(0, (80 - services.getBoundingClientRect().top) / length));
  progressLabel.style.setProperty('--progress', progress * 100 + '%');
  progressLabel.firstElementChild.textContent = String(1 + Math.round(progress * (panels.length - 1))).padStart(2, '0');
}
function scheduleScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
}
function updatePin() {
  services?.classList.toggle('is-pinned', pinned.matches && scrollTimeline);
  scheduleScroll();
}
pinned.addEventListener('change', updatePin);
window.addEventListener('scroll', scheduleScroll, { passive: true });
window.addEventListener('resize', scheduleScroll, { passive: true });
updatePin();
trackElement?.addEventListener('focusin', event => {
  if (!pinned.matches || !scrollTimeline) return;
  const panel = event.target.closest('.service-panel');
  if (!panel) return;
  services.firstElementChild.scrollLeft = 0;
  const position = panels.indexOf(panel) / (panels.length - 1);
  const length = services.offsetHeight - services.firstElementChild.offsetHeight;
  scrollTo(0, scrollY + services.getBoundingClientRect().top - 80 + position * length);
  updateScroll();
});

const indexLinks = [...document.querySelectorAll('.page-index a')];
if (indexLinks.length) {
  const setCurrent = current => {
    for (const link of indexLinks) {
      if (link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const index = new IntersectionObserver(entries => {
    const current = entries.find(entry => entry.isIntersecting);
    if (current) setCurrent(current.target);
  }, { rootMargin: '-18% 0px -60% 0px' });
  indexLinks.forEach(link => index.observe(document.getElementById(link.hash.slice(1))));
  setCurrent(document.getElementById(indexLinks[0].hash.slice(1)));
}

if (!motion.matches) {
  const ease = 'cubic-bezier(.22,.7,.25,1)';
  const lift = (element, delay, duration) => element?.animate(
    [{ opacity: 0, translate: '0 .6em' }, { opacity: 1, translate: '0 0' }],
    { delay, duration, easing: ease, fill: 'backwards' }
  );
  lift(header.querySelector('.logo'),60,600);
  lift(header.querySelector('.nav-pill'),150,700);
  lift(header.querySelector('[data-audit]'),200,700);
  lift(document.querySelector('.hero .eyebrow'),300,520);
  document.querySelector('.hero .intro')?.animate(
    [{ translate: '0 .7em' }, { translate: '0 0' }],
    { delay: 760, duration: 560, easing: ease, fill: 'backwards' }
  );
  lift(document.querySelector('.hero .actions'),840,700);
  lift(document.querySelector('.scene-bar'),1000,520);
  for (const [index, line] of [...document.querySelectorAll('.hero .line')].entries()) {
    line.animate([{clipPath:'inset(100% 0 -14% 0)',translate:'0 .16em'},{clipPath:'inset(-18% 0 -14% 0)',translate:'0 0'}],
      {delay:380+index*90,duration:980,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
  }
  const sectionEntry = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const element = entry.target;
    sectionEntry.unobserve(element);
    if (!motion.matches) lift(element, Number(element.dataset.revealDelay || 0), element.matches('h2') ? 900 : 700);
  }), {rootMargin:'0px 0px -10% 0px'});
  document.querySelectorAll('.section-heading h2,.prose h2,.cards .card,.industry').forEach(element => {
    if (element.matches('.card,.industry')) element.dataset.revealDelay = [...element.parentElement.children].indexOf(element)*80;
    sectionEntry.observe(element);
  });
}

const precise = matchMedia('(hover:hover) and (pointer:fine)');
const wordmark = document.querySelector('.wordmark');
let fogX = 0, fogY = -300, goalX = 0, goalY = -300, fogFrame = 0;
function moveFog() {
  fogX += (goalX-fogX)*.12;
  fogY += (goalY-fogY)*.12;
  wordmark.style.setProperty('--x', fogX + 'px');
  wordmark.style.setProperty('--y', fogY + 'px');
  fogFrame = Math.abs(goalX-fogX)+Math.abs(goalY-fogY) > 1 ? requestAnimationFrame(moveFog) : 0;
}
wordmark.addEventListener('pointermove', event => {
  if (!precise.matches || motion.matches) return;
  const box = wordmark.getBoundingClientRect();
  goalX = event.clientX-box.left;
  goalY = event.clientY-box.top;
  if (!fogFrame) fogFrame = requestAnimationFrame(moveFog);
}, {passive:true});
wordmark.addEventListener('pointerleave', () => {
  if (!precise.matches || motion.matches) return;
  goalY = -300;
  if (!fogFrame) fogFrame = requestAnimationFrame(moveFog);
});

const magnetic = header.querySelector('[data-audit]');
header.addEventListener('pointermove', event => {
  if (!precise.matches || motion.matches) return;
  const box = magnetic.getBoundingClientRect();
  const x = event.clientX-box.left-box.width/2;
  const y = event.clientY-box.top-box.height/2;
  const active = Math.hypot(Math.max(0,Math.abs(x)-box.width/2),Math.max(0,Math.abs(y)-box.height/2)) < 80;
  magnetic.style.setProperty('--mx', (active ? Math.max(-10,Math.min(10,x*.25)) : 0)+'px');
  magnetic.style.setProperty('--my', (active ? Math.max(-10,Math.min(10,y*.25)) : 0)+'px');
}, {passive:true});
header.addEventListener('pointerleave', () => {
  magnetic.style.removeProperty('--mx');
  magnetic.style.removeProperty('--my');
});
document.querySelectorAll('.industry').forEach(tile => tile.addEventListener('pointermove', event => {
  if (!precise.matches || motion.matches) return;
  const box = tile.getBoundingClientRect();
  tile.style.setProperty('--chip-x',event.clientX-box.left+'px');
  tile.style.setProperty('--chip-y',event.clientY-box.top+'px');
}, {passive:true}));
