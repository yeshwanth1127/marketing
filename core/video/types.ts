// TypeScript types for VideoDesign (schema id "exora.video-design/1").
// Runtime validation and the equivalent JSON Schema live in core/video/design.mjs (validateDesign, VIDEO_DESIGN_JSON_SCHEMA).

export type Hex = `#${string}`;
export type Motion = 'fade' | 'typewriter' | 'words' | 'slide' | 'scale' | 'none';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'none';
export type Align = 'left' | 'center' | 'right';

export type Background =
  | { kind: 'solid'; color: Hex }
  | { kind: 'gradient'; from: Hex; to: Hex; angle?: number }
  | { kind: 'image' | 'video'; file_id: string; dim?: number; color?: Hex };

/** One word of on-screen text. Word-level spans make "italic red polo" a one-op edit. */
export interface Span { text: string; style?: { italic?: boolean; bold?: boolean; underline?: boolean; color?: Hex } }

export interface Beat {
  id: string;               // stable, used for per-beat render caching
  label?: string;           // HOOK / SETUP / PAYOFF ...
  duration: number;         // seconds; re-pacing never re-synthesises audio
  text: Span[];             // headline words
  sub?: Span[];             // optional support line
  caption?: string;         // spoken line, shown in the caption bar when enabled
  style?: { background?: Background; ink?: Hex; align?: Align; motion?: Motion };
}

export interface VideoDesign {
  schema: 'exora.video-design/1';
  asset_id?: string;
  format: 'reel' | 'portrait' | 'square' | 'landscape';
  width: number; height: number; fps: 24 | 25 | 30 | 60;
  theme: {
    background: Background;
    ink: Hex; accent: Hex;
    fonts: { display: { id: string; weight?: number }; body: { id: string; weight?: number } };
    type: { size?: number; sub_size?: number; letter_spacing?: number; line_height?: number; align?: Align; case?: 'none' | 'upper' };
    motion: { preset?: Motion; speed?: number };
    safe_area: number;       // share of width kept clear on every side
  };
  layout: {
    rail?: {concepts?:{name:string;captions:string[];scenes:string[]}[];runId?:string;skills?:{name:string;sha256:string}[];caption:string; file_id:string|null; art:{d:string;fill:Hex}[]; brand:string; captions:string[]; style?:{laneWidth:number;periodSeconds:number;visualScale:number;rotation:number}};
    text_position?: 'top' | 'center' | 'bottom';
    logo?: { position: Corner; file_id: string | null; size?: number };
    locale_tag?: { text: string; position: Corner; visible: boolean };
    caption_bar?: { visible: boolean; position: 'top' | 'bottom'; style: 'plain' | 'bar' };
  };
  beats: Beat[];
  /** Not editable by patch. Narration is reused across visual edits (cache key = text + voice). */
  audio: { voice: { text: string; voice_id: string } | null; source_file_id: string | null; timing: 'proportional' | 'beats' };
  /** Generated footage layers: the only part of a design that may call a generative model. */
  media: { id: string; kind: 'generated_video' | 'generated_image' | 'upload'; beat_id: string; prompt?: string; file_id?: string | null; status?: 'pending' | 'ready' | 'failed' }[];
  /** Brand safety: when locked, colours and fonts must come from palette / fonts. Only /brand/locked is patchable. */
  brand: { palette: Hex[]; fonts: string[]; locked: boolean };
  meta: { source?: 'beat_sheet' | 'on_screen_text' | 'script'; backfilled?: boolean; created_from_version?: number };
}

/** RFC 6902 subset accepted by POST /api/video-design/patch. Paths are limited to /theme, /layout, /beats, /media, /brand/locked. */
export type PatchOp =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string };

export interface DesignVariant { id: string; name: string; ops: PatchOp[]; swatch: { bg: Hex; ink: Hex; accent: Hex } }
