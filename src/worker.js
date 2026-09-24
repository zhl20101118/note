// ========== 配置区域 ==========
const KV_BINDING_NAME = "NOTE-KV";  // 改成你在 Cloudflare 绑定 KV 时填写的 Variable name
const ADMIN_USER = "zhl2010";
const ADMIN_PASS = "123456";
const ADMIN_TOKEN = "admin_secure_token_24gh2g2gh9h";
// ==============================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // 获取 KV 存储
    const kv = env[KV_BINDING_NAME];
    if (!kv) {
      return new Response("KV binding not found. Please check your binding name.", { status: 500 });
    }

    // 1. 收集验证码
    if (pathname === "/" && method === "GET") {
      const code = url.searchParams.get("collect");
      if (!code) return new Response("请使用 ?collect=你的验证码 来提交。", { status: 400 });
      const id = crypto.randomUUID();
      const now = new Date();
      const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const timestamp = beijingTime.toISOString().replace("T", " ").slice(0, 19);
      await kv.put(id, JSON.stringify({ id, code, time: timestamp }));
      return new Response(`✅ 验证码已收到！ID: ${id}`, { status: 200 });
    }

    // 2. 登录页面
    if (pathname === "/login" && method === "GET") {
      return new Response(getLoginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 3. 登录处理
    if (pathname === "/login" && method === "POST") {
      const formData = await request.formData();
      const username = formData.get("username");
      const password = formData.get("password");
      if (username === ADMIN_USER && password === ADMIN_PASS) {
        const cookie = `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`;
        return new Response(null, { status: 302, headers: { Location: "/admin", "Set-Cookie": cookie } });
      }
      return new Response("用户名或密码错误", { status: 401 });
    }

    // 4. 管理后台界面
    if (pathname === "/admin" && method === "GET") {
      const cookie = request.headers.get("Cookie") || "";
      if (!cookie.includes(`admin_token=${ADMIN_TOKEN}`)) {
        return new Response(null, { status: 302, headers: { Location: "/login" } });
      }
      return new Response(getAdminPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 5. API: 获取所有验证码
    if (pathname === "/code/" && method === "GET") {
      const cookie = request.headers.get("Cookie") || "";
      if (!cookie.includes(`admin_token=${ADMIN_TOKEN}`)) return new Response("Unauthorized", { status: 401 });
      const keys = await kv.list();
      // 并发读取所有 KV，避免逐条串行 await 造成的长时间等待
      const allData = (await Promise.all(
        keys.keys.map(async (key) => {
          const value = await kv.get(key.name);
          if (!value) return null;
          try { return JSON.parse(value); } catch { return null; }
        })
      )).filter(Boolean);
      allData.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      return new Response(JSON.stringify(allData), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 6. API: 删除验证码
    if (pathname === "/delete" && method === "DELETE") {
      const cookie = request.headers.get("Cookie") || "";
      if (!cookie.includes(`admin_token=${ADMIN_TOKEN}`)) return new Response("Unauthorized", { status: 401 });
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });
      const existing = await kv.get(id);
      if (!existing) return new Response("Record not found", { status: 404 });
      await kv.delete(id);
      return new Response("Deleted", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ---------- 登录页面 HTML ----------
function getLoginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .login-card {
            background: white;
            border-radius: 32px;
            padding: 48px 40px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            text-align: center;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; color: #1a202c; }
        .sub { color: #718096; margin-bottom: 32px; font-size: 14px; }
        input { width: 100%; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 24px; font-size: 16px; transition: all 0.2s; outline: none; }
        input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
        button { width: 100%; background: #667eea; color: white; border: none; padding: 14px; border-radius: 40px; font-weight: 600; font-size: 16px; cursor: pointer; transition: all 0.2s; }
        button:hover { background: #5a67d8; transform: translateY(-1px); }
        .error { color: #e53e3e; margin-top: 16px; font-size: 14px; }
    </style>
</head>
<body>
<div class="login-card">
    <h1>📋 验证码管理后台</h1>
    <div class="sub">请输入您的账号和密码</div>
    <form id="loginForm">
        <input type="text" name="username" placeholder="用户名" autocomplete="off" required>
        <input type="password" name="password" placeholder="密码" required>
        <button type="submit">登 录</button>
        <div id="errorMsg" class="error"></div>
    </form>
</div>
<script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const resp = await fetch('/login', { method: 'POST', body: formData });
        if (resp.ok) { window.location.href = '/admin'; } else { document.getElementById('errorMsg').innerText = '用户名或密码错误'; }
    });
</script>
</body>
</html>`;
}

// ---------- 管理后台页面 HTML ----------
function getAdminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>验证码管理后台</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f1f5f9; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 24px; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; flex-wrap: wrap; gap: 16px; }
        h1 { font-size: 28px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 10px; }
        .logout-btn { background: #ef4444; color: white; border: none; padding: 8px 24px; border-radius: 40px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .logout-btn:hover { background: #dc2626; }
        .stats-bar { background: white; border-radius: 20px; padding: 20px 28px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-item { display: flex; align-items: baseline; gap: 12px; background: #f8fafc; padding: 8px 20px; border-radius: 40px; }
        .stat-label { font-size: 14px; color: #475569; font-weight: 500; }
        .stat-number { font-size: 28px; font-weight: 700; color: #3b82f6; }
        .refresh-btn { background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 40px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .refresh-btn:hover { background: #2563eb; }
        .card { background: white; border-radius: 24px; box-shadow: 0 4px 6px -2px rgba(0,0,0,0.05); overflow: hidden; }
        .table-wrapper { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 18px 16px; background: #f8fafc; color: #1e293b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
        td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        tr:hover { background: #fefce8; }
        .code-badge { background: #eef2ff; color: #1e40af; font-family: 'SF Mono', monospace; padding: 6px 14px; border-radius: 40px; font-size: 13px; font-weight: 500; display: inline-block; }
        .time-cell { font-family: monospace; font-size: 13px; color: #475569; }
        .delete-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 20px; padding: 6px 12px; border-radius: 40px; transition: all 0.2s; }
        .delete-btn:hover { background: #fee2e2; transform: scale(1.05); }
        .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
        .loading { text-align: center; padding: 40px; color: #3b82f6; }
        footer { text-align: center; margin-top: 32px; color: #64748b; font-size: 12px; }
        .pagination { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-top: 1px solid #e2e8f0; flex-wrap: wrap; gap: 12px; }
        .page-info { font-size: 14px; color: #475569; }
        .page-info b { color: #0f172a; }
        .page-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .page-btn { min-width: 40px; height: 40px; padding: 0 12px; border: 1px solid #e2e8f0; background: white; color: #334155; font-size: 13px; font-weight: 500; border-radius: 40px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
        .page-btn:hover:not(:disabled):not(.active) { border-color: #3b82f6; color: #3b82f6; }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; font-weight: 600; }
        .page-ellipsis { color: #94a3b8; padding: 0 2px; font-size: 13px; }
        .page-jump { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #475569; }
        .page-jump input { width: 54px; height: 40px; padding: 0 6px; border: 1px solid #e2e8f0; border-radius: 40px; text-align: center; font-size: 13px; outline: none; transition: border-color 0.2s; }
        .page-jump input:focus { border-color: #3b82f6; }
        .page-jump .go-btn { height: 40px; padding: 0 16px; background: #3b82f6; color: white; border: none; border-radius: 40px; cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.2s; }
        .page-jump .go-btn:hover { background: #2563eb; }
        .theme-btn { background: white; color: #334155; border: 1px solid #e2e8f0; padding: 8px 20px; border-radius: 40px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .theme-btn:hover { border-color: #3b82f6; color: #3b82f6; }
        body.dark { background: #0b1220; }
        body.dark h1 { color: #e2e8f0; }
        body.dark .card, body.dark .stats-bar { background: #1e293b; box-shadow: none; }
        body.dark .stat-item { background: #334155; }
        body.dark .stat-label { color: #cbd5e1; }
        body.dark th { background: #233047; color: #e2e8f0; border-bottom-color: #334155; }
        body.dark td { border-bottom-color: #283548; }
        body.dark tr:hover td { background: #243044; }
        body.dark .code-badge { background: #1e3a8a; color: #bfdbfe; }
        body.dark .time-cell { color: #94a3b8; }
        body.dark .pagination { border-top-color: #334155; }
        body.dark .page-info, body.dark .page-jump { color: #94a3b8; }
        body.dark .page-info b { color: #e2e8f0; }
        body.dark .page-btn { background: #283548; color: #e2e8f0; border-color: #334155; }
        body.dark .page-btn:hover:not(:disabled):not(.active) { border-color: #60a5fa; color: #bfdbfe; }
        body.dark .page-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
        body.dark .page-ellipsis { color: #64748b; }
        body.dark .page-jump input { background: #283548; color: #e2e8f0; border-color: #334155; }
        body.dark .page-jump input:focus { border-color: #60a5fa; }
        body.dark .delete-btn { color: #f87171; }
        body.dark .delete-btn:hover { background: #3b1f2a; }
        body.dark .empty-state, body.dark footer { color: #64748b; }
        body.dark .theme-btn { background: #1e293b; border-color: #334155; color: #e2e8f0; }
        body.dark .theme-btn:hover { border-color: #60a5fa; color: #bfdbfe; }
        @media (max-width: 640px) { body { padding: 16px; } th, td { padding: 12px 10px; } .stats-bar { flex-direction: column; align-items: stretch; } }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>📨 短信验证码看板 <span style="font-size: 14px; background:#e2e8f0; padding:4px 12px; border-radius:40px;">管理版</span></h1>
        <div style="display:flex; gap:12px; align-items:center;">
            <button class="theme-btn" id="themeBtn">🌙 暗色</button>
            <button class="logout-btn" id="logoutBtn">🚪 退出登录</button>
        </div>
    </div>
    <div class="stats-bar">
        <div class="stat-item"><span class="stat-label">📊 总记录数</span><span class="stat-number" id="totalCount">0</span></div>
        <div class="stat-item"><span class="stat-label">🕐 最后更新</span><span class="stat-number" id="lastUpdate" style="font-size: 16px;">--:--:--</span></div>
        <button class="refresh-btn" id="refreshBtn">🔄 刷新数据</button>
    </div>
    <div class="card">
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="min-width:260px;">🔢 验证码内容</th>
                        <th style="min-width:150px;">⏰ 接收时间 (北京时间)</th>
                        <th style="width:90px">操作</th>
                    </tr>
                </thead>
                <tbody id="tableBody"><tr><td colspan="3" class="loading">加载中...</td></tr></tbody>
            </table>
        </div>
        <div class="pagination">
            <div class="page-info" id="pageInfo"></div>
            <div class="page-controls" id="pageControls"></div>
            <div class="page-jump"><span>跳至</span><input type="number" id="jumpPage" min="1"><button class="go-btn" id="jumpGo">页</button></div>
        </div>
    </div>
    <footer>Powered by Cloudflare Workers & KV | 只有管理员可以删除 | 每页分页显示</footer>
</div>
<script>
    const PAGE_SIZE = 50;
    let currentData = [];
    let currentPage = 1;
    function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&"'<>]/g, function (m) { const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }; return map[m]; }); }
    function totalPages() { return Math.max(1, Math.ceil(currentData.length / PAGE_SIZE)); }
    function render() {
        const tbody = document.getElementById('tableBody');
        if (currentData.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">✨ 暂无验证码，等待接收...</td></tr>'; }
        else {
            const start = (currentPage - 1) * PAGE_SIZE;
            const pageItems = currentData.slice(start, start + PAGE_SIZE);
            tbody.innerHTML = pageItems.map((item, i) => \`
                <tr>
                    <td><span class="code-badge">\${escapeHtml(item.code)}</span></td>
                    <td class="time-cell">\${escapeHtml(item.time)}</td>
                    <td><button class="delete-btn" data-id="\${escapeHtml(item.id)}" title="删除">🗑️</button></td>
                </tr>\`).join('');
            document.querySelectorAll('.delete-btn').forEach(btn => { btn.addEventListener('click', () => { if (confirm('确定要删除这条记录吗？')) deleteRecord(btn.getAttribute('data-id')); }); });
        }
        renderPagination();
    }
    function paginationWindow() {
        const tp = totalPages();
        const out = [1];
        let prev = 1;
        for (let p = 2; p < tp; p++) {
            const showThis = p <= currentPage + 2 && p >= currentPage - 2;
            const showEdge = p === tp - 1;
            if (showThis || showEdge) { if (p - prev > 1) out.push('...'); out.push(p); prev = p; }
        }
        if (tp > 1) { if (tp - prev > 1) out.push('...'); out.push(tp); }
        return out;
    }
    function renderPagination() {
        const tp = totalPages();
        document.getElementById('pageInfo').innerHTML = '第 <b>' + currentPage + '</b> / ' + tp + ' 页，共 <b>' + currentData.length + '</b> 条';
        const wrap = document.getElementById('pageControls');
        if (tp <= 1) { wrap.innerHTML = ''; return; }
        const mk = (label, page, isActive) => { const b = document.createElement('button'); b.className = 'page-btn' + (isActive ? ' active' : ''); b.textContent = label; b.onclick = () => { currentPage = page; render(); }; return b; };
        wrap.innerHTML = '';
        const prevBtn = document.createElement('button'); prevBtn.className = 'page-btn'; prevBtn.textContent = '‹ 上一页'; prevBtn.disabled = currentPage <= 1; if (currentPage > 1) prevBtn.onclick = () => { currentPage--; render(); }; wrap.appendChild(prevBtn);
        paginationWindow().forEach(item => { if (item === '...') { const s = document.createElement('span'); s.className = 'page-ellipsis'; s.textContent = '…'; wrap.appendChild(s); } else { wrap.appendChild(mk(item, item, item === currentPage)); } });
        const nextBtn = document.createElement('button'); nextBtn.className = 'page-btn'; nextBtn.textContent = '下一页 ›'; nextBtn.disabled = currentPage >= tp; if (currentPage < tp) nextBtn.onclick = () => { currentPage++; render(); }; wrap.appendChild(nextBtn);
    }
    function setJumpInput() { document.getElementById('jumpPage').value = currentPage; }
    function handleJump() { let p = parseInt(document.getElementById('jumpPage').value, 10); if (isNaN(p)) p = 1; p = Math.max(1, Math.min(totalPages(), p)); currentPage = p; setJumpInput(); render(); }
    async function loadData(keepPage) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '<tr><td colspan="3" class="loading">⌛ 加载中...</td></tr>';
        try {
            const resp = await fetch('/code/');
            if (!resp.ok) { if (resp.status === 401) window.location.href = '/login'; throw new Error('加载失败'); }
            const data = await resp.json();
            currentData = data;
            if (!keepPage) currentPage = 1;
            if (currentPage > totalPages()) currentPage = totalPages();
            document.getElementById('totalCount').textContent = data.length;
            const now = new Date(); const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            document.getElementById('lastUpdate').textContent = bj.toISOString().replace('T', ' ').slice(0, 19);
            setJumpInput(); render();
        } catch (err) { console.error(err); tbody.innerHTML = '<tr><td colspan="3" class="empty-state">❌ 加载失败，请检查网络</td></tr>'; }
    }
    async function deleteRecord(id) {
        try {
            const resp = await fetch('/delete?id=' + encodeURIComponent(id), { method: 'DELETE' });
            if (resp.ok) { loadData(true); } else { alert('删除失败，请重试'); }
        } catch (err) { alert('网络错误'); }
    }
    document.getElementById('refreshBtn').addEventListener('click', () => loadData(true));
    document.getElementById('logoutBtn').addEventListener('click', () => { document.cookie = 'admin_token=; Path=/; Max-Age=0'; window.location.href = '/login'; });
    document.getElementById('jumpGo').addEventListener('click', handleJump);
    document.getElementById('jumpPage').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleJump(); });
    function initTheme() { let saved = localStorage.getItem('theme'); if (!saved) saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; applyTheme(saved); }
    function applyTheme(t) { document.body.classList.toggle('dark', t === 'dark'); document.getElementById('themeBtn').textContent = t === 'dark' ? '☀️ 亮色' : '🌙 暗色'; localStorage.setItem('theme', t); }
    document.getElementById('themeBtn').addEventListener('click', () => { const cur = document.body.classList.contains('dark') ? 'dark' : 'light'; applyTheme(cur === 'dark' ? 'light' : 'dark'); });
    loadData(false);
    setInterval(() => loadData(true), 30000);
</script>
</body>
</html>`;
}
