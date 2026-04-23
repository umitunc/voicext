import React, { useState, useEffect, useRef } from 'react'
import { Save, Download, Zap, ChevronUp, ChevronDown, CheckCircle, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const SrtEditor = ({ filePath, onClose }) => {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (filePath) {
      loadSrt(filePath)
      setFileName(filePath.split(/[\\/]/).pop())
    }
  }, [filePath])

  const loadSrt = async (path) => {
    setLoading(true)
    try {
      const content = await window.api.readSrt(path)
      const parsed = parseSrt(content)
      setSegments(parsed)
    } catch (error) {
      alert('Error loading SRT: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const parseSrt = (content) => {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const blocks = normalized.trim().split(/\n\n+/)
    return blocks.map((block, idx) => {
      const lines = block.trim().split('\n')
      if (lines.length < 2) return null

      const timeLineIdx = lines.findIndex(l => l.includes('-->'))
      if (timeLineIdx === -1) return null

      const times = lines[timeLineIdx].split('-->').map(t => t.trim())
      const text = lines.slice(timeLineIdx + 1).join('\n')

      return {
        id: idx,
        start: times[0],
        end: times[1],
        text: text
      }
    }).filter(Boolean)
  }

  const stringifySrt = (segs) => {
    return segs.map((s, i) => {
      return `${i + 1}\n${s.start} --> ${s.end}\n${s.text}`
    }).join('\n\n') + '\n'
  }

  const [showToast, setShowToast] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const content = stringifySrt(segments)
      await window.api.saveSrt(filePath, content)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    } catch (error) {
      alert('Error saving SRT: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const updateSegment = (id, field, value) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [segments])

  if (loading) return <div className="editor-loading">Loading SRT...</div>

  return (
    <div className="srt-editor-container glass">
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="save-toast"
          >
            <CheckCircle size={18} />
            SRT Saved Successfully!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="editor-header">
        <button className="btn-back" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <div className="file-info">
          <span className="file-label">FILE:</span>
          <span className="file-name">{fileName}</span>
          <span className="preview-label">(Preview)</span>
        </div>
      </div>

      <div className="segments-list" ref={scrollRef}>
        <div className="segments-header">
          <div className="col-index">Index</div>
          <div className="col-start">Start</div>
          <div className="col-end">End</div>
          <div className="col-text">Subtitle Text</div>
        </div>
        
        {segments.map((seg, idx) => (
          <motion.div 
            key={seg.id} 
            className="segment-row"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.5) }}
          >
            <div className="col-index">{(idx + 1).toString().padStart(2, '0')}</div>
            <div className="col-start">
              <div className="time-input-container">
                <input 
                  type="text" 
                  value={seg.start} 
                  onChange={(e) => updateSegment(seg.id, 'start', e.target.value)}
                  className="time-input"
                />
                <div className="time-controls">
                  <ChevronUp size={10} />
                  <ChevronDown size={10} />
                </div>
              </div>
            </div>
            <div className="col-end">
              <div className="time-input-container">
                <input 
                  type="text" 
                  value={seg.end} 
                  onChange={(e) => updateSegment(seg.id, 'end', e.target.value)}
                  className="time-input"
                />
                <div className="time-controls">
                  <ChevronUp size={10} />
                  <ChevronDown size={10} />
                </div>
              </div>
            </div>
            <div className="col-text">
              <textarea 
                value={seg.text}
                onChange={(e) => updateSegment(seg.id, 'text', e.target.value)}
                className="text-input"
                rows={1}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="editor-footer">
        <button className="btn-one-click-export" style={{ maxWidth: '100%' }} onClick={handleSave} disabled={saving}>
          <div className="btn-content">
             <span className="main-text">{saving ? 'SAVING...' : 'SAVE ALL CHANGES'}</span>
             <span className="sub-text">(Ctrl + S to save instantly)</span>
          </div>
          <div className="btn-icon">
            <Save size={24} />
          </div>
        </button>
      </div>
    </div>
  )
}

export default SrtEditor
