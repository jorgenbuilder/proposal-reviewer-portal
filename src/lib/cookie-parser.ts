/**
 * Cookie parsing utilities for DFINITY forum authentication
 * Supports both Netscape format and Cookie header format
 */

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number; // Unix timestamp
  httpOnly: boolean;
  secure: boolean;
}

/**
 * Parse Netscape HTTP Cookie File format
 * Format: domain	flag	path	secure	expiration	name	value
 */
export function parseNetscapeCookies(text: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;

    const [domain, , path, secureStr, expiresStr, name, ...valueParts] = parts;
    const value = valueParts.join('\t'); // Rejoin in case value contains tabs

    // Validate domain
    if (!domain.includes('forum.dfinity.org')) {
      throw new Error(
        `Invalid domain: ${domain}. Cookies must be from forum.dfinity.org`
      );
    }

    cookies.push({
      name: name.trim(),
      value: value.trim(),
      domain: domain.trim(),
      path: path.trim(),
      expires: expiresStr ? parseInt(expiresStr, 10) : undefined,
      httpOnly: false, // Netscape format doesn't specify
      secure: secureStr.toUpperCase() === 'TRUE'
    });
  }

  return cookies;
}

/**
 * Parse Cookie header format
 * Format: name=value; name2=value2
 */
export function parseHeaderCookies(text: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];
  const pairs = text.split(';');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const name = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();

    if (!name || !value) continue;

    cookies.push({
      name,
      value,
      domain: 'forum.dfinity.org', // Default
      path: '/',
      httpOnly: false,
      secure: true
    });
  }

  return cookies;
}

/**
 * Auto-detect format and parse cookies
 * Returns array of parsed cookie objects
 */
export function parseCookies(text: string): ParsedCookie[] {
  if (!text || typeof text !== 'string') {
    throw new Error('Cookie text must be a non-empty string');
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('Cookie text cannot be empty');
  }

  // Detect format
  // Netscape format contains tabs or the magic comment
  if (
    trimmed.includes('# Netscape HTTP Cookie File') ||
    trimmed.includes('\t')
  ) {
    return parseNetscapeCookies(trimmed);
  } else {
    return parseHeaderCookies(trimmed);
  }
}

/**
 * Convert parsed cookies to Cookie header string
 * Format: name=value; name2=value2
 */
export function cookiesToHeaderString(cookies: ParsedCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Validate parsed cookies
 * Throws error if validation fails
 */
export function validateCookies(cookies: ParsedCookie[]): void {
  if (cookies.length === 0) {
    throw new Error('No valid cookies found');
  }

  for (const cookie of cookies) {
    // Validate required fields
    if (!cookie.name || !cookie.value) {
      throw new Error('Cookie must have name and value');
    }

    // Validate domain
    if (!cookie.domain || !cookie.domain.includes('forum.dfinity.org')) {
      throw new Error(
        `Invalid cookie domain: ${cookie.domain}. Must be forum.dfinity.org`
      );
    }

    // Check for suspicious patterns
    if (cookie.name.length > 256 || cookie.value.length > 8192) {
      throw new Error('Cookie name or value exceeds maximum length');
    }
  }
}
