//! Hybrid in-memory Git read engine powered by `gitoxide` (`gix`).
//! Strictly local and read-only; returns `Option` so `git.rs` can fall back to Git CLI transparently.
use crate::git::{Commit, GitError, GitRef, HistoryPage, Repository, Result, Snapshot};
use gix::bstr::ByteSlice;
use std::path::Path;

const PAGE_SIZE: usize = 200;

fn open_gix(path: &Path) -> Option<gix::Repository> {
    let repo = gix::open_opts(path, gix::open::Options::isolated()).ok()?;
    if repo.is_bare() || repo.is_shallow() {
        return None;
    }
    Some(repo)
}

fn format_gix_time(time: gix::date::Time) -> String {
    let local_secs = time.seconds.saturating_add(time.offset as i64);
    let secs_of_day = local_secs.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    let days = local_secs.div_euclid(86_400) + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let doe = days - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    if time.offset == 0 {
        format!("{year:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}Z")
    } else {
        let sign = if time.offset >= 0 { '+' } else { '-' };
        let abs = time.offset.abs();
        let off_h = abs / 3_600;
        let off_m = (abs % 3_600) / 60;
        format!(
            "{year:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}{sign}{off_h:02}:{off_m:02}"
        )
    }
}

fn head_details(gix_repo: &gix::Repository) -> (Option<String>, Option<String>) {
    let head_oid = gix_repo
        .head_id()
        .ok()
        .map(|id| id.detach().to_hex().to_string());
    let branch = gix_repo.head().ok().and_then(|head| {
        head.referent_name()
            .map(|name| String::from_utf8_lossy(name.shorten().as_ref()).into_owned())
    });
    (head_oid, branch)
}

fn collect_refs(
    gix_repo: &gix::Repository,
) -> Option<Vec<(String, String, Option<gix::ObjectId>)>> {
    let platform = gix_repo.references().ok()?;
    let iter = platform.all().ok()?;
    let mut entries = Vec::new();
    for item in iter {
        let reference = item.ok()?;
        let full_name = reference.name().as_bstr().to_str_lossy().into_owned();
        let raw_hex = reference
            .target()
            .try_id()
            .map(|id| id.to_hex().to_string())
            .unwrap_or_default();
        let peeled_id = reference.into_fully_peeled_id().ok().map(|id| id.detach());
        let effective_hex = peeled_id
            .map(|id| id.to_hex().to_string())
            .unwrap_or(raw_hex);
        entries.push((full_name, effective_hex, peeled_id));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    Some(entries)
}

pub(crate) fn generation(path: &Path) -> Option<String> {
    let gix_repo = open_gix(path)?;
    generation_from_open(&gix_repo)
}

fn generation_from_open(gix_repo: &gix::Repository) -> Option<String> {
    let refs = collect_refs(gix_repo)?;
    let (head_oid, branch) = head_details(gix_repo);
    let mut hash = 14695981039346656037u64;
    for (name, oid_hex, _) in &refs {
        for byte in oid_hex
            .bytes()
            .chain(*b" ")
            .chain(name.bytes())
            .chain(*b"\n")
        {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(1099511628211);
        }
    }
    for byte in head_oid.as_deref().unwrap_or("").bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    for byte in branch.as_deref().unwrap_or("").bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    Some(format!("{hash:016x}"))
}

fn validate_scope(scope: &str) -> Result<()> {
    if scope != "all"
        && scope != "HEAD"
        && !(scope.len() <= 4096
            && (scope.starts_with("refs/heads/") || scope.starts_with("refs/remotes/")))
    {
        return Err(GitError::new(
            "INVALID_SCOPE",
            "Selecciona una rama local o remota válida.",
        ));
    }
    Ok(())
}

pub(crate) fn snapshot_scoped(repo: &Repository, scope: Option<&str>) -> Option<Result<Snapshot>> {
    let gix_repo = open_gix(&repo.path)?;
    let scope_str = scope.unwrap_or("all");
    if let Err(err) = validate_scope(scope_str) {
        return Some(Err(err));
    }
    let before = generation_from_open(&gix_repo)?;
    let (head, branch) = head_details(&gix_repo);
    let shallow = gix_repo.is_shallow();
    let raw_refs = collect_refs(&gix_repo)?;
    let refs = raw_refs
        .into_iter()
        .map(|(name, hash, _)| {
            let kind = if name.starts_with("refs/heads/") {
                "branch"
            } else if name.starts_with("refs/remotes/") {
                "remote"
            } else if name.starts_with("refs/tags/") {
                "tag"
            } else {
                "other"
            };
            GitRef {
                name,
                hash,
                kind: kind.to_string(),
            }
        })
        .collect();

    let page = match history_from_open(&gix_repo, 0, &before, scope)? {
        Ok(page) => page,
        Err(err) => return Some(Err(err)),
    };

    Some(Ok(Snapshot {
        id: repo.id.clone(),
        path: repo.path.to_string_lossy().into_owned(),
        name: repo
            .path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        trusted: false,
        head,
        branch,
        shallow,
        refs,
        page,
    }))
}

pub(crate) fn history_scoped(
    repo: &Repository,
    offset: usize,
    expected: &str,
    scope: Option<&str>,
) -> Option<Result<HistoryPage>> {
    let gix_repo = open_gix(&repo.path)?;
    history_from_open(&gix_repo, offset, expected, scope)
}

fn history_from_open(
    gix_repo: &gix::Repository,
    offset: usize,
    expected: &str,
    scope: Option<&str>,
) -> Option<Result<HistoryPage>> {
    let scope = scope.unwrap_or("all");
    if let Err(err) = validate_scope(scope) {
        return Some(Err(err));
    }
    let before = generation_from_open(gix_repo)?;
    let scoped_generation = if scope == "all" {
        before.clone()
    } else {
        format!("{before}|{scope}")
    };
    if expected != scoped_generation && !(offset == 0 && expected == before) {
        return Some(Err(GitError::new(
            "STALE_HISTORY",
            "El historial cambió fuera de RavenGit. Actualiza antes de cargar más.",
        )));
    }

    let head_id = gix_repo.head_id().ok().map(|id| id.detach());
    let tips: Vec<gix::ObjectId> = if scope == "all" {
        let refs = collect_refs(gix_repo)?;
        let mut collected: Vec<gix::ObjectId> = refs
            .into_iter()
            .filter_map(|(_, _, peeled)| peeled)
            .filter(|id| gix_repo.find_commit(*id).is_ok())
            .collect();
        if let Some(hid) = head_id
            && !collected.contains(&hid)
            && gix_repo.find_commit(hid).is_ok()
        {
            collected.push(hid);
        }
        collected
    } else if scope == "HEAD" {
        head_id
            .into_iter()
            .filter(|id| gix_repo.find_commit(*id).is_ok())
            .collect()
    } else {
        let Ok(Some(reference)) = gix_repo.try_find_reference(scope) else {
            return Some(Err(GitError::new(
                "INVALID_SCOPE",
                "La rama seleccionada ya no existe. Selecciona otra referencia.",
            )));
        };
        let Ok(peeled) = reference.into_fully_peeled_id() else {
            return Some(Err(GitError::new(
                "INVALID_SCOPE",
                "La rama seleccionada no apunta a un commit válido.",
            )));
        };
        let oid = peeled.detach();
        if gix_repo.find_commit(oid).is_err() {
            return Some(Err(GitError::new(
                "INVALID_SCOPE",
                "La referencia seleccionada no apunta a un commit.",
            )));
        }
        vec![oid]
    };

    let mut unique_tips = Vec::with_capacity(tips.len());
    let mut seen_tips = std::collections::HashSet::with_capacity(tips.len());
    for tip in tips {
        if seen_tips.insert(tip) {
            unique_tips.push(tip);
        }
    }

    let mut commits = Vec::new();
    if !unique_tips.is_empty() {
        let mut builder = gix::traverse::commit::topo::Builder::from_iters(
            &gix_repo.objects,
            unique_tips,
            None::<Vec<gix::ObjectId>>,
        )
        .sorting(gix::traverse::commit::topo::Sorting::DateOrder);
        if let Ok(Some(commit_graph)) = gix_repo.commit_graph_if_enabled() {
            builder = builder.with_commit_graph(Some(commit_graph));
        }
        let iter = builder.build().ok()?;
        for item in iter.skip(offset).take(PAGE_SIZE + 1) {
            let info = item.ok()?;
            let commit_obj = gix_repo.find_commit(info.id).ok()?;
            let author_sig = commit_obj.author().ok()?;
            let author = String::from_utf8_lossy(author_sig.name).into_owned();
            let date = format_gix_time(author_sig.time().ok()?);
            let subject = commit_obj
                .message()
                .ok()
                .map(|msg| {
                    String::from_utf8_lossy(msg.title)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim_end_matches('\r')
                        .to_string()
                })
                .unwrap_or_default();
            let parents = commit_obj
                .parent_ids()
                .map(|pid| pid.to_hex().to_string())
                .collect();
            commits.push(Commit {
                hash: info.id.to_hex().to_string(),
                parents,
                author,
                date,
                subject,
            });
        }
    }

    if generation_from_open(gix_repo)? != before {
        return Some(Err(GitError::new(
            "STALE_HISTORY",
            "Las referencias cambiaron durante la lectura. Actualiza el historial.",
        )));
    }

    let next_offset = if commits.len() > PAGE_SIZE {
        commits.truncate(PAGE_SIZE);
        Some(offset + PAGE_SIZE)
    } else {
        None
    };

    Some(Ok(HistoryPage {
        commits,
        next_offset,
        generation: scoped_generation,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::process;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
        time::Duration,
    };

    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ravengit-gix-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn git(&self, args: &[&str]) -> String {
            let mut cmd = process::git(&self.0);
            cmd.args(args);
            let out = process::execute(cmd, None, Duration::from_secs(15)).unwrap();
            assert!(
                out.success,
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.bytes)
            );
            String::from_utf8_lossy(&out.bytes).trim().to_string()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn gix_snapshot_and_history_match_cli_on_branches_merges_and_annotated_tags() {
        let f = Fixture::new();
        f.git(&["init", "-b", "main"]);
        f.git(&["config", "user.name", "Alice"]);
        f.git(&["config", "user.email", "alice@example.com"]);

        fs::write(f.0.join("a.txt"), "1\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "root commit"]);
        let h1 = f.git(&["rev-parse", "HEAD"]);

        f.git(&["checkout", "-b", "feat/ui"]);
        fs::write(f.0.join("b.txt"), "2\n").unwrap();
        f.git(&["add", "--all"]);
        f.git(&["commit", "-m", "feat commit"]);
        let h2 = f.git(&["rev-parse", "HEAD"]);

        f.git(&["checkout", "main"]);
        f.git(&["merge", "--no-ff", "-m", "merge feat", "feat/ui"]);
        let h3 = f.git(&["rev-parse", "HEAD"]);

        f.git(&["tag", "v0.1"]);
        f.git(&["tag", "-a", "v1.0", "-m", "Release 1.0", &h1]);

        let repo = Repository {
            id: "g1".into(),
            path: f.0.clone(),
        };

        let snap = snapshot_scoped(&repo, None).unwrap().unwrap();
        assert_eq!(snap.branch.as_deref(), Some("main"));
        assert_eq!(snap.head.as_deref(), Some(h3.as_str()));
        assert!(!snap.shallow);
        assert_eq!(snap.page.commits.len(), 3);

        let tag_v1 = snap
            .refs
            .iter()
            .find(|r| r.name == "refs/tags/v1.0")
            .unwrap();
        assert_eq!(tag_v1.kind, "tag");
        assert_eq!(tag_v1.hash, h1);

        let feat_page = history_scoped(&repo, 0, &snap.page.generation, Some("refs/heads/feat/ui"))
            .unwrap()
            .unwrap();
        assert_eq!(feat_page.commits.len(), 2);
        assert!(feat_page.commits.iter().any(|c| c.hash == h2));

        assert_eq!(
            history_scoped(&repo, 0, "stale-gen", None)
                .unwrap()
                .unwrap_err()
                .code,
            "STALE_HISTORY"
        );
        assert_eq!(
            snapshot_scoped(&repo, Some("refs/heads/no-existe"))
                .unwrap()
                .unwrap_err()
                .code,
            "INVALID_SCOPE"
        );
    }
}
