import { boundsOf } from "@/lib/itinerary-map";

type Pin = { id: string; n: number; lat: number; lng: number };

const W = 384;
const H = 118;
const PAD_X = 40;
const PAD_TOP = 40;
const PAD_BOTTOM = 22;

/**
 * Schematic route preview for the Home trip card. It draws the day's pins and dashed route on a
 * neutral map-style backdrop from their coordinates alone: no tiles, no MapLibre, no network, so
 * Home stays light. The full interactive map lives on the trip's Ringkas page.
 */
export function TripMiniRoute({ pins }: { pins: Pin[] }) {
  const bounds = boundsOf(pins);
  const [[minLng, minLat], [maxLng, maxLat]] = bounds ?? [
    [0, 0],
    [0, 0],
  ];
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  // Keep the real aspect ratio of the area so a long street does not look like a square.
  const scale = Math.min((W - PAD_X * 2) / spanLng, (H - PAD_TOP - PAD_BOTTOM) / spanLat);
  const midX = W / 2;
  const midY = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) / 2;
  const project = (pin: Pin) => ({
    x: pins.length === 1 ? midX : midX + (pin.lng - (minLng + maxLng) / 2) * scale,
    y: pins.length === 1 ? midY : midY - (pin.lat - (minLat + maxLat) / 2) * scale,
  });
  const points = pins.map(project);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      role="img"
      aria-label={`Rute ${pins.length} titik hari ini`}
    >
      <rect width={W} height={H} fill="#EEF0EA" />
      <path d={`M0 100 Q90 78 160 104 T${W} 88 V${H} H0Z`} fill="#CFE2EE" />
      <rect x="250" y="10" width="90" height="34" rx="9" fill="#D9E8CF" />
      <g stroke="#fff" strokeWidth="6" fill="none">
        <path d={`M0 46 H${W}`} />
        <path d={`M130 0 V${H}`} />
        <path d={`M0 84 L${W} 58`} />
        <path d={`M290 0 L315 ${H}`} />
      </g>
      {points.length > 1 && (
        <path
          d={points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
          stroke="#C4313A"
          strokeWidth="3"
          strokeDasharray="6 5"
          fill="none"
        />
      )}
      {pins.map((pin, i) => (
        <g key={pin.id} fontSize="11" fontWeight="700" textAnchor="middle">
          <circle
            cx={points[i]!.x}
            cy={points[i]!.y}
            r="12"
            fill="#C4313A"
            stroke="#fff"
            strokeWidth="2.5"
          />
          <text x={points[i]!.x} y={points[i]!.y + 4} fill="#fff">
            {pin.n}
          </text>
        </g>
      ))}
    </svg>
  );
}
