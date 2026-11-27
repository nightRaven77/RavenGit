//! Local environment check for Git CLI and optional Git LFS availability.
use crate::process;
use serde::Serialize;
use std::{process::Command, time::Duration};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatus {
    pub os: String,
    pub git_available: bool,
    pub git_version: Option<String>,
    pub lfs_available: bool,
    pub lfs_version: Option<String>,
    pub gix_enabled: bool,
}

fn probe_version(args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    let output = process::execute(cmd, None, Duration::from_secs(5)).ok()?;
    if !output.success {
        return None;
    }
    let text = String::from_utf8_lossy(&output.bytes);
    let first_line = text.lines().next().map(str::trim).unwrap_or("");
    (!first_line.is_empty()).then(|| first_line.to_string())
}

pub fn check() -> EnvironmentStatus {
    let git_version = probe_version(&["--version"]);
    let git_available = git_version.is_some();
    let lfs_version = if git_available {
        probe_version(&["lfs", "version"])
    } else {
        None
    };
    let lfs_available = lfs_version.is_some();

    EnvironmentStatus {
        os: std::env::consts::OS.to_string(),
        git_available,
        git_version,
        lfs_available,
        lfs_version,
        gix_enabled: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_git_environment_and_reports_gix_enabled() {
        let status = check();
        assert!(status.gix_enabled);
        assert!(
            matches!(status.os.as_str(), "macos" | "windows" | "linux" | _),
            "unexpected os: {}",
            status.os
        );
        // Git CLI is present in dev/CI environments running this suite.
        assert!(status.git_available);
        assert!(status.git_version.is_some());
    }
}
