import { Button } from "./ui/button";
import { BANNER_DESTRUCTIVE_CLASS, BANNER_SEPARATOR_CLASS } from "./ui/alert";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import type { CreateResponse, ListProfilesResponse } from "../../../shared/ipc";
import { api, unwrap } from "../api";
import { connectionFormSchema } from "../forms";
import { profilesQuery } from "../queries";
import { buildCreateRequest, buildUpdateRequest, type ConnectionFormState } from "../format";
import { cn } from "../lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { FieldError } from "./ui/field";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

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

	const defaultValues = useMemo<ConnectionFormState>(
		() => ({
			name: initialConnection?.name ?? "",
			kind: initialConnection?.kind ?? "profile",
			profile: initialConnection?.profile || "",
			region: initialConnection?.region || "",
			endpoint: initialConnection?.endpoint || "",
			forcePathStyle: initialConnection?.forcePathStyle ?? false,
			accessKeyId: "",
			secretAccessKey: "",
			sessionToken: "",
		}),
		[initialConnection],
	);
	const schema = useMemo(() => connectionFormSchema(isEdit), [isEdit]);
	const {
		register,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ConnectionFormState, unknown, ConnectionFormState>({
		resolver: zodResolver(schema),
		defaultValues,
	});
	const kind = watch("kind");
	const [testResult, setTestResult] = useState<{
		ok: boolean;
		message: string;
	} | null>(null);
	const [testing, setTesting] = useState<boolean>(false);

	const profilesQueryResult = useQuery({ ...profilesQuery(), enabled: isOpen });
	const profiles: ListProfilesResponse = profilesQueryResult.data ?? [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: isOpen is a reset trigger so fields clear on open and close
	useEffect(() => {
		reset(defaultValues);
		setTestResult(null);
		setTesting(false);
	}, [isOpen, defaultValues, reset]);

	const profilesData = profilesQueryResult.data;
	useEffect(() => {
		if (isOpen && !initialConnection && profilesData && profilesData.length > 0 && !getValues("profile")) {
			setValue("profile", profilesData[0].name);
		}
	}, [isOpen, initialConnection, profilesData, getValues, setValue]);

	if (!isOpen) {
		return null;
	}

	async function onValid(form: ConnectionFormState): Promise<void> {
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
			setError("root.server", { message: err instanceof Error ? err.message : "Failed to save connection." });
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
				<Button
					type="button"
					variant="secondary"
					disabled={testing || isSubmitting}
					onClick={() => {
						void handleTestConnection();
					}}
				>
					{testing ? "Testing..." : "Test connection"}
				</Button>
			)}
			<div className="ml-auto flex items-center gap-2">
				<Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="default"
					disabled={isSubmitting}
					onClick={() => {
						void handleSubmit(onValid)();
					}}
				>
					{isSubmitting ? "Saving..." : "Save connection"}
				</Button>
			</div>
		</>
	);

	return (
		<Dialog isOpen={isOpen} title={isEdit ? "Edit connection" : "Add connection"} onClose={onClose} footer={footer}>
			{errors.root?.server?.message && (
				<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
					<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
						<div className="text-sm text-foreground-secondary">{errors.root.server.message}</div>
					</div>
				</div>
			)}

			<div className="mb-2 flex gap-2">
				<Button
					type="button"
					size="sm"
					variant={kind === "profile" ? "default" : "secondary"}
					aria-pressed={kind === "profile"}
					onClick={() => {
						setValue("kind", "profile");
					}}
				>
					AWS Profile / SSO
				</Button>
				<Button
					type="button"
					size="sm"
					variant={kind === "manual" ? "default" : "secondary"}
					aria-pressed={kind === "manual"}
					onClick={() => {
						setValue("kind", "manual");
					}}
				>
					Manual Credentials
				</Button>
			</div>

			<div className="flex w-full min-w-0 flex-col gap-1">
				<label htmlFor={nameId} className="text-xs font-medium text-foreground">
					Connection name (required)
				</label>
				<Input
					id={nameId}
					type="text"
					className={errors.name ? "border-destructive" : undefined}
					{...register("name")}
					placeholder="e.g. Production Data"
				/>
				<span className="text-xs text-foreground-secondary">A recognizable label for this connection</span>
				<FieldError error={errors.name} />
			</div>

			{kind === "profile" ? (
				<>
					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={profileId} className="text-xs font-medium text-foreground">
							AWS Profile (required)
						</label>
						{profiles.length > 0 ? (
							<Select
								id={profileId}
								className={errors.profile ? "border-destructive" : undefined}
								{...register("profile")}
							>
								<option value="">Select a profile...</option>
								{profiles.map((p: ListProfilesResponse[number]) => (
									<option key={p.name} value={p.name}>
										{p.name} ({p.kind})
									</option>
								))}
							</Select>
						) : (
							<Input
								id={profileId}
								type="text"
								className={errors.profile ? "border-destructive" : undefined}
								{...register("profile")}
								placeholder="default"
							/>
						)}
						<span className="text-xs text-foreground-secondary">Configured profile from ~/.aws/config</span>
						<FieldError error={errors.profile} />
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={regionOverrideId} className="text-xs font-medium text-foreground">
							Region override
						</label>
						<Input
							id={regionOverrideId}
							type="text"
							className={errors.region ? "border-destructive" : undefined}
							{...register("region")}
							placeholder="e.g. us-east-1"
						/>
						<span className="text-xs text-foreground-secondary">Leave blank to use profile default</span>
						<FieldError error={errors.region} />
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={endpointOverrideId} className="text-xs font-medium text-foreground">
							Endpoint override
						</label>
						<Input
							id={endpointOverrideId}
							type="url"
							className={errors.endpoint ? "border-destructive" : undefined}
							{...register("endpoint")}
							placeholder="http://127.0.0.1:9000"
						/>
						<span className="text-xs text-foreground-secondary">Optional custom endpoint URL</span>
						<FieldError error={errors.endpoint} />
					</div>
				</>
			) : (
				<>
					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={manualRegionId} className="text-xs font-medium text-foreground">
							Region (required)
						</label>
						<Input
							id={manualRegionId}
							type="text"
							className={errors.region ? "border-destructive" : undefined}
							{...register("region")}
							placeholder="us-east-1"
						/>
						<FieldError error={errors.region} />
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={accessKeyIdId} className="text-xs font-medium text-foreground">
							Access Key ID (required)
						</label>
						<Input
							id={accessKeyIdId}
							type="text"
							className={errors.accessKeyId ? "border-destructive" : undefined}
							{...register("accessKeyId")}
							placeholder="AKIA..."
						/>
						<FieldError error={errors.accessKeyId} />
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={secretAccessKeyId} className="text-xs font-medium text-foreground">
							Secret Access Key {isEdit ? "(leave blank to keep unchanged)" : "(required)"}
						</label>
						<Input
							id={secretAccessKeyId}
							type="password"
							className={errors.secretAccessKey ? "border-destructive" : undefined}
							{...register("secretAccessKey")}
							placeholder={isEdit ? "••••••••••••••••" : ""}
						/>
						<FieldError error={errors.secretAccessKey} />
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={sessionTokenId} className="text-xs font-medium text-foreground">
							Session token
						</label>
						<Input
							id={sessionTokenId}
							type="password"
							{...register("sessionToken")}
							placeholder="Optional temporary credentials token"
						/>
					</div>

					<div className="flex w-full min-w-0 flex-col gap-1">
						<label htmlFor={endpointUrlId} className="text-xs font-medium text-foreground">
							Endpoint URL
						</label>
						<Input
							id={endpointUrlId}
							type="url"
							className={errors.endpoint ? "border-destructive" : undefined}
							{...register("endpoint")}
							placeholder="http://127.0.0.1:9000"
						/>
						<FieldError error={errors.endpoint} />
					</div>
				</>
			)}

			<div className="mt-2 flex items-center gap-2">
				<Checkbox type="checkbox" id={forcePathStyleId} {...register("forcePathStyle")} />
				<label htmlFor={forcePathStyleId} className="cursor-pointer text-sm font-medium text-foreground">
					Force path-style URLs (required for MinIO / LocalStack)
				</label>
			</div>

			{testResult && (
				<div className={cn("mb-2 w-full", testResult.ok ? BANNER_SEPARATOR_CLASS : BANNER_DESTRUCTIVE_CLASS)}>
					<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
						<div className="text-sm text-foreground-secondary">{testResult.message}</div>
					</div>
				</div>
			)}
		</Dialog>
	);
}
