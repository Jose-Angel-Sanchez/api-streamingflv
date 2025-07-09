const axios = require('axios');
const cheerio = require('cheerio');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const BASE_URL = 'https://www3.animeflv.net';

// Función para inicializar el navegador
const getBrowser = async () => {
  // Configuración específica para Vercel
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
  }
  
  // Configuración para desarrollo local
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    ignoreHTTPSErrors: true
  });
};

const getAnimes = async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = req.query.page || 1;
    const url = `${BASE_URL}/browse?term=${encodeURIComponent(query)}&page=${page}`;

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const animes = [];
    $('article.Anime').each((i, el) => {
      const title = $(el).find('h3.Title').text().trim();
      const image = $(el).find('img').attr('src');
      const link = $(el).find('a').attr('href');
      const id = link ? link.split('/').pop() : '';
      const sinopsis = $(el).find('.Description p').last().text().trim();
      const seguidores = $(el).find('.Flwrs span').text().trim();
      if (title && image && id) {
        animes.push({ id, title, image, sinopsis, seguidores });
      }
    });

    // Extraer el número total de páginas
    let totalPages = 1;
    const paginacion = $('.pagination li a');
    if (paginacion.length > 0) {
      paginacion.each((i, el) => {
        const num = parseInt($(el).text().trim());
        if (!isNaN(num) && num > totalPages) totalPages = num;
      });
    }

    res.json({ animes, totalPages });
  } catch (error) {
    console.error('[ERROR en getAnimes]:', error);
    res.status(500).json({ animes: [], totalPages: 1, message: 'Error al buscar animes' });
  }
};

const getAnimeById = async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${BASE_URL}/anime/${id}`;

    const response = await axios.get(url);
    if (!response.data) {
      return res.status(404).json({ error: 'Anime no encontrado' });
    }

    const rawHtml = response.data;
    const $ = cheerio.load(rawHtml);

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
async function getEpisodeStream(req, res) {
  let browser = null;
  try {
    // Aceptar ep o epId según ruta
    const ep = req.params.ep || req.params.epId;
    if (!ep) {
      return res.status(400).json({ error: 'Episodio no especificado' });
    }
    const lastDashIndex = ep.lastIndexOf('-');
    if (lastDashIndex === -1) {
      return res.status(400).json({ error: 'Formato de episodio inválido, debe ser slug-episodio' });
    }
    const animeSlug = ep.substring(0, lastDashIndex);
    const episodeNumber = ep.substring(lastDashIndex + 1);
    const url = `${BASE_URL}/ver/${animeSlug}-${episodeNumber}`;

    // Puppeteer para renderizar JS y obtener variable videos
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    // Aumentar el timeout y manejar la espera
    await page.setDefaultNavigationTimeout(60000);
    console.log(`[INFO] Navegando a ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Esperar específicamente por el contenedor de videos
    await page.waitForFunction(() => typeof window.videos !== 'undefined', { timeout: 30000 })
      .catch(() => console.log('[WARN] Timeout esperando por window.videos'));

    const videosJSON = await page.evaluate(() => {
      try {
        if (!window.videos) {
          console.log('[WARN] window.videos is undefined');
          return null;
        }
        return JSON.stringify(window.videos);
      } catch (e) {
        console.log('[ERROR] Error accessing window.videos:', e);
        return null;
      }
    });

    if (!videosJSON) {
      throw new Error('No se pudieron obtener los videos del episodio');
    }

    const videos = JSON.parse(videosJSON);
    const sources = [];
    const addSources = (group, labelSuffix) => {
      if (!videos[group]) return;
      videos[group].forEach(entry => {
        if (entry.code) {
          let embedUrl = '';
          switch (entry.server) {
            case 'fembed': embedUrl = `https://www.fembed.com/v/${entry.code}`; break;
            case 'doodstream':
            case 'dood': embedUrl = `https://dood.la/e/${entry.code}`; break;
            case 'okru': embedUrl = `https://ok.ru/videoembed/${entry.code}`; break;
            case 'streamtape': embedUrl = `https://streamtape.com/e/${entry.code}`; break;
            case 'yourupload': embedUrl = `https://yourupload.com/embed/${entry.code}`; break;
            case 'mp4upload': embedUrl = `https://www.mp4upload.com/embed-${entry.code}.html`; break;
            default: embedUrl = entry.code;
          }
          sources.push({ label: `${entry.server.toUpperCase()} ${labelSuffix}`, url: embedUrl });
        }
      });
    };

    addSources('SUB', '(Sub)');
    addSources('LAT', '(Lat)');

    if (sources.length === 0) {
      throw new Error('No se encontraron servidores disponibles para este episodio');
    }

    res.json({
      title: `Episodio ${episodeNumber}`,
      sources
    });

  } catch (error) {
    console.error('[ERROR en getEpisodeStream]:', error);
    res.status(500).json({
      error: 'Error al obtener el episodio',
      message: error.message
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('[ERROR] Error cerrando el navegador:', e);
      }
    }
  }
}

async function scrapeAnimeFLV(query) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const searchUrl = `https://www.animeflv.net/browse?q=${encodeURIComponent(query)}`;

  try {
    console.log(`Navegando a URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    const results = [];
    const maxPages = 3; // Limitar el número de páginas para mejorar el rendimiento

    for (let i = 1; i <= maxPages; i++) {
      console.log(`Scraping página ${i}...`);
      const pageResults = await page.evaluate(() => {
        const animes = [];
        const cards = document.querySelectorAll('.Anime.alt.Browse .Container .Item');
        cards.forEach(card => {
          const title = card.querySelector('.Title')?.textContent.trim();
          const image = card.querySelector('img')?.getAttribute('src');
          const sinopsis = card.querySelector('.Description')?.textContent.trim();
          const id = card.querySelector('a')?.getAttribute('href').split('/').pop();
          if (title && image && id) {
            animes.push({ title, image, sinopsis, id });
          }
        });
        return animes;
      });
      console.log(`Resultados obtenidos en página ${i}:`, pageResults);
      results.push(...pageResults);

      // Intentar ir a la siguiente página
      const nextPageLink = await page.$('.pagination .next');
      if (nextPageLink) {
        await nextPageLink.click();
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      } else {
        break;
      }
    }

    await browser.close();
    return results;
  } catch (error) {
    console.error(`Error durante el scraping: ${error.message}`);
    await browser.close();
    throw new Error('Error al realizar el scraping en AnimeFLV');
  }
}

module.exports = {
  getAnimes,
  getAnimeById,
  getEpisodeStream,
  scrapeAnimeFLV,
};
// Este archivo contiene las funciones del controlador para manejar las solicitudes relacionadas con los animes.