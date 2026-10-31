# Desain: Checkout dan akun wajib autentikasi

## Keputusan cakupan

Login diwajibkan untuk halaman akun dan seluruh transaksi. Beranda, pencarian,
katalog, destinasi, dan detail paket tetap dapat dilihat tanpa login. Checkout,
pembuatan/pembayaran order, detail dan receipt, daftar order, eSIM milik customer,
Wallet, Profil, My Trips, notifikasi, dan dukungan customer harus memiliki sesi
Better Auth yang diverifikasi server.

## Temuan sumber saat ini

- Checkout (`src/routes/checkout.$id.tsx`) membolehkan akun kosong; teks UI
  menyebut guest checkout.
- Handler `createGuestOrderDraftHandler` (`src/lib/guest-orders.server.ts`)
  menerima sesi opsional dan menyimpan order tanpa `customer_auth_subject`.
- Detail order, receipt, status order, dan eSIM masih menggabungkan akses member
  dengan token guest browser. `/order-status` serta `/api/order-recovery`
  menerbitkan token pemulihan tanpa sesi.
- Better Auth adalah pusat identitas di Djiwa Tentram melalui
  `https://api.djiwatentram.web.id/api/auth`. Travel memverifikasi cookie
  HttpOnly dari server dan menyimpan profil customer sendiri di tabel
  `customer_profiles`, dengan `auth_user_id` sama dengan `user.id` terverifikasi.
- Admin `/admin/customers` membaca profil Travel dan menampilkan kontak yang
  disamarkan; `/admin/orders` tetap menjadi jalur operasi order/fulfillment.
- MCP Helipod tidak tersedia pada sesi ini. API read VPS yang sudah terkonfigurasi
  menolak request dengan HTTP 403, dan endpoint Better Auth tidak memberi respons
  dalam batas koneksi yang dicoba. Karena itu, lokasi host/database pusat belum
  terverifikasi secara live; kontrak kode menunjukkan pemisahan Travel dan Tentram.

## Desain yang dipilih

1. **Satu kepemilikan server-side.** Setiap order baru harus dibuat hanya setelah
   sesi Better Auth berhasil diverifikasi. Server menetapkan
   `customer_auth_subject` dari `user.id`; browser tidak boleh mengirim owner.
   Profil Travel yang lengkap menyediakan email dan WhatsApp untuk invoice.
   Jika sesi/profil tidak ada, checkout mengarahkan customer ke login/profil
   sambil mempertahankan tujuan kembali ke paket.
2. **Tidak ada akses order berbasis bearer token.** Order list/detail/receipt/eSIM
   hanya membaca `customer_orders.customer_auth_subject = verified user.id`.
   Endpoint pembayaran customer memeriksa sesi dan kepemilikan. Webhook dan job
   internal tetap memakai autentikasi provider/server yang sudah ada.
3. **Pisahkan metadata pembayaran dari akses guest.** Tambahkan tabel netral
   `customer_order_payment_details` untuk `order_id`, `email`, `whatsapp`, dan
   `payment_method`. Migrasi additive menyalin metadata lama dari
   `guest_order_access`; seluruh invoice, settlement, dan payment query beralih
   ke tabel netral. Tabel token guest/recovery lama tidak dihapus pada migrasi
   ini, agar histori dan rollback tetap aman; aplikasi baru tidak menerbitkan
   atau menerima token tersebut.
4. **Transisi order lama tanpa pemilik.** Order lama dengan
   `customer_auth_subject IS NULL` tetap disimpan dan tetap terlihat bagi Admin.
   Setelah login, pemilik dapat mengimpor order lama dengan kode order, email
   akun yang sama dengan kontak order, dan WhatsApp kontak order. Server mengunci
   row, hanya mengklaim row yang masih tanpa pemilik, mencatat audit claim, lalu
   menautkannya ke subject sesi. Tidak ada pemulihan guest anonim atau akses
   order melalui token setelah transisi.
5. **Ringkasan data akun yang aman di Profil.** Tampilkan identitas sesi yang
   diverifikasi (penyedia Better Auth, email dan ID akun milik pengguna) serta
   status/isi profil Travel milik akun tersebut dan waktu pembaruan bila ada.
   Jangan menampilkan session ID/token/cookie, password/hash, kredensial DB,
   isi database auth pusat, atau data akun lain. Admin tetap hanya melihat
   proyeksi profil Travel yang disamarkan; auth server/database dimiliki
   Djiwa Tentram.

## Matriks customer/admin

| Surface | Entry dan hasil | Source of truth | Akses | Loading/error/empty | Bukti kontrak |
| --- | --- | --- | --- | --- | --- |
| Browsing | Beranda/katalog/detail paket tetap publik | Katalog Travel/provider | Publik | Katalog kosong/error tetap memakai state yang ada | route smoke publik |
| Checkout | Login → profil lengkap → buat order → bayar | Better Auth + `customer_profiles` + order/payment tables Travel | Sesi wajib; owner ditetapkan server | Tampilkan login, kelengkapan profil, kegagalan auth/server, dan retry tanpa order duplikat | tes checkout tanpa sesi ditolak; order tersimpan dengan subject sesi |
| Order/eSIM/receipt | Daftar dan buka order hanya milik akun | `customer_orders.customer_auth_subject` | Sesi wajib dan predicate owner di server | Tanpa sesi arahkan login; order milik orang lain tampak tidak ditemukan; error tidak membocorkan data | tes owner vs akun lain dan direct URL |
| Order lama | Login → impor order lama yang cocok → masuk daftar order akun | Row order lama + metadata kontak lama + `order_claim_events` | Sesi wajib; kode/email/WhatsApp cocok; claim atomik satu kali | Tidak cocok/terklaim tampil pesan netral; retry idempotent | tes claim berhasil, duplikasi, dan race/owner berbeda |
| Profil/auth | Tampilkan identitas sesi dan profil Travel akun saat ini | Better Auth API untuk identitas; `customer_profiles` untuk data Travel | Sesi wajib; query memakai user.id sesi | Memuat, profil belum dibuat, auth/API error, logout | tes data hanya milik subject sesi dan tidak mengandung rahasia |
| Admin customer/order | Admin mencari profil tersamarkan dan memproses semua order; order lama tanpa pemilik tetap dapat ditangani | DB Travel; auth admin yang sudah ada | `requireAdmin`; tidak ada akses ke DB auth pusat | Empty/error mengikuti state admin saat ini | tes admin read mask dan order lifecycle |

## Migrasi dan kompatibilitas

- Buat migrasi SQL bernomor baru dan additive untuk tabel metadata pembayaran,
  constraint/index, salinan data historis, dan grant runtime minimum.
- Ubah seluruh pembaca/penulis terkait Mayar, Djiwa Pay, settlement, detail
  order, receipt, dan provisioning agar membaca metadata netral serta menegakkan
  sesi/owner pada jalur customer.
- Hentikan `/order-status`, `/api/order-recovery`, pembuatan token baru,
  penyimpanan token guest di browser, dan penggabungan pembacaan guest/member.
- Jangan menghapus order, profil eSIM, token/hash lama, tabel lama, maupun audit.
  Cabut grant runtime tabel guest hanya setelah pencarian kode membuktikan tidak
  ada consumer dan migrasi salinan data berhasil.
- Djiwa Travel tidak membaca atau mengubah database Better Auth milik Tentram.
  Tidak ada perubahan pada aplikasi/VPS Tentram dalam desain ini.

## Rencana verifikasi

- Tes server: order gagal tertutup tanpa sesi; subjek selalu dari sesi; profil
  wajib lengkap; order tidak bisa dibaca/dibayar akun lain; claim historis hanya
  untuk order tanpa pemilik dan hanya satu kali.
- Tes klien/route: tidak ada copy atau CTA guest; checkout mengarahkan login;
  order, receipt, eSIM dan profil mempertahankan return path; browsing publik
  tetap berfungsi.
- Tes payment boundary: invoice/retry/verify milik sesi yang benar; settlement
  dan webhook idempotent; order existing dan metadata hasil backfill tetap
  terbaca.
- Cek migration SQL, schema, focused test suite, build, route auth, admin
  customer/order, dan bundle klien untuk memastikan tidak ada secret/session
  token.
- Sebelum release, verifikasi endpoint Better Auth dan target VPS/DB lewat
  akses Helipod dengan scope yang benar. Saat ini verifikasi live tersebut
  terhambat oleh HTTP 403 pada API VPS dan timeout pada endpoint auth.

## Pendekatan yang dipertimbangkan

- **Login untuk akun/transaksi (dipilih):** mempertahankan browsing publik,
  mengikat transaksi ke akun server-side, dan menyediakan impor terbatas untuk
  order pra-rilis.
- **Login wall global:** ditolak karena pengguna memilih browsing publik tetap
  tersedia dan katalog tidak memerlukan identitas.
- **Admin auth-directory:** di luar cakupan pilihan. Database autentikasi pusat
  berada di Djiwa Tentram; Travel hanya menampilkan identitas pengguna sendiri
  dan proyeksi customer Travel yang sudah disamarkan di Admin.
