# Resilient eSIM Catalog Design

## Intent

Tampilkan seluruh negara yang pernah berhasil dimuat dari katalog eSIMAccess, tanpa kembali ke 13 seed destinations ketika provider lambat atau sementara gagal. Paket, harga, dan sellability tetap berasal dari snapshot katalog provider dan diperbarui melalui stale-while-revalidate.

## Goals

- Persist global catalog snapshot di file privat VPS.
- Serve the last valid snapshot when the provider is unavailable, including beyond the short stale window.
- Refresh the snapshot automatically on normal reads and server warm-up.
- Keep fresh package lookup for checkout unchanged.

## Non-goals

- Tidak menambah negara tanpa paket provider.
- Tidak memindahkan katalog ke client bundle.
- Tidak mengubah ownership, order, atau payment flow.

## Approach

Gunakan cache katalog yang sudah ada. File store default aktif hanya di production dan disimpan di `.data/reseller-catalog.json`, di luar `.output` sehingga atomic deploy tidak menghapusnya. Cache normal tetap TTL 5 menit dan stale-while-revalidate 15 menit; jika refresh gagal, snapshot terakhir tetap dapat dibaca untuk browse. Jalur checkout dengan `{ fresh: true }` tetap menolak data provider yang gagal.

## Constraints

- Snapshot berisi data server-only dan permission file `0600`.
- Deploy harus mempertahankan `.data` di VPS.
- Regression tests harus membuktikan fallback snapshot lama dan fresh checkout behavior.
