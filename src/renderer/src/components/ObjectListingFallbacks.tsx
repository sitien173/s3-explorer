import type { JSX } from "react";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { cn } from "../lib/utils";
import { SsoBanner } from "./SsoBanner";

export function ObjectAccessDenied({ bucket }: { bucket: string }): JSX.Element {
	return (
		<div className="p-4">
			<div className={cn("m-3", BANNER_DESTRUCTIVE_CLASS)}>
				<div className="min-w-0 flex-1">
					<AlertTitle>Access denied</AlertTitle>
					<AlertDescription>
						You do not have permission to access bucket &quot;
						{bucket}&quot;.
					</AlertDescription>
				</div>
			</div>
		</div>
	);
}

export function ObjectSsoFallback({ profile, onSignedIn }: { profile: string; onSignedIn: () => void }): JSX.Element {
	return (
		<div className="p-4">
			<SsoBanner profile={profile} onSignedIn={onSignedIn} />
		</div>
	);
}
