/**
 * Retries of the specs that draw a lot (WebGL scenes, screenshots, whole template flows). CI's
 * runners have no GPU and draw in software, so a frame there can take a second; the full tier
 * (nightly and manual runs, `BLACKLIGHT_CI_TIER=full`) runs them on more systems and gives them
 * one retry more than the fast tier. Locally they do not retry.
 */
export const RENDERING_RETRIES = !process.env.CI
  ? 0
  : process.env.BLACKLIGHT_CI_TIER === 'full'
    ? 2
    : 1;
