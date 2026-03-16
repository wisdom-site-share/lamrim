/**
 * dlpage.js — 单列表文件下载组件
 *
 * 从 #dl-data 读取配置：
 *   <section> data-title / data-zip-name / data-unit / data-lang
 *   <ul> > <li> data-name / data-desc / data-type / data-bytes / data-url
 *
 * 依赖（需先加载）：Bulma · JSZip · FileSaver · dlpage-i18n.js
 */
(function () {

  const $ = id => document.getElementById(id);

  function formatBytes(b, base = 1024) {
    b = +b; base = +base === 1000 ? 1000 : 1024;
    if (!b)       return '—';
    if (b < base) return b + ' B';
    const kb = base * base;
    if (b < kb)   return (b / base).toFixed(1) + ' KB';
    return (b / kb).toFixed(1) + ' MB';
  }

  /* ══════════════════════════════════════════════
     1. 解析 #dl-data
  ══════════════════════════════════════════════ */
  function parseData() {
    const container = $('dl-data');
    if (!container) { console.error('[Downloader] #dl-data not found'); return null; }

    const sec     = container.querySelector('section');
    const t       = window.DLI18n.get();
    const title   = sec?.dataset.title   || t.defaultTitle;
    const zipName = sec?.dataset.zipName || 'files.zip';
    const unit    = +(sec?.dataset.unit  || 1024);

    const ul    = container.querySelector(':scope > ul');
    const files = ul ? [...ul.querySelectorAll(':scope > li')].map((li, i) => ({
      name:  li.dataset.name  || `file-${i}`,
      desc:  li.dataset.desc  || '',
      type:  li.dataset.type  || 'js',
      bytes: +(li.dataset.bytes || 0),
      url:   li.dataset.url   || '',
    })) : [];

    return { title, zipName, unit, files };
  }

  /* ══════════════════════════════════════════════
     2. 渲染框架 HTML
  ══════════════════════════════════════════════ */
  function render(cfg) {
    const root = $('dl-root');
    if (!root) { console.error('[Downloader] #dl-root not found'); return; }

    const t = window.DLI18n.get();

    root.innerHTML = `
      <div class="dl-hero">
        <p class="dl-hero-label">Download Center</p>
        <h1>${cfg.title}</h1>
        <div class="dl-hero-stats">
          <span class="dl-hero-stat">${t.fileCount(cfg.files.length)}</span>
          <span class="dl-hero-stat">${t.selectedCount('<strong id="dl-stat-sel">0</strong>')}</span>
        </div>
      </div>

      <div class="dl-wechat-tip" id="dl-wechat-tip">${t.wechatTip}</div>

      <div class="dl-global-toolbar">
        <label class="dl-check-all-label">
          <input type="checkbox" id="dl-check-all"> ${t.selectAll}
        </label>
        <span class="dl-global-size" id="dl-global-size">${t.selectedSize('0 B')}</span>
      </div>

      <ul class="dl-list" id="dl-list"></ul>

      <div class="dl-action-bar">
        <div class="level is-mobile" style="margin:0">
          <div class="level-left">
            <div>
              <div class="dl-sel-count" id="dl-sel-count">${t.selectedFiles(0)}</div>
              <div class="dl-sel-meta"  id="dl-sel-size">0 B</div>
            </div>
          </div>
          <div class="level-right">
            <button class="button dl-btn-zip" id="dl-btn-zip" disabled>
              ${t.zipAll}
            </button>
          </div>
        </div>
      </div>

      <div class="modal dl-modal" id="dl-modal">
        <div class="modal-background" id="dl-modal-bg"></div>
        <div class="modal-card">
          <header class="modal-card-head">
            <p class="modal-card-title" id="dl-modal-title">${t.packTitle}</p>
          </header>
          <section class="modal-card-body">
            <p class="dl-modal-sub" id="dl-modal-sub">${t.packInit}</p>
            <div id="dl-modal-list"></div>
            <div class="dl-global-progress">
              <progress class="progress" id="dl-global-bar" value="0" max="100"></progress>
            </div>
          </section>
          <footer class="modal-card-foot">
            <button class="button dl-btn-close" id="dl-btn-close">${t.packClose}</button>
          </footer>
        </div>
      </div>`;

    renderList(cfg.files, cfg.unit);
    bindEvents(cfg);
    updateStats(cfg.files, cfg.unit);

    if (/MicroMessenger/i.test(navigator.userAgent)) {
      $('dl-wechat-tip').classList.add('show');
    }
  }

  /* ══════════════════════════════════════════════
     3. 渲染文件列表
  ══════════════════════════════════════════════ */
  function renderList(files, unit = 1024) {
    const t    = window.DLI18n.get();
    const list = $('dl-list');

    files.forEach((f, i) => {
      const row = document.createElement('li');
      row.className  = 'dl-file-row';
      row.id         = `dl-row-${i}`;
      row.dataset.fi = i;
      row.innerHTML  = `
        <span class="dl-file-check">
          <input type="checkbox" id="dl-cb-${i}" checked>
        </span>
        <span class="dl-type-badge dl-type-${f.type}">.${f.type}</span>
        <span class="dl-file-info">
          <span class="dl-file-name">${f.name}</span>
          ${f.desc ? `<span class="dl-file-desc">${f.desc}</span>` : ''}
        </span>
        <span class="dl-file-right">
          <span class="dl-file-size">${formatBytes(f.bytes, unit)}</span>
          <button class="dl-btn-single"
                  id="dl-btn-${i}" data-fi="${i}">${t.download}</button>
        </span>`;
      list.appendChild(row);

      const bar = document.createElement('li');
      bar.className = 'dl-file-bar';
      bar.id        = `dl-bar-${i}`;
      bar.innerHTML = `<progress class="progress is-small"
                         id="dl-pb-${i}" value="0" max="100"></progress>`;
      list.appendChild(bar);
    });
  }

  /* ══════════════════════════════════════════════
     4. 事件绑定
  ══════════════════════════════════════════════ */
  function bindEvents(cfg) {
    const { files, zipName, unit } = cfg;
    const t = window.DLI18n.get();

    $('dl-check-all').addEventListener('change', function () {
      files.forEach((_, i) => $(`dl-cb-${i}`).checked = this.checked);
      updateStats(files, unit);
    });

    $('dl-list').addEventListener('click', e => {
      // 1. 下载按钮
      const dlBtn = e.target.closest('.dl-btn-single');
      if (dlBtn) {
        e.stopPropagation();
        singleDownload(files, +dlBtn.dataset.fi);
        return;
      }

      // 2. 复选框：让默认行为处理勾选，change 事件再统计
      if (e.target.closest('input[type="checkbox"]')) return;

      // 3. 点击文件行其他区域：切换勾选
      const row = e.target.closest('.dl-file-row');
      if (row) {
        const cb = $(`dl-cb-${row.dataset.fi}`);
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    $('dl-list').addEventListener('change', e => {
      if (e.target.matches('[id^="dl-cb-"]')) updateStats(files, unit);
    });

    $('dl-btn-zip').addEventListener('click', () => {
      const items = files.filter((_, i) => $(`dl-cb-${i}`)?.checked);
      runZip(items, zipName, t.packBtnTitle);
    });

    $('dl-btn-close').addEventListener('click', closeModal);
    $('dl-modal-bg').addEventListener('click', closeModal);
  }

  /* ══════════════════════════════════════════════
     5. 统计已选
  ══════════════════════════════════════════════ */
  function updateStats(files, unit = 1024) {
    let cnt = 0, bytes = 0;
    files.forEach((f, i) => {
      if ($(`dl-cb-${i}`)?.checked) { cnt++; bytes += f.bytes; }
    });
    const t = window.DLI18n.get();
    $('dl-sel-count').textContent   = t.selectedFiles(cnt);
    $('dl-sel-size').textContent    = formatBytes(bytes, unit);
    $('dl-global-size').textContent = t.selectedSize(formatBytes(bytes, unit));
    $('dl-stat-sel').textContent    = cnt;
    $('dl-btn-zip').disabled        = cnt === 0;
    const all = $('dl-check-all');
    all.checked       = cnt === files.length;
    all.indeterminate = cnt > 0 && cnt < files.length;
  }

  /* ══════════════════════════════════════════════
     6. 单文件下载
  ══════════════════════════════════════════════ */
  async function singleDownload(files, i) {
    const f   = files[i];
    const btn = $(`dl-btn-${i}`);
    const bar = $(`dl-bar-${i}`);
    const pb  = $(`dl-pb-${i}`);
    const t   = window.DLI18n.get();

    bar.classList.add('show');
    btn.textContent = t.downloading;
    btn.disabled    = true;
    pb.removeAttribute('value');   // indeterminate 进度条

    try {
      const res  = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      saveAs(blob, f.name);
      pb.value = 100; bar.classList.add('done');
      btn.textContent = t.done; btn.classList.add('dl-done-btn');
    } catch (err) {
      console.error('[Downloader]', f.name, err);
      bar.classList.remove('show');
      btn.textContent = t.retry; btn.disabled = false;
    }
  }

  /* ══════════════════════════════════════════════
     7. ZIP 打包下载
  ══════════════════════════════════════════════ */
  async function runZip(files, zipName, title) {
    const t = window.DLI18n.get();

    $('dl-modal-title').textContent = title;
    $('dl-modal-list').innerHTML = files.map((f, i) => `
      <div class="dl-modal-item">
        <span class="dl-type-badge dl-type-${f.type}"
              style="width:28px;height:28px;font-size:.56rem">.${f.type}</span>
        <span class="dl-modal-item-name">${f.name}</span>
        <span class="dl-modal-item-status dl-s-wait" id="dl-ms-${i}">${t.statusWait}</span>
      </div>`).join('');

    $('dl-modal-sub').textContent   = t.packTotal(files.length);
    $('dl-global-bar').value        = 0;
    $('dl-btn-close').style.display = 'none';
    $('dl-modal').classList.add('is-active');

    const zip  = new JSZip();
    let   done = 0;

    await Promise.all(files.map(async (f, i) => {
      const s = $(`dl-ms-${i}`);
      s.textContent = t.statusDoing; s.className = 'dl-modal-item-status dl-s-doing';
      try {
        zip.file(f.name, await (await fetch(f.url)).arrayBuffer());
        s.textContent = t.statusOk; s.className = 'dl-modal-item-status dl-s-ok';
      } catch {
        s.textContent = t.statusErr; s.className = 'dl-modal-item-status dl-s-err';
      }
      done++;
      $('dl-global-bar').value      = Math.round(done / files.length * 100);
      $('dl-modal-sub').textContent = t.packProgress(done, files.length);
    }));

    $('dl-modal-sub').textContent   = t.packZipping;
    saveAs(await zip.generateAsync({ type: 'blob' }), zipName);
    $('dl-modal-sub').textContent   = t.packDone;
    $('dl-btn-close').style.display = 'block';
    $('dl-btn-close').textContent   = t.packClose;
  }

  function closeModal() { $('dl-modal').classList.remove('is-active'); }

  /* ══════════════════════════════════════════════
     启动
  ══════════════════════════════════════════════ */
  function boot() {
    const cfg = parseData();
    if (cfg) render(cfg);
  }

  window.__dlInit = boot;

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dl-data')) boot();
  });

})();