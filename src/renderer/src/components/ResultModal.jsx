import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, FolderOpen, X, FileEdit } from 'lucide-react'

export default function ResultModal({ isOpen, path, onClose, onEdit }) {
  const handleOpenFolder = () => {
    if (window.api && window.api.openExplorer) {
      window.api.openExplorer(path)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="result-modal glass"
          >
            <button className="modal-close" onClick={onClose}>
              <X size={20} />
            </button>
            
            <div className="modal-content">
              <div className="success-icon-container">
                <div className="success-glow"></div>
                <CheckCircle2 size={64} className="text-primary-cyan" />
              </div>
              
              <h2>Transcription Complete!</h2>
              <p className="modal-subtitle">Your subtitle file is ready for use.</p>
              
              <div className="path-container glass">
                <div className="path-label">OUTPUT PATH:</div>
                <div className="path-text">{path}</div>
              </div>
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose}>
                  CLOSE
                </button>
                <button className="btn-primary-small" onClick={handleOpenFolder}>
                  <FolderOpen size={18} />
                  OPEN FOLDER
                </button>
                {path && path.toLowerCase().endsWith('.srt') && (
                  <button className="btn-primary-small" onClick={() => { onEdit(path); onClose(); }}>
                    <FileEdit size={18} />
                    EDIT
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
