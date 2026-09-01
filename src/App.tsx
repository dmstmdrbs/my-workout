import { MemoryRouter, useInRouterContext } from 'react-router-dom'
import { AppShell } from './app/index'

function App() {
  const isInsideRouter = useInRouterContext()

  // Component tests render App directly, while main.tsx supplies BrowserRouter.
  // Keep the fallback at the composition root so AppShell always has one router.
  return isInsideRouter
    ? <AppShell />
    : <MemoryRouter><AppShell /></MemoryRouter>
}

export default App
