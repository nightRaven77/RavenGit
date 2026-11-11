use std::{
    io,
    mem::{size_of, zeroed},
    os::windows::{
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
        process::CommandExt,
    },
    process::{Child, Command},
    ptr::{null, null_mut},
};
use windows_sys::Win32::{
    Foundation::{
        ERROR_INVALID_PARAMETER, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, FILETIME, GetLastError,
    },
    System::{
        Diagnostics::ProcessSnapshotting::{
            HPSS, HPSSWALK, PSS_CAPTURE_THREADS, PSS_THREAD_ENTRY, PSS_WALK_THREADS,
            PssCaptureSnapshot, PssFreeSnapshot, PssWalkMarkerCreate, PssWalkMarkerFree,
            PssWalkSnapshot,
        },
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject,
        },
        Threading::{
            CREATE_NO_WINDOW, CREATE_SUSPENDED, GetCurrentProcess, GetProcessIdOfThread,
            GetThreadTimes, OpenThread, ResumeThread, THREAD_QUERY_LIMITED_INFORMATION,
            THREAD_SUSPEND_RESUME,
        },
    },
};

pub(super) struct Job(OwnedHandle);

impl Job {
    fn new() -> io::Result<Self> {
        let handle = unsafe { CreateJobObjectW(null(), null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let job = Self(unsafe { OwnedHandle::from_raw_handle(handle) });
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                job.0.as_raw_handle(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(job)
    }

    pub(super) fn spawn(command: &mut Command) -> io::Result<(Child, Self)> {
        let job = Self::new()?;
        command.creation_flags(CREATE_SUSPENDED | CREATE_NO_WINDOW);
        let mut child = command.spawn()?;
        let attached =
            unsafe { AssignProcessToJobObject(job.0.as_raw_handle(), child.as_raw_handle()) };
        let result = if attached == 0 {
            Err(io::Error::last_os_error())
        } else {
            resume(&child)
        };
        if let Err(error) = result {
            job.terminate();
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        Ok((child, job))
    }

    pub(super) fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.0.as_raw_handle(), 1);
        }
    }
}

struct Snapshot(HPSS);
impl Drop for Snapshot {
    fn drop(&mut self) {
        unsafe {
            PssFreeSnapshot(GetCurrentProcess(), self.0);
        }
    }
}
struct Walk(HPSSWALK);
impl Drop for Walk {
    fn drop(&mut self) {
        unsafe {
            PssWalkMarkerFree(self.0);
        }
    }
}
fn checked(code: u32) -> io::Result<()> {
    if code == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(code as i32))
    }
}
fn threads(child: &Child) -> io::Result<Vec<OwnedHandle>> {
    let mut snapshot: HPSS = null_mut();
    checked(unsafe {
        PssCaptureSnapshot(child.as_raw_handle(), PSS_CAPTURE_THREADS, 0, &mut snapshot)
    })?;
    let snapshot = Snapshot(snapshot);
    let mut marker: HPSSWALK = null_mut();
    checked(unsafe { PssWalkMarkerCreate(null(), &mut marker) })?;
    let marker = Walk(marker);
    let mut threads: Vec<(u64, OwnedHandle)> = vec![];
    loop {
        let mut entry: PSS_THREAD_ENTRY = unsafe { zeroed() };
        let code = unsafe {
            PssWalkSnapshot(
                snapshot.0,
                PSS_WALK_THREADS,
                marker.0,
                (&mut entry as *mut PSS_THREAD_ENTRY).cast(),
                size_of::<PSS_THREAD_ENTRY>() as u32,
            )
        };
        if code == ERROR_NO_MORE_ITEMS {
            break;
        }
        checked(code)?;
        if entry.ProcessId != child.id() {
            return Err(io::Error::other(
                "El hilo no pertenece al proceso suspendido.",
            ));
        }
        let handle = unsafe {
            OpenThread(
                THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION,
                0,
                entry.ThreadId,
            )
        };
        if handle.is_null() {
            if unsafe { GetLastError() } == ERROR_INVALID_PARAMETER {
                continue;
            }
            return Err(io::Error::last_os_error());
        }
        let handle = unsafe { OwnedHandle::from_raw_handle(handle) };
        if unsafe { GetProcessIdOfThread(handle.as_raw_handle()) } != child.id() {
            continue;
        }
        let mut creation: FILETIME = unsafe { zeroed() };
        let mut exit: FILETIME = unsafe { zeroed() };
        let mut kernel: FILETIME = unsafe { zeroed() };
        let mut user: FILETIME = unsafe { zeroed() };
        if unsafe {
            GetThreadTimes(
                handle.as_raw_handle(),
                &mut creation,
                &mut exit,
                &mut kernel,
                &mut user,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let created =
            (u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime);
        threads.push((created, handle));
    }
    threads.sort_by_key(|(created, _)| *created);
    Ok(threads.into_iter().map(|(_, handle)| handle).collect())
}
fn resume(child: &Child) -> io::Result<()> {
    let mut last_error = None;
    for handle in threads(child)? {
        match unsafe { ResumeThread(handle.as_raw_handle()) } {
            0 => continue,
            u32::MAX => last_error = Some(io::Error::last_os_error()),
            _ => return Ok(()),
        }
    }
    Err(last_error
        .unwrap_or_else(|| io::Error::other("No se encontró el hilo inicial suspendido.")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::process::{Error, LIMIT, execute};
    use std::{
        fs,
        io::{Read, Write},
        path::PathBuf,
        process::Stdio,
        thread,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{
            ERROR_INVALID_PARAMETER, GetLastError, HANDLE_FLAG_INHERIT, SetHandleInformation,
            WAIT_OBJECT_0,
        },
        System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
    };

    const FIXTURE: &str = "process::windows::tests::process_fixture";
    fn command(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args(["--exact", FIXTURE, "--ignored", "--nocapture"])
            .env("RAVENGIT_PROCESS_FIXTURE", mode);
        command
    }
    fn marker() -> PathBuf {
        std::env::temp_dir().join(format!(
            "ravengit-process-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn assert_stopped(marker: &PathBuf) {
        let process_id = fs::read_to_string(marker).unwrap().parse::<u32>().unwrap();
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, process_id) };
        if handle.is_null() {
            assert_eq!(unsafe { GetLastError() }, ERROR_INVALID_PARAMETER);
        } else {
            let handle = unsafe { OwnedHandle::from_raw_handle(handle) };
            assert_eq!(
                unsafe { WaitForSingleObject(handle.as_raw_handle(), 3000) },
                WAIT_OBJECT_0
            );
        }
        fs::remove_file(marker).unwrap();
    }
    #[test]
    #[ignore]
    fn process_fixture() {
        let mode = std::env::var("RAVENGIT_PROCESS_FIXTURE").unwrap();
        match mode.as_str() {
            "echo" => {
                std::io::stderr()
                    .write_all(&vec![b'e'; LIMIT + 8192])
                    .unwrap();
                let mut bytes = vec![];
                std::io::stdin().read_to_end(&mut bytes).unwrap();
                std::io::stdout().write_all(&bytes).unwrap();
                std::process::exit(0);
            }
            "large" => {
                std::io::stdout()
                    .write_all(&vec![b'x'; LIMIT + 8192])
                    .unwrap();
                std::process::exit(0);
            }
            "sleep" => {
                fs::write(
                    std::env::var_os("RAVENGIT_PROCESS_MARKER").unwrap(),
                    std::process::id().to_string(),
                )
                .unwrap();
                thread::sleep(Duration::from_secs(60));
            }
            "parent-exit" | "parent-wait" | "parent-detached-streams" => {
                let mut child = command("sleep");
                child.creation_flags(CREATE_NO_WINDOW);
                if mode == "parent-detached-streams" {
                    for handle in [
                        std::io::stdout().as_raw_handle(),
                        std::io::stderr().as_raw_handle(),
                    ] {
                        assert_ne!(
                            unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0) },
                            0
                        );
                    }
                    child
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());
                }
                let mut child = child.spawn().unwrap();
                let marker = PathBuf::from(std::env::var_os("RAVENGIT_PROCESS_MARKER").unwrap());
                let start = Instant::now();
                while !fs::read_to_string(&marker).is_ok_and(|value| value.parse::<u32>().is_ok()) {
                    assert!(start.elapsed() < Duration::from_secs(5));
                    thread::sleep(Duration::from_millis(5));
                }
                if mode == "parent-wait" {
                    child.wait().unwrap();
                }
                std::process::exit(0);
            }
            _ => panic!("Unknown fixture mode"),
        }
    }
    #[test]
    fn kills_descendants_with_inherited_pipes_after_parent_exit_or_timeout() {
        for mode in ["parent-exit", "parent-wait"] {
            let marker = marker();
            let mut command = command(mode);
            command.env("RAVENGIT_PROCESS_MARKER", &marker);
            let start = Instant::now();
            assert!(matches!(
                execute(command, None, Duration::from_secs(5)),
                Err(Error::Timeout)
            ));
            assert!(start.elapsed() < Duration::from_secs(8));
            assert_stopped(&marker);
        }
    }
    #[test]
    fn closes_job_on_success_to_stop_background_descendants() {
        let marker = marker();
        let mut command = command("parent-detached-streams");
        command.env("RAVENGIT_PROCESS_MARKER", &marker);
        assert!(
            execute(command, None, Duration::from_secs(5))
                .unwrap()
                .success
        );
        assert_stopped(&marker);
    }
    #[test]
    fn blocked_input_obeys_deadline_and_child_is_stopped() {
        let marker = marker();
        let mut command = command("sleep");
        command.env("RAVENGIT_PROCESS_MARKER", &marker);
        let start = Instant::now();
        assert!(matches!(
            execute(command, Some(vec![b'x'; LIMIT * 2]), Duration::from_secs(2)),
            Err(Error::Timeout)
        ));
        assert!(start.elapsed() < Duration::from_secs(5));
        assert_stopped(&marker);
    }
    #[test]
    fn drains_stderr_while_preserving_input_and_caps_stdout() {
        let output = execute(
            command("echo"),
            Some(b"payload".to_vec()),
            Duration::from_secs(5),
        )
        .unwrap();
        assert!(output.success);
        assert!(output.bytes.ends_with(b"payload"));
        let output = execute(command("large"), None, Duration::from_secs(5)).unwrap();
        assert!(output.success);
        assert_eq!(output.bytes.len(), LIMIT + 1);
    }
    #[test]
    fn repeatedly_resumes_the_initial_thread_of_the_contained_child() {
        for iteration in 0..16 {
            let mut command = if iteration % 2 == 0 {
                command("echo")
            } else {
                let mut command = Command::new("git");
                command.arg("--version");
                command
            };
            command
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            let (mut child, job) = Job::spawn(&mut command).unwrap();
            let started = Instant::now();
            loop {
                if let Some(status) = child.try_wait().unwrap() {
                    assert!(status.success());
                    break;
                }
                if started.elapsed() > Duration::from_secs(5) {
                    job.terminate();
                    panic!("El proceso contenido no terminó.");
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
    }
    #[test]
    fn releases_only_its_own_suspend_count() {
        use windows_sys::Win32::System::Threading::SuspendThread;
        let marker = marker();
        let mut command = command("sleep");
        command
            .env("RAVENGIT_PROCESS_MARKER", &marker)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let (mut child, job) = Job::spawn(&mut command).unwrap();
        let started = Instant::now();
        while !marker.exists() {
            assert!(started.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(5));
        }
        let initial = threads(&child).unwrap().remove(0);
        let previous = unsafe { SuspendThread(initial.as_raw_handle()) };
        assert_ne!(previous, u32::MAX);
        assert_eq!(
            unsafe { SuspendThread(initial.as_raw_handle()) },
            previous + 1
        );
        resume(&child).unwrap();
        assert_eq!(
            unsafe { ResumeThread(initial.as_raw_handle()) },
            previous + 1
        );
        job.terminate();
        child.wait().unwrap();
        assert_stopped(&marker);
    }
}
