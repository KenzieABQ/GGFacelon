'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Flow from '@/components/flow/Flow.jsx';

function Edit() { const id = useSearchParams().get('id'); return <Flow mode="edit" editId={id} />; }
export default function EditPage() { return <Suspense fallback={null}><Edit /></Suspense>; }
