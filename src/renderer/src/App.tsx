import { QueryClientProvider } from "@tanstack/react-query";
import type { JSX } from "react";
import { Toaster } from "./components/ui/sonner";
import { createQueryClient } from "./queries";
import Shell from "./Shell";

export { NewFolderDialog, type NewFolderDialogProps } from "./Shell";
export {
	shouldClearViewerTarget,
	updateTransfersOnDone,
	updateTransfersOnProgress,
	type DonePayload,
	type ProgressPayload,
	type TransferMeta,
} from "./Shell";

const queryClient = createQueryClient();

export default function App(): JSX.Element {
	return (
		<QueryClientProvider client={queryClient}>
			<Toaster />
			<Shell />
		</QueryClientProvider>
	);
}
