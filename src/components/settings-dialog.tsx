import { invoke } from "@tauri-apps/api/core"
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

export function SettingsDialog({
	open,
	onOpenChange,
	alwaysOnTop = false,
	onAlwaysOnTopChange
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	alwaysOnTop?: boolean;
	onAlwaysOnTopChange?: (checked: boolean) => void;
}) {
	const [isWayland, setIsWayland] = useState(false)

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

	const handleAlwaysOnTopChange = async (checked: boolean) => {
		if (onAlwaysOnTopChange) {
			onAlwaysOnTopChange(checked)
		}
		await invoke("set_always_on_top", { alwaysOnTop: checked })
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
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
