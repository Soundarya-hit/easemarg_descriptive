// ==========================================
// SketchModal.jsx - Gemini Dynamic SVG Component
// ==========================================
import React, { useState, useEffect } from 'react';

export default function SketchModal({ isOpen, onClose, questionId, questionText, onImportToCanvas }) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [sketchData, setSketchData] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchSketchFromBackend = async () => {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:5000/api/get-question-sketch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, questionText })
        });

        const result = await response.json();
        if (result.success && result.data) {
          setSketchData(result.data);
        } else {
          setSketchData(getLocalFallbackSketch(questionText));
        }
      } catch (error) {
        console.error("Error fetching sketch from Gemini backend, using local fallback:", error);
        setSketchData(getLocalFallbackSketch(questionText));
      } finally {
        setLoading(false);
      }
    };

    fetchSketchFromBackend();
  }, [isOpen, questionId, questionText]);

  // Fallback dynamic local generation if backend/Gemini latency occurs
  const getLocalFallbackSketch = (text = "") => {
    return {
      title: "Standard Academic Outline Diagram",
      imageUrl: `
        <svg viewBox="0 0 600 450" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect width="600" height="450" fill="#ffffff"/>
          <g transform="translate(100, 50)" stroke="#1e293b" stroke-width="2.5" fill="none">
            <rect x="50" y="50" width="350" height="250" rx="15" fill="#f8fafc"/>
            <circle cx="225" cy="175" r="50" stroke="#2563eb"/>
            <text x="140" y="180" font-size="14" fill="#334155" font-weight="bold">AI Diagram Workspace</text>
          </g>
        </svg>
      `
    };
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      fontFamily: 'Inter, system-ui, sans-serif', padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '750px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
              {sketchData ? sketchData.title : 'Generating Gemini Diagram...'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', maxWidth: '550px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Question: {questionText}
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', fontSize: '22px', color: '#64748b', cursor: 'pointer', fontWeight: 'bold' }}
          >
            &times;
          </button>
        </div>

        {/* Modal Body / Canvas View */}
        <div style={{ padding: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', minHeight: '400px' }}>
          <div style={{ 
            width: '100%', height: '400px', backgroundColor: '#ffffff', borderRadius: '12px', 
            border: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', 
            position: 'relative', overflow: 'hidden', padding: '12px' 
          }}>
            {loading ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '40px', height: '40px', border: '4px solid #e2e8f0', 
                  borderTop: '4px solid #2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' 
                }}></div>
                <p style={{ fontSize: '14px', color: '#475569', fontWeight: '600' }}>
                  Gemini is generating custom unlabeled diagram...
                </p>
              </div>
            ) : sketchData ? (
              <>
                <div 
                  dangerouslySetInnerHTML={{ __html: sketchData.imageUrl }} 
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                />
                <div style={{ 
                  position: 'absolute', bottom: '12px', right: '12px', 
                  backgroundColor: 'rgba(15, 23, 42, 0.85)', color: '#fff', 
                  padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' 
                }}>
                  ✨ Gemini Dynamic Unlabeled Sketch
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            onClick={onClose} 
            style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#e2e8f0', color: '#334155', fontWeight: '600', border: 'none', cursor: 'pointer', fontSize: '14px' }}
          >
            Cancel
          </button>
          <button 
            disabled={loading || !sketchData}
            onClick={() => { onImportToCanvas(sketchData); onClose(); }} 
            style={{ 
              padding: '10px 24px', borderRadius: '8px', 
              backgroundColor: loading ? '#93c5fd' : '#2563eb', color: '#fff', 
              fontWeight: '600', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px'
            }}
          >
            Import to Workspace ➔
          </button>
        </div>

      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}