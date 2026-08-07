/**
 * Shared Source Library state — the main Sources tab and every learning-object
 * "Pull from library" picker read/write the same collections.
 */

export interface CollectionSource {
  id: string;
  title: string;
  kind: string;
  pages?: number;
  duration?: string;
  note?: string;
  purpose: 'Generation' | 'Embeddings';
  role: 'Primary' | 'Supporting' | 'Reference';
}

export interface SourceCollectionLocal {
  id: string;
  name: string;
  kind: 'folder' | 'pool';
  scope: string;
  objectName?: string;
  sources: CollectionSource[];
}

export type PickedLibrarySource = Pick<
  CollectionSource,
  'id' | 'title' | 'kind' | 'purpose' | 'role' | 'pages' | 'duration' | 'note'
>;

type Listener = () => void;

let collections: SourceCollectionLocal[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function getSourceCollections(): SourceCollectionLocal[] {
  return collections;
}

export function setSourceCollections(next: SourceCollectionLocal[]): void {
  collections = next;
  emit();
}

export function subscribeSourceCollections(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
