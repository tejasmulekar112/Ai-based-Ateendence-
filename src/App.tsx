import { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, ClipboardList, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { loadModels, getFaceDescriptor } from './lib/faceApi';
import { User, AttendanceRecord } from './types';
import { format } from 'date-fns';
import * as faceapi from 'face-api.js';

export default function App() {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendance' | 'register' | 'history'>('attendance');
  const [users, setUsers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        setIsModelsLoaded(true);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    init();

    // Load data from localStorage
    const savedUsers = localStorage.getItem('face_track_users');
    const savedAttendance = localStorage.getItem('face_track_attendance');
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedAttendance) setAttendance(JSON.parse(savedAttendance));
  }, []);

  useEffect(() => {
    localStorage.setItem('face_track_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('face_track_attendance', JSON.stringify(attendance));
  }, [attendance]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  useEffect(() => {
    if (activeTab === 'attendance' || activeTab === 'register') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  const handleRegister = async () => {
    if (!newName || !videoRef.current) return;
    setIsRegistering(true);
    setScanResult(null);
    
    try {
      // Small delay to ensure camera frame is stable
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (descriptor) {
        const newUser: User = {
          id: crypto.randomUUID(),
          name: newName,
          descriptor: Array.from(descriptor),
          createdAt: new Date().toISOString(),
        };
        setUsers(prev => [...prev, newUser]);
        setNewName('');
        setScanResult({ success: true, message: `Successfully registered ${newUser.name}` });
      } else {
        setScanResult({ success: false, message: 'No face detected. Please ensure your face is clearly visible and try again.' });
      }
    } catch (error) {
      console.error('Registration error:', error);
      setScanResult({ success: false, message: 'Registration failed. Please try again.' });
    } finally {
      setIsRegistering(false);
      // Keep success message longer, error message shorter
      setTimeout(() => setScanResult(null), 4000);
    }
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
        const newRecord: AttendanceRecord = {
          id: crypto.randomUUID(),
          userId: bestMatch.id,
          userName: bestMatch.name,
          timestamp: new Date().toISOString(),
          status: 'present',
        };
        setAttendance(prev => [newRecord, ...prev]);
        setScanResult({ success: true, message: `Welcome, ${bestMatch.name}!` });
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

  if (!isModelsLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white font-sans">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
        <h1 className="text-2xl font-light tracking-widest uppercase">Initializing AI Models</h1>
        <p className="text-zinc-500 mt-2">Loading face recognition system...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 p-6 flex justify-between items-center backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Camera className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">FaceTrack</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Attendance System</p>
          </div>
        </div>
        
        <nav className="flex gap-1 bg-zinc-900/50 p-1 rounded-full border border-zinc-800">
          {[
            { id: 'attendance', icon: Camera, label: 'Scan' },
            { id: 'register', icon: UserPlus, label: 'Register' },
            { id: 'history', icon: ClipboardList, label: 'History' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
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
                  <h2 className="text-5xl font-bold tracking-tighter leading-none">
                    Mark Your <span className="text-orange-500">Attendance</span>
                  </h2>
                  <p className="text-zinc-400 text-lg max-w-md">
                    Position your face in front of the camera to automatically log your attendance.
                  </p>
                </div>

                <div className="relative aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-2 border-dashed border-orange-500/50 rounded-full animate-pulse" />
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
                  className="w-full py-6 bg-white text-black rounded-3xl font-bold text-xl hover:bg-orange-500 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
                        <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-orange-500 font-bold">
                          {record.userName[0]}
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
                <h2 className="text-5xl font-bold tracking-tighter">New <span className="text-orange-500">Registration</span></h2>
                <p className="text-zinc-400">Add a new user to the system by capturing their face.</p>
              </div>

              <div className="space-y-6">
                <div className="relative aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Enter Full Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    onClick={handleRegister}
                    disabled={!newName || isRegistering}
                    className="w-full py-6 bg-orange-500 text-black rounded-3xl font-bold text-xl hover:bg-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
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
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <h2 className="text-4xl font-bold tracking-tighter">Attendance <span className="text-orange-500">Logs</span></h2>
                  <p className="text-zinc-500">Detailed history of all attendance scans.</p>
                </div>
                <button 
                  onClick={() => setAttendance([])}
                  className="text-xs text-zinc-600 hover:text-red-500 transition-colors uppercase tracking-widest font-bold"
                >
                  Clear All Logs
                </button>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">User</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Time</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {attendance.map((record) => (
                      <tr key={record.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold">
                              {record.userName[0]}
                            </div>
                            <span className="font-medium">{record.userName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {format(new Date(record.timestamp), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {format(new Date(record.timestamp), 'hh:mm:ss a')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-[10px] px-2 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20 uppercase font-bold tracking-wider">
                            Present
                          </span>
                        </td>
                      </tr>
                    ))}
                    {attendance.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-24 text-center text-zinc-600">
                          No attendance records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto p-12 border-t border-zinc-800/50 mt-12 flex flex-col md:flex-row justify-between items-center gap-6 text-zinc-600 text-sm">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          <span>FaceTrack v1.0.0</span>
        </div>
        <div className="flex gap-8">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-white transition-colors">Support</a>
        </div>
        <p>© 2026 FaceTrack AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
