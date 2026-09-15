import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenViewer } from '@/components/inspirations/ScreenViewer';
import { inspirationsApi } from '@/lib/inspirations/api';
import { SCREENS } from '@/lib/inspirations/data/build';
import { INDUSTRY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';

export function generateStaticParams() {
  return SCREENS.map((screen) => ({ id: screen.id }));
}

export async function generateMetadata({ params }: PageProps<'/inspirations/screen/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const screen = await inspirationsApi.getScreen(id);
  if (!screen) return {};
  const app = inspirationsApi.appFor(screen);
  return {
    title: `${screen.name}${app ? ` — ${app.name}` : ''} — Motvin Inspirations`,
    description: `${SCREEN_TYPE_LABEL[screen.screenType]} screen from ${app?.name ?? 'an app'} (${INDUSTRY_LABEL[screen.industry]}, ${PLATFORM_LABEL[screen.platform]}).`,
  };
}

export default async function ScreenDetailPage({ params }: PageProps<'/inspirations/screen/[id]'>) {
  const { id } = await params;
  const screen = await inspirationsApi.getScreen(id);
  if (!screen) notFound();
  return (
    <Suspense fallback={null}>
      <ScreenViewer screen={screen} app={inspirationsApi.appFor(screen)} />
    </Suspense>
  );
}
