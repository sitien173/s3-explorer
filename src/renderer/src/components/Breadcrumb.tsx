import type { JSX } from "react";
import { parseBreadcrumbs } from "../format";
import {
	Breadcrumb as BreadcrumbNav,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "./ui/breadcrumb";

export interface BreadcrumbProps {
	bucket: string;
	prefix: string;
	onNavigate: (prefix: string) => void;
}
export function Breadcrumb({ bucket, prefix, onNavigate }: BreadcrumbProps): JSX.Element {
	return (
		<BreadcrumbNav>
			<BreadcrumbList>
				{parseBreadcrumbs(bucket, prefix).map((segment, index, all) => (
					<BreadcrumbItem className="inline-flex items-center gap-1" key={segment.prefix || "root"}>
						{index > 0 && <BreadcrumbSeparator />}
						{index === all.length - 1 ? (
							<BreadcrumbPage>{segment.name}</BreadcrumbPage>
						) : (
							<BreadcrumbLink
								type="button"
								className="app-no-drag cursor-pointer bg-transparent p-0 text-accent underline underline-offset-2 hover:text-accent/80"
								onClick={() => onNavigate(segment.prefix)}
							>
								{segment.name}
							</BreadcrumbLink>
						)}
					</BreadcrumbItem>
				))}
			</BreadcrumbList>
		</BreadcrumbNav>
	);
}
