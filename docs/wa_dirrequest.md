# Menu DirRequest untuk Operator WA
*Last updated: 2025-03-15*

Menu **dirrequest** digunakan tim Ditbinmas untuk memicu pengambilan data,
rekap, dan laporan langsung dari WhatsApp. Menu utama menampilkan beberapa
grup seperti Rekap Data, Absensi, Pengambilan Data, hingga Monitoring
Kasatker. Setiap opsi dipilih dengan membalas angka menu sesuai label yang
ditampilkan bot.

## Monitoring Satbinmas Official
Grup menu terbaru di bagian bawah menambahkan alur khusus untuk memantau akun
resmi Satbinmas.

- **3️⃣6️⃣ Ambil metadata harian IG Satbinmas Official**
  1. Pilih opsi **3️⃣6️⃣** dari menu dirrequest.
  2. Bot menampilkan prompt *Monitoring Satbinmas Official* yang otomatis
     memakai *Client ID* aktif (default `DITBINMAS`).
  3. Balas dengan format `username` atau `CLIENT_ID username` jika ingin
     mengecek akun Satbinmas milik client lain. Contoh: `satbinmas_official`
     atau `MKS01 satbinmas_official`.
  4. Bot memanggil layanan RapidAPI (`fetchInstagramInfo`) untuk menarik
     metadata profil Instagram (nama, followers, postingan, status verifikasi,
     dan privasi).
  5. Hasil dikirim kembali ke operator dalam satu pesan ringkasan. Jika
     metadata tidak ditemukan atau layanan gagal diakses, bot menampilkan pesan
     kegagalan beserta alasan singkat.
  6. Balasan `batal` kapan pun akan menutup alur ini dan kembali ke menu utama
     dirrequest.

Opsi ini membantu Ditbinmas memantau kesiapan akun resmi Satbinmas tanpa harus
berpindah ke dashboard web atau menjalankan skrip manual.
