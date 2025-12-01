use once_cell::sync::Lazy;
/// Download Queue Manager
///
/// Manages concurrent downloads with a queue system.
/// Limits the number of simultaneous downloads and queues additional requests.
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

/// Download status for queue management
#[derive(Debug, Clone, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

/// Download item in the queue
#[derive(Debug, Clone)]
pub struct QueuedDownload {
    pub media_idx: i32,
    pub url: String,
    pub output_location: String,
    pub settings: String,          // JSON serialized settings
    pub subfolder: Option<String>, // Playlist name or channel name for folder organization
    pub status: DownloadStatus,
}

/// Download Queue Manager
pub struct DownloadQueue {
    /// Maximum number of concurrent downloads
    max_concurrent: usize,

    /// Queue of pending downloads
    queue: VecDeque<QueuedDownload>,

    /// Set of queued media indices for O(1) duplicate checking
    queued_set: HashSet<i32>,

    /// Currently active downloads
    active: HashMap<i32, QueuedDownload>,
}

impl DownloadQueue {
    /// Create a new download queue with max concurrency
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            max_concurrent: max_concurrent.max(1), // At least 1
            queue: VecDeque::new(),
            queued_set: HashSet::new(),
            active: HashMap::new(),
        }
    }

    /// Add a download to the queue (O(1) duplicate checking)
    pub fn enqueue(&mut self, download: QueuedDownload) -> Result<(), String> {
        let idx = download.media_idx;

        // O(1) check if already queued or active
        if self.queued_set.contains(&idx) || self.active.contains_key(&idx) {
            // Idempotent: already queued or downloading
            return Ok(());
        }

        self.queued_set.insert(idx);
        self.queue.push_back(download);
        Ok(())
    }

    /// Get next download to start (if slots available)
    pub fn next_to_start(&mut self) -> Option<QueuedDownload> {
        if self.active.len() >= self.max_concurrent {
            return None;
        }

        if let Some(mut download) = self.queue.pop_front() {
            self.queued_set.remove(&download.media_idx);
            download.status = DownloadStatus::Downloading;
            self.active.insert(download.media_idx, download.clone());
            Some(download)
        } else {
            None
        }
    }

    /// Mark download as completed
    pub fn complete(&mut self, media_idx: i32) {
        if let Some(mut download) = self.active.remove(&media_idx) {
            download.status = DownloadStatus::Completed;
        }
    }

    /// Mark download as failed
    pub fn fail(&mut self, media_idx: i32) {
        if let Some(mut download) = self.active.remove(&media_idx) {
            download.status = DownloadStatus::Failed;
        }
    }

    /// Cancel a specific download
    pub fn cancel(&mut self, media_idx: i32) -> bool {
        // Remove from queued_set and queue if queued
        if self.queued_set.remove(&media_idx) {
            if let Some(pos) = self.queue.iter().position(|d| d.media_idx == media_idx) {
                self.queue.remove(pos);
            }
            return true;
        }

        // Remove from active if downloading
        if let Some(mut download) = self.active.remove(&media_idx) {
            download.status = DownloadStatus::Cancelled;
            return true;
        }

        false
    }

    /// Cancel all downloads (both queued and active)
    pub fn cancel_all(&mut self) -> Vec<i32> {
        let mut cancelled = Vec::new();

        // Cancel all queued
        while let Some(download) = self.queue.pop_front() {
            cancelled.push(download.media_idx);
        }
        self.queued_set.clear();

        // Cancel all active
        for (idx, _) in self.active.drain() {
            cancelled.push(idx);
        }

        cancelled
    }

    /// Get current queue size
    #[allow(dead_code)]
    pub fn queue_size(&self) -> usize {
        self.queue.len()
    }

    /// Get number of active downloads
    #[allow(dead_code)]
    pub fn active_count(&self) -> usize {
        self.active.len()
    }

    /// Check if a download is active
    #[allow(dead_code)]
    pub fn is_active(&self, media_idx: i32) -> bool {
        self.active.contains_key(&media_idx)
    }

    /// Update max concurrent downloads
    pub fn set_max_concurrent(&mut self, max: usize) {
        self.max_concurrent = max.max(1);
    }

    /// Get queue status summary
    pub fn status(&self) -> QueueStatus {
        QueueStatus {
            queued: self.queue.len(),
            active: self.active.len(),
            max_concurrent: self.max_concurrent,
        }
    }
}

/// Queue status for reporting
#[derive(Debug, Clone)]
pub struct QueueStatus {
    pub queued: usize,
    pub active: usize,
    pub max_concurrent: usize,
}

/// Global download queue instance
static DOWNLOAD_QUEUE: Lazy<Arc<Mutex<DownloadQueue>>> = Lazy::new(|| Arc::new(Mutex::new(DownloadQueue::new(3))));

/// Get global download queue
pub fn get_queue() -> Arc<Mutex<DownloadQueue>> {
    DOWNLOAD_QUEUE.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_download(idx: i32) -> QueuedDownload {
        QueuedDownload {
            media_idx: idx,
            url: format!("https://example.com/{}", idx),
            output_location: "/tmp".to_string(),
            settings: "{}".to_string(),
            subfolder: None,
            status: DownloadStatus::Queued,
        }
    }

    #[test]
    fn test_enqueue_and_dequeue() {
        let mut queue = DownloadQueue::new(2);

        let download1 = create_test_download(1);
        let download2 = create_test_download(2);

        assert!(queue.enqueue(download1.clone()).is_ok());
        assert!(queue.enqueue(download2.clone()).is_ok());
        assert_eq!(queue.queue_size(), 2);

        let next = queue.next_to_start();
        assert!(next.is_some());
        assert_eq!(next.unwrap().media_idx, 1);
        assert_eq!(queue.active_count(), 1);
        assert_eq!(queue.queue_size(), 1);
    }

    #[test]
    fn test_max_concurrent_limit() {
        let mut queue = DownloadQueue::new(2);

        // Add 3 downloads
        queue.enqueue(create_test_download(1)).unwrap();
        queue.enqueue(create_test_download(2)).unwrap();
        queue.enqueue(create_test_download(3)).unwrap();

        // Start first two
        assert!(queue.next_to_start().is_some());
        assert!(queue.next_to_start().is_some());
        assert_eq!(queue.active_count(), 2);

        // Third should not start (max concurrent reached)
        assert!(queue.next_to_start().is_none());
        assert_eq!(queue.queue_size(), 1);
    }

    #[test]
    fn test_complete_and_start_next() {
        let mut queue = DownloadQueue::new(2);

        queue.enqueue(create_test_download(1)).unwrap();
        queue.enqueue(create_test_download(2)).unwrap();
        queue.enqueue(create_test_download(3)).unwrap();

        // Start first two
        queue.next_to_start();
        queue.next_to_start();

        // Complete first download
        queue.complete(1);
        assert_eq!(queue.active_count(), 1);

        // Now third can start
        let next = queue.next_to_start();
        assert!(next.is_some());
        assert_eq!(next.unwrap().media_idx, 3);
        assert_eq!(queue.active_count(), 2);
    }

    #[test]
    fn test_cancel_queued() {
        let mut queue = DownloadQueue::new(1);

        queue.enqueue(create_test_download(1)).unwrap();
        queue.enqueue(create_test_download(2)).unwrap();

        assert!(queue.cancel(2));
        assert_eq!(queue.queue_size(), 1);
    }

    #[test]
    fn test_cancel_active() {
        let mut queue = DownloadQueue::new(2);

        queue.enqueue(create_test_download(1)).unwrap();
        queue.next_to_start();

        assert!(queue.cancel(1));
        assert_eq!(queue.active_count(), 0);
    }

    #[test]
    fn test_cancel_all() {
        let mut queue = DownloadQueue::new(2);

        queue.enqueue(create_test_download(1)).unwrap();
        queue.enqueue(create_test_download(2)).unwrap();
        queue.enqueue(create_test_download(3)).unwrap();
        queue.next_to_start();
        queue.next_to_start();

        let cancelled = queue.cancel_all();
        assert_eq!(cancelled.len(), 3);
        assert_eq!(queue.queue_size(), 0);
        assert_eq!(queue.active_count(), 0);
    }

    #[test]
    fn test_duplicate_prevention() {
        let mut queue = DownloadQueue::new(2);

        let download = create_test_download(1);
        assert!(queue.enqueue(download.clone()).is_ok());
        // Idempotent: second enqueue for same media idx is a no-op
        assert!(queue.enqueue(download).is_ok());
    }

    #[test]
    fn test_status() {
        let mut queue = DownloadQueue::new(2);

        queue.enqueue(create_test_download(1)).unwrap();
        queue.enqueue(create_test_download(2)).unwrap();
        queue.enqueue(create_test_download(3)).unwrap();
        queue.next_to_start();

        let status = queue.status();
        assert_eq!(status.queued, 2);
        assert_eq!(status.active, 1);
        assert_eq!(status.max_concurrent, 2);
    }

    #[test]
    fn test_concurrent_access() {
        use std::sync::Barrier;

        let queue = Arc::new(Mutex::new(DownloadQueue::new(2)));
        let queue_clone = queue.clone();
        let barrier = Arc::new(Barrier::new(2));
        let barrier_clone = barrier.clone();

        // Spawn a thread that adds downloads
        let t1 = std::thread::spawn(move || {
            let mut q = queue_clone.lock().unwrap();
            q.enqueue(create_test_download(1)).unwrap();
            q.enqueue(create_test_download(2)).unwrap();
            barrier_clone.wait();
        });

        // Spawn a thread that processes downloads
        let queue_clone2 = queue.clone();
        let t2 = std::thread::spawn(move || {
            // Wait for enqueue
            barrier.wait();
            let mut q = queue_clone2.lock().unwrap();
            let next = q.next_to_start();
            assert!(next.is_some());
        });

        t1.join().unwrap();
        t2.join().unwrap();

        let q = queue.lock().unwrap();
        // t2 called next_to_start once, so 1 active.
        // Total 2 enqueued.
        assert_eq!(q.active_count(), 1);
        assert_eq!(q.queue_size(), 1);
    }
}
