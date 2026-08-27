import { Theme } from './settings/types';
import { LiveWorkspacePage } from './pages/liveWorkspace/liveWorkspace.page';
import { LiveGraphExecutionSignalingPrototype } from './pages/liveWorkspace/prototype/LiveGraphExecutionSignalingPrototype';

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

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('prototype') === 'execution-signaling') {
    return <LiveGraphExecutionSignalingPrototype />;
  }

  return <LiveWorkspacePage />;
  // %EXPORT_STATEMENT%
}

export default App;