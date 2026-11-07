import type { Api, Result } from "../../shared/ipc";

declare global {
	interface Window {
		api: Api;
	}
}

export class IpcErrorWrapper extends Error {
	readonly code: string;
	readonly profile?: string;

	constructor(code: string, message: string, profile?: string) {
		super(message);
		this.name = "IpcErrorWrapper";
		this.code = code;
		this.profile = profile;
	}
}

export function unwrap<T>(result: Result<T>): T {
	if (result.ok) {
		return result.data;
	}
	const err = new IpcErrorWrapper(result.error.code, result.error.message, result.error.profile);
	throw err;
}

export const api = typeof window !== "undefined" ? window.api : (undefined as unknown as Api);
