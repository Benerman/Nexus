import React, { useState, useEffect, useRef, useCallback } from 'react';
import './GifPicker.css';
import { getServerUrl } from '../config';

const PAGE_SIZE = 20;

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pickerRef = useRef(null);
  const gridRef = useRef(null);
  const debounceRef = useRef(null);
  const offsetRef = useRef(0);
  const queryRef = useRef('');
  const loadingRef = useRef(false);

  const fetchGifs = useCallback((searchQuery, offset, append) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const endpoint = searchQuery.trim()
      ? `${getServerUrl()}/api/gifs/search?q=${encodeURIComponent(searchQuery)}&limit=${PAGE_SIZE}&offset=${offset}`
      : `${getServerUrl()}/api/gifs/trending?limit=${PAGE_SIZE}&offset=${offset}`;

    const token = localStorage.getItem('nexus_token');
    fetch(endpoint, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        const results = data.results || [];
        if (append) {
          setGifs(prev => [...prev, ...results]);
        } else {
          setGifs(results);
        }
        setHasMore(results.length >= PAGE_SIZE);
        offsetRef.current = offset + results.length;
        loadingRef.current = false;
        setLoading(false);
      })
      .catch(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs('', 0, false);
  }, [fetchGifs]);

  // Search with debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    queryRef.current = query;

    if (!query.trim()) {
      // Reset to trending
      offsetRef.current = 0;
      setHasMore(true);
      fetchGifs('', 0, false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0;
      setHasMore(true);
      fetchGifs(query, 0, false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, fetchGifs]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || loadingRef.current || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = grid;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      fetchGifs(queryRef.current, offsetRef.current, true);
    }
  }, [hasMore, fetchGifs]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleSelect = useCallback((gif) => {
    onSelect(gif);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div className="gif-picker" ref={pickerRef}>
      <div className="gif-picker-header">
        <input
          className="gif-picker-search"
          type="text"
          placeholder="Search GIFs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="gif-picker-grid" ref={gridRef} onScroll={handleScroll}>
        {!loading && gifs.length === 0 && (
          <div className="gif-picker-loading">No GIFs found</div>
        )}
        {gifs.map(gif => (
          <button key={gif.id} className="gif-picker-item" onClick={() => handleSelect(gif)} title={gif.title}>
            <img src={gif.preview} alt={gif.title} loading="lazy" />
          </button>
        ))}
        {loading && (
          <div className="gif-picker-loading">Loading...</div>
        )}
      </div>
      <div className="gif-picker-footer">
        Powered by GIPHY
      </div>
    </div>
  );
}
