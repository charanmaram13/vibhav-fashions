import express from 'express'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb'
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
  if (process.env.MONGODB_URI) {
    const { collection } = await getMongoStore()
    let products = await collection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray()
    if (!products.length) {
      await collection.insertMany(starterProducts)
      products = starterProducts
    }
    return products
  }
  if (process.env.VERCEL) return starterProducts
  try {
    return JSON.parse(await readFile(productsFile, 'utf8'))
  } catch {
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(productsFile, JSON.stringify(starterProducts, null, 2))
    return starterProducts
  }
}

async function saveProducts(products) {
  if (process.env.VERCEL) throw new Error('Product storage is not connected. Configure MONGODB_URI to enable product changes.')
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(productsFile, JSON.stringify(products, null, 2))
}

async function getMongoStore() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MongoDB is not connected. Configure MONGODB_URI to enable product changes.')
  if (!globalThis.sriVaibhavMongoClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
    globalThis.sriVaibhavMongoClientPromise = client.connect()
  }
  const client = await globalThis.sriVaibhavMongoClientPromise
  const db = client.db(process.env.MONGODB_DB || 'sri_vaibhav_fashions')
  return { collection: db.collection('products'), images: new GridFSBucket(db, { bucketName: 'productImages' }) }
}

async function storeProductImage(image) {
  if (!process.env.MONGODB_URI || !image.startsWith('data:image/')) return image
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/)
  if (!match) throw new Error('Choose a JPEG, PNG, or WebP product photo.')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 3 * 1024 * 1024) throw new Error('Product photos must be 3 MB or smaller after compression.')
  const { images } = await getMongoStore()
  return new Promise((resolve, reject) => {
    const upload = images.openUploadStream(`product-${Date.now()}`, { metadata: { contentType: match[1] } })
    upload.once('error', reject)
    upload.once('finish', () => resolve(`/api/images/${upload.id.toString()}`))
    upload.end(buffer)
  })
}

async function deleteStoredImage(image) {
  const match = image?.match(/^\/api\/images\/([a-f\d]{24})$/i)
  if (!match || !process.env.MONGODB_URI) return
  try {
    const { images } = await getMongoStore()
    await images.delete(new ObjectId(match[1]))
  } catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove the old product photo:', error.message) }
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

app.get('/api/images/:id', asyncRoute(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).end()
  const id = new ObjectId(req.params.id)
  const { images } = await getMongoStore()
  const file = await images.find({ _id: id }).limit(1).next()
  if (!file) return res.status(404).end()
  res.setHeader('Content-Type', file.metadata?.contentType || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  const stream = images.openDownloadStream(id)
  stream.on('error', error => { if (!res.headersSent) res.status(404).end(); else res.destroy(error) })
  stream.pipe(res)
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
  let saved
  try {
    saved = { ...product, id: `product-${randomBytes(8).toString('hex')}`, name: product.name.trim(), price: Number(product.price), image: await storeProductImage(product.image), createdAt: Date.now() }
    if (process.env.MONGODB_URI) { const { collection } = await getMongoStore(); await collection.insertOne(saved) }
    else { const products = await loadProducts(); products.unshift(saved); await saveProducts(products) }
  } catch (error) { return res.status(503).json({ error: error.message }) }
  res.status(201).json(saved)
}))

app.put('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const products = await loadProducts()
  const index = products.findIndex(product => product.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: 'Product not found.' })
  const incoming = req.body
  if (!incoming?.name?.trim() || !Number.isFinite(Number(incoming.price)) || !incoming.image) return res.status(400).json({ error: 'A product name, valid price, and image are required.' })
  let saved
  try {
    saved = { ...incoming, id: req.params.id, name: incoming.name.trim(), price: Number(incoming.price), image: await storeProductImage(incoming.image) }
    if (process.env.MONGODB_URI) { const { collection } = await getMongoStore(); await collection.replaceOne({ id: req.params.id }, saved) }
    else { products[index] = saved; await saveProducts(products) }
  } catch (error) { return res.status(503).json({ error: error.message }) }
  if (saved.image !== products[index].image) await deleteStoredImage(products[index].image)
  res.json(saved)
}))

app.delete('/api/products/:id', requireAdmin, asyncRoute(async (req, res) => {
  const products = await loadProducts()
  const existing = products.find(product => product.id === req.params.id)
  if (!existing) return res.status(404).json({ error: 'Product not found.' })
  try {
    if (process.env.MONGODB_URI) { const { collection } = await getMongoStore(); await collection.deleteOne({ id: req.params.id }) }
    else await saveProducts(products.filter(product => product.id !== req.params.id))
  } catch (error) { return res.status(503).json({ error: error.message }) }
  await deleteStoredImage(existing.image)
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
