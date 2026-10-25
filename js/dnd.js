  // ── Kéo – thả danh sách (Pointer Events: chuột + cảm ứng, không thư viện) ──
  // Item: [data-dnd-item="<id>"] nằm trong container [data-dnd-group="<tên>"]
  // (Kanban thêm [data-dnd-col="todo|doing|done"]).
  // Một listener delegate ở document → không cần gắn lại sau mỗi lần render innerHTML.
  // Chuột: bấm giữ + di chuyển > 6px là kéo. Cảm ứng: đè giữ 350ms (bỏ nếu cuộn trước đó).
  const DND = {
    handlers: {},      // tên group → fn({ itemId, orderedIds, container })
    suppressUntil: 0,  // trong khoảng này click bị nuốt (không mở modal / sang trang)
    drag: null
  };
  window.DND = DND;

  // Chỉ hoán vị những phần tử ĐANG hiển thị; item bị filter/ẩn giữ nguyên chỗ trong mảng.
  function reorderSubset(full, visibleIds) {
    const want = (visibleIds || []).map(String);
    const set = new Set(want);
    const byId = new Map(full.map(o => [String(o.id), o]));
    let k = 0;
    return full.map(o => {
      if (!set.has(String(o.id))) return o;
      const next = byId.get(want[k++] || '');
      return next || o;
    });
  }

  const DND_EXCLUDE = 'button, input, select, a, textarea, .no-drag';

  // Thứ tự id của container SAU khi thả: placeholder = vị trí card sẽ vào,
  // card đang kéo (position:fixed) bị bỏ qua.
  function dndReadOrder(container) {
    const d = DND.drag;
    const ids = [];
    for (const node of container.children) {
      if (d && node === d.item) continue;
      if (d && node === d.ph) { ids.push(String(d.itemId)); continue; }
      if (node.dataset && node.dataset.dndItem) ids.push(String(node.dataset.dndItem));
    }
    return ids;
  }

  // Bắt đầu kéo: giữ chỗ bằng placeholder nét đứt, card bám theo con trỏ.
  function dndEngage(x, y) {
    const d = DND.drag;
    if (!d || d.engaged) return;
    clearTimeout(d.timer);
    d.engaged = true;
    const r = d.item.getBoundingClientRect();
    d.offX = x - r.left;
    d.offY = y - r.top;
    d.startParent = d.item.parentElement;
    const ph = document.createElement('div');
    ph.className = 'dnd-placeholder';
    ph.style.height = Math.max(r.height, 0) + 'px';
    d.ph = ph;
    d.item.parentElement.insertBefore(ph, d.item);

    const s = d.item.style;
    s.position = 'fixed'; s.left = '0px'; s.top = '0px';
    s.width = r.width + 'px'; s.height = r.height + 'px';
    s.margin = '0'; s.zIndex = '90'; s.pointerEvents = 'none'; s.willChange = 'transform';
    d.item.classList.add('dnd-ghost');
    document.body.classList.add('dnd-active');
    document.body.style.userSelect = 'none';
    if (d.pointerId != null && d.item.setPointerCapture) {
      try { d.item.setPointerCapture(d.pointerId); } catch (err) { /* trình duyệt không hỗ trợ */ }
    }
    dndMove(x, y);
    d.raf = requestAnimationFrame(dndAutoScroll);
  }

  // Di chuyển: kéo card + dời placeholder theo vị trí thả (viền nét đứt).
  function dndMove(x, y) {
    const d = DND.drag;
    if (!d || !d.engaged) return;
    d.x = x; d.y = y;
    d.item.style.transform = `translate3d(${Math.round(x - d.offX)}px, ${Math.round(y - d.offY)}px, 0)`;

    const el = (typeof document.elementFromPoint === 'function') ? document.elementFromPoint(x, y) : null;
    const target = el && el.closest ? el.closest('[data-dnd-group]') : null;
    d.target = (target && target.dataset.dndGroup === d.group) ? target : null;   // chỉ thả vào cùng nhóm
    if (d.target) {
      let before = null;
      for (const kid of d.target.children) {
        if (kid === d.item || kid === d.ph) continue;
        if (!kid.dataset || !kid.dataset.dndItem) continue;
        const kr = kid.getBoundingClientRect();
        if (y < kr.top + kr.height / 2) { before = kid; break; }
      }
      if (before) d.target.insertBefore(d.ph, before);
      else d.target.appendChild(d.ph);
    }
    document.querySelectorAll('[data-dnd-group].dnd-over').forEach(g => {
      if (g !== d.target) g.classList.remove('dnd-over');
    });
    if (d.target) d.target.classList.add('dnd-over');
  }

  // Tự cuộn khi kéo tới gần mép trên/dưới khung (kéo được vào list đang cuộn).
  function dndAutoScroll() {
    const d = DND.drag;
    if (!d || !d.engaged) return;
    const s = d.target;
    if (s) {
      const r = s.getBoundingClientRect();
      if (d.y - r.top < 48) s.scrollTop -= 14;
      else if (r.bottom - d.y < 48) s.scrollTop += 14;
    }
    d.raf = requestAnimationFrame(dndAutoScroll);
  }

  // Dọn trạng thái. Card không bao giờ đổi chỗ trong DOM → chỉ gỡ placeholder + style.
  function dndCleanup() {
    const d = DND.drag;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.raf) cancelAnimationFrame(d.raf);
    if (d.engaged) {
      if (d.ph) d.ph.remove();
      const s = d.item.style;
      s.position = s.left = s.top = s.width = s.height = '';
      s.margin = s.zIndex = s.pointerEvents = s.transform = s.willChange = '';
      d.item.classList.remove('dnd-ghost');
      document.body.classList.remove('dnd-active');
      document.body.style.userSelect = '';
      document.querySelectorAll('[data-dnd-group].dnd-over').forEach(g => g.classList.remove('dnd-over'));
    }
    DND.drag = null;
  }

  // Thả: đọc thứ tự của container chứa placeholder, gọi handler của group, rồi dọn.
  function dndFinish() {
    const d = DND.drag;
    if (!d) return;
    if (!d.engaged) { clearTimeout(d.timer); DND.drag = null; return; }   // chỉ là 1 click
    const container = d.ph.parentElement;
    const ordered = dndReadOrder(container);
    const handler = DND.handlers[d.group];
    const itemId = d.itemId;
    dndCleanup();
    DND.suppressUntil = Date.now() + 350;   // chặn click bắn ra ngay sau khi thả
    if (handler) handler({ itemId, orderedIds: ordered, container });
  }

  document.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;               // chỉ chuột trái
    if (DND.drag) return;
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('[data-dnd-item]');
    if (!item) return;
    if (e.target.closest(DND_EXCLUDE)) return;            // checkbox / nút vẫn bấm bình thường
    const container = item.closest('[data-dnd-group]');
    if (!container) return;                               // list không bật kéo-thả (vd: dashboard)
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const d = DND.drag = {
      item, container, group: container.dataset.dndGroup, itemId: item.dataset.dndItem,
      startX: e.clientX || 0, startY: e.clientY || 0,
      x: e.clientX || 0, y: e.clientY || 0,
      pointerId: e.pointerId, touch, engaged: false, timer: null, raf: 0
    };
    if (touch) d.timer = setTimeout(() => dndEngage(d.x, d.y), 350);   // long-press
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    const d = DND.drag;
    if (!d) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.engaged) {
      const dist = Math.hypot((e.clientX || 0) - d.startX, (e.clientY || 0) - d.startY);
      if (d.touch) { if (dist > 10) { clearTimeout(d.timer); DND.drag = null; } return; }  // cuộn trước → bỏ kéo
      if (dist > 6) dndEngage(e.clientX, e.clientY);
      return;
    }
    dndMove(e.clientX, e.clientY);
  });

  document.addEventListener('pointerup', dndFinish);
  document.addEventListener('pointercancel', dndCleanup);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && DND.drag) dndCleanup(); });
  // Đang kéo thì chặn cuộn trang bằng ngón tay (listener non-passive).
  document.addEventListener('touchmove', e => {
    if (DND.drag && DND.drag.engaged && e.cancelable) e.preventDefault();
  }, { passive: false });
  // Không để click bắn ra ngay sau khi thả (tránh mở nhầm modal / dự án).
  document.addEventListener('click', e => {
    if (Date.now() < DND.suppressUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);
