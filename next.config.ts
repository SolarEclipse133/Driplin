import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Next's default is 1 MB, which a single phone photo blows past.
       * When that happens the framework rejects the request before any
       * of our code runs, so the person sees a blank error page rather
       * than a sentence explaining the problem.
       *
       * The confirmation forms downscale photos in the browser and
       * refuse anything still over MAX_PHOTO_BYTES (3 MB), so nothing
       * should reach this ceiling. It is here as a backstop, sized to
       * stay under Vercel's own ~4.5 MB request cap — raising it above
       * that would just move the unexplained failure to the platform.
       */
      bodySizeLimit: "4mb",
    },
  },

  /**
   * Security headers.
   *
   * Referrer-Policy matters more here than in most apps: the board, fix
   * and join URLs carry a credential IN THE PATH, and those pages link
   * out to a utility's website. Modern browsers default to sending only
   * the origin cross-site, and the links themselves already carry
   * rel="noreferrer" -- this makes it explicit rather than inherited.
   *
   * No Content-Security-Policy yet, deliberately. A strict one needs
   * nonces threaded through the app and a wrong one breaks it silently;
   * shipping a permissive CSP to be able to say there is a CSP would be
   * worse than none. It is tracked as real work rather than waved at.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Stop a browser second-guessing a declared content type, which
          // is how an uploaded image gets treated as script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Driplin frames nothing of its own, so refuse all framing: a
          // board link rendered invisibly inside another page is the
          // clickjacking shape that would matter here.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HSTS. Vercel serves HTTPS only, so this costs nothing and
          // stops a downgrade on a custom domain later.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
