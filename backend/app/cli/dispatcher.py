"""Run the single periodic SQL delivery/recovery service independently of processing workers."""
import argparse
import logging
import signal
import sys
import threading

from app.core.config import get_settings
from app.recruits.jobs import dispatch_pending


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--supervised", action="store_true")
    args = parser.parse_args()
    if args.supervised and sys.stdin.readline() != "start\n":
        sys.exit("Supervisor did not release the dispatcher startup gate")
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    while not stop.is_set():
        try:
            dispatch_pending(stop)
        except Exception:
            logging.exception("Dispatch unavailable; committed SQL jobs will be retried")
        stop.wait(get_settings().recovery_interval_seconds)


if __name__ == "__main__":
    main()
