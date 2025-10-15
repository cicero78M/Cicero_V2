import { formatComplaintIssue } from '../../src/utils/utilsHelper.js';

describe('formatComplaintIssue', () => {
  it('formats structured complaint messages into sections', () => {
    const raw = `Pesan Komplain\nNRP    : 75020201\nNama : Nanang Yuwono\nPolres : Mojokerto kota\nUsername IG : @ Nanang yuwono\nUsername Tiktok : @nanang30yuwono\n\nKendala\n- sudah melaksanakan Instagram belum terdata\n- sudah melaksanakan tiktok belum terdata.`;

    const formatted = formatComplaintIssue(raw);

    expect(formatted).toBe(
      [
        '*Informasi Tambahan Pelapor*',
        '• NRP/NIP: 75020201',
        '• Nama: Nanang Yuwono',
        '• Polres: Mojokerto Kota',
        '• Instagram: @nanangyuwono',
        '• TikTok: @nanang30yuwono',
        '',
        '*Rincian Kendala*',
        '1. Sudah melaksanakan Instagram belum terdata.',
        '2. Sudah melaksanakan tiktok belum terdata.',
      ].join('\n')
    );
  });

  it('returns original text when the structure is not recognized', () => {
    const raw = 'Keluhan umum tanpa format khusus';
    expect(formatComplaintIssue(raw)).toBe(raw);
  });
});
