"use client";

export * from "./aria.js";
import { Pagination as ArkPagination } from "@ark-ui/react/pagination";

export interface PaginationProps {
  label: string;
  count: number;
  pageSize?: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Supply translated labels rather than replacing interactive elements. */
  previousLabel?: string;
  nextLabel?: string;
}
/** Ark owns every pagination element; it shares tokens/geometry, not event managers. */
export function Pagination({
  label,
  count,
  pageSize = 10,
  page,
  defaultPage = 1,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
}: PaginationProps) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1
  ) {
    throw new Error(
      "Pagination requires a non-negative integer count and positive integer pageSize.",
    );
  }
  if (
    (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) ||
    !Number.isSafeInteger(defaultPage) ||
    defaultPage < 1
  ) {
    throw new Error("Pagination page and defaultPage must be positive integers.");
  }
  return (
    <ArkPagination.Root
      aria-label={label}
      className="fux-pagination"
      count={count}
      pageSize={pageSize}
      page={page}
      defaultPage={defaultPage}
      onPageChange={(details) => onPageChange?.(details.page)}
    >
      <ArkPagination.PrevTrigger
        className="fux-control"
        data-variant="secondary"
        aria-label={previousLabel}
      >
        {previousLabel}
      </ArkPagination.PrevTrigger>
      <ArkPagination.Context>
        {(api) =>
          api.pages.map((item, index) =>
            item.type === "page" ? (
              <ArkPagination.Item
                key={item.value}
                {...item}
                className="fux-control"
                data-variant="quiet"
              >
                {item.value}
              </ArkPagination.Item>
            ) : (
              <ArkPagination.Ellipsis
                key={`ellipsis-${index}`}
                index={index}
                className="fux-pagination__ellipsis"
              >
                …
              </ArkPagination.Ellipsis>
            ),
          )
        }
      </ArkPagination.Context>
      <ArkPagination.NextTrigger
        className="fux-control"
        data-variant="secondary"
        aria-label={nextLabel}
      >
        {nextLabel}
      </ArkPagination.NextTrigger>
    </ArkPagination.Root>
  );
}

export {
  componentManifest,
  ariaComponentManifest,
  arkComponentManifest,
  ownerEntryPoints,
  componentUtilities,
  ownerFamilyCoverage,
} from "./manifest.js";
export type { ComponentManifestEntry, OwnerCoverageEntry } from "./manifest.js";
export * from "./ark-specialized.js";
export { Carousel, FloatingPanel, ImageCropper, SignaturePad, Tour } from "./ark-advanced.js";
