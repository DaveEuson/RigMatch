// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { ExternalLink } from 'lucide-react';
import { COMFY_DOWNLOAD_URL } from '../lib/comfySettings';

/**
 * The way to get ComfyUI, for anyone who does not have it: the official
 * download page. Every "ComfyUI is not running" used to say what ComfyUI is
 * without saying where it comes from, which left a newcomer nowhere to go.
 */
export function GetComfyLink({ className = 'btn btn-line btn-sm' }: { className?: string }) {
  return (
    <a className={className} href={COMFY_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
      Get ComfyUI (free)
      <ExternalLink aria-hidden="true" />
    </a>
  );
}
