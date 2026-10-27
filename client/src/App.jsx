import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://indus-school-hostel.onrender.com').replace(/\/+$/, '');
const PUBLIC_ASSET_BASE = import.meta.env.BASE_URL;

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

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(''); // 'admin' or 'user'
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('admin-dashboard');
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ new: 0, accepted: 0, inProgress: 0, completed: 0 });
  const [team, setTeam] = useState([]);
  const [filterCategory, setFilterCategory] = useState('All');
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
  const [selectedTechs, setSelectedTechs] = useState({});
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [teamForm, setTeamForm] = useState({
    category: 'Electrical',
    personName: '',
    mobileNumber: '',
    active: true
  });

  const [dbStats, setDbStats] = useState({ requests: 0, teamMembers: 0 });
  const [pushStatus, setPushStatus] = useState('');
  const [isEnablingPush, setIsEnablingPush] = useState(false);

  const fetchData = async () => {
    try {
      const [requestsRes, teamRes, dbRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/requests`),
        fetch(`${API_BASE_URL}/api/team`),
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

      const teamResult = teamRes ? await teamRes.json() : null;
      if (teamResult?.success) setTeam(teamResult.data);

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
      setActiveTab('report'); // Default staff to Report a Problem since dashboard is hidden
      setLoginError('');
    } else {
      setLoginError('Incorrect username or password. Please try again.');
    }
  };

  const handleEnableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('Notifications are blocked for this site. Allow them in your browser site settings, then reload and try again.');
      return;
    }

    setIsEnablingPush(true);
    setPushStatus('');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(
          permission === 'denied'
            ? 'Notifications were blocked. Allow them in your browser site settings, then reload and try again.'
            : 'Allow notifications when your browser asks to receive complaint alerts.'
        );
        return;
      }

      const keyResponse = await fetch(`${API_BASE_URL}/api/push/public-key`);
      const keyResult = await keyResponse.json();
      if (!keyResponse.ok || !keyResult.success) {
        throw new Error(keyResult.error || 'Could not load notification settings.');
      }

      await navigator.serviceWorker.register('/service-worker.js');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = urlBase64ToUint8Array(keyResult.publicKey);
      if (subscription && !areKeysEqual(subscription.options.applicationServerKey, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const subscribeResponse = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });
      const subscribeResult = await subscribeResponse.json();
      if (!subscribeResponse.ok || !subscribeResult.success) {
        throw new Error(subscribeResult.error || 'Could not save this device for notifications.');
      }

      setPushStatus('Notifications enabled on this device.');
    } catch (err) {
      console.error('Unable to enable notifications:', err);
      setPushStatus(err.message || 'Could not enable notifications on this device.');
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
      const res = await fetch(`${API_BASE_URL}/api/requests`, {
        method: 'POST',
        body: data
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
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

  const updateStatus = async (id, status, isCompletion = false, assignedName = null, assignedMobile = null) => {
    const data = new FormData();
    data.append('status', status);
    if (assignedName) data.append('assignedName', assignedName);
    if (assignedMobile) data.append('assignedMobile', assignedMobile);

    if (isCompletion) {
      const itemComp = completionData[id] || {};
      if (!itemComp.completionPhoto) {
        window.alert('Please upload a photo of the completed work before marking this complaint as done.');
        return;
      }
      if (itemComp.remarks) data.append('remarks', itemComp.remarks);
      data.append('completionPhoto', itemComp.completionPhoto);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/${id}`, {
        method: 'PATCH',
        body: data
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        window.alert(result.error || 'Could not update the request.');
        return;
      }

      await fetchData();
    } catch (err) {
      console.error('Update status error:', err);
    }
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    const method = editingMemberId ? 'PATCH' : 'POST';
    const url = editingMemberId 
      ? `${API_BASE_URL}/api/team/${editingMemberId}`
      : `${API_BASE_URL}/api/team`;

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamForm)
      });
      const result = await res.json();
      if (result.success) {
        setEditingMemberId(null);
        setTeamForm({ category: 'Electrical', personName: '', mobileNumber: '', active: true });
        await fetchData();
        setActiveTab('team-directory-screen9');
      }
    } catch (err) {
      console.error('Error saving team member:', err);
    }
  };

  const handleDeleteMember = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/team/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      console.error('Error deleting team member:', err);
    }
  };

  const handleDeleteRequests = async (status) => {
    const isAll = status === 'All';
    const description = isAll ? 'ALL requests' : `all ${status} requests`;
    if (!window.confirm(`WARNING: This will permanently delete ${description}. This cannot be undone.`)) return;

    try {
      const url = isAll
        ? `${API_BASE_URL}/api/requests/clear-requests`
        : `${API_BASE_URL}/api/requests/status/${encodeURIComponent(status)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || `Could not delete ${description}.`);
      }

      window.alert(result.message || `${description} deleted successfully.`);
      await fetchData();
    } catch (err) {
      console.error(`Error deleting ${description}:`, err);
      window.alert(err.message || `Could not delete ${description}.`);
    }
  };

  const getUrgencyBadge = (level) => {
    let bg = '#6c757d';
    if (level === 'Urgent') bg = '#dc3545';
    else if (level === 'High') bg = '#fd7e14';
    else if (level === 'Medium') bg = '#ffc107';

    return (
      <span style={{ padding: '2px 6px', borderRadius: '4px', background: bg, color: level === 'Medium' ? '#000' : '#fff', fontSize: '10px', fontWeight: 'bold' }}>
        {level || 'Medium'}
      </span>
    );
  };

  const renderPhoto = (label, photo, alt, showLabel = true) => {
    const photoUrl = getPhotoUrl(photo);
    return (
      <div style={{ minWidth: 0, width: 'fit-content', maxWidth: '320px' }}>
        {showLabel && <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{label}</div>}
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer">
            <img
              src={photoUrl}
              alt={alt}
              style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }}
            />
          </a>
        ) : (
          <span style={{ color: '#666' }}>
            Photo not available
          </span>
        )}
      </div>
    );
  };

  const renderRequestDetails = (req, includeComplaintPhoto = true) => {
    return (
      <div>
        <p style={{ margin: '3px 0' }}>Loc: {req.location}</p>
        <p style={{ margin: '3px 0' }}>Problem: {req.problemDescription}</p>
        <p style={{ margin: '3px 0' }}>Reported by: {req.reportedByName || 'N/A'}</p>
        <p style={{ margin: '3px 0' }}>Mobile: {req.reportedByMobile || 'N/A'}</p>
        <p style={{ margin: '3px 0' }}>
          Reported at: {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}
        </p>
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
  };

  const filteredRequests = filterCategory === 'All' 
    ? requests 
    : requests.filter(r => r.category === filterCategory);

  const newComplaintJobs = requests.filter(r => r.status === 'New');
  const acceptedJobs = requests.filter(r => r.status === 'Accepted');
  const inProgressJobs = requests.filter(r => r.status === 'In Progress');
  const completedJobs = requests.filter(r => r.status === 'Completed');
  const requestStatusCounts = filteredRequests.reduce((counts, request) => {
    counts[request.status] = (counts[request.status] || 0) + 1;
    return counts;
  }, {});
  const getPhotoUrl = (photo) => (
    photo ? (photo.startsWith('http') ? photo : `${API_BASE_URL}${photo}`) : null
  );

  if (!isLoggedIn) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          boxSizing: 'border-box',
          background: `linear-gradient(rgba(15, 23, 42, 0.35), rgba(15, 23, 42, 0.35)), url("${PUBLIC_ASSET_BASE}school-background.png") center / cover no-repeat`,
          fontFamily: 'Arial, sans-serif'
        }}
      >
        <section
          style={{
            width: '100%',
            maxWidth: '460px',
            padding: '28px',
            boxSizing: 'border-box',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.95)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
          }}
        >
          <header style={{ marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'clamp(28px, 10vw, 45px) minmax(0, 1fr) clamp(28px, 10vw, 45px)', alignItems: 'center', gap: '8px', marginBottom: '0' }}>
              <img src={`${PUBLIC_ASSET_BASE}school-logo-left.png`} alt="Logo Left" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain' }} />
              <h1 style={{ margin: 0, color: '#1e40af', fontSize: 'clamp(7px, 2.8vw, 14px)', fontWeight: 'bold', whiteSpace: 'nowrap', textAlign: 'center' }}>
                Montessori Indus Residential School
              </h1>
              <img src={`${PUBLIC_ASSET_BASE}school-logo-right.jpg`} alt="Logo Right" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain' }} />
            </div>
            <p style={{ margin: '0 0 12px', color: '#333', fontSize: '7px', fontWeight: 'bold', lineHeight: 1 }}>
              Hostel 360 – Maintenance System
            </p>
          </header>

          <form onSubmit={handleLoginSubmit}>
            <label htmlFor="login-username" style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '12px' }}>
              Username
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={loginData.username}
              onChange={event => setLoginData({ ...loginData, username: event.target.value })}
              style={loginInputStyle}
            />

            <label htmlFor="login-password" style={{ display: 'block', margin: '14px 0 6px', fontWeight: 'bold', fontSize: '12px' }}>
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={loginData.password}
              onChange={event => setLoginData({ ...loginData, password: event.target.value })}
              style={loginInputStyle}
            />

            {loginError && (
              <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c', fontSize: '13px', textAlign: 'center' }}>
                {loginError}
              </p>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '12px',
                border: 0,
                borderRadius: '5px',
                background: '#1d4ed8',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Log in
            </button>
          </form>

        </section>
      </main>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#f1f5f9', minHeight: '100vh', width: '100%', maxWidth: '100vw', margin: 0, padding: 0, boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* Header with School Name */}
      <header className="app-header" style={{ background: '#12304a', color: 'white', padding: '12px', width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
        <div className="school-branding">
          <h2 className="school-name">Montessori Indus Residential School</h2>
          <h3 className="school-caption">
            Hostel 360 – Maintenance System
          </h3>
        </div>
        
        {/* Navigation Tabs Bar (Role Filtered) */}
        <nav className="app-nav-tabs" aria-label="Main navigation">
          <div className="app-nav-row app-nav-row-primary">
            {userRole === 'admin' && (
              <button onClick={() => setActiveTab('admin-dashboard')} style={navTabStyle(activeTab === 'admin-dashboard')}>Dashboard</button>
            )}
            <button onClick={() => setActiveTab('report')} style={navTabStyle(activeTab === 'report')}>Report a Problem</button>
            <button onClick={() => setActiveTab('new-complaint-view')} style={navTabStyle(activeTab === 'new-complaint-view')}>New Complaints</button>
            <button onClick={() => setActiveTab('dashboard')} style={navTabStyle(activeTab === 'dashboard')}>All Requests</button>
            <button onClick={() => setActiveTab('electrician-in-progress')} style={navTabStyle(activeTab === 'electrician-in-progress')}>In Progress</button>
            <button onClick={() => setActiveTab('electrician-completion')} style={navTabStyle(activeTab === 'electrician-completion')}>Complete Work</button>
            <button onClick={() => setActiveTab('completed-status')} style={navTabStyle(activeTab === 'completed-status')}>Completed</button>
          </div>
          <div className="app-nav-row app-nav-row-secondary">
            <button onClick={() => setActiveTab('team-directory-screen9')} style={navTabStyle(activeTab === 'team-directory-screen9')}>Maintenance Team</button>
            {userRole === 'admin' && (
              <button onClick={() => setActiveTab('db-management')} style={navTabStyle(activeTab === 'db-management')}>Admin Settings</button>
            )}
          </div>
        </nav>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={() => {
              setIsLoggedIn(false);
              setUserRole('');
              setLoginData({ username: '', password: '' });
              setActiveTab('admin-dashboard');
            }}
            style={{ padding: '6px 10px', border: 0, borderRadius: '4px', background: '#dc3545', color: 'white', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Log out
          </button>
          <button
            type="button"
            onClick={handleEnableNotifications}
            disabled={isEnablingPush}
            style={{ padding: '6px 10px', border: '1px solid white', borderRadius: '4px', background: 'white', color: '#084298', fontSize: '11px', fontWeight: 'bold', cursor: isEnablingPush ? 'wait' : 'pointer' }}
          >
            {isEnablingPush ? 'Enabling...' : 'Enable notifications'}
          </button>
          {pushStatus && <span role="status" style={{ fontSize: '11px', color: 'white' }}>{pushStatus}</span>}
        </div>
      </header>

      {/* Main Content Body */}
      <div className="app-main" style={{ padding: '10px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        
        {/* DASHBOARD TAB (Admin Only) */}
        {activeTab === 'admin-dashboard' && userRole === 'admin' && (
          <div className="dashboard-overview">
            <h3 className="dashboard-title" style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Dashboard</h3>
            
            <div className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
              <div className="dashboard-stat-card dashboard-stat-new" onClick={() => setActiveTab('new-complaint-view')} style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>NEW</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.new}</div>
              </div>
              <div className="dashboard-stat-card dashboard-stat-accepted" onClick={() => setActiveTab('dashboard')} style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>ACCEPTED</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.accepted}</div>
              </div>
              <div className="dashboard-stat-card dashboard-stat-progress" onClick={() => setActiveTab('electrician-in-progress')} style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>IN PROGRESS</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.inProgress}</div>
              </div>
              <div className="dashboard-stat-card dashboard-stat-completed" onClick={() => setActiveTab('completed-status')} style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>COMPLETED</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{completedJobs.length}</div>
              </div>
            </div>

            <h4 className="dashboard-section-title" style={{ fontSize: '13px', margin: '10px 0 5px 0' }}>Filter Category</h4>
            <div className="dashboard-category-filters" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(cat => (
                <button key={cat} className={filterCategory === cat ? 'dashboard-filter-active' : ''} onClick={() => setFilterCategory(cat)} style={{ padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}>
                  {cat}
                </button>
              ))}
            </div>

            <section className="dashboard-request-summary">
              <h4 className="dashboard-section-title" style={{ fontSize: '13px', margin: '10px 0 5px 0' }}>Requests</h4>
              {filteredRequests.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#666' }}>No requests found.</p>
              ) : (
                filteredRequests.map(req => (
                  <div key={req._id} className="dashboard-request-card" style={{ padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '12px' }}>{req.requestId} - {req.category}</strong>
                      {getUrgencyBadge(req.urgencyLevel)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                      <p style={{ margin: '3px 0' }}>Status: {req.status}</p>
                      {renderRequestDetails(req)}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        )}

        {/* REPORT TAB */}
        {activeTab === 'report' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}>
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
                <input type="file" accept="image/*" onChange={e => setFormData({...formData, photo: e.target.files[0]})} style={inputStyle} />
              </div>
              <button type="submit" style={{ padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '6px' }}>Submit</button>
            </form>
          </div>
        )}

        {/* NEW COMPLAINTS TAB */}
        {activeTab === 'new-complaint-view' && (
          <div>
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

        {/* REQUESTS LIST TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>
              All Requests ({filteredRequests.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '10px' }}>
              {[
                ['New', '#fff3cd', '#664d03'],
                ['Accepted', '#cfe2ff', '#084298'],
                ['In Progress', '#e2f0d9', '#276749'],
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

        {/* IN PROGRESS TAB */}
        {activeTab === 'electrician-in-progress' && (
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Complaint Progress</h3>
            {requests.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No complaints found.</p>
            ) : requests.map(req => (
              <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <span style={{ color: req.status === 'Completed' ? '#198754' : '#b02a37' }}>
                    <b>{req.status === 'Completed' ? 'Completed' : 'Not completed'}</b>
                  </span>
                </div>
                <p style={{ margin: '3px 0' }}>Reported by: {req.reportedByName || 'N/A'}</p>
                <p style={{ margin: '3px 0' }}>Taken by: {req.assignedName || 'Not assigned'}</p>
                {req.photo && (
                  <div style={{ margin: '8px 0' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Complaint Photo</div>
                    <a
                      href={req.photo.startsWith('http') ? req.photo : `${API_BASE_URL}${req.photo}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={req.photo.startsWith('http') ? req.photo : `${API_BASE_URL}${req.photo}`}
                        alt={`Complaint photo for ${req.requestId}`}
                        style={{ display: 'block', width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '4px', background: '#f4f6f9' }}
                      />
                    </a>
                  </div>
                )}
                {req.status === 'Accepted' && (
                  <button onClick={() => updateStatus(req._id, 'In Progress')} style={{ width: '100%', padding: '6px', background: '#0dcaf0', border: 'none', borderRadius: '4px', fontWeight: 'bold', marginTop: '6px' }}>Start</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* COMPLETION TAB */}
        {activeTab === 'electrician-completion' && (
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Complete Complaints</h3>
            {inProgressJobs.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No complaints are currently in progress.</p>
            ) : inProgressJobs.map(req => (
              <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                <strong>{req.requestId} - {req.category}</strong>
                {renderRequestDetails(req)}
                <label htmlFor={`completion-photo-${req._id}`} style={{ display: 'block', fontWeight: 'bold', marginTop: '8px' }}>
                  Upload photo of completed work (required)
                </label>
                <input
                  id={`completion-photo-${req._id}`}
                  type="file"
                  accept="image/*"
                  onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), completionPhoto: e.target.files[0] }})}
                  style={{...inputStyle, margin: '4px 0'}}
                />
                {completionData[req._id]?.completionPhoto && (
                  <p style={{ margin: '0 0 6px', color: '#198754' }}>
                    Selected: {completionData[req._id].completionPhoto.name}
                  </p>
                )}
                <input type="text" placeholder="Remarks" onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), remarks: e.target.value }})} style={{...inputStyle, marginBottom: '6px'}} />
                <button
                  onClick={() => updateStatus(req._id, 'Completed', true)}
                  disabled={!completionData[req._id]?.completionPhoto}
                  style={{ width: '100%', padding: '8px', background: completionData[req._id]?.completionPhoto ? '#198754' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: completionData[req._id]?.completionPhoto ? 'pointer' : 'not-allowed' }}
                >
                  Mark Done
                </button>
              </div>
            ))}
          </div>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed-status' && (
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Completed Jobs</h3>
            {completedJobs.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#666' }}>No completed complaints.</p>
            ) : completedJobs.map(req => (
              <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <b style={{ color: '#198754' }}>Completed</b>
                </div>
                {renderRequestDetails(req, false)}
                <p style={{ margin: '3px 0' }}>Completed by: {req.assignedName || 'N/A'}</p>
                <p style={{ margin: '3px 0' }}>Completer mobile: {req.assignedMobile || 'N/A'}</p>
                <p style={{ margin: '3px 0' }}>
                  Completed at: {req.completedAt ? new Date(req.completedAt).toLocaleString() : 'N/A'}
                </p>
                {req.remarks && <p style={{ margin: '3px 0' }}>Completion remarks: {req.remarks}</p>}
                <div className="completed-photo-grid">
                  {renderPhoto('Complaint Photo', req.photo, `Complaint photo for ${req.requestId}`)}
                  {renderPhoto('Completed Photo', req.completionPhoto, `Completed work for ${req.requestId}`)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TEAM DIRECTORY TAB */}
        {activeTab === 'team-directory-screen9' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Team</h3>
              <button onClick={() => setActiveTab('admin-panel-screen10')} style={{ padding: '4px 8px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>+ Add</button>
            </div>
            {team.map(m => (
              <div key={m._id} style={{ background: 'white', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', fontSize: '12px', alignItems: 'center' }}>
                <div><b>{m.personName}</b> ({m.category})<br/>{m.mobileNumber}</div>
                <button onClick={() => handleDeleteMember(m._id)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '4px 6px', borderRadius: '4px', fontSize: '10px' }}>Del</button>
              </div>
            ))}
          </div>
        )}

        {/* ADD TEAM MEMBER TAB */}
        {activeTab === 'admin-panel-screen10' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Add Team Member</h3>
            <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <select value={teamForm.category} onChange={e => setTeamForm({...teamForm, category: e.target.value})} style={inputStyle}>
                {['Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="text" placeholder="Name" value={teamForm.personName} onChange={e => setTeamForm({...teamForm, personName: e.target.value})} required style={inputStyle} />
              <input type="tel" placeholder="Mobile" value={teamForm.mobileNumber} onChange={e => setTeamForm({...teamForm, mobileNumber: e.target.value})} required style={inputStyle} />
              <button type="submit" style={{ padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Save</button>
            </form>
          </div>
        )}

        {/* SETTINGS TAB (Admin Only) */}
        {activeTab === 'db-management' && userRole === 'admin' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '12px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Settings</h3>
            <p>Requests: <b>{dbStats.requests}</b> | Team: <b>{dbStats.teamMembers}</b></p>
            <h4 style={{ margin: '16px 0 8px', fontSize: '13px' }}>Delete Requests</h4>
            <p style={{ margin: '0 0 8px', color: '#475569' }}>Permanently delete requests by status. This action cannot be undone.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              {['Completed', 'In Progress', 'Accepted', 'All'].map(status => (
                <button
                  key={status}
                  onClick={() => handleDeleteRequests(status)}
                  style={{ padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Delete {status}
                </button>
              ))}
            </div>
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

const navTabStyle = (active) => ({
  background: active ? '#0f9488' : '#334e68',
  color: 'white',
  border: 'none',
  padding: '9px 10px',
  minHeight: '40px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontWeight: 'bold'
});

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