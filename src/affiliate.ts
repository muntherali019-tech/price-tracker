/**
 * Affiliate link generation.
 *
 * Price trackers monetise primarily through affiliate commissions: when a user
 * follows a tracked link and buys, the referrer earns a cut. This module turns
 * a plain product URL into a tagged affiliate URL.
 *
 * Configuration comes from options or the environment:
 *   PRICE_TRACKER_AFFILIATE_TAG       the affiliate/partner id
 *   PRICE_TRACKER_AFFILIATE_TEMPLATE  a template with {url}, {tag}, {domain}
 *
 * If no template is given, a sensible per-domain default is used (Amazon-style
 * `tag=` for amazon domains, otherwise a generic `?ref=<tag>`).
 */
export interface AffiliateConfig {
  tag?: string | null;
  template?: string | null;
}

export function affiliateConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AffiliateConfig {
  return {
    tag: env.PRICE_TRACKER_AFFILIATE_TAG ?? null,
    template: env.PRICE_TRACKER_AFFILIATE_TEMPLATE ?? null,
  };
}

export function buildAffiliateUrl(url: string, config: AffiliateConfig): string {
  const tag = config.tag?.trim();
  if (!tag) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // Not a URL we can safely rewrite; return unchanged.
  }

  if (config.template) {
    return config.template
      .replaceAll("{url}", url)
      .replaceAll("{tag}", encodeURIComponent(tag))
      .replaceAll("{domain}", parsed.hostname);
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes("amazon.")) {
    parsed.searchParams.set("tag", tag);
  } else {
    parsed.searchParams.set("ref", tag);
  }
  return parsed.toString();
}
