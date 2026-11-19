'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, app } from '@/lib/app.js';
import Shell from '@/components/Shell.jsx';
import { Empty } from '@/components/Dashboard.jsx';
import { scanUrl } from '@/lib/routes.js';

// Home: the latest scan's overview, or the empty state
export default function Home() {
  const a = useApp();
  const router = useRouter();
  useEffect(() => { app.load(); }, []);
  useEffect(() => { if (a.loaded && a.scans[0]) router.replace(scanUrl(a.scans[0].id)); }, [a.loaded]);
  if (!a.loaded || a.scans.length) return <div className="dash" />;
  return <Shell scan={null} tab="empty"><Empty /></Shell>;
}
