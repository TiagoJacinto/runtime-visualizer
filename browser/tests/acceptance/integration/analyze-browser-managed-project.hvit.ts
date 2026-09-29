import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber/browser";
import { createElement } from "react";
import { afterAll, expect } from "vitest";
import { render } from "vitest-browser-react/pure";
import type { RenderResult } from "vitest-browser-react/pure";

import { LiveWorkspacePage } from "../../../src/pages/liveWorkspace/live-workspace.page.tsx";

const featurePath = new URL(
  "../../../../features/analyze-browser-managed-project.feature",
  import.meta.url
).pathname;
const feature = await loadFeature(featurePath);

let rendered: RenderResult | undefined;
let originalPicker: PropertyDescriptor | undefined;
let projectDirectoryName: string | undefined;

const requireRendered = (): RenderResult => {
  if (rendered === undefined) {
    throw new Error("The project workspace has not been opened.");
  }
  return rendered;
};

const createProject = async (fileName: string): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  projectDirectoryName = `runtime-visualizer-${crypto.randomUUID()}`;
  const directory = await root.getDirectoryHandle(projectDirectoryName, {
    create: true,
  });
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write("work()");
  await writable.close();
  originalPicker = Object.getOwnPropertyDescriptor(
    window,
    "showDirectoryPicker"
  );
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: () => Promise.resolve(directory),
  });
};

afterAll(async () => {
  await rendered?.unmount();
  rendered = undefined;
  if (originalPicker === undefined) {
    Reflect.deleteProperty(window, "showDirectoryPicker");
  } else {
    Object.defineProperty(window, "showDirectoryPicker", originalPicker);
  }
  originalPicker = undefined;
  if (projectDirectoryName !== undefined) {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(projectDirectoryName, { recursive: true });
    projectDirectoryName = undefined;
  }
});

describeFeature(feature, ({ Scenario }) => {
  Scenario("Show a graph for a valid selected file", ({ Given, When, Then, And }) => {
    let selectedFile = "";

    Given(
      'I have opened a project containing a valid {string} file',
      async (_context, fileName: string) => {
        selectedFile = fileName;
        await createProject(fileName);
        rendered = await render(createElement(LiveWorkspacePage));
        await expect
          .element(
            rendered.getByRole("button", { name: "Select project folder" })
          )
          .toBeVisible();
        await rendered
          .getByRole("button", { name: "Select project folder" })
          .click();
        await expect
          .element(rendered.getByRole("treeitem", { name: selectedFile }))
          .toBeVisible();
      }
    );

    When('I select {string}', async (_context, fileName: string) => {
      await requireRendered().getByRole("treeitem", { name: fileName }).click();
    });

    Then("its control-flow graph is displayed", async () => {
      await expect
        .element(
          requireRendered().getByRole("region", {
            name: "Control-flow graph",
          })
        )
        .toBeVisible();
    });

    And("no analysis error is shown", () => {
      expect(document.body.textContent).not.toContain(
        "Cannot read properties of undefined"
      );
    });
  });
});
