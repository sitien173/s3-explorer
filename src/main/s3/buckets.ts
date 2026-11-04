import { ListBucketsCommand, type S3Client } from "@aws-sdk/client-s3";
import type { BucketsListResponse } from "../../shared/ipc";

export async function listBuckets(
	client: Pick<S3Client, "send">,
	options: { pinned: string[]; extras: string[] },
): Promise<BucketsListResponse> {
	let listedNames: string[] = [];
	let listDenied = false;

	try {
		const result = await client.send(new ListBucketsCommand({}));
		listedNames = (result.Buckets ?? [])
			.map((b) => b.Name)
			.filter((name): name is string => typeof name === "string");
	} catch (error: unknown) {
		const candidate = error as { name?: string } | undefined;
		if (candidate?.name === "AccessDenied") {
			listDenied = true;
		} else {
			throw error;
		}
	}

	const pinnedSet = new Set(options.pinned);
	const listedSet = new Set(listedNames);

	const allNames: string[] = [];
	if (!listDenied) {
		for (const name of listedNames) {
			if (!allNames.includes(name)) allNames.push(name);
		}
	}
	for (const name of options.pinned) {
		if (!allNames.includes(name)) allNames.push(name);
	}
	for (const name of options.extras) {
		if (!allNames.includes(name)) allNames.push(name);
	}

	const buckets = allNames.map((name) => ({
		name,
		pinned: pinnedSet.has(name),
		listed: !listDenied && listedSet.has(name),
	}));

	buckets.sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
	});

	return { buckets, listDenied };
}
