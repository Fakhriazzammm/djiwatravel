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
