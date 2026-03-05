import { describe, it, expect } from "vitest";
import { navItems } from "../sidebar";

describe("sidebar navItems", () => {
  it("contains Tasks, Streams, and Ontology", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toContain("Tasks");
    expect(labels).toContain("Streams");
    expect(labels).toContain("Ontology");
  });

  it("has Tasks as the first item", () => {
    expect(navItems[0].label).toBe("Tasks");
  });

  it("does not include Activity in nav items", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).not.toContain("Activity");
  });

  it("does not include Health in nav items", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).not.toContain("Health");
  });

  it("does not include Velocity, Team, or Skills in nav items", () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).not.toContain("Velocity");
    expect(labels).not.toContain("Team");
    expect(labels).not.toContain("Skills");
  });

  it("has exactly 3 nav items", () => {
    expect(navItems).toHaveLength(3);
  });

  it("maps Tasks to /tasks", () => {
    const tasks = navItems.find((item) => item.label === "Tasks");
    expect(tasks?.href).toBe("/tasks");
  });

  it("maps Streams to /streams", () => {
    const streams = navItems.find((item) => item.label === "Streams");
    expect(streams?.href).toBe("/streams");
  });

  it("maps Ontology to /ontology", () => {
    const ontology = navItems.find((item) => item.label === "Ontology");
    expect(ontology?.href).toBe("/ontology");
  });
});
