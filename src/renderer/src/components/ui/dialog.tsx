import * as React from "react";
import { useId, useLayoutEffect, useRef } from "react";
import { Dialog as Primitive } from "radix-ui";
import { Button } from "./button";

let lastFocusedOutsideDialog: HTMLElement | null = null;
if (typeof document !== "undefined") document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && !target.closest('[role="dialog"], [role="alertdialog"]')) lastFocusedOutsideDialog = target;
});

export function Dialog({ isOpen, title, onClose, children, footer, titleId }: { isOpen: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; titleId?: string }) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isOpen) opener.current = lastFocusedOutsideDialog;
  }, [isOpen]);
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;
  return <Primitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Primitive.Portal><div className="tds-dialog tds-dialog--center tds-dialog--open"><Primitive.Overlay className="tds-dialog__backdrop">
      <Primitive.Content className="tds-dialog__panel tds-dialog--center tds-dialog--open" aria-label={title} aria-labelledby={resolvedTitleId} aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); opener.current = null; }}>
        <header className="tds-dialog__header"><div className="tds-dialog__header-row"><Primitive.Title className="tds-dialog__title" id={resolvedTitleId}>{title}</Primitive.Title><Primitive.Close asChild><Button variant="ghost" size="icon" aria-label="Dismiss" className="tds-dialog__dismiss">×</Button></Primitive.Close></div><div className="tds-dialog__divider" role="presentation" /></header>
        <div className="tds-dialog__body app-dialog-body">{children}</div>
        {footer && <footer className="tds-dialog__footer"><div className="tds-dialog__divider" role="presentation" /><div className="tds-dialog__footer-actions app-dialog-actions">{footer}</div></footer>}
      </Primitive.Content></Primitive.Overlay></div>
    </Primitive.Portal>
  </Primitive.Root>;
}
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogContent = Primitive.Content;
export const DialogClose = Primitive.Close;
