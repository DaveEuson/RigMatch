// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelSortKey, SortDirection } from '../lib/modelCatalog';
import { ArrowUpDown } from 'lucide-react';

export function SortableModelHeader({
  label,
  sortName,
  sortKey,
  direction,
  onSort,
  onResizeStart,
}: {
  label: string;
  sortName: ModelSortKey;
  sortKey: ModelSortKey;
  direction: SortDirection;
  onSort: (sortName: ModelSortKey) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}) {
  const active = sortName === sortKey;

  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={active ? 'sort-header active' : 'sort-header'}
        onClick={() => onSort(sortName)}
      >
        <span>{label}</span>
        <ArrowUpDown aria-hidden="true" />
      </button>
      {onResizeStart && (
        <span
          className="col-resize-handle"
          onMouseDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          role="separator"
          aria-label={`Resize ${label} column`}
        />
      )}
    </th>
  );
}
