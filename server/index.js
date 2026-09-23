import express from 'express'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { products as starterProducts } from '../src/data/products.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dataDirectory = path.join(here, 'data')
const productsFile = path.join(dataDirectory, 'products.json')
const envFile = path.join(root, '.env')

try {
  const envText = await readFile(envFile, 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] == null) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {}

const app = express()
const port = Number(process.env.PORT) || 4000
const username = process.env.ADMIN_USERNAME
const passwordSalt = process.env.ADMIN_PASSWORD_SALT
const passwordHash = process.env.ADMIN_PASSWORD_HASH
const sessions = new Map()
const loginAttempts = new Map()
const sessionDuration = 8 * 60 * 60 * 1000

if (!username || !passwordSalt || !passwordHash) {
  console.error('Admin credentials are missing. Configure ADMIN_USERNAME, ADMIN_PASSWORD_SALT, and ADMIN_PASSWORD_HASH in .env.')
  process.exit(1)
}

app.disable('x-powered-by')
app.use(express.json({ limit: '12mb' }))

async function loadProducts() {
  try {
    return JSON.parse(await readFile(productsFile, 'utf8'))
  } catch {
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(productsFile, JSON.stringify(starterProducts, null, 2))
    return starterProducts
  }
}

async function saveProducts(products) {
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(productsFile, JSON.stringify(products, null, 2))
}

function getSession(req) {
  const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('vf_admin='))?.slice('vf_admin='.length)
  if (!token) return null
  const session = sessions.get(token)
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return { token, session }
}

function requireAdmin(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'Please sign in to manage products.' })
  next()
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sri-vaibhav-fashions-api' })
})

app.get('/api/products', async (_req, res) => {
  res.json(await loadProducts())
})

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown'
  const attempts = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 }
  if (attempts.resetAt < Date.now()) { attempts.count = 0; attempts.resetAt = Date.now() + 15 * 60 * 1000 }
  if (attempts.count >= 8) return res.status(429).json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' })

  const submittedUser = String(req.body?.username || '')
  const submittedPassword = String(req.body?.password || '')
  const userMatches = submittedUser === username
  const candidateHash = scryptSync(submittedPassword, passwordSalt, 64)
  const expectedHash = Buffer.from(passwordHash, 'hex')
  const passwordMatches = expectedHash.length === candidateHash.length && timingSafeEqual(candidateHash, expectedHash)
  if (!userMatches || !passwordMatches) {
    attempts.count += 1
    loginAttempts.set(ip, attempts)
    return res.status(401).json({ error: 'Username or password is incorrect.' })
  }

  loginAttempts.delete(ip)
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, { expiresAt: Date.now() + sessionDuration })
  res.setHeader('Set-Cookie', `vf_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDuration / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  res.json({ authenticated: true })
})

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(getSession(req)) })
})

app.post('/api/admin/logout', (req, res) => {
  const current = getSession(req)
  if (current) sessions.delete(current.token)
  res.setHeader('Set-Cookie', `vf_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  res.json({ authenticated: false })
})

app.post('/api/products', requireAdmin, async (req, res) => {
  const product = req.body
  if (!product?.name?.trim() || !Number.isFinite(Number(product.price)) || !product.image) return res.status(400).json({ error: 'A product name, valid price, and image are required.' })
  const products = await loadProducts()
  const saved = { ...product, id: `product-${randomBytes(8).toString('hex')}`, name: product.name.trim(), price: Number(product.price) }
  products.unshift(saved)
  await saveProducts(products)
  res.status(201).json(saved)
})

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const products = await loadProducts()
  const index = products.findIndex(product => product.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Product not found.' })
  const incoming = req.body
  if (!incoming?.name?.trim() || !Number.isFinite(Number(incoming.price)) || !incoming.image) return res.status(400).json({ error: 'A product name, valid price, and image are required.' })
  products[index] = { ...incoming, id: req.params.id, name: incoming.name.trim(), price: Number(incoming.price) }
  await saveProducts(products)
  res.json(products[index])
})

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const products = await loadProducts()
  const next = products.filter(product => product.id !== req.params.id)
  if (next.length === products.length) return res.status(404).json({ error: 'Product not found.' })
  await saveProducts(next)
  res.json({ deleted: true })
})

app.listen(port, () => {
  console.log(`Sri Vaibhav Fashions API listening on http://localhost:${port}`)
})
