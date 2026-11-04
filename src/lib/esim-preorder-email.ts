export type PreorderEmailState = "awaiting_balance" | "processing" | "refund_review" | "ready";

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function preorderEmailCopy(state: PreorderEmailState) {
  const copy: Record<PreorderEmailState, { subject: string; title: string; message: string }> = {
    awaiting_balance: {
      subject: "Pre-order eSIM diterima — Djiwa Travel",
      title: "Pre-order kamu sudah dibayar",
      message:
        "Kami sedang menunggu saldo eSIM Access yang cukup. Kami akan mencoba membeli paket secara otomatis dan mengabari kamu saat eSIM siap.",
    },
    processing: {
      subject: "Paket eSIM sedang dibeli — Djiwa Travel",
      title: "Paket eSIM sedang diproses",
      message:
        "Saldo sudah mencukupi dan pembelian paket sedang dikirim ke eSIM Access. Kami akan mengirim kabar lagi setelah profil eSIM siap.",
    },
    refund_review: {
      subject: "Pre-order eSIM menunggu tindak lanjut Admin — Djiwa Travel",
      title: "Pre-order sedang ditinjau Admin",
      message:
        "Batas pemrosesan 3 hari telah terlewati. Pesanan kamu sudah masuk antrean Admin untuk ditindaklanjuti. Tim kami akan menghubungi kamu mengenai penyelesaian atau pengembalian dana.",
    },
    ready: {
      subject: "eSIM kamu siap dipasang — Djiwa Travel",
      title: "eSIM kamu siap dipasang",
      message:
        "Profil eSIM sudah siap. Masuk ke Djiwa Travel dan buka pesanan ini untuk melihat QR code dan panduan pemasangan.",
    },
  };
  return copy[state];
}

export function buildPreorderEmail(input: {
  state: PreorderEmailState;
  publicOrderCode: string;
  href: string;
}) {
  const copy = preorderEmailCopy(input.state);
  const title = escapeEmailHtml(copy.title);
  const message = escapeEmailHtml(copy.message);
  const code = escapeEmailHtml(input.publicOrderCode);
  const href = escapeEmailHtml(input.href);
  return {
    subject: copy.subject,
    text: `${copy.title}\n\n${copy.message}\n\nKode pesanan: ${input.publicOrderCode}\n\nBuka Djiwa Travel: ${input.href}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124"><h1 style="font-size:20px">${title}</h1><p>${message}</p><p><strong>Kode pesanan:</strong> ${code}</p><p><a href="${href}" style="display:inline-block;padding:12px 18px;background:#b4232f;color:#fff;text-decoration:none;border-radius:10px">Buka Djiwa Travel</a></p></div>`,
  };
}
