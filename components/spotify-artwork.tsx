interface SpotifyArtworkProps {
  src: string;
  size: number;
  className?: string;
}

export function SpotifyArtwork({ src, size, className }: SpotifyArtworkProps) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
