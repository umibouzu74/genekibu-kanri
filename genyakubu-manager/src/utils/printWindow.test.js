// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { waitForSelector } from "./printWindow";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waitForSelector", () => {
  it("もうあればすぐ true", async () => {
    document.body.innerHTML = '<div class="month-print-root"></div>';
    await expect(waitForSelector(".month-print-root")).resolves.toBe(true);
  });

  it("後から現れたら true (Suspense の「読み込み中...」の後に中身が出る形)", async () => {
    setTimeout(() => {
      const el = document.createElement("div");
      el.className = "month-print-root";
      document.body.appendChild(el);
    }, 20);
    await expect(waitForSelector(".month-print-root", { timeoutMs: 2000 })).resolves.toBe(true);
  });

  it("現れないまま期限を過ぎたら false (止まらない)", async () => {
    await expect(waitForSelector(".month-print-root", { timeoutMs: 30 })).resolves.toBe(false);
  });
});
