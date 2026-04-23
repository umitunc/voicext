import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Box,
  ListMusic,
  Settings,
  X,
  Minus,
  Square,
  UploadCloud,
  ChevronDown,
  Cpu,
  Monitor
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import logo from './assets/logo.png'

import CustomSelect from './components/CustomSelect'
import ResultModal from './components/ResultModal'
import SrtEditor from './components/SrtEditor'

const languages = [
  { id: 'auto', name: 'AUTO (Recommended)' },
  { id: 'tr', name: 'Turkish' },
  { id: 'en', name: 'English' }
]

const models = [
  { id: 'small', name: 'SMALL (Recommended, 460MB)' },
  { id: 'base', name: 'BASE (Fast, Lower Quality, 140MB)' },
  { id: 'medium', name: 'MEDIUM (Best Quality, 1.5GB)' },
  { id: 'large', name: 'LARGE (Highest Quality, 3GB)' }
]

const formats = [
  { id: 'srt', name: '.SRT (Premiere Pro Compatible)' },
  { id: 'vtt', name: '.VTT (Web Standard)' },
  { id: 'txt', name: '.TXT (Plain Text)' }
]

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hardware, setHardware] = useState({ gpu: false, name: 'Detecting...' })
  const [config, setConfig] = useState({
    language: 'tr',
    model: 'small',
    format: 'srt'
  })
  const [showResult, setShowResult] = useState(null)
  const [selectedSrt, setSelectedSrt] = useState(null)

  useEffect(() => {
    if (!window.api) {
      console.error('Electron API not found!')
      return
    }
    window.api.detectHardware().then(setHardware)

    window.api.onTranscriptionProgress((p) => {
      setProgress(p)
    })
  }, [])

  const handleControl = (action) => {
    if (!window.api) return
    window.api.windowControls(action)
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0]
      // In Electron, we can get the real path
      setFile({ name: f.name, path: f.path || f.name })
    }
  }

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mp3,.wav,.m4a'
    input.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        const f = e.target.files[0]
        setFile({ name: f.name, path: f.path || f.name })
      }
    }
    input.click()
  }

  const startTranscription = async () => {
    if (!file) return
    setIsTranscribing(true)
    setProgress(0)

    try {
      const result = await window.api.startTranscription(file.path, config)
      if (result.success) {
        setShowResult(result.outputPath)
      }
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleSelectSrt = async () => {
    const filters = [{ name: 'Subtitle Files', extensions: ['srt'] }]
    const path = await window.api.selectFile(filters)
    if (path) {
      setSelectedSrt(path)
    }
  }

  return (
    <div className="app-container">
      {/* Titlebar */}
      <div className="titlebar">
        <div className="window-controls">
          <button onClick={() => handleControl('minimize')} className="control-btn"><Minus size={16} /></button>
          <button onClick={() => handleControl('maximize')} className="control-btn"><Square size={12} /></button>
          <button onClick={() => handleControl('close')} className="control-btn close"><X size={16} /></button>
        </div>
      </div>

      <div className="main-layout">
        {/* Header */}
        <header className="header">
          <div className="logo-section">
            <img src={logo} alt="Voicext Logo" style={{ height: '128px' }} />
          </div>

          <nav className="nav-tabs">
            {['dashboard', 'models', 'editor', 'settings'].map((tab) => (
              <div
                key={tab}
                className={`nav-item ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'dashboard' && <LayoutDashboard size={18} />}
                {tab === 'models' && <Box size={18} />}
                {tab === 'editor' && <ListMusic size={18} />}
                {tab === 'settings' && <Settings size={18} />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            ))}
          </nav>
        </header>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="dashboard-grid"
            >
              <div
                className={`drop-zone glass ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleFileSelect}
              >
                {isTranscribing ? (
                  <div className="transcription-status">
                    <div className="progress-circle">
                      <svg width="120" height="120">
                        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                        <motion.circle
                          cx="60" cy="60" r="54" fill="none"
                          stroke="url(#gradient)" strokeWidth="8"
                          strokeDasharray="339.29"
                          initial={{ strokeDashoffset: 339.29 }}
                          animate={{ strokeDashoffset: 339.29 - (339.29 * progress) / 100 }}
                          strokeLinecap="round"
                        />
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="var(--primary-cyan)" />
                            <stop offset="100%" stopColor="var(--primary-magenta)" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="progress-text">{Math.round(progress)}%</div>
                    </div>
                    <h3>Transcribing...</h3>
                    <p>{file?.name}</p>
                  </div>
                ) : (
                  <>
                    <div className="drop-icon-container">
                      <div className="drop-icon-bg"></div>
                      <UploadCloud size={80} color="white" style={{ position: 'relative', zIndex: 1 }} />
                    </div>
                    {file ? (
                      <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: '20px', color: 'var(--primary-cyan)' }}>{file.name}</h2>
                        <p>File Ready for Transcription</p>
                        <button
                          className="btn-secondary"
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          style={{ marginTop: '10px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#666', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer' }}
                        >
                          Change File
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2>DRAG & DROP YOUR AUDIO FILE HERE</h2>
                        <p>OR CLICK TO BROWSE</p>
                        <span style={{ fontSize: '10px', color: '#666', marginTop: '20px' }}>
                          Supported: MP3, WAV, M4A (Max: 2GB)
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>

              <aside className="sidebar-config">
                <div className="config-card glass">
                  <div className="config-title">
                    <Monitor size={14} />
                    Quick Configuration
                  </div>

                  <CustomSelect
                    label="Language:"
                    options={languages}
                    value={config.language}
                    onChange={(val) => setConfig({ ...config, language: val })}
                  />

                  <CustomSelect
                    label="Model:"
                    options={models}
                    value={config.model}
                    onChange={(val) => setConfig({ ...config, model: val })}
                  />

                  <CustomSelect
                    label="Format:"
                    options={formats}
                    value={config.format}
                    onChange={(val) => setConfig({ ...config, format: val })}
                  />

                  <button
                    className="btn-primary"
                    style={{ marginTop: '20px', opacity: file ? 1 : 0.5, cursor: file ? 'pointer' : 'not-allowed' }}
                    disabled={!file || isTranscribing}
                    onClick={startTranscription}
                  >
                    {isTranscribing ? 'Processing...' : 'Start Transcription'}
                  </button>
                </div>
              </aside>
            </motion.div>
          )}

          {activeTab === 'models' && (
            <motion.div
              key="models"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="models-view glass"
              style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <h2>Model Management</h2>
              <p style={{ color: 'var(--text-muted)' }}>Download and manage local AI models for offline transcription.</p>
              <div className="models-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
                {['Base', 'Small', 'Medium', 'Large'].map(m => (
                  <div key={m} className="glass" style={{ padding: '20px', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '10px' }}>{m}</h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '15px' }}>
                      {m === 'Base' ? '140 MB' : m === 'Small' ? '460 MB' : m === 'Medium' ? '1.5 GB' : '2.9 GB'}
                    </div>
                    <button className="btn-secondary" style={{ padding: '8px 15px', borderRadius: '15px', border: '1px solid var(--primary-cyan)', color: 'var(--primary-cyan)', background: 'none' }}>
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'editor' && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="queue-view"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              {selectedSrt ? (
                <SrtEditor filePath={selectedSrt} onClose={() => setSelectedSrt(null)} />
              ) : (
                <div className="queue-empty glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                  <div className="drop-icon-container">
                    <div className="drop-icon-bg"></div>
                    <ListMusic size={80} color="white" style={{ position: 'relative', zIndex: 1 }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h2>SRT EDITOR</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Select an SRT file to fix timestamps and edit text.</p>
                    <button className="btn-primary" style={{ maxWidth: '300px', margin: '0 auto' }} onClick={handleSelectSrt}>
                      Browse SRT Files
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Bar */}
      <footer className="status-bar">
        <div className="status-indicator">
          <div className="indicator-dot" style={{ backgroundColor: hardware.gpu ? '#00ff88' : '#ffaa00', boxShadow: hardware.gpu ? '0 0 8px #00ff88' : '0 0 8px #ffaa00' }}></div>
          <span>SYSTEM: {hardware.name.toUpperCase()} {hardware.gpu ? 'DETECTED (GPU ACCELERATION ON)' : 'DETECTED (CPU ONLY)'}</span>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span>{isTranscribing ? 'PROCESSING...' : 'READY'}</span>
          <div className="offline-badge">
            OFFLINE MODE ACTIVE
          </div>
        </div>
      </footer>

      {/* Custom Result Modal */}
      <ResultModal 
        isOpen={!!showResult} 
        path={showResult} 
        onClose={() => setShowResult(null)} 
        onEdit={(path) => {
          setSelectedSrt(path)
          setActiveTab('editor')
        }}
      />
    </div>
  )
}

export default App
