  // ── Lịch popup tự vẽ (thay cho dropdown) ──────────────────────────────
  // openCalendar({ anchor, mode, value, onPick(mode, value), onClear() })
  //   mode: 'day' → 'YYYY-MM-DD' | 'month' → 'YYYY-MM' | 'year' → 'YYYY'
  // Bấm lại nút = đóng, click ra ngoài / Esc = đóng, chọn xong = đóng.
  const CAL_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  let calState = null;   // popup đang mở: { anchor, pop, mode, y, mo, d, onPick, onClear }
  const calPad = n => String(n).padStart(2, '0');

  // Đọc giá trị theo chế độ; thiếu/sai thì rơi về kỳ hiện tại
  function calParse(value, mode) {
    const now = new Date();
    let m;
    if (mode === 'day' && (m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ''))) return { y: +m[1], mo: +m[2], d: +m[3] };
    if (mode === 'month' && (m = /^(\d{4})-(\d{2})$/.exec(value || ''))) return { y: +m[1], mo: +m[2], d: null };
    if (mode === 'year' && (m = /^(\d{4})$/.exec(value || ''))) return { y: +m[1], mo: now.getMonth() + 1, d: null };
    return { y: now.getFullYear(), mo: now.getMonth() + 1, d: mode === 'day' ? now.getDate() : null };
  }

  // Giá trị kỳ đang chọn theo chế độ hiện tại (giữ ngày khi chuyển qua lại)
  function calValue() {
    const s = calState;
    if (s.mode === 'day') return `${s.y}-${calPad(s.mo)}-${calPad(s.d || 1)}`;
    if (s.mode === 'month') return `${s.y}-${calPad(s.mo)}`;
    return String(s.y);
  }

  function calTodayValue() {
    const n = new Date();
    if (calState.mode === 'day') return dateKey(n);
    if (calState.mode === 'month') return `${n.getFullYear()}-${calPad(n.getMonth() + 1)}`;
    return String(n.getFullYear());
  }

  function calNav(dir) {
    const s = calState;
    if (s.mode === 'day') {
      s.mo += dir;
      if (s.mo > 12) { s.mo = 1; s.y++; }
      else if (s.mo < 1) { s.mo = 12; s.y--; }
    } else if (s.mode === 'month') s.y += dir;
    else s.y += dir * 9;
  }

  function calRender(focusSel) {
    const s = calState;
    if (!s) return;
    const nowKey = dateKey(new Date());
    const sel = calValue();
    const tab = [['day', 'Ngày'], ['month', 'Tháng'], ['year', 'Năm']].map(([m, l]) =>
      `<button type="button" class="year-btn${s.mode === m ? ' active' : ''}" data-cal-mode="${m}">${l}</button>`).join('');
    let title = '', body = '';

    if (s.mode === 'day') {
      title = `Tháng ${s.mo}, ${s.y}`;
      const firstDow = new Date(s.y, s.mo - 1, 1).getDay();   // 0 = CN
      const daysIn = new Date(s.y, s.mo, 0).getDate();
      const daysPrev = new Date(s.y, s.mo - 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const n = i - firstDow + 1;
        let y = s.y, mo = s.mo, d = n, cls = 'cal-cell';
        if (n < 1) { d = daysPrev + n; mo--; if (mo < 1) { mo = 12; y--; } cls += ' dim'; }
        else if (n > daysIn) { d = n - daysIn; mo++; if (mo > 12) { mo = 1; y++; } cls += ' dim'; }
        const key = `${y}-${calPad(mo)}-${calPad(d)}`;
        if (key === sel) cls += ' sel';
        if (key === nowKey) cls += ' today';
        cells += `<button type="button" class="${cls}" data-cal-day="${key}">${d}</button>`;
      }
      body = `<div class="cal-grid">${CAL_DOW.map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>`;
    } else if (s.mode === 'month') {
      title = `Năm ${s.y}`;
      let cells = '';
      for (let mo = 1; mo <= 12; mo++) {
        const key = `${s.y}-${calPad(mo)}`;
        let cls = 'cal-cell';
        if (key === sel) cls += ' sel';
        if (key === nowKey.slice(0, 7)) cls += ' today';
        cells += `<button type="button" class="${cls}" data-cal-month="${key}">T${mo}</button>`;
      }
      body = `<div class="cal-grid g12">${cells}</div>`;
    } else {
      const start = s.y - 4;
      title = `${start} – ${start + 8}`;
      let cells = '';
      for (let i = 0; i < 9; i++) {
        const yy = String(start + i);
        let cls = 'cal-cell';
        if (yy === sel) cls += ' sel';
        if (yy === nowKey.slice(0, 4)) cls += ' today';
        cells += `<button type="button" class="${cls}" data-cal-year="${yy}">${yy}</button>`;
      }
      body = `<div class="cal-grid g9">${cells}</div>`;
    }

    const nowLabel = s.mode === 'day' ? 'Hôm nay' : s.mode === 'month' ? 'Tháng này' : 'Năm nay';
    s.pop.innerHTML = `
      <div class="cal-modes">${tab}</div>
      <div class="cal-head">
        <button type="button" class="year-btn" data-cal-nav="-1" aria-label="Kỳ trước">‹</button>
        <b>${title}</b>
        <button type="button" class="year-btn" data-cal-nav="1" aria-label="Kỳ sau">›</button>
      </div>
      ${body}
      <div class="cal-foot">
        <button type="button" class="button ghost" data-cal-today>${nowLabel}</button>
        <button type="button" class="button ghost" data-cal-clear>Xóa lọc</button>
      </div>`;

    if (focusSel) {
      const el = s.pop.querySelector('.cal-cell.sel') || s.pop.querySelector('.cal-cell.today');
      if (el && el.focus) el.focus({ preventScroll: true });
    }
  }

  function closeCalendar() {
    if (!calState) return;
    calState.pop.remove();
    calState.anchor.setAttribute('aria-expanded', 'false');
    calState = null;
  }

  function calPick(value) {
    const mode = calState.mode, cb = calState.onPick;
    closeCalendar();
    if (cb) cb(mode, value);
  }

  function openCalendar(opts) {
    const anchor = opts.anchor;
    if (calState && calState.anchor === anchor) { closeCalendar(); return; }   // bấm lại = đóng
    closeCalendar();
    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    pop.setAttribute('role', 'dialog');
    anchor.parentElement.appendChild(pop);
    const p = calParse(opts.value, opts.mode);
    calState = { anchor, pop, mode: opts.mode || 'day', onPick: opts.onPick, onClear: opts.onClear, y: p.y, mo: p.mo, d: p.d };
    anchor.setAttribute('aria-expanded', 'true');
    calRender(true);

    pop.addEventListener('click', e => {
      const mode = e.target.closest('[data-cal-mode]');
      if (mode) { calState.mode = mode.dataset.calMode; calRender(true); return; }
      const nav = e.target.closest('[data-cal-nav]');
      if (nav) { calNav(Number(nav.dataset.calNav)); calRender(true); return; }
      const day = e.target.closest('[data-cal-day]');
      if (day) { calPick(day.dataset.calDay); return; }
      const mon = e.target.closest('[data-cal-month]');
      if (mon) { calPick(mon.dataset.calMonth); return; }
      const yr = e.target.closest('[data-cal-year]');
      if (yr) { calPick(yr.dataset.calYear); return; }
      if (e.target.closest('[data-cal-today]')) { calPick(calTodayValue()); return; }
      if (e.target.closest('[data-cal-clear]')) {
        const cb = calState.onClear;
        closeCalendar();
        if (cb) cb();
      }
    });

    // Phím tắt: Esc đóng, mũi tên di chuyển giữa các ô ngày
    pop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeCalendar(); return; }
      const dirs = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (dirs[e.key] === undefined || calState.mode !== 'day') return;
      const cells = [...pop.querySelectorAll('.cal-cell')];
      const i = cells.indexOf(document.activeElement);
      const next = i >= 0 ? cells[i + dirs[e.key]] : null;
      if (next) { e.preventDefault(); next.focus(); }
    });
  }

  // Click ra ngoài → đóng (bấm chính nút mở thì để nút tự toggle)
  document.addEventListener('click', e => {
    if (!calState) return;
    // Node vừa bị lịch render lại (bấm ô điều hướng/tab) → không còn trong DOM,
    // phải bỏ qua nếu không popup sẽ tự đóng sau mỗi lần vẽ lại.
    if (!e.target.isConnected) return;
    if (calState.pop.contains(e.target) || calState.anchor.contains(e.target)) return;
    closeCalendar();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && calState) closeCalendar(); });
