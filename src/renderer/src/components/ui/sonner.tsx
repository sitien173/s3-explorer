import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
	return (
		<Sonner
			theme="system"
			toastOptions={{
				classNames: {
					toast: "!shadow-overlay",
					description: "!text-foreground-secondary",
					actionButton: "!bg-accent !text-accent-foreground",
					cancelButton: "!bg-foreground/[0.06] !text-foreground-secondary",
				},
			}}
			style={
				{
					"--normal-bg": "var(--color-elevated)",
					"--normal-text": "var(--color-foreground)",
					"--normal-border": "var(--color-separator)",
					"--border-radius": "var(--radius-overlay)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}
