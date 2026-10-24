  function setHeading() {
    $('#welcomeHeading').textContent = `Xin chào, ${state.user.name}.`;
  }
  $('#today').textContent = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  // Hình nền tiêu đề trang (ảnh/video lưu trong IndexedDB)
  const HERO_PAGES = [['dashboard', 'Tổng quan'], ['tasks', 'Công việc'], ['projects', 'Dự án'], ['finance', 'Tài chính'], ['health', 'Sức khỏe'], ['settings', 'Cài đặt']];
  const HERO_MAX = 50 * 1024 * 1024;
  const hero = {};
  let heroTarget = null;

  async function heroStore(mode, fn) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('locOS_media', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('hero');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('hero', mode);
      const req = fn(tx.objectStore('hero'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  const heroKind = blob => blob.type.startsWith('video/') ? 'video' : 'image';

  async function setHero(key, file) {
    await heroStore('readwrite', s => s.put({ blob: file, name: file.name }, key));
    if (hero[key]) URL.revokeObjectURL(hero[key].url);
    hero[key] = { url: URL.createObjectURL(file), kind: heroKind(file), name: file.name, sig: file.name + '|' + file.size + '|' + file.lastModified };
  }
  async function clearHero(key) {
    await heroStore('readwrite', s => s.delete(key));
    if (hero[key]) URL.revokeObjectURL(hero[key].url);
    delete hero[key];
  }
  async function loadHeroes() {
    try {
      for (const [key] of HERO_PAGES) {
        const rec = await heroStore('readonly', s => s.get(key));
        if (rec && rec.blob) hero[key] = { url: URL.createObjectURL(rec.blob), kind: heroKind(rec.blob), name: rec.name, sig: rec.name + '|' + rec.blob.size + '|' + rec.blob.lastModified };
      }
    } catch (err) { /* trình duyệt không hỗ trợ lưu: bỏ qua */ }
    applyHeroes();
    renderHeroSettings();
  }

  let currentView = 'dashboard';

  function applyHeroes() {
    const layer = $('#bgLayer');
    const m = hero[currentView];
    document.body.classList.toggle('has-bg', !!m);
    const sig = m ? m.sig : '';
    if (layer.dataset.sig === sig) return;
    layer.dataset.sig = sig;
    layer.replaceChildren();
    if (!m) return;
    if (m.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      v.src = m.url;
      layer.append(v);
      v.play().catch(() => {});
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.src = m.url;
      layer.append(img);
    }
  }

  function renderHeroSettings() {
    const el = $('#heroSettings');
    if (!el) return;
    const row = (key, label, status, hasMedia) => `
      <div class="hero-row">
        <div><div>${label}</div><div class="note">${escapeHTML(status)}</div></div>
        <div style="display:flex;gap:8px;">
          <button class="button" data-hero-pick="${key}">Chọn</button>
          <button class="button ghost" data-hero-clear="${key}" ${hasMedia ? '' : 'disabled'}>Xóa</button>
        </div>
      </div>`;
    el.innerHTML = row('all', 'Tất cả trang', 'Dùng chung một ảnh hoặc video', Object.keys(hero).length > 0) +
      HERO_PAGES.map(([k, label]) => row(k, label, hero[k] ? (hero[k].kind === 'video' ? 'Video' : 'Ảnh') + ' · ' + hero[k].name : 'Mặc định', !!hero[k])).join('');
  }

  $('#heroFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !heroTarget) return;
    if (!/^(image|video)\//.test(file.type)) { showToast('Chỉ hỗ trợ ảnh hoặc video'); return; }
    if (file.size > HERO_MAX) { showToast('File quá lớn (tối đa 50MB)'); return; }
    try {
      const keys = heroTarget === 'all' ? HERO_PAGES.map(p => p[0]) : [heroTarget];
      for (const key of keys) await setHero(key, file);
      applyHeroes();
      renderHeroSettings();
      showToast('Đã đổi hình nền');
    } catch (err) { showToast('Trình duyệt không lưu được file này'); }
  });

  // Ẩn / hiện giao diện
  let lastActive = Date.now();
  let uiLock = false;   // true = ẩn bằng nút (khóa) → chỉ Enter mới hiện; false = ẩn nền (chuột/phím vẫn hiện)
  const uiHidden = () => document.body.classList.contains('ui-hidden');
  const HINT_LOCKED = 'Nhấn Enter để hiện thị';
  const HINT_IDLE = 'Di chuyển chuột hoặc nhấn phím bất kỳ để hiện thị';

  function updateHint() {
    const hint = $('.ui-hint');
    if (hint) hint.textContent = uiLock ? HINT_LOCKED : HINT_IDLE;
  }

  function hideUI(lock = false) {
    if (uiHidden() || modalOverlay.classList.contains('open')) return;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    uiLock = lock;
    updateHint();
    document.body.classList.add('ui-hidden');
  }
  function showUI() {
    if (!uiHidden()) return;
    uiLock = false;
    lastActive = Date.now();
    updateHint();
    document.body.classList.remove('ui-hidden');
  }

  // Đang ẩn: không bị khóa → bất kỳ phím / chuột / chạm / cuộn nào cũng hiện lại; bị khóa → bỏ qua
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev =>
    window.addEventListener(ev, () => {
      if (uiHidden()) { if (!uiLock) showUI(); }
      else lastActive = Date.now();
    }, { passive: true }));

  // Ẩn bằng nút (khóa) → chỉ phím Enter mới hiện lại
  document.addEventListener('keydown', e => {
    if (uiHidden() && uiLock && e.key === 'Enter') { e.preventDefault(); showUI(); }
  }, true);

  setInterval(() => {
    const sec = (state.ui && state.ui.idleHide) || 0;
    if (sec && !uiHidden() && Date.now() - lastActive >= sec * 1000) hideUI();
  }, 1000);

  $('#hideUiBtn').addEventListener('click', () => hideUI(true));

  // ── 1 Chạm ẩn/hiện toàn bộ số tiền (Global Mask Toggle) ──
  // Trạng thái nằm trong state.ui.isAmountHidden → lưu qua server (data/settings.json).
  function syncMaskBtn() {
    const hidden = !!(state.ui && state.ui.isAmountHidden);
    const btn = $('#maskMoneyBtn');
    btn.classList.toggle('masked', hidden);
    btn.setAttribute('aria-pressed', String(hidden));
    $('#maskMoneyLabel').textContent = hidden ? 'Hiện số tiền' : 'Ẩn số tiền';
  }

  function toggleMoneyMask() {
    state.ui.isAmountHidden = !state.ui.isAmountHidden;
    saveState();
    syncMaskBtn();
    renderFinance();   // vẽ lại mọi số tiền theo trạng thái mask mới
    showToast(state.ui.isAmountHidden ? 'Đã ẩn toàn bộ số tiền' : 'Đã hiện toàn bộ số tiền');
  }

  $('#maskMoneyBtn').addEventListener('click', toggleMoneyMask);

  $('#idleHide').addEventListener('change', e => {
    state.ui.idleHide = Number(e.target.value) || 0;
    lastActive = Date.now();
    saveState();
    showToast(state.ui.idleHide ? 'Đã bật tự ẩn giao diện' : 'Đã tắt tự ẩn giao diện');
  });

