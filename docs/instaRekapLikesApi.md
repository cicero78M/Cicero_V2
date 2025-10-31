# Insta Rekap Likes API

The `getInstaRekapLikes` endpoint returns Instagram like summaries for a client.

## Response

```
{
  "success": true,
  "data": [
    {
      "user_id": "U-01",
      "nama": "Alice",
      "username": "alice",
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
    { "userId": "U-04", "name": "Diana", "division": "Bidang", "clientId": "ditbinmas" }
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

### Directorate Clients

When `client_id` refers to a directorate client, the endpoint aggregates user data
across **all** client IDs that have a user role matching the directorate name.
For example, requesting rekap likes for `ditbinmas` will include users from every
client who has the role `ditbinmas`.

### Organization Clients with Non-Operator Roles

When requesting data for a regular organization and the authenticated user role is
not `operator`, only users having the same role as the requester are included in
the response.

## Ditbinmas Shortcut

The `GET /likes/instagram` endpoint returns the same payload as above but
always aggregates data for users with the `ditbinmas` role. It does not require
`client_id` and ignores the authenticated user's role and client filters.
