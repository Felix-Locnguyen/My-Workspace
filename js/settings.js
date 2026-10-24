  // Cài đặt
  $('#saveSettings').addEventListener('click', () => {
    state.user.name = $('#settingsName').value.trim() || 'Lộc';
    saveState(); setHeading();
    showToast('Đã lưu');
  });

  // Sao lưu ZIP toàn bộ dữ liệu
  $('#backupBtn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'locOS-backup-' + dateKey(new Date()) + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Đã tải bản sao lưu');
    } catch (err) { showToast('Không tạo được bản sao lưu'); }
  });

  $('#resetData').addEventListener('click', () => {
    if (confirm('Khôi phục dữ liệu mẫu ban đầu? Dữ liệu hiện tại sẽ mất.')) {
      const keepLog = state.log, keepUi = state.ui;
      state = normalizeState(JSON.parse(JSON.stringify(defaultState)));
      state.log = keepLog;
      state.ui = keepUi;
      saveState(); setHeading();
      $('#settingsName').value = state.user.name;
      renderTasks(); renderProjects(); renderFinance(); renderYears(); renderFocus(); renderHealth();
      showToast('Đã khôi phục dữ liệu mẫu');
    }
  });

