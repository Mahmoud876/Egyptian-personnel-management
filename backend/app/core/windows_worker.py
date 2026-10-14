"""RQ process isolation on Windows without POSIX wait4/setpgrp or spawnv quoting.

RQ still owns queue delivery, execution registries and result handling. This adapter
only launches and supervises each child through Python's Windows-aware subprocess API.
"""
import os
import subprocess
import sys
import time

from rq import Worker
from rq.job import JobStatus
from rq.utils import now


class WindowsWorker(Worker):
    def fork_work_horse(self, job, queue):
        self._horse_process = subprocess.Popen(
            [sys.executable, '-m', 'app.cli.job_child', self.key, job.id, self.execution.id, queue.name],
            env=os.environ.copy(), creationflags=subprocess.CREATE_NO_WINDOW,
        )
        self._horse_pid = self._horse_process.pid
        self.procline(f'Spawned Windows child {self.horse_pid}')

    def kill_horse(self, sig=None):
        child = getattr(self, '_horse_process', None)
        if child is not None and child.poll() is None:
            # Kill the child and any ACE helper it started, not unrelated workers.
            subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)

    def wait_for_horse(self):
        child = self._horse_process
        return child.pid, child.wait(), None

    def monitor_work_horse(self, job, queue):
        child = self._horse_process
        started = time.monotonic()
        next_heartbeat = started
        job.started_at = now()
        while True:
            try:
                code = child.wait(timeout=1)
                break
            except subprocess.TimeoutExpired:
                elapsed = time.monotonic() - started
                self.set_current_job_working_time(elapsed)
                if job.timeout != -1 and elapsed > job.timeout + 60:
                    self.kill_horse()
                    code = child.wait(timeout=15)
                    break
                if time.monotonic() >= next_heartbeat:
                    self.maintain_heartbeats(job)
                    next_heartbeat = time.monotonic() + self.job_monitoring_interval
        self.set_current_job_working_time(0)
        self._horse_pid = 0
        if code == 0:
            return
        if self._stopped_job_id == job.id:
            if job.stopped_callback:
                job.execute_stopped_callback(self.death_penalty_class)
            self.handle_job_failure(job, queue, exc_string='Windows job process was stopped')
        elif job.get_status() not in {JobStatus.FINISHED, JobStatus.FAILED}:
            job.ended_at = now()
            self.handle_work_horse_killed(job, child.pid, code, None)
            self.handle_job_failure(job, queue, exc_string=f'Windows job process exited unexpectedly ({code})')
