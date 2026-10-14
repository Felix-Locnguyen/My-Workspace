#!/usr/bin/env bash
# locOS — bấm đúp để chạy ứng dụng quản lý công việc & tài chính.
# Script tự mở terminal (nếu chưa có) rồi chạy server và mở trình duyệt.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${LOCOS_PORT:-8000}"

# Nếu đang chạy trong terminal thường → chạy thẳng server.
# Nếu không có terminal (bấm đúp từ GUI) → mở terminal mới rồi chạy trong đó.
if [ -t 0 ] && [ -t 1 ]; then
  exec python3 "$DIR/server.py"
fi

# Chưa có terminal: thử mở terminal có sẵn, chạy server trong đó.
for term in gnome-terminal x-terminal-emulator konsole xfce4-terminal xterm; do
  if command -v "$term" >/dev/null 2>&1; then
    case "$term" in
      gnome-terminal|x-terminal-emulator) exec "$term" --working-directory="$DIR" -- python3 "$DIR/server.py" ;;
      konsole)                            exec "$term" --workdir "$DIR" -e python3 "$DIR/server.py" ;;
      xfce4-terminal)                     exec "$term" --working-directory="$DIR" -e python3 "$DIR/server.py" ;;
      xterm)                              exec "$term" -e python3 "$DIR/server.py" ;;
    esac
  fi
done

# Không có terminal nào: chạy nền không có terminal, vẫn mở trình duyệt.
echo "Không tìm thấy terminal — chạy server ở chế độ nền."
python3 "$DIR/server.py" >/dev/null 2>&1 &
echo "locOS đang chạy tại http://127.0.0.1:$PORT"
