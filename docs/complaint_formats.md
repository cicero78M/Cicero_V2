# Complaint Message Formats

The complaint responder parses operator-forwarded messages to extract the reporter identity and a list of issues that can be matched with automatic solutions. Use one of the supported headers to mark the start of the issue section:

- `Kendala`
- `Rincian Kendala`
- `Detail/Uraian/Keterangan/Deskripsi Kendala`
- `Kendala yang dihadapi/dialami`

Bullet points (`-`, `•`) and numbered lists (`1)`, `2.`) after these headers are captured as individual issues.

## Default template

```
Pesan Komplain
NRP    : 75020201
Nama   : Nama Pelapor
Polres : Satuan
Username IG : @username
Username TikTok : @username

Kendala
- Sudah melaksanakan Instagram belum terdata.
- Sudah melaksanakan TikTok belum terdata.
```

## Example with "Rincian Kendala"

```
Pesan Komplain
NRP    : 75020201
Nama   : Nama Pelapor
Username TikTok : @username

Rincian Kendala:
1) Sudah melaksanakan TikTok belum terdata di dashboard.
2) Sudah login dashboard tetapi data tidak muncul.
```

Either header will be recognised, and each numbered or bulleted row is evaluated for known issues (e.g., TikTok actions not recorded) before prompting for a manual solution.
