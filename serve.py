#!/usr/bin/env python3
"""Локальный сервер для «ЭлектроПлана».

Нужен только для удобного запуска на компьютере: приложение полностью
статическое, без сборки и бэкенда. Служит папку проекта на 127.0.0.1
и открывает браузер. Для установки PWA на Android нужен HTTPS или
localhost (см. README_RU.md).
"""

from __future__ import annotations

import argparse
import functools
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class AppHandler(SimpleHTTPRequestHandler):
    """Отдаёт файлы без кэширования, чтобы обновления виделись сразу."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args: object) -> None:
        # Не засоряем консоль каждой картинкой; ошибки всё равно видно.
        if len(args) >= 2:
            if str(args[1])[:1] in {"4", "5"}:
                super().log_message(fmt, *args)
            return
        super().log_message(fmt, *args)


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "—"


def port_busy(host: str, port: int) -> bool:
    """Проверяет занятость порта до создания сервера.

    На Windows SO_REUSEADDR позволяет двум серверам занять один порт,
    поэтому одной обработки OSError при bind недостаточно.
    """
    probe_host = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.4)
            return probe.connect_ex((probe_host, port)) == 0
    except OSError:
        return False


def already_running(url: str) -> bool:
    """Проверяет, что на порту уже работает именно ЭлектроПлан."""
    try:
        with urllib.request.urlopen(url, timeout=1.5) as response:
            return "ЭлектроПлан" in response.read(4096).decode("utf-8", "ignore")
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Локальный сервер «ЭлектроПлан»")
    parser.add_argument("--host", default="127.0.0.1", help="адрес прослушивания")
    parser.add_argument("--port", type=int, default=8000, help="порт (по умолчанию 8000)")
    parser.add_argument("--no-browser", action="store_true", help="не открывать браузер")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}/"
    handler = functools.partial(AppHandler, directory=str(ROOT))

    if port_busy(args.host, args.port):
        print(f"Порт {args.port} уже занят.")
        if already_running(url):
            print("ЭлектроПлан уже запущен — открываю его в браузере.")
            if not args.no_browser:
                webbrowser.open(url)
            return 0
        print(f"Порт занят другой программой. Попробуйте: py -3 serve.py --port 8080")
        return 1

    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        print(f"Не удалось запустить сервер: {error}")
        print("Порт освободился не до конца или занят другой программой.")
        print("Попробуйте другой порт: py -3 serve.py --port 8080")
        return 1

    print("ЭлектроПлан — локальный сервер")
    print(f"  Папка: {ROOT}")
    print(f"  Адрес: {url}")
    if args.host in ("0.0.0.0", "::"):
        print(f"  В локальной сети: http://{local_ip()}:{args.port}/")
        print("  Установка PWA с телефона по HTTP недоступна: нужен HTTPS или localhost.")
    print("  Остановка: Ctrl+C")
    print()

    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
