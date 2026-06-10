// QTC Admin Dashboard JavaScript

let adminToken = '';
let chart7 = null;
let chart30 = null;

// --- Auth ---
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const tokenInput = document.getElementById('tokenInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const headerTime = document.getElementById('headerTime');

// Check for saved token
const savedToken = sessionStorage.getItem('qtc_admin_token');
if (savedToken) {
  adminToken = savedToken;
  showDashboard();
}

function showDashboard() {
  loginScreen.style.display = 'none';
  dashboard.style.display = 'block';
  loadPVStats();
  loadImportHistory();
  updateTime();
  setInterval(updateTime, 60000);
}

function updateTime() {
  const now = new Date();
  headerTime.textContent = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

loginBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    loginError.textContent = '请输入 Token';
    return;
  }

  // Validate token by calling an admin endpoint
  try {
    const res = await fetch('/admin/import-history', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) {
      loginError.textContent = 'Token 无效';
      return;
    }
    adminToken = token;
    sessionStorage.setItem('qtc_admin_token', token);
    loginError.textContent = '';
    showDashboard();
  } catch (e) {
    loginError.textContent = '网络错误，请重试';
  }
});

tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', () => {
  adminToken = '';
  sessionStorage.removeItem('qtc_admin_token');
  dashboard.style.display = 'none';
  loginScreen.style.display = 'flex';
  tokenInput.value = '';
  if (chart7) { chart7.destroy(); chart7 = null; }
  if (chart30) { chart30.destroy(); chart30 = null; }
});

// --- Auth wrapper ---
async function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${adminToken}`,
    },
  });
}

// --- PV Stats ---
async function loadPVStats() {
  try {
    const res = await adminFetch('/admin/pv-stats');
    const data = await res.json();
    if (!data.ok) return;

    const s = data.stats;
    document.getElementById('statTodayPV').textContent = s.todayPV.toLocaleString();
    document.getElementById('statYesterdayPV').textContent = s.yesterdayPV.toLocaleString();
    document.getElementById('statTotalPV').textContent = s.totalPV.toLocaleString();
    document.getElementById('statTodayVisitors').textContent = s.todayVisitors.toLocaleString();
    document.getElementById('statTotalVisitors').textContent = s.totalVisitors.toLocaleString();

    // Charts
    renderChart('chart7Days', chart7, s.last7Days, (c) => { chart7 = c; });
    renderChart('chart30Days', chart30, s.last30Days, (c) => { chart30 = c; });
  } catch (e) {
    console.error('Failed to load PV stats:', e);
  }
}

function renderChart(canvasId, existingChart, data, setRef) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (existingChart) existingChart.destroy();

  const labels = data.map(d => d.date.slice(5));
  const values = data.map(d => d.pv);

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'PV',
        data: values,
        backgroundColor: 'rgba(10, 132, 255, 0.5)',
        borderColor: '#0a84ff',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#8e8e9a', font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#8e8e9a', font: { size: 11 }, precision: 0 },
          grid: { color: 'rgba(255,255,255,0.05)' },
          beginAtZero: true,
        },
      },
    },
  });
  setRef(chart);
}

// --- Import History ---
async function loadImportHistory() {
  try {
    const res = await adminFetch('/admin/import-history');
    const data = await res.json();
    const tbody = document.getElementById('historyBody');
    if (!data.ok || !data.history?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无导入记录</td></tr>';
      return;
    }

    tbody.innerHTML = data.history.map(h => {
      const time = parseLocalTime(h.imported_at);
      return `<tr>
        <td>${time}</td>
        <td>${esc(h.file_name)}</td>
        <td class="status-${h.status === 'success' ? 'success' : 'failed'}">${h.status === 'success' ? '成功' : '失败'}</td>
        <td>${h.added || 0}</td>
        <td>${h.overwritten || 0}</td>
        <td>${esc(h.message || '')}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load import history:', e);
  }
}

function parseLocalTime(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z')).toLocaleString('zh-CN');
  } catch { return isoStr; }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Excel Upload ---
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const uploadResult = document.getElementById('uploadResult');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const files = e.dataTransfer?.files;
  if (files?.length) handleUpload(files[0]);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleUpload(file);
  fileInput.value = '';
});

async function handleUpload(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') {
    showResult('不支持的文件格式，请上传 .xlsx 或 .xls 文件', 'error');
    return;
  }

  uploadProgress.style.display = 'block';
  uploadResult.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await adminFetch('/admin/upload-excel', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    uploadProgress.style.display = 'none';

    if (!data.ok) {
      showResult(data.message || '上传失败', 'error');
      return;
    }

    const r = data.result;
    showResult(`${r.message || '导入完成'}`, 'success');
    loadImportHistory();
    loadPVStats();
  } catch (e) {
    uploadProgress.style.display = 'none';
    showResult(`上传失败：${e.message}`, 'error');
  }
}

function showResult(message, type) {
  uploadResult.style.display = 'block';
  uploadResult.innerHTML = `<div class="result-card ${type}">${esc(message)}</div>`;
}