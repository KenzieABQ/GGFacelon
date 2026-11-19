import { Suspense } from 'react';
import Dashboard from '@/components/Dashboard.jsx';

export default function ScanPage() {
  return <Suspense fallback={<div className="dash" />}><Dashboard /></Suspense>;
}
