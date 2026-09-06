/**
 * The Sign Cabinet API client — a sibling to `client.ts`/`dlClient.ts`, not an
 * extension of either. Talks to `/api/v1/sc-*` only; nothing here ever calls
 * a `/proofs` or `/dl-proofs` route, and nothing in `client.ts`/`dlClient.ts`
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

export interface SCFaceMaterialOption { id: string; label: string; illuminable: boolean }
export interface SCMountOption { id: string; label: string; description: string }
export interface SCRetainerOption { id: string; label: string; description: string }

export interface SCKnowledgeOptions {
  scVersion: string;
  faceMaterial: string[];
  faceMaterials: SCFaceMaterialOption[];
  mountingMethod: string[];
  mounts: SCMountOption[];
  retainerTypes: SCRetainerOption[];
  extrusionDepths: number[];
  cornerRadii: number[];
}

/** What the wizard collects — see StepSCSpec / NewSignCabinetWizardPage. */
export interface SCSpecForm {
  faceMaterial: string;
  faceColour?: string;
  illuminated?: boolean;
  ledColour?: string;
  extrusionDepth?: number;
  cornerStyle?: 'square' | 'radius';
  cornerRadius?: number;
  retainerType?: string;
  mountingMethod: string;
  mountingSurfaceColour?: string;
  mountingSurfaceTexture?: 'smooth' | 'uneven' | 'unspecified';
  attachmentDetail?: string;
  quantity?: number;
  showSizesOnProof?: boolean;
  showMaterialThickness?: boolean;
  additionalInformation?: string;
}

export interface SCWizardPayload extends SCSpecForm {
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

export interface SCProofPanel { label: string; view: string; camera: string; file: string }

export interface SCProof {
  id: string;
  jobId: string;
  status: 'queued' | 'running' | 'ready' | 'blocked' | 'failed';
  scVersion: string;
  /** The first proof in this revision chain — stable across revise/regenerate. */
  rootProofId: string;
  version: number;
  approved: boolean;
  specBlock: string | null;
  disclosures: string | null;
  panels: SCProofPanel[];
  problems: string[];
  blocked: boolean;
  escalations: Array<{ ruleId: string; reason: string; question: string }>;
  rulesFired: Array<{ ruleId: string; severity: string; count: number }>;
  createdAt: string;
}

/** Same shape as CL's `ChatMessage` — structurally, not by import, so `ChatPanel` (generic) takes it unmodified. */
export interface SCChatMessage {
  id: string;
  role: 'USER' | 'AGENT';
  content: string;
  createdAt: string;
}

export const scApi = {
  options: () => request<SCKnowledgeOptions>('/sc-knowledge/options'),
  createFromWizard: (payload: SCWizardPayload) =>
    request<SCProof>('/sc-proofs/wizard', { method: 'POST', body: JSON.stringify(payload) }),
  getProof: (id: string) => request<SCProof>(`/sc-proofs/${id}`),
  sheetUrl: (id: string) => `${API}/sc-proofs/${id}/sheet`,
  /** A panel's `file` is a server filesystem path — only its basename is addressable. */
  panelUrl: (id: string, panel: SCProofPanel) => `${API}/sc-proofs/${id}/panels/${basename(panel.file)}`,

  // ── Revision chain (rootProofId) ─────────────────────────────────────────
  latest: (rootId: string) => request<SCProof>(`/sc-proofs/root/${rootId}/latest`),
  versions: (rootId: string) => request<SCProof[]>(`/sc-proofs/root/${rootId}/versions`),
  regenerate: (rootId: string) =>
    request<SCProof>(`/sc-proofs/root/${rootId}/regenerate`, { method: 'POST' }),
  approve: (id: string) => request<SCProof>(`/sc-proofs/${id}/approve`, { method: 'PATCH' }),
  messages: (rootId: string) => request<SCChatMessage[]>(`/sc-proofs/root/${rootId}/messages`),
  chat: (rootId: string, message: string) =>
    request<{ agentMessage: SCChatMessage; proof: SCProof | null; specChanged: boolean }>(
      `/sc-proofs/root/${rootId}/chat`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  exportPdf: (rootId: string) =>
    request<{ url: string }>(`/sc-proofs/root/${rootId}/export/pdf`, { method: 'POST' }),
  assetUrl: (path: string) => `${BASE_URL}${path}`,

  // Logo/wall uploads are generic (not product-specific) — reused directly
  // from the CL client rather than duplicated here.
};

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}
