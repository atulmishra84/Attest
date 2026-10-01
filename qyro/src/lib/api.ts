const TOKEN_KEY = 'qyro_token';
const USER_KEY = 'qyro_user';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type ControlCounts = {
  effective: number;
  ineffective: number;
  violated: number;
  unknown: number;
  notTested: number;
};

export type FleetSummary = {
  agents: number;
  stale: number;
  effective: number;
  ineffective: number;
  violated: number;
  unknown: number;
  notTested: number;
};

export type AgentSummary = {
  id: string;
  name: string;
  source: string;
  status: string;
  provider?: string;
  controls: ControlCounts;
  lastEvaluated: string;
};

export type DriftAlert = {
  id: string;
  agentId: string;
  agentName: string;
  controlId: string | null;
  fromState: string | null;
  toState: string;
  message: string;
  createdAt: string;
};

export type ControlResult = {
  control_id: string;
  name: string;
  state: string;
  description: string;
  evaluatedAt: string;
};

export type RuntimeEvent = {
  id: number;
  event_type: string;
  operation: string | null;
  resource: string | null;
  timestamp: string;
};

export type FlowNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string };
  style?: Record<string, string | number>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
};

export type CapabilityGraph = {
  provider: string;
  source: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  evaluatedAt?: string;
};

export type ThreatFinding = {
  id: string;
  agentId?: string;
  agentName?: string;
  kind: string;
  severity: string;
  summary: string;
  evidence: string;
  createdAt: string;
};

export type Citation = {
  framework: string;
  citation: string;
  title: string;
};

export type EvidenceRow = {
  agentId: string;
  agentName: string;
  source: string;
  status: string;
  controlId: string;
  controlName: string;
  state: string;
  evidence: string;
  frameworks: string;
  citations: Citation[];
};

export type EvidencePack = {
  generatedAt: string;
  controls: EvidenceRow[];
  threats: ThreatFinding[];
  quarantined: { id: string; name: string; status: string }[];
};

export type CoverageRow = {
  framework: string;
  citation: string;
  title: string;
  effective: number;
  violated: number;
  ineffective: number;
  other: number;
};

export type BlastRank = {
  id: string;
  name: string;
  provider: string;
  owner: string | null;
  score: number;
  reasons: string[];
};

export type GateDecision = {
  id: string;
  decision: string;
  operation: string | null;
  resource: string | null;
  tool: string | null;
  reason: string;
  controls: { control_id: string; state: string; message: string }[];
  createdAt: string;
};

export type Assurance = {
  agent_id: string;
  name: string;
  source: string;
  status: string;
  control_results: ControlResult[];
  capability: CapabilityGraph | null;
  runtime_events: RuntimeEvent[];
  threats?: ThreatFinding[];
  gate?: GateDecision | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  summary?: FleetSummary;
};

export type IntentControl = {
  id: string;
  name: string;
  intentDesc: string | null;
  requirementType: string;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
