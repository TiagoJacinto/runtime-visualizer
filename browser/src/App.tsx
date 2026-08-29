import { Theme } from './settings/types';
import { LiveWorkspacePage } from './pages/liveWorkspace/liveWorkspace.page';
import { LiveGraphExecutionSignalingPrototype } from './pages/liveWorkspace/prototype/LiveGraphExecutionSignalingPrototype';
import { ExecutionHistoryMockup } from './pages/liveWorkspace/prototype/ExecutionHistoryMockup';

let theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  const prototype = new URLSearchParams(window.location.search).get('prototype');
  if (import.meta.env.DEV && prototype === 'execution-signaling') return <LiveGraphExecutionSignalingPrototype />;
  if (import.meta.env.DEV && prototype === 'execution-history') return <ExecutionHistoryMockup />;

  return <LiveWorkspacePage />;
  // %EXPORT_STATEMENT%
}

export default App;