# Instagram Posts API

## GET /api/insta/posts

Mengembalikan daftar post Instagram untuk client pada **hari ini** (timezone Asia/Jakarta) agar payload tidak terlalu besar.

### Query Params
- `client_id` (wajib): ID client. Contoh: `KEDIRI`.

### Contoh Request
```
GET /api/insta/posts?client_id=KEDIRI
```

### Catatan Perilaku
- Data yang dikembalikan hanya post dengan `created_at` pada tanggal hari ini (Asia/Jakarta).
- Response mengikuti format `sendSuccess` (lihat `src/utils/response.js`).
