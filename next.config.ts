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
};

export default nextConfig;
