import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  parseFilterParams,
  buildFilterParams,
  useGlobalFilters,
  type GlobalFilters,
} from "../use-global-filters";

// Mock Next.js navigation
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams("");
const mockPathname = "/tasks";

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

describe("parseFilterParams", () => {
  it("should return empty defaults when no params present", () => {
    const params = new URLSearchParams("");
    const result = parseFilterParams(params);

    expect(result.filters).toEqual({});
    expect(result.groupBy).toEqual([]);
    expect(result.sortBy).toEqual([]);
  });

  it("should parse f.person multi-select param", () => {
    const params = new URLSearchParams("f.person=ada,bob");
    const result = parseFilterParams(params);

    expect(result.filters.person).toEqual(["ada", "bob"]);
  });

  it("should parse f.status param", () => {
    const params = new URLSearchParams("f.status=red,blocked");
    const result = parseFilterParams(params);

    expect(result.filters.status).toEqual(["red", "blocked"]);
  });

  it("should parse g param for groupBy chain", () => {
    const params = new URLSearchParams("g=sprint,developer");
    const result = parseFilterParams(params);

    expect(result.groupBy).toEqual(["sprint", "developer"]);
  });

  it("should parse s param for sortBy chain with directions", () => {
    const params = new URLSearchParams("s=status:asc,taskNum:desc");
    const result = parseFilterParams(params);

    expect(result.sortBy).toEqual([
      { key: "status", direction: "asc" },
      { key: "taskNum", direction: "desc" },
    ]);
  });

  it("should default sortBy direction to asc when not specified", () => {
    const params = new URLSearchParams("s=status");
    const result = parseFilterParams(params);

    expect(result.sortBy).toEqual([{ key: "status", direction: "asc" }]);
  });

  it("should parse all new-format params together", () => {
    const params = new URLSearchParams("f.person=ada&f.status=red&g=sprint&s=blowUp:desc");
    const result = parseFilterParams(params);

    expect(result.filters.person).toEqual(["ada"]);
    expect(result.filters.status).toEqual(["red"]);
    expect(result.groupBy).toEqual(["sprint"]);
    expect(result.sortBy).toEqual([{ key: "blowUp", direction: "desc" }]);
  });

  // Legacy backwards-compat
  it("should migrate legacy person param to new format", () => {
    const params = new URLSearchParams("person=ada");
    const result = parseFilterParams(params);

    expect(result.filters.person).toEqual(["ada"]);
  });

  it("should migrate legacy project param to new format", () => {
    const params = new URLSearchParams("project=coordination");
    const result = parseFilterParams(params);

    expect(result.filters.project).toEqual(["coordination"]);
  });

  it("should migrate legacy groupBy param to new format", () => {
    const params = new URLSearchParams("groupBy=developer");
    const result = parseFilterParams(params);

    expect(result.groupBy).toEqual(["developer"]);
  });

  it("should migrate all legacy params together", () => {
    const params = new URLSearchParams("person=ada&project=coordination&groupBy=developer");
    const result = parseFilterParams(params);

    expect(result.filters.person).toEqual(["ada"]);
    expect(result.filters.project).toEqual(["coordination"]);
    expect(result.groupBy).toEqual(["developer"]);
  });
});

describe("buildFilterParams", () => {
  it("should return empty string for empty filters", () => {
    const state: GlobalFilters = { filters: {}, groupBy: [], sortBy: [] };
    expect(buildFilterParams(state)).toBe("");
  });

  it("should include f.person when set", () => {
    const state: GlobalFilters = {
      filters: { person: ["ada"] },
      groupBy: [],
      sortBy: [],
    };
    const result = buildFilterParams(state);
    const params = new URLSearchParams(result);

    expect(params.get("f.person")).toBe("ada");
  });

  it("should join multi-select values with commas", () => {
    const state: GlobalFilters = {
      filters: { status: ["red", "blocked"] },
      groupBy: [],
      sortBy: [],
    };
    const result = buildFilterParams(state);
    const params = new URLSearchParams(result);

    expect(params.get("f.status")).toBe("red,blocked");
  });

  it("should include g param for groupBy", () => {
    const state: GlobalFilters = {
      filters: {},
      groupBy: ["sprint", "developer"],
      sortBy: [],
    };
    const result = buildFilterParams(state);
    const params = new URLSearchParams(result);

    expect(params.get("g")).toBe("sprint,developer");
  });

  it("should include s param for sortBy with directions", () => {
    const state: GlobalFilters = {
      filters: {},
      groupBy: [],
      sortBy: [
        { key: "status", direction: "asc" },
        { key: "taskNum", direction: "desc" },
      ],
    };
    const result = buildFilterParams(state);
    const params = new URLSearchParams(result);

    expect(params.get("s")).toBe("status:asc,taskNum:desc");
  });

  it("should preserve existing non-filter params", () => {
    const state: GlobalFilters = {
      filters: { person: ["ada"] },
      groupBy: [],
      sortBy: [],
    };
    const existing = new URLSearchParams("chat=abc123&tab=settings");
    const result = buildFilterParams(state, existing);
    const params = new URLSearchParams(result);

    expect(params.get("f.person")).toBe("ada");
    expect(params.get("chat")).toBe("abc123");
    expect(params.get("tab")).toBe("settings");
  });

  it("should strip legacy params from existing", () => {
    const state: GlobalFilters = { filters: {}, groupBy: [], sortBy: [] };
    const existing = new URLSearchParams("person=ada&project=coordination&groupBy=developer&chat=abc");
    const result = buildFilterParams(state, existing);
    const params = new URLSearchParams(result);

    expect(params.has("person")).toBe(false);
    expect(params.has("project")).toBe(false);
    expect(params.has("groupBy")).toBe(false);
    expect(params.get("chat")).toBe("abc");
  });

  it("should roundtrip through parse and build", () => {
    const original: GlobalFilters = {
      filters: { person: ["ada"], status: ["red", "blocked"] },
      groupBy: ["sprint"],
      sortBy: [{ key: "blowUp", direction: "desc" }],
    };
    const paramString = buildFilterParams(original);
    const parsed = parseFilterParams(new URLSearchParams(paramString));

    expect(parsed).toEqual(original);
  });
});

describe("useGlobalFilters hook", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams("");
  });

  it("should return empty defaults when URL has no params", () => {
    const { result } = renderHook(() => useGlobalFilters());

    expect(result.current.filters).toEqual({});
    expect(result.current.groupBy).toEqual([]);
    expect(result.current.sortBy).toEqual([]);
    expect(result.current.activeCount).toBe(0);
  });

  it("should read new-format filter values from URL", () => {
    mockSearchParams = new URLSearchParams("f.person=ada&g=developer&s=blowUp:desc");
    const { result } = renderHook(() => useGlobalFilters());

    expect(result.current.filters.person).toEqual(["ada"]);
    expect(result.current.groupBy).toEqual(["developer"]);
    expect(result.current.sortBy).toEqual([{ key: "blowUp", direction: "desc" }]);
  });

  it("should toggle a filter value on", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.toggleFilterValue("status", "red");
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("f.status")).toBe("red");
  });

  it("should add a groupBy dimension", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.addGroupBy("developer");
    });

    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("g")).toBe("developer");
  });

  it("should add a sortBy clause", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.addSortBy("blowUp", "desc");
    });

    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("s")).toBe("blowUp:desc");
  });

  it("should clear all filters, groupBy, and sortBy", () => {
    mockSearchParams = new URLSearchParams("f.person=ada&g=developer&s=blowUp:desc");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.clearAll();
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks",
      { scroll: false }
    );
  });

  it("should preserve non-filter URL params when updating", () => {
    mockSearchParams = new URLSearchParams("chat=abc123&f.person=ada");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setFilter("person", ["bob"]);
    });

    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("chat")).toBe("abc123");
    expect(params.get("f.person")).toBe("bob");
  });

  it("should count active filter clauses", () => {
    mockSearchParams = new URLSearchParams("f.person=ada,bob&f.status=red&g=sprint&s=blowUp:desc");
    const { result } = renderHook(() => useGlobalFilters());

    // 2 person values + 1 status value + 1 groupBy + 1 sortBy = 5
    expect(result.current.activeCount).toBe(5);
  });
});
