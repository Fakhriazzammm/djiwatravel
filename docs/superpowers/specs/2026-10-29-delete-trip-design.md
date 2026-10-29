# Hapus Trip

## Intent

Pemilik dapat menghapus satu perjalanan dari halaman detail tanpa meninggalkan data turunan yatim.

## Scope

- Tambahkan aksi “Hapus perjalanan” di halaman detail.
- Minta konfirmasi sebelum menghapus.
- Hapus hanya trip milik user yang sedang login.
- Hapus data turunan trip: kategori budget, pengeluaran, itinerary, checklist, booking, tempat tersimpan, dokumen, dan mapping event Calendar.
- Setelah berhasil, kembali ke `/my-trips`.

## Approach

Pendekatan yang dipilih adalah mutation server-side terotorisasi dengan satu transaksi database dan konfirmasi UI. Penghapusan langsung di server menjaga ownership dan atomisitas; penghapusan hanya trip utama akan meninggalkan data yatim.

## Non-goals

Tidak ada soft-delete, undo, atau penghapusan akun pengguna.
