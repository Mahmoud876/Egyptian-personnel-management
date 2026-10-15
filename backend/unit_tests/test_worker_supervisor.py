import json
import os
import signal
import sys
import threading
import time

import pytest

from app.cli.worker_supervisor import single_supervisor, supervise


def wait_until(check, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if value := check():
            return value
        time.sleep(0.05)
    raise AssertionError("Timed out waiting for supervised process")


def entries(path):
    if not path.exists():
        return []
    try:
        return [json.loads(line) for line in path.read_text().splitlines()]
    except json.JSONDecodeError:
        return []  # The other process is still writing its line.


def alive(pid):
    if os.name == "nt":
        import ctypes as c
        from ctypes import wintypes as w
        api = c.WinDLL("kernel32", use_last_error=True)
        api.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        api.OpenProcess.restype = w.HANDLE
        api.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
        api.CloseHandle.argtypes = [w.HANDLE]
        handle = api.OpenProcess(0x00100000, False, pid)
        if not handle:
            return False
        try:
            return api.WaitForSingleObject(handle, 0) == 258  # WAIT_TIMEOUT
        finally:
            api.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


@pytest.mark.skipif(os.name != "nt", reason="Windows process-tree cleanup regression")
def test_worker_crash_restarts_and_cleans_children_then_stop_does_not_restart(tmp_path):
    journal = tmp_path / "generations.jsonl"
    child_code = "import time; time.sleep(120)"
    code = f"""
import json, os, subprocess, sys, time
assert sys.stdin.readline() == 'start\\n'
child = subprocess.Popen([sys.executable, '-c', {child_code!r}])
with open({str(journal)!r}, 'a') as out:
    out.write(json.dumps([os.getpid(), child.pid]) + '\\n')
time.sleep(120)
"""
    stop = threading.Event()
    thread = threading.Thread(target=supervise, args=([sys.executable, "-c", code], stop),
                              kwargs={"initial_delay": 0.1, "max_delay": 0.2})
    thread.start()
    try:
        first = wait_until(lambda: entries(journal))[0]
        assert alive(first[1])
        os.kill(first[0], signal.SIGTERM)
        wait_until(lambda: len(entries(journal)) >= 2)
        second = entries(journal)[1]
        assert second[0] != first[0] and alive(second[1])
        wait_until(lambda: not alive(first[1]))
    finally:
        stop.set()
        thread.join(timeout=15)
    assert not thread.is_alive()
    assert len(entries(journal)) == 2
    for worker, child in entries(journal):
        wait_until(lambda: not alive(worker) and not alive(child))


@pytest.mark.parametrize("exit_code", [0, 7])
def test_exit_including_clean_rq_exit_is_restarted(tmp_path, exit_code):
    journal = tmp_path / "starts"
    code = f"""
import sys, time
from pathlib import Path
assert sys.stdin.readline() == 'start\\n'
path = Path({str(journal)!r})
count = len(path.read_text()) if path.exists() else 0
path.write_text('x' * (count + 1))
if count == 0:
    sys.exit({exit_code})
time.sleep(120)
"""
    stop = threading.Event()
    thread = threading.Thread(target=supervise, args=([sys.executable, "-c", code], stop),
                              kwargs={"initial_delay": 0.1})
    thread.start()
    try:
        wait_until(lambda: journal.exists() and journal.read_text() == "xx")
    finally:
        stop.set()
        thread.join(timeout=15)
    assert not thread.is_alive()
    assert journal.read_text() == "xx"


def test_repeated_start_failures_back_off_and_stop_interrupts_wait(monkeypatch):
    import app.cli.worker_supervisor as module

    class Stop:
        delays = []
        def is_set(self):
            return False
        def wait(self, delay):
            self.delays.append(delay)
            return len(self.delays) == 6

    def unavailable(*_):
        raise OSError("process creation unavailable")

    stop = Stop()
    monkeypatch.setattr(module, "start_worker", unavailable)
    supervise(["unused"], stop)
    assert stop.delays == [2, 4, 8, 16, 30, 30]


def test_duplicate_supervisor_is_rejected_and_lock_is_reusable(tmp_path):
    path = tmp_path / "worker.lock"
    with single_supervisor(path):
        with pytest.raises(RuntimeError, match="already running"):
            with single_supervisor(path):
                pytest.fail("duplicate acquired the supervisor lock")
    with single_supervisor(path):
        pass


def test_service_commands_split_workers_and_one_dispatcher():
    from types import SimpleNamespace
    from app.cli.worker_supervisor import service_commands
    commands = service_commands(SimpleNamespace(import_workers=2, export_workers=1))
    assert [name for name, _ in commands] == ["dispatcher", "import-1", "import-2", "export-1"]
    assert sum("app.cli.dispatcher" in command for _, command in commands) == 1
    assert commands[-1][1][-3:] == ["--role", "export", "--supervised"]


def test_service_group_restarts_one_child_without_restarting_the_other(tmp_path):
    from app.cli.worker_supervisor import supervise_services
    journals = [tmp_path / "import-starts", tmp_path / "export-starts"]
    commands = []
    for index, journal in enumerate(journals):
        code = f"""
import os, sys, time
from pathlib import Path
assert sys.stdin.readline() == 'start\\n'
path = Path({str(journal)!r})
with path.open('a') as out:
    out.write(str(os.getpid()) + '\\n')
time.sleep(120)
"""
        commands.append((f"role-{index}", [sys.executable, "-c", code]))
    stop = threading.Event()
    thread = threading.Thread(target=supervise_services, args=(commands, stop))
    thread.start()
    try:
        wait_until(lambda: all(p.exists() and p.read_text().strip() for p in journals))
        first = int(journals[0].read_text().strip())
        other = int(journals[1].read_text().strip())
        os.kill(first, signal.SIGTERM)
        wait_until(lambda: len(journals[0].read_text().splitlines()) == 2)
        assert journals[1].read_text().splitlines() == [str(other)]
        assert alive(other)
    finally:
        stop.set()
        thread.join(timeout=20)
    assert not thread.is_alive()
    for journal in journals:
        for pid in journal.read_text().splitlines():
            wait_until(lambda pid=int(pid): not alive(pid))
