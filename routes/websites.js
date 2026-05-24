const express = require('express');
const router = express.Router();
const Website = require('../models/Website');

function cleanText(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function parseHtmlMetadata(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : '';
  const descriptionMatch = html.match(/<meta\s+[^>]*(?:name|property)=['"](?:description|og:description|twitter:description)['"][^>]*content=['"]([^'"]*)['"][^>]*>/i);
  const description = descriptionMatch ? cleanText(descriptionMatch[1]) : '';
  return { title, description };
}

async function fetchUrlMetadata(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SafeInternetApp/1.0; +https://example.com)'
    }
  });

  const html = await response.text();
  return parseHtmlMetadata(html);
}

router.get('/websites', async (req, res) => {
  try {
    const sites = await Website.find().sort({ createdAt: -1 });
    res.status(200).json(sites);
  } catch (error) {
    console.error('Failed to fetch websites:', error);
    res.status(500).json({ error: 'Could not retrieve websites from database.' });
  }
});

router.get('/websites/preview', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter.' });
  }

  try {
    const { title, description } = await fetchUrlMetadata(url);
    const name = title || '';
    res.json({ name, description: description || '' });
  } catch (error) {
    console.error('Preview fetch failed:', error.message || error);
    res.status(502).json({ error: 'Unable to fetch website metadata.' });
  }
});

router.post('/websites/import', async (req, res) => {
  const websites = Array.isArray(req.body.websites) ? req.body.websites : [];
  const validWebsites = websites.map(raw => {
    const url = String(raw.url || '').trim();
    return {
      url,
      name: cleanText(raw.name) || url,
      category: String(raw.category || '').trim(),
      description: cleanText(raw.description) || '',
      isFavorite: Boolean(raw.isFavorite)
    };
  }).filter(item => item.url && /^https?:\/\//i.test(item.url));

  if (!validWebsites.length) {
    return res.status(400).json({ error: 'No valid websites found for import.' });
  }

  try {
    const operations = validWebsites.map(site => ({
      updateOne: {
        filter: { url: site.url },
        update: {
          $set: {
            name: site.name,
            category: site.category,
            description: site.description,
            isFavorite: site.isFavorite
          }
        },
        upsert: true
      }
    }));

    await Website.bulkWrite(operations);
    const urls = validWebsites.map(site => site.url);
    const savedWebsites = await Website.find({ url: { $in: urls } });

    res.status(201).json({ imported: savedWebsites.length, websites: savedWebsites });
  } catch (error) {
    console.error('Failed to import websites:', error);
    res.status(500).json({ error: 'Import failed while writing to database.' });
  }
});

router.post('/websites', async (req, res) => {
  try {
    const { name, url, category, description, isFavorite, favorite } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and url are required.' });
    }

    const update = {
      name,
      url,
      isFavorite: Boolean(isFavorite ?? favorite ?? false)
    };

    if (category) update.category = category;
    if (description) update.description = description;

    const site = await Website.findOneAndUpdate(
      { url },
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
