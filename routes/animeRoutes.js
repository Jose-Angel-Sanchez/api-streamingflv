const express = require('express');
const router = express.Router();
const {
  getAnimes,
  getAnimeById,
  getEpisodeStream,
} = require('../controllers/animeController');

router.get('/animes', getAnimes);
router.get('/anime/:id', getAnimeById);
router.get('/watch/:epId', getEpisodeStream);
router.get('/episode/:ep', getEpisodeStream);

module.exports = router;
