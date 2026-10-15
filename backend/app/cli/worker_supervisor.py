"""Supervise independent import workers, export workers and one SQL recovery dispatcher."""
from contextlib import contextmanager
import hashlib
import logging
import os
from pathlib import Path
import signal
import sys
import threading
import time

from app.core.process_tree import ProcessTree, start_worker

log = logging.getLogger("worker-supervisor")


@contextmanager
def single_supervisor(path: Path):
    """An OS lock survives stale files and is released on crash; no PID reuse checks."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock:
        if not path.stat().st_size:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise RuntimeError("A worker supervisor is already running for this queue/storage.") from error
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def supervise(command, stop, *, initial_delay=2.0, max_delay=30.0, stable_seconds=60.0, label="worker"):
    delay = initial_delay
    generation = 0
    while not stop.is_set():
        started = time.monotonic()
        process = None
        tree = None
        generation += 1
        try:
            tree = ProcessTree()
            process = start_worker(command, tree)
            log.info("Started %s pid=%s generation=%s", label, process.pid, generation)
            while process.poll() is None and not stop.wait(0.25):
                pass
            if not stop.is_set():
                log.warning("%s pid=%s exited code=%s", label, process.pid, process.poll())
        except OSError:
            log.exception("Unable to start %s", label)
        finally:
            if tree is not None:
                tree.close(process)
        if stop.is_set():
            break
        if time.monotonic() - started >= stable_seconds:
            delay = initial_delay
        log.warning("Restarting %s in %.1f seconds", label, delay)
        if stop.wait(delay):
            break
        delay = min(max_delay, delay * 2)
    log.info("Supervisor stopped; %s tree stopped without restart", label)


def service_commands(settings):
    commands = [("dispatcher", [sys.executable, "-m", "app.cli.dispatcher", "--supervised"])]
    for role, count in (("import", settings.import_workers), ("export", settings.export_workers)):
        for number in range(count):
            commands.append((f"{role}-{number + 1}",
                [sys.executable, "-m", "app.cli.worker", "--role", role, "--supervised"]))
    return commands


def supervise_services(commands, stop):
    failures = []
    def run(label, command):
        try:
            supervise(command, stop, label=label)
        except Exception:
            log.exception("Service supervision failed role=%s; stopping service group", label)
            failures.append(label)
        finally:
            stop.set()

    threads = []
    try:
        for label, command in commands:
            thread = threading.Thread(target=run, args=(label, command), name=label)
            thread.start()
            threads.append(thread)
        while not stop.wait(0.25):
            pass
    finally:
        stop.set()
        for thread in threads:
            thread.join()
    if failures:
        raise RuntimeError("Service supervision failed: " + ", ".join(failures))


def main():
    from app.core.config import get_settings

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    key = hashlib.sha256(settings.queue_name.encode()).hexdigest()[:16]
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    if os.name == "nt":
        signal.signal(signal.SIGBREAK, lambda *_: stop.set())
    try:
        with single_supervisor(settings.storage_root / "logs" / f"worker-supervisor-{key}.lock"):
            supervise_services(service_commands(settings), stop)
    except RuntimeError as error:
        log.error("%s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
