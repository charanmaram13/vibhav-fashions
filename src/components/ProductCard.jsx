import { useState } from 'react'

export default function ProductCard({ product, onSelect }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const secondaryImage = product.images?.[1] || product.secondaryImage
  return <article className="product-card">
    <button className={`product-image-wrap ${imageLoaded ? 'image-loaded' : ''}`} onClick={() => onSelect(product)} aria-label={`View ${product.name}`}>
      <img className="product-front" src={product.image} alt={product.name} loading="lazy" onLoad={() => setImageLoaded(true)}/>
      {secondaryImage && <img className="product-back" src={secondaryImage} alt={`${product.name}, alternate view`} loading="lazy"/>}
      {(product.isFeatured || product.isNewArrival || product.badge) && <span className="product-badge">{product.isFeatured ? 'FEATURED' : 'NEW'}</span>}
    </button>
    <div className="product-info"><h3>{product.name}</h3><div className="product-prices">{product.salePrice && <del>₹{Number(product.price).toLocaleString('en-IN')}</del>}<strong>₹{Number(product.salePrice || product.price).toLocaleString('en-IN')}</strong></div></div>
    <div className="product-sizes" aria-label={`Sizes available: ${(product.sizes || []).join(', ')}`}>{(product.sizes || []).slice(0, 5).map(size => <span key={size}>{size}</span>)}</div>
  </article>
}
