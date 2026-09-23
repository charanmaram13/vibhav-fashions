import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Instagram, LockKeyhole, LogOut, MapPin, MessageCircle, Plus, Search, ShieldCheck, Store, Upload, X } from 'lucide-react'
import ProductCard from './components/ProductCard.jsx'
import ProductModal from './components/ProductModal.jsx'
import { banners } from './data/banners.js'
import { products as sampleProducts } from './data/products.js'

const STORE = 'vibhav-fashions-products'
const categories = ["Men's", 'Kids']

function readProducts() {
  try { return JSON.parse(localStorage.getItem(STORE)) || sampleProducts } catch { return sampleProducts }
}

function App() {
  const [items, setItems] = useState(readProducts)
  const [category, setCategory] = useState("Men's")
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [loginUser, setLoginUser] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [introVisible, setIntroVisible] = useState(true)
  const [introReady, setIntroReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState({ name: '', category: 'Men', price: '', salePrice: '', sizes: [], description: '', image: '', isNewArrival: true, isFeatured: false })
  const fileInput = useRef(null)

  useEffect(() => {
    const reveal = window.setTimeout(() => setIntroReady(true), 1450)
    const dismiss = window.setTimeout(() => setIntroVisible(false), 1850)
    return () => { window.clearTimeout(reveal); window.clearTimeout(dismiss) }
  }, [])

  useEffect(() => {
    fetch('/api/products').then(response => response.ok ? response.json() : Promise.reject()).then(products => {
      if (Array.isArray(products)) { setItems(products); localStorage.setItem(STORE, JSON.stringify(products)) }
    }).catch(() => {})
  }, [])

  const visible = useMemo(() => items.filter(item => {
    const categoryMatch = item.category === (category === "Men's" ? 'Men' : 'Kids')
    return categoryMatch && item.name.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)), [items, category, search])
  const saveItems = next => { setItems(next); localStorage.setItem(STORE, JSON.stringify(next)) }
  const openProduct = product => setSelected(product)
  const saveProduct = async event => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.price || !draft.image) return
    const existing = items.find(item => item.id === editingId)
    const product = { ...(editingId ? existing : {}), ...draft, id: editingId, price: Number(draft.price), salePrice: draft.salePrice ? Number(draft.salePrice) : null, sizes: draft.sizes.length ? draft.sizes : ['One size'], badge: draft.isNewArrival ? 'NEW' : '', createdAt: existing?.createdAt || Date.now() }
    try {
      const response = await fetch(editingId ? `/api/products/${encodeURIComponent(editingId)}` : '/api/products', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save this product.')
      saveItems(editingId ? items.map(item => item.id === editingId ? result : item) : [result, ...items])
    } catch (error) { setNotice(error.message); window.setTimeout(() => setNotice(''), 3000); return }
    setEditingId(null)
    setDraft({ name: '', category: 'Men', price: '', salePrice: '', sizes: [], description: '', image: '', isNewArrival: true, isFeatured: false })
    setNotice(editingId ? 'Product updated.' : 'Product added.')
    window.setTimeout(() => setNotice(''), 2500)
  }
  const editProduct = product => {
    setEditingId(product.id)
    setDraft({ name: product.name || '', category: product.category || 'Men', price: String(product.price || ''), salePrice: product.salePrice ? String(product.salePrice) : '', sizes: product.sizes || [], description: product.description || '', image: product.image || '', isNewArrival: Boolean(product.isNewArrival ?? product.badge), isFeatured: Boolean(product.isFeatured) })
    document.querySelector('.admin-panel')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const deleteProduct = async product => {
    if (!window.confirm(`Delete “${product.name}” from the shop catalog?`)) return
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not delete this product.')
      saveItems(items.filter(item => item.id !== product.id))
    } catch (error) { setNotice(error.message); window.setTimeout(() => setNotice(''), 3000) }
  }
  const openAdmin = async () => {
    setAdminOpen(true)
    try {
      const response = await fetch('/api/admin/session')
      const session = await response.json()
      setAdminAuthenticated(Boolean(session.authenticated))
    } catch { setAdminAuthenticated(false) }
  }
  const signIn = async event => {
    event.preventDefault()
    setLoginBusy(true)
    setLoginError('')
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: loginUser, password: loginPassword }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not sign in.')
      setAdminAuthenticated(true)
      setLoginPassword('')
    } catch (error) { setLoginError(error.message) }
    finally { setLoginBusy(false) }
  }
  const signOut = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    setAdminAuthenticated(false)
    setEditingId(null)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft({ name: '', category: 'Men', price: '', salePrice: '', sizes: [], description: '', image: '', isNewArrival: true, isFeatured: false })
  }
  const toggleSize = size => setDraft(current => ({ ...current, sizes: current.sizes.includes(size) ? current.sizes.filter(item => item !== size) : [...current.sizes, size] }))
  const uploadPhoto = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setNotice('Choose an image file.'); return }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const image = canvas.toDataURL('image/webp', 0.8)
      if (image.length > 4 * 1024 * 1024) throw new Error('This photo is too large. Choose a smaller image.')
      setDraft(current => ({ ...current, image }))
    } catch (error) {
      setNotice(error.message || 'Could not read that photo. Choose another image.')
      window.setTimeout(() => setNotice(''), 3000)
    }
  }
  const selectCategory = value => setCategory(value)

  return <div className={`app-shell ${introReady ? 'intro-ready' : ''}`}>
    {introVisible && <div className="intro-splash" aria-label="Sri Vaibhav Fashions, Addanki"><div className="intro-lockup"><span>SRI VAIBHAV</span><span>FASHIONS</span><small>ADDANKI</small></div></div>}
    <div className="shop-page">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Sri Vaibhav Fashions, Addanki"><span className="brand-title">SRI VAIBHAV FASHIONS</span><span className="brand-location">ADDANKI</span></a>
        <nav className="header-nav" aria-label="Shop clothing category">{categories.map(item => <button key={item} className={category === item ? 'header-category active' : 'header-category'} onClick={() => selectCategory(item)}>{item.toUpperCase()}</button>)}</nav>
        <div className="header-actions">
          {searchOpen && <label className="search-field"><input autoFocus aria-label="Search styles" placeholder="Search for clothes..." value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Escape' && setSearchOpen(false)}/><button onClick={() => {setSearch('');setSearchOpen(false)}} aria-label="Close search"><X size={16}/></button></label>}
          <button className="search-trigger" aria-label={searchOpen ? 'Close search' : 'Search'} onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? <X size={18}/> : <Search size={18}/>}</button>
          <a className="social-trigger" href="https://www.instagram.com/sri_vaibhav_fashions_/" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={18}/></a>
          <a className="social-trigger" href="https://wa.me/" target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={18}/></a>
          <button className="admin-trigger" aria-label="Open shop admin" title="Shop admin" onClick={openAdmin}><ShieldCheck size={16}/></button>
        </div>
      </header>

      <main id="top" className="catalog-main">
        <section className="hero-banner">
          <picture><source media="(max-width: 650px)" srcSet={banners.hero.mobileImage}/><img src={banners.hero.desktopImage} alt={banners.hero.alt}/></picture>
          <div className="hero-banner-copy"><span>{banners.hero.eyebrow}</span><h1>SRI VAIBHAV<br/>FASHIONS</h1><small>{banners.hero.location}</small><i/><p>{banners.hero.tagline}</p><div className="hero-category-links"><button onClick={() => {selectCategory("Men's");document.querySelector('#new-arrivals')?.scrollIntoView({behavior:'smooth'})}}>MEN'S <ArrowRight size={15}/></button><button onClick={() => {selectCategory('Kids');document.querySelector('#new-arrivals')?.scrollIntoView({behavior:'smooth'})}}>KIDS <ArrowRight size={15}/></button></div></div>
        </section>

        <section className="category-banners" aria-label="Explore collections">
          <a href="#new-arrivals" className="category-banner men-banner" onClick={() => selectCategory("Men's")}>
            <img src={banners.men.image} alt={banners.men.alt} loading="lazy"/><span className="category-banner-shade"/><span className="category-banner-copy"><strong>{banners.men.label}</strong><em>{banners.men.tagline}</em><span>EXPLORE <b>→</b></span></span>
          </a>
          <a href="#new-arrivals" className="category-banner kids-banner" onClick={() => selectCategory('Kids')}>
            <img src={banners.kids.image} alt={banners.kids.alt} loading="lazy"/><span className="category-banner-shade"/><span className="category-banner-copy"><strong>{banners.kids.label}</strong><em>{banners.kids.tagline}</em><span>EXPLORE <b>→</b></span></span>
          </a>
        </section>

        <section className="benefit-row"><div><Store/><span>LATEST<br/>ARRIVALS</span></div><div><ShieldCheck/><span>QUALITY<br/>FASHION</span></div><div><MapPin/><span>VISIT OUR STORE<br/>ADDANKI</span></div><div><MessageCircle/><span>WHATSAPP<br/>SIZE HELP</span></div></section>

        <section className="arrivals-section" id="new-arrivals">
          <div className="arrivals-heading"><div><span>TRENDING NOW · LATEST FROM SRI VAIBHAV</span><h2>New arrivals</h2></div><span className="arrival-count">{visible.length} PIECES</span></div>
          {search && <div className="arrivals-toolbar"><span>SEARCH RESULTS FOR “{search}”</span><button onClick={() => setSearch('')}>CLEAR</button></div>}
          <div className="product-grid" key={category + search}>
            {visible.map(product => <ProductCard key={product.id} product={product} onSelect={openProduct}/>) }
          </div>
          {visible.length === 0 && <div className="empty-state"><p>{search ? `No styles match “${search}”.` : category === "Men's" ? "New men's arrivals coming soon." : "New kids' arrivals coming soon."}</p>{search && <button onClick={() => setSearch('')}>Clear search</button>}</div>}
        </section>
      </main>

      <section className="instagram-section"><div className="instagram-copy"><Instagram/><span>FROM OUR INSTAGRAM</span><h2>Follow Sri Vaibhav Fashions</h2><a href="https://www.instagram.com/sri_vaibhav_fashions_/" target="_blank" rel="noreferrer">@sri_vaibhav_fashions_ <ArrowRight size={15}/></a></div><p className="instagram-note">See our latest designs and arrivals on Instagram.<br/>A live feed can be connected here when available.</p></section>
      <section className="store-section"><div><span>VISIT OUR STORE</span><h2>Sri Vaibhav Fashions<br/><em>Addanki</em></h2></div><div className="store-actions"><a href="https://maps.google.com/?q=Sri+Vaibhav+Fashions+Addanki" target="_blank" rel="noreferrer">GET DIRECTIONS <ArrowRight size={16}/></a><a href="https://wa.me/" target="_blank" rel="noreferrer">WHATSAPP <MessageCircle size={16}/></a></div></section>
      <footer className="site-footer"><a className="footer-brand" href="#top">SRI VAIBHAV FASHIONS <small>ADDANKI</small></a><div><button onClick={() => {selectCategory("Men's");document.querySelector('#new-arrivals')?.scrollIntoView({behavior:'smooth'})}}>MEN'S</button><button onClick={() => {selectCategory('Kids');document.querySelector('#new-arrivals')?.scrollIntoView({behavior:'smooth'})}}>KIDS</button></div><div><a href="https://www.instagram.com/sri_vaibhav_fashions_/" target="_blank" rel="noreferrer">INSTAGRAM</a><a href="https://wa.me/" target="_blank" rel="noreferrer">WHATSAPP</a></div><a href="https://maps.google.com/?q=Sri+Vaibhav+Fashions+Addanki" target="_blank" rel="noreferrer">ADDANKI · LOCATION</a></footer>

      <ProductModal product={selected} onClose={() => setSelected(null)}/>
      {notice && <div className="toast"><Check size={15}/>{notice}</div>}

      {adminOpen && <div className="admin-backdrop" onClick={() => setAdminOpen(false)}><section className="admin-panel" onClick={event => event.stopPropagation()}>
        <div className="admin-top"><button onClick={() => setAdminOpen(false)} className="admin-back"><ArrowLeft size={17}/> SHOP</button>{adminAuthenticated ? <button onClick={signOut} className="admin-label"><LogOut size={14}/> SIGN OUT</button> : <span className="admin-label"><LockKeyhole size={14}/> ADMIN SIGN IN</span>}</div>
        {!adminAuthenticated ? <><div className="admin-heading"><span className="section-kicker">SRI VAIBHAV FASHIONS · ADDANKI</span><h2>Admin sign in</h2><p>Sign in to manage products and prices.</p></div><form className="product-form login-form" onSubmit={signIn}><label className="form-label">Username<input autoComplete="username" required value={loginUser} onChange={event => setLoginUser(event.target.value)} placeholder="Username"/></label><label className="form-label">Password<input autoComplete="current-password" type="password" required value={loginPassword} onChange={event => setLoginPassword(event.target.value)} placeholder="Password"/></label>{loginError && <p className="login-error" role="alert">{loginError}</p>}<button className="primary-button submit-product" type="submit" disabled={loginBusy}>{loginBusy ? 'SIGNING IN…' : 'SIGN IN'}</button><div className="admin-footnote"><ShieldCheck size={14}/><span>Product changes are restricted to signed-in administrators.</span></div></form></> : <>
        <div className="admin-heading"><span className="section-kicker">SRI VAIBHAV FASHIONS · ADDANKI</span><h2>{editingId ? 'Edit product' : 'Add a product'}</h2><p>Add a style to the customer catalog.</p></div>
        <form className="product-form" onSubmit={saveProduct}>
          <div className="form-photo-row"><button className={draft.image ? 'photo-upload has-photo' : 'photo-upload'} type="button" onClick={() => fileInput.current?.click()}>{draft.image ? <img src={draft.image} alt="Product preview"/> : <><Upload size={19}/><span>ADD PHOTO</span></>}</button><input ref={fileInput} type="file" accept="image/*" hidden onChange={uploadPhoto}/><div className="photo-help"><b>Product image</b><span>Clear, well-lit photos work best.</span></div></div>
          <label className="form-label">Product name<input required value={draft.name} onChange={event => setDraft({...draft,name:event.target.value})} placeholder="e.g. Cotton shirt"/></label>
          <div className="form-two-col"><label className="form-label">Category<select value={draft.category} onChange={event => setDraft({...draft,category:event.target.value})}><option>Men</option><option>Kids</option></select></label><label className="form-label">Price (₹)<input required min="1" type="number" value={draft.price} onChange={event => setDraft({...draft,price:event.target.value})} placeholder="899"/></label></div>
          <label className="form-label">Sale price (optional)<input min="1" type="number" value={draft.salePrice} onChange={event => setDraft({...draft,salePrice:event.target.value})} placeholder="e.g. 799"/></label>
          <fieldset className="sizes-field"><legend>Available sizes</legend><div>{['S','M','L','XL','XXL','2–3Y','4–5Y','6–7Y','8–9Y'].map(size => <button key={size} type="button" onClick={() => toggleSize(size)} className={draft.sizes.includes(size) ? 'size-chip chosen' : 'size-chip'}>{size}</button>)}</div></fieldset>
          <label className="form-label">Description<textarea rows="3" value={draft.description} onChange={event => setDraft({...draft,description:event.target.value})} placeholder="Optional product details"/></label>
          <div className="feature-checks"><label><input type="checkbox" checked={draft.isNewArrival} onChange={event => setDraft({...draft,isNewArrival:event.target.checked})}/> Mark as New Arrival</label><label><input type="checkbox" checked={draft.isFeatured} onChange={event => setDraft({...draft,isFeatured:event.target.checked})}/> Mark as Featured</label></div>
          <button className="primary-button submit-product" type="submit">{editingId ? 'Save changes' : <><Plus size={16}/> Add product</>}</button>
          {editingId && <button className="cancel-edit" type="button" onClick={cancelEdit}>CANCEL EDIT</button>}
        </form>
        <section className="admin-products"><h3>Manage products <span>{items.length}</span></h3>{items.map(product => <div className="admin-product-row" key={product.id}><img src={product.image} alt=""/><div><strong>{product.name}</strong><small>{product.category} · ₹{Number(product.salePrice || product.price).toLocaleString('en-IN')}</small></div><button onClick={() => editProduct(product)}>EDIT</button><button className="delete-product" onClick={() => deleteProduct(product)}>DELETE</button></div>)}</section>
        <div className="admin-footnote"><ShieldCheck size={14}/><span>Product changes are saved on this server and shared by visitors using this site.</span></div>
        </>}
      </section></div>}
    </div>
  </div>
}

export default App
