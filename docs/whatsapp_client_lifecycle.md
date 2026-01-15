# WhatsApp client lifecycle & troubleshooting

Dokumen ini menjelaskan siklus hidup WhatsApp client (whatsapp-web.js) di Cicero_V2 serta langkah troubleshooting saat stuck setelah QR dipindai.

## Lokasi kode utama

Lifecycle diatur di `src/service/waService.js` dan adapter di `src/service/wwebjsAdapter.js`.
Untuk mempermudah pencarian event di repo, string berikut wajib ada di file terkait:

```
waClient.on("qr"
change_state
```

## Event yang diharapkan

Urutan normal setelah inisialisasi (`waClient.connect()`):

1. `qr` → QR muncul di terminal.
2. `authenticated` → QR berhasil dipindai dan auth session tersimpan.
3. `ready` → client siap kirim/terima pesan.
4. `change_state` → biasanya `CONNECTED` atau `open` saat koneksi stabil.

Event yang perlu diperhatikan untuk failure:

- `auth_failure` → login gagal (biasanya session rusak/invalid).
- `disconnected` → client terputus dari WhatsApp Web.

Semua handler log menyertakan label:
- `[WA]` untuk client operator utama.
- `[WA-USER]` untuk user menu.
- `[WA-GATEWAY]` untuk gateway broadcast.

## Inisialisasi paralel

Pada startup, ketiga WhatsApp client (`waClient`, `waUserClient`, `waGatewayClient`)
diinisialisasi **secara paralel**. Artinya:

- QR/ready pada salah satu sesi tidak memblokir sesi lain untuk memulai koneksi.
- Log error tetap terpisah per label (`[WA]`, `[WA-USER]`, `[WA-GATEWAY]`) agar mudah
  melacak sesi yang bermasalah.
- Fallback readiness (`getState()` setelah ~60 detik) tetap dijadwalkan untuk semua
  client segera setelah inisialisasi dimulai.

## Lokasi penyimpanan auth

Adapter `src/service/wwebjsAdapter.js` memakai `LocalAuth` dan menyimpan session di:

- Default: `~/.cicero/wwebjs_auth/session-<clientId>`
- Override: `WA_AUTH_DATA_PATH` (env) → path absolut, tetap menghasilkan folder `session-<clientId>`.

Pastikan path ini writable oleh user yang menjalankan service.

## Fallback saat authenticated tapi tidak ready

Jika event `authenticated` muncul namun `ready` tidak datang dalam `WA_AUTH_READY_TIMEOUT_MS`
(default 45 detik), sistem akan:

1. Log warning dengan label client.
2. Coba `isReady()` / `getState()`.
3. Jika masih belum siap, trigger `connect()` ulang.

Ini membantu mengatasi kondisi “stuck setelah QR” tanpa restart manual.

## Arti state `unknown/null` dan recovery otomatis

Pada fallback readiness, `getState()` dapat mengembalikan `null`/`undefined` ketika session
belum siap atau ada glitch sementara. Adapter akan menormalisasi nilai tersebut menjadi
`unknown`. Ketika state `unknown` terdeteksi, sistem akan:

1. Log warning seperti `[WA] getState returned unknown`.
2. Melakukan retry `getState()` dengan backoff ringan (mis. 2 detik lalu 4 detik).
3. Jika masih `unknown` setelah retry, melakukan `connect()` ulang secara terbatas
   (maksimal beberapa kali per client) agar tidak loop tanpa batas.

## Checklist troubleshooting

1. **Periksa log event**
   - Pastikan ada `qr`, `authenticated`, `ready`, dan `change_state`.
   - Jika ada `auth_failure`, hapus session folder dan scan ulang.

2. **Cek auth path**
   - Pastikan `WA_AUTH_DATA_PATH` (jika diset) writable.
   - Default path: `~/.cicero/wwebjs_auth/`.

3. **Stuck setelah authenticated**
   - Lihat warning fallback: “Authenticated but no ready event”.
   - Jika ada warning `getState returned unknown`, tunggu retry/backoff selesai.
     Sistem akan mencoba `connect()` ulang secara otomatis jika state tetap `unknown`.
   - Pastikan network untuk WhatsApp Web tidak diblokir.

4. **Sering disconnect**
   - Pastikan session valid dan host tidak sleep.
   - Periksa log `disconnected` untuk reason.

## Referensi kode

- `src/service/waService.js`: event handler `qr`, `authenticated`, `auth_failure`, `ready`, `change_state`, `disconnected`.
- `src/service/wwebjsAdapter.js`: konfigurasi `LocalAuth`, `WA_AUTH_DATA_PATH`, dan penanganan writable path.
