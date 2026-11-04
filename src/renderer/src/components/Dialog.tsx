import {
	useEffect,
	useId,
	useRef,
	type JSX,
	type ReactNode,
} from "react";

export interface DialogProps {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	titleId?: string;
}

export function Dialog({
	isOpen,
	title,
	onClose,
	children,
	footer,
	titleId,
}: DialogProps): JSX.Element | null {
	const panelRef = useRef<HTMLDivElement | null>(null);
	const openerRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const generatedId = useId();
	const resolvedTitleId = titleId || `dialog-title-${generatedId}`;

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		openerRef.current = document.activeElement as HTMLElement | null;

		const timer = setTimeout(() => {
			if (!panelRef.current) {
				return;
			}
			const focusable = panelRef.current.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			);
			if (focusable.length > 0) {
				focusable[0].focus();
			} else {
				panelRef.current.focus();
			}
		}, 10);

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onCloseRef.current();
				return;
			}
			if (event.key === "Tab" && panelRef.current) {
				const focusable = Array.from(
					panelRef.current.querySelectorAll<HTMLElement>(
						'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
					),
				);
				if (focusable.length === 0) {
					event.preventDefault();
					return;
				}
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("keydown", handleKeyDown);
			if (openerRef.current && openerRef.current.isConnected) {
				openerRef.current.focus();
			}
		};
	}, [isOpen]);

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className="tds-dialog tds-dialog--center tds-dialog--open"
			role="presentation"
		>
			<div className="tds-dialog__backdrop" onClick={onClose}>
				<div
					className="tds-dialog__panel"
					role="dialog"
					aria-modal="true"
					aria-labelledby={resolvedTitleId}
					ref={panelRef}
					onClick={(e) => {
						e.stopPropagation();
					}}
				>
					<header className="tds-dialog__header">
						<div className="tds-dialog__header-row">
							<h2
								className="tds-dialog__title"
								id={resolvedTitleId}
							>
								{title}
							</h2>
							<button
								type="button"
								className="tds-icon-btn tds-icon-btn--invisible tds-icon-btn--md tds-dialog__dismiss"
								aria-label="Dismiss"
								onClick={onClose}
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									aria-hidden="true"
								>
									<path d="M1 1l10 10M11 1L1 11" />
								</svg>
							</button>
						</div>
						<div
							className="tds-dialog__divider"
							role="presentation"
						/>
					</header>

					<div className="tds-dialog__body app-dialog-body">
						{children}
					</div>

					{footer && (
						<footer className="tds-dialog__footer">
							<div
								className="tds-dialog__divider"
								role="presentation"
							/>
							<div className="tds-dialog__footer-actions app-dialog-actions">
								{footer}
							</div>
						</footer>
					)}
				</div>
			</div>
		</div>
	);
}
