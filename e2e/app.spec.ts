import {
	ListObjectsV2Command,
	type S3Client,
} from "@aws-sdk/client-s3";
import { expect, test } from "./fixtures";

async function objectExists(
	s3: S3Client,
	bucket: string,
	key: string,
): Promise<boolean> {
	const response = await s3.send(
		new ListObjectsV2Command({ Bucket: bucket, Prefix: key }),
	);
	return (response.Contents ?? []).some((object) => object.Key === key);
}

test("browses, streams, uploads, renames, and deletes RustFS objects", async ({
	e2e,
}) => {
	const { electronApp, page, s3, bucket, uploadPath } = e2e;

	await page.getByRole("button", { name: "Add connection" }).click();
	const connectionDialog = page.getByRole("dialog", {
		name: "Add connection",
	});
	await connectionDialog
		.getByRole("button", { name: "Manual Credentials" })
		.click();
	await connectionDialog
		.getByLabel("Connection name (required)")
		.fill("RustFS E2E");
	await connectionDialog.getByLabel("Region (required)").fill("us-east-1");
	await connectionDialog
		.getByLabel("Access Key ID (required)")
		.fill("rustfsadmin");
	await connectionDialog
		.getByLabel("Secret Access Key (required)")
		.fill("rustfsadmin");
	await connectionDialog
		.getByLabel("Endpoint URL")
		.fill("http://127.0.0.1:19000");
	await connectionDialog
		.getByLabel("Force path-style URLs (required for MinIO / LocalStack)")
		.check();
	await connectionDialog
		.getByRole("button", { name: "Save connection" })
		.click();
	await expect(page.getByText("Session-only storage active")).toBeVisible();

	await page
		.locator(".app-connection-name-btn")
		.filter({ hasText: "RustFS E2E" })
		.click();
	await page.getByRole("button", { name: bucket, exact: true }).click();

	const seededFolder = page
		.locator(".app-row-name")
		.filter({ hasText: "seeded" });
	await expect(seededFolder).toBeVisible();
	await seededFolder.dblclick();
	await expect(page.locator(".tds-breadcrumbs")).toContainText("seeded");

	const video = page.locator(".app-viewer video");
	await page
		.locator(".app-row-name")
		.filter({ hasText: "faststart.mp4" })
		.click();
	await expect(video).toBeVisible();
	await expect
		.poll(() =>
			video.evaluate((element) => {
				const media = element as HTMLVideoElement;
				return (
					media.readyState >= HTMLMediaElement.HAVE_METADATA &&
					Number.isFinite(media.duration)
				);
			}),
			{ timeout: 20_000 },
		)
		.toBe(true);

	const seek = await video.evaluate(async (element) => {
		const media = element as HTMLVideoElement;
		const target = media.duration / 2;
		const seeked = new Promise<void>((resolve) => {
			media.addEventListener("seeked", () => resolve(), { once: true });
		});
		media.currentTime = target;
		await seeked;
		return { target, currentTime: media.currentTime };
	});
	expect(seek.currentTime).toBeGreaterThan(0);
	expect(Math.abs(seek.currentTime - seek.target)).toBeLessThan(1);
	await video.evaluate(async (element) => {
		const media = element as HTMLVideoElement;
		media.muted = true;
		await media.play();
	});
	await expect
		.poll(
			() =>
				video.evaluate(
					(element) => (element as HTMLVideoElement).currentTime,
				),
			{ timeout: 10_000 },
		)
		.toBeGreaterThan(seek.currentTime);
	await video.evaluate((element) => (element as HTMLVideoElement).pause());

	await page.getByRole("button", { name: "Open URL" }).click();
	const openUrlDialog = page.getByRole("dialog", { name: "Open URL" });
	await openUrlDialog
		.getByLabel("URL (required)")
		.fill(`s3://${bucket}/seeded/faststart.mp4`);

	const signingConnection = await openUrlDialog
		.getByLabel("Signing connection")
		.inputValue();
	expect(signingConnection).not.toBe("anonymous");
	await openUrlDialog.getByRole("button", { name: "Open", exact: true }).click();
	await expect(page.locator(".app-viewer")).toContainText("faststart.mp4");
	await expect(page.locator(".app-viewer video")).toBeVisible();

	await electronApp.evaluate(({ dialog }, path) => {
		dialog.showOpenDialog = async () => ({
			canceled: false,
			filePaths: [path],
		});
	}, uploadPath);
	await page.getByRole("button", { name: "Upload", exact: true }).click();
	const uploadedKey = "seeded/upload-me.txt";
	await expect
		.poll(() => objectExists(s3, bucket, uploadedKey), { timeout: 20_000 })
		.toBe(true);

	await page
		.locator(".app-row-name")
		.filter({ hasText: "upload-me.txt" })
		.click();
	await page.getByRole("button", { name: "Rename or move" }).click();
	const renameDialog = page.getByRole("dialog", {
		name: "Rename or move object",
	});
	const renamedKey = "seeded/renamed-by-e2e.txt";
	await renameDialog
		.getByLabel("Target key (required)")
		.fill(renamedKey);
	await renameDialog.getByRole("button", { name: "Rename" }).click();
	await expect
		.poll(() => objectExists(s3, bucket, renamedKey), { timeout: 20_000 })
		.toBe(true);
	await expect
		.poll(() => objectExists(s3, bucket, uploadedKey), { timeout: 20_000 })
		.toBe(false);

	await page
		.locator(".app-row-name")
		.filter({ hasText: "renamed-by-e2e.txt" })
		.click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	const deleteDialog = page.getByRole("dialog", { name: "Delete object" });
	await deleteDialog.getByRole("button", { name: "Delete" }).click();
	await expect
		.poll(() => objectExists(s3, bucket, renamedKey), { timeout: 20_000 })
		.toBe(false);
});
