import { useEffect, useRef, useState } from "react";

const MIN_HEIGHT = 320;
const MAX_HEIGHT = 12000;

/**
 * The Travelpayouts White Label results, in a same-origin frame (`/tiket-widget.html`). The widget's
 * stylesheet resets margin, padding and font on html, body, div and most tags, in a cascade layer
 * that beats Tailwind, and stays after the script is gone; in the app page it turned the whole app
 * into Times with no spacing. A frame keeps that reset to itself. The frame page reports its height,
 * so the results scroll with the app page. Only mounted after the visitor agreed to load
 * third-party content.
 */
export function TravelpayoutsWidget({ src }: { src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (data?.type !== "djiwa-tpwl-height" || typeof data.height !== "number") return;
      setHeight(Math.min(Math.max(Math.round(data.height), MIN_HEIGHT), MAX_HEIGHT));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      src={src}
      title="Semua penerbangan"
      style={{ height }}
      referrerPolicy="strict-origin-when-cross-origin"
      className="block w-full rounded-2xl border-0"
    />
  );
}
