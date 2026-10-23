import './style.css';
import { diffJson, parseJson, summarize, formatJson } from './lib/json';
import { createJsonReport, createMarkdownReport } from './lib/export';
import type { Change, DiffOptions, JsonValue } from './lib/json';
import { examples } from './examples';

const paths: Record<string, string> = {
  weave: '<path d="M6 3v18M12 3v18M18 3v18M3 8h18M3 16h18"/>',
  compare: '<path d="M8 3v18M16 3v18M4 7l4-4 4 4M12 17l4 4 4-4"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  upload: '<path d="M12 16V3M7 8l5-5 5 5M4 16v5h16v-5"/>',
  download: '<path d="M12 3v13M7 11l5 5 5-5M4 17v4h16v-4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  format: '<path d="M8 4H5v6l-2 2 2 2v6h3M16 4h3v6l2 2-2 2v6h-3M10 9h4M10 15h4"/>',
  swap: '<path d="M3 7h18l-4-4M21 17H3l4 4M21 7l-4 4M3 17l4-4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  book: '<path d="M12 5v16M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
  code: '<path d="m7 7-5 5 5 5M17 7l5 5-5 5M14 3l-4 18"/>',
  sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  file: '<path d="M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 13h8M8 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.file}</svg>`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};
type Side = 'before' | 'after';
let changes: Change[] = [];
let kind = 'all';
let dirty = false;
let validComparison = false;
let shown = 100;
let activeExample = examples[0].id;
let toastTimer: ReturnType<typeof setTimeout>;
let validationTimer: ReturnType<typeof setTimeout>;
let syncing = false;

const editorHtml = (side: Side) => `<section class="editor-card" aria-labelledby="${side}-heading">
  <div class="editor-heading"><div class="editor-title"><span class="side-mark ${side}">${side === 'before' ? 'A' : 'B'}</span><h2 id="${side}-heading">${side === 'before' ? 'Original' : 'Modified'}</h2><span class="editor-version">${side === 'before' ? 'before' : 'after'}</span></div>
    <div class="editor-tools"><button class="icon-button" data-format="${side}" aria-label="Format ${side} JSON" title="Format JSON">${icon('format')}</button><button class="icon-button" data-copy="${side}" aria-label="Copy ${side} JSON" title="Copy JSON">${icon('copy')}</button><button class="icon-button" data-import="${side}" aria-label="Import ${side} JSON file" title="Import a JSON file">${icon('upload')}</button></div></div>
  <div class="file-bar">${icon('file')}<span id="${side}-filename"></span><span class="file-type">JSON</span></div>
  <div class="editor-body" id="${side}-body"><div class="editor-lines" id="${side}-lines" aria-hidden="true"></div><pre class="syntax" id="${side}-syntax" aria-hidden="true"></pre><textarea id="${side}-input" aria-label="${side === 'before' ? 'Original JSON' : 'Modified JSON'}" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" placeholder="Paste JSON here…"></textarea></div>
  <div class="editor-footer"><span id="${side}-validity" class="validity"></span><span id="${side}-size"></span></div>
  <p class="editor-error" id="${side}-error" role="alert" hidden></p>
  <input type="file" id="${side}-file" class="visually-hidden" accept=".json,application/json,text/plain" tabindex="-1" aria-label="${side} file" />
</section>`;

$('#app').innerHTML = `
<a class="skip-link" href="#workbench">Skip to workbench</a>
<aside class="sidebar">
  <a class="brand" href="./" aria-label="Diffloom home"><span class="brand-icon">${icon('weave')}</span>diffloom<span class="brand-period">.</span></a>
  <div class="workspace-label"><span class="workspace-avatar">P</span><div>Personal workspace<small>No account needed</small></div><span class="workspace-dot"></span></div>
  <div class="nav-label">WORKSPACE</div>
  <a href="#workbench" class="nav-item active" aria-label="JSON compare">${icon('compare')}<span>JSON compare</span><span class="nav-count">01</span></a>
  <button class="nav-item" data-dialog="guide" aria-label="Field guide">${icon('book')}<span>Field guide</span>${icon('chevron', 'nav-arrow')}</button>
  <div class="nav-label example-label">START WITH AN EXAMPLE</div>
  <div class="example-list">${examples.map((example) => `<button class="example-item ${example.id === activeExample ? 'selected' : ''}" data-example="${example.id}">${icon(example.id === 'api' ? 'code' : example.id === 'config' ? 'sliders' : 'file')}<span>${escapeHtml(example.name)}</span>${icon('arrow', 'example-arrow')}</button>`).join('')}</div>
  <div class="sidebar-bottom"><div class="privacy-note"><div class="privacy-icon">${icon('shield')}</div><strong>Your data stays yours.</strong><p>No uploads. No tracking.<br>Just your browser, doing its thing.</p><button class="text-button" data-dialog="privacy">A note on privacy ${icon('arrow')}</button></div><div class="sidebar-foot"><span class="version">v1.0.0</span><span>Made for the details.</span></div></div>
</aside>
<div class="app-shell">
  <header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')}<strong>JSON compare</strong></div><div class="topbar-actions"><span class="local-badge"><span></span>100% local</span><button class="subtle-button" data-dialog="about">${icon('code')}Open source</button></div></header>
  <main id="workbench" tabindex="-1">
    <section class="intro"><div><div class="eyebrow"><span></span>LESS NOISE. MORE SIGNAL.</div><h1>Find the <span>difference.</span></h1><p>Two JSONs. A clear picture of what changed.</p><label class="mobile-example-picker"><span>Try an example</span><select id="mobile-example" aria-label="Load example">${examples.map((example) => `<option value="${example.id}">${escapeHtml(example.name)}</option>`).join('')}</select></label></div><div class="intro-aside"><span class="intro-asterisk">✳</span><p>Small changes.<br><strong>Nothing overlooked.</strong></p></div></section>
    <section class="workbench-toolbar" aria-label="Comparison actions"><div class="toolbar-group"><span class="section-index">01 /</span><span class="section-title">The comparison</span><span class="example-tag" id="example-tag">API response</span></div><div class="toolbar-group"><label class="sync-control"><input type="checkbox" id="sync-scroll" checked />${icon('link')}<span>Sync scroll</span></label><span class="toolbar-divider"></span><button class="subtle-button compact" id="swap-button">${icon('swap')}Swap</button><button class="icon-button" id="reset-button" aria-label="Reset to current example" title="Reset to current example">${icon('reset')}</button></div></section>
    <div class="editors">${editorHtml('before')}${editorHtml('after')}</div>
    <section class="comparison-bar"><div class="comparison-settings"><details id="options"><summary>${icon('sliders')}Compare options ${icon('down')}</summary><div class="options-popover"><h3>Make the signal yours.</h3><label for="array-mode">Array comparison</label><select id="array-mode"><option value="index">By position (default)</option><option value="id">Match objects by unique id</option></select><p>ID matching ignores reordering. Falls back to position if IDs are missing or duplicated.</p><label for="ignore-paths">Ignore JSON Pointer paths</label><textarea id="ignore-paths" rows="3" placeholder="/updated_at&#10;/meta/request_id" spellcheck="false"></textarea><p>One exact path per line. Children are ignored too. Use ~1 for / and ~0 for ~ in keys.</p></div></details><span class="comparison-hint" id="comparison-hint">Structure, not whitespace.</span></div><button class="compare-button" id="compare-button">Compare JSON ${icon('arrow')}<kbd id="compare-shortcut">Ctrl ↵</kbd></button></section>
    <section class="results" aria-labelledby="results-title"><div class="results-heading"><div class="toolbar-group"><span class="section-index">02 /</span><h2 id="results-title">The difference</h2><span id="result-state" class="result-state">Comparison complete</span></div><div class="export-container"><button class="subtle-button" id="export-button" aria-haspopup="true" aria-expanded="false">${icon('download')}Export report ${icon('down')}</button><div id="export-menu" class="export-menu" hidden><label class="redact-control"><input type="checkbox" id="redact-export" checked /><span>Redact common secrets<small>Exports only · not a guarantee</small></span></label><button data-export="markdown">${icon('file')}Markdown report <span>.md</span></button><button data-export="json">${icon('code')}Structured changes <span>.json</span></button></div></div></div>
    <div class="stats" aria-label="Filter differences by type">${[
      ['all', 'Total changes', 'compare'], ['added', 'Added', 'plus'], ['removed', 'Removed', 'minus'], ['changed', 'Modified', 'format'],
    ].map(([id, label, symbol]) => `<button class="stat stat-${id} ${id === 'all' ? 'selected' : ''}" data-kind="${id}" aria-pressed="${id === 'all'}"><div class="stat-top"><span>${label}</span>${icon(symbol)}</div><div class="stat-value" id="count-${id}">0</div><span class="stat-foot">${id === 'all' ? 'across both documents' : id === 'added' ? 'new possibilities' : id === 'removed' ? 'left behind' : 'a little different'}</span></button>`).join('')}</div>
    <div class="changes-panel"><div class="changes-toolbar"><div class="filter-input">${icon('search')}<input type="search" id="path-search" aria-label="Filter changes by path" placeholder="Filter by path…" /><kbd>/</kbd></div><span class="changes-count" id="changes-count"></span></div><div class="change-table-head"><span>TYPE / PATH</span><span>ORIGINAL</span><span>MODIFIED</span></div><div id="change-list" aria-live="polite"></div><button id="show-more" class="show-more" hidden>Show more changes ${icon('down')}</button></div>
    <p class="results-footnote">${icon('dot')}Object key order doesn’t matter. The important changes do.<span>JSON Pointer · RFC 6901</span></p></section>
    <footer class="main-footer"><span>Less time comparing. More time creating.</span><span>Built with care, not cookies. ${icon('weave')}</span></footer>
  </main>
</div>
<dialog id="info-dialog" aria-labelledby="dialog-title"><div class="dialog-top"><span class="dialog-logo">${icon('weave')} diffloom.</span><button class="icon-button" id="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div id="dialog-content"></div><div class="dialog-bottom">A little clarity goes a long way.<button id="dialog-done" class="small-primary">Got it ${icon('check')}</button></div></dialog>
<div class="toast" id="toast" role="status" hidden></div>
`;

function toast(message: string) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3500);
}

function highlight(source: string): string {
  if (source.length > 50_000) return escapeHtml(source) + '\n';
  const pattern = /("(?:\\.|[^"\\])*"\s*:?)|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g;
  let result = '';
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index!;
    result += escapeHtml(source.slice(last, index));
    const token = match[0];
    const css = match[1] ? (token.endsWith(':') ? 'token-key' : 'token-string') : match[2] ? 'token-literal' : 'token-number';
    result += `<span class="${css}">${escapeHtml(token)}</span>`;
    last = index + token.length;
  }
  return result + escapeHtml(source.slice(last)) + '\n';
}

function updateEditor(side: Side, validate = true) {
  const input = $<HTMLTextAreaElement>(`#${side}-input`);
  const source = input.value;
  $(`#${side}-syntax`).innerHTML = highlight(source);
  // Only paint the visible line numbers; a short-line 1 MiB file can contain 500,000 lines.
  paintLines(side);
  const bytes = new TextEncoder().encode(source).length;
  $(`#${side}-size`).textContent = `${source.split('\n').length.toLocaleString()} lines · ${bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}`;
  const status = $(`#${side}-validity`);
  if (validate) {
    const parsed = parseJson(source);
    status.innerHTML = `${icon(parsed.ok ? 'check' : 'dot')}${parsed.ok ? 'Valid JSON' : 'Needs attention'}`;
    status.classList.toggle('invalid', !parsed.ok);
  } else {
    status.textContent = 'Editing…';
    status.classList.remove('invalid');
  }
  syncEditorLayers(side);
}

function paintLines(side: Side) {
  const input = $<HTMLTextAreaElement>(`#${side}-input`);
  const first = Math.max(0, Math.floor(input.scrollTop / 23));
  const total = input.value.split('\n').length;
  const last = Math.min(total, first + Math.ceil(input.clientHeight / 23) + 3);
  const lines = $(`#${side}-lines`);
  lines.style.top = `${18 + first * 23 - input.scrollTop}px`;
  lines.innerHTML = Array.from({ length: Math.max(0, last - first) }, (_, i) => `<span>${first + i + 1}</span>`).join('');
}

function syncEditorLayers(side: Side) {
  const input = $<HTMLTextAreaElement>(`#${side}-input`);
  $(`#${side}-syntax`).style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  paintLines(side);
}

function setDirty() {
  dirty = true;
  $('#result-state').textContent = 'Changes not compared';
  $('#result-state').classList.add('stale');
  $('#comparison-hint').textContent = 'Ready when you are.';
  $('#export-button').setAttribute('disabled', '');
  $('#export-menu').hidden = true;
  $('#export-button').setAttribute('aria-expanded', 'false');
  $('.results').classList.add('is-stale');
}

function options(): DiffOptions | null {
  const lines = $<HTMLTextAreaElement>('#ignore-paths').value.split('\n').map((line) => line.trim()).filter(Boolean);
  const invalid = lines.find((line) => !line.startsWith('/') || /~(?:[^01]|$)/.test(line));
  if (invalid) {
    toast(`Invalid JSON Pointer: ${invalid}. Start with / and escape ~ as ~0.`);
    $<HTMLDetailsElement>('#options').open = true;
    $('#ignore-paths').focus();
    return null;
  }
  return { ignorePaths: lines, arrayMode: $<HTMLSelectElement>('#array-mode').value as 'index' | 'id' };
}

function compare(announce = true) {
  const parsedBefore = parseJson($<HTMLTextAreaElement>('#before-input').value);
  const parsedAfter = parseJson($<HTMLTextAreaElement>('#after-input').value);
  let firstInvalid: Side | undefined;
  for (const [side, parsed] of [['before', parsedBefore], ['after', parsedAfter]] as const) {
    const error = $(`#${side}-error`);
    error.hidden = parsed.ok;
    error.textContent = parsed.ok ? '' : parsed.error;
    $(`#${side}-input`).setAttribute('aria-invalid', String(!parsed.ok));
    updateEditor(side);
    if (!parsed.ok && !firstInvalid) firstInvalid = side;
  }
  if (!parsedBefore.ok || !parsedAfter.ok) {
    setDirty();
    $('#result-state').textContent = 'Fix JSON to compare';
    if (announce) { toast('Check the highlighted editor errors. Your text is safe.'); $(`#${firstInvalid}-input`).focus(); }
    return;
  }
  const settings = options();
  if (!settings) return;
  const start = performance.now();
  try {
    changes = diffJson(parsedBefore.value, parsedAfter.value, settings);
  } catch (error) {
    setDirty();
    toast(error instanceof Error ? error.message : 'Could not compare these documents.');
    return;
  }
  const elapsed = performance.now() - start;
  dirty = false;
  validComparison = true;
  shown = 100;
  $('.results').classList.remove('is-stale');
  $('#result-state').textContent = changes.length ? 'Comparison complete' : 'A perfect match';
  $('#result-state').classList.remove('stale');
  $('#comparison-hint').textContent = `Compared in ${elapsed < 1 ? '<1' : Math.round(elapsed)} ms · structure, not whitespace.`;
  $('#export-button').removeAttribute('disabled');
  const counts = summarize(changes);
  for (const key of ['all', 'added', 'removed', 'changed']) $(`#count-${key}`).textContent = (key === 'all' ? counts.total : counts[key as keyof typeof counts]).toLocaleString();
  renderChanges();
  if (announce) toast(`${counts.total} ${counts.total === 1 ? 'change' : 'changes'} found. Nothing overlooked.`);
}

function filteredChanges(): Change[] {
  const query = $<HTMLInputElement>('#path-search').value.toLowerCase().trim();
  return changes.filter((change) => (kind === 'all' || change.kind === kind) && (!query || (change.path || '/').toLowerCase().includes(query)));
}
function printable(value: JsonValue | undefined) { return value === undefined ? '—' : JSON.stringify(value); }
function valueHtml(value: JsonValue | undefined, type: string): string {
  if (value === undefined) return '<span class="absent-value">—</span>';
  const text = printable(value);
  const abbreviated = text.length > 140 ? text.slice(0, 140) + '…' : text;
  return `<code class="change-value ${type}">${escapeHtml(abbreviated)}</code>`;
}
function renderChanges() {
  const filtered = filteredChanges();
  $('#changes-count').textContent = `${filtered.length.toLocaleString()} of ${changes.length.toLocaleString()} changes`;
  const list = $('#change-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon(changes.length ? 'search' : 'check')}</span><h3>${changes.length ? 'No changes on this path.' : 'Same meaning. Same JSON.'}</h3><p>${changes.length ? 'Try another path or a different change type.' : 'These documents are structurally identical with your current options.'}</p>${changes.length ? '<button class="subtle-button" id="clear-filters">Clear filters</button>' : ''}</div>`;
    document.querySelector('#clear-filters')?.addEventListener('click', clearFilters);
  } else {
    list.innerHTML = filtered.slice(0, shown).map((change, index) => `<details class="change-row change-${change.kind}"><summary><div class="change-path"><span class="change-symbol">${icon(change.kind === 'added' ? 'plus' : change.kind === 'removed' ? 'minus' : 'dot')}</span><div><code>${escapeHtml(change.path || '/')}</code><span class="change-kind">${change.kind === 'changed' ? 'modified' : change.kind}${change.path === '' ? ' · document root' : ''}</span></div></div><div class="value-cell">${valueHtml(change.before, 'old')}</div><div class="value-cell">${valueHtml(change.after, 'new')}${icon('down', 'row-expand')}</div></summary><div class="change-detail"><div><span>ORIGINAL VALUE</span><pre>${escapeHtml(change.before === undefined ? '(not present)' : formatJson(change.before))}</pre></div><div><span>MODIFIED VALUE</span><pre>${escapeHtml(change.after === undefined ? '(not present)' : formatJson(change.after))}</pre></div><button class="text-button copy-path" data-path-index="${index}">${icon('copy')}Copy path</button></div></details>`).join('');
    list.querySelectorAll<HTMLButtonElement>('.copy-path').forEach((button) => button.addEventListener('click', () => { void copyText(filtered[Number(button.dataset.pathIndex)].path, 'JSON Pointer copied.'); }));
  }
  $('#show-more').hidden = filtered.length <= shown;
  $('#show-more').innerHTML = `Show ${Math.min(100, filtered.length - shown)} more changes ${icon('down')}`;
}
function clearFilters() {
  kind = 'all';
  $<HTMLInputElement>('#path-search').value = '';
  updateKindButtons();
  renderChanges();
}
function updateKindButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.kind === kind);
    button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  });
}
function loadExample(id: string, announce = true) {
  const example = examples.find((item) => item.id === id)!;
  activeExample = id;
  for (const side of ['before', 'after'] as const) {
    $<HTMLTextAreaElement>(`#${side}-input`).value = example[side];
    $(`#${side}-filename`).textContent = example[`${side}Name`];
    $<HTMLTextAreaElement>(`#${side}-input`).scrollTop = 0;
    $<HTMLTextAreaElement>(`#${side}-input`).scrollLeft = 0;
  }
  $<HTMLTextAreaElement>('#ignore-paths').value = '';
  $<HTMLSelectElement>('#array-mode').value = 'index';
  $('#example-tag').textContent = example.name;
  $<HTMLSelectElement>('#mobile-example').value = id;
  document.querySelectorAll<HTMLElement>('[data-example]').forEach((button) => button.classList.toggle('selected', button.dataset.example === id));
  clearFilters();
  compare(false);
  if (announce) toast(`${example.name} loaded. Make it your own.`);
}

async function copyText(text: string, message: string) {
  try { await navigator.clipboard.writeText(text); toast(message); }
  catch { toast('Clipboard unavailable. Select the text and copy with your keyboard.'); }
}
function confirmReplace() {
  return !dirty || window.confirm('Replace your un-compared edits? Your current text will be replaced.');
}

for (const side of ['before', 'after'] as const) {
  const input = $<HTMLTextAreaElement>(`#${side}-input`);
  input.addEventListener('input', () => {
    setDirty();
    $(`#${side}-error`).hidden = true;
    input.removeAttribute('aria-invalid');
    updateEditor(side, false);
    clearTimeout(validationTimer);
    validationTimer = setTimeout(() => { updateEditor('before'); updateEditor('after'); }, 250);
  });
  input.addEventListener('scroll', () => {
    syncEditorLayers(side);
    if (!$<HTMLInputElement>('#sync-scroll').checked || syncing) return;
    syncing = true;
    const otherSide = side === 'before' ? 'after' : 'before';
    const other = $<HTMLTextAreaElement>(`#${otherSide}-input`);
    other.scrollTop = input.scrollTop;
    syncEditorLayers(otherSide);
    requestAnimationFrame(() => { syncing = false; });
  });
  $(`[data-format="${side}"]`).addEventListener('click', () => {
    const parsed = parseJson(input.value);
    if (!parsed.ok) { toast('Fix invalid JSON before formatting.'); input.focus(); return; }
    input.value = formatJson(parsed.value);
    updateEditor(side);
    toast(`${side === 'before' ? 'Original' : 'Modified'} JSON formatted.`);
  });
  $(`[data-copy="${side}"]`).addEventListener('click', () => { void copyText(input.value, 'JSON copied to clipboard.'); });
  $(`[data-import="${side}"]`).addEventListener('click', () => $<HTMLInputElement>(`#${side}-file`).click());
  $<HTMLInputElement>(`#${side}-file`).addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_048_576) { toast('This file exceeds the 1 MiB limit. Try a smaller document.'); return; }
      input.value = await file.text();
      $(`#${side}-filename`).textContent = file.name;
      $('#example-tag').textContent = 'Custom comparison';
      setDirty();
      updateEditor(side);
      toast(`${file.name} loaded locally. Compare when ready.`);
    } catch { toast('This file could not be read. Try selecting it again.'); }
    finally { target.value = ''; }
  });
}

$('#compare-button').addEventListener('click', () => compare());
$('#swap-button').addEventListener('click', () => {
  const before = $<HTMLTextAreaElement>('#before-input');
  const after = $<HTMLTextAreaElement>('#after-input');
  [before.value, after.value] = [after.value, before.value];
  const beforeName = $('#before-filename');
  const afterName = $('#after-filename');
  [beforeName.textContent, afterName.textContent] = [afterName.textContent, beforeName.textContent];
  updateEditor('before'); updateEditor('after'); setDirty(); compare();
});
$('#reset-button').addEventListener('click', () => { if (confirmReplace()) loadExample(activeExample); });
document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => button.addEventListener('click', () => { if (confirmReplace()) loadExample(button.dataset.example!); }));
$('#mobile-example').addEventListener('change', () => {
  const select = $<HTMLSelectElement>('#mobile-example');
  if (confirmReplace()) loadExample(select.value);
  else select.value = activeExample;
});
$('#array-mode').addEventListener('change', setDirty);
$('#ignore-paths').addEventListener('input', setDirty);
$('#path-search').addEventListener('input', () => { shown = 100; renderChanges(); });
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) => button.addEventListener('click', () => { kind = button.dataset.kind!; shown = 100; updateKindButtons(); renderChanges(); }));
$('#show-more').addEventListener('click', () => { shown += 100; renderChanges(); });

$('#export-button').addEventListener('click', () => {
  const menu = $('#export-menu');
  menu.hidden = !menu.hidden;
  $('#export-button').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.export-container')) {
    $('#export-menu').hidden = true;
    $('#export-button').setAttribute('aria-expanded', 'false');
  }
});
// Close before a control's click handler runs: validation may then reopen the
// options panel and focus an invalid pointer without the same click hiding it.
document.addEventListener('pointerdown', (event) => {
  if (!(event.target as Element).closest('#options')) $<HTMLDetailsElement>('#options').open = false;
});
document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((button) => button.addEventListener('click', () => {
  if (dirty || !validComparison) { toast('Compare your latest edits before exporting.'); return; }
  const filtered = filteredChanges();
  const markdown = button.dataset.export === 'markdown';
  const redacted = $<HTMLInputElement>('#redact-export').checked;
  const body = markdown ? createMarkdownReport(filtered, redacted) : createJsonReport(filtered, redacted);
  const url = URL.createObjectURL(new Blob([body], { type: markdown ? 'text/markdown;charset=utf-8' : 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `diffloom-report.${markdown ? 'md' : 'json'}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#export-menu').hidden = true;
  $('#export-button').setAttribute('aria-expanded', 'false');
  toast(`Report exported · ${filtered.length} changes · redaction ${redacted ? 'on' : 'off'}.`);
}));

const dialogContent: Record<string, string> = {
  guide: `<div class="eyebrow">THE FIELD GUIDE</div><h2>A clearer way to compare.</h2><p>Paste or import two JSON documents, then hit <kbd>Ctrl / ⌘</kbd> + <kbd>Enter</kbd>. We compare what the data means, not how it’s formatted.</p><div class="guide-steps"><div><span>01</span><section><h3>Bring your JSON.</h3><p>Use the upload icons or paste directly into either editor. Format with the braces icon. Each document can be up to 1 MiB and 128 levels deep. Numbers use JavaScript double precision, not arbitrary precision. Unsafe integers and nonzero values that underflow to zero are rejected; use strings for long numeric IDs.</p></section></div><div><span>02</span><section><h3>Follow the signal.</h3><p>Filter by change type or search JSON Pointer paths. Click a row to see the full values. Added and removed containers count as one change, not one per child.</p></section></div><div><span>03</span><section><h3>Take the details with you.</h3><p>Export the currently filtered changes as Markdown or JSON. Common secret keys are redacted by default in exports, but review the file before sharing.</p></section></div></div><div class="dialog-note"><strong>A note on arrays</strong><p>By default, array elements are compared by position. ID mode matches objects by unique string or number IDs and ignores reordering. Matched and removed paths use original indices; additions use modified indices. If an ID is missing or duplicated, comparison falls back to position. Reports describe changes; they are not JSON Patch documents.</p></div>`,
  privacy: `<div class="eyebrow">LOCAL BY DESIGN</div><h2>Private isn’t a feature.<br>It’s the starting point.</h2><p>Your JSON is processed in your browser. There’s no backend, analytics, remote fonts, account, or AI service. No comparison data is sent over the network or stored in browser storage.</p><div class="dialog-note"><strong>A fresh start on refresh.</strong><p>Your work exists only in this tab’s memory. Reloading or closing it resets everything. Export a report before leaving if you need a record.</p></div><h3>Sharing is your decision.</h3><p>Copying uses your system clipboard; exporting creates a file on your device. Common-secret redaction is on by default for reports, but it only recognizes specific key names. It is not a security scanner and cannot catch every secret. Review exports before sharing.</p><p class="muted">Your browser extensions, device policies, clipboard history, and hosting provider are outside Diffloom’s control. The host may log requests for static assets, never your pasted JSON.</p>`,
  about: `<div class="eyebrow">SMALL TOOL. OPEN POSSIBILITIES.</div><h2>Good tools leave room<br>for good work.</h2><p>Diffloom is a lightweight, local-first JSON comparison workbench. Built with TypeScript and care. No runtime dependencies, no accounts, and no data collection.</p><div class="about-grid"><div><span>LICENSE</span><strong>MIT</strong></div><div><span>VERSION</span><strong>1.0.0</strong></div><div><span>RUNTIME</span><strong>Your browser</strong></div></div><div class="dialog-note"><strong>Make it yours.</strong><p>This project includes source code, automated tests, contribution guidelines, and GitHub Actions. Publish your own repository and deploy the static build to GitHub Pages. See the project README for the complete guide.</p></div>`,
};
document.querySelectorAll<HTMLButtonElement>('[data-dialog]').forEach((button) => button.addEventListener('click', () => {
  $('#dialog-content').innerHTML = dialogContent[button.dataset.dialog!];
  $('#dialog-content h2').id = 'dialog-title';
  $<HTMLDialogElement>('#info-dialog').showModal();
}));
$('#close-dialog').addEventListener('click', () => $<HTMLDialogElement>('#info-dialog').close());
$('#dialog-done').addEventListener('click', () => $<HTMLDialogElement>('#info-dialog').close());
$('#info-dialog').addEventListener('click', (event) => { if (event.target === $('#info-dialog')) $<HTMLDialogElement>('#info-dialog').close(); });

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$<HTMLDialogElement>('#info-dialog').open) { event.preventDefault(); compare(); }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !$<HTMLDialogElement>('#info-dialog').open && !(event.target as Element).closest('input, textarea, select, button, summary')) { event.preventDefault(); $('#path-search').focus(); }
  if (event.key === 'Escape') { $('#export-menu').hidden = true; $('#export-button').setAttribute('aria-expanded', 'false'); $<HTMLDetailsElement>('#options').open = false; }
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', () => { paintLines('before'); paintLines('after'); });
if (/Mac|iPhone|iPad/.test(navigator.platform)) $('#compare-shortcut').textContent = '⌘ ↵';
loadExample(activeExample, false);
