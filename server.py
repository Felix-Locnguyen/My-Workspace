#!/usr/bin/env python3
"""Server cho ứng dụng locOS.

Chạy:  python3 server.py   → mở http://127.0.0.1:8000

Dữ liệu được lưu trong thư mục data/ dưới dạng 8 file JSON.
Server chỉ làm nhiệm vụ tách/ghép state <-> file, client giữ nguyên object state.
"""
import json
import os
import re
import sys
import threading
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# Mỗi file JSON chứa những key nào của state
SPLITS = {
    'tasks.json': ['tasks'],
    'projects.json': ['projects'],
    'transactions.json': ['transactions'],
    'assets.json': ['assets'],
    'activity-log.json': ['log'],
    'focus.json': ['focus', 'focusActive'],
    'health.json': ['health'],
    'settings.json': ['user', 'goals', 'ui'],
}
ALL_KEYS = [k for keys in SPLITS.values() for k in keys]


def read_state():
    """Gộp các file JSON trong data/ thành một object state."""
    state = {}
    for filename, keys in SPLITS.items():
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            # File hỏng hoặc không đọc được: bỏ qua thay vì làm sập server
            continue
        if not isinstance(data, dict):
            continue
        for key in keys:
            if key in data:
                state[key] = data[key]
    return state


def write_state(state):
    """Tách state thành các file JSON, ghi nguyên tử từng file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    for filename, keys in SPLITS.items():
        payload = {k: state.get(k) for k in keys if k in state}
        path = os.path.join(DATA_DIR, filename)
        tmp_path = path + '.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)  # nguyên tử: không bao giờ để file giữa chừng


def backup_zip():
    """Nén toàn bộ file trong data/ thành ZIP trong bộ nhớ."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename in sorted(SPLITS):
            path = os.path.join(DATA_DIR, filename)
            if os.path.exists(path):
                zf.write(path, filename)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        pass  # tắt log để dòng lệnh gọn

    def _send(self, code, body, content_type='application/json; charset=utf-8'):
        raw = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(raw)
        except BrokenPipeError:
            pass

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/', '/index.html'):
            index_path = os.path.join(BASE_DIR, 'index.html')
            if not os.path.exists(index_path):
                self._send(404, 'Không tìm thấy index.html', 'text/plain; charset=utf-8')
                return
            with open(index_path, 'r', encoding='utf-8') as f:
                html = f.read()
            # Gộp các view từ views/*.html (chặn path traversal qua whitelist tên file)
            for name in ('dashboard', 'tasks', 'projects', 'finance', 'health', 'settings'):
                view_path = os.path.join(BASE_DIR, 'views', name + '.html')
                fragment = ''
                if os.path.exists(view_path):
                    with open(view_path, 'r', encoding='utf-8') as f:
                        fragment = f.read()
                html = html.replace('<!--VIEW:%s-->' % name, fragment)
            self._send(200, html, 'text/html; charset=utf-8')
            return
        # File tĩnh css/ & js/ — chỉ nhận basename nằm trong whitelist, không có '..'
        m = re.match(r'^/(css|js)/([A-Za-z0-9_-]+\.(css|js))$', path)
        if m:
            sub, fname = m.group(1), m.group(2)
            if not fname.endswith('.' + sub):  # css/* phải .css, js/* phải .js
                self._send(404, json.dumps({'error': 'not found'}))
                return
            fpath = os.path.join(BASE_DIR, sub, fname)
            if not os.path.exists(fpath):
                self._send(404, json.dumps({'error': 'not found'}))
                return
            ctype = 'text/css; charset=utf-8' if sub == 'css' else 'text/javascript; charset=utf-8'
            with open(fpath, 'rb') as f:
                self._send(200, f.read(), ctype)
            return
        if path == '/api/state':
            self._send(200, json.dumps(read_state(), ensure_ascii=False))
            return
        if path == '/api/backup':
            self._send(200, backup_zip(), 'application/zip')
            return
        self._send(404, json.dumps({'error': 'not found'}))

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path != '/api/state':
            self._send(404, json.dumps({'error': 'not found'}))
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length else b''
            state = json.loads(raw.decode('utf-8') or '{}')
        except (ValueError, UnicodeDecodeError):
            self._send(400, json.dumps({'error': 'JSON không hợp lệ'}))
            return
        if not isinstance(state, dict):
            self._send(400, json.dumps({'error': 'state phải là object'}))
            return
        try:
            write_state(state)
        except OSError as e:
            self._send(500, json.dumps({'error': 'Không ghi được file: %s' % e}))
            return
        self._send(200, json.dumps({'ok': True}))


def main():
    port = int(os.environ.get('LOCOS_PORT') or 8000)
    server = None
    for candidate in range(port, port + 20):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        print('Không mở được port %d-%d' % (port, port + 19), file=sys.stderr)
        sys.exit(1)

    url = 'http://127.0.0.1:%d' % port
    print('locOS đang chạy tại %s' % url)
    print('Dữ liệu lưu trong %s' % DATA_DIR)
    print('Nhấn Ctrl+C để dừng.')

    # Mở trình duyệt sau 0.5s để server kịp nhận kết nối
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nĐã dừng server.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
