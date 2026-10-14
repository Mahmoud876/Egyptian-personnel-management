"""Internal RQ child entry point; command arguments contain job IDs, never secrets."""
import logging
import sys

from rq import Queue
from rq.executions import Execution
from rq.job import Job
from rq.serializers import JSONSerializer

from app.core.redis_client import get_redis
from app.core.windows_worker import WindowsWorker


def main():
    logging.basicConfig(level=logging.INFO)
    worker_key, job_id, execution_id, queue_name = sys.argv[1:]
    connection = get_redis()
    worker = WindowsWorker.find_by_key(worker_key, connection=connection, serializer=JSONSerializer)
    if worker is None:
        raise SystemExit(1)
    job = Job.fetch(job_id, connection=connection, serializer=JSONSerializer)
    queue = Queue(queue_name, connection=connection, serializer=JSONSerializer)
    worker.execution = Execution.fetch(execution_id, job_id, connection=connection)
    worker.main_work_horse(job, queue)


if __name__ == '__main__':
    main()
