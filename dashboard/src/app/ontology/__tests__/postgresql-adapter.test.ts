/**
 * Tests for the PostgreSQL schema adapter.
 *
 * Verifies that the adapter correctly implements the SchemaAdapter interface
 * with a single "tables" category and no entity column queries.
 */

import { describe, it, expect } from "vitest";
import { Database } from "lucide-react";
import { postgresqlAdapter } from "../postgresql-adapter";
import { graphqlAdapter } from "../graphql-adapter";
import type { SchemaAdapter } from "../schema-adapter";

describe("postgresqlAdapter", () => {
  // ── SchemaAdapter contract ────────────────────────────
  it("implements all SchemaAdapter methods", () => {
    // Verify runtime contract — all interface methods exist and are callable
    const adapter: SchemaAdapter = postgresqlAdapter;
    expect(adapter.name).toBe("PostgreSQL");
    expect(typeof adapter.getCategoryConfig).toBe("function");
    expect(typeof adapter.getCategoryForType).toBe("function");
    expect(typeof adapter.getEntityColumns).toBe("function");
  });

  // ── getCategoryConfig ──────────────────────────────────
  describe("getCategoryConfig", () => {
    it("returns exactly one category named 'tables' with correct properties", () => {
      const config = postgresqlAdapter.getCategoryConfig();
      const keys = Object.keys(config);
      expect(keys).toEqual(["tables"]);
      expect(config.tables).toEqual({
        label: "Tables",
        color: "#2D72D2",
        icon: Database,
      });
    });

    it("returns same config object on repeated calls", () => {
      const config1 = postgresqlAdapter.getCategoryConfig();
      const config2 = postgresqlAdapter.getCategoryConfig();
      expect(config1).toBe(config2);
    });
  });

  // ── getCategoryForType ─────────────────────────────────
  describe("getCategoryForType", () => {
    it("returns 'tables' for all table names — SQL has no category distinctions", () => {
      const names = ["users", "orders", "SomeRandomTable", "workflow_events", ""];
      for (const name of names) {
        expect(postgresqlAdapter.getCategoryForType(name)).toBe("tables");
      }
    });
  });

  // ── getEntityColumns ───────────────────────────────────
  describe("getEntityColumns", () => {
    it("returns undefined — SQL adapter has no sample queries", () => {
      expect(postgresqlAdapter.getEntityColumns("users")).toBeUndefined();
      expect(postgresqlAdapter.getEntityColumns("orders")).toBeUndefined();
      expect(postgresqlAdapter.getEntityColumns("")).toBeUndefined();
    });
  });

  // ── Adapter interchangeability ─────────────────────────
  describe("interchangeability with graphqlAdapter", () => {
    it("both adapters return category configs with label, color, and icon per entry", () => {
      const pgConfig = postgresqlAdapter.getCategoryConfig();
      const gqlConfig = graphqlAdapter.getCategoryConfig();

      for (const [, entry] of Object.entries(pgConfig)) {
        expect(typeof entry.label).toBe("string");
        expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(entry.icon).not.toBeUndefined();
      }
      for (const [, entry] of Object.entries(gqlConfig)) {
        expect(typeof entry.label).toBe("string");
        expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(entry.icon).not.toBeUndefined();
      }
    });

    it("getCategoryForType always returns a key present in getCategoryConfig", () => {
      const pgConfig = postgresqlAdapter.getCategoryConfig();
      const category = postgresqlAdapter.getCategoryForType("any_table");
      expect(pgConfig).toHaveProperty(category);

      const gqlConfig = graphqlAdapter.getCategoryConfig();
      const gqlCategory = graphqlAdapter.getCategoryForType("Task");
      expect(gqlConfig).toHaveProperty(gqlCategory);
    });
  });
});
