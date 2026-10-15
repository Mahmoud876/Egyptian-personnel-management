"""Exercise React screens through Vite's HTTP proxy, FastAPI, SQL Server, Redis and the RQ worker.

Uses only the test database, synthetic users and temporary files. No developer credentials are read.
The DOM is jsdom; physical print dialogs and visual layout still require a browser/manual check.
"""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

from app.core.config import get_settings


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def test_react_workflow_with_real_backend(make_user, tmp_path):
    settings = get_settings()
    assert settings.db_name.endswith("_test")
    root = Path(__file__).resolve().parents[2]
    frontend = root / "frontend"
    node = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    assert Path(node).is_file(), "Install Node.js before running the full-stack integration test"
    admin = make_user(role="system_administrator")
    operator = make_user(role="data_entry_operator")
    api_port, web_port = free_port(), free_port()
    env = {**os.environ, "API_PORT": str(api_port), "WEB_PORT": str(web_port),
           "RECOVERY_INTERVAL_SECONDS": "1", "PERSONNEL_INTEGRATION_URL": f"http://127.0.0.1:{web_port}",
           "PERSONNEL_TEST_ADMIN": admin.username, "PERSONNEL_TEST_OPERATOR": operator.username,
           "PERSONNEL_TEST_PASSWORD": admin.password, "NO_COLOR": "1"}
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    processes = []
    logs = []
    try:
        commands = [
            ([sys.executable, "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", str(api_port)], root / "backend"),
            ([sys.executable, "-m", "app.cli.worker_supervisor"], root / "backend"),
            ([node, "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", str(web_port)], frontend),
        ]
        for index, (command, cwd) in enumerate(commands):
            log = (tmp_path / f"server-{index}.log").open("w", encoding="utf-8")
            logs.append(log)
            processes.append(subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=log, creationflags=flags))
        deadline = time.monotonic() + 40
        while True:
            try:
                with urlopen(env["PERSONNEL_INTEGRATION_URL"] + "/api/v1/health", timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                if time.monotonic() >= deadline:
                    raise AssertionError("Integration API/proxy did not become healthy")
                time.sleep(0.3)
        result = subprocess.run(
            [node, "node_modules/vitest/vitest.mjs", "run", "src/features/conscripts/live.integration.test.tsx"],
            cwd=frontend, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=150, creationflags=flags,
        )
        assert result.returncode == 0, result.stdout + result.stderr
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, creationflags=flags)
                else:
                    process.terminate()
                process.wait(timeout=15)
        for log in logs:
            log.close()
