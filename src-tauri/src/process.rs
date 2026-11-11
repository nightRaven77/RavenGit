//! Shared process lifetime and output budget. Domain modules decide which Git operations are allowed.
use std::{
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
const LIMIT: usize = 2 * 1024 * 1024;
#[cfg(windows)]
mod windows;
#[derive(Debug)]
pub enum Error {
    Start,
    Timeout,
    Input,
}
pub struct Output {
    pub bytes: Vec<u8>,
    pub success: bool,
    pub diagnostic: Option<Diagnostic>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Diagnostic {
    SshAgentEmpty,
    SshAuthentication,
    HostKey,
    Dns,
    Connection,
    HttpsAuthentication,
    Tls,
    RepositoryAccess,
}

fn diagnostic(bytes: &[u8]) -> Option<Diagnostic> {
    let text = String::from_utf8_lossy(bytes).to_ascii_lowercase();
    if text.contains("the agent has no identities") {
        return Some(Diagnostic::SshAgentEmpty);
    }
    if text.contains("host key verification failed")
        || text.contains("remote host identification has changed")
    {
        Some(Diagnostic::HostKey)
    } else if text.contains("permission denied (publickey")
        || text.contains("no supported authentication methods available")
    {
        Some(Diagnostic::SshAuthentication)
    } else if text.contains("could not resolve hostname")
        || text.contains("could not resolve host:")
    {
        Some(Diagnostic::Dns)
    } else if text.contains("connection refused")
        || text.contains("connection timed out")
        || text.contains("network is unreachable")
        || text.contains("connection reset")
        || text.contains("connection closed")
        || text.contains("broken pipe")
        || text.contains("kex_exchange_identification")
    {
        Some(Diagnostic::Connection)
    } else if text.contains("authentication failed")
        || text.contains("could not read username")
        || text.contains("terminal prompts disabled")
        || text.contains("cannot prompt because user interactivity has been disabled")
        || text.contains("unable to get password from user")
        || text.contains("could not read password")
    {
        Some(Diagnostic::HttpsAuthentication)
    } else if text.contains("ssl certificate problem") || text.contains("certificate verify failed")
    {
        Some(Diagnostic::Tls)
    } else if text.contains("repository not found")
        || text.contains("does not appear to be a git repository")
        || text.contains("could not read from remote repository")
        || text.contains("project you were looking for could not be found")
        || text.contains("not allowed to download code")
        || text.contains("requested url returned error: 403")
        || text.contains("requested url returned error: 404")
    {
        Some(Diagnostic::RepositoryAccess)
    } else {
        None
    }
}
/// Every local operation forbids automatic object downloads. Explicit fetch/push still work.
pub fn git(path: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.arg("--no-pager")
        .args(["-c", "core.fsmonitor=false", "-c", "color.ui=false"])
        .current_dir(path)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_NAMESPACE")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env("GIT_TERMINAL_PROMPT", "0");
    cmd
}
fn drain(mut input: impl Read, keep: usize) -> Vec<u8> {
    let mut bytes = vec![];
    let mut buffer = [0; 8192];
    while let Ok(n) = input.read(&mut buffer) {
        if n == 0 {
            break;
        }
        let count = n.min(keep.saturating_sub(bytes.len()));
        bytes.extend_from_slice(&buffer[..count]);
    }
    bytes
}
pub fn execute(
    mut command: Command,
    input: Option<Vec<u8>>,
    timeout: Duration,
) -> Result<Output, Error> {
    let started = Instant::now();
    command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    let (mut child, job) = windows::Job::spawn(&mut command).map_err(|error| {
        #[cfg(test)]
        eprintln!("No se pudo iniciar el proceso contenido: {error}");
        let _ = error;
        Error::Start
    })?;
    #[cfg(not(windows))]
    let mut child = command.spawn().map_err(|_| Error::Start)?;
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let stdout = thread::spawn(move || drain(out, LIMIT + 1));
    let stderr = thread::spawn(move || diagnostic(&drain(err, 16 * 1024)));
    let writer = input.map(|bytes| {
        let mut stdin = child.stdin.take().unwrap();
        thread::spawn(move || stdin.write_all(&bytes))
    });
    let mut status = None;
    loop {
        if status.is_none() {
            match child.try_wait() {
                Ok(Some(s)) => status = Some(s),
                Ok(None) => {}
                Err(_) => break,
            }
        }
        if let Some(exit_status) = status.as_ref()
            && stdout.is_finished()
            && stderr.is_finished()
            && writer.as_ref().is_none_or(|w| w.is_finished())
        {
            let bytes = stdout.join().unwrap_or_default();
            let diagnostic = stderr.join().unwrap_or_default();
            if writer.is_some_and(|w| !w.join().is_ok_and(|r| r.is_ok())) {
                return Err(Error::Input);
            }
            return Ok(Output {
                bytes,
                success: exit_status.success(),
                diagnostic,
            });
        }
        if started.elapsed() >= timeout {
            break;
        }
        thread::sleep(Duration::from_millis(5));
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    job.terminate();
    let _ = child.kill();
    let _ = child.wait();
    // Never join threads whose streams may still be held by a descendant (also on Windows).
    Err(Error::Timeout)
}

#[cfg(test)]
mod diagnostic_tests {
    use super::*;
    #[test]
    fn recognizes_empty_agent_without_returning_stderr() {
        assert_eq!(
            diagnostic(b"The agent has no identities.\n"),
            Some(Diagnostic::SshAgentEmpty)
        );
    }
    #[test]
    fn classifies_noninteractive_https_credential_failures() {
        for stderr in [
            "fatal: Cannot prompt because user interactivity has been disabled.",
            "fatal: unable to get password from user",
            "fatal: could not read Password for 'https://private@example.invalid': No such device or address",
        ] {
            assert_eq!(
                diagnostic(stderr.as_bytes()),
                Some(Diagnostic::HttpsAuthentication)
            );
        }
    }
    #[test]
    fn distinguishes_repository_access_and_ssh_disconnects_without_exposing_details() {
        for stderr in [
            "ERROR: Repository not found. private-token",
            "The project you were looking for could not be found or you don't have permission to view it. private-token",
            "fatal: Could not read from remote repository. private-token",
            "fatal: '/private/path' does not appear to be a git repository",
            "The requested URL returned error: 403 private-token",
        ] {
            assert_eq!(
                diagnostic(stderr.as_bytes()),
                Some(Diagnostic::RepositoryAccess)
            );
        }
        for stderr in [
            "Connection closed by remote host",
            "Connection reset by peer",
            "kex_exchange_identification: read: Connection reset",
            "client_loop: send disconnect: Broken pipe",
        ] {
            assert_eq!(diagnostic(stderr.as_bytes()), Some(Diagnostic::Connection));
        }
        assert_eq!(
            diagnostic(b"Permission denied (publickey). Could not read from remote repository."),
            Some(Diagnostic::SshAuthentication)
        );
    }
    #[test]
    fn classifies_connection_failures_without_returning_sensitive_stderr() {
        assert_eq!(
            diagnostic(b"git@host: Permission denied (publickey). private-token"),
            Some(Diagnostic::SshAuthentication)
        );
        assert_eq!(
            diagnostic(b"Host key verification failed."),
            Some(Diagnostic::HostKey)
        );
        assert_eq!(
            diagnostic(b"REMOTE HOST IDENTIFICATION HAS CHANGED!"),
            Some(Diagnostic::HostKey)
        );
        assert_eq!(
            diagnostic(b"Could not resolve hostname example.invalid"),
            Some(Diagnostic::Dns)
        );
        assert_eq!(
            diagnostic(b"Connection refused"),
            Some(Diagnostic::Connection)
        );
        assert_eq!(
            diagnostic(b"Authentication failed for 'https://secret@example.invalid'"),
            Some(Diagnostic::HttpsAuthentication)
        );
        assert_eq!(
            diagnostic(b"SSL certificate problem: certificate verify failed"),
            Some(Diagnostic::Tls)
        );
        assert_eq!(
            diagnostic(b"arbitrary stderr with sensitive information"),
            None
        );
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    #[cfg(unix)]
    fn inherited_pipes_and_live_child_share_the_deadline() {
        for script in ["sleep 3 & exit 0", "sleep 3"] {
            let mut command = Command::new("sh");
            command.args(["-c", script]);
            let start = Instant::now();
            assert!(matches!(
                execute(command, None, Duration::from_millis(120)),
                Err(Error::Timeout)
            ));
            assert!(start.elapsed() < Duration::from_secs(1));
        }
    }
    #[test]
    #[cfg(unix)]
    fn drains_both_streams_and_preserves_input() {
        let mut command = Command::new("sh");
        command.args(["-c", "cat; printf 'private' >&2"]);
        let out = execute(command, Some(b"payload".to_vec()), Duration::from_secs(2)).unwrap();
        assert!(out.success);
        assert_eq!(out.bytes, b"payload");
    }
    #[test]
    #[cfg(unix)]
    fn caps_stdout_without_closing_the_pipe_early() {
        let mut command = Command::new("sh");
        command.args(["-c", "head -c 2200000 /dev/zero"]);
        let out = execute(command, None, Duration::from_secs(2)).unwrap();
        assert!(out.success);
        assert_eq!(out.bytes.len(), LIMIT + 1);
    }
}
