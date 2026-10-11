import type { Relation, Runtime, Work } from './types';

/** The complete directed graph at this conversation checkpoint. */
export function runtimeRelations(work: Work, runtime: Runtime): Relation[] {
  return [...work.relations, ...(runtime.generatedRelations ?? [])].map((relation) => ({
    ...relation,
    label: runtime.relationships[relation.id] ?? relation.label,
    ...(runtime.innerRelationships?.[relation.id] != null
      ? { innerLabel: runtime.innerRelationships[relation.id] }
      : {}),
  }));
}

/** View-only Work: newly linked actors must also appear on a curated map. */
export function relationGraphWork(work: Work, runtime: Runtime): Work {
  return {
    ...work,
    relations: runtimeRelations(work, runtime),
    ...(work.relationNodeIds
      ? {
          relationNodeIds: Array.from(
            new Set([
              ...work.relationNodeIds,
              ...(runtime.generatedRelations ?? []).flatMap((relation) => [
                relation.from,
                relation.to,
              ]),
            ]),
          ),
        }
      : {}),
  };
}
