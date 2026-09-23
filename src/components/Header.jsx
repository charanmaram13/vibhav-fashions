import { Menu, Search, ShoppingBag, X } from 'lucide-react'

export default function Header({ query, setQuery, mobileOpen, setMobileOpen }) {
  return <header className="site-header">
    <button className="icon-button menu-trigger" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>{mobileOpen ? <X /> : <Menu />}</button>
    <a className="brand" href="#top" aria-label="Thread and Thistle home"><span className="brand-mark">T<span>&</span>T</span><span className="brand-name">THREAD <i>&</i> THISTLE</span></a>
    <nav className={mobileOpen ? 'main-nav is-open' : 'main-nav'}>
      <a href="#new-arrivals" onClick={() => setMobileOpen(false)}>New arrivals</a><a href="#mens" onClick={() => setMobileOpen(false)}>Men</a><a href="#kids" onClick={() => setMobileOpen(false)}>Kids</a><a href="#visit" onClick={() => setMobileOpen(false)}>Our store</a>
    </nav>
    <div className="header-actions"><label className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pieces" aria-label="Search products" /></label><button className="icon-button bag-button" aria-label="Saved pieces"><ShoppingBag /></button></div>
  </header>
}
