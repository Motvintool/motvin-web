import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FlowViewer } from '@/components/inspirations/FlowViewer';
import { inspirationsApi } from '@/lib/inspirations/api';

/** Flow viewer, fetched per request from the backend store. */

export async function generateMetadata({ params }: PageProps<'/inspirations/flow/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const data = await inspirationsApi.getFlow(id).catch(() => null);
  if (!data) return {};
  return { title: `${data.app?.name ?? ''} ${data.flow.name} flow — Motvin Inspirations`.trim() };
}

export default async function FlowDetailPage({ params }: PageProps<'/inspirations/flow/[id]'>) {
  const { id } = await params;
  const data = await inspirationsApi.getFlow(id).catch(() => null);
  if (!data) notFound();
  return <FlowViewer flow={data.flow} screens={data.screens} app={data.app ?? undefined} />;
}
