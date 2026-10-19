import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "../../src/model";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  await page.goto("/");
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function photo(page: Page, width = 1200, height = 800) {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const x = c.getContext("2d")!;
      x.fillStyle = "#ddd9ce";
      x.fillRect(0, 0, width, height);
      x.fillStyle = "#b9baa9";
      x.fillRect(width * 0.35, height * 0.25, width * 0.3, height * 0.6);
      return c.toDataURL("image/png").split(",")[1];
    },
    { width, height },
  );
  await page.getByTestId("photo-input").setInputFiles({
    name: "수어사진.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(page.getByTestId("canvas").locator("image")).toHaveCount(1);
}
async function screenPoints(page: Page, ps: { x: number; y: number }[]) {
  return page.getByTestId("canvas").evaluate((el, points) => {
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    return points.map((p) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(matrix);
      return { x: q.x, y: q.y };
    });
  }, ps);
}
async function draw(page: Page, points: { x: number; y: number }[]) {
  const ps = await screenPoints(page, points);
  await page.mouse.move(ps[0].x, ps[0].y);
  await page.mouse.down();
  for (const p of ps.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
}
async function saved(page: Page): Promise<Project> {
  const [d] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "프로젝트 저장", exact: true }).click(),
  ]);
  return JSON.parse(await readFile((await d.path())!, "utf8"));
}
async function output(page: Page, format: "transparent" | "combined" | "svg") {
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  await page.locator(`input[name="format"][value="${format}"]`).check();
  const [d] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "파일 내보내기", exact: true }).click(),
  ]);
  return readFile((await d.path())!);
}

test("사진 → 경로 → 반전·다중 촉 편집 → 원본 크기 PNG/SVG 출력", async ({
  page,
}) => {
  await photo(page, 900, 600);
  await draw(page, [
    { x: 100, y: 200 },
    { x: 550, y: 200 },
  ]);
  await expect(
    page.getByTestId("canvas").locator("[data-arrow-id]"),
  ).toHaveCount(1);
  const p = await saved(page);
  expect(p.width).toBe(900);
  expect(p.height).toBe(600);
  expect(p.arrows[0].kind).toBe("straight");
  expect(p.arrows[0].points[0].x).toBeCloseTo(100, 0);
  await page.getByRole("button", { name: "방향 반전", exact: true }).click();
  await page.getByRole("button", { name: "화살촉 추가", exact: true }).click();
  const reversed = await saved(page);
  expect(reversed.arrows[0].points.at(-1)!.x).toBeCloseTo(100, 0);
  expect(reversed.arrows[0].heads).toHaveLength(2);
  const png = await output(page, "transparent");
  expect(png.readUInt32BE(16)).toBe(900);
  expect(png.readUInt32BE(20)).toBe(600);
  const alpha = await page.evaluate(async (base64) => {
    const i = new Image();
    i.src = "data:image/png;base64," + base64;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.width;
    c.height = i.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0);
    return {
      empty: ctx.getImageData(10, 10, 1, 1).data[3],
      shaft: ctx.getImageData(300, 200, 1, 1).data[3],
    };
  }, png.toString("base64"));
  expect(alpha).toEqual({ empty: 0, shaft: 255 });
  const combined = await output(page, "combined");
  const bg = await page.evaluate(async (base64) => {
    const i = new Image();
    i.src = "data:image/png;base64," + base64;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.width;
    c.height = i.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0);
    return [...ctx.getImageData(10, 10, 1, 1).data];
  }, combined.toString("base64"));
  expect(bg).toEqual([221, 217, 206, 255]);
  const svg = (await output(page, "svg")).toString();
  expect(svg).toContain('width="900"');
  expect(svg).toContain('height="600"');
  expect(svg).not.toContain("<image");
});

test("시간 제한 없이 나중에 그린 V형 화살촉을 연결한다", async ({ page }) => {
  await photo(page);
  await page.getByRole("button", { name: "화살표 인식", exact: true }).click();
  await draw(page, [
    { x: 250, y: 350 },
    { x: 750, y: 350 },
  ]);
  await page.waitForTimeout(1100);
  await expect(
    page.getByTestId("canvas").locator("[data-arrow-id]"),
  ).toHaveCount(0);
  await draw(page, [
    { x: 695, y: 310 },
    { x: 750, y: 350 },
    { x: 695, y: 390 },
  ]);
  await page.getByRole("button", { name: /^변환/ }).click();
  const p = await saved(page);
  expect(p.arrows).toHaveLength(1);
  expect(p.arrows[0].heads).toHaveLength(1);
  expect(p.arrows[0].rawStrokeIds).toHaveLength(2);
  expect(p.strokes).toHaveLength(2);
});

test("확대 및 화면 이동 후에도 펜 좌표가 원본 좌표와 일치한다", async ({
  page,
}) => {
  await photo(page);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("button", { name: "화면 이동", exact: true }).click();
  const box = (await page.locator(".viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 - 35,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "경로 그리기", exact: true }).click();
  await draw(page, [
    { x: 420, y: 400 },
    { x: 710, y: 420 },
  ]);
  const p = await saved(page);
  expect(p.arrows).toHaveLength(1);
  expect(p.strokes[0].points[0].x).toBeCloseTo(420, 0);
  expect(p.strokes[0].points[0].y).toBeCloseTo(400, 0);
  expect(p.strokes[0].points.at(-1)!.x).toBeCloseTo(710, 0);
  expect(p.strokes[0].points.at(-1)!.y).toBeCloseTo(420, 0);
});

test("복제·삭제·실행 취소·다시 실행과 기본 스타일 저장", async ({ page }) => {
  await photo(page);
  await draw(page, [
    { x: 250, y: 400 },
    { x: 750, y: 400 },
  ]);
  await page.getByRole("button", { name: "복제", exact: true }).click();
  expect((await saved(page)).arrows).toHaveLength(2);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  expect((await saved(page)).arrows).toHaveLength(1);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  expect((await saved(page)).arrows).toHaveLength(2);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  expect((await saved(page)).arrows).toHaveLength(1);
  await page.getByRole("button", { name: "색상 #315f9d", exact: true }).click();
  await page
    .getByRole("button", { name: "이 스타일을 기본값으로 저장", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gyeol-style")!).color,
    ),
  ).toBe("#315f9d");
});

test("프로젝트를 다시 열어 편집하고 자동 임시 저장에서 복구한다", async ({
  page,
}) => {
  await photo(page);
  await draw(page, [
    { x: 200, y: 300 },
    { x: 600, y: 340 },
  ]);
  const original = await saved(page);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "새 작업", exact: true }).click();
  await page.getByTestId("project-input").setInputFiles({
    name: "test.gyeol.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(
    page.getByTestId("canvas").locator("[data-arrow-id]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "선택·이동", exact: true }).click();
  const ps = await screenPoints(page, [{ x: 400, y: 320 }]);
  await page.mouse.click(ps[0].x, ps[0].y);
  await page.getByRole("button", { name: "방향 반전", exact: true }).click();
  const edited = await saved(page);
  expect(edited.arrows[0].points[0].x).toBeCloseTo(600, 0);
  await expect(page.locator(".project-meta")).toContainText(
    "이 기기에 임시 저장됨",
  );
  await page.reload();
  await expect(page.getByText("이전 작업이 남아 있어요")).toBeVisible();
  await page
    .getByRole("button", { name: "이전 작업 복구", exact: true })
    .click();
  expect((await saved(page)).arrows).toEqual(edited.arrows);
});

test("펜 입력 중 손가락 이벤트가 들어와도 획을 끝내거나 추가하지 않는다 (합성 Pointer Events)", async ({
  page,
}) => {
  await photo(page);
  const [a, b, c] = await screenPoints(page, [
    { x: 250, y: 400 },
    { x: 450, y: 400 },
    { x: 650, y: 400 },
  ]);
  const canvas = page.getByTestId("canvas");
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    buttons: 1,
    clientX: a.x,
    clientY: a.y,
    pressure: 0.8,
  });
  await canvas.dispatchEvent("pointermove", {
    pointerId: 10,
    pointerType: "pen",
    buttons: 1,
    clientX: b.x,
    clientY: b.y,
    pressure: 0.2,
  });
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
    buttons: 1,
    clientX: a.x - 20,
    clientY: a.y - 20,
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 11,
    pointerType: "touch",
    button: 0,
    clientX: a.x - 20,
    clientY: a.y - 20,
  });
  await canvas.dispatchEvent("pointermove", {
    pointerId: 10,
    pointerType: "pen",
    buttons: 1,
    clientX: c.x,
    clientY: c.y,
    pressure: 0.6,
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: c.x,
    clientY: c.y,
  });
  const p = await saved(page);
  expect(p.strokes).toHaveLength(1);
  expect(p.strokes[0].pointerType).toBe("pen");
  expect(p.strokes[0].points.at(-1)!.x).toBeCloseTo(650, 0);
  expect(p.arrows[0].style.width).toBe(9);
  expect(p.strokes[0].points[0].pressure).toBeCloseTo(0.8, 5);
});

test("샘플 화면과 태블릿·휴대폰 폭에서 가로 넘침 없이 도구를 표시한다", async ({
  page,
}) => {
  await page.getByRole("button", { name: "화살표 샘플", exact: true }).click();
  await expect(page.locator(".sample-card")).toHaveCount(8);
  await page.getByRole("button", { name: "작업실", exact: true }).click();
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "경로 그리기", exact: true }),
    ).toBeVisible();
  }
});

test("지원하지 않는 프로젝트를 열면 기존 작업을 보존한다", async ({ page }) => {
  await photo(page);
  await draw(page, [
    { x: 200, y: 300 },
    { x: 600, y: 300 },
  ]);
  await page.getByTestId("project-input").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator(".toast")).toContainText("지원하는 결 프로젝트");
  expect((await saved(page)).arrows).toHaveLength(1);
});

test("화살표 이동·끝점·제어점·화살촉·크기·회전 손잡이를 실제 편집에 연결한다", async ({
  page,
}) => {
  await photo(page);
  await draw(page, [
    { x: 250, y: 400 },
    { x: 700, y: 400 },
  ]);
  await page.getByRole("button", { name: "선택·이동", exact: true }).click();
  const [from, to] = await screenPoints(page, [
    { x: 450, y: 400 },
    { x: 490, y: 430 },
  ]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  let p = await saved(page);
  expect(p.arrows[0].points[0].x).toBeCloseTo(290, 0);
  expect(p.arrows[0].points[0].y).toBeCloseTo(430, 0);
  const end = page.locator('circle[aria-label="끝점"]');
  const eb = (await end.boundingBox())!;
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(eb.x + eb.width / 2 + 35, eb.y + eb.height / 2 - 15, {
    steps: 5,
  });
  await page.mouse.up();
  p = await saved(page);
  expect(p.arrows[0].points.at(-1)!.x).toBeGreaterThan(740);
  expect(p.arrows[0].points.at(-1)!.y).toBeLessThan(430);
  await page.getByRole("button", { name: "제어점 편집", exact: true }).click();
  const h = page.locator('rect[aria-label="화살촉 위치 손잡이"]');
  const hb = (await h.boundingBox())!;
  const [target] = await screenPoints(page, [{ x: 550, y: 420 }]);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  p = await saved(page);
  expect(p.arrows[0].heads[0].at).toBeLessThan(0.8);
  expect(p.arrows[0].heads[0].at).toBeGreaterThan(0.2);
  const size = page.locator('rect[aria-label="크기 조절 손잡이"]');
  const sb = (await size.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 25, sb.y + sb.height / 2 + 10, {
    steps: 5,
  });
  await page.mouse.up();
  const scaled = await saved(page);
  expect(scaled.arrows[0].points[0].x).toBeLessThan(p.arrows[0].points[0].x);
  const rot = page.locator('circle[aria-label="회전 손잡이"]');
  const rb = (await rot.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 45, rb.y + rb.height / 2 + 30, {
    steps: 5,
  });
  await page.mouse.up();
  const rotated = await saved(page);
  expect(rotated.arrows[0].points).not.toEqual(scaled.arrows[0].points);
});
