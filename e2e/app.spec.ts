import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { expect, test } from "./fixtures";

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
	const response = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: key }));
	return (response.Contents ?? []).some((object) => object.Key === key);
}

test("browses, streams, uploads, renames, and deletes RustFS objects", async ({ e2e }) => {
	const { electronApp, page, s3, bucket, uploadPath } = e2e;

	await page.getByRole("button", { name: "Add connection" }).click();
	await page.screenshot({ path: "test-results/phase-01-after-connection-dialog.png" });
	const connectionDialog = page.getByRole("dialog", {
		name: "Add connection",
	});
	await connectionDialog.getByRole("button", { name: "Manual Credentials" }).click();
	await connectionDialog.getByLabel("Connection name (required)").fill("RustFS E2E");
	await connectionDialog.getByLabel("Region (required)").fill("us-east-1");
	await connectionDialog.getByLabel("Access Key ID (required)").fill("rustfsadmin");
	await connectionDialog.getByLabel("Secret Access Key (required)").fill("rustfsadmin");
	await connectionDialog.getByLabel("Endpoint URL").fill("http://127.0.0.1:19000");
	await connectionDialog.getByLabel("Force path-style URLs (required for MinIO / LocalStack)").check();
	await connectionDialog.getByRole("button", { name: "Save connection" }).click();
	await expect(page.getByText("Session-only storage active")).toBeVisible();

	await page.getByRole("button", { name: "RustFS E2E manual", exact: true }).click();
	await page.getByRole("button", { name: bucket, exact: true }).click();
	const appBackground = () =>
		page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.backgroundColor = "var(--color-background)";
			document.body.append(probe);
			const token = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return { body: getComputedStyle(document.body).backgroundColor, token };
		});
	await page.emulateMedia({ colorScheme: "dark" });
	await expect.poll(appBackground).toEqual({ body: "rgb(28, 28, 30)", token: "rgb(28, 28, 30)" });
	await page.emulateMedia({ colorScheme: "light" });
	await expect.poll(appBackground).toEqual({ body: "rgb(255, 255, 255)", token: "rgb(255, 255, 255)" });
	await page.screenshot({ path: "test-results/phase-01-after-main.png" });

	const grid = page.getByRole("grid");
	const seededFolder = grid.getByRole("row", { name: /seeded/ });
	await expect(seededFolder).toBeVisible();
	await seededFolder.dblclick();
	await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("seeded");

	await page.getByRole("button", { name: "Grid view" }).click();
	const seededGridCell = page.getByRole("gridcell", { name: /faststart\.mp4/ });
	await expect(seededGridCell).toBeVisible();
	await page.getByRole("button", { name: "List view" }).click();
	await expect(grid.getByRole("row", { name: /faststart\.mp4/ })).toBeVisible();

	await page.keyboard.press("Control+k");
	const palette = page.getByRole("dialog", { name: "Command palette" });
	await expect(palette).toBeVisible();
	await palette.getByRole("combobox").fill(bucket);
	await page.keyboard.press("Enter");
	await expect(palette).toBeHidden();
	await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(bucket);
	await expect(seededFolder).toBeVisible();

	await seededFolder.dblclick();
	await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("seeded");

	const quickLook = page.getByRole("dialog", { name: "faststart.mp4" });
	const video = quickLook.locator("video");
	await grid.getByRole("row", { name: /faststart\.mp4/ }).dblclick();
	await expect(video).toBeVisible();
	await expect
		.poll(
			() =>
				video.evaluate((element) => {
					const media = element as HTMLVideoElement;
					return media.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(media.duration);
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
		.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), { timeout: 10_000 })
		.toBeGreaterThan(seek.currentTime);
	await video.evaluate((element) => (element as HTMLVideoElement).pause());
	await page.keyboard.press("Escape");
	await expect(quickLook).toBeHidden();

	await page.getByRole("button", { name: "Open URL" }).click();
	const openUrlDialog = page.getByRole("dialog", { name: "Open URL" });
	await openUrlDialog.getByLabel("URL (required)").fill(`s3://${bucket}/seeded/faststart.mp4`);

	const signingConnection = await openUrlDialog.getByLabel("Signing connection").inputValue();
	expect(signingConnection).not.toBe("anonymous");
	await openUrlDialog.getByRole("button", { name: "Open", exact: true }).click();
	await expect(quickLook).toContainText("faststart.mp4");
	await expect(video).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(quickLook).toBeHidden();

	await electronApp.evaluate(({ dialog }, path) => {
		dialog.showOpenDialog = async () => ({
			canceled: false,
			filePaths: [path],
		});
	}, uploadPath);
	await page.getByRole("button", { name: "Upload", exact: true }).click();
	const uploadedKey = "seeded/upload-me.txt";
	await expect.poll(() => objectExists(s3, bucket, uploadedKey), { timeout: 20_000 }).toBe(true);
	await expect(page.getByText(/Uploaded seeded\/upload-me\.txt/i)).toBeVisible();

	const uploadedRow = grid.getByRole("row", { name: /upload-me\.txt/ });
	await uploadedRow.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Rename or move" }).click();
	const renameDialog = page.getByRole("dialog", {
		name: "Rename or move object",
	});
	const renamedKey = "seeded/renamed-by-e2e.txt";
	await renameDialog.getByLabel("Target key (required)").fill(renamedKey);
	await renameDialog.getByRole("button", { name: "Rename" }).click();
	await expect.poll(() => objectExists(s3, bucket, renamedKey), { timeout: 20_000 }).toBe(true);
	await expect.poll(() => objectExists(s3, bucket, uploadedKey), { timeout: 20_000 }).toBe(false);

	const renamedRow = grid.getByRole("row", { name: /renamed-by-e2e\.txt/ });
	await renamedRow.click();
	await grid.focus();
	await page.keyboard.press("Delete");
	const deleteDialog = page.getByRole("alertdialog", { name: "Delete object" });
	await deleteDialog.getByRole("button", { name: "Delete" }).click();
	await expect.poll(() => objectExists(s3, bucket, renamedKey), { timeout: 20_000 }).toBe(false);
});
