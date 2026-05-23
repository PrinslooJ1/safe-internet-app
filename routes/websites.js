const express = require('express');
const router = express.Router();
const Website = require('../models/Website');

// GET ALL WEBSITES
router.get('/websites', async (req, res) => {
  try {
    const sites = await Website.find().sort({ createdAt: -1 });
    res.status(200).json(sites);
  } catch (error) {
    console.error('Failed to fetch websites:', error);
    res.status(500).json({ error: 'Could not retrieve websites from database.' });
  }
});

// ADD A NEW WEBSITE
router.post('/websites', async (req, res) => {
  try {
    const { name, url, favorite, isFavorite } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and url are required.' });
    }

    const update = {
      name,
      url,
      isFavorite: Boolean(isFavorite ?? favorite ?? false)
    };

    if (req.body.category) update.category = req.body.category;
    if (req.body.description) update.description = req.body.description;

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

// TOGGLE FAVORITE STATUS
router.patch('/websites/:id/favorite', async (req, res) => {
  try {
    const { id } = req.params;
    const site = await Website.findById(id);
    if (!site) {
      return res.status(404).json({ error: 'Website not found.' });
    }
    site.isFavorite = !site.isFavorite;
    await site.save();
    res.status(200).json(site);
  } catch (error) {
    console.error('Failed to update favorite status:', error);
    res.status(500).json({ error: 'Could not update favorite status.' });
  }
});

// DELETE A WEBSITE
router.delete('/websites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSite = await Website.findByIdAndDelete(id);
    if (!deletedSite) {
      return res.status(404).json({ error: "Website doesn't exist." });
    }
    res.status(200).json({ message: 'Website successfully dropped from database.' });
  } catch (error) {
    console.error('Failed to delete website:', error);
    res.status(500).json({ error: 'Database failed to complete deletion.' });
  }
});

module.exports = router;
