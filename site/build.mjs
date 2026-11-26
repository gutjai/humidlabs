
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml as h, markdown } from './markdown.mjs';

const site = dirname(fileURLToPath(import.meta.url));
const src = join(site, 'src');
const dist = join(site, 'dist');
const content = join(site, '..', 'content');
const read = async file => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const json = async (directory, file) => JSON.parse(await read(join(directory, file + '.json')));
const [config, copy, pages, faq, projects] = await Promise.all([
  json(src, 'config'), ...['site', 'pages', 'faq', 'work'].map(file => json(content, file))
]);
const { brandName, ownerContactUrl, goatCounterCode } = config;
const base = new URL(config.siteBaseUrl);
if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash || base.username || base.password) {
  throw new Error('Use an HTTP(S) siteBaseUrl without credentials, query or fragment.');
}
if (!base.pathname.endsWith('/')) base.pathname += '/';
if (goatCounterCode && !/^[a-z\d][a-z\d-]*$/i.test(goatCounterCode)) throw new Error('Use a GoatCounter site code.');
const root = base.pathname;
const abs = route => new URL(route.replace(/^\//, ''), base).href;
const url = route => h(root + route.replace(/^\//, ''));
const expand = value => value.replaceAll('{{brandName}}', () => brandName);
const routes = new Map();
const renderText = value => markdown(expand(value), { root }).html;
const link = (route, label, classes = '') => `<a class="${classes}" href="${url(route)}">${h(label)}</a>`;
const audit = (location, label = copy.audit) => `<a class="button" href="${url('gotcha/')}" data-audit="${location}">${h(label)} <span aria-hidden="true">↗</span></a>`;
const organization = {
  '@type': 'Organization', '@id': abs('/#organization'), name: brandName, url: abs('/'),
  logo: abs('assets/icon.svg'), areaServed: [{ '@type': 'City', name: 'Brisbane' }, { '@type': 'State', name: 'Queensland' }]
};
const logo = `<a class="logo" href="${url('/')}"><img src="${url('assets/icon.svg')}" width="34" height="34" alt="">${h(brandName)}</a>`;
const navigation = (current = '', roll = false) => copy.nav.map(([label, route]) => {
  const letters = [...label].map((letter, i) => `<i style="--i:${i}">${h(letter)}</i>`).join('');
  return `<a href="${url(route)}"${roll ? ` aria-label="${h(label)}"` : ''}${current.startsWith(route) ? ' aria-current="page"' : ''}>${roll ?
    `<span class="roll"><span>${letters}</span><span class="roll-b" aria-hidden="true">${letters}</span></span>` : h(label)}</a>`;
}).join('');
const extraNav = [['About','about/'],['FAQ','faq/'],['AI readiness','tools/ai-readiness/']].map(([label,route]) => link(route,label)).join('');
const revealCopy = copy.reveal;
const shareUrl = abs('/?ref=share');

function reveal(heading) {
  const rankLine = revealCopy.rankingEvidenceUrl
    ? `<a href="${h(revealCopy.rankingEvidenceUrl)}">${h(revealCopy.verifiedLine)}</a>`
    : h(revealCopy.launchLine);
  return `<section class="reveal">
  <div class="eyebrow">${h(revealCopy.label)}</div>
  <div class="reveal-top"><div><${heading} id="reveal-title">${h(revealCopy.headline)}</${heading}><p class="rank-line">${rankLine}</p></div>
  <img src="${url('assets/face.jpg')}" width="200" height="200" alt="Portrait of Gavin Lau"></div>
  <p>${h(revealCopy.intro)}</p><div class="offers">${revealCopy.offers.map(([title, description]) => `<section><h3>${h(title)}</h3><p>${h(description)}</p></section>`).join('')}</div>
  <div data-reveal-recommendations></div>
  <div class="actions"><a class="button" data-portfolio href="${h(ownerContactUrl)}">${h(revealCopy.contact)} ↗</a>
  <div class="share-control"><button class="button ghost" data-share data-share-text="${h(revealCopy.shareText)}" hidden>${h(revealCopy.share)}</button>
  <span class="share-status" role="status"></span><span class="manual-share" hidden><a href="${h(shareUrl)}">${h(revealCopy.shareFallback)}</a></span></div></div>
  ${reactions()}<p class="footnote">No contact details were collected. ${link('about/', 'About this portfolio experiment')} · ${link('fooled/', revealCopy.counts)}</p></section>`;
}

function reactions() {
  return `<div class="reactions" aria-label="Reactions">${revealCopy.reactions.map(([key, name]) => `<button type="button" data-react="${key}" aria-pressed="false" disabled>${h(name)}</button>`).join('')}<span class="reaction-status" role="status"></span></div>`;
}
const dialog = `<dialog id="reveal-dialog" aria-labelledby="reveal-title"><button class="close" data-close aria-label="${h(revealCopy.close)}">×</button><div class="dialog-content"></div><template>${reveal('h2')}</template></dialog>`;

function cardList(entries) {
  return `<div class="cards">${entries.map(([route, [title, desc]], index) =>
    `<a class="card" href="${url(route)}"><span class="card-accent" aria-hidden="true">${['✳','◈','✺','◎'][index % 4]}</span><h3>${h(expand(title))}</h3><p>${h(desc)}</p><span class="card-arrow" aria-hidden="true">↗</span></a>`
  ).join('')}</div>`;
}
function children(parent) {
  return Object.entries(pages).filter(([route]) => route.startsWith(parent) && route.split('/').length === 3);
}
function work() {
  return `<div class="work-list">${projects.map(project => `<article class="project">
    <div class="project-art">${project.image ? `<img src="${url(project.image)}" alt="${h(project.imageAlt)}" width="960" height="600" loading="lazy">` : '<span aria-hidden="true">✳</span>'}</div>
    <div class="project-copy"><p class="eyebrow">${h(project.label)}</p><h2>${h(project.name)}</h2><p>${h(project.description)}</p>
    <p>${h(project.details)}</p><p class="tracking">${h(project.tracking)}</p>
    <dl class="metrics">${project.metrics.map(metric => `<div><dt>${h(metric.label)}</dt><dd data-public-counter="${h(metric.counterUrl)}">launching</dd></div>`).join('')}</dl>
    <div class="actions"><a class="button" data-portfolio href="${h(project.url)}">Visit the site ↗</a><a href="${h(project.revealUrl)}">See the reveal</a></div></div>
    </article>`).join('')}</div>`;
}

const picture = name => `<img src="${url('assets/' + name + '.webp')}" srcset="${url('assets/' + name + '-800.webp')} 800w, ${url('assets/' + name + '.webp')} 1600w" sizes="(max-width:700px) 100vw, 86vw" loading="lazy" alt="">`;
function home() {
  const services = children('services/').filter(([route]) => route !== 'services/ai-audit/');
  const industries = children('industries/');
  const statement = 'We start with the work that costs you time — or loses you enquiries.';
  const marquee = 'AI marketing ◦ Automation ◦ Team training ◦ Brisbane &amp; SEQ ◦ Remote-first ◦ ';
  return `<section class="hero" data-scene>
    <picture class="poster"><source media="(max-width:699px)" srcset="${url('assets/dewpoint-poster-mobile.webp')}"><img src="${url('assets/dewpoint-poster.webp')}" srcset="${url('assets/dewpoint-poster-800.webp')} 800w, ${url('assets/dewpoint-poster.webp')} 1600w" sizes="100vw" width="1600" height="900" alt="" fetchpriority="high"></picture>
    <div class="hero-copy wrap"><p class="eyebrow">${h(copy.homeLabel)}</p>
      <h1>${copy.homeLines.map(line => `<span class="line">${h(line).replace('boring', '<em>boring</em>')}</span>`).join(' ')}</h1>
      <p class="intro">${h(copy.homeIntro)}</p>
      <div class="actions">${audit('hero')}${link('services/', copy.homeSecondary, 'button ghost')}</div>
    </div>
    <div class="scene-bar wrap"><span class="scene-label">${h(copy.sceneLabel)}</span><span class="wipe-hint" hidden>✦ Wipe the glass</span>
      <div class="scene-controls" hidden><button data-morph aria-label="${h(copy.sceneToggle)}" aria-pressed="false">Switch view</button><button data-pause data-resume-label="${h(copy.sceneResume)}" aria-pressed="false">${h(copy.scenePause)}</button></div>
    </div></section>
  <section class="statement wrap"><p class="statement-copy">${statement.split(' ').map((word, i) => `<span style="--i:${i}">${/^(time|enquiries\.)$/.test(word) ? `<em>${h(word)}</em>` : h(word)}</span>`).join(' ')}</p>
    <p class="eyebrow statement-facts">${services.length} services ◦ ${industries.length} industries ◦ ${copy.tool.questions.length}-question readiness check</p></section>
  <section class="services" aria-labelledby="home-services" style="--panels:${services.length}"><div class="services-pin"><div class="section-heading wrap"><p class="eyebrow">Services</p><h2 id="home-services">${h(copy.homeSection)}</h2></div>
    <div class="service-track">${services.map(([route, [title, desc]], i) => `<a class="service-panel" href="${url(route)}">
      ${picture('service-' + i)}<div class="service-copy"><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${h(expand(title)).replace(/([^ ]+)$/, '<em>$1</em>')}</h3><p>${h(desc)}</p><span class="read-more">Read more ↗</span></div></a>`).join('')}</div>
    <p class="service-progress wrap" aria-hidden="true"><span>01</span> / 03 <i></i></p></div></section>
  <section class="industry-section wrap"><div class="section-heading"><p class="eyebrow">Industries</p><h2>AI in your day-to-day.</h2></div>
    <div class="industry-grid">${industries.map(([route, [title, desc]], i) => `<a class="industry" href="${url(route)}">${picture('industry-' + i)}<div class="industry-copy"><h3>${h(expand(title))}</h3><p>${h(desc)}</p></div><span class="cursor-chip" aria-hidden="true">View ↗</span></a>`).join('')}</div></section>
  <section class="readiness dusk"><div class="wrap"><div><h2>${h(copy.homeTool)}</h2><p>${h(copy.homeToolText)}</p>${link('tools/ai-readiness/', copy.homeToolAction + ' ↗', 'button')}</div><div class="question-stack" aria-hidden="true">${copy.tool.questions.slice(0, 3).map(([question]) => `<span>${h(question)}</span>`).join('')}</div></div></section>
  <section class="selected"><div class="section-heading wrap"><p class="eyebrow">Selected work</p><h2>From brief to build.</h2></div>${work()}</section>
  <div class="marquee"><span class="sr-only">${marquee}</span><div aria-hidden="true">${`<span>${marquee.repeat(3)}</span>`.repeat(2)}</div></div>`;
}
function quiz() {
  return `<section class="quiz" data-quiz><script type="application/json" id="quiz-data">${JSON.stringify(copy.tool).replaceAll('<', '\\u003c')}</script>
  <p>${h(copy.tool.intro)}</p><button class="button" type="button" data-start>${h(copy.tool.start)} ↗</button>
  <form hidden><p class="progress-label"></p><progress value="0" max="${copy.tool.questions.length}"></progress><fieldset><legend></legend><div data-answers></div></fieldset><div class="actions"><button class="button ghost" type="button" data-back>${h(copy.tool.back)}</button><button class="button" type="submit" disabled>${h(copy.tool.next)}</button></div></form>
  <div data-result hidden><h2 tabindex="-1"></h2><p data-score></p><h3>Your next steps</h3><ol></ol><div class="actions">${audit('tool-readiness', copy.tool.report)}<button class="button ghost" type="button" data-restart>${h(copy.tool.restart)}</button></div></div>
  <noscript><p>${link('guides/first-ai-marketing-pilot/', 'Read the first AI marketing pilot guide')} to assess your workflow without JavaScript.</p></noscript></section>`;
}
const hubFor = route => route.split('/')[0] + '/';
function crumbs(route, title) {
  const list = [['Home', '/']];
  const hub = hubFor(route);
  if (route !== hub && pages[hub]) list.push([copy.nav.find(([, target]) => target === hub)?.[0] || pages[hub][0], hub]);
  list.push([title, route]);
  return {
    html: `<nav class="crumbs" aria-label="Breadcrumb">${list.map(([label, path], i) => i === list.length - 1 ? `<span aria-current="page">${h(label)}</span>` : link(path, label)).join('<span aria-hidden="true">/</span>')}</nav>`,
    schema: { '@type': 'BreadcrumbList', itemListElement: list.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })) }
  };
}

const sources = {
  oaic: ['OAIC guidance on privacy and AI', 'https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products'],
  google: ['Google’s local ranking guidance', 'https://support.google.com/business/answer/7091?hl=en'],
  council: ['Brisbane City Council’s small business AI tips', 'https://brisbane.qld.gov.au/business-in-brisbane/business-in-brisbane-blog/9-tips-for-using-ai-in-small-business'],
  tafe: ['TAFE Queensland’s Introduction to Modern AI', 'https://tafeqld.edu.au/course/19/19404/intro-to-modern-ai']
};
const refs = keys => keys?.length ? `<section id="further-reading"><h2>Further reading</h2><ul>${keys.map(key => `<li><a href="${h(sources[key][1])}">${h(sources[key][0])}</a></li>`).join('')}</ul></section>` : '';
const extras = await json(content, 'details');

for (const [route, [rawTitle, description, intro, ...sections]] of Object.entries(pages)) {
  const { title: override, refs: references, related = [] } = extras[route] || {};
  const heading = expand(rawTitle);
  const title = expand(override || (route === '/' ? rawTitle : rawTitle + ' | {{brandName}}'));
  const schema = [];
  const noindex = ['gotcha/', 'fooled/'].includes(route);
  const guide = route.startsWith('guides/') && route !== 'guides/';
  const service = route.startsWith('services/') && route !== 'services/';
  let body;
  if (route === '/') body = home();
  else if (route === 'gotcha/') body = `<div class="direct" data-direct-reveal>${reveal('h1')}</div>`;
  else {
    const breadcrumb = crumbs(route, heading);
    schema.push(breadcrumb.schema);
    body = `<header class="page-head">${breadcrumb.html}<h1>${h(heading)}</h1>${intro ? `<p class="intro">${h(expand(intro))}</p>` : ''}</header>`;
    if (['services/', 'industries/', 'guides/'].includes(route)) body += cardList(children(route));
    if (sections.length) {
      const index = sections.map(([label], i) => [label, 'section-' + (i + 1)]);
      if (references?.length) index.push(['Further reading', 'further-reading']);
      const indexLinks = `<nav aria-label="On this page">${index.map(([label, id]) => `<a href="#${id}">${h(label)}</a>`).join('')}</nav>`;
      body += `<div class="editorial"><aside class="page-index"><p>On this page</p>${indexLinks}</aside>
        <details class="mobile-index"><summary>On this page</summary>${indexLinks}</details>
        <article class="prose">${sections.map(([label, text], i) => `<section id="${index[i][1]}"><h2>${h(label)}</h2>${renderText(text)}</section>`).join('')}${refs(references)}</article></div>`;
    }
    if (route === 'work/') body += work();
    if (route === 'tools/ai-readiness/') {
      body += quiz();
      schema.push({ '@type': 'WebApplication', name: heading, applicationCategory: 'BusinessApplication', isAccessibleForFree: true });
    }
    if (route === 'fooled/') body += `<div class="prose"><p>These counts reflect tracked actions during the experiment.</p><div class="party-counts">
      <p hidden><strong data-total="audit-click" hidden></strong> visitors clicked an audit button</p><p hidden><strong data-total="reveal-complete" hidden></strong> visitors viewed the reveal</p>
      <p data-no-counts>Public counts are launching.</p></div>${reactions()}${link('gotcha/', 'Meet Gavin')}</div>`;
    if (route === 'faq/') {
      body += `<div class="prose faq">${faq.map(([question, answer]) => `<details><summary>${h(question)}</summary>${renderText(answer)}</details>`).join('')}</div>`;
      schema.push({ '@type': 'FAQPage', mainEntity: faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text: renderText(text) } })) });
    }
    if (guide) schema.push({ '@type': 'Article', headline: heading, description, image: abs('assets/og.png'), author: { '@id': organization['@id'] }, mainEntityOfPage: abs(route), inLanguage: 'en-AU' });
    if (service) schema.push({ '@type': 'Service', name: heading, description, provider: { '@id': organization['@id'] }, areaServed: organization.areaServed[0] });
    if (related.length) body += `<div class="band"><h2>Keep going</h2>${cardList(related.map(target => [target, pages[target]]))}</div>`;
    if (!noindex && route !== 'tools/ai-readiness/') body += `<section class="tool-strip dusk"><div><h2>Pick your first project.</h2><p>Start with a free audit or work through the readiness assessment.</p></div><div class="actions">${audit('page-' + route.replaceAll('/', '-').replace(/-$/, ''))}${link('tools/ai-readiness/', 'Take the assessment', 'button ghost')}</div></section>`;
  }
  routes.set(route, { title, description, body, noindex, schema });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(['assets', 'vendor', 'styles.css', 'site.js', 'scene.js'].map(name => cp(join(src, name), join(dist, name), { recursive: true })));
for (const [route, { title, description, body, noindex, schema }] of routes) {
  const target = join(dist, route === '/' ? '' : route, 'index.html');
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': [organization, ...schema] }).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(title)}</title><meta name="description" content="${h(description)}"><link rel="canonical" href="${h(abs(route))}">
  ${noindex ? '<meta name="robots" content="noindex,follow">' : ''}<meta property="og:type" content="${route.startsWith('guides/') && route !== 'guides/' ? 'article' : 'website'}">
  <meta property="og:title" content="${h(title)}"><meta property="og:description" content="${h(description)}"><meta property="og:url" content="${h(abs(route))}">
  <meta property="og:image" content="${h(abs('assets/og.png'))}"><meta property="og:image:alt" content="Luminous particle illustration of the Brisbane River"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="${url('assets/icon.svg')}"><link rel="preload" href="${url('assets/fonts/geist-var.woff2')}" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${url('styles.css')}"><script type="application/ld+json">${graph}</script>
  <script>if (Element.prototype.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('pre');
    setTimeout(() => document.documentElement.classList.remove('pre'), 4000);
  }</script><script defer src="${url('site.js')}"></script>${route === '/' ? `<script type="module" src="${url('scene.js')}"></script>` : ''}</head>
  <body data-page="/${route === '/' ? '' : h(route)}" data-root="${h(root)}" data-goat="${h(goatCounterCode)}" data-brand="${h(brandName)}">
  <a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="header-inner">${logo}<nav class="nav-pill" aria-label="Main navigation">${navigation(route, true)}</nav><button class="menu-toggle button ghost" type="button" aria-expanded="false" aria-controls="mobile-navigation" hidden>Menu</button>${audit('header')}</div><nav id="mobile-navigation" aria-label="Mobile navigation" hidden>${navigation(route)}</nav></header>
  <main id="main" class="${route === '/' ? 'home' : 'page'}">${body}</main>
  <footer class="footer dusk"><div class="wrap footer-links"><div>${logo}<p>Brisbane &amp; South East Queensland · Remote-first</p></div><nav aria-label="Footer">${navigation()}${extraNav}</nav></div><div class="wordmark" aria-hidden="true"><span>${h(brandName)}</span><span>${h(brandName)}</span></div></footer>
  ${route === '/' ? `<div class="mobile-audit" hidden>${audit('mobile')}</div>` : ''}
  ${route === 'gotcha/' ? '' : dialog}</body></html>`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}
await Promise.all([
  writeFile(join(dist, '.nojekyll'), ''),
  writeFile(join(dist, '404.html'), '<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found</title><h1>Page not found</h1>' + link('/', 'Return to the homepage') + '</html>'),
  writeFile(join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + abs('sitemap.xml') + '\n'),
  writeFile(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...routes].filter(([, data]) => !data.noindex).map(([path]) => '<url><loc>' + h(abs(path)) + '</loc></url>').join('\n') + '</urlset>\n')
]);
console.log('Built ' + routes.size + ' pages in ' + dist);



