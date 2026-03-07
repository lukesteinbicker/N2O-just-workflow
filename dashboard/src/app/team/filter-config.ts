import type { PageFilterConfig } from "@/lib/filter-dimensions";

export const teamFilterConfig: PageFilterConfig = {
  dimensions: [
    {
      id: "role",
      label: "Role",
      kinds: ["filter"],
      options: {
        type: "static",
        values: ["developer", "lead", "intern"],
      },
    },
    {
      id: "velocity",
      label: "Velocity",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
    {
      id: "blowUp",
      label: "Blow-up",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
    {
      id: "completed",
      label: "Completed",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
    {
      id: "aGrade",
      label: "A-grade %",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
  ],
};
