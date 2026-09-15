import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PatternDetailView } from '@/components/inspirations/views/PatternDetailView';
import { inspirationsApi } from '@/lib/inspirations/api';

/** Pattern detail, fetched per request from the backend store. */

export async function generateMetadata({ params }: PageProps<'/inspirations/pattern/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const data = await inspirationsApi.getPattern(slug).catch(() => null);
  if (!data) return {};
  return {
    title: `${data.pattern.name} — ${data.pattern.category} patterns — Motvin Inspirations`,
    description: data.pattern.description,
  };
}

export default async function PatternDetailPage({ params }: PageProps<'/inspirations/pattern/[slug]'>) {
  const { slug } = await params;
  const data = await inspirationsApi.getPattern(slug).catch(() => null);
  if (!data) notFound();
  return <PatternDetailView pattern={data.pattern} screens={data.screens} />;
}
