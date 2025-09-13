import type { ReactElement } from 'react';

interface KpiItem {
  label: string;
  value: number;
}

// Server Component fetching KPI data
export default async function KpiCards(): Promise<ReactElement> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aggregator`, {
    cache: 'force-cache',
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch KPI data');
  }

  const data: KpiItem[] = await res.json();

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {data.map((item) => (
        <div key={item.label} className="rounded border p-4">
          <p className="text-sm text-gray-500">{item.label}</p>
          <p className="text-2xl font-bold">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

