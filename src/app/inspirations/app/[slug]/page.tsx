import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppDetailView } from '@/components/inspirations/views/AppDetailView';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';

/**
 * App detail. Rendered on demand rather than pre-generated: the app list lives
 * in the backend store and changes whenever screens are ingested, so there is
 * no build-time set of slugs to enumerate.
 */

export async function generateMetadata({ params }: PageProps<'/inspirations/app/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const data = await inspirationsApi.getApp(slug).catch(() => null);
  if (!data) return {};
  const { app } = data;
  return {
    title: `${app.name} — ${INDUSTRY_LABEL[app.industry] ?? app.industry} screens & flows — Motvin Inspirations`,
    description: app.tagline
      ? `${app.screenCount} screens and ${app.flowCount} flows from ${app.name}. ${app.tagline}`
      : `${app.screenCount} screens and ${app.flowCount} flows from ${app.name}.`,
  };
}

export default async function AppDetailPage({ params }: PageProps<'/inspirations/app/[slug]'>) {
  const { slug } = await params;
  const data = await inspirationsApi.getApp(slug).catch(() => null);
  if (!data) notFound();
  return (
    <Suspense fallback={null}>
      <AppDetailView app={data.app} screens={data.screens} flows={data.flows} patterns={data.patterns} />
    </Suspense>
  );
}
