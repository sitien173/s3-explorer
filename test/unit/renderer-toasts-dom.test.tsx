// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "../../src/renderer/src/components/ui/sonner";
import { notify, toastBuilders } from "../../src/renderer/src/toasts";
import { OperationReport } from "../../src/renderer/src/components/OperationReport";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("renderer toasts DOM integration", () => {
	it("renders Toaster with an aria-live region for announcements", async () => {
		render(<Toaster />);
		// Sonner creates an ol/section container with role="region" or aria-live / tabIndex
		const liveRegion = document.querySelector("[aria-live]") ?? document.querySelector("section[aria-label]");
		expect(liveRegion).toBeTruthy();
	});

	it("announces toasts through aria-live when notified", async () => {
		render(<Toaster />);
		notify(toastBuilders.uploadDone("file.txt"));
		await waitFor(() => {
			const toastEl = document.querySelector("[data-sonner-toast]");
			expect(toastEl).toBeTruthy();
		});
		const container = document.querySelector("[aria-live]");
		expect(container).toBeTruthy();
	});

	it("reopens OperationReport when partial-failure toast action is clicked", async () => {
		const user = userEvent.setup();

		function TestHarness() {
			const [isReportOpen, setIsReportOpen] = React.useState(false);
			const [report, setReport] = React.useState<{
				completedCount: number;
				remainingKeys: string[];
			} | null>(null);

			const triggerPartialFailure = () => {
				const rep = { completedCount: 3, remainingKeys: ["rem1.txt", "rem2.txt"] };
				setReport(rep);
				setIsReportOpen(true);
				notify.partialFailure(
					{ completedCount: rep.completedCount, remainingCount: rep.remainingKeys.length },
					() => {
						setIsReportOpen(true);
					},
				);
			};

			return (
				<>
					<Toaster />
					<button type="button" onClick={triggerPartialFailure}>
						Simulate Failure
					</button>
					{report && (
						<OperationReport
							isOpen={isReportOpen}
							completedCount={report.completedCount}
							remainingKeys={report.remainingKeys}
							onClose={() => setIsReportOpen(false)}
						/>
					)}
				</>
			);
		}

		render(<TestHarness />);

		// Initially report is closed
		expect(screen.queryByRole("dialog", { name: "Operation report" })).toBeNull();

		// Trigger failure -> opens report automatically (per D-P5-1)
		await user.click(screen.getByRole("button", { name: "Simulate Failure" }));
		expect(await screen.findByRole("dialog", { name: "Operation report" })).toBeTruthy();

		// Close the report
		await user.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Operation report" })).toBeNull();
		});

		// Now click the toast action "View report" -> reopens the same report
		const actionBtn = await screen.findByRole("button", { name: "View report" });
		await user.click(actionBtn);

		expect(await screen.findByRole("dialog", { name: "Operation report" })).toBeTruthy();
		expect(screen.getByText("rem1.txt")).toBeTruthy();
	});
});
