(function () {
  const textInput = document.getElementById('textInput');
  const imageInput = document.getElementById('imageInput');
  const cameraInput = document.getElementById('cameraInput');
  const fileInput = document.getElementById('fileInput');
  const sendBtn = document.getElementById('sendBtn');
  const feedList = document.getElementById('feedList');
  const feedEmpty = document.getElementById('feedEmpty');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const pasteZone = document.getElementById('pasteZone');
  const previewModal = document.getElementById('previewModal');
  const previewImage = document.getElementById('previewImage');
  const previewVideo = document.getElementById('previewVideo');
  const modalClose = document.getElementById('modalClose');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const toastEl = document.getElementById('toast');
  const readClipboardBtn = document.getElementById('readClipboardBtn');
  const confirmModal = document.getElementById('confirmModal');
  const confirmModalBackdrop = document.getElementById('confirmModalBackdrop');
  const confirmCancel = document.getElementById('confirmCancel');
  const confirmOk = document.getElementById('confirmOk');
  const uploadProgressWrap = document.getElementById('uploadProgressWrap');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadProgressText = document.getElementById('uploadProgressText');

  const themeBtn = document.getElementById('themeBtn');
  const feedSearch = document.getElementById('feedSearch');
  const feedTypeFilter = document.getElementById('feedTypeFilter');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const clearAllModal = document.getElementById('clearAllModal');
  const clearAllModalBackdrop = document.getElementById('clearAllModalBackdrop');
  const clearAllCancel = document.getElementById('clearAllCancel');
  const clearAllOk = document.getElementById('clearAllOk');
  const feedLoadMoreWrap = document.getElementById('feedLoadMoreWrap');
  const feedLoadMore = document.getElementById('feedLoadMore');

  let pendingDeleteId = null;
  let pendingDeleteEl = null;
  let items = [];
  let displayedCount = 30;
  const PAGE_SIZE = 30;

  const URL_REG = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

  function formatBytes(n) {
    if (n == null || n === 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFormatLabel(mimetype, filename) {
    if (mimetype) {
      const t = mimetype.split('/')[0];
      const sub = mimetype.split('/')[1];
      if (t === 'image' || t === 'video') return sub ? sub.toUpperCase() : mimetype;
      if (t === 'application' && sub) return sub.toUpperCase();
    }
    if (filename && filename.includes('.')) return filename.split('.').pop().toUpperCase();
    return '—';
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('visible'), 2000);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function linkify(text) {
    if (!text || !text.replace) return '';
    return escapeHtml(text).replace(URL_REG, (url) => {
      const href = url.replace(/&/g, '&amp;');
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    });
  }

  function relativeTime(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000 && d.toDateString() === new Date().toDateString()) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 172800000 && d.toDateString() === new Date(now - 86400000).toDateString()) return '昨天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system' || !theme) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (themeBtn) themeBtn.textContent = dark ? '☀' : '🌙';
    } else {
      root.setAttribute('data-theme', theme);
      if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀' : '🌙';
    }
  }

  function initTheme() {
    const saved = localStorage.getItem('clipboard-theme') || 'system';
    applyTheme(saved);
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        const current = root.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('clipboard-theme', next);
      });
    }
  }
  initTheme();

  function setEmpty(empty) {
    if (empty) {
      feedEmpty.classList.add('visible');
    } else {
      feedEmpty.classList.remove('visible');
    }
  }

  /* ---------- Socket（延迟连接，不阻塞首屏） ---------- */
  let socket;
  function initSocket() {
    if (typeof io === 'undefined') {
      statusText.textContent = '加载中…';
      setTimeout(initSocket, 100);
      return;
    }
    socket = io({ transports: ['websocket'] }); // 局域网只用 WebSocket，更快

    socket.on('connect', () => {
      statusEl.classList.remove('error');
      statusEl.classList.add('connected');
      statusText.textContent = '已连接';
    });

    socket.on('disconnect', (reason) => {
      statusEl.classList.remove('connected');
      if (reason === 'io server disconnect') statusEl.classList.add('error');
      statusText.textContent = '未连接';
    });

    socket.on('connect_error', () => {
      statusEl.classList.remove('connected');
      statusEl.classList.add('error');
      statusText.textContent = '连接失败';
    });

    socket.on('recent', (data) => {
      items = Array.isArray(data) ? data : [];
      displayedCount = PAGE_SIZE;
      renderFeed();
    });

    socket.on('clipboard', (item) => {
      items.unshift(item);
      renderFeed();
    });

    socket.on('deleted', (id) => {
      items = items.filter((x) => String(x.id).trim() !== String(id).trim());
      renderFeed();
    });

    socket.on('cleared', () => {
      items = [];
      displayedCount = PAGE_SIZE;
      renderFeed();
      setEmpty(true);
    });
  }

  function getFilteredItems() {
    const q = (feedSearch && feedSearch.value || '').trim().toLowerCase();
    const type = feedTypeFilter ? feedTypeFilter.value : '';
    return items.filter((item) => {
      if (type && item.type !== type) return false;
      if (!q) return true;
      if (item.type === 'text' && item.text) return item.text.toLowerCase().includes(q);
      if ((item.type === 'image' || item.type === 'video' || item.type === 'file') && item.filename) return item.filename.toLowerCase().includes(q);
      return false;
    });
  }

  function groupByDate(list) {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();
    const groups = { today: [], yesterday: [], earlier: [] };
    list.forEach((item) => {
      const d = new Date(item.ts).toDateString();
      if (d === today) groups.today.push(item);
      else if (d === yesterday) groups.yesterday.push(item);
      else groups.earlier.push(item);
    });
    return groups;
  }

  function renderFeed() {
    const filtered = getFilteredItems();
    if (filtered.length === 0) {
      feedList.innerHTML = '';
      if (feedLoadMoreWrap) feedLoadMoreWrap.style.display = 'none';
      if (feedEmpty) feedEmpty.textContent = items.length > 0 ? '无匹配记录' : '暂无记录，发送或粘贴内容开始同步';
      setEmpty(true);
      return;
    }
    setEmpty(false);
    const toShow = filtered.slice(0, displayedCount);
    const hasMore = filtered.length > displayedCount;
    if (feedLoadMoreWrap) feedLoadMoreWrap.style.display = hasMore ? 'block' : 'none';

    const groups = groupByDate(toShow);
    const groupLabels = { today: '今天', yesterday: '昨天', earlier: '更早' };
    feedList.innerHTML = '';
    ['today', 'yesterday', 'earlier'].forEach((key) => {
      const arr = groups[key];
      if (!arr.length) return;
      const title = document.createElement('h3');
      title.className = 'feed-group-title';
      title.textContent = groupLabels[key];
      feedList.appendChild(title);
      arr.forEach((item) => feedList.appendChild(renderItem(item)));
    });
  }

  /* ---------- 复制 ---------- */
  async function copyItem(item) {
    try {
      if (item.type === 'text' && item.text) {
        await navigator.clipboard.writeText(item.text);
        showToast('已复制文字');
        return;
      }
      if (item.type === 'image' && item.url) {
        const r = await fetch(item.url);
        const blob = await r.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showToast('已复制图片');
        return;
      }
      if (item.type === 'video' && item.url) {
        await navigator.clipboard.writeText(window.location.origin + item.url);
        showToast('已复制视频链接');
        return;
      }
      if (item.type === 'file' && item.url) {
        await navigator.clipboard.writeText(window.location.origin + item.url);
        showToast('已复制文件链接');
        return;
      }
    } catch (e) {
      if (item.type === 'text' && item.text) {
        try {
          const ta = document.createElement('textarea');
          ta.value = item.text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast('已复制文字');
        } catch (_) {
          showToast('复制失败');
        }
      } else {
        showToast('复制失败');
      }
    }
  }

  function openPreview(url, isVideo) {
    previewImage.classList.remove('visible');
    previewImage.src = '';
    previewVideo.classList.remove('visible');
    previewVideo.src = '';
    previewVideo.pause();
    if (isVideo) {
      previewVideo.src = url;
      previewVideo.classList.add('visible');
    } else {
      previewImage.src = url;
      previewImage.classList.add('visible');
    }
    previewModal.classList.add('open');
    previewModal.setAttribute('aria-hidden', 'false');
  }

  function closePreview() {
    previewModal.classList.remove('open');
    previewModal.setAttribute('aria-hidden', 'true');
    previewVideo.src = '';
    previewImage.src = '';
  }

  function renderItem(item) {
    const wrap = document.createElement('article');
    wrap.className = 'feed-item';
    wrap.dataset.id = item.id;

    const typeLabel = item.type === 'image' ? '图片' : item.type === 'video' ? '视频' : item.type === 'file' ? '文件' : '文字';
    const head = document.createElement('div');
    head.className = 'feed-item-head';
    head.innerHTML = `<span class="feed-item-meta">${relativeTime(item.ts)}<span class="feed-item-type">${typeLabel}</span></span>`;

    const actions = document.createElement('div');
    actions.className = 'feed-item-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-sm';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      copyItem(item);
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = item.id;
      if (!id) return;
      pendingDeleteId = id;
      pendingDeleteEl = wrap;
      confirmModal.classList.add('open');
      confirmModal.setAttribute('aria-hidden', 'false');
    });
    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);
    head.appendChild(actions);
    wrap.appendChild(head);

    const body = document.createElement('div');
    body.className = 'feed-item-body';

    if (item.type === 'text' && item.text) {
      const formatted = linkify(item.text).replace(/\n/g, '<br>');
      body.innerHTML = `<p>${formatted}</p>`;
    } else if (item.type === 'image' && item.url) {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.filename || '图片';
      img.loading = 'lazy';
      img.addEventListener('click', () => openPreview(item.url, false));
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'feed-media-wrap';
      mediaWrap.appendChild(img);
      body.appendChild(mediaWrap);
      if (item.size != null || item.mimetype || item.filename) {
        const info = document.createElement('div');
        info.className = 'feed-item-file-info';
        info.textContent = formatBytes(item.size) + ' · ' + getFormatLabel(item.mimetype, item.filename);
        body.appendChild(info);
      }
    } else if (item.type === 'video' && item.url) {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = true;
      video.preload = 'metadata';
      video.addEventListener('click', (e) => {
        e.preventDefault();
        openPreview(item.url, true);
      });
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'feed-media-wrap';
      mediaWrap.appendChild(video);
      body.appendChild(mediaWrap);
      if (item.size != null || item.mimetype || item.filename) {
        const info = document.createElement('div');
        info.className = 'feed-item-file-info';
        info.textContent = formatBytes(item.size) + ' · ' + getFormatLabel(item.mimetype, item.filename);
        body.appendChild(info);
      }
    } else if (item.type === 'file' && item.url) {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = item.filename || '下载';
      a.className = 'feed-file-link';
      a.textContent = '↓ ' + (item.filename || '下载文件');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      body.appendChild(a);
      if (item.size != null || item.mimetype || item.filename) {
        const info = document.createElement('div');
        info.className = 'feed-item-file-info';
        info.textContent = formatBytes(item.size) + ' · ' + getFormatLabel(item.mimetype, item.filename);
        body.appendChild(info);
      }
    }

    wrap.appendChild(body);
    return wrap;
  }

  /* ---------- 发送文字 ---------- */
  function sendText() {
    const text = (textInput.value || '').trim();
    if (!text || !socket) return;
    socket.emit('clipboard', { type: 'text', text });
    textInput.value = '';
  }

  sendBtn.addEventListener('click', sendText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  });

  /* ---------- 上传并发送（任意文件，带进度条） ---------- */
  function setUploadProgress(pct, text) {
    if (!uploadProgressWrap) return;
    uploadProgressWrap.classList.add('visible');
    if (uploadProgressBar) uploadProgressBar.style.width = pct + '%';
    if (uploadProgressText) uploadProgressText.textContent = text != null ? text : pct + '%';
  }

  function hideUploadProgress() {
    if (uploadProgressWrap) uploadProgressWrap.classList.remove('visible');
  }

  function uploadAndSend(file) {
    if (!socket) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadProgress(0, '准备…');
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct, pct + '%');
      }
    });
    xhr.addEventListener('load', () => {
      hideUploadProgress();
      if (xhr.status >= 200 && xhr.status < 300) {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {
          showToast('上传失败');
          return;
        }
        const mime = (data.mimetype || '').toLowerCase();
        const type = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'file';
        socket.emit('clipboard', {
          type,
          url: data.url,
          filename: data.filename,
          mimetype: data.mimetype,
          size: data.size,
        });
        showToast(type === 'video' ? '已发送视频' : type === 'image' ? '已发送图片' : '已发送文件');
      } else {
        let err = '上传失败';
        try {
          const o = JSON.parse(xhr.responseText);
          if (o && o.error) err = o.error;
        } catch (_) {}
        showToast(err);
      }
    });
    xhr.addEventListener('error', () => {
      hideUploadProgress();
      showToast('上传失败');
    });
    xhr.addEventListener('abort', () => hideUploadProgress());
    xhr.open('POST', '/upload');
    xhr.send(fd);
  }

  fileInput.addEventListener('change', () => {
    const files = fileInput.files;
    if (!files || !files.length) return;
    for (let i = 0; i < files.length; i++) uploadAndSend(files[i]);
    fileInput.value = '';
  });

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const files = imageInput.files;
      if (!files || !files.length) return;
      for (let i = 0; i < files.length; i++) uploadAndSend(files[i]);
      imageInput.value = '';
    });
  }
  if (cameraInput) {
    cameraInput.addEventListener('change', () => {
      const file = cameraInput.files && cameraInput.files[0];
      if (!file) return;
      uploadAndSend(file);
      cameraInput.value = '';
    });
  }

  /* ---------- 读取设备剪贴板（需用户授权，且需 HTTPS/安全上下文） ---------- */
  readClipboardBtn.addEventListener('click', async () => {
    if (!socket) {
      showToast('未连接，请稍候');
      return;
    }
    if (!navigator.clipboard) {
      showToast('请在下方输入框粘贴（Ctrl+V 或长按粘贴）后点发送');
      if (textInput) {
        textInput.focus();
        var origPlaceholder = textInput.placeholder;
        textInput.placeholder = '在此粘贴后按 Enter 或点发送';
        var restore = function () { textInput.placeholder = origPlaceholder; textInput.removeEventListener('blur', restore); };
        textInput.addEventListener('blur', restore);
        setTimeout(restore, 12000);
      }
      return;
    }
    try {
      if (typeof navigator.clipboard.read !== 'function') {
        const text = await navigator.clipboard.readText();
        if ((text || '').trim()) {
          socket.emit('clipboard', { type: 'text', text: text.trim() });
          showToast('已发送');
        } else {
          showToast('剪贴板为空');
        }
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'image.' + (type.split('/')[1] || 'png'), { type: blob.type });
            await uploadAndSend(file);
            return;
          }
        }
      }
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = (await blob.text()).trim();
          if (text) {
            socket.emit('clipboard', { type: 'text', text });
            showToast('已发送');
            return;
          }
        }
      }
      showToast('剪贴板为空或格式不支持');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        showToast('请允许读取剪贴板权限');
      } else {
        showToast('读取失败：' + (e.message || '无权限'));
      }
    }
  });

  /* ---------- Ctrl+V 粘贴：图片/视频直接发送，文字也直接发送（无需再点发送） ---------- */
  pasteZone.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const items = dt.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        uploadAndSend(file);
        return;
      }
    }
    if (dt.types.includes('text/plain')) {
      const text = (dt.getData('text/plain') || '').trim();
      if (text && socket && document.activeElement !== textInput) {
        e.preventDefault();
        socket.emit('clipboard', { type: 'text', text });
        showToast('已发送');
        return;
      }
    }
  });

  /* ---------- 拖拽上传 ---------- */
  pasteZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    pasteZone.classList.add('drag-over');
  });
  pasteZone.addEventListener('dragleave', () => {
    pasteZone.classList.remove('drag-over');
  });
  pasteZone.addEventListener('drop', (e) => {
    e.preventDefault();
    pasteZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    uploadAndSend(files[0]);
  });

  /* ---------- 删除确认弹窗 ---------- */
  function closeConfirmModal() {
    confirmModal.classList.remove('open');
    confirmModal.setAttribute('aria-hidden', 'true');
    pendingDeleteId = null;
    pendingDeleteEl = null;
  }

  function doDelete() {
    const id = pendingDeleteId != null ? String(pendingDeleteId).trim() : '';
    items = items.filter((x) => String(x.id).trim() !== id);
    if (id && socket) socket.emit('delete', id);
    closeConfirmModal();
    renderFeed();
  }

  confirmOk.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    doDelete();
  });
  confirmCancel.addEventListener('click', closeConfirmModal);
  confirmModalBackdrop.addEventListener('click', closeConfirmModal);

  /* ---------- 预览弹窗 ---------- */
  modalBackdrop.addEventListener('click', closePreview);
  modalClose.addEventListener('click', closePreview);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (confirmModal.classList.contains('open')) closeConfirmModal();
    else if (clearAllModal.classList.contains('open')) closeClearAllModal();
    else if (previewModal.classList.contains('open')) closePreview();
  });

  /* ---------- 搜索 / 筛选 / 加载更多 ---------- */
  if (feedSearch) feedSearch.addEventListener('input', () => renderFeed());
  if (feedSearch) feedSearch.addEventListener('keyup', () => renderFeed());
  if (feedTypeFilter) feedTypeFilter.addEventListener('change', () => renderFeed());

  if (feedLoadMore) {
    feedLoadMore.addEventListener('click', () => {
      displayedCount += PAGE_SIZE;
      renderFeed();
    });
  }

  /* ---------- 清空全部 ---------- */
  function closeClearAllModal() {
    clearAllModal.classList.remove('open');
    clearAllModal.setAttribute('aria-hidden', 'true');
  }
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    clearAllModal.classList.add('open');
    clearAllModal.setAttribute('aria-hidden', 'false');
  });
  if (clearAllCancel) clearAllCancel.addEventListener('click', closeClearAllModal);
  if (clearAllModalBackdrop) clearAllModalBackdrop.addEventListener('click', closeClearAllModal);
  if (clearAllOk) clearAllOk.addEventListener('click', () => {
    if (socket) socket.emit('clearAll');
    closeClearAllModal();
    showToast('已清空');
  });

  /* ---------- 启动 ---------- */
  setEmpty(true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocket);
  } else {
    initSocket();
  }
})();
