import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ItineraryMap from "@/components/itinerary-map";
import type { MapPin } from "@/lib/itinerary-map";
import { countryBoundsFor } from "@/lib/trip-country-bounds";

// MapLibre needs WebGL, which jsdom does not have. The fake records what the component asks for:
// the constructor options (where the map opens) and the framing calls made once the style loads.
const fake = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const maps: FakeMap[] = [];
  class FakeMap {
    options: Record<string, unknown>;
    handlers = new Map<string, Handler[]>();
    fitBounds = vi.fn();
    easeTo = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      maps.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    once(event: string, handler: Handler) {
      return this.on(event, handler);
    }
    emit(event: string) {
      for (const handler of this.handlers.get(event) ?? []) handler();
    }
    addSource() {}
    addLayer() {}
    addImage() {}
    hasImage() {
      return false;
    }
    getSource() {
      return undefined;
    }
    getLayer() {
      return undefined;
    }
    getStyle() {
      return { layers: [] };
    }
    getZoom() {
      return 11;
    }
    getCanvas() {
      return { style: {} };
    }
    setLayoutProperty() {}
    loaded() {
      return true;
    }
    resize() {}
    remove() {}
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return { maps, FakeMap, FakeMarker };
});

vi.mock("maplibre-gl", () => ({
  Map: fake.FakeMap,
  Marker: fake.FakeMarker,
  setWorkerUrl: vi.fn(),
}));

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

const pin = (overrides: Partial<MapPin> = {}): MapPin => ({
  id: "a",
  n: 1,
  lat: 35.6586,
  lng: 139.7454,
  title: "Tokyo Tower",
  date: "2026-11-03",
  color: "#c4353b",
  muted: false,
  ...overrides,
});

async function mountMap(props: {
  pins: MapPin[];
  focusBounds?: ReturnType<typeof countryBoundsFor>;
}) {
  const view = render(
    <ItineraryMap
      pins={props.pins}
      routes={[]}
      activeId={null}
      onSelect={() => {}}
      styleUrl={STYLE}
      focusBounds={props.focusBounds ?? null}
    />,
  );
  await waitFor(() => expect(fake.maps).toHaveLength(1));
  const map = fake.maps[0]!;
  // Load the style so the framing effect runs, as it does in the browser.
  await act(async () => {
    map.emit("style.load");
  });
  return { map, view };
}

beforeEach(() => {
  fake.maps.length = 0;
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  }
});

afterEach(cleanup);

describe("agenda map framing", () => {
  it("opens on the destination country when no activity has a point", async () => {
    const japan = countryBoundsFor("JP")!;
    const { map } = await mountMap({ pins: [], focusBounds: japan });
    expect(map.options["bounds"]).toEqual(japan);
    expect(map.options).not.toHaveProperty("center");
    await waitFor(() =>
      expect(map.fitBounds).toHaveBeenCalledWith(japan, expect.objectContaining({ maxZoom: 10 })),
    );
  });

  it("keeps the Jakarta default when there is neither a point nor a country", async () => {
    const { map } = await mountMap({ pins: [] });
    expect(map.options).not.toHaveProperty("bounds");
    expect(map.options["center"]).toEqual([106.8, -6.2]);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("frames the activity points, not the country, once a point exists", async () => {
    const japan = countryBoundsFor("JP")!;
    const { map } = await mountMap({ pins: [pin()], focusBounds: japan });
    expect(map.options).not.toHaveProperty("bounds");
    expect(map.options["center"]).toEqual([139.7454, 35.6586]);
    await waitFor(() => expect(map.easeTo).toHaveBeenCalled());
    expect(map.fitBounds).not.toHaveBeenCalledWith(japan, expect.anything());
  });
});
