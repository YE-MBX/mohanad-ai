const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'mohanad_secret_key';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mhndalaqsh2@gmail.com';
const DATA_DIR = process.env.DATA_DIR || './data';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

function loadJson(file, def) {
  try { return fs.existsSync(file)? JSON.parse(fs.readFileSync(file)) : def; } catch { return def; }
}
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

let users = loadJson(USERS_FILE, []);
let chats = loadJson(CHATS_FILE, []);

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Register
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User exists' });
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), email, password: hashed, name, role: email === ADMIN_EMAIL? 'admin' : 'user' };
  users.push(user);
  saveJson(USERS_FILE, users);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'User not found' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Wrong password' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Chat with Claude
app.post('/api/chat', auth, async (req, res) => {
  const { message } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: message }]
      })
    });
    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Error';

    const chat = { id: Date.now().toString(), userId: req.user.id, userEmail: req.user.email, message, reply, time: new Date().toISOString() };
    chats.push(chat);
    saveJson(CHATS_FILE, chats);

    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin - get all users
app.get('/api/admin/users', auth, (req, res) => {
  if (req.user.role!== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role })));
});

// Admin - get all chats
app.get('/api/admin/chats', auth, (req, res) => {
  if (req.user.role!== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json(chats);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));