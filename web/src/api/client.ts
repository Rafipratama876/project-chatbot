const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const API = `${BASE_URL}/api/v1`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Only declare a JSON body when there is one. Fastify rejects a request that
  // claims application/json and then sends nothing — which is every one of the
  // bodyless POSTs and PATCHes here: render, approve, export.
  const headers = options?.body
    ? { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }
    : options?.headers;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(await readError(res, path));
  return res.json();
}

/**
 * The server's own message, not "Request failed (400)".
 *
 * Nearly every 400 from this API is something the customer can act on — an
 * unfinished wall step, a Custom with no detail, a logo that traced to nothing.
 * Swallowing that into a status code turns a fixable mistake into a dead end.
 */
async function readError(res: Response, path: string): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { message?: unknown; issues?: Array<{ path: string; message: string }> };
    if (parsed.issues?.length) {
      return parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    }
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join('; ');
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return body || `${path} failed (${res.status})`;
}

async function uploadFile<T>(path: string, file: Blob, filename: string): Promise<T> {
  const form = new FormData();
  form.append('file', file, filename);
  const res = await fetch(`${API}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res, path));
  return res.json();
}

export interface Point { x: number; y: number }

export interface WallPreset {
  id: string;
  name: string;
  imageUrl: string;
  description?: string | null;
  imageWidth: number;
  imageHeight: number;
  /** How wide the depicted wall really is, edge to edge. */
  imageWidthInches: number;
}

/** The specification form — the customer's words, not a validated spec. */
export interface SignSpec {
  channelLetterType: string;
  faceColor: string;
  faceColorTreatment: string;
  faceColorTreatmentCustomDetail?: string | null;
  trimCapColor: string;
  returnColor: string;
  returnDepth: string;
  returnDepthCustomDetail?: string | null;
  installationMethod: string;
  installationMethodCustomDetail?: string | null;
  backerPanelOption: string;
  backerPanelCustomDetail?: string | null;
  backerPanelColor?: string | null;
  quantity: number;
  materialsThicknessOption: string;
  additionalInformation?: string;
}

/**
 * Renders run on a queue, so one exists — and can be polled — from the moment
 * it is PENDING, before any image does. BLOCKED is CL-R-46: the engine
 * finished and the answer is that a human has to look at it.
 */
export type RenderStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'BLOCKED';

export interface Render {
  id: string;
  version: number;
  status: RenderStatus;
  errorMessage: string | null;
  dayImageUrl: string | null;
  nightImageUrl: string | null;
  /** Set when a panel could not use the customer's photograph. */
  dayNote?: string | null;
  nightNote?: string | null;
  blocked: boolean;
  escalations: Array<{ ruleId: string; reason: string; question: string }>;
  problems: string[];
  rulesFired: number;
  sheetUrl: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'USER' | 'AGENT';
  content: string;
  createdAt: string;
}

export interface FacadeRect {
  corners: Point[];
  widthInches: number;
  heightInches: number;
}

export interface Design {
  id: string;
  name: string;
  status: 'DRAFT' | 'RENDERING' | 'READY' | 'APPROVED';
  logoUrl: string | null;
  logoText: string | null;
  wallPresetId: string | null;
  wallPreset: WallPreset | null;
  customWallImageUrl: string | null;
  positionX: number | null;
  positionY: number | null;
  scale: number | null;
  scaleY: number | null;
  widthInches: number | null;
  heightInches: number | null;
  areaSqFt: number | null;
  maxSignAreaAllowed: number | null;
  facadeRect: FacadeRect | null;
  wallImageWidth: number | null;
  wallImageHeight: number | null;
  spec: Partial<SignSpec> | null;
  renders: Render[];
  chatMessages: ChatMessage[];
}

export interface WallPositionPayload {
  wallPresetId?: string;
  customWallImageUrl?: string;
  positionX: number;
  positionY: number;
  scale: number;
  scaleY: number;
  widthInches: number;
  heightInches: number;
  maxSignAreaAllowed?: number;
  facadeRect?: FacadeRect;
}

export interface KnowledgeOptions {
  channelLetterType: string[];
  installationMethod: string[];
  backerPanelOption: string[];
  trimCapColours: string[];
  returnDepths?: number[];
}

export const api = {
  listWallPresets: () => request<WallPreset[]>('/wall-presets'),
  listDesigns: () => request<Design[]>('/designs'),
  getDesign: (id: string) => request<Design>(`/designs/${id}`),
  createDesign: (name: string) =>
    request<Design>('/designs', { method: 'POST', body: JSON.stringify({ name }) }),
  updateLogo: (id: string, data: { logoUrl?: string; logoText?: string }) =>
    request<Design>(`/designs/${id}/logo`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateWallPosition: (id: string, data: WallPositionPayload) =>
    request<Design>(`/designs/${id}/wall-position`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateSpec: (id: string, data: Partial<SignSpec>) =>
    request<Design>(`/designs/${id}/spec`, { method: 'PATCH', body: JSON.stringify(data) }),
  generateRender: (id: string) => request<Render>(`/designs/${id}/render`, { method: 'POST' }),
  revise: (id: string, message: string) =>
    request<{ agentMessage: ChatMessage; render: Render | null; specChanged: boolean }>(
      `/designs/${id}/revise`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  approve: (id: string) => request<Design>(`/designs/${id}/approve`, { method: 'PATCH' }),
  exportPdf: (id: string) => request<{ url: string }>(`/designs/${id}/export/pdf`, { method: 'POST' }),

  uploadLogo: (file: Blob, filename: string) =>
    uploadFile<{ url: string }>('/uploads/image/logos', file, filename),
  uploadWallPhoto: (file: Blob, filename: string) =>
    uploadFile<{ url: string; width: number; height: number }>('/uploads/image/walls', file, filename),
  removeBackground: (file: Blob, filename: string) =>
    uploadFile<{ url: string; removed: number; notes: string[] }>(
      '/uploads/logo/remove-background', file, filename,
    ),

  options: () => request<KnowledgeOptions>('/knowledge/options'),

  /** A stored "/static/…" path → something an <img> can load. */
  assetUrl: (path: string) => `${BASE_URL}${path}`,
  sheetUrl: (render: Render) => `${BASE_URL}${render.sheetUrl}`,
};
