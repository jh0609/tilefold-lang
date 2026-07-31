import { expect, test, type Page } from "@playwright/test";

function watchBrowserIssues(page: Page) {
  const issues = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

test("theme preference can be selected and persists across reload", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const app = page.locator(".editor-app");
  const themePicker = page.getByRole("combobox", { name: "Theme" });
  await expect(themePicker).toHaveValue("system");
  await expect(app).toHaveAttribute("data-theme", "system");

  await themePicker.selectOption("dark");
  await expect(app).toHaveAttribute("data-theme", "dark");
  await expect(themePicker).toHaveValue("dark");
  await expect
    .poll(() =>
      page.locator(".canvas-shell").evaluate((node) => {
        const styles = getComputedStyle(node);
        return styles.backgroundColor;
      }),
    )
    .toBe("rgb(17, 24, 39)");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Theme" })).toHaveValue(
    "dark",
  );
  await expect(page.locator(".editor-app")).toHaveAttribute(
    "data-theme",
    "dark",
  );

  await page.getByRole("combobox", { name: "Theme" }).selectOption("light");
  await expect(page.locator(".editor-app")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await expect
    .poll(() =>
      page.locator(".canvas-shell").evaluate((node) => {
        const styles = getComputedStyle(node);
        return styles.backgroundColor;
      }),
    )
    .toBe("rgb(245, 247, 250)");

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
