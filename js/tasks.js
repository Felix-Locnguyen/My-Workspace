  function openTaskEditor(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const stat = t.status === 'done' ? 'done' : (t.inProgress ? 'doing' : 'todo');
    openModal('Sửa công việc', `
      <div class="form-group"><label>Tiêu đề</label><input id="eTaskTitle" value="${escapeHTML(t.title)}" /></div>
      <div class="form-group"><label>Mô tả / Thời lượng</label><input id="eTaskMeta" value="${escapeHTML(t.meta)}" /></div>
      <div class="form-group"><label>Ngày hẹn (để trống nếu không hẹn)</label><input type="date" id="eTaskDue" value="${t.dueDate || ''}" /></div>
      <div class="form-group"><label>Phân loại</label><select id="eTaskTag">${optionsHTML(TASK_TAGS.map(x => [x, x]), t.tag)}</select></div>
      <div class="form-group" id="eProjGroup" style="display:${t.tag === 'Project' ? 'block' : 'none'}"><label>Thuộc dự án</label><select id="eTaskProject"><option value="">Không có</option>${optionsHTML(state.projects.map(p => [p.title, p.title]), t.projectTitle)}</select></div>
      <div class="form-group"><label>Trạng thái</label><select id="eTaskStat">${optionsHTML([['todo', 'Chưa làm'], ['doing', 'Đang làm'], ['done', 'Hoàn thành']], stat)}</select></div>
    `, () => {
      const title = $('#eTaskTitle').value.trim();
      if (!title) { showToast('Vui lòng nhập tiêu đề'); return false; }
      t.title = title;
      t.meta = $('#eTaskMeta').value.trim();
      t.dueDate = $('#eTaskDue').value || null;
      t.tag = $('#eTaskTag').value;
      t.projectTitle = t.tag === 'Project' ? $('#eTaskProject').value : '';
      const st = $('#eTaskStat').value;
      t.status = st === 'done' ? 'done' : 'open';
      t.inProgress = st === 'doing';
      if (t.status === 'done') { if (!t.completedAt) t.completedAt = dateKey(new Date()); }
      else t.completedAt = null;
      saveState(); renderTasks(); renderProjects(); renderYears();
      showToast('Đã cập nhật công việc');
      return true;
    });
    $('#eTaskTag').addEventListener('change', e => {
      $('#eProjGroup').style.display = e.target.value === 'Project' ? 'block' : 'none';
    });
  }

  // Công việc
  function renderTasks() {
    const taskMarkup = t => `
      <div class="task-row ${t.status === 'done' ? 'done' : ''}">
        <input class="check" type="checkbox" data-task-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} aria-label="Hoàn thành công việc">
        <div>
          <div class="task-title">${escapeHTML(t.title)}</div>
          <div class="task-meta">${escapeHTML(t.meta)}${dueLabel(t)}${t.projectTitle ? ' · ' + escapeHTML(t.projectTitle) : ''}</div>
        </div>
        <span class="tag">${escapeHTML(t.tag)}</span>
        <button class="button ghost" data-edit-task="${t.id}">Sửa</button>
        <button class="button ghost" data-delete-task="${t.id}" aria-label="Xóa">✕</button>
      </div>`;

    $('#dashboardTasks').innerHTML = todayTasks().slice(0, 5).map(taskMarkup).join('') || '<div class="empty-note">Không có công việc nào hôm nay.</div>';

    const q = ($('#taskSearch').value || '').toLowerCase();
    const filterCat = $('#taskFilterCategory').value;
    const filter = $('#taskFilter').value;
    const shown = todayTasks().filter(t => {
      const matchQ = (t.title + ' ' + t.meta + ' ' + t.tag + ' ' + (t.projectTitle || '')).toLowerCase().includes(q);
      const matchCat = filterCat === 'all' || t.tag === filterCat;
      const matchStat = filter === 'all' || (filter === 'done' ? t.status === 'done' : t.status !== 'done');
      return matchQ && matchCat && matchStat;
    });
    $('#allTasks').innerHTML = shown.length ? shown.map(taskMarkup).join('') : '<div class="empty-note">Không tìm thấy công việc phù hợp.</div>';

    const doneCount = todayTasks().filter(t => t.status === 'done').length;
    const totalCount = todayTasks().length;
    $('#taskTotal').textContent = totalCount;
    $('#taskDone').textContent = doneCount;
    $('#taskPending').textContent = totalCount - doneCount;
    $('#taskRate').textContent = totalCount ? Math.round(doneCount / totalCount * 100) + '%' : '0%';
    $('#dashTaskStat').textContent = `${doneCount}/${totalCount}`;
  }


  // Thêm công việc
  function promptTaskModal() {
    const projOptions = state.projects.map(p => `<option value="${escapeHTML(p.title)}">${escapeHTML(p.title)}</option>`).join('');
    openModal('Thêm công việc', `
      <div class="form-group"><label>Tiêu đề</label><input id="mTaskTitle" /></div>
      <div class="form-group"><label>Phân loại</label><select id="mTaskTag">
        <option value="Học tập">Học tập</option>
        <option value="Project">Project</option>
        <option value="Tài chính">Tài chính</option>
        <option value="Đời thường">Đời thường</option>
        <option value="Khác">Khác</option>
      </select></div>
      <div class="form-group" id="projSelectGroup" style="display:none;"><label>Thuộc dự án</label><select id="mTaskProject">${projOptions}</select></div>
      <div class="form-group"><label>Ngày hẹn (để trống nếu không hẹn)</label><input type="date" id="mTaskDue" /></div>
      <div class="form-group"><label>Mô tả / Thời lượng</label><input id="mTaskMeta" value="30 phút" /></div>
    `, () => {
      const title = $('#mTaskTitle').value.trim();
      const tag = $('#mTaskTag').value;
      const projectTitle = tag === 'Project' ? ($('#mTaskProject').value || '') : '';
      const meta = $('#mTaskMeta').value.trim();
      if (!title) { showToast('Vui lòng nhập tiêu đề'); return false; }
      state.tasks.unshift({ id: Date.now(), title, meta: meta || 'General', tag, projectTitle, status: 'open', inProgress: false, dueDate: $('#mTaskDue').value || null, completedAt: null });
      saveState(); renderTasks();
      if (activeProjectId !== null) renderProjects();
      showToast('Đã thêm công việc');
      return true;
    });
    $('#mTaskTag').addEventListener('change', e => {
      $('#projSelectGroup').style.display = e.target.value === 'Project' ? 'block' : 'none';
    });
  }
  $('#addTaskBtn').addEventListener('click', promptTaskModal);
  $('#quickAdd').addEventListener('click', promptTaskModal);
