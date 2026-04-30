/**
 * CharacterSelectScene — pre-game character picker.
 *
 * - Default character is "Kaan" (assets/face.png).
 * - User can press "+" to upload a PNG/JPG; we run face-api.js to find the
 *   largest face in the image (= the one closest to the camera), crop it
 *   with padding, and resample to a fixed 256x256 PNG so the in-game head
 *   ends up the same size as Kaan's regardless of the source image scale.
 * - Custom faces are persisted to localStorage as data URLs.
 *
 * The chosen face is registered into Phaser's TextureManager under the
 * key 'face' before GameScene starts, so GameScene doesn't need to know
 * anything about who was picked.
 */

const STORAGE_KEY = 'ogame.faces.v1';
const SELECTED_KEY_KEY = 'ogame.selectedFaceId';
const KAAN_ID = 'kaan';
const KAAN_URL = 'assets/face.png';

// face-api model bundle (tiny detector only — ~190 KB).
const FACEAPI_MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
// MediaPipe Selfie Segmentation assets (model + wasm) — same CDN as the JS.
const MEDIAPIPE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

// Output crop size: 256x256. The in-game head is sized by display WIDTH
// (HEAD_TARGET_W in GameScene), so as long as every avatar is the same
// pixel size the on-screen head is consistent for all characters.
const CROP_SIZE = 256;
// Extra padding around the detected face box (fraction of box size).
const CROP_PADDING = 0.55;

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene');
  }

  preload() {
    // Preload Kaan's photo so we can show it as a thumbnail in the picker
    // and use it as the in-game face when Kaan is selected.
    this.load.image('face_kaan', KAAN_URL);
  }

  create() {
    this._faceapiReady = false;
    this._faceapiLoading = null;

    // Load saved characters from localStorage.
    this.characters = this._loadCharacters();
    this.selectedId = localStorage.getItem(SELECTED_KEY_KEY) || KAAN_ID;
    if (!this.characters.find((c) => c.id === this.selectedId)) {
      this.selectedId = KAAN_ID;
    }

    this._buildUI();
    this._renderCards();
  }

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  _loadCharacters() {
    const list = [{ id: KAAN_ID, name: 'Kaan', url: KAAN_URL, builtin: true }];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const c of arr) {
            if (c && c.id && c.dataUrl) {
              list.push({ id: c.id, name: c.name || 'Karakter', url: c.dataUrl, builtin: false });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not load saved characters', e);
    }
    return list;
  }

  _saveCharacters() {
    const customs = this.characters
      .filter((c) => !c.builtin)
      .map((c) => ({ id: c.id, name: c.name, dataUrl: c.url }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
    } catch (e) {
      console.warn('Could not save characters', e);
    }
  }

  // ---------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------

  _buildUI() {
    // CSS injected once.
    if (!document.getElementById('char-select-style')) {
      const style = document.createElement('style');
      style.id = 'char-select-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // Root overlay attached to the body — Phaser DOM container would clip
    // it to the canvas. A normal fixed overlay is simpler and looks the same.
    const root = document.createElement('div');
    root.className = 'cs-root';
    root.innerHTML = `
      <div class="cs-backdrop"></div>
      <div class="cs-panel" role="dialog" aria-label="Karakter Seç">
        <div class="cs-header">
          <h1>Karakterini Seç</h1>
          <p>Macerana bir yüz seç. Yeni karakter eklemek için <b>+</b> butonuna bas.</p>
        </div>
        <div class="cs-grid" id="cs-grid"></div>
        <div class="cs-status" id="cs-status" aria-live="polite"></div>
        <div class="cs-actions">
          <button class="cs-btn cs-btn-primary" id="cs-start">Başla ▶</button>
        </div>
      </div>

      <!-- Add-source picker (sheet on mobile, modal on desktop) -->
      <div class="cs-sheet" id="cs-sheet" hidden role="dialog" aria-modal="true" aria-label="Yeni karakter ekle">
        <div class="cs-sheet-backdrop" data-sheet-close></div>
        <div class="cs-sheet-panel">
          <div class="cs-sheet-handle"></div>
          <h2>Yeni karakter</h2>
          <p>Bir yöntem seç:</p>
          <button class="cs-btn cs-btn-secondary" id="cs-pick-camera">📷  Kamerayla Çek</button>
          <button class="cs-btn cs-btn-secondary" id="cs-pick-file">🖼️  Galeriden Seç</button>
          <button class="cs-btn cs-btn-ghost" data-sheet-close>Vazgeç</button>
        </div>
      </div>

      <!-- Live camera capture overlay -->
      <div class="cs-cam" id="cs-cam" hidden role="dialog" aria-modal="true" aria-label="Kamera">
        <video id="cs-cam-video" playsinline autoplay muted></video>
        <div class="cs-cam-frame" aria-hidden="true"></div>
        <div class="cs-cam-hint" id="cs-cam-hint">Yüzünü ovalin içine al ve butona bas</div>
        <div class="cs-cam-controls">
          <button class="cs-cam-btn cs-cam-btn-cancel" id="cs-cam-cancel" aria-label="İptal">✕</button>
          <button class="cs-cam-btn cs-cam-btn-shutter" id="cs-cam-shutter" aria-label="Çek"><span></span></button>
          <button class="cs-cam-btn cs-cam-btn-flip" id="cs-cam-flip" aria-label="Kamerayı çevir">⟳</button>
        </div>
      </div>

      <input type="file" id="cs-file" accept="image/png,image/jpeg" hidden />
    `;
    document.body.appendChild(root);
    this._uiRoot = root;

    this._gridEl = root.querySelector('#cs-grid');
    this._statusEl = root.querySelector('#cs-status');
    this._fileInput = root.querySelector('#cs-file');
    this._sheetEl = root.querySelector('#cs-sheet');
    this._camEl = root.querySelector('#cs-cam');
    this._camVideo = root.querySelector('#cs-cam-video');

    root.querySelector('#cs-start').addEventListener('click', () => this._start());
    this._fileInput.addEventListener('change', (e) => this._onFilePicked(e));

    // Add-source sheet wiring.
    root.querySelector('#cs-pick-file').addEventListener('click', () => {
      this._closeSheet();
      this._fileInput.click();
    });
    root.querySelector('#cs-pick-camera').addEventListener('click', () => {
      this._closeSheet();
      this._openCamera();
    });
    root.querySelectorAll('[data-sheet-close]').forEach((el) =>
      el.addEventListener('click', () => this._closeSheet())
    );

    // Camera overlay wiring.
    root.querySelector('#cs-cam-cancel').addEventListener('click', () => this._closeCamera());
    root.querySelector('#cs-cam-shutter').addEventListener('click', () => this._captureCamera());
    root.querySelector('#cs-cam-flip').addEventListener('click', () => this._flipCamera());
  }

  _renderCards() {
    this._gridEl.innerHTML = '';

    for (const char of this.characters) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cs-card' + (char.id === this.selectedId ? ' cs-card-selected' : '');
      card.dataset.id = char.id;
      card.innerHTML = `
        <div class="cs-avatar"><img alt="" /></div>
        <div class="cs-name">${escapeHtml(char.name)}</div>
        ${char.builtin ? '' : '<button class="cs-delete" aria-label="Sil">×</button>'}
      `;
      card.querySelector('img').src = char.url;
      card.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('cs-delete')) return;
        this.selectedId = char.id;
        this._renderCards();
      });
      if (!char.builtin) {
        card.querySelector('.cs-delete').addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._deleteCharacter(char.id);
        });
      }
      this._gridEl.appendChild(card);
    }

    // "+" add card.
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'cs-card cs-card-add';
    add.innerHTML = `
      <div class="cs-avatar cs-avatar-add"><span>+</span></div>
      <div class="cs-name">Yeni karakter</div>
    `;
    add.addEventListener('click', () => this._openSheet());
    this._gridEl.appendChild(add);
  }

  // ---------------------------------------------------------------------
  // Source-picker sheet (file vs camera)
  // ---------------------------------------------------------------------
  _openSheet() {
    if (!this._sheetEl) return;
    this._sheetEl.hidden = false;
    // Force reflow so the CSS transition runs.
    void this._sheetEl.offsetWidth;
    this._sheetEl.classList.add('cs-sheet-open');
    // If the device has no camera API, hide that option.
    const hasCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const camBtn = this._sheetEl.querySelector('#cs-pick-camera');
    if (camBtn) camBtn.style.display = hasCam ? '' : 'none';
  }
  _closeSheet() {
    if (!this._sheetEl) return;
    this._sheetEl.classList.remove('cs-sheet-open');
    this._sheetEl.hidden = true;
  }

  // ---------------------------------------------------------------------
  // Camera capture
  //
  // Uses getUserMedia with `facingMode: user` (front cam) by default;
  // a flip button switches between user/environment when supported.
  // The captured frame is drawn to an offscreen canvas, then fed into
  // the same `_processImage()` pipeline as a gallery upload.
  // ---------------------------------------------------------------------
  async _openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._setStatus('Bu cihazda kamera desteklenmiyor.', 'error');
      return;
    }
    this._camFacing = this._camFacing || 'user';
    this._camEl.hidden = false;
    void this._camEl.offsetWidth;
    this._camEl.classList.add('cs-cam-open');
    try {
      await this._startCameraStream();
    } catch (e) {
      console.error(e);
      this._setStatus('Kamera açılamadı (izin verildi mi?).', 'error');
      this._closeCamera();
    }
  }
  async _startCameraStream() {
    this._stopCameraStream();
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this._camFacing },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this._camStream = stream;
    this._camVideo.srcObject = stream;
    // Mirror the preview when the front camera is in use — feels natural
    // (like a selfie). The captured snapshot is un-mirrored below.
    this._camVideo.style.transform = (this._camFacing === 'user') ? 'scaleX(-1)' : 'none';
    await this._camVideo.play().catch(() => {});
  }
  _stopCameraStream() {
    if (this._camStream) {
      try { this._camStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      this._camStream = null;
    }
    if (this._camVideo) this._camVideo.srcObject = null;
  }
  async _flipCamera() {
    this._camFacing = (this._camFacing === 'user') ? 'environment' : 'user';
    try {
      await this._startCameraStream();
    } catch (e) {
      // Fall back if the requested facing mode is not available.
      this._camFacing = (this._camFacing === 'user') ? 'environment' : 'user';
      try { await this._startCameraStream(); } catch (_) {}
    }
  }
  _closeCamera() {
    this._stopCameraStream();
    if (this._camEl) {
      this._camEl.classList.remove('cs-cam-open');
      this._camEl.hidden = true;
    }
  }
  async _captureCamera() {
    const video = this._camVideo;
    if (!video || !video.videoWidth) return;
    // Draw current frame, un-mirroring if it was a front-cam selfie.
    const w = video.videoWidth;
    const h = video.videoHeight;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (this._camFacing === 'user') {
      ctx.translate(w, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    // Convert to an Image so the rest of the pipeline (face-api / MediaPipe)
    // accepts it.
    const dataUrl = cv.toDataURL('image/jpeg', 0.92);
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    this._closeCamera();
    await this._processImage(img);
  }

  _setStatus(text, kind = 'info') {
    this._statusEl.textContent = text || '';
    this._statusEl.className = 'cs-status' + (kind ? ` cs-status-${kind}` : '');
  }

  _deleteCharacter(id) {
    this.characters = this.characters.filter((c) => c.id !== id);
    if (this.selectedId === id) this.selectedId = KAAN_ID;
    this._saveCharacters();
    this._renderCards();
  }

  // ---------------------------------------------------------------------
  // Upload + face detection
  // ---------------------------------------------------------------------

  async _onFilePicked(ev) {
    const file = ev.target.files && ev.target.files[0];
    // Reset so the same file can be re-picked later.
    ev.target.value = '';
    if (!file) return;

    this._setStatus('Resim yükleniyor…');
    let img;
    try {
      img = await loadImageFromFile(file);
    } catch (e) {
      this._setStatus('Resim okunamadı.', 'error');
      return;
    }
    await this._processImage(img);
  }

  // Shared pipeline used by BOTH the file-upload and camera-capture flows.
  // Detects the largest face, segments the person out of the background,
  // crops to a head-and-hair silhouette, and saves the result as a new
  // selectable character.
  async _processImage(img) {
    this._setStatus('Yüz tanıma modeli hazırlanıyor…');
    try {
      await this._ensureFaceApi();
    } catch (e) {
      console.error(e);
      this._setStatus('Yüz tanıma yüklenemedi (internet?).', 'error');
      return;
    }

    this._setStatus('Yüz aranıyor…');
    let bestDet;
    try {
      // Try several detector configurations in order of preference.
      // Mobile CPUs choke on inputSize 416 with high-res phone photos, and
      // a single failed pass should not kill the whole flow. We progressively
      // relax the threshold and shrink the input until we find a face.
      const passes = [
        { inputSize: 416, scoreThreshold: 0.5 },
        { inputSize: 320, scoreThreshold: 0.4 },
        { inputSize: 256, scoreThreshold: 0.3 },
        { inputSize: 224, scoreThreshold: 0.2 },
      ];
      let detections = null;
      for (const opts of passes) {
        try {
          detections = await window.faceapi
            .detectAllFaces(img, new window.faceapi.TinyFaceDetectorOptions(opts))
            .withFaceLandmarks(true /* useTinyModel */);
          if (detections && detections.length > 0) break;
        } catch (passErr) {
          // Some Android WebViews throw on large inputSize — try the next
          // smaller pass instead of bailing out.
          console.warn('face-api pass failed', opts, passErr);
        }
      }
      if (!detections || detections.length === 0) {
        this._setStatus('Bu fotoğrafta yüz bulunamadı. Yüzün net görünen, yakın bir fotoğraf dene.', 'error');
        return;
      }
      // Largest box = closest to the camera.
      bestDet = detections.reduce((a, b) =>
        (b.detection.box.width * b.detection.box.height >
          a.detection.box.width * a.detection.box.height ? b : a)
      );
    } catch (e) {
      console.error(e);
      this._setStatus('Yüz tespiti sırasında hata oluştu: ' + (e && e.message ? e.message : e), 'error');
      return;
    }

    this._setStatus('Arka plan kaldırılıyor… (ilk seferde model indirilir)');
    let segMask;
    try {
      // Hard timeout: on some Samsung Internet / Android WebView builds
      // MediaPipe init or segment() can hang silently (no throw), leaving
      // the user staring at the spinner forever. Cap it at 18 s and fall
      // back to an oval head mask if it doesn't finish.
      segMask = await withTimeout(this._segmentPerson(img), 18000, 'segmentation timeout');
    } catch (e) {
      console.warn('Segmentation failed, using oval fallback:', e);
      const msg = e && e.message ? e.message : String(e);
      this._setStatus('Arka plan kaldırılamadı (' + msg + '), oval kırpılacak…', 'error');
      // Fallback: synthesize a feathered oval mask around the detected
      // face box. Result is a sticker-ish head crop with soft edges — not
      // pixel-perfect like MediaPipe, but always works and lets the user
      // continue into the game.
      segMask = buildOvalHeadMask(img, bestDet);
    }

    const dataUrl = cropFaceToDataUrl(img, bestDet, segMask);
    const id = 'face_' + Date.now().toString(36);
    const name = `Karakter ${this.characters.filter((c) => !c.builtin).length + 1}`;
    this.characters.push({ id, name, url: dataUrl, builtin: false });
    this.selectedId = id;
    this._saveCharacters();
    this._renderCards();
    this._setStatus('Yüz eklendi! ✨', 'ok');
  }

  _ensureFaceApi() {
    if (this._faceapiReady) return Promise.resolve();
    if (this._faceapiLoading) return this._faceapiLoading;
    this._faceapiLoading = (async () => {
      // The CDN script tag in index.html loads window.faceapi. If it failed
      // (offline / blocker), wait briefly then bail out.
      const start = Date.now();
      while (!window.faceapi && Date.now() - start < 8000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.faceapi) throw new Error('face-api not loaded');
      await Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL_URL),
        window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACEAPI_MODEL_URL),
      ]);
      this._faceapiReady = true;
    })();
    return this._faceapiLoading;
  }

  /**
   * Run MediaPipe **Image Segmenter** with the `selfie_multiclass_256x256`
   * model and return an HTMLCanvasElement (same size as `img`) whose alpha
   * channel is non-zero ONLY where the pixel is HAIR (cat. 1) or
   * FACE-SKIN (cat. 3). Body-skin (2), clothes (4), background (0) and
   * accessories (5) are excluded — so the result is just the head.
   *
   * Categories (selfie_multiclass_256x256):
   *   0 = background
   *   1 = hair
   *   2 = body-skin
   *   3 = face-skin
   *   4 = clothes
   *   5 = others (accessories: glasses, hats, ...)
   */
  async _segmentPerson(img) {
    if (!this._segmenter) {
      // ----------------------------------------------------------------
      // Samsung Internet kill-switch.
      // On Samsung Internet (and a few other Android WebViews), one of:
      //   - dynamic import() of the remote MediaPipe ESM bundle,
      //   - FilesetResolver.forVisionTasks (WASM fetch),
      //   - or the TFLite GPU shader compile inside createFromOptions(),
      // hangs silently and never resolves and never throws. The user is
      // stuck on "Arka plan kaldırılıyor…" forever. The same device works
      // perfectly in Chrome, so this is purely a Samsung Internet issue.
      // Refuse to even try MediaPipe on that browser — _processImage()
      // will catch the throw and use the oval-mask fallback, which gives
      // the user a usable character in under a second.
      // ----------------------------------------------------------------
      const ua = (navigator.userAgent || '').toLowerCase();
      if (ua.includes('samsungbrowser')) {
        throw new Error('Samsung Internet: MediaPipe atlandı');
      }

      // Wrap the dynamic import + FilesetResolver in ONE timeout so a
      // hung remote ESM fetch can't keep the spinner running forever.
      const initFileset = (async () => {
        const vision = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
        );
        const fileset = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        return { vision, fileset };
      })();
      const { vision, fileset } = await withTimeout(
        initFileset, 12000, 'MediaPipe yuk timeout',
      );
      const modelAssetPath =
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
      // GPU delegate is much faster but is unreliable on many Android
      // Chrome / Samsung Internet / WebView builds (TFLite GPU shader
      // compile silently hangs on some Mali / Adreno drivers). Try GPU
      // first with a hard timeout, then fall back to CPU. We also wrap
      // the CPU attempt in a timeout so a stuck WASM fetch (no network,
      // captive portal, blocked CDN) eventually surfaces an error instead
      // of leaving the user staring at the spinner.
      try {
        this._segmenter = await withTimeout(
          vision.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate: 'GPU' },
            runningMode: 'IMAGE',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
          }),
          10000,
          'GPU segmenter init timeout',
        );
      } catch (gpuErr) {
        console.warn('MediaPipe GPU delegate failed, retrying with CPU', gpuErr);
        this._segmenter = await withTimeout(
          vision.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate: 'CPU' },
            runningMode: 'IMAGE',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
          }),
          15000,
          'CPU segmenter init timeout',
        );
      }
    }

    // The model is 256x256 — feeding it a huge phone photo (4000+ px) wastes
    // CPU on the upload step and on Android can OOM the GPU delegate.
    // Downscale to a sane working size first; the categoryMask is upscaled
    // back to the source size at the end of this function anyway.
    const MAX_SIDE = 1024;
    let segInput = img;
    if (img.width > MAX_SIDE || img.height > MAX_SIDE) {
      const scale = MAX_SIDE / Math.max(img.width, img.height);
      const sw = Math.max(1, Math.round(img.width * scale));
      const sh = Math.max(1, Math.round(img.height * scale));
      const small = document.createElement('canvas');
      small.width = sw; small.height = sh;
      small.getContext('2d').drawImage(img, 0, 0, sw, sh);
      segInput = small;
    }

    let result;
    try {
      result = this._segmenter.segment(segInput);
    } catch (segErr) {
      // If the GPU runtime crashes mid-segment on Android, drop the
      // segmenter and recreate it on CPU for the next call.
      console.warn('MediaPipe segment() failed, dropping segmenter', segErr);
      try { this._segmenter.close && this._segmenter.close(); } catch (_) { /* ignore */ }
      this._segmenter = null;
      throw segErr;
    }
    const cat = result.categoryMask;
    const mw = cat.width, mh = cat.height;
    const catData = cat.getAsUint8Array();

    // Build a mask canvas at the model's native resolution (faster), then
    // upscale onto a canvas the size of the source image so callers can
    // composite it directly.
    const small = document.createElement('canvas');
    small.width = mw; small.height = mh;
    const sctx = small.getContext('2d');
    const imgData = sctx.createImageData(mw, mh);
    const dst = imgData.data;
    for (let i = 0; i < catData.length; i++) {
      const c = catData[i];
      // Keep only HAIR (1) and FACE-SKIN (3). Everything else → alpha 0.
      const keep = (c === 1 || c === 3) ? 255 : 0;
      const j = i * 4;
      dst[j] = 255; dst[j + 1] = 255; dst[j + 2] = 255; dst[j + 3] = keep;
    }
    sctx.putImageData(imgData, 0, 0);

    const out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(small, 0, 0, img.width, img.height);

    // Clean up the result so MediaPipe can recycle GPU buffers.
    if (cat.close) cat.close();
    return out;
  }

  // ---------------------------------------------------------------------
  // Hand off to GameScene
  // ---------------------------------------------------------------------

  _start() {
    // If the camera was somehow left open, kill the stream first.
    this._stopCameraStream();
    const char = this.characters.find((c) => c.id === this.selectedId) || this.characters[0];
    localStorage.setItem(SELECTED_KEY_KEY, char.id);

    const onReady = () => {
      // Tear down UI, then start the game.
      if (this._uiRoot && this._uiRoot.parentNode) {
        this._uiRoot.parentNode.removeChild(this._uiRoot);
      }
      this.scene.start('GameScene');
    };

    // Always (re)install the texture under key 'face' so GameScene picks it up.
    if (this.textures.exists('face')) this.textures.remove('face');

    if (char.id === KAAN_ID) {
      // Reuse the already-loaded Kaan image: copy its source into a new
      // texture under the key 'face'.
      const src = this.textures.get('face_kaan').getSourceImage();
      this.textures.addImage('face', src);
      onReady();
    } else {
      // Custom face is a data URL — addBase64 is async (waits for image
      // decode). Wait for the addtexture event before starting the game.
      this.textures.once('addtexture-face', onReady);
      this.textures.addBase64('face', char.url);
    }
  }
}

// =====================================================================
// Helpers
// =====================================================================

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Crop the detected head from `img` and return a square PNG data URL with
 * a TRANSPARENT background — only the head (face + hair) is visible.
 *
 * Uses face-api 68-point landmarks to build a head-shaped mask:
 *   - jaw line  : landmarks 0..16  (left-to-right around the chin)
 *   - hair top  : an arc above the eyebrows, sized to include hair
 * The mask is feathered (Gaussian blur) so the edges blend smoothly and
 * the result looks like a sticker with no harsh background fringe.
 *
 * Output is always CROP_SIZE x CROP_SIZE so every character renders at the
 * same in-game size.
 */
/**
 * Crop the head out of `img` using:
 *   - MediaPipe Selfie Segmentation for the person silhouette (so hair,
 *     ears, glasses, beard etc. all come out with their REAL outline), and
 *   - face-api 68-point landmarks to find the EXACT chin Y, used to hard-
 *     cut everything below the chin (no neck, no shoulders, no collar).
 *
 * Output is always a CROP_SIZE square PNG.
 */
/**
 * Crop the head out of `img` using:
 *   - face-api 68-point landmarks → tight crop window around the head
 *   - MediaPipe Image Segmenter (selfie_multiclass) → mask of HAIR +
 *     FACE-SKIN ONLY. Body-skin (neck), clothes and background are
 *     classified separately by the model and excluded from `segMaskCanvas`,
 *     so no jaw-polygon / vertical-fade hack is needed.
 *
 * Output is always a CROP_SIZE square PNG.
 */
function cropFaceToDataUrl(img, det, segMaskCanvas) {
  const box = det.detection.box;
  const jaw = det.landmarks.getJawOutline();
  let chinSrcY = -Infinity;
  for (const p of jaw) if (p.y > chinSrcY) chinSrcY = p.y;
  // Generous safety margin below the chin landmark — the multiclass mask
  // already rejects neck pixels, so we can afford to include them in the
  // crop window without them showing up in the result.
  chinSrcY += box.height * 0.15;

  const padTop  = 0.85;
  const padSide = 0.55;
  const wx0 = Math.max(0, Math.floor(box.x - box.width * padSide));
  const wx1 = Math.min(img.width,  Math.ceil(box.x + box.width * (1 + padSide)));
  const wy0 = Math.max(0, Math.floor(box.y - box.height * padTop));
  const wy1 = Math.min(img.height, Math.ceil(chinSrcY));
  const ww = Math.max(1, wx1 - wx0);
  const wh = Math.max(1, wy1 - wy0);
  const W = ww, H = wh;

  // 1) Cropped photo.
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(img, wx0, wy0, ww, wh, 0, 0, W, H);

  // 2) Head-only mask from MediaPipe multiclass segmenter (cropped to the
  //    same window). Apply directly — no extra geometry needed.
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(segMaskCanvas, wx0, wy0, ww, wh, 0, 0, W, H);
  octx.globalCompositeOperation = 'source-over';

  // 2b) Multi-face safety: if there are OTHER people near the chosen face,
  //     the segmentation mask will also have their hair/face pixels and
  //     they can leak into the crop window. Keep only the connected blob
  //     of opaque pixels that contains the chosen face's center, so any
  //     neighbouring person's head is dropped.
  keepConnectedBlobAt(out,
    Math.round(box.x + box.width  / 2 - wx0),
    Math.round(box.y + box.height / 2 - wy0),
  );

  // 3) Tight-crop alpha bbox into a CROP_SIZE square (head bottom-aligned).
  return tightCropToAlphaBottomAligned(out);
}

/**
 * In-place: keep only the connected component of non-transparent pixels
 * that contains the seed pixel (sx, sy); make every other pixel
 * transparent. Uses a 4-neighbour BFS over a Uint8Array visited map.
 *
 * This is what lets us pick "the most prominent face" cleanly when the
 * source photo contains more than one person — the chosen face's flood
 * fill stays inside its own head silhouette, and any other heads that
 * happen to be inside the crop window simply get erased.
 */
function keepConnectedBlobAt(canvas, sx, sy) {
  const w = canvas.width, h = canvas.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const ALPHA_THRESHOLD = 24;
  // If the seed itself is transparent, find the nearest opaque pixel
  // (face landmark center can land on a hair-shaved area or background
  // gap). Search outward in a small spiral.
  const isOpaque = (x, y) => data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD;
  if (!isOpaque(sx, sy)) {
    let found = false;
    for (let r = 1; r < 60 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = sx + dx, ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (isOpaque(nx, ny)) { sx = nx; sy = ny; found = true; }
        }
      }
    }
    if (!found) return;
  }
  const visited = new Uint8Array(w * h);
  const stack = [sx + sy * w];
  visited[sx + sy * w] = 1;
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0     && !visited[idx - 1] && isOpaque(x - 1, y)) { visited[idx - 1] = 1; stack.push(idx - 1); }
    if (x < w - 1 && !visited[idx + 1] && isOpaque(x + 1, y)) { visited[idx + 1] = 1; stack.push(idx + 1); }
    if (y > 0     && !visited[idx - w] && isOpaque(x, y - 1)) { visited[idx - w] = 1; stack.push(idx - w); }
    if (y < h - 1 && !visited[idx + w] && isOpaque(x, y + 1)) { visited[idx + w] = 1; stack.push(idx + w); }
  }
  // Wipe alpha for every non-visited pixel.
  for (let i = 0; i < visited.length; i++) {
    if (!visited[i]) data[i * 4 + 3] = 0;
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Crop `canvas` to the bounding box of non-transparent pixels, then place
 * that bbox into a SQUARE canvas of side = max(bw, bh). The bbox is
 * BOTTOM-aligned (centered horizontally), so the head silhouette ends at
 * the bottom edge of the texture — important because GameScene positions
 * the head image so its bottom sits on the body's neck.
 */
function tightCropToAlphaBottomAligned(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const ALPHA_THRESHOLD = 24;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL('image/png');

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // Output is a CROP_SIZE-wide canvas with the head silhouette filling the
  // FULL WIDTH (so GameScene's setDisplaySize(HEAD_TARGET_W, ...) makes the
  // head exactly HEAD_TARGET_W on screen — same on-screen size as Kaan,
  // whose PNG also has the head edge-to-edge). The canvas height matches
  // the head's natural aspect ratio; the head is bottom-aligned inside it.
  const outScale = CROP_SIZE / bw;
  const dw = CROP_SIZE;
  const dh = Math.max(1, Math.round(bh * outScale));
  const out = document.createElement('canvas');
  out.width = CROP_SIZE;
  out.height = dh;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, minX, minY, bw, bh, 0, 0, dw, dh);
  return out.toDataURL('image/png');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Race a promise against a timeout. Rejects with `new Error(label)` if
 * the promise has not settled within `ms` milliseconds. The original
 * promise keeps running (we can't cancel arbitrary work) but the caller
 * is unblocked so the UI can recover.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label || 'timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Build a feathered-oval head mask the same size as `img`, used as a
 * fallback when MediaPipe segmentation fails (Samsung Internet, old
 * Android WebView, blocked WASM fetch, hung GPU delegate, etc.). The
 * oval is sized from the face-api bbox to also include hair on top.
 * Returns an HTMLCanvasElement with WHITE pixels inside the oval and
 * a soft alpha falloff at the edges, ready to be used as a mask via
 * destination-in compositing in cropFaceToDataUrl().
 */
function buildOvalHeadMask(img, det) {
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const box = det.detection.box;
  // Center the oval on the face box, but extend upward to include hair
  // and slightly downward to include the chin. Width is a touch wider
  // than the face box so ears come along too.
  const cx = box.x + box.width  / 2;
  const cy = box.y + box.height / 2 - box.height * 0.15;
  const rx = box.width  * 0.78;
  const ry = box.height * 0.95;
  // Soft edge via shadowBlur (works on every browser).
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = Math.max(8, Math.min(W, H) * 0.012);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

// =====================================================================
// CSS
// =====================================================================

const CSS = `
.cs-root {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #fff;
  -webkit-user-select: none; user-select: none;
}
.cs-backdrop {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(120,170,255,.45), transparent 60%),
    radial-gradient(circle at 80% 80%, rgba(255,140,200,.35), transparent 55%),
    linear-gradient(160deg, #0d1530 0%, #1a1140 100%);
  backdrop-filter: blur(6px);
}
.cs-panel {
  position: relative;
  width: min(960px, 92vw);
  max-height: 90vh;
  overflow: auto;
  padding: 28px 28px 24px;
  border-radius: 22px;
  background: rgba(20, 22, 40, 0.78);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset;
}
.cs-header h1 {
  margin: 0 0 6px;
  font-size: clamp(22px, 3.4vw, 32px);
  letter-spacing: 0.5px;
  background: linear-gradient(90deg, #ffd166, #ff70a6, #70d6ff);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.cs-header p { margin: 0 0 18px; color: #c9cfe0; font-size: 14px; }

.cs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}

.cs-card {
  position: relative;
  display: flex; flex-direction: column; align-items: center;
  gap: 10px;
  padding: 14px 10px 12px;
  border-radius: 16px;
  background: rgba(255,255,255,0.04);
  border: 2px solid rgba(255,255,255,0.08);
  color: inherit;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
  font: inherit;
  min-height: 180px;
}
.cs-card:hover { transform: translateY(-2px); background: rgba(255,255,255,0.08); }
.cs-card-selected {
  border-color: #70d6ff;
  background: linear-gradient(180deg, rgba(112,214,255,0.18), rgba(112,214,255,0.04));
  box-shadow: 0 0 0 4px rgba(112,214,255,0.18), 0 10px 24px rgba(112,214,255,0.18);
}

.cs-avatar {
  width: 96px; height: 96px;
  border-radius: 50%;
  overflow: hidden;
  background: #1d2240;
  display: flex; align-items: center; justify-content: center;
  border: 3px solid rgba(255,255,255,0.12);
}
.cs-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cs-avatar-add {
  background: repeating-linear-gradient(45deg, #21264a, #21264a 8px, #1a1f3e 8px, #1a1f3e 16px);
  color: #9bb3ff;
  font-size: 48px;
  border-style: dashed;
  border-color: rgba(155,179,255,0.6);
}

.cs-card-selected .cs-avatar { border-color: #70d6ff; }

.cs-name {
  font-size: 14px; font-weight: 600; color: #eef1ff;
  max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.cs-delete {
  position: absolute; top: 6px; right: 6px;
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0,0,0,0.5); color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
  font-size: 16px; line-height: 1;
  cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
.cs-delete:hover { background: #e94560; border-color: #e94560; }

.cs-status {
  margin-top: 16px; min-height: 22px;
  font-size: 14px; color: #c9cfe0;
  text-align: center;
}
.cs-status-error { color: #ff8a8a; }
.cs-status-ok { color: #7be29b; }

.cs-actions {
  margin-top: 14px;
  display: flex; justify-content: center;
}
.cs-btn {
  font: inherit;
  padding: 14px 28px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
  font-weight: 700; letter-spacing: 0.5px;
  transition: transform .1s ease, box-shadow .15s ease, filter .15s ease;
}
.cs-btn-primary {
  background: linear-gradient(135deg, #ffd166, #ff70a6);
  color: #2a0a3a;
  font-size: 18px;
  box-shadow: 0 10px 24px rgba(255,112,166,0.35);
}
.cs-btn-primary:hover { transform: translateY(-1px); filter: brightness(1.05); }
.cs-btn-primary:active { transform: translateY(1px); }

@media (max-width: 480px) {
  .cs-panel { padding: 18px 16px 14px; border-radius: 18px; }
  .cs-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .cs-avatar { width: 80px; height: 80px; }
  .cs-card { min-height: 160px; }
}

/* --------------------------------------------------------------------- */
/* Source picker (modal on desktop, bottom sheet on mobile)              */
/* --------------------------------------------------------------------- */
.cs-sheet {
  position: fixed; inset: 0; z-index: 1100;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.cs-sheet[hidden] { display: none; }
.cs-sheet-backdrop {
  position: absolute; inset: 0;
  background: rgba(5, 8, 20, 0.55);
  backdrop-filter: blur(4px);
  opacity: 0; transition: opacity .18s ease;
  pointer-events: auto;
}
.cs-sheet-panel {
  position: relative;
  width: min(380px, 92vw);
  background: #1a1f3e;
  color: #fff;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.10);
  padding: 22px 20px 18px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  transform: translateY(20px);
  opacity: 0;
  transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .18s ease;
  pointer-events: auto;
}
.cs-sheet-panel h2 { margin: 0 0 2px; font-size: 18px; }
.cs-sheet-panel p  { margin: 0 0 6px; color: #c9cfe0; font-size: 13px; }
.cs-sheet-handle {
  display: none;
  width: 40px; height: 4px; border-radius: 2px;
  background: rgba(255,255,255,0.25);
  margin: -8px auto 8px;
}
.cs-sheet-open .cs-sheet-backdrop { opacity: 1; }
.cs-sheet-open .cs-sheet-panel    { transform: translateY(0); opacity: 1; }

.cs-btn-secondary {
  background: linear-gradient(135deg, #5b8cff, #7c5bff);
  color: #fff;
  font-size: 16px;
  padding: 14px 16px;
  text-align: left;
  display: flex; align-items: center; gap: 10px;
  box-shadow: 0 8px 18px rgba(91,140,255,0.30);
  min-height: 48px;
}
.cs-btn-secondary:hover { filter: brightness(1.06); }
.cs-btn-secondary:active { transform: translateY(1px); }
.cs-btn-ghost {
  background: transparent;
  color: #c9cfe0;
  border: 1px solid rgba(255,255,255,0.14);
  font-size: 15px;
  padding: 12px 16px;
  min-height: 44px;
}
.cs-btn-ghost:hover { background: rgba(255,255,255,0.06); }

/* --------------------------------------------------------------------- */
/* Live camera capture overlay                                           */
/* --------------------------------------------------------------------- */
.cs-cam {
  position: fixed; inset: 0; z-index: 1200;
  background: #000;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .15s ease;
}
.cs-cam[hidden] { display: none; }
.cs-cam-open { opacity: 1; }
.cs-cam video {
  width: 100%; height: 100%;
  object-fit: cover;
  background: #000;
}
.cs-cam-frame {
  position: absolute;
  width: min(70vw, 60vh);
  aspect-ratio: 3 / 4;
  border: 3px dashed rgba(255,255,255,0.55);
  border-radius: 50% / 42%;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
  pointer-events: none;
}
.cs-cam-hint {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.55);
  color: #fff;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  text-align: center;
  max-width: 86vw;
}
.cs-cam-controls {
  position: absolute;
  left: 0; right: 0;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  display: flex; justify-content: center; align-items: center;
  gap: 36px;
}
.cs-cam-btn {
  width: 56px; height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(0,0,0,0.45);
  color: #fff;
  font-size: 22px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  -webkit-tap-highlight-color: transparent;
}
.cs-cam-btn-shutter {
  width: 78px; height: 78px;
  background: rgba(255,255,255,0.95);
  border: 4px solid rgba(255,255,255,0.5);
  box-shadow: 0 0 0 4px rgba(0,0,0,0.35);
  padding: 0;
}
.cs-cam-btn-shutter span {
  display: block;
  width: 60px; height: 60px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #1a1f3e;
}
.cs-cam-btn-shutter:active span { background: #ffd166; }

/* --------------------------------------------------------------------- */
/* Mobile-first refinements (phones in portrait + iPad)                  */
/* --------------------------------------------------------------------- */
.cs-panel,
.cs-sheet-panel {
  padding-top:    max(env(safe-area-inset-top, 0px),    16px);
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 14px);
  padding-left:   max(env(safe-area-inset-left, 0px),   16px);
  padding-right:  max(env(safe-area-inset-right, 0px),  16px);
}
.cs-card { -webkit-tap-highlight-color: transparent; }
.cs-delete { width: 32px; height: 32px; font-size: 20px; }   /* easier tap */

@media (max-width: 640px) {
  .cs-sheet { align-items: flex-end; }
  .cs-sheet-panel {
    width: 100%;
    max-width: 100%;
    border-radius: 22px 22px 0 0;
    transform: translateY(100%);
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 22px);
  }
  .cs-sheet-handle { display: block; }
  .cs-sheet-open .cs-sheet-panel { transform: translateY(0); }
}

/* iPad + larger phones in landscape: keep grid roomy. */
@media (min-width: 768px) and (max-width: 1180px) {
  .cs-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
`;
