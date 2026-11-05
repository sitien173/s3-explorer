import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
	return (
		<Sonner
			theme="light"
			className="toaster group"
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-(--elevation-md)",
					description: "group-[.toast]:text-muted-foreground",
					actionButton:
						"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
				},
			}}
			style={
				{
					"--normal-bg": "var(--surface-neutral-01)",
					"--normal-text": "var(--text-default)",
					"--normal-border": "var(--border-subtle)",
					"--border-radius": "var(--radius-modal)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}
