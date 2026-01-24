# TikTok Rekap Komentar API

Endpoint `getTiktokRekapKomentar` mengembalikan rekap komentar TikTok untuk
client tertentu.

## Request

`GET /api/tiktok/rekap-komentar`

### Query Parameters

- `client_id` (required)
- `periode` (optional, default: `harian`)
- `tanggal` (optional)
- `start_date` / `end_date` (optional, date range)
- `role` (recommended; dipakai untuk standardisasi scope)
- `scope` (recommended; value: `direktorat` atau `org`)
- `regional_id` (optional; filter hasil hanya untuk client dengan `regional_id` tertentu, mis. `JATIM`)

Example:

```
/api/tiktok/rekap-komentar?client_id=DITBINMAS&periode=harian&tanggal=2025-12-22&role=ditbinmas&scope=direktorat
```

## Response

```
{
  "success": true,
  "data": [
    {
      "user_id": "U-01",
      "nama": "Alice",
      "username": "@alice",
      "regional_id": "JATIM",
      "jumlah_komentar": 4,
      "ranking": 1,
      "completionRate": 1,
      "completionPercentage": 100,
      "missingComments": 0,
      "status": "sudah",
      "badges": ["✅ Semua konten pada periode ini sudah dikomentari."]
    },
    {
      "user_id": "U-02",
      "nama": "Bob",
      "username": "@bob",
      "regional_id": "JATIM",
      "jumlah_komentar": 1,
      "ranking": 2,
      "completionRate": 0.25,
      "completionPercentage": 25,
      "missingComments": 3,
      "status": "kurang",
      "badges": ["⚠️ Masih ada konten yang belum dikomentari."]
    }
  ],
  "chartHeight": 320,
  "totalPosts": 4,
  "sudahUsers": ["@alice"],
  "kurangUsers": ["@bob"],
  "belumUsers": ["@charlie"],
  "sudahUsersCount": 1,
  "kurangUsersCount": 1,
  "belumUsersCount": 2,
  "noUsernameUsersCount": 1,
  "usersCount": 4,
  "summary": {
    "totalPosts": 4,
    "totalUsers": 4,
    "totalComments": 5,
    "averageCompletionPercentage": 41.7,
    "participationRatePercentage": 66.7,
    "distribution": {
      "sudah": 1,
      "kurang": 1,
      "belum": 1,
      "noUsername": 1,
      "noPosts": 0
    }
  },
  "chartData": [
    { "label": "Alice", "comments": 4, "missingComments": 0, "completionPercentage": 100 },
    { "label": "Bob", "comments": 1, "missingComments": 3, "completionPercentage": 25 }
  ],
  "insights": [
    "✅ 1 akun sudah mengomentari semua konten yang tersedia.",
    "⚠️ 1 akun masih kekurangan komentar pada sebagian konten.",
    "⏳ 1 akun belum memberikan komentar sama sekali.",
    "❗ 1 akun belum memiliki username TikTok."
  ],
  "statusLegend": [
    { "status": "sudah", "label": "Sudah", "description": "Semua konten pada periode ini telah dikomentari." },
    { "status": "kurang", "label": "Kurang", "description": "Sudah memberikan komentar tetapi masih ada konten yang belum dikomentari." },
    { "status": "belum", "label": "Belum", "description": "Belum memberikan komentar pada periode ini." },
    { "status": "no_username", "label": "No Username", "description": "Belum memiliki username TikTok di sistem." },
    { "status": "no_posts", "label": "No Posts", "description": "Tidak ada konten untuk periode yang dipilih." }
  ],
  "noUsernameUsersDetails": [
    { "userId": "U-04", "name": "Diana", "division": "Bidang", "clientId": "ditbinmas", "regionalId": "JATIM" }
  ],
  "usersWithComments": ["@alice"],
  "usersWithoutComments": ["@diana"],
  "usersWithCommentsCount": 1,
  "usersWithoutCommentsCount": 1
}
```

- **data** – daftar pengguna dengan metrik tambahan untuk mempermudah pembuatan UI (status, persentase capaian, lencana penjelas).
- **sudahUsers / kurangUsers / belumUsers** – daftar username untuk filter cepat di UI.
- **belumUsersCount** – jumlah akun yang belum memberi komentar **ditambah** akun tanpa username TikTok.
- **noUsernameUsersCount** – jumlah akun tanpa username; detail tambahan ada di `noUsernameUsersDetails`.
- **summary** – ringkasan agregat yang bisa ditampilkan sebagai kartu KPI.
- **chartData** – data siap pakai untuk grafik stacked bar/polar chart (komentar vs kekurangan).
- **insights** – teks rekomendasi yang bisa langsung ditampilkan sebagai highlight.
- **statusLegend** – legenda status supaya warna/ikon di UI konsisten.
- **noUsernameUsersDetails** – daftar akun yang perlu dibantu melengkapi username TikTok.
- **regional_id** – atribut regional dari client yang ditampilkan untuk setiap user.
- **usersWithComments / usersWithoutComments** – field lama yang tetap disediakan untuk kompatibilitas klien.

**Catatan operator:** saat endpoint ini dipakai untuk menu *Absensi Komentar TikTok* di WhatsApp, mode akumulasi menampilkan grouping per satfung dengan sub-list **lengkap/kurang/belum** untuk memudahkan rekap operator.

## Scope Handling

Ketika `role` dan `scope` dikirim, filter mengikuti aturan berikut:

### `scope=direktorat`

- **Data tugas (post)** diambil berdasarkan `client_id`.
- **Data personil** direkap berdasarkan **role yang sama** (`role`) lintas client.

### `scope=org`

- Jika `role` adalah direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data tugas** diambil berdasarkan `client_id` direktorat (nilai `role`).
  - **Data personil** mengikuti `client_id` pengguna (token) jika tersedia, fallback ke `client_id` yang diminta, dan dibatasi pada `role` direktorat tersebut.
- Jika `role` adalah `operator`:
  - **Data tugas** diambil berdasarkan `client_id` asli pengguna (token).
  - **Data personil** dibatasi pada role `operator`.
- Selain kondisi di atas:
  - **Data tugas** dan **personil** mengikuti `client_id` yang diminta.

## Regional Filter

Jika `regional_id` dikirim, data post dan personil hanya akan dihitung untuk client yang berada pada regional tersebut. Contoh: `regional_id=JATIM` membatasi rekap ke struktur Polda Jatim.
