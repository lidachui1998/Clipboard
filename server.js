const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
// 先创建空 HTTP 服务，再挂载 Socket.io，这样 /socket.io 的请求才能被 Socket.io 处理（否则会被 Express 先接住并 404）
const httpServer = createServer();
// 局域网优先：仅用 WebSocket，省掉轮询，延迟更低
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket'],
  pingTimeout: 20000,
  pingInterval: 10000,
});
// 非 /socket.io 的请求交给 Express
httpServer.on('request', (req, res) => {
  if (req.url && req.url.startsWith('/socket.io')) return;
  app(req, res);
});

const PORT = process.env.PORT || 3846;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'clipboard.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const LEGACY_UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 启动时把旧 uploads/ 下的文件挪到 data/uploads/，保证历史图片能打开
function migrateLegacyUploads() {
  if (!fs.existsSync(LEGACY_UPLOAD_DIR)) return;
  const names = fs.readdirSync(LEGACY_UPLOAD_DIR);
  for (const name of names) {
    if (name === '.gitkeep') continue;
    const src = path.join(LEGACY_UPLOAD_DIR, name);
    const dest = path.join(UPLOAD_DIR, name);
    if (!fs.statSync(src).isFile()) continue;
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}
migrateLegacyUploads();

const KEY_MAP = { i: 'id', t: 'ts', y: 'type', u: 'url', x: 'text', f: 'filename', m: 'mimetype', s: 'size' };
function expandItem(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    out[KEY_MAP[k] || k] = v;
  }
  return out;
}
function shrinkItem(o) {
  const rev = {};
  for (const [short, long] of Object.entries(KEY_MAP)) rev[long] = short;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    out[rev[k] || k] = v;
  }
  return out;
}

function loadItems() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((o) => (o.id !== undefined ? o : expandItem(o)));
  } catch {
    return [];
  }
}

function saveItems(items) {
  const compact = items.map((o) => shrinkItem(o));
  fs.writeFileSync(DATA_FILE, JSON.stringify(compact), 'utf8');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    try {
      const raw = (file.originalname || '').toString();
      const ext = path.extname(raw) || getExt(file.mimetype) || '.bin';
      const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
      cb(null, `${uuidv4()}${safeExt}`);
    } catch (e) {
      cb(e);
    }
  },
});

function getExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[mime] || '';
}

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true),
});

function decodeFilename(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';
  try {
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(UPLOAD_DIR));

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
      return res.status(code).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '未选择文件' });
    try {
      const url = `/files/${req.file.filename}`;
      const filename = decodeFilename(req.file.originalname) || req.file.filename;
      const mimetype = req.file.mimetype || 'application/octet-stream';
      const size = req.file.size != null ? req.file.size : 0;
      res.json({ url, filename, mimetype, size });
    } catch (e) {
      console.error('Upload response error:', e);
      res.status(500).json({ error: '上传失败' });
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'lan-clipboard' });
});

let recentItems = loadItems();
const MAX_RECENT = 200;

function addRecent(item) {
  recentItems.unshift(item);
  if (recentItems.length > MAX_RECENT) recentItems.pop();
  saveItems(recentItems);
}

function deleteFileForItem(item) {
  if (!item) return;
  const url = item.url || item.u;
  if (typeof url !== 'string' || !url.startsWith('/files/')) return;
  const pathname = url.split('?')[0];
  const name = pathname.slice('/files/'.length).replace(/[/\\]/g, '').trim();
  if (!name) return;
  for (const dir of [UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
    try {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error('Delete file failed:', name, e.message);
    }
  }
}

function removeRecent(id) {
  const sid = String(id).trim();
  if (!sid) return false;
  const found = recentItems.find((x) => String(x.id).trim() === sid);
  if (found && (found.type === 'image' || found.type === 'video' || found.type === 'file')) {
    deleteFileForItem(found);
  }
  const before = recentItems.length;
  recentItems = recentItems.filter((x) => String(x.id).trim() !== sid);
  const removed = recentItems.length < before;
  if (removed) saveItems(recentItems);
  return removed;
}

io.on('connection', (socket) => {
  socket.emit('recent', recentItems);

  socket.on('clipboard', (payload) => {
    const item = {
      id: uuidv4(),
      ts: Date.now(),
      ...payload,
    };
    addRecent(item);
    io.emit('clipboard', item);
  });

  socket.on('delete', (...args) => {
    const id = args[0];
    if (id == null || id === '') return;
    const sid = String(id).trim();
    const removed = removeRecent(sid);
    if (removed) io.emit('deleted', sid);
  });

  socket.on('clearAll', () => {
    try {
      const names = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
      for (const name of names) {
        const filePath = path.join(UPLOAD_DIR, name);
        if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
      }
      recentItems.length = 0;
      saveItems(recentItems);
      io.emit('cleared');
    } catch (e) {
      console.error('Clear all failed:', e.message);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN Clipboard running at http://0.0.0.0:${PORT}`);
});
