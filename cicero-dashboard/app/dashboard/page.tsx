import type { ReactElement } from 'react';
import KpiCards from './KpiCards';

export default function DashboardPage(): ReactElement {
  return (
    <main className="p-4">
      <KpiCards />
    </main>
  );
}

