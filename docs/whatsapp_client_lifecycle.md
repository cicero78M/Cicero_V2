# WhatsApp client lifecycle & troubleshooting

Dokumen ini menjelaskan lifecycle WhatsApp client pada Cicero_V2 setelah penyederhanaan alur: adapter menjadi sumber tunggal lifecycle koneksi, sedangkan service hanya mengonsumsi event untuk readiness state.

## Lokasi kode utama

- `src/service/wwebjsAdapter.js` → single source of truth untuk `connect()`, `reinitialize()`, `disconnect()`, serta recovery internal adapter.
- `src/service/waService.js` → konsumsi event lifecycle untuk update readiness (`ready`, `awaitingQrScan`, `lastAuthFailureAt`, dst).

## Kontrak event lifecycle

`waService` hanya mendengarkan event berikut:

1. `qr`
2. `authenticated`
3. `ready`
4. `disconnected`
5. `auth_failure`

Tidak ada lagi jalur fallback/retry berlapis di service (`getState()` polling untuk recovery, fallback readiness monitor, hard-init retry loop, connect in-flight timeout loop).

`getState()` kini dibatasi hanya untuk observability (`GET /api/health/wa`) dan logging diagnostik periodik, tanpa side-effect operasional (tidak memicu reinit/reconnect otomatis).

## Peran adapter vs service

### Adapter (`wwebjsAdapter`)

- Menjalankan koneksi awal (`connect`).
- Menjalankan reinitialize saat diperlukan.
- Menangani kebijakan internal pemulihan koneksi/session.
- Meneruskan event lifecycle ke consumer (`waService`) secara konsisten.

### Service (`waService`)

- Tidak memanggil retry tambahan di luar startup `client.connect()`.
- Tidak melakukan fallback readiness operasional berbasis `getState()`.
- Hanya memperbarui readiness state berdasarkan event resmi.
- Menunda pemrosesan pesan ketika belum ready dan memutar ulang saat `ready`.

## Sumber kebenaran readiness final

Readiness final mengikuti event lifecycle berikut:

- `ready` atau `change_state(CONNECTED|open)` → `ready = true`
- `disconnected` atau `auth_failure` → `ready = false`

Event observability seperti hasil `getState()` hanya dicatat sebagai `observedState` untuk endpoint health dan log diagnostik.

## Diagram transisi state sederhana

```text
            +-------------------+
            |   INITIALIZED     |
            |   ready = false   |
            +---------+---------+
                      |
                      | ready / change_state(CONNECTED|open)
                      v
            +-------------------+
            |      READY        |
            |   ready = true    |
            +----+---------+----+
                 |         |
                 |         |
    disconnected |         | auth_failure
                 |         |
                 v         v
            +-------------------+
            |     NOT_READY     |
            |   ready = false   |
            +-------------------+
```

## Guard single transition in-flight

Untuk tiap client (`WA`, `WA-USER`, `WA-GATEWAY`), service menerapkan guard transisi tunggal:

- Bila transisi lifecycle sedang berjalan (mis. `disconnected`), event berikutnya (mis. `auth_failure`) tidak diproses paralel.
- Event kedua diantrekan dan dieksekusi setelah transisi pertama selesai.
- Tujuan: mencegah race condition state readiness ketika event failure muncul berdekatan.

## Urutan event normal

1. `qr` → QR ditampilkan ke terminal.
2. `authenticated` → sesi diterima.
3. `ready` → client siap menerima/mengirim pesan.

Event failure yang penting:

- `auth_failure` → auth gagal.
- `disconnected` → koneksi terputus.

## Timeout readiness

`waitForWaReady` / `waitForClientReady` menunggu event `ready` dengan timeout konfigurabel:

- `WA_READY_TIMEOUT_MS` (default `60000`)
- `WA_GATEWAY_READY_TIMEOUT_MS` (default mengikuti `WA_READY_TIMEOUT_MS`)
- override per instance tetap bisa lewat `client.readyTimeoutMs`

Saat timeout terjadi, error menyertakan konteks readiness (`label`, `clientId`, `sessionPath`, `awaitingQrScan`, `lastDisconnectReason`, `lastAuthFailureAt`).

## Perilaku pengiriman pesan (`wrapSendMessage`)

Untuk setiap client WA (`WA`, `WA-USER`, `WA-GATEWAY`), `wrapSendMessage` menerapkan aturan berikut:

1. **Antrean per client** memakai `PQueue` dengan `concurrency: 1`.
2. **Readiness gate** wajib lolos lewat `waitForWaReady()` sebelum `sendMessage` dijalankan.
3. **Eksekusi kirim satu kali** (`original.sendMessage`) tanpa retry otomatis, tanpa backoff, dan tanpa jitter.
4. Jika kirim gagal, service:
   - melempar **error asli** (tidak dibungkus error baru),
   - menambahkan metadata `sendFailureMetadata` berisi `jid`, `clientLabel`, dan `messageType`,
   - menulis log terstruktur `event=wa_send_message_failed` plus metrik kegagalan per client (`failed`, `lastFailureAt`).

Dengan kontrak ini, keputusan retry/fallback manual berada di caller atau lapisan orkestrasi yang memanggil service.


## Kebijakan path session & lock recovery (terbaru)

- `LocalAuth` memakai satu `dataPath` statis per process: `WA_AUTH_DATA_PATH` (atau default `~/.cicero/wwebjs_auth` bila env kosong).
- Tidak ada lagi fallback dinamis yang memindahkan `userDataDir`/`dataPath` saat lock aktif.
- Saat startup, adapter memvalidasi writable path untuk `<WA_AUTH_DATA_PATH>/session-<clientId>`.
  - Jika path invalid/tidak writable, init dihentikan dengan error terstruktur `WA_WWEBJS_SESSION_PATH_INVALID` dan remediation jelas di message/details.
- Saat lock aktif terdeteksi (`SingletonLock`/`SingletonSocket` masih dipakai proses lain), recovery langsung fail-fast dengan error terstruktur `WA_WWEBJS_LOCK_ACTIVE`.
  - Adapter tidak melakukan perpindahan path session.
  - Remediation: hentikan proses Chromium lama yang masih memakai session, atau gunakan `WA_AUTH_DATA_PATH` berbeda per process.

## Endpoint status readiness

Endpoint:

- `GET /api/health/wa`

Field utama per client:

- `ready`
- `awaitingQrScan`
- `lastDisconnectReason`
- `lastAuthFailureAt`
- `fatalInitError`
- `puppeteerExecutablePath`
- `sessionPath`

## Troubleshooting cepat

1. Pastikan urutan log event terlihat: `qr` → `authenticated` → `ready`.
2. Jika startup gagal dengan `WA_WWEBJS_SESSION_PATH_INVALID`, perbaiki permission/ownership `WA_AUTH_DATA_PATH` atau arahkan env ke path yang writable lalu restart.
3. Jika `disconnected` berulang dan muncul `WA_WWEBJS_LOCK_ACTIVE`, hentikan proses Chromium lama yang masih menahan lock lalu jalankan ulang service (tanpa mengubah path session secara dinamis).
4. Gunakan `GET /api/health/wa` untuk verifikasi status readiness masing-masing client.
