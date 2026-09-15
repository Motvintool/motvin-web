import type { Metadata } from 'next';
import { CollectionsView } from '@/components/inspirations/views/CollectionsView';

export const metadata: Metadata = { title: 'Collections — Motvin Inspirations' };

export default function CollectionsPage() {
  return <CollectionsView />;
}
