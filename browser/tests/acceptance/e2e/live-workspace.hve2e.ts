import { expect, type Page } from "@playwright/test";
import { createBdd, test } from "playwright-bdd";
// @ts-expect-error Playwright runs this binding in Node, but the browser project omits Node types.
import { unlink, writeFile } from "node:fs/promises";

const slowFile = "../target/hve2e-slow.ts";
const slowSource = `export async function run(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 8000));
}

await run();
`;

export const { Given, When, Then } = createBdd(test);

function sourcePanel(page: Page) {
  return page.getByRole("region", { name: "Source" });
}

Given("the live workspace is loaded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("live-workspace")).toBeVisible();
});

Given("a slow saved Procedure is available", async ({ page }) => {
  await writeFile(slowFile, slowSource, "utf8");
  await expect(page.getByLabel("File").locator("option", { hasText: "hve2e-slow.ts" })).toBeAttached({ timeout: 10_000 });
});

When(/^I select saved file "([^"]+)"$/, async ({ page }, file: string) => {
  await page.getByLabel("File").selectOption(file);
});

When("I run the displayed Procedure", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Run Procedure" })).toBeEnabled();
  await page.getByRole("button", { name: "Run Procedure" }).click();
});

When("the selected file changes during the Execution", async ({ page }) => {
  await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 5_000 });
  await writeFile(slowFile, `${slowSource}// updated while running\n`, "utf8");
});

When("the Execution reaches a terminal outcome", async ({ page }) => {
  await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 10_000 });
});

Then(/^the source panel contains "([^"]+)"$/, async ({ page }, text: string) => {
  await expect(sourcePanel(page)).toContainText(text, { timeout: 15_000 });
});

Then("the live Control-flow graph is visible", async ({ page }) => {
  await expect(page.getByTestId("control-flow-graph")).toBeVisible();
});

Then("the Scope and Runs context tabs are visible", async ({ page }) => {
  await expect(page.getByRole("tab", { name: /Scope/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Runs/ })).toBeVisible();
});

When("I select the Runs context", async ({ page }) => {
  await page.getByRole("tab", { name: /Runs/ }).click();
});

When("I select the Scope context", async ({ page }) => {
  await page.getByRole("tab", { name: /Scope/ }).click();
});

Then("the Run inspector exposes View and Cancel actions", async ({ page }) => {
  const inspector = page.getByRole("complementary", { name: "Run inspector" });
  await expect(inspector.getByRole("button", { name: /View execution/ }).first()).toBeVisible();
  await expect(inspector.getByRole("button", { name: /Cancel execution/ }).first()).toBeVisible();
});

Then(/^the Run inspector shows a "([^"]+)" outcome$/, async ({ page }, status: string) => {
  await page.getByRole("tab", { name: /Runs/ }).click();
  await expect(page.getByRole("complementary", { name: "Run inspector" })).toContainText(status);
});

Then("analysis diagnostics are visible", async ({ page }) => {
  await expect(
    page.getByRole("alert").filter({
      has: page.getByRole("heading", { name: "Diagnostics" }),
    }),
  ).toBeVisible();
});

Then("the Run Procedure action is disabled", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Run Procedure" })).toBeDisabled();
});

Then(/^the workspace shows "([^"]+)"$/, async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 5_000 });
});

Then("the source stays pinned during the Execution", async ({ page }) => {
  await expect(sourcePanel(page)).not.toContainText("updated while running", { timeout: 5_000 });
});

Then("the workspace refreshes to the newest source", async ({ page }) => {
  await expect(sourcePanel(page)).toContainText("updated while running", { timeout: 15_000 });
  await unlink(slowFile).catch(() => undefined);
});
