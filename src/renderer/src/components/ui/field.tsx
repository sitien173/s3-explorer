import * as React from "react";
export function Field({ className, ...props }: React.ComponentProps<"div">) { return <div role="group" className={className} {...props}/>; }
export const FieldSet = (props: React.ComponentProps<"fieldset">) => <fieldset {...props}/>;
export const FieldLegend = (props: React.ComponentProps<"legend">) => <legend className="tds-field-label" {...props}/>;
export const FieldGroup = (props: React.ComponentProps<"div">) => <div {...props}/>;
export const FieldLabel = (props: React.ComponentProps<"label">) => <label className="tds-field-label" {...props}/>;
export const FieldTitle = FieldLabel;
export const FieldContent = (props: React.ComponentProps<"div">) => <div {...props}/>;
export const FieldDescription = (props: React.ComponentProps<"p">) => <p className="tds-field-caption" {...props}/>;
export const FieldError = (props: React.ComponentProps<"div">) => <div className="tds-field-validation" role="alert" {...props}/>;
export const FieldSeparator = (props: React.ComponentProps<"div">) => <div role="separator" {...props}/>;
