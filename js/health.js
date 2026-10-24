  // ── Sức khỏe (Health & Fitness): môn thể dục, ma trận check-in, biểu đồ ──
  const DEFAULT_SPORTS = [
    { id: 'run', name: 'Chạy bộ', kind: 'distance' },
    { id: 'bike', name: 'Đạp xe', kind: 'distance' },
    { id: 'rope', name: 'Nhảy dây', kind: 'reps' },
    { id: 'gym', name: 'Gym', kind: 'gym' }
  ];
  const SPORT_KINDS = [['distance', 'Quãng đường (km + phút)'], ['reps', 'Số rep (rep + phút)'], ['reps_sets', 'Rep + Hiệp (không tạ)'], ['gym', 'Tạ (kg + rep + hiệp)']];
  const KIND_LABEL = { distance: 'Quãng đường', reps: 'Rep', reps_sets: 'Rep + Hiệp', gym: 'Tạ' };
  let healthYear = null; // năm đang xem trong ma trận sức khỏe (null = năm hiện tại)
  let healthChartRange = 'year'; // khoảng thời gian của biểu đồ: week | month | year

  // Lọc buổi tập theo khoảng Tuần (7 ngày qua) / Tháng (tháng này) / Năm (năm nay)
  function healthRangeFilter(range) {
    const now = new Date();
    if (range === 'week') { const from = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)); return k => k >= from; }
    if (range === 'month') { const ym = dateKey(now).slice(0, 7); return k => k.slice(0, 7) === ym; }
    return k => k.slice(0, 4) === String(now.getFullYear());
  }

  const healthState = () => state.health;
  const sportById = id => (state.health ? state.health.sports.find(s => s.id === id) : null);
  const activeSportId = () => (state.health ? state.health.activeSport : 'all');
  const fmtNum = v => Number(v || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const metricUnit = kind => kind === 'distance' ? 'km' : ((kind === 'reps' || kind === 'reps_sets') ? 'rep' : 'vol');

  // Chỉ số của một buổi tập → chuỗi mô tả theo từng loại môn
  function metricSummary(w) {
    const sp = sportById(w.sportId), m = w.metrics || {};
    if (!sp) return '';
    if (sp.kind === 'distance') return `${fmtNum(m.km)} km · ${fmtNum(m.minutes)} phút`;
    if (sp.kind === 'reps') return `${fmtNum(m.reps)} rep · ${fmtNum(m.minutes)} phút`;
    if (sp.kind === 'reps_sets') return `${fmtNum(m.reps)} rep · ${fmtNum(m.sets)} hiệp`;
    return `${fmtNum(m.kg)} kg × ${fmtNum(m.reps)} × ${fmtNum(m.sets)}`;
  }
  function workoutTagsHTML(w) {
    const sp = sportById(w.sportId), m = w.metrics || {};
    if (!sp) return '';
    if (sp.kind === 'distance') return `<span class="wtag">${fmtNum(m.km)} km</span><span class="wtag">${fmtNum(m.minutes)} phút</span>`;
    if (sp.kind === 'reps') return `<span class="wtag">${fmtNum(m.reps)} rep</span><span class="wtag">${fmtNum(m.minutes)} phút</span>`;
    if (sp.kind === 'reps_sets') return `<span class="wtag">${fmtNum(m.reps)} rep</span><span class="wtag">${fmtNum(m.sets)} hiệp</span>`;
    const vol = (Number(m.kg) || 0) * (Number(m.reps) || 0) * (Number(m.sets) || 0);
    return `<span class="wtag">${fmtNum(m.kg)} kg × ${fmtNum(m.reps)} × ${fmtNum(m.sets)}</span><span class="wtag">vol ${fmtNum(vol)}</span>`;
  }
  // Giá trị dùng cho biểu đồ: km (chạy/đạp xe), rep (nhảy dây/rep+hiệp), volume kg×rep×hiệp (gym)
  function metricValue(w) {
    const sp = sportById(w.sportId), m = w.metrics || {};
    if (!sp) return 0;
    if (sp.kind === 'distance') return Number(m.km) || 0;
    if (sp.kind === 'gym') return (Number(m.kg) || 0) * (Number(m.reps) || 0) * (Number(m.sets) || 0);
    return Number(m.reps) || 0;
  }

  // Chuỗi ngày tập: hiện tại (kéo tới hôm nay hoặc hôm qua) và dài nhất lịch sử
  function streakInfo(filter) {
    const days = new Set(state.health.workouts.filter(w => filter === 'all' || w.sportId === filter).map(w => w.date));
    let best = 0, cur = 0, prev = null;
    [...days].sort().forEach(k => {
      const d = new Date(k + 'T00:00:00');
      cur = (prev && Math.round((d - prev) / 86400000) === 1) ? cur + 1 : 1;
      prev = d;
      if (cur > best) best = cur;
    });
    const now = new Date();
    if (!days.has(dateKey(now))) now.setDate(now.getDate() - 1); // hôm nay chưa tập → chuỗi tính tới hôm qua
    let streak = 0;
    while (days.has(dateKey(now))) { streak++; now.setDate(now.getDate() - 1); }
    return { current: streak, best, trainedToday: days.has(dateKey(new Date())) };
  }

  // Bộ lọc môn (chips) — dùng chung cho ma trận, danh sách và biểu đồ
  function renderExerciseSelector() {
    const chips = [{ id: 'all', name: 'Tất cả' }, ...state.health.sports];
    $('#healthSports').innerHTML = chips.map(c =>
      `<button class="sport-chip${activeSportId() === c.id ? ' active' : ''}" data-sport="${escapeHTML(c.id)}">${escapeHTML(c.name)}</button>`).join('');
  }

  function renderHealthStats() {
    const f = activeSportId();
    const s = streakInfo(f);
    const now = new Date();
    const from = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    const list = state.health.workouts.filter(w => f === 'all' || w.sportId === f);
    $('#hStreakNow').textContent = s.current + ' ngày';
    $('#hStreakBest').textContent = s.best + ' ngày';
    $('#hWeekCount').textContent = list.filter(w => w.date >= from).length;
    $('#hTotalCount').textContent = list.length;
    $('#hStreakNote').textContent = s.trainedToday ? 'Đã tập hôm nay ✓' : 'Hôm nay chưa tập';
  }

  // Ma trận check-in: 12 tháng, ô có buổi tập → tô xanh lá nổi bật
  function healthDaysMap(filter) {
    const map = {};
    state.health.workouts.forEach(w => {
      if (filter !== 'all' && w.sportId !== filter) return;
      if (!map[w.date]) map[w.date] = [];
      map[w.date].push(w);
    });
    return map;
  }

  function renderHealthMatrix() {
    const now = new Date();
    const thisYear = now.getFullYear();
    const todayKey = dateKey(now);
    const days = healthDaysMap(activeSportId());
    const years = [];
    for (let yy = thisYear; yy >= thisYear - 4; yy--) years.push(yy);
    Object.keys(days).forEach(k => {
      const y = Number(k.slice(0, 4));
      if (!years.includes(y)) years.push(y);
    });
    years.sort((a, b) => b - a);
    const y = (healthYear && years.includes(healthYear)) ? healthYear : thisYear;
    const { start, end, rolling } = viewRange(y, now);
    const offset = start.getDay();

    let cells = '', months = '', total = 0;
    for (let i = 0; ; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (d > end) break;
      const key = dateKey(d);
      const list = days[key] || [];
      total += list.length;
      const col = Math.floor((i + offset) / 7) + 1;
      const row = (i + offset) % 7 + 1;
      if (d.getDate() === 1) months += `<span style="grid-column:${col}">${MONTHS[d.getMonth()]}</span>`;
      const detail = list.map(w => `${(sportById(w.sportId) || {}).name || ''} ${metricSummary(w)}`).filter(s => s.trim()).join(' · ');
      const label = `${fmtDay(key)}${list.length ? ' · ' + detail : ' · không tập'}`;
      const cls = 'cell' + (list.length ? ' on' : '') + (key > todayKey ? ' future' : '') + (key === todayKey ? ' today' : '');
      cells += `<button class="${cls}" style="grid-column:${col};grid-row:${row}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"></button>`;
    }

    const title = `${total} buổi tập trong ${rolling ? '12 tháng qua' : 'năm ' + y}`;
    const yearBtns = years.map(yy => `<button class="year-btn${yy === y ? ' active' : ''}" data-hyear="${yy}">${yy}</button>`).join('');
    $('#healthMatrix').innerHTML = `
      <div class="year-layout">
        <section>
          <div class="matrix-scroll" data-hview="${y}">
            <div class="matrix-frame">
              <div class="wd"><span style="grid-row:2">T2</span><span style="grid-row:4">T4</span><span style="grid-row:6">T6</span></div>
              <div>
                <div class="months">${months}</div>
                <div class="matrix health-matrix">${cells}</div>
              </div>
            </div>
          </div>
          <div class="hm-legend">
            <span class="note">${title}</span>
            <span class="legend">Không tập <i class="cell"></i><i class="cell on"></i> Có tập</span>
          </div>
        </section>
        <div class="year-list">${yearBtns}</div>
      </div>`;
  }

  // Lịch sử buổi tập
  function renderWorkoutLogList() {
    const f = activeSportId();
    const list = state.health.workouts
      .filter(w => f === 'all' || w.sportId === f)
      .sort((a, b) => a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : b.date.localeCompare(a.date));
    const rows = list.slice(0, 40).map(w => `
      <div class="wrow">
        <span class="wdate">${fmtDay(w.date)}</span>
        <span class="wname">${escapeHTML((sportById(w.sportId) || {}).name || '?')}</span>
        ${workoutTagsHTML(w)}
        <span class="spacer"></span>
        <button class="button ghost" data-edit-workout="${w.id}">Sửa</button>
        <button class="button ghost" data-del-workout="${w.id}" aria-label="Xóa">✕</button>
      </div>`).join('');
    $('#workoutLogList').innerHTML = rows || '<div class="empty-note">Chưa có buổi tập nào. Bấm “+ Buổi tập” để ghi nhận.</div>';
    $('#workoutCount').textContent = list.length ? `${list.length} buổi` : '';
  }

  // Biểu đồ: mỗi môn một biểu đồ đường riêng (y = km | reps | kg) + đường TB 7 buổi
  // Các mốc thời gian của biểu đồ: Tuần = 7 ngày, Tháng = từng ngày, Năm = 12 tháng.
  // Mỗi mốc là một nút <button>; giá trị = tổng trong mốc đó (gym theo volume kg×rep×hiệp).
  function healthBuckets(sp) {
    const now = new Date();
    const todayKey = dateKey(now);
    const inRange = healthRangeFilter(healthChartRange);
    const list = state.health.workouts.filter(w => w.sportId === sp.id && inRange(w.date));
    const sumByDate = {};
    const countByDate = {};
    list.forEach(w => {
      sumByDate[w.date] = (sumByDate[w.date] || 0) + metricValue(w);
      countByDate[w.date] = (countByDate[w.date] || 0) + 1;
    });
    const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const buckets = [];
    if (healthChartRange === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = dateKey(d);
        buckets.push({ label: WD[d.getDay()], full: fmtDay(key), date: key, today: key === todayKey,
          value: sumByDate[key] || 0, count: countByDate[key] || 0, future: key > todayKey });
      }
    } else if (healthChartRange === 'month') {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(now.getFullYear(), now.getMonth(), day);
        const key = dateKey(d);
        buckets.push({ label: (day === 1 || day % 5 === 0 || day === lastDay) ? String(day) : '', full: fmtDay(key), date: key, today: key === todayKey,
          value: sumByDate[key] || 0, count: countByDate[key] || 0, future: key > todayKey });
      }
    } else {
      for (let m = 0; m < 12; m++) {
        let value = 0, count = 0;
        const ym = now.getFullYear() + '-' + String(m + 1).padStart(2, '0');
        Object.keys(sumByDate).forEach(k => {
          if (k.slice(0, 7) === ym) { value += sumByDate[k]; count += countByDate[k]; }
        });
        buckets.push({ label: MONTHS[m], full: `${MONTHS[m]}/${now.getFullYear()}`, date: ym + '-01', today: m === now.getMonth(),
          value, count, future: ym > todayKey.slice(0, 7) });
      }
    }
    return buckets;
  }

  function healthChartHTML(sp) {
    const buckets = healthBuckets(sp);
    const unit = metricUnit(sp.kind);
    const total = buckets.reduce((s, b) => s + b.value, 0);
    const sessions = buckets.reduce((s, b) => s + b.count, 0);
    const title = `<div class="hc-title"><b>${escapeHTML(sp.name)}</b><span>${unit} · kỳ này ${fmtNum(total)}</span></div>`;
    if (!state.health.workouts.some(w => w.sportId === sp.id)) {
      return `<div class="hc-wrap">${title}<div class="hc-empty">Chưa có dữ liệu cho môn này.</div></div>`;
    }
    const max = Math.max(1, ...buckets.map(b => b.value));
    const cols = buckets.map(b => {
      const tip = b.count
        ? `${b.full} · ${fmtNum(b.value)} ${unit} · ${b.count} buổi`
        : `${b.full} · chưa có buổi tập`;
      const cls = 'hc-col' + (b.value > 0 ? ' has' : '') + (b.today ? ' today' : '');
      const h = b.value > 0 ? Math.max(4, (b.value / max) * 100) : 0;
      const attrs = b.future
        ? 'disabled aria-disabled="true"'
        : `data-hdate="${b.date}"`;
      return `<button type="button" class="${cls}" style="height:100%" ${attrs}\n        data-tip="${escapeHTML(tip)}" aria-label="${escapeHTML(tip)}"><span class="hc-fill" style="height:${h}%"></span></button>`;
    }).join('');
    const labels = buckets.map(b => `<span class="${b.today ? 'today' : ''}">${b.label}</span>`).join('');
    const emptyNote = sessions === 0 ? '<div class="hc-empty">Không có buổi tập nào trong khoảng này.</div>' : '';
    return `<div class="hc-wrap">
      ${title}
      ${emptyNote}
      <div class="hc-chart" role="group" aria-label="${escapeHTML(sp.name)} — ${healthChartRange === 'year' ? '12 tháng' : (healthChartRange === 'month' ? 'các ngày trong tháng' : '7 ngày qua')}">${cols}</div>
      <div class="hc-labels">${labels}</div>
      <div class="hc-tip"></div>
    </div>`;
  }

  function renderHealthCharts() {
    const f = activeSportId();
    const sports = f === 'all' ? state.health.sports : state.health.sports.filter(s => s.id === f);
    $('#healthCharts').innerHTML = sports.map(healthChartHTML).join('') || '<div class="empty-note">Chưa có môn thể dục nào.</div>';
    $$('#healthCharts .hc-col').forEach(el => {
      const wrap = el.closest('.hc-wrap'), tip = wrap.querySelector('.hc-tip');
      const show = () => {
        const r = el.getBoundingClientRect(), pr = wrap.getBoundingClientRect();
        tip.textContent = el.dataset.tip;
        tip.style.left = (r.left + r.width / 2 - pr.left) + 'px';
        tip.style.top = (r.top - pr.top) + 'px';
        tip.classList.add('show');
      };
      const hide = () => tip.classList.remove('show');
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', show);   // hỗ trợ bàn phím
      el.addEventListener('blur', hide);
      el.addEventListener('click', () => openWorkoutEditor(null, el.dataset.hdate)); // bấm cột → thêm buổi tập ngày đó
    });
  }

  function renderHealth() {
    if (!$('#healthMatrix')) return;
    renderExerciseSelector(); renderHealthStats(); renderHealthMatrix(); renderWorkoutLogList(); renderHealthCharts();
  }

  // Form chỉ số động theo từng loại môn
  function workoutFieldsHTML(kind, m = {}) {
    const num = (id, label, val, step) => `<div class="form-group"><label for="${id}">${label}</label><input type="number" id="${id}" step="${step || '1'}" min="0" value="${(val === undefined || val === null || isNaN(Number(val))) ? '' : Number(val)}" /></div>`;
    if (kind === 'distance') return num('wKm', 'Số km', m.km, '0.1') + num('wMinutes', 'Thời gian (phút)', m.minutes);
    if (kind === 'reps') return num('wReps', 'Số rep', m.reps) + num('wMinutes', 'Thời gian (phút)', m.minutes);
    if (kind === 'reps_sets') return num('wReps', 'Số rep', m.reps) + num('wSets', 'Số hiệp', m.sets);
    return num('wKg', 'Số kg tạ (tối đa / trung bình)', m.kg) + num('wReps', 'Số rep mỗi hiệp', m.reps) + num('wSets', 'Số hiệp', m.sets);
  }

  function openWorkoutEditor(id, presetDate) { // presetDate: ngày điền sẵn khi bấm vào cột biểu đồ
    const h = state.health;
    const w = id ? h.workouts.find(x => x.id === id) : null;
    const defaultSport = w ? w.sportId : (activeSportId() !== 'all' && sportById(activeSportId()) ? activeSportId() : (h.sports[0] ? h.sports[0].id : ''));
    const sportOptions = h.sports.map(s => `<option value="${escapeHTML(s.id)}" ${s.id === defaultSport ? 'selected' : ''}>${escapeHTML(s.name)} — ${KIND_LABEL[s.kind] || s.kind}</option>`).join('');
    const initDate = w ? w.date : (/^\d{4}-\d{2}-\d{2}$/.test(presetDate || '') ? presetDate : dateKey(new Date()));
    openModal(w ? 'Sửa buổi tập' : 'Thêm buổi tập', `
      <div class="form-group"><label for="wSport">Môn thể dục</label><select id="wSport">${sportOptions}</select></div>
      <div id="wFields">${workoutFieldsHTML((sportById(defaultSport) || {}).kind || 'distance', w ? w.metrics : {})}</div>
      <div class="form-group"><label for="wDate">Ngày</label><input type="date" id="wDate" value="${initDate}" /></div>
    `, () => {
      const sp = sportById($('#wSport').value);
      const date = $('#wDate').value;
      const read = sel => { const el = $(sel); return el ? Number(el.value) : NaN; };
      if (!sp) { showToast('Không có môn thể dục này'); return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Vui lòng chọn ngày'); return false; }
      let metrics;
      if (sp.kind === 'distance') {
        const km = read('#wKm'), minutes = read('#wMinutes');
        if (!(km > 0) || !(minutes > 0)) { showToast('Vui lòng nhập km và thời gian > 0'); return false; }
        metrics = { km, minutes };
      } else if (sp.kind === 'reps') {
        const reps = read('#wReps'), minutes = read('#wMinutes');
        if (!(reps > 0) || !(minutes > 0)) { showToast('Vui lòng nhập số rep và thời gian > 0'); return false; }
        metrics = { reps, minutes };
      } else if (sp.kind === 'reps_sets') {
        const reps = read('#wReps'), sets = read('#wSets');
        if (!(reps > 0) || !(sets > 0)) { showToast('Vui lòng nhập số rep và số hiệp > 0'); return false; }
        metrics = { reps, sets };
      } else {
        const kg = read('#wKg'), reps = read('#wReps'), sets = read('#wSets');
        if (!(kg > 0) || !(reps > 0) || !(sets > 0)) { showToast('Vui lòng nhập kg, số rep và số hiệp > 0'); return false; }
        metrics = { kg, reps, sets };
      }
      if (w) { w.sportId = sp.id; w.date = date; w.metrics = metrics; }
      else h.workouts.unshift({ id: Date.now(), sportId: sp.id, date, createdAt: new Date().toISOString(), metrics });
      saveState(); renderHealth(); renderYears();
      showToast(w ? 'Đã cập nhật buổi tập' : 'Đã thêm buổi tập');
      return true;
    });
    $('#wSport').addEventListener('change', e => {
      const sp = sportById(e.target.value);
      $('#wFields').innerHTML = workoutFieldsHTML((sp || {}).kind || 'distance', {});
    });
  }

  // Quản lý môn thể dục (thêm / xóa)
  function renderSportList() {
    const el = $('#sportList');
    if (!el) return;
    el.innerHTML = state.health.sports.map(s => {
      const used = state.health.workouts.some(w => w.sportId === s.id);
      return `<div class="wrow">
        <span class="wname">${escapeHTML(s.name)}</span>
        <span class="wtag">${KIND_LABEL[s.kind] || s.kind}</span>
        <span class="spacer"></span>
        <button class="button ghost" data-sport-del="${escapeHTML(s.id)}" ${used ? 'disabled title="Môn này đã có dữ liệu buổi tập"' : ''}>✕</button>
      </div>`;
    }).join('') || '<div class="empty-note">Chưa có môn nào.</div>';
  }

  $('#addWorkoutBtn').addEventListener('click', () => openWorkoutEditor());
  $('#manageSportsBtn').addEventListener('click', () => {
    openModal('Quản lý môn thể dục', `
      <div id="sportList"></div>
      <div class="form-group" style="margin-top:16px"><label for="newSportName">Thêm môn mới</label><input id="newSportName" placeholder="Ví dụ: Bơi lội" /></div>
      <div class="form-group"><label for="newSportKind">Bộ chỉ số</label><select id="newSportKind">${optionsHTML(SPORT_KINDS, 'distance')}</select></div>
    `, () => {
      const name = $('#newSportName').value.trim();
      const kind = $('#newSportKind').value;
      if (!name) { showToast('Vui lòng nhập tên môn thể dục'); return false; }
      if (state.health.sports.some(s => s.name.toLowerCase() === name.toLowerCase())) { showToast('Môn thể dục này đã tồn tại'); return false; }
      state.health.sports.push({ id: 'sp' + Date.now(), name, kind });
      saveState(); renderHealth();
      showToast('Đã thêm môn ' + name);
      return true;
    });
    renderSportList();
  });

  // Tài chính
