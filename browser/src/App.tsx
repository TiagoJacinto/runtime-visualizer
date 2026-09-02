import type { Theme } from "./settings/types";
import { LiveWorkspacePage } from "./pages/liveWorkspace/liveWorkspace.page";
import { WorkspaceManagementPlacementPrototype } from "./pages/liveWorkspace/prototype/WorkspaceManagementPlacementPrototype";

const theme: Theme = "light";

function App() {
  function setTheme(theme: Theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  setTheme(theme);

  const prototype = new URLSearchParams(window.location.search).get(
    "prototype",
  );
  if (import.meta.env.DEV && prototype === "workspace-management")
    return <WorkspaceManagementPlacementPrototype />;

  return <LiveWorkspacePage />;
  // %EXPORT_STATEMENT%
}

export default App;
