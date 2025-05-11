use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::path;
use std::process::Command;
use std::process::Stdio;

use serde::Deserialize;
use serde::Serialize;
use tauri::async_runtime::spawn;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Window;

#[derive(Debug, Serialize, Deserialize)]
pub struct YtDlpVideo {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub duration: i32,
    pub thumbnails: Vec<Thumbnail>,
    pub formats: Vec<Format>,
    pub subtitles: Option<Subtitles>,
    pub original_url: String,
    pub extractor: String,
    pub extractor_key: String,
    pub playlist: Option<String>,
    pub playlist_index: Option<i32>,
    pub thumbnail: String,
    pub fulltitle: String,
    pub duration_string: String,
    pub requested_subtitles: Option<String>,
    pub format_id: String,
    pub protocol: String,
    pub quality: Option<i32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub dynamic_range: Option<String>,
    pub format_note: Option<String>,
    pub resolution: String,
    pub aspect_ratio: Option<f64>,
    pub format: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Thumbnail {
    pub url: String,
    pub id: String,
    pub preference: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub start_time: i32,
    pub end_time: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Format {
    pub format_id: String,
    pub format_note: Option<String>,
    pub ext: Option<String>,
    pub protocol: Option<String>,
    pub acodec: Option<String>,
    pub vcodec: Option<String>,
    pub url: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub fps: Option<f64>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<f64>,
    pub filesize_approx: Option<i64>,
    pub audio_ext: Option<String>,
    pub video_ext: Option<String>,
    pub vbr: Option<f64>,
    pub abr: Option<f64>,
    pub tbr: Option<f64>,
    pub format: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Fragment {
    pub url: Option<String>,
    pub duration: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Subtitles {
    pub rechat: Option<Vec<RechatSubtitle>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RechatSubtitle {
    pub url: Option<String>,
    pub ext: Option<String>,
}

async fn run_yt_dlp(cmd: &mut Command) -> Result<(String, String), std::io::Error> {
    let mut child = cmd.spawn()?;

    let stdout = child.stdout.take().ok_or_else(|| std::io::Error::other("Could not capture stdout"))?;
    let stderr = child.stderr.take().ok_or_else(|| std::io::Error::other("Could not capture stderr"))?;

    let mut out_reader = BufReader::new(stdout);
    let err_reader = BufReader::new(stderr);

    let mut output = String::new();
    out_reader.read_to_string(&mut output)?;

    let mut errors = String::new();
    for line in err_reader.lines() {
        errors.push_str(&line?);
        errors.push('\n');
    }

    child.wait()?;

    Ok((output, errors))
}

#[tauri::command]
pub async fn get_media_info(
    _app: AppHandle,
    window: Window,
    media_idx: i32,
    media_source_url: String,
) -> Result<(), String> {
    let mut cmd = Command::new("yt-dlp");
    cmd.arg(media_source_url)
        .arg("-j")
        .arg("--extractor-args")
        .arg("generic:impersonate")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let (output, errors) = run_yt_dlp(&mut cmd).await.map_err(|e| e.to_string())?;

    if !errors.is_empty() {
        println!("Errors: {errors}");
    }

    let video_info: YtDlpVideo = serde_json::from_str(&output).map_err(|e| e.to_string())?;

    window.emit("update-media-info", (media_idx, video_info.title, video_info.thumbnail)).map_err(|e| e.to_string())?;

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn download_media(
    _app: AppHandle,
    window: Window,
    media_idx: i32,
    media_source_url: String,
    output_location: String,
) {
    let window = window.clone();

    spawn(async move {
        // let ytdlp_command = app.shell().sidecar("yt-dlp").unwrap();
        // ytdlp_command.arg(media_source_url)
        //     .arg("--progress-template")
        //     .arg("download:remedia-%(progress.downloaded_bytes)s-%(progress.total_bytes)s-%(progress.eta)s")
        //     .arg("--newline")
        //     .stdout(Stdio::piped())
        //     .stderr(Stdio::piped());

        // let mut child = ytdlp_command.spawn().expect("Failed to spawn yt-dlp");

        let output_format = format!("{}{}{}", output_location, path::MAIN_SEPARATOR, "%(title)s.%(ext)s");

        // Build the yt-dlp command
        let mut cmd = Command::new("yt-dlp");
        cmd.arg(media_source_url)
                .arg("--progress-template")
                .arg("download:remedia-%(progress.downloaded_bytes)s-%(progress.total_bytes)s-%(progress.total_bytes_estimate)s-%(progress.eta)s")
                .arg("--newline")
                .arg("--continue")
                .arg("--output")
                .arg(output_format)
                .arg("--embed-thumbnail")
                // .arg("--embed-subs")
                .arg("--embed-metadata")
                .arg("--embed-chapters")
                .arg("--windows-filenames")
                // .arg("--sponsorblock-remove")
                // .arg("default")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

        let mut child = cmd.spawn().expect("Failed to spawn yt-dlp");

        let stdout = child.stdout.take().expect("Failed to open stdout");
        let stderr = child.stderr.take().expect("Failed to open stderr");

        let out_reader = BufReader::new(stdout);
        let err_reader = BufReader::new(stderr);

        out_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("{line}");

                // Check if the line starts with 'download:'
                if line.starts_with("remedia-") {
                    // Output format: remedia-7168-3098545-0
                    let ln_status = line.split('-').collect::<Vec<&str>>();
                    let downloaded_bytes = ln_status[1].parse::<f64>().unwrap_or(0.0);
                    let total_bytes_est = ln_status[2].parse::<f64>().unwrap_or(0.0);
                    let total_bytes = ln_status[3].parse::<f64>().unwrap_or(0.0);
                    // let eta = ln_status[4].parse::<f64>().unwrap_or(0.0);

                    let t_bytes = if total_bytes > 0.0 {
                        total_bytes
                    } else {
                        total_bytes_est
                    };

                    if t_bytes > 0.0 {
                        let percent = downloaded_bytes / t_bytes * 100.0;
                        // Emit event to frontend
                        window.emit("download-progress", (media_idx, percent)).unwrap();
                    }
                }
            }
        });

        // Handle child process errors
        err_reader.lines().for_each(|line| {
            if let Ok(line) = line {
                println!("Error: {line}");
            }
        });

        // Wait for the child process to exit
        let status = child.wait().expect("Failed to wait on yt-dlp");
        if status.success() {
            window.emit("download-complete", media_idx).unwrap();
        } else {
            window.emit("download-error", media_idx).unwrap();
        }
    });
}
