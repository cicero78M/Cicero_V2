# Claim API

Dokumen ini merangkum endpoint klaim data berbasis OTP yang digunakan frontend untuk memvalidasi email dan memperbarui profil pengguna.

## Validasi Email
- **Endpoint:** `POST /api/claim/validate-email`
- **Body:** `{ "email": "nama@contoh.com" }`
- **Tujuan:** Memastikan alamat email memiliki format yang benar dan tidak dalam status non-aktif sebelum pengguna meminta OTP atau memperbarui data.
- **Respons berhasil (200):**
  ```json
  { "success": true, "data": { "message": "Email valid dan bisa digunakan" } }
  ```
- **Respons error yang mudah dipahami:**
  - 400 jika email kosong atau format salah dengan pesan jelas, misalnya "Email wajib diisi" atau "Format email tidak valid. Pastikan menulis alamat lengkap seperti nama@contoh.com".
  - 403 jika email ditemukan tetapi status akun terkait tidak aktif dengan pesan "Email tidak aktif. Hubungi admin untuk mengaktifkan kembali.".
  - 503 jika koneksi database bermasalah dengan pesan "Database tidak tersedia".

## Permintaan OTP
- **Endpoint:** `POST /api/claim/request-otp`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com" }`
- **Catatan:**
  - Endpoint menolak permintaan jika email sudah dipakai akun lain atau tidak cocok dengan data pengguna.
  - Jika pencarian user_id gagal tetapi email sudah tercatat pada user_id yang sama, OTP tetap dikirim untuk mencegah false
    positive "email sudah terdaftar".

## Verifikasi OTP
- **Endpoint:** `POST /api/claim/verify-otp`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com", "otp": "123456" }`

## Ambil Data Pengguna
- **Endpoint:** `POST /api/claim/user-data`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com" }`
- **Catatan:** Hanya dapat digunakan setelah OTP diverifikasi.

## Perbarui Data Pengguna
- **Endpoint:** `PUT /api/claim/update`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com", ... }`
- **Catatan:** Menggunakan OTP yang sudah diverifikasi atau menyertakan OTP di payload.
