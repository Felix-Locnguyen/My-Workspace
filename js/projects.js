  function openProjectEditor(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    openModal('Sửa dự án', `
      <div class="form-group"><label>Tên dự án</label><input id="eProjTitle" value="${escapeHTML(p.title)}" /></div>
      <div class="form-group"><label>Công nghệ / Mô tả</label><input id="eProjDesc" value="${escapeHTML(p.desc)}" /></div>
      <div class="form-group"><label>Tiến độ (%)</label><input id="eProjProg" type="number" min="0" max="100" value="${p.progress}" /></div>
    `, () => {
      const title = $('#eProjTitle').value.trim();
      if (!title) { showToast('Vui lòng nhập tên dự án'); return false; }
      if (state.projects.some(x => x.id !== p.id && x.title.toLowerCase() === title.toLowerCase())) { showToast('Tên dự án đã tồn tại'); return false; }
      const oldTitle = p.title;
      p.title = title;
      p.desc = $('#eProjDesc').value.trim() || 'Development';
      p.progress = Math.min(100, Math.max(0, Number($('#eProjProg').value) || 0));
      if (oldTitle !== title) {
        state.tasks.forEach(t => { if (t.projectTitle === oldTitle) t.projectTitle = title; });
        if (activeProjectId === oldTitle) activeProjectId = title;
      }
      saveState(); renderTasks(); renderProjects();
      showToast('Đã cập nhật dự án');
      return true;
    });
  }

  // Dự án
  function renderProjects() {
    const mainContainer = $('#projectsMainContainer');
    const detailContainer = $('#projectDetailContainer');

    const projectMarkup = p => `
      <div class="project-row" data-dnd-item="${p.id}" data-open-project="${escapeHTML(p.title)}">
        <div>
          <div class="project-title">${escapeHTML(p.title)}</div>
          <div class="project-desc">${escapeHTML(p.desc)}</div>
          <div class="progress"><span style="width:${p.progress}%"></span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="note">${p.progress}%</span>
          <button class="button ghost" data-edit-project="${p.id}">Sửa</button>
          <button class="button ghost" data-delete-project="${p.id}" aria-label="Xóa">✕</button>
        </div>
      </div>`;

    $('#dashProjectsList').innerHTML = state.projects.map(projectMarkup).join('') || '<div class="empty-note">Chưa có dự án.</div>';
    $('#dashProjectCount').textContent = state.projects.length;

    if (activeProjectId === null) {
      mainContainer.style.display = 'block';
      detailContainer.style.display = 'none';
      $('#projectsListFull').innerHTML = state.projects.map(projectMarkup).join('') || '<div class="empty-note">Chưa có dự án.</div>';
      return;
    }

    mainContainer.style.display = 'none';
    detailContainer.style.display = 'block';

    const proj = state.projects.find(p => p.title === activeProjectId);
    if (!proj) { activeProjectId = null; renderProjects(); return; }

    const pTasks = state.tasks.filter(t =>
      t.projectTitle === proj.title && (isTaskActiveOn(t, dateKey(new Date())) || isOverdue(t))
    );
    const todoTasks = pTasks.filter(t => t.status === 'open' && !t.inProgress);
    const doingTasks = pTasks.filter(t => t.status === 'open' && t.inProgress);
    const doneTasks = pTasks.filter(t => t.status === 'done');

    const renderCard = t => `
      <div class="card${isOverdue(t) ? ' overdue' : ''}" data-dnd-item="${t.id}" data-edit-task="${t.id}">
        <div style="font-size:13px;">${escapeHTML(t.title)}</div>
        <div class="task-meta">${escapeHTML(t.meta)}${dueLabel(t)}</div>
      </div>`;

    // Mỗi cột là 1 group kéo-thả riêng (data-dnd-col = trạng thái khi thả vào)
    const kanbanCol = (title, list, col) => `
      <div class="panel">
        <div class="panel-head"><h2>${title}</h2><span class="tag">${list.length}</span></div>
        <div class="col-scroll list-scroll thin-scroll" data-dnd-group="kanban" data-dnd-col="${col}">
          ${list.map(renderCard).join('') || '<div class="empty-note">Trống</div>'}
        </div>
      </div>`;

    detailContainer.innerHTML = `
      <div class="page-head">
        <div>
          <button class="button ghost" id="backToProjectsList" style="padding-left:0">← Danh sách dự án</button>
          <h1>${escapeHTML(proj.title)}</h1>
          <div class="subtitle">${escapeHTML(proj.desc)} · ${proj.progress}%</div>
        </div>
        <div style="display:flex;gap:8px;"><button class="button" data-edit-project="${proj.id}">Sửa dự án</button><button class="button primary" id="addProjTaskBtn">+ Thêm task</button></div>
      </div>
      <div class="kanban">
        ${kanbanCol('Chưa làm', todoTasks, 'todo')}
        ${kanbanCol('Đang làm', doingTasks, 'doing')}
        ${kanbanCol('Hoàn thành', doneTasks, 'done')}
      </div>`;

    applyHeroes();
    $('#backToProjectsList').addEventListener('click', () => { activeProjectId = null; renderProjects(); });

    $('#addProjTaskBtn').addEventListener('click', () => {
      openModal(`Thêm task vào ${proj.title}`, `
        <div class="form-group"><label>Tiêu đề</label><input id="mpTaskTitle" /></div>
        <div class="form-group"><label>Mô tả / Thời lượng</label><input id="mpTaskMeta" value="45 phút" /></div>
        <div class="form-group"><label>Ngày hẹn (để trống nếu không hẹn)</label><input type="date" id="mpTaskDue" /></div>
        <div class="form-group"><label>Trạng thái</label><select id="mpTaskStatus"><option value="todo">Chưa làm</option><option value="doing">Đang làm</option><option value="done">Hoàn thành</option></select></div>
      `, () => {
        const title = $('#mpTaskTitle').value.trim();
        const meta = $('#mpTaskMeta').value.trim();
        const statChoice = $('#mpTaskStatus').value;
        const dueDate = $('#mpTaskDue').value || null;
        if (!title) { showToast('Vui lòng nhập tiêu đề'); return false; }
        state.tasks.unshift({
          id: Date.now(), title, meta: meta || 'Task', tag: 'Project', projectTitle: proj.title,
          status: statChoice === 'done' ? 'done' : 'open',
          inProgress: statChoice === 'doing',
          dueDate,
          completedAt: statChoice === 'done' ? dateKey(new Date()) : null
        });
        saveState(); renderTasks(); renderProjects();
        renderYears(); // nếu task được tạo ở trạng thái "Hoàn thành" thì mới tính vào ma trận
        showToast('Đã thêm task');
        return true;
      });
    });
  }


  // Kéo – thả trong Danh sách dự án (cùng list)
  DND.handlers.projectList = ({ orderedIds }) => {
    state.projects = reorderSubset(state.projects, orderedIds);
    saveState();
    renderProjects();
    showToast('Đã đổi thứ tự dự án');
  };

  // Kéo – thả liên cột Kanban: đổi trạng thái đúng ngữ nghĩa ô checkbox
  // (todo → chưa làm, doing → đang làm, done → hoàn thành + ghi ngày xong).
  DND.handlers.kanban = ({ itemId, orderedIds, container }) => {
    const t = state.tasks.find(x => String(x.id) === String(itemId));
    if (!t) return;
    const col = container.dataset.dndCol;
    if (col === 'done') {
      t.status = 'done';
      t.inProgress = false;
      if (!t.completedAt) t.completedAt = dateKey(new Date());
    } else {
      t.status = 'open';
      t.inProgress = col === 'doing';
      t.completedAt = null;
    }
    state.tasks = reorderSubset(state.tasks, orderedIds);
    saveState();
    renderTasks();
    renderProjects();   // vẽ lại 3 cột (đồng thời refresh list Dự án + dashboard)
    renderYears();      // ma trận chỉ đếm task hoàn thành
    showToast(col === 'done' ? 'Đã chuyển sang Hoàn thành' : col === 'doing' ? 'Đang làm' : 'Chưa làm');
  };

  // Thêm dự án
  $('#addProjectBtn').addEventListener('click', () => {
    openModal('Dự án mới', `
      <div class="form-group"><label>Tên dự án</label><input id="mProjTitle" /></div>
      <div class="form-group"><label>Công nghệ / Mô tả</label><input id="mProjDesc" /></div>
      <div class="form-group"><label>Tiến độ (%)</label><input id="mProjProg" type="number" min="0" max="100" value="10" /></div>
    `, () => {
      const title = $('#mProjTitle').value.trim();
      const desc = $('#mProjDesc').value.trim();
      const progress = Number($('#mProjProg').value) || 0;
      if (!title) { showToast('Vui lòng nhập tên dự án'); return false; }
      if (state.projects.some(p => p.title.toLowerCase() === title.toLowerCase())) { showToast('Tên dự án đã tồn tại'); return false; }
      state.projects.push({ id: Date.now(), title, desc: desc || 'Development', progress: Math.min(100, Math.max(0, progress)) });
      saveState(); renderProjects();
      showToast('Đã tạo dự án');
      return true;
    });
  });

