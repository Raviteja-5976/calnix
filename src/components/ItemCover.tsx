/* eslint-disable @next/next/no-img-element -- the source redirects to a signed storage link */
import type { Item } from "@/lib/types";

/** The AI image, or a stand-in while it is being made or if it failed. */
export function ItemCover({ item, className = "" }: { item: Item; className?: string }) {
  if (item.image_key) {
    return (
      <img
        className={`cover ${className}`}
        src={`/api/items/${item.id}/image?v=${encodeURIComponent(item.image_key.split("/").pop() ?? "")}`}
        alt=""
        loading="lazy"
      />
    );
  }
  return (
    <div className={`cover cover-empty band-${item.kind} ${item.ai_status === "pending" ? "is-pending" : ""} ${className}`} aria-hidden="true" />
  );
}
