import type { FamilyPhotoCard } from "../../api";

export function photoDownloadFileName(photo: Pick<FamilyPhotoCard, "id" | "imageUrl" | "createdAt">, index: number) {
  const createdAt = new Date(photo.createdAt);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? "photo"
    : [
        createdAt.getUTCFullYear(),
        `${createdAt.getUTCMonth() + 1}`.padStart(2, "0"),
        `${createdAt.getUTCDate()}`.padStart(2, "0"),
        `${createdAt.getUTCHours()}`.padStart(2, "0"),
        `${createdAt.getUTCMinutes()}`.padStart(2, "0"),
        `${createdAt.getUTCSeconds()}`.padStart(2, "0"),
      ].join("");
  const safeId = photo.id.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";

  return `ilog-${timestamp}-${safeId}-${index + 1}${imageExtension(photo.imageUrl)}`;
}

function imageExtension(imageUrl: string) {
  const pathname = imageUrl.split("?", 1)[0] ?? "";
  const extension = pathname.match(/\.(avif|gif|heic|heif|jpe?g|png|webp)$/i)?.[0];

  return extension?.toLowerCase() ?? ".jpg";
}
