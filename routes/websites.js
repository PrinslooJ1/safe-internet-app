const express = require('express');
const router = express.Router();
const Website = require('../models/Website');

const RESEARCH_TIMEOUT_MS = 12000;

function cleanText(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(raw) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };

  return String(raw || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (normalized.startsWith('#')) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[normalized] || match;
  });
}

function stripHtml(raw) {
  return cleanText(decodeHtmlEntities(String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')));
}

function shortenText(raw, max = 240) {
  const text = cleanText(raw);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}.`;
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function isBlockedResearchHost(url) {
  const { hostname } = new URL(url);
  const host = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function extractAttributes(raw) {
  const attributes = {};
  const pattern = /([a-zA-Z_:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(raw))) {
    const key = match[1].toLowerCase();
    attributes[key] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function extractMeta(html) {
  const meta = {};
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const attributes = extractAttributes(tag);
    const key = cleanText(attributes.name || attributes.property || attributes.itemprop).toLowerCase();
    const content = cleanText(attributes.content);

    if (key && content && !meta[key]) {
      meta[key] = content;
    }
  }

  return meta;
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : '';
}

function extractPageSummary(html) {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => stripHtml(match[1]))
    .filter(text => text.length >= 40 && !/^(cookie|copyright|privacy|terms)\b/i.test(text));

  if (paragraphs.length) return paragraphs[0];

  const bodyMatch = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = stripHtml(bodyMatch ? bodyMatch[1] : html);
  const sentenceMatch = bodyText.match(/^(.{80,500}?[.!?])\s/);
  return sentenceMatch ? sentenceMatch[1] : shortenText(bodyText, 260);
}

function extractJsonLd(html) {
  const scripts = String(html || '').match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const values = [];

  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    values.push(value);
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(collect);
  }

  for (const script of scripts) {
    const json = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      collect(JSON.parse(decodeHtmlEntities(json)));
    } catch {
      // Ignore invalid structured data; many sites include relaxed JSON here.
    }
  }

  return values;
}

function cleanSiteName(raw, url) {
  const text = shortenText(raw, 80)
    .replace(/\s+[-|:]\s+home$/i, '')
    .replace(/^home\s+[-|:]\s+/i, '');

  if (!text) return '';

  const { hostname } = new URL(url);
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.(com|org|net|gov|co|io|ai|edu|co\.za)$/i, '');
  const parts = text.split(/\s+(?:[|·•-]|–|—)\s+/).map(cleanText).filter(Boolean);
  const matchingPart = parts.find(part => part.toLowerCase().includes(host));
  return shortenText(matchingPart || parts[0] || text, 80);
}

function displayName(url) {
  const parsed = new URL(url);
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
}

function metadataFromHtml(html, url) {
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const jsonWebSite = jsonLd.find(entry => {
    const type = entry['@type'];
    return String(Array.isArray(type) ? type.join(' ') : type || '').toLowerCase().includes('website');
  }) || {};

  const rawName = jsonWebSite.name
    || meta['og:site_name']
    || meta['application-name']
    || meta['apple-mobile-web-app-title']
    || meta['og:title']
    || meta['twitter:title']
    || extractTitle(html);

  const rawDescription = jsonWebSite.description
    || meta.description
    || meta['og:description']
    || meta['twitter:description']
    || meta.abstract
    || extractPageSummary(html);

  const name = cleanSiteName(rawName, url) || displayName(url);
  const description = shortenText(stripHtml(rawDescription), 320);

  return {
    name,
    description,
    source: meta.description || meta['og:description'] || meta['twitter:description'] || jsonWebSite.description
      ? 'page metadata'
      : (description ? 'page content' : 'page title')
  };
}

async function researchWebsite(url) {
  if (isBlockedResearchHost(url)) {
    throw new Error('Research is only available for public websites.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 SafeInternetApp/1.0 (+https://localhost)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Website returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const finalUrl = normalizeUrl(response.url || url) || url;
    return {
      url: finalUrl,
      ...metadataFromHtml(html, finalUrl)
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/websites/research', async (req, res) => {
  try {
    const url = normalizeUrl(req.body.url);
    if (!url) {
      return res.status(400).json({ error: 'A valid website URL is required.' });
    }

    const result = await researchWebsite(url);
    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to research website:', error.message);
    res.status(502).json({ error: error.message || 'Could not research this website.' });
  }
});

router.get('/websites', async (req, res) => {
  try {
    const sites = await Website.find().sort({ createdAt: -1 });
    res.status(200).json(sites);
  } catch (error) {
    console.error('Failed to fetch websites:', error);
    res.status(500).json({ error: 'Could not retrieve websites from database.' });
  }
});

router.post('/websites', async (req, res) => {
  try {
    const { name, url, category, description, isFavorite, favorite } = req.body;
    const cleanName = String(name || '').trim();
    const cleanUrl = String(url || '').trim();

    if (!cleanName || !cleanUrl) {
      return res.status(400).json({ error: 'Name and url are required.' });
    }

    const update = {
      name: cleanName,
      url: cleanUrl,
      isFavorite: Boolean(isFavorite ?? favorite ?? false)
    };

    if (category !== undefined) update.category = String(category || '').trim();
    if (description !== undefined) update.description = String(description || '').trim();

    const site = await Website.findOneAndUpdate(
      { url: cleanUrl },
      update,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    res.status(201).json(site);
  } catch (error) {
    console.error('Failed to save website:', error);
    res.status(500).json({ error: 'Database failed to save this website.' });
  }
});

router.patch('/websites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description, isFavorite, name } = req.body;

    const update = {};
    if (category !== undefined) update.category = category;
    if (description !== undefined) update.description = description;
    if (isFavorite !== undefined) update.isFavorite = isFavorite;
    if (name !== undefined) update.name = name;

    const site = await Website.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );

    if (!site) {
      return res.status(404).json({ error: 'Website not found.' });
    }

    res.status(200).json(site);
  } catch (error) {
    console.error('Failed to update website:', error);
    res.status(500).json({ error: 'Could not update website.' });
  }
});

router.delete('/websites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSite = await Website.findByIdAndDelete(id);
    if (!deletedSite) {
      return res.status(404).json({ error: "Website doesn't exist." });
    }
    res.status(200).json({ message: 'Website successfully removed from database.' });
  } catch (error) {
    console.error('Failed to delete website:', error);
    res.status(500).json({ error: 'Database failed to complete deletion.' });
  }
});

module.exports = router;
