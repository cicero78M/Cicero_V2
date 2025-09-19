import { jest } from "@jest/globals";
import { userMenuHandlers } from "../src/handler/menu/userMenuHandlers.js";

describe("userMenuHandlers conversational flow", () => {
  const chatId = "628111222333@c.us";
  let waClient;

  beforeEach(() => {
    waClient = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  it("mentions batal option when showing update prompt on main handler", async () => {
    const session = { identityConfirmed: true, user_id: "123" };
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue({
        user_id: "123",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("atau *batal* untuk menutup sesi.")
    );
  });

  it("mentions batal option when confirming identity in main handler", async () => {
    const session = { identityConfirmed: false };
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue({
        user_id: "999",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("atau *batal* untuk menutup sesi.")
    );
  });

  it("informs unregistered users why NRP is needed and how to exit", async () => {
    const session = {};
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue(null),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      [
        "Untuk menampilkan data Anda, silakan ketik NRP Anda (hanya angka).",
        "Ketik *batal* untuk keluar.",
        "",
        "Contoh:",
        "87020990",
      ].join("\n")
    );
  });

  it("handles batal in confirmUserByWaIdentity", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "Terima kasih. Sesi ditutup. Ketik *userrequest* untuk memulai lagi."
    );
  });

  it("reminds available answers when confirmUserByWaIdentity receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*batal* untuk menutup sesi.")
    );
  });

  it("handles batal in confirmUserByWaUpdate", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "Terima kasih. Sesi ditutup. Ketik *userrequest* untuk memulai lagi."
    );
  });

  it("reminds available answers when confirmUserByWaUpdate receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*batal* untuk menutup sesi.")
    );
  });

  it("handles batal in tanyaUpdateMyData", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "Terima kasih. Sesi ditutup. Ketik *userrequest* untuk memulai lagi."
    );
  });

  it("reminds available answers when tanyaUpdateMyData receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      "Balas *ya* jika ingin update data, *tidak* untuk kembali, atau *batal* untuk menutup sesi."
    );
  });
});
