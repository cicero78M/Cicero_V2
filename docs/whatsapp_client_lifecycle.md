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

Tidak ada lagi jalur fallback/retry berlapis di service (`getState()` polling, fallback readiness monitor, hard-init retry loop, connect in-flight timeout loop).

## Peran adapter vs service

### Adapter (`wwebjsAdapter`)

- Menjalankan koneksi awal (`connect`).
- Menjalankan reinitialize saat diperlukan.
- Menangani kebijakan internal pemulihan koneksi/session.
- Meneruskan event lifecycle ke consumer (`waService`) secara konsisten.

### Service (`waService`)

- Tidak memanggil retry tambahan di luar startup `client.connect()`.
- Tidak melakukan fallback readiness berbasis `getState()`.
- Hanya memperbarui readiness state berdasarkan event resmi.
- Menunda pemrosesan pesan ketika belum ready dan memutar ulang saat `ready`.

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
2. Jika `auth_failure` berulang, cek integritas auth path (`WA_AUTH_DATA_PATH`) dan sesi terkait.
3. Jika `disconnected` berulang, cek log adapter untuk penyebab reinitialize/recovery.
4. Gunakan `GET /api/health/wa` untuk verifikasi status readiness masing-masing client.
