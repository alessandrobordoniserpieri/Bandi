export interface ClientProfile {
  id: string;
  name: string;
  type: string;
  legalAddress: string;
  city: string;
  province: string;
  region: string;
  operationalSite: string;
  area: string;
  geoScope: string;
  status: string;
  contact: string;
  contactInfo: string;
  website: string;
  vat: string;
  founded: string;
  capacity: CapacityLevel;
  priority: number;
  budget: string;
  cofunding: string;
  staff: string;
  volunteers: string;
  statuteStatus: string;
  financialReports: string;
  registryRunts: string;
  registryRasd: string;
  registryOther: string;
  rasdName: string;
  rasdNumber: string;
  sportBody: string;
  sportActivities: string;
  rasdCheckStatus: string;
  rasdLastCheck: string;
  spaces: string;
  documents: string;
  documentFiles: ClientDocument[];
  documentInsights: string;
  documentTags: string[];
  fundingInsights: string;
  fundingTypes: string[];
  winningCriteria: string[];
  tags: string[];
  activities: string;
  strengths: string;
  weaknesses: string;
  publicPartners: string;
  privatePartners: string;
  projectHistory: string;
  fundedProjects: string;
  reportingHistory: string;
  goals: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  text: string;
  preview: string;
  extractionMethod: string;
  extractionQuality: number;
  tags: string[];
  projectSignals: string[];
  fundingType: string;
  fundingEvidence: string[];
  winningCriteria: string[];
}

export interface Grant {
  id: string;
  title: string;
  provider: string;
  sourceId: string;
  url: string;
  status: string;
  deadline: string;
  area: string;
  geoScope: string;
  amount: string;
  cofunding: string;
  eligibleTypes: string[];
  tags: string[];
  minCapacity: CapacityLevel;
  complexity: ComplexityLevel;
  requirements: string;
  expenses: string;
  summary: string;
  notes: string;
  beneficiaries: string;
  detail: string;
  importMode: string;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export type CapacityLevel = "Bassa" | "Media" | "Alta";
export type ComplexityLevel = "Bassa" | "Media" | "Alta";

export type Verdict =
  | "Candidabile"
  | "Da preparare"
  | "Da verificare"
  | "Bassa priorità"
  | "Storico";

export interface BreakdownItem {
  label: string;
  value: number;
  max: number;
  note: string;
}

export interface DocumentProfile {
  score: number;
  label: string;
  found: string[];
  missing: string[];
  totalDocs: number;
}

export interface MatchResult {
  score: number;
  plus: string[];
  minus: string[];
  sharedTags: string[];
  breakdown: BreakdownItem[];
  actions: string[];
  client: ClientProfile;
  grant: Grant;
}
