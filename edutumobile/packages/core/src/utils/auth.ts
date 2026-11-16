/**
 * Utilities for authentication and user ID handling.
 */

/**
 * Maps a potentially non-UUID string (like a Clerk user ID "user_...")
 * to a valid PostgreSQL UUID format deterministically.
 * 
 * This is used because some Supabase tables have UUID constraints on user_id,
 * but Clerk provides alphanumeric strings.
 * 
 * @param id The original user ID string
 * @returns A string formatted as a valid UUID
 */
export function toSafeUUID(id: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) return id.toLowerCase();

    const hashHex = (input: string, seed: number) => {
        let hash = seed;
        for (let index = 0; index < input.length; index += 1) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    };

    const hash = [
        hashHex(id, 0x811c9dc5),
        hashHex(id, 0x9e3779b9),
        hashHex(id, 0x85ebca6b),
        hashHex(id, 0xc2b2ae35),
    ].join('');

    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
