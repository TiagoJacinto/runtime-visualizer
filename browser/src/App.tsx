import { Theme } from './settings/types';
import { LiveWorkspacePage } from './pages/liveWorkspace/liveWorkspace.page';

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

  return (
    <>
      <LiveWorkspacePage />
    </>);
  // %EXPORT_STATEMENT%
}

export default App;