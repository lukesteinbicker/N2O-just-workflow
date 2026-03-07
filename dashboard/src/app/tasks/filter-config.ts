import type { PageFilterConfig } from "@/lib/filter-dimensions";

export const tasksFilterConfig: PageFilterConfig = {
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
      id: "status",
      label: "Status",
      kinds: ["filter", "groupBy", "sortBy"],
      options: {
        type: "static",
        values: ["pending", "red", "green", "blocked"],
      },
    },
    {
      id: "sprint",
      label: "Sprint",
      kinds: ["filter", "groupBy"],
      options: { type: "query", field: "sprints" },
    },
    {
      id: "type",
      label: "Type",
      kinds: ["filter"],
      options: {
        type: "static",
        values: ["feature", "bug", "chore", "test", "docs", "refactor"],
      },
    },
    {
      id: "taskNum",
      label: "#",
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
      id: "title",
      label: "Title",
      kinds: ["sortBy"],
      options: { type: "static", values: [] },
    },
  ],
  defaultGroupBy: ["sprint"],
  defaultSortBy: [{ key: "taskNum", direction: "asc" }],
};
