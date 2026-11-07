import { useRender } from "@base-ui/react/use-render";
import { cn } from "../../lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";
type Size = "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg";
export function Button({
	className,
	variant = "default",
	size = "default",
	render,
	ref,
	...props
}: useRender.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
	const variants: Record<Variant, string> = {
		default: "bg-accent text-accent-foreground hover:bg-accent/90",
		secondary: "bg-foreground/[0.06] text-foreground hover:bg-foreground/10",
		outline: "border border-separator bg-transparent text-foreground hover:bg-foreground/[0.06]",
		destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
		ghost: "bg-transparent text-foreground hover:bg-foreground/[0.06]",
		link: "bg-transparent text-accent underline-offset-4 hover:underline",
	};
	const sizes: Record<Size, string> = {
		sm: "h-6 gap-1 px-2 text-xs",
		default: "h-8 gap-1.5 px-3 text-base",
		lg: "h-10 gap-2 px-4 text-base",
		icon: "size-8 p-0 text-base",
		"icon-sm": "size-6 p-0 text-xs",
		"icon-lg": "size-10 p-0 text-lg",
	};
	return useRender({
		defaultTagName: "button",
		render,
		ref,
		props: {
			"data-slot": "button",
			"data-variant": variant,
			"data-size": size,
			className: cn(
				"inline-flex shrink-0 cursor-default items-center justify-center whitespace-nowrap rounded-control font-medium transition-[background-color,color,transform] duration-150 ease-out select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				sizes[size],
				variants[variant],
				className,
			),
			...props,
		},
	});
}
