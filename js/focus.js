  // ── Thời gian tập trung: bộ đếm giờ (hẹn giờ / bấm giờ) + biểu đồ ──────────
  const FOCUS_MIN_SEC = 60;   // phiên ngắn hơn 1 phút không ghi nhận (chống bấm nhầm)
  const FOCUS_MAX_MIN = 240;
  let focusRange = 'week';    // week | month | year
  let focusListHidden = false; // ẩn/hiện danh sách "Phiên trong kỳ"
  let timerMode = 'timer';    // timer (hẹn giờ) | stopwatch (bấm giờ)
  let pendingMin = 25;        // số phút hẹn giờ đang chờ (sửa trực tiếp trên khung giờ)
  let editingTimer = false;   // đang ở chế độ sửa thời gian trên khung giờ

  function focusElapsed() {
    const fa = state.focusActive;
    if (!fa) return 0;
    const running = fa.startTs ? Math.floor((Date.now() - fa.startTs) / 1000) : 0;
    return Math.max(0, (fa.accumulatedSec || 0) + running);
  }
  function focusRunning() { return !!(state.focusActive && !state.focusActive.paused); }
  function pendingDurationSec() {
    const mins = Math.min(FOCUS_MAX_MIN, Math.max(1, Math.round(Number(pendingMin) || 25)));
    return mins * 60;
  }
  function clockOf(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  function focusTimeLabel(f) {
    const a = clockOf(f.startedAt), b = clockOf(f.endedAt);
    return a && b ? `${a}–${b}` : (b || a || '');
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // Ghi nhận một phiên tập trung — CHỈ gọi khi hết hẹn giờ hoặc người dùng bấm "Kết thúc".
  function recordFocus(sec, status) {
    const ended = new Date();
    const started = new Date(ended.getTime() - sec * 1000);
    state.focus.unshift({
      id: Date.now(), mode: state.focusActive ? state.focusActive.mode : timerMode,
      durationSec: Math.round(sec),
      startedAt: started.toISOString(), endedAt: ended.toISOString(),
      status, date: dateKey(ended)
    });
    state.focusActive = null;
    saveState();
    renderFocus(); renderYears();
    showToast(`Đã ghi nhận ${fmtMin(sec / 60)} tập trung · ${status}`);
  }

  function renderFocus() { renderTimer(); renderFocusChart(); }

  function renderTimer() {
    const fa = state.focusActive;
    const mode = fa ? fa.mode : timerMode;
    const isTimer = mode === 'timer';
    const running = focusRunning();
    const elapsed = fa ? focusElapsed() : 0;
    const durationSec = isTimer ? (fa ? fa.durationSec : pendingDurationSec()) : 0;

    $$('#timerModes button').forEach(b => {
      b.classList.toggle('active', b.dataset.focusMode === mode);
      b.disabled = running || elapsed > 0; // đang có phiên → không đổi chế độ
    });

    if (fa && editingTimer) editingTimer = false;   // phiên khởi động → đóng luôn chế độ sửa
    if (!editingTimer) $('#timerDisplay').textContent = fmtClock(isTimer ? durationSec - elapsed : elapsed);
    $('#timerProgress').style.display = isTimer ? '' : 'none';
    $('#timerBar').style.width = (isTimer && durationSec > 0 ? Math.max(0, Math.min(100, (1 - elapsed / durationSec) * 100)) : 100) + '%';

    $('#timerPresets').style.display = isTimer ? '' : 'none';
    $$('#timerPresets .button').forEach(b => b.classList.toggle('active', !fa && Number(b.dataset.preset) * 60 === durationSec));
    // Khung giờ chỉ sửa được khi rảnh (không có phiên) và đang ở chế độ hẹn giờ
    $('#timerDisplay').classList.toggle('can-edit', isTimer && !fa && !editingTimer);

    $('#timerToggle').textContent = running ? 'Tạm dừng' : (fa ? 'Tiếp tục' : 'Bắt đầu');
    $('#timerFinish').disabled = !fa;   // luôn bấm được khi có phiên — phần ghi nhận tự lọc phiên < 1 phút
    $('#timerState').textContent = running ? 'Đang chạy' : (fa ? 'Đã tạm dừng' : 'Sẵn sàng');
  }

  // Đồng hồ chạy theo timestamp (không đếm tick) → refresh/ẩn tab không sai lệch.
  function timerTick() {
    const fa = state.focusActive;
    if (!fa) return;
    const elapsed = focusElapsed();
    if (fa.mode === 'timer' && elapsed >= fa.durationSec) { recordFocus(fa.durationSec, 'đủ giờ'); return; } // hết hẹn giờ
    renderTimer();
  }

  $$('#timerModes button').forEach(b => b.addEventListener('click', () => {
    if (state.focusActive && focusElapsed() > 0) { showToast('Đang có phiên chưa ghi nhận — bấm Kết thúc hoặc Đặt lại trước'); return; }
    if (editingTimer) { editingTimer = false; }   // đang sửa trên khung giờ → đóng chế độ sửa
    timerMode = b.dataset.focusMode;
    renderTimer();
  }));
  $$('#timerPresets .button').forEach(b => b.addEventListener('click', () => {
    if (state.focusActive && focusElapsed() > 0) return;
    pendingMin = Number(b.dataset.preset);
    if (editingTimer) editingTimer = false;   // chọn preset khi đang sửa → áp dụng luôn, đóng ô nhập
    renderTimer();
  }));

  // ── Sửa thời gian trực tiếp trên khung giờ (thay ô nhập phút tùy chỉnh) ──
  // Chấp nhận: "45" (phút) · "1:30" (giờ:phút) · "1:30:00" (giờ:phút:giây)
  function parseTimeInput(raw) {
    const s = String(raw).trim().replace(/[^\d:]/g, '');
    if (!s) return null;
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    let mins;
    if (parts.length === 1) mins = parts[0];
    else if (parts.length === 2) mins = parts[0] * 60 + parts[1];
    else if (parts.length === 3) mins = parts[0] * 60 + parts[1] + parts[2] / 60;
    else return null;
    if (mins <= 0) return null;
    return Math.round(mins);
  }

  function commitTimerEdit(inp, cancel) {
    editingTimer = false;
    if (cancel) { renderTimer(); return; }
    const mins = parseTimeInput(inp.value);
    if (mins === null) { showToast('Giá trị không hợp lệ — giữ nguyên ' + pendingMin + ' phút'); renderTimer(); return; }
    if (mins > FOCUS_MAX_MIN) { showToast('Tối đa ' + FOCUS_MAX_MIN + ' phút'); pendingMin = FOCUS_MAX_MIN; renderTimer(); return; }
    pendingMin = Math.max(1, mins);
    renderTimer();
  }

  $('#timerDisplay').addEventListener('click', () => {
    if (editingTimer) return;
    const fa = state.focusActive;
    if (fa) { showToast('Đang có phiên — không sửa được thời gian'); return; }
    if (timerMode !== 'timer') { showToast('Chế độ bấm giờ không cần đặt thời gian'); return; }
    editingTimer = true;
    const inp = document.createElement('input');
    inp.className = 'timer-edit';
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.value = pendingMin >= 60 ? (Math.floor(pendingMin / 60) + ':' + String(pendingMin % 60).padStart(2, '0')) : String(pendingMin);
    inp.setAttribute('aria-label', 'Sửa thời gian hẹn giờ (phút hoặc giờ:phút)');
    $('#timerDisplay').innerHTML = '';
    $('#timerDisplay').appendChild(inp);
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitTimerEdit(inp, false); }
      else if (e.key === 'Escape') { e.preventDefault(); commitTimerEdit(inp, true); }
    });
    inp.addEventListener('blur', () => { if (editingTimer) commitTimerEdit(inp, false); });
    // click preset khi đang sửa → giữ ô input (đồng bộ giá trị trong preset handler)
    inp.addEventListener('click', e => e.stopPropagation());
  });

  $('#timerToggle').addEventListener('click', () => {
    const fa = state.focusActive;
    if (fa && !fa.paused) {          // đang chạy → tạm dừng (không ghi nhận)
      fa.accumulatedSec = focusElapsed();
      fa.startTs = null;
      fa.paused = true;
    } else if (fa) {                // tạm dừng → chạy tiếp
      fa.startTs = Date.now();
      fa.paused = false;
    } else {                        // bắt đầu phiên mới
      state.focusActive = {
        mode: timerMode,
        durationSec: timerMode === 'timer' ? pendingDurationSec() : 0,
        accumulatedSec: 0,
        startTs: Date.now(),
        paused: false
      };
    }
    saveState(); renderTimer();
  });

  $('#timerReset').addEventListener('click', () => {  // bỏ phiên hiện tại — KHÔNG ghi nhận
    if (!state.focusActive) return;
    state.focusActive = null;
    saveState(); renderTimer();
    showToast('Đã đặt lại — phiên này không được ghi nhận');
  });

  $('#timerFinish').addEventListener('click', () => {
    const fa = state.focusActive;
    if (!fa) return;
    const sec = focusElapsed();
    if (sec < FOCUS_MIN_SEC) { showToast('Phiên quá ngắn (tối thiểu 1 phút) — không ghi nhận'); return; }
    recordFocus(sec, (fa.mode === 'timer' && sec >= fa.durationSec) ? 'đủ giờ' : 'kết thúc');
  });

  // Biểu đồ thời gian tập trung theo Tuần / Tháng / Năm (cột CSS, không cần thư viện)
  function focusByDate() {
    const map = {};
    state.focus.forEach(f => {
      if (!f.date) return;
      if (!map[f.date]) map[f.date] = { min: 0, count: 0 };
      map[f.date].min += f.durationSec / 60;
      map[f.date].count++;
    });
    return map;
  }

  function focusBuckets(range) {
    const now = new Date();
    const map = focusByDate();
    const todayKey = dateKey(now);
    const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    if (range === 'year') {
      const out = MONTHS.map(label => ({ label, min: 0, count: 0, today: false, title: '' }));
      Object.keys(map).forEach(key => {
        if (key.slice(0, 4) !== String(now.getFullYear())) return;
        const b = out[Number(key.slice(5, 7)) - 1];
        if (!b) return;
        b.min += map[key].min; b.count += map[key].count;
      });
      out.forEach(b => { b.title = `${b.label} · ${fmtMin(b.min)} · ${b.count} phiên`; });
      return out;
    }
    const days = [];
    if (range === 'week') {
      for (let i = 6; i >= 0; i--) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    } else {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let dd = 1; dd <= lastDay; dd++) days.push(new Date(now.getFullYear(), now.getMonth(), dd));
    }
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return days.map(d => {
      const key = dateKey(d);
      const info = map[key] || { min: 0, count: 0 };
      const label = range === 'week' ? WD[d.getDay()]
        : (d.getDate() === 1 || d.getDate() % 5 === 0 || d.getDate() === lastOfMonth) ? String(d.getDate()) : '';
      return { label, min: info.min, count: info.count, today: key === todayKey, title: `${fmtDay(key)} · ${fmtMin(info.min)} · ${info.count} phiên` };
    });
  }

  function focusRangeFilter(range) {
    const now = new Date();
    if (range === 'year') { const y = String(now.getFullYear()); return key => !!key && key.slice(0, 4) === y; }
    if (range === 'week') { const from = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)); const to = dateKey(now); return key => !!key && key >= from && key <= to; }
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return key => !!key && key.slice(0, 7) === ym;
  }

  function renderFocusChart() {
    const buckets = focusBuckets(focusRange);
    const max = Math.max(1, ...buckets.map(b => b.min));
    $('#focusChart').innerHTML = buckets.map(b =>
      `<div class="bar${b.min > 0 ? ' has' : ''}${b.today ? ' today' : ''}" style="height:${b.min > 0 ? Math.max(4, (b.min / max) * 100) : 0}%" title="${escapeHTML(b.title)}"></div>`).join('');
    $('#focusChartLabels').innerHTML = buckets.map(b => `<span>${b.label}</span>`).join('');
    $$('.range-tabs .year-btn[data-focus-range]').forEach(b => b.classList.toggle('active', b.dataset.focusRange === focusRange));

    const totalMin = buckets.reduce((s, b) => s + b.min, 0);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    const todayMin = (focusByDate()[dateKey(new Date())] || { min: 0 }).min;
    $('#focusSummary').innerHTML = `Tổng kỳ này: <b>${fmtMin(totalMin)}</b> · <b>${totalCount}</b> phiên · Hôm nay: <b>${fmtMin(todayMin)}</b>`;

    const inRange = state.focus.filter(f => focusRangeFilter(focusRange)(f.date));
    const rows = inRange.map(f => `
      <div class="focus-row">
        <span class="focus-when">${fmtDay(f.date)} · ${focusTimeLabel(f)}</span>
        <span class="focus-dur">${fmtMin(f.durationSec / 60)}</span>
        <span class="tag">${f.mode === 'stopwatch' ? 'Bấm giờ' : 'Hẹn giờ'} · ${escapeHTML(f.status)}</span>
        <span class="spacer"></span>
        <button class="button ghost" data-del-focus="${f.id}" aria-label="Xóa phiên tập trung">✕</button>
      </div>`).join('');
    $('#focusRecent').innerHTML = `
      <div class="day-list-head">
        <h2>Phiên trong kỳ</h2>
        <span class="tag">${inRange.length}</span>
        ${inRange.length ? `<button class="button ghost" data-collapse-focus="1">${focusListHidden ? 'Mở ▾' : 'Thu lại ▲'}</button>` : ''}
      </div>
      <div class="focus-list focus-scroll" style="${focusListHidden ? 'display:none' : ''}">${rows || '<div class="empty-note">Chưa có phiên tập trung nào trong kỳ.</div>'}</div>`;
  }

