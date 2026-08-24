// SPIKE VW-425
import sample from "./samples/input_example.json";

const BASE_URL = process.env.REACHTOOL_BASE_URL ?? "http://localhost:8000";

// the shapre reference to reference to REACHTOOL/samples/example_network.json
export interface Asset {
  id: string;
  cpe?: string[];
  exposure?: string;
  criticality?: { level: "low" | "medium" | "high" | "critical" };
  interfaces?: { ipv4: string }[];
  open_ports?: { port: number; service?: "https" }[];
  findings?: { id: string }[];
}

export interface FirewallRule {
  // add
}

export interface InputDoc {
  // input data
}

interface OutputDoc {
  assets: ScoredAsset[];
  nodes: ScoreNode[];
}

interface Confidence {
  basis: string;
  level: string;
  note: string;
}

interface Score {
  score: number;
  confidence?: Confidence;
  probability?: number;
  contributors?: string[];
}

interface ScoredAsset {
  id: string;
  findings: [];
  identity?: {};
  scores: {
    local_risk: Score;
    blast_radius: Score;
    priority: Score;
    reachability: Score;
  };
  exposure?: string;
}

interface ScoreNode {
  id: string;
  scores: {
    reachability: Score;
    local_risk: Score;
    blast_radius: Score;
    priority: Score;
  };
}

async function post<T>(
  path: string,
  body: unknown,
  timeoutMS = 30_000,
): Promise<T> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMS);
  try {
    const res = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
    if (!res.ok) throw new Error(`ReachTool Error`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

const get = async <T>(path: string): Promise<T> =>
  (await fetch(BASE_URL + path)).json();

export const meta = () => get<Record<string, unknown>>("/meta");

export const outputSchema = () => get<unknown>("/schema/output");

export const inputSchema = () => get<unknown>("/schema/input");

export const check = (doc: InputDoc) => post<any>("/check", doc);

export async function health(): Promise<boolean> {
  try {
    return (await fetch(`${BASE_URL}/health`, { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(timeoutMS = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMS;
  while (Date.now() < deadline) {
    if (await health()) return;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`reachtool not healthy at ${BASE_URL} after ${timeoutMS}`);
}

export const score = (doc: InputDoc, entry?: string, ablate?: string[]) => {
  const query = new URLSearchParams();
  if (entry) query.set("entry", entry);
  if (ablate?.length) query.set("ablate", ablate.join("."));
  const queryString = query.toString();
  return post<OutputDoc>(`/score${queryString ? `?${queryString}` : ""}`, doc);
};

export const CONFIDENCE_MIN = 0.6;
export const REACH_MIN = 0.5;

export type Verdict = "REACHABLE" | "NOT_REACHABLE" | "UNKNOWN";

export const classify = (score: any): Verdict => {
  if (score?.confidence.level === "low") return "UNKNOWN";
  const probability = score?.probability ?? score.score / 100;
  return probability >= 0.5 ? "REACHABLE" : "NOT_REACHABLE";
};

const round = (num: number) => Math.round(num * 1000) / 1000;

export const toVerdict = (num: any) => ({
  assetId: num.id,
  verdict: classify(num.scores.reachability),
  value: round(num.scores.reachability.value),
  confidence: round(num.scores.reachability.confidence),
  evidence: num.scores.reachability.evidence ?? [],
  blastRadius: round(num.scores.blast_radius?.value ?? 0),
  localRisk: round(num.scores.local_risk?.value ?? 0),
});

export async function canReach(doc: InputDoc, from: string, to?: string) {
  const testSample = doc || sample;
  const output = await score(testSample, from);

  const results = output.assets
    .filter((asset) => asset.id !== from)
    .map((asset) => {
      const reach = asset.scores.reachability;
      return {
        assetId: asset.id,
        verdict: classify(reach),
        probability: reach?.probability,
        confidence: reach?.confidence,
        basis: reach?.confidence?.basis,
        note: reach?.confidence?.note,
        path: reach?.contributors,
        blastRadius: asset.scores.blast_radius.score,
      };
    });

  if (to) {
    const target = results.find((r) => r.assetId === to);
    if (!target) throw new Error(`${to} not in scored output`);
    return { injectedAt: from, target };
  }

  return {
    injectedAt: from,
    reachable: results
      .filter((reach) => reach.verdict === "REACHABLE")
      .sort((a, b) => b.blastRadius - a.blastRadius),
    notReachable: results
      .filter((result) => result.verdict === "NOT_REACHABLE")
      .map((result) => result.assetId),
    unknown: results
      .filter((result) => result.verdict === "UNKNOWN")
      .map((result) => result.assetId),
  };
}

export async function lateralMovement(doc: InputDoc, assetId: string) {
  const testSample = doc || sample;
  const output = await score(testSample, assetId);

  const self = output.assets.find((asset) => asset.id === assetId);
  if (!self) throw new Error(`${assetId} not in scored output`);

  const others = output.assets
    .filter((asset) => asset.id !== assetId)
    .map(toVerdict);
  const reachable = others
    .filter((reach) => reach.verdict === "REACHABLE")
    .sort((a, b) => b.blastRadius - a.blastRadius);

  return {
    compromisedAsset: assetId,
    localRisk: self.scores.local_risk.score,
    blastRadius: self.scores.blast_radius.score,
    blastRadiusBasis: self.scores.blast_radius.confidence?.level,
    blaskRadiusEvidence: self.scores.blast_radius.contributors,
    privotsTo: reachable,
    criticalPivots: reachable.filter(
      (reachable) => reachable.blastRadius >= 70,
    ),
  };
}

export async function internetExposure(doc: InputDoc, assetId: string) {
  const testSample = doc || sample;
  const output = await score(testSample, assetId);
  const entries = output.assets
    .filter((asset) => asset.exposure === "internet")
    .map((asset) => asset.id);

  if (entries.length === 0) {
    return {
      assetId,
      verdict: "UNKNOWN",
      reason: "no asset marked internet-facing",
    };
  }
  const perEntry = [];
  for (const entry of entries) {
    const node = output.assets.find((asset) => asset.id === assetId);
    if (node) perEntry.push({ via: entry, ...toVerdict(node) });
  }

  const verdict =
    perEntry.find((r) => r.verdict === "REACHABLE")?.verdict ??
    perEntry.find((r) => r.verdict === "UNKNOWN")?.verdict ??
    "NOT_REACHABLE";

  return {
    assetId,
    verdict,
    internetFacing: entries,
    perEntry,
  };
}
