import {
  normalizeComplaintHandle,
  parseComplaintMessage,
} from '../../../src/handler/menu/clientRequestHandlers.js';

describe('normalizeComplaintHandle', () => {
  it('normalizes plain handles to lowercase with a leading @', () => {
    expect(normalizeComplaintHandle('ExampleUser')).toBe('@exampleuser');
    expect(normalizeComplaintHandle('@ExampleUser')).toBe('@exampleuser');
  });

  it('extracts usernames from Instagram profile URLs', () => {
    expect(
      normalizeComplaintHandle('https://www.instagram.com/Example.User/')
    ).toBe('@example.user');
    expect(
      normalizeComplaintHandle('instagram.com/u/AnotherPerson')
    ).toBe('@anotherperson');
  });

  it('extracts usernames from TikTok profile URLs', () => {
    expect(
      normalizeComplaintHandle('http://tiktok.com/@ExampleUser')
    ).toBe('@exampleuser');
    expect(
      normalizeComplaintHandle('https://www.tiktok.com/@ExampleUser/video/123')
    ).toBe('@exampleuser');
  });

  it('returns an empty string for unsupported URLs', () => {
    expect(normalizeComplaintHandle('https://instagram.com/p/ABC123')).toBe('');
    expect(normalizeComplaintHandle('')).toBe('');
  });
});

describe('parseComplaintMessage', () => {
  it('captures plain usernames correctly', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : exampleUser',
        'Username Tiktok : @TikTokUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@exampleuser');
    expect(parsed.tiktok).toBe('@tiktokuser');
  });

  it('captures handles shared as profile URLs', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : https://instagram.com/u/Example.User/',
        'Username Tiktok : https://www.tiktok.com/@AnotherUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@example.user');
    expect(parsed.tiktok).toBe('@anotheruser');
  });
});

