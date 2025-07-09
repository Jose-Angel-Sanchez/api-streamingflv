const express = require('express');
const router = express.Router();
const {
  getAnimes,
  getAnimeById,
  getEpisodeStream,
  scrapeAnimeFLV,
} = require('../controllers/animeController');

// Ruta principal para listar animes
router.get('/animes', getAnimes);

// Rutas para detalles de anime
router.get('/anime/:id', getAnimeById);
router.get('/animes/:id', getAnimeById); // Ruta alternativa para compatibilidad

// Rutas para streaming de episodios
router.get('/watch/:epId', getEpisodeStream);
router.get('/ver/:epId', getEpisodeStream);   // Alias en español
router.get('/episode/:epId', getEpisodeStream); // Alias adicional

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
