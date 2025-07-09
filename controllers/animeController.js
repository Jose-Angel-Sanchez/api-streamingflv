const axios = require('axios');
const cheerio = require('cheerio');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Configuración específica para Chromium
chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

const BASE_URL = 'https://www3.animeflv.net';

// Función para inicializar el navegador
const getBrowser = async () => {
  const options = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-features=site-per-process'
    ],
    headless: true,
    ignoreHTTPSErrors: true
  };

  if (process.env.VERCEL) {
    // Configuración específica para Vercel
    return puppeteer.launch({
      ...options,
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless
    });
  }
  
  // Configuración para desarrollo local
  return puppeteer.launch({
    ...options,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'
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
  let page = null;
  
  try {
    console.log('[INFO] Iniciando getEpisodeStream');
    
    // Validar parámetros
    const ep = req.params.ep || req.params.epId;
    if (!ep) {
      console.log('[ERROR] Episodio no especificado');
      return res.status(400).json({ error: 'Episodio no especificado' });
    }

    // Parsear el ID del episodio
    const lastDashIndex = ep.lastIndexOf('-');
    if (lastDashIndex === -1) {
      console.log('[ERROR] Formato de episodio inválido:', ep);
      return res.status(400).json({ error: 'Formato de episodio inválido, debe ser slug-episodio' });
    }

    const animeSlug = ep.substring(0, lastDashIndex);
    const episodeNumber = ep.substring(lastDashIndex + 1);
    const url = `${BASE_URL}/ver/${animeSlug}-${episodeNumber}`;
    
    console.log('[INFO] URL del episodio:', url);

    // Inicializar el navegador con más memoria
    console.log('[INFO] Inicializando navegador');
    browser = await getBrowser();
    console.log('[INFO] Navegador inicializado');

    // Crear nueva página
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    // Exponer funciones para depuración
    await page.exposeFunction('logToBackend', (message) => console.log('[PAGE]', message));

    // Configurar interceptación más permisiva
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url().toLowerCase();
      
      // Permitir scripts y XHR que puedan contener información de videos
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' ||
          (resourceType === 'script' && !url.includes('jquery') && !url.includes('script') && !url.includes('video'))) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Monitorear la red para encontrar URLs de video
    const videoUrls = new Set();
    page.on('response', async (response) => {
      const url = response.url().toLowerCase();
      if (url.includes('video') || url.includes('stream') || url.includes('embed')) {
        videoUrls.add(response.url());
      }
    });

    // Escuchar errores de consola
    page.on('console', msg => console.log('[BROWSER]', msg.text()));
    page.on('pageerror', err => console.error('[BROWSER ERROR]', err.message));

    // Configurar timeouts más largos
    await page.setDefaultNavigationTimeout(60000);
    console.log('[INFO] Navegando a la página');
    
    // Navegar y esperar a que la página esté completamente cargada
    const response = await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    if (!response.ok()) {
      throw new Error(`Error al cargar la página: ${response.status()} ${response.statusText()}`);
    }

    // Inyectar jQuery para facilitar la manipulación del DOM
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    });

    console.log('[INFO] Página cargada, extrayendo videos');

    // Intentar extraer videos usando varios métodos
    const videosJSON = await page.evaluate(async () => {
      await window.logToBackend('Iniciando extracción de videos');
      
      // Función para esperar que un elemento esté disponible
      const waitForElement = async (selector, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const element = document.querySelector(selector);
          if (element) return element;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
      };

      // Esperar a que la página esté completamente cargada
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve);
        }
      });

      // Función para extraer videos de scripts
      const extractVideosFromScripts = () => {
        const scripts = document.getElementsByTagName('script');
        for (const script of scripts) {
          try {
            const content = script.textContent || '';
            // Buscar diferentes patrones de declaración de videos
            const patterns = [
              /var\s+videos\s*=\s*({[\s\S]*?});/,
              /var\s+video\s*=\s*({[\s\S]*?});/,
              /const\s+videos\s*=\s*({[\s\S]*?});/,
              /let\s+videos\s*=\s*({[\s\S]*?});/
            ];

            for (const pattern of patterns) {
              const match = content.match(pattern);
              if (match && match[1]) {
                try {
                  return JSON.parse(match[1]);
                } catch (e) {
                  console.warn('Error parsing video data:', e);
                }
              }
            }
          } catch (e) {
            console.warn('Error processing script:', e);
          }
        }
        return null;
      };

      try {
        // 1. Intentar obtener directamente de la variable global
        if (window.videos) {
          await window.logToBackend('Videos encontrados en variable global');
          return JSON.stringify(window.videos);
        }

        // 2. Buscar en los scripts
        const scriptVideos = extractVideosFromScripts();
        if (scriptVideos) {
          await window.logToBackend('Videos encontrados en scripts');
          return JSON.stringify(scriptVideos);
        }

        // 3. Buscar iframes de video
        const videoIframes = Array.from(document.querySelectorAll('iframe')).filter(iframe => {
          const src = iframe.src.toLowerCase();
          return src.includes('embed') || src.includes('video') || src.includes('player');
        });

        if (videoIframes.length > 0) {
          await window.logToBackend('Videos encontrados en iframes');
          return JSON.stringify({
            SUB: videoIframes.map(iframe => ({
              server: 'direct',
              code: iframe.src
            }))
          });
        }

        // 4. Buscar enlaces de video directos
        const videoLinks = Array.from(document.querySelectorAll('a')).filter(a => {
          const href = a.href.toLowerCase();
          return href.includes('embed') || href.includes('video') || href.includes('player');
        });

        if (videoLinks.length > 0) {
          await window.logToBackend('Videos encontrados en enlaces');
          return JSON.stringify({
            SUB: videoLinks.map(link => ({
              server: 'direct',
              code: link.href
            }))
          });
        }

      } catch (e) {
        await window.logToBackend('Error extrayendo videos: ' + e.message);
        console.error(e);
      }
      
      return null;
    });

    // Si no encontramos videos en el DOM, intentar usar las URLs capturadas
    let videos;
    if (videosJSON) {
      videos = typeof videosJSON === 'string' ? JSON.parse(videosJSON) : videosJSON;
    } else if (videoUrls.size > 0) {
      videos = {
        SUB: Array.from(videoUrls).map(url => ({
          server: 'direct',
          code: url
        }))
      };
    } else {
      throw new Error('No se encontraron videos disponibles');
    }

    const sources = [];
    console.log('[INFO] Procesando servidores de video');

    const addSources = (group, labelSuffix) => {
      if (!videos[group]) return;
      videos[group].forEach(entry => {
        if (!entry || !entry.code) {
          console.log(`[WARN] Entrada inválida en grupo ${group}:`, entry);
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
        }
      });
    };

    addSources('SUB', '(Sub)');
    addSources('LAT', '(Lat)');

    if (sources.length === 0) {
      throw new Error('No se encontraron servidores disponibles para este episodio');
    }

    console.log('[INFO] Fuentes encontradas:', sources.length);
    
    res.json({
      title: `Episodio ${episodeNumber}`,
      sources: sources
    });

  } catch (error) {
    console.error('[ERROR] getEpisodeStream:', error);
    console.error(error.stack);
    
    res.status(500).json({
      error: 'Error al obtener el episodio',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
  } finally {
    try {
      if (page) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
    } catch (closeError) {
      console.error('[ERROR] Error al cerrar el navegador:', closeError);
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