import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import AppShell from './components/AppShell.jsx'
import EvidencePage from './pages/EvidencePage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import ReaderPage from './pages/ReaderPage.jsx'
import SynthesisPage from './pages/SynthesisPage.jsx'
import TodayPage from './pages/TodayPage.jsx'
import WeeklyPage from './pages/WeeklyPage.jsx'
import { proposedConnections, synthesisQuestions } from './data.js'

const validRoutes = ['today', 'reader', 'evidence', 'library', 'weekly', 'synthesis']

function routeFromHash() {
  const route = window.location.hash.replace('#/', '')
  return validRoutes.includes(route) ? route : 'today'
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [toast, setToast] = useState('')
  const [session, setSession] = useState({
    running: false,
    seconds: 0,
    activeCheckpoint: 'question',
    completed: [],
    note: '',
    mode: 'pending',
    locators: { section: '', figure: 'Figure 2', page: '6' },
  })
  const [connections, setConnections] = useState(proposedConnections.map((item) => ({ ...item, status: 'pending', note: '' })))
  const [selectedConnection, setSelectedConnection] = useState(proposedConnections[0].id)
  const [weeklyDraft, setWeeklyDraft] = useState({ hours: 0, insight: '', recall: '', unresolved: '', difference: '', adjust: false })
  const [questions, setQuestions] = useState(synthesisQuestions)

  useEffect(() => {
    const handleHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  useEffect(() => {
    if (!session.running) return undefined
    const timer = window.setInterval(() => setSession((current) => ({ ...current, seconds: current.seconds + 1 })), 1000)
    return () => window.clearInterval(timer)
  }, [session.running])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const navigate = (nextRoute) => {
    window.location.hash = `/${nextRoute}`
    setRoute(nextRoute)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const notify = (message) => setToast(message)

  let content
  if (route === 'reader') {
    content = <ReaderPage session={session} setSession={setSession} onSave={() => notify('草稿已保存在当前原型会话中')} onOpenEvidence={() => navigate('evidence')} />
  } else if (route === 'evidence') {
    content = <EvidencePage connections={connections} setConnections={setConnections} selectedId={selectedConnection} setSelectedId={setSelectedConnection} onPromote={(id) => { setConnections((items) => items.map((item) => item.id === id ? { ...item, status: 'verified' } : item)); notify('连接已提升为“已验证”，请继续检查外推边界') }} />
  } else if (route === 'library') {
    content = <LibraryPage onOpenReader={() => navigate('reader')} />
  } else if (route === 'weekly') {
    content = <WeeklyPage draft={weeklyDraft} setDraft={setWeeklyDraft} onSave={() => notify('W01 周结草稿已保存在当前原型会话中')} />
  } else if (route === 'synthesis') {
    content = <SynthesisPage questions={questions} setQuestions={setQuestions} onNavigate={navigate} />
  } else {
    content = <TodayPage onNavigate={navigate} />
  }

  return (
    <AppShell route={route} onNavigate={navigate}>
      {content}
      {toast ? <div className="toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast('')}><X size={15} /></button></div> : null}
    </AppShell>
  )
}
