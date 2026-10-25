  function openAssetEditor(id) {
    const a = state.assets.find(x => x.id === id);
    if (!a) return;
    const types = ASSET_TYPES.some(([v]) => v === a.type) ? ASSET_TYPES : [[a.type, a.type], ...ASSET_TYPES];
    openModal('Sửa tài sản', `
      <div class="form-group"><label>Tên tài sản</label><input id="eAstName" value="${escapeHTML(a.name)}" /></div>
      <div class="form-group"><label>Phân loại</label><select id="eAstType">${optionsHTML(types, a.type)}</select></div>
      <div class="form-group"><label>Giá vốn (VND)</label><input id="eAstCost" type="number" value="${Number(a.costPrice)}" /></div>
      <div class="form-group"><label>Giá hiện tại (VND)</label><input id="eAstCurrent" type="number" value="${Number(a.currentPrice)}" /></div>
      <div class="form-group"><label>Thu nhập thụ động (VND/tháng)</label><input id="eAstPassive" type="number" value="${Number(a.passiveIncome || 0)}" /></div>
    `, () => {
      const name = $('#eAstName').value.trim();
      const cost = $('#eAstCost').value;
      const cur = $('#eAstCurrent').value;
      if (!name || cost === '' || cur === '' || isNaN(Number(cost)) || isNaN(Number(cur))) { showToast('Vui lòng nhập đầy đủ thông tin'); return false; }
      a.name = name;
      a.type = $('#eAstType').value;
      a.costPrice = Number(cost);
      a.currentPrice = Number(cur);
      a.passiveIncome = Number($('#eAstPassive').value) || 0;
      saveState(); renderFinance();
      showToast('Đã cập nhật tài sản');
      return true;
    });
  }

  function openTransactionEditor(id) {
    const tr = state.transactions.find(x => x.id === id);
    if (!tr) return;
    const catOptions = (type, selected) => {
      const html = type === 'Income' ? incomeCats : expenseCats;
      const mark = `value="${escapeHTML(selected)}"`;
      return html.includes(mark) ? html.replace(mark, mark + ' selected')
        : `<option value="${escapeHTML(selected)}" selected>${escapeHTML(selected)}</option>` + html;
    };
    openModal('Sửa giao dịch', `
      <div class="form-group"><label>Tên giao dịch</label><input id="eTrName" value="${escapeHTML(tr.name)}" /></div>
      <div class="form-group"><label>Loại</label><select id="eTrType">${optionsHTML([['Expense', 'Chi tiêu'], ['Income', 'Thu nhập']], tr.type)}</select></div>
      <div class="form-group"><label>Danh mục</label><select id="eTrCat">${catOptions(tr.type, tr.category)}</select></div>
      <div class="form-group"><label>Số tiền (VND)</label><input id="eTrAmount" type="number" value="${Number(tr.amount)}" /></div>
      <div class="form-group"><label>Ngày (dd/mm)</label><input id="eTrDate" value="${escapeHTML(tr.date)}" /></div>
    `, () => {
      const name = $('#eTrName').value.trim();
      const amount = Number($('#eTrAmount').value);
      const date = $('#eTrDate').value.trim();
      if (!name || isNaN(amount) || amount <= 0) { showToast('Vui lòng nhập đầy đủ thông tin'); return false; }
      if (!/^\d{1,2}\/\d{1,2}$/.test(date)) { showToast('Ngày cần có dạng dd/mm'); return false; }
      tr.name = name;
      tr.type = $('#eTrType').value;
      tr.category = $('#eTrCat').value;
      tr.amount = amount;
      tr.date = date;
      saveState(); renderFinance();
      showToast('Đã cập nhật giao dịch');
      return true;
    });
    $('#eTrType').addEventListener('change', e => {
      $('#eTrCat').innerHTML = e.target.value === 'Income' ? incomeCats : expenseCats;
    });
  }

  // ── Bộ lọc giao dịch — chạy local trên state đang có, không gọi API ──
  // Date lưu không có năm ("24/10" hoặc "24-10") → so sánh theo tháng*100+ngày.
  let txFilter = 'today';        // today | day | month | custom
  let txFrom = '', txTo = '';    // yyyy-mm-dd từ input type=date

  const txKey = s => {           // "24/10" | "24-10" → 1024, hỏng → -1
    const m = String(s || '').match(/(\d{1,2})\D+(\d{1,2})/);
    if (!m) return -1;
    const d = +m[1], mo = +m[2];
    return (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? mo * 100 + d : -1;
  };
  const inputKey = v => {        // "2026-10-25" → 1025
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? (+m[2]) * 100 + (+m[3]) : -1;
  };

  function txInRange(tr) {
    const k = txKey(tr.date);
    if (k < 0) return txFilter === 'today';   // ngày hỏng → chỉ hiện ở chế độ mặc định
    const now = new Date();
    const today = (now.getMonth() + 1) * 100 + now.getDate();
    if (txFilter === 'today') return k <= today;                       // Đến hôm nay (mặc định)
    if (txFilter === 'day') return k === today;                        // Trong ngày
    if (txFilter === 'month') return Math.floor(k / 100) === now.getMonth() + 1;  // Tháng này
    const a = inputKey(txFrom), b = inputKey(txTo);                    // Tùy chọn: từ → đến
    if (a < 0 && b < 0) return true;
    if (a >= 0 && k < a) return false;
    if (b >= 0 && k > b) return false;
    return true;
  }

  // Bảng giao dịch: tối đa 5 dòng trong khung + thanh cuộn dọc (css .tx-scroll)
  function renderTxRows() {
    const rows = state.transactions.filter(txInRange);
    $('#transactionsTable').innerHTML = rows.map(tr => `<tr>
        <td class="muted">${escapeHTML(tr.date)}</td>
        <td>${escapeHTML(tr.name)}</td>
        <td class="muted">${escapeHTML(tr.category)}</td>
        <td>${tr.type === 'Income' ? 'Thu' : 'Chi'}</td>
        <td>${tr.type === 'Income' ? '+' : '−'}${fmt(Math.abs(tr.amount))}</td>
        <td style="white-space:nowrap"><button class="button ghost" data-edit-tx="${tr.id}">Sửa</button><button class="button ghost" data-delete-tx="${tr.id}">Xóa</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty-note">Không có giao dịch trong kỳ đã chọn.</td></tr>';
    $('#txCount').textContent = rows.length === state.transactions.length
      ? rows.length + ' giao dịch'
      : rows.length + '/' + state.transactions.length + ' giao dịch';
  }

  function renderFinance() {
    let income = 0, expense = 0;
    state.transactions.forEach(tr => {
      if (tr.type === 'Income') income += tr.amount; else expense += tr.amount;
    });
    renderTxRows();   // bảng theo bộ lọc; stat cards vẫn tính trên toàn bộ giao dịch

    let totalAsset = 0;
    // Card thay bảng: đủ 6 trường (tên/loại/giá vốn/giá hiện tại/chênh/thụ động),
    // mọi số tiền vẫn đi qua fmt() → ẩn/hiện số tiền toàn cục áp dụng ngay.
    $('#assetsList').innerHTML = state.assets.map(ast => {
      totalAsset += Number(ast.currentPrice) || 0;
      const diff = Number(ast.costPrice) > 0 ? (((Number(ast.currentPrice) - Number(ast.costPrice)) / Number(ast.costPrice)) * 100).toFixed(2) : '0';
      const up = Number(diff) >= 0;
      return `<div class="asset-card" data-dnd-item="${ast.id}">
        <div class="asset-card-main">
          <div class="asset-name">${escapeHTML(ast.name)}</div>
          <div class="asset-meta">${escapeHTML(ast.type)} · Chênh lệch <b class="${up ? 'up' : 'down'}">${up ? '+' : ''}${diff}%</b></div>
        </div>
        <div class="asset-nums">
          <span><i>Giá vốn</i><b>${fmt(ast.costPrice)}</b></span>
          <span><i>Giá hiện tại</i><b>${fmt(ast.currentPrice)}</b></span>
          <span><i>Thu thụ động</i><b>${fmt(ast.passiveIncome || 0)}</b></span>
        </div>
        <div class="asset-actions">
          <button class="button ghost" data-edit-asset="${ast.id}">Sửa</button>
          <button class="button ghost" data-delete-asset="${ast.id}" aria-label="Xóa">✕</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty-note">Chưa có tài sản.</div>';

    const goalIncome = state.goals.monthlyIncome;
    const goalAsset = state.goals.assetGoal;

    // Tiền hiển thị dạng đầy đủ (8.000.000 ₫) thay vì rút gọn kiểu 8M
    $('#finIncome').textContent = fmt(income);
    $('#statGoalIncome').textContent = fmt(goalIncome);
    $('#finExpense').textContent = fmt(expense);
    $('#finTotalAsset').textContent = fmt(totalAsset);
    $('#finGoalAssetShow').textContent = fmt(goalAsset);
    const rate = goalAsset > 0 ? Math.min(100, Math.round((totalAsset / goalAsset) * 100)) : 0;
    $('#finGoalAssetComp').textContent = `Đạt ${rate}%`;

    const net = income - expense;
    $('#dashNetCash').textContent = (net >= 0 ? '+' : '−') + fmt(Math.abs(net));
    $('#dashAssets').textContent = fmt(totalAsset);
    $('#dashIncome').textContent = fmt(income);
    $('#dashExpense').textContent = fmt(expense);
    $('#dashExpenseBar').style.width = (income > 0 ? Math.min(100, Math.round(expense / income * 100)) : 0) + '%';

    // Card so sánh số tiền còn lại trong ví tháng này với mức chi tiêu tối thiểu
    // (mục nhập không bắt buộc — để trống ẩn card). Tối đa 100%, đạt 100% thì thanh xanh.
    const minExp = Number(state.goals.minExpense) || 0;
    const panel = $('#minExpensePanel');
    if (minExp > 0) {
      const pct = Math.max(0, Math.min(100, Math.round(net / minExp * 100)));
      const reached = net >= minExp;
      panel.style.display = '';
      $('#minExpRemain').textContent = fmt(net);
      $('#minExpPct').textContent = pct + '%';
      $('#minExpTarget').textContent = 'Mức tối thiểu: ' + fmt(minExp);
      const bar = $('#minExpBar');
      bar.style.width = pct + '%';
      bar.classList.toggle('ok', reached);
      const note = $('#minExpNote');
      note.textContent = reached
        ? '✓ Đạt 100% — số tiền còn lại đủ cho chi tiêu tối thiểu của tháng.'
        : 'Còn thiếu ' + fmt(minExp - net) + ' nữa mới đạt mức tối thiểu.';
      note.classList.toggle('ok', reached);
    } else {
      panel.style.display = 'none';
    }
  }

  // ── Điều khiển bộ lọc giao dịch (4 nút + 2 ô ngày, local) ──
  $$('#txFilter [data-tx-filter]').forEach(btn => btn.addEventListener('click', () => {
    txFilter = btn.dataset.txFilter;
    $$('#txFilter [data-tx-filter]').forEach(b => b.classList.toggle('active', b === btn));
    $('#txRangeBox').hidden = txFilter !== 'custom';
    renderTxRows();
  }));
  $('#txFrom').addEventListener('change', e => { txFrom = e.target.value; if (txFilter === 'custom') renderTxRows(); });
  $('#txTo').addEventListener('change', e => { txTo = e.target.value; if (txFilter === 'custom') renderTxRows(); });

  // Kéo – thả trong Danh sách tài sản (cùng list)
  DND.handlers.assetList = ({ orderedIds }) => {
    state.assets = reorderSubset(state.assets, orderedIds);
    saveState();
    renderFinance();
    showToast('Đã đổi thứ tự tài sản');
  };

  // Mục tiêu tài chính
  $('#openGoalSettings').addEventListener('click', () => {
    openModal('Mục tiêu tài chính', `
      <div class="form-group"><label>Thu nhập tháng (VND)</label><input id="mGoalIncome" type="number" value="${state.goals.monthlyIncome}" /></div>
      <div class="form-group"><label>Tổng tài sản (VND)</label><input id="mGoalAsset" type="number" value="${state.goals.assetGoal}" /></div>
      <div class="form-group">
        <label>Chi tiêu tối thiểu (VND) — không bắt buộc</label>
        <input id="mGoalMinExp" type="number" min="0" placeholder="Để trống nếu không dùng" value="${Number(state.goals.minExpense) || ''}" />
        <div class="note" style="margin-top:6px;line-height:1.45">Chi tiêu tối thiểu là chi tiêu phục vụ đời sống bắt buộc và không cắt bỏ được, ví dụ tiền thuê nhà, điện nước, đồ ăn. Nhập chỉ số này, mục Tài chính sẽ hiện thanh so sánh số tiền còn lại trong ví tháng này với mức đó (tối đa 100%, đạt 100% thì thanh chuyển màu xanh lá).</div>
      </div>
    `, () => {
      const inc = Number($('#mGoalIncome').value);
      const ast = Number($('#mGoalAsset').value);
      const minExp = Math.max(0, Number($('#mGoalMinExp').value) || 0);
      if (isNaN(inc) || isNaN(ast)) { showToast('Vui lòng nhập số hợp lệ'); return false; }
      state.goals.monthlyIncome = inc;
      state.goals.assetGoal = ast;
      state.goals.minExpense = minExp;
      saveState(); renderFinance();
      showToast(minExp > 0 ? 'Đã cập nhật mục tiêu' : 'Đã cập nhật mục tiêu · chưa đặt chi tiêu tối thiểu');
      return true;
    });
  });

  // Thêm tài sản
  $('#addAssetBtn').addEventListener('click', () => {
    openModal('Thêm tài sản', `
      <div class="form-group"><label>Tên tài sản</label><input id="mAstName" /></div>
      <div class="form-group"><label>Phân loại</label><select id="mAstType">
        <option value="chứng khoán">Chứng khoán</option>
        <option value="vàng">Vàng</option>
        <option value="tiền ảo">Tiền ảo</option>
        <option value="cho thuê">Cho thuê</option>
        <option value="kinh doanh">Kinh doanh</option>
        <option value="khác">Khác</option>
      </select></div>
      <div class="form-group"><label>Giá vốn (VND)</label><input id="mAstCost" type="number" /></div>
      <div class="form-group"><label>Giá hiện tại (VND)</label><input id="mAstCurrent" type="number" /></div>
      <div class="form-group"><label>Thu nhập thụ động (VND/tháng)</label><input id="mAstPassive" type="number" value="0" /></div>
    `, () => {
      const name = $('#mAstName').value.trim();
      const type = $('#mAstType').value;
      const costPrice = Number($('#mAstCost').value);
      const currentPrice = Number($('#mAstCurrent').value);
      const passiveIncome = Number($('#mAstPassive').value) || 0;
      if (!name || !$('#mAstCost').value || !$('#mAstCurrent').value || isNaN(costPrice) || isNaN(currentPrice)) {
        showToast('Vui lòng nhập đầy đủ thông tin'); return false;
      }
      const existing = state.assets.find(a => a.name.toLowerCase() === name.toLowerCase() && a.type === type);
      if (existing) {
        existing.costPrice = (Number(existing.costPrice) + costPrice) / 2;
        existing.currentPrice = currentPrice;
        existing.passiveIncome = Number(existing.passiveIncome) + passiveIncome;
      } else {
        state.assets.push({ id: Date.now(), name, type, costPrice, currentPrice, passiveIncome });
      }
      saveState(); renderFinance();
      showToast('Đã lưu tài sản');
      return true;
    });
  });

  // Thêm giao dịch
  const expenseCats = `<option value="Ăn uống">Ăn uống</option><option value="nhà ở">Nhà ở</option><option value="mạng">Mạng</option><option value="sửa đồ">Sửa đồ</option><option value="Đi chơi">Đi chơi</option>`;
  const incomeCats = `<option value="lương">Lương</option><option value="thu nhập thêm">Thu nhập thêm</option><option value="cho">Được cho</option>`;
  $('#addTransactionBtn').addEventListener('click', () => {
    openModal('Thêm giao dịch', `
      <div class="form-group"><label>Tên giao dịch</label><input id="mTrName" /></div>
      <div class="form-group"><label>Loại</label><select id="mTrType"><option value="Expense">Chi tiêu</option><option value="Income">Thu nhập</option></select></div>
      <div class="form-group"><label>Danh mục</label><select id="mTrCat">${expenseCats}</select></div>
      <div class="form-group"><label>Số tiền (VND)</label><input id="mTrAmount" type="number" /></div>
    `, () => {
      const name = $('#mTrName').value.trim();
      const type = $('#mTrType').value;
      const category = $('#mTrCat').value;
      const amount = Number($('#mTrAmount').value);
      if (!name || isNaN(amount) || amount <= 0) { showToast('Vui lòng nhập đầy đủ thông tin'); return false; }
      const date = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      state.transactions.unshift({ id: Date.now(), date, name, category, type, amount });
      saveState(); renderFinance();
      showToast('Đã thêm giao dịch');
      return true;
    });
    $('#mTrType').addEventListener('change', e => {
      $('#mTrCat').innerHTML = e.target.value === 'Expense' ? expenseCats : incomeCats;
    });
  });

