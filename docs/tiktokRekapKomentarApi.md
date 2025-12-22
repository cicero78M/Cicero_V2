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
      "jumlah_komentar": 4
    }
  ],
  "chartHeight": 300,
  "usersWithComments": ["@alice"],
  "usersWithoutComments": [],
  "usersWithCommentsCount": 1,
  "usersWithoutCommentsCount": 0,
  "usersCount": 1
}
```

## Scope Handling

Ketika `role` dan `scope` dikirim, filter mengikuti aturan berikut:

### `scope=direktorat`

- **Data tugas (post)** diambil berdasarkan `client_id`.
- **Data personil** direkap berdasarkan **role yang sama** (`role`) lintas client.

### `scope=org`

- Jika `role` adalah direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data tugas** diambil berdasarkan `client_id` direktorat (nilai `role`).
  - **Data personil** mengikuti `client_id` yang diminta.
- Jika `role` adalah `operator`:
  - **Data tugas** diambil berdasarkan `client_id` asli pengguna (token).
  - **Data personil** dibatasi pada role `operator`.
- Selain kondisi di atas:
  - **Data tugas** dan **personil** mengikuti `client_id` yang diminta.
