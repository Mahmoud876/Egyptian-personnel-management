"""Run one import or export RQ worker. The service supervisor owns recovery separately."""
import argparse
import logging
import os
import sys

from rq import SpawnWorker
from rq.serializers import JSONSerializer

from app.core.redis_client import get_redis
from app.core.windows_worker import WindowsWorker
from app.recruits.jobs import queue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", choices=("import", "export"), default="import")
    parser.add_argument("--supervised", action="store_true")
    args = parser.parse_args()
    if args.supervised and sys.stdin.readline() != "start\n":
        sys.exit("Supervisor did not release the worker startup gate")
    logging.basicConfig(level=logging.INFO)
    # RQ 2.12 SpawnWorker still calls POSIX wait4/setpgrp; use our subprocess adapter on Windows.
    cls = WindowsWorker if os.name == "nt" else SpawnWorker
    logging.info("Starting %s worker queue=%s", args.role, queue(args.role).name)
    cls([queue(args.role)], connection=get_redis(), serializer=JSONSerializer,
        maintenance_interval=30).work()


if __name__ == "__main__":
    main()
