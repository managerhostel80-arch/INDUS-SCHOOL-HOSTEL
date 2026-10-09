import React, { useState, useEffect } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState('admin-dashboard');
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ new: 0, accepted: 0, inProgress: 0, completed: 0 });
  const [team, setTeam] = useState([]);
  const [filterCategory, setFilterCategory] = useState('All');
  
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const fetchData = async () => {
    try {
      const res = await fetch('https://indus-school-hostel.onrender.com/api/requests');
      const result = await res.json();
      if (result.success) {
        setRequests(result.data);
        setStats(result.stats);
        if (result.data.length > 0 && !submittedRequest) {
          setSubmittedRequest(result.data[0]);
        }
      }

      const teamRes = await fetch('https://indus-school-hostel.onrender.com/api/team');
      const teamResult = await teamRes.json();
      if (teamResult.success) {
        setTeam(teamResult.data);
      }

      const dbRes = await fetch('https://indus-school-hostel.onrender.com/api/db/stats').catch(() => null);
      if (dbRes) {
        const dbResult = await dbRes.json();
        if (dbResult.success) setDbStats(dbResult.stats);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('category', formData.category);
    data.append('location', formData.location);
    data.append('problemDescription', formData.problemDescription);
    data.append('reportedByName', formData.reportedByName);
    data.append('reportedByMobile', formData.reportedByMobile);
    data.append('reportedAt', formData.reportedAt);
    data.append('urgencyLevel', formData.urgencyLevel);
    if (formData.photo) data.append('photo', formData.photo);

    try {
      const res = await fetch('https://indus-school-hostel.onrender.com/api/requests', {
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
          urgencyLevel: 'Medium', 
          photo: null 
        });
        fetchData();
      }
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
      if (itemComp.remarks) data.append('remarks', itemComp.remarks);
      if (itemComp.completionPhoto) data.append('completionPhoto', itemComp.completionPhoto);
    }

    try {
      await fetch(`https://indus-school-hostel.onrender.com/api/requests/${id}`, {
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
      ? `https://indus-school-hostel.onrender.com/api/team/${editingMemberId}` 
      : 'https://indus-school-hostel.onrender.com/api/team';

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
      const res = await fetch(`https://indus-school-hostel.onrender.com/api/team/${id}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (result.success) fetchData();
    } catch (err) {
      console.error('Error deleting team member:', err);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('WARNING: This will delete ALL maintenance requests from MongoDB permanently. Are you sure?')) return;
    try {
      const res = await fetch('https://indus-school-hostel.onrender.com/api/db/clear-requests', {
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
      <span style={{ padding: '2px 6px', borderRadius: '4px', background: bg, color: level === 'Medium' ? '#000' : '#fff', fontSize: '11px', fontWeight: 'bold' }}>
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
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#f4f6f9', minHeight: '100vh', width: '100vw', maxWidth: '100%', margin: 0, padding: 0, boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* Top Navbar */}
      <header style={{ background: '#0d6efd', color: 'white', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
        <h2 style={{ margin: 0, fontSize: '17px', wordBreak: 'break-word' }}>Hostel 360 – Maintenance System</h2>
        <button onClick={() => setActiveTab('admin-dashboard')} style={{ ...navBtnStyle(activeTab === 'admin-dashboard'), width: '100%', textAlign: 'center' }}>Admin Dashboard</button>
      </header>

      {/* Main Container */}
      <div style={{ padding: '10px', width: '100%', maxWidth: '100%', boxSizing: 'border-box', margin: 0 }}>
        
        {/* ADMIN DASHBOARD */}
        {activeTab === 'admin-dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
            
            {/* Horizontal Scrollable Menu Bar for Mobile */}
            <div style={{ background: '#0f2c59', color: 'white', padding: '10px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>Process Flow Menu</div>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', width: '100%' }}>
                <button onClick={() => setActiveTab('admin-dashboard')} style={menuChipStyle(true)}>1. Dashboard</button>
                <button onClick={() => setActiveTab('report')} style={menuChipStyle(false)}>2. Report</button>
                <button onClick={() => setActiveTab('new-complaint-view')} style={menuChipStyle(false)}>3. New ({newComplaintJobs.length})</button>
                <button onClick={() => setActiveTab('dashboard')} style={menuChipStyle(false)}>4. Requests</button>
                <button onClick={() => setActiveTab('electrician-in-progress')} style={menuChipStyle(false)}>5. Progress</button>
                <button onClick={() => setActiveTab('electrician-completion')} style={menuChipStyle(false)}>6. Complete</button>
                <button onClick={() => setActiveTab('completed-status')} style={menuChipStyle(false)}>7. Done</button>
                <button onClick={() => setActiveTab('team-directory-screen9')} style={menuChipStyle(false)}>8. Team</button>
                <button onClick={() => setActiveTab('db-management')} style={menuChipStyle(false)}>9. Settings</button>
              </div>
            </div>

            <div style={{ padding: '12px', background: '#f8f9fa', width: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ marginTop: 0, fontSize: '16px' }}>Dashboard Overview</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '15px', width: '100%' }}>
                <div onClick={() => setActiveTab('new-complaint-view')} style={{...cardStyle('#fff3cd', '#664d03'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>NEW</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.new}</div>
                </div>
                <div onClick={() => setActiveTab('dashboard')} style={{...cardStyle('#cfe2ff', '#084298'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>ACCEPTED</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.accepted}</div>
                </div>
                <div onClick={() => setActiveTab('electrician-in-progress')} style={{...cardStyle('#e2f0d9', '#276749'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>IN PROGRESS</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{stats.inProgress}</div>
                </div>
                <div onClick={() => setActiveTab('completed-status')} style={{...cardStyle('#d1e7dd', '#0f5132'), cursor: 'pointer'}}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>COMPLETED</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{completedJobs.length}</div>
                </div>
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '6px' }}>Filter by Category</h4>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '15px', width: '100%' }}>
                {['All', 'Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(cat => (
                  <button key={cat} onClick={() => setFilterCategory(cat)} style={{ padding: '5px 8px', background: filterCategory === cat ? '#0d6efd' : 'white', color: filterCategory === cat ? 'white' : '#333', border: '1px solid #ced4da', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                    {cat}
                  </button>
                ))}
              </div>

              <h4 style={{ fontSize: '14px', marginBottom: '6px' }}>Requests Summary</h4>
              {filteredRequests.length === 0 ? (
                <p style={{ color: '#6c757d', fontSize: '13px' }}>No requests found.</p>
              ) : (
                filteredRequests.map(req => (
                  <div key={req._id} style={{ background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #dee2e6', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                      <strong style={{ fontSize: '13px', wordBreak: 'break-word' }}>{req.requestId} - {req.category}</strong>
                      {getUrgencyBadge(req.urgencyLevel)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{req.location} | By: {req.reportedByName || 'N/A'}</div>
                    <div style={{ marginTop: '4px' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: '#e2e3e5', fontSize: '10px', fontWeight: 'bold' }}>{req.status}</span></div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SETTINGS / DATABASE MANAGEMENT */}
        {activeTab === 'db-management' && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Settings</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Back</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '15px' }}>
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#666', fontWeight: 'bold' }}>TOTAL REQUESTS</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0d6efd', marginTop: '4px' }}>{dbStats.requests}</div>
              </div>
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #dee2e6', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#666', fontWeight: 'bold' }}>TOTAL TEAM</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#198754', marginTop: '4px' }}>{dbStats.teamMembers}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
              <h4 style={{ color: '#dc3545', marginTop: 0, fontSize: '14px' }}>Danger Zone</h4>
              <button onClick={handleClearDatabase} style={{ width: '100%', padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                Clear All Requests Database
              </button>
            </div>
          </div>
        )}

        {/* TEAM DIRECTORY */}
        {activeTab === 'team-directory-screen9' && (
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Team Directory</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>←</button>
                <button onClick={() => { setEditingMemberId(null); setTeamForm({ category: 'Electrical', personName: '', mobileNumber: '', active: true }); setActiveTab('admin-panel-screen10'); }} style={{ padding: '6px 10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ Add</button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '320px', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Mobile</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map(member => (
                    <tr key={member._id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={tdStyle}><b>{member.personName}</b></td>
                      <td style={tdStyle}>{member.category}</td>
                      <td style={tdStyle}>{member.mobileNumber || 'N/A'}</td>
                      <td style={{ ...tdStyle, display: 'flex', gap: '4px' }}>
                        <button onClick={() => startEditMember(member)} style={{ padding: '3px 6px', background: '#ffc107', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Edit</button>
                        <button onClick={() => handleDeleteMember(member._id)} style={{ padding: '3px 6px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TEAM MEMBER FORM */}
        {activeTab === 'admin-panel-screen10' && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{editingMemberId ? 'Edit Member' : 'Add Member'}</h3>
              <button onClick={() => setActiveTab('team-directory-screen9')} style={smallBtnStyle}>← Back</button>
            </div>
            <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div>
                <label style={{ fontWeight: 'bold' }}>Category *</label>
                <select value={teamForm.category} onChange={e => setTeamForm({...teamForm, category: e.target.value})} style={inputStyle}>
                  {['Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Name *</label>
                <input type="text" value={teamForm.personName} onChange={e => setTeamForm({...teamForm, personName: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Mobile *</label>
                <input type="text" value={teamForm.mobileNumber} onChange={e => setTeamForm({...teamForm, mobileNumber: e.target.value})} required style={inputStyle} />
              </div>
              <button type="submit" style={{ padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>Save Member</button>
            </form>
          </div>
        )}

        {/* REQUESTS LIST */}
        {activeTab === 'dashboard' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Requests List</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>

            {filteredRequests.map(req => (
              <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div style={{ background: '#f8f9fa', padding: '8px 12px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <strong>{req.requestId} - {req.category}</strong>
                  <span><b>{req.status}</b></span>
                </div>
                <div style={{ padding: '10px', fontSize: '12px' }}>
                  <p style={{ margin: '3px 0' }}><b>📍 Location:</b> {req.location}</p>
                  <p style={{ margin: '3px 0' }}><b>🛠️ Problem:</b> {req.problemDescription}</p>
                  <p style={{ margin: '3px 0' }}><b>🚨 Urgency:</b> {getUrgencyBadge(req.urgencyLevel)}</p>
                  <p style={{ margin: '3px 0' }}><b>👤 Reported By:</b> {req.reportedByName || 'N/A'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* REPORT ISSUE */}
        {activeTab === 'report' && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Report Issue</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>
            <form onSubmit={handleReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}>
              <div>
                <label style={{ fontWeight: 'bold' }}>Category *</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={inputStyle}>
                  {['Electrical', 'Plumbing', 'Civil/Tile', 'AC', 'Carpentry', 'Cleaning', 'Pest Control'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Urgency Level *</label>
                <select value={formData.urgencyLevel} onChange={e => setFormData({...formData, urgencyLevel: e.target.value})} style={inputStyle}>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Reporter Name *</label>
                <input type="text" placeholder="Name" value={formData.reportedByName} onChange={e => setFormData({...formData, reportedByName: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Mobile Number *</label>
                <input type="tel" placeholder="Mobile" value={formData.reportedByMobile} onChange={e => setFormData({...formData, reportedByMobile: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Date & Time *</label>
                <input type="datetime-local" value={formData.reportedAt} onChange={e => setFormData({...formData, reportedAt: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Location / Room *</label>
                <input type="text" placeholder="Room" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Problem Description *</label>
                <textarea placeholder="Describe issue..." value={formData.problemDescription} onChange={e => setFormData({...formData, problemDescription: e.target.value})} required style={{...inputStyle, height: '60px'}} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Upload Photo *</label>
                <input type="file" accept="image/*" onChange={e => setFormData({...formData, photo: e.target.files[0]})} style={inputStyle} />
              </div>
              <button type="submit" style={{ padding: '12px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px', width: '100%' }}>Submit Request</button>
            </form>
          </div>
        )}

        {/* SUCCESS SCREEN */}
        {activeTab === 'success-screen' && (
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ color: '#198754', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>✓ Submitted Successfully!</div>
            {submittedRequest && (
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', textAlign: 'left', marginBottom: '12px', border: '1px solid #dee2e6', fontSize: '12px', wordBreak: 'break-word' }}>
                <p style={{ margin: '4px 0' }}><b>ID:</b> {submittedRequest.requestId}</p>
                <p style={{ margin: '4px 0' }}><b>Category:</b> {submittedRequest.category}</p>
                <p style={{ margin: '4px 0' }}><b>Location:</b> {submittedRequest.location}</p>
                <p style={{ margin: '4px 0' }}><b>Urgency:</b> {getUrgencyBadge(submittedRequest.urgencyLevel)}</p>
              </div>
            )}
            <button onClick={() => setActiveTab('admin-dashboard')} style={{ width: '100%', padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Back to Dashboard</button>
          </div>
        )}

        {/* NEW COMPLAINT VIEW */}
        {activeTab === 'new-complaint-view' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>New Complaints</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>
            {newComplaintJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center', fontSize: '13px' }}>No new complaints.</p>
            ) : (
              newComplaintJobs.map(req => {
                const techInput = selectedTechs[req._id] || { name: req.assignedName || '', mobile: req.assignedMobile || '' };
                return (
                  <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                    <div style={{ background: '#0d6efd', color: 'white', padding: '8px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span>NEW COMPLAINT</span>
                      {getUrgencyBadge(req.urgencyLevel)}
                    </div>
                    <div style={{ padding: '12px', fontSize: '12px' }}>
                      <p style={{ margin: '4px 0' }}><b>Location:</b> {req.location}</p>
                      <p style={{ margin: '4px 0' }}><b>Problem:</b> {req.problemDescription}</p>
                      
                      <div style={{ margin: '10px 0', background: '#f8f9fa', padding: '8px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Assign Technician:</label>
                        <input type="text" placeholder="Tech Name" value={techInput.name} onChange={e => setSelectedTechs({...selectedTechs, [req._id]: { ...techInput, name: e.target.value }})} style={{...inputStyle, marginBottom: '6px'}} />
                        <input type="tel" placeholder="Mobile" value={techInput.mobile} onChange={e => setSelectedTechs({...selectedTechs, [req._id]: { ...techInput, mobile: e.target.value }})} style={inputStyle} />
                      </div>

                      <button onClick={() => updateStatus(req._id, 'Accepted', false, techInput.name, techInput.mobile)} style={{ width: '100%', padding: '10px', background: '#198754', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>Accept Complaint</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* IN PROGRESS JOBS */}
        {activeTab === 'electrician-in-progress' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>In Progress</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>
            {[...acceptedJobs, ...inProgressJobs].length === 0 ? (
              <p style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center', fontSize: '13px' }}>No jobs in progress.</p>
            ) : (
              [...acceptedJobs, ...inProgressJobs].map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ background: '#0dcaf0', color: 'black', padding: '8px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span>{req.status.toUpperCase()}</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>
                  <div style={{ padding: '12px', fontSize: '12px' }}>
                    <p style={{ margin: '4px 0' }}><b>Location:</b> {req.location}</p>
                    <p style={{ margin: '4px 0' }}><b>Problem:</b> {req.problemDescription}</p>
                    <p style={{ margin: '4px 0' }}><b>Tech:</b> {req.assignedName || 'N/A'}</p>
                    {req.status === 'Accepted' && (
                      <button onClick={() => updateStatus(req._id, 'In Progress')} style={{ width: '100%', padding: '8px', background: '#0dcaf0', color: 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>Start In Progress</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* COMPLETION PANEL */}
        {activeTab === 'electrician-completion' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Completion Panel</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>
            {inProgressJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center', fontSize: '13px' }}>No jobs ready to complete.</p>
            ) : (
              inProgressJobs.map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ background: '#198754', color: 'white', padding: '8px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span>Completion</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>
                  <div style={{ padding: '12px', fontSize: '12px' }}>
                    <p style={{ margin: '4px 0' }}><b>Location:</b> {req.location}</p>
                    <div style={{ margin: '8px 0' }}>
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>After Photo</label>
                      <input type="file" accept="image/*" onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), completionPhoto: e.target.files[0] }})} style={inputStyle} />
                    </div>
                    <div style={{ margin: '8px 0' }}>
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>Remarks</label>
                      <input type="text" placeholder="Remarks..." onChange={e => setCompletionData({...completionData, [req._id]: { ...(completionData[req._id] || {}), remarks: e.target.value }})} style={inputStyle} />
                    </div>
                    <button onClick={() => updateStatus(req._id, 'Completed', true)} style={{ width: '100%', padding: '10px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>Mark Completed</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* COMPLETED STATUS */}
        {activeTab === 'completed-status' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Completed Status</h3>
              <button onClick={() => setActiveTab('admin-dashboard')} style={smallBtnStyle}>← Dashboard</button>
            </div>
            {completedJobs.length === 0 ? (
              <p style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center', fontSize: '13px' }}>No completed jobs.</p>
            ) : (
              completedJobs.map(req => (
                <div key={req._id} style={{ background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div style={{ background: '#198754', color: 'white', padding: '8px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span>COMPLETED</span>
                    {getUrgencyBadge(req.urgencyLevel)}
                  </div>
                  <div style={{ padding: '12px', fontSize: '12px' }}>
                    <p style={{ margin: '4px 0' }}><b>Location:</b> {req.location}</p>
                    <p style={{ margin: '4px 0' }}><b>Problem:</b> {req.problemDescription}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        {req.photo ? <img src={`https://indus-school-hostel.onrender.com${req.photo}`} alt="Before" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px' }} /> : <div style={{ height: '90px', background: '#eee' }}>No Photo</div>}
                        <small style={{ fontSize: '10px' }}>Before</small>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        {req.completionPhoto ? <img src={`https://indus-school-hostel.onrender.com${req.completionPhoto}`} alt="After" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '4px' }} /> : <div style={{ height: '90px', background: '#eee' }}>No Photo</div>}
                        <small style={{ fontSize: '10px' }}>After</small>
                      </div>
                    </div>
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

// Styling Helpers for Full Mobile Fit
const navBtnStyle = (active) => ({ background: active ? '#0b5ed7' : 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', boxSizing: 'border-box' });
const menuChipStyle = (active) => ({ background: active ? '#1d4ed8' : '#1e3a8a', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' });
const cardStyle = (bg, color) => ({ background: bg, color: color, padding: '10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.05)', boxSizing: 'border-box' });
const inputStyle = { width: '100%', padding: '8px', marginTop: '3px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '12px' };
const smallBtnStyle = { padding: '5px 10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' };
const thStyle = { padding: '6px', borderBottom: '2px solid #dee2e6' };
const tdStyle = { padding: '6px' };

export default App;