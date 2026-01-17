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

Alur khusus logout/unpaired:

- Jika `disconnected` membawa reason **logout/unpaired**, adapter akan **menghapus**
  folder auth `session-<clientId>` dan melakukan `reinitialize()` agar QR baru muncul.
- Setelah logout/unpaired, sistem akan menunggu QR discan ulang sebelum melakukan
  fallback `getState()`/reconnect otomatis untuk mencegah loop status check.
- Reason yang dianggap logout/unpaired saat ini: `LOGGED_OUT`, `UNPAIRED`,
  `CONFLICT`, `UNPAIRED_IDLE`.

Semua handler log menyertakan label:
- `[WA]` untuk client operator utama.
- `[WA-USER]` untuk user menu.
- `[WA-GATEWAY]` untuk gateway broadcast.

## Agregasi message & deduplikasi

`handleIncoming` di `src/service/waEventAggregator.js` dipakai untuk menghindari
duplikasi pesan ketika beberapa adapter aktif. Deduplikasi memakai kombinasi
`remoteJid`/`from` dan `id` pesan. Jika salah satu nilai tidak tersedia,
pesan akan langsung diproses tanpa deduplikasi agar pesan tetap diproses
meskipun adapter tidak mengirim `id` yang lengkap.

## Guard error sesi menu WA

`src/service/waService.js` kini memvalidasi handler menu WhatsApp untuk
`oprrequest`, `dirrequest`, dan `clientrequest` sebelum mengeksekusi langkah
yang tersimpan di sesi. Jika step tidak valid atau handler melempar error,
bot akan:

- Membersihkan sesi agar tidak terjebak di langkah yang rusak.
- Mengirim pesan peringatan/kegagalan yang aman ke user.
- Mencatat log error tanpa menghentikan proses sehingga request WA tidak
  memicu restart server karena crash handler.

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

Catatan penting: nilai `clientId` untuk `waGatewayClient` mempertahankan casing
yang diberikan di `GATEWAY_WA_CLIENT_ID` (tidak di-lowercase sebelum
`createWwebjsClient`). Normalisasi ke lowercase hanya dipakai untuk perbandingan
dan warning. Karena nama folder session mengikuti `clientId`, jaga agar casing
di env tetap konsisten untuk menghindari pembuatan session baru yang tidak
diinginkan.

Checklist operasional (casing & path):

1. Tentukan path auth yang aktif:
   - `WA_AUTH_DATA_PATH` jika di-set, atau default `~/.cicero/wwebjs_auth/`.
2. Periksa folder `session-<clientId>` yang sudah ada.
   - Jika ada `session-<clientId>` dengan casing tertentu, samakan
     `GATEWAY_WA_CLIENT_ID` **persis** dengan casing tersebut, atau rename folder
     `session-<clientId>` agar cocok dengan nilai env.
3. Pastikan nilai `GATEWAY_WA_CLIENT_ID` konsisten di semua konfigurasi proses
   (deployment, PM2/daemon, systemd, atau env file) agar casing tidak berubah saat
   restart.

Ketika logout/unpaired terjadi, folder `session-<clientId>` akan dibersihkan
agar sesi lama tidak tersisa dan QR baru dapat dipindai ulang.

## Profil browser per client (LocalAuth)

`LocalAuth` mengelola profil Puppeteer di dalam folder session per client
(`session-<clientId>`). Ini sudah memisahkan state browser antar client.
Jika ada beberapa proses yang menjalankan client dengan `clientId` sama,
pastikan `WA_AUTH_DATA_PATH` berbeda per proses agar tidak bentrok di folder
session yang sama.

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

## Recovery saat browser sudah berjalan (lock userDataDir)

Jika `initialize()` gagal dengan pesan seperti `browser is already running for ...`,
adapter akan:

1. Memanggil `client.destroy()` hanya jika Puppeteer sudah terinisialisasi (`pupBrowser`/`pupPage`).
   Jika belum, destroy dilewati dan hanya dicatat debug agar recovery tetap bersih.
2. Menghapus file lock Puppeteer (`SingletonLock`, `SingletonCookie`, `SingletonSocket`)
   di dalam folder `session-<clientId>` bila ada.
3. Menunggu backoff lebih panjang sebelum mencoba `initialize()` ulang.

Durasi backoff dapat diatur via `WA_WWEBJS_BROWSER_LOCK_BACKOFF_MS`
(default 20000ms). Ini mencegah retry yang terlalu agresif pada folder yang terkunci.

Timeout DevTools Protocol Puppeteer di whatsapp-web.js dapat diatur lewat
`WA_WWEBJS_PROTOCOL_TIMEOUT_MS` (default 120000ms). Ini memperbesar ambang
`Runtime.callFunctionOn` saat koneksi lambat; naikkan ke 180000ms atau lebih jika
host sering time out ketika melakukan evaluasi di halaman WhatsApp Web.

## Normalisasi opsi sendMessage

Adapter `wwebjsAdapter` selalu menormalkan parameter `options` untuk `sendMessage`
menjadi objek sebelum diteruskan ke `whatsapp-web.js`. Default internal `sendSeen`
diset `false` (kecuali caller eksplisit mengaktifkan) agar penandaan dibaca dilakukan
secara manual setelah chat tervalidasi. Ini mencegah error seperti
`Cannot read properties of undefined (reading 'markedUnread')` yang dapat muncul
saat opsi tidak dikirim atau bernilai `null` dari caller, sekaligus menghindari
`sendSeen` pada chat yang belum ter-hydrate. Jika payload teks tidak memiliki `text`,
adapter akan mengirim string kosong agar tetap kompatibel.

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
5. Jika status terakhir menandakan logout/unpaired, fallback readiness akan
   **menunggu QR discan ulang** sebelum mencoba `getState()` kembali.

## Guard readiness untuk `getNumberId`

Adapter `wwebjsAdapter` sekarang memastikan `getNumberId` hanya berjalan setelah
`WidFactory` ter-inject di `window.Store`. Helper `ensureWidFactory` akan:

1. Mengecek `client.pupPage` (atau `client.info?.wid` jika sudah siap).
2. Menjalankan `pupPage.evaluate` untuk memastikan `window.Store.WidFactory`
   tersedia dan menambahkan `toUserWidOrThrow` bila belum ada.
3. Mengembalikan `null` dan mencatat warning jika `WidFactory` belum tersedia,
   sehingga caller bisa retry setelah client benar-benar ready.

## Checklist troubleshooting

1. **Periksa log event**
   - Pastikan ada `qr`, `authenticated`, `ready`, dan `change_state`.
   - Jika ada `auth_failure`, hapus session folder dan scan ulang.

2. **Cek auth path**
   - Pastikan `WA_AUTH_DATA_PATH` (jika diset) writable.
   - Default path: `~/.cicero/wwebjs_auth/`.

3. **`Could not find Chrome` / `Could not find browser`**
   - whatsapp-web.js memakai Puppeteer untuk menjalankan Chrome.
   - Install Chrome lewat `npx puppeteer browsers install chrome` (menggunakan cache Puppeteer) atau via package OS (Chrome/Chromium).
   - Jika Chrome sudah terpasang atau path cache diubah, set `WA_PUPPETEER_EXECUTABLE_PATH`
     (prioritas) atau `PUPPETEER_EXECUTABLE_PATH`, dan/atau `PUPPETEER_CACHE_DIR`.
   - Contoh log yang sering muncul: `Error: Could not find Chrome (ver. 121.0.6167.85)` atau `Error: Could not find browser executable`.
   - Inisialisasi akan menganggap error ini sebagai fatal dan **melewati retry otomatis** sampai Chrome tersedia.

4. **Stuck setelah authenticated**
   - Lihat warning fallback: “Authenticated but no ready event”.
   - Jika ada warning `getState=<state>`, tunggu retry selesai.
     Sistem akan mencoba `connect()` ulang secara otomatis jika state tetap belum
     `CONNECTED/open`.
   - Pastikan network untuk WhatsApp Web tidak diblokir.

5. **Sering disconnect**
   - Pastikan session valid dan host tidak sleep.
   - Periksa log `disconnected` untuk reason.

6. **connect() hard failure**
   - Periksa log `Initialization failed (hard failure)` dan root cause error.
   - Tunggu retry backoff yang lebih panjang, atau lakukan reinit manual jika perlu.
   - Pastikan konfigurasi `WA_WEB_VERSION` / `WA_WEB_VERSION_CACHE_URL` valid dan
     path `WA_AUTH_DATA_PATH` writable.

## Referensi kode

- `src/service/waService.js`: event handler `qr`, `authenticated`, `auth_failure`, `ready`, `change_state`, `disconnected`.
- `src/service/wwebjsAdapter.js`: konfigurasi `LocalAuth`, `WA_AUTH_DATA_PATH`, dan penanganan writable path.
