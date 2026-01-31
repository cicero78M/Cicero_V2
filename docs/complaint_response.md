# Panduan Respon Komplain

Modul `respondComplaint` menyampaikan langkah tindak lanjut kepada pelapor saat laporan aktivitas media sosial belum tercatat. Ringkasan panduan yang dikirim ke pelapor menekankan pengecekan kembali likes Instagram dan komentar TikTok.

## Langkah verifikasi yang dikirim
- Pastikan aksi dilakukan dengan akun yang tercatat di Cicero.
- Lampirkan tautan konten beserta waktu pelaksanaan untuk pengecekan.
- Gunakan menu **Absensi Likes Instagram** atau **Absensi Komentar TikTok** di dashboard Cicero, pilih ulang satker dan periode, lalu tekan **Refresh** untuk memuat data terbaru.
- Jika data masih belum tercatat setelah sinkronisasi sekitar satu jam, kirim bukti tangkapan layar dan eskalasi ke operator piket.

Catatan: Narasi lama yang menyebut "Absensi Amplifikasi" sudah diganti agar selaras dengan terminologi likes/komentar di Instagram dan TikTok.

## Perilaku sesi setelah respon
- Setelah pesan komplain dibalas dan ringkasan admin dikirim, sesi menu *Client Request* ditutup otomatis.
- Penutupan sesi mencegah pengiriman ulang pesan menu utama seperti:
  ```
  ┏━━━ *MENU CLIENT CICERO* ━━━
  1️⃣ Manajemen Client & User
  2️⃣ Operasional Media Sosial
  3️⃣ Transfer & Laporan
  4️⃣ Administratif
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ketik *angka* menu, atau *batal* untuk keluar.
  ```
- Admin dapat membuka kembali menu dengan perintah `clientrequest` bila diperlukan.

## API respon komplain dashboard
Dashboard menyediakan endpoint untuk menyusun pesan respon komplain yang akan ditampilkan kembali di frontend sebelum dikirimkan melalui kanal lain.

**Endpoint**
- `POST /api/dashboard/komplain/insta`
- `POST /api/dashboard/komplain/tiktok`

**Header**
- `Authorization: Bearer <token-dashboard>`

**Payload minimal**
```json
{
  "nrp": "75020201",
  "issue": "Sudah melaksanakan Instagram belum terdata.",
  "solution": "Mohon cek kembali data like di dashboard dan kirim bukti jika masih belum tercatat."
}
```

Field `issue`/`solution` boleh diganti dengan `kendala`, `solusi`, atau `tindak_lanjut`. Jika tidak diisi, sistem akan mencoba menyusun kendala dan solusi otomatis dengan logika yang sama seperti responder WhatsApp (memakai modul `complaintService`). Anda dapat mengirimkan `message`/`pesan` berisi format *Pesan Komplain* agar sistem mengekstrak daftar kendala dan menghasilkan solusi otomatis sesuai akun Instagram/TikTok pelapor. Respons API akan mengembalikan string pesan dengan format yang mengikuti `sendComplaintResponse` (sapaan, identitas pelapor, kendala, dan solusi), beserta data pelapor dan nomor WhatsApp dashboard user bila tersedia.

**Payload komplain otomatis**
```json
{
  "nrp": "75020201",
  "message": "Pesan Komplain\\nNRP: 75020201\\nNama: Nama Pelapor\\nUsername IG: @username\\n\\nKendala\\n- Sudah melaksanakan Instagram belum terdata."
}
```

## Status pengiriman WhatsApp
Ketika endpoint komplain dipanggil, sistem akan mencoba mengirimkan pesan yang sudah diformat ke dua target WhatsApp: nomor personel (`user.whatsapp`) dan nomor dashboard user (`req.dashboardUser.whatsapp`). Status pengiriman selalu dikembalikan di response frontend agar UI dapat menampilkan hasil pengiriman per nomor.

Contoh ringkas objek `whatsappDelivery` pada response:
```json
{
  "whatsappDelivery": {
    "personnel": { "status": "sent", "target": "6281234567890@c.us" },
    "dashboardUser": { "status": "invalid", "reason": "invalid_number" }
  }
}
```

Nilai status yang mungkin:
- `sent`: pesan berhasil dikirim.
- `failed`: pengiriman gagal (contoh: client WA belum siap atau error saat kirim).
- `invalid`: nomor WA tidak valid.
- `skipped`: nomor WA kosong/tidak tersedia.
