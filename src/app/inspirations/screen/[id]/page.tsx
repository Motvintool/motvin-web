import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenViewer } from '@/components/inspirations/ScreenViewer';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';

/** Screen detail, fetched per request from the backend store. */

export async function generateMetadata({ params }: PageProps<'/inspirations/screen/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const data = await inspirationsApi.getScreen(id).catch(() => null);
  if (!data) return {};
  const { screen, app } = data;
  return {
    title: `${screen.name}${app ? ` — ${app.name}` : ''} — Motvin Inspirations`,
    description: `${SCREEN_TYPE_LABEL[screen.screenType]} screen from ${app?.name ?? 'an app'} (${INDUSTRY_LABEL[screen.industry]}, ${PLATFORM_LABEL[screen.platform]}).`,
  };
}

export default async function ScreenDetailPage({ params }: PageProps<'/inspirations/screen/[id]'>) {
  const { id } = await params;
  const data = await inspirationsApi.getScreen(id).catch(() => null);
  if (!data) notFound();
  return (
    <Suspense fallback={null}>
      <ScreenViewer screen={data.screen} app={data.app} flows={data.flows} patterns={data.patterns} />
    </Suspense>
  );
}
