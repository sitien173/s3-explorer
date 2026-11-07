import type * as React from "react";
import { cn } from "../../lib/utils";
export function Field({ className, ...props }: React.ComponentProps<"div">) {
	return <div role="group" className={cn("flex flex-col gap-1", className)} {...props} />;
}
export const FieldSet = (props: React.ComponentProps<"fieldset">) => <fieldset {...props} />;
export const FieldLegend = (props: React.ComponentProps<"legend">) => (
	<legend className="text-sm font-medium text-foreground-secondary" {...props} />
);
export const FieldGroup = (props: React.ComponentProps<"div">) => <div {...props} />;
export const FieldLabel = (props: React.ComponentProps<"label">) => (
	<label className="text-sm font-medium text-foreground-secondary" {...props} />
);
export const FieldTitle = FieldLabel;
export const FieldContent = (props: React.ComponentProps<"div">) => <div {...props} />;
export const FieldDescription = (props: React.ComponentProps<"p">) => (
	<p className="text-sm text-foreground-tertiary" {...props} />
);
export const FieldError = ({
	error,
	children,
	...props
}: React.ComponentProps<"div"> & { error?: { message?: string } }) => {
	const content = children ?? error?.message;
	if (!content) {
		return null;
	}
	return (
		<div className="text-sm text-destructive" role="alert" {...props}>
			{content}
		</div>
	);
};
export const FieldSeparator = (props: React.ComponentProps<"div">) => (
	<div role="separator" className="h-px w-full bg-separator" {...props} />
);
