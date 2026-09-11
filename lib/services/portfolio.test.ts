import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/portfolio", () => ({
  addPortfolioItemTx: vi.fn(),
  deletePortfolioItem: vi.fn(),
  getOwnedPortfolioItem: vi.fn(),
  listPortfolio: vi.fn(),
  reorderPortfolio: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getFreelancerProfileByUserId: vi.fn() }));
vi.mock("@/lib/storage/portfolio-images", () => ({
  deletePortfolioImages: vi.fn(),
  uploadPortfolioImage: vi.fn(),
  validatePortfolioImage: vi.fn(),
}));

import {
  addPortfolioItemTx,
  deletePortfolioItem,
  getOwnedPortfolioItem,
  listPortfolio,
  reorderPortfolio,
} from "@/lib/db/portfolio";
import { getFreelancerProfileByUserId } from "@/lib/db/users";
import {
  deletePortfolioImages,
  uploadPortfolioImage,
  validatePortfolioImage,
} from "@/lib/storage/portfolio-images";

import {
  addPortfolioItemForUser,
  getPortfolioForUser,
  removePortfolioItemForUser,
  reorderPortfolioForUser,
} from "./portfolio";

const mockProfile = vi.mocked(getFreelancerProfileByUserId);
const mockAdd = vi.mocked(addPortfolioItemTx);
const mockList = vi.mocked(listPortfolio);
const mockOwned = vi.mocked(getOwnedPortfolioItem);
const mockDelete = vi.mocked(deletePortfolioItem);
const mockReorder = vi.mocked(reorderPortfolio);
const mockValidate = vi.mocked(validatePortfolioImage);
const mockUpload = vi.mocked(uploadPortfolioImage);
const mockDeleteImages = vi.mocked(deletePortfolioImages);

const USER = "00000000-0000-4000-8000-000000000001";
const file = () => new File([new Uint8Array(64)], "work.png", { type: "image/png" });

const input = (over: Record<string, unknown> = {}) => ({
  title: "Headless storefront for a furniture brand",
  description: "Rebuilt checkout, 40% faster.",
  linkUrl: null,
  ...over,
}) as never;

beforeEach(() => {
  vi.resetAllMocks();
  mockProfile.mockResolvedValue({ id: "fl_1" } as never);
  mockValidate.mockReturnValue({ ok: true, file: file() });
  mockUpload.mockResolvedValue({ ok: true, url: "https://sb.test/portfolio/u/a.png" });
  mockAdd.mockResolvedValue({ ok: true, id: "p1" });
});

describe("adding an item", () => {
  it("uploads and records it", async () => {
    expect(await addPortfolioItemForUser(USER, input(), file())).toEqual({ ok: true });
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ freelancerId: "fl_1" }));
  });

  it("scans the prose, and refuses BEFORE uploading anything", async () => {
    // A refused item must not leave an orphaned object in a public bucket.
    const result = await addPortfolioItemForUser(
      USER,
      input({ description: "Applicants must pay a registration fee first." }),
      file(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "flagged",
      flag: { field: "description", match: { reason: "UPFRONT_PAYMENT" } },
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("scans the title too", async () => {
    const result = await addPortfolioItemForUser(
      USER,
      input({ title: "Training fee bootcamp build" }),
      file(),
    );
    expect(result).toMatchObject({ ok: false, reason: "flagged", flag: { field: "title" } });
  });

  it("refuses an unusable image without touching the database", async () => {
    mockValidate.mockReturnValue({ ok: false, message: "Use a PNG." });
    expect(await addPortfolioItemForUser(USER, input(), "not-a-file")).toEqual({
      ok: false,
      reason: "invalid-image",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("takes the uploaded image back out when the cap is hit mid-flight", async () => {
    // The cap can be reached between the upload and the insert. Leaving the
    // object would be a file nothing points at, in a public bucket.
    mockAdd.mockResolvedValue({ ok: false, reason: "cap-reached", used: 12 });

    expect(await addPortfolioItemForUser(USER, input(), file())).toEqual({
      ok: false,
      reason: "cap-reached",
    });
    expect(mockDeleteImages).toHaveBeenCalledWith(["https://sb.test/portfolio/u/a.png"]);
  });

  it("refuses before onboarding is finished", async () => {
    mockProfile.mockResolvedValue(null);
    expect(await addPortfolioItemForUser(USER, input(), file())).toEqual({
      ok: false,
      reason: "no-profile",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe("removing an item", () => {
  it("deletes the row, then the image", async () => {
    mockOwned.mockResolvedValue({ id: "p1", imageUrl: "https://sb.test/portfolio/u/a.png" } as never);
    mockDelete.mockResolvedValue(true);

    expect(await removePortfolioItemForUser(USER, "p1")).toEqual({ ok: true });
    expect(mockDeleteImages).toHaveBeenCalledWith(["https://sb.test/portfolio/u/a.png"]);
  });

  it("refuses an id that is not the caller's, and deletes no image", async () => {
    // Ownership is scoped in the query, so somebody else's id simply matches
    // nothing — there is no id to forge.
    mockOwned.mockResolvedValue(null);

    expect(await removePortfolioItemForUser(USER, "someone-elses")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockDeleteImages).not.toHaveBeenCalled();
  });
});

describe("reordering", () => {
  it("passes the caller's own profile, never an id from the request", async () => {
    mockReorder.mockResolvedValue(3);
    expect(await reorderPortfolioForUser(USER, ["c", "a", "b"])).toEqual({ ok: true });
    expect(mockReorder).toHaveBeenCalledWith("fl_1", ["c", "a", "b"]);
  });

  it("refuses when nothing matched — every id belonged elsewhere", async () => {
    mockReorder.mockResolvedValue(0);
    expect(await reorderPortfolioForUser(USER, ["x"])).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("the view", () => {
  it("reports how many slots are left", async () => {
    mockList.mockResolvedValue([{ id: "a" }, { id: "b" }] as never);
    expect(await getPortfolioForUser(USER)).toMatchObject({ ok: true, remaining: 10, max: 12 });
  });

  it("never reports a negative remaining", async () => {
    mockList.mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({ id: String(i) })) as never);
    expect(await getPortfolioForUser(USER)).toMatchObject({ ok: true, remaining: 0 });
  });
});
