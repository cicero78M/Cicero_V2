'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const client_id = localStorage.getItem("client_id");
    if (!token || !role) {
      router.push("/login");
    } else {
      setRole(role);
      setClientId(client_id);
    }
  }, []);

  if (!role) return <div className="flex h-screen justify-center items-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md p-8 mt-8">
        <h1 className="text-2xl font-bold mb-4">
          Dashboard {role === "admin" ? "Admin" : `Client: ${clientId}`}
        </h1>
        {/* Ganti komponen di bawah sesuai role */}
        {role === "admin" ? (
          <AllClientsDashboard />
        ) : (
          <ClientDashboard clientId={clientId!} />
        )}
      </div>
    </div>
  );
}

// Komponen untuk admin dan client (ganti dengan query ke API yang sudah ada di Node backend)
function AllClientsDashboard() {
  // TODO: Fetch dan tampilkan seluruh data client, user, likes, dsb.
  return <div>Admin: Lihat seluruh data.</div>;
}
function ClientDashboard({ clientId }: { clientId: string }) {
  // TODO: Fetch dan tampilkan data hanya untuk client_id ini.
  return <div>Client: Lihat data untuk {clientId}</div>;
}
