import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { destinations } from "@/lib/catalog";

export const destinationLabel = (code: string | null) => {
  if (!code) return null;
  const hit = destinations.find((d) => d.code.toUpperCase() === code.toUpperCase());
  return hit ? `${hit.flag} ${hit.nameId}` : code;
};

/** Asks a guest to sign in without leaving the page. */
export function useRequireSignIn(signedIn: boolean) {
  const navigate = useNavigate();
  return (message: string) => {
    if (signedIn) return true;
    toast.message(message, {
      action: {
        label: "Masuk",
        onClick: () => void navigate({ to: "/profile", search: {} as never }),
      },
    });
    return false;
  };
}

/** Opens the phone's share sheet, or copies the link when there is none. */
export async function shareFeedPost(post: { id: string; body: string }) {
  const url = `${window.location.origin}/feeds/${post.id}`;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: "Feeds Djiwa Travel", text: post.body.slice(0, 100), url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Tautan disalin.");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.message(url);
  }
}
