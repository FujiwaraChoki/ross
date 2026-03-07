import { Button } from '@/components/ui/button'

function App(): React.JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-4xl font-bold">ross</h1>
      <p className="text-muted-foreground">
        Electron + React + Tailwind + shadcn
      </p>
      <div className="flex gap-2">
        <Button variant="outline" render={<a href="https://electron-vite.org/" target="_blank" rel="noreferrer" />}>
          Documentation
        </Button>
        <Button onClick={ipcHandle}>Send IPC</Button>
      </div>
    </div>
  )
}

export default App
