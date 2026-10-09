import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const decodeVapidKey = (key) => {
  const padding = '='.repeat((4 - key.length % 4) % 4);
  const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(base64), character => character.charCodeAt(0));
};

function App() {
  const [activeTab, setActiveTab] = useState('admin-dashboard');
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ new: 0, accepted: 0, inProgress: 0, completed: 0 });
  const [team, setTeam] = useState([]);
  const [filterCategory, setFilterCategory] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const knownRequestIds = useRef(null);
  
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [reportSubmitError, setReportSubmitError] = useState('');

  const [formData, setFormData] = useState({
    category: 'Electrical',
    location: '',
    problemDescription: '',
    reportedByName: '',
    reportedByMobile: '',
    reportedAt: '',
    urgencyLevel: '',
    photo: null
  });

  const [completionData, setCompletionData] = useState({});
  const [selectedTechs, setSelectedTechs] = useState({});

  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [teamForm, setTeamForm] = useState({
    category: 'Electrical',
    personName: '',
    mobileNumber: '',
    active: true
  });

  const [dbStats, setDbStats] = useState({ requests: 0, teamMembers: 0 });
  const [deleteStatus, setDeleteStatus] = useState('Completed');

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests`);
      const result = await res.json();
      if (result.success) {
        const requestIds = new Set(result.data.map(request => request._id));
        if (knownRequestIds.current) {
          const newRequests = result.data.filter(request => !knownRequestIds.current.has(request._id));
          if (newRequests.length > 0) {
            setNotifications(current => [
              ...newRequests.map(request => ({
                id: request._id,
                requestId: request.requestId,
                category: request.category,
                location: request.location,
                read: false
              })),
              ...current
            ].slice(0, 20));
          }
        }
        knownRequestIds.current = requestIds;
        setRequests(result.data);
        setStats(result.stats);
        setSubmittedRequest(current => current || result.data[0] || null);
      }

      const teamRes = await fetch(`${API_BASE_URL}/api/team`);
      const teamResult = await teamRes.json();
      if (teamResult.success) {
        setTeam(teamResult.data);
      }

      const dbRes = await fetch(`${API_BASE_URL}/api/db/stats`).catch(() => null);
      if (dbRes) {
        const dbResult = await dbRes.json();
        if (dbResult.success) setDbStats(dbResult.stats);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => registration.pushManager.getSubscription())
        .then(subscription => setPushEnabled(Boolean(subscription)))
        .catch(err => console.error('Push service worker registration failed:', err));
    }

    fetchData();
    const intervalId = window.setInterval(fetchData, 10000);
    return () => window.clearInterval(intervalId);
  }, []);

  const enablePushNotifications = async () => {
    setPushMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('This browser does not support push notifications.');
      }
      if (!window.isSecureContext) {
        throw new Error('Phone push notifications require the app to be served over HTTPS.');
      }

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
      }

      const keyResponse = await fetch(`${API_BASE_URL}/api/push/public-key`);
      const keyResult = await keyResponse.json();
      if (!keyResponse.ok || !keyResult.success) {
        throw new Error(keyResult.error || 'Push notifications are not configured on the server.');
      }

      const registration = await navigator.serviceWorker.register('/service-worker.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(keyResult.publicKey)
      });
      const subscribeResponse = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      const subscribeResult = await subscribeResponse.json();
      if (!subscribeResponse.ok || !subscribeResult.success) {
        throw new Error(subscribeResult.error || 'Unable to register this phone for notifications.');
      }

      setPushEnabled(true);
      setPushMessage('This device will receive new complaint alerts.');
    } catch (err) {
      console.error('Unable to enable push notifications:', err);
      setPushMessage(err.message || 'Unable to enable push notifications.');
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setReportSubmitError('');

    const urgencyLevel = new FormData(e.currentTarget).get('urgencyLevel');
    if (typeof urgencyLevel !== 'string' || !urgencyLevel) {
      setReportSubmitError('Please select an urgency level.');
      return;
    }
    
    const data = new FormData();
    data.append('category', formData.category);
    data.append('location', formData.location);
    data.append('problemDescription', formData.problemDescription);
    data.append('reportedByName', formData.reportedByName);
    data.append('reportedByMobile', formData.reportedByMobile);
    data.append('reportedAt', formData.reportedAt);
    data.append('urgencyLevel', urgencyLevel);
    if (formData.photo) {
      data.append('photo', formData.photo);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/requests`, {
        method: 'POST',
        body: data
      });
      const result = await res.json();
      if (result.success) {
        setSubmittedRequest(result.data);
        setActiveTab('success-screen');
        setFormData({ 
          category: 'Electrical', 
          location: '', 
          problemDescription: '', 
          reportedByName: '', 
          reportedByMobile: '', 
          reportedAt: '', 
          urgencyLevel: '', 
          photo: null 
        });
        fetchData();
      } else {
        setReportSubmitError(result.error || 'Unable to submit the maintenance request.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setReportSubmitError('Unable to submit the maintenance request. Please try again.');
    }
  };

  const updateStatus = async (id, status, isCompletion = false, assignedName = null, assignedMobile = null) => {
    const data = new FormData();
    data.append('status', status);

    if (assignedName) data.append('assignedName', assignedName);
    if (assignedMobile) data.append('assignedMobile', assignedMobile);

    if (isCompletion) {
      const itemComp = completionData[id] || {};
      if (itemComp.remarks) data.append('remarks', itemComp.remarks);
      if (itemComp.completionPhoto) data.append('completionPhoto', itemComp.completionPhoto);
    }

    try {
      await fetch(`${API_BASE_URL}/api/requests/${id}`, {
        method: 'PATCH',
        body: data
      });
      fetchData();
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
        setShowTeamForm(false);
        setEditingMemberId(null);
        setTeamForm({ category: 'Electrical', personName: '', mobileNumber: '', active: true });
        fetchData();
        setActiveTab('team-directory-screen9');
      }
    } catch (err) {
      console.error('Error saving team member:', err);
    }
  };

  const handleDeleteMember = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/${id}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Error deleting team member:', err);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('WARNING: This will delete ALL maintenance requests from MongoDB permanently. Are you sure?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/db/clear-requests`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (result.success) {
        alert(result.message);
        fetchData();
      }
    } catch (err) {
      console.error('Error clearing database:', err);
    }
  };

  const handleDeleteRequestsByStatus = async () => {
    const matchingCount = requests.filter(request => request.status === deleteStatus).length;
    if (matchingCount === 0) {
      alert(`There are no ${deleteStatus} requests to delete.`);
      return;
    }

    if (!window.confirm(`Permanently delete all ${matchingCount} ${deleteStatus} request(s)? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/status/${encodeURIComponent(deleteStatus)}`, {
        method: 'DELETE'
      });
      const responseText = await res.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        if (res.status === 404) {
          throw new Error('The backend has not loaded status-based deletion yet. Restart the server and try again.');
        }
        throw new Error(`The server returned an unexpected response (HTTP ${res.status}).`);
      }
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Unable to delete requests.');
      }

      alert(result.message);
      await fetchData();
    } catch (err) {
      console.error('Error deleting requests by status:', err);
      alert(err.message || 'Unable to delete requests. Please try again.');
    }
  };

  const startEditMember = (member) => {
    setEditingMemberId(member._id);
    setTeamForm({
      category: member.category,
      personName: member.personName,
      mobileNumber: member.mobileNumber,
      active: member.active
    });
    setActiveTab('admin-panel-screen10');
  };

  const getUrgencyBadge = (level) => {
    let bg = '#6c757d';
    if (level === 'Urgent') bg = '#dc3545';
    else if (level === 'High') bg = '#fd7e14';
    else if (level === 'Medium') bg = '#ffc107';

    return (
      <span style={{ padding: '2px 8px', borderRadius: '4px', background: bg, color: level === 'Medium' ? '#000' : '#fff', fontSize: '11px', fontWeight: 'bold' }}>
        {level || 'Medium'}
      </span>
    );
  };

  const filteredRequests = filterCategory === 'All' 
    ? requests 
    : requests.filter(r => r.category === filterCategory);

  const newComplaintJobs = requests.filter(r => r.status === 'New');
  const acceptedJobs = requests.filter(r => r.status === 'Accepted');
  const inProgressJobs = requests.filter(r => r.status === 'In Progress');
  const completedJobs = requests.filter(r => r.status === 'Completed');

  return (
    <div className="app-shell" style={{ fontFamily: 'Arial, sans-serif', background: '#f4f6f9', minHeight: '100vh', margin: 0, padding: 0 }}>
      {/* Top Navbar */}
      <header className="app-header" style={{ background: '#0d6efd', color: 'white', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="app-header-title" style={{ margin: 0 }}>Hostel 360 – Maintenance System</h2>
        <div className="app-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={enablePushNotifications}
            disabled={pushEnabled}
            style={{ ...navBtnStyle(pushEnabled), opacity: pushEnabled ? 0.8 : 1 }}
          >
            {pushEnabled ? 'Phone alerts enabled' : 'Enable phone alerts'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowNotifications(current => !current)}
              aria-expanded={showNotifications}
              aria-label={`Notifications, ${notifications.filter(notification => !notification.read).length} unread`}
              style={{ ...navBtnStyle(showNotifications), position: 'relative' }}
            >
              Notifications
              {notifications.some(notification => !notification.read) && (
                <span style={{ marginLeft: '6px', background: '#dc3545', color: 'white', borderRadius: '10px', padding: '2px 6px', fontSize: '11px' }}>
                  {notifications.filter(notification => !notification.read).length}
                </span>
              )}
            </button>
            {showNotifications && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '300px', maxHeight: '360px', overflowY: 'auto', background: 'white', color: '#212529', border: '1px solid #dee2e6', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 10 }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>New complaint notifications</div>
                {notifications.length === 0 ? (
                  <p style={{ padding: '0 14px', color: '#6c757d' }}>No new complaints.</p>
                ) : (
                  notifications.map(notification => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item));
                        setShowNotifications(false);
                        setActiveTab('new-complaint-view');
                      }}
                      style={{ display: 'block', width: '100%', padding: '12px 14px', textAlign: 'left', border: 'none', borderBottom: '1px solid #eee', background: notification.read ? 'white' : '#f0f6ff', cursor: 'pointer', color: '#212529' }}
                    >
                      <strong>{notification.requestId}</strong>{!notification.read && <span style={{ color: '#0d6efd', marginLeft: '8px', fontSize: '12px' }}>NEW</span>}
                      <div style={{ marginTop: '4px', fontSize: '13px' }}>{notification.category} complaint — {notification.location}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={() => setActiveTab('admin-dashboard')} style={navBtnStyle(activeTab === 'admin-dashboard')}>Admin Dashboard</button>
        </div>
      </header>
      {pushMessage && (
        <div role="status" style={{ padding: '8px 20px', background: pushEnabled ? '#d1e7dd' : '#fff3cd', color: pushEnabled ? '#0f5132' : '#664d03', textAlign: 'center' }}>
          {pushMessage}
        </div>
      )}

      <div className="page-container" style={{ padding: '30px', maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* ADMIN DASHBOARD WITH FULL PROCESS SIDEBAR */}
        {activeTab === 'admin-dashboard' && (
          <div className="dashboard-layout" style={{ display: 'flex', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', minHeight: '650px' }}>
            
            <div className="dashboard-sidebar" style={{ width: '260px', background: '#0f2c59', color: 'white', padding: '20px 0' }}>
              <div style={{ padding: '0 20px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>Hostel 360 Process Flow</div>
              <div className="dashboard-sidebar-links" style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
                <button onClick={() => setActiveTab('admin-dashboard')} style={sidebarBtnStyle(true)}>1. Dashboard Overview</button>
                <button onClick={() => setActiveTab('report')} style={sidebarBtnStyle(false)}>2. Report Issue (Warden)</button>
                <button onClick={() => setActiveTab('new-complaint-view')} style={sidebarBtnStyle(false)}>3. New Complaint ({newComplaintJobs.length})</button>
                <button onClick={() => setActiveTab('dashboard')} style={sidebarBtnStyle(false)}>4. Maintenance Requests</button>
                <button onClick={() => setActiveTab('electrician-in-progress')} style={sidebarBtnStyle(false)}>5. In Progress Jobs ({acceptedJobs.length + inProgressJobs.length})</button>
                <button onClick={() => setActiveTab('electrician-completion')} style={sidebarBtnStyle(false)}>6. Completion Panel</button>
                <button onClick={() => setActiveTab('completed-status')} style={sidebarBtnStyle(false)}>7. Completed Status</button>
                <button onClick={() => setActiveTab('team-directory-screen9')} style={sidebarBtnStyle(false)}>8. Team Directory</button>
                <button onClick={() => setActiveTab('db-management')} style={sidebarBtnStyle(false)}>9. Settings & Database</button>
              </div>
            </div>

            <div className="dashboard-content" style={{ flex: 1, padding: '25px', background: '#f8f9fa' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Dashboard Overview</h3>
              
              <div className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '25px' }}>
                <div onClick={() => setActiveTab('new-complaint-view')} role="button" tabIndex={0} style={{...cardStyle('#fff3cd', '#664d03'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>NEW</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.new}</div>
                </div>
                <div onClick={() => setActiveTab('dashboard')} role="button" tabIndex={0} style={{...cardStyle('#cfe2ff', '#084298'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>ACCEPTED</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.accepted}</div>
                </div>
                <div onClick={() => setActiveTab('electrician-in-progress')} role="button" tabIndex={0} style={{...cardStyle('#e2f0d9', '#276749'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>IN PROGRESS</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.inProgress}</div>
                </div>
                <div onClick={() => setActiveTab('completed-status')} role="button" tabIndex={0} style={{...cardStyle('#d1e7dd', '#0f5132'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>COMPLETED</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{completedJobs.length}</div>
                </div>
              </div>

              <h4>Filter by Category</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(cat => (
                  <button key={cat} onClick={() => setFilterCategory(cat)} style={{ padding: '6px 14px', background: filterCategory === cat ? '#0d6efd' : 'white', color: filterCategory === cat ? 'white' : '#333', border: '1px solid #ced4da', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                    {cat}
                  </button>
                ))}
              </div>

              <h4>Filtered Requests Summary</h4>
              {filteredRequests.length === 0 ? (
                <p style={{ color: '#6c757d' }}>No requests found for this category.</p>
              ) : (
                filteredRequests.map(req => (
                  <div key={req._id} style={{ background: 'white', padding: '12px 15px', borderRadius: '6px', marginBottom: '10px', border: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{req.requestId} - {req.category}</strong>
                      <div style={{ fontSize: '13px', color: '#6c757d' }}>{req.location} | Reported By: <b>{req.reportedByName || 'N/A'}</b></div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {getUrgencyBadge(req.urgencyLevel)}
                      <span style={{ padding: '4px 8px', borderRadius: '4px', background: '#e2e3e5', fontSize: '12px', fontWeight: 'bold' }}>{req.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SETTINGS / DATABASE MANAGEMENT (Option 9) */}
        {activeTab === 'db-management' && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>9. Settings & Database Management</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>← Dashboard</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '25px' }}>
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>TOTAL REQUESTS IN DB</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0d6efd', marginTop: '5px' }}>{dbStats.requests}</div>
              </div>
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>TOTAL TEAM MEMBERS</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#198754', marginTop: '5px' }}>{dbStats.teamMembers}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <h4 style={{ color: '#dc3545', marginTop: 0 }}>Danger Zone</h4>
              <p style={{ fontSize: '13px', color: '#666' }}>Delete all complaint tickets with a selected status.</p>
              <label htmlFor="delete-request-status">Status to delete</label>
              <select
                id="delete-request-status"
                value={deleteStatus}
                onChange={e => setDeleteStatus(e.target.value)}
                style={{ ...inputStyle, marginBottom: '10px' }}
              >
                <option value="Completed">Completed</option>
                <option value="New">New</option>
                <option value="Accepted">Accepted</option>
                <option value="In Progress">In Progress</option>
              </select>
              <button
                onClick={handleDeleteRequestsByStatus}
                style={{ width: '100%', padding: '12px', background: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '15px' }}
              >
                Delete All {deleteStatus} Requests
              </button>
              <p style={{ fontSize: '13px', color: '#666' }}>Clear all stored complaint tickets from the MongoDB database.</p>
              <button 
                onClick={handleClearDatabase} 
                style={{ width: '100%', padding: '12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Clear All Requests Database
              </button>
            </div>
          </div>
        )}

        {/* TEAM DIRECTORY (Option 8) */}
        {activeTab === 'team-directory-screen9' && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '750px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>8. Team Directory (Manage Employees)</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back to Dashboard</button>
                <button 
                  onClick={() => {
                    setEditingMemberId(null);
                    setTeamForm({ category: 'Electrical', personName: '', mobileNumber: '', active: true });
                    setActiveTab('admin-panel-screen10');
                  }} 
                  style={{ padding: '8px 16px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  + Add Member
                </button>
              </div>
            </div>

            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Person / Team</th>
                  <th style={thStyle}>Mobile Number</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.map(member => {
                  let icon = '⚡';
                  if (member.category === 'Plumbing') icon = '💧';
                  else if (member.category === 'Civil/Tile') icon = '🧱';
                  else if (member.category === 'AC') icon = '❄️';
                  else if (member.category === 'Carpentry') icon = '🔨';
                  else if (member.category === 'Cleaning') icon = '🧹';
                  else if (member.category === 'Pest Control') icon = '🐛';

                  return (
                    <tr key={member._id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={tdStyle}>{icon} {member.category}</td>
                      <td style={tdStyle}>{member.personName}</td>
                      <td style={tdStyle}>{member.mobileNumber || 'XXXXXXXXXX'}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: member.active ? '#d1e7dd' : '#f8d7da', color: member.active ? '#0f5132' : '#842029', fontSize: '12px', fontWeight: 'bold' }}>
                          {member.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, display: 'flex', gap: '6px' }}>
                        <button onClick={() => startEditMember(member)} style={{ padding: '4px 10px', background: '#ffc107', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Edit</button>
                        <button onClick={() => handleDeleteMember(member._id)} style={{ padding: '4px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* TEAM MEMBER FORM (Add/Edit) */}
        {activeTab === 'admin-panel-screen10' && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '500px', margin: '0 auto', border: '1px solid #ddd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingMemberId ? 'Edit Team Member' : 'Add Team Member'}</h3>
              <button onClick={() => setActiveTab('team-directory-screen9')} style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>← Directory</button>
            </div>
            <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Category *</label>
                <select 
                  value={teamForm.category} 
                  onChange={e => setTeamForm({...teamForm, category: e.target.value})} 
                  style={inputStyle}
                >
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Civil/Tile">Civil/Tile</option>
                  <option value="AC">AC</option>
                  <option value="Carpentry">Carpentry</option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Pest Control">Pest Control</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Person / Team *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Electrician 1" 
                  value={teamForm.personName} 
                  onChange={e => setTeamForm({...teamForm, personName: e.target.value})} 
                  required 
                  style={inputStyle} 
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Mobile Number *</label>
                <input 
                  type="text" 
                  placeholder="e.g. XXXXXXXXXX" 
                  value={teamForm.mobileNumber} 
                  onChange={e => setTeamForm({...teamForm, mobileNumber: e.target.value})} 
                  required 
                  style={inputStyle} 
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Status *</label>
                <select 
                  value={teamForm.active} 
                  onChange={e => setTeamForm({...teamForm, active: e.target.value === 'true'})} 
                  style={inputStyle}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, padding: '12px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Save Changes</button>
                <button type="button" onClick={() => setActiveTab('team-directory-screen9')} style={{ flex: 1, padding: '12px', background: 'white', color: '#333', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* MAINTENANCE REQUESTS (Option 4) */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>4. Maintenance Requests List</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Admin Dashboard</button>
            </div>

            {filteredRequests.map(req => (
              <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #ddd' }}>
                <div style={{ background: '#f8f9fa', padding: '10px 15px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e2e3e5', fontSize: '12px' }}>Status: <b>{req.status}</b></span>
                </div>

                <div style={{ padding: '15px' }}>
                  <p style={{ margin: '5px 0' }}><b>⚡ Category:</b> {req.category}</p>
                  <p style={{ margin: '5px 0' }}><b>📍 Location:</b> {req.location}</p>
                  <p style={{ margin: '5px 0' }}><b>🛠️ Problem:</b> {req.problemDescription}</p>
                  <p style={{ margin: '5px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                  <p style={{ margin: '5px 0' }}><b>📅 Reported At:</b> {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}</p>
                  <p style={{ margin: '5px 0' }}><b>👤 Reported By:</b> {req.reportedByName || 'N/A'} ({req.reportedByMobile || 'No Phone'})</p>
                  <p style={{ margin: '5px 0' }}><b>👷 Responsible Person:</b> <span style={{ color: '#0d6efd', fontWeight: 'bold' }}>{req.assignedName ? `${req.assignedName} (${req.assignedMobile || 'No Phone'})` : 'Pending Assignment'}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* REPORT ISSUE (Option 2) */}
        {activeTab === 'report' && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>2. Report Maintenance (Warden)</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '6px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>← Dashboard</button>
            </div>
            <form onSubmit={handleReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label>Category *</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={inputStyle}>
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Civil/Tile">Civil/Tile</option>
                  <option value="AC">AC</option>
                  <option value="Carpentry">Carpentry</option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Pest Control">Pest Control</option>
                </select>
              </div>

              {/* Urgency Level Dropdown */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Urgency Level *</label>
                <select 
                  name="urgencyLevel"
                  value={formData.urgencyLevel} 
                  onChange={e => setFormData(current => ({...current, urgencyLevel: e.target.value}))}
                  required
                  style={inputStyle}
                >
                  <option value="" disabled>Select urgency level</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              {reportSubmitError && <p role="alert" style={{ color: '#dc3545', margin: 0 }}>{reportSubmitError}</p>}

              {/* Warden / Reporter Name Input */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Warden / Reporter Name *</label>
                <input 
                  type="text" 
                  name="reportedByName"
                  placeholder="e.g. John Doe"
                  value={formData.reportedByName} 
                  onChange={e => setFormData({...formData, reportedByName: e.target.value})} 
                  required 
                  style={inputStyle}
                />
              </div>

              {/* Mobile Number Input */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Mobile Number *</label>
                <input 
                  type="tel" 
                  name="reportedByMobile"
                  placeholder="e.g. 9876543210"
                  value={formData.reportedByMobile} 
                  onChange={e => setFormData({...formData, reportedByMobile: e.target.value})} 
                  required 
                  style={inputStyle}
                />
              </div>

              {/* Date & Time Input */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700">Date & Time *</label>
                <input 
                  type="datetime-local" 
                  value={formData.reportedAt} 
                  onChange={e => setFormData({...formData, reportedAt: e.target.value})} 
                  required 
                  style={inputStyle}
                />
              </div>

              <div>
                <label>Location / Room *</label>
                <input type="text" placeholder="e.g. Block B3 - Dormitory 18" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label>Problem Description *</label>
                <textarea placeholder="Describe the issue..." value={formData.problemDescription} onChange={e => setFormData({...formData, problemDescription: e.target.value})} required style={{...inputStyle, height: '80px'}} />
              </div>
              <div>
                <label>Upload Photo File *</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => setFormData({...formData, photo: e.target.files[0]})} 
                  style={inputStyle} 
                />
              </div>
              <button type="submit" style={{ padding: '12px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Submit Request</button>
            </form>
          </div>
        )}

        {/* AUTOMATIC ASSIGNMENT & REQUEST SUBMITTED SCREEN */}
        {activeTab === 'success-screen' && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
            <div style={{ color: '#198754', fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' }}>
              ✓ Request Submitted & Assigned!
            </div>
            <p style={{ color: '#6c757d', marginBottom: '20px' }}>
              Your maintenance request has been submitted successfully.
            </p>

            {submittedRequest ? (
              <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '6px', textAlign: 'left', marginBottom: '20px', border: '1px solid #dee2e6' }}>
                <p style={{ margin: '8px 0' }}><b>Request ID:</b> {submittedRequest.requestId}</p>
                <p style={{ margin: '8px 0' }}><b>Category:</b> {submittedRequest.category}</p>
                <p style={{ margin: '8px 0' }}><b>Location:</b> {submittedRequest.location}</p>
                <p style={{ margin: '8px 0' }}><b>Problem:</b> {submittedRequest.problemDescription}</p>
                <p style={{ margin: '8px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(submittedRequest.urgencyLevel)}</p>
                <p style={{ margin: '8px 0' }}><b>Reported At:</b> {submittedRequest.reportedAt ? new Date(submittedRequest.reportedAt).toLocaleString() : 'N/A'}</p>
                <p style={{ margin: '8px 0' }}><b>Reported By:</b> {submittedRequest.reportedByName} ({submittedRequest.reportedByMobile})</p>
                <p style={{ margin: '8px 0' }}><b>Status:</b> <span style={{ background: '#ffc107', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{submittedRequest.status}</span></p>
              </div>
            ) : (
              <p>No recent requests found.</p>
            )}

            <button 
              onClick={() => setActiveTab('admin-dashboard')} 
              style={{ width: '100%', padding: '12px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Back to Admin Dashboard
            </button>
          </div>
        )}

        {/* NEW COMPLAINT (Option 3) */}
        {activeTab === 'new-complaint-view' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>3. New Complaint Job View</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Admin Dashboard</button>
            </div>
            {newComplaintJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>No new incoming complaints right now.</p>
            ) : (
              newComplaintJobs.map(req => {
                const techInput = selectedTechs[req._id] || { name: req.assignedName || '', mobile: req.assignedMobile || '' };

                return (
                  <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #ddd', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                    
                    <div style={{ background: req.urgencyLevel === 'Urgent' ? '#dc3545' : '#0d6efd', color: 'white', padding: '12px 15px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🔴 NEW {req.category.toUpperCase()} COMPLAINT</span>
                      {getUrgencyBadge(req.urgencyLevel)}
                    </div>

                    <div style={{ padding: '20px' }}>
                      <p style={{ margin: '8px 0' }}><b>⚡ Category:</b> {req.category}</p>
                      <p style={{ margin: '8px 0' }}><b>📍 Location:</b> {req.location}</p>
                      <p style={{ margin: '8px 0' }}><b>🛠️ Problem:</b> {req.problemDescription}</p>
                      <p style={{ margin: '8px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                      <p style={{ margin: '8px 0' }}><b>📅 Reported At:</b> {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}</p>
                      <p style={{ margin: '8px 0' }}><b>👤 Reported By:</b> {req.reportedByName || 'N/A'} ({req.reportedByMobile || 'No Phone'})</p>
                      
                      {/* Manual Text Input Fields for Technician Name & Mobile Number */}
                      <div style={{ margin: '15px 0', background: '#f8f9fa', padding: '12px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                        <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#333' }}>
                          👤 Responsible Technician Details:
                        </label>
                        
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '12px', color: '#666' }}>Technician Name *</label>
                          <input 
                            type="text" 
                            placeholder="e.g. John Smith"
                            value={techInput.name} 
                            onChange={e => setSelectedTechs({
                              ...selectedTechs, 
                              [req._id]: { ...techInput, name: e.target.value }
                            })} 
                            style={inputStyle}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', color: '#666' }}>Mobile Number *</label>
                          <input 
                            type="tel" 
                            placeholder="e.g. 9876543210"
                            value={techInput.mobile} 
                            onChange={e => setSelectedTechs({
                              ...selectedTechs, 
                              [req._id]: { ...techInput, mobile: e.target.value }
                            })} 
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      {req.photo && (
                        <div style={{ margin: '15px 0' }}>
                          <img src={`${API_BASE_URL}${req.photo}`} alt="Issue Attachment" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                        </div>
                      )}

                      <button 
                        onClick={() => {
                          const techInfo = selectedTechs[req._id] || {};
                          updateStatus(req._id, 'Accepted', false, techInfo.name, techInfo.mobile);
                        }} 
                        style={{ width: '100%', padding: '14px', background: '#198754', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', marginTop: '15px' }}
                      >
                        Accept Complaint (Mark as Accepted)
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* IN PROGRESS JOBS (Option 5) */}
        {activeTab === 'electrician-in-progress' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>5. In Progress & Accepted Complaints</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Admin Dashboard</button>
            </div>
            {acceptedJobs.length === 0 && inProgressJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>No accepted or in-progress complaints right now.</p>
            ) : (
              [...acceptedJobs, ...inProgressJobs].map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #ddd', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                  
                  <div style={{ background: req.status === 'Accepted' ? '#0d6efd' : '#0dcaf0', color: req.status === 'Accepted' ? 'white' : 'black', padding: '12px 15px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🕒 STATUS: {req.status.toUpperCase()}</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>

                  <div style={{ padding: '20px' }}>
                    <p style={{ margin: '6px 0' }}><b>Request ID:</b> {req.requestId}</p>
                    <p style={{ margin: '6px 0' }}><b>Category:</b> {req.category}</p>
                    <p style={{ margin: '6px 0' }}><b>Location:</b> {req.location}</p>
                    <p style={{ margin: '6px 0' }}><b>Problem:</b> {req.problemDescription}</p>
                    <p style={{ margin: '6px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                    <p style={{ margin: '6px 0' }}><b>📅 Reported At:</b> {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}</p>
                    <p style={{ margin: '6px 0' }}><b>Reported By:</b> {req.reportedByName || 'N/A'} ({req.reportedByMobile || 'No Phone'})</p>
                    <p style={{ margin: '6px 0' }}><b>Responsible Person:</b> <span style={{ color: '#0d6efd', fontWeight: 'bold' }}>{req.assignedName ? `${req.assignedName} (${req.assignedMobile || 'No Phone'})` : 'N/A'}</span></p>

                    {req.status === 'Accepted' && (
                      <button 
                        onClick={() => updateStatus(req._id, 'In Progress')} 
                        style={{ width: '100%', padding: '12px', background: '#0dcaf0', color: 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' }}
                      >
                        Start In Progress
                      </button>
                    )}

                    {req.status === 'In Progress' && (
                      <div style={{ marginTop: '15px', padding: '10px', background: '#e2f0d9', borderRadius: '4px', color: '#276749', textAlign: 'center', fontWeight: 'bold' }}>
                        Job is currently In Progress. Go to Completion Panel to finish.
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* COMPLETION PANEL (Option 6) */}
        {activeTab === 'electrician-completion' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>6. Completion Panel</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Admin Dashboard</button>
            </div>
            {inProgressJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>No complaints currently marked as "In Progress" to complete.</p>
            ) : (
              inProgressJobs.map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #ddd', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                  
                  <div style={{ background: '#198754', color: 'white', padding: '12px 15px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>✅ Ready for Completion</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>

                  <div style={{ padding: '20px' }}>
                    <p style={{ margin: '6px 0' }}><b>Request ID:</b> {req.requestId} ({req.category})</p>
                    <p style={{ margin: '6px 0' }}><b>Location:</b> {req.location}</p>
                    <p style={{ margin: '6px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                    <p style={{ margin: '6px 0' }}><b>📅 Reported At:</b> {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}</p>
                    <p style={{ margin: '6px 0' }}><b>Reported By:</b> {req.reportedByName || 'N/A'} ({req.reportedByMobile || 'No Phone'})</p>
                    
                    {/* Responsible Person with name and mobile number */}
                    <p style={{ margin: '6px 0' }}>
                      <b>Responsible Person:</b> <span style={{ color: '#0d6efd', fontWeight: 'bold' }}>{req.assignedName ? `${req.assignedName} (${req.assignedMobile || 'No Phone'})` : 'N/A'}</span>
                    </p>
                    
                    <div style={{ margin: '15px 0' }}>
                      <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Upload After Photo</label>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={e => setCompletionData({
                          ...completionData, 
                          [req._id]: { ...(completionData[req._id] || {}), completionPhoto: e.target.files[0] }
                        })} 
                        style={inputStyle} 
                      />
                    </div>

                    <div style={{ margin: '15px 0' }}>
                      <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Remarks (optional)</label>
                      <input 
                        type="text" 
                        placeholder="Enter remarks..." 
                        onChange={e => setCompletionData({
                          ...completionData, 
                          [req._id]: { ...(completionData[req._id] || {}), remarks: e.target.value }
                        })} 
                        style={inputStyle} 
                      />
                    </div>

                    <button 
                      onClick={() => updateStatus(req._id, 'Completed', true)} 
                      style={{ width: '100%', padding: '14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', marginTop: '10px' }}
                    >
                      Mark as Completed
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* COMPLETED STATUS (Option 7) */}
        {activeTab === 'completed-status' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>7. Completed Status & Before/After Review</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={{ padding: '8px 14px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Admin Dashboard</button>
            </div>
            {completedJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>No completed complaints recorded yet.</p>
            ) : (
              completedJobs.map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #ddd', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                  
                  <div style={{ background: '#198754', color: 'white', padding: '12px 15px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>✅ COMPLETED</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>

                  <div style={{ padding: '20px' }}>
                    <p style={{ margin: '6px 0' }}><b>Request ID:</b> {req.requestId}</p>
                    <p style={{ margin: '6px 0' }}><b>Category:</b> {req.category}</p>
                    <p style={{ margin: '6px 0' }}><b>Location:</b> {req.location}</p>
                    <p style={{ margin: '6px 0' }}><b>Problem:</b> {req.problemDescription}</p>
                    <p style={{ margin: '6px 0' }}><b>🚨 Urgency Level:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                    <p style={{ margin: '6px 0' }}><b>📅 Reported At:</b> {req.reportedAt ? new Date(req.reportedAt).toLocaleString() : 'N/A'}</p>
                    <p style={{ margin: '6px 0' }}><b>Reported By:</b> {req.reportedByName || 'N/A'} ({req.reportedByMobile || 'No Phone'})</p>
                    <p style={{ margin: '6px 0' }}><b>Responsible Person:</b> <span style={{ color: '#0d6efd', fontWeight: 'bold' }}>{req.assignedName ? `${req.assignedName} (${req.assignedMobile || 'No Phone'})` : 'N/A'}</span></p>
                    <p style={{ margin: '6px 0' }}><b>Completed At:</b> {req.completedAt ? new Date(req.completedAt).toLocaleString() : (req.updatedAt ? new Date(req.updatedAt).toLocaleString() : 'N/A')}</p>

                    <div style={{ display: 'flex', gap: '15px', marginTop: '15px', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        {req.photo ? (
                          <img src={`${API_BASE_URL}${req.photo}`} alt="Before" style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                        ) : (
                          <div style={{ height: '130px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>No Photo</div>
                        )}
                        <small style={{ display: 'block', marginTop: '4px', fontWeight: 'bold', color: '#555' }}>Before</small>
                      </div>

                      <div style={{ flex: 1, textAlign: 'center' }}>
                        {req.completionPhoto ? (
                          <img src={`${API_BASE_URL}${req.completionPhoto}`} alt="After" style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                        ) : (
                          <div style={{ height: '130px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>No Photo</div>
                        )}
                        <small style={{ display: 'block', marginTop: '4px', fontWeight: 'bold', color: '#555' }}>After</small>
                      </div>
                    </div>

                    {req.remarks && <p style={{ margin: '12px 0 0 0' }}><b>Remarks:</b> {req.remarks}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// Styling Helpers
const navBtnStyle = (active) => ({ background: active ? '#0b5ed7' : 'transparent', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' });
const sidebarBtnStyle = (active) => ({ background: active ? '#1d4ed8' : 'transparent', color: 'white', border: 'none', padding: '12px 20px', textAlign: 'left', cursor: 'pointer', fontSize: '14px', width: '100%' });
const cardStyle = (bg, color) => ({ background: bg, color: color, padding: '20px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' });
const inputStyle = { width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };
const thStyle = { padding: '10px', borderBottom: '2px solid #dee2e6' };
const tdStyle = { padding: '10px' };

export default App;