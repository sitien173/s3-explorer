import { useState, type JSX } from "react";
import { api, unwrap } from "../api";
import { Alert } from "./ui/alert";

export interface SsoBannerProps {
	profile: string;
	onSignedIn?: () => void;
}

export function SsoBanner({
	profile,
	onSignedIn,
}: SsoBannerProps): JSX.Element {
	const [status, setStatus] = useState<"idle" | "signing_in" | "failed">(
		"idle",
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function handleSignIn(): Promise<void> {
		setStatus("signing_in");
		setErrorMessage(null);
		try {
			const res = await api.connections.ssoLogin({ profile });
			const data = unwrap(res);
			if (data.loggedIn) {
				setStatus("idle");
				onSignedIn?.();
			} else {
				setStatus("failed");
			}
		} catch (err: unknown) {
			setStatus("failed");
			if (err instanceof Error) {
				setErrorMessage(err.message);
			}
		}
	}

	return (
		<Alert className="tds-announcement--warning app-sso-banner">
			<div className="tds-announcement__content">
				<div className="tds-announcement__title">
					SSO session expired
				</div>
				<div className="tds-announcement__message">
					Profile <strong>{profile}</strong> requires authentication.
					{status === "failed" && (
						<div className="app-sso-command">
							{errorMessage && (
								<div className="app-sso-error">
									{errorMessage}
								</div>
							)}
							<div>Run in terminal:</div>
							<code>aws sso login --profile {profile}</code>
						</div>
					)}
				</div>
			</div>
			<div className="tds-announcement__actions">
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--primary"
					disabled={status === "signing_in"}
					onClick={() => {
						void handleSignIn();
					}}
				>
					{status === "signing_in" ? "Signing in..." : "Sign in"}
				</button>
			</div>
		</Alert>
	);
}
