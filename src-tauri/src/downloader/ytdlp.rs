//! yt-dlp subprocess interaction utilities.

use std::process::Stdio;

use tokio::io::AsyncReadExt;
use tokio::process::Command;

/// Run yt-dlp command and capture stdout/stderr.
/// Ensures stdin is closed and output is captured concurrently.
pub async fn run_yt_dlp(cmd: &mut Command) -> Result<(String, String), std::io::Error> {
    // Ensure we capture output and close stdin
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // On Windows, prevent window creation
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn()?;

    let mut stdout = child.stdout.take().ok_or_else(|| std::io::Error::other("Could not capture stdout"))?;
    let mut stderr = child.stderr.take().ok_or_else(|| std::io::Error::other("Could not capture stderr"))?;

    let mut output = String::new();
    let mut errors = String::new();

    // Read stdout and stderr concurrently
    let (out_res, err_res) = tokio::join!(stdout.read_to_string(&mut output), stderr.read_to_string(&mut errors));

    out_res?;
    err_res?;

    let status = child.wait().await?;

    // yt-dlp can emit valid JSON while returning non-zero (warnings, partial failures).
    // Preserve the output so callers can still parse it, but surface the status via stderr.
    if !status.success() {
        let status_note = match status.code() {
            Some(code) => format!("yt-dlp exited with status code {code}"),
            None => "yt-dlp exited without status code (terminated by signal)".to_string(),
        };

        if errors.trim().is_empty() {
            errors.push_str(&status_note);
        } else {
            errors.push('\n');
            errors.push_str(&status_note);
        }
    }

    Ok((output, errors))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::process::Command;

    #[tokio::test]
    async fn returns_output_on_non_zero_exit() {
        // Simulate a command that prints output but exits with non-zero.
        let mut cmd = if cfg!(windows) {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("echo ok & echo warn 1>&2 & exit /B 3");
            c
        } else {
            let mut c = Command::new("sh");
            c.arg("-c").arg("echo ok && echo warn 1>&2 && exit 3");
            c
        };

        let (stdout, stderr) =
            run_yt_dlp(&mut cmd).await.expect("should not fail when command exits non-zero but produces output");

        assert!(stdout.contains("ok"), "stdout should include command output");
        assert!(stderr.contains("warn"), "stderr should include warnings");
        assert!(stderr.contains("status"), "stderr should capture exit status note");
    }
}
