import { Suspense } from 'react';
import Dashboard from '@/components/Dashboard.jsx';

export const metadata = { title: 'Methodology · GGFacelon' };
export default function MethodologyPage() {
  return <Suspense fallback={<div className="dash" />}><Dashboard fixedTab="methodology" /></Suspense>;
}
