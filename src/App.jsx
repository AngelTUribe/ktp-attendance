import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { INITIAL_ROSTER } from './roster';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫']
];

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [meetingState, setMeetingState] = useState({ active: false, name: '', wordleWord: '', startTime: null, meetingId: null });
  const [attendance, setAttendance] = useState([]);
  const [meetingsHistory, setMeetingsHistory] = useState([]);
  const [excusedAbsences, setExcusedAbsences] = useState([]);
  const [expandedMember, setExpandedMember] = useState(null);
  const [selectedTabId, setSelectedTabId] = useState('new');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [userFlowStep, setUserFlowStep] = useState('IDLE');
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [selectedMember, setSelectedMember] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); 
  
  const [newMeetingName, setNewMeetingName] = useState('');
  const [newWordleWord, setNewWordleWord] = useState('');

  const [verifyFlow, setVerifyFlow] = useState({ active: false, logs: [], currentIndex: 0 });

  const [wordleGuesses, setWordleGuesses] = useState([]);
  const [wordleCurrentGuess, setWordleCurrentGuess] = useState('');
  const [wordleStatus, setWordleStatus] = useState('PLAYING');

  const webcamRef = useRef(null);
  const GRACE_PERIOD_SEC = 600; 
  const isHeroLogo = !isAdmin && userFlowStep === 'IDLE';

  const fetchMeetingStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/status`);
      const data = await res.json();
      if (data) {
        setMeetingState({
          active: data.active,
          name: data.name,
          wordleWord: data.wordle_word,
          startTime: data.start_time !== '0' ? parseInt(data.start_time) : null,
          meetingId: data.meeting_id !== '0' ? data.meeting_id : null
        });
      }
    } catch (err) {}
  };

  const fetchAdminData = async () => {
    try {
      const attRes = await fetch(`${API_BASE_URL}/attendance`);
      const attData = await attRes.json();
      setAttendance(attData);

      const meetRes = await fetch(`${API_BASE_URL}/meetings`);
      const meetData = await meetRes.json();
      setMeetingsHistory(meetData);
      
      const excRes = await fetch(`${API_BASE_URL}/excused`);
      const excData = await excRes.json();
      setExcusedAbsences(excData);

      if (meetData.length > 0 && selectedTabId === 'new') {
        const activeMeeting = meetData.find(m => m.is_active);
        setSelectedTabId(activeMeeting ? activeMeeting.id : meetData[0].id);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchMeetingStatus();
    const syncInterval = setInterval(fetchMeetingStatus, 3000);
    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAdminData();
  }, [isAdmin]);

  useEffect(() => {
    let interval;
    if (meetingState.active && meetingState.startTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - meetingState.startTime) / 1000));
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [meetingState]);

  const handleAuthorizeMeeting = async () => {
    if (!newMeetingName.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMeetingName, wordleWord: newWordleWord.trim().toUpperCase() })
      });
      const data = await res.json();
      if (data.success) {
        await fetchMeetingStatus();
        await fetchAdminData();
        setNewMeetingName('');
        setNewWordleWord('');
        setSelectedTabId('new'); 
      }
    } catch (err) {}
  };

  const handleEndMeeting = async () => {
    try {
      await fetch(`${API_BASE_URL}/end`, { method: 'POST' });
      await fetchMeetingStatus();
      await fetchAdminData();
      setUserFlowStep('IDLE');
    } catch (err) {}
  };

  const handleReopenMeeting = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: id })
      });
      await fetchMeetingStatus();
      await fetchAdminData();
    } catch (err) {}
  };

  const handleAddTime = async () => {
    try {
      await fetch(`${API_BASE_URL}/add-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addedMs: 300000 }) 
      });
      await fetchMeetingStatus();
      await fetchAdminData();
    } catch (err) {}
  };

  const handleDeleteMeeting = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this meeting and all its attendance records?")) return;
    try {
      await fetch(`${API_BASE_URL}/meetings/${id}`, { method: 'DELETE' });
      setSelectedTabId('new');
      await fetchMeetingStatus();
      await fetchAdminData();
    } catch (err) {}
  };

  const handleToggleExcused = async (meetingId, memberId, isCurrentlyExcused) => {
    try {
      await fetch(`${API_BASE_URL}/excused`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, memberId, isExcused: !isCurrentlyExcused })
      });
      
      if (!isCurrentlyExcused) {
        setExcusedAbsences(prev => [...prev, { meeting_id: meetingId, member_id: memberId }]);
      } else {
        setExcusedAbsences(prev => prev.filter(e => !(String(e.meeting_id) === String(meetingId) && String(e.member_id) === String(memberId))));
      }
    } catch (err) {}
  };

  const startVerificationFlow = () => {
    const logsToVerify = attendance.filter(log => log.meeting_id === selectedTabId && log.photo);
    if (logsToVerify.length === 0) return;
    setVerifyFlow({ active: true, logs: logsToVerify, currentIndex: 0 });
  };

  const handleVerifyStep = async (isVerified) => {
    const currentLog = verifyFlow.logs[verifyFlow.currentIndex];
    
    setAttendance(prev => prev.map(log => log.id === currentLog.id ? { ...log, verified: isVerified } : log));
    
    try {
      await fetch(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: currentLog.id, verified: isVerified })
      });
    } catch (err) {}

    if (verifyFlow.currentIndex + 1 < verifyFlow.logs.length) {
      setVerifyFlow(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
    } else {
      setVerifyFlow({ active: false, logs: [], currentIndex: 0 });
      fetchAdminData();
    }
  };

  const exportToCSV = () => {
    const logsToExport = attendance.filter(log => log.meeting_id === selectedTabId);
    if (logsToExport.length === 0) return;

    const headers = ["Meeting ID", "Member Name", "Status", "Time", "Verified"];
    const csvRows = [headers.join(',')];

    logsToExport.forEach(log => {
      const row = [
        log.meeting_id || "Unknown", 
        `"${log.member_name || log.name}"`, 
        log.status, 
        `"${log.time}"`,
        log.verified ? "Yes" : "No"
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KTP_Attendance_Export_${selectedTabId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStartCheckIn = () => setUserFlowStep('CAMERA');
  
  const handleCapture = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setCapturedPhoto(imageSrc);
    setUserFlowStep('ROSTER');
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setUserFlowStep('CAMERA');
    setSearchQuery('');
    setSelectedMember('');
  };

  const handleSubmitAttendance = async () => {
    if (!selectedMember) return;

    const status = elapsedSeconds <= GRACE_PERIOD_SEC ? 'On Time' : 'Late';
    const memberName = INITIAL_ROSTER.find(m => m.id === selectedMember)?.name;
    const timeString = new Date().toLocaleTimeString();

    try {
      await fetch(`${API_BASE_URL}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember,
          memberName: memberName,
          status: status,
          time: timeString,
          photo: capturedPhoto
        })
      });

      setAttendance(prev => [{ meeting_id: meetingState.meetingId, id: Date.now(), member_id: selectedMember, member_name: memberName, name: memberName, status, time: timeString, photo: capturedPhoto, verified: false }, ...prev.filter(r => r.member_id !== selectedMember)]);
      
      setWordleGuesses([]);
      setWordleCurrentGuess('');
      setWordleStatus('PLAYING');
      setUserFlowStep('SUCCESS');
      
    } catch (err) {}
  };

  const handleWordleKey = (key) => {
    if (wordleStatus !== 'PLAYING') return;
    const target = meetingState.wordleWord;
    
    if (key === 'ENTER') {
      if (wordleCurrentGuess.length === target.length) {
        const newGuesses = [...wordleGuesses, wordleCurrentGuess];
        setWordleGuesses(newGuesses);
        setWordleCurrentGuess('');
        if (wordleCurrentGuess === target) setWordleStatus('WON');
        else if (newGuesses.length >= 6) setWordleStatus('LOST');
      }
    } else if (key === '⌫' || key === 'BACKSPACE') {
      setWordleCurrentGuess(prev => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key) && wordleCurrentGuess.length < target.length) {
      setWordleCurrentGuess(prev => prev + key);
    }
  };

  useEffect(() => {
    if (userFlowStep !== 'WORDLE' || wordleStatus !== 'PLAYING') return;
    const handleKeyDown = (e) => handleWordleKey(e.key.toUpperCase());
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const getGuessStatuses = (guess, target) => {
    const statuses = Array(guess.length).fill('absent');
    const targetCharCounts = {};
    for (let char of target) targetCharCounts[char] = (targetCharCounts[char] || 0) + 1;

    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === target[i]) {
        statuses[i] = 'correct';
        targetCharCounts[guess[i]] -= 1;
      }
    }
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== target[i] && targetCharCounts[guess[i]] > 0) {
        statuses[i] = 'present';
        targetCharCounts[guess[i]] -= 1;
      }
    }
    return statuses;
  };

  const getTimerDisplay = () => {
    const remaining = GRACE_PERIOD_SEC - elapsedSeconds;
    
    if (remaining <= 0) return { text: "Late Check-in", pct: 0, color: 'var(--ktp-red)' };
    
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    
    return { 
      text: `${mins}:${secs < 10 ? '0' : ''}${secs}`, 
      pct: Math.min(100, (remaining / GRACE_PERIOD_SEC) * 100),
      color: 'var(--ktp-green)'
    };
  };

  const overallStats = React.useMemo(() => {
    const stats = INITIAL_ROSTER.map(member => {
      let attended = 0, late = 0, absent = 0, excused = 0;
      let missedMeetings = [];

      meetingsHistory.forEach(meeting => {
        const checkIn = attendance.find(a => String(a.meeting_id) === String(meeting.id) && String(a.member_id) === String(member.id));
        
        if (checkIn) {
          if (checkIn.status === 'On Time') attended++;
          else if (checkIn.status === 'Late') late++;
        } else {
          const isExcused = excusedAbsences.some(e => String(e.meeting_id) === String(meeting.id) && String(e.member_id) === String(member.id));
          if (isExcused) excused++;
          else absent++;
          
          missedMeetings.push({ meeting_id: meeting.id, name: meeting.name, isExcused });
        }
      });

      return { ...member, attended, late, absent, excused, missedMeetings };
    });
    
    // Sort overall stats alphabetically
    return stats.sort((a, b) => a.name.localeCompare(b.name));
  }, [meetingsHistory, attendance, excusedAbsences]);

  // Sort roster grid alphabetically
  const filteredRoster = INITIAL_ROSTER
    .filter(member => member.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Sort meeting logs alphabetically
  const selectedMeetingLogs = attendance
    .filter(log => log.meeting_id === selectedTabId)
    .sort((a, b) => {
      const nameA = a.member_name || a.name || '';
      const nameB = b.member_name || b.name || '';
      return nameA.localeCompare(nameB);
    });
    
  const selectedMeetingData = meetingsHistory.find(m => m.id === selectedTabId);

  return (
    <div className="main-container">
      
      <div className={`floating-logo ${isHeroLogo ? 'hero-pos' : 'header-pos'}`}>
        <h1 className="logo-greek">
          <span className="letter letter-k">K</span>
          <span className="letter letter-theta">Θ</span>
          <span className="letter letter-pi">Π</span>
        </h1>
        <h2 className="logo-chapter">PHI CHAPTER</h2>
      </div>

      <header className="app-header">
        <button className="admin-toggle-btn" onClick={async () => {
          if (isAdmin) {
            setIsAdmin(false);
          } else {
            const pwd = prompt("Enter Admin Password:");
            if (!pwd) return;
            try {
              const res = await fetch(`${API_BASE_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
              });
              if (res.ok) {
                setIsAdmin(true);
              }
            } catch (err) {}
          }
        }}>
          {isAdmin ? 'Exit Admin' : 'Admin Login'}
        </button>
      </header>

      <div className={`content-wrapper ${isHeroLogo ? 'hero-margin' : 'standard-margin'}`}>
        
        {isAdmin ? (
          verifyFlow.active ? (
            <div className="card verify-card">
              <h2 className="gold-text">Verifying Photo {verifyFlow.currentIndex + 1} of {verifyFlow.logs.length}</h2>
              <div className="verify-details">
                <h3>{verifyFlow.logs[verifyFlow.currentIndex].member_name}</h3>
                <p className="verify-meta">{verifyFlow.logs[verifyFlow.currentIndex].time} | {verifyFlow.logs[verifyFlow.currentIndex].status}</p>
                <img 
                  src={verifyFlow.logs[verifyFlow.currentIndex].photo} 
                  alt="Snapshot" 
                  className="verify-img"
                />
              </div>
              <div className="action-buttons">
                <button 
                  className="btn-danger flex-1 py-15"
                  onClick={() => handleVerifyStep(false)} 
                >
                  Reject & Next
                </button>
                <button 
                  className="btn-success flex-1 py-15"
                  onClick={() => handleVerifyStep(true)} 
                >
                  Verify & Next
                </button>
              </div>
              <button 
                className="btn-link mt-25"
                onClick={() => { setVerifyFlow({ active: false, logs: [], currentIndex: 0 }); fetchAdminData(); }} 
              >
                Cancel & Exit Verification
              </button>
            </div>
          ) : (
            <div className="card">
              <h2 className="gold-text mb-20">Admin Dashboard</h2>
              
              <div className="admin-tabs">
                <button 
                  className={`tab-btn ${selectedTabId === 'new' ? 'active' : ''}`}
                  onClick={() => setSelectedTabId('new')}
                >
                  + New Meeting
                </button>
                <button 
                  className={`tab-btn ${selectedTabId === 'overall' ? 'active' : ''}`}
                  onClick={() => setSelectedTabId('overall')}
                >
                  Overall Stats
                </button>
                {meetingsHistory.map(meeting => (
                  <button 
                    key={meeting.id}
                    className={`tab-btn ${selectedTabId === meeting.id ? 'active' : ''}`}
                    onClick={() => setSelectedTabId(meeting.id)}
                  >
                    {meeting.name} {meeting.is_active ? '(Active)' : ''}
                  </button>
                ))}
              </div>

              {selectedTabId === 'new' ? (
                <div className="meeting-panel">
                  <h3>Start New Meeting</h3>
                  {meetingState.active ? (
                    <p className="error-text">A meeting is already active. Close it before starting a new one.</p>
                  ) : (
                    <div className="input-group">
                      <input type="text" placeholder="Meeting Name (e.g., General Chapter 10/24)" value={newMeetingName} onChange={(e) => setNewMeetingName(e.target.value)} />
                      <input type="text" placeholder="Secret Wordle Word (Optional)" value={newWordleWord} onChange={(e) => setNewWordleWord(e.target.value)} />
                      <button onClick={handleAuthorizeMeeting}>Authorize Meeting</button>
                    </div>
                  )}
                </div>
              ) : selectedTabId === 'overall' ? null : (
                selectedMeetingData && (
                  <div className="meeting-panel">
                    <div className="meeting-header">
                      <div>
                        <h3>{selectedMeetingData.name}</h3>
                        <p className="meeting-time">{new Date(parseInt(selectedMeetingData.start_time)).toLocaleString()}</p>
                      </div>
                      <span className={`status-badge ${selectedMeetingData.is_active ? 'active' : 'closed'}`}>
                        {selectedMeetingData.is_active ? 'ACTIVE' : 'CLOSED'}
                      </span>
                    </div>

                    {selectedMeetingData.is_active ? (
                      <>
                        <div className="mb-15">
                          <div className="timer-header">
                            <span className="text-muted">Grace Period Remaining</span>
                            <span style={{ color: getTimerDisplay().color, fontWeight: 'bold', fontSize: '18px', letterSpacing: '1px' }}>
                              {getTimerDisplay().text}
                            </span>
                          </div>
                          <div className="progress-container m-0">
                            <div className="progress-bar" style={{ width: `${getTimerDisplay().pct}%`, backgroundColor: getTimerDisplay().color }}></div>
                          </div>
                        </div>
                        <div className="action-buttons">
                          <button className="btn-danger flex-1" onClick={handleEndMeeting}>Close Meeting</button>
                          <button className="btn-outline flex-1" onClick={handleAddTime}>+5 Mins Grace Period</button>
                        </div>
                      </>
                    ) : (
                      <div className="action-buttons-stack">
                        <button className="btn-outline" onClick={() => handleReopenMeeting(selectedMeetingData.id)}>Reopen Meeting</button>
                        <button className="btn-danger-solid" onClick={() => handleDeleteMeeting(selectedMeetingData.id)}>Delete Meeting</button>
                      </div>
                    )}
                  </div>
                )
              )}
              
              {selectedTabId !== 'new' && selectedTabId !== 'overall' && (
                <>
                  <div className="table-header-row">
                     <h3>Attendance Log</h3>
                     <div className="table-actions">
                       <button className="btn-gold" onClick={startVerificationFlow}>Verify Images</button>
                       <button className="btn-outline" onClick={fetchAdminData}>Refresh Data</button>
                       <button className="btn-success" onClick={exportToCSV}>Export Excel</button>
                     </div>
                  </div>
                  
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr><th>Name</th><th>Time</th><th>Status</th><th>Photo</th><th>Verified</th></tr>
                      </thead>
                      <tbody>
                        {selectedMeetingLogs.map((record, idx) => (
                          <tr key={idx}>
                            <td>{record.member_name || record.name}</td>
                            <td>{record.time}</td>
                            <td style={{ color: record.status === 'On Time' ? 'var(--ktp-green)' : 'var(--ktp-red)' }}>{record.status}</td>
                            <td>{record.photo && <img src={record.photo} alt="Verification" className="table-img" />}</td>
                            <td className={`verified-cell ${record.verified ? 'is-verified' : ''}`}>
                              {record.verified ? 'Yes' : 'No'}
                            </td>
                          </tr>
                        ))}
                        {selectedMeetingLogs.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center' }}>No attendance records found for this meeting.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {selectedTabId === 'overall' && (
                <>
                  <div className="table-header-row">
                     <h3>Overall Member Attendance</h3>
                     <div className="table-actions">
                       <button className="btn-outline" onClick={fetchAdminData}>Refresh Data</button>
                     </div>
                  </div>
                  
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>On Time</th>
                          <th>Late</th>
                          <th>Unexcused Absent</th>
                          <th>Excused</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallStats.map((stat) => (
                          <React.Fragment key={stat.id}>
                            <tr className="clickable-row" onClick={() => setExpandedMember(expandedMember === stat.id ? null : stat.id)}>
                              <td>{stat.name}</td>
                              <td style={{color: 'var(--ktp-green)'}}>{stat.attended}</td>
                              <td style={{color: 'var(--ktp-gold)'}}>{stat.late}</td>
                              <td style={{color: stat.absent > 0 ? 'var(--ktp-red)' : 'inherit'}}>{stat.absent}</td>
                              <td>{stat.excused}</td>
                              <td>
                                <button className="btn-link" style={{padding: '5px'}}>
                                  {expandedMember === stat.id ? 'Hide' : 'View'}
                                </button>
                              </td>
                            </tr>
                            {expandedMember === stat.id && (
                              <tr className="details-row">
                                <td colSpan="6">
                                  <div className="absences-details">
                                    <h4 className="gold-text m-0 mb-15">Absence History for {stat.name}</h4>
                                    {stat.missedMeetings.length === 0 ? (
                                      <p className="text-muted m-0">Perfect attendance!</p>
                                    ) : (
                                      <ul className="missed-meetings-list">
                                        {stat.missedMeetings.map(mm => (
                                          <li key={mm.meeting_id} className="missed-meeting-item">
                                            <span>{mm.name}</span>
                                            <button 
                                              className={`btn-sm ${mm.isExcused ? 'btn-outline' : 'btn-success'}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleExcused(mm.meeting_id, stat.id, mm.isExcused);
                                              }}
                                            >
                                              {mm.isExcused ? 'Remove Excuse' : 'Mark Excused'}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

            </div>
          )
        ) : (

          <div className="user-flow-container">
            {!meetingState.active ? (
              <div className="idle-state">
                <p></p>
              </div>
            ) : (
              <div className="card max-w-600">
                
                {userFlowStep !== 'SUCCESS' && userFlowStep !== 'WORDLE' && (
                  <>
                    <h2 className="gold-text mb-20">{meetingState.name}</h2>
                    <div className="mb-20">
                      <div className="timer-header">
                        <span className="text-muted">Time Remaining</span>
                        <span style={{ color: getTimerDisplay().color, fontWeight: 'bold', fontSize: '20px', letterSpacing: '1px' }}>
                          {getTimerDisplay().text}
                        </span>
                      </div>
                      <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${getTimerDisplay().pct}%`, backgroundColor: getTimerDisplay().color }}></div>
                      </div>
                    </div>
                  </>
                )}

                {userFlowStep === 'IDLE' && (
                  <button className="w-100 py-20 text-20" onClick={handleStartCheckIn}>
                    Take Attendance
                  </button>
                )}

                {userFlowStep === 'CAMERA' && (
                  <div>
                    <div className="webcam-container">
                      <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" width="100%" />
                    </div>
                    <button className="w-100" onClick={handleCapture}>Take Snapshot</button>
                  </div>
                )}

                {userFlowStep === 'ROSTER' && (
                  <div>
                    <div className="preview-container">
                      <h3 className="gold-text m-0">Preview</h3>
                      <img src={capturedPhoto} alt="Snapshot" className="preview-img" />
                      <button className="btn-outline w-100 max-w-300" onClick={handleRetake}>Retake Photo</button>
                    </div>
                    
                    <h3 className="identify-header">Identify Yourself</h3>
                    
                    {!selectedMember ? (
                      <>
                        <input 
                          type="text" 
                          placeholder="Search for your name..." 
                          className="search-bar" 
                          value={searchQuery} 
                          onChange={(e) => setSearchQuery(e.target.value)} 
                        />
                        <div className="roster-grid">
                          {filteredRoster.map(member => {
                            const hasCheckedIn = attendance.some(a => String(a.member_id) === String(member.id) && String(a.meeting_id) === String(meetingState.meetingId));
                            return (
                              <button 
                                key={member.id}
                                className={`member-btn ${selectedMember === member.id ? 'selected' : ''}`}
                                onClick={() => setSelectedMember(member.id)}
                                disabled={hasCheckedIn}
                              >
                                <span>{member.name}</span>
                                {hasCheckedIn && <span className="check-icon">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="selected-profile-card">
                        <p className="text-muted m-0">Checking in as:</p>
                        <h2 className="gold-text mt-5 mb-15">
                          {INITIAL_ROSTER.find(m => m.id === selectedMember)?.name}
                        </h2>
                        <button className="btn-outline w-100 max-w-300 mb-15" onClick={() => setSelectedMember('')}>
                          Not you? Change Selection
                        </button>
                      </div>
                    )}

                    <button 
                      className="w-100 mt-5 text-18 py-20" 
                      onClick={handleSubmitAttendance} 
                      disabled={!selectedMember} 
                      style={{ opacity: selectedMember ? 1 : 0.5 }}
                    >
                      Confirm Check-in
                    </button>
                  </div>
                )}

                {userFlowStep === 'SUCCESS' && (
                  <div className="success-container">
                    <h2 className="success-icon">✓ Recorded</h2>
                    <p className="text-18">You are securely checked in to the server.</p>
                    
                    {meetingState.wordleWord && (
                      <div className="mt-40">
                        <p className="mb-15 text-muted">Waiting for the meeting to start?</p>
                        <button className="py-15 px-30 text-18" onClick={() => setUserFlowStep('WORDLE')}>
                          Play KTP Wordle
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {userFlowStep === 'WORDLE' && (
                  <div>
                    <h2 className="gold-text">KTP Wordle</h2>
                    
                    {wordleStatus === 'WON' && <h3 className="success-text">Genius!</h3>}
                    {wordleStatus === 'LOST' && <h3 className="error-text">The word was: {meetingState.wordleWord}</h3>}
                    
                    <div className="wordle-board">
                      {Array.from({ length: 6 }).map((_, rowIndex) => {
                        const isCurrentRow = rowIndex === wordleGuesses.length;
                        const isPastRow = rowIndex < wordleGuesses.length;
                        const guessStr = isPastRow ? wordleGuesses[rowIndex] : (isCurrentRow ? wordleCurrentGuess : '');
                        const statuses = isPastRow ? getGuessStatuses(guessStr, meetingState.wordleWord) : [];

                        return (
                          <div key={rowIndex} className="wordle-row">
                            {Array.from({ length: meetingState.wordleWord.length }).map((_, colIndex) => {
                              const letter = guessStr[colIndex] || '';
                              const statusClass = isPastRow ? statuses[colIndex] : (letter ? 'filled' : '');
                              
                              return (
                                <div 
                                  key={colIndex} 
                                  className={`wordle-cell ${statusClass}`}
                                  style={{ animationDelay: isPastRow ? `${colIndex * 0.15}s` : '0s' }}
                                >
                                  {letter}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    <div className="keyboard">
                      {KEYBOARD_ROWS.map((row, rIdx) => (
                        <div key={rIdx} className="keyboard-row">
                          {row.map(key => (
                            <button 
                              key={key} 
                              className={`key-btn ${key.length > 1 ? 'wide' : ''}`}
                              onClick={() => handleWordleKey(key)}
                            >
                              {key}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}