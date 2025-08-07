import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockCreateContact = jest.fn();
const mockPeople = jest.fn(() => ({ people: { createContact: mockCreateContact } }));
const mockJWT = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: { JWT: mockJWT },
    people: mockPeople
  }
}));

let saveContactIfNew;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test';
  process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'test@example.com',
    private_key: 'key'
  });
  process.env.GOOGLE_IMPERSONATE_EMAIL = 'imp@example.com';
  process.env.GOOGLE_CONTACT_SCOPE = 'scope';

  ({ saveContactIfNew } = await import('../src/service/googleContactsService.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockCreateContact.mockReset();
  mockPeople.mockClear();
  mockJWT.mockClear();
});

describe('saveContactIfNew', () => {
  test('does not save contact twice', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ phone_number: '123' }] });

    await saveContactIfNew('12345@c.us');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPeople).not.toHaveBeenCalled();
    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  test('logs error when Google API returns 403', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    mockCreateContact.mockRejectedValueOnce({
      message: 'Forbidden',
      response: { status: 403 }
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await saveContactIfNew('98765@c.us');

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

