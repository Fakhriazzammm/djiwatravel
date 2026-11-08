import { useEffect } from "react";

const PARAM = "flightSearch";

/**
 * The Travelpayouts White Label widget: its search form and its results, drawn into the two
 * elements below by the partner's script. The script reads those elements, and the page address,
 * when it runs: with `?flightSearch=<code>` it fills the form (and searches) for us. This app
 * changes pages without a reload, so every mount puts the code in the address, adds a fresh copy of
 * the script (a cache buster makes the browser run the module again) and undoes both on the way
 * out. Only mounted after the visitor agreed to load third-party content.
 */
export function TravelpayoutsWidget({
  scriptSrc,
  code,
}: {
  scriptSrc: string;
  /** The search to fill in, as `whiteLabelSearchCode` builds it; null leaves the form as the widget starts. */
  code: string | null;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const had = url.searchParams.get(PARAM);
    if (code) {
      url.searchParams.set(PARAM, code);
    } else {
      url.searchParams.delete(PARAM);
    }
    // Keep the router's own history entry; only the query string changes.
    window.history.replaceState(window.history.state, "", url);

    const script = document.createElement("script");
    script.type = "module";
    script.async = true;
    script.src = `${scriptSrc}&r=${Date.now()}`;
    script.dataset["travelpayoutsWidget"] = "1";
    document.head.appendChild(script);

    return () => {
      script.remove();
      const leaving = new URL(window.location.href);
      if (leaving.searchParams.get(PARAM) === code) {
        if (had) leaving.searchParams.set(PARAM, had);
        else leaving.searchParams.delete(PARAM);
        window.history.replaceState(window.history.state, "", leaving);
      }
    };
  }, [scriptSrc, code]);

  return (
    <div className="space-y-3" data-testid="tpwl-widget">
      <div id="tpwl-search" />
      <div id="tpwl-tickets" />
    </div>
  );
}
