import { useEffect, useState } from "react";
import { safePhotoUrl } from "@/lib/safe-photo-url";

/**
 * Account photo. The image comes straight from the Google sign-in (Better Auth `user.image`);
 * the app never stores or uploads it. A missing, blocked, or failed photo falls back to the
 * initial so the slot never collapses.
 */
export function ProfileAvatar({
  name,
  image,
  size = 62,
}: {
  name?: string | null | undefined;
  image?: string | null | undefined;
  size?: number;
}) {
  const src = safePhotoUrl(image);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = name?.trim().slice(0, 1).toUpperCase() || "T";
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#ff8b94] to-brand-red text-[26px] font-semibold text-white"
      style={{ width: size, height: size }}
      data-testid="profile-avatar"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          // Google photo hosts reject requests that carry our referrer.
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
