import type { PageFilterConfig } from "@/lib/filter-dimensions";

export const streamsFilterConfig: PageFilterConfig = {
  dimensions: [
    {
      id: "person",
      label: "Developer",
      kinds: ["filter", "groupBy"],
      options: { type: "query", field: "developers" },
    },
    {
      id: "project",
      label: "Project",
      kinds: ["filter", "groupBy"],
      options: { type: "query", field: "projects" },
    },
    {
      id: "model",
      label: "Model",
      kinds: ["filter"],
      options: {
        type: "static",
        values: ["opus", "sonnet", "haiku"],
      },
    },
    {
      id: "startedAt",
      label: "Started",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
    {
      id: "duration",
      label: "Duration",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
  ],
  defaultGroupBy: ["person"],
};
