const express = require('express');
const router = express.Router();
const {
  getAnimes,
  getAnimeById,
  getEpisodeStream,
  scrapeAnimeFLV,
} = require('../controllers/animeController');

router.get('/animes', getAnimes);
router.get('/anime/:id', getAnimeById);
router.get('/watch/:epId', getEpisodeStream);
router.get('/episode/:ep', getEpisodeStream);

router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ message: 'Query parameter is required' });
  }

  try {
    console.log(`Iniciando búsqueda para: ${query}`);
    const results = await scrapeAnimeFLV(query);
    console.log(`Resultados obtenidos: ${results.length}`);
    res.json({ animes: results });
  } catch (error) {
    console.error('Error scraping AnimeFLV:', error);
    res.status(500).json({ message: 'Error scraping AnimeFLV', error: error.message });
  }
});

module.exports = router;
