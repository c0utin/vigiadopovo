import snapshot from "./data/portal.json";
import type { ThemeLabel } from "./legislative.ts";

// The contract remains stable even when a snapshot contains no summaries or votes.
export interface Proposition {
  id: number;
  label: string;
  type: string;
  ementa: string;
  presentedAt: string;
  status: {
    descricaoSituacao: string | null;
    descricaoTramitacao: string | null;
    dataHora: string | null;
    siglaOrgao: string | null;
    despacho: string | null;
  } | null;
  authors: { name: string; type: string }[];
  labels?: readonly ThemeLabel[];
  url: string;
  apiUrl: string;
  documentUrl: string | null;
  votes: {
    id: string;
    date: string;
    description: string;
    organ: string;
    url: string;
  }[];
  sourceHash: string;
  summary: {
    title: string;
    text: string;
    topic: string;
    generatedAt: string;
    method: string;
    sourceHash: string;
    scope: string;
  } | null;
}

const portal: {
  collectedAt: string;
  coverage: string;
  propositions: Proposition[];
} = snapshot;
export default portal;
