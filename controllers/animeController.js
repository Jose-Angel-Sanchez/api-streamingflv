import { get } from 'axios';
import { load } from 'cheerio';

const BASE_URL = 'https://www3.animeflv.net';

// Función para inicializar el navegador
// Removed Puppeteer code as we're using axios+cheerio

const getAnimes = async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = req.query.page || 1;

    // Verificar si es una URL de AnimeFLV
    // Si la query es una URL de AnimeFLV, puedes procesarla con processAnimeFlvUrl
    if (query.includes('animeflv.net/anime/')) {
      const animeData = await processAnimeFlvUrl(query);
      return res.json({ animes: animeData ? [animeData] : [], totalPages: 1 });
    }

    const url = `${BASE_URL}/browse?term=${encodeURIComponent(query)}&page=${page}`;

    const { data } = await get(url);
    const $ = load(data);

    const animes = [];
    $('article.Anime').each((i, el) => {
      const title = $(el).find('h3.Title').text().trim();
      const image = $(el).find('img').attr('src');
      const link = $(el).find('a').attr('href');
      const id = link ? link.split('/').pop() : '';
      const sinopsis = $(el).find('.Description p').last().text().trim();
      const seguidores = $(el).find('.Flwrs span').text().trim();
      // Extraer géneros
      let genre = [];
      $(el).find('.Genres a').each((_, genreEl) => {
        const genreText = $(genreEl).text().trim();
        if (genreText) genre.push(genreText);
      });
      if (title && image && id) {
        animes.push({ id, title, image, sinopsis, seguidores, genre });
      }
    });

    // Permitir múltiples géneros: genre puede ser string o array
    let filteredAnimes = animes;
    let filterGenres = req.query.genre;
    if (filterGenres) {
      if (!Array.isArray(filterGenres)) filterGenres = [filterGenres];
      const normalize = (str) => str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      const normalizedFilters = filterGenres.map(normalize);
      filteredAnimes = animes.filter(anime =>
        Array.isArray(anime.genre) &&
        anime.genre.some(g => normalizedFilters.includes(normalize(g)))
      );
    }

    // Extraer el número total de páginas
    let totalPages = 1;
    const paginacion = $('.pagination li a');
    if (paginacion.length > 0) {
      paginacion.each((i, el) => {
        const num = parseInt($(el).text().trim());
        if (!isNaN(num) && num > totalPages) totalPages = num;
      });
    }
    res.json({ animes: filteredAnimes, totalPages });
  } catch (error) {
    console.error('[ERROR en getAnimes]:', error);
}
    res.status(500).json({ animes: [], totalPages: 1, message: 'Error al buscar animes' });
  }

const getAnimeById = async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${BASE_URL}/anime/${id}`;
    const response = await get(url);
    if (!response.data) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    const rawHtml = response.data;
    const $ = load(rawHtml);

    const title = $('h1.Title').text().trim();
    if (!title) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    // Imagen de portada: intentar data-src o src de la etiqueta correcta
    let image = '';
    // Chequear atributo data-src
    const dataSrc = $('.Image img[data-src*="/uploads/animes/covers/"]').attr('data-src')
      || $('img[data-src*="/uploads/animes/covers/"]').attr('data-src');
    const src = $('.Image img[src*="/uploads/animes/covers/"]').attr('src')
      || $('img[src*="/uploads/animes/covers/"]').attr('src');
    image = dataSrc || src || '';
    // Si la imagen es relativa, agregar BASE_URL
    if (image && !image.startsWith('http')) {
      image = `${BASE_URL}${image}`;
    }
    // Sinopsis: tomar el último párrafo dentro de .Description
    const sinopsis = $('.Description').find('p').last().text().trim();

    // Extraer script que contiene las variables anime_info y episodes
    let episodes = [];
    $('script').each((i, el) => {
      const scriptContent = $(el).html() || '';
      if (scriptContent.includes('var episodes')) {
        const infoMatch = scriptContent.match(/var\s+anime_info\s*=\s*(\[[\s\S]*?\]);/);
        const epsMatch = scriptContent.match(/var\s+episodes\s*=\s*(\[[\s\S]*?\]);/);
        if (infoMatch && epsMatch) {
          try {
            const animeInfo = JSON.parse(infoMatch[1]);
            const slug = animeInfo[2];
            const epsArray = JSON.parse(epsMatch[1]);
            episodes = epsArray.map(ep => {
              const num = ep[0];
              return { id: `${slug}-${num}`, number: num.toString(), title: `Episodio ${num}` };
            });
          } catch (e) {
            console.error('Error parsing episodes var:', e);
          }
        }
      }
    });

    res.json({
      id,
      title,
      image,
      sinopsis,
      episodes
    });
  } catch (error) {
    console.error('[ERROR en getAnimeById]:', error);
    if (error.response?.status === 404) {
      res.status(404).json({ error: 'Anime no encontrado' });
    } else {
      res.status(500).json({ error: 'Error al obtener el anime', message: error.message });
    }
  }
};
const getEpisodeStream = async (req, res) => {
  try {
    console.log('[INFO] Iniciando getEpisodeStream');
    const episodeId = req.params.epId;
    
    if (!episodeId) {
      throw new Error('ID de episodio no proporcionado');
    }

    console.log(`[INFO] Obteniendo episodio: ${episodeId}`);
    const url = `${BASE_URL}/ver/${episodeId}`;
    console.log(`[INFO] URL del episodio: ${url}`);

    const { data } = await get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = load(data);
    console.log('[INFO] Página cargada correctamente');

    const episodeNumber = $('h1.Title').text().match(/Episodio\s+(\d+)/i)?.[1] || 'Desconocido';
    console.log(`[INFO] Número de episodio: ${episodeNumber}`);

    let videoData = null;
    const scripts = $('script').filter((_, el) => $(el).html()?.includes('videos'));
    
    console.log(`[INFO] Scripts encontrados: ${scripts.length}`);
    
    scripts.each((_, script) => {
      const content = $(script).html() || '';
      
      // Patrones comunes para encontrar la data de videos
      const patterns = [
        /var\s+videos\s*=\s*({[\s\S]*?});/,
        /let\s+videos\s*=\s*({[\s\S]*?});/,
        /videos\s*=\s*({[\s\S]*?});/
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed && (parsed.SUB || parsed.LAT)) {
              console.log('[INFO] Data de videos encontrada y parseada correctamente');
              videoData = parsed;
              break;
            }
          } catch (e) {
            console.warn('[WARN] Error parsing video data:', e.message);
          }
        }
      }
    });

    // Si no encontramos videos en el script, buscar iframes
    if (!videoData) {
      console.log('[INFO] Buscando iframes...');
      const iframes = $('iframe').filter((_, el) => {
        const src = $(el).attr('src') || '';
        return src.includes('embed') || src.includes('video') || src.includes('player');
      });

      console.log(`[INFO] Iframes encontrados: ${iframes.length}`);

      if (iframes.length > 0) {
        videoData = {
          SUB: Array.from(iframes).map(iframe => ({
            server: 'direct',
            code: $(iframe).attr('src')
          }))
        };
      }
    }

    // Si aún no tenemos videos, buscar enlaces directos
    if (!videoData) {
      console.log('[INFO] Buscando enlaces directos...');
      const videoLinks = $('a').filter((_, el) => {
        const href = $(el).attr('href') || '';
        return href.includes('embed') || href.includes('video') || href.includes('player');
      });

      console.log(`[INFO] Enlaces directos encontrados: ${videoLinks.length}`);

      if (videoLinks.length > 0) {
        videoData = {
          SUB: Array.from(videoLinks).map(link => ({
            server: 'direct',
            code: $(link).attr('href')
          }))
        };
      }
    }

    if (!videoData) {
      throw new Error('No se encontraron videos disponibles');
    }

    const sources = [];
    console.log('[INFO] Procesando servidores de video');

    // Procesar servidores
    const addSources = (group, labelSuffix) => {
      if (!videoData[group]) return;
      videoData[group].forEach((entry, index) => {
        if (!entry || !entry.code) {
          console.log(`[WARN] Entrada inválida en grupo ${group} índice ${index}:`, entry);
          return;
        }

        let embedUrl = '';
        const server = entry.server ? entry.server.toLowerCase() : 'direct';
        
        switch (server) {
          case 'fembed':
            embedUrl = `https://www.fembed.com/v/${entry.code}`;
            break;
          case 'doodstream':
          case 'dood':
            embedUrl = `https://dood.la/e/${entry.code}`;
            break;
          case 'okru':
          case 'ok.ru':
            embedUrl = `https://ok.ru/videoembed/${entry.code}`;
            break;
          case 'streamtape':
            embedUrl = `https://streamtape.com/e/${entry.code}`;
            break;
          case 'yourupload':
            embedUrl = `https://yourupload.com/embed/${entry.code}`;
            break;
          case 'mp4upload':
            embedUrl = `https://www.mp4upload.com/embed-${entry.code}.html`;
            break;
          case 'fireload':
            embedUrl = `https://fireload.com/embed/${entry.code}`;
            break;
          case 'sendvid':
            embedUrl = `https://sendvid.com/embed/${entry.code}`;
            break;
          case 'direct':
            embedUrl = entry.code;
            break;
          default:
            console.log(`[WARN] Servidor desconocido: ${server}`);
            if (entry.code.includes('http')) {
              embedUrl = entry.code;
            }
        }
        
        if (embedUrl) {
          sources.push({
            label: `${server.toUpperCase()} ${labelSuffix}`,
            url: embedUrl,
            type: server
          });
          console.log(`[INFO] Añadida fuente: ${server} ${labelSuffix}`);
        }
      });
    };

    addSources('SUB', '(Sub)');
    addSources('LAT', '(Lat)');

    if (sources.length === 0) {
      throw new Error('No se encontraron servidores disponibles para este episodio');
    }

    console.log('[INFO] Total de fuentes encontradas:', sources.length);
    
    res.json({
      title: `Episodio ${episodeNumber}`,
      sources: sources
    });

  } catch (error) {
    console.error('[ERROR] getEpisodeStream:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    
    if (error.response) {
      console.error('[ERROR] Response status:', error.response.status);
      console.error('[ERROR] Response headers:', error.response.headers);
    }

    if (error.response?.status === 404) {
      res.status(404).json({
        error: 'Episodio no encontrado',
        message: 'No se pudo encontrar el episodio solicitado'
      });
    } else {
      res.status(500).json({
        error: 'Error al obtener el episodio',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
};
async function scrapeAnimeFLV(query) {
  try {
    console.log(`[INFO] Iniciando búsqueda para: ${query}`);
    const searchUrl = `${BASE_URL}/browse?q=${encodeURIComponent(query)}`;
    
    const { data } = await get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = load(data);
    const results = [];

    $('.Anime.alt.Browse .Container .Item').each((_, element) => {
      const el = $(element);
      const title = el.find('.Title').text().trim();
      const image = el.find('img').attr('src');
      const sinopsis = el.find('.Description').text().trim();
      const id = el.find('a').attr('href')?.split('/').pop();

      if (title && image && id) {
        results.push({ title, image, sinopsis, id });
      }
    });

    console.log(`[INFO] Se encontraron ${results.length} resultados`);
    return results;

  } catch (error) {
    console.error(`[ERROR] Error durante la búsqueda:`, error);
    throw new Error('Error al buscar en AnimeFLV');
  }
}

async function processAnimeFlvUrl(url) {
  try {
    const animeId = url.split('/anime/').pop().split('/')[0];
    const directUrl = `${BASE_URL}/anime/${animeId}`;
    
    console.log(`[INFO] Procesando URL de AnimeFLV: ${directUrl}`);
    
    const { data } = await get(directUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = load(data);
    
    // Extraer información del anime
    const title = $('h1.Title').text().trim();
    let image = $('.AnimeCover img').attr('src') || $('.AnimeCover img').attr('data-src');
    
    // Asegurarse de que la URL de la imagen sea absoluta
    if (image && !image.startsWith('http')) {
      image = image.startsWith('/') ? `${BASE_URL}${image}` : `${BASE_URL}/${image}`;
    }
    
    // Extraer episodios del script
    let episodes = [];
    $('script').each((_, el) => {
      const content = $(el).html() || '';
      if (content.includes('var episodes = [[')) {
        try {
          const match = content.match(/var episodes = (\[\[.*?\]\])/);
          if (match) {
            const episodesData = JSON.parse(match[1]);
            episodes = episodesData.map(ep => ({
              number: ep[0],
              id: `${animeId}-${ep[0]}`
            }));
          }
        } catch (e) {
          console.error('Error parsing episodes:', e);
        }
      }
    });

    return {
      id: animeId,
      title,
      image,
      sinopsis: $('.Description p').text().trim(),
      type: $('.Type').text().trim(),
      status: $('.Status').text().trim(),
      episodes
    };
  } catch (error) {
    console.error('Error processing AnimeFLV URL:', error);
    return null;
  }
}

module.exports = {
  getAnimes,
  getAnimeById,
  getEpisodeStream,
  scrapeAnimeFLV,
  processAnimeFlvUrl,
};
