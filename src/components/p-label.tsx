import type * as React from "react"
import { cn } from "@/lib/utils"

function PLabel({ className, children, ...props }: React.ComponentProps<"p">) {
	return (
		<p className={cn("py-3 text-sm font-medium leading-none", className)} {...props}>
			{children}
		</p>
	)
}

export { PLabel }
