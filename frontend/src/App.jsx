// ==========================================
// SECTION 1: IMPORTS & COMPONENT SETUP
// ==========================================
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SketchModal from './sketch.jsx';

export default function App() {

  // ==========================================
  // SECTION 2: STATE MANAGEMENT & CACHES
  // ==========================================
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalStatusText, setEvalStatusText] = useState('Evaluating answer...');

  // Caches across questions
  const [answersCache, setAnswersCache] = useState({});
  const [canvasItemsCache, setCanvasItemsCache] = useState({});
  const [labelsCache, setLabelsCache] = useState({});
  const [canvasBgCache, setCanvasBgCache] = useState({}); 
  const [sketchDataCache, setSketchDataCache] = useState({}); 
  const [resultsCache, setResultsCache] = useState({});
  const [typingTimesCache, setTypingTimesCache] = useState({});
  const [skippedQuestionsSet, setSkippedQuestionsSet] = useState(new Set());

  // Current Question Working State
  const [studentAnswer, setStudentAnswer] = useState('');
  const [canvasItems, setCanvasItems] = useState([]); 
  const [studentLabels, setStudentLabels] = useState([]);
  const [newLabelText, setNewLabelText] = useState('');
  const [currentBgMode, setCurrentBgMode] = useState('normal'); 
  const [currentSketchData, setCurrentSketchData] = useState(null); 
  const [result, setResult] = useState(null);

  // Assist Tool Menu Drawer & Selection for Resize & Rotate
  const [activeAssistTab, setActiveAssistTab] = useState('shapes'); 
  const [selectedCanvasItemId, setSelectedCanvasItemId] = useState(null);

  // Dragging, Resizing & Rotating interaction states
  const [draggingItem, setDraggingItem] = useState(null); 
  const [resizingHandle, setResizingHandle] = useState(null); 
  const [rotatingItem, setRotatingItem] = useState(null);
  const canvasRef = useRef(null);

  // Timers & Voice
  const [timerStage, setTimerStage] = useState('reading');
  const [readingSeconds, setReadingSeconds] = useState(10);
  const [typingSeconds, setTypingSeconds] = useState(0);
  const timerRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Student Multiple Photo Upload Evaluation State
  const [uploadedAnswerPhotos, setUploadedAnswerPhotos] = useState([]);
  const [photoUploadsCache, setPhotoUploadsCache] = useState({});

  const [stats, setStats] = useState({ practiced: 0, skipped: 0 });
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Sketch Modal State
  const [isSketchModalOpen, setIsSketchModalOpen] = useState(false);


  // ==========================================
  // SECTION 3: API FETCH & QUESTION LIFECYCLE
  // ==========================================
  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      // Future Integration Note: You can pass class, module_id, topic_id as query params here when merging (e.g. ?class=10&module_id=m2&topic_id=c1)
      const res = await axios.get('http://localhost:5000/api/questions');
      if (res.data.success && res.data.questions.length > 0) {
        setQuestions(res.data.questions);
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (questions.length === 0 || sessionCompleted) return;

    setStudentAnswer(answersCache[currentIndex] || '');
    setCanvasItems(canvasItemsCache[currentIndex] || []);
    setStudentLabels(labelsCache[currentIndex] || []);
    const bg = canvasBgCache[currentIndex] || 'normal';
    setCurrentBgMode(bg);
    setCurrentSketchData(sketchDataCache[currentIndex] || null); 
    setResult(resultsCache[currentIndex] || null);
    setTypingSeconds(typingTimesCache[currentIndex] || 0);
    setUploadedAnswerPhotos(photoUploadsCache[currentIndex] || []);
    setSelectedCanvasItemId(null);
    setNewLabelText('');

    if (resultsCache[currentIndex]) {
      setTimerStage('answering');
      return;
    }

    setTimerStage('reading');
    setReadingSeconds(10);

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setReadingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimerStage('answering');
          startTypingTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, questions]);

  const startTypingTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (resultsCache[currentIndex]) return;

    timerRef.current = setInterval(() => {
      setTypingSeconds(prev => {
        const nextTime = prev + 1;
        setTypingTimesCache(t => ({ ...t, [currentIndex]: nextTime }));
        return nextTime;
      });
    }, 1000);
  };


  // ==========================================
  // SECTION 4: VOICE DICTATION & TEXT HANDLING
  // ==========================================
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is supported best in Google Chrome.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    } else {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setStudentAnswer(prev => {
          const updated = prev ? prev + ' ' + transcript : transcript;
          setAnswersCache(a => ({ ...a, [currentIndex]: updated }));
          return updated;
        });
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setStudentAnswer(val);
    setAnswersCache(a => ({ ...a, [currentIndex]: val }));
  };

  const handleCopyPasteBlock = (e) => {
    e.preventDefault();
    alert("Copy and paste are disabled for this answer field to maintain academic integrity!");
  };


  // ==========================================
  // SECTION 5: CANVAS SHAPE & MAP ACTIONS
  // ==========================================
  const handleAddShapeToCanvas = (shapeName) => {
    const newItem = {
      id: Date.now() + Math.random(),
      type: 'shape',
      name: shapeName,
      x: 80 + (canvasItems.length * 20) % 200,
      y: 80 + (canvasItems.length * 20) % 150,
      width: shapeName === 'Line' || shapeName === 'Curve' ? 120 : 100,
      height: shapeName === 'Line' || shapeName === 'Curve' ? 20 : 100,
      rotation: 0
    };
    const updated = [...canvasItems, newItem];
    setCanvasItems(updated);
    setCanvasItemsCache(c => ({ ...c, [currentIndex]: updated }));
    setSelectedCanvasItemId(newItem.id);
  };

  const handleSelectGraph = () => {
    setCurrentBgMode('graph');
    setCurrentSketchData(null);
    setCanvasBgCache(b => ({ ...b, [currentIndex]: 'graph' }));
    setSketchDataCache(s => ({ ...s, [currentIndex]: null }));
  };

  const handleSelectIndiaMap = () => {
    setCurrentBgMode('india-map');
    setCurrentSketchData(null);
    setCanvasBgCache(b => ({ ...b, [currentIndex]: 'india-map' }));
    setSketchDataCache(s => ({ ...s, [currentIndex]: null }));
  };

  const handleSelectWorldMap = () => {
    setCurrentBgMode('world-map');
    setCurrentSketchData(null);
    setCanvasBgCache(b => ({ ...b, [currentIndex]: 'world-map' }));
    setSketchDataCache(s => ({ ...s, [currentIndex]: null }));
  };

  const handleClearCanvasBackground = () => {
    setCurrentBgMode('normal');
    setCurrentSketchData(null);
    setCanvasBgCache(b => ({ ...b, [currentIndex]: 'normal' }));
    setSketchDataCache(s => ({ ...s, [currentIndex]: null }));
  };

  const handleImportSketchClick = () => {
    setIsSketchModalOpen(true);
  };

  const handleImportSketchToCanvas = (sketchData) => {
    const bgCategory = sketchData.category || 'normal';
    setCurrentBgMode(bgCategory);
    setCurrentSketchData(sketchData);
    setCanvasBgCache(b => ({ ...b, [currentIndex]: bgCategory }));
    setSketchDataCache(s => ({ ...s, [currentIndex]: sketchData }));
  };

  const handleRemoveCanvasItem = (id) => {
    const updated = canvasItems.filter(item => item.id !== id);
    setCanvasItems(updated);
    setCanvasItemsCache(c => ({ ...c, [currentIndex]: updated }));
    if (selectedCanvasItemId === id) setSelectedCanvasItemId(null);
  };

  const handleAddLabel = () => {
    if (!newLabelText.trim()) return;
    const updatedLabels = [...studentLabels, { id: Date.now(), text: newLabelText.trim(), x: 80 + (studentLabels.length * 40), y: 260 }];
    setStudentLabels(updatedLabels);
    setLabelsCache(l => ({ ...l, [currentIndex]: updatedLabels }));
    setNewLabelText('');
  };

  const handleRemoveLabel = (id) => {
    const updatedLabels = studentLabels.filter(lbl => lbl.id !== id);
    setStudentLabels(updatedLabels);
    setLabelsCache(l => ({ ...l, [currentIndex]: updatedLabels }));
  };

  const handleMultiplePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    let loadedCount = 0;
    const newBase64Images = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        newBase64Images.push(uploadEvent.target.result);
        loadedCount++;
        if (loadedCount === files.length) {
          const updatedPhotos = [...uploadedAnswerPhotos, ...newBase64Images];
          setUploadedAnswerPhotos(updatedPhotos);
          setPhotoUploadsCache(p => ({ ...p, [currentIndex]: updatedPhotos }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveUploadedPhoto = (indexToRemove) => {
    const updatedPhotos = uploadedAnswerPhotos.filter((_, idx) => idx !== indexToRemove);
    setUploadedAnswerPhotos(updatedPhotos);
    setPhotoUploadsCache(p => ({ ...p, [currentIndex]: updatedPhotos }));
  };


  // ==========================================
  // SECTION 6: DRAG, RESIZE & ROTATE HANDLERS
  // ==========================================
  const handleMouseDownItem = (e, item, type) => {
    if (result) return;
    e.stopPropagation();
    if (type === 'shape') {
      setSelectedCanvasItemId(item.id);
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - item.x;
    const offsetY = e.clientY - rect.top - item.y;
    setDraggingItem({ id: item.id, type, offsetX, offsetY });
  };

  const handleMouseDownResizeHandle = (e, item, handleType) => {
    if (result) return;
    e.stopPropagation();
    setSelectedCanvasItemId(item.id);
    setResizingHandle({
      id: item.id,
      handle: handleType,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
      origRotation: item.rotation || 0
    });
  };

  const handleMouseDownRotateHandle = (e, item) => {
    if (result) return;
    e.stopPropagation();
    setSelectedCanvasItemId(item.id);

    const shapeCenterX = item.x + (item.width / 2);
    const shapeCenterY = item.y + (item.height / 2);
    const rect = canvasRef.current.getBoundingClientRect();
    const clientStartX = e.clientX - rect.left;
    const clientStartY = e.clientY - rect.top;
    const initialAngle = Math.atan2(clientStartY - shapeCenterY, clientStartX - shapeCenterX) * (180 / Math.PI);

    setRotatingItem({
      id: item.id,
      centerX: shapeCenterX,
      centerY: shapeCenterY,
      startAngle: initialAngle,
      origRotation: item.rotation || 0
    });
  };

  const handleMouseMoveCanvas = (e) => {
    if (result) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    if (draggingItem) {
      const newX = Math.max(10, e.clientX - rect.left - draggingItem.offsetX);
      const newY = Math.max(10, e.clientY - rect.top - draggingItem.offsetY);

      if (draggingItem.type === 'shape') {
        const updated = canvasItems.map(item => item.id === draggingItem.id ? { ...item, x: newX, y: newY } : item);
        setCanvasItems(updated);
        setCanvasItemsCache(c => ({ ...c, [currentIndex]: updated }));
      } else if (draggingItem.type === 'label') {
        const updated = studentLabels.map(lbl => lbl.id === draggingItem.id ? { ...lbl, x: newX, y: newY } : lbl);
        setStudentLabels(updated);
        setLabelsCache(l => ({ ...l, [currentIndex]: updated }));
      }
      return;
    }

    if (resizingHandle) {
      const dx = e.clientX - resizingHandle.startX;
      const dy = e.clientY - resizingHandle.startY;

      const rad = (resizingHandle.origRotation * Math.PI) / 180;
      const localDx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
      const localDy = dx * Math.sin(-rad) + dy * Math.cos(-rad);

      const updated = canvasItems.map(item => {
        if (item.id === resizingHandle.id) {
          let newW = resizingHandle.origW;
          let newH = resizingHandle.origH;
          let newX = resizingHandle.origX;
          let newY = resizingHandle.origY;

          if (resizingHandle.handle === 'se') {
            newW = Math.max(30, resizingHandle.origW + localDx);
            newH = Math.max(30, resizingHandle.origH + localDy);
          } else if (resizingHandle.handle === 'sw') {
            newW = Math.max(30, resizingHandle.origW - localDx);
            newH = Math.max(30, resizingHandle.origH + localDy);
            newX = resizingHandle.origX - localDx * Math.cos(rad) / 2;
            newY = resizingHandle.origY - localDx * Math.sin(rad) / 2;
          } else if (resizingHandle.handle === 'ne') {
            newW = Math.max(30, resizingHandle.origW + localDx);
            newH = Math.max(30, resizingHandle.origH - localDy);
          } else if (resizingHandle.handle === 'nw') {
            newW = Math.max(30, resizingHandle.origW - localDx);
            newH = Math.max(30, resizingHandle.origH - localDy);
          }

          return { ...item, width: newW, height: newH, x: newX, y: newY };
        }
        return item;
      });

      setCanvasItems(updated);
      setCanvasItemsCache(c => ({ ...c, [currentIndex]: updated }));
      return;
    }

    if (rotatingItem) {
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const currentAngle = Math.atan2(clientY - rotatingItem.centerY, clientX - rotatingItem.centerX) * (180 / Math.PI);
      const angleDelta = currentAngle - rotatingItem.startAngle;

      const updated = canvasItems.map(item => {
        if (item.id === rotatingItem.id) {
          let newRot = Math.round((rotatingItem.origRotation + angleDelta) % 360);
          if (newRot < 0) newRot += 360;
          return { ...item, rotation: newRot };
        }
        return item;
      });
      setCanvasItems(updated);
      setCanvasItemsCache(c => ({ ...c, [currentIndex]: updated }));
    }
  };

  const handleMouseUpCanvas = () => {
    setDraggingItem(null);
    setResizingHandle(null);
    setRotatingItem(null);
  };


  // ==========================================
  // SECTION 7: SHAPE GRAPHIC RENDERER
  // ==========================================
  const renderShapeGraphic = (item) => {
    const { name, width, height } = item;
    const innerStyle = {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    };

    switch (name) {
      case 'Square':
        return <div style={{ ...innerStyle, height: `${width}px`, border: '3px solid #1e293b', background: 'transparent' }} />;
      case 'Rectangle':
        return <div style={{ ...innerStyle, border: '3px solid #1e293b', background: 'transparent' }} />;
      case 'Circle':
        return <div style={{ ...innerStyle, height: `${width}px`, border: '3px solid #1e293b', borderRadius: '50%', background: 'transparent' }} />;
      case 'Triangle':
        return (
          <div style={innerStyle}>
            <svg width={width} height={height} style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0 }}>
              <polygon points={`${width/2},0 ${width},${height} 0,${height}`} fill="none" stroke="#1e293b" strokeWidth="3" />
            </svg>
          </div>
        );
      case 'Diamond':
        return (
          <div style={innerStyle}>
            <div style={{ width: `${width*0.7}px`, height: `${width*0.7}px`, border: '3px solid #1e293b', transform: 'rotate(45deg)', background: 'transparent', position: 'absolute', top: `${(height - width*0.7)/2}px`, left: `${(width - width*0.7)/2}px`, boxSizing: 'border-box' }} />
          </div>
        );
      case 'Pentagon':
        return (
          <div style={innerStyle}>
            <div style={{ position: 'absolute', inset: 0, background: '#1e293b', clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }} />
            <div style={{ position: 'absolute', inset: '2px', background: '#ffffff', clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }} />
          </div>
        );
      case 'Hexagon':
        return (
          <div style={innerStyle}>
            <div style={{ position: 'absolute', inset: 0, background: '#1e293b', clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }} />
            <div style={{ position: 'absolute', inset: '2px', background: '#ffffff', clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }} />
          </div>
        );
      case 'Star':
        return <div style={{ ...innerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: `${Math.min(width, height)*0.8}px`, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))' }}>⭐</span></div>;
      case 'Cloud':
        return <div style={{ ...innerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: `${Math.min(width, height)*0.7}px` }}>☁️</span></div>;
      case 'Line':
        return <div style={{ ...innerStyle, height: '4px', background: '#1e293b', alignSelf: 'center' }} />;
      case 'Curve':
        return <div style={innerStyle}><svg width={width} height={height} style={{ overflow: 'visible', position: 'absolute', left: 0, top: 0 }}><path d={`M 0 ${height} Q ${width/2} 0 ${width} ${height}`} stroke="#1e293b" strokeWidth="3" fill="none" /></svg></div>;
      case 'Arrow':
        return <div style={{ ...innerStyle, display: 'flex', alignItems: 'center' }}><div style={{ width: `${Math.max(10, width-20)}px`, height: '3px', background: '#1e293b' }}></div><span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginLeft: '-4px' }}>▶</span></div>;
      case 'Point Marker':
        return <div style={{ ...innerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '14px', height: '14px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 2px #ef4444', flexShrink: 0 }}></div></div>;
      default:
        return <div style={{ ...innerStyle, border: '3px solid #1e293b' }} />;
    }
  };


  // ==========================================
  // SECTION 8: VERIFICATION & NAVIGATION
  // ==========================================
  const handleVerify = async () => {
    if (!studentAnswer.trim() && canvasItems.length === 0 && studentLabels.length === 0 && uploadedAnswerPhotos.length === 0 && !currentSketchData) {
      alert("Please type your answer, drag shapes & labels onto canvas, or upload your answer paper photo(s)!");
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    const currentQ = questions[currentIndex];
    setEvaluating(true);

    const statuses = [
      "Analyzing ...",
      "Inspecting...",
      "Evaluating...",
      "Please waite..."
    ];
    let sIdx = 0;
    const statusInterval = setInterval(() => {
      sIdx = (sIdx + 1) % statuses.length;
      setEvalStatusText(statuses[sIdx]);
    }, 1300);

    try {
      const res = await axios.post('http://localhost:5000/api/evaluate', {
        questionId: currentQ._id,
        studentAnswer,
        canvasItems,
        studentLabels,
        canvasBgMode: currentBgMode,
        canvasSketchData: currentSketchData,
        uploadedAnswerPhotos,
        typingSeconds: typingTimesCache[currentIndex] || typingSeconds
      });

      clearInterval(statusInterval);
      if (res.data.success) {
        const evalData = res.data.evaluation;
        setResult(evalData);
        setResultsCache(r => ({ ...r, [currentIndex]: evalData }));

        if (skippedQuestionsSet.has(currentIndex)) {
          skippedQuestionsSet.delete(currentIndex);
          setStats(prev => ({ ...prev, practiced: prev.practiced + 1, skipped: Math.max(0, prev.skipped - 1) }));
        } else {
          setStats(prev => ({ ...prev, practiced: prev.practiced + 1 }));
        }
      }
    } catch (err) {
      clearInterval(statusInterval);
      alert("Evaluation failed. Please check backend connection.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleSkip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!skippedQuestionsSet.has(currentIndex) && !resultsCache[currentIndex]) {
      skippedQuestionsSet.add(currentIndex);
      setStats(prev => ({ ...prev, practiced: prev.practiced + 1, skipped: prev.skipped + 1 }));
    }
    moveToNext();
  };

  const moveToNext = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  const moveToPrevious = () => {
    if (currentIndex > 0) {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentIndex(prev => prev - 1);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', color: '#7c3aed' }}>Loading EaseMarg MS Paint Workspace...</div>;
  if (questions.length === 0) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', color: '#ef4444' }}>No questions found in MongoDB database!</div>;

  if (sessionCompleted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '40px 20px', textAlign: 'center', fontFamily: 'Arial' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827' }}>EaseMarg Assessment Completed!</h1>
          <p style={{ color: '#6b7280', marginBottom: '30px' }}>Total Questions: {questions.length} | Practiced: {stats.practiced} | Skipped: {stats.skipped}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 32px', borderRadius: '12px', background: '#7c3aed', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Start New Session</button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const isEvaluated = !!result;


  // ==========================================
  // SECTION 9: MAIN JSX RETURN
  // ==========================================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', padding: '20px', fontFamily: 'Arial', color: '#1f2937' }}>
      <div style={{ maxWidth: '1450px', margin: '0 auto' }}>
        
        {/* Header Breadcrumb with New Database Fields Display */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '14px 20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '14px', color: '#64748b' }}>
            <b>EASEMARG WORKSPACE</b> &gt; <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{currentQ.subject}</span> &gt; <span style={{ color: '#0d9488', fontWeight: 'bold' }}>Module: {currentQ.module_name || currentQ.module_id}</span> &gt; <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{currentQ.topicName}</span> &gt; Q{currentIndex + 1} of {questions.length}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', backgroundColor: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>Class: {currentQ.class}</span>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Practiced: {stats.practiced} | Skipped: {stats.skipped}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '20px' }}>
          
          {/* Left Panel: Question, Text Box, Multiple Answer Paper Photos Upload & Verification */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ padding: '4px 12px', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 'bold', borderRadius: '9999px' }}>
                  {currentQ.questionType}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a', backgroundColor: '#f0fdf4', padding: '4px 12px', borderRadius: '9999px' }}>
                  ✍️ Writing Timer: {typingSeconds}s 
                </span>
              </div>

              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', marginBottom: '18px', lineHeight: '1.5' }}>
                {currentQ.questionText}
              </h2>

              {/* Answer Textbox with Copy-Paste Restriction & Voice Dictation */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <textarea
                  rows="4"
                  disabled={isEvaluated}
                  onCopy={handleCopyPasteBlock}
                  onPaste={handleCopyPasteBlock}
                  onCut={handleCopyPasteBlock}
                  style={{ 
                    width: '100%', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '10px', 
                    outline: 'none', fontSize: '14px', color: '#334155', boxSizing: 'border-box', resize: 'none', 
                    backgroundColor: isEvaluated ? '#f1f5f9' : '#ffffff'
                  }}
                  placeholder="Type your descriptive explanation here (Copy & Paste disabled for academic integrity)..."
                  value={studentAnswer}
                  onChange={handleTextChange}
                />
                {!isEvaluated && (
                  <button
                    onClick={toggleListening}
                    style={{
                      position: 'absolute', bottom: '14px', right: '14px',
                      padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold',
                      cursor: 'pointer', border: 'none', backgroundColor: isListening ? '#ef4444' : '#eff6ff', color: isListening ? '#fff' : '#2563eb'
                    }}
                  >
                    {isListening ? "🛑 Listening..." : "🎤 Voice Dictation"}
                  </button>
                )}
              </div>

              {/* Multiple Answer Paper Photos Upload Section */}
              <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>📸 Upload Written Answer Paper Photos (Multiple Pages):</span>
                  {uploadedAnswerPhotos.length > 0 && !isEvaluated && (
                    <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>{uploadedAnswerPhotos.length} page(s) attached</span>
                  )}
                </div>

                {!isEvaluated && (
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleMultiplePhotoUpload}
                    style={{ fontSize: '12px', width: '100%', color: '#475569', marginBottom: '8px' }}
                  />
                )}

                {uploadedAnswerPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {uploadedAnswerPhotos.map((photo, pIdx) => (
                      <div key={pIdx} style={{ position: 'relative' }}>
                        <img src={photo} alt={`Answer Page ${pIdx + 1}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                        {!isEvaluated && (
                          <button onClick={() => handleRemoveUploadedPhoto(pIdx)} style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                        )}
                        <span style={{ display: 'block', fontSize: '10px', textAlign: 'center', color: '#64748b', marginTop: '2px' }}>P.{pIdx + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hint Box (Supporting both hint and hint_1 fields safely) */}
              <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#2563eb', margin: '0 0 4px 0' }}>💡 Hint & Keywords:</p>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>{currentQ.hint || currentQ.hint_1 || "No hint provided."}</p>
              </div>

              {/* Evaluation Results */}
              {result && (
                <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                  <h3 style={{ fontWeight: '800', color: '#166534', fontSize: '16px', marginTop: 0 }}>🏆 Score: {result.score} / 10</h3>
                  <p style={{ color: '#1f2937', fontSize: '13px', lineHeight: '1.4', marginBottom: '6px' }}><b>Feedback:</b> {result.feedback}</p>
                  
                  {result.componentAnalysis && (
                    <div style={{ marginTop: '10px', marginBottom: '8px', padding: '10px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #d1fae5', fontSize: '12px' }}>
                      <p style={{ fontWeight: 'bold', color: '#065f46', margin: '0 0 4px 0' }}>🔍 Multi-Source Evaluation Breakdown:</p>
                      <p style={{ margin: '2px 0', color: '#374151' }}><b>Text Box Answer:</b> {result.componentAnalysis.textBox}</p>
                      <p style={{ margin: '2px 0', color: '#374151' }}><b>Canvas Drawing / Map / Imported Sketch & Labels:</b> {result.componentAnalysis.canvasDrawing}</p>
                      <p style={{ margin: '2px 0', color: '#374151' }}><b>Uploaded Answer Photos:</b> {result.componentAnalysis.uploadedPhotos}</p>
                    </div>
                  )}

                  {result.missingPoints && result.missingPoints.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#991b1b' }}>
                      {result.missingPoints.map((pt, idx) => <li key={idx}>{pt}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={moveToPrevious} disabled={currentIndex === 0} style={{ padding: '8px 14px', borderRadius: '8px', backgroundColor: '#f1f5f9', fontWeight: 'bold', border: 'none', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer' }}>&larr; Prev</button>
                {!isEvaluated && <button onClick={handleSkip} style={{ padding: '8px 14px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Skip &gt;&gt;</button>}
              </div>
              <div>
                {!isEvaluated ? (
                  <button onClick={handleVerify} disabled={evaluating} style={{ padding: '8px 22px', borderRadius: '8px', backgroundColor: '#0f172a', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                    {evaluating ? evalStatusText : "Verify Answer"}
                  </button>
                ) : (
                  <button onClick={moveToNext} style={{ padding: '8px 22px', borderRadius: '8px', background: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                    {currentIndex === questions.length - 1 ? "Finish ➔" : "Next ➔"}
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Right Panel: MS Paint Assist Ribbon & Canvas */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Ribbon Header & Shape/Map Palette */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>🎨 Assist Tool Ribbon & Map Outlines</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Click shapes/maps to add</span>
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => setActiveAssistTab('shapes')} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: activeAssistTab === 'shapes' ? '#2563eb' : '#e2e8f0', color: activeAssistTab === 'shapes' ? '#fff' : '#334155' }}>📐 Shapes</button>
                <button onClick={() => { setActiveAssistTab('graph'); handleSelectGraph(); }} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: activeAssistTab === 'graph' ? '#2563eb' : '#e2e8f0', color: activeAssistTab === 'graph' ? '#fff' : '#334155' }}>📈 Graph Sheet</button>
                <button onClick={() => { setActiveAssistTab('india-map'); handleSelectIndiaMap(); }} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: activeAssistTab === 'india-map' ? '#2563eb' : '#e2e8f0', color: activeAssistTab === 'india-map' ? '#fff' : '#334155' }}>🇮🇳 India Map</button>
                <button onClick={() => { setActiveAssistTab('world-map'); handleSelectWorldMap(); }} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: activeAssistTab === 'world-map' ? '#2563eb' : '#e2e8f0', color: activeAssistTab === 'world-map' ? '#fff' : '#334155' }}>🌍 World Map</button>
                <button onClick={handleClearCanvasBackground} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #f87171', cursor: 'pointer', backgroundColor: '#fee2e2', color: '#ef4444' }}>🗑️ Remove Map/Graph</button>
                <button onClick={handleImportSketchClick} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #3b82f6', cursor: 'pointer', backgroundColor: '#eff6ff', color: '#2563eb' }}>✏️ Import Sketch</button>
              </div>

              {activeAssistTab === 'shapes' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                  {['Square', 'Rectangle', 'Circle', 'Triangle', 'Diamond', 'Pentagon', 'Hexagon', 'Star', 'Cloud', 'Line', 'Curve', 'Arrow', 'Point Marker'].map(shape => (
                    <div
                      key={shape}
                      onClick={() => !isEvaluated && handleAddShapeToCanvas(shape)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '6px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        cursor: isEvaluated ? 'default' : 'pointer', userSelect: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: '600', color: '#334155', textAlign: 'center' }}>{shape}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Paint Board Canvas */}
            <div
              ref={canvasRef}
              onMouseMove={handleMouseMoveCanvas}
              onMouseUp={handleMouseUpCanvas}
              onMouseLeave={handleMouseUpCanvas}
              onClick={() => setSelectedCanvasItemId(null)}
              style={{
                flex: 1, minHeight: '360px', border: '2px solid #64748b', borderRadius: '12px',
                backgroundColor: currentBgMode === 'graph' ? '#f0fdf4' : '#ffffff', 
                position: 'relative', padding: '16px', overflow: 'hidden',
                backgroundImage: 
                  currentBgMode === 'graph' 
                    ? 'linear-gradient(to right, #cbd5e1 1.5px, transparent 1.5px), linear-gradient(to bottom, #cbd5e1 1.5px, transparent 1.5px)' 
                    : 'none',
                backgroundSize: '24px 24px'
              }}
            >
              {currentBgMode === 'india-map' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '20px' }}>
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b3/India_location_map.svg" 
                    alt="India Map Outline" 
                    style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain', opacity: 0.45 }}
                    onError={(e) => {
                      e.target.src = "https://upload.wikimedia.org/wikipedia/commons/2/23/India_blank_map.svg";
                    }}
                  />
                  <div style={{ position: 'absolute', bottom: '15px', fontWeight: 'bold', color: '#ea580c', fontSize: '12px', background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: '4px' }}>🇮🇳 India Map Outline Active (Student Point Evaluation)</div>
                </div>
              )}

              {currentBgMode === 'world-map' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '20px' }}>
                  <img 
                    src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=700&auto=format&fit=crop" 
                    alt="World Map Outline" 
                    style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain', opacity: 0.35, filter: 'grayscale(100%)' }}
                  />
                  <div style={{ position: 'absolute', bottom: '15px', fontWeight: 'bold', color: '#0284c7', fontSize: '12px', background: 'rgba(255,255,255,0.8)', padding: '2px 8px', borderRadius: '4px' }}>🌍 World Map Outline Active (Student Point Evaluation)</div>
                </div>
              )}

              {/* Render imported custom sketch SVG or Image inside canvas */}
              {currentSketchData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '20px' }}>
                  <div 
                    dangerouslySetInnerHTML={{ __html: currentSketchData.imageUrl }} 
                    style={{ width: '85%', height: '85%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.55 }} 
                  />
                  <div style={{ position: 'absolute', bottom: '15px', fontWeight: 'bold', color: '#7c3aed', fontSize: '12px', background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: '4px' }}>
                    ✏️ {currentSketchData.title} Active (Student Sketch & Label Workspace)
                  </div>
                </div>
              )}

              <div style={{ position: 'absolute', top: '10px', left: '14px', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 5 }}>
                🖌️ Paint Canvas ({canvasItems.length} shapes) [{currentBgMode.toUpperCase()}]
              </div>

              {canvasItems.length === 0 && studentLabels.length === 0 && currentBgMode === 'normal' && !currentSketchData && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '280px', color: '#94a3b8', textAlign: 'center', pointerEvents: 'none' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>Click any shape or map from the top Assist Ribbon</p>
                  <p style={{ fontSize: '12px', margin: '4px 0 0 0' }}>Click shape anytime to select, resize & rotate!</p>
                </div>
              )}

              {canvasItems.map((item) => {
                const isSelected = selectedCanvasItemId === item.id;
                const rotation = item.rotation || 0;

                return (
                  <div
                    key={item.id}
                    onMouseDown={(e) => handleMouseDownItem(e, item, 'shape')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCanvasItemId(item.id);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      width: `${item.width}px`,
                      height: `${item.height}px`,
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                      cursor: 'move',
                      userSelect: 'none',
                      zIndex: isSelected ? 30 : 10,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        border: isSelected && !result ? '1px dashed #2563eb' : '1px solid transparent',
                        background: 'transparent',
                        boxSizing: 'border-box'
                      }}
                    >
                      {!result && isSelected && (
                        <div style={{ position: 'absolute', top: '-18px', right: '-4px', zIndex: 25 }}>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveCanvasItem(item.id); }} style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#ef4444', borderRadius: '50%', width: '16px', height: '16px', fontWeight: 'bold', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                        </div>
                      )}

                      {renderShapeGraphic(item)}

                      {isSelected && !result && (
                        <>
                          <div 
                            onMouseDown={(e) => handleMouseDownRotateHandle(e, item)} 
                            title="Drag to rotate shape"
                            style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', width: '12px', height: '12px', background: '#10b981', borderRadius: '50%', border: '2px solid #fff', cursor: 'grab', zIndex: 25 }} 
                          />
                          <div style={{ position: 'absolute', top: '-14px', left: '50%', width: '1px', height: '8px', background: '#10b981' }} />

                          <div onMouseDown={(e) => handleMouseDownResizeHandle(e, item, 'nw')} style={{ position: 'absolute', top: '-5px', left: '-5px', width: '9px', height: '9px', background: '#fff', border: '2px solid #2563eb', cursor: 'nwse-resize', zIndex: 25 }} />
                          <div onMouseDown={(e) => handleMouseDownResizeHandle(e, item, 'ne')} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '9px', height: '9px', background: '#fff', border: '2px solid #2563eb', cursor: 'nesw-resize', zIndex: 25 }} />
                          <div onMouseDown={(e) => handleMouseDownResizeHandle(e, item, 'se')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '9px', height: '9px', background: '#fff', border: '2px solid #2563eb', cursor: 'nwse-resize', zIndex: 25 }} />
                          <div onMouseDown={(e) => handleMouseDownResizeHandle(e, item, 'sw')} style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '9px', height: '9px', background: '#fff', border: '2px solid #2563eb', cursor: 'nesw-resize', zIndex: 25 }} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {studentLabels.map((lbl) => (
                <div
                  key={lbl.id}
                  onMouseDown={(e) => handleMouseDownItem(e, lbl, 'label')}
                  style={{
                    position: 'absolute', left: `${lbl.x}px`, top: `${lbl.y}px`,
                    color: '#1e40af', padding: '2px 4px', fontSize: '13px', fontWeight: 'bold',
                    cursor: 'move', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 20
                  }}
                >
                  📍 {lbl.text}
                  {!result && (
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveLabel(lbl.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}>&times;</button>
                  )}
                </div>
              ))}
            </div>

            {/* Label Creator Bar */}
            <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>📍 Create & Place Pointer Labels for Map / Graph Evaluation:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  key={currentIndex}
                  type="text"
                  placeholder="Type label (e.g., New Delhi, Equator, Point A)..."
                  value={newLabelText}
                  onChange={(e) => setNewLabelText(e.target.value)}
                  disabled={isEvaluated}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                />
                <button onClick={handleAddLabel} disabled={isEvaluated} style={{ padding: '8px 16px', backgroundColor: '#10b981', color: '#fff', fontSize: '12px', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>+ Add Label</button>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Sketch Modal Component Integration */}
      <SketchModal 
        isOpen={isSketchModalOpen} 
        onClose={() => setIsSketchModalOpen(false)} 
        questionId={currentQ?._id}
        questionText={currentQ?.questionText || "Draw/Sketch the diagram"}
        referenceSvg={currentQ?.referenceDrawing}
        onImportToCanvas={handleImportSketchToCanvas}
      />
    </div>
  );
}