import React, { useState, useEffect } from 'react';
import './URLEmbed.css';
import { getServerUrl } from '../config';

const SERVER_URL = getServerUrl();
const embedCache = new Map();

// Extract URLs from text, excluding invite links
export function extractURLs(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const matches = text.match(urlRegex) || [];
  // Filter out invite links (handled by InviteEmbed)
  return matches.filter(url => !url.match(/\/invite\/[A-Za-z0-9]+/));
}

export default function URLEmbed({ url }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;

    // Check client cache
    if (embedCache.has(url)) {
      setData(embedCache.get(url));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchOG = async () => {
      try {
        const token = localStorage.getItem('nexus_token');
        const resp = await fetch(`${SERVER_URL}/api/og?url=${encodeURIComponent(url)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!resp.ok) throw new Error('Failed');
        const json = await resp.json();
        if (!cancelled) {
          // Only cache and show if we got at least a title
          if (json.title) {
            embedCache.set(url, json);
            setData(json);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOG();
    return () => { cancelled = true; };
  }, [url]);

  if (loading || !data || !data.title) return null;

  const isYouTube = data.type === 'youtube';

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`url-embed ${isYouTube ? 'youtube' : ''}`}>
      {data.image && (
        <div className="url-embed-image">
          <img src={data.image} alt="" loading="lazy" />
          {isYouTube && (
            <div className="url-embed-play-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          )}
        </div>
      )}
      <div className="url-embed-content">
        {data.siteName && <div className="url-embed-site">{data.siteName}</div>}
        <div className="url-embed-title">{data.title}</div>
        {data.description && <div className="url-embed-desc">{data.description}</div>}
      </div>
    </a>
  );
}
