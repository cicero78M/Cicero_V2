# Panduan RabbitMQ
*Last updated: 2025-06-18*

Dokumen ini menjelaskan cara mengaktifkan dan menggunakan RabbitMQ pada **Cicero_V2**. RabbitMQ dipakai untuk memproses pekerjaan berat secara asynchronous agar dashboard tetap responsif.

## 1. Konfigurasi

1. Pastikan layanan RabbitMQ sudah terinstal dan berjalan.
2. Atur URL koneksi pada variabel lingkungan `AMQP_URL` di file `.env` (contohnya `amqp://localhost`).

## 2. Fungsi Utama

File `src/service/rabbitMQService.js` menyediakan tiga fungsi utama:

- `initRabbitMQ()` – membuat koneksi dan channel.
- `publishToQueue(queue, msg)` – mengirim pesan JSON ke antrean.
- `consumeQueue(queue, onMessage)` – mengambil pesan dari antrean dan menjalankan callback.

## 3. Contoh Worker

```javascript
import { consumeQueue } from './src/service/rabbitMQService.js';

async function handle(data) {
  console.log('Data diterima:', data);
}

consumeQueue('jobs', handle);
```

Worker di atas mengambil pesan dari queue `jobs` dan memprosesnya satu per satu.

## 4. Tips

- Jalankan worker di proses terpisah menggunakan PM2 atau supervisor lain.
- Pantau antrean dan koneksi RabbitMQ secara berkala agar tidak terjadi bottleneck.

---
Lihat README pada bagian *High Volume Queue (RabbitMQ)* untuk gambaran singkat.
