import React, { useState, useEffect } from 'react'
import {
  FileAudio,
  Box,
  ListMusic,
  Settings,
  X,
  Minus,
  Square,
  UploadCloud,
  ChevronDown,
  Cpu,
  Monitor,
  Languages,
  Film,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2
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
  const [activeTab, setActiveTab] = useState('srt')
  const [dragActive, setDragActive] = useState(false)
  
  // Voice to SRT File & State
  const [srtFile, setSrtFile] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [progress, setProgress] = useState(0)

  // Voice to Translation File & State
  const [translationFile, setTranslationFile] = useState(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationConfig, setTranslationConfig] = useState({
    lipSync: false,
    whisperModel: 'small',  // Whisper STT model: tiny/base/small/medium/large
    ttsModel: 'xtts',       // TTS engine: gtts (offline) | xtts (GPU, voice clone)
    sourceLang: 'tr',
    targetLang: 'en'
  })
  
  // Pipeline Steps State
  const [currentStep, setCurrentStep] = useState('pending')
  const [stepLogs, setStepLogs] = useState([])
  const [pipelineProgress, setPipelineProgress] = useState(0)
  const [stepsStatus, setStepsStatus] = useState({
    init: 'pending',
    audio_extract: 'pending',
    stt: 'pending',
    translation: 'pending',
    cloning: 'pending',
    lipsync: 'pending',
    assembly: 'pending'
  })

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

    // STT Progress handler
    window.api.onTranscriptionProgress((p) => {
      setProgress(p)
    })

    // Video Translation progress status handler
    window.api.onTranslationStatus((status) => {
      if (status.step) {
        setCurrentStep(status.step)
        setStepsStatus(prev => {
          const updated = { ...prev }
          
          // Mark previous steps as completed
          const order = ['init', 'audio_extract', 'stt', 'translation', 'cloning', 'lipsync', 'assembly']
          const currentIdx = order.indexOf(status.step)
          
          order.forEach((step, idx) => {
            if (idx < currentIdx) {
              updated[step] = 'completed'
            } else if (idx === currentIdx) {
              updated[step] = 'active'
            } else {
              updated[step] = 'pending'
            }
          })
          
          if (status.step === 'done') {
            order.forEach(step => {
              updated[step] = 'completed'
            })
          }
          
          return updated
        })
      }
      if (status.progress !== undefined) {
        setPipelineProgress(status.progress)
      }
      if (status.message) {
        setStepLogs(prev => [...prev, status.message])
      }
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
      if (activeTab === 'srt') {
        setSrtFile({ name: f.name, path: f.path || f.name })
      } else {
        setTranslationFile({ name: f.name, path: f.path || f.name })
      }
    }
  }

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    if (activeTab === 'srt') {
      input.accept = '.mp3,.wav,.m4a'
      input.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          const f = e.target.files[0]
          setSrtFile({ name: f.name, path: f.path || f.name })
        }
      }
    } else {
      input.accept = '.mp4,.mkv,.avi,.mov'
      input.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          const f = e.target.files[0]
          setTranslationFile({ name: f.name, path: f.path || f.name })
        }
      }
    }
    input.click()
  }

  const startTranscription = async () => {
    if (!srtFile) return
    setIsTranscribing(true)
    setProgress(0)

    try {
      const result = await window.api.startTranscription(srtFile.path, config)
      if (result.success) {
        setShowResult(result.outputPath)
      }
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setIsTranscribing(false)
    }
  }

  const startVideoTranslation = async () => {
    if (!translationFile) return
    setIsTranslating(true)
    setPipelineProgress(0)
    setStepLogs([])
    
    // Reset steps
    setStepsStatus({
      init: 'active',
      audio_extract: 'pending',
      stt: 'pending',
      translation: 'pending',
      cloning: 'pending',
      lipsync: 'pending',
      assembly: 'pending'
    })

    try {
      const result = await window.api.startVideoTranslation(translationFile.path, translationConfig)
      if (result.success) {
        setShowResult(result.outputPath)
      }
    } catch (error) {
      alert('Video Translation Error: ' + error.message)
    } finally {
      setIsTranslating(false)
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
            {[
              { id: 'srt', label: 'Voice to SRT', icon: <FileAudio size={18} /> },
              { id: 'translation', label: 'Voice to Translation', icon: <Languages size={18} /> },
              { id: 'models', label: 'Models', icon: <Box size={18} /> },
              { id: 'editor', label: 'Editor', icon: <ListMusic size={18} /> },
              { id: 'settings', label: 'Settings', icon: <Settings size={18} /> }
            ].map((tab) => (
              <div
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </div>
            ))}
          </nav>
        </header>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'srt' && (
            <motion.div
              key="srt"
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
                    <p>{srtFile?.name}</p>
                  </div>
                ) : (
                  <>
                    <div className="drop-icon-container">
                      <div className="drop-icon-bg"></div>
                      <UploadCloud size={80} color="white" style={{ position: 'relative', zIndex: 1 }} />
                    </div>
                    {srtFile ? (
                      <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: '20px', color: 'var(--primary-cyan)' }}>{srtFile.name}</h2>
                        <p>File Ready for Transcription</p>
                        <button
                          className="btn-secondary"
                          onClick={(e) => { e.stopPropagation(); setSrtFile(null); }}
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
                    style={{ marginTop: '20px', opacity: srtFile ? 1 : 0.5, cursor: srtFile ? 'pointer' : 'not-allowed' }}
                    disabled={!srtFile || isTranscribing}
                    onClick={startTranscription}
                  >
                    {isTranscribing ? 'Processing...' : 'Start Transcription'}
                  </button>
                </div>
              </aside>
            </motion.div>
          )}

          {activeTab === 'translation' && (
            <motion.div
              key="translation"
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
                onClick={isTranslating ? null : handleFileSelect}
              >
                {isTranslating ? (
                  <div className="translation-pipeline-container" style={{ padding: '0 30px', maxHeight: '350px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '20px', color: 'var(--primary-cyan)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Loader2 className="animate-spin" size={20} />
                        AI Video Translation in Progress...
                      </h3>
                      <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{pipelineProgress}%</span>
                    </div>
                    
                    <div className="pipeline-stepper">
                      {[
                        { key: 'init', name: 'Initializing Pipeline', icon: '⚡' },
                        { key: 'audio_extract', name: 'Extract Audio & 3s Reference Track', icon: '🎙️' },
                        { key: 'stt', name: 'Local speech-to-text transcription', icon: '📝' },
                        { key: 'translation', name: 'Translate Turkish to English (Marian-MT)', icon: '🌐' },
                        { key: 'cloning', name: 'Voice cloning speech synthesis (XTTS v2)', icon: '👥' },
                        { key: 'lipsync', name: 'Synchronize & Apply Lip-Sync (Wav2Lip)', icon: '💋' },
                        { key: 'assembly', name: 'Final Video Multiplex & Assembly', icon: '🎬' }
                      ].map((step, idx) => (
                        <div key={step.key} className={`pipeline-step ${stepsStatus[step.key]}`}>
                          <div className="step-icon-wrapper">{step.icon}</div>
                          <div className="step-details">
                            <h4>{step.name}</h4>
                            <p>{stepsStatus[step.key] === 'active' ? 'Processing locally...' : stepsStatus[step.key] === 'completed' ? 'Success' : 'Pending'}</p>
                          </div>
                          <span className={`step-badge ${stepsStatus[step.key]}`}>
                            {stepsStatus[step.key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="drop-icon-container">
                      <div className="drop-icon-bg" style={{ background: 'linear-gradient(45deg, var(--primary-magenta), #9000ff)' }}></div>
                      <Film size={80} color="white" style={{ position: 'relative', zIndex: 1 }} />
                    </div>
                    {translationFile ? (
                      <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: '20px', color: 'var(--primary-magenta)' }}>{translationFile.name}</h2>
                        <p>Video Ready for AI Translation</p>
                        <button
                          className="btn-secondary"
                          onClick={(e) => { e.stopPropagation(); setTranslationFile(null); }}
                          style={{ marginTop: '10px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#666', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer' }}
                        >
                          Change File
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2>DRAG & DROP YOUR VIDEO (MP4, MKV, AVI) HERE</h2>
                        <p>OR CLICK TO BROWSE FOR CLONING TRANSLATION</p>
                        <span style={{ fontSize: '10px', color: '#666', marginTop: '20px' }}>
                          Translates Turkish speaking videos to English using your own voice clone.
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>

              <aside className="sidebar-config">
                <div className="config-card glass">
                  <div className="config-title" style={{ color: 'var(--primary-magenta)' }}>
                    <Sparkles size={14} />
                    Voice Cloning AI Video Translation
                  </div>

                  <div className="input-group">
                    <label>Translation Direction:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px' }}>
                      <span style={{ fontWeight: 'bold' }}>Turkish</span>
                      <ArrowRight size={14} color="var(--primary-cyan)" />
                      <span style={{ color: 'var(--primary-cyan)', fontWeight: 'bold' }}>English</span>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Voice Cloning Engine:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--primary-magenta)', fontWeight: 'bold' }}>Coqui XTTS v2 (Local)</span>
                    </div>
                  </div>

                  <div className="toggle-switch-container" onClick={() => setTranslationConfig({ ...translationConfig, lipSync: !translationConfig.lipSync })}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500' }}>Wav2Lip Lip-Sync</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Heavy GPU usage required</span>
                    </div>
                    <div className={`toggle-switch ${translationConfig.lipSync ? 'on' : ''}`}>
                      <div className="toggle-handle"></div>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    style={{ marginTop: '20px', background: 'linear-gradient(135deg, var(--primary-magenta), #9000ff)', opacity: translationFile ? 1 : 0.5, cursor: translationFile ? 'pointer' : 'not-allowed', color: 'white' }}
                    disabled={!translationFile || isTranslating}
                    onClick={startVideoTranslation}
                  >
                    {isTranslating ? 'Translating...' : 'Translate Video'}
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
          <span>{isTranscribing || isTranslating ? 'PROCESSING...' : 'READY'}</span>
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
