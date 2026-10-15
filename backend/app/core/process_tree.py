"""Contain each worker generation, including its RQ and Access child processes."""
import os
import signal
import subprocess


class ProcessTree:
    def __init__(self):
        self.job = None
        if os.name == "nt":
            # Job handles are non-inheritable. Windows closes the handle even if
            # the supervisor itself is killed, terminating the entire tree.
            # https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
            import ctypes as c
            from ctypes import wintypes as w

            class BasicLimits(c.Structure):
                _fields_ = [
                    ("process_time", c.c_longlong), ("job_time", c.c_longlong),
                    ("flags", w.DWORD), ("min_working_set", c.c_size_t),
                    ("max_working_set", c.c_size_t), ("active_processes", w.DWORD),
                    ("affinity", c.c_size_t), ("priority", w.DWORD),
                    ("scheduling", w.DWORD),
                ]

            class ExtendedLimits(c.Structure):
                _fields_ = [
                    ("basic", BasicLimits), ("io_counters", c.c_ulonglong * 6),
                    ("process_memory", c.c_size_t), ("job_memory", c.c_size_t),
                    ("peak_process_memory", c.c_size_t), ("peak_job_memory", c.c_size_t),
                ]

            self.api = c.WinDLL("kernel32", use_last_error=True)
            self.api.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
            self.api.CreateJobObjectW.restype = w.HANDLE
            self.api.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
            self.api.SetInformationJobObject.restype = w.BOOL
            self.api.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
            self.api.AssignProcessToJobObject.restype = w.BOOL
            self.api.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
            self.api.OpenProcess.restype = w.HANDLE
            self.api.CloseHandle.argtypes = [w.HANDLE]
            self.api.CloseHandle.restype = w.BOOL
            self.job = self.api.CreateJobObjectW(None, None)
            if not self.job:
                raise c.WinError(c.get_last_error())
            limits = ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not self.api.SetInformationJobObject(self.job, 9, c.byref(limits), c.sizeof(limits)):
                error = c.WinError(c.get_last_error())
                self.close(None)
                raise error

    def attach(self, process):
        if os.name == "nt":
            import ctypes as c
            # PROCESS_SET_QUOTA | PROCESS_TERMINATE, required by AssignProcessToJobObject.
            handle = self.api.OpenProcess(0x0100 | 0x0001, False, process.pid)
            if not handle:
                raise c.WinError(c.get_last_error())
            try:
                if not self.api.AssignProcessToJobObject(self.job, handle):
                    raise c.WinError(c.get_last_error())
            finally:
                self.api.CloseHandle(handle)

    def close(self, process):
        if self.job:
            self.api.CloseHandle(self.job)
            self.job = None
        elif os.name != "nt" and process is not None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if process is not None:
            # Also handles a failure to attach: the gated worker cannot yet have children.
            if process.poll() is None:
                process.kill()
            process.wait(timeout=15)
            if process.stdin is not None:
                process.stdin.close()


def start_worker(command, tree):
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        start_new_session=os.name != "nt",
    )
    try:
        tree.attach(process)
        # Worker waits for this token before it starts any dispatcher/job children.
        process.stdin.write(b"start\n")
        process.stdin.flush()
        process.stdin.close()
        return process
    except BaseException:
        tree.close(process)
        raise
