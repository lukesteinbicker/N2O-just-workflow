/**
 * PostgreSQL schema adapter for the Ontology explorer.
 *
 * Implements SchemaAdapter for SQL-sourced schemas. All tables get a single
 * "tables" category. No sample data queries (getEntityColumns returns undefined).
 */

import { Database } from "lucide-react";
import type { SchemaAdapter, CategoryConfigEntry, EntityColumnsConfig } from "./schema-adapter";

const CATEGORY_CONFIG: Record<string, CategoryConfigEntry> = {
  tables: { label: "Tables", color: "#2D72D2", icon: Database },
};

export const postgresqlAdapter: SchemaAdapter = {
  name: "PostgreSQL",

  getCategoryConfig() {
    return CATEGORY_CONFIG;
  },

  getCategoryForType(): string {
    return "tables";
  },

  getEntityColumns(): EntityColumnsConfig | undefined {
    return undefined;
  },
};
