import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FlowViewer } from '@/components/inspirations/FlowViewer';
import { inspirationsApi } from '@/lib/inspirations/api';
import { APP_BY_ID, FLOWS } from '@/lib/inspirations/data/build';

export function generateStaticParams() {
  return FLOWS.map((flow) => ({ id: flow.id }));
}

export async function generateMetadata({ params }: PageProps<'/inspirations/flow/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const flow = await inspirationsApi.getFlow(id);
  if (!flow) return {};
  const app = APP_BY_ID.get(flow.appId);
  return { title: `${app?.name ?? ''} ${flow.name} flow — Motvin Inspirations`.trim() };
}

export default async function FlowDetailPage({ params }: PageProps<'/inspirations/flow/[id]'>) {
  const { id } = await params;
  const flow = await inspirationsApi.getFlow(id);
  if (!flow) notFound();
  const screens = await inspirationsApi.getScreens(flow.screenIds);
  return <FlowViewer flow={flow} screens={screens} app={APP_BY_ID.get(flow.appId)} />;
}
