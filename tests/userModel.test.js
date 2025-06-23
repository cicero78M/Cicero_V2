import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let findUserByIdAndWhatsApp;

beforeAll(async () => {
  const mod = await import('../src/model/userModel.js');
  findUserByIdAndWhatsApp = mod.findUserByIdAndWhatsApp;
});

test('findUserByIdAndWhatsApp returns user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1', nama: 'Test' }] });
  const user = await findUserByIdAndWhatsApp('1', '0808');
  expect(user).toEqual({ user_id: '1', nama: 'Test' });
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM "user" WHERE user_id = $1 AND whatsapp = $2',
    ['1', '0808']
  );
});
