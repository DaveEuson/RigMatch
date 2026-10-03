// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { AudioLines, Code2, Eye, Film, Image as ImageIcon, LayoutGrid, MessageSquare, Mic, type LucideIcon } from 'lucide-react';
import type { WorkbenchId } from './workbench';

/** One icon per channel, shared by the channel switch and the channel's winner card. */
export const CHANNEL_ICONS: Record<WorkbenchId, LucideIcon> = {
  all: LayoutGrid,
  chat: MessageSquare,
  code: Code2,
  images: ImageIcon,
  video: Film,
  listening: Mic,
  reading: Eye,
  audio: AudioLines,
};
