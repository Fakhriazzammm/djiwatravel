# Djiwa Pay In-App Browser Design

## Intent

Memberi pengguna akses cepat ke `https://djiwapay.web.id` dari halaman `/wallet` tanpa menghilangkan navbar bottom Djiwa Travel atau fitur saldo, top up, dan riwayat yang sudah ada.

## Goals

- Menambahkan tombol `Buka Djiwa Pay` di halaman Wallet.
- Membuka Djiwa Pay dalam sheet/modal in-app browser berbasis iframe.
- Mempertahankan navbar bottom Djiwa Travel di luar sheet.
- Menyediakan fallback `Buka di browser` untuk login, pembayaran, atau browser yang menolak iframe.
- Menyediakan kontrol tutup yang accessible.

## Non-goals and constraints

- Tidak mengganti atau menghapus pembacaan saldo, top up, maupun riwayat Wallet.
- Tidak mengasumsikan sesi/cookie Djiwa Travel berlaku di domain Djiwa Pay.
- Tidak menyimpan credential atau token di frontend.
- Iframe lintas-origin dapat dibatasi oleh browser atau aplikasi Djiwa Pay; fallback eksternal harus selalu tersedia.

## Approaches

1. Redirect/tab baru: paling kompatibel, tetapi pengguna meninggalkan konteks Wallet.
2. Sheet iframe dengan fallback eksternal: dipilih karena mempertahankan navbar dan konteks Wallet, sambil tetap menyediakan jalur kompatibel untuk flow yang tidak bisa berjalan di iframe.
3. Integrasi penuh lintas domain: membutuhkan perubahan terpisah pada Djiwa Pay, shared auth, dan navigasi; terlalu besar untuk perubahan ini.

## Acceptance criteria

- Wallet yang berhasil dimuat menampilkan tombol `Buka Djiwa Pay`.
- Klik tombol membuka dialog berjudul `Djiwa Pay` dengan iframe menuju URL kanonik.
- Dialog memiliki tombol tutup dan link `Buka di browser` dengan `target="_blank"`.
- Menutup dialog mengembalikan pengguna ke Wallet tanpa mengubah data Wallet.
