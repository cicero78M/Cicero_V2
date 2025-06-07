'use client';

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#22c55e", "#f43f5e", "#3b82f6", "#f59e42", "#8b5cf6", "#06b6d4", "#eab308", "#64748b"];

function getSatfungOrder(keys: string[]) {
  const order = ["BAG", "SAT", "SI", "SPKT", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((p) => a?.toUpperCase().startsWith(p));
    const ib = order.findIndex((p) => b?.toUpperCase().startsWith(p));
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function DashboardUserPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth: hanya admin/client yang login boleh akses!
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) window.location.href = "/login";
    const role = localStorage.getItem("role");
    const client_id = localStorage.getItem("client_id");
    fetch(`/api/data/users${role === "client" ? `?client_id=${client_id}` : ""}`)
      .then(res => res.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!users.length) return <div className="p-8 text-center">Tidak ada user.</div>;

  // Statistik
  const total = users.length;
  const aktif = users.filter(u => u.status === true || u.status === "true").length;
  const nonAktif = total - aktif;

  // Group by satfung (divisi)
  const bySatfung: Record<string, number> = {};
  users.forEach(u => {
    const d = u.divisi || "-";
    bySatfung[d] = (bySatfung[d] || 0) + 1;
  });
  const satfungKeys = getSatfungOrder(Object.keys(bySatfung));

  return (
    <div className="py-8">
      <h2 className="text-2xl font-bold mb-2">Statistik User</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center">
          <span className="text-5xl font-bold">{total}</span>
          <span className="mt-2 text-gray-700">Total User</span>
        </div>
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center">
          <span className="text-3xl text-green-600 font-bold">{aktif}</span>
          <span className="mt-2 text-gray-700">User Aktif</span>
        </div>
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center">
          <span className="text-3xl text-rose-600 font-bold">{nonAktif}</span>
          <span className="mt-2 text-gray-700">User Non-Aktif</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 mb-8">
        {/* Pie Chart Status */}
        <div className="flex-1 bg-white rounded-xl shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Status User</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: "Aktif", value: aktif },
                  { name: "Non-Aktif", value: nonAktif },
                ]}
                dataKey="value"
                nameKey="name"
                outerRadius={80}
                label
              >
                <Cell fill="#22c55e" />
                <Cell fill="#f43f5e" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart Satfung */}
        <div className="flex-1 bg-white rounded-xl shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Distribusi User per Satfung</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={satfungKeys.map(key => ({ name: key, jumlah: bySatfung[key] }))}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Bar dataKey="jumlah" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Tooltip />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto p-4">
        <h3 className="text-lg font-semibold mb-2">Tabel User</h3>
        <table className="min-w-full table-auto border">
          <thead>
            <tr className="bg-gray-100 text-sm">
              <th className="px-2 py-1 border">NRP/NIP</th>
              <th className="px-2 py-1 border">Nama</th>
              <th className="px-2 py-1 border">Pangkat</th>
              <th className="px-2 py-1 border">Satfung</th>
              <th className="px-2 py-1 border">Jabatan</th>
              <th className="px-2 py-1 border">Status</th>
              <th className="px-2 py-1 border">Instagram</th>
              <th className="px-2 py-1 border">TikTok</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td className="px-2 py-1 border text-xs">{u.user_id}</td>
                <td className="px-2 py-1 border">{u.nama}</td>
                <td className="px-2 py-1 border">{u.title}</td>
                <td className="px-2 py-1 border">{u.divisi}</td>
                <td className="px-2 py-1 border">{u.jabatan}</td>
                <td className="px-2 py-1 border text-center">
                  {u.status === true || u.status === "true" ? (
                    <span className="text-green-600 font-semibold">Aktif</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">Non-Aktif</span>
                  )}
                </td>
                <td className="px-2 py-1 border text-xs">{u.insta || "-"}</td>
                <td className="px-2 py-1 border text-xs">{u.tiktok || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
