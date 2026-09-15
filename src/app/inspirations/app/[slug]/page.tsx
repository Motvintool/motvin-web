import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppDetailView } from '@/components/inspirations/views/AppDetailView';
import { inspirationsApi } from '@/lib/inspirations/api';
import { APPS } from '@/lib/inspirations/data/build';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';

export function generateStaticParams() {
  return APPS.map((app) => ({ slug: app.slug }));
}

export async function generateMetadata({ params }: PageProps<'/inspirations/app/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const app = await inspirationsApi.getApp(slug);
  if (!app) return {};
  return {
    title: `${app.name} — ${INDUSTRY_LABEL[app.industry]} screens & flows — Motvin Inspirations`,
    description: `${app.screenCount} screens and ${app.flowCount} flows from ${app.name}. ${app.tagline}`,
  };
}

export default async function AppDetailPage({ params }: PageProps<'/inspirations/app/[slug]'>) {
  const { slug } = await params;
  const app = await inspirationsApi.getApp(slug);
  if (!app) notFound();
  return (
    <Suspense fallback={null}>
      <AppDetailView app={app} />
    </Suspense>
  );
}
