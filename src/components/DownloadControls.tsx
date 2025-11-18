/**
 * DownloadControls Component
 *
 * Displays global progress bar and control buttons for downloads.
 */

import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

interface DownloadControlsProps {
	globalProgress: number;
	globalDownloading: boolean;
	onDownload: () => void;
	onCancel: () => void;
	onPreview: () => void;
	onSettings: () => void;
	onQuit: () => void;
}

/**
 * Download Controls Component
 */
export function DownloadControls({
	globalProgress,
	globalDownloading,
	onDownload,
	onCancel,
	onPreview,
	onSettings,
	onQuit
}: DownloadControlsProps) {
	return (
		<section className="flex-none flex flex-col gap-y-4">
			<div className="my-3">
				<Progress
					data-testid="global-progress"
					value={globalProgress}
					max={100}
					className="w-full"
				/>
			</div>

			<div className="flex justify-center gap-x-4 mb-3">
				<Button
					type="button"
					className="min-w-32"
					disabled={globalDownloading}
					onClick={onDownload}
					aria-label="Start download"
				>
					Download
				</Button>

				{globalDownloading && (
					<Button
						type="button"
						className="min-w-32"
						disabled={!globalDownloading}
						onClick={onCancel}
						aria-label="Cancel all downloads"
					>
						Cancel
					</Button>
				)}

				<Button
					type="button"
					className="min-w-32"
					onClick={onPreview}
					aria-label="Preview selected media"
				>
					Preview
				</Button>

				<Button
					type="button"
					className="min-w-32"
					onClick={onSettings}
					aria-label="Open settings"
				>
					Settings
				</Button>

				<Button
					type="button"
					className="min-w-32"
					onClick={onQuit}
					aria-label="Quit application"
				>
					Quit
				</Button>
			</div>
		</section>
	);
}
