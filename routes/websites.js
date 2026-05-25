const express = require('express');
const router = express.Router();
const Website = require('../models/Website');

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
