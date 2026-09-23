import express from 'express'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
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
const loginAttempts = new Map()
const sessionDuration = 8 * 60 * 60 * 1000
const sessionSecret = process.env.ADMIN_SESSION_SECRET

if (!process.env.VERCEL && (!username || !passwordSalt || !passwordHash || !sessionSecret)) {
  console.error('Admin credentials are missing. Configure ADMIN_USERNAME, ADMIN_PASSWORD_SALT, and ADMIN_PASSWORD_HASH in .env.')
  process.exit(1)
}

app.disable('x-powered-by')
app.use(express.json({ limit: '12mb' }))

async function loadProducts() {
  if (process.env.VERCEL) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return starterProducts
    const { list } = await import('@vercel/blob')
    const { blobs } = await list({ prefix: 'catalog/products.json' })
    const catalog = blobs.find(blob => blob.pathname === 'catalog/products.json')
    if (!catalog) return starterProducts
    const response = await fetch(catalog.url, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load the product catalog from Vercel Blob.')
    return response.json()
  }
  try {
    return JSON.parse(await readFile(productsFile, 'utf8'))
  } catch {
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(productsFile, JSON.stringify(starterProducts, null, 2))
    return starterProducts
  }
}

async function saveProducts(products) {
  if (process.env.VERCEL) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Product storage is not connected. Connect a Vercel Blob store to enable product changes.')
    const { put } = await import('@vercel/blob')
    await put('catalog/products.json', JSON.stringify(products), { access: 'public', addRandomSuffix: false, allowOverwrite: true })
    return
  }
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(productsFile, JSON.stringify(products, null, 2))
}

function getSession(req) {
  const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('vf_admin='))?.slice('vf_admin='.length)
  if (!token) return null
  const [expiresAtText, signature, extra] = token.split('.')
  const expiresAt = Number(expiresAtText)
  if (extra || !signature || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !sessionSecret) return null
  const expected = createHmac('sha256', sessionSecret).update(`${username}:${expiresAt}`).digest()
  let submitted
  try { submitted = Buffer.from(signature, 'base64url') } catch { return null }
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) return null
  return { token, session: { expiresAt } }
}

function requireAdmin(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'Please sign in to manage products.' })
  next()
}
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sri-vaibhav-fashions-api' })
})

app.get('/api/products', asyncRoute(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await loadProducts())
}))

app.post('/api/admin/login', (req, res, next) => {
  if (!username || !passwordSalt || !passwordHash || !sessionSecret) return res.status(503).json({ error: 'Admin login is not configured on this deployment.' })
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
  const expiresAt = Date.now() + sessionDuration
  const signature = createHmac('sha256', sessionSecret).update(`${username}:${expiresAt}`).digest('base64url')
  const token = `${expiresAt}.${signature}`
  res.setHeader('Set-Cookie', `vf_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDuration / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  res.json({ authenticated: true })
})

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(getSession(req)) })
})

app.post('/api/admin/logout', (req, res) => {
  const current = getSession(req)
  res.setHeader('Set-Cookie', `vf_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  res.json({ authenticated: false })
})

app.post('/api/products', requireAdmin, asyncRoute(async (req, res) => {
  const product = req.body
  if (!product?.name?.trim() || !Number.isFinite(Number(product.price)) || !product.image) return res.status(400).json({ error: 'A product name, valid price, and image are required.' })
  const products = await loadProducts()
  const saved = { ...product, id: `product-${randomBytes(8).toString('hex')}`, name: product.name.trim(), price: Number(product.price) }
  products.unshift(saved)
  try { await saveProducts(products) } catch (error) { return res.status(503).json({ error: error.message }) }
  res.status(201).json(saved)
}))

app.put('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const products = await loadProducts()
  const index = products.findIndex(product => product.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Product not found.' })
  const incoming = req.body
  if (!incoming?.name?.trim() || !Number.isFinite(Number(incoming.price)) || !incoming.image) return res.status(400).json({ error: 'A product name, valid price, and image are required.' })
  products[index] = { ...incoming, id: req.params.id, name: incoming.name.trim(), price: Number(incoming.price) }
  try { await saveProducts(products) } catch (error) { return res.status(503).json({ error: error.message }) }
  res.json(products[index])
}))

app.delete('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const products = await loadProducts()
  const next = products.filter(product => product.id !== req.params.id)
  if (next.length === products.length) return res.status(404).json({ error: 'Product not found.' })
  try { await saveProducts(next) } catch (error) { return res.status(503).json({ error: error.message }) }
  res.json({ deleted: true })
}))

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'The request could not be completed.' })
})

export { app }

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Sri Vaibhav Fashions API listening on http://localhost:${port}`)
  })
}
