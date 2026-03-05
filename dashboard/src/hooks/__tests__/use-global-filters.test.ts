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
  it("should return defaults when no params present", () => {
    const params = new URLSearchParams("");
    const result = parseFilterParams(params);

    expect(result.person).toBeNull();
    expect(result.project).toBeNull();
    expect(result.groupBy).toBe("project");
  });

  it("should parse person param", () => {
    const params = new URLSearchParams("person=ada");
    const result = parseFilterParams(params);

    expect(result.person).toBe("ada");
    expect(result.project).toBeNull();
  });

  it("should parse project param", () => {
    const params = new URLSearchParams("project=coordination");
    const result = parseFilterParams(params);

    expect(result.project).toBe("coordination");
    expect(result.person).toBeNull();
  });

  it("should parse groupBy param with valid values", () => {
    expect(parseFilterParams(new URLSearchParams("groupBy=developer")).groupBy).toBe("developer");
    expect(parseFilterParams(new URLSearchParams("groupBy=status")).groupBy).toBe("status");
    expect(parseFilterParams(new URLSearchParams("groupBy=project")).groupBy).toBe("project");
  });

  it("should default groupBy to project for invalid values", () => {
    const params = new URLSearchParams("groupBy=invalid");
    expect(parseFilterParams(params).groupBy).toBe("project");
  });

  it("should parse all params together", () => {
    const params = new URLSearchParams("person=ada&project=coordination&groupBy=developer");
    const result = parseFilterParams(params);

    expect(result.person).toBe("ada");
    expect(result.project).toBe("coordination");
    expect(result.groupBy).toBe("developer");
  });

  it("should handle URL-encoded values", () => {
    const params = new URLSearchParams("person=john%20doe&project=my%20project");
    const result = parseFilterParams(params);

    expect(result.person).toBe("john doe");
    expect(result.project).toBe("my project");
  });

  it("should treat empty string params as null", () => {
    const params = new URLSearchParams("person=&project=");
    const result = parseFilterParams(params);

    expect(result.person).toBeNull();
    expect(result.project).toBeNull();
  });
});

describe("buildFilterParams", () => {
  it("should return empty string for default filters", () => {
    const filters: GlobalFilters = { person: null, project: null, groupBy: "project" };
    expect(buildFilterParams(filters)).toBe("");
  });

  it("should include person when set", () => {
    const filters: GlobalFilters = { person: "ada", project: null, groupBy: "project" };
    const result = buildFilterParams(filters);
    const params = new URLSearchParams(result);

    expect(params.get("person")).toBe("ada");
    expect(params.has("project")).toBe(false);
    expect(params.has("groupBy")).toBe(false);
  });

  it("should include project when set", () => {
    const filters: GlobalFilters = { person: null, project: "coordination", groupBy: "project" };
    const result = buildFilterParams(filters);
    const params = new URLSearchParams(result);

    expect(params.get("project")).toBe("coordination");
  });

  it("should include groupBy when not default", () => {
    const filters: GlobalFilters = { person: null, project: null, groupBy: "developer" };
    const result = buildFilterParams(filters);
    const params = new URLSearchParams(result);

    expect(params.get("groupBy")).toBe("developer");
  });

  it("should omit groupBy when it equals default (project)", () => {
    const filters: GlobalFilters = { person: "ada", project: null, groupBy: "project" };
    const result = buildFilterParams(filters);
    const params = new URLSearchParams(result);

    expect(params.has("groupBy")).toBe(false);
  });

  it("should include all params when all set", () => {
    const filters: GlobalFilters = { person: "ada", project: "coordination", groupBy: "status" };
    const result = buildFilterParams(filters);
    const params = new URLSearchParams(result);

    expect(params.get("person")).toBe("ada");
    expect(params.get("project")).toBe("coordination");
    expect(params.get("groupBy")).toBe("status");
  });

  it("should preserve existing non-filter params", () => {
    const filters: GlobalFilters = { person: "ada", project: null, groupBy: "project" };
    const existing = new URLSearchParams("chat=abc123&tab=settings");
    const result = buildFilterParams(filters, existing);
    const params = new URLSearchParams(result);

    expect(params.get("person")).toBe("ada");
    expect(params.get("chat")).toBe("abc123");
    expect(params.get("tab")).toBe("settings");
  });

  it("should remove filter params that are null/default", () => {
    const filters: GlobalFilters = { person: null, project: null, groupBy: "project" };
    const existing = new URLSearchParams("person=ada&project=coordination&groupBy=developer&chat=abc");
    const result = buildFilterParams(filters, existing);
    const params = new URLSearchParams(result);

    expect(params.has("person")).toBe(false);
    expect(params.has("project")).toBe(false);
    expect(params.has("groupBy")).toBe(false);
    expect(params.get("chat")).toBe("abc");
  });

  it("should roundtrip through parse and build", () => {
    const original: GlobalFilters = { person: "ada", project: "coordination", groupBy: "developer" };
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

  it("should return default filter values when URL has no params", () => {
    const { result } = renderHook(() => useGlobalFilters());

    expect(result.current.person).toBeNull();
    expect(result.current.project).toBeNull();
    expect(result.current.groupBy).toBe("project");
  });

  it("should read filter values from URL search params", () => {
    mockSearchParams = new URLSearchParams("person=ada&project=coordination&groupBy=developer");
    const { result } = renderHook(() => useGlobalFilters());

    expect(result.current.person).toBe("ada");
    expect(result.current.project).toBe("coordination");
    expect(result.current.groupBy).toBe("developer");
  });

  it("should call router.replace with updated URL when setPerson is called", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setPerson("ada");
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks?person=ada",
      { scroll: false }
    );
  });

  it("should call router.replace with updated URL when setProject is called", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setProject("coordination");
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks?project=coordination",
      { scroll: false }
    );
  });

  it("should call router.replace with updated URL when setGroupBy is called", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setGroupBy("developer");
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks?groupBy=developer",
      { scroll: false }
    );
  });

  it("should preserve existing filter params when updating one filter", () => {
    mockSearchParams = new URLSearchParams("person=ada&groupBy=developer");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setProject("coordination");
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("person")).toBe("ada");
    expect(params.get("project")).toBe("coordination");
    expect(params.get("groupBy")).toBe("developer");
  });

  it("should clear person filter when setPerson(null) is called", () => {
    mockSearchParams = new URLSearchParams("person=ada&project=coordination");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setPerson(null);
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks?project=coordination",
      { scroll: false }
    );
  });

  it("should reset all filters when clearAll is called", () => {
    mockSearchParams = new URLSearchParams("person=ada&project=coordination&groupBy=developer");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.clearAll();
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/tasks",
      { scroll: false }
    );
  });

  it("should preserve non-filter URL params when updating filters", () => {
    mockSearchParams = new URLSearchParams("chat=abc123&person=ada");
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setPerson("bob");
    });

    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("chat")).toBe("abc123");
    expect(params.get("person")).toBe("bob");
  });

  it("should accept partial updates via setFilters", () => {
    const { result } = renderHook(() => useGlobalFilters());

    act(() => {
      result.current.setFilters({ person: "ada", groupBy: "status" });
    });

    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("person")).toBe("ada");
    expect(params.get("groupBy")).toBe("status");
    expect(params.has("project")).toBe(false);
  });
});
