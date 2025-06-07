'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [clientId, setClientId] = useState("");
  const [clientOperator, setClientOperator] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId.trim(),
        client_operator: clientOperator.trim(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      if (data.client_id) localStorage.setItem("client_id", data.client_id);
      router.push("/dashboard");
    } else {
      const data = await res.json();
      setError(data.message || "Login gagal!");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md"
      >
        <h2 className="text-2xl font-bold mb-4 text-center">Login Dashboard Cicero</h2>
        <div className="mb-4">
          <label className="block font-medium mb-1">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring"
            placeholder="Masukkan client_id (atau admin)"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block font-medium mb-1">Operator (WA/ID/Password)</label>
          <input
            type="password"
            value={clientOperator}
            onChange={(e) => setClientOperator(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring"
            placeholder="Masukkan operator"
            required
          />
        </div>
        {error && (
          <div className="mb-4 text-red-500 text-center text-sm">{error}</div>
        )}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl hover:bg-blue-700 transition"
        >
          Login
        </button>
      </form>
    </div>
  );
}
