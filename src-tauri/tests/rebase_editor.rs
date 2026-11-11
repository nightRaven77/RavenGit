// Cargo builds the shipped binary for these protocol checks and domain tests.
#[test]
fn rebase_editor_refuses_incomplete_protocol_without_launching_gui() {
    let status = std::process::Command::new(env!("CARGO_BIN_EXE_ravengit"))
        .arg("--ravengit-rebase-editor")
        .status()
        .unwrap();
    assert!(!status.success());
}

#[test]
fn rebase_editor_verifies_record_target_and_literal_messages() {
    use sha2::{Digest, Sha256};
    use std::{fs, process::Command};
    let dir = std::env::temp_dir().join(format!(
        "ravengit editor ü ' {}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(dir.join("rebase-merge")).unwrap();
    let record = dir.join("ravengit-rebase.json");
    let hash = "a".repeat(40);
    let message = "Mensaje literal $(touch DANGER) `whoami`\n\nCuerpo ü";
    let data = serde_json::to_vec(&serde_json::json!({"branch":"main","original":hash,"base":"b".repeat(40),"backup":"refs/ravengit/rebase/test","interactive":{"token":"review","steps":[{"hash":hash,"action":"reword","message":message}]}})).unwrap();
    fs::write(&record, &data).unwrap();
    let digest = format!("{:x}", Sha256::digest(&data));
    let target = dir.join("rebase-merge/git-rebase-todo");
    fs::write(&target, "original").unwrap();
    let call = |mode: &str, digest: &str, target: &std::path::Path| {
        Command::new(env!("CARGO_BIN_EXE_ravengit"))
            .args(["--ravengit-rebase-editor", mode])
            .arg(&record)
            .arg(digest)
            .arg(target)
            .status()
            .unwrap()
            .success()
    };
    assert!(!call("sequence", "wrong", &target));
    assert_eq!(fs::read_to_string(&target).unwrap(), "original");
    let outside = dir.join("outside");
    fs::write(&outside, "keep").unwrap();
    assert!(!call("sequence", &digest, &outside));
    assert_eq!(fs::read_to_string(&outside).unwrap(), "keep");
    assert!(call("sequence", &digest, &target));
    assert_eq!(
        fs::read_to_string(&target).unwrap(),
        format!("reword {hash}\n")
    );
    fs::write(dir.join("rebase-merge/done"), format!("reword {hash}\n")).unwrap();
    let target = dir.join("COMMIT_EDITMSG");
    fs::write(&target, "old").unwrap();
    assert!(call("message", &digest, &target));
    assert_eq!(fs::read_to_string(&target).unwrap(), format!("{message}\n"));
    assert!(!dir.join("DANGER").exists());
    #[cfg(unix)]
    {
        fs::remove_file(&target).unwrap();
        std::os::unix::fs::symlink(&outside, &target).unwrap();
        assert!(!call("message", &digest, &target));
        assert_eq!(fs::read_to_string(&outside).unwrap(), "keep");
    }
    fs::remove_dir_all(dir).unwrap();
}
