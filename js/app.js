// ▼ Hier dein GitHub-Repository eintragen (Benutzer/Repo)
const GITHUB_REPO = 'PatrykGadziomski/infosci-guide.github.io';

const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const LEVELS = { 'B.A.': 'Bachelor', 'B.Sc.': 'Bachelor', 'M.A.': 'Master', 'M.Sc.': 'Master', 'M.LIS': 'Master', 'Zertifikat': 'Weiterbildung' };
const LEVEL_ORDER = ['Bachelor', 'Master', 'Weiterbildung'];
const MODI = ['Vollzeit', 'Teilzeit', 'Fernstudium', 'Berufsbegleitend', 'Dual'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : null;

let programs = [], hochschulen = [], firstRender = true;
const state = { level: 'Alle', modus: 'Alle', land: 'Alle', q: '' };

const query = (db, sql) => {
  const r = db.exec(sql)[0];
  return r ? r.values.map(v => Object.fromEntries(v.map((x, i) => [r.columns[i], x]))) : [];
};

async function init() {
  try {
    const [SQL, buf] = await Promise.all([
      initSqlJs({ locateFile: f => SQLJS_BASE + f }),
      fetch('data/studiengaenge.db').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    ]);
    const db = new SQL.Database(new Uint8Array(buf));
    hochschulen = query(db, 'SELECT * FROM hochschulen ORDER BY name');
    const tags = {};
    query(db, 'SELECT studiengang_id AS id, tag FROM tags ORDER BY tag').forEach(t => (tags[t.id] ||= []).push(t.tag));
    programs = query(db, `SELECT s.*, h.name AS hochschule, h.city, h.land, h.type AS htype, h.website AS hweb
                          FROM studiengaenge s JOIN hochschulen h ON h.id = s.hochschule_id`)
      .map(p => ({ ...p, level: LEVELS[p.abschluss], tags: tags[p.id] || [] }))
      .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
        || a.hochschule.localeCompare(b.hochschule, 'de') || a.name.localeCompare(b.name, 'de'));
    db.close();
    $('stat-h').textContent = hochschulen.length;
    $('stat-s').textContent = programs.length;
    $('stat-l').textContent = new Set(hochschulen.map(h => h.land)).size;
    $('uni-list').innerHTML = hochschulen.map(h => `<option value="${esc(h.name)}">`).join('');
    renderFilters();
    renderPrograms();
  } catch (e) {
    $('programs').innerHTML = `<p class="empty">Die Datenbank konnte nicht geladen werden (${esc(e.message)}).<br>Lokal testen: <code>python -m http.server</code> im Projektordner starten, nicht die Datei direkt öffnen.</p>`;
  }
}

function renderFilters() {
  const groups = [
    ['Stufe', 'level', LEVEL_ORDER.filter(l => programs.some(p => p.level === l))],
    ['Modus', 'modus', MODI.filter(m => programs.some(p => p.modus === m))],
    ['Land', 'land', [...new Set(programs.map(p => p.land))].sort()],
  ].filter(g => g[2].length > 1);
  $('filters').innerHTML = groups.map(([label, key, vals]) =>
    `<div class="filter-group"><span class="filter-label">${label}</span>` +
    ['Alle', ...vals].map(v => `<button type="button" class="filter-btn${state[key] === v ? ' active' : ''}" data-k="${key}" data-v="${esc(v)}">${esc(v)}</button>`).join('') +
    '</div>').join('');
}

const card = p => {
  const link = safeUrl(p.website) || safeUrl(p.hweb);
  const uni = link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(p.hochschule)}</a>` : esc(p.hochschule);
  const det = [['Dauer', p.semester && p.semester + ' Semester'], ['Modus', p.modus], ['Studienbeginn', p.studienbeginn], ['Zulassung', p.zulassung], ['Sprache', p.sprache]].filter(d => d[1]);
  return `<article class="prog-card">
    <div class="prog-top"><span>${esc(p.schwerpunkt || p.level)}</span><span class="prog-badge lvl-${p.level}">${esc(p.abschluss)}</span></div>
    <h3 class="prog-name">${esc(p.name)}</h3>
    <div class="prog-uni">${uni}<span class="prog-place">${esc(p.city)}${p.land !== 'Deutschland' ? ', ' + esc(p.land) : ''}, ${esc(p.htype)}</span></div>
    ${p.tags.length ? `<div class="prog-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${det.length ? `<div class="prog-details">${det.map(([l, v]) => `<div><div class="detail-label">${l}</div><div class="detail-value">${esc(v)}</div></div>`).join('')}</div>` : ''}
  </article>`;
};

function renderPrograms() {
  const q = state.q.trim().toLowerCase();
  const list = programs.filter(p =>
    (state.level === 'Alle' || p.level === state.level) &&
    (state.modus === 'Alle' || p.modus === state.modus) &&
    (state.land === 'Alle' || p.land === state.land) &&
    (!q || [p.name, p.hochschule, p.city, p.abschluss, p.schwerpunkt, ...p.tags].join(' ').toLowerCase().includes(q)));
  $('count').textContent = list.length + (list.length === 1 ? ' Studiengang' : ' Studiengänge');
  $('programs').innerHTML = list.length ? list.map(card).join('')
    : '<p class="empty">Keine Studiengänge gefunden. Passe die Filter an oder füge den Studiengang selbst hinzu.</p>';
  if (firstRender) { firstRender = false; reveal(document.querySelectorAll('.prog-card')); }
}

function reveal(els) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); }
  }), { threshold: 0.1 });
  els.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(20px)'; el.style.transition = 'opacity .5s ease, transform .5s ease'; io.observe(el); });
}

$('filters').addEventListener('click', e => {
  const b = e.target.closest('.filter-btn'); if (!b) return;
  state[b.dataset.k] = b.dataset.v; renderFilters(); renderPrograms();
});
$('q').addEventListener('input', e => { state.q = e.target.value; renderPrograms(); });

// ── Studiengang hinzufügen (GitHub-Issue) ─────────────
const modal = $('modal'), form = $('add-form');
const openModal = () => { modal.classList.add('open'); document.body.style.overflow = 'hidden'; $('f-name').focus(); };
const closeModal = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 9000); };
const knownUni = () => hochschulen.find(h => h.name.toLowerCase() === $('f-hochschule').value.trim().toLowerCase());

$('add-open').onclick = openModal;
$('footer-add').onclick = e => { e.preventDefault(); openModal(); };
modal.addEventListener('mousedown', e => { if (e.target === modal || e.target.dataset.close) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('gh-link').href = 'https://github.com/' + GITHUB_REPO;

$('f-hochschule').addEventListener('input', () => {
  const isNew = $('f-hochschule').value.trim() && !knownUni();
  $('new-uni').style.display = isNew ? 'grid' : 'none';
  $('f-city').required = $('f-htype').required = !!isNew;
});

form.addEventListener('submit', e => {
  e.preventDefault();
  if (GITHUB_REPO.startsWith('OWNER/')) { toast('Bitte zuerst GITHUB_REPO in index.html eintragen.'); return; }
  const uni = knownUni();
  const v = id => $(id).value.trim();
  const data = {
    name: v('f-name'), abschluss: v('f-abschluss'), schwerpunkt: v('f-schwerpunkt'),
    hochschule: uni ? uni.name : v('f-hochschule'),
    semester: v('f-semester'), modus: v('f-modus'), studienbeginn: v('f-beginn'),
    zulassung: v('f-zulassung'), sprache: v('f-sprache'), website: v('f-web'), tags: v('f-tags'),
  };
  if (!uni) Object.assign(data, { city: v('f-city'), hochschultyp: v('f-htype'), land: v('f-land'), hochschule_website: v('f-hweb') });
  const title = `Neuer Studiengang: ${data.abschluss} ${data.name} (${data.hochschule})`;
  const body = 'Bitte prüfen und mit dem Label `approved` freigeben.\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```';
  window.open(`https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
  closeModal(); form.reset(); $('new-uni').style.display = 'none';
  toast('GitHub wurde geöffnet. Klicke dort auf „Submit new issue“ – nach der Freigabe erscheint der Studiengang hier.');
});

init();
