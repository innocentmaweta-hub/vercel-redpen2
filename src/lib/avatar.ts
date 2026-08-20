/**
 * Returns a deterministic avatar URL based on the user's email.
 * A user-uploaded avatar should always take precedence over this fallback.
 */
export function getDefaultAvatarUrl(email: string): string {
    const seed = encodeURIComponent((email || 'user').trim().toLowerCase());
    return `https://api.dicebear.com/10.x/initials/svg?seed=${seed}&backgroundType=gradientLinear&radius=50`;
}
