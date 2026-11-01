import { Link } from "@tanstack/react-router";
import { PAY_ACTIONS, PAY_PPOB_ASSET, PAY_PPOB_SERVICES } from "@/lib/djiwa-pay-services";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const tile =
  "tap relative flex min-h-[96px] flex-col items-center rounded-2xl px-0.5 pb-2.5 pt-1.5 text-center";

/**
 * What the customer can do in Djiwa Pay. Travel only explains and links: every tile opens the
 * embedded Pay page, which runs the flow against the Pay-owned ledger.
 */
export function PayServicesCard() {
  return (
    <section aria-labelledby="wallet-pay-services-title">
      <div className="mb-2 mt-6 flex items-baseline justify-between px-4">
        <h2
          id="wallet-pay-services-title"
          className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Di Djiwa Pay
        </h2>
        <Link
          to="/wallet/pay"
          aria-label="Buka semua layanan Djiwa Pay"
          className={`tap -my-3 inline-flex min-h-11 items-center rounded-lg px-1 text-[14px] font-medium text-[#0a84ff] ${FOCUS}`}
        >
          Buka ›
        </Link>
      </div>
      <div className="overflow-hidden rounded-[20px] bg-surface">
        <div className="grid grid-cols-4 gap-0.5 px-1.5 pb-1.5 pt-3" role="list">
          {PAY_ACTIONS.map((action) => (
            <div key={action.id} role="listitem">
              {action.available ? (
                <Link
                  to="/wallet/pay"
                  aria-label={`${action.label}: buka di Djiwa Pay`}
                  className={`${tile} ${FOCUS}`}
                >
                  <img
                    src={action.asset}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="size-12 object-contain"
                  />
                  <span className="mt-1.5 text-[11px] font-semibold">{action.label}</span>
                  <span className="text-[10px] text-muted-foreground">{action.hint}</span>
                </Link>
              ) : (
                <div className={`${tile} opacity-70`} aria-label={`${action.label}, segera hadir`}>
                  <img
                    src={action.asset}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="size-12 object-contain grayscale"
                  />
                  <span className="mt-1.5 text-[11px] font-semibold">{action.label}</span>
                  <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    Segera
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 py-3 pl-4">
          <div className="flex items-center gap-2.5 pr-4">
            <img
              src={PAY_PPOB_ASSET}
              alt=""
              width={38}
              height={38}
              loading="lazy"
              decoding="async"
              className="size-[38px] object-contain"
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Bayar & beli (PPOB)</p>
              <p className="text-[12px] text-muted-foreground">
                Tagihan dan kebutuhan harian dari saldo
              </p>
            </div>
          </div>
          <ul
            className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pr-4"
            aria-label="Layanan PPOB"
          >
            {PAY_PPOB_SERVICES.map((name) => (
              <li key={name} className="shrink-0">
                <Link
                  to="/wallet/pay"
                  className={`tap inline-flex min-h-11 items-center rounded-full bg-secondary px-3.5 text-[13px] font-semibold ${FOCUS}`}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
