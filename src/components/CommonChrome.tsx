// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import rigmatchBrandIcon from '../assets/rigmatch-brand-icon.svg';

export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src={rigmatchBrandIcon} alt="" draggable={false} />
    </div>
  );
}
