import * as React from "react";
import { useLayoutEffect, useRef } from "react";
import { AlertDialog as Primitive } from "radix-ui";
import { Button } from "./button";

let lastFocusedOutsideDialog: HTMLElement | null = null;
if (typeof document !== "undefined") document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && !target.closest('[role="dialog"], [role="alertdialog"]')) lastFocusedOutsideDialog = target;
});

export function AlertDialog({ isOpen, title, onClose, children, footer }: { isOpen: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isOpen) opener.current = lastFocusedOutsideDialog;
  }, [isOpen]);
  const titleId = React.useId();
  return <Primitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Primitive.Portal><div className="tds-dialog tds-dialog--center tds-dialog--open"><Primitive.Overlay className="tds-dialog__backdrop">
      <Primitive.Content className="tds-dialog__panel tds-dialog--center tds-dialog--open" aria-label={title} aria-labelledby={titleId} aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); opener.current = null; }}>
        <header className="tds-dialog__header"><div className="tds-dialog__header-row"><Primitive.Title className="tds-dialog__title" id={titleId}>{title}</Primitive.Title><Primitive.Cancel asChild><Button variant="ghost" size="icon" aria-label="Dismiss" className="tds-dialog__dismiss">×</Button></Primitive.Cancel></div><div className="tds-dialog__divider" role="presentation" /></header>
        <div className="tds-dialog__body app-dialog-body">{children}</div>
        {footer && <footer className="tds-dialog__footer"><div className="tds-dialog__divider" role="presentation" /><div className="tds-dialog__footer-actions app-dialog-actions">{footer}</div></footer>}
      </Primitive.Content></Primitive.Overlay></div>
    </Primitive.Portal>
  </Primitive.Root>;
}
