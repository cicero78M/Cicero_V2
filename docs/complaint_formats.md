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

## Instagram complaint follow-up

When an Instagram complaint reports missing likes/comments and the username in the message differs from the database or RapidAPI returns profiles without activity metrics, the responder now adds explicit follow-up steps:

- Ask for the latest Instagram profile screenshot that shows the username, photo, and bio, and remind reporters to check subtle character differences (e.g., `_` vs `.`) when confirming the correct handle.
- If the stored username needs to be updated, the reply embeds the *Update Data Personil* instructions so reporters can refresh the Instagram handle in the database.
- Reporters are instructed to redo one like or comment on an official post using a public account, then wait about one hour for synchronization before rechecking.
