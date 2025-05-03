import { cn } from "@/lib/utils";
import type * as React from "react";

function PLabel({
	className,
	children,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("py-3 text-sm font-medium leading-none", className)}>
			{children}
		</p>
	);
}

export { PLabel };
