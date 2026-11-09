'use strict';

// All model entries are generated from the folders under /armies by build_site.py.
// GitHub Pages is static: no database or server-side application is required.

const state = { armies: [], army: null, filter: 'all', query: '' };
const $ = (id) => document.getElementById(id);
const dialog = $('model-dialog');
const sidebar = $('sidebar');
const menuButton = $('menu-button');
const scrim = $('mobile-scrim');
// Each army's logo comes from armies/<army>/logo.* via the build script; the Librarium bear is the fallback.
const armyLogo = (army) => army.logo || 'assets/logo.png';
let dialogCarousel = null;
const STATUS_LABELS = { done: 'Completed', ongoing: 'Ongoing', backlog: 'Backlog' };
// Corner badge on each card: empty circle for Backlog, half for Ongoing, check for Completed.
const STATUS_ICONS = {
  backlog: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/>',
  ongoing: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor"/>',
  done: '<circle cx="12" cy="12" r="8" fill="currentColor"/><path class="tick" d="m8.5 12.2 2.4 2.4 4.6-5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The build script turns a "Finished:" line into "2025-03"; show it as "March 2025".
function finishedLabel(model) {
  const [year, month] = model.finished.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function image(src, className, alt) {
  const node = document.createElement('img');
  node.src = src;
  node.className = className;
  node.alt = alt;
  node.loading = 'lazy';
  return node;
}
// Size the popup's photo area to the model's tallest photo, so it doesn't jump between photos.
function fitToTallestPhoto(holder, images) {
  let tallest = 1;
  images.forEach((src) => {
    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.naturalHeight / probe.naturalWidth;
      if (ratio > tallest) { tallest = ratio; holder.style.setProperty('--ratio', ratio); }
    };
    probe.src = src;
  });
}

// Reddit-style photo carousel: arrows on hover, dots over the photo, swipe on touch screens.
function attachCarousel(host, photo, images, variant) {
  let index = 0;
  const dots = element('div', 'carousel-dots');
  const dotNodes = images.map(() => dots.appendChild(element('span', 'carousel-dot')));
  const counter = variant === 'dialog' ? element('div', 'carousel-counter') : null;
  const makeArrow = (direction, label) => {
    // Cards are buttons themselves, so their arrows are spans to avoid nesting buttons.
    const arrow = element(variant === 'dialog' ? 'button' : 'span', `carousel-arrow ${direction}`);
    if (variant === 'dialog') arrow.type = 'button';
    else arrow.setAttribute('role', 'button');
    arrow.setAttribute('aria-label', label);
    arrow.innerHTML = direction === 'prev'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    arrow.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      show(index + (direction === 'prev' ? -1 : 1));
    });
    return arrow;
  };
  const prev = makeArrow('prev', 'Previous photo');
  const next = makeArrow('next', 'Next photo');

  function show(target) {
    index = Math.max(0, Math.min(images.length - 1, target));
    photo.src = images[index];
    dotNodes.forEach((dot, n) => dot.classList.toggle('active', n === index));
    prev.classList.toggle('hidden', index === 0);
    next.classList.toggle('hidden', index === images.length - 1);
    if (counter) counter.textContent = `${index + 1} / ${images.length}`;
  }

  let touchX = null;
  host.addEventListener('touchstart', (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  host.addEventListener('touchend', (event) => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) { event.preventDefault(); show(index + (dx < 0 ? 1 : -1)); }
  });

  host.classList.add('has-carousel');
  host.append(prev, next, dots);
  if (counter) host.append(counter);
  show(0);
  return { step: (delta) => show(index + delta) };
}

// Progress counts miniatures, not entries: a squad of 10 counts as 10.
const miniatures = (models) => models.reduce((sum, model) => sum + (model.count || 1), 0);
function finished(army) { return miniatures(army.models.filter((model) => model.status === 'done')); }
function countStatus(army, status) { return army.models.filter((model) => model.status === status).length; }
function percent(done, total) { return total ? Math.round((done / total) * 100) : 0; }
// "12 / 70" under a progress bar: painted miniatures out of all miniatures.
function paintedCount(target, done, total) { target.replaceChildren(element('span', 'stat-number', String(done)), ` / ${total}`); }
function setText(id, text) { $(id).textContent = text; }
function safeHashSlug() { return decodeURIComponent(location.hash.slice(1).split('?')[0]); }
// sidebar.txt groups armies into sections, e.g. Warhammer 40K and Other; consecutive armies share one.
function armySections() {
  const sections = [];
  state.armies.forEach((army) => {
    const last = sections[sections.length - 1];
    if (last && last.name === army.section) last.armies.push(army);
    else sections.push({ name: army.section, armies: [army] });
  });
  return sections;
}

// Logo and name block shared by the sidebar buttons and the landing tiles; the sidebar shows names only.
function armyBadge(army, { tagline = true } = {}) {
  const icon = element('span', 'army-icon');
  icon.append(image(armyLogo(army), '', ''));
  const text = element('span', 'army-text');
  text.append(element('strong', '', army.name));
  if (tagline && army.chapter) text.append(element('small', '', army.chapter));
  return [icon, text];
}

function buildNavigation() {
  const navigation = $('army-nav');
  navigation.replaceChildren();
  for (const section of armySections()) {
    navigation.append(element('div', 'sidebar-label', section.name));
    const list = navigation.appendChild(element('div', 'army-list'));
    for (const army of section.armies) {
      const button = element('button', 'army-button');
      button.type = 'button';
      const current = state.army?.slug === army.slug;
      button.setAttribute('aria-current', current ? 'page' : 'false');
      button.classList.toggle('active', current);
      button.append(...armyBadge(army, { tagline: false }));
      button.addEventListener('click', () => selectArmy(army.slug));
      list.append(button);
    }
  }
}

// Army colours are CSS variables; set them on the page, or on one tile, card or popup.
function applyTheme(node, army) {
  node.style.setProperty('--army-accent', army.accent);
  node.style.setProperty('--army-rgb', army.rgb);
  node.style.setProperty('--army-fill-rgb', army.fillRgb);
}
function setTheme(army) { applyTheme(document.documentElement, army); }
function clearTheme() {
  ['--army-accent', '--army-rgb', '--army-fill-rgb'].forEach((name) => document.documentElement.style.removeProperty(name));
}
function showView(home) {
  $('home-view').hidden = !home;
  $('army-view').hidden = home;
}

function selectArmy(slug, { changeHash = true } = {}) {
  const army = state.armies.find((item) => item.slug === slug) || state.armies[0];
  if (!army) return;
  state.army = army;
  showView(false);
  state.query = '';
  state.filter = 'all';
  $('model-search').value = '';
  setTheme(army);
  if (changeHash && safeHashSlug() !== army.slug) location.hash = army.slug;
  buildNavigation();
  renderArmy();
  closeMenu();
}

// Landing page: overall progress and one tile per army.
function showHome() {
  state.army = null;
  showView(true);
  clearTheme();
  buildNavigation();
  renderHome();
  document.querySelector('.footer').hidden = true;
  document.title = 'Librarium of Miniature Armies';
  closeMenu();
  window.scrollTo(0, 0);
}

function renderHome() {
  const allModels = state.armies.flatMap((army) => army.models);
  const painted = miniatures(allModels.filter((model) => model.status === 'done'));
  const progress = percent(painted, miniatures(allModels));
  setText('home-progress', String(progress));
  $('home-fill').style.width = `${progress}%`;
  paintedCount($('home-count'), painted, miniatures(allModels));

  const host = $('home-armies');
  host.replaceChildren();
  for (const section of armySections()) {
    const block = host.appendChild(element('section', 'roster'));
    block.append(element('h2', 'sidebar-label home-label', section.name));
    const grid = block.appendChild(element('div', 'roster-grid'));
    for (const army of section.armies) {
      // A tile is a sidebar army button with a progress bar under the name.
      const done = finished(army);
      const total = miniatures(army.models);
      const tile = element('a', 'army-button army-tile');
      tile.href = `#${encodeURIComponent(army.slug)}`;
      const [icon, text] = armyBadge(army);
      const track = text.appendChild(element('span', 'hero-progress-track'));
      track.appendChild(element('span', 'progress-fill')).style.width = `${percent(done, total)}%`;
      const count = text.appendChild(element('small'));
      if (total) paintedCount(count, done, total);
      else count.textContent = 'No models yet';
      tile.append(icon, text);
      grid.append(tile);
    }
  }
}

function renderArmy() {
  const army = state.army;
  if (!army) return;
  setText('army-title', army.name);
  setText('footer-motto', army.motto);
  document.querySelector('.footer').hidden = !army.motto;
  $('hero-emblem').replaceChildren(image(armyLogo(army), '', ''));
  const progress = percent(finished(army), miniatures(army.models));
  setText('stat-progress', String(progress));
  $('progress-fill').style.width = `${progress}%`;
  paintedCount($('stat-count'), finished(army), miniatures(army.models));
  setText('filter-all-count', String(army.models.length));
  ['done', 'ongoing', 'backlog'].forEach((status) => setText(`filter-${status}-count`, String(countStatus(army, status))));
  document.title = `${army.name} — Librarium of Miniature Armies`;
  updateFilters();
  renderRoster();
}

function updateFilters() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const isCurrent = button.dataset.filter === state.filter;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-pressed', String(isCurrent));
  });
}

// A "## Preview" section in notes.md is the card text; it is not repeated in the popup.
const isPreview = (section) => section.title.trim().toLowerCase() === 'preview';

function excerptFromNotes(notes) {
  const preview = noteSections(notes).find(isPreview);
  // Line breaks in the Preview section are kept on the card.
  return preview ? preview.text.split('\n').map((line) => line.trim()).join('\n') : '';
}

function makeCard(model, army) {
  const card = element('button', `model-card ${model.status}`);
  card.type = 'button';
  card.setAttribute('aria-label', `Open details for ${model.name}, ${STATUS_LABELS[model.status].toLowerCase()}`);
  card.addEventListener('click', () => openModel(model, army));

  const media = element('div', 'card-media');
  if (model.images.length) {
    const photo = image(model.images[0], 'card-media-photo', `Preview of ${model.name}`);
    media.append(photo);
    if (model.images.length > 1) attachCarousel(media, photo, model.images, 'card');
  } else {
    media.append(image(armyLogo(army), 'card-media-crest', ''));
  }
  const badge = media.appendChild(element('span', 'card-status'));
  badge.title = STATUS_LABELS[model.status];
  badge.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${STATUS_ICONS[model.status]}</svg>`;

  const body = element('div', 'card-body');
  body.append(element('h3', 'card-name', model.name));
  const facts = [model.count > 1 && `${model.count} models`, model.finished && finishedLabel(model)].filter(Boolean);
  if (facts.length) body.append(element('p', 'card-count', facts.join(' · ')));
  const excerpt = excerptFromNotes(model.notes);
  if (excerpt) body.append(element('p', 'card-excerpt', excerpt));
  card.append(media, body);
  return card;
}

function renderRoster() {
  const army = state.army;
  if (!army) return;
  const query = state.query.toLocaleLowerCase();
  const visible = army.models.filter((model) => {
    const statusMatches = state.filter === 'all' || model.status === state.filter;
    const textMatches = !query || `${model.name} ${model.notes}`.toLocaleLowerCase().includes(query);
    return statusMatches && textMatches;
  });
  const grid = $('roster-grid');
  grid.replaceChildren();
  visible.forEach((model) => grid.append(makeCard(model, army)));

  const empty = $('empty-state');
  empty.hidden = Boolean(visible.length);
  if (!visible.length) {
    const icon = $('empty-mark');
    icon.replaceChildren(image(armyLogo(army), '', ''));
    const searching = Boolean(state.query.trim());
    const filtered = state.filter !== 'all';
    setText('empty-overline', searching || filtered ? 'No matching models' : 'Awaiting reinforcements');
    setText('empty-title', searching || filtered ? 'Nothing found in this archive.' : 'No models in this army. Yet.');
    setText('empty-message', 'Add a folder for your first miniature, push it to GitHub, and it will appear here automatically.');
    $('empty-message').hidden = searching || filtered;
    const path = $('empty-path');
    path.hidden = searching || filtered;
    path.textContent = `armies/${army.slug}/backlog/Your Model Name/`;
  }
}

function noteSections(markdown) {
  const sections = [];
  let current = { title: 'Field Notes', lines: [] };
  const flush = () => {
    const text = current.lines.join('\n').trim();
    if (text) sections.push({ title: current.title, text });
  };
  markdown.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = { title: heading[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  });
  flush();
  return sections;
}

function renderNoteText(container, text) {
  // Small, safe Markdown subset: paragraphs, line breaks, and bullet/numbered lists.
  // All content goes through textContent; Markdown never becomes executable HTML.
  const BULLET = /^[-*+]\s+/;
  const NUMBER = /^\d+[.)]\s+/;
  const lines = text.split('\n').map((line) => line.trim());
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }
    const marker = NUMBER.test(line) ? NUMBER : BULLET.test(line) ? BULLET : null;
    if (marker) {
      const list = element(marker === NUMBER ? 'ol' : 'ul');
      for (; i < lines.length && marker.test(lines[i]); i++) list.append(element('li', '', lines[i].replace(marker, '')));
      container.append(list);
    } else {
      const parts = [];
      for (; i < lines.length && lines[i] && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]); i++) parts.push(lines[i]);
      container.append(element('p', '', parts.join(' ')));
    }
  }
}

function openModel(model, army) {
  applyTheme(dialog, army);
  setText('dialog-kicker', `${army.name}  /  ${STATUS_LABELS[model.status]}`);
  setText('dialog-title', model.name);
  const content = $('dialog-content');
  content.replaceChildren();
  const sections = noteSections(model.notes).filter((section) => !isPreview(section));
  for (const section of sections) {
    const box = element('section', 'dialog-section');
    box.append(element('h3', '', section.title));
    renderNoteText(box, section.text);
    content.append(box);
  }
  const foot = element('div', 'dialog-foot');
  // One fact per line: Status, then Models and Finished when known.
  const facts = [['Status', STATUS_LABELS[model.status]], model.count > 1 && ['Models', String(model.count)], model.finished && ['Finished', finishedLabel(model)]];
  for (const [label, value] of facts.filter(Boolean)) {
    foot.appendChild(element('div', '', `${label}: `)).append(element('span', '', value));
  }
  content.append(foot);

  const media = $('dialog-media');
  media.replaceChildren();
  dialogCarousel = null;
  if (model.images.length) {
    const holder = element('div', 'dialog-photo-container');
    const full = image(model.images[0], 'dialog-cover', `Photo of ${model.name}`);
    full.loading = 'eager';
    holder.append(full);
    media.append(holder);
    fitToTallestPhoto(holder, model.images);
    if (model.images.length > 1) dialogCarousel = attachCarousel(holder, full, model.images, 'dialog');
  } else {
    const placeholder = element('div', 'dialog-no-photo');
    placeholder.append(image(armyLogo(army), 'card-media-crest', ''));
    media.append(placeholder);
  }
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function closeMenu() {
  sidebar.classList.remove('is-open');
  scrim.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}
function toggleMenu() {
  const opening = !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', opening);
  scrim.hidden = !opening;
  menuButton.setAttribute('aria-expanded', String(opening));
}

// No hash (or an unknown one) shows the landing page; #<army> shows that army.
function route() {
  const army = state.armies.find((item) => item.slug === safeHashSlug());
  if (!army) showHome();
  else if (army !== state.army) selectArmy(army.slug, { changeHash: false });
}

async function init() {
  menuButton.addEventListener('click', toggleMenu);
  scrim.addEventListener('click', closeMenu);
  $('menu-close').addEventListener('click', closeMenu);
  $('dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => { state.filter = button.dataset.filter; updateFilters(); renderRoster(); });
  });
  $('model-search').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderRoster(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
    if (dialog.open && dialogCarousel && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault(); dialogCarousel.step(event.key === 'ArrowLeft' ? -1 : 1);
    }
    if (event.key === '/' && state.army && !dialog.open && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      event.preventDefault(); $('model-search').focus();
    }
  });
  window.addEventListener('hashchange', route);
  try {
    const response = await fetch('data/catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const collection = await response.json();
    state.armies = collection.armies;
    route();
  } catch (error) {
    console.error('Could not load the collection manifest:', error);
    setText('army-title', 'Archive unavailable');
    $('stats-grid').hidden = true;
    $('roster-grid').hidden = true;
  }
}

init();
