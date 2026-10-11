import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, useRouterState, type ErrorComponentProps,
} from "@tanstack/react-router";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PageTransition } from "../components/motion-primitives";
import { NavProgress } from "../components/nav-progress";
import { AppSplash } from "../components/app-splash";
import { TransitionLoader } from "../components/transition-loader";
import { easeIos } from "../lib/motion";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Ke Home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Halaman gagal dimuat</h1>
        <button onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Coba lagi</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1f2d5c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Djiwa Travel" },
      { title: "Djiwa Travel — eSIM untuk traveler Indonesia" },
      { name: "description", content: "Internet luar negeri yang simpel. Bayar pakai QRIS, eSIM langsung siap." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Djiwa Travel" },
      { property: "og:locale", content: "id_ID" },
      { property: "og:image", content: "https://djiwatravel.com/og/default.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://djiwatravel.com/og/default.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig transition={{ duration: 0.34, ease: easeIos }} reducedMotion="user">
        <NavProgress />
        {/* Server-rendered, so the first paint is never a blank white page. */}
        <AppSplash />
        {/* Later page changes get one centred loader. */}
        <TransitionLoader />
        <AnimatedOutlet />
      </MotionConfig>
    </QueryClientProvider>
  );
}

/**
 * Crossfade + slide between pages. `mode="wait"` keeps only one page mounted, so
 * exit finishes before enter starts (no overlapping scroll positions).
 */
function AnimatedOutlet() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={pathname} pathname={pathname}>
        <Outlet />
      </PageTransition>
    </AnimatePresence>
  );
}
