// Capacity planner data types and JSON data import

export interface Config {
  student_count: number;
  professional_count: number;
  lead_ceiling_per_professional: number;
  timeline_start: string;
  timeline_end: string;
}

export interface Project {
  id: string;
  name: string;
  seats: number;
  start: string;
  end: string;
  prob: number;
  tier: "active" | "pipeline" | "speculative" | "internal";
  notes: string;
}

export interface Company {
  id: string;
  name: string;
  projects: Project[];
}

export interface CapacityData {
  config: Config;
  companies: Company[];
  overlays: TimelineOverlay[];
}

export interface DailyPoint {
  date: Date;
  ms: number;
  frac: number;
  raw: number;
  cnt: number;
}

export interface Tick {
  px: number;
  width: number;
  label: string;
  major: boolean;
  isMonth: boolean;
}

export interface ProbStyle {
  bar: string;
  bg: string;
}

export interface TierMeta {
  label: string;
  color: string;
  order: number;
}

export interface TimelineOverlay {
  id: string;
  label: string;
  start: string;
  end: string;
  color?: string;
  notes?: string;
}

export const DATA: CapacityData = {
  config: {
    student_count: 5,
    professional_count: 1,
    lead_ceiling_per_professional: 8,
    timeline_start: "2026-02-15",
    timeline_end: "2027-01-01",
  },
  companies: [
    {
      id: "totalcents",
      name: "TotalCents",
      projects: [
        { id: "tc", name: "TotalCents", seats: 1, start: "2026-02-15", end: "2026-03-15", prob: 100, tier: "active", notes: "Final QA / testing then done." },
      ],
    },
    {
      id: "gps-federal",
      name: "GPS Federal",
      projects: [
        { id: "gps", name: "River Platform", seats: 1, start: "2026-02-15", end: "2026-03-29", prob: 100, tier: "active", notes: "Finish + stabilize, then seat frees. ~$230K flagship contract." },
      ],
    },
    {
      id: "armature",
      name: "Armature",
      projects: [
        { id: "arm", name: "Compliance Platform", seats: 2, start: "2026-02-15", end: "2026-08-31", prob: 100, tier: "active", notes: "New platform + data infra; anchor client work. RAG pipeline, Uppy/Companion, Docling." },
      ],
    },
    {
      id: "cdao",
      name: "CDAO / Pentagon",
      projects: [
        { id: "cdao-sprint", name: "AI Sprint Work", seats: 3, start: "2026-03-15", end: "2026-08-31", prob: 90, tier: "pipeline", notes: "Flagship prestige; keep 3 end-to-end. Advana confirmed as DoD-approved stack." },
      ],
    },
    {
      id: "marine-corps",
      name: "Marine Corps PEO(A)",
      projects: [
        { id: "peoa", name: "Aviation Dashboards", seats: 2, start: "2026-03-08", end: "2026-08-31", prob: 80, tier: "pipeline", notes: "Can start now (design, proto, backlog). React + EnigmaJS/Qlik + Advana/Databricks." },
      ],
    },
    {
      id: "lmi",
      name: "LMI",
      projects: [
        { id: "lmi-1", name: "Raptor / DHS Logistics", seats: 3, start: "2026-04-01", end: "2026-09-30", prob: 80, tier: "pipeline", notes: "First LMI project; 3 seats. Jonathan Stammler as champion, Joe Norton as CPO." },
        { id: "lmi-2", name: "Project 2", seats: 2, start: "2026-07-01", end: "2026-12-31", prob: 50, tier: "pipeline", notes: "Follow-on from Raptor if Project 1 executes well." },
        { id: "lmi-3", name: "Project 3", seats: 2, start: "2026-09-01", end: "2027-01-01", prob: 30, tier: "speculative", notes: "Early discussion; depends on Raptor success and LMI budget cycle." },
      ],
    },
    {
      id: "neumo",
      name: "Neumo",
      projects: [
        { id: "neumo-1", name: "Judicial Management", seats: 3, start: "2026-04-01", end: "2026-12-31", prob: 70, tier: "pipeline", notes: "Core platform work. Sarah Ratcliffe, Griffin Leach. SDA drafted." },
      ],
    },
    {
      id: "monarch-quantum",
      name: "Monarch Quantum",
      projects: [
        { id: "monarch", name: "AI/ML Manufacturing", seats: 2, start: "2026-05-01", end: "2026-08-31", prob: 40, tier: "pipeline", notes: "Early convo; size at 2 until scoping. Eric Takeuchi, Rudy Bermudez." },
      ],
    },
    {
      id: "c3-ai",
      name: "C3 AI",
      projects: [
        { id: "c3", name: "Initial Engagement", seats: 2, start: "2026-05-01", end: "2026-12-31", prob: 40, tier: "pipeline", notes: "Depends on capability follow-up; assume 2 for first engagement." },
      ],
    },
    {
      id: "scholarrx",
      name: "ScholarRx",
      projects: [
        { id: "srx", name: "ScholarRx", seats: 2, start: "2026-06-01", end: "2026-12-31", prob: 10, tier: "speculative", notes: "10% chance estimate." },
      ],
    },
    {
      id: "goodmaps",
      name: "GoodMaps",
      projects: [
        { id: "gm", name: "GoodMaps", seats: 2, start: "2026-06-01", end: "2026-12-31", prob: 20, tier: "speculative", notes: "20% chance estimate." },
      ],
    },
    {
      id: "nos-internal",
      name: "NOS Internal",
      projects: [
        { id: "onb", name: "Onboarding Platform", seats: 1, start: "2026-02-15", end: "2026-03-15", prob: 100, tier: "internal", notes: "Wrap in ~1 week; then off the board." },
        { id: "wf", name: "Workflow / Delivery", seats: 1, start: "2026-02-15", end: "2026-12-31", prob: 100, tier: "internal", notes: "Dedicated 1 seat always." },
        { id: "fkaren", name: "FKaren", seats: 1, start: "2026-02-02", end: "2026-03-22", prob: 100, tier: "internal", notes: "Internal load balancer project." },
      ],
    },
  ],
  overlays: [
    { id: "finals-sp26", label: "Finals", start: "2026-04-30", end: "2026-05-08", color: "rgba(255,183,77,0.08)", notes: "UVA Spring 2026 final examinations" },
    { id: "summer-26", label: "Summer Break", start: "2026-05-08", end: "2026-08-24", color: "rgba(66,165,245,0.08)", notes: "Summer break — UVA fall arrival Aug 20-24, classes Aug 25" },
    { id: "finals-fa26", label: "Finals", start: "2026-12-10", end: "2026-12-18", color: "rgba(255,183,77,0.08)", notes: "UVA Fall 2026 final examinations" },
  ],
};
