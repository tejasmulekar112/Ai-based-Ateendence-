import { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, ClipboardList, CheckCircle2, AlertCircle, Loader2, Download, Sun, Moon, FileText, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { loadModels, getFaceDescriptor } from './lib/faceApi';
import { User, AttendanceRecord } from './types';
import { format } from 'date-fns';
import * as faceapi from 'face-api.js';
import { io } from 'socket.io-client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Markdown from 'react-markdown';

const socket = io();

const DOCUMENTATION_CONTENT = `# AI Attendance System - Project Documentation

## 1. Introduction
The AI Attendance System is a modern, face-recognition-based application designed to automate the process of tracking attendance. By leveraging computer vision and real-time communication, it provides a seamless experience for both administrators and users.

---

## 2. Problem Statement
Traditional attendance systems often rely on manual entry, physical ID cards, or fingerprint scanners. These methods face several challenges:
- **Manual Errors:** Human error in recording or data entry.
- **Proxy Attendance:** Users marking attendance for others (buddy punching).
- **Inefficiency:** Long queues and slow processing times.
- **Hygiene Concerns:** Physical contact with shared devices.

**Our Solution:** A touchless, automated system that uses facial recognition to verify identity and record attendance instantly.

---

## 3. Implementation Plan
The project was planned with a modular architecture to ensure scalability and cross-platform compatibility.

### Key Objectives:
1.  **Facial Recognition:** Implement a robust client-side face detection and recognition engine.
2.  **Real-time Sync:** Ensure attendance logs are updated instantly across all connected devices.
3.  **Cross-Platform:** Support Web, PWA, and Native Mobile (Android/iOS).
4.  **User Experience:** Provide a clean, theme-aware (Dark/Light) interface.

### Technology Stack:
- **Frontend:** React.js, Vite, Tailwind CSS.
- **Animations:** Framer Motion (Motion).
- **Icons:** Lucide React.
- **Face AI:** \`face-api.js\`.
- **Real-time:** Socket.io.
- **Mobile Wrapper:** Capacitor.
- **Backend:** Node.js, Express.

---

## 4. Actual Implementation Steps

### Step 1: Face Recognition Engine
We integrated \`face-api.js\` to handle face detection and feature extraction.
- **Models:** Loaded pre-trained models for face detection (SSD Mobilenet V1) and face recognition.
- **Registration:** Users "register" by capturing their face. The system extracts a "descriptor" and saves it.
- **Scanning:** The system compares the live camera feed descriptor against the stored database.

### Step 2: Real-time Backend
A Node.js server with Socket.io was implemented to handle data synchronization.
- **Events:** The server listens for \`attendance-marked\` and \`user-registered\` events.
- **Broadcasting:** When a record is updated, the server broadcasts the change to all connected clients.

---

## 5. Integration Process

### PWA and Mobile Integration
1.  **Manifest:** Created a \`manifest.json\` for PWA support.
2.  **Capacitor:** Initialized Capacitor to wrap the web app into native containers.
3.  **Service Workers:** Implemented a service worker for offline caching.

### Integration Flow:
1.  **Camera Access:** The app requests permission to use the device camera.
2.  **Model Loading:** AI models are fetched from the \`/models\` directory.
3.  **Socket Connection:** The client establishes a persistent connection to the backend.

---

## 6. Services and Tools Used

| Tool/Service | Purpose |
| :--- | :--- |
| **React & Vite** | Core framework and fast development build tool. |
| **Tailwind CSS** | Utility-first CSS for rapid, themeable UI design. |
| **Face-api.js** | Browser-based AI for facial recognition. |
| **Socket.io** | Real-time, bi-directional communication. |
| **Capacitor** | Cross-platform native app development. |
| **Lucide Icons** | Consistent and clean iconography. |
| **Framer Motion** | Smooth UI transitions and animations. |

---

## 7. How to Use the System

1.  **Registration:** Navigate to the **Register** tab, enter your name, and click **Scan Face**.
2.  **Marking Attendance:** Navigate to the **Scan** tab and ensure your face is visible.
3.  **Viewing History:** Go to the **History** tab to view live logs and daily summaries.

---

## 8. Conclusion
The AI Attendance System successfully combines cutting-edge AI with real-time web technologies to provide a robust solution for modern attendance tracking.`;

export default function App() {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'attendance' | 'register' | 'history' | 'docs'>('attendance');
  const [historyView, setHistoryView] = useState<'logs' | 'summary'>('logs');
  const [users, setUsers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationStep, setRegistrationStep] = useState<'input' | 'photo'>('input');
  const [isVideoMounted, setIsVideoMounted] = useState(false);
  const isStartingCamera = useRef(false);
  const [tempDescriptor, setTempDescriptor] = useState<number[] | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = useState(false);
  const [selectedUserForAbsence, setSelectedUserForAbsence] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        setIsModelsLoaded(true);
      } catch (error) {
        console.error('Failed to load models:', error);
        setModelError('Failed to load AI models. Please check your internet connection and refresh the page.');
      }
    };
    init();

    // Socket listeners for real-time updates
    socket.on('initial_state', ({ users, attendance }) => {
      setUsers(users);
      setAttendance(attendance);
    });

    socket.on('user_registered', (user) => {
      setUsers(prev => [...prev, user]);
    });

    socket.on('attendance_added', (record) => {
      setAttendance(prev => {
        // Prevent duplicates if already added locally
        if (prev.some(r => r.id === record.id)) return prev;
        return [record, ...prev];
      });
    });

    socket.on('absents_marked', (records) => {
      setAttendance(prev => {
        const newRecords = records.filter((r: any) => !prev.some(p => p.id === r.id));
        return [...newRecords, ...prev];
      });
    });

    return () => {
      socket.off('initial_state');
      socket.off('user_registered');
      socket.off('attendance_added');
      socket.off('absents_marked');
    };
  }, []);

  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = async () => {
    if (isStartingCamera.current) return;
    isStartingCamera.current = true;
    
    setCameraError(null);
    
    // Stop any existing tracks before starting a new one
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Your browser does not support camera access. Please use a modern browser like Chrome or Firefox.');
        isStartingCamera.current = false;
        return;
      }

      if (!videoRef.current) {
        console.error('Video ref not available in startCamera');
        isStartingCamera.current = false;
        return;
      }

      const constraints = [
        { 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        },
        { video: { facingMode: 'user' } },
        { video: true }
      ];

      let lastError: any = null;

      for (const constraint of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraint);
          
          // Check if we still need the camera for this specific tab/step
          if (!isVideoMounted || (activeTab !== 'attendance' && activeTab !== 'register')) {
            stream.getTracks().forEach(track => track.stop());
            isStartingCamera.current = false;
            return;
          }

          streamRef.current = stream;
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Ensure video starts playing
            try {
              await videoRef.current.play();
            } catch (playError) {
              console.warn('Video play failed, might need user interaction:', playError);
            }
            isStartingCamera.current = false;
            return; // Success!
          } else {
            // Video ref lost while waiting for getUserMedia, clean up
            stream.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        } catch (error: any) {
          lastError = error;
          console.warn('Camera constraint failed, trying next...', constraint, error);
          if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            break;
          }
        }
      }

      if (lastError) {
        console.error('Final camera access error:', lastError);
        if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') {
          setCameraError('Camera access was denied. Please enable camera permissions in your browser settings and refresh the page.');
        } else if (lastError.name === 'NotReadableError' || lastError.name === 'TrackStartError') {
          setCameraError('The camera is already in use by another application or tab. Please close other apps using the camera and try again.');
        } else {
          setCameraError('Could not access camera. Please ensure your camera is connected and not being used by another app.');
        }
      }
    } finally {
      isStartingCamera.current = false;
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const markAbsents = () => {
    const today = new Date().toDateString();
    const presentUserIds = new Set(
      attendance
        .filter(r => new Date(r.timestamp).toDateString() === today && r.status === 'present')
        .map(r => r.userId)
    );

    const absentRecords: AttendanceRecord[] = users
      .filter(u => !presentUserIds.has(u.id))
      .map(u => ({
        id: crypto.randomUUID(),
        userId: u.id,
        userName: u.name,
        timestamp: new Date().toISOString(),
        status: 'absent'
      }));

    if (absentRecords.length > 0) {
      socket.emit('mark_absents', absentRecords);
      setScanResult({ success: true, message: `${absentRecords.length} users marked as absent.` });
      setTimeout(() => setScanResult(null), 3000);
    }
  };

  const markSingleUserAbsent = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const today = new Date().toDateString();
    const alreadyMarked = attendance.some(
      r => r.userId === userId && new Date(r.timestamp).toDateString() === today
    );

    if (alreadyMarked) {
      setScanResult({ success: false, message: `${user.name} already has a record for today.` });
      setTimeout(() => setScanResult(null), 3000);
      return;
    }

    const newRecord: AttendanceRecord = {
      id: crypto.randomUUID(),
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString(),
      status: 'absent'
    };

    socket.emit('mark_absent', newRecord);
    setScanResult({ success: true, message: `${user.name} marked as absent.` });
    setIsAbsenceDialogOpen(false);
    setSelectedUserForAbsence('');
    setTimeout(() => setScanResult(null), 3000);
  };

  const exportToCSV = () => {
    if (attendance.length === 0) {
      setScanResult({ success: false, message: 'No records to export.' });
      setTimeout(() => setScanResult(null), 3000);
      return;
    }
    
    const headers = ['User Name', 'User ID', 'Date', 'Time', 'Status', 'Confidence (%)'];
    const rows = attendance.map(record => [
      record.userName,
      record.userId,
      format(new Date(record.timestamp), 'yyyy-MM-dd'),
      format(new Date(record.timestamp), 'HH:mm:ss'),
      record.status,
      record.confidence ? `${record.confidence}%` : '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setScanResult({ success: true, message: 'Exporting CSV...' });
    setTimeout(() => setScanResult(null), 3000);
  };

  const exportToPDF = () => {
    if (attendance.length === 0) {
      setScanResult({ success: false, message: 'No records to export.' });
      setTimeout(() => setScanResult(null), 3000);
      return;
    }

    const doc = new jsPDF();
    const tableColumn = ["User Name", "User ID", "Date", "Time", "Status", "Confidence"];
    const tableRows = attendance.map(record => [
      record.userName,
      record.userId,
      format(new Date(record.timestamp), 'yyyy-MM-dd'),
      format(new Date(record.timestamp), 'HH:mm:ss'),
      record.status,
      record.confidence ? `${record.confidence}%` : '-'
    ]);

    doc.text("Attendance Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [249, 115, 22] }, // orange-500
    });

    doc.save(`attendance_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    setScanResult({ success: true, message: 'Exporting PDF...' });
    setTimeout(() => setScanResult(null), 3000);
  };

  const getDailySummary = () => {
    const today = new Date().toDateString();
    return users.map(user => {
      const record = attendance.find(
        r => r.userId === user.id && new Date(r.timestamp).toDateString() === today
      );
      return {
        ...user,
        status: record ? record.status : 'pending'
      };
    });
  };

  useEffect(() => {
    const shouldBeRunning = isModelsLoaded && isVideoMounted && (activeTab === 'attendance' || activeTab === 'register');
    
    if (shouldBeRunning) {
      startCamera();
    } else {
      stopCamera();
    }
    
    if (activeTab !== 'register') {
      setRegistrationStep('input');
      setTempDescriptor(null);
      setCapturedPhoto(null);
    }
    
    return () => stopCamera();
  }, [activeTab, isModelsLoaded, registrationStep, isVideoMounted]);

  const handleRegister = async () => {
    if (!newName || !videoRef.current) return;
    setIsRegistering(true);
    setScanResult(null);
    
    try {
      // Small delay to ensure camera frame is stable
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (descriptor) {
        setTempDescriptor(Array.from(descriptor));
        setRegistrationStep('photo');
      } else {
        setScanResult({ success: false, message: 'No face detected. Please ensure your face is clearly visible and try again.' });
        setTimeout(() => setScanResult(null), 4000);
      }
    } catch (error) {
      console.error('Registration error:', error);
      setScanResult({ success: false, message: 'Registration failed. Please try again.' });
      setTimeout(() => setScanResult(null), 4000);
    } finally {
      setIsRegistering(false);
    }
  };

  const captureProfilePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoData = canvas.toDataURL('image/jpeg');
      setCapturedPhoto(photoData);
    }
  };

  const finalizeRegistration = (withPhoto: boolean) => {
    if (!tempDescriptor || !newName) return;
    
    const newUser: User = {
      id: crypto.randomUUID(),
      name: newName,
      descriptor: tempDescriptor,
      photoUrl: withPhoto && capturedPhoto ? capturedPhoto : undefined,
      createdAt: new Date().toISOString(),
    };
    
    socket.emit('register_user', newUser);
    setNewName('');
    setTempDescriptor(null);
    setCapturedPhoto(null);
    setRegistrationStep('input');
    setScanResult({ success: true, message: `Successfully registered ${newUser.name}` });
    setTimeout(() => setScanResult(null), 4000);
  };

  const handleAttendance = async () => {
    if (!videoRef.current || isScanning) return;
    setIsScanning(true);

    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (!descriptor) {
        setScanResult({ success: false, message: 'No face detected.' });
        return;
      }

      // Find matching user
      let bestMatch: User | null = null;
      let minDistance = 0.6;

      for (const user of users) {
        const userDescriptor = new Float32Array(user.descriptor);
        const distance = faceapi.euclideanDistance(descriptor, userDescriptor);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = user;
        }
      }

      if (bestMatch) {
        const confidence = Math.round((1 - minDistance) * 100);
        const newRecord: AttendanceRecord = {
          id: crypto.randomUUID(),
          userId: bestMatch.id,
          userName: bestMatch.name,
          timestamp: new Date().toISOString(),
          status: 'present',
          confidence: confidence,
        };
        socket.emit('add_attendance', newRecord);
        setScanResult({ success: true, message: `Welcome, ${bestMatch.name}! (${confidence}% match)` });
      } else {
        setScanResult({ success: false, message: 'User not recognized.' });
      }
    } catch (error) {
      setScanResult({ success: false, message: 'Scanning failed.' });
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanResult(null), 3000);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUsername === 'admin' && loginPassword === 'admin123') {
      setIsLoggedIn(true);
      setUserRole('admin');
      setLoginError(null);
    } else if (loginUsername === 'user' && loginPassword === 'user123') {
      setIsLoggedIn(true);
      setUserRole('user');
      setActiveTab('attendance');
      setLoginError(null);
    } else {
      setLoginError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setLoginUsername('');
    setLoginPassword('');
  };

  if (!isModelsLoaded) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center font-sans transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0a0a0a] text-white' : 'bg-zinc-50 text-black'
      }`}>
        {modelError ? (
          <div className="text-center p-8 max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Initialization Error</h1>
            <p className="text-zinc-500 mb-6">{modelError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-orange-500 text-white rounded-full font-bold hover:bg-orange-600 transition-all"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
            <h1 className="text-2xl font-light tracking-widest uppercase">Initializing AI Models</h1>
            <p className={`${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'} mt-2`}>Loading face recognition system...</p>
          </>
        )}
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center font-sans transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0a0a0a] text-white' : 'bg-zinc-50 text-black'
      }`}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`w-full max-w-md p-8 rounded-3xl border shadow-2xl transition-colors duration-300 ${
            theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/20 mb-4">
              <Camera className="text-black w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
            <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Sign in to access the Attendance System
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-2 ${
                theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}>Username</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className={`w-full px-5 py-4 rounded-2xl border outline-none transition-all ${
                  theme === 'dark' 
                    ? 'bg-zinc-800 border-zinc-700 focus:border-orange-500 text-white' 
                    : 'bg-zinc-50 border-zinc-200 focus:border-orange-500 text-zinc-900'
                }`}
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-widest mb-2 ${
                theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}>Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={`w-full px-5 py-4 rounded-2xl border outline-none transition-all ${
                  theme === 'dark' 
                    ? 'bg-zinc-800 border-zinc-700 focus:border-orange-500 text-white' 
                    : 'bg-zinc-50 border-zinc-200 focus:border-orange-500 text-zinc-900'
                }`}
                placeholder="Enter password"
                required
              />
            </div>

            {loginError && (
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-orange-500 text-black font-bold rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-zinc-800/50 text-center">
            <p className="text-xs text-zinc-500">
              Demo Credentials:<br />
              Admin: <span className="text-orange-500">admin / admin123</span><br />
              User: <span className="text-orange-500">user / user123</span>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-orange-500/30 transition-colors duration-300 ${
      theme === 'dark' ? 'bg-[#0a0a0a] text-white' : 'bg-white text-zinc-900'
    }`}>
      {/* Header */}
      <header className={`border-b p-6 flex justify-between items-center backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300 ${
        theme === 'dark' ? 'border-zinc-800/50 bg-[#0a0a0a]/80' : 'border-zinc-200 bg-white/80'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Camera className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI Attendance</h1>
            <p className={`text-[10px] uppercase tracking-[0.2em] ${
              theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
            }`}>Smart System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2 rounded-full transition-all ${
              theme === 'dark' 
                ? 'bg-zinc-800 text-yellow-400 hover:bg-zinc-700' 
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <nav className={`flex gap-1 p-1 rounded-full border transition-colors duration-300 ${
          theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
        }`}>
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-white text-black hover:bg-orange-500 transition-all mr-2"
            >
              Install App
            </button>
          )}
          {[
            { id: 'attendance', icon: Camera, label: 'Scan' },
            { id: 'register', icon: UserPlus, label: 'Register' },
            { id: 'history', icon: ClipboardList, label: 'History', adminOnly: true },
            { id: 'docs', icon: FileText, label: 'Docs', adminOnly: true },
          ].filter(tab => !tab.adminOnly || userRole === 'admin').map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' 
                  : theme === 'dark'
                    ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
          <div className={`w-px h-6 my-auto mx-1 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              theme === 'dark'
                ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                : 'text-red-600 hover:text-red-700 hover:bg-red-50'
            }`}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-6 md:p-12">
        <AnimatePresence mode="wait">
          {activeTab === 'attendance' && (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-2 gap-12 items-center"
            >
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className={`text-5xl font-bold tracking-tighter leading-none ${
                    theme === 'dark' ? 'text-white' : 'text-zinc-900'
                  }`}>
                    Mark Your <span className="text-orange-500">Attendance</span>
                  </h2>
                  <p className={`text-lg max-w-md ${
                    theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    Position your face in front of the camera to automatically log your attendance.
                  </p>
                </div>

                {userRole === 'user' && (
                  <div className={`p-6 rounded-3xl border transition-colors duration-300 ${
                    theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-orange-500 mb-4">Your Status Today</h3>
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${
                        attendance.some(r => new Date(r.timestamp).toDateString() === new Date().toDateString())
                          ? 'bg-green-500 shadow-lg shadow-green-500/50'
                          : 'bg-yellow-500 shadow-lg shadow-yellow-500/50'
                      }`} />
                      <p className="text-sm font-medium">
                        {attendance.some(r => new Date(r.timestamp).toDateString() === new Date().toDateString())
                          ? 'Attendance Marked Successfully'
                          : 'Attendance Pending for Today'}
                      </p>
                    </div>
                  </div>
                )}

                <div className={`relative aspect-[4/3] md:aspect-video rounded-3xl overflow-hidden border shadow-2xl transition-colors duration-300 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                }`}>
                  {cameraError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/80 backdrop-blur-sm z-10">
                      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                      <p className="text-red-400 font-medium mb-4">{cameraError}</p>
                      <button 
                        onClick={startCamera}
                        className="px-6 py-2 bg-white text-black rounded-xl font-bold hover:bg-orange-500 transition-all"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : (
                    <video
                      ref={(el) => {
                        (videoRef as any).current = el;
                        setIsVideoMounted(!!el);
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 border-[10px] md:border-[20px] border-black/20 pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 md:w-64 md:h-64 border-2 border-dashed border-orange-500/50 rounded-full animate-pulse" />
                  </div>
                  
                  {scanResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`absolute inset-x-0 bottom-8 mx-auto w-max px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-md border ${
                        scanResult.success 
                          ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                          : 'bg-red-500/20 border-red-500/50 text-red-400'
                      }`}
                    >
                      {scanResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                      <span className="font-medium">{scanResult.message}</span>
                    </motion.div>
                  )}
                </div>

                <button
                  onClick={handleAttendance}
                  disabled={isScanning || users.length === 0}
                  className={`w-full py-6 rounded-3xl font-bold text-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${
                    theme === 'dark' 
                      ? 'bg-white text-black hover:bg-orange-500' 
                      : 'bg-zinc-900 text-white hover:bg-orange-500'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Camera className="w-6 h-6" />
                      Scan Face
                    </>
                  )}
                </button>
                {users.length === 0 && (
                  <p className="text-center text-zinc-500 text-sm">No users registered yet. Please register first.</p>
                )}
              </div>

              <div className="hidden lg:block space-y-6">
                <h3 className="text-zinc-500 uppercase tracking-widest text-xs font-bold">Recent Activity</h3>
                <div className="space-y-4">
                  {attendance.slice(0, 5).map((record) => (
                    <div key={record.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-800 rounded-full overflow-hidden flex items-center justify-center text-orange-500 font-bold">
                          {users.find(u => u.id === record.userId)?.photoUrl ? (
                            <img src={users.find(u => u.id === record.userId)?.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            record.userName[0]
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{record.userName}</p>
                          <p className="text-xs text-zinc-500">{format(new Date(record.timestamp), 'hh:mm a')}</p>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20 uppercase font-bold tracking-wider">
                        Present
                      </span>
                    </div>
                  ))}
                  {attendance.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-3xl text-zinc-600">
                      No recent activity
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className={`text-5xl font-bold tracking-tighter ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-900'
                }`}>New <span className="text-orange-500">Registration</span></h2>
                <p className={theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}>
                  {registrationStep === 'input' 
                    ? 'Add a new user to the system by capturing their face.' 
                    : 'Optionally capture a profile photo for this user.'}
                </p>
              </div>

              <div className="space-y-6">
                {registrationStep === 'input' ? (
                  <>
                    <div className={`relative aspect-[4/3] md:aspect-video rounded-3xl overflow-hidden border transition-colors duration-300 ${
                      theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                    }`}>
                      {cameraError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/80 backdrop-blur-sm z-10">
                          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                          <p className="text-red-400 font-medium mb-4">{cameraError}</p>
                          <button 
                            onClick={startCamera}
                            className="px-6 py-2 bg-white text-black rounded-xl font-bold hover:bg-orange-500 transition-all"
                          >
                            Try Again
                          </button>
                        </div>
                      ) : (
                        <video
                          ref={(el) => {
                            (videoRef as any).current = el;
                            setIsVideoMounted(!!el);
                          }}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 border-[10px] md:border-[20px] border-black/20 pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 md:w-64 md:h-64 border-2 border-dashed border-orange-500/50 rounded-full animate-pulse" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Enter Full Name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className={`w-full border rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-orange-500 transition-colors ${
                          theme === 'dark' 
                            ? 'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                        }`}
                      />
                      <button
                        onClick={handleRegister}
                        disabled={!newName || isRegistering}
                        className={`w-full py-6 rounded-3xl font-bold text-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 ${
                          theme === 'dark' 
                            ? 'bg-orange-500 text-black hover:bg-white' 
                            : 'bg-zinc-900 text-white hover:bg-orange-500'
                        }`}
                      >
                        {isRegistering ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Registering...
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-6 h-6" />
                            Complete Registration
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-8">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className={`relative aspect-square rounded-3xl overflow-hidden border transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                      }`}>
                        <video
                          ref={(el) => {
                            (videoRef as any).current = el;
                            setIsVideoMounted(!!el);
                          }}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-32 h-32 border-2 border-dashed border-orange-500/50 rounded-full" />
                        </div>
                        <button 
                          onClick={captureProfilePhoto}
                          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-orange-500 text-black rounded-full font-bold shadow-lg active:scale-95"
                        >
                          Capture
                        </button>
                      </div>

                      <div className={`relative aspect-square rounded-3xl overflow-hidden border flex items-center justify-center transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                      }`}>
                        {capturedPhoto ? (
                          <img src={capturedPhoto} alt="Profile Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-8">
                            <Camera className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                            <p className="text-zinc-500 text-sm">Preview will appear here</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <button
                        onClick={() => finalizeRegistration(true)}
                        disabled={!capturedPhoto}
                        className={`w-full py-6 rounded-3xl font-bold text-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 ${
                          theme === 'dark' 
                            ? 'bg-orange-500 text-black hover:bg-white' 
                            : 'bg-zinc-900 text-white hover:bg-orange-500'
                        }`}
                      >
                        Save with Photo
                      </button>
                      <button
                        onClick={() => finalizeRegistration(false)}
                        className={`w-full py-4 rounded-3xl font-bold text-lg transition-all active:scale-95 ${
                          theme === 'dark' 
                            ? 'text-zinc-500 hover:text-white' 
                            : 'text-zinc-500 hover:text-zinc-900'
                        }`}
                      >
                        Skip Photo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {scanResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl flex items-center gap-3 ${
                    scanResult.success ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}
                >
                  {scanResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span>{scanResult.message}</span>
                </motion.div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-2">
                  <h2 className={`text-4xl font-bold tracking-tighter ${
                    theme === 'dark' ? 'text-white' : 'text-zinc-900'
                  }`}>Attendance <span className="text-orange-500">Logs</span></h2>
                  <p className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}>Detailed history of all attendance scans.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {userRole === 'admin' && (
                    <>
                      <button 
                        onClick={exportToCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                      <button 
                        onClick={exportToPDF}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20"
                      >
                        <Download className="w-4 h-4" />
                        Export PDF
                      </button>
                    </>
                  )}
                  <div className={`flex items-center gap-4 p-1 rounded-2xl border transition-colors duration-300 ${
                    theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                  }`}>
                    {userRole === 'admin' && (
                      <button 
                        onClick={() => setHistoryView('logs')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                          historyView === 'logs' 
                            ? theme === 'dark' ? 'bg-white text-black' : 'bg-zinc-900 text-white'
                            : theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                        }`}
                      >
                        All Logs
                      </button>
                    )}
                    <button 
                      onClick={() => setHistoryView('summary')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                        historyView === 'summary' || userRole === 'user'
                          ? theme === 'dark' ? 'bg-white text-black' : 'bg-zinc-900 text-white'
                          : theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      Daily Summary
                    </button>
                  </div>
                </div>
              </div>

              {historyView === 'logs' ? (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setAttendance([])}
                      className="text-xs text-zinc-600 hover:text-red-500 transition-colors uppercase tracking-widest font-bold"
                    >
                      Clear All Logs
                    </button>
                  </div>
                  <div className={`border rounded-3xl overflow-hidden transition-colors duration-300 ${
                    theme === 'dark' ? 'bg-zinc-900/30 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
                  }`}>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-b transition-colors duration-300 ${
                          theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
                        }`}>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">User</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Date</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Time</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Match</th>
                          <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y transition-colors duration-300 ${
                        theme === 'dark' ? 'divide-zinc-800/50' : 'divide-zinc-100'
                      }`}>
                        {attendance.map((record) => (
                          <tr key={record.id} className={`transition-colors ${
                            theme === 'dark' ? 'hover:bg-zinc-800/20' : 'hover:bg-zinc-50'
                          }`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold ${
                                  theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
                                }`}>
                                  {users.find(u => u.id === record.userId)?.photoUrl ? (
                                    <img src={users.find(u => u.id === record.userId)?.photoUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    record.userName[0]
                                  )}
                                </div>
                                <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>{record.userName}</span>
                              </div>
                            </td>
                            <td className={theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}>
                              {format(new Date(record.timestamp), 'MMM dd, yyyy')}
                            </td>
                            <td className={theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}>
                              {format(new Date(record.timestamp), 'hh:mm:ss a')}
                            </td>
                            <td className="px-6 py-4">
                              {record.confidence ? (
                                <span className={`text-[10px] font-mono ${record.confidence > 80 ? 'text-green-500' : record.confidence > 60 ? 'text-orange-500' : 'text-red-500'}`}>
                                  {record.confidence}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-600">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider ${
                                record.status === 'present' 
                                  ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}>
                                {record.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {attendance.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-24 text-center text-zinc-600">
                              No attendance records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-zinc-500 uppercase tracking-widest text-xs font-bold">Status for Today ({format(new Date(), 'MMM dd')})</h3>
                    {userRole === 'admin' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setIsAbsenceDialogOpen(true)}
                          className={`px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                            theme === 'dark' 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-orange-500/20 hover:text-orange-500' 
                              : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-orange-500/10 hover:text-orange-500'
                          }`}
                        >
                          Mark User Absent
                        </button>
                        <button 
                          onClick={markAbsents}
                          className={`px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                            theme === 'dark' 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-red-500/20 hover:text-red-500' 
                              : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-red-500/10 hover:text-red-500'
                          }`}
                        >
                          Mark Unscanned as Absent
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getDailySummary().map((user) => (
                      <div key={user.id} className={`p-6 rounded-3xl flex items-center justify-between border transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center text-orange-500 font-bold text-xl ${
                            theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
                          }`}>
                            {user.photoUrl ? (
                              <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user.name[0]
                            )}
                          </div>
                          <div>
                            <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>{user.name}</p>
                            <p className={`text-xs ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Registered {format(new Date(user.createdAt), 'MMM dd')}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider ${
                          user.status === 'present' 
                            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                            : user.status === 'absent'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                        }`}>
                          {user.status}
                        </span>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <div className="col-span-full py-24 text-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-3xl">
                        No users registered to show summary.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Manual Absence Dialog */}
      <AnimatePresence>
        {isAbsenceDialogOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAbsenceDialogOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-md p-8 rounded-3xl border shadow-2xl transition-colors duration-300 ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="text-orange-500 w-6 h-6" />
                </div>
                <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Mark Manual Absence</h3>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Select User</label>
                  <select 
                    value={selectedUserForAbsence}
                    onChange={(e) => setSelectedUserForAbsence(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors ${
                      theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <option value="">Choose a user...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsAbsenceDialogOpen(false)}
                    className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                      theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => markSingleUserAbsent(selectedUserForAbsence)}
                    disabled={!selectedUserForAbsence}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-black rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    Confirm Absence
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className={`max-w-6xl mx-auto p-12 border-t mt-12 flex flex-col md:flex-row justify-between items-center gap-6 text-sm transition-colors duration-300 ${
        theme === 'dark' ? 'border-zinc-800/50 text-zinc-600' : 'border-zinc-200 text-zinc-400'
      }`}>
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          <span>FaceTrack v1.0.0</span>
        </div>
        <div className="flex gap-8">
          <a href="#" className={`transition-colors ${theme === 'dark' ? 'hover:text-white' : 'hover:text-zinc-900'}`}>Privacy Policy</a>
          <a href="#" className={`transition-colors ${theme === 'dark' ? 'hover:text-white' : 'hover:text-zinc-900'}`}>Terms of Service</a>
          <a href="#" className={`transition-colors ${theme === 'dark' ? 'hover:text-white' : 'hover:text-zinc-900'}`}>Support</a>
        </div>
        <p>© 2026 FaceTrack AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
