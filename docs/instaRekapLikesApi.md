# Insta Rekap Likes API

The `getInstaRekapLikes` endpoint returns Instagram like summaries for a client.

## Request

`GET /api/insta/rekap-likes`

### Query Parameters

- `client_id` (required)
- `periode` (optional, default: `harian`)
- `tanggal` (optional)
- `start_date` / `end_date` (optional, date range)
- `role` (recommended; used for standardized scope handling)
- `scope` (recommended; values: `direktorat` or `org`)
- `regional_id` (optional; filter hasil hanya untuk client dengan `regional_id` tertentu, mis. `JATIM`)

Example:

```
/api/insta/rekap-likes?client_id=DITBINMAS&periode=harian&tanggal=2025-12-22&role=ditbinmas&scope=direktorat
```

## Response

```
{
  "success": true,
  "data": [
    {
      "user_id": "U-01",
      "nama": "Alice",
      "username": "alice",
      "regional_id": "JATIM",
      "jumlah_like": 4,
      "ranking": 1,
      "completionRate": 1,
      "completionPercentage": 100,
      "missingLikes": 0,
      "status": "sudah",
      "badges": ["✅ Semua konten pada periode ini sudah di-like."]
    },
    {
      "user_id": "U-02",
      "nama": "Bob",
      "username": "bob",
      "regional_id": "JATIM",
      "jumlah_like": 1,
      "ranking": 2,
      "completionRate": 0.25,
      "completionPercentage": 25,
      "missingLikes": 3,
      "status": "kurang",
      "badges": ["⚠️ Masih ada konten yang belum di-like."]
    }
  ],
  "chartHeight": 320,
  "totalPosts": 4,
  "sudahUsers": ["alice"],
  "kurangUsers": ["bob"],
  "belumUsers": ["charlie"],
  "sudahUsersCount": 1,
  "kurangUsersCount": 1,
  "belumUsersCount": 2,
  "noUsernameUsersCount": 1,
  "usersCount": 4,
  "summary": {
    "totalPosts": 4,
    "totalUsers": 4,
    "totalLikes": 5,
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
    { "label": "Alice", "likes": 4, "missingLikes": 0, "completionPercentage": 100 },
    { "label": "Bob", "likes": 1, "missingLikes": 3, "completionPercentage": 25 }
  ],
  "insights": [
    "✅ 1 akun sudah me-like semua konten yang tersedia.",
    "⚠️ 1 akun masih kekurangan like pada sebagian konten.",
    "⏳ 1 akun belum memberikan like sama sekali.",
    "❗ 1 akun belum memiliki username Instagram."
  ],
  "statusLegend": [
    { "status": "sudah", "label": "Sudah", "description": "Semua konten pada periode ini telah di-like." },
    { "status": "kurang", "label": "Kurang", "description": "Sudah melakukan like tetapi masih ada konten yang belum di-like." },
    { "status": "belum", "label": "Belum", "description": "Belum memberikan like pada periode ini." },
    { "status": "no_username", "label": "No Username", "description": "Belum memiliki username Instagram di sistem." },
    { "status": "no_posts", "label": "No Posts", "description": "Tidak ada konten untuk periode yang dipilih." }
  ],
  "noUsernameUsersDetails": [
    { "userId": "U-04", "name": "Diana", "division": "Bidang", "clientId": "ditbinmas", "regionalId": "JATIM" }
  ]
}
```

- **data** – daftar pengguna dengan metrik tambahan untuk mempermudah pembuatan UI (status, persentase capaian, lencana penjelas).
- **sudahUsers / kurangUsers / belumUsers** – daftar username untuk filter cepat di UI.
- **belumUsersCount** – jumlah akun yang belum memberi like **ditambah** akun tanpa username Instagram.
- **noUsernameUsersCount** – jumlah akun tanpa username; detail tambahan ada di `noUsernameUsersDetails`.
- **summary** – ringkasan agregat yang bisa ditampilkan sebagai kartu KPI.
- **chartData** – data siap pakai untuk grafik stacked bar/polar chart (likes vs kekurangan).
- **insights** – teks rekomendasi yang bisa langsung ditampilkan sebagai highlight.
- **statusLegend** – legenda status supaya warna/ikon di UI konsisten.
- **noUsernameUsersDetails** – daftar akun yang perlu dibantu melengkapi username Instagram.
- **regional_id** – atribut regional dari client yang ditampilkan untuk setiap user.

**Catatan operator:** saat endpoint ini dipakai untuk menu *Absensi Likes Instagram* di WhatsApp, mode akumulasi menampilkan grouping per satfung dengan sub-list **lengkap/kurang/belum**. Urutan personel di dalam list mengikuti prioritas pangkat berikut: AKP (jabatan Kasat didahulukan), IPTU, IPDA, AIPTU, AIPDA, BRIPKA, BRIGADIR, BRIPTU, BRIPDA, PENATA, PENGATUR TINGKAT I, PENGATUR MUDA TINGKAT I, PENGATUR, JURU, PPPK, PHL.

## Scope Handling

When `role` and `scope` are provided, the endpoint follows these rules:

### `scope=direktorat`

- **Data tugas (post)** diambil berdasarkan `client_id`.
- **Data personil** direkap berdasarkan **role yang sama** (`role`), lintas client.

### `scope=org`

- Jika `role` adalah direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data tugas** diambil berdasarkan `client_id` direktorat (nilai `role`).
  - **Data personil** mengikuti `client_id` pengguna yang sedang login (token) dan dibatasi pada role direktorat yang sama.
  - **Perhitungan like** tetap mengikuti shortcode tugas direktorat, meskipun `client_id` personil berbeda.
- Jika `role` adalah `operator`:
  - **Data tugas** diambil berdasarkan `client_id` asli pengguna (token).
  - Untuk client bertipe **ORG**, daftar tugas dibatasi ke konten Instagram dari akun official
    yang tersimpan di `satbinmas_official_accounts` (platform `instagram`, `is_active = true`)
    melalui relasi `satbinmas_official_media`.
  - **Data personil** dibatasi pada role `operator`.
  - **Otorisasi** tetap mengikuti `client_id` pada token. Jika `client_id` pada query berbeda, sistem akan menyelaraskannya ke `client_id` token agar operator ORG tetap bisa mengakses endpoint.
- Selain kondisi di atas:
  - **Data tugas** dan **personil** mengikuti `client_id` yang diminta.

## Regional Filter

Jika `regional_id` dikirim, data post dan personil hanya akan dihitung untuk client yang berada pada regional tersebut. Contoh: `regional_id=JATIM` membatasi rekap ke struktur Polda Jatim.

## Ditbinmas Shortcut

The `GET /likes/instagram` endpoint returns the same payload as above but
always aggregates data for users with the `ditbinmas` role. It does not require
`client_id` and ignores the authenticated user's role and client filters.
