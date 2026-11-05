import type { JSX } from "react";
import { parseBreadcrumbs } from "../format";
import { Breadcrumb as BreadcrumbNav, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "./ui/breadcrumb";

export interface BreadcrumbProps { bucket: string; prefix: string; onNavigate: (prefix: string) => void; }
export function Breadcrumb({ bucket, prefix, onNavigate }: BreadcrumbProps): JSX.Element {
	return <BreadcrumbNav><BreadcrumbList>{parseBreadcrumbs(bucket, prefix).map((segment, index, all) => <BreadcrumbItem className="app-breadcrumb-segment" key={segment.prefix || "root"}>{index > 0 && <BreadcrumbSeparator />}{index === all.length - 1 ? <BreadcrumbPage>{segment.name}</BreadcrumbPage> : <BreadcrumbLink type="button" className="app-breadcrumb-btn" onClick={() => onNavigate(segment.prefix)}>{segment.name}</BreadcrumbLink>}</BreadcrumbItem>)}</BreadcrumbList></BreadcrumbNav>;
}
