"""Run RQ with a recurring SQL dispatcher and crash recovery.

RQ workers isolate jobs in child processes. Launch app.cli.worker_supervisor for automatic restart.
"""
import logging
import os
import sys
import threading

from rq import SpawnWorker
from rq.serializers import JSONSerializer

from app.core.config import get_settings
from app.core.redis_client import get_redis
from app.core.windows_worker import WindowsWorker
from app.recruits.jobs import dispatch_pending, queue


def main():
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()

    def dispatch():
        while not stop.is_set():
            try:
                dispatch_pending()
            except Exception:
                logging.exception("Dispatch unavailable; committed SQL jobs will be retried")
            stop.wait(get_settings().recovery_interval_seconds)

    thread = threading.Thread(target=dispatch, name="sql-job-dispatcher", daemon=True)
    thread.start()
    # RQ 2.12 SpawnWorker still calls POSIX wait4/setpgrp; use our subprocess adapter on Windows.
    cls = WindowsWorker if os.name == 'nt' else SpawnWorker
    try:
        cls([queue()], connection=get_redis(), serializer=JSONSerializer,
            maintenance_interval=30).work()
    finally:
        stop.set()
        thread.join(timeout=10)


if __name__ == "__main__":
    if "--supervised" in sys.argv and sys.stdin.readline() != "start\n":
        sys.exit("Supervisor did not release the worker startup gate")
    main()
