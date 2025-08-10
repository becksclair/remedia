// src/App.tsx or a dedicated TitleBar.tsx component
import { Window } from "@tauri-apps/api/window"

function CustomTitleBar() {
	const handleMinimize = () => Window.getCurrent().minimize()
	const handleToggleMaximize = () => Window.getCurrent().toggleMaximize()
	const handleClose = () => Window.getCurrent().close()

	return (
		<div
			data-tauri-drag-region
			className="custom-titlebar h-8 bg-primary text-white flex justify-between items-center px-2 py-2">
			<div className="title text-white font-bold">ReMedia</div>
			<div className="window-controls">
				<button type="button" className="mr-2 border-white border-1 rounded-md p-1" onClick={handleMinimize}>
					_
				</button>
				<button
					type="button"
					className="mr-2 border-white border-1 rounded-md p-1"
					onClick={handleToggleMaximize}>
					[]
				</button>
				<button type="button" className="mr-2 border-white border-1 rounded-md p-1" onClick={handleClose}>
					X
				</button>
			</div>
		</div>
	)
}

export { CustomTitleBar }
