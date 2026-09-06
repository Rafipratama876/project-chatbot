/**
 * The Dimensional Letters API client — a sibling to `client.ts`, not an
 * extension of it. Talks to `/api/v1/dl-*` only; nothing here ever calls a
 * `/proofs` or `/designs` (Channel Letters) route, and nothing in `client.ts`
 * is imported here.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const API = `${BASE_URL}/api/v1`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = options?.body
    ? { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }
    : options?.headers;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(await readError(res, path));
  return res.json();
}

async function readError(res: Response, path: string): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { message?: unknown; issues?: Array<{ path: string; message: string }> };
    if (parsed.issues?.length) return parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join('; ');
  } catch { /* not JSON — fall through to the raw body */ }
  return body || `${path} failed (${res.status})`;
}

export interface DLMaterialFamilyOption {
  id: string; label: string; illuminable: boolean;
  minHeight: number; maxHeight: number; minDepth: number; maxDepth: number;
}
export interface DLMountOption { id: string; label: string; description: string; standoff: boolean }
export interface DLFinishOption { id: string; label: string; appliesTo: string[] }

export interface DLKnowledgeOptions {
  dlVersion: string;
  materialFamily: string[];
  materialFamilies: DLMaterialFamilyOption[];
  mountingMethod: string[];
  mounts: DLMountOption[];
  finishes: DLFinishOption[];
}

/** What the wizard collects — see StepDLSpec / NewDimensionalLetterWizardPage. */
export interface DLSpecForm {
  materialFamily: string;
  finish?: string;
  colour?: string;
  mountingMethod: string;
  mountingSurfaceColour?: string;
  mountingSurfaceTexture?: 'smooth' | 'uneven' | 'unspecified';
  depth?: number;
  quantity?: number;
  illuminated?: boolean;
  ledColour?: string;
  showSizesOnProof?: boolean;
  showMaterialThickness?: boolean;
  additionalInformation?: string;
}

export interface DLWizardPayload extends DLSpecForm {
  logoText: string;
  logoUrl: string;
  wallPresetId?: string;
  customWallImageUrl?: string;
  widthInches: number;
  heightInches: number;
  maxSignAreaAllowed?: number;
  box: { xFrac: number; yFrac: number; widthFrac: number; heightFrac: number };
  facadeRect?: {
    corners: Array<{ x: number; y: number }>;
    widthInches: number;
    heightInches: number;
  };
}

export interface DLProofPanel { label: string; view: string; camera: string; file: string }

export interface DLProof {
  id: string;
  jobId: string;
  status: 'queued' | 'running' | 'ready' | 'blocked' | 'failed';
  dlVersion: string;
  /** The first proof in this revision chain — stable across revise/regenerate. */
  rootProofId: string;
  version: number;
  approved: boolean;
  specBlock: string | null;
  disclosures: string | null;
  panels: DLProofPanel[];
  problems: string[];
  blocked: boolean;
  escalations: Array<{ ruleId: string; reason: string; question: string }>;
  rulesFired: Array<{ ruleId: string; severity: string; count: number }>;
  createdAt: string;
}

/** Same shape as CL's `ChatMessage` — structurally, not by import, so `ChatPanel` (generic) takes it unmodified. */
export interface DLChatMessage {
  id: string;
  role: 'USER' | 'AGENT';
  content: string;
  createdAt: string;
}

export const dlApi = {
  options: () => request<DLKnowledgeOptions>('/dl-knowledge/options'),
  createFromWizard: (payload: DLWizardPayload) =>
    request<DLProof>('/dl-proofs/wizard', { method: 'POST', body: JSON.stringify(payload) }),
  getProof: (id: string) => request<DLProof>(`/dl-proofs/${id}`),
  sheetUrl: (id: string) => `${API}/dl-proofs/${id}/sheet`,
  /** A panel's `file` is a server filesystem path — only its basename is addressable. */
  panelUrl: (id: string, panel: DLProofPanel) => `${API}/dl-proofs/${id}/panels/${basename(panel.file)}`,

  // ── Revision chain (rootProofId) ─────────────────────────────────────────
  latest: (rootId: string) => request<DLProof>(`/dl-proofs/root/${rootId}/latest`),
  versions: (rootId: string) => request<DLProof[]>(`/dl-proofs/root/${rootId}/versions`),
  regenerate: (rootId: string) =>
    request<DLProof>(`/dl-proofs/root/${rootId}/regenerate`, { method: 'POST' }),
  approve: (id: string) => request<DLProof>(`/dl-proofs/${id}/approve`, { method: 'PATCH' }),
  messages: (rootId: string) => request<DLChatMessage[]>(`/dl-proofs/root/${rootId}/messages`),
  chat: (rootId: string, message: string) =>
    request<{ agentMessage: DLChatMessage; proof: DLProof | null; specChanged: boolean }>(
      `/dl-proofs/root/${rootId}/chat`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  exportPdf: (rootId: string) =>
    request<{ url: string }>(`/dl-proofs/root/${rootId}/export/pdf`, { method: 'POST' }),
  assetUrl: (path: string) => `${BASE_URL}${path}`,

  // Logo/wall uploads are generic (not Channel-Letters-specific) — reused
  // directly from the CL client rather than duplicated here.
};

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}
