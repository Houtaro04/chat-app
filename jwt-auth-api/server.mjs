import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// App

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Model
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: String,
  passwordHash: String,
});
const User = mongoose.model('User', userSchema);

// Healthcheck
app.get('/health', (_req, res) => res.send('ok'));

// Register
app.post('/v1/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ message: 'username & password required' });

  if (await User.findOne({ username }))
    return res.status(409).json({ message: 'username already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const u = await User.create({ username, email, passwordHash });
  res.json({ id: u._id, username: u.username, email: u.email });
});

// Login (accept Basic or JSON body)
app.post('/v1/auth/login', async (req, res) => {
  const auth = req.headers.authorization || '';
  let username, password;
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    [username, password] = Buffer.from(encoded, 'base64').toString().split(':');
  } else {
    username = req.body?.username;
    password = req.body?.password;
  }
  if (!username || !password)
    return res.status(400).json({ message: 'username & password required' });

  const u = await User.findOne({ username });
  if (!u) return res.status(400).json({ message: 'invalid credentials' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.status(400).json({ message: 'invalid credentials' });

  const token = jwt.sign({ id: u._id, username: u.username }, process.env.JWT_SECRET || 'dev_secret');
  res.json({ user: { id: u._id, username: u.username, email: u.email }, token });
});

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URL;
if (!MONGO_URI) {
  console.error('❌ Missing MONGO_URL. Create jwt-auth-api/.env with MONGO_URL=...');
  process.exit(1);
}
console.log('MONGO_URL loaded:', MONGO_URI.split('@')[1]?.split('/')[0] || 'local');

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, '0.0.0.0', () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Mongo connection failed:', err.message);
    process.exit(1);
  });
