"use client";
import { useState, useEffect } from "react";
import { login } from "@/utils/api";

export default function LoginPage() {
  const [clientId, setClientId] = useState("");
  const [wa, setWa] = useState(process.env.NEXT_PUBLIC_CLIENT_OPERATOR || "");
  const [useAdmin, setUseAdmin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const adminWa = (process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || "").split(",")[0] || "";
    const defaultOp = process.env.NEXT_PUBLIC_CLIENT_OPERATOR || "";
    setWa(useAdmin ? adminWa : defaultOp);
  }, [useAdmin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(clientId, wa);
      if (result.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("cicero_token", result.token);
          localStorage.setItem("client_id", result.client.client_id);
        }
        window.location.href = "/posts/instagram";
      } else {
        setError(result.message || "Login gagal");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow w-80">
        <h1 className="text-lg font-bold mb-4 text-center">Login</h1>
        <label className="block mb-2">
          <span>Client ID</span>
          <input
            className="border p-2 w-full"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
          />
        </label>
        <label className="block mb-2">
          <span>WhatsApp</span>
          <input
            className="border p-2 w-full"
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder={process.env.NEXT_PUBLIC_ADMIN_WHATSAPP}
            required
          />
        </label>
        <label className="flex items-center mb-2 text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={useAdmin}
            onChange={(e) => setUseAdmin(e.target.checked)}
          />
          Login sebagai Admin
        </label>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-2 mt-4"
        >
          {loading ? "Loading..." : "Login"}
        </button>
      </form>
    </div>
  );
}
