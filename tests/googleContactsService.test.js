import { jest } from '@jest/globals';
import fs from 'fs/promises';

const mockQuery = jest.fn();
const mockSearchContacts = jest.fn();
const mockCreateContact = jest.fn();

class MockOAuth2 {
  constructor() {
    this.setCredentials = jest.fn();
    this.generateAuthUrl = jest.fn();
  }
}

const mockPeople = jest.fn(() => ({
  people: { searchContacts: mockSearchContacts, createContact: mockCreateContact }
}));

jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: { OAuth2: MockOAuth2 },
    people: mockPeople
  }
}));

let saveContactIfNew;

beforeAll(async () => {
  await fs.writeFile('credentials.json', JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] } }));
  await fs.writeFile('token.json', JSON.stringify({ access_token: 'token' }));
  ({ saveContactIfNew } = await import('../src/service/googleContactsService.js'));
});

afterAll(async () => {
  await fs.unlink('credentials.json');
  await fs.unlink('token.json');
});

beforeEach(() => {
  mockQuery.mockReset();
  mockSearchContacts.mockReset();
  mockCreateContact.mockReset();
  mockPeople.mockClear();
});

describe('saveContactIfNew', () => {
  test('skips when credentials.json missing', async () => {
    await fs.unlink('credentials.json');
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await saveContactIfNew('11111@c.us');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPeople).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] credentials.json not found, skipping contact save.'
    );

    warnSpy.mockRestore();
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] } })
    );
  });
  test('skips when redirect_uris missing', async () => {
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret' } })
    );
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await saveContactIfNew('22222@c.us');

    expect(mockPeople).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] redirect_uris missing in credentials.json, skipping contact save.'
    );

    warnSpy.mockRestore();
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] } })
    );
  });
  test('skips existing contact', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ phone_number: '123' }] });
    await saveContactIfNew('12345@c.us');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPeople).not.toHaveBeenCalled();
  });

  test('logs error when Google API returns 403', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    mockSearchContacts.mockResolvedValueOnce({ results: [] });
    mockCreateContact.mockRejectedValueOnce({ message: 'Forbidden', response: { status: 403 } });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await saveContactIfNew('98765@c.us');

    expect(mockSearchContacts).toHaveBeenCalledTimes(1);
    expect(mockCreateContact).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] Failed to save contact:',
      'Forbidden',
      '(status 403)'
    );

    errorSpy.mockRestore();
  });
});

