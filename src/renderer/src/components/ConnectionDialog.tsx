import {
	useEffect,
	useId,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import type { CreateResponse, ListProfilesResponse } from "../../../shared/ipc";
import { api, unwrap } from "../api";
import {
	buildCreateRequest,
	buildUpdateRequest,
	type ConnectionFormState,
} from "../format";
import { Dialog } from "./Dialog";

export type ConnectionView = CreateResponse;

export interface ConnectionDialogProps {
	isOpen: boolean;
	initialConnection?: ConnectionView | null;
	onClose: () => void;
	onSaved: (connection: ConnectionView) => void;
}

export function ConnectionDialog({
	isOpen,
	initialConnection,
	onClose,
	onSaved,
}: ConnectionDialogProps): JSX.Element | null {
	const isEdit = Boolean(initialConnection);

	const nameId = useId();
	const profileId = useId();
	const regionOverrideId = useId();
	const endpointOverrideId = useId();
	const manualRegionId = useId();
	const accessKeyIdId = useId();
	const secretAccessKeyId = useId();
	const sessionTokenId = useId();
	const endpointUrlId = useId();
	const forcePathStyleId = useId();

	const [form, setForm] = useState<ConnectionFormState>({
		name: "",
		kind: "profile",
		profile: "",
		region: "",
		endpoint: "",
		forcePathStyle: false,
		accessKeyId: "",
		secretAccessKey: "",
		sessionToken: "",
	});
	const [profiles, setProfiles] = useState<ListProfilesResponse>([]);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [testResult, setTestResult] = useState<{
		ok: boolean;
		message: string;
	} | null>(null);
	const [testing, setTesting] = useState<boolean>(false);
	const [saving, setSaving] = useState<boolean>(false);

	useEffect(() => {
		if (!isOpen) {
			setForm({
				name: "",
				kind: "profile",
				profile: "",
				region: "",
				endpoint: "",
				forcePathStyle: false,
				accessKeyId: "",
				secretAccessKey: "",
				sessionToken: "",
			});
			setError(null);
			setFieldErrors({});
			setTestResult(null);
			setTesting(false);
			setSaving(false);
			return;
		}
		setError(null);
		setFieldErrors({});
		setTestResult(null);

		if (initialConnection) {
			setForm({
				name: initialConnection.name,
				kind: initialConnection.kind,
				profile: initialConnection.profile || "",
				region: initialConnection.region || "",
				endpoint: initialConnection.endpoint || "",
				forcePathStyle: initialConnection.forcePathStyle,
				accessKeyId: "",
				secretAccessKey: "",
				sessionToken: "",
			});
		} else {
			setForm({
				name: "",
				kind: "profile",
				profile: "",
				region: "",
				endpoint: "",
				forcePathStyle: false,
				accessKeyId: "",
				secretAccessKey: "",
				sessionToken: "",
			});
		}

		void api.connections
			.listProfiles()
			.then((res) => {
				const data = unwrap(res);
				setProfiles(data);
				if (!initialConnection && data.length > 0) {
					setForm((prev) => ({
						...prev,
						profile: prev.profile || data[0].name,
					}));
				}
			})
			.catch(() => {
				// Ignore profile listing errors if AWS config missing
			});
	}, [isOpen, initialConnection]);

	if (!isOpen) {
		return null;
	}

	function validate(): boolean {
		const errors: Record<string, string> = {};
		if (!form.name.trim()) {
			errors.name = "Connection name is required.";
		}
		if (form.kind === "profile") {
			if (!form.profile?.trim()) {
				errors.profile = "AWS profile name is required.";
			}
		} else {
			if (!form.region?.trim()) {
				errors.region = "AWS Region is required.";
			}
			if (!isEdit && !form.accessKeyId?.trim()) {
				errors.accessKeyId = "Access Key ID is required.";
			}
			if (!isEdit && !form.secretAccessKey?.trim()) {
				errors.secretAccessKey = "Secret Access Key is required.";
			}
		}
		setFieldErrors(errors);
		return Object.keys(errors).length === 0;
	}

	async function handleSubmit(): Promise<void> {
		if (!validate()) {
			return;
		}
		setSaving(true);
		setError(null);
		try {
			if (isEdit && initialConnection) {
				const req = buildUpdateRequest(initialConnection.id, form);
				const res = await api.connections.update(req);
				const data = unwrap(res);
				onSaved(data);
				onClose();
			} else {
				const req = buildCreateRequest(form);
				const res = await api.connections.create(req);
				const data = unwrap(res);
				onSaved(data);
				onClose();
			}
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError("Failed to save connection.");
			}
		} finally {
			setSaving(false);
		}
	}

	async function handleTestConnection(): Promise<void> {
		if (!initialConnection) {
			return;
		}
		setTesting(true);
		setTestResult(null);
		try {
			const res = await api.connections.testConnection({
				id: initialConnection.id,
			});
			const data = unwrap(res);
			setTestResult({
				ok: true,
				message: `Connection verified. Found ${data.bucketCount} buckets.`,
			});
		} catch (err: unknown) {
			if (err instanceof Error) {
				setTestResult({
					ok: false,
					message: err.message,
				});
			} else {
				setTestResult({
					ok: false,
					message: "Connection test failed.",
				});
			}
		} finally {
			setTesting(false);
		}
	}

	const footer = (
		<>
			{isEdit && (
				<button
					type="button"
					className="tds-btn tds-btn--md tds-btn--secondary"
					disabled={testing || saving}
					onClick={() => {
						void handleTestConnection();
					}}
				>
					{testing ? "Testing..." : "Test connection"}
				</button>
			)}
			<div className="app-dialog-primary-actions">
				<button
					type="button"
					className="tds-btn tds-btn--md tds-btn--secondary"
					onClick={onClose}
					disabled={saving}
				>
					Cancel
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--md tds-btn--primary"
					disabled={saving}
					onClick={() => {
						void handleSubmit();
					}}
				>
					{saving ? "Saving..." : "Save connection"}
				</button>
			</div>
		</>
	);

	return (
		<Dialog
			isOpen={isOpen}
			title={isEdit ? "Edit connection" : "Add connection"}
			onClose={onClose}
			footer={footer}
		>
			{error && (
				<div className="tds-announcement tds-announcement--error app-dialog-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">{error}</div>
					</div>
				</div>
			)}

			<div className="app-dialog-kind-selector">
				<button
					type="button"
					className={`tds-btn tds-btn--sm ${form.kind === "profile" ? "tds-btn--primary" : "tds-btn--secondary"}`}
					aria-pressed={form.kind === "profile"}
					onClick={() => {
						setForm((prev) => ({
							...prev,
							kind: "profile",
						}));
					}}
				>
					AWS Profile / SSO
				</button>
				<button
					type="button"
					className={`tds-btn tds-btn--sm ${form.kind === "manual" ? "tds-btn--primary" : "tds-btn--secondary"}`}
					aria-pressed={form.kind === "manual"}
					onClick={() => {
						setForm((prev) => ({
							...prev,
							kind: "manual",
						}));
					}}
				>
					Manual Credentials
				</button>
			</div>

			<div
				className={`tds-text-input app-dialog-field ${fieldErrors.name ? "tds-text-input--error" : ""}`}
			>
				<label htmlFor={nameId} className="tds-field-label">
					Connection name (required)
				</label>
				<input
					id={nameId}
					type="text"
					className="tds-text-input__field"
					value={form.name}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setForm((prev) => ({
							...prev,
							name: e.target.value,
						}));
					}}
					placeholder="e.g. Production Data"
				/>
				<span className="tds-field-caption">
					A recognizable label for this connection
				</span>
				{fieldErrors.name && (
					<span className="tds-field-validation">
						{fieldErrors.name}
					</span>
				)}
			</div>

			{form.kind === "profile" ? (
				<>
					<div
						className={`tds-text-input app-dialog-field ${fieldErrors.profile ? "tds-text-input--error" : ""}`}
					>
						<label htmlFor={profileId} className="tds-field-label">
							AWS Profile (required)
						</label>
						{profiles.length > 0 ? (
							<select
								id={profileId}
								className="tds-text-input__field"
								value={form.profile}
								onChange={(e) => {
									setForm((prev) => ({
										...prev,
										profile: e.target.value,
									}));
								}}
							>
								<option value="">Select a profile...</option>
								{profiles.map(
									(p: ListProfilesResponse[number]) => (
										<option key={p.name} value={p.name}>
											{p.name} ({p.kind})
										</option>
									),
								)}
							</select>
						) : (
							<input
								id={profileId}
								type="text"
								className="tds-text-input__field"
								value={form.profile}
								onChange={(e: ChangeEvent<HTMLInputElement>) => {
									setForm((prev) => ({
										...prev,
										profile: e.target.value,
									}));
								}}
								placeholder="default"
							/>
						)}
						<span className="tds-field-caption">
							Configured profile from ~/.aws/config
						</span>
						{fieldErrors.profile && (
							<span className="tds-field-validation">
								{fieldErrors.profile}
							</span>
						)}
					</div>

					<div className="tds-text-input app-dialog-field">
						<label
							htmlFor={regionOverrideId}
							className="tds-field-label"
						>
							Region override
						</label>
						<input
							id={regionOverrideId}
							type="text"
							className="tds-text-input__field"
							value={form.region || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									region: e.target.value,
								}));
							}}
							placeholder="e.g. us-east-1"
						/>
						<span className="tds-field-caption">
							Leave blank to use profile default
						</span>
					</div>

					<div className="tds-text-input app-dialog-field">
						<label
							htmlFor={endpointOverrideId}
							className="tds-field-label"
						>
							Endpoint override
						</label>
						<input
							id={endpointOverrideId}
							type="url"
							className="tds-text-input__field"
							value={form.endpoint || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									endpoint: e.target.value,
								}));
							}}
							placeholder="http://127.0.0.1:9000"
						/>
						<span className="tds-field-caption">
							Optional custom endpoint URL
						</span>
					</div>
				</>
			) : (
				<>
					<div
						className={`tds-text-input app-dialog-field ${fieldErrors.region ? "tds-text-input--error" : ""}`}
					>
						<label
							htmlFor={manualRegionId}
							className="tds-field-label"
						>
							Region (required)
						</label>
						<input
							id={manualRegionId}
							type="text"
							className="tds-text-input__field"
							value={form.region || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									region: e.target.value,
								}));
							}}
							placeholder="us-east-1"
						/>
						{fieldErrors.region && (
							<span className="tds-field-validation">
								{fieldErrors.region}
							</span>
						)}
					</div>

					<div
						className={`tds-text-input app-dialog-field ${fieldErrors.accessKeyId ? "tds-text-input--error" : ""}`}
					>
						<label
							htmlFor={accessKeyIdId}
							className="tds-field-label"
						>
							Access Key ID (required)
						</label>
						<input
							id={accessKeyIdId}
							type="text"
							className="tds-text-input__field"
							value={form.accessKeyId || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									accessKeyId: e.target.value,
								}));
							}}
							placeholder="AKIA..."
						/>
						{fieldErrors.accessKeyId && (
							<span className="tds-field-validation">
								{fieldErrors.accessKeyId}
							</span>
						)}
					</div>

					<div
						className={`tds-text-input app-dialog-field ${fieldErrors.secretAccessKey ? "tds-text-input--error" : ""}`}
					>
						<label
							htmlFor={secretAccessKeyId}
							className="tds-field-label"
						>
							Secret Access Key{" "}
							{isEdit
								? "(leave blank to keep unchanged)"
								: "(required)"}
						</label>
						<input
							id={secretAccessKeyId}
							type="password"
							className="tds-text-input__field"
							value={form.secretAccessKey || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									secretAccessKey: e.target.value,
								}));
							}}
							placeholder={isEdit ? "••••••••••••••••" : ""}
						/>
						{fieldErrors.secretAccessKey && (
							<span className="tds-field-validation">
								{fieldErrors.secretAccessKey}
							</span>
						)}
					</div>

					<div className="tds-text-input app-dialog-field">
						<label
							htmlFor={sessionTokenId}
							className="tds-field-label"
						>
							Session token
						</label>
						<input
							id={sessionTokenId}
							type="password"
							className="tds-text-input__field"
							value={form.sessionToken || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									sessionToken: e.target.value,
								}));
							}}
							placeholder="Optional temporary credentials token"
						/>
					</div>

					<div className="tds-text-input app-dialog-field">
						<label
							htmlFor={endpointUrlId}
							className="tds-field-label"
						>
							Endpoint URL
						</label>
						<input
							id={endpointUrlId}
							type="url"
							className="tds-text-input__field"
							value={form.endpoint || ""}
							onChange={(e: ChangeEvent<HTMLInputElement>) => {
								setForm((prev) => ({
									...prev,
									endpoint: e.target.value,
								}));
							}}
							placeholder="http://127.0.0.1:9000"
						/>
					</div>
				</>
			)}

			<div className="app-dialog-checkbox-row">
				<input
					type="checkbox"
					id={forcePathStyleId}
					className="tds-checkbox"
					checked={form.forcePathStyle}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setForm((prev) => ({
							...prev,
							forcePathStyle: e.target.checked,
						}));
					}}
				/>
				<label
					htmlFor={forcePathStyleId}
					className="tds-field-label app-checkbox-label"
				>
					Force path-style URLs (required for MinIO / LocalStack)
				</label>
			</div>

			{testResult && (
				<div
					className={`tds-announcement ${testResult.ok ? "tds-announcement--success" : "tds-announcement--error"} app-dialog-banner`}
				>
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">
							{testResult.message}
						</div>
					</div>
				</div>
			)}
		</Dialog>
	);
}
