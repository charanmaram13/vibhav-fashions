import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, MessageCircle, Share2, X } from 'lucide-react'

export default function ProductModal({ product, onClose }) {
  const [activeImage, setActiveImage] = useState(0)
  useEffect(() => {
    if (!product) return
    setActiveImage(0)
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [product?.id])
  if (!product) return null
  const gallery = product.images?.length ? product.images : [product.image]
  const displayPrice = Number(product.salePrice || product.price)
  const message = encodeURIComponent(`Hi Sri Vaibhav Fashions, I am interested in the ${product.name} priced at ₹${displayPrice}.`)
  const share = async () => { if (navigator.share) await navigator.share({ title: product.name, url: window.location.href }); else if (navigator.clipboard) { await navigator.clipboard.writeText(window.location.href); alert('Link copied to clipboard') } }
  return <div className="modal-backdrop" onClick={onClose}><section className="product-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={product.name}>
    <button className="modal-close" onClick={onClose} aria-label="Close"><X/></button><div><div className="modal-image"><img src={gallery[activeImage]} alt={`${product.name}${gallery.length > 1 ? `, image ${activeImage + 1}` : ''}`}/></div>{gallery.length > 1 && <div className="modal-thumbnails">{gallery.map((image, index) => <button key={image} className={activeImage === index ? 'active' : ''} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1}`}><img src={image} alt=""/></button>)}</div>}</div><div className="modal-details"><button className="back-link" onClick={onClose}><ArrowLeft size={16}/> BACK TO STYLES</button><p className="eyebrow">{product.category} · SRI VAIBHAV FASHIONS</p><h2>{product.name}</h2><p className="modal-price">{product.salePrice && <del>₹{Number(product.price).toLocaleString('en-IN')}</del>} ₹{displayPrice.toLocaleString('en-IN')}</p><div className="detail-rule"/><p className="detail-label">AVAILABLE SIZES</p><div className="size-list">{(product.sizes || []).map(size => <span key={size}>{size}</span>)}</div><p className="modal-description">{product.description || 'A comfortable everyday favourite. Visit Sri Vaibhav Fashions in Addanki to find your fit and feel the fabric for yourself.'}</p><a className="whatsapp-cta" href={`https://wa.me/?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/> ENQUIRE ON WHATSAPP <ArrowUpRight size={16}/></a><button className="share-button" onClick={share}><Share2 size={15}/> SHARE THIS STYLE</button></div>
  </section></div>
}
