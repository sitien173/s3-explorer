import { Button } from "./ui/button";
import {
	useEffect,
	useId,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
	type JSX,
} from "react";
import { api, unwrap } from "../api";
import {
	chooseDefaultConnection,
	getUrlFileName,
	type ConnectionOption,
} from "../urlChoice";
import { Dialog } from "@/components/ui/dialog";
import type { ViewerTargetStream } from "./Viewer";

export interface OpenUrlDialogProps {
	isOpen: boolean;
	connections: ConnectionOption[];
	selectedConnectionId?: string | null;
	currentBucketList?: string[];
	onClose: () => void;
	onSuccess: (target: ViewerTargetStream) => void;
}

export function OpenUrlDialog({
	isOpen,
	connections,
	selectedConnectionId,
	currentBucketList,
	onClose,
	onSuccess,
}: OpenUrlDialogProps): JSX.Element | null {
	const [url, setUrl] = useState<string>("");
	const [selectedConnId, setSelectedConnId] = useState<string>("anonymous");
	const [userOverrodeConn, setUserOverrodeConn] = useState<boolean>(false);
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	const prevIsOpenRef = useRef<boolean>(false);
	const urlInputId = useId();
	const connSelectId = useId();

	useEffect(() => {
		const wasOpen = prevIsOpenRef.current;
		prevIsOpenRef.current = isOpen;

		if (isOpen && !wasOpen) {
			setUrl("");
			setError(null);
			setSubmitting(false);
			setUserOverrodeConn(false);
			const defaultChoice = chooseDefaultConnection({
				url: "",
				connections,
				selectedConnectionId,
				currentBucketList,
			});
			setSelectedConnId(defaultChoice);
		}
	}, [isOpen, connections, selectedConnectionId, currentBucketList]);

	function handleUrlChange(e: ChangeEvent<HTMLInputElement>): void {
		const newUrl = e.target.value;
		setUrl(newUrl);
		setError(null);

		if (!userOverrodeConn) {
			const choice = chooseDefaultConnection({
				url: newUrl,
				connections,
				selectedConnectionId,
				currentBucketList,
			});
			setSelectedConnId(choice);
		}
	}

	async function handleSubmit(e: FormEvent): Promise<void> {
		e.preventDefault();
		const trimmedUrl = url.trim();
		if (!trimmedUrl) {
			return;
		}

		setSubmitting(true);
		setError(null);

		try {
			const input =
				selectedConnId === "anonymous"
					? { url: trimmedUrl, anonymous: true }
					: { url: trimmedUrl, connectionId: selectedConnId };

			const res = await api.stream.openUrl(input);
			const data = unwrap(res);
			const fileName = getUrlFileName(trimmedUrl);

			onSuccess({
				kind: "stream",
				url: data.url,
				contentType: data.contentType,
				size: data.size,
				fileName,
				key: fileName,
			});
			onClose();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to open URL";
			setError(message);
		} finally {
			setSubmitting(false);
		}
	}

	function handleClose(): void {
		if (submitting) {
			return;
		}
		onClose();
	}

	return (
		<Dialog
			isOpen={isOpen}
			title="Open URL"
			onClose={handleClose}
			footer={
				<div className="app-dialog-footer-actions">
					<Button
						type="button"
						variant="secondary"
						onClick={handleClose}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form="app-open-url-form"
						variant="default"
						disabled={submitting || !url.trim()}
					>
						{submitting ? "Opening..." : "Open"}
					</Button>
				</div>
			}
		>
			<form
				id="app-open-url-form"
				onSubmit={(e) => {
					void handleSubmit(e);
				}}
				className="app-form-layout"
			>
				{error && (
					<div className="tds-announcement tds-announcement--negative app-dialog-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__message">{error}</div>
						</div>
					</div>
				)}

				<div className="tds-text-input">
					<label
						className="tds-field-label"
						htmlFor={urlInputId}
					>
						URL (required)
					</label>
					<input
						id={urlInputId}
						type="text"
						className="tds-text-input__field"
						value={url}
						onChange={handleUrlChange}
						placeholder="s3://bucket/key or https://..."
						required
						autoFocus
					/>
					<span className="tds-field-caption">
						Supports S3 URIs, virtual-hosted, path-style, and presigned
						URLs.
					</span>
				</div>

				<div className="tds-select">
					<label
						className="tds-field-label"
						htmlFor={connSelectId}
					>
						Signing connection
					</label>
					<select
						id={connSelectId}
						className="tds-select__trigger"
						value={selectedConnId}
						onChange={(e) => {
							setSelectedConnId(e.target.value);
							setUserOverrodeConn(true);
						}}
					>
						{connections.map((conn) => (
							<option key={conn.id} value={conn.id}>
								{conn.name}
							</option>
						))}
						<option value="anonymous">Anonymous</option>
					</select>
					<span className="tds-field-caption">
						Choose credentials for authorization or select Anonymous.
					</span>
				</div>
			</form>
		</Dialog>
	);
}
