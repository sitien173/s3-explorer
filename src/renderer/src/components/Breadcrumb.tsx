import type { JSX } from "react";
import { parseBreadcrumbs } from "../format";

export interface BreadcrumbProps {
	bucket: string;
	prefix: string;
	onNavigate: (prefix: string) => void;
}

export function Breadcrumb({
	bucket,
	prefix,
	onNavigate,
}: BreadcrumbProps): JSX.Element {
	const segments = parseBreadcrumbs(bucket, prefix);

	return (
		<nav className="tds-breadcrumbs" aria-label="Breadcrumb">
			{segments.map((seg, idx) => {
				const isLast = idx === segments.length - 1;
				return (
					<span key={seg.prefix || "root"} className="app-breadcrumb-segment">
						{idx > 0 && (
							<span
								className="tds-breadcrumb-divider"
								aria-hidden="true"
							>
								/
							</span>
						)}
						{isLast ? (
							<span
								className="tds-breadcrumb-item tds-breadcrumb-item--current"
								aria-current="page"
							>
								{seg.name}
							</span>
						) : (
							<button
								type="button"
								className="tds-breadcrumb-item app-breadcrumb-btn"
								onClick={() => {
									onNavigate(seg.prefix);
								}}
							>
								{seg.name}
							</button>
						)}
					</span>
				);
			})}
		</nav>
	);
}
