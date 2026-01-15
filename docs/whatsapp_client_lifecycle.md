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
  client segera setelah inisialisasi dimulai, dan akan berhenti otomatis ketika
  event `ready` atau `change_state` menandai client siap.
- `connect()` dapat **reject** (hard failure) jika inisialisasi gagal, misalnya setelah
  retry fallback webVersion tetap gagal. Saat ini, `waService.js` menandai client
  sebagai tidak siap dan menjadwalkan reinit dengan backoff lebih panjang
  (hingga beberapa menit), serta akan **abort** setelah sejumlah retry tertentu.

## Lokasi penyimpanan auth

Adapter `src/service/wwebjsAdapter.js` memakai `LocalAuth` dan menyimpan session di:

- Default: `~/.cicero/wwebjs_auth/session-<clientId>`
- Override: `WA_AUTH_DATA_PATH` (env) → path absolut, tetap menghasilkan folder `session-<clientId>`.

Pastikan path ini writable oleh user yang menjalankan service.

## Fallback init untuk webVersionCache

Jika `client.initialize()` gagal dengan error yang mengandung `LocalWebCache.persist`
atau `Cannot read properties of null (reading '1')`, adapter akan:

1. Override `webVersionCache` menjadi `{ type: 'none' }` dan menghapus `webVersion`.
2. Mencatat warning dengan label `clientId` agar mudah ditelusuri.
3. Menyarankan pemeriksaan `WA_WEB_VERSION_CACHE_URL` dan/atau pengaturan `WA_WEB_VERSION`.
4. Mencoba `initialize()` ulang satu kali setelah fallback diterapkan.
5. Jika retry gagal, `connect()` akan reject sehingga caller dapat menandai
   kegagalan sebagai hard failure.

Langkah ini membantu ketika cache web version dari WhatsApp Web tidak kompatibel.

## Fallback saat authenticated tapi tidak ready

Jika event `authenticated` muncul namun `ready` tidak datang dalam `WA_AUTH_READY_TIMEOUT_MS`
(default 45 detik), sistem akan:

1. Log warning dengan label client.
2. Coba `isReady()` / `getState()`.
3. Jika masih belum siap, trigger `connect()` ulang.

Ini membantu mengatasi kondisi “stuck setelah QR” tanpa restart manual.

## Fallback readiness (retry `getState()` dan reinit)

Pada fallback readiness, `getState()` bisa mengembalikan status selain `CONNECTED/open`
ketika koneksi belum stabil atau ada glitch sementara. Sistem akan:

1. Sebelum memanggil `getState()`, melakukan fallback `isReady()` (atau cek `client.info`)
   agar client yang sudah siap tetap ditandai ready walau event `ready` terlewat.
2. Melakukan retry `getState()` beberapa kali (maksimal 3x) dengan jeda acak 15–30 detik.
3. Jika tetap belum `CONNECTED/open`, log alasan state terakhir dan panggil `connect()`
   ulang secara terbatas (maksimal beberapa kali per client) agar tidak loop tanpa batas.
4. Proses retry ini otomatis berhenti jika event `ready` atau `change_state` sudah terjadi.

## Checklist troubleshooting

1. **Periksa log event**
   - Pastikan ada `qr`, `authenticated`, `ready`, dan `change_state`.
   - Jika ada `auth_failure`, hapus session folder dan scan ulang.

2. **Cek auth path**
   - Pastikan `WA_AUTH_DATA_PATH` (jika diset) writable.
   - Default path: `~/.cicero/wwebjs_auth/`.

3. **Stuck setelah authenticated**
   - Lihat warning fallback: “Authenticated but no ready event”.
   - Jika ada warning `getState=<state>`, tunggu retry selesai.
     Sistem akan mencoba `connect()` ulang secara otomatis jika state tetap belum
     `CONNECTED/open`.
   - Pastikan network untuk WhatsApp Web tidak diblokir.

4. **Sering disconnect**
   - Pastikan session valid dan host tidak sleep.
   - Periksa log `disconnected` untuk reason.

5. **connect() hard failure**
   - Periksa log `Initialization failed (hard failure)` dan root cause error.
   - Tunggu retry backoff yang lebih panjang, atau lakukan reinit manual jika perlu.
   - Pastikan konfigurasi `WA_WEB_VERSION` / `WA_WEB_VERSION_CACHE_URL` valid dan
     path `WA_AUTH_DATA_PATH` writable.

## Referensi kode

- `src/service/waService.js`: event handler `qr`, `authenticated`, `auth_failure`, `ready`, `change_state`, `disconnected`.
- `src/service/wwebjsAdapter.js`: konfigurasi `LocalAuth`, `WA_AUTH_DATA_PATH`, dan penanganan writable path.
