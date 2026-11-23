const STORIES = window.STORIES || [];
const KEY_LAST = 'reader.lastRead';
const KEY_BM = 'reader.bookmarks';

const els = {
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  btnMenu: document.getElementById('btnMenu'),
  btnCloseSidebar: document.getElementById('btnCloseSidebar'),
  list: document.getElementById('episodeList'),
  content: document.getElementById('content'),
  title: document.getElementById('currentTitle'),
  group: document.getElementById('currentGroup'),
  progress: document.getElementById('readProgress'),
  progressBar: document.getElementById('progressBar'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnContinue: document.getElementById('btnContinue'),
  btnBookmark: document.getElementById('btnBookmark'),
  toast: document.getElementById('toast'),
};

let currentId = null;
let currentScrollHandler = null;
const mobileQuery = window.matchMedia('(max-width: 820px)');

function setSidebarOpen(open) {
  if (!els.sidebar) return;
  const shouldOpen = Boolean(open) && mobileQuery.matches;
  els.sidebar.classList.toggle('open', shouldOpen);
  if (els.sidebarBackdrop) {
    els.sidebarBackdrop.classList.toggle('open', shouldOpen);
    els.sidebarBackdrop.setAttribute('aria-hidden', String(!shouldOpen));
  }
  if (els.btnMenu) {
    els.btnMenu.setAttribute('aria-expanded', String(shouldOpen));
  }
}

function closeSidebar() {
  setSidebarOpen(false);
}

function normalizeText(value) {
  return String(value == null ? '' : value).normalize('NFC');
}

const memoryStore = {};
function safeGetItem(key) {
  try { return localStorage.getItem(key); }
  catch (e) { return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null; }
}
function safeSetItem(key, val) {
  try { localStorage.setItem(key, val); }
  catch (e) { memoryStore[key] = val; }
}
function loadJSON(key, fallback) {
  try {
    const raw = safeGetItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed === null || parsed === undefined) ? fallback : parsed;
  }
  catch (e) { return fallback; }
}
function saveJSON(key, val) { safeSetItem(key, JSON.stringify(val)); }

function bookmarks() { return loadJSON(KEY_BM, {}); }
function setBookmark(id, pos) {
  const b = bookmarks();
  b[id] = { pos: pos, time: Date.now() };
  saveJSON(KEY_BM, b);
}
function getBookmark(id) { return (bookmarks()[id]) || null; }

function groupStories() {
  const groups = {};
  STORIES.forEach(s => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });
  return groups;
}

function renderSidebar() {
  const groups = groupStories();
  els.list.innerHTML = '';
  Object.keys(groups).forEach(g => {
    const div = document.createElement('div');
    div.className = 'group';
    const h = document.createElement('p');
    h.className = 'group-title';
    h.textContent = normalizeText(g);
    div.appendChild(h);
    const items = document.createElement('div');
    items.className = 'group-items';
    groups[g].forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'episode-btn';
      btn.dataset.id = s.id;
      btn.textContent = normalizeText(s.title);
      if (getBookmark(s.id)) btn.classList.add('bookmarked');
      btn.addEventListener('click', () => openStory(s.id));
      items.appendChild(btn);
    });
    div.appendChild(items);
    els.list.appendChild(div);
  });
}

function simpleMarkdown(md) {
  // Minimal fallback if marked is unavailable
  const esc = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = esc.split(/\r?\n/);
  const out = [];
  let para = [];
  function flush() {
    if (para.length) {
      out.push('<p>' + para.join('<br>') + '</p>');
      para = [];
    }
  }
  lines.forEach(line => {
    if (/^### /.test(line)) { flush(); out.push('<h3>'+line.slice(4)+'</h3>'); }
    else if (/^## /.test(line)) { flush(); out.push('<h2>'+line.slice(3)+'</h2>'); }
    else if (/^# /.test(line)) { flush(); out.push('<h1>'+line.slice(2)+'</h1>'); }
    else if (/^\s*$/.test(line)) { flush(); }
    else { para.push(line); }
  });
  flush();
  return out.join('\n').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
}

function renderMarkdown(md) {
  const text = normalizeText(md);
  if (window.marked && typeof window.marked.parse === 'function') {
    try { return window.marked.parse(text); }
    catch (e) { return simpleMarkdown(text); }
  }
  return simpleMarkdown(text);
}

function openStory(id) {
  const idx = STORIES.findIndex(x => x.id === id);
  if (idx === -1) return;
  const s = STORIES[idx];
  currentId = id;
  els.title.textContent = normalizeText(s.title);
  els.group.textContent = normalizeText(s.group);
  els.content.innerHTML = '<div class="content-inner">' + renderMarkdown(s.content) + '</div>';
  // update active
  document.querySelectorAll('.episode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
  els.btnPrev.disabled = idx <= 0;
  els.btnNext.disabled = idx >= STORIES.length - 1;
  safeSetItem(KEY_LAST, id);
  // reset scroll
  els.content.scrollTop = 0;
  updateProgress();
  // attach scroll
  if (currentScrollHandler) els.content.removeEventListener('scroll', currentScrollHandler);
  currentScrollHandler = () => updateProgress();
  els.content.addEventListener('scroll', currentScrollHandler);
  // bookmark button state
  refreshBookmarkBtn();
  closeSidebar();
}

function updateProgress() {
  const el = els.content;
  const max = el.scrollHeight - el.clientHeight;
  const pct = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0;
  els.progress.textContent = pct + '%';
  if (els.progressBar) els.progressBar.style.width = pct + '%';
}

function refreshBookmarkBtn() {
  const bm = getBookmark(currentId);
  els.btnBookmark.classList.toggle('saved', !!bm);
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function saveCurrentBookmark() {
  if (!currentId) { showToast('Hãy chọn một tập trước'); return; }
  const pos = els.content.scrollTop;
  setBookmark(currentId, pos);
  refreshBookmarkBtn();
  // update sidebar marker
  const btn = document.querySelector('.episode-btn[data-id=\"'+currentId+'\"]');
  if (btn) {
    btn.classList.add('bookmarked');
  }
  showToast('Đã đánh dấu vị trí đang đọc');
}

function continueReading() {
  // Prefer global last read with bookmark
  const last = safeGetItem(KEY_LAST);
  const bms = bookmarks();
  let targetId = null;
  let targetPos = 0;
  if (last && bms[last]) { targetId = last; targetPos = bms[last].pos; }
  else {
    // find most recent bookmark
    let latest = null;
    Object.keys(bms).forEach(id => {
      if (!latest || bms[id].time > bms[latest].time) latest = id;
    });
    if (latest) { targetId = latest; targetPos = bms[latest].pos; }
  }
  if (!targetId) { showToast('Chưa có vị trí nào được đánh dấu'); return; }
  openStory(targetId);
  setTimeout(() => { els.content.scrollTop = targetPos; updateProgress(); }, 60);
}

function goPrev() {
  if (!currentId) return;
  const idx = STORIES.findIndex(s => s.id === currentId);
  if (idx > 0) openStory(STORIES[idx-1].id);
}
function goNext() {
  if (!currentId) return;
  const idx = STORIES.findIndex(s => s.id === currentId);
  if (idx < STORIES.length - 1) openStory(STORIES[idx+1].id);
}

// Init
renderSidebar();
els.btnBookmark.addEventListener('click', saveCurrentBookmark);
els.btnContinue.addEventListener('click', continueReading);
els.btnPrev.addEventListener('click', goPrev);
els.btnNext.addEventListener('click', goNext);

if (els.btnMenu) {
  els.btnMenu.addEventListener('click', () => {
    const isOpen = els.sidebar && els.sidebar.classList.contains('open');
    setSidebarOpen(!isOpen);
  });
}
if (els.btnCloseSidebar) {
  els.btnCloseSidebar.addEventListener('click', closeSidebar);
}
if (els.sidebarBackdrop) {
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidebar();
});
const handleMediaChange = (e) => {
  if (!e.matches) closeSidebar();
};
if (typeof mobileQuery.addEventListener === 'function') {
  mobileQuery.addEventListener('change', handleMediaChange);
} else if (typeof mobileQuery.addListener === 'function') {
  mobileQuery.addListener(handleMediaChange);
}

// Open last read or first
const last = safeGetItem(KEY_LAST);
if (last && STORIES.some(s => s.id === last)) {
  openStory(last);
  const bm = getBookmark(last);
  if (bm) setTimeout(() => { els.content.scrollTop = bm.pos; updateProgress(); }, 80);
} else if (STORIES.length) {
  openStory(STORIES[0].id);
}