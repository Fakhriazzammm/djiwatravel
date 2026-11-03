import type { FaqItem } from "@/lib/geo";

/**
 * Server-rendered plain-text answer + FAQ. AI answer engines quote passages, not interactive UI,
 * so the same facts that feed the FAQPage JSON-LD are also visible, crawlable text for customers.
 */
export function GeoAnswer({
  heading,
  answer,
  faqs,
  updatedLabel,
}: {
  heading: string;
  answer?: string | undefined;
  faqs: FaqItem[];
  updatedLabel?: string | undefined;
}) {
  return (
    <section className="mt-4 space-y-3 pb-6" aria-labelledby="geo-answer-heading">
      <h2 id="geo-answer-heading" className="text-lg font-bold">
        {heading}
      </h2>
      {answer ? <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p> : null}
      <div className="divide-y divide-border rounded-2xl border border-border/70 bg-surface">
        {faqs.map((faq) => (
          <details key={faq.question} className="group px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              {faq.question}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
          </details>
        ))}
      </div>
      {updatedLabel ? <p className="text-xs text-muted-foreground">{updatedLabel}</p> : null}
    </section>
  );
}
