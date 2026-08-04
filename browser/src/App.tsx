import { Theme } from './settings/types';
import { LiveProcedureWorkspace } from './components/generated/LiveProcedureWorkspace';

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
      <LiveProcedureWorkspace />
    </>);
  // %EXPORT_STATEMENT%
}

export default App;