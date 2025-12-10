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

    child.wait().await?;

    Ok((output, errors))
}
