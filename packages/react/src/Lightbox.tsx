import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Clicking an image in a document opens it full size.
 *
 * Documentation screenshots are wide and the column they are read in is not, so
 * the useful thing to do with one is enlarge it. The overlay is deliberately
 * plain: no zoom controls, no gallery, no dependency - a dimmed backdrop, the
 * image at whatever size the viewport allows, and three ways out (Escape, the
 * close button, a click on the backdrop).
 *
 * Keyboard access is the part that is easy to get wrong, so it is spelled out:
 * the image itself takes focus and answers Enter and Space, the close button is
 * focused when the overlay opens, Tab cannot leave the overlay while it is up,
 * and closing puts focus back on the image that opened it.
 */

export interface LightboxImage {
  src: string;
  alt: string;
}

/** Opens the overlay. `origin` is the element focus returns to on close. */
export type OpenLightbox = (image: LightboxImage, origin: HTMLElement) => void;

export interface MdxImageProps {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  /** Omitted when the renderer has the lightbox turned off. */
  onOpen?: OpenLightbox;
}

export function MdxImage({ src, alt, title, className, onOpen }: MdxImageProps) {
  const classes = `mdxstudio-image${className ? ` ${className}` : ''}`;

  if (!onOpen || !src) {
    return <img className={classes} src={src} alt={alt ?? ''} title={title} />;
  }

  const open = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    onOpen({ src, alt: alt ?? '' }, event.currentTarget);
  };

  return (
    <img
      className={`${classes} mdxstudio-image--zoomable`}
      src={src}
      alt={alt ?? ''}
      title={title}
      // The image is the control, rather than a button wrapped around it, so
      // that nothing about how an image sits in the prose changes.
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      data-mdx-zoomable="true"
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Space would otherwise scroll the page out from under the overlay.
        event.preventDefault();
        open(event);
      }}
    />
  );
}

export function ImageLightbox({
  image,
  onClose,
}: {
  image: LightboxImage;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        // The overlay holds exactly one control, so keeping focus inside it is
        // a matter of refusing to move at all.
        event.preventDefault();
        closeRef.current?.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    // On the document rather than on the overlay: the click that opened it left
    // focus in the middle of being moved, and a key pressed in that instant
    // would otherwise reach the page behind.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div
      className="mdxstudio-lightbox"
      data-mdx-lightbox="true"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt ? `Image: ${image.alt}` : 'Image'}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="mdxstudio-lightbox__close"
        aria-label="Close image"
        onClick={onClose}
      >
        <X className="mdxstudio-icon-20" aria-hidden="true" />
      </button>
      <img
        className="mdxstudio-lightbox__image"
        src={image.src}
        alt={image.alt}
        // A click on the image is not a click on the backdrop, so looking at it
        // does not close it.
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
