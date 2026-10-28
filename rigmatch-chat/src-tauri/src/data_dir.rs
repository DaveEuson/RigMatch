// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
//! Where RigMatch Chat keeps what it saves.
//!
//! `RIGMATCH_CHAT_DATA_DIR` lets a test or a sweep run Chat against a throwaway
//! folder, so it cannot write into the real chat history. That only works if the
//! variable can never quietly stop applying: a value that is set but unusable is
//! an error here, not a reason to fall back to the real folder. Everything that
//! decides which folder is used lives in this file, apart from Tauri, so it can
//! be tested without a window.

use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};

/// The environment variable that moves everything Chat saves into one folder.
pub const ENV_VAR: &str = "RIGMATCH_CHAT_DATA_DIR";

/// Read the variable's value. `None` means it is not set, which is the ordinary
/// case and leaves Chat exactly where it always keeps its files.
///
/// A value that is set must name a full path to a folder. Anything else is
/// refused with a message that says what is wrong, because the caller is a test
/// that believes it is isolated and would otherwise not find out it is not:
/// empty, not text, not a full path (a relative path would land wherever Chat
/// happened to start), or one with `..` in it (which can climb back out of the
/// throwaway folder into the real one).
pub fn parse_override(raw: Option<&OsStr>) -> Result<Option<PathBuf>, String> {
    let Some(raw) = raw else { return Ok(None) };
    let Some(text) = raw.to_str() else {
        return Err(format!("{ENV_VAR} is not valid text"));
    };
    let text = text.trim();
    if text.is_empty() {
        return Err(format!("{ENV_VAR} is set but empty"));
    }
    let path = Path::new(text);
    if !path.is_absolute() {
        return Err(format!(
            "{ENV_VAR} must be a full path (like C:\\Temp\\chat-test or /tmp/chat-test), but is \"{text}\""
        ));
    }
    if path.components().any(|part| part == Component::ParentDir) {
        return Err(format!("{ENV_VAR} must not contain \"..\", but is \"{text}\""));
    }
    Ok(Some(path.to_path_buf()))
}

/// Read the variable and make the folder, so a value that cannot be used is
/// found at startup rather than on the first save.
pub fn prepare(raw: Option<&OsStr>) -> Result<Option<PathBuf>, String> {
    let Some(dir) = parse_override(raw)? else { return Ok(None) };
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("{ENV_VAR} is \"{}\", which cannot be made into a folder: {err}", dir.display()))?;
    Ok(Some(dir))
}

/// The folder the stores live in: the one the variable chose, or else whatever
/// `default_dir` says. Both are created if missing.
///
/// `default_dir` is only asked when there is no override, so a run with one
/// never looks up, let alone makes, the real app data folder.
pub fn store_dir(
    chosen: Option<&Path>,
    default_dir: impl FnOnce() -> Result<PathBuf, String>,
) -> Result<PathBuf, String> {
    let dir = match chosen {
        Some(dir) => dir.to_path_buf(),
        None => default_dir()?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("rigmatch-chat-datadir-{name}-{}", std::process::id()))
    }

    fn text(path: &Path) -> OsString {
        path.as_os_str().to_os_string()
    }

    #[test]
    fn a_variable_that_is_not_set_changes_nothing() {
        assert_eq!(parse_override(None), Ok(None));
        assert_eq!(prepare(None), Ok(None));
    }

    #[test]
    fn a_full_path_is_taken_as_it_is() {
        let dir = scratch("full");
        assert_eq!(parse_override(Some(&text(&dir))), Ok(Some(dir)));
    }

    #[test]
    fn spaces_around_the_value_are_not_part_of_the_path() {
        let dir = scratch("padded");
        let padded = OsString::from(format!("  {}\t", dir.display()));
        assert_eq!(parse_override(Some(&padded)), Ok(Some(dir)));
    }

    #[test]
    fn empty_is_refused_not_read_as_unset() {
        for value in ["", "   ", "\t\n"] {
            let err = parse_override(Some(OsStr::new(value))).unwrap_err();
            assert!(err.contains(ENV_VAR) && err.contains("empty"), "{value:?} gave {err}");
        }
    }

    #[test]
    fn a_relative_path_is_refused_and_named() {
        for value in ["chat-data", "./chat-data", "sub/dir", "."] {
            let err = parse_override(Some(OsStr::new(value))).unwrap_err();
            assert!(err.contains("full path") && err.contains(value), "{value:?} gave {err}");
        }
    }

    #[test]
    fn a_path_that_can_climb_out_is_refused() {
        let climbing = scratch("climb").join("..").join("elsewhere");
        let err = parse_override(Some(&text(&climbing))).unwrap_err();
        assert!(err.contains(".."), "{err}");
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths_that_are_not_full_are_refused() {
        // Both are "absolute" to a glance and neither names a place on its own:
        // the first is relative to the current folder on drive C, the second to
        // whatever drive Chat started on.
        for value in ["C:chat-data", "\\chat-data"] {
            let err = parse_override(Some(OsStr::new(value))).unwrap_err();
            assert!(err.contains("full path"), "{value:?} gave {err}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_value_that_is_not_text_is_refused() {
        use std::os::unix::ffi::OsStrExt;
        let err = parse_override(Some(OsStr::from_bytes(b"/tmp/\xff"))).unwrap_err();
        assert!(err.contains("not valid text"), "{err}");
    }

    #[cfg(windows)]
    #[test]
    fn a_value_that_is_not_text_is_refused() {
        use std::os::windows::ffi::OsStringExt;
        let broken = OsString::from_wide(&[0x43, 0x3a, 0x5c, 0xd800]);
        let err = parse_override(Some(&broken)).unwrap_err();
        assert!(err.contains("not valid text"), "{err}");
    }

    #[test]
    fn preparing_makes_the_missing_folders() {
        let dir = scratch("made");
        let _ = std::fs::remove_dir_all(&dir);
        let nested = dir.join("one").join("two");
        assert_eq!(prepare(Some(&text(&nested))), Ok(Some(nested.clone())));
        assert!(nested.is_dir());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_path_that_is_already_a_file_is_refused_rather_than_replaced() {
        let dir = scratch("file");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("not-a-folder");
        std::fs::write(&file, b"keep me").unwrap();

        let err = prepare(Some(&text(&file))).unwrap_err();
        assert!(err.contains(ENV_VAR) && err.contains("cannot be made into a folder"), "{err}");
        assert_eq!(std::fs::read(&file).unwrap(), b"keep me");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_override_never_consults_the_default_folder() {
        let dir = scratch("override");
        let _ = std::fs::remove_dir_all(&dir);
        let picked = store_dir(Some(&dir), || panic!("the default folder was looked up")).unwrap();
        assert_eq!(picked, dir);
        assert!(dir.is_dir());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn without_an_override_the_default_folder_is_used_and_made() {
        let dir = scratch("default");
        let _ = std::fs::remove_dir_all(&dir);
        let picked = store_dir(None, || Ok(dir.clone())).unwrap();
        assert_eq!(picked, dir);
        assert!(dir.is_dir());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_default_folder_that_cannot_be_found_is_reported() {
        let err = store_dir(None, || Err("no app data folder".to_string())).unwrap_err();
        assert_eq!(err, "no app data folder");
    }
}
