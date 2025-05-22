import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"

import { useAtom } from 'jotai'
import { alwaysOnTopAtom, downloadLocationAtom } from "@/state/settings-atoms"

export function SettingsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
  const [alwaysOnTop, setAlwaysOnTop] = useAtom(alwaysOnTopAtom)
  const [isWayland, setIsWayland] = useState(false)
	const [outputLocation, setOutputLocation] = useAtom(downloadLocationAtom)

	useEffect(() => {
		// Check if we're running on Wayland using the Rust backend
		invoke("is_wayland")
			.then((value: unknown) => {
				setIsWayland(Boolean(value))
			})
			.catch(err => {
				console.error("Failed to check Wayland status:", err)
			})
	}, [])

	const handleAlwaysOnTopChange = async (checked: boolean | unknown) => {
		const boolValue = Boolean(checked)
		setAlwaysOnTop(boolValue)
		await invoke("set_always_on_top", { alwaysOnTop: boolValue })
	}

	const chooseOutputLocation = async () => {
		const directory = await openDialog({
			defaultPath: outputLocation,
			directory: true,
			multiple: false,
			title: "Choose location to save downloads"
		})
		if (directory && typeof directory === 'string') {
			setOutputLocation(directory)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[525px]">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Make changes to your profile here. Click save when you're done.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					{isWayland ? (
						<Alert variant="destructive" className="text-left">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>"Stay on top" is not supported on Wayland yet.</AlertTitle>
							<AlertDescription>Try X11 or watch for Tauri updates.</AlertDescription>
						</Alert>
					) : (
						<div className="flex items-center gap-x-2">
							<Checkbox
								checked={alwaysOnTop}
								onCheckedChange={handleAlwaysOnTopChange}
								id="always-on-top-checkbox"
							/>
							<label htmlFor="always-on-top-checkbox">Stay on top</label>
						</div>
					)}

					<div className="grid grid-cols-4 items-center gap-4">
  					<Label htmlFor="download-location" className="text-right">
  						Download location
  					</Label>

  					<Input
  						type="text"
  						id="download-location"
  						className="text-sm col-span-2"
  						placeholder="Download location..."
  						value={outputLocation}
  						onChange={e => setOutputLocation(e.target.value)}
  					/>

            <Button type="button" className="min-w-[8rem]" onClick={chooseOutputLocation}>
							Browse...
						</Button>
					</div>

					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="name" className="text-right">
							Name
						</Label>
						<Input id="name" value="Pedro Duarte" className="col-span-3" />
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="username" className="text-right">
							Username
						</Label>
						<Input id="username" value="@peduarte" className="col-span-3" />
					</div>
				</div>

				<DialogFooter>
					<Button type="submit" onClick={() => onOpenChange(false)}>
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
