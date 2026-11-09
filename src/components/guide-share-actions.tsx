import logoUrl from "@/assets/logo.png";
import { SocialShare } from "@/components/social-share";
import { renderBrandCard } from "@/lib/share-card";

export function GuideShareActions({ title, url }: { title: string; url: string }) {
  return (
    <div className="mt-4">
      <SocialShare
        url={url}
        text={`${title} — Djiwa Travel`}
        label="Bagikan panduan"
        makeImage={async () => {
          const blob = await renderBrandCard({
            kicker: "Panduan Djiwa Travel",
            title,
            link: url.replace(/^https?:\/\//, ""),
            logoUrl,
          });
          return new File([blob], "panduan-djiwa-travel.png", { type: "image/png" });
        }}
      />
    </div>
  );
}
