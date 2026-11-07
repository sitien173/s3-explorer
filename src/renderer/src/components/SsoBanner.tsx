import { useState, type JSX } from "react";
import { api, unwrap } from "../api";
import { Alert, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

export interface SsoBannerProps {
	profile: string;
	onSignedIn?: () => void;
}

export function SsoBanner({ profile, onSignedIn }: SsoBannerProps): JSX.Element {
	const [status, setStatus] = useState<"idle" | "signing_in" | "failed">("idle");
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
		<Alert className="mb-2">
			<div className="min-w-0 flex-1">
				<AlertTitle>SSO session expired</AlertTitle>
				<div>
					Profile <strong>{profile}</strong> requires authentication.
					{status === "failed" && (
						<div className="mt-2 rounded-control bg-foreground/[0.06] px-2 py-1 text-xs">
							{errorMessage && <div className="mb-2 text-destructive">{errorMessage}</div>}
							<div>Run in terminal:</div>
							<code>aws sso login --profile {profile}</code>
						</div>
					)}
				</div>
			</div>
			<div className="shrink-0">
				<Button
					type="button"
					size="sm"
					disabled={status === "signing_in"}
					onClick={() => {
						void handleSignIn();
					}}
				>
					{status === "signing_in" ? "Signing in..." : "Sign in"}
				</Button>
			</div>
		</Alert>
	);
}
