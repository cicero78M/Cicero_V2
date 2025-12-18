# Best Practices for Sending Files via WhatsApp Bot

Pengiriman file melalui bot WhatsApp memerlukan beberapa langkah agar aman dan dapat diandalkan. Ikuti panduan berikut saat mengirim dokumen melalui helper `sendWAFile`:

1. **Normalisasi Nomor**  
   Gunakan `formatToWhatsAppId` untuk mengubah nomor menjadi ID WhatsApp yang valid. Fungsi ini memastikan awalan `62` dan menambahkan suffix `@c.us`.

2. **Validasi WID**  
   Sebelum mengirim, pastikan WID menggunakan salah satu suffix yang didukung (`@c.us`, `@s.whatsapp.net`, atau `@g.us`) dengan fungsi `isValidWid`.

3. **Verifikasi Kontak**  
   Jika `waClient` menyediakan fungsi `onWhatsApp`, panggil fungsi ini untuk memastikan nomor terdaftar sebelum mengirim file. Lewati proses pengiriman jika kontak tidak ada.

4. **Normalisasi Chat ID Sebelum Kirim Pesan**  
   Untuk pesan teks yang mengiringi pengiriman file atau broadcast cron, gunakan `safeSendMessage`. Helper ini sekarang mencoba `getNumberId`, `getContact`, dan `getChat` untuk menghasilkan chat ID terserialisasi (lengkap dengan *lid*) sebelum memanggil `sendMessage`, sehingga error seperti `Lid is missing in chat table` dapat dihindari.

5. **Tentukan MIME Type**  
   Tentukan MIME type secara eksplisit atau biarkan helper mendeteksinya menggunakan `mime-types`. Ini membantu WhatsApp menampilkan file dengan benar.

6. **Tangani Error**  
   Bungkus proses pengiriman dalam blok `try/catch` dan log error untuk memudahkan debugging jika pengiriman gagal.

7. **Batasi Ukuran File**  
   Hindari mengirim file yang terlalu besar agar tidak menghabiskan memori. Pertimbangkan untuk mengompres atau membagi file bila perlu.

Contoh penggunaan sederhana:

```javascript
import { sendWAFile, formatToWhatsAppId } from '../src/utils/waHelper.js';

const target = formatToWhatsAppId('08123456789');
await sendWAFile(waClient, Buffer.from('isi'), 'laporan.txt', target, 'text/plain');
```

Dengan mengikuti langkah-langkah di atas, pengiriman file melalui bot WhatsApp akan lebih stabil dan terhindar dari error seperti `Invalid wid`.
