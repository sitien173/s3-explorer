export function assertNoSecrets(value: unknown): void {
	const forbidden = /(AKIA|ASIA|aws_secret|SecretAccessKey|SessionToken|X-Amz-Signature)/i;
	const visit = (v: unknown): void => {
		if (typeof v === "string") {
			if (forbidden.test(v)) throw new Error("Secret-like content found");
		} else if (Array.isArray(v)) v.forEach(visit);
		else if (v && typeof v === "object")
			for (const [k, x] of Object.entries(v)) {
				visit(k);
				visit(x);
			}
	};
	visit(value);
}
