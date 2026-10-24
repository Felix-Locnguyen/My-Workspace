  // Sự kiện chung
  document.addEventListener('change', e => {
    if (e.target.matches('[data-daytask-id]')) {
      const task = state.tasks.find(t => t.id === Number(e.target.dataset.daytaskId));
      if (task) {
        task.status = e.target.checked ? 'done' : 'open';
        if (task.status === 'done') { task.completedAt = selectedDay || dateKey(new Date()); task.inProgress = false; }
        else task.completedAt = null;
        saveState(); renderTasks(); renderProjects();
        renderYears(); // ma trận chỉ đếm việc hoàn thành → vẽ lại từ tasks
      }
      return;
    }
    if (e.target.matches('[data-task-id]')) {
      const task = state.tasks.find(t => t.id === Number(e.target.dataset.taskId));
      if (task) {
        const nowChecked = e.target.checked;
        task.status = nowChecked ? 'done' : 'open';
        task.completedAt = nowChecked ? dateKey(new Date()) : null;
        if (nowChecked) task.inProgress = false;
        saveState(); renderTasks();
        renderYears(); // ma trận chỉ đếm việc hoàn thành → vẽ lại từ tasks
        if (activeProjectId !== null) renderProjects();
      }
    }
  });

  document.addEventListener('click', e => {
    const heroPick = e.target.closest('[data-hero-pick]');
    if (heroPick) { heroTarget = heroPick.dataset.heroPick; $('#heroFile').click(); return; }
    const heroClear = e.target.closest('[data-hero-clear]');
    if (heroClear) {
      const k = heroClear.dataset.heroClear;
      (async () => {
        try {
          for (const key of (k === 'all' ? HERO_PAGES.map(p => p[0]) : [k])) await clearHero(key);
          applyHeroes();
          renderHeroSettings();
          showToast('Đã xóa hình nền');
        } catch (err) { showToast('Không xóa được hình nền'); }
      })();
      return;
    }
    const yearBtn = e.target.closest('[data-year]');
    if (yearBtn) {
      const yy = Number(yearBtn.dataset.year);
      selectedYear = yy === new Date().getFullYear() ? null : yy;
      selectedDay = null;
      renderYears();
      return;
    }
    const rangeBtn = e.target.closest('[data-focus-range]');
    if (rangeBtn) { focusRange = rangeBtn.dataset.focusRange; renderFocusChart(); return; }
    const collapseFocus = e.target.closest('[data-collapse-focus]');
    if (collapseFocus) { focusListHidden = !focusListHidden; renderFocusChart(); return; }
    const delFocus = e.target.closest('[data-del-focus]');
    if (delFocus) {
      const id = Number(delFocus.dataset.delFocus);
      const f = state.focus.find(x => x.id === id);
      if (!f) return;
      confirmModal('Xóa phiên tập trung', `Xóa phiên ${fmtMin(f.durationSec / 60)} ngày ${fmtDay(f.date)}?`, () => {
        state.focus = state.focus.filter(x => x.id !== id);
        saveState(); renderFocus(); renderYears();
        showToast('Đã xóa phiên tập trung');
      });
      return;
    }
    // ── Sức khỏe ──
    const sportChip = e.target.closest('[data-sport]');
    if (sportChip) {
      state.health.activeSport = sportChip.dataset.sport;
      saveState(); renderHealth();
      return;
    }
    const hYearBtn = e.target.closest('[data-hyear]');
    if (hYearBtn) {
      const yy = Number(hYearBtn.dataset.hyear);
      healthYear = yy === new Date().getFullYear() ? null : yy;
      renderHealthMatrix();
      return;
    }
    const hChartBtn = e.target.closest('[data-hchart]');
    if (hChartBtn) {
      healthChartRange = hChartBtn.dataset.hchart;
      $$('#healthChartTabs .year-btn').forEach(b => b.classList.toggle('active', b.dataset.hchart === healthChartRange));
      renderHealthCharts();
      return;
    }
    const sportDel = e.target.closest('[data-sport-del]');
    if (sportDel) {
      const id = sportDel.dataset.sportDel;
      const sp = sportById(id);
      if (!sp) return;
      if (state.health.workouts.some(w => w.sportId === id)) { showToast('Môn này đã có dữ liệu buổi tập, không xóa được'); return; }
      state.health.sports = state.health.sports.filter(s => s.id !== id);
      if (state.health.activeSport === id) state.health.activeSport = 'all';
      saveState(); renderHealth(); renderSportList();
      showToast('Đã xóa môn ' + sp.name);
      return;
    }
    const editWorkout = e.target.closest('[data-edit-workout]');
    if (editWorkout) { openWorkoutEditor(Number(editWorkout.dataset.editWorkout)); return; }
    const delWorkout = e.target.closest('[data-del-workout]');
    if (delWorkout) {
      const id = Number(delWorkout.dataset.delWorkout);
      const w = state.health.workouts.find(x => x.id === id);
      if (!w) return;
      const sp = sportById(w.sportId);
      confirmModal('Xóa buổi tập', `Xóa buổi ${(sp || {}).name || ''} ngày ${fmtDay(w.date)}?`, () => {
        state.health.workouts = state.health.workouts.filter(x => x.id !== id);
        saveState(); renderHealth(); renderYears();
        showToast('Đã xóa buổi tập');
      });
      return;
    }
    const openHealth = e.target.closest('[data-open-health]');
    if (openHealth) { go('health'); return; }
    const collapseDay = e.target.closest('[data-collapse-day]');
    if (collapseDay) { selectedDay = null; renderYears(); return; }
    const dayCell = e.target.closest('[data-day]');
    if (dayCell) {
      const key = dayCell.dataset.day;
      selectedDay = selectedDay === key ? null : key; // bấm lại ô đang mở để thu danh sách
      renderYears();
      return;
    }
    const delTask = e.target.closest('[data-delete-task]');
    if (delTask) {
      const taskId = Number(delTask.dataset.deleteTask);
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;
      // Xóa task: ma trận tự đếm lại từ danh sách công việc còn lại
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      saveState();
      renderTasks();
      renderYears();
      if (activeProjectId !== null) {
        renderProjects();
      }
      showToast('Đã xóa công việc');
      return;
    }
    const delProj = e.target.closest('[data-delete-project]');
    if (delProj) {
      const id = Number(delProj.dataset.deleteProject);
      const proj = state.projects.find(p => p.id === id);
      if (proj) confirmModal('Xóa dự án', `Xóa dự án "${proj.title}"? Các công việc thuộc dự án vẫn được giữ lại nhưng không còn gắn với dự án.`, () => {
        state.tasks.forEach(t => { if (t.projectTitle === proj.title) t.projectTitle = ''; });
        state.projects = state.projects.filter(p => p.id !== id);
        if (activeProjectId === proj.title) activeProjectId = null;
        saveState(); renderTasks(); renderProjects();
        showToast('Đã xóa dự án');
      });
      return;
    }
    const delAsset = e.target.closest('[data-delete-asset]');
    if (delAsset) {
      const id = Number(delAsset.dataset.deleteAsset);
      const ast = state.assets.find(a => a.id === id);
      if (ast) confirmModal('Xóa tài sản', `Xóa tài sản "${ast.name}"?`, () => {
        state.assets = state.assets.filter(a => a.id !== id);
        saveState(); renderFinance();
        showToast('Đã xóa tài sản');
      });
      return;
    }
    const editProj = e.target.closest('[data-edit-project]');
    if (editProj) { openProjectEditor(Number(editProj.dataset.editProject)); return; }
    const editAsset = e.target.closest('[data-edit-asset]');
    if (editAsset) { openAssetEditor(Number(editAsset.dataset.editAsset)); return; }
    const editTx = e.target.closest('[data-edit-tx]');
    if (editTx) { openTransactionEditor(Number(editTx.dataset.editTx)); return; }
    const delTx = e.target.closest('[data-delete-tx]');
    if (delTx) {
      const id = Number(delTx.dataset.deleteTx);
      const tx = state.transactions.find(t => t.id === id);
      if (tx) confirmModal('Xóa giao dịch', `Xóa giao dịch "${tx.name}"?`, () => {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveState(); renderFinance();
        showToast('Đã xóa giao dịch');
      });
      return;
    }
    const openProj = e.target.closest('[data-open-project]');
    if (openProj) {
      activeProjectId = openProj.getAttribute('data-open-project');
      go('projects');
      activeProjectId = openProj.getAttribute('data-open-project');
      renderProjects();
      return;
    }
    const editCard = e.target.closest('[data-edit-task]');
    if (editCard) { openTaskEditor(Number(editCard.dataset.editTask)); return; }
  });

  $('#taskSearch').addEventListener('input', renderTasks);
  $('#taskFilterCategory').addEventListener('change', renderTasks);
  $('#taskFilter').addEventListener('change', renderTasks);

  // Nạp state từ server. Nếu server trống mà localStorage còn dữ liệu cũ → migrate một lần.
  async function loadState() {
    let remote = null;
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      remote = await res.json();
    } catch (err) {
      // Không nối được server (ví dụ mở nhầm file:// hoặc server chưa chạy).
      showToast('Không kết nối được server — dữ liệu chưa được nạp. Hãy chạy: python3 server.py');
      return false;
    }

    const hasRemoteData = remote && Object.keys(remote).length > 0;
    if (hasRemoteData) {
      state = normalizeState(Object.assign(JSON.parse(JSON.stringify(defaultState)), remote));
      return true;
    }

    // Chưa có dữ liệu trên server: thử migrate từ localStorage cũ.
    const legacy = localStorage.getItem('locOS_state');
    if (legacy) {
      try {
        state = normalizeState(Object.assign(JSON.parse(JSON.stringify(defaultState)), JSON.parse(legacy)));
        await flushState();                    // ghi lên server trước
        localStorage.removeItem('locOS_state'); // rồi mới xoá bản cũ
        showToast('Đã chuyển dữ liệu từ trình duyệt sang file JSON');
        return true;
      } catch (err) { /* dữ liệu cũ hỏng: rơi xuống defaultState */ }
    }

    state = normalizeState(JSON.parse(JSON.stringify(defaultState)));
    return true;
  }

  // Đồng bộ các ô nhập phụ thuộc state sau khi đã nạp xong.
  function applyStateToInputs() {
    setHeading();
    $('#settingsName').value = state.user.name;
    $('#idleHide').value = String(state.ui.idleHide);
    syncMaskBtn();            // nút mắt: theo trạng thái isAmountHidden đã lưu
  }

  async function init() {
    await loadState();
    applyStateToInputs();

    renderTasks();
    renderProjects();
    renderFinance();
    renderYears();
    renderFocus();          // đồng hồ sẽ tự chạy tiếp nếu có phiên đang mở
    renderHealth();
    setInterval(timerTick, 250);

    applyHeroes();
    renderHeroSettings();
    loadHeroes();

    // Tự cập nhật khi sang ngày mới / năm mới (tạo card năm mới)
    setInterval(() => {
      const k = dateKey(new Date());
      if (k !== lastDay) {
        lastDay = k;
        selectedDay = null;
        renderYears(); renderTasks(); renderProjects(); renderFocus(); renderHealth();
      }
    }, 30000);
  }
  let lastDay = dateKey(new Date());
  init();
