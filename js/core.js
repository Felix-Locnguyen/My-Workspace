  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const defaultState = {
    user: { name: "" },
    goals: { monthlyIncome: 0, assetGoal: 0, minExpense: 0 },
    tasks: [],
    projects: [],
    transactions: [],
    assets: [],
    log: {},
    focus: [],
    focusActive: null,
    health: { sports: [], workouts: [], activeSport: 'all' },
    ui: { idleHide: 150, isAmountHidden: false }
  };

  // State khởi tạo mặc định. Nạp thật từ server trong loadState() ở cuối script.
  let state = JSON.parse(JSON.stringify(defaultState));

  // Chuẩn hoá state: điền thiếu các trường và migrate task cũ.
  function normalizeState(s) {
    if (!s.user) s.user = { name: '' };
    if (!s.goals) s.goals = { monthlyIncome: 10000000, assetGoal: 500000000, minExpense: 0 };
    s.goals.minExpense = Math.max(0, Number(s.goals.minExpense) || 0); // chi tiêu tối thiểu (không bắt buộc)
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!Array.isArray(s.projects)) s.projects = [];
    if (!Array.isArray(s.transactions)) s.transactions = [];
    if (!Array.isArray(s.assets)) s.assets = [];
    if (!Array.isArray(s.focus)) s.focus = [];
    if (s.focusActive === undefined) s.focusActive = null;
    if (s.focusActive) {
      // Phiên đang chạy bị hỏng dữ liệu → bỏ, không giữ nửa chừng
      const fa = s.focusActive;
      if (!fa.mode || !Number.isFinite(Number(fa.durationSec)) || !Number.isFinite(Number(fa.accumulatedSec))) s.focusActive = null;
      else { fa.durationSec = Number(fa.durationSec); fa.accumulatedSec = Number(fa.accumulatedSec); }
    }
    s.focus = s.focus.filter(f => f && Number.isFinite(Number(f.durationSec)) && f.date)
      .map(f => ({ id: f.id || Date.now(), mode: f.mode === 'stopwatch' ? 'stopwatch' : 'timer', durationSec: Math.round(Number(f.durationSec)), startedAt: f.startedAt || '', endedAt: f.endedAt || '', status: f.status || 'kết thúc', date: f.date }));
    // Sức khỏe: danh sách môn + nhật ký buổi tập (data/health.json)
    if (!s.health || typeof s.health !== 'object') s.health = {};
    if (!Array.isArray(s.health.sports) || !s.health.sports.length) s.health.sports = JSON.parse(JSON.stringify(DEFAULT_SPORTS));
    if (!Array.isArray(s.health.workouts)) s.health.workouts = [];
    if (!s.health.activeSport) s.health.activeSport = 'all';
    s.health.sports.forEach(sp => {
      if (!sp.id) sp.id = 'sp' + Date.now() + Math.floor(Math.random() * 1000);
      sp.name = String(sp.name || 'Môn tập').trim() || 'Môn tập';
      sp.kind = ['distance', 'reps', 'reps_sets', 'gym'].includes(sp.kind) ? sp.kind : 'distance';
    });
    s.health.workouts = s.health.workouts
      .filter(w => w && w.sportId && /^\d{4}-\d{2}-\d{2}$/.test(w.date || ''))
      .map(w => ({ id: Number(w.id) || Date.now(), sportId: w.sportId, date: w.date, createdAt: w.createdAt || w.date, metrics: (w.metrics && typeof w.metrics === 'object') ? w.metrics : {} }));
    if (!s.log || typeof s.log !== 'object') s.log = {};
    if (!s.ui) s.ui = { idleHide: 150 };
    s.ui.isAmountHidden = !!s.ui.isAmountHidden; // ẩn/hiện số tiền toàn cục (nút mắt)
    s.transactions.forEach((t, i) => { if (!t.id) t.id = Date.now() + i; });
    // Migration: thêm ngày hẹn / ngày hoàn thành cho task cũ
    s.tasks.forEach(t => {
      if (t.dueDate === undefined) t.dueDate = null;
      if (t.completedAt === undefined) t.completedAt = t.status === 'done' ? dateKey(new Date()) : null;
      if (t.inProgress === undefined) t.inProgress = false;
    });
    return s;
  }

  // Lưu state lên server (debounce để gộp các thay đổi liên tiếp).
  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushState, 120);
  }
  async function flushState() {
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      // Không lưu được: giữ dữ liệu trong bộ nhớ và báo cho người dùng.
      showToast('Không lưu được dữ liệu lên server');
    }
  }

  let activeProjectId = null;

  const MASK_TEXT = '•••••••• đ';

  // Định dạng tiền: ẩn → MASK_TEXT (dấu +/- do nơi gọi giữ nguyên), hiện → 8.000.000 ₫
  const formatMoney = (amount, isHidden) =>
    isHidden ? MASK_TEXT : Number(amount).toLocaleString('vi-VN') + ' ₫';

  // Mọi số tiền trên giao diện đều đi qua fmt() → mask toàn cục chỉ cần đổi 1 chỗ.
  const fmt = v => formatMoney(v, state.ui.isAmountHidden);

  // Ma trận hoạt động (mỗi năm một card, dữ liệu thật trong state.log)
  const MONTHS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
  let selectedDay = null;
  let selectedYear = null; // null = năm hiện tại

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function levelOf(n) {
    // Thang 5 mức: 0–1, 2–3, 4–6, 7–8, 9+ hoạt động hoàn thành trong ngày.
    return n >= 9 ? 4 : n >= 7 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
  }
  const LEVEL_LABELS = ['0–1', '2–3', '4–6', '7–8', '9+'];
  function fmtDay(key) { return `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(0, 4)}`; }
  // Số phút → "3 giờ 20 phút" / "50 phút"
  function fmtMin(min) {
    const m = Math.round(Number(min) || 0);
    if (m < 60) return m + ' phút';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} giờ ${r} phút` : `${h} giờ`;
  }

  // Ma trận chỉ tính những việc ĐÃ HOÀN THÀNH trong ngày đó và các phiên tập trung
  // đã kết thúc (việc thêm mới chưa hoàn thành không được tính).
  // Đồng bộ state.log từ danh sách công việc + phiên tập trung.
  function syncLog() {
    const next = {};
    state.tasks.forEach(t => {
      if (t.status === 'done' && t.completedAt) next[t.completedAt] = (next[t.completedAt] || 0) + 1;
    });
    state.focus.forEach(f => {
      if (f.date) next[f.date] = (next[f.date] || 0) + 1;
    });
    // Buổi tập sức khỏe hoàn thành trong ngày cũng là 1 hoạt động
    (state.health && state.health.workouts ? state.health.workouts : []).forEach(w => {
      if (w && w.date) next[w.date] = (next[w.date] || 0) + 1;
    });
    const changed = Object.keys(next).length !== Object.keys(state.log).length ||
      Object.keys(next).some(k => state.log[k] !== next[k]);
    state.log = next;
    if (changed) saveState();
  }

  // Quy tắc hiển thị: task không xong → hiện nếu không hẹn ngày hoặc hẹn từ hôm nay trở đi
  // (kể cả tương lai); chỉ ẩn khi ĐÃ quá hạn. Task đã xong → chỉ hiện trong ngày hoàn thành.
  function isTaskActiveOn(t, dayKey) {
    if (t.status === 'done') return t.completedAt === dayKey;
    if (!t.dueDate) return true;
    return t.dueDate >= dayKey;
  }
  function todayTasks() {
    const key = dateKey(new Date());
    return state.tasks.filter(t => isTaskActiveOn(t, key));
  }
  function overdueDays(dueDate) {
    const today = new Date();
    const due = new Date(dueDate + 'T00:00:00');
    return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - due) / 86400000);
  }
  function isOverdue(t) {
    return t.status !== 'done' && !!t.dueDate && t.dueDate < dateKey(new Date());
  }
  // Số ngày còn lại tới hạn: dương = tương lai, 0 = hôm nay, âm = đã quá hạn.
  function dayDiffFromToday(dueDate) {
    return -overdueDays(dueDate);
  }
  // Nhãn hiển thị hạn cho một task.
  function dueLabel(t) {
    if (!t.dueDate) return '';
    if (isOverdue(t)) return ` · Hạn ${fmtDay(t.dueDate)} · quá hạn ${overdueDays(t.dueDate)} ngày`;
    const diff = dayDiffFromToday(t.dueDate);
    if (diff === 0) return ' · Hạn hôm nay';
    return ` · Hạn ${fmtDay(t.dueDate)} · còn ${diff} ngày`;
  }

  // Năm hiện tại: 12 tháng gần nhất (kết thúc hôm nay). Năm cũ: cả năm dương lịch.
  function viewRange(y, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (y === today.getFullYear()) {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() - 52 * 7); // bắt đầu từ Chủ nhật, đủ 53 tuần
      return { start, end: today, rolling: true };
    }
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31), rolling: false };
  }

  // Sửa / xóa dữ liệu đã nhập
  const TASK_TAGS = ['Học tập', 'Project', 'Tài chính', 'Đời thường', 'Khác'];
  const ASSET_TYPES = [['chứng khoán', 'Chứng khoán'], ['vàng', 'Vàng'], ['tiền ảo', 'Tiền ảo'], ['cho thuê', 'Cho thuê'], ['kinh doanh', 'Kinh doanh'], ['khác', 'Khác']];
  const optionsHTML = (list, selected) => list.map(([v, l]) => `<option value="${escapeHTML(v)}" ${v === selected ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');

  function confirmModal(title, message, onConfirm) {
    openModal(title, `<p style="margin:0;color:var(--muted)">${escapeHTML(message)}</p>`, () => { onConfirm(); return true; });
  }

  // Điều hướng
  function go(view) {
    if (view === 'projects') activeProjectId = null;
    currentView = view;
    applyHeroes();
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $$('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'projects') renderProjects();
    if (view === 'health') renderHealth();
    window.scrollTo({ top: 0 });
  }
  $$('.nav button[data-view]').forEach(b => b.addEventListener('click', () => { showUI(); go(b.dataset.view); }));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Modal
  const modalOverlay = $('#modalOverlay');
  let modalCallback = null;
  function openModal(title, html, callback) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    modalOverlay.classList.add('open');
    modalCallback = callback;
    const first = $('#modalBody input, #modalBody select');
    if (first) first.focus();
  }
  function closeModal() { modalOverlay.classList.remove('open'); modalCallback = null; }
  $('#modalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  $('#modalSubmit').addEventListener('click', () => { if (modalCallback && modalCallback()) closeModal(); });
  modalOverlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#modalSubmit').click(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
