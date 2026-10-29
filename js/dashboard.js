  function renderYears() {
    syncLog();
    const now = new Date();
    const thisYear = now.getFullYear();
    const todayKey = dateKey(now);
    const logYears = Object.keys(state.log).map(k => Number(k.slice(0, 4)));
    const firstYear = Math.min(2025, thisYear, ...logYears);
    const years = [];
    for (let yy = thisYear; yy >= firstYear; yy--) years.push(yy);

    const y = (selectedYear !== null && years.includes(selectedYear)) ? selectedYear : thisYear;
    const { start, end, rolling } = viewRange(y, now);
    const offset = start.getDay(); // Chủ nhật = hàng 1

    let cells = '', months = '', total = 0;
    // Số phút tập trung theo ngày (tooltip ô và dòng thông tin ngày được chọn)
    const focusMinByDay = {};
    state.focus.forEach(f => { if (f.date) focusMinByDay[f.date] = (focusMinByDay[f.date] || 0) + f.durationSec / 60; });
    for (let i = 0; ; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (d > end) break;
      const key = dateKey(d);
      const n = state.log[key] || 0;
      total += n;
      const col = Math.floor((i + offset) / 7) + 1;
      const row = (i + offset) % 7 + 1;
      if (d.getDate() === 1) months += `<span style="grid-column:${col}">${MONTHS[d.getMonth()]}</span>`;
      const cls = 'cell l' + levelOf(n) + (key > todayKey ? ' future' : '') + (key === todayKey ? ' today' : '') + (key === selectedDay ? ' sel' : '');
      const fm = focusMinByDay[key] ? ` · ${fmtMin(focusMinByDay[key])} tập trung` : '';
      const label = `${fmtDay(key)}: ${n} hoạt động hoàn thành${fm}`;
      cells += `<button class="${cls}" style="grid-column:${col};grid-row:${row}" data-day="${key}" title="${label}" aria-label="${label}"></button>`;
    }

    const title = rolling ? `${total} hoạt động trong năm qua` : `${total} hoạt động trong năm ${y}`;
    const info = selectedDay
      ? `<span class="note">${fmtDay(selectedDay)} · ${state.log[selectedDay] || 0} hoạt động hoàn thành${focusMinByDay[selectedDay] ? ' · ' + fmtMin(focusMinByDay[selectedDay]) + ' tập trung' : ''}</span>`
      : `<span class="note">Chọn một ô để xem ngày — bấm lại ô đó để thu lại</span>`;
    const legendCells = LEVEL_LABELS.map((l, i) => `<i class="cell${i ? ' l' + i : ''}" title="${l} hoạt động"></i>`).join('');
    const yearBtns = years.map(yy => `<button class="year-btn${yy === y ? ' active' : ''}" data-year="${yy}">${yy}</button>`).join('');

    const prev = $('.matrix-scroll');
    const prevLeft = prev ? prev.scrollLeft : 0;

    $('#yearCards').innerHTML = `
      <div class="graph-title">${title}</div>
      <div class="year-layout">
        <section class="panel">
          <div class="matrix-scroll" data-view="${y}">
            <div class="matrix-frame">
              <div class="wd"><span style="grid-row:2">T2</span><span style="grid-row:4">T4</span><span style="grid-row:6">T6</span></div>
              <div>
                <div class="months">${months}</div>
                <div class="matrix">${cells}</div>
              </div>
            </div>
          </div>
          <div class="matrix-bottom">
            <div style="display:flex;align-items:center;gap:8px;">${info}</div>
            <div style="text-align:right">
              <div class="legend">Ít ${legendCells} Nhiều</div>
            </div>
          </div>
          <div id="dayTaskList"></div>
        </section>
        <div class="year-list">${yearBtns}</div>
      </div>`;

    const el = $('.matrix-scroll');
    el.scrollLeft = (prev && prev.dataset.view === String(y)) ? prevLeft : (rolling ? el.scrollWidth : 0);

    renderDayTaskList();
  }

  // Danh sách công việc của ngày được chọn trong ma trận
  function renderDayTaskList() {
    const el = $('#dayTaskList');
    if (!el) return;
    if (!selectedDay) { el.innerHTML = ''; return; }
    // Hiện task đã hoàn thành đúng ngày đó, và task hẹn đúng ngày đó (kể cả tương lai).
    const dayTasks = state.tasks.filter(t =>
      (t.status === 'done' && t.completedAt === selectedDay) ||
      (t.status !== 'done' && t.dueDate === selectedDay)
    );
    const rows = dayTasks.map(t => `
      <div class="task-row ${t.status === 'done' ? 'done' : (isOverdue(t) ? 'overdue' : '')}" data-dnd-item="${t.id}">
        <input class="check" type="checkbox" data-daytask-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} aria-label="Hoàn thành công việc">
        <div>
          <div class="task-title">${escapeHTML(t.title)}</div>
          <div class="task-meta">${escapeHTML(t.meta)}${dueLabel(t)}${t.projectTitle ? ' · ' + escapeHTML(t.projectTitle) : ''}</div>
        </div>
        <span class="tag">${escapeHTML(t.tag)}</span>
        <button class="button ghost" data-edit-task="${t.id}">Sửa</button>
        <button class="button ghost" data-delete-task="${t.id}" aria-label="Xóa">✕</button>
      </div>`).join('');

    // Phiên tập trung đã ghi nhận trong ngày
    const dayFocus = state.focus.filter(f => f.date === selectedDay);    const focusRows = dayFocus.map(f => `
      <div class="focus-row">
        <span class="focus-when">${focusTimeLabel(f)}</span>
        <span class="focus-dur">${fmtMin(f.durationSec / 60)}</span>
        <span class="tag">${f.mode === 'stopwatch' ? 'Bấm giờ' : 'Hẹn giờ'} · ${escapeHTML(f.status)}</span>
        <span class="spacer"></span>
        <button class="button ghost" data-del-focus="${f.id}" aria-label="Xóa phiên tập trung">✕</button>
      </div>`).join('');

    // Buổi tập trong ngày (module Sức khỏe)
    const dayWorkouts = (state.health && state.health.workouts ? state.health.workouts : []).filter(w => w.date === selectedDay);
    const workoutRows = dayWorkouts.map(w => `
      <div class="focus-row">
        <span class="focus-when">${escapeHTML((sportById(w.sportId) || {}).name || '?')}</span>
        <span class="focus-dur">${metricSummary(w)}</span>
        <span class="spacer"></span>
        <button class="button ghost" data-open-health="1">Mở Sức khỏe →</button>
      </div>`).join('');

    el.innerHTML = `
      <div class="day-list-head">
        <h2>Công việc ngày ${fmtDay(selectedDay)}</h2>
        <button class="button ghost" data-collapse-day="1">Thu lại ▲</button>
      </div>
      <!-- Kéo thả đổi thứ tự trong ngày + khung cuộn khi nhiều việc -->
      <div id="dayTaskRows" class="list-scroll thin-scroll" data-dnd-group="dayTaskList">
        ${rows || '<div class="empty-note">Không có công việc nào trong ngày này.</div>'}
      </div>
      <div class="day-list-head"><h2>Phiên tập trung</h2><span class="tag">${dayFocus.length}</span></div>
      <div class="focus-list">${focusRows || '<div class="empty-note">Không có phiên tập trung nào trong ngày này.</div>'}</div>
      <div class="day-list-head"><h2>Buổi tập</h2><span class="tag">${dayWorkouts.length}</span></div>
      <div class="focus-list">${workoutRows || '<div class="empty-note">Không có buổi tập nào trong ngày này.</div>'}</div>`;
  }

  // Kéo – thả list công việc trong ma trận (cùng ngày đang chọn)
  DND.handlers.dayTaskList = ({ orderedIds }) => {
    state.tasks = reorderSubset(state.tasks, orderedIds);
    saveState();
    renderTasks();         // list chính + list "Công việc gần đây"
    renderDayTaskList();   // list trong ma trận (renderTasks không đụng tới nó)
    showToast('Đã đổi thứ tự công việc trong ngày');
  };

