import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://indus-school-hostel.onrender.com').replace(/\/+$/, '');
const BLOCKED_NOTIFICATION_MESSAGE = 'Notifications are blocked on this device. In Chrome, open Settings > Site settings > Notifications and allow this site. For an installed shortcut, also check Android Settings > Apps > Hostel 360 > Notifications. Reopen the app and tap Enable notifications again.';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, character => character.charCodeAt(0));
};

const areKeysEqual = (currentKey, configuredKey) => {
  if (!currentKey || currentKey.byteLength !== configuredKey.byteLength) return false;
  const currentBytes = new Uint8Array(currentKey);
  return configuredKey.every((byte, index) => byte === currentBytes[index]);
};

const formatDMYDate = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string' && dateString.includes('-')) {
    try {
      const [datePart, timePart] = dateString.split('T');
      const [year, month, day] = datePart.split('-');
      if (year && month && day) {
        let formattedTime = '';
        if (timePart) {
          const timeClean = timePart.split('.')[0];
          const [h, m] = timeClean.split(':');
          let hours = parseInt(h, 10);
          const ampm = hours >= 12 ? 'pm' : 'am';
          hours = hours % 12;
          hours = hours ? hours : 12;
          formattedTime = `, ${String(hours).padStart(2, '0')}:${m} ${ampm}`;
        }
        return `${day}/${month}/${year}${formattedTime}`;
      }
    } catch (e) {}
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}/${month}/${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

const formatLiveClock = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}/${month}/${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('admin-dashboard');
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ new: 0, accepted: 0, inProgress: 0, completed: 0 });
  const [filterCategory, setFilterCategory] = useState('All');
  const [completedFilterCategory, setCompletedFilterCategory] = useState('All');
  const [completedDeleteCategory, setCompletedDeleteCategory] = useState('All');
  const [isDeletingCompleted, setIsDeletingCompleted] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(null);

  const [formData, setFormData] = useState({
    category: 'Electrical',
    location: '',
    problemDescription: '',
    reportedByName: '',
    reportedByMobile: '',
    reportedAt: '',
    urgencyLevel: 'Medium',
    photo: null
  });

  const [completionData, setCompletionData] = useState({});
  const [updatingRequests, setUpdatingRequests] = useState({});
  const [selectedTechs, setSelectedTechs] = useState({});
  const [dbStats, setDbStats] = useState({ requests: 0 });
  const [pushStatus, setPushStatus] = useState('');
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const cameraVideoRef = useRef(null);

  useEffect(() => {
    const updateISTClock = () => {
      const now = new Date();
      setCurrentTime(formatLiveClock(now));
    };
    updateISTClock();
    const interval = setInterval(updateISTClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!cameraStream || !cameraVideoRef.current) return undefined;
    const videoElement = cameraVideoRef.current;
    videoElement.srcObject = cameraStream;
    videoElement.play().catch(error => {
      console.error('Unable to start camera preview:', error);
      setCameraError('Camera preview could not start. Check permissions.');
    });
    return () => {
      cameraStream.getTracks().forEach(track => track.stop());
      videoElement.srcObject = null;
    };
  }, [cameraStream]);

  const fetchData = async () => {
    try {
      const [requestsRes, dbRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/requests`),
        fetch(`${API_BASE_URL}/api/db/stats`).catch(() => null)
      ]);
      const requestsResult = requestsRes ? await requestsRes.json() : null;
      if (requestsResult?.success) {
        setRequests(requestsResult.data);
        setStats(requestsResult.stats);
        if (Array.isArray(requestsResult.data) && requestsResult.data.length > 0) {
          setSubmittedRequest(prev => prev ?? requestsResult.data[0]);
        }
      }
      if (dbRes) {
        const dbResult = await dbRes.json();
        if (dbResult?.success) setDbStats(dbResult.stats);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchData();
  }, [isLoggedIn]);

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    const username = loginData.username.trim();
    const password = loginData.password;
    if (username === 'admin' && password === 'hostel360') {
      setUserRole('admin');
      setIsLoggedIn(true);
      setActiveTab('admin-dashboard');
      setLoginError('');
    } else if (username === 'staff' && password === 'user123') {
      setUserRole('user');
      setIsLoggedIn(true);
      setActiveTab('report');
      setLoginError('');
    } else {
      setLoginError('Incorrect username or password. Please try again.');
    }
  };

  const handleEnableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Notifications not supported.');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus(BLOCKED_NOTIFICATION_MESSAGE);
      return;
    }
    setIsEnablingPush(true);
    setPushStatus('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? BLOCKED_NOTIFICATION_MESSAGE : 'Allow notifications when your browser asks.');
        return;
      }
      const keyResponse = await fetch(`${API_BASE_URL}/api/push/public-key`);
      const keyResult = await keyResponse.json();
      await navigator.serviceWorker.register('/service-worker.js');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = urlBase64ToUint8Array(keyResult.publicKey);
      if (subscription && !areKeysEqual(subscription.options.applicationServerKey, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });
      setPushStatus('Notifications enabled!');
      alert('Notifications enabled successfully!');
    } catch (err) {
      setPushStatus(err.message || 'Could not enable notifications.');
    } finally {
      setIsEnablingPush(false);
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.keys(formData).forEach(key => {
      if (formData[key]) data.append(key, formData[key]);
    });
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests`, { method: 'POST', body: data });
      const result = await res.json();
      if (!res.ok || !result?.success) {
        window.alert(result.error || 'Could not submit the complaint.');
        return;
      }
      setSubmittedRequest(result.data);
      setActiveTab('success-screen');
      setFormData({ category: 'Electrical', location: '', problemDescription: '', reportedByName: '', reportedByMobile: '', reportedAt: '', urgencyLevel: 'Medium', photo: null });
      await fetchData();
    } catch (err) {
      console.error('Submission error:', err);
    }
  };

  const startReportCamera = async (facingMode = cameraFacingMode) => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture not supported.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } }
      });
      setCameraFacingMode(facingMode);
      setCameraStream(stream);
    } catch (error) {
      setCameraError('Could not open the camera.');
    }
  };

  const switchReportCamera = async (facingMode) => {
    if (facingMode === cameraFacingMode) return;
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    setCameraFacingMode(facingMode);
    await startReportCamera(facingMode);
  };

  const captureReportPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const photo = new File([blob], `complaint-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFormData(previous => ({ ...previous, photo }));
      setCameraStream(null);
      setCameraError('');
    }, 'image/jpeg', 0.9);
  };

  const closeReportCamera = () => {
    setCameraStream(null);
    setCameraError('');
  };

  const updateStatus = async (id, status, isCompletion = false, assignedName = null, assignedMobile = null) => {
    if (updatingRequests[id]) return;
    const data = isCompletion ? new FormData() : {
      status,
      ...(assignedName ? { assignedName } : {}),
      ...(assignedMobile ? { assignedMobile } : {})
    };

    if (isCompletion) {
      const itemComp = completionData[id] || {};
      if (!itemComp.completionPhoto) {
        window.alert('Please upload a photo of the completed work.');
        return;
      }
      if (!itemComp.completionVideo) {
        window.alert('Please upload a video of the completed work.');
        return;
      }
      data.append('status', status);
      if (itemComp.remarks) data.append('remarks', itemComp.remarks);
      data.append('completionPhoto', itemComp.completionPhoto);
      data.append('completionVideo', itemComp.completionVideo);
    }

    setUpdatingRequests(previous => ({ ...previous, [id]: true }));
    try {
      const requestUrl = isCompletion
        ? `${API_BASE_URL}/api/requests/${id}/completion`
        : `${API_BASE_URL}/api/requests/${id}`;
      const res = await fetch(requestUrl, {
        method: isCompletion ? 'POST' : 'PATCH',
        headers: isCompletion ? undefined : { 'Content-Type': 'application/json' },
        body: isCompletion ? data : JSON.stringify(data)
      });
      const responseBody = await res.text();
      let result = null;
      try {
        result = responseBody ? JSON.parse(responseBody) : null;
      } catch {}
      if (!res.ok || !result?.success) {
        window.alert(result?.error || 'Could not update request.');
        return;
      }
      await fetchData();
      if (isCompletion) {
        setCompletionData(previous => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        window.alert('Completed successfully.');
      }
    } catch (err) {
      window.alert(err.message || 'Could not reach server.');
    } finally {
      setUpdatingRequests(previous => ({ ...previous, [id]: false }));
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('WARNING: Delete ALL requests permanently?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/db/clear-requests`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        alert(result.message);
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCompletedRequests = async () => {
    const matchingCount = requests.filter(request =>
      request.status === 'Completed' &&
      (completedDeleteCategory === 'All' ||
        completedDeleteCategory === 'Completed' ||
        request.category === completedDeleteCategory)
    ).length;
    if (matchingCount === 0) {
      window.alert('There are no completed complaints in this category.');
      return;
    }

    const categoryDescription = completedDeleteCategory === 'All' || completedDeleteCategory === 'Completed'
      ? 'all categories'
      : completedDeleteCategory;
    if (!window.confirm(`Permanently delete ${matchingCount} completed complaint(s) from ${categoryDescription}?`)) return;

    setIsDeletingCompleted(true);
    try {
      const query = completedDeleteCategory === 'All' || completedDeleteCategory === 'Completed'
        ? ''
        : `?category=${encodeURIComponent(completedDeleteCategory)}`;
      const response = await fetch(`${API_BASE_URL}/api/requests/status/Completed${query}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Could not delete completed complaints.');
      }

      window.alert(result.message);
      await fetchData();
    } catch (error) {
      window.alert(error.message || 'Could not reach the server.');
    } finally {
      setIsDeletingCompleted(false);
    }
  };

  const getUrgencyBadge = (level) => {
    let bg = '#6c757d';
    if (level === 'Urgent') bg = '#dc3545';
    else if (level === 'High') bg = '#fd7e14';
    else if (level === 'Medium') bg = '#ffc107';
    return <span style={{ padding: '2px 6px', borderRadius: '4px', background: bg, color: level === 'Medium' ? '#000' : '#fff', fontSize: '10px', fontWeight: 'bold' }}>{level || 'Medium'}</span>;
  };

  const getPhotoUrl = (photo) => {
    if (!photo) return null;
    const base = photo.startsWith('http') ? photo : `${API_BASE_URL}${photo}`;
    return `${base}?t=${Date.now()}`;
  };

  const getVideoUrl = (video) => {
    if (!video) return null;
    return video.startsWith('http') ? video : `${API_BASE_URL}${video}`;
  };

  const renderVideo = (label, video, title) => {
    const videoUrl = getVideoUrl(video);
    if (!videoUrl) return null;
    return (
      <div key={label} style={{ minWidth: 0, width: '100%', maxWidth: '480px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
        <video controls playsInline preload="metadata" aria-label={title} style={{ display: 'block', width: '100%', maxHeight: '280px', borderRadius: '4px', background: '#000' }}>
          <source src={videoUrl} />
          Your browser does not support video playback.
        </video>
      </div>
    );
  };

  const renderPhoto = (label, photo, alt, showLabel = true) => {
    const photoUrl = getPhotoUrl(photo);
    return (
      <div style={{ minWidth: 0, width: 'fit-content', maxWidth: '320px' }}>
        {showLabel && <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>}
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ border: '4px solid #0056b3', borderRadius: '8px', padding: '6px', background: '#ffffff', display: 'inline-block', boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }}>
              <img src={photoUrl} alt={alt} style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '160px', objectFit: 'contain' }} />
            </div>
          </a>
        ) : (
          <span style={{ color: '#666' }}>Photo not available</span>
        )}
      </div>
    );
  };

  const renderRequestDetails = (req, includeComplaintPhoto = true) => (
    <div>
      <p style={{ margin: '3px 0' }}>Loc: {req.location}</p>
      <p style={{ margin: '3px 0' }}>Problem: {req.problemDescription}</p>
      <p style={{ margin: '3px 0' }}>Reported by: {req.reportedByName || 'N/A'}</p>
      <p style={{ margin: '3px 0' }}>Mobile: {req.reportedByMobile || 'N/A'}</p>
      <p style={{ margin: '3px 0' }}>Reported at: {formatDMYDate(req.reportedAt)}</p>
      {(req.assignedName || req.assignedMobile) && (
        <>
          <p style={{ margin: '3px 0' }}>Assigned to: {req.assignedName || 'N/A'}</p>
          <p style={{ margin: '3px 0' }}>Technician mobile: {req.assignedMobile || 'N/A'}</p>
        </>
      )}
      {includeComplaintPhoto && req.photo && (
        <div style={{ margin: '8px 0' }}>
          {renderPhoto('Complaint Photo', req.photo, `Complaint photo for ${req.requestId}`)}
        </div>
      )}
    </div>
  );

  const filteredRequests = filterCategory === 'All' ? requests : requests.filter(r => r.category === filterCategory);
  const completedJobs = requests.filter(r => r.status === 'Completed');
  const filteredCompletedJobs = completedFilterCategory === 'All' ? completedJobs : completedJobs.filter(r => r.category === completedFilterCategory);
  const newComplaintJobs = requests.filter(r => r.status === 'New');
  const requestStatusCounts = filteredRequests.reduce((counts, request) => {
    counts[request.status] = (counts[request.status] || 0) + 1;
    return counts;
  }, {});

  if (!isLoggedIn) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box', background: 'linear-gradient(rgba(15, 23, 42, 0.35), rgba(15, 23, 42, 0.35)), url("/school-background.jpg") center / cover no-repeat', fontFamily: 'Arial, sans-serif' }}>
        <section style={{ width: '100%', maxWidth: '460px', padding: '28px', boxSizing: 'border-box', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.95)', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
          <header style={{ marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
              <img src="/school-logo-left.png" alt="Logo Left" style={{ width: '45px', height: '45px', objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: '0 0 4px 0', color: '#1e40af', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Montessori Indus Residential School</h1>
                <p style={{ margin: 0, color: '#333', fontSize: '7px', fontWeight: 'bold' }}>Hostel 360 – Maintenance System</p>
              </div>
              <img src="/school-logo-right.jpg" alt="Logo Right" style={{ width: '45px', height: '45px', objectFit: 'contain', flexShrink: 0 }} />
            </div>
          </header>
          <form onSubmit={handleLoginSubmit}>
            <label htmlFor="login-username" style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '12px' }}>Username</label>
            <input id="login-username" name="username" type="text" autoComplete="username" required value={loginData.username} onChange={event => setLoginData({ ...loginData, username: event.target.value })} style={loginInputStyle} />
            <label htmlFor="login-password" style={{ display: 'block', margin: '14px 0 6px', fontWeight: 'bold', fontSize: '12px' }}>Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required value={loginData.password} onChange={event => setLoginData({ ...loginData, password: event.target.value })} style={loginInputStyle} />
            {loginError && <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c', fontSize: '13px', textAlign: 'center' }}>{loginError}</p>}
            <button type="submit" style={{ width: '100%', marginTop: '20px', padding: '12px', border: 0, borderRadius: '5px', background: '#1d4ed8', color: '#fff', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>Log in</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell" style={{ fontFamily: 'Arial, sans-serif', background: '#f4f6f9', minHeight: '100vh', width: '100%', maxWidth: '100vw', margin: 0, padding: 0, boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* Top Header Matching Reference Design */}
      <header className="app-header">
        <div className="app-header-content">
          <div className="app-header-side app-header-side-left">
            <img className="app-header-logo" src="/school-logo-left.png" alt="First Among Equals school logo" />
          </div>
          <div className="app-header-copy">
            <h2>Montessori Indus<br />Residential School</h2>
            <p>Hostel 360 – Maintenance Management System</p>
          </div>
          <div className="app-header-side app-header-side-right">
            <img className="app-header-logo" src="/school-logo-right.jpg" alt="Montessori Golden Jubilee logo" />
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="app-main" style={{ padding: '8px', width: '100%', maxWidth: '600px', boxSizing: 'border-box' }}>
        
        {/* ADMIN DASHBOARD HUB */}
        {activeTab === 'admin-dashboard' && userRole === 'admin' && (
          <div className="dashboard-overview">
            
            <img className="dashboard-footer-image" src="/dashboard-school.jpg" alt="Montessori Indus Residential School campus" />

            {/* Top Bar Info (Admin Panel & Live IST Clock) */}
            <div className="dashboard-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>👤</span> Admin Panel
              </div>
              {currentTime && (
                <div style={{ fontSize: '11px', color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🕒</span> IST: {currentTime}
                </div>
              )}
            </div>

            {/* 2-Column Grid Cards */}
            <div className="dashboard-grid">
              
              {/* Overview / Dashboard */}
              <button onClick={() => setActiveTab('dashboard')} className="dashboard-card dashboard-card-blue">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">📊</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">Overview</h4>
                    <p className="dashboard-card-subtitle">Dashboard</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

              {/* Report a Problem */}
              <button onClick={() => setActiveTab('report')} className="dashboard-card dashboard-card-green">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">➕</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">Report a Problem</h4>
                    <p className="dashboard-card-subtitle">New Complaint</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

              {/* New Complaints */}
              <button onClick={() => setActiveTab('new-complaint-view')} className="dashboard-card dashboard-card-amber">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">📥</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">New Complaints</h4>
                    <p className="dashboard-card-subtitle">Awaiting Action</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
                {stats.new > 0 && <span className="dashboard-badge">{stats.new}</span>}
              </button>

              {/* Work in Progress */}
              <button onClick={() => setActiveTab('electrician-in-progress')} className="dashboard-card dashboard-card-purple">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">🔧</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">Work in Progress</h4>
                    <p className="dashboard-card-subtitle">Active Work</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

              {/* Completed */}
              <button onClick={() => setActiveTab('completed-status')} className="dashboard-card dashboard-card-green">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">✅</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">Completed</h4>
                    <p className="dashboard-card-subtitle">Finished Work</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

              {/* All Requests */}
              <button onClick={() => setActiveTab('dashboard')} className="dashboard-card dashboard-card-cyan">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">📋</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title">All Requests</h4>
                    <p className="dashboard-card-subtitle">Complete History</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

              {/* Admin Settings (Full Width Span) */}
              <button onClick={() => setActiveTab('db-management')} className="dashboard-card dashboard-card-full dashboard-card-slate">
                <div className="dashboard-card-content">
                  <div className="dashboard-card-icon">⚙️</div>
                  <div className="dashboard-card-copy">
                    <h4 className="dashboard-card-title" style={{ margin: 0 }}>Admin Settings</h4>
                    <p className="dashboard-card-subtitle">Manage Staff, Categories & More</p>
                  </div>
                </div>
                <div className="dashboard-card-arrow">›</div>
              </button>

            </div>

            {/* Quick Stats Summary Bar */}
            <div className="dashboard-quick-stats">
              <div className="dashboard-quick-stats-title">
                📈 Quick Stats
              </div>
              <div className="quick-stats-row">
                <div className="quick-stat-box">
                  <div className="quick-stat-label"><span>📋</span> Total</div>
                  <div className="quick-stat-value">{requests.length}</div>
                </div>
                <div className="quick-stat-box">
                  <div className="quick-stat-label"><span>🕒</span> New</div>
                  <div className="quick-stat-value" style={{ color: '#d97706' }}>{stats.new}</div>
                </div>
                <div className="quick-stat-box">
                  <div className="quick-stat-label"><span>🔧</span> In Progress</div>
                  <div className="quick-stat-value" style={{ color: '#7c3aed' }}>{stats.inProgress}</div>
                </div>
                <div className="quick-stat-box">
                  <div className="quick-stat-label"><span>✅</span> Completed</div>
                  <div className="quick-stat-value" style={{ color: '#0f766e' }}>{completedJobs.length}</div>
                </div>
                <div className="quick-stat-box">
                  <div className="quick-stat-label"><span>⚠️</span> Urgent</div>
                  <div className="quick-stat-value" style={{ color: '#dc3545' }}>
                    {requests.filter(r => r.urgencyLevel === 'Urgent').length}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Banner */}
            <div className="dashboard-announcement">
              <div className="dashboard-announcement-copy">
                📢 Keep the hostel in good condition!<br />Report issues for quick resolution.
              </div>
              <img className="dashboard-announcement-logo" src="/maintenance-worker.jpg?v=2" alt="Maintenance worker" />
            </div>

            {/* Logout Button matching Reference Bottom Bar */}
            <div className="dashboard-logout">
              <button type="button" onClick={() => { setIsLoggedIn(false); setUserRole(''); setLoginData({ username: '', password: '' }); setActiveTab('admin-dashboard'); }}>
                Logout
              </button>
            </div>

          </div>
        )}

        {/* REPORT TAB */}
        {activeTab === 'report' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Report Issue</h3>
            <form onSubmit={handleReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div>
                <label style={{ fontWeight: 'bold' }}>Category</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={inputStyle}>
                  {['Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Urgency</label>
                <select value={formData.urgencyLevel} onChange={e => setFormData({...formData, urgencyLevel: e.target.value})} style={inputStyle}>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Name</label>
                <input type="text" value={formData.reportedByName} onChange={e => setFormData({...formData, reportedByName: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Mobile</label>
                <input type="tel" value={formData.reportedByMobile} onChange={e => setFormData({...formData, reportedByMobile: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Date & Time</label>
                <input type="datetime-local" value={formData.reportedAt} onChange={e => setFormData({...formData, reportedAt: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Location / Room</label>
                <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Description</label>
                <textarea value={formData.problemDescription} onChange={e => setFormData({...formData, problemDescription: e.target.value})} required style={{...inputStyle, height: '50px'}} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={event => setFormData(previous => ({
                    ...previous,
                    photo: event.target.files?.[0] || null
                  }))}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={startReportCamera}
                  style={{ width: '100%', padding: '9px', marginTop: '6px', background: '#198754', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Take Photo with Camera
                </button>
                <p style={{ margin: '4px 0 0', color: '#666', fontSize: '11px' }}>
                  Choose a photo above or use the camera button.
                  {formData.photo ? ` Selected: ${formData.photo.name}` : ''}
                </p>
                {cameraError && <p role="alert" style={{ margin: '4px 0 0', color: '#b02a37', fontSize: '11px' }}>{cameraError}</p>}
              </div>
              <button type="submit" style={{ padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '6px' }}>Submit</button>
            </form>
            {cameraStream && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Take complaint photo"
                style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.85)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '16px', boxSizing: 'border-box' }}
              >
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Live camera preview"
                  style={{ width: '100%', maxWidth: '640px', maxHeight: '70vh', objectFit: 'contain', background: '#111', borderRadius: '8px' }}
                />
                {cameraError && <p role="alert" style={{ color: 'white', textAlign: 'center' }}>{cameraError}</p>}
                <div role="group" aria-label="Choose camera" style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%', maxWidth: '640px' }}>
                  <button
                    type="button"
                    aria-pressed={cameraFacingMode === 'environment'}
                    onClick={() => switchReportCamera('environment')}
                    style={{ flex: 1, padding: '9px', background: cameraFacingMode === 'environment' ? '#0d6efd' : '#495057', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Back Camera
                  </button>
                  <button
                    type="button"
                    aria-pressed={cameraFacingMode === 'user'}
                    onClick={() => switchReportCamera('user')}
                    style={{ flex: 1, padding: '9px', background: cameraFacingMode === 'user' ? '#0d6efd' : '#495057', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Front Camera
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', width: '100%', maxWidth: '640px' }}>
                  <button
                    type="button"
                    onClick={captureReportPhoto}
                    style={{ flex: 1, padding: '12px', background: '#198754', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={closeReportCamera}
                    style={{ flex: 1, padding: '12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* NEW COMPLAINTS TAB */}
        {activeTab === 'new-complaint-view' && (
          <div>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>New Complaints</h3>
            {newComplaintJobs.length === 0 ? <p style={{ fontSize: '12px' }}>No new complaints.</p> : newComplaintJobs.map(req => {
              const tech = selectedTechs[req._id] || { name: '', mobile: '' };
              return (
                <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <strong>{req.requestId} - {req.category}</strong>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>
                  {renderRequestDetails(req)}
                  <input type="text" placeholder="Tech Name" value={tech.name} onChange={e => setSelectedTechs({...selectedTechs, [req._id]: { ...tech, name: e.target.value }})} style={{...inputStyle, margin: '4px 0'}} />
                  <input type="tel" placeholder="Tech Mobile" value={tech.mobile} onChange={e => setSelectedTechs({...selectedTechs, [req._id]: { ...tech, mobile: e.target.value }})} style={{...inputStyle, marginBottom: '6px'}} />
                  <button onClick={() => updateStatus(req._id, 'Accepted', false, tech.name, tech.mobile)} style={{ width: '100%', padding: '8px', background: '#198754', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Accept</button>
                </div>
              );
            })}
          </div>
        )}

        {/* REQUESTS LIST TAB (All Requests) */}
        {activeTab === 'dashboard' && (
          <div>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>
              All Requests ({filteredRequests.length})
            </h3>
            
            <div className="completed-category-filter">
              <label htmlFor="all-requests-category-filter-select">Filter by category</label>
              <select
                id="all-requests-category-filter-select"
                value={filterCategory}
                onChange={event => setFilterCategory(event.target.value)}
              >
                {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(cat => (
                  <option key={cat} value={cat}>{cat === 'All' ? 'All categories' : cat}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '10px' }}>
              {[
                ['New', '#fff3cd', '#664d03'],
                ['Accepted', '#cfe2ff', '#084298'],
                ['Work in Progress', '#e2f0d9', '#276749'],
                ['Completed', '#d1e7dd', '#0f5132']
              ].map(([status, background, color]) => (
                <div key={status} style={{ background, color, padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{status.toUpperCase()}</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{requestStatusCounts[status] || 0}</div>
                </div>
              ))}
            </div>
            {filteredRequests.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No requests found.</p>
            ) : filteredRequests.map(req => (
              <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getUrgencyBadge(req.urgencyLevel)}
                    <b>{req.status}</b>
                  </span>
                </div>
                {renderRequestDetails(req)}
              </div>
            ))}
          </div>
        )}

        {/* WORK IN PROGRESS TAB */}
        {activeTab === 'electrician-in-progress' && (
          <div>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Work in Progress</h3>
            {requests.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No complaints found.</p>
            ) : requests.map(req => {
              const hasCompletedPhoto = Boolean(completionData[req._id]?.completionPhoto);
              const hasCompletionVideo = Boolean(completionData[req._id]?.completionVideo);
              return (
                <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{req.requestId} - {req.category}</strong>
                    <span style={{ color: req.status === 'Completed' ? '#198754' : '#b02a37' }}>
                      <b>{req.status === 'Completed' ? 'Completed' : req.status}</b>
                    </span>
                  </div>
                  <p style={{ margin: '3px 0' }}>Reported by: {req.reportedByName || 'N/A'}</p>
                  <p style={{ margin: '3px 0' }}>Taken by: {req.assignedName || 'Not assigned'}</p>
                  {req.photo && (
                    <div style={{ margin: '8px 0' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Complaint Photo</div>
                      <a href={getPhotoUrl(req.photo)} target="_blank" rel="noreferrer">
                        <img src={getPhotoUrl(req.photo)} alt={`Complaint photo for ${req.requestId}`} style={{ display: 'block', width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '4px', background: '#f4f6f9' }} />
                      </a>
                    </div>
                  )}
                  {req.status === 'Accepted' && (
                    <button onClick={() => updateStatus(req._id, 'In Progress')} style={{ width: '100%', padding: '6px', background: '#0dcaf0', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '6px', cursor: 'pointer' }}>Start</button>
                  )}
                  {req.status === 'In Progress' && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                      <label htmlFor={`completion-photo-${req._id}`} style={{ display: 'block', fontWeight: 'bold', marginTop: '4px' }}>
                        Upload completed work photo (Required):
                      </label>
                      <input
                        id={`completion-photo-${req._id}`}
                        type="file"
                        accept="image/*"
                        onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), completionPhoto: e.target.files[0] }})}
                        style={{...inputStyle, margin: '4px 0'}}
                      />
                      {hasCompletedPhoto && (
                        <p style={{ margin: '2px 0 6px', color: '#198754', fontSize: '11px', fontWeight: 'bold' }}>
                          ✓ Completed photo attached: {completionData[req._id].completionPhoto.name}
                        </p>
                      )}
                      <label htmlFor={`completion-video-${req._id}`} style={{ display: 'block', fontWeight: 'bold', marginTop: '4px' }}>
                        Upload completion video (Required):
                      </label>
                      <input
                        id={`completion-video-${req._id}`}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={e => {
                          const video = e.target.files?.[0];
                          if (video && video.size > 20 * 1024 * 1024) {
                            e.target.value = '';
                            setCompletionData(previous => ({
                              ...previous,
                              [req._id]: { ...(previous[req._id] || {}), completionVideo: null }
                            }));
                            window.alert('Completion video must be 20 MB or smaller.');
                            return;
                          }

                          setCompletionData(previous => ({
                            ...previous,
                            [req._id]: { ...(previous[req._id] || {}), completionVideo: video || null }
                          }));
                        }}
                        style={{...inputStyle, margin: '4px 0'}}
                      />
                      <p style={{ margin: '0 0 6px', color: '#666', fontSize: '11px' }}>Maximum video size: 20 MB.</p>
                      {hasCompletionVideo && (
                        <p style={{ margin: '2px 0 6px', color: '#198754', fontSize: '11px', fontWeight: 'bold' }}>
                          Completion video attached: {completionData[req._id].completionVideo.name}
                        </p>
                      )}
                      <input type="text" placeholder="Remarks" onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), remarks: e.target.value }})} style={{...inputStyle, marginBottom: '6px'}} />
                      <button
                        onClick={() => updateStatus(req._id, 'Completed', true)}
                        disabled={!hasCompletedPhoto || !hasCompletionVideo || Boolean(updatingRequests[req._id])}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: hasCompletedPhoto && hasCompletionVideo && !updatingRequests[req._id] ? '#198754' : '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          cursor: hasCompletedPhoto && hasCompletionVideo && !updatingRequests[req._id] ? 'pointer' : 'not-allowed',
                          opacity: hasCompletedPhoto && hasCompletionVideo && !updatingRequests[req._id] ? 1 : 0.65
                        }}
                      >
                        {updatingRequests[req._id]
                          ? 'Saving photo, video, and completion...'
                          : hasCompletedPhoto && hasCompletionVideo
                            ? 'Mark Done'
                            : 'Upload Photo and Video to Enable'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed-status' && (
          <div>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Completed Jobs ({filteredCompletedJobs.length})</h3>
            
            <div className="completed-category-filter">
              <label htmlFor="completed-category-filter-select">Filter completed by category</label>
              <select id="completed-category-filter-select" value={completedFilterCategory} onChange={event => setCompletedFilterCategory(event.target.value)}>
                {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(cat => (
                  <option key={cat} value={cat}>{cat === 'All' ? 'All categories' : cat}</option>
                ))}
              </select>
            </div>

            {filteredCompletedJobs.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No completed complaints found for this category.</p>
            ) : filteredCompletedJobs.map(req => (
              <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <b style={{ color: '#198754' }}>Completed</b>
                </div>
                {renderRequestDetails(req, false)}
                <p style={{ margin: '3px 0' }}>Completed by: {req.assignedName || 'N/A'}</p>
                <p style={{ margin: '3px 0' }}>Completer mobile: {req.assignedMobile || 'N/A'}</p>
                <p style={{ margin: '3px 0' }}>Completed at: {formatDMYDate(req.completedAt)}</p>
                {req.remarks && <p style={{ margin: '3px 0' }}>Completion remarks: {req.remarks}</p>}
                
                <div className="completed-photo-grid" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {renderPhoto('Complaint Photo', req.photo, `Complaint photo for ${req.requestId}`)}
                  {renderPhoto('Completed Photo', req.completionPhoto, `Completed work for ${req.requestId}`)}
                </div>
                <section aria-label={`Videos for ${req.requestId}`} style={{ marginTop: '12px' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px' }}>Videos</h4>
                  {req.completionVideo || req.progressVideo || req.video ? (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {renderVideo('Completion Video', req.completionVideo, `Completion video for ${req.requestId}`)}
                      {renderVideo('Work in Progress Video', req.progressVideo, `Work in progress video for ${req.requestId}`)}
                      {renderVideo('Request Video', req.video, `Request video for ${req.requestId}`)}
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: '#666' }}>No video is attached to this completed request.</p>
                  )}
                </section>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'db-management' && userRole === 'admin' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
            <button onClick={() => setActiveTab('admin-dashboard')} className="dashboard-back-button">← Back to Dashboard</button>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Settings</h3>
            <p>Requests: <b>{dbStats.requests}</b></p>
            <section aria-labelledby="delete-completed-heading" style={{ marginTop: '16px', padding: '10px', border: '1px solid #f1aeb5', borderRadius: '6px' }}>
              <h4 id="delete-completed-heading" style={{ margin: '0 0 8px', fontSize: '13px' }}>Delete Completed Complaints</h4>
              <label htmlFor="delete-completed-category" style={{ display: 'block', marginBottom: '4px' }}>Filter completed complaints</label>
              <select
                id="delete-completed-category"
                value={completedDeleteCategory}
                onChange={event => setCompletedDeleteCategory(event.target.value)}
                style={inputStyle}
              >
                <option value="Completed">Completed (all categories)</option>
                {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(category => (
                  <option key={category} value={category}>{category === 'All' ? 'All categories' : category}</option>
                ))}
              </select>
              <p style={{ margin: '6px 0', color: '#555' }}>
                {requests.filter(request =>
                  request.status === 'Completed' &&
                  (completedDeleteCategory === 'All' ||
                    completedDeleteCategory === 'Completed' ||
                    request.category === completedDeleteCategory)
                ).length} completed complaint(s) match this category.
              </p>
              <button
                onClick={handleDeleteCompletedRequests}
                disabled={isDeletingCompleted}
                style={{ width: '100%', padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '4px', opacity: isDeletingCompleted ? 0.7 : 1 }}
              >
                {isDeletingCompleted ? 'Deleting...' : 'Delete Completed Complaints'}
              </button>
            </section>
            <button onClick={handleClearDatabase} style={{ width: '100%', padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '10px' }}>Clear Database</button>
          </div>
        )}

        {/* SUCCESS SCREEN */}
        {activeTab === 'success-screen' && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
            <h3 style={{ color: '#198754', margin: '0 0 10px 0', fontSize: '16px' }}>Successfully Submitted!</h3>
            <button onClick={() => setActiveTab(userRole === 'admin' ? 'admin-dashboard' : 'report')} style={{ width: '100%', padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Continue</button>
          </div>
        )}

      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px',
  marginTop: '3px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  fontSize: '12px'
};

const loginInputStyle = {
  width: '100%',
  padding: '11px',
  boxSizing: 'border-box',
  border: '1px solid #b8c1cc',
  borderRadius: '5px',
  fontSize: '16px'
};

export default App;