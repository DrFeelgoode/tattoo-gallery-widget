/**
 * Tattoo Gallery Widget
 * Embeddable gallery that syncs with Google Drive
 *
 * Usage:
 * <div class="tattoo-gallery" data-folder-id="YOUR_FOLDER_ID"></div>
 * <script src="gallery-widget.js"></script>
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    // Update this with your Cloudflare Worker URL
    apiUrl: 'https://tattoo-gallery-api.garrett-tattooagent.workers.dev/gallery',

    // Default settings (can be overridden per gallery)
    defaults: {
      columns: 3,        // Desktop columns
      gap: 16,           // Gap between images (px)
      animationSpeed: 300, // Animation duration (ms)
    }
  };

  /**
   * TattooGallery Class
   */
  class TattooGallery {
    constructor(container) {
      this.container = container;
      this.folderId = container.dataset.folderId;
      this.columns = parseInt(container.dataset.columns) || CONFIG.defaults.columns;
      this.images = [];
      this.currentImageIndex = 0;

      if (!this.folderId) {
        this.showError('Missing data-folder-id attribute');
        return;
      }

      this.init();
    }

    /**
     * Initialize gallery
     */
    async init() {
      this.showLoading();

      try {
        this.images = await this.fetchImages();

        if (this.images.length === 0) {
          this.showEmpty();
        } else {
          this.renderGallery();
          this.setupLazyLoading();
        }
      } catch (error) {
        console.error('Gallery error:', error);
        this.showError('Failed to load gallery. Please try again later.');
      }
    }

    /**
     * Fetch images from API
     */
    async fetchImages() {
      const response = await fetch(`${CONFIG.apiUrl}/${this.folderId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Unknown error');
      }

      return data;
    }

    /**
     * Render gallery grid
     */
    renderGallery() {
      const gallery = document.createElement('div');
      gallery.className = 'tg-grid';

      this.images.forEach((image, index) => {
        const item = this.createImageItem(image, index);
        gallery.appendChild(item);
      });

      this.container.innerHTML = '';
      this.container.appendChild(gallery);

      // Animate items in
      setTimeout(() => {
        const items = gallery.querySelectorAll('.tg-item');
        items.forEach((item, i) => {
          setTimeout(() => {
            item.classList.add('tg-visible');
          }, i * 50);
        });
      }, 10);
    }

    /**
     * Create individual image item
     */
    createImageItem(image, index) {
      const item = document.createElement('div');
      item.className = 'tg-item';

      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'tg-img-wrapper';

      const img = document.createElement('img');
      img.className = 'tg-img tg-lazy';
      // Use proxied image URL for thumbnails (800px for grid)
      img.dataset.src = `${CONFIG.apiUrl.replace('/gallery', '')}/image/${image.id}?size=s800`;
      img.alt = image.name;

      const overlay = document.createElement('div');
      overlay.className = 'tg-overlay';
      overlay.innerHTML = `
        <svg class="tg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;

      imgWrapper.appendChild(img);
      imgWrapper.appendChild(overlay);
      item.appendChild(imgWrapper);

      // Click to open lightbox
      item.addEventListener('click', () => this.openLightbox(index));

      return item;
    }

    /**
     * Setup lazy loading with Intersection Observer
     */
    setupLazyLoading() {
      const options = {
        root: null,
        rootMargin: '50px',
        threshold: 0.01
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('tg-lazy');
            observer.unobserve(img);

            img.onload = () => {
              img.classList.add('tg-loaded');
            };
          }
        });
      }, options);

      this.container.querySelectorAll('.tg-lazy').forEach(img => {
        observer.observe(img);
      });
    }

    /**
     * Open lightbox at specific index
     */
    openLightbox(index) {
      this.currentImageIndex = index;

      const lightbox = document.createElement('div');
      lightbox.className = 'tg-lightbox';
      lightbox.innerHTML = `
        <div class="tg-lightbox-overlay"></div>
        <div class="tg-lightbox-content">
          <button class="tg-lightbox-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>

          <button class="tg-lightbox-nav tg-lightbox-prev" aria-label="Previous">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 18l-6-6 6-6" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>

          <button class="tg-lightbox-nav tg-lightbox-next" aria-label="Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 18l6-6-6-6" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>

          <div class="tg-lightbox-image-container">
            <img class="tg-lightbox-image" src="" alt="">
          </div>

          <div class="tg-lightbox-caption"></div>

          <div class="tg-lightbox-counter"></div>
        </div>
      `;

      document.body.appendChild(lightbox);
      document.body.style.overflow = 'hidden';

      // Update image
      this.updateLightboxImage(lightbox);

      // Event listeners
      lightbox.querySelector('.tg-lightbox-close').addEventListener('click', () => this.closeLightbox());
      lightbox.querySelector('.tg-lightbox-overlay').addEventListener('click', () => this.closeLightbox());
      lightbox.querySelector('.tg-lightbox-prev').addEventListener('click', () => this.prevImage());
      lightbox.querySelector('.tg-lightbox-next').addEventListener('click', () => this.nextImage());

      // Close when clicking outside image (on content area, but not on image/buttons/caption)
      const content = lightbox.querySelector('.tg-lightbox-content');
      content.addEventListener('click', (e) => {
        // Only close if clicking directly on the content area (not on child elements)
        if (e.target === content) {
          this.closeLightbox();
        }
      });

      // Keyboard navigation
      this.keyHandler = (e) => {
        if (e.key === 'Escape') this.closeLightbox();
        if (e.key === 'ArrowLeft') this.prevImage();
        if (e.key === 'ArrowRight') this.nextImage();
      };
      document.addEventListener('keydown', this.keyHandler);

      // Touch/swipe support for mobile
      this.setupTouchNavigation(lightbox);

      // Animate in
      setTimeout(() => lightbox.classList.add('tg-lightbox-visible'), 10);
    }

    /**
     * Setup touch/swipe navigation for mobile
     */
    setupTouchNavigation(lightbox) {
      let touchStartX = 0;
      let touchEndX = 0;

      const imageContainer = lightbox.querySelector('.tg-lightbox-image-container');

      imageContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      imageContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        this.handleSwipe(touchStartX, touchEndX);
      }, { passive: true });
    }

    /**
     * Handle swipe gesture
     */
    handleSwipe(startX, endX) {
      const swipeThreshold = 50; // minimum distance for swipe
      const diff = startX - endX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          // Swiped left - next image
          this.nextImage();
        } else {
          // Swiped right - previous image
          this.prevImage();
        }
      }
    }

    /**
     * Update lightbox image
     */
    updateLightboxImage(lightbox = document.querySelector('.tg-lightbox')) {
      if (!lightbox) return;

      const image = this.images[this.currentImageIndex];
      const img = lightbox.querySelector('.tg-lightbox-image');
      const caption = lightbox.querySelector('.tg-lightbox-caption');
      const counter = lightbox.querySelector('.tg-lightbox-counter');

      // Show loading state
      img.style.opacity = '0';

      // Use proxied image URL for lightbox (2000px high-res)
      // This avoids CORS issues with direct Google Drive URLs
      const imageUrl = `${CONFIG.apiUrl.replace('/gallery', '')}/image/${image.id}?size=s2000`;

      img.src = imageUrl;
      img.alt = image.name;
      caption.textContent = image.name;
      counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;

      // Fade in when loaded
      img.onload = () => {
        img.style.opacity = '1';
        img.style.transition = 'opacity 0.3s';
      };

      // Handle load error
      img.onerror = () => {
        console.error('Failed to load image:', image.name, imageUrl);
        img.style.opacity = '0.3';
      };

      // Show/hide nav buttons
      lightbox.querySelector('.tg-lightbox-prev').style.display =
        this.currentImageIndex === 0 ? 'none' : 'flex';
      lightbox.querySelector('.tg-lightbox-next').style.display =
        this.currentImageIndex === this.images.length - 1 ? 'none' : 'flex';
    }

    /**
     * Navigate to previous image
     */
    prevImage() {
      if (this.currentImageIndex > 0) {
        this.currentImageIndex--;
        this.updateLightboxImage();
      }
    }

    /**
     * Navigate to next image
     */
    nextImage() {
      if (this.currentImageIndex < this.images.length - 1) {
        this.currentImageIndex++;
        this.updateLightboxImage();
      }
    }

    /**
     * Close lightbox
     */
    closeLightbox() {
      const lightbox = document.querySelector('.tg-lightbox');
      if (!lightbox) return;

      lightbox.classList.remove('tg-lightbox-visible');
      document.removeEventListener('keydown', this.keyHandler);
      document.body.style.overflow = '';

      setTimeout(() => {
        lightbox.remove();
      }, 300);
    }

    /**
     * Show loading state
     */
    showLoading() {
      this.container.innerHTML = `
        <div class="tg-loading">
          <div class="tg-spinner"></div>
          <p>Loading gallery...</p>
        </div>
      `;
    }

    /**
     * Show empty state
     */
    showEmpty() {
      this.container.innerHTML = `
        <div class="tg-empty">
          <svg class="tg-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
            <path d="M21 15l-5-5L5 21" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>No images found in this gallery</p>
        </div>
      `;
    }

    /**
     * Show error state
     */
    showError(message) {
      this.container.innerHTML = `
        <div class="tg-error">
          <svg class="tg-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" stroke-width="2"/>
            <path d="M12 8v4M12 16h.01" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>${message}</p>
        </div>
      `;
    }
  }

  /**
   * Auto-initialize galleries on page load
   */
  function initGalleries() {
    const galleries = document.querySelectorAll('.tattoo-gallery[data-folder-id]');
    galleries.forEach(gallery => {
      new TattooGallery(gallery);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGalleries);
  } else {
    initGalleries();
  }

  // Also expose for manual initialization
  window.TattooGallery = TattooGallery;
})();
